import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {buildFeed,handleAnalyze,handleFeed} from '../lib/pipeline.js';
import {validateFeedResponse,validateErrorResponse} from '../lib/interaction.js';
const fixture=JSON.parse(await readFile(new URL('../fixtures/interaction.sample.json',import.meta.url),'utf8'));
const input=(count=3)=>({schema_version:'1.0',session_id:'pipeline-test',photos:Array.from({length:count},(_,index)=>({...structuredClone(fixture.context.photos[index%3]),photo_id:'photo_'+index,input_index:index})),identity:{target:{kind:'none'},current:{kind:'none'}}});
const request=(path,body)=>new Request('http://localhost'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('3/20 actual input IDs survive photo-only and heuristic target/current paths without invented spatial observations',async()=>{
  for(const count of [3,20]) {
    const value=input(count);const result=await buildFeed(value);validateFeedResponse(result);
    assert.equal(result.feed.schema_version,'1.1');assert.deepEqual(result.feed.slots.map(s=>s.photo_id),value.photos.map(p=>p.photo_id));
    assert.equal(result.context.target.visual.scale_mix,undefined);assert.equal(result.feed.applied_profile.language,null);
    assert.ok(result.feed.slots.every(s=>s.rationale.value.includes('그대로')));
  }
  const value=input();value.identity.target={kind:'text',text:'자세하게, 기록하듯'};
  value.identity.current={kind:'posts',photos:[{...value.photos[0],photo_id:'old_photo',input_index:0}],captions:['짧은 기록']};
  const result=await buildFeed(value);validateFeedResponse(result);
  assert.equal(result.feed.applied_profile.corrected,true);assert.equal(result.context.current.visual.scale_mix,undefined);
  assert.ok(result.feed.applied_profile.deltas[0].evidence.some(e=>e.ref==='old_photo'));
});

test('model observations use composed ordering and preserve current-post evidence references',async()=>{
  const value=input();value.photos=value.photos.map(p=>({...p,analysis_source:'vision_model'}));
  value.identity.target={kind:'text',text:'자세하게, 기록하듯'};
  value.identity.current={kind:'posts',photos:[{...value.photos[0],photo_id:'old_photo',input_index:0}],captions:['짧은 기록']};
  const result=await buildFeed(value);validateFeedResponse(result);
  assert.equal(result.feed.applied_profile.corrected,true);
  assert.ok(result.feed.slots.every(s=>!s.rationale.value.includes('선택한 순서를 그대로')));
});

test('prepared references are exact and unprepared URLs never become another account',async()=>{
  const value=input();value.identity={target:{kind:'reference',url:'https://www.instagram.com/29cm/'},current:{kind:'reference',url:'https://www.instagram.com/29cm.official/'}};
  const result=await buildFeed(value);assert.equal(result.context.current.source,'cached');assert.equal(result.context.target.source,'ig_reference');
  for(const axis of ['current','target']) {
    const invalid=structuredClone(value);invalid.identity[axis].url='https://www.instagram.com/not_prepared_123/';
    const response=await handleFeed(request('/api/feed',invalid));assert.equal(response.status,422);
    const body=await response.json();validateErrorResponse(body);assert.equal(body.error.code,'REFERENCE_NOT_PREPARED');
  }
});

test('mock upload reads actual JPEG/PNG/WebP pixels, preserving ID and disabling provider even with a key',async()=>{
  const oldKey=process.env.ANTHROPIC_API_KEY,oldFetch=globalThis.fetch;
  process.env.ANTHROPIC_API_KEY='fake-key-never-sent';let calls=0;globalThis.fetch=()=>{calls++;throw new Error('network forbidden');};
  try {
    for(const [format,color] of [['jpeg','#ffffff'],['png','#000000'],['webp','#000000']]) {
      const bytes=await sharp({create:{width:16,height:16,channels:3,background:color}}).toFormat(format).toBuffer();
      const body={schema_version:'1.0',photo_id:'actual_'+format,input_index:0,file_ref:'actual.'+format,media_type:'image/'+format,image_base64:bytes.toString('base64')};
      const response=await handleAnalyze(request('/api/analyze?mock=1',body));assert.equal(response.status,200);
      const photo=await response.json();assert.equal(photo.photo_id,body.photo_id);assert.equal(photo.file_ref,body.file_ref);assert.equal(photo.analysis_source,'heuristic');
      assert.equal(response.headers.get('x-gyeol-analysis-reason'),'missing_api_key');
      assert.ok(format==='jpeg'?photo.color.bright_mean>0.95:photo.color.bright_mean<0.05);
    }
    assert.equal(calls,0);
  } finally {globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=oldKey;}
});

test('invalid upload and feed stay errors rather than empty successes',async()=>{
  for(const [handler,path,body,code] of [[handleAnalyze,'/api/analyze',{},'INVALID_REQUEST'],[handleAnalyze,'/api/analyze?mock=0',{},'INVALID_REQUEST'],[handleFeed,'/api/feed',input(2),'INVALID_REQUEST'],[handleFeed,'/api/feed',input(21),'INVALID_REQUEST']]) {
    const response=await handler(request(path,body));assert.equal(response.status,400);const result=await response.json();validateErrorResponse(result);assert.equal(result.error.code,code);
  }
});

// #69 순서 제안 실경로 연결. 합성 카드(fixtures/interaction.sample.json)는 15장이 서로 같은 값이라
// 순서 차이를 증명하지 못하므로, #12 가 실제 인스타 사진 20장을 측정해 남긴 test/order.real20.json 을 쓴다.
// 그 20장은 전부 analysis_source==='heuristic' 이다 — 즉 변경 전이라면 preserveOrder 로 빠지던 입력이다.
const real20=JSON.parse(await readFile(new URL('./order.real20.json',import.meta.url),'utf8'));
const realInput=(count,target)=>({schema_version:'1.0',session_id:'issue-69',
  photos:real20.slice(0,count).map((p,index)=>({...structuredClone(p),input_index:index})),
  identity:{target,current:{kind:'none'}}});
const ordered=feed=>[...feed.slots].sort((a,b)=>a.position-b.position).map(s=>s.photo_id);

test('#69 real HTTP path reorders 15 heuristic photos once a target exists, and two targets disagree',async()=>{
  const targets=[{kind:'text',text:'짧게, 조용하게'},{kind:'text',text:'자세하게, 기록하듯'}];
  const orders=[];
  for(const target of targets) {
    const body=realInput(15,target);
    const response=await handleFeed(request('/api/feed',body));
    assert.equal(response.status,200);
    const result=await response.json();validateFeedResponse(result);
    const feed=result.feed,order=ordered(feed);
    // D3: 15장 → 15슬롯, position 이 1..15 를 한 번씩.
    assert.equal(feed.slots.length,15);
    assert.deepEqual([...feed.slots].sort((a,b)=>a.position-b.position).map(s=>s.position),Array.from({length:15},(_,i)=>i+1));
    // 입력 순서 그대로가 아니다 — preserveOrder 로 빠지지 않았다는 실경로 증거.
    assert.notDeepEqual(order,body.photos.map(p=>p.photo_id),'입력 순서가 그대로다: 큐레이션이 꺼져 있다');
    assert.ok(feed.slots.every(s=>!s.rationale.value.includes('선택한 순서를 그대로')));
    // 자리마다 근거가 있고, 그 근거가 실제 입력 사진을 가리킨다.
    const ids=new Set(body.photos.map(p=>p.photo_id));
    for(const slot of feed.slots) {
      const photoEvidence=slot.rationale.evidence.filter(e=>e.kind==='uploaded_photo');
      assert.ok(photoEvidence.length>0,`slot ${slot.position} 에 사진 근거가 없다`);
      for(const e of photoEvidence) assert.ok(ids.has(e.ref),`slot ${slot.position} 근거 ref ${e.ref} 가 입력에 없다`);
    }
    orders.push(order);
  }
  // D6/S3: position 배열이 아니라 position 으로 정렬한 photo_id 배열을 비교한다.
  assert.notDeepEqual(orders[0],orders[1],'프로필 2벌이 같은 순서를 냈다: 프로필이 결과를 바꾸지 않는다');
});

test('#69 heuristic photos never have their constant composition reported as an observation',async()=>{
  const body=realInput(15,{kind:'text',text:'짧게, 조용하게'});
  assert.ok(body.photos.every(p=>p.analysis_source==='heuristic'));
  const {feed}=await (await handleFeed(request('/api/feed',body))).json();
  for(const slot of feed.slots) {
    assert.ok(!slot.rationale.value.includes('넓게 깔'),`slot ${slot.position} 문장이 관측 안 된 구도를 말한다`);
    for(const e of slot.rationale.evidence) assert.ok(!(e.note??'').includes('넓게 깔'),`slot ${slot.position} 근거가 관측 안 된 구도를 말한다`);
  }
  // 모델이 본 사진에서는 그대로 남는다 — 관측한 것까지 지우지 않았다.
  const seen=structuredClone(body);
  seen.photos=seen.photos.map(p=>({...p,analysis_source:'vision_model'}));
  const {feed:seenFeed}=await (await handleFeed(request('/api/feed',seen))).json();
  assert.ok(seenFeed.slots.some(s=>s.rationale.value.includes('넓게 깔')));
});

test('#69 photo-only input still keeps the input order, and the branch is the only one left',async()=>{
  const body=realInput(15,{kind:'none'});
  const {feed}=await (await handleFeed(request('/api/feed',body))).json();
  assert.deepEqual(ordered(feed),body.photos.map(p=>p.photo_id));
  assert.ok(feed.slots.every(s=>s.rationale.value.includes('그대로')));
  assert.ok(feed.slots.every(s=>s.rationale.evidence.some(e=>e.ref==='order.input_order')));
});
