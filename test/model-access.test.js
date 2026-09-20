import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {authenticateModelRequest,createModelRequestLimit,takeModelBudget} from '../lib/model-access.js';
import {handleProfileSession} from '../lib/profile-session.js';

const origin='https://gyeol.test';
const secret='fixture-browser-secret-independent-32-characters';
const epoch=1789732800000;
const browser={origin,secret,now:()=>epoch};
const limits={model:600};
const sessionLimits={model:40};
function memoryStorage() {
  const rows=new Map();let version=0,writes=0;
  return {async read(key){return structuredClone(rows.get(key)??null);},async write(key,value,{ifMatch}={}) {
    writes++;
    const old=rows.get(key);if(ifMatch?old?.etag!==ifMatch:old)return null;
    const row={value:structuredClone(value),etag:String(++version)};rows.set(key,row);return structuredClone(row);
  },snapshot(){return structuredClone([...rows.values()][0]?.value);},get writes(){return writes;}};
}
async function capability() {
  const response=await handleProfileSession(new Request(origin+'/api/profile/session',{method:'POST',headers:{
    'content-type':'application/json',origin,'sec-fetch-site':'same-origin',
  },body:'{}'}),{...browser,limiter:{take:async()=>{}}});
  const body=await response.json();
  return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:body.csrfToken};
}
const request=(headers={})=>new Request(origin+'/api/generate',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin',...headers}});

test('model admission reuses the signed browser capability and enforces durable session/global budgets',async()=>{
  const {cookie,csrf}=await capability();const storage=memoryStorage();
  const limiter=createModelRequestLimit({storage,now:()=>epoch,env:{
    GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR:String(limits.model),
    GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR:String(sessionLimits.model),
  }});
  const authorized=request({cookie,'x-gyeol-csrf':csrf});
  const sessionId=authenticateModelRequest(authorized,{browser});
  for(let i=0;i<sessionLimits.model;i++) await takeModelBudget(sessionId,{limiter});
  await assert.rejects(takeModelBudget(sessionId,{limiter}),{status:429});
  assert.throws(()=>authenticateModelRequest(request({cookie:cookie+'x','x-gyeol-csrf':csrf}),{browser}),{status:401});
});

test('server automation needs its separate credential and limiter failures stay closed',async()=>{
  const accessKey='fixture-model-server-key-independent-32-characters';let calls=0;
  const server=new Request(origin+'/api/generate',{method:'POST',headers:{authorization:`Bearer ${accessKey}`}});
  const sessionId=authenticateModelRequest(server,{accessKey});
  assert.match(sessionId,/^[a-f0-9]{64}$/);await takeModelBudget(sessionId,{limiter:{take:async()=>{calls++;}}});
  assert.equal(calls,1);
  await assert.rejects(takeModelBudget(sessionId,{limiter:{take:async()=>{throw new Error(secret);}}}),{status:503});
  assert.throws(()=>authenticateModelRequest(request({authorization:`Bearer ${accessKey}`}),{accessKey}),{status:401});
  assert.equal(calls,1);
});

test('eight independent workers sharing one session survive Blob CAS contention',async()=>{
  const storage=memoryStorage();const env={GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR:'100',GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR:'40'};
  const sessionId='a'.repeat(64);
  const results=await Promise.allSettled(Array.from({length:8},(_,index)=>
    createModelRequestLimit({storage,now:()=>epoch,env,salt:`same-${index}`}).take('model',sessionId)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,8);
  assert.equal(storage.snapshot().count,8);
  assert.deepEqual(Object.values(storage.snapshot().sessions),[8]);
  assert.ok(storage.writes<=24,`expected at most 24 writes, received ${storage.writes}`);
});

test('parallel model sessions fill but never exceed one atomic global budget',async()=>{
  const storage=memoryStorage();
  const env={GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR:'24',GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR:'1'};
  const results=await Promise.allSettled(Array.from({length:25},(_,index)=>
    createModelRequestLimit({storage,now:()=>epoch,env,salt:`distinct-${index}`})
      .take('model',index.toString(16).padStart(64,'0'))));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,24);
  assert.deepEqual(results.filter(result=>result.status==='rejected').map(result=>result.reason.status),[429]);
  assert.equal(storage.snapshot().count,24);
  assert.equal(Object.keys(storage.snapshot().sessions).length,24);
  assert.ok(storage.writes<=72,`expected at most 72 writes, received ${storage.writes}`);
});

test('model sessions sharing the legacy two-digit bucket keep independent exact budgets',async()=>{
  const seen=new Map();let pair;
  for(let value=0;!pair;value++) {
    const sessionId=value.toString(16).padStart(64,'0');
    const prefix=createHash('sha256').update(sessionId).digest('hex').slice(0,2);
    if(seen.has(prefix)) pair=[seen.get(prefix),sessionId];else seen.set(prefix,sessionId);
  }
  const storage=memoryStorage();const limiter=createModelRequestLimit({storage,now:()=>epoch,env:{
    GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR:'10',GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR:'1',
  }});
  await limiter.take('model',pair[0]);await limiter.take('model',pair[1]);
  await assert.rejects(limiter.take('model',pair[0]),{status:429});
  await assert.rejects(limiter.take('model',pair[1]),{status:429});
});

test('definite Blob throttling retries but unknown storage outcomes stay closed',async()=>{
  const base=memoryStorage();let throttled=true;
  const storage={read:base.read.bind(base),async write(...args) {
    if(throttled){throttled=false;throw Object.assign(new Error('throttled'),{code:'RATE_LIMITED',retryAfter:0});}
    return base.write(...args);
  }};
  const env={GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR:'2',GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR:'2'};
  await createModelRequestLimit({storage,now:()=>epoch,env,wait:async()=>{}}).take('model','b'.repeat(64));
  await assert.rejects(createModelRequestLimit({storage:{read:async()=>{throw new Error(secret);}},now:()=>epoch,env})
    .take('model','c'.repeat(64)),{status:503});
  assert.equal(base.snapshot().count,1);
});

test('missing or inverted deployment budgets fail closed',async()=>{
  const sessionId='a'.repeat(64);
  for(const env of [{},{GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR:'10',GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR:'11'}]) {
    await assert.rejects(takeModelBudget(sessionId,{env}),{status:503});
  }
});
