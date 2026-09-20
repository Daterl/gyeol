import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {buildFeed,handleAnalyze,handleLegacyFeed as handleFeed} from '../lib/pipeline.js';
import {validateFeedResponse,validateErrorResponse} from '../lib/interaction.js';
const fixture=JSON.parse(await readFile(new URL('../fixtures/interaction.sample.json',import.meta.url),'utf8'));
const input=(count=3)=>({schema_version:'1.0',session_id:'pipeline-test',photos:Array.from({length:count},(_,index)=>({...structuredClone(fixture.context.photos[index%3]),photo_id:'photo_'+index,input_index:index})),identity:{target:{kind:'none'},current:{kind:'none'}}});
const request=(path,body)=>new Request('http://localhost'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('3/15 actual input IDs survive photo-only and heuristic target/current paths without invented spatial observations',async()=>{
  for(const count of [3,15]) {
    // fixtures/interaction.sample.json 3장은 밝기·채도·색상각이 서로 같다(팔레트만 다르다). 측정값이 사진을
    // 가르지 못하므로 #127 이후에도 입력 순서를 유지하고, 문장이 그 이유를 말한다.
    const value=input(count);const result=await buildFeed(value);validateFeedResponse(result);
    assert.equal(result.feed.schema_version,'1.1');assert.deepEqual(result.feed.slots.map(s=>s.photo_id),value.photos.map(p=>p.photo_id));
    assert.equal(result.context.target.visual.scale_mix,undefined);assert.equal(result.feed.applied_profile.language,null);
    assert.ok(result.feed.slots.every(s=>s.rationale.value.includes('그대로')));
    assert.ok(result.feed.slots.every(s=>s.rationale.evidence.some(e=>e.ref==='order.no_measured_difference')));
  }
  const value=input();value.identity.target={kind:'text',text:'자세하게, 기록하듯'};
  value.identity.current={kind:'posts',photos:[{...value.photos[0],photo_id:'old_photo',input_index:0}],captions:['짧은 기록']};
  const result=await buildFeed(value);validateFeedResponse(result);
  assert.equal(result.feed.applied_profile.corrected,false);assert.equal(result.feed.applied_profile.disclosure,'target_only');
  assert.deepEqual(result.feed.applied_profile.deltas,[]);assert.equal(result.context.current.visual.scale_mix,undefined);
  assert.equal(result.feed.applied_profile.current_profile_id,result.context.current.profile_id);
});

test('model observations keep target ordering while current stays target-only',async()=>{
  const value=input();value.photos=value.photos.map(p=>({...p,analysis_source:'vision_model'}));
  value.identity.target={kind:'text',text:'자세하게, 기록하듯'};
  value.identity.current={kind:'posts',photos:[{...value.photos[0],photo_id:'old_photo',input_index:0}],captions:['짧은 기록']};
  const result=await buildFeed(value);validateFeedResponse(result);
  assert.equal(result.feed.applied_profile.corrected,false);
  assert.equal(result.feed.applied_profile.disclosure,'target_only');
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
      const body={schema_version:'1.0',session_id:'pipeline-upload',collection:'selected',photo_id:'actual_'+format,input_index:0,file_ref:'actual.'+format,media_type:'image/'+format,image_base64:bytes.toString('base64')};
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
  assert.ok(seenFeed.slots.some(s=>s.rationale.evidence.some(e=>e.note.includes('넓게 깔'))));
});

// #127 이 이 갈래의 조건을 바꿨다 — "지향이 없으면" 에서 "관측된 차이가 없으면" 으로. 갈래 자체는 남아 있고
// 측정값이 사진을 가르지 못하는 입력(합성 카드 15장: 밝기·채도·색상각이 전부 같다)에서 여전히 입력 순서를 낸다.
test('#69 photo-only input still keeps the input order, and the branch is the only one left',async()=>{
  const body=input(15);
  assert.equal(new Set(body.photos.map(p=>`${p.color.bright_mean}|${p.color.sat_mean}|${p.color.hue_mean}`)).size,1);
  const {feed}=await (await handleFeed(request('/api/feed',body))).json();
  assert.deepEqual(ordered(feed),body.photos.map(p=>p.photo_id));
  assert.ok(feed.slots.every(s=>s.rationale.value.includes('그대로')));
  assert.ok(feed.slots.every(s=>s.rationale.evidence.some(e=>e.ref==='order.no_measured_difference')));
});

// #127 기본 진입 경로. 사진만 올린 실사진 15장은 업로드 순서와 다른 순서로 나오고, 자리마다 다른 근거가
// 그 사진의 PhotoAnalysis 로 역추적된다. 지향 경로와 달리 지향 방향·타이브레이크·캐러셀 보너스는 쓰지 않는다.
test('#127 photo-only input reorders real photos from what the photos themselves measure',async()=>{
  const body=realInput(15,{kind:'none'});
  const response=await handleFeed(request('/api/feed',body));
  assert.equal(response.status,200);
  const result=await response.json();validateFeedResponse(result);
  const feed=result.feed;
  assert.equal(feed.schema_version,'1.1');
  assert.equal(feed.applied_profile.target_profile_id,null);
  assert.equal(feed.applied_profile.photo_plan_id,result.context.target.plan_id);
  assert.equal(feed.applied_profile.language,null);
  // D3: 15장 → 15슬롯, position 1..15 를 한 번씩, 그리고 입력 순서가 아니다.
  assert.equal(feed.slots.length,15);
  assert.deepEqual([...feed.slots].sort((a,b)=>a.position-b.position).map(s=>s.position),Array.from({length:15},(_,i)=>i+1));
  assert.notDeepEqual(ordered(feed),body.photos.map(p=>p.photo_id),'사진만 올린 경로가 여전히 입력 순서를 낸다');
  // 15자리가 한 문장이 아니다. 그리고 이유가 "취향이 없어서"로 바뀌지 않았다.
  assert.ok(new Set(feed.slots.map(s=>s.rationale.value)).size>=5,'근거 문장이 5종 미만이다');
  assert.ok(feed.slots.every(s=>!s.rationale.value.includes('선택한 순서를 그대로')));
  // #109: 사용자에게 보이는 문장은 픽셀 수치를 읊지 않는다.
  for(const slot of feed.slots) assert.doesNotMatch(slot.rationale.value,/\d/,`slot ${slot.position} 문장이 수치를 읊는다`);
  // 첫 자리만 지향이 개입하는 자리다 — 지향이 없다는 사실을 그 자리에서 말한다.
  const opener=feed.slots.find(s=>s.position===1);
  assert.match(opener.rationale.value,/지향을 넣지 않아/);
  assert.ok(opener.rationale.evidence.some(e=>e.ref==='order.R1' && e.note.includes('지향 방향 점수는 쓰지 않았다')));
  // 없는 지향을 지어내지 않는다: 지향 색 타이브레이크와 캐러셀 보너스 문구가 없다.
  for(const slot of feed.slots) for(const e of slot.rationale.evidence)
    assert.ok(!(e.note??'').includes('지향이 잰 색') && !(e.note??'').includes('캐러셀'),`slot ${slot.position} 이 없는 지향을 말한다`);
  // 각 근거가 그 사진의 실제 측정값으로 역추적된다.
  const byId=new Map(body.photos.map(p=>[p.photo_id,p]));
  for(const slot of feed.slots) {
    const own=slot.rationale.evidence.filter(e=>e.kind==='uploaded_photo' && e.ref===slot.photo_id);
    assert.equal(own.length,1,`slot ${slot.position} 에 자기 사진 근거가 하나가 아니다`);
    const photo=byId.get(slot.photo_id);
    assert.ok(own[0].note.includes(`밝기 ${photo.color.bright_mean}`),`slot ${slot.position} 근거의 밝기가 입력과 다르다`);
    assert.ok(own[0].note.includes(`채도 ${photo.color.sat_mean}`),`slot ${slot.position} 근거의 채도가 입력과 다르다`);
    for(const e of slot.rationale.evidence.filter(e=>e.kind==='uploaded_photo')) assert.ok(byId.has(e.ref));
  }
});

// #127 회귀 — 지향이 있는 경로의 순서는 바뀌지 않는다. 두 지향의 결과 순서를 코드에 고정해 둔다
// (변경 전 develop 에서 실제로 받은 값이다).
test('#127 targeted ordering is byte-stable and photo-only never becomes the same decision',async()=>{
  const expected={
    quiet:['ph_11','ph_02','ph_09','ph_01','ph_03','ph_06','ph_13','ph_14','ph_04','ph_07','ph_08','ph_15','ph_12','ph_10','ph_05'],
    dense:['ph_07','ph_11','ph_02','ph_09','ph_01','ph_03','ph_06','ph_13','ph_14','ph_04','ph_15','ph_12','ph_10','ph_08','ph_05']
  };
  for(const [name,target] of [['quiet',{kind:'text',text:'짧게, 조용하게'}],['dense',{kind:'text',text:'자세하게, 기록하듯'}]]) {
    const {feed}=await (await handleFeed(request('/api/feed',realInput(15,target)))).json();
    assert.deepEqual(ordered(feed),expected[name],`지향 ${name} 의 순서가 바뀌었다`);
    assert.equal(feed.schema_version,'1.0');
    assert.ok(feed.slots.every(s=>!s.rationale.value.includes('지향을 넣지 않아')),`지향 ${name} 이 사진만 경로의 문장을 쓴다`);
  }
  // 지향이 결과를 바꾼다: 사진만 경로의 순서는 적어도 한 지향과 다르다.
  const {feed:plan}=await (await handleFeed(request('/api/feed',realInput(15,{kind:'none'})))).json();
  assert.notDeepEqual(ordered(plan),expected.dense);
});

// #69 교차 리뷰 P2. 혼합 배치(모델 관측 + 휴리스틱)에서 미관측 구도 상수가 순위를 갈랐고 근거 문장에는
// 나타나지 않았다. 아래 3장은 그 리뷰가 재현에 쓴 합성 계약 입력 그대로다 — real20 앞 3장을 복제하고
// ID·source·model·composition·밝기/채도만 바꿨다. dense 점수는 0.4*(1-flat)+0.4*sat+0.2*bright 이므로
// 관측된 두 값만으로는 observed(0.28) > unknown(0.18) 인데, 수정 전에는 unknown 의 상수 full_frame 이
// 붙인 0.4 가 순서를 뒤집어 unknown 이 1번이었다.
const mixed=target=>({schema_version:'1.0',session_id:'issue-69-p2',
  photos:[
    {photo_id:'dark',analysis_source:'vision_model',model:'claude-opus-5',composition:'negative_space',bright:0.1,sat:0.1},
    {photo_id:'observed',analysis_source:'vision_model',model:'claude-opus-5',composition:'negative_space',bright:0.8,sat:0.3},
    {photo_id:'unknown',analysis_source:'heuristic',model:'heuristic-jpeg-dc@1',composition:'full_frame',bright:0.5,sat:0.2}
  ].map((spec,index)=>{
    const photo=structuredClone(real20[index]);
    photo.photo_id=spec.photo_id;photo.input_index=index;
    photo.analysis_source=spec.analysis_source;photo.model=spec.model;photo.composition=spec.composition;
    photo.color.bright_mean=spec.bright;photo.color.sat_mean=spec.sat;
    return photo;
  }),
  identity:{target,current:{kind:'none'}}});

test('#69 P2 an unobserved composition constant must not decide the order in a mixed batch',async()=>{
  const body=mixed({kind:'text',text:'자세하게, 기록하듯'});
  const response=await handleFeed(request('/api/feed',body));
  assert.equal(response.status,200);
  const {feed}=await response.json();
  // 근거로 제시된 값(밝기·채도)만의 가중합 1위가 실제 1번이어야 한다. 수정 전에는 unknown 이었다.
  assert.equal(ordered(feed)[0],'observed','미관측 구도 상수가 첫 자리를 결정했다');
  // 그 상수는 문장에도 나타나면 안 된다 — 배치에 휴리스틱이 섞이면 관측된 사진의 구도도 비교 대상이 없다.
  for(const slot of feed.slots) {
    assert.ok(!slot.rationale.value.includes('넓게 깔'),`slot ${slot.position} 문장이 비교 불가능한 구도를 말한다`);
    for(const e of slot.rationale.evidence) assert.ok(!(e.note??'').includes('넓게 깔'),`slot ${slot.position} 근거가 비교 불가능한 구도를 말한다`);
  }
});

test('#69 P2 flipping an unobserved photo’s composition constant changes nothing',async()=>{
  const target={kind:'text',text:'자세하게, 기록하듯'};
  const base=mixed(target);
  const flipped=mixed(target);
  // 휴리스틱 사진의 composition 만 뒤집는다. 관측된 적 없는 값이므로 결과에 영향을 주면 안 된다.
  flipped.photos[2].composition='negative_space';
  const run=async body=>ordered((await (await handleFeed(request('/api/feed',body))).json()).feed);
  assert.deepEqual(await run(flipped),await run(base),'관측하지 않은 구도 값이 순서를 바꿨다');
});

// #144 integration of #145: content observations explain the preserved slot but
// must not change a tied measurement order or pretend they were ordering scores.
test('tied measurements preserve input order and never promote a model observation to the screen',async()=>{
  const body=input();
  body.photos=body.photos.map((photo,index)=>({...photo,analysis_source:'vision_model',model:'offline-fixture',describable_facts:[['가방이 보인다','신발이 놓여 있다','개가 앉아 있다'][index]]}));
  const {feed}=await buildFeed(body);
  assert.deepEqual(feed.slots.map(s=>s.photo_id),body.photos.map(p=>p.photo_id));
  for(const [index,slot] of feed.slots.entries()) {
    assert.match(slot.rationale.value,/그대로/);
    assert.ok(slot.rationale.evidence.some(e=>e.ref==='order.no_measured_difference'));
    // #109: 모델 관측은 화면 문장으로 올라오지 않는다. 캡션 재료로만 남는다.
    for(const photo of body.photos) assert.ok(!slot.rationale.value.includes(photo.describable_facts[0]));
    assert.deepEqual(slot.caption_inputs.describable_facts,body.photos[index].describable_facts);
    // 인용이 없으니 "그 인용은 근거가 아니다"라는 고지도 없다.
    assert.doesNotMatch(slot.rationale.value,/순서를 정한 근거는 아니|관측: /);
  }
});
