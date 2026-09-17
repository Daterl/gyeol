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
const bundle={feed,output,inputPhotoIds:input.photo_ids,targetProfile:targets[0],currentProfile:currents[1]};
const mutated=(source,edit)=>{const copy=structuredClone(source);edit(copy);return copy;};

test('four sample types and independent golden input files satisfy contracts',async()=>{
  targets.forEach(p=>validateProfile(p,'target'));currents.forEach(p=>validateProfile(p,'current'));photos.forEach(validatePhoto);
  validateFeed(feed,input.photo_ids,currents[1]);validateExport(output,feed);
  assert.equal(feed.slots.length,15);assert.equal(input.files.length,input.photo_ids.length);
  for(const file of input.files) assert.match(await readFile(new URL('../'+file,import.meta.url),'utf8'),/synthetic/);
  assert.deepEqual(photos.map(p=>p.photo_id),input.photo_ids);
});
for(const id of ['E1','E2','E3','E6','E8']) {
  test(`${id}: valid input passes and stored broken fixture fails`,async()=> {
    assert.equal(evaluate(bundle)[id].pass,true);
    const broken=breakFixture(bundle,await read(`eval/broken/${id}.json`));
    assert.equal(evaluate(broken)[id].pass,false);
  });
}
for(const count of [3,20]) test(`${count} photo boundary passes`,()=> {
  const ids=Array.from({length:count},(_,i)=>`boundary_${i}`);
  const candidate=mutated(feed,f=>{
    f.slots=ids.map((id,i)=>({...structuredClone(feed.slots[0]),photo_id:id,position:i+1}));
    f.invariants={input_count:count,output_count:count,unique_photo_ids:true};
  });
  validateFeed(candidate,ids,currents[1]);
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
for(const [name,edit] of Object.entries(defects)) test(`reject ${name}`,()=>assert.throws(()=>validateFeed(mutated(feed,edit),input.photo_ids,currents[1])));
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
test('profile absence/types/rule-only claims are checked',()=>{
  for(const edit of [p=>p.present='false',p=>p.profile_id='fake',p=>p.sample_size=1,p=>p.visual={tone_words:{}}]) assert.throws(()=>validateProfile(mutated(currents[1],edit),'current'));
  for(const edit of [p=>p.visual.tone_words.evidence[0].kind='rule',p=>p.language.caption_len.value.p50='18',p=>p.source='photo_upload',p=>p.language=null]) assert.throws(()=>validateProfile(mutated(targets[0],edit),'target'));
});
test('photo field types are checked',()=>{
  for(const edit of [p=>p.has_face='false',p=>p.input_index=-1,p=>p.color.bright_mean=2,p=>p.describable_facts=[null]]) assert.throws(()=>validatePhoto(mutated(photos[0],edit)));
});
for(const title of [null,[],['one','two'],'',' ','one\ntwo','one\rtwo',3,'one\u2028two']) test(`reject title ${JSON.stringify(title)}`,()=>assert.throws(()=>validateExport({...output,title},feed)));
test('F3 export retains stable identity at every position, including after reorder',()=>{
  assert.throws(()=>validateExport(mutated(output,o=>o.slots[0].photo_id='wrong'),feed));
  assert.throws(()=>validateExport(mutated(output,o=>{[o.slots[0].photo_id,o.slots[1].photo_id]=[o.slots[1].photo_id,o.slots[0].photo_id];}),feed));
  assert.throws(()=>validateExport(mutated(output,o=>delete o.slots[0].photo_id),feed));
  assert.throws(()=>validateExport(mutated(output,o=>o.slots[1].omit_reason=''),feed));
  assert.throws(()=>validateExport(mutated(output,o=>o.slots[1].evidence=[]),feed));
  validateExport(mutated(output,o=>o.slots.reverse()),feed); // Array order is irrelevant; position is explicit.
});
test('E4/E5/E7 are intentionally not automated quality checks',()=>assert.deepEqual(Object.keys(evaluate(bundle)),['E1','E2','E3','E6','E8']));
test('present current can be honestly corrected with the single supported delta',()=>{
  const candidate=mutated(feed,f=>Object.assign(f.applied_profile,{
    current_profile_id:currents[0].profile_id,corrected:true,disclosure:'corrected',
    deltas:[{field:'language.caption_len.p50',target:80,current:18,resolved:38,rule:'log_midpoint',note_key:'caption_len_gap',evidence:targets[0].language.caption_len.evidence}]
  }));
  validateFeed(candidate,input.photo_ids,currents[0]);
  assert.throws(()=>validateFeed(mutated(candidate,f=>f.applied_profile.deltas[0].note_key='other'),input.photo_ids,currents[0]));
});
test('absent account and extra title fields cannot smuggle contradictory states',()=>{
  assert.throws(()=>validateProfile(mutated(currents[1],p=>p.account_scope='main'),'current'));
  assert.throws(()=>validateExport({...output,title2:'second'},feed));
});
