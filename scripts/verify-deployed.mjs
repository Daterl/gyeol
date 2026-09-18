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
const BASE = (process.argv[2] || process.env.GYEOL_DEPLOY_URL || 'https://project-7klb1.vercel.app').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.GYEOL_VERIFY_TIMEOUT_MS || 30000);

const results = [];
const record = (id, what, ok, detail) => { results.push({ id, what, ok, detail }); };

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

// D3/D4/D5 — 피드 응답이 계약대로 오는가
async function feedShape() {
  const r = await fetchWithTimeout('/api/feed?mock=1');
  if (r.status !== 200) {
    record('D3', '피드 응답 200', false, `status=${r.status}`);
    return null;
  }
  let parsed;
  try { parsed = JSON.parse(r.text); }
  catch (e) {
    // 배포가 오래되면 타입 설명 문자열이 온 적이 있다. 그때 이 검사가 잡는다.
    record('D3', '피드 응답이 유효한 JSON', false,
      `JSON 파싱 실패: ${String(e.message).slice(0, 60)} | 본문 앞부분: ${r.text.slice(0, 60).replace(/\s+/g, ' ')}`);
    return null;
  }
  record('D3', '피드 응답이 유효한 JSON', true, `${r.ms}ms`);
  const feed = parsed.feed ?? parsed;
  const slots = feed.slots ?? [];

  const positions = slots.map(s => s.position);
  const expected = Array.from({ length: slots.length }, (_, i) => i + 1);
  record('D3', 'position 이 1..N 을 한 번씩',
    slots.length > 0 && JSON.stringify([...positions].sort((a, b) => a - b)) === JSON.stringify(expected),
    `슬롯 ${slots.length}개`);

  const withEvidence = slots.filter(s => (s.rationale?.evidence ?? []).length > 0);
  record('D3', '자리마다 근거가 있다', slots.length > 0 && withEvidence.length === slots.length,
    `${withEvidence.length}/${slots.length} 슬롯에 근거`);

  const title = feed.title;
  record('D4', '타이틀이 정확히 1줄',
    typeof title === 'string' && title.trim().length > 0 && !title.includes('\n'),
    `title=${JSON.stringify(String(title ?? '').slice(0, 40))}`);

  const filled = slots.filter(s => (s.caption?.text ?? '').trim().length > 0);
  const empty = slots.filter(s => !(s.caption?.text ?? '').trim());
  const emptyWithReason = empty.filter(s => (s.caption?.rationale ?? s.caption?.reason ?? s.caption?.evidence));
  record('D5', '일부는 채우고 일부는 비운다',
    slots.length > 0 && filled.length > 0 && empty.length > 0,
    `채움 ${filled.length} / 비움 ${empty.length}`);
  record('D5', '비운 자리에 이유가 붙는다',
    empty.length === 0 || emptyWithReason.length === empty.length,
    `${emptyWithReason.length}/${empty.length} 비움 슬롯에 이유`);

  return feed;
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
await feedShape();
await routes();

const pad = s => String(s).padEnd(5);
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${pad(r.id)} ${r.what}\n      ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} 통과 (${Date.now() - started}ms)`);
if (failed) {
  console.log(`\n실패 ${failed}건. 배포된 제품이 판정 기준을 만족하지 않는다.`);
  console.log('로컬에서 통과했더라도 배포가 오래됐을 수 있다 — Production ref 를 develop 과 대조하라.');
}
process.exit(failed ? 1 : 0);
