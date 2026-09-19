import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bundleConcept, placementVoice } from '../lib/curation-voice.js';
import { buildFeed } from '../lib/pipeline.js';
import { validateFeed } from '../lib/contracts.js';
import { planFromPhotos } from '../lib/target_profile.js';
import { buildCurrentProfile } from '../lib/current_profile.js';
const photos = JSON.parse(await readFile(new URL('./order.real20.json', import.meta.url)));
const photo = (bright, sat, id='ph_01') => ({...photos[0],photo_id:id,color:{...photos[0].color,bright_mean:bright,sat_mean:sat}});
const absentCurrent = buildCurrentProfile();
const forbidden = /채도|밝기\s*0\.|색 거리|\bR[1-4]\b|측정값|#[0-9a-f]{6}\b/;

test('concept reads the even side below the boundary, the contrast at it, and preserves every source', () => {
  // 임계 미달도 잰 것이다 — 범위가 좁다는 관측을 말한다(#109 실사진 3장 감사). 임계값은 그대로다.
  assert.match(bundleConcept([photo(.5,.2),photo(.5,.449)]).value,/톤이 고르게/);
  assert.match(bundleConcept([photo(.5,.25),photo(.5,.5)]).value,/옅은 색과 짙은 색/);
  const set = [photo(.25,.2),photo(.5,.2,'ph_02')];
  const concept = bundleConcept(set);
  assert.match(concept.value,/밝고 어두운/);
  assert.deepEqual(concept.evidence.filter(e=>e.kind==='uploaded_photo').map(e=>e.ref),['ph_01','ph_02']);
  assert.doesNotMatch(concept.value,forbidden);
});

test('identical images never claim an unsupported visual change, including turn', () => {
  const same=photo(.5,.3);
  for(const role of ['sustain','turn','closer']) {
    const voice=placementVoice(same,same,role);
    assert.doesNotMatch(voice.value,/앞 장보다|변화를/);
    assert.doesNotMatch(voice.value,forbidden);
  }
});

test('adjacent comparison carries actual previous photo evidence, ignores untrusted prose', () => {
  const previous=photo(.2,.2,'ph_02');
  const next={...photo(.5,.2),describable_facts:['제주도에서 행복한 오후 R1 #ffffff']};
  const voice=placementVoice(next,previous,'sustain');
  assert.match(voice.value,/환해지면서/);
  assert.equal(voice.evidence[0].ref,'ph_02');
  assert.doesNotMatch(voice.value,/제주|행복|오후|R1|#ffffff/);
  assert.doesNotMatch(placementVoice(photo(.319,.2),previous,'sustain').value,/환해지/);
  assert.match(placementVoice(photo(.32,.2),previous,'sustain').value,/환해지/);
});

test('real buildFeed paths expose concept with evidence without inventing order for photo-only input', async () => {
  for(const target of [{kind:'none'},{kind:'text',text:'조용하고 담백하게'}]) {
    const input=photos.slice(0,15);
    const {feed}=await buildFeed({schema_version:'1.0',session_id:'voice-test',photos:input,identity:{target,current:{kind:'none'}}});
    // #127: 사진만 올린 경로도 순서를 정한다. 사진은 보존되고, 순서는 측정값이 정한다.
    assert.deepEqual(new Set(feed.slots.map(s=>s.photo_id)),new Set(input.map(p=>p.photo_id)));
    if(target.kind==='none') assert.match(feed.slots.find(s=>s.position===1).rationale.value,/지향을 넣지 않아/);
    assert.match(feed.concept.value,/흐름으로 엮어요/);
    assert.ok(feed.concept.evidence.some(e=>e.ref==='order.bundle_concept'));
    assert.doesNotMatch(feed.concept.value,forbidden);
    for(const slot of feed.slots) assert.doesNotMatch(slot.rationale.value,forbidden);
  }
});

// 리뷰 2회차 회귀 — 컨셉은 슬롯이 아니라 피드에 속한다. 순서를 바꿔도 따라 움직이면 안 된다.
test('bundle concept lives on the feed, so reordering never drags it onto another photo', async () => {
  const input = photos.slice(0, 15);
  for (const target of [{kind:'none'},{kind:'text',text:'조용하고 담백하게'}]) {
    const {feed} = await buildFeed({schema_version:'1.0',session_id:'voice-feed-level',photos:input,identity:{target,current:{kind:'none'}}});
    assert.match(feed.concept.value,/흐름으로 엮어요/);
    assert.ok(feed.concept.evidence.some(e=>e.ref==='order.bundle_concept'));
    // 열다섯 장 전부의 측정 근거가 컨셉에 있고, 어떤 슬롯에도 새지 않는다.
    assert.equal(feed.concept.evidence.filter(e=>e.kind==='uploaded_photo').length,input.length);
    for (const slot of feed.slots) {
      assert.doesNotMatch(slot.rationale.value,/흐름으로 엮어요|뚜렷하지/);
      assert.ok(!slot.rationale.evidence.some(e=>e.ref==='order.bundle_concept'));
      assert.ok(new Set(slot.rationale.evidence.filter(e=>e.kind==='uploaded_photo').map(e=>e.ref)).size<=2);
    }
  }
});

test('concept evidence order is fixed by photo_id, so input shuffling yields the same claim', () => {
  const set=[photo(.25,.2,'ph_03'),photo(.5,.2,'ph_01'),photo(.4,.2,'ph_02')];
  assert.deepEqual(bundleConcept(set).evidence.filter(e=>e.kind==='uploaded_photo').map(e=>e.ref),['ph_01','ph_02','ph_03']);
  assert.deepEqual(bundleConcept([...set].reverse()),bundleConcept(set));
});

test('below the threshold the concept says the range is narrow, and no rule note claims a contrast', async () => {
  for (const spread of [.449,.4499]) {
    const even=bundleConcept([photo(.5,.2),photo(.5,spread,'ph_02')]);
    assert.match(even.value,/톤이 고르게/);
    assert.doesNotMatch(even.value,/어우러지는/);
    assert.doesNotMatch(even.value,forbidden);
  }
  const atBoundary=bundleConcept([photo(.5,.25,'ph_01'),photo(.5,.5,'ph_02')]);
  assert.equal(atBoundary.confidence,1);
  assert.equal(atBoundary.evidence.at(-1).note,
    '컨셉은 채도 범위, 밝기 범위 순으로 0.25 이상이면 대비를, 둘 다 미만이면 고른 톤을 설명한다. 임계값은 설계 상수이며 범위 자체는 측정값이다.');
  assert.equal(atBoundary.evidence[0].note,`묶음·인접 비교 측정값 — 밝기 0.5 · 채도 0.25`);
  // 어떤 근거도 "비운다" 같은 값 없는 판단을 설명하지 않는다.
  for (const e of atBoundary.evidence) assert.doesNotMatch(e.note,/비운다/);
  const flat=Array.from({length:15},(_,i)=>({...photos[0],photo_id:`fl_${i}`,input_index:i,file_ref:`${i}.jpg`,color:{...photos[0].color,bright_mean:.5,sat_mean:.3}}));
  const {feed}=await buildFeed({schema_version:'1.0',session_id:'voice-absent',photos:flat,identity:{target:{kind:'none'},current:{kind:'none'}}});
  assert.match(feed.concept.value,/톤이 고르게/);
  assert.doesNotMatch(feed.concept.value,/어우러지는/);
  for (const slot of feed.slots) assert.doesNotMatch(slot.rationale.value,/뚜렷하지/);
});

test('a forged feed-level concept is rejected against the actual photo measurements', async () => {
  const flat=Array.from({length:3},(_,i)=>({...photos[0],photo_id:`fg_${i}`,input_index:i,file_ref:`${i}.jpg`,color:{...photos[0].color,bright_mean:.5,sat_mean:.3}}));
  const {feed}=await buildFeed({schema_version:'1.0',session_id:'voice-forge',photos:flat,identity:{target:{kind:'none'},current:{kind:'none'}}});
  const ids=flat.map(p=>p.photo_id), plan=planFromPhotos(flat);
  const check=candidate=>validateFeed({...feed,concept:candidate},ids,absentCurrent,plan,flat);
  validateFeed(feed,ids,absentCurrent,plan,flat); // 실제 재계산과 같은 컨셉은 그대로 통과한다
  // 측정이 미달인데 컨셉을 끼워 넣을 수 없다.
  assert.throws(()=>check({value:'옅은 색과 짙은 색이 어우러지는 흐름으로 엮어요.',confidence:1,
    evidence:[{kind:'rule',ref:'order.bundle_concept',note:'위조'}]}),/concept/);
  // 측정이 충분한 피드에서도 value·evidence 를 바꿔 쓸 수 없다.
  const spread=flat.map((p,i)=>({...p,color:{...p.color,sat_mean:i===0?.1:.6}}));
  const {feed:real}=await buildFeed({schema_version:'1.0',session_id:'voice-forge2',photos:spread,identity:{target:{kind:'none'},current:{kind:'none'}}});
  const args=[spread.map(p=>p.photo_id),absentCurrent,planFromPhotos(spread),spread];
  validateFeed(real,...args);
  assert.throws(()=>validateFeed({...real,concept:{...real.concept,value:'취향에 꼭 맞는 흐름으로 엮어요.'}},...args),/concept/);
  assert.throws(()=>validateFeed({...real,concept:{...real.concept,
    evidence:real.concept.evidence.map(e=>({...e,note:'앞 사진과 겹치는 인물이 있어요'}))}},...args),/concept/);
  assert.throws(()=>validateFeed({...real,concept:{...real.concept,evidence:real.concept.evidence.slice(0,1)}},...args),/concept/);
});
