import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateOutput,handleGenerate} from '../lib/output-generation.js';
import {validateErrorResponse} from '../lib/interaction.js';
const fixture=JSON.parse(await readFile(new URL('../fixtures/interaction.sample.json',import.meta.url),'utf8'));
const input=(mode='all',source=fixture)=>({schema_version:'1.0',mode,feed:structuredClone(source.feed),context:structuredClone(source.context),...(mode==='slot'?{photo_id:'ph_01'}:{})});
const output=()=>({output:structuredClone(fixture.all_omitted)});
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
