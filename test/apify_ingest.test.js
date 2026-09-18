import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTOR, createInstagramIngest, instagramAccount, normalizeInstagram } from '../lib/apify_ingest.js';
import { handleIngest } from '../lib/ingest_api.js';
import { validateProfile } from '../lib/contracts.js';
import { buildCurrentProfile } from '../lib/current_profile.js';
import { extractFromReference } from '../lib/target_profile.js';
const secret = 'test-ingest-access-key-32-characters-long';
const url = 'https://www.instagram.com/public_account/';
const post = { id: '1001', shortCode: 'post1', caption: '작은 순간을 기록해요. 🍂\n오늘도 맑아요.', url: 'https://www.instagram.com/p/post1/', type: 'Sidecar', ownerUsername: 'public_account', timestamp: '2026-09-18T00:00:00Z',
  childPosts: [{ id: 'child1', type: 'Image', displayUrl: 'https://cdn.example/1.jpg' }, { id: 'child2', type: 'Video', videoUrl: 'https://cdn.example/2.mp4' }],
  latestComments: [{ text: '이것은 캡션이 아니다' }], mentions: ['someone'], taggedUsers: [{ username: 'tagged' }], coauthorProducers: [] };
const options = { url, runId: 'run1', datasetId: 'data1' };
const run = { id: 'run1', status: 'SUCCEEDED', defaultDatasetId: 'data1', buildId: 'build1', startedAt: '2026-09-18T00:00:00Z', finishedAt: '2026-09-18T00:00:04Z', stats: { runTimeSecs: 4 }, usageTotalUsd: 0.0081 };
const mock = (responses) => {
  const calls = [];
  const client = createInstagramIngest({ token: 'server-secret-token', secret, fetchImpl: async (u, init) => {
    calls.push({ url: u, ...init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next instanceof Response ? next : Response.json(next);
  } });
  return { client, calls };
};
const code = expected => error => error.code === expected;

test('strict account URLs only; never arbitrary hosts or post/comment endpoints', () => {
  assert.equal(instagramAccount('https://instagram.com/Public_Account/?x=y').account, 'public_account');
  for (const u of ['http://instagram.com/foo', 'https://evil.instagram.com/foo', 'https://instagram.com.evil/foo', 'https://instagram.com/p/ABC', 'https://user:pass@instagram.com/foo', 'https://instagram.com:999/foo', 'https://instagram.com/reels/']) assert.throws(() => instagramAccount(u), code('INVALID_URL'));
});
test('normalization preserves Unicode, child IDs/order/types, separates comments/tags/dates and leaves unknown fields empty', () => {
  const snapshot = normalizeInstagram([post], options);
  assert.equal(snapshot.posts[0].caption, post.caption);
  assert.deepEqual(snapshot.posts[0].children.map(x => [x.id, x.index, x.type]), [['child1', 0, 'Image'], ['child2', 1, 'Video']]);
  assert.equal(snapshot.posts[0].music, null);
  assert.equal(snapshot.posts[0].event_at, null);
  assert.equal(snapshot.posts[0].published_at, post.timestamp);
  assert.equal('latestComments' in snapshot.posts[0], false);
  assert.equal(snapshot.provenance.actor, ACTOR);
  assert.equal(snapshot.provenance.evidence_refs['public_account:post1'], post.url);
});
test('both existing extractors consume same snapshot and every observation reference resolves', async () => {
  const snapshot = normalizeInstagram([post], options);
  const profiles = [validateProfile(buildCurrentProfile({ snapshot }), 'current'), await extractFromReference(url, { registry: { public_account: snapshot } })];
  for (const profile of profiles) {
    assert.equal(profile.sample_size, 1);
    const walk = x => { if (!x || typeof x !== 'object') return; if (x.kind && x.ref && x.kind !== 'rule') assert.ok(snapshot.provenance.evidence_refs[x.ref]); Object.values(x).forEach(walk); };
    walk(profile);
  }
});
test('confirmed private, nonexistent, access unavailable and unknown responses are distinct', () => {
  for (const [row, expected] of [[{ isPrivate: true }, 'PRIVATE_ACCOUNT'], [{ error: 'private_account' }, 'PRIVATE_ACCOUNT'], [{ error: 'account_not_found' }, 'ACCOUNT_NOT_FOUND'], [{ error: 'login_required' }, 'ACCESS_UNAVAILABLE'], [{ error: 'no_items' }, 'ACCOUNT_UNCONFIRMED']]) assert.throws(() => normalizeInstagram([row], options), code(expected));
  assert.throws(() => normalizeInstagram([], options), code('ACCOUNT_UNCONFIRMED'));
});
test('missing observations, mixed errors, duplicate posts or wrong accounts cannot become success', () => {
  for (const rows of [[{ ...post, caption: undefined }], [{ ...post, childPosts: [] }], [{ ...post, ownerUsername: 'other' }], [post, { error: 'no_items' }], [post, post], [{ ...post, inputUrl: 'https://instagram.com/other/' }]]) assert.throws(() => normalizeInstagram(rows, options));
  assert.equal(normalizeInstagram([{ ...post, ownerUsername: 'coauthor', inputUrl: url }], options).posts[0].owner_username, 'coauthor');
});
test('start pins actor/posts mode and hard limits; known private and invalid limits perform zero calls', async () => {
  const { client, calls } = mock([{ data: { id: 'run1' } }]);
  for (const input of [{ url, knownPrivate: true }, { url, limit: 31 }, { url, limit: 0 }]) await assert.rejects(client.start(input));
  assert.equal(calls.length, 0);
  await client.start({ url });
  assert.match(calls[0].url, /apify~instagram-scraper\/runs\?timeout=120&maxItems=3&maxTotalChargeUsd=0.1$/);
  assert.deepEqual(JSON.parse(calls[0].body), { directUrls: [url], resultsType: 'posts', resultsLimit: 3, addParentData: true });
  assert.equal(calls[0].headers.Authorization, 'Bearer server-secret-token');
  assert.equal(calls[0].url.includes('server-secret-token'), false);
});
test('asynchronous completion supplies real run metrics and both profiles', async () => {
  const { client } = mock([{ data: { id: 'run1' } }, { data: { ...run, status: 'RUNNING' } }, { data: run }, [post]]);
  const job = await client.start({ url });
  assert.equal((await client.inspect(job.receipt)).status, 'RUNNING');
  const result = await client.inspect(job.receipt);
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.metrics.usage_total_usd, 0.0081);
  assert.equal(result.currentProfile.present, true);
  assert.equal(result.targetProfile.present, true);
  assert.equal(JSON.stringify(result).includes('server-secret-token'), false);
});
test('signed receipts prevent foreign-run requests and survive creating a new client', async () => {
  const { client, calls } = mock([{ data: { id: 'run1' } }]);
  const job = await client.start({ url });
  await assert.rejects(client.inspect(job.receipt + 'x'), code('INVALID_RECEIPT'));
  assert.equal(calls.length, 1);
  const resumed = mock([{ data: run }, [post]]);
  assert.equal((await resumed.client.inspect(job.receipt)).status, 'SUCCEEDED');
});
test('ambiguous paid starts never retry; reads retry at most once', async () => {
  const start = mock([new Error('network')]);
  await assert.rejects(start.client.start({ url }), code('START_UNCONFIRMED'));
  assert.equal(start.calls.length, 1);
  const read = mock([{ data: { id: 'run1' } }, new Response('', { status: 503 }), new Response('', { status: 503 })]);
  const job = await read.client.start({ url });
  await assert.rejects(read.client.inspect(job.receipt), code('PROVIDER_ERROR'));
  assert.equal(read.calls.length, 3);
});
test('provider timeout/budget failure preserve receipt and measurements', async () => {
  for (const [status, statusMessage, expected] of [['TIMED-OUT', '', 'PROVIDER_TIMEOUT'], ['FAILED', 'cost limit', 'COST_LIMIT'], ['FAILED', 'internal failure', 'PROVIDER_ERROR']]) {
    const { client } = mock([{ data: { id: 'run1' } }, { data: { ...run, status, statusMessage } }]);
    const job = await client.start({ url });
    await assert.rejects(client.inspect(job.receipt), e => e.code === expected && e.details.receipt === job.receipt && e.details.metrics.run_id === 'run1');
  }
});
test('cancel preserves receipt; late completed run is not discarded', async () => {
  for (const status of ['ABORTED', 'SUCCEEDED']) {
    const { client, calls } = mock([{ data: { id: 'run1' } }, { data: { ...run, status: 'RUNNING' } }, { data: {} }, { data: { ...run, status } }, [post]]);
    const job = await client.start({ url });
    const result = await client.cancel(job.receipt);
    assert.equal(result.status, status === 'ABORTED' ? 'CANCELLED' : 'SUCCEEDED');
    assert.match(calls[2].url, /\/run1\/abort$/);
    assert.equal(result.receipt, job.receipt);
  }
});
test('HTTP requires server access key and explicit paid acknowledgement; never silently starts by default', async () => {
  let starts = 0;
  const ingest = { start: async () => { starts++; return { status: 'RUNNING' }; } };
  const request = (body, auth = `Bearer ${secret}`) => new Request('http://localhost/api/ingest', { method: 'POST', headers: { authorization: auth }, body: JSON.stringify(body) });
  assert.equal((await handleIngest(request({ action: 'start', confirmLive: true }), { accessKey: '', ingest })).status, 503);
  assert.equal((await handleIngest(request({ action: 'start', confirmLive: true }, 'bad'), { accessKey: secret, ingest })).status, 401);
  assert.equal((await handleIngest(request({ action: 'start' }), { accessKey: secret, ingest })).status, 400);
  assert.equal(starts, 0);
  assert.equal((await handleIngest(request({ action: 'start', confirmLive: true }), { accessKey: secret, ingest })).status, 202);
  assert.equal(starts, 1);
});

test('cancel on an already completed run performs no abort request', async () => {
  const { client, calls } = mock([{ data: { id: 'run1' } }, { data: run }, [post]]);
  const job = await client.start({ url });
  assert.equal((await client.cancel(job.receipt)).status, 'SUCCEEDED');
  assert.equal(calls.filter(x => x.url.endsWith('/abort')).length, 0);
});
test('failed abort racing completion retains the completed result', async () => {
  const { client } = mock([{ data: { id: 'run1' } }, { data: { ...run, status: 'RUNNING' } }, new Response('', { status: 400 }), { data: run }, [post]]);
  const job = await client.start({ url });
  assert.equal((await client.cancel(job.receipt)).status, 'SUCCEEDED');
});
test('malformed receipt signatures fail closed even with multibyte characters', async () => {
  const { client } = mock([{ data: { id: 'run1' } }]);
  const job = await client.start({ url });
  const body = job.receipt.split('.')[0];
  await assert.rejects(client.inspect(body + '.' + '한'.repeat(43)), code('INVALID_RECEIPT'));
});
test('unknown costs stay null and empty completed datasets are not live successes', async () => {
  const { client } = mock([{ data: { id: 'run1' } }, { data: { ...run, usageTotalUsd: undefined } }, []]);
  const job = await client.start({ url });
  await assert.rejects(client.inspect(job.receipt), e => e.code === 'ACCOUNT_UNCONFIRMED' && e.details.metrics.usage_total_usd === null);
});

test('malformed or unsupported carousel media cannot become successful observations', () => {
  for (const child of [null, {}, { id: 'child2' }, { id: 'child2', type: 'Story' }]) assert.throws(() => normalizeInstagram([{ ...post, childPosts: [post.childPosts[0], child] }], options), code('INVALID_DATA'));
});
test('completed-run billing remains provisional until re-observed after ten seconds', async () => {
  let clock = Date.parse(run.finishedAt) + 500;
  const responses = [{ data: { id: 'run1' } }, { data: run }, [post], { data: { ...run, usageTotalUsd: 0.009 } }, [post]];
  const client = createInstagramIngest({ token: 'token', secret, now: () => clock, fetchImpl: async () => Response.json(responses.shift()) });
  const job = await client.start({ url });
  assert.equal((await client.inspect(job.receipt)).metrics.provisional, true);
  clock += 10000;
  const settled = await client.inspect(job.receipt);
  assert.equal(settled.metrics.provisional, false);
  assert.equal(settled.metrics.usage_total_usd, 0.009);
});
test('API access key alone cannot forge receipts signed with separate server secret', async () => {
  const signingSecret = 'separate-private-receipt-secret-32-characters';
  const responses = [{ data: { id: 'run1' } }];
  const server = createInstagramIngest({ token: 'token', secret: signingSecret, fetchImpl: async () => Response.json(responses.shift()) });
  const job = await server.start({ url });
  const other = mock([]);
  await assert.rejects(other.client.inspect(job.receipt), code('INVALID_RECEIPT'));
  assert.equal(other.calls.length, 0);
});
