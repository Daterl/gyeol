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
