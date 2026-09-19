// Operator-only integration runner. Never prints credentials, receipts or snapshots.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createPrivateBlobStorage } from '../lib/profile-cache-storage.js';
import { createProfileCache, profileCacheKey, PROFILE_CACHE_TTL_MS } from '../lib/profile-cache.js';
import { ACTOR, createInstagramIngest, instagramAccount, LIMITS } from '../lib/apify_ingest.js';

const secrets = ['PROFILE_CACHE_SECRET', 'APIFY_INGEST_ACCESS_KEY', 'APIFY_INGEST_RECEIPT_SECRET', 'CRON_SECRET', 'GYEOL_BROWSER_SESSION_SECRET'];
export function profileLiveConfiguration(env = process.env) {
  const missing = [], invalid = [];
  for (const key of ['BLOB_READ_WRITE_TOKEN', 'APIFY_TOKEN', ...secrets, 'GYEOL_APP_ORIGIN']) {
    if (!env[key]) missing.push(key);
  }
  for (const key of secrets) if (env[key] && env[key].length < 32) invalid.push(key);
  if (env.BLOB_READ_WRITE_TOKEN && !/^vercel_blob_rw_[a-zA-Z0-9]+_.+$/.test(env.BLOB_READ_WRITE_TOKEN)) invalid.push('BLOB_READ_WRITE_TOKEN');
  if (env.GYEOL_APP_ORIGIN) {
    try {
      const origin = new URL(env.GYEOL_APP_ORIGIN);
      if (origin.protocol !== 'https:' || origin.origin !== env.GYEOL_APP_ORIGIN) invalid.push('GYEOL_APP_ORIGIN');
    } catch { invalid.push('GYEOL_APP_ORIGIN'); }
  }
  const values = ['APIFY_TOKEN', ...secrets].filter(key => env[key]);
  const reused = values.filter(key => values.some(other => key !== other && env[key] === env[other]));
  return { ready: !missing.length && !invalid.length && !reused.length, missing, invalid, reused };
}

export async function verifyBlob({ createStorage = createPrivateBlobStorage, token = process.env.BLOB_READ_WRITE_TOKEN, fetchImpl = fetch } = {}) {
  // Isolate probe cleanup from every customer record. The marker is deliberately
  // retained, just like production, and contains no collected profile payload.
  const url = `https://www.instagram.com/probe_${randomUUID().replaceAll('-', '').slice(0, 20)}/`;
  const key = profileCacheKey(url);
  const clients = [createStorage(), createStorage()];
  let time = Date.now();
  const initial = { version: 1, generation: randomUUID(), status: 'reserved', expires_at: time + PROFILE_CACHE_TTL_MS, source_url: url };
  const creates = await Promise.all(clients.map(client => client.write(key, initial)));
  assert.equal(creates.filter(Boolean).length, 1);
  const winner = creates.find(Boolean);
  assert.deepEqual((await clients[1].read(key)).value, initial);
  const writes = await Promise.all(clients.map((client, index) => client.write(key, { ...initial, generation: `winner-${index}` }, { ifMatch: winner.etag })));
  assert.equal(writes.filter(Boolean).length, 1);
  assert.equal(await clients[0].write(key, initial, { ifMatch: winner.etag }), null);
  const current = await clients[0].read(key);
  assert.equal(current.etag, writes.find(Boolean).etag);
  const store = token.split('_')[3].toLowerCase();
  for (const access of ['private', 'public']) {
    const response = await fetchImpl(`https://${store}.${access}.blob.vercel-storage.com/${key}?cache=0`, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    assert.ok([401, 403, 404].includes(response.status));
    await response.body?.cancel();
  }
  const storage = { ...clients[0], list: async () => ({ keys: [key], cursor: null }) };
  let starts = 0;
  const cache = createProfileCache({ storage, secret: randomUUID(), now: () => time,
    ingest: { start: async () => { starts++; throw new Error('Probe must never collect'); } } });
  time = initial.expires_at - 1;
  assert.equal((await cache.connect({ url })).status, 'pending');
  time++;
  assert.equal((await cache.connect({ url })).status, 'expired');
  assert.deepEqual(await cache.cleanup(), { scanned: 1, cleaned: 1, conflicted: 0 });
  assert.deepEqual(Object.keys((await storage.read(key)).value).sort(), ['expires_at', 'generation', 'status', 'version']);
  assert.equal((await cache.connect({ url })).status, 'expired');
  assert.equal(starts, 0);
  return { verdict: 'PASS', concurrent_create: true, stale_etag_rejected: true, anonymous_read_denied: true,
    ttl_boundary: true, payload_cleanup: true, probe_key: key, retained: 'expired marker', clock: 'injected at TTL boundary', paid_starts: 0 };
}

export async function verifyCollection(url, { storage = createPrivateBlobStorage(), ingest = createInstagramIngest({ accessKey: process.env.APIFY_INGEST_ACCESS_KEY }), now = Date.now, wait = delay, secret = process.env.PROFILE_CACHE_SECRET } = {}) {
  const canonical = instagramAccount(url).url;
  let metrics, receipt, starts = 0;
  const observed = {
    start: async input => { starts++; return ingest.start(input); },
    inspect: async value => { receipt = value; const result = await ingest.inspect(value); metrics = result.metrics; return result; },
  };
  const cache = createProfileCache({ storage, ingest: observed, secret, now });
  let state = await cache.connect({ url: canonical });
  const deadline = now() + (LIMITS.timeoutSecs + 30) * 1000;
  while (state.status === 'pending' && now() < deadline) {
    await wait(5000);
    state = await cache.inspect({ url: canonical });
  }
  if (state.status !== 'public') return { verdict: 'BLOCKED', status: state.status, paid_start_attempts: starts };
  const resolved = await cache.resolveSnapshot({ url: canonical, snapshotId: state.snapshotId });
  // A fresh cache instance and URL spelling must reuse the durable record.
  const second = createProfileCache({ storage, ingest: observed, secret, now });
  assert.equal((await second.connect({ url: canonical.replace('www.', '').toUpperCase() })).snapshotId, state.snapshotId);
  assert.ok(starts <= 1);
  // Re-read the completed run after the ingestion adapter's settlement window;
  // never start another run just to obtain non-provisional cost evidence.
  if (metrics?.provisional) {
    await wait(11000);
    metrics = (await ingest.inspect(receipt)).metrics;
  }
  const complete = metrics?.provisional === false && typeof metrics.build_id === 'string'
    && Number.isFinite(metrics.duration_seconds) && Number.isFinite(metrics.usage_total_usd);
  return { verdict: complete ? 'PASS' : 'INCOMPLETE_METRICS', status: state.status,
    paid_start_attempts: starts, cache_reused: true, actor: ACTOR, posts: resolved.snapshot.posts.length,
    expires_at: state.expires_at, run_id: resolved.snapshot.provenance.run_id,
    metrics: metrics ? { build_id: metrics.build_id, observed_at: metrics.observed_at, duration_seconds: metrics.duration_seconds,
      usage_total_usd: metrics.usage_total_usd, provisional: metrics.provisional } : null };
}

export async function main(args = process.argv.slice(2)) {
  const [mode = '--check', url] = args;
  const report = { checked_at: new Date().toISOString(), mode: ['--check', '--blob', '--collect'].includes(mode) ? mode : null, configuration: profileLiveConfiguration() };
  if (!['--check', '--blob', '--collect'].includes(mode) || args.length > (mode === '--collect' ? 2 : 1)) {
    return { ...report, verdict: 'BLOCKED', code: 'USAGE' };
  }
  if (!report.configuration.ready) return { ...report, verdict: 'BLOCKED', code: 'NOT_CONFIGURED', paid_start_attempts: 0 };
  if (mode === '--check') return { ...report, verdict: 'READY', note: 'Configuration shape only; no network requests' };
  try {
    if (mode === '--collect') instagramAccount(url);
    report.blob = await verifyBlob();
    if (mode === '--collect') report.collection = await verifyCollection(url);
    return { ...report, verdict: report.collection?.verdict ?? 'PASS' };
  } catch {
    // Arbitrary provider/assertion errors may contain request data. Do not log.
    return { ...report, verdict: 'BLOCKED', code: 'LIVE_VERIFICATION_FAILED', note: 'Do not delete reservations or automatically retry paid starts' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await main();
  console.log(JSON.stringify(result, null, 2));
  if (!['PASS', 'READY'].includes(result.verdict)) process.exitCode = 1;
}
