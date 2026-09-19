// #109 자리 설명 계약. 2026-09-19 품질 평가 이후 계약이 바뀌었다:
// 화면 문장은 **우리가 픽셀에서 잰 값**만 말하고, 모델이 쓴 관측 문장(describable_facts)은
// 인용하지 않는다. 인용은 (a) 순서를 정한 근거가 아니어서 매번 "근거는 아니에요" 고지를 달아야 했고
// (b) 모델이 틀리면 제품이 대신 거짓말을 했다("양손으로 휴대폰" — 원본은 한 손).
// 관측 문장은 캡션 재료(caption_inputs.describable_facts)로 그대로 남는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { placementVoice } from '../lib/curation-voice.js';
import { orderFeed } from '../lib/order.js';
import { extractFromFreetext, planFromPhotos } from '../lib/target_profile.js';
import { buildCurrentProfile } from '../lib/current_profile.js';
import { buildFeed } from '../lib/pipeline.js';

const real = JSON.parse(await readFile(new URL('./order.real20.json', import.meta.url)));
// Synthetic observations: these test provenance, not a fresh model's visual accuracy.
const facts = ['갈색 가방이 보인다', '분홍색 신발이 놓여 있다', '흰 개가 앉아 있다'];
const fixture = count => real.slice(0, count).map((p, i) => ({...p,
  color: {...real[0].color}, analysis_source: 'vision_model', model: 'fixture',
  describable_facts: ['물체가 보인다', facts[i % facts.length]]
}));
const ROLES = ['opener', 'sustain', 'turn', 'closer'];
const tone = (photo, bright, sat) => ({...photo, color: {...photo.color, bright_mean: bright, sat_mean: sat}});

test('no model observation reaches the screen or the evidence, however alarming the prose', () => {
  const [a, b] = fixture(3);
  // 실사진 감사에서 실제로 나온 오류(한 손을 양손이라고 적음)와 노골적인 지어낸 문장을 함께 넣는다.
  const invented = ['양손으로 휴대폰을 들고 아래를 내려다보고 있다', '제주도에서 행복한 오후 R1 #ffffff'];
  for (const role of ROLES) {
    const voice = placementVoice({...b, describable_facts: invented}, {...a, describable_facts: invented},
      role, {...a, describable_facts: invented});
    for (const fact of invented) {
      assert.ok(!voice.value.includes(fact), `${role}: 화면 문장이 모델 관측을 인용했다`);
      assert.ok(!voice.evidence.some(e => e.note.includes(fact)), `${role}: 근거가 모델 관측을 실었다`);
    }
    assert.doesNotMatch(voice.value, /양손|제주|행복|오후|관측: /);
    // 인용을 하지 않으므로 "그 인용은 근거가 아니다"라는 고지도 필요 없다. 고지가 다시 생기면 실패한다.
    assert.doesNotMatch(voice.value, /순서를 정한 근거는 아니|구분할 관측이 부족/);
  }
});

test('every role states a reason, never an apology, even when the photos look alike', () => {
  const same = tone(real[0], .5, .3);
  for (const role of ROLES) {
    const voice = placementVoice(same, role === 'opener' ? null : same, role, same, {position: 2, count: 5});
    assert.ok(voice.value.trim().length > 0);
    // 같은 톤이면 "비슷한 톤"이라고 말한다. 없는 대비를 지어내지 않는다.
    assert.doesNotMatch(voice.value, /보다 환해지|보다 어두워지|색이 짙어지|색이 옅어지/);
    assert.ok(voice.evidence.some(e => e.kind === 'rule'), `${role}: 규칙 근거가 없다`);
  }
  assert.match(placementVoice(same, same, 'sustain', undefined, {position: 2, count: 5}).value, /비슷한 톤/);
  // 전환·마무리는 인접 비교가 아니라 자기 규칙이 자리를 정했으므로 그 규칙을 말한다.
  assert.match(placementVoice(same, same, 'turn').value, /색이 가장 짙어/);
  assert.match(placementVoice(same, same, 'closer').value, /가장 어두워/);
});

test('direction words follow the sign of the measured difference, on both axes', () => {
  const base = tone(real[0], .5, .5);
  const cases = [
    [.7, .5, /환해지면서/, /색/],
    [.3, .5, /어두워지면서/, /색/],
    [.5, .7, /색이 짙어지면서/, /환해|어두워/],
    [.5, .3, /색이 옅어지면서/, /환해|어두워/],
    [.7, .7, /환해지고 색도 짙어지면서/, /비슷한 톤/],
    [.3, .3, /어두워지고 색도 옅어지면서/, /비슷한 톤/],
    [.7, .3, /환해지고 색은 옅어지면서/, /비슷한 톤/],
    [.3, .7, /어두워지고 색은 짙어지면서/, /비슷한 톤/]
  ];
  for (const [bright, sat, expected, absent] of cases) {
    const voice = placementVoice(tone(real[1], bright, sat), base, 'sustain', undefined, {position: 2, count: 9});
    assert.match(voice.value, expected, `${bright}/${sat}`);
    assert.doesNotMatch(voice.value, absent, `${bright}/${sat}`);
    assert.ok(voice.evidence.some(e => e.ref === 'order.visible_step'));
  }
  // 임계 바로 아래는 변화라고 말하지 않는다. 경계값은 말한다.
  assert.doesNotMatch(placementVoice(tone(real[1], .619, .5), base, 'sustain', undefined, {position: 2, count: 9}).value, /환해지/);
  assert.match(placementVoice(tone(real[1], .62, .5), base, 'sustain', undefined, {position: 2, count: 9}).value, /환해지/);
});

test('the opener compares to the next photo it cites, and both measurements stay in evidence', () => {
  const [a, b] = real;
  const next = tone(b, a.color.bright_mean - .2, a.color.sat_mean);
  const voice = placementVoice(a, null, 'opener', next);
  assert.match(voice.value, /다음 장보다 환해지면서 묶음을 열어요/);
  assert.deepEqual(new Set(voice.evidence.filter(e => e.kind === 'uploaded_photo').map(e => e.ref)),
    new Set([a.photo_id, next.photo_id]));
  assert.ok(voice.evidence.some(e => e.ref === 'order.visible_step'));
  const alone = placementVoice(a, null, 'opener');
  assert.ok(alone.evidence.some(e => e.ref === 'order.placement_limit'));
  assert.doesNotMatch(alone.value, /다음 장/);
});

// 같은 역할이 묶음의 대부분을 차지하면 같은 문구가 반복된다. 자리가 묶음의 어디쯤인지는
// 슬롯이 이미 들고 있는 값이므로 새 주장 없이 문구를 가를 수 있다.
test('the sustain clause tracks where the slot sits, and identical inputs stay deterministic', () => {
  const base = tone(real[0], .5, .3), later = tone(real[1], .5, .3);
  const said = [2, 5, 8].map(position => placementVoice(later, base, 'sustain', undefined, {position, count: 9}).value);
  assert.equal(new Set(said).size, 3, said.join(' | '));
  assert.match(said[0], /초반/); assert.match(said[1], /중간/); assert.match(said[2], /마무리로 가는/);
  // 같은 입력은 같은 문장이다. input_index 같은 배열 위치는 문장을 바꾸지 않는다.
  assert.deepEqual(placementVoice({...later, input_index: 999}, base, 'sustain', undefined, {position: 2, count: 9}),
    placementVoice(later, base, 'sustain', undefined, {position: 2, count: 9}));
});

for (const count of [3, 15]) test(`${count}-photo fixture keeps order, caption inputs and inputs untouched by observations`, () => {
  const photos = fixture(count), before = structuredClone(photos);
  for (const targetProfile of [extractFromFreetext('조용하고 담백하게'), planFromPhotos(photos)]) {
    const run = photoAnalyses => orderFeed({photoAnalyses, targetProfile,
      currentProfile: buildCurrentProfile(), now: '2026-09-18T00:00:00.000Z'});
    const feed = run(photos);
    const withoutFacts = run(photos.map(p => ({...p, describable_facts: []})));
    // 관측 문장은 순서에도 자리 설명에도 쓰이지 않는다 — 통째로 지워도 결과가 같아야 한다.
    assert.deepEqual(feed.slots.map(s => [s.photo_id, s.position, s.narrative_role, s.rationale.value]),
      withoutFacts.slots.map(s => [s.photo_id, s.position, s.narrative_role, s.rationale.value]));
    const ordered = feed.slots.map(s => photos.find(p => p.photo_id === s.photo_id));
    for (const [i, slot] of feed.slots.entries()) {
      const own = ordered[i], adjacent = ordered[i === 0 ? 1 : i - 1];
      for (const fact of own.describable_facts) assert.ok(!slot.rationale.value.includes(fact));
      // 두 사진의 측정 근거는 남는다 (P2). 관측 문장은 캡션 재료로만 남는다.
      // 자기 사진의 측정은 rationale 이 이미 실은 note 로, 인접 사진의 측정은 voice 가 실은 note 로 남는다.
      for (const p of [own, adjacent]) assert.ok(slot.rationale.evidence.some(e =>
        e.kind === 'uploaded_photo' && e.ref === p.photo_id && /밝기 [\d.]+ · 채도 [\d.]+/.test(e.note)),
        `${slot.photo_id} 자리에 ${p.photo_id} 측정 근거가 없다`);
      assert.deepEqual(slot.caption_inputs.describable_facts, own.describable_facts);
    }
  }
  assert.deepEqual(photos, before);
});

test('archived real analyses flow through buildFeed without promoting one observation to the screen', async () => {
  const archive = JSON.parse(await readFile(new URL('../docs/specs/101-caption-quality/audit-analyses.json', import.meta.url)));
  const recovered = JSON.parse(await readFile(new URL('../docs/specs/101-caption-quality/recovered-analysis.json', import.meta.url)));
  const all = archive.map((item, i) => {
    if (item.ok) return item.a;
    assert.ok(item.file.endsWith(recovered.analysis.file_ref));
    return {...recovered.analysis, photo_id: `ph_${String(i + 1).padStart(2, '0')}`};
  });
  for (const count of [3, 15]) {
    const photos = all.slice(0, count), before = structuredClone(photos);
    const {feed, context} = await buildFeed({schema_version:'1.0',session_id:'placement-archive',photos,
      identity:{target:{kind:'text',text:'조용하고 담백하게'},current:{kind:'none'}}});
    for (const slot of feed.slots) {
      const own = photos.find(p => p.photo_id === slot.photo_id);
      assert.deepEqual(slot.caption_inputs.describable_facts, own.describable_facts);
      for (const photo of photos) for (const fact of photo.describable_facts)
        assert.ok(!slot.rationale.value.includes(fact), `${slot.photo_id}: ${fact}`);
      assert.ok(slot.rationale.evidence.some(e => e.kind === 'uploaded_photo' && e.ref === slot.photo_id));
    }
    assert.deepEqual(context.photos, before);
    assert.deepEqual(photos, before);
  }
});
