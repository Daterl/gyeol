import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleFeed} from '../lib/pipeline.js';
import {handleGenerate} from '../lib/output-generation.js';
import {validateGenerateResponse} from '../lib/interaction.js';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const fixture=await read('../fixtures/curation-handoff.sample.json');
const profile=await read('../fixtures/curation.sample.json');
const basePhotos=await read('./order.real20.json');
const request=(path,body)=>new Request('https://gyeol.test/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const transport=(observation,seen)=>async(url,options)=>{
  seen.push({url,body:options?.body?JSON.parse(options.body):null});
  return url.includes('/models/')?Response.json({id:'g5-fixture-model',capabilities:{image_input:{supported:false},structured_outputs:{supported:true}}})
    :Response.json({model:'g5-fixture-model',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(observation)}]});
};
async function feed(scenario) {
  const input={...profile.request,prompt:scenario.prompt,photos:basePhotos.slice(0,scenario.count).map((photo,index)=>({...photo,input_index:index,describable_facts:fixture.facts_by_photo_id[photo.photo_id]}))};
  const response=await handleFeed(request('feed',input),{resolveSnapshot:async()=>structuredClone(profile.resolution),now:()=>Date.parse(fixture.now)});
  assert.equal(response.status,200);return response.json();
}
for(const scenario of fixture.scenarios) test(`canonical G4 → generate → G5 ${scenario.name} preserves seed, omitted, IDs and provenance`,async()=>{
  const result=await feed(scenario);
  const generateRequest={schema_version:'1.0',mode:'all',feed:result.feed,context:result.context};
  const seen=[];
  const response=await handleGenerate(request('generate',generateRequest),{apiKey:'fixture-no-network',fetchImpl:transport(scenario.provider_response,seen)});
  assert.equal(response.status,200,await response.clone().text());
  const generated=await response.json();validateGenerateResponse(generated,generateRequest);
  const handoff={...result,...generated};
  assert.deepEqual(handoff.output,scenario.provider_response.output);
  assert.deepEqual(handoff.output.slots.map(s=>s.photo_id).sort(),scenario.expected_photo_ids);
  assert.deepEqual(handoff.curation.slots.map(s=>s.photo_id),handoff.output.slots.map(s=>s.photo_id));
  assert.ok(handoff.curation.slots.every(s=>s.included));
  assert.equal(handoff.context.target.source,scenario.expected_target_source);
  assert.equal(handoff.curation.profile_snapshot_id,profile.request.profile_snapshot_id);
  assert.deepEqual(handoff.curation.profile,{
    display:{username:'g5_public'},
    snapshot_id:profile.resolution.snapshot.snapshot_id,source_url:profile.resolution.source_url,
    collected_at:profile.resolution.collected_at,expires_at:new Date(profile.resolution.expires_at).toISOString(),
    ownership_verified:false,evidence_refs:profile.resolution.snapshot.provenance.evidence_refs
  });
  assert.equal(handoff.curation.prompt.text,scenario.prompt||null);
  assert.equal(handoff.curation.prompt.evidence.length,scenario.prompt?1:0);
  assert.equal(handoff.omission.omitted,1);assert.equal(handoff.omission.total,scenario.count);
  assert.equal(handoff.output.slots.find(s=>s.photo_id==='ph_02').caption_state,'omitted');
  assert.equal(handoff.output.slots.filter(s=>s.caption_state==='seed').length,scenario.count-1);
  assert.equal(seen.length,2);
  // A written "all" preference must not coerce the provider's valid omission or seed.
  if(scenario.prompt)assert.equal(result.context.target.language.caption_coverage.value,'all');
  for(const original of [handoff.output.slots.find(s=>s.caption_state==='seed'),handoff.output.slots.find(s=>s.caption_state==='omitted')]) {
    const slotRequest={...generateRequest,mode:'slot',photo_id:original.photo_id};
    const slotResponse=await handleGenerate(request('generate',slotRequest),{apiKey:'fixture-no-network',fetchImpl:transport({slot:original},[])});
    assert.equal(slotResponse.status,200);assert.deepEqual(await slotResponse.json(),{slot:original});
  }
  const again=await feed(scenario);assert.deepEqual(again.curation,handoff.curation);assert.deepEqual(again.feed.slots,handoff.feed.slots);
});

test('handoff rejects wrong photo ID, swapped positions and ungrounded provenance from provider',async()=>{
  const scenario=fixture.scenarios[0],result=await feed(scenario);
  const input={schema_version:'1.0',mode:'all',feed:result.feed,context:result.context};
  for(const mutate of [
    value=>{value.output.slots[0].photo_id='foreign_photo';},
    value=>{value.output.slots[0].position=value.output.slots[1].position;},
    value=>{value.output.slots[0].evidence[0].ref='foreign_photo';},
    value=>{value.output.slots[0].evidence[0].note='지어낸 기록';}
  ]) {
    const output=structuredClone(scenario.provider_response);mutate(output);
    const response=await handleGenerate(request('generate',input),{apiKey:'fixture-no-network',fetchImpl:transport(output,[])});
    assert.equal(response.status,502);assert.equal((await response.json()).error.code,'MODEL_CONTRACT');
  }
});
