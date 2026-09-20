// #109 품질 계약 — 2026-09-19 실사진 평가가 남긴 네 가지 결함을 결정적 픽스처로 고정한다.
// 모델 호출 0회. 입력은 저장된 실제 vision 분석 15건(docs/specs/123-generation/acceptance.json)이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { orderFeed } from '../lib/order.js';
import { buildCurrentProfile } from '../lib/current_profile.js';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const vision = (await read('../docs/specs/123-generation/acceptance.json')).analyses.map(a => a.analysis);
const targetProfile = await read('../eval/golden/case_01/target_quiet.json');
const currentProfile = await read('../eval/golden/case_01/current_profile.json');
const feedOf = count => orderFeed({photoAnalyses: vision.slice(0, count).map((p, i) => ({...p, input_index: i})),
  targetProfile, currentProfile, now: '2026-09-18T00:00:00.000Z'});
// DoD 의 기계 탐지 식과 같다. 사용자 문장에 내부 계산 용어가 새면 실패한다.
const JARGON = /채도|밝기\s*0\.|색 거리|\bR[1-4]\b|측정값|#[0-9a-f]{6}\b|점수|임계|서사 규칙/;

for (const count of [3, 15]) test(`${count} real photos: every position carries a reason and no internal term`, () => {
  const feed = feedOf(count);
  assert.equal(feed.slots.length, count);
  for (const slot of feed.slots) {
    assert.doesNotMatch(slot.rationale.value, JARGON, `${slot.photo_id}`);
    // ① 이유를 말한 뒤 이유가 아니라고 덧붙이지 않는다. ④ 3장 경로도 "설명하기 어려워요"로 끝나지 않는다.
    assert.doesNotMatch(slot.rationale.value, /순서를 정한 근거는 아니|설명하기 어려워요|구분할 관측이 부족/);
    // 자리가 왜 이 자리인지 말하는 절이 반드시 하나 있다.
    assert.match(slot.rationale.value, /묶음을 열어요|흐름을 이어가요|분위기를 이어가요|분위기가 한 번 바뀌어요|차분하게 닫아요/);
    // [근거 보기] 는 여전히 측정값을 들고 있다 (P2 유지).
    assert.ok(slot.rationale.evidence.some(e => e.kind === 'uploaded_photo' && /밝기 [\d.]+/.test(e.note)),
      `${slot.photo_id}: 측정 근거가 사라졌다`);
    assert.ok(slot.rationale.evidence.some(e => e.kind === 'rule'));
  }
  // ④ 3장 묶음도 컨셉을 말한다. 범위가 좁으면 좁다고 말한다 — 임계값은 그대로다.
  assert.match(feed.concept.value, /흐름으로 엮어요/);
  assert.doesNotMatch(feed.concept.value, JARGON);
});

test('③ a wrong model observation cannot become a claim on screen', () => {
  const feed = feedOf(15);
  // 평가에서 확인된 실제 오류: ph_08 의 관측은 "양손으로" 인데 원본은 한 손이다.
  const wrong = vision.find(p => p.describable_facts.some(f => f.includes('양손')));
  assert.ok(wrong, '픽스처에 그 관측이 있어야 이 검사가 의미를 갖는다');
  for (const slot of feed.slots) {
    assert.doesNotMatch(slot.rationale.value, /양손/);
    for (const photo of vision.slice(0, 15)) for (const fact of photo.describable_facts)
      assert.ok(!slot.rationale.value.includes(fact), `${slot.photo_id} 자리가 모델 관측을 인용했다: ${fact}`);
  }
  // 관측 문장은 버리지 않는다 — 사실성을 보증할 수 있는 캡션 재료 자리에 그대로 남는다.
  const slot = feed.slots.find(s => s.photo_id === wrong.photo_id);
  assert.deepEqual(slot.caption_inputs.describable_facts, wrong.describable_facts);
});

test('① descriptions vary instead of repeating one sentence down the whole feed', () => {
  const values = feedOf(15).slots.map(s => s.rationale.value);
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  // 수정 전에는 고유 이유가 사실상 1개였다(인용을 뺀 뒤 12/15 슬롯이 글자 그대로 같았다).
  assert.ok(counts.size >= 10, `고유 문장 ${counts.size}/15`);
  assert.ok(Math.max(...counts.values()) <= 3, `같은 문장이 ${Math.max(...counts.values())}번 반복된다`);
});

test('⑤ a photo identical to one already placed never returns one slot later', () => {
  const feed = feedOf(15);
  const position = new Map(feed.slots.map(s => [s.photo_id, s.position]));
  const key = photo => `${photo.color.bright_mean}|${photo.color.sat_mean}|${photo.color.hue_mean}`;
  const groups = new Map();
  for (const photo of vision.slice(0, 15)) groups.set(key(photo), [...(groups.get(key(photo)) ?? []), photo.photo_id]);
  const pairs = [...groups.values()].filter(ids => ids.length > 1);
  assert.ok(pairs.length >= 2, '픽스처에 측정 색이 같은 쌍이 있어야 이 검사가 의미를 갖는다');
  for (const ids of pairs) {
    const at = ids.map(id => position.get(id)).sort((a, b) => a - b);
    for (let i = 1; i < at.length; i++)
      assert.notEqual(at[i] - at[i - 1], 2, `같은 화면이 ${at[i - 1]}·${at[i]}번으로 한 자리 건너 다시 나온다`);
  }
});
