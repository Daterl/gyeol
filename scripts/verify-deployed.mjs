#!/usr/bin/env node
/**
 * 배포된 제품이 실제로 동작하는지 확인한다.
 *
 * 로컬 통과는 증거가 아니다. 투표자가 보는 것은 배포된 것 하나뿐이고,
 * 우리는 Production 이 50 커밋 뒤처진 채 돌고 있는 것을 뒤늦게 발견한 적이 있다.
 *
 * 사용법:  node scripts/verify-deployed.mjs [BASE_URL]
 *          npm run verify:deployed
 * 판정 기준은 docs/intent.md 4-3 절의 D1~D6 이다.
 * 실패가 하나라도 있으면 종료 코드 1 을 낸다.
 */
import { readFile } from 'node:fs/promises';
import { validateFeedResponse, validateGenerateRequest, validateGenerateResponse } from '../lib/interaction.js';

const BASE = (process.argv[2] || process.env.GYEOL_DEPLOY_URL || 'https://project-7klb1.vercel.app').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.GYEOL_VERIFY_TIMEOUT_MS || 30000);

const results = [];
const record = (id, what, ok, detail) => { results.push({ id, what, status: ok === 'SKIP' ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail }); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const responseDetail = r => `status=${r.status}${r.error ? ` error=${r.error}` : ''} (${r.ms}ms)\n${r.text}`;
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const visionCases = JSON.parse(await readFile(new URL('../docs/specs/101-caption-quality/inputs.json', import.meta.url), 'utf8'));
const visionPhotos = visionCases.find(item => item.name === 'photos_only')?.request?.context?.photos ?? [];

async function fetchWithTimeout(path, init = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, { ...init, signal: ac.signal, redirect: 'manual' });
    const text = await res.text().catch(() => '');
    return { status: res.status, text, ms: Date.now() - started, location: res.headers.get('location') };
  } catch (e) {
    return { status: 0, text: '', ms: Date.now() - started, error: String(e?.name || e) };
  } finally { clearTimeout(timer); }
}

// D1 — 공개 URL 이 로그인 없이 열린다
async function d1() {
  const r = await fetchWithTimeout('/');
  const redirectedToLogin = r.location && /vercel\.com\/sso|login|auth/i.test(r.location);
  record('D1', '공개 URL 이 로그인 없이 열린다',
    r.status === 200 && !redirectedToLogin,
    `status=${r.status}${r.location ? ` location=${r.location.slice(0, 60)}` : ''} (${r.ms}ms)`);
}

// D3 — 기존 계약 fixture의 분석된 사진으로 실제 POST 경로를 실행한다.
async function feedShape() {
  if (visionPhotos.length !== 15 || visionPhotos.some(photo => photo.analysis_source !== 'vision_model')) {
    record('D3', '실사진 vision 분석 15장을 사용한다', false, `vision_model ${visionPhotos.filter(photo => photo.analysis_source === 'vision_model').length}/${visionPhotos.length}`);
    return null;
  }
  const r = await fetchWithTimeout('/api/feed', post({
    schema_version: '1.0', session_id: 'verify-deployed',
    photos: visionPhotos,
    identity: { target: { kind: 'none' }, current: { kind: 'none' } },
  }));
  if (r.status !== 200) {
    record('D3', 'POST 피드 응답 200', false, responseDetail(r));
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(r.text);
    validateFeedResponse(parsed);
  } catch (e) {
    record('D3', '피드 응답이 JSON·계약을 만족한다', false, `${e.message}\n${responseDetail(r)}`);
    return null;
  }
  record('D3', 'POST 피드 응답이 JSON·계약을 만족한다', true, `status=200 (${r.ms}ms)`);
  const slots = parsed.feed.slots;
  const positions = slots.map(s => s.position);
  const expected = Array.from({ length: slots.length }, (_, i) => i + 1);
  record('D3', 'position 이 1..N 을 한 번씩',
    slots.length > 0 && JSON.stringify([...positions].sort((a, b) => a - b)) === JSON.stringify(expected),
    `슬롯 ${slots.length}개`);
  const withEvidence = slots.filter(s => (s.rationale?.evidence ?? []).length > 0);
  record('D3', '자리마다 근거가 있다', slots.length > 0 && withEvidence.length === slots.length,
    `${withEvidence.length}/${slots.length} 슬롯에 근거`);
  return parsed;
}

// D4/D5 — 피드의 순서·근거와 문장 생성 결과를 혼동하지 않는다.
async function generation(feedResponse) {
  if (!feedResponse) {
    for (const id of ['D4', 'D5']) record(id, '문장 생성 판정', false, 'POST /api/feed 실패로 생성 요청을 실행하지 못했다.');
    return;
  }
  const request = { schema_version: '1.0', mode: 'all', feed: feedResponse.feed, context: feedResponse.context };
  validateGenerateRequest(request); // mode:all 에 photo_id 를 넣지 않는다.
  const r = await fetchWithTimeout('/api/generate', post(request));
  let parsed;
  try { parsed = JSON.parse(r.text); } catch { /* 원문을 아래 실패 판정에 보존한다. */ }
  if (r.status === 503 && parsed?.error?.code === 'GENERATION_UNAVAILABLE') {
    for (const id of ['D4', 'D5']) record(id, '문장 생성 판정', 'SKIP',
      `배포 환경에 API 키가 없다 (ANTHROPIC_API_KEY 미설정). 기능 검증 미실행.\n${responseDetail(r)}`);
    return;
  }
  if (r.status !== 200) {
    for (const id of ['D4', 'D5']) record(id, 'POST 문장 생성 응답 200', false, responseDetail(r));
    return;
  }
  const output = parsed?.output;
  const title = output?.title;
  record('D4', '타이틀이 정확히 1줄',
    nonempty(title) && !/[\r\n\u2028\u2029]/u.test(title),
    `title=${JSON.stringify(title ?? null)}`);
  const slots = Array.isArray(output?.slots) ? output.slots : [];
  const seeded = slots.filter(s => s?.caption_state === 'seed' && nonempty(s.text));
  const empty = slots.filter(s => s?.caption_state === 'omitted');
  const emptyWithReason = empty.filter(s => nonempty(s.omit_reason));
  record('D5', '일부에는 쓸 거리를 제안하고 일부는 비운다', seeded.length > 0 && empty.length > 0,
    `쓸 거리 ${seeded.length} / 비움 ${empty.length}`);
  record('D5', '비운 자리에 모두 omit_reason 이 붙는다',
    empty.length > 0 && emptyWithReason.length === empty.length,
    `${emptyWithReason.length}/${empty.length} 비움 슬롯에 이유`);
  try {
    validateGenerateResponse(parsed, request);
    record('D4/D5', '생성 응답이 사진·슬롯 계약을 만족한다', true, `status=200 (${r.ms}ms)`);
  } catch (e) {
    record('D4/D5', '생성 응답이 사진·슬롯 계약을 만족한다', false, `${e.message}\n${responseDetail(r)}`);
  }
}

// 라우트가 배포됐는가 — 404 는 라우트 자체가 없다는 뜻이다
async function routes() {
  for (const p of ['/api/analyze', '/api/generate']) {
    const r = await fetchWithTimeout(p);
    record('ROUTE', `${p} 라우트가 배포돼 있다`, r.status !== 404, `status=${r.status}`);
  }
}

// D2 — 첫 화면이 빠르게 뜬다 (샘플 원클릭 전체 경로는 브라우저 검증 몫)
async function d2() {
  const r = await fetchWithTimeout('/');
  record('D2', '첫 화면 응답이 30초 안', r.status === 200 && r.ms < 30000, `${r.ms}ms`);
}

const started = Date.now();
console.log(`대상: ${BASE}\n`);
await d1();
await d2();
await generation(await feedShape());
await routes();

const pad = s => String(s).padEnd(5);
let failed = 0;
let skipped = 0;
for (const r of results) {
  if (r.status === 'FAIL') failed++;
  if (r.status === 'SKIP') skipped++;
  console.log(`${r.status} ${pad(r.id)} ${r.what}\n      ${r.detail}`);
}
console.log(`\n${results.length - failed - skipped}/${results.length} 통과, SKIP ${skipped}건, FAIL ${failed}건 (${Date.now() - started}ms)`);
if (skipped) console.log('SKIP 은 통과가 아니다. 배포 환경에 API 키를 설정한 뒤 D4·D5 를 다시 검증해야 한다.');
if (failed) {
  console.log(`\n실패 ${failed}건. 배포된 제품이 판정 기준을 만족하지 않는다.`);
  console.log('로컬에서 통과했더라도 배포가 오래됐을 수 있다 — Production ref 를 develop 과 대조하라.');
}
process.exit(failed ? 1 : 0);
