import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composeFeed } from '../lib/compose.js';
import { buildCurrentProfile } from '../lib/current_profile.js';
import { extractFromFreetext, extractFromReference } from '../lib/target_profile.js';
import { MATRIX, verify } from './verify-deployed.mjs';

const cases = JSON.parse(await readFile(new URL('../docs/specs/101-caption-quality/inputs.json', import.meta.url), 'utf8'));
const photos = cases.find(item => item.name === 'photos_only').request.context.photos;
const snapshot = JSON.parse(await readFile(new URL('../fixtures/ig_snapshot.json', import.meta.url), 'utf8'));
const referenceFixture = JSON.parse(await readFile(new URL('../fixtures/ref_snapshot.sample.json', import.meta.url), 'utf8'));
const input = { session_id: 'offline-verifier', photos, profile_url: `https://www.instagram.com/${snapshot.provenance.account}/`, profile_snapshot_id: 'offline-mock-reference' };

async function run({ changeFeed, changeOutput, status, rejectStatus, raw, transport, execution = 'fixture' } = {}) {
  const calls = [];
  const result = await verify({ base: 'http://offline.invalid', environment: 'preview', execution, live: true, input, now: () => Date.parse('2026-09-18T12:00:00Z'),
    fetchImpl: async (url, init) => {
      assert.equal(init.redirect, 'manual');
      const intercepted = transport?.(url, init);
      if (intercepted) return intercepted;
      if (!init.body) return new Response('<main>GYEOL</main>');
      const body = JSON.parse(init.body);
      calls.push({ path: url.pathname, body });
      if (url.pathname === '/api/feed') {
        assert.equal(Object.hasOwn(body, 'identity'), false);
        assert.equal(Object.hasOwn(body, 'snapshot'), false);
        if (!body.profile_snapshot_id || body.photos.length < 3 || body.photos.length > 15) return Response.json({ error: { code: 'INVALID_REQUEST' } }, { status: rejectStatus ?? 400 });
        if (body.profile_snapshot_id === 'invalid-verifier-reference') return Response.json({ error: { code: 'PROFILE_NOT_VERIFIED' } }, { status: rejectStatus ?? 422 });
        assert.equal(body.profile_url, input.profile_url);
        assert.equal(body.profile_snapshot_id, input.profile_snapshot_id);
        // Compose offline fixtures independently of the HTTP request implementation.
        // The registry alias below is synthetic, never evidence of a live connection.
        const current = buildCurrentProfile({ snapshot });
        const target = body.prompt ? extractFromFreetext(body.prompt) : await extractFromReference(input.profile_url, { registry: { [snapshot.provenance.account.toLowerCase()]: referenceFixture } });
        const feed = composeFeed({ photoAnalyses: body.photos, targetProfile: target, currentProfile: current, currentPhotoAnalyses: [], sessionId: body.session_id });
        const value = { feed, context: { photos: body.photos, current, target, current_photos: [] } };
        value.curation = { schema_version: '1.0', profile_snapshot_id: body.profile_snapshot_id,
          profile: { snapshot_id: 'mock-snapshot', source_url: input.profile_url, collected_at: '2026-09-18T00:00:00Z', expires_at: '2026-09-19T00:00:00Z', ownership_verified: false, evidence_refs: { profile: ['fixture-only'] } },
          prompt: { text: body.prompt || null, evidence: body.prompt ? [{ kind: 'user_text', ref: value.context.target.profile_id, note: '사용자가 입력한 큐레이션 방향' }] : [] },
          slots: value.feed.slots.map(s => ({ photo_id: s.photo_id, position: s.position, included: true, exclusion_candidate: { recommended: false, reason: null, evidence: [] } })) };
        changeFeed?.(value);
        return Response.json(value);
      }
      assert.equal(url.pathname, '/api/generate');
      assert.equal(Object.hasOwn(body, 'photo_id'), body.mode === 'slot');
      const slots = (body.mode === 'slot' ? body.feed.slots.filter(s => s.photo_id === body.photo_id) : body.feed.slots).map(s => ({
        photo_id: s.photo_id, position: s.position, caption_state: 'seed', text: '기억하고 싶은 순간', omit_reason: null,
        evidence: [{ kind: 'uploaded_photo', ref: s.photo_id, note: 'fixture observation' }] }));
      const value = body.mode === 'all' ? { output: { title: '사진의 하루', slots } } : { slot: slots[0] };
      changeOutput?.(value, body);
      if (raw) return new Response(raw, { status: status ?? 200 });
      if (status) return Response.json({ error: { code: status === 503 ? 'GENERATION_UNAVAILABLE' : 'MODEL_HTTP', message: 'SECRET_MUST_NOT_LEAK' } }, { status });
      return Response.json(value);
    } });
  return { ...result, calls };
}

test('explicit offline matrix checks 3/15, blank/written, all/slot and accepts zero omissions', async () => {
  const result = await run();
  assert.equal(result.exitCode, 0, JSON.stringify(result.results));
  assert.equal(result.scope, 'offline mock contract only');
  assert.ok(Object.values(result.acceptance).every(value => value === 'PENDING'));
  assert.equal(result.calls.length, 16);
  const positives = result.calls.filter(c => c.path === '/api/feed' && c.body.profile_snapshot_id === input.profile_snapshot_id && [3, 15].includes(c.body.photos.length));
  assert.deepEqual(positives.map(c => ({ count: c.body.photos.length, prompt: c.body.prompt })), MATRIX);
});
test('all omitted remains valid without forced seed count', async () => {
  const result = await run({ changeOutput: value => (value.output?.slots ?? [value.slot]).forEach(s => Object.assign(s, { caption_state: 'omitted', text: null, omit_reason: '사진으로 충분해요' })) });
  assert.equal(result.exitCode, 0, JSON.stringify(result.results));
});
for (const [name, changeFeed] of [
  ['expired snapshot', value => { value.curation.profile.expires_at = '2026-09-18T12:00:00Z'; }],
  ['future-collected snapshot', value => { value.curation.profile.collected_at = '2026-09-18T12:00:01Z'; }],
  ['overlong snapshot lifetime', value => { value.curation.profile.expires_at = '2026-09-20T00:00:00Z'; }],
  ['altered observation', value => { value.context.photos[0].describable_facts.push('invented'); }],
  ['missing current curation contract', value => { delete value.curation; }],
  ['wrong snapshot reference', value => { value.curation.profile_snapshot_id = 'foreign'; }],
  ['missing profile evidence', value => { value.curation.profile.evidence_refs = {}; }],
  ['ownership claim', value => { value.curation.profile.ownership_verified = true; }],
  ['prompt provenance lost', value => { value.curation.prompt.text = 'invented'; }],
  ['automatic exclusion', value => { value.curation.slots[0].included = false; }],
  ['missing photo', value => { value.curation.slots.pop(); }],
  ['duplicate photo', value => { value.curation.slots[1].photo_id = value.curation.slots[0].photo_id; }],
  ['feed own evidence lost', value => { value.feed.slots[0].rationale.evidence = [{ kind: 'rule', ref: 'rule', note: 'rule' }]; }],
]) test(`${name} fails and blocks downstream generation`, async () => {
  const result = await run({ changeFeed });
  assert.equal(result.exitCode, 1, JSON.stringify(result.results));
  assert.equal(result.calls.some(c => c.path === '/api/generate'), false);
});
for (const [name, changeOutput] of [
  ['blank title', value => { if (value.output) value.output.title = ' '; }],
  ['multiline title', value => { if (value.output) value.output.title = 'a\nb'; }],
  ['foreign own-photo evidence', value => { (value.output?.slots ?? [value.slot])[0].evidence[0].ref = 'foreign'; }],
  ['wrong slot photo', (value, body) => { if (body.mode === 'slot') value.slot.photo_id = body.feed.slots[1].photo_id; }],
  ['missing omission reason', value => { Object.assign((value.output?.slots ?? [value.slot])[0], { caption_state: 'omitted', text: null, omit_reason: '' }); }],
]) test(`${name} fails`, async () => {
  assert.equal((await run({ changeOutput })).exitCode, 1);
});
for (const status of [401, 403, 429, 502, 503, 504]) test(`HTTP ${status} is BLOCKED, never PASS or success exit`, async () => {
  const result = await run({ status });
  assert.equal(result.exitCode, 2);
  assert.ok(result.results.some(r => r.status === 'BLOCKED' && r.detail.includes(`HTTP ${status}`)));
  assert.ok(!JSON.stringify(result).includes('SECRET_MUST_NOT_LEAK'));
});
test('malformed success is failure with raw body withheld', async () => {
  const result = await run({ raw: 'SECRET_MUST_NOT_LEAK' });
  assert.equal(result.exitCode, 1);
  assert.ok(!JSON.stringify(result).includes('SECRET_MUST_NOT_LEAK'));
});
test('wrong rejection status never passes boundary checks', async () => {
  assert.equal((await run({ rejectStatus: 200 })).exitCode, 1);
});
test('no default live execution, no trusted input and unsafe mock/Production cannot call network', async () => {
  let called = false;
  const fetchImpl = () => { called = true; throw new Error(); };
  for (const options of [{}, { base: 'https://preview.invalid' }, { base: 'https://preview.invalid', live: true }, { base: 'https://production.invalid', environment: 'production', live: true, input }]) {
    assert.equal((await verify({ ...options, fetchImpl })).exitCode, 2);
  }
  assert.equal(called, false);
  assert.equal((await verify({ base: 'http://localhost', execution: 'fixture', input })).exitCode, 2);
});
test('HTTP contract success cannot assert live execution provenance or human acceptance', async () => {
  const result = await run({ execution: 'live' });
  assert.equal(result.exitCode, 2);
  assert.equal(result.results.at(-1).id, 'EXECUTION_PROVENANCE');
  assert.ok(Object.values(result.acceptance).every(value => value === 'PENDING'));
});

// Sanitized shape observed on the protected Preview; values below are synthetic.
function ssoHeaders(url) {
  const location = new URL('https://vercel.com/sso-api');
  location.searchParams.set('url', url.href);
  location.searchParams.set('nonce', 'SECRET_MUST_NOT_LEAK');
  return { server: 'Vercel', location: location.href,
    'set-cookie': '_vercel_sso_nonce=COOKIE_MUST_NOT_LEAK; Path=/; Secure; HttpOnly' };
}
for (const execution of ['fixture', 'live']) test(`validated SSO302 is BLOCKED in ${execution} scope without exposing credentials`, async () => {
  const result = await run({ execution, transport: url => new Response('BODY_MUST_NOT_LEAK', { status: 302, headers: ssoHeaders(url) }) });
  assert.equal(result.exitCode, 2);
  assert.equal(result.scope, execution === 'fixture' ? 'offline mock contract only' : 'preview HTTP contract');
  assert.ok(result.results.filter(r => r.id === 'PUBLIC_PAGE' || r.id.endsWith('_FEED') || ['UNCONNECTED', 'TWO_PHOTOS', 'SIXTEEN_PHOTOS', 'UNVERIFIED_SNAPSHOT'].includes(r.id))
    .every(r => r.status === 'BLOCKED' && r.detail.includes('VERCEL_SSO_REQUIRED')));
  assert.ok(result.results.filter(r => r.id.endsWith('_GENERATE')).every(r => r.status === 'PENDING'));
  assert.ok(Object.values(result.acceptance).every(value => value === 'PENDING'));
  assert.equal(result.calls.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /MUST_NOT_LEAK|sso-api|set-cookie/);
});
for (const [name, change, status = 302] of [
  ['missing location', h => { delete h.location; }],
  ['malformed location', h => { h.location = 'not a URL'; }],
  ['relative location', h => { h.location = '/sso-api'; }],
  ['unrelated redirect', h => { h.location = 'https://example.com/login'; }],
  ['lookalike host', h => { h.location = h.location.replace('vercel.com', 'vercel.com.evil.test'); }],
  ['HTTP destination', h => { h.location = h.location.replace('https:', 'http:'); }],
  ['credentialed destination', h => { h.location = h.location.replace('vercel.com', 'user:SECRET_MUST_NOT_LEAK@vercel.com'); }],
  ['wrong path', h => { h.location = h.location.replace('/sso-api?', '/login?'); }],
  ['fragment', h => { h.location += '#SECRET_MUST_NOT_LEAK'; }],
  ['wrong port', h => { h.location = h.location.replace('vercel.com', 'vercel.com:444'); }],
  ['missing Vercel server', h => { delete h.server; }],
  ['wrong server', h => { h.server = 'other'; }],
  ['missing nonce cookie', h => { delete h['set-cookie']; }],
  ['empty nonce cookie', h => { h['set-cookie'] = '_vercel_sso_nonce=; Path=/'; }],
  ['lookalike cookie', h => { h['set-cookie'] = 'fake_vercel_sso_nonce=SECRET_MUST_NOT_LEAK'; }],
  ['missing nonce', h => { const u = new URL(h.location); u.searchParams.delete('nonce'); h.location = u.href; }],
  ['empty nonce', h => { const u = new URL(h.location); u.searchParams.set('nonce', ''); h.location = u.href; }],
  ['wrong return URL', h => { const u = new URL(h.location); u.searchParams.set('url', 'https://other.invalid/'); h.location = u.href; }],
  ['duplicate return URL', h => { h.location += '&url=https://other.invalid/'; }],
  ['duplicate nonce', h => { h.location += '&nonce=other'; }],
  ['unobserved redirect status', () => {}, 307],
]) test(`${name} remains FAIL even with an authentication error body`, async () => {
  const result = await run({ transport: url => {
    const headers = ssoHeaders(url); change(headers);
    return new Response(JSON.stringify({ error: { code: 'PROFILE_NOT_VERIFIED', message: 'SECRET_MUST_NOT_LEAK' } }), { status, headers });
  } });
  assert.equal(result.exitCode, 1);
  assert.ok(result.results.some(r => r.status === 'FAIL'));
  assert.ok(!result.results.some(r => r.status === 'BLOCKED'));
  assert.doesNotMatch(JSON.stringify(result), /MUST_NOT_LEAK|sso-api|set-cookie/);
});
test('SSO on generation is BLOCKED without changing successful feed assertions', async () => {
  const result = await run({ transport: url => url.pathname === '/api/generate'
    ? new Response(null, { status: 302, headers: ssoHeaders(url) }) : null });
  assert.equal(result.exitCode, 2);
  assert.equal(result.results.filter(r => r.id.endsWith('_FEED') && r.status === 'PASS').length, 4);
  assert.equal(result.results.filter(r => r.status === 'BLOCKED').length, 8);
});
test('an arbitrary redirect still makes a mixed SSO report fail', async () => {
  const result = await run({ transport: url => new Response(null, { status: 302,
    headers: url.pathname === '/' ? { location: 'https://example.com/login' } : ssoHeaders(url) }) });
  assert.equal(result.exitCode, 1);
  assert.equal(result.results[0].status, 'FAIL');
  assert.ok(result.results.some(r => r.status === 'BLOCKED'));
});
