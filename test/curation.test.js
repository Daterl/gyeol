import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleFeed} from '../lib/pipeline.js';
import {createPhotoReceipt} from '../lib/photo-receipt.js';
import {validateGenerateRequest} from '../lib/interaction.js';
const photos=JSON.parse(await readFile(new URL('./order.real20.json',import.meta.url),'utf8'));
const fixture=JSON.parse(await readFile(new URL('../fixtures/curation.sample.json',import.meta.url),'utf8'));
const now=Date.parse(fixture.now);
const record=fixture.resolution;
const snapshot=record.snapshot;
const input=(count=3)=>({schema_version:'1.0',session_id:'g5-curation',profile_snapshot_id:'g5-public-snapshot',profile_url:record.source_url,photos:structuredClone(photos.slice(0,count)).map((p,i)=>({...p,input_index:i}))});
const request=body=>new Request('http://localhost/api/feed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const run=(body,options={})=>handleFeed(request(body),{resolveSnapshot:async()=>structuredClone(record),now:()=>now,...options});

test('production feed rejects legacy identity and client-supplied snapshot bypasses before resolution',async()=>{
  let calls=0;
  const resolveSnapshot=async()=>{calls++;return record;};
  for(const body of [
    {...input(),profile_snapshot_id:undefined},
    {...input(),snapshot},
    {...input(),profile:record},
    {...input(),identity:{target:{kind:'none'},current:{kind:'none'}}},
    {...input(),profile_snapshot_id:{...record}},
    {...input(),profile_snapshot_id:''},
    {...input(),profile_url:'https://www.instagram.com/p/'}
  ]) assert.equal((await run(body,{resolveSnapshot})).status,400);
  assert.equal(calls,0);
});

test('production feed enforces 3–15 photos and optional bounded prompt',async()=>{
  for(const count of [2,16]) assert.equal((await run(input(count))).status,400);
  for(const prompt of [null,42,'x'.repeat(2001)]) assert.equal((await run({...input(),prompt})).status,400);
  for(const count of [3,15]) for(const prompt of [undefined,'','  ','짧게, 조용하게']) {
    const body={...input(count),...(prompt===undefined?{}:{prompt})};
    const response=await run(body);
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    const result=await response.json();
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(result.feed.slots.map(s=>s.photo_id).sort(),body.photos.map(p=>p.photo_id).sort());
    assert.deepEqual(result.curation.slots.map(s=>s.photo_id),result.feed.slots.map(s=>s.photo_id));
    assert.ok(result.curation.slots.every(s=>s.included===true));
    assert.equal(result.context.target.source,prompt?.trim()?'freetext':'ig_reference');
    assert.equal(result.curation.profile.ownership_verified,false);
    assert.equal(result.curation.profile.source_url,snapshot.provenance.source_url);
    assert.equal(result.curation.profile.collected_at,snapshot.provenance.collected_at);
    assert.equal(result.curation.prompt.text,prompt?.trim()||null);
    assert.equal(result.context.current.source,'cached');
  }
});

test('production feed fails closed on unknown, private, unconfirmed and expired snapshots',async()=>{
  for(const found of [null,{...record,status:'private'},{...record,status:'unconfirmed'},{...record,source_url:'https://www.instagram.com/other/'},{...record,snapshot_id:'different'}]) {
    const response=await run(input(),{resolveSnapshot:async()=>found});
    assert.equal(response.status,422);
    assert.equal((await response.json()).error.code,'PROFILE_NOT_VERIFIED');
  }
  const response=await run(input(),{resolveSnapshot:async()=>({...record,expires_at:now})});
  assert.equal(response.status,422);
  assert.equal((await response.json()).error.code,'PROFILE_SNAPSHOT_EXPIRED');
});

test('production feed resolves only the submitted ID and rejects duplicate photo IDs',async()=>{
  const body=input();let received;
  const response=await run(body,{resolveSnapshot:async id=>{received=id;return record;}});
  assert.equal(response.status,200);assert.deepEqual(received,{url:body.profile_url,snapshotId:body.profile_snapshot_id});
  body.photos[1].photo_id=body.photos[0].photo_id;
  assert.equal((await run(body)).status,400);
});


test('G5 offline fixture preserves independently specified photo set, provenance, and caption compatibility',async()=>{
  for(const prompt of ['', '모든 사진에 문장을 써 줘, 짧게, 조용하게']) {
    const response=await run({...fixture.request,prompt});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.deepEqual(result.feed.slots.map(s=>s.photo_id).sort(),fixture.expected.photo_ids);
    assert.equal(result.context.target.source,prompt?fixture.expected.written_prompt_target_source:fixture.expected.blank_prompt_target_source);
    assert.ok(result.curation.slots.every(s=>s.included===fixture.expected.included));
    assert.deepEqual(result.curation.profile.evidence_refs,snapshot.provenance.evidence_refs);
    assert.equal(result.curation.profile.snapshot_id,snapshot.snapshot_id);
    assert.deepEqual(result.curation.prompt.evidence,prompt?[{kind:'user_text',ref:result.context.target.profile_id,note:'사용자가 입력한 큐레이션 방향'}]:[]);
    assert.equal(result.context.target.raw_freetext,prompt||null);
    if(prompt) assert.equal(result.context.target.language.caption_coverage.value,'all');
    validateGenerateRequest({schema_version:'1.0',mode:'all',feed:result.feed,context:result.context});
    // Equal semantic output across reruns; existing feed IDs and timestamps are runtime metadata.
    const again=await (await run({...fixture.request,prompt})).json();
    assert.deepEqual(again.curation,result.curation);
    assert.deepEqual(again.feed.slots,result.feed.slots);
  }
});

test('authenticated duplicate is only an exclusion candidate; forged hints cannot exclude',async()=>{
  const receiptSecret='g5-receipt-secret-32-characters-long';
  const body=input();
  for(const photo of body.photos) photo.analysis_receipt=createPhotoReceipt({analysis:photo,collection:'selected',digest:'a'.repeat(64),sessionId:body.session_id},receiptSecret);
  const result=await (await run(body,{receiptSecret})).json();
  assert.ok(result.curation.slots.some(s=>s.exclusion_candidate.recommended));
  assert.equal(result.curation.slots.length,3);
  assert.ok(result.curation.slots.every(s=>s.included===true));
  const forged=input();forged.photos[1].quality_flags.push('duplicate_of:'+forged.photos[0].photo_id);
  const safe=await (await run(forged,{receiptSecret})).json();
  assert.ok(safe.curation.slots.every(s=>!s.exclusion_candidate.recommended && s.included));
});

test('resolver errors never become fallback profiles or leak provider details',async()=>{
  for(const [code,status,publicCode] of [
    ['INVALID_SNAPSHOT_REFERENCE',422,'PROFILE_NOT_VERIFIED'],
    ['PROFILE_NOT_READY',422,'PROFILE_NOT_VERIFIED'],
    ['STORAGE_ERROR',503,'PROFILE_RESOLVER_UNAVAILABLE'],
    ['NOT_CONFIGURED',503,'PROFILE_RESOLVER_UNAVAILABLE'],
    ['unexpected',503,'PROFILE_RESOLVER_UNAVAILABLE']
  ]) {
    const response=await run(input(),{resolveSnapshot:async()=>{throw Object.assign(new Error('private provider detail'),{code});}});
    assert.equal(response.status,status);const body=await response.json();
    assert.equal(body.error.code,publicCode);
    assert.ok(!JSON.stringify(body).includes('private provider detail'));
  }
});

test('URL is a lookup reference, while malformed provenance and time fail closed',async()=>{
  for(const edit of [
    r=>{r.snapshot.provenance.method='client';},
    r=>{r.snapshot.provenance.actor='unknown';},
    r=>{r.snapshot.handle='other';},
    r=>{r.snapshot.posts=[];},
    r=>{r.collected_at='unknown';},
    r=>{r.expires_at='unknown';},
    r=>{r.collected_at='2027-01-01T00:00:00.000Z';},
    r=>{r.snapshot.provenance.collected_at='2026-09-18T08:00:00.000Z';}
  ]) {
    const modified=structuredClone(record);edit(modified);
    const response=await run(input(),{resolveSnapshot:async()=>modified});
    assert.equal(response.status,422);
    assert.equal((await response.json()).error.code,'PROFILE_NOT_VERIFIED');
  }
  const response=await run({...input(),profile_url:'https://instagram.com/G5_PUBLIC'});
  assert.equal(response.status,200);
});
