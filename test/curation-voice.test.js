import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bundleConcept, placementVoice } from '../lib/curation-voice.js';
import { buildFeed } from '../lib/pipeline.js';
const photos = JSON.parse(await readFile(new URL('./order.real20.json', import.meta.url)));
const photo = (bright, sat, id='ph_01') => ({...photos[0],photo_id:id,color:{...photos[0].color,bright_mean:bright,sat_mean:sat}});
const forbidden = /채도|밝기\s*0\.|색 거리|\bR[1-4]\b|측정값|#[0-9a-f]{6}\b/;

test('concept abstains below boundary, derives contrast at boundary, preserves every source', () => {
  assert.match(bundleConcept([photo(.5,.2),photo(.5,.449)]).value,/뚜렷하지/);
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
  assert.match(voice.value,/환한 화면/);
  assert.equal(voice.evidence[0].ref,'ph_02');
  assert.doesNotMatch(voice.value,/제주|행복|오후|R1|#ffffff/);
  assert.doesNotMatch(placementVoice(photo(.319,.2),previous,'sustain').value,/환한/);
  assert.match(placementVoice(photo(.32,.2),previous,'sustain').value,/환한/);
});

test('real buildFeed paths expose concept with evidence without inventing order for photo-only input', async () => {
  for(const target of [{kind:'none'},{kind:'text',text:'조용하고 담백하게'}]) {
    const input=photos.slice(0,15);
    const {feed}=await buildFeed({schema_version:'1.0',session_id:'voice-test',photos:input,identity:{target,current:{kind:'none'}}});
    if(target.kind==='none') assert.deepEqual(feed.slots.map(s=>s.photo_id),input.map(p=>p.photo_id));
    assert.match(feed.slots[0].rationale.value,/흐름으로 엮어요/);
    assert.ok(feed.slots[0].rationale.evidence.some(e=>e.ref==='order.bundle_concept'));
    for(const slot of feed.slots) assert.doesNotMatch(slot.rationale.value,forbidden);
  }
});
