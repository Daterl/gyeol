import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createProfileCache, profileCacheKey, PROFILE_CACHE_TTL_MS, resolveSnapshot } from '../lib/profile-cache.js';
import { createInstagramIngest, IngestError, normalizeInstagram } from '../lib/apify_ingest.js';
import { createPrivateBlobStorage } from '../lib/profile-cache-storage.js';
import { handleProfileCacheCleanup } from '../lib/profile-cache-cleanup.js';
import { readFile } from 'node:fs/promises';

const URL = 'https://www.instagram.com/public.test/';
const SECRET = 'fixture-only-profile-cache-secret-32';
const EPOCH = Date.parse('2026-09-18T00:00:00Z');
// Shared atomic fixture models the documented contract, NOT production proof.
function memoryStorage() {
  const rows = new Map();
  let version = 0;
  return {
    rows,
    async read(key) { return structuredClone(rows.get(key) ?? null); },
    async write(key, value, { ifMatch } = {}) {
      const old = rows.get(key);
      if (ifMatch ? old?.etag !== ifMatch : old) return null;
      const row = { value: structuredClone(value), etag: `"v${++version}"` };
      rows.set(key, row);
      return structuredClone(row);
    },
    async list() { return { keys: [...rows.keys()], cursor: null }; },
  };
}
function fixture() {
  let time = EPOCH;
  let starts = 0, inspections = 0;
  const storage = memoryStorage();
  const snapshot = normalizeInstagram([{ id: 'post1', shortCode: 'post1', caption: 'fixture', type: 'Image',
    ownerUsername: 'public.test', url: 'https://www.instagram.com/p/post1/' }],
  { url: URL, runId: 'run1', datasetId: 'dataset1', collectedAt: new Date(EPOCH).toISOString() });
  const result = { status: 'SUCCEEDED', snapshot, currentProfile: { fixture: 'current' }, targetProfile: { fixture: 'target' } };
  const ingest = {
    async start() { starts++; return { status: 'RUNNING', receipt: 'server-only-receipt' }; },
    async inspect() { inspections++; return result; },
  };
  const options = { storage, ingest, now: () => time, secret: SECRET };
  return { storage, ingest, options, result, cache: createProfileCache(options),
    advance: ms => { time += ms; }, starts: () => starts, inspections: () => inspections };
}
async function publicReference(f) {
  await f.cache.connect({ url: URL });
  return f.cache.inspect({ url: URL });
}

test('canonical URL variants use the SHA-256 of the lowercase username only', () => {
  assert.equal(profileCacheKey(URL), `profile-cache/v1/${createHash('sha256').update('public.test').digest('hex')}.json`);
  for (const url of ['https://instagram.com/PUBLIC.test?igsh=x', `${URL}#fragment`]) assert.equal(profileCacheKey(url), profileCacheKey(URL));
  assert.throws(() => profileCacheKey('https://evil.example/public.test/'), { code: 'INVALID_URL' });
});

test('independent instances and URL variants share one acknowledged reservation', async () => {
  const f = fixture();
  const clients = Array.from({ length: 40 }, () => createProfileCache(f.options));
  const views = await Promise.all(clients.map((client, i) => client.connect({ url: i % 2 ? URL : 'https://instagram.com/PUBLIC.test?x=1' })));
  assert.equal(f.starts(), 1);
  assert.ok(views.every(view => view.status === 'pending'));
  assert.ok(views.every(view => !('receipt' in view)));
});

test('public result resolves through an unguessable signed capability, never a client payload', async () => {
  const f = fixture();
  const view = await publicReference(f);
  assert.equal(view.status, 'public');
  const resolved = await resolveSnapshot({ url: 'https://instagram.com/PUBLIC.test', snapshotId: view.snapshotId }, f.options);
  assert.deepEqual(resolved.snapshot, f.result.snapshot);
  assert.equal(resolved.source_url, URL);
  assert.equal(resolved.snapshot_id, view.snapshotId);
  assert.equal(resolved.expires_at, EPOCH + PROFILE_CACHE_TTL_MS);
  await assert.rejects(f.cache.resolveSnapshot({ url: 'https://instagram.com/other/', snapshotId: view.snapshotId }), { code: 'INVALID_SNAPSHOT_REFERENCE' });
  for (const bad of [profileCacheKey(URL), f.result.snapshot.snapshot_id, `${view.snapshotId}x`, `body.${'한'.repeat(43)}`]) {
    await assert.rejects(f.cache.resolvePublicProfile(bad), { code: 'INVALID_SNAPSHOT_REFERENCE' });
  }
  assert.equal(f.starts(), 1);
});

test('refresh before TTL reuses the result; expiry, polling, and resolution never start ingestion', async () => {
  const f = fixture();
  const original = await publicReference(f);
  assert.equal((await f.cache.connect({ url: URL, refresh: true })).snapshotId, original.snapshotId);
  f.advance(PROFILE_CACHE_TTL_MS);
  assert.equal((await f.cache.connect({ url: URL })).status, 'expired');
  assert.equal((await f.cache.inspect({ url: URL })).status, 'expired');
  await assert.rejects(f.cache.resolvePublicProfile(original.snapshotId), { code: 'INVALID_SNAPSHOT_REFERENCE' });
  assert.equal(f.starts(), 1);
  assert.equal(f.inspections(), 1);
  await Promise.all(Array.from({ length: 20 }, () => createProfileCache(f.options).connect({ url: URL, refresh: true })));
  assert.equal(f.starts(), 2);
});

test('cleanup erases expired payload and receipt, retains only anti-retry marker', async () => {
  const f = fixture();
  await publicReference(f);
  f.advance(PROFILE_CACHE_TTL_MS);
  assert.deepEqual(await f.cache.cleanup(), { scanned: 1, cleaned: 1, conflicted: 0 });
  const marker = (await f.storage.read(profileCacheKey(URL))).value;
  assert.deepEqual(Object.keys(marker).sort(), ['expires_at', 'generation', 'status', 'version']);
  assert.equal(marker.status, 'expired');
  assert.equal((await f.cache.connect({ url: URL })).status, 'expired');
  assert.equal(f.starts(), 1);
  assert.equal((await f.cache.cleanup()).cleaned, 0);
  await f.cache.connect({ url: URL, refresh: true });
  assert.equal(f.starts(), 2);
});

for (const [code, status] of Object.entries({ PRIVATE_ACCOUNT: 'private', ACCOUNT_NOT_FOUND: 'not_found', PROVIDER_TIMEOUT: 'timeout',
  COST_LIMIT: 'cost_limit', PROVIDER_ERROR: 'provider_error', ACCOUNT_UNCONFIRMED: 'unconfirmed', START_UNCONFIRMED: 'unconfirmed' })) {
  test(`${code} is durable, distinct, sanitized and not automatically retried`, async () => {
    const f = fixture();
    let attempts = 0;
    f.ingest.start = async () => { attempts++; throw new IngestError(code, { token: 'must-not-store' }); };
    assert.equal((await f.cache.connect({ url: URL })).status, status);
    assert.equal((await createProfileCache(f.options).connect({ url: URL, refresh: true })).status, status);
    assert.equal(attempts, 1);
    assert.ok(!JSON.stringify([...f.storage.rows]).includes('must-not-store'));
    f.advance(PROFILE_CACHE_TTL_MS);
    assert.equal((await f.cache.cleanup()).cleaned, 1);
  });
}

test('real ingestion private/unknown precheck remains fail-closed with zero provider calls', async () => {
  for (const visibility of ['private', null]) {
    const f = fixture();
    let paid = 0;
    const ingest = createInstagramIngest({ token: 'fixture-token', secret: 'fixture-ingest-secret-32-characters',
      checkPublic: async () => visibility, fetchImpl: async () => { paid++; throw new Error('unexpected provider call'); } });
    const cache = createProfileCache({ ...f.options, ingest });
    assert.equal((await cache.connect({ url: URL })).status, visibility === 'private' ? 'private' : 'unconfirmed');
    assert.equal(paid, 0);
  }
  const f = fixture();
  await publicReference(f);
  assert.equal((await f.cache.connect({ url: URL, knownPrivate: true })).status, 'private');
  assert.equal(f.starts(), 1);
});

test('real ingestion result survives instance restart and resolves without provider configuration', async () => {
  const f = fixture();
  const responses = [{ data: { id: 'run1' } }, { data: { id: 'run1', status: 'SUCCEEDED', defaultDatasetId: 'dataset1',
    finishedAt: new Date(EPOCH + 4000).toISOString(), stats: { runTimeSecs: 4 }, usageTotalUsd: 0.0081 } },
  [{ id: 'post1', shortCode: 'post1', caption: '오늘의 기록', type: 'Image', ownerUsername: 'public.test', url: 'https://www.instagram.com/p/post1/' }]];
  let calls = 0;
  const ingest = createInstagramIngest({ token: 'fixture-apify-token', secret: 'fixture-ingest-secret-32-characters',
    checkPublic: async () => 'public', now: f.options.now,
    fetchImpl: async () => { calls++; return Response.json(responses.shift()); } });
  const cache = createProfileCache({ ...f.options, ingest });
  assert.equal((await cache.connect({ url: URL })).status, 'pending');
  f.advance(5000);
  const reference = await cache.inspect({ url: URL });
  assert.equal(reference.status, 'public');
  // Omitting ingest creates the default instance, but resolving never configures
  // or invokes it. No live provider keys exist in this isolated test setup.
  const reader = createProfileCache({ storage: f.storage, now: f.options.now, secret: SECRET });
  const trusted = await reader.resolveSnapshot({ url: URL, snapshotId: reference.snapshotId });
  assert.equal(trusted.currentProfile.present, true);
  assert.equal(trusted.targetProfile.present, true);
  assert.equal(trusted.snapshot.provenance.run_id, 'run1');
  assert.equal(trusted.snapshot.posts[0].caption, '오늘의 기록');
  assert.equal(trusted.collected_at, new Date(EPOCH + 4000).toISOString());
  assert.equal(calls, 3);
});

test('unknown reservation write outcome never authorizes a provider start or retry', async () => {
  const f = fixture();
  const write = f.storage.write;
  f.storage.write = async (...args) => { await write(...args); throw new Error('network disconnected after commit'); };
  await assert.rejects(f.cache.connect({ url: URL }));
  assert.equal(f.starts(), 0);
  f.storage.write = write;
  assert.equal((await f.cache.connect({ url: URL })).status, 'pending');
  assert.equal(f.starts(), 0);
  f.advance(PROFILE_CACHE_TTL_MS);
  assert.equal((await f.cache.cleanup()).cleaned, 1);
});

test('orphan reservation survives failed receipt persistence and never causes a second start', async () => {
  const f = fixture();
  const write = f.storage.write;
  f.storage.write = async (...args) => { if (args[2]?.ifMatch) throw new Error('write unavailable'); return write(...args); };
  await assert.rejects(f.cache.connect({ url: URL }));
  assert.equal((await f.cache.connect({ url: URL })).status, 'pending');
  assert.equal(f.starts(), 1);
});

test('stale inspect cannot overwrite refresh and cleanup cannot erase concurrent refresh', async () => {
  const f = fixture();
  await f.cache.connect({ url: URL });
  let finish;
  f.ingest.inspect = () => new Promise(resolve => { finish = resolve; });
  const pending = f.cache.inspect({ url: URL });
  await new Promise(resolve => setImmediate(resolve));
  f.advance(PROFILE_CACHE_TTL_MS);
  await f.cache.connect({ url: URL, refresh: true });
  finish(f.result);
  assert.equal((await pending).status, 'pending');
  const g = fixture();
  await publicReference(g);
  g.advance(PROFILE_CACHE_TTL_MS);
  const write = g.storage.write;
  g.storage.write = async (key, value, options) => {
    if (value.status === 'expired') await g.cache.connect({ url: URL, refresh: true });
    return write(key, value, options);
  };
  assert.equal((await g.cache.cleanup()).conflicted, 1);
  assert.equal((await g.storage.read(profileCacheKey(URL))).value.status, 'running');
});

test('mismatched provenance or account-owned posts cannot become trusted snapshots', async () => {
  for (const mutate of [r => { r.snapshot.provenance.account = 'other'; }, r => { r.snapshot.posts[0].owner_username = 'other'; },
    r => { r.snapshot.provenance.collected_at = 'invalid'; }, r => { r.snapshot.provenance.method = 'client'; }]) {
    const f = fixture();
    mutate(f.result);
    assert.equal((await publicReference(f)).status, 'provider_error');
  }
});

test('cleanup paginates and never touches fresh records', async () => {
  const f = fixture();
  await f.cache.connect({ url: URL });
  const key = profileCacheKey(URL);
  const seen = [];
  f.storage.list = async ({ cursor }) => { seen.push(cursor); return cursor ? { keys: [key], cursor: null } : { keys: [], cursor: 'next' }; };
  assert.deepEqual(await f.cache.cleanup(), { scanned: 1, cleaned: 0, conflicted: 0 });
  assert.deepEqual(seen, [undefined, 'next']);
});

const TOKEN = 'vercel_blob_rw_TestStore_fixture';
test('REST adapter sends documented private create/CAS and origin-read protocol', async () => {
  const key = profileCacheKey(URL);
  const calls = [];
  const storage = createPrivateBlobStorage({ token: TOKEN, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'PUT') return Response.json({ pathname: key, etag: '"created"' });
    if (url.includes('prefix=')) return Response.json({ blobs: [{ pathname: key }], hasMore: true, cursor: 'next' });
    return Response.json({ status: 'reserved' }, { headers: { etag: '"read"' } });
  } });
  await storage.write(key, { status: 'reserved' });
  // Independent wire oracle: vercel/storage@31245dc, putOptionHeaderMap.access.
  assert.equal(calls[0].init.headers['x-vercel-blob-access'], 'private');
  assert.equal(calls[0].init.headers['x-access'], undefined);
  assert.equal(calls[0].init.headers['x-add-random-suffix'], '0');
  assert.equal(calls[0].init.headers['x-allow-overwrite'], '0');
  assert.equal(calls[0].init.headers['x-api-version'], '12');
  assert.equal(calls[0].init.headers['x-if-match'], undefined);
  await storage.write(key, {}, { ifMatch: '"prior"' });
  assert.equal(calls[1].init.headers['x-allow-overwrite'], '1');
  assert.equal(calls[1].init.headers['x-if-match'], '"prior"');
  assert.equal((await storage.read(key)).etag, '"read"');
  assert.equal(calls[2].url, `https://teststore.private.blob.vercel-storage.com/${key}?cache=0`);
  assert.equal(calls[2].init.redirect, 'error');
  assert.equal(calls[2].init.cache, 'no-store');
  assert.deepEqual(await storage.list(), { keys: [key], cursor: 'next' });
  await assert.rejects(storage.read('https://evil.example/'), { code: 'INVALID_STORAGE_PATH' });
});

test('REST adapter separates conflicts, absence, auth/network/malformed responses', async () => {
  const key = profileCacheKey(URL);
  const make = fetchImpl => createPrivateBlobStorage({ token: TOKEN, fetchImpl });
  assert.equal(await make(async () => Response.json({ error: { code: 'precondition_failed' } }, { status: 412 })).write(key, {}), null);
  for (const operation of ['read', 'write']) {
    await assert.rejects(make(async () => Response.json({ error: { code: 'rate_limited' } }, {
      status: 429, headers: { 'retry-after': '1' },
    }))[operation](key, {}), { code: 'RATE_LIMITED', retryAfter: 1 });
  }
  assert.equal(await make(async () => new Response(null, { status: 404 })).read(key), null);
  for (const fn of [async () => { throw new Error('network'); }, async () => Response.json({ error: { code: 'forbidden' } }, { status: 403 }),
    async () => Response.json({ pathname: key }), async () => new Response('invalid JSON')]) {
    await assert.rejects(make(fn).write(key, {}), { code: 'STORAGE_ERROR' });
  }
  await assert.rejects(make(async () => Response.json({})).read(key), { code: 'STORAGE_ERROR' });
  assert.throws(() => createPrivateBlobStorage({ token: 'bad' }), { code: 'NOT_CONFIGURED' });
  assert.throws(() => createProfileCache({ secret: 'short' }), { code: 'NOT_CONFIGURED' });
});

test('daily cleanup entrypoint authenticates before storage and reports failures without secrets', async () => {
  const f = fixture();
  let initialized = 0;
  const options = { secret: SECRET, createCache: () => { initialized++; return f.cache; } };
  const request = (authorization, method = 'GET') => new Request('http://localhost/api/profile-cache/cleanup', {
    method, headers: authorization ? { authorization } : {},
  });
  assert.equal((await handleProfileCacheCleanup(request(), options)).status, 401);
  assert.equal((await handleProfileCacheCleanup(request('Bearer wrong'), options)).status, 401);
  assert.equal((await handleProfileCacheCleanup(request(), { ...options, secret: '' })).status, 503);
  assert.equal((await handleProfileCacheCleanup(request(`Bearer ${SECRET}`, 'POST'), options)).status, 405);
  assert.equal(initialized, 0);
  await publicReference(f);
  f.advance(PROFILE_CACHE_TTL_MS);
  const response = await handleProfileCacheCleanup(request(`Bearer ${SECRET}`), options);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).cleaned, 1);
  const failure = await handleProfileCacheCleanup(request(`Bearer ${SECRET}`), {
    ...options, createCache: () => { throw new Error('secret must stay hidden'); },
  });
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: 'CLEANUP_UNAVAILABLE' });
  const config = JSON.parse(await readFile(new globalThis.URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.crons, [
    { path: '/api/profile-cache/cleanup', schedule: '0 0 * * *' },
    { path: '/api/share-cleanup', schedule: '15 0 * * *' },
  ]);
});
