#!/usr/bin/env node
// ADR-0008 HTTP contract evidence. No default deployment and no implicit paid calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateFeedResponse, validateGenerateResponse } from '../lib/interaction.js';

export const MATRIX = [3, 15].flatMap(count => ['', '사진의 분위기를 짧고 담백하게 기록해 줘'].map(prompt => ({ count, prompt })));
const knownErrors = new Set(['INVALID_REQUEST', 'PROFILE_NOT_VERIFIED', 'PROFILE_SNAPSHOT_EXPIRED', 'PROFILE_RESOLVER_UNAVAILABLE', 'GENERATION_UNAVAILABLE', 'MODEL_HTTP', 'MODEL_TIMEOUT', 'RATE_LIMITED', 'LIVE_NOT_IMPLEMENTED']);
const sameIds = (actual, expected) => assert.deepEqual([...actual].sort(), [...expected].sort());
const ownEvidence = slot => assert.ok((slot.evidence ?? slot.rationale?.evidence)?.some(e => e.kind === 'uploaded_photo' && e.ref === slot.photo_id), 'own-photo evidence missing');

export function makeRequest(input, count, prompt) {
  assert.equal(input.photos?.length, 15, '15 existing photo analyses required; no invented extra photo');
  assert.equal(new Set(input.photos.map(photo => photo.photo_id)).size, 15, 'unique photo IDs required');
  assert.ok(input.profile_snapshot_id && typeof input.profile_snapshot_id === 'string', 'trusted snapshot reference required');
  const url = new URL(input.profile_url);
  assert.ok(url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) && !url.username && !url.password && /^\/[\w.]+\/?$/.test(url.pathname), 'public profile URL required');
  assert.ok(typeof input.session_id === 'string' && input.session_id.length > 0, 'original analysis session required');
  return { schema_version: '1.0', session_id: input.session_id, profile_url: input.profile_url,
    profile_snapshot_id: input.profile_snapshot_id, photos: input.photos.slice(0, count), prompt };
}

export function checkFeed(value, request, now = Date.now()) {
  validateFeedResponse({ feed: value.feed, context: value.context });
  const ids = request.photos.map(photo => photo.photo_id);
  sameIds(value.feed.slots.map(slot => slot.photo_id), ids);
  // The server authenticates duplicate flags; those may legitimately be removed/recomputed.
  const observed = photos => photos.map(photo => ({ ...photo, quality_flags: photo.quality_flags.filter(flag => !flag.startsWith('duplicate_of:')) }));
  assert.deepEqual(observed(value.context.photos), observed(request.photos), 'photo observations changed');
  value.feed.slots.forEach(ownEvidence);
  // Curation provenance is checked separately from legacy feed/context validation.
  assert.ok(value.curation, 'ADR-0008 curation response unsupported');
  sameIds(value.curation.slots.map(slot => slot.photo_id), ids);
  assert.ok(value.curation.slots.every(slot => slot.included === true), 'default inclusion required');
  const curation = value.curation;
  assert.equal(curation.schema_version, '1.0');
  assert.equal(curation.profile_snapshot_id, request.profile_snapshot_id);
  assert.equal(curation.profile.ownership_verified, false);
  assert.ok(typeof curation.profile.snapshot_id === 'string' && curation.profile.snapshot_id.length > 0);
  const handle = url => new URL(url).pathname.replaceAll('/', '').toLowerCase();
  const source = new URL(curation.profile.source_url);
  assert.ok(source.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(source.hostname));
  assert.equal(handle(source), handle(request.profile_url));
  const collected = Date.parse(curation.profile.collected_at);
  const expires = Date.parse(curation.profile.expires_at);
  assert.ok(Number.isFinite(collected) && collected <= now && now < expires, 'snapshot must be current');
  assert.ok(expires - collected <= 24 * 60 * 60 * 1000, 'snapshot exceeds 24-hour window');
  assert.ok(curation.profile.evidence_refs && typeof curation.profile.evidence_refs === 'object' && !Array.isArray(curation.profile.evidence_refs));
  assert.ok(Object.keys(curation.profile.evidence_refs).length > 0);
  const prompt = request.prompt.trim();
  assert.equal(curation.prompt.text, prompt || null);
  if (prompt) {
    assert.equal(value.context.target.raw_freetext, prompt);
    assert.ok(curation.prompt.evidence.some(e => e.kind === 'user_text' && e.ref === value.context.target.profile_id));
  } else {
    assert.equal(value.context.target.source, 'ig_reference');
    assert.deepEqual(curation.prompt.evidence, []);
  }
  for (const slot of curation.slots) {
    assert.equal(slot.position, value.feed.slots.find(s => s.photo_id === slot.photo_id).position);
    assert.equal(typeof slot.exclusion_candidate.recommended, 'boolean');
    assert.ok(Array.isArray(slot.exclusion_candidate.evidence));
    if (slot.exclusion_candidate.recommended) {
      assert.ok(typeof slot.exclusion_candidate.reason === 'string' && slot.exclusion_candidate.reason.trim());
      ownEvidence({ ...slot, evidence: slot.exclusion_candidate.evidence });
    } else assert.equal(slot.exclusion_candidate.reason, null);
  }
}

export function checkGeneration(value, request) {
  validateGenerateResponse(value, request);
  const slots = request.mode === 'all' ? value.output.slots : [value.slot];
  slots.forEach(ownEvidence);
  // Zero omissions and all omissions are both legal; validate each returned state/reason.
}

// Classify only the observed Vercel protection challenge, never follow it.
// These are diagnostic response signals, not proof that a user authenticated.
function isVercelSsoChallenge(response, requestedUrl) {
  if (response.status !== 302 || response.headers.get('server')?.toLowerCase() !== 'vercel') return false;
  try {
    const destination = new URL(response.headers.get('location'));
    return destination.origin === 'https://vercel.com' && destination.pathname === '/sso-api'
      && !destination.username && !destination.password && !destination.hash
      && destination.searchParams.getAll('url').length === 1
      && destination.searchParams.get('url') === requestedUrl.href
      && destination.searchParams.getAll('nonce').length === 1
      && !!destination.searchParams.get('nonce')?.trim()
      && response.headers.getSetCookie().some(cookie => /^_vercel_sso_nonce=[^;\s]+(?:;|$)/.test(cookie));
  } catch { return false; }
}

export async function verify({ base, input, live = false, environment = 'local', execution = 'live', fetchImpl = fetch, timeoutMs = 30000, metadata = {}, now = Date.now } = {}) {
  const results = [];
  const record = (id, status, detail) => results.push({ id, status, detail });
  const report = { scope: execution === 'fixture' ? 'offline mock contract only' : `${environment} HTTP contract`,
    started_at: new Date(now()).toISOString(), metadata: { sha: metadata.sha ?? null, model_id: metadata.model_id ?? null,
      tokens: metadata.tokens ?? null, cost: metadata.cost ?? null, input_source: metadata.input_source ?? null,
      cache: metadata.cache ?? null, evidence_origin: 'operator-supplied; not execution proof' }, results,
    acceptance: { actual_vision_analysis: 'PENDING', real_model_execution: 'PENDING', human_quality: 'PENDING', physical_mobile: 'PENDING', production: 'PENDING' } };
  const finish = () => ({ ...report, exitCode: results.some(r => r.status === 'FAIL') ? 1 : results.some(r => r.status === 'PENDING' || r.status === 'BLOCKED') ? 2 : 0 });
  if (!base) { record('INPUT', 'PENDING', 'Explicit target URL required; no default Production target.'); return finish(); }
  let target;
  try { target = new URL(base); assert.ok(['http:', 'https:'].includes(target.protocol)); assert.ok(!target.username && !target.password && !target.search && !target.hash); }
  catch { record('INPUT', 'BLOCKED', 'Invalid target URL (credentials/query/fragment prohibited).'); return finish(); }
  if (!['local', 'preview', 'production'].includes(environment) || !['live', 'fixture'].includes(execution)) {
    record('INPUT', 'BLOCKED', 'Explicit supported environment/execution required.'); return finish();
  }
  if (execution === 'fixture' && fetchImpl === fetch) {
    record('INPUT', 'BLOCKED', 'Mock execution requires an injected offline transport, never a live endpoint.'); return finish();
  }
  if (!live && execution !== 'fixture') { record('LIVE', 'PENDING', 'Live matrix not requested; no network/model/profile calls made.'); return finish(); }
  if (environment === 'production') { record('LIVE', 'BLOCKED', 'Production matrix disabled; use separately authorized acceptance.'); return finish(); }
  try { makeRequest(input, 15, ''); }
  catch { record('INPUT', 'BLOCKED', 'Missing/invalid trusted input: existing server snapshot reference, public profile URL, session ID and 15 unique analyses required.'); return finish(); }
  const request = async (path, body) => {
    const start = Date.now();
    try {
      const requestedUrl = new URL(path, target);
      const response = await fetchImpl(requestedUrl, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      let value;
      try { value = await response.json(); } catch { /* Never print raw responses: may contain private input or credentials. */ }
      return { status: response.status, value, vercelSso: isVercelSsoChallenge(response, requestedUrl), ms: Date.now() - start };
    } catch { return { status: 0, ms: Date.now() - start }; }
  };
  const statusDetail = response => `HTTP ${response.status}; code=${knownErrors.has(response.value?.error?.code) ? response.value.error.code : 'UNRECOGNIZED_OR_ABSENT'}; ${response.ms}ms${response.vercelSso ? '; authentication=VERCEL_SSO_REQUIRED (redirect withheld; not followed)' : ''}`;
  const blocked = response => response.status >= 300 && response.status < 400 ? response.vercelSso : [0, 401, 403, 429, 502, 503, 504].includes(response.status)
    || ['PROFILE_NOT_VERIFIED', 'PROFILE_SNAPSHOT_EXPIRED', 'PROFILE_RESOLVER_UNAVAILABLE'].includes(response.value?.error?.code);
  const expect = (id, response, check) => {
    try { check(); record(id, 'PASS', statusDetail(response)); return true; }
    catch { record(id, blocked(response) ? 'BLOCKED' : 'FAIL', `${statusDetail(response)}; contract mismatch/unsupported response (payload withheld)`); return false; }
  };
  const page = await request('/');
  expect('PUBLIC_PAGE', page, () => assert.equal(page.status, 200));
  const valid = makeRequest(input, 3, '');
  const missing = { ...valid }; delete missing.profile_snapshot_id;
  const sixteen = { ...valid, photos: [...input.photos, { ...input.photos[0], photo_id: 'verify_boundary_16', input_index: 15 }] };
  // The synthetic 16th item is rejection-only; never used as model/quality evidence.
  for (const [id, body, status, code] of [['UNCONNECTED', missing, 400, 'INVALID_REQUEST'], ['TWO_PHOTOS', { ...valid, photos: input.photos.slice(0, 2) }, 400, 'INVALID_REQUEST'], ['SIXTEEN_PHOTOS', sixteen, 400, 'INVALID_REQUEST'], ['UNVERIFIED_SNAPSHOT', { ...valid, profile_snapshot_id: 'invalid-verifier-reference' }, 422, 'PROFILE_NOT_VERIFIED']]) {
    const response = await request('/api/feed', body);
    expect(id, response, () => { assert.equal(response.status, status); assert.equal(response.value?.error?.code, code); });
  }
  for (const { count, prompt } of MATRIX) {
    const id = `${count}_${prompt ? 'written' : 'blank'}`;
    const body = makeRequest(input, count, prompt);
    const feed = await request('/api/feed', body);
    if (!expect(`${id}_FEED`, feed, () => { assert.equal(feed.status, 200); checkFeed(feed.value, body, now()); })) {
      record(`${id}_GENERATE`, 'PENDING', 'Feed contract unavailable; all/slot not executed.'); continue;
    }
    for (const mode of ['all', 'slot']) {
      const generation = { schema_version: '1.0', mode, feed: feed.value.feed, context: feed.value.context,
        ...(mode === 'slot' ? { photo_id: feed.value.feed.slots[0].photo_id } : {}) };
      const response = await request('/api/generate', generation);
      expect(`${id}_${mode}`, response, () => { assert.equal(response.status, 200); checkGeneration(response.value, generation); });
    }
  }
  if (execution !== 'fixture') record('EXECUTION_PROVENANCE', 'PENDING', 'HTTP shapes do not prove model ID, fresh vision analysis, usage/cost or cache source; attach independent execution evidence.');
  return finish();
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live') options.live = true;
    else if (['--input', '--environment', '--metadata'].includes(args[i]) && args[i + 1]) options[args[i].slice(2)] = args[++i];
    else if (!args[i].startsWith('-') && !options.base) options.base = args[i];
    else throw new Error('Usage: verify-deployed.mjs URL --environment local|preview --input FILE [--metadata FILE] [--live]');
  }
  for (const name of ['input', 'metadata']) if (options[name]) options[name] = JSON.parse(await readFile(options[name], 'utf8'));
  const report = await verify(options);
  console.log(JSON.stringify(report, null, 2));
  return report.exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(); }
  catch { console.error('BLOCKED: invalid options or unreadable input/metadata file; input contents withheld.'); process.exitCode = 2; }
}
