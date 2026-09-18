import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateOutput,handleGenerate} from '../lib/output-generation.js';
import {validateErrorResponse} from '../lib/interaction.js';
import {buildFeed} from '../lib/pipeline.js';
const fixture=JSON.parse(await readFile(new URL('../fixtures/interaction.sample.json',import.meta.url),'utf8'));
const input=(mode='all',source=fixture)=>({schema_version:'1.0',mode,feed:structuredClone(source.feed),context:structuredClone(source.context),...(mode==='slot'?{photo_id:'ph_01'}:{})});
const output=()=>({output:structuredClone(fixture.all_omitted)});
const filledOutput=(feed=fixture.feed)=>({output:{title:'세 장의 기록',slots:feed.slots.map(slot=>({
  photo_id:slot.photo_id,position:slot.position,caption_state:'filled',text:slot.caption_inputs.describable_facts[0],omit_reason:null,
  evidence:[{kind:'uploaded_photo',ref:slot.photo_id,note:'합성 fixture의 해당 카드'}]
}))}});
const orderInput=(target,current={kind:'none'},photos=fixture.context.photos)=>({
  schema_version:'1.0',session_id:'generate-test',photos:photos.map((photo,index)=>({...structuredClone(photo),photo_id:`new_${index}`,input_index:index})),
  identity:{target,current}
});
const currentPosts=captions=>({kind:'posts',captions,photos:captions.map((_,index)=>({
  ...structuredClone(fixture.context.photos[index%fixture.context.photos.length]),photo_id:`old_${index}`,input_index:index
}))});
const generatedInput=result=>({schema_version:'1.0',mode:'all',feed:result.feed,context:result.context});
const wire=value=>Response.json({model:'test-text-model',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}]});
const transport=(value,seen=[])=>async(url,options)=>{
  seen.push({url,options});
  return url.includes('/models/')?Response.json({id:'test-text-model',capabilities:{image_input:{supported:false},structured_outputs:{supported:true}}}):wire(value);
};
const options=value=>({apiKey:'fake-key',fetchImpl:transport(value)});
const request=value=>new Request('http://localhost/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});

test('all generation preserves each contract path and loads actual shared/output prompts',async()=>{
  const guard=await readFile(new URL('../prompts/shared/style_guard.md',import.meta.url),'utf8');
  for(const source of [fixture,fixture.photo_only,fixture.corrected]) {
    const seen=[];const expected=output();
    assert.deepEqual(await generateOutput(input('all',source),{apiKey:'fake-key',fetchImpl:transport(expected,seen)}),expected);
    assert.equal(seen.length,2);
    const body=JSON.parse(seen[1].options.body);
    assert.ok(body.system.includes(guard));assert.match(body.system,/정확히.*한/);
    assert.equal(body.output_config.format.type,'json_schema');
    const sent=JSON.parse(body.messages[0].content[0].text);
    assert.equal(sent.slots.length,3);assert.deepEqual(sent.applied_profile,source.feed.applied_profile);
    assert.equal(body.messages[0].content[0].type,'text');
  }
});

test('single slot sends only its photo and rejects other photo, position, user state or foreign evidence',async()=>{
  const valid={slot:structuredClone(fixture.output.slots[0])};const seen=[];
  assert.deepEqual(await generateOutput(input('slot'),{apiKey:'fake-key',fetchImpl:transport(valid,seen)}),valid);
  const sent=JSON.parse(JSON.parse(seen[1].options.body).messages[0].content[0].text);
  assert.deepEqual(sent.slots.map(s=>s.photo_id),['ph_01']);
  for(const patch of [{photo_id:'ph_02'},{position:2},{caption_state:'user'},{evidence:[{kind:'uploaded_photo',ref:'ph_02',note:'other photo'}]}]) {
    await assert.rejects(generateOutput(input('slot'),options({slot:{...valid.slot,...patch}})),{code:'MODEL_CONTRACT'});
  }
});

test('all generation stabilizes one evidence-backed omission without forcing other contexts',async()=>{
  const built=await buildFeed(orderInput({kind:'text',text:'짧게 기록해 줘'},currentPosts(['','기록'])));
  const requestInput=generatedInput(built);
  const provider=filledOutput(built.feed);
  const actual=await generateOutput(requestInput,options(provider));
  const omitted=actual.output.slots.filter(slot=>slot.caption_state==='omitted');
  assert.equal(omitted.length,1);
  assert.equal(omitted[0].photo_id,built.feed.slots.find(slot=>slot.position===2).photo_id);
  assert.match(omitted[0].omit_reason,/겹침 신호/);
  assert.doesNotMatch(omitted[0].omit_reason,/측정 색|설명/);
  assert.ok(omitted[0].evidence.some(e=>e.kind==='rule' && e.ref==='gyeol.omit.overlap'));
  assert.deepEqual(actual.output.slots.filter(slot=>slot.caption_state==='filled'),provider.output.slots.filter(slot=>slot.position!==2));

  for(const preserve of ['weak signal','first slot only']) {
    const current=input();
    current.feed.slots[1].caption_inputs.adjacent_overlap=preserve==='weak signal'?0.89:0.96;
    if(preserve==='first slot only') {
      current.feed.slots[0].caption_inputs.adjacent_overlap=0.96;
      current.feed.slots[1].caption_inputs.adjacent_overlap=0.89;
    }
    const fixtureProvider=filledOutput();
    assert.deepEqual(await generateOutput(current,options(fixtureProvider)),fixtureProvider,preserve);
  }
});

test('real feed context blocks stabilization without affirmative omission evidence',async()=>{
  const currentNoOmit=currentPosts(['기록','또 기록','계속 기록']);
  const exactCurrent=await buildFeed(orderInput({kind:'text',text:'차분한 느낌'},currentNoOmit));
  assert.equal(exactCurrent.feed.applied_profile.language,null);
  assert.equal(exactCurrent.context.current.language.empty_caption_ratio.value,0);

  const supportedCurrent=await buildFeed(orderInput({kind:'text',text:'짧게 기록해 줘'},currentNoOmit));
  assert.ok(supportedCurrent.feed.applied_profile.language);
  assert.equal(supportedCurrent.context.current.language.empty_caption_ratio.value,0);

  const colors=[
    {hue_mean:0,sat_mean:0,bright_mean:0,palette_hex:['#000000']},
    {hue_mean:0,sat_mean:0,bright_mean:1,palette_hex:['#ffffff']},
    {hue_mean:300,sat_mean:1,bright_mean:0.5,palette_hex:['#ff00ff']}
  ];
  const photoOnlyPhotos=fixture.context.photos.map((photo,index)=>({...structuredClone(photo),color:colors[index],describable_facts:['같은 사실']}));
  const photoOnly=await buildFeed(orderInput({kind:'none'},{kind:'none'},photoOnlyPhotos));
  assert.deepEqual(photoOnly.feed.slots.map(slot=>slot.caption_inputs.adjacent_overlap),[0,1,1]);
  assert.equal(photoOnly.feed.applied_profile.language,null);

  const unsupportedAll=await buildFeed(orderInput({kind:'text',text:'모든 사진에 문장을 써 줘'}));
  assert.equal(unsupportedAll.context.target.language,null);

  const detailed=await buildFeed(orderInput({kind:'text',text:'자세하게 기록해 줘'}));
  assert.equal(detailed.context.target.language.caption_len.value.p50,90);

  const smallRatio=await buildFeed(orderInput({kind:'text',text:'짧게 기록해 줘'},currentPosts(['','기록','기록','기록','기록'])));
  assert.equal(smallRatio.context.current.language.empty_caption_ratio.value,0.2);

  for(const [label,built] of [['exact current',exactCurrent],['supported current',supportedCurrent],['photo only',photoOnly],['unsupported all captions',unsupportedAll],['detailed captions',detailed],['less than one expected omission',smallRatio]]) {
    const provider=filledOutput(built.feed);
    assert.deepEqual(await generateOutput(generatedInput(built),options(provider)),provider,label);
  }
});

test('client overlap cannot replace the canonical color measurement',async()=>{
  const colors=[
    {hue_mean:0,sat_mean:0,bright_mean:1,palette_hex:['#ffffff']},
    {hue_mean:0,sat_mean:0,bright_mean:0.066,palette_hex:['#111111']},
    {hue_mean:180,sat_mean:1,bright_mean:0,palette_hex:['#000000']}
  ];
  const photos=fixture.context.photos.map((photo,index)=>({...structuredClone(photo),color:colors[index]}));
  const built=await buildFeed(orderInput({kind:'text',text:'짧게 기록해 줘'},currentPosts(['','기록']),photos));
  assert.deepEqual([...built.feed.slots].sort((a,b)=>a.position-b.position).map(slot=>slot.caption_inputs.adjacent_overlap),[0,0.533,0.667]);
  built.feed.slots.find(slot=>slot.position===2).caption_inputs.adjacent_overlap=1;
  const provider=filledOutput(built.feed);
  assert.deepEqual(await generateOutput(generatedInput(built),options(provider)),provider);
});

test('existing omissions and single-slot generation are preserved',async()=>{
  const all=input();
  all.feed.slots[1].caption_inputs.adjacent_overlap=0.96;
  const already=output();
  assert.deepEqual(await generateOutput(all,options(already)),already);

  const single=input('slot');
  single.feed.slots[0].caption_inputs.adjacent_overlap=0.96;
  const response={slot:structuredClone(fixture.output.slots[0])};
  assert.deepEqual(await generateOutput(single,options(response)),response);
});

test('invalid input, missing key and HTTP method fail without provider calls',async()=>{
  let calls=0;const noCalls={apiKey:'',fetchImpl:()=>{calls++;throw new Error('no network');}};
  for(const [req,status,code] of [
    [request({}),400,'INVALID_REQUEST'],[request(input()),503,'GENERATION_UNAVAILABLE'],
    [new Request('http://localhost/api/generate'),405,'METHOD_NOT_ALLOWED'],
    [new Request('http://localhost/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(250001)}),413,'REQUEST_TOO_LARGE'],
    [new Request('http://localhost/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'}),400,'INVALID_REQUEST']
  ]) {
    const response=await handleGenerate(req,noCalls);assert.equal(response.status,status);
    const body=await response.json();validateErrorResponse(body);assert.equal(body.error.code,code);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(calls,0);
});

test('HTTP full/slot success uses the shared runtime contract without caching',async()=>{
  let posts=0;const fetchImpl=async(url,init)=>{
    if(url.includes('/models/'))return Response.json({id:'test-model'});
    posts++;const mode=JSON.parse(JSON.parse(init.body).messages[0].content[0].text).mode;
    return wire(mode==='all'?output():{slot:fixture.output.slots[0]});
  };
  for(const mode of ['all','slot','all']) {
    const response=await handleGenerate(request(input(mode)),{apiKey:'fake-key',fetchImpl});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),mode==='all'?output():{slot:fixture.output.slots[0]});
  }
  assert.equal(posts,3);
});

test('timeout, malformed provider JSON and model contract violations use honest HTTP errors',async()=>{
  for(const [fetchImpl,code,status] of [
    [()=>new Promise(()=>{}),'MODEL_TIMEOUT',504],
    [async()=>new Response('bad'),'MODEL_JSON',502],
    [transport({output:{title:'two\nlines',slots:fixture.all_omitted.slots}}),'MODEL_CONTRACT',502],
    [transport({output:{title:'one',slots:[]}}),'MODEL_CONTRACT',502],
    [async()=>Response.json({error:'private-provider-secret'},{status:401}),'MODEL_HTTP',502]
  ]) {
    const response=await handleGenerate(request(input()),{apiKey:'fake-key',fetchImpl,timeoutMs:20});
    assert.equal(response.status,status);const body=await response.json();validateErrorResponse(body);
    assert.equal(body.error.code,code);assert.ok(!JSON.stringify(body).includes('private-provider-secret'));
  }
});
