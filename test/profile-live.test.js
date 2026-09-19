import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { profileLiveConfiguration, verifyBlob, verifyCollection } from '../scripts/verify-profile-live.js';
import { createPrivateBlobStorage } from '../lib/profile-cache-storage.js';
import { createInstagramIngest } from '../lib/apify_ingest.js';

const token = 'vercel_blob_rw_TestStore_fixture';
function configured() {
  return { BLOB_READ_WRITE_TOKEN: token, APIFY_TOKEN: 'provider-fixture', GYEOL_APP_ORIGIN: 'https://preview.example',
    ...Object.fromEntries(['PROFILE_CACHE_SECRET', 'APIFY_INGEST_ACCESS_KEY', 'APIFY_INGEST_RECEIPT_SECRET', 'CRON_SECRET', 'GYEOL_BROWSER_SESSION_SECRET']
      .map(key => [key, `fixture-${key}-${'x'.repeat(32)}`])) };
}

test('preflight names exact missing/invalid/reused configuration without printing values', () => {
  const absent = profileLiveConfiguration({});
  assert.equal(absent.ready, false);
  assert.equal(absent.missing.length, 8);
  assert.equal(profileLiveConfiguration(configured()).ready, true);
  const env = { ...configured(), APIFY_INGEST_RECEIPT_SECRET: 'short', GYEOL_APP_ORIGIN: 'https://preview.example/path' };
  env.PROFILE_CACHE_SECRET = env.CRON_SECRET;
  const result = profileLiveConfiguration(env);
  assert.deepEqual(result.invalid, ['APIFY_INGEST_RECEIPT_SECRET', 'GYEOL_APP_ORIGIN']);
  assert.deepEqual(result.reused, ['PROFILE_CACHE_SECRET', 'CRON_SECRET']);
  assert.ok(!JSON.stringify(result).includes(env.CRON_SECRET));
});

test('unconfigured CLI exits nonzero with a sanitized blocker before network work', () => {
  const run = spawnSync(process.execPath, ['scripts/verify-profile-live.js', '--collect', 'https://instagram.com/public.test/'], {
    encoding: 'utf8', env: { PATH: process.env.PATH },
  });
  assert.equal(run.status, 1);
  const report = JSON.parse(run.stdout);
  assert.equal(report.code, 'NOT_CONFIGURED');
  assert.equal(report.paid_start_attempts, 0);
  assert.equal(run.stderr, '');
  const invalid = spawnSync(process.execPath, ['scripts/verify-profile-live.js', 'never-echo-this-secret'], {
    encoding: 'utf8', env: { PATH: process.env.PATH },
  });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).code, 'USAGE');
  assert.ok(!invalid.stdout.includes('never-echo-this-secret'));
});

// An independent HTTP-shaped oracle rejects the old access header. It models
// storage semantics only; passing does not establish production Blob atomicity.
function blobServer() {
  const rows = new Map();
  let version = 0;
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    if (init.method === 'PUT') {
      assert.equal(init.headers['x-vercel-blob-access'], 'private');
      const key = parsed.searchParams.get('pathname'), old = rows.get(key);
      const match = init.headers['x-if-match'];
      if (match ? old?.etag !== match : old) return Response.json({ error: { code: 'precondition_failed' } }, { status: 412 });
      const row = { value: JSON.parse(init.body), etag: `"${++version}"` };
      rows.set(key, row);
      return Response.json({ pathname: key, etag: row.etag });
    }
    if (!init.headers?.Authorization) return new Response(null, { status: 403 });
    const row = rows.get(parsed.pathname.slice(1));
    return row ? Response.json(row.value, { headers: { etag: row.etag } }) : new Response(null, { status: 404 });
  };
  return { rows, fetchImpl, createStorage: () => createPrivateBlobStorage({ token, fetchImpl }) };
}

test('Blob probe checks actual adapter, concurrent CAS, anonymous denial, exact TTL and scoped cleanup', async () => {
  const server = blobServer();
  const report = await verifyBlob({ ...server, token });
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.paid_starts, 0);
  assert.equal(server.rows.size, 1);
  assert.deepEqual(Object.keys([...server.rows.values()][0].value).sort(), ['expires_at', 'generation', 'status', 'version']);
});

test('Blob probe rejects stores allowing unauthenticated reads', async () => {
  const server = blobServer();
  await assert.rejects(verifyBlob({ ...server, token, fetchImpl: async () => Response.json({ leaked: true }) }));
});

test('live runner uses real ingestion/cache adapters, reuses URL variants and settles metrics without a second paid start', async () => {
  const server = blobServer();
  let time = Date.parse('2026-09-19T00:00:00Z'), paid = 0, reads = 0;
  const ingest = createInstagramIngest({ token: 'apify-fixture', secret: configured().APIFY_INGEST_RECEIPT_SECRET,
    now: () => time, checkPublic: async () => 'public', fetchImpl: async (url, init) => {
      if (init.method === 'POST') { paid++; return Response.json({ data: { id: 'run1' } }); }
      if (url.includes('/actor-runs/')) {
        reads++;
        return Response.json({ data: { id: 'run1', buildId: 'build1', status: 'SUCCEEDED', defaultDatasetId: 'dataset1',
          finishedAt: '2026-09-19T00:00:04Z', stats: { runTimeSecs: 4 }, usageTotalUsd: reads === 1 ? 0 : 0.0081 } });
      }
      return Response.json([{ id: 'post1', shortCode: 'post1', caption: 'fixture', type: 'Image', ownerUsername: 'public.test', url: 'https://www.instagram.com/p/post1/' }]);
    } });
  const options = { storage: server.createStorage(), ingest, secret: configured().PROFILE_CACHE_SECRET, now: () => time, wait: async ms => { time += ms; } };
  const report = await verifyCollection('https://instagram.com/PUBLIC.test?igsh=test', options);
  assert.equal(report.verdict, 'PASS');
  assert.equal(paid, 1);
  assert.equal(reads, 2);
  assert.equal(report.metrics.usage_total_usd, 0.0081);
  assert.equal(report.metrics.build_id, 'build1');
  assert.equal(report.metrics.provisional, false);
  assert.equal(JSON.stringify(report).includes('receipt'), false);
  assert.equal((await verifyCollection('https://instagram.com/public.test/', options)).verdict, 'INCOMPLETE_METRICS');
  assert.equal(paid, 1);
});
