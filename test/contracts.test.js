import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProfile, validatePhoto, validateFeed, validateExport, validateInputIds } from '../lib/contracts.js';
import { evaluate, breakFixture } from '../eval/invariants.js';
const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const feed=await read('fixtures/ordered_feed.sample.json');
const photos=await read('fixtures/photo_analysis.sample.json');
const targets=await read('fixtures/target_profile.sample.json');
const currents=await read('fixtures/current_profile.sample.json');
const input=await read('eval/golden/case_01/input.json');
const output=await read('eval/golden/case_01/export_quiet.json');
const bundle={feed,output,inputPhotoIds:input.photo_ids,targetProfile:targets[0],currentProfile:currents[1],photoAnalyses:photos};
const mutated=(source,edit)=>{const copy=structuredClone(source);edit(copy);return copy;};

test('four sample types and independent golden input files satisfy contracts',async()=>{
  targets.forEach(p=>validateProfile(p,'target'));currents.forEach(p=>validateProfile(p,'current'));photos.forEach(validatePhoto);
  validateFeed(feed,input.photo_ids,currents[1],targets[0],photos);validateExport(output,feed,input.photo_ids);
  assert.equal(feed.slots.length,15);assert.equal(input.files.length,input.photo_ids.length);
  for(const file of input.files) assert.match(await readFile(new URL('../'+file,import.meta.url),'utf8'),/synthetic/);
  assert.deepEqual(photos.map(p=>p.photo_id),input.photo_ids);
});
for(const id of ['E1','E2','E3','E6','E8','E9','E10','E11']) {
  test(`${id}: valid input passes and stored broken fixture fails`,async()=> {
    assert.equal(evaluate(bundle)[id].pass,true);
    const broken=breakFixture(bundle,await read(`eval/broken/${id}.json`));
    assert.equal(evaluate(broken)[id].pass,false);
  });
}
for(const count of [3,20]) test(`${count} photo boundary passes`,()=> {
  const ids=Array.from({length:count},(_,i)=>`boundary_${i}`);
  const boundaryPhotos=ids.map(id=>({...structuredClone(photos[0]),photo_id:id}));
  const candidate=mutated(feed,f=>{
    f.slots=ids.map((id,i)=>{
      const slot={...structuredClone(feed.slots[0]),photo_id:id,position:i+1};
      slot.rationale.evidence.forEach(e=>{ if(e.kind==='uploaded_photo') e.ref=id; });
      slot.caption_inputs.describable_facts=[...photos[0].describable_facts];
      return slot;
    });
    f.invariants={input_count:count,output_count:count,unique_photo_ids:true};
  });
  validateFeed(candidate,ids,currents[1],targets[0],boundaryPhotos);
});
for(const count of [2,21]) test(`${count} input photos rejected`,()=>assert.throws(()=>validateInputIds(Array.from({length:count},(_,i)=>`id${i}`))));
const defects={
  'duplicate output ID despite true flag':f=>f.slots[1].photo_id=f.slots[0].photo_id,
  'missing slot despite declared output count':f=>f.slots.pop(),
  'foreign replacement ID with same count':f=>f.slots[0].photo_id='foreign',
  'lying counts':f=>f.invariants.input_count=14,
  'count string':f=>f.invariants.output_count='15',
  'unique flag string':f=>f.invariants.unique_photo_ids='true',
  'position string':f=>f.slots[0].position='1',
  'duplicate position':f=>f.slots[0].position=2,
  'zero position':f=>f.slots[0].position=0,
  'fractional position':f=>f.slots[0].position=1.5,
  'missing rationale Claim':f=>f.slots[0].rationale={},
  'evidence missing':f=>delete f.slots[0].rationale.evidence,
  'evidence wrong type':f=>f.slots[0].rationale.evidence='source',
  'invalid confidence':f=>f.slots[0].rationale.confidence=2,
  'empty evidence reference':f=>f.slots[0].rationale.evidence[0].ref='',
  'overlap string':f=>f.slots[0].caption_inputs.adjacent_overlap='0',
  'invented current input':f=>f.applied_profile.current_profile_id='fake',
  'false corrected claim':f=>f.applied_profile.corrected=true,
  'unknown delta':f=>f.applied_profile.deltas=[{note_key:'other'}],
};
for(const [name,edit] of Object.entries(defects)) test(`reject ${name}`,()=>assert.throws(()=>validateFeed(mutated(feed,edit),input.photo_ids,currents[1],targets[0],photos)));
test('duplicate/malformed actual input rejected',()=>{
  for(const ids of [undefined,'ids',[1,2,3],[null,'a','b'],['a','a','b']]) assert.throws(()=>validateInputIds(ids));
});
test('E2 does not trust output input_count/unique flags as expected input IDs',()=>{
  const forged=mutated(bundle,b=>{ b.feed.slots[0].photo_id='forged'; });
  assert.equal(evaluate(forged).E2.pass,false);
});
test('E8 uses actual absent input even if response invents consistent correction',()=>{
  const forged=mutated(bundle,b=>Object.assign(b.feed.applied_profile,{current_profile_id:'invented',corrected:true,disclosure:'corrected'}));
  assert.equal(evaluate(forged).E8.pass,false);
});
for(const invented of [false,true]) for(const context of ['missing','undefined']) {
  const candidate=mutated(feed,f=>{
    if(invented) Object.assign(f.applied_profile,{current_profile_id:'invented',corrected:true,disclosure:'corrected'});
  });
  test(`validateFeed rejects ${context} current context with ${invented?'invented correction':'target-only disclosure'}`,()=>{
    // 'missing' omits the trailing arguments entirely; 'undefined' supplies every other input and only blanks the current axis.
    const args=context==='undefined'?[candidate,input.photo_ids,undefined,targets[0],photos]:[candidate,input.photo_ids];
    assert.throws(()=>validateFeed(...args),/currentProfile: expected object/);
  });
  test(`E8 rejects ${context} current context with ${invented?'invented correction':'target-only disclosure'}`,()=>{
    const candidateBundle={...bundle,feed:candidate};
    if(context==='missing') delete candidateBundle.currentProfile;
    else candidateBundle.currentProfile=undefined;
    const result=evaluate(candidateBundle).E8;
    assert.equal(result.pass,false);
    assert.match(result.reason,/currentProfile: expected object/);
  });
}
test('profile absence/types/rule-only claims are checked',()=>{
  for(const edit of [p=>p.present='false',p=>p.profile_id='fake',p=>p.sample_size=1,p=>p.visual={tone_words:{}}]) assert.throws(()=>validateProfile(mutated(currents[1],edit),'current'));
  for(const edit of [p=>p.visual.tone_words.evidence[0].kind='rule',p=>p.language.caption_len.value.p50='18',p=>p.source='photo_upload',p=>p.language=null]) assert.throws(()=>validateProfile(mutated(targets[0],edit),'target'));
});
test('photo field types are checked',()=>{
  for(const edit of [p=>p.has_face='false',p=>p.input_index=-1,p=>p.color.bright_mean=2,p=>p.describable_facts=[null]]) assert.throws(()=>validatePhoto(mutated(photos[0],edit)));
});
for(const title of [null,[],['one','two'],'',' ','one\ntwo','one\rtwo',3,'one\u2028two']) test(`reject title ${JSON.stringify(title)}`,()=>assert.throws(()=>validateExport({...output,title},feed,input.photo_ids)));
test('F3 export retains stable identity at every position, including after reorder',()=>{
  assert.throws(()=>validateExport(mutated(output,o=>o.slots[0].photo_id='wrong'),feed,input.photo_ids));
  assert.throws(()=>validateExport(mutated(output,o=>{[o.slots[0].photo_id,o.slots[1].photo_id]=[o.slots[1].photo_id,o.slots[0].photo_id];}),feed,input.photo_ids));
  assert.throws(()=>validateExport(mutated(output,o=>delete o.slots[0].photo_id),feed,input.photo_ids));
  assert.throws(()=>validateExport(mutated(output,o=>o.slots[1].omit_reason=''),feed,input.photo_ids));
  assert.throws(()=>validateExport(mutated(output,o=>o.slots[1].evidence=[]),feed,input.photo_ids));
  validateExport(mutated(output,o=>o.slots.reverse()),feed,input.photo_ids); // Array order is irrelevant; position is explicit.
});
test('E4/E5/E7 are intentionally not automated quality checks',()=>assert.deepEqual(Object.keys(evaluate(bundle)),['E1','E2','E3','E6','E8','E9','E10','E11']));
test('user caption rejects photo-only evidence',()=>{
  const candidate=mutated(output,o=>o.slots[0].caption_state='user');
  assert.equal(candidate.slots[0].evidence.every(e=>e.kind==='uploaded_photo'),true);
  assert.throws(()=>validateExport(candidate,feed,input.photo_ids),/user caption needs user_text evidence/);
});
test('user caption accepts valid user_text evidence with additional photo evidence',()=>{
  const candidate=mutated(output,o=>{
    o.slots[0].caption_state='user';
    o.slots[0].evidence.push({kind:'user_text',ref:'user:caption:1',note:'User supplied this caption'});
  });
  assert.equal(validateExport(candidate,feed,input.photo_ids),candidate);
  assert.throws(()=>validateExport(mutated(candidate,o=>o.slots[0].evidence.at(-1).ref=''),feed,input.photo_ids),/expected nonempty string/);
});
test('present current can be honestly corrected with the single supported delta',()=>{
  const candidate=mutated(feed,f=>Object.assign(f.applied_profile,{
    current_profile_id:currents[0].profile_id,corrected:true,disclosure:'corrected',
    deltas:[{field:'language.caption_len.p50',target:80,current:18,resolved:38,rule:'log_midpoint',note_key:'caption_len_gap',evidence:targets[0].language.caption_len.evidence}]
  }));
  validateFeed(candidate,input.photo_ids,currents[0],targets[0],photos);
  assert.throws(()=>validateFeed(mutated(candidate,f=>f.applied_profile.deltas[0].note_key='other'),input.photo_ids,currents[0],targets[0],photos));
});
test('absent account and extra title fields cannot smuggle contradictory states',()=>{
  assert.throws(()=>validateProfile(mutated(currents[1],p=>p.account_scope='main'),'current'));
  assert.throws(()=>validateExport({...output,title2:'second'},feed,input.photo_ids));
});

// 3차 리뷰 H1 — 지향축(TargetProfile)을 지어내면 거부한다.
test('validateFeed rejects an invented target profile ID',()=>{
  assert.throws(()=>validateFeed(mutated(feed,f=>f.applied_profile.target_profile_id='tgt_DOES_NOT_EXIST_ANYWHERE'),input.photo_ids,currents[1],targets[0],photos),/E9: target profile ID differs from actual input/);
  assert.throws(()=>validateFeed(feed,input.photo_ids,currents[1],targets[1],photos),/E9: target profile ID differs from actual input/);
  for(const missing of [undefined,null,{}]) assert.throws(()=>validateFeed(feed,input.photo_ids,currents[1],missing,photos));
  assert.equal(evaluate({...bundle,targetProfile:targets[1]}).E9.pass,false);
});
// 3차 리뷰 H2 — evidence 의 ref 가 실제 입력 사진으로 해소되지 않으면 거부한다.
test('validateFeed and validateExport reject evidence that resolves to no input photo',()=>{
  assert.throws(()=>validateFeed(mutated(feed,f=>f.slots[0].rationale.evidence[0].ref='ph_NOT_AN_INPUT'),input.photo_ids,currents[1],targets[0],photos),/E10/);
  assert.throws(()=>validateExport(mutated(output,o=>o.slots[0].evidence[0].ref='ph_NOT_AN_INPUT'),feed,input.photo_ids),/E10/);
  // Other evidence kinds have no photo reference domain in this contract and stay untouched.
  validateExport(mutated(output,o=>o.slots[0].evidence.push({kind:'rule',ref:'rule:opener',note:'설계 규칙'})),feed,input.photo_ids);
  const forged=mutated(bundle,b=>{ b.feed.slots[0].rationale.evidence[0].ref='ph_NOT_AN_INPUT'; });
  assert.equal(evaluate(forged).E10.pass,false);
  assert.equal(evaluate(mutated(bundle,b=>{ b.output.slots[0].evidence[0].ref='ph_NOT_AN_INPUT'; })).E10.pass,false);
});
// 2차·3차 리뷰 M — 다른 사진의 '실제' 사실을 복사해 붙여도 거부한다.
test('validateFeed rejects describable_facts copied from another real photo',()=>{
  const nine=photos.find(p=>p.photo_id==='ph_09');
  const copy=f=>{ f.slots.find(s=>s.photo_id==='ph_01').caption_inputs.describable_facts=[...nine.describable_facts]; };
  assert.throws(()=>validateFeed(mutated(feed,copy),input.photo_ids,currents[1],targets[0],photos),/E11: describable fact is not a fact of ph_01/);
  assert.equal(evaluate(mutated(bundle,b=>copy(b.feed))).E11.pass,false);
  for(const missing of [undefined,[],photos.slice(1)]) assert.throws(()=>validateFeed(feed,input.photo_ids,currents[1],targets[0],missing));
});
// 골든 번들만으로 사진→재료 대조가 가능해야 한다.
test('golden bundle carries its own PhotoAnalysis matching the input manifest',async()=>{
  const golden=await read('eval/golden/case_01/photo_analysis.json');
  golden.forEach(validatePhoto);
  assert.deepEqual(golden.map(p=>p.photo_id),input.photo_ids);
});
