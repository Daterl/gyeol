// Server-only public profile cache. A reservation is persisted before ingestion
// starts; no memory lock, client receipt, or client snapshot grants ownership.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createInstagramIngest, instagramAccount, LIMITS } from './apify_ingest.js';
import { createPrivateBlobStorage, PROFILE_CACHE_PREFIX } from './profile-cache-storage.js';

export const PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const statusFor = {
  PRIVATE_ACCOUNT: 'private', ACCOUNT_NOT_FOUND: 'not_found', PROVIDER_TIMEOUT: 'timeout',
  COST_LIMIT: 'cost_limit', ACCOUNT_UNCONFIRMED: 'unconfirmed', ACCESS_UNAVAILABLE: 'unconfirmed',
  START_UNCONFIRMED: 'unconfirmed',
};
const statuses = new Set(['reserved', 'running', 'public', 'private', 'not_found', 'timeout', 'cost_limit', 'unconfirmed', 'provider_error', 'expired']);
export class ProfileCacheError extends Error {
  constructor(code) { super(code); this.name = 'ProfileCacheError'; this.code = code; }
}
const fail = code => { throw new ProfileCacheError(code); };
export function profileCacheKey(url) {
  return `${PROFILE_CACHE_PREFIX}${createHash('sha256').update(instagramAccount(url).account).digest('hex')}.json`;
}

export function createProfileCache({ storage, ingest, now = Date.now, secret = process.env.PROFILE_CACHE_SECRET } = {}) {
  if (typeof secret !== 'string' || secret.length < 32) fail('NOT_CONFIGURED');
  try { storage ??= createPrivateBlobStorage(); } catch { fail('NOT_CONFIGURED'); }
  const adapter = storage;
  storage = Object.fromEntries(['read', 'write', 'list'].map(method => [method, async (...args) => {
    try { return await adapter[method](...args); } catch { fail('STORAGE_ERROR'); }
  }]));
  ingest ??= createInstagramIngest();
  const signature = body => createHmac('sha256', secret).update(body).digest('base64url');
  const reference = (key, record) => {
    const body = Buffer.from(JSON.stringify({ key, generation: record.generation, expires_at: record.expires_at })).toString('base64url');
    return `${body}.${signature(body)}`;
  };
  async function read(key) {
    const row = await storage.read(key);
    if (!row) return null;
    const record = row.value;
    if (!row.etag || record?.version !== 1 || !statuses.has(record.status) || !Number.isFinite(record.expires_at)
      || typeof record.generation !== 'string') fail('STORAGE_ERROR');
    return row;
  }
  function validResult(result, url) {
    const account = instagramAccount(url).account;
    const snapshot = result?.snapshot;
    const provenance = snapshot?.provenance;
    return result?.status === 'SUCCEEDED' && snapshot?.handle === account && typeof snapshot.snapshot_id === 'string'
      && snapshot.snapshot_id.length > 0 && Array.isArray(snapshot.posts) && snapshot.posts.length > 0
      && snapshot.posts.every(post => post.owner_username?.toLowerCase() === account)
      && provenance?.account === account && provenance.method === 'apify' && provenance.actor === 'apify/instagram-scraper'
      && provenance.source_url === url && Number.isFinite(Date.parse(provenance.collected_at))
      && Date.parse(provenance.collected_at) <= now() && typeof provenance.run_id === 'string' && typeof provenance.dataset_id === 'string'
      && result.currentProfile && result.targetProfile;
  }
  function view(key, row) {
    if (!row) return { status: 'missing', refresh_required: false };
    const record = row.value;
    if (record.expires_at <= now() || record.status === 'expired') return { status: 'expired', expires_at: record.expires_at, refresh_required: true };
    return { status: ['reserved', 'running'].includes(record.status) ? 'pending' : record.status,
      expires_at: record.expires_at, refresh_required: false,
      ...(record.error_code ? { error_code: record.error_code } : {}),
      ...(record.status === 'public' ? { snapshotId: reference(key, record) } : {}),
    };
  }
  async function save(key, previous, changes) {
    // Expired writers cannot publish into a new generation or resurrect payload
    // removed by cleanup. A CAS conflict is resolved by reading the winner.
    if (previous.value.expires_at <= now()) return view(key, await read(key));
    const written = await storage.write(key, { ...previous.value, ...changes }, { ifMatch: previous.etag });
    return view(key, written ?? await read(key));
  }
  const failure = error => ({ status: statusFor[error?.code] ?? 'provider_error', error_code: Object.hasOwn(statusFor, error?.code) ? error.code : 'PROVIDER_ERROR' });
  async function connect({ url, refresh = false, knownPrivate = false } = {}) {
    if (typeof refresh !== 'boolean' || typeof knownPrivate !== 'boolean') fail('INVALID_INPUT');
    const canonical = instagramAccount(url).url;
    if (knownPrivate) return { status: 'private', error_code: 'PRIVATE_ACCOUNT', refresh_required: false };
    const key = profileCacheKey(canonical);
    const previous = await read(key);
    if (previous && (previous.value.expires_at > now() || !refresh)) return view(key, previous);
    const record = { version: 1, generation: randomUUID(), status: 'reserved', expires_at: now() + PROFILE_CACHE_TTL_MS,
      source_url: canonical, created_at: now() };
    const reservation = await storage.write(key, record, previous ? { ifMatch: previous.etag } : {});
    if (!reservation) return view(key, await read(key));
    // The write must be positively acknowledged before any paid provider call.
    let started;
    try { started = await ingest.start({ url: canonical, limit: LIMITS.posts, accountScope: 'n/a' }); }
    catch (error) { return save(key, reservation, failure(error)); }
    if (started?.status !== 'RUNNING' || typeof started.receipt !== 'string') return save(key, reservation, failure({ code: 'START_UNCONFIRMED' }));
    return save(key, reservation, { status: 'running', receipt: started.receipt });
  }
  async function inspect({ url } = {}) {
    const key = profileCacheKey(url);
    const row = await read(key);
    if (!row || row.value.status !== 'running' || row.value.expires_at <= now()) return view(key, row);
    let result;
    try { result = await ingest.inspect(row.value.receipt); }
    catch (error) { return save(key, row, { ...failure(error), receipt: null }); }
    if (result?.status === 'RUNNING') return view(key, row);
    if (!validResult(result, row.value.source_url) || Date.parse(result.snapshot.provenance.collected_at) < row.value.created_at) {
      return save(key, row, { ...failure({}), receipt: null });
    }
    // Only reuse the existing ingestion's public precheck + account-bound result.
    const { snapshot, currentProfile, targetProfile } = result;
    return save(key, row, { status: 'public', receipt: null, result: { status: 'SUCCEEDED', snapshot, currentProfile, targetProfile } });
  }
  async function resolvePublicProfile(snapshotId) {
    if (typeof snapshotId !== 'string' || snapshotId.length > 2048) fail('INVALID_SNAPSHOT_REFERENCE');
    const [body, signed, extra] = snapshotId.split('.');
    const expected = signature(body ?? '');
    if (extra || !signed || Buffer.byteLength(signed) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) fail('INVALID_SNAPSHOT_REFERENCE');
    let ref;
    try { ref = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { fail('INVALID_SNAPSHOT_REFERENCE'); }
    if (!/^profile-cache\/v1\/[a-f0-9]{64}\.json$/.test(ref?.key) || !Number.isFinite(ref.expires_at) || ref.expires_at <= now()) fail('INVALID_SNAPSHOT_REFERENCE');
    const row = await read(ref.key);
    const record = row?.value;
    if (!record || record.status !== 'public' || record.expires_at <= now() || record.generation !== ref.generation
      || record.expires_at !== ref.expires_at || !validResult(record.result, record.source_url)
      || profileCacheKey(record.source_url) !== ref.key) fail('PROFILE_NOT_READY');
    return { snapshot_id: snapshotId, snapshot: record.result.snapshot, currentProfile: record.result.currentProfile,
      targetProfile: record.result.targetProfile, source_url: record.source_url,
      collected_at: record.result.snapshot.provenance.collected_at, expires_at: record.expires_at };
  }
  async function resolveSnapshot({ url, snapshotId } = {}) {
    const result = await resolvePublicProfile(snapshotId);
    if (instagramAccount(url).url !== result.source_url) fail('INVALID_SNAPSHOT_REFERENCE');
    return result;
  }
  async function cleanup() {
    let cursor;
    const seen = new Set();
    const counts = { scanned: 0, cleaned: 0, conflicted: 0 };
    do {
      const page = await storage.list({ cursor });
      for (const key of page.keys) {
        const row = await read(key);
        counts.scanned++;
        if (!row || row.value.status === 'expired' || row.value.expires_at > now()) continue;
        // Retain only the no-auto-refresh marker; erase snapshot, URL, provider
        // receipt, errors and provenance. Deleting the key would reset history.
        const marker = { version: 1, status: 'expired', generation: randomUUID(), expires_at: row.value.expires_at };
        if (await storage.write(key, marker, { ifMatch: row.etag })) counts.cleaned++;
        else counts.conflicted++;
      }
      cursor = page.cursor;
      if (cursor && seen.has(cursor)) fail('STORAGE_ERROR');
      seen.add(cursor);
    } while (cursor);
    return counts;
  }
  return { connect, inspect, resolvePublicProfile, resolveSnapshot, cleanup };
}

export const resolvePublicProfile = (snapshotId, options) => createProfileCache(options).resolvePublicProfile(snapshotId);
export const resolveSnapshot = (reference, options) => createProfileCache(options).resolveSnapshot(reference);
