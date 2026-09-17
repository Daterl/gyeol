// #12 F2 순서 제안 테스트.
// order.real20.json 은 실제 인스타 사진 20장을 #9 브랜치(feat/9-photo-analysis)의 분석기로 측정한
// PhotoAnalysis 20개다. 합성 카드가 아니라 실측값이며, 재현 방법은 docs/specs/12-order-proposal/report.md 2절에 있다.
// 골든 세트(eval/golden)는 15장 전부 밝기·채도·구성이 같은 합성 카드라서 순서 차이를 증명할 수 없어 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { orderFeed } from '../lib/order.js';
import { validateFeed, validatePhoto } from '../lib/contracts.js';
import { evaluate } from '../eval/invariants.js';

const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const photos20 = await read('test/order.real20.json');
const quiet = await read('eval/golden/case_01/target_quiet.json');
const detail = await read('eval/golden/case_01/target_detail.json');
const absentCurrent = await read('eval/golden/case_01/current_profile.json');
const presentCurrent = (await read('fixtures/current_profile.sample.json')).find(p => p.present);
const NOW = '2026-09-17T00:00:00.000Z';

const run = (photos, target = quiet, current = absentCurrent) =>
  orderFeed({ photoAnalyses: photos, targetProfile: target, currentProfile: current, now: NOW });
const byPosition = feed => [...feed.slots].sort((a, b) => a.position - b.position);
const orderOf = feed => byPosition(feed).map(slot => slot.photo_id);
const withIds = (photos, ids) => photos.filter(p => ids.includes(p.photo_id));

test('measured fixture itself satisfies the PhotoAnalysis contract', () => {
  assert.equal(photos20.length, 20);
  photos20.forEach(validatePhoto);
  assert.equal(new Set(photos20.map(p => p.photo_id)).size, 20);
  assert.ok(photos20.every(p => p.analysis_source === 'heuristic'));
});

// DoD: 입력 N장 = 출력 N슬롯, position 이 1..N 을 한 번씩.
for (const count of [3, 15, 20]) {
  test(`${count} photos produce ${count} slots covering positions 1..${count} exactly once`, () => {
    const input = photos20.slice(0, count);
    const feed = run(input);
    assert.equal(feed.slots.length, count);
    assert.deepEqual(byPosition(feed).map(s => s.position), Array.from({ length: count }, (_, i) => i + 1));
    assert.deepEqual([...orderOf(feed)].sort(), input.map(p => p.photo_id).sort());
    assert.deepEqual(feed.invariants, { input_count: count, output_count: count, unique_photo_ids: true });
    // 계약 검증기는 입력 사진 ID·프로필·분석 목록을 별도 인수로 받아 출력의 자기 신고를 믿지 않는다.
    validateFeed(feed, input.map(p => p.photo_id), absentCurrent, quiet, input);
  });
}

test('every eval invariant except the F3 export one passes on a generated feed', () => {
  const feed = run(photos20);
  const results = evaluate({ feed, inputPhotoIds: photos20.map(p => p.photo_id), targetProfile: quiet, currentProfile: absentCurrent, photoAnalyses: photos20 });
  for (const id of ['E1', 'E2', 'E3', 'E8', 'E9', 'E10', 'E11']) assert.equal(results[id].pass, true, `${id}: ${results[id].reason ?? ''}`);
});

// S1: 근거가 전부 kind:"rule" 인 슬롯이 0개여야 개인화다.
test('no slot is justified by rules alone, and every photo evidence resolves to its own slot', () => {
  const feed = run(photos20);
  const ids = new Set(photos20.map(p => p.photo_id));
  for (const slot of feed.slots) {
    const kinds = slot.rationale.evidence.map(e => e.kind);
    assert.ok(kinds.some(kind => kind !== 'rule'), `slot ${slot.position} is rule-only`);
    const own = slot.rationale.evidence.filter(e => e.kind === 'uploaded_photo');
    assert.equal(own.length, 1);
    assert.equal(own[0].ref, slot.photo_id);
    assert.ok(ids.has(own[0].ref));
    assert.match(slot.rationale.value, /밝기|채도|색/);
  }
});

// 반증된 값은 근거 문장에 등장하지 않는다 (spec.md 2절 W5·W6).
test('rationales never speak of scale, absent faces or "여백"', () => {
  const feed = run(photos20);
  const text = JSON.stringify(feed.slots);
  for (const forbidden of ['여백', '미드샷', '풀샷', '클로즈업', '얼굴이 없', '사람이 없']) assert.ok(!text.includes(forbidden), forbidden);
});

// S3: 프로필이 바뀌면 순서가 바뀐다. 같으면 프로필이 실제로는 안 쓰인 것이다.
test('two target profiles order the same photos differently', () => {
  const quietOrder = orderOf(run(photos20, quiet));
  const detailOrder = orderOf(run(photos20, detail));
  assert.notDeepEqual(quietOrder, detailOrder);
  assert.notEqual(quietOrder[0], detailOrder[0]);
  assert.deepEqual([...quietOrder].sort(), [...detailOrder].sort());
});

test('the same input produces byte-identical output', () => {
  assert.deepEqual(run(photos20), run(photos20));
  assert.equal(JSON.stringify(run(photos20.slice(0, 15))), JSON.stringify(run(photos20.slice(0, 15))));
});

// E8: 현재 프로필이 없는 것은 오류가 아니라 가장 흔한 정상 입력이다.
test('an absent current profile ends normally as target_only', () => {
  const applied = run(photos20).applied_profile;
  assert.equal(applied.current_profile_id, null);
  assert.equal(applied.disclosure, 'target_only');
  assert.equal(applied.corrected, false);
  assert.deepEqual(applied.deltas, []);
  assert.equal(applied.target_profile_id, quiet.profile_id);
});

test('a present current profile is reported but not yet used to correct', () => {
  const feed = run(photos20, quiet, presentCurrent);
  assert.equal(feed.applied_profile.current_profile_id, presentCurrent.profile_id);
  assert.equal(feed.applied_profile.disclosure, 'target_only');
  assert.deepEqual(feed.applied_profile.deltas, []);
  validateFeed(feed, photos20.map(p => p.photo_id), presentCurrent, quiet, photos20);
});

test('caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot', () => {
  const feed = run(photos20);
  const facts = new Map(photos20.map(p => [p.photo_id, p.describable_facts]));
  for (const slot of feed.slots) assert.deepEqual(slot.caption_inputs.describable_facts, facts.get(slot.photo_id));
  const peaks = feed.slots.filter(s => s.caption_inputs.is_visual_peak);
  assert.equal(peaks.length, 1);
  const mostSaturated = photos20.reduce((a, b) => (b.color.sat_mean > a.color.sat_mean ? b : a));
  assert.equal(peaks[0].photo_id, mostSaturated.photo_id);
  assert.equal(byPosition(feed)[0].caption_inputs.adjacent_overlap, 0);
  for (const slot of feed.slots) assert.ok(slot.caption_inputs.adjacent_overlap >= 0 && slot.caption_inputs.adjacent_overlap <= 1);
});

// A2: 캐러셀에서 배운 경향은 있으면 보태는 보너스일 뿐이고, 관측이 없으면 켜지지 않는다.
const tendencyTarget = (value, carousel) => {
  const copy = structuredClone(quiet);
  copy.sequence = { carousel_count: carousel };
  if (value) copy.sequence.opener_tendency = { value, confidence: 0.6, evidence: [{ kind: 'ig_post', ref: 'carousel_sample', note: `수집한 캐러셀 ${carousel}건의 1번 사진 최빈값` }] };
  return copy;
};
// 모델 경로를 흉내 낸 합성 입력: 휴리스틱은 has_face 를 항상 false 로 내므로 보너스 경로를 밟을 수 없다.
// ph_09 는 무보정 1위(ph_11)와 방향 점수 차가 0.081, ph_20 은 0.183 이다 — 보너스 상한 0.15 의 양쪽이다.
const faceSeen = id => photos20.map(p => (p.photo_id === id ? { ...p, has_face: true, analysis_source: 'vision_model', model: 'synthetic-for-test' } : p));

test('carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap', () => {
  const base = orderOf(run(photos20, tendencyTarget(null, 0)))[0];
  assert.equal(base, 'ph_11');
  assert.equal(orderOf(run(faceSeen('ph_09'), tendencyTarget('불명', 0)))[0], base, '불명 tendency must not move the opener');
  assert.equal(orderOf(run(faceSeen('ph_09'), tendencyTarget(null, 12)))[0], base, 'no tendency means no bonus');

  const nudged = run(faceSeen('ph_09'), tendencyTarget('인물', 12));
  assert.equal(orderOf(nudged)[0], 'ph_09', 'a close runner-up may be nudged ahead');
  const opener = byPosition(nudged)[0];
  assert.ok(opener.rationale.evidence.some(e => e.kind === 'ig_post'), 'the nudge must carry the carousel evidence');
  assert.match(opener.rationale.value, /캐러셀/);

  assert.equal(orderOf(run(faceSeen('ph_20'), tendencyTarget('인물', 12)))[0], base, 'the bonus must not flip a gap wider than itself');
  // 휴리스틱 사진의 scale 은 고정값이므로 풀샷 경향은 아무 사진에도 걸리지 않는다.
  assert.equal(orderOf(run(photos20, tendencyTarget('풀샷', 12)))[0], base);
});

// M1 회귀 (review-codex.md). 보너스가 2위 사진을 1위로 올렸는데도 "측정 점수가 가장 높다"고 말하면
// 사용자에게 보이는 문장이 선택의 실제 원인을 숨긴다. 보너스가 뒤집은 자리와 안 뒤집은 자리를 둘 다 고정한다.
test('a bonus that flipped the opener is named as the reason, not hidden behind the measurement', () => {
  const direction = photo => 0.4 * photo.color.bright_mean + 0.4 * (photo.composition === 'negative_space') + 0.2 * (1 - photo.color.sat_mean);
  const scoreOf = id => direction(photos20.find(p => p.photo_id === id));
  const top = photos20.reduce((a, b) => (direction(b) > direction(a) ? b : a));
  assert.equal(top.photo_id, 'ph_11', '전제: 무보너스 측정 1위는 ph_11 이다');

  // (a) 보너스가 순서를 뒤집은 자리 — 측정 1위가 아니라는 사실과 총점을 둘 다 말해야 한다.
  const flipped = byPosition(run(faceSeen('ph_09'), tendencyTarget('인물', 12)))[0];
  assert.equal(flipped.photo_id, 'ph_09');
  assert.ok(scoreOf('ph_09') < scoreOf('ph_11'), '전제: ph_09 의 측정 점수는 1위가 아니다');
  assert.match(flipped.rationale.value, /측정 점수는 0\.825 로 입력 20장 중 1위가 아니지만/);
  assert.match(flipped.rationale.value, /보너스 0\.15 를 더한 총점이 0\.975 로 가장 높아/);
  assert.ok(!/점수가 입력 20장 중 가장 높아/.test(flipped.rationale.value), '측정 점수가 1위였다고 말하면 안 된다');

  // (b) 보너스가 걸렸지만 측정 점수도 1위인 자리 — 이때는 1위 주장이 맞고, 보너스는 부수적 일치다.
  const alreadyTop = byPosition(run(faceSeen('ph_11'), tendencyTarget('인물', 12)))[0];
  assert.equal(alreadyTop.photo_id, 'ph_11');
  assert.match(alreadyTop.rationale.value, /측정 점수가 0\.906 로 입력 20장 중 가장 높아/);
  assert.match(alreadyTop.rationale.value, /보너스 0\.15 도 같은 방향이다/);

  // (c) 보너스가 없는 자리의 문장은 그대로다.
  assert.match(byPosition(run(photos20))[0].rationale.value, /지향 방향\(조용한 쪽\) 점수가 입력 20장 중 가장 높아 1번에 뒀다$/);
});

// H1 (review-codex.md). 이슈의 "사진만 입력" DoD 는 이 함수의 인수 계약이 아니다.
// orderFeed 는 targetProfile 없이는 거부한다 — 없는 지향 프로필을 지어내는 것이 E9 가 막는 바로 그 위조이기 때문이다.
// 이 테스트는 그 경계를 고정해서, 프로필을 주입한 테스트를 "사진만 입력 PASS" 로 다시 읽지 못하게 한다.
test('photo-only input is rejected here; the photo-only DoD belongs to the wiring layer', () => {
  assert.throws(() => orderFeed({ photoAnalyses: photos20 }), /targetProfile: expected object/);
  assert.throws(() => orderFeed({ photoAnalyses: photos20, targetProfile: null, currentProfile: absentCurrent }), /targetProfile: expected object/);
  // photo_id 보존 자체는 프로필이 주어진 경로에서 3~20장 전부 확인된다 (위 3·15·20장 테스트).
  for (const count of [3, 15, 20]) {
    const input = photos20.slice(0, count);
    assert.deepEqual([...orderOf(run(input))].sort(), input.map(p => p.photo_id).sort());
  }
});

test('rejects inputs the contract cannot accept instead of guessing', () => {
  assert.throws(() => run(photos20.slice(0, 2)), /3\.\.20/);
  assert.throws(() => run([...photos20, { ...photos20[0], input_index: 20 }]), /3\.\.20/);
  assert.throws(() => run([photos20[0], photos20[1], photos20[0]]), /duplicate/);
  assert.throws(() => orderFeed({ photoAnalyses: photos20, targetProfile: quiet }), /currentProfile|expected object/);
  assert.throws(() => orderFeed({ photoAnalyses: 'nope', targetProfile: quiet, currentProfile: absentCurrent }), /expected array/);
  assert.throws(() => run(withIds(photos20, ['ph_01', 'ph_02', 'ph_03']).map(p => ({ ...p, color: { ...p.color, bright_mean: 2 } }))), /0\.\.1/);
});
