import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProfile, ContractError } from '../lib/contracts.js';
import {
  extractFromReference, extractFromFreetext, planFromPhotos,
  resolveReference, referenceHandle, loadDefaultRegistry, validatePhotoPlan, validateProfileEvidence, UnsupportedReferenceError
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

test('free text preserves explicit caption coverage as a claim without inventing a ratio', () => {
  const cases = [
    ['말수가 적고 여백이 많은 기록','sparse'],
    ['일부는 비워 주세요','sparse'],
    ['사진만 두고 싶어요','sparse'],
    ['몇 장만 자세히 써 줘','sparse'],
    ['몇 장에만 문장을 써 줘','sparse'],
    ['말수 적게 기록해 줘','sparse'],
    ['모든 사진에 문장을 써 줘','all'],
    ['모든 사진에 짧게 써 줘','all'],
    ['사진마다 한 줄씩 써 줘','all'],
    ['전부 채워 주세요','all'],
    ['한 장도 비우지 않았으면 해요','all'],
    ['전부 써 주세요','all']
  ];
  for (const [text,value] of cases) {
    const profile=extractFromFreetext(text,{createdAt:at});
    assert.equal(profile.language.caption_coverage.value,value,text);
    assert.equal(profile.language.empty_caption_ratio,undefined,text);
    assert.deepEqual(profile.language.caption_coverage.evidence.map(e=>e.kind),['user_text','rule']);
    assert.ok(text.includes(profile.language.caption_coverage.evidence[0].ref.split(':').at(-1)));
  }
});

test('negated, conflicting, or unsupported coverage cues never become an affirmative claim', () => {
  for (const text of [
    '사진만 두지 마','모든 사진에 문장 쓰는 건 싫어요','일부는 비워, 전부 써','캡션 없이 전부 사진만 보여 줘',
    '말수가 적지 않게 써 줘','말수가 적고 싶지 않아','모든 사진에 문장 쓰지 않아'
  ]) {
    const profile=extractFromFreetext(text,{createdAt:at});
    assert.equal(profile.language?.caption_coverage,undefined,text);
  }
  assert.equal(extractFromFreetext('가끔은 알아서 써 줘',{createdAt:at}).language,null);
  for (const text of ['여백이 많은 기록','미니멀하게','짧게 써 줘'])
    assert.equal(extractFromFreetext(text,{createdAt:at}).language?.caption_coverage,undefined,text);
});

test('coverage contrast keeps the final affirmative wish without reversing a negation', () => {
  for (const text of ['말수 적게 하지 말고 모든 사진에 써 줘','말수는 적게, 하지만 사진마다 한 줄씩','한 장도 비우지 말고 전부 써 줘'])
    assert.equal(extractFromFreetext(text,{createdAt:at}).language.caption_coverage.value,'all',text);
  assert.equal(extractFromFreetext('한 장도 비우지 않았으면 해요',{createdAt:at}).language.caption_coverage.value,'all');
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

test('the runtime contract reserves coverage intent for freetext targets', () => {
  const coverage=extractFromFreetext('사진만 두고 싶어요',{createdAt:at});
  const numeric=structuredClone(coverage);
  numeric.language.empty_caption_ratio={value:0.5,confidence:1,evidence:[{kind:'user_text',ref:`${numeric.profile_id}:raw`,note:'forged ratio'}]};
  assert.throws(()=>validateProfile(numeric,'target'),ContractError);

  const reference=structuredClone(ref);
  reference.language.caption_coverage=structuredClone(coverage.language.caption_coverage);
  assert.throws(()=>validateProfile(reference,'target'),ContractError);

  const current=structuredClone(ref);
  current.axis='current';current.source='cached';current.account_scope='main';
  current.language.caption_coverage=structuredClone(coverage.language.caption_coverage);
  assert.throws(()=>validateProfile(current,'current'),ContractError);
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
    assert.equal(Object.values(planFromPhotos(photos.map(p=>({...p,analysis_source:'vision_model'}))).visual[key].value).reduce((a,b)=>a+b,0),1,`${key} must sum to exactly 1`);
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

// ── PR #28 교차 리뷰 회귀 (H1·H2·H3) ─────────────────────────────────────────
// 리뷰가 재현한 공격 입력 그대로다. 수정 전에는 전부 통과했다.

test('H1: a negated or contrasted wish is left empty, never flipped into a positive one', () => {
  // 리뷰 재현 입력 4종. 수정 전 반환값을 주석으로 남긴다.
  const attacks = [
    ['짧게 말고 길게 써줘',        'caption_len'],   // 전: caption_len {p50:15,p90:30}, tone ["짧게 말고"]
    ['이모지 많이 쓰지 마',        'emoji_rate'],    // 전: emoji_rate 1.5, tone ["이모지 많이"]
    ['해요체는 싫어요',            'ending_style'],  // 전: ending_style "해요"
    ['밝고 따뜻한 느낌은 싫어요',    null]            // 전: tone_words ["밝고 따뜻한"], confidence 1
  ];
  for (const [text, field] of attacks) {
    const p = extractFromFreetext(text, {createdAt:at});
    validateProfile(p, 'target');
    if (field) assert.equal(p.language?.[field], undefined, `"${text}" must not fill ${field} from a negated phrase`);
    assert.equal(p.visual.tone_words, undefined, `"${text}" must not carry a negated clause as a positive tone`);
    assert.equal(p.completeness.visual, 0, 'completeness must go down, not stay up on an unsupported reading');
    assert.equal(p.completeness.language, 0);
  }
});

test('H1 control: a plainly positive wish still fills the same fields it always did', () => {
  assert.deepEqual(free.language.caption_len.value, {p50:15,p90:30,unit:'자'});
  assert.equal(free.language.emoji_rate.value, 0);
  assert.equal(free.language.ending_style.value, '해요');
  assert.deepEqual(free.visual.tone_words.value, ['조용','짧게','이모지 없이']);
  assert.deepEqual(extractFromFreetext('그냥 나답게',{createdAt:at}).visual.tone_words.value, ['그냥 나답게']);
  // 어휘 자체가 부정형인 항목은 부정 표지로 오인되면 안 된다.
  assert.equal(extractFromFreetext('이모지는 빼고 써줘',{createdAt:at}).language.emoji_rate.value, 0);
});

test('H2: editing a returned profile never changes what the next call returns', async () => {
  const a = extractFromFreetext('짧게',{createdAt:at});
  a.language.caption_len.value.p50 = 999;              // 전: 다음 호출이 999 를 받아 ContractError 로 죽었다
  a.language.banned_words.push('오염어');
  const b = extractFromFreetext('짧게',{createdAt:at});
  assert.deepEqual(b.language.caption_len.value, {p50:15,p90:30,unit:'자'});
  assert.ok(!b.language.banned_words.includes('오염어'));
  const r1 = await extractFromReference('https://www.instagram.com/29cm/',{registry,createdAt:at});
  r1.language.banned_words.push('오염어');
  const r2 = await extractFromReference('https://www.instagram.com/29cm/',{registry,createdAt:at});
  assert.ok(!r2.language.banned_words.includes('오염어'));
});

test('H3: profile evidence must resolve to the actual input, not merely exist', async () => {
  const snapshot = registry['29cm'];
  const photoIds = photos.map(a=>a.photo_id);
  const forge = (base, mutate) => { const x = structuredClone(base); mutate(x); return x; };
  // 리뷰 재현 위조 6종 + 사진 계획 3종. 수정 전에는 전부 ACCEPTED 였다.
  const cases = [
    [forge(ref, x=>{x.language.caption_len.evidence[1].ref='POST_NOT_IN_SNAPSHOT';}), {snapshot}],
    [forge(ref, x=>{x.language.caption_len.evidence[0].ref='ig_snapshot_NOT_REAL';}), {snapshot}],
    [forge(ref, x=>{x.language.caption_len.evidence=[{kind:'user_text',ref:'tgt_NOT_REAL:raw',note:'invented'}];}), {snapshot}],
    [forge(free, x=>{x.language.caption_len.evidence[0].ref='tgt_NOT_REAL:짧게';}), {}],
    [forge(free, x=>{x.language.caption_len.evidence[0].ref=x.profile_id+':길게';}), {}],
    [forge(free, x=>{x.language.caption_len.evidence.push({kind:'ig_post',ref:'CFAKE',note:'invented'});}), {}],
    [forge(plan, x=>{x.visual.palette.evidence[1].ref='ph_NOT_AN_INPUT';}), {photoIds}],
    [forge(plan, x=>{x.visual.palette.evidence[0].ref='photo_analysis:n=99';}), {photoIds}],
    [forge(plan, x=>{x.visual.tone_words={value:['행복한 취향'],confidence:1,evidence:[{kind:'user_text',ref:'not_in_input',note:'made up'}]};}), {photoIds}]
  ];
  for (const [forged, inputs] of cases)
    assert.throws(()=>validateProfileEvidence(forged, inputs), ContractError,
      'a forged evidence ref reached the caller as if it were traceable');
  // 정상 출력은 그대로 통과한다.
  validateProfileEvidence(ref,{snapshot}); validateProfileEvidence(free,{}); validateProfileEvidence(plan,{photoIds});
});
