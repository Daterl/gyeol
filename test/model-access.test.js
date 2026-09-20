import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {authenticateModelRequest,takeModelBudget} from '../lib/model-access.js';
import {handleProfileSession} from '../lib/profile-session.js';
import {createProfileRequestLimit} from '../lib/profile-request-limit.js';

const origin='https://gyeol.test';
const secret='fixture-browser-secret-independent-32-characters';
const epoch=1789732800000;
const browser={origin,secret,now:()=>epoch};
const limits={model:600};
const sessionLimits={model:40};
const modelEnv={GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR:'100',GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR:'40'};
function memoryStorage() {
  const rows=new Map();let version=0;
  return {async read(key){return structuredClone(rows.get(key)??null);},async write(key,value,{ifMatch}={}) {
    const old=rows.get(key);if(ifMatch?old?.etag!==ifMatch:old)return null;
    const row={value:structuredClone(value),etag:String(++version)};rows.set(key,row);return structuredClone(row);
  }};
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
  const limiter=createProfileRequestLimit({storage,now:()=>epoch,limits,sessionLimits});
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

test('eight parallel workers sharing one signed session survive durable CAS contention',async()=>{
  const {cookie,csrf}=await capability();const storage=memoryStorage();
  const sessionId=authenticateModelRequest(request({cookie,'x-gyeol-csrf':csrf}),{browser});
  const results=await Promise.allSettled(Array.from({length:8},()=>takeModelBudget(sessionId,{storage,now:()=>epoch,env:modelEnv})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,8);
});

test('model sessions sharing the legacy two-digit bucket keep independent exact budgets',async()=>{
  const seen=new Map();let pair;
  for(let value=0;!pair;value++) {
    const sessionId=value.toString(16).padStart(64,'0');
    const prefix=createHash('sha256').update(sessionId).digest('hex').slice(0,2);
    if(seen.has(prefix)) pair=[seen.get(prefix),sessionId];else seen.set(prefix,sessionId);
  }
  const storage=memoryStorage();const env={GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR:'10',GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR:'1'};
  await takeModelBudget(pair[0],{storage,now:()=>epoch,env});
  await takeModelBudget(pair[1],{storage,now:()=>epoch,env});
  await assert.rejects(takeModelBudget(pair[0],{storage,now:()=>epoch,env}),{status:429});
  await assert.rejects(takeModelBudget(pair[1],{storage,now:()=>epoch,env}),{status:429});
});

test('missing or inverted deployment budgets fail closed',async()=>{
  const sessionId='a'.repeat(64);
  for(const env of [{},{GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR:'10',GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR:'11'}]) {
    await assert.rejects(takeModelBudget(sessionId,{env}),{status:503});
  }
});
