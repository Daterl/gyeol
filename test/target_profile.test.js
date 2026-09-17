import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProfile, ContractError } from '../lib/contracts.js';
import {
  extractFromReference, extractFromFreetext, planFromPhotos,
  resolveReference, referenceHandle, loadDefaultRegistry, validatePhotoPlan, UnsupportedReferenceError
} from '../lib/target_profile.js';

const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const photos=await read('fixtures/photo_analysis.sample.json');
const registry=await loadDefaultRegistry();
const at='2026-09-17T00:00:00.000Z';
const ref=await extractFromReference('https://www.instagram.com/29cm/',{registry,createdAt:at});
const free=extractFromFreetext('조용하고 짧게, 이모지 없이 해요체로',{createdAt:at});
const plan=planFromPhotos(photos,{createdAt:at});
// Walks every Claim-shaped node instead of trusting the top-level fields.
const claims=(v,path='$',out=[])=>{
  if(!v||typeof v!=='object') return out;
  if(!Array.isArray(v)&&Object.hasOwn(v,'value')&&Object.hasOwn(v,'evidence')) out.push([path,v]);
  for(const [k,child] of Object.entries(v)) claims(child,`${path}.${k}`,out);
  return out;
};

test('both input paths produce the same TargetProfile schema with their own source', () => {
  for(const profile of [ref,free]) validateProfile(profile,'target');
  assert.equal(ref.source,'ig_reference');
  assert.equal(free.source,'freetext');
  assert.equal(ref.axis,free.axis);
  assert.equal(ref.schema_version,free.schema_version);
});

test('what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence', () => {
  assert.ok(free.completeness.visual<=0.2,`free text visual completeness ${free.completeness.visual}`);
  assert.ok(ref.completeness.language>0,'reference must fill language');
  // docs/intent.md C2 removed reference image analysis, so visual must stay at zero.
  assert.equal(ref.completeness.visual,0);
  assert.deepEqual(ref.visual,{});
  assert.equal(ref.raw_freetext,null);
  assert.equal(free.raw_freetext,'조용하고 짧게, 이모지 없이 해요체로');
});

test('E1: every Claim in both profiles and the photo plan carries at least one evidence', () => {
  for(const source of [ref,free,plan]) {
    const found=claims(source);
    assert.ok(found.length>0,'expected at least one Claim');
    for(const [path,c] of found) assert.ok(c.evidence.length>=1,`${path} has no evidence`);
  }
});

test('no profile item is made of rule evidence alone', () => {
  for(const source of [ref,free,plan])
    for(const [path,c] of claims(source))
      assert.ok(c.evidence.some(e=>e.kind!=='rule'),`${path} is rule-only, which is a preset and not personalization`);
});

test('a free text mapping cites the matched phrase and the mapping row separately', () => {
  const kinds=free.language.caption_len.evidence.map(e=>e.kind);
  assert.deepEqual(kinds,['user_text','rule']);
  assert.match(free.language.caption_len.evidence[0].ref,/짧게$/);
});

test('an aggregate value can be traced back to the posts it was read from', () => {
  const ev=ref.language.caption_len.evidence;
  assert.equal(ev[0].kind,'aggregate');
  const posts=ev.filter(e=>e.kind==='ig_post').map(e=>e.ref);
  assert.ok(posts.length>0,'aggregate claim must point at real posts');
  const known=new Set(registry['29cm'].posts.map(p=>p.shortCode));
  for(const code of posts) assert.ok(known.has(code),`${code} is not in the snapshot`);
});

test('free text never invents an empty caption ratio and never rounds up to a default', () => {
  assert.equal(free.language.empty_caption_ratio,undefined);
  const bare=extractFromFreetext('그냥 나답게',{createdAt:at});
  validateProfile(bare,'target');
  assert.equal(bare.language,null);
  assert.equal(bare.completeness.language,0);
  assert.deepEqual(bare.visual.tone_words.value,['그냥 나답게']);
});

test('free text is the floor that always succeeds, but blank input is not natural language', () => {
  assert.throws(()=>extractFromFreetext('   '),ContractError);
  assert.throws(()=>extractFromFreetext(null),ContractError);
});

test('an unprepared URL fails and names the fallbacks instead of borrowing another account', () => {
  for(const url of ['https://www.instagram.com/someone_else/','https://www.instagram.com/p/DdVKdyACaC1/','https://example.com/29cm']) {
    let error;
    assert.throws(()=>resolveReference(url,registry),e=>{error=e;return e instanceof UnsupportedReferenceError;});
    assert.equal(error.code,'REFERENCE_NOT_PREPARED');
    assert.deepEqual(error.supported,['29cm']);
    assert.deepEqual(error.fallbacks,['freetext','photo_only']);
  }
  assert.equal(referenceHandle('https://www.instagram.com/reel/abc/'),null);
  assert.equal(referenceHandle('https://www.instagram.com/29CM/?hl=ko'),'29cm');
});

test('the photo only path returns a plan, never a TargetProfile with an undefined absent state', () => {
  validatePhotoPlan(plan);
  assert.equal(plan.kind,'photo_plan');
  assert.equal(plan.target_profile,null);
  assert.equal(Object.hasOwn(plan,'axis'),false);
  assert.equal(Object.hasOwn(plan,'present'),false);
  assert.throws(()=>validateProfile({...plan,axis:'target'},'target'),ContractError);
});

test('the photo only path claims no preference and no sentence', () => {
  assert.equal(plan.language,null);
  assert.equal(plan.completeness.language,0);
  assert.equal(plan.visual.tone_words,undefined);
  assert.match(plan.disclaimer,/취향·과거 습관이 아니다/);
  for(const [,c] of claims(plan))
    assert.ok(c.evidence.every(e=>['uploaded_photo','aggregate'].includes(e.kind)),'photo plan evidence must come from the uploaded photos');
});

test('the photo plan aggregates only what a photo can show, and the mixes stay exact', () => {
  assert.equal(plan.sample_size,photos.length);
  for(const key of ['composition_mix','scale_mix'])
    assert.equal(Object.values(plan.visual[key].value).reduce((a,b)=>a+b,0),1,`${key} must sum to exactly 1`);
  assert.ok(plan.visual.palette.value.palette_hex.length<=3);
  assert.throws(()=>planFromPhotos([]),ContractError);
  assert.throws(()=>planFromPhotos([{...photos[0],photo_id:''}]),ContractError);
});

test('boundary: an all blank snapshot yields no language and a carousel free one yields no opener', async () => {
  const blank={...registry['29cm'],snapshot_id:'blank',handle:'blank',posts:registry['29cm'].posts.map(p=>({...p,caption:'   ',child_count:0}))};
  const profile=await extractFromReference('https://www.instagram.com/blank/',{registry:{blank},createdAt:at});
  validateProfile(profile,'target');
  assert.equal(profile.language,null);
  assert.equal(profile.completeness.language,0);
  assert.equal(profile.sequence.carousel_count,0);
  assert.equal(profile.sequence.opener_tendency,undefined);
});

test('the two golden profiles differ in a way a reader can see', async () => {
  const quiet=await read('eval/golden/case_01/target_quiet.json');
  const detail=await read('eval/golden/case_01/target_detail.json');
  for(const profile of [quiet,detail]) validateProfile(profile,'target');
  assert.notEqual(quiet.source,detail.source);
  assert.ok(detail.language.caption_len.value.p50>quiet.language.caption_len.value.p50*3,
    'a caption length gap this small will not show up as two visibly different results');
});
