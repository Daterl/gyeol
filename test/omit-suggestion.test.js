import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildFeed,handleFeed,handleAnalyze} from '../lib/pipeline.js';
import {validateFeedResponse} from '../lib/interaction.js';
import {analyzePhoto,resetAnalysisState} from '../lib/photo_analysis.js';
import {withOmitSuggestions} from '../lib/omit-suggestion.js';

const real=JSON.parse(await readFile(new URL('./order.real20.json',import.meta.url),'utf8'));
const input=(count=3,target={kind:'none'})=>({schema_version:'1.0',session_id:'omit-test',
  photos:structuredClone(real.slice(0,count)),identity:{target,current:{kind:'none'}}});
const suggestions=feed=>Object.fromEntries(feed.slots.map(s=>[s.photo_id,s.omit_suggestion]));
const post=body=>handleFeed(new Request('http://localhost/api/feed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));

test('zero observations means explicit zero suggestions on photo-only and target paths; 3/20 slots conserved',async()=>{
  for(const count of [3,20]) for(const target of [{kind:'none'},{kind:'text',text:'짧게, 조용하게'}]) {
    const value=input(count,target),before=structuredClone(value);
    const response=await post(value);assert.equal(response.status,200);
    const result=await response.json();validateFeedResponse(result);
    assert.equal(result.feed.slots.length,count);
    assert.deepEqual(new Set(result.feed.slots.map(s=>s.photo_id)),new Set(value.photos.map(p=>p.photo_id)));
    assert.equal(result.feed.omit_summary.recommended_count,0);
    assert.match(result.feed.omit_summary.message,/빼기를 권하는 사진은 없습니다/);
    assert.ok(result.feed.slots.every(s=>s.omit_suggestion.recommended===false && s.omit_suggestion.reason===null && s.omit_suggestion.evidence.length===0));
    assert.deepEqual(value,before);
  }
});

test('one-photo analyzer duplicate observation reaches both HTTP feed paths without removing slots',async()=>{
  resetAnalysisState();
  const bytes=await readFile(new URL('../eval/golden/case_01/photos/ph_01.svg',import.meta.url));
  const value=input();
  for(const i of [0,1]) {
    const {analysis}=await analyzePhoto({bytes,photoId:value.photos[i].photo_id,inputIndex:i,fileRef:'same-card.svg',apiKey:''});
    value.photos[i]=analysis;
  }
  assert.deepEqual(value.photos[1].quality_flags,['duplicate_of:ph_01']);
  for(const target of [{kind:'none'},{kind:'text',text:'자세하게, 기록하듯'}]) {
    value.identity.target=target;
    const response=await post(value);assert.equal(response.status,200);
    const result=await response.json();validateFeedResponse(result);
    const actual=suggestions(result.feed);
    assert.equal(result.feed.slots.length,3);
    assert.equal(result.feed.omit_summary.recommended_count,1);
    assert.equal(actual.ph_01.recommended,false);
    assert.equal(actual.ph_02.recommended,true);
    assert.deepEqual(actual.ph_02.evidence.map(e=>e.ref),['ph_02','ph_01']);
    assert.match(actual.ph_02.evidence[0].note,/duplicate_of:ph_01/);
  }
});

test('foreign, self, cyclic, chained and ambiguous duplicate observations abstain',async()=>{
  for(const flags of [
    [['duplicate_of:outside'],[],[]],
    [['duplicate_of:ph_01'],[],[]],
    [['duplicate_of:ph_02'],['duplicate_of:ph_01'],[]],
    [['duplicate_of:ph_02','duplicate_of:ph_03'],[],[]],
    [['duplicate_of:ph_02'],['duplicate_of:outside'],[]]
  ]) {
    const value=input();value.photos.forEach((p,i)=>{p.quality_flags=flags[i];});
    const {feed}=await buildFeed(value);
    assert.equal(feed.omit_summary.recommended_count,0);
    assert.equal(feed.omit_summary.message,'중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.');
  }
  const chain=input();chain.photos[0].quality_flags=['duplicate_of:ph_02'];chain.photos[1].quality_flags=['duplicate_of:ph_03'];
  const result=suggestions((await buildFeed(chain)).feed);
  assert.equal(result.ph_01.recommended,false);
  assert.equal(result.ph_02.recommended,true);
  assert.equal(result.ph_03.recommended,false);
});

test('heuristic defaults, dark/blurry flags, colour, profile and order cannot change omission decisions',async()=>{
  const value=input(15);value.photos[1].quality_flags=['duplicate_of:ph_01'];
  const baseline=suggestions((await buildFeed(value)).feed);
  for(const source of ['heuristic','vision_model']) {
    const changed=structuredClone(value);
    changed.photos=changed.photos.reverse().map((p,i)=>({...p,input_index:i,analysis_source:source,
      composition:'negative_space',scale:'fullshot',has_face:true,subjects:['unsupported default'],text_in_image:'ignored',
      color:{hue_mean:0,sat_mean:0,bright_mean:0,palette_hex:[]},quality_flags:[...p.quality_flags,'dark','blurry']}));
    changed.identity.target={kind:'text',text:'자세하게, 기록하듯'};
    assert.deepEqual(suggestions((await buildFeed(changed)).feed),baseline);
  }
});

test('extension validation rejects forged decisions, evidence, partial fields and wrong count; legacy feeds survive',async()=>{
  const value=input();value.photos[1].quality_flags=['duplicate_of:ph_01'];
  const result=await buildFeed(value);
  for(const mutate of [
    r=>{r.feed.slots[0].omit_suggestion.recommended=true;},
    r=>{r.feed.slots[1].omit_suggestion.evidence[0].ref='outside';},
    r=>{r.feed.slots[1].omit_suggestion.evidence[0].note='made up';},
    r=>{r.feed.omit_summary.recommended_count=0;},
    r=>{delete r.feed.slots[0].omit_suggestion;},
    r=>{delete r.feed.omit_summary;},
    r=>{r.context.photos[1].quality_flags=[];}
  ]) {
    const invalid=structuredClone(result);mutate(invalid);
    assert.throws(()=>validateFeedResponse(invalid));
  }
  const legacy=structuredClone(result);delete legacy.feed.omit_summary;
  legacy.feed.slots.forEach(s=>{delete s.omit_suggestion;});
  validateFeedResponse(legacy);
  const before=structuredClone(legacy.feed);
  const extended=withOmitSuggestions(legacy.feed,value.photos);
  assert.deepEqual(legacy.feed,before);
  extended.slots.forEach((s,i)=>{const {omit_suggestion,...existing}=s;assert.deepEqual(existing,before.slots[i]);});
});


test('consecutive upload requests preserve warm-cache observations in the zero-suggestion message',async()=>{
  resetAnalysisState();
  const bytes=await readFile(new URL('../fixtures/jpeg/gradient_baseline.jpg',import.meta.url));
  const observed=[];
  for(const photo_id of ['previous_request','current_request']) {
    const response=await handleAnalyze(new Request('http://localhost/api/analyze?mock=1',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({schema_version:'1.0',photo_id,input_index:0,file_ref:'gradient.jpg',
        media_type:'image/jpeg',image_base64:bytes.toString('base64')})
    }));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('X-Gyeol-Analysis-Cache'),observed.length?'hit':'miss');
    observed.push(await response.json());
  }
  assert.deepEqual(observed[0].quality_flags,[]);
  assert.deepEqual(observed[1].quality_flags,['duplicate_of:previous_request']);
  for(const target of [{kind:'none'},{kind:'text',text:'짧게, 조용하게'}]) {
    for(const [i,photo] of observed.entries()) {
      const value=input(3,target);value.photos[0]=photo;
      const response=await post(value);assert.equal(response.status,200);
      const result=await response.json();validateFeedResponse(result);
      assert.equal(result.feed.slots.length,3);
      assert.equal(result.feed.omit_summary.recommended_count,0);
      assert.equal(result.feed.omit_summary.message,i===0
        ? '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
        : '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.');
      assert.ok(result.feed.slots.every(slot=>!slot.omit_suggestion.recommended));
    }
  }
});
