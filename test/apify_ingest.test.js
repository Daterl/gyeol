import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTOR, createInstagramIngest, instagramAccount, normalizeInstagram, privacyFromHtml } from '../lib/apify_ingest.js';
import { handleIngest } from '../lib/ingest_api.js';
import { validateProfile } from '../lib/contracts.js';
import { buildCurrentProfile } from '../lib/current_profile.js';
import { extractFromReference } from '../lib/target_profile.js';
const secret = 'test-ingest-access-key-32-characters-long';
// Captured from real provider runs and real logged-out profile pages; see each fixture's _source.
const real = JSON.parse(readFileSync(new URL('../fixtures/apify_real_responses.json', import.meta.url), 'utf8'));
const markers = JSON.parse(readFileSync(new URL('../fixtures/instagram_profile_markers.json', import.meta.url), 'utf8'));
const url = 'https://www.instagram.com/public_account/';
const post = { id: '1001', shortCode: 'post1', caption: '작은 순간을 기록해요. 🍂\n오늘도 맑아요.', url: 'https://www.instagram.com/p/post1/', type: 'Sidecar', ownerUsername: 'public_account', timestamp: '2026-09-18T00:00:00Z',
  childPosts: [{ id: 'child1', type: 'Image', displayUrl: 'https://cdn.example/1.jpg' }, { id: 'child2', type: 'Video', videoUrl: 'https://cdn.example/2.mp4' }],
  latestComments: [{ text: '이것은 캡션이 아니다' }], mentions: ['someone'], taggedUsers: [{ username: 'tagged' }], coauthorProducers: [] };
const options = { url, runId: 'run1', datasetId: 'data1' };
const run = { id: 'run1', status: 'SUCCEEDED', defaultDatasetId: 'data1', buildId: 'build1', startedAt: '2026-09-18T00:00:00Z', finishedAt: '2026-09-18T00:00:04Z', stats: { runTimeSecs: 4 }, usageTotalUsd: 0.0081 };
const mock = (responses) => {
  const calls = [];
  const client = createInstagramIngest({ token: 'server-secret-token', secret, checkPublic: async () => 'public', fetchImpl: async (u, init) => {
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
  const aggregateRef = buildCurrentProfile({ snapshot }).language.empty_caption_ratio.evidence[0].ref;
  assert.equal(snapshot.provenance.evidence_refs[aggregateRef], snapshot.provenance.source_url);
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
test("a missing account is named as missing and the provider's own wording survives", () => {
  const [row] = real.missing_account_run.items;
  assert.deepEqual(row, { url: real.missing_account_run._input_url, username: 'gyeol68nonexistentaccount9z', error: 'not_found', errorDescription: 'Post does not exist' });
  assert.throws(() => normalizeInstagram([row], { ...options, url: row.url }), e => e.code === 'ACCOUNT_NOT_FOUND' && e.details.provider_error === 'not_found' && e.details.provider_message === 'Post does not exist');
  // An error code nobody has observed must not be guessed into a specific verdict.
  assert.throws(() => normalizeInstagram([{ error: 'something_new' }], options), e => e.code === 'ACCOUNT_UNCONFIRMED' && e.details.provider_error === 'something_new');
  assert.throws(() => normalizeInstagram([], options), code('ACCOUNT_UNCONFIRMED'));
});
test('missing observations, mixed errors, duplicate posts or wrong accounts cannot become success', () => {
  for (const rows of [[{ ...post, caption: undefined }], [{ ...post, childPosts: [] }], [{ ...post, ownerUsername: 'other' }], [post, { error: 'no_items' }], [post, post], [{ ...post, inputUrl: 'https://instagram.com/other/' }]]) assert.throws(() => normalizeInstagram(rows, options));
  // A co-author credit is not authorship: nothing is left to attribute, so this is a failure, not an empty success.
  assert.throws(() => normalizeInstagram([{ ...post, ownerUsername: 'coauthor', coauthorProducers: [{ username: 'public_account' }], inputUrl: url }], options), e => e.code === 'ACCOUNT_UNCONFIRMED' && e.details.excluded_owners.includes('coauthor'));
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
  const client = createInstagramIngest({ token: 'token', secret, now: () => clock, checkPublic: async () => 'public', fetchImpl: async () => Response.json(responses.shift()) });
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
  const server = createInstagramIngest({ token: 'token', secret: signingSecret, checkPublic: async () => 'public', fetchImpl: async () => Response.json(responses.shift()) });
  const job = await server.start({ url });
  const other = mock([]);
  await assert.rejects(other.client.inspect(job.receipt), code('INVALID_RECEIPT'));
  assert.equal(other.calls.length, 0);
});

test('requested URL alone cannot attribute a foreign owner post to the requested account', () => {
  assert.throws(() => normalizeInstagram([{ ...post, ownerUsername: 'foreign', inputUrl: url }], options), code('ACCOUNT_UNCONFIRMED'));
  assert.throws(() => normalizeInstagram([{ ...post, ownerUsername: undefined }], options), code('INVALID_DATA'));
});
test('provider hidden errors are preserved through dataset retrieval and classified', async () => {
  const { client, calls } = mock([{ data: { id: 'run1' } }, { data: run }, [{ '#error': 'not_found', errorDescription: 'Post does not exist' }]]);
  const job = await client.start({ url });
  await assert.rejects(client.inspect(job.receipt), e => e.code === 'ACCOUNT_NOT_FOUND' && e.details.provider_message === 'Post does not exist' && e.details.metrics.run_id === 'run1');
  assert.equal(new URL(calls[2].url).searchParams.has('clean'), false);
});
test('post IDs and shortcodes have independent duplicate namespaces', () => {
  const second = { ...post, id: post.shortCode, shortCode: 'post2' };
  assert.equal(normalizeInstagram([post, second], options).posts.length, 2);
});
test('abort failure preserves the valid receipt for later inspection', async () => {
  const { client } = mock([{ data: { id: 'run1' } }, { data: { ...run, status: 'RUNNING' } }, new Response('', { status: 503 }), { data: { ...run, status: 'RUNNING' } }]);
  const job = await client.start({ url });
  await assert.rejects(client.cancel(job.receipt), e => e.code === 'PROVIDER_ERROR' && e.details.receipt === job.receipt);
});
test('provider 429 does not trigger a second request or lose its budget classification', async () => {
  const { client, calls } = mock([{ data: { id: 'run1' } }, new Response('', { status: 429 })]);
  const job = await client.start({ url });
  await assert.rejects(client.inspect(job.receipt), code('COST_LIMIT'));
  assert.equal(calls.length, 2);
});
test('missing run completion time stays unknown rather than becoming collection time now', async () => {
  const { client } = mock([{ data: { id: 'run1' } }, { data: { ...run, finishedAt: undefined } }, [post]]);
  const job = await client.start({ url });
  const result = await client.inspect(job.receipt);
  assert.equal(result.snapshot.provenance.collected_at, null);
  assert.equal(result.metrics.provisional, true);
});
test('HTTP status/cancel/method and streamed input bound are enforced without paid calls', async () => {
  const received = [];
  const ingest = { inspect: async r => { received.push(['status', r]); return { status: 'SUCCEEDED' }; }, cancel: async r => { received.push(['cancel', r]); return { status: 'CANCELLED' }; } };
  const req = (body, method = 'POST') => new Request('http://localhost/api/ingest', { method, headers: { authorization: `Bearer ${secret}` }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  for (const action of ['status', 'cancel']) assert.equal((await handleIngest(req({ action, receipt: 'signed' }), { accessKey: secret, ingest })).status, 200);
  assert.deepEqual(received, [['status', 'signed'], ['cancel', 'signed']]);
  assert.equal((await handleIngest(req(null, 'GET'), { accessKey: secret, ingest })).status, 405);
  assert.equal((await handleIngest(req('x'.repeat(8193)), { accessKey: secret, ingest })).status, 400);
  assert.equal((await handleIngest(req('{broken'), { accessKey: secret, ingest })).status, 400);
});

// --- Collection must not start unless the account itself is public (PR #84 review, BLOCKER-1/2) ---

test('the real profile pages decide public, private and undecidable without any paid call', () => {
  assert.equal(privacyFromHtml(markers.private.html, markers.private.handle), 'private');
  assert.equal(privacyFromHtml(markers.public.html, markers.public.handle), 'public');
  // A page that does not state it for this account is never read as public.
  assert.equal(privacyFromHtml(markers.missing.html, markers.missing.handle), null);
  assert.equal(privacyFromHtml(markers.public.html, markers.private.handle), null);
  assert.equal(privacyFromHtml(markers.public_dotted.html, markers.public_dotted.handle), 'public');
  for (const html of ['', null, '"username":"hauny_bee"', '"is_private":true']) assert.equal(privacyFromHtml(html, 'hauny_bee'), null);
});

// A flag that belongs to some other account on the page must never decide this one (PR #84 re-review, HIGH).
const otherAccountPublic = '"is_private":false},"xig_logged_out_dynamic_dialog_info":{"shared_entity_id":"1","user":{"pk":"1","username":"other"}}';
const unboundCounterexamples = {
  // The review's counterexample: the target's own flag carries a JSON-legal space so a bare marker scan
  // misses it, leaving another account's flag as the only one on the page.
  spaced_target_and_other: '{"profile":{"username":"hauny_bee","is_private": true},"recommended":{"username":"other","is_private":false}}',
  // The target's flag is gone entirely and a stranger's public flag remains.
  target_marker_gone: '{"recommended":{"username":"other","is_private":false}}',
  // A well-formed profile structure that simply is not this account's.
  other_account_bound: otherAccountPublic,
  // This account is named on the page, but nothing states the flag as its own.
  named_but_unbound: '{"username":"hauny_bee"}' + otherAccountPublic,
};

test("another account's public flag is never read as this account's, so no paid run starts", async () => {
  for (const [name, html] of Object.entries(unboundCounterexamples)) {
    assert.equal(privacyFromHtml(html, 'hauny_bee'), null, name);
    const calls = [];
    const client = createInstagramIngest({ token: 'server-secret-token', secret, fetchImpl: async u => {
      calls.push(String(u));
      return String(u).startsWith('https://www.instagram.com/') ? new Response(html) : Response.json({ data: { id: 'run1' } });
    } });
    await assert.rejects(client.start({ url: 'https://www.instagram.com/hauny_bee/' }),
      e => e.code === 'ACCOUNT_UNCONFIRMED' && e.details.stage === 'precheck' && e.details.account === 'hauny_bee', name);
    // The profile page was read once and the provider was never called.
    assert.deepEqual(calls, ['https://www.instagram.com/hauny_bee/'], name);
  }
});

test("the account's own flag decides it even when a stranger's contradicting flag shares the page", () => {
  // Real private page + a forged public structure for someone else: still private, still blocked.
  assert.equal(privacyFromHtml(markers.private.html + otherAccountPublic, markers.private.handle), 'private');
  assert.equal(privacyFromHtml(otherAccountPublic + markers.private.html, markers.private.handle), 'private');
  // A real public page keeps starting, and the stranger's structure does not make it undecidable.
  assert.equal(privacyFromHtml(markers.public.html + otherAccountPublic, markers.public.handle), 'public');
  // Two flags claiming the same account contradict each other, so the account stays undecided.
  assert.equal(privacyFromHtml(markers.private.html + markers.private.html, markers.private.handle), null);
});

test('a private account is refused before the provider is paid, and is told what to do instead', async () => {
  for (const [visibility, expected] of [['private', 'PRIVATE_ACCOUNT'], [null, 'ACCOUNT_UNCONFIRMED'], ['unexpected', 'ACCOUNT_UNCONFIRMED']]) {
    const calls = [];
    const client = createInstagramIngest({ token: 'server-secret-token', secret, checkPublic: async () => visibility, fetchImpl: async u => { calls.push(u); return Response.json({ data: { id: 'run1' } }); } });
    await assert.rejects(client.start({ url: 'https://www.instagram.com/hauny_bee/' }), e => e.code === expected && e.details.stage === 'precheck' && e.details.account === 'hauny_bee' && /사진을 직접 올려/.test(e.message));
    assert.equal(calls.length, 0);
  }
});

test('the visibility check reads the profile page anonymously and never carries the provider token', async () => {
  const calls = [];
  const client = createInstagramIngest({ token: 'apify_api_SECRET', secret, fetchImpl: async (u, init) => {
    calls.push({ url: String(u), init });
    return String(u).startsWith('https://www.instagram.com/') ? new Response(markers.public.html) : Response.json({ data: { id: 'run1' } });
  } });
  assert.equal((await client.start({ url: `https://www.instagram.com/${markers.public.handle}/` })).status, 'RUNNING');
  assert.equal(calls[0].url, `https://www.instagram.com/${markers.public.handle}/`);
  assert.equal('Authorization' in calls[0].init.headers, false);
  assert.equal(JSON.stringify(calls[0]).includes('apify_api_SECRET'), false);
  assert.match(calls[1].url, /apify~instagram-scraper\/runs/);
});

test("the real private-account run cannot become that account's profile", () => {
  const { items, _input_url: inputUrl } = real.private_account_run;
  // What the provider actually returned: no error, and someone else's post with the input account credited as co-author.
  assert.equal(items.length, 1);
  assert.equal(items[0].error ?? items[0]['#error'] ?? null, null);
  assert.equal(items[0].ownerUsername, 'hong_a1302');
  assert.deepEqual(items[0].coauthorProducers.map(x => String(x.id)), ['6024842245']);
  assert.equal(instagramAccount(inputUrl).account, 'hauny_bee');
  assert.throws(() => normalizeInstagram(items, { ...options, url: inputUrl }), e => e.code === 'ACCOUNT_UNCONFIRMED' && e.details.excluded_post_count === 1 && e.details.excluded_owners.join() === 'hong_a1302');
});

test('every observation a snapshot carries belongs to the account the provenance names', () => {
  const snapshot = normalizeInstagram([post, { ...post, id: '1002', shortCode: 'post2', url: 'https://www.instagram.com/p/post2/' }], options);
  for (const p of snapshot.posts) assert.equal(p.owner_username, snapshot.provenance.account);
  const owned = new Set(snapshot.posts.map(p => p.url));
  for (const [ref, target] of Object.entries(snapshot.provenance.evidence_refs)) {
    assert.ok(owned.has(target) || target === snapshot.provenance.source_url, `${ref} points outside the account`);
  }
});

test('a real public account still collects, minus the posts other people wrote', async () => {
  const { items, _input_url: inputUrl } = JSON.parse(readFileSync(new URL('../fixtures/apify_public_account_run.json', import.meta.url), 'utf8'));
  const snapshot = normalizeInstagram(items, { ...options, url: inputUrl });
  assert.equal(items.length, 30);
  assert.equal(snapshot.posts.length, 26);
  assert.deepEqual(snapshot.provenance.coauthored_excluded.owners, ['kkyeongeun_', 'ko_ng__e', 'mapogu_won', 'yeoreum829']);
  assert.equal(snapshot.provenance.coauthored_excluded.count, 4);
  for (const p of snapshot.posts) assert.equal(p.owner_username, '29cm.official');
  assert.deepEqual(snapshot.posts.map(p => p.index), [...snapshot.posts.keys()]);
  const profile = validateProfile(buildCurrentProfile({ snapshot }), 'current');
  assert.equal(profile.sample_size, 26);
  const walk = x => { if (!x || typeof x !== 'object') return; if (x.kind && x.ref && x.kind !== 'rule') assert.ok(snapshot.provenance.evidence_refs[x.ref], `${x.ref} unresolved`); Object.values(x).forEach(walk); };
  walk(profile);
  walk(await extractFromReference(inputUrl, { registry: { [snapshot.handle]: snapshot } }));
});
