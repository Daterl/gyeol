import test from 'node:test';
import assert from 'node:assert/strict';
import {handleProfileSession,authorizeProfileBrowser} from '../lib/profile-session.js';
import {handleProfileConnection} from '../lib/profile-connection.js';
import {createProfileRequestLimit} from '../lib/profile-request-limit.js';
import {createPrivateBlobStorage} from '../lib/profile-cache-storage.js';

const origin='https://gyeol.test';
const secret='fixture-browser-secret-independent-32-characters';
const accessKey='fixture-automation-key-at-least-32-characters';
const epoch=1789732800000;
const noop={take:async()=>{}};
const options={origin,secret,now:()=>epoch,limiter:noop};
const request=(path='/api/profile/session',body={},extra={})=>new Request(origin+path,{method:'POST',headers:{'content-type':'application/json',origin,'sec-fetch-site':'same-origin',...extra},body:JSON.stringify(body)});
const input={schema_version:'1.0',action:'connect',profile_url:'https://www.instagram.com/public.test/',confirmLive:true};
function memoryStorage() {
  const rows=new Map();let version=0;
  return {rows,async read(key){return structuredClone(rows.get(key)??null);},async write(key,value,{ifMatch}={}) {
    const old=rows.get(key);if(ifMatch?old?.etag!==ifMatch:old)return null;
    const row={value:structuredClone(value),etag:String(++version)};rows.set(key,row);return structuredClone(row);
  }};
}
async function bootstrap() {
  const response=await handleProfileSession(request(),options);
  assert.equal(response.status,200);
  const {csrfToken,expires_at}=await response.json();
  return {response,cookie:response.headers.get('set-cookie').split(';')[0],csrfToken,expires_at};
}

test('bootstrap provides only CSRF and expiry; signed host cookie is HttpOnly Secure Strict and reusable',async()=>{
  const {response,cookie,csrfToken,expires_at}=await bootstrap();
  assert.equal(expires_at,epoch+1800000);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(response.headers.get('set-cookie'),/^__Host-gyeol-profile=.*; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800$/);
  const repeat=await handleProfileSession(request(undefined,{}, {cookie}),options);
  assert.deepEqual(await repeat.json(),{csrfToken,expires_at});
  assert.equal(repeat.headers.get('set-cookie'),response.headers.get('set-cookie'));
  assert.ok(![cookie,csrfToken].some(s=>s.includes(secret)||s.includes(accessKey)));
});

test('bootstrap rejects cross-site, sibling-site, missing/null origin and spoofed target before limits',async()=>{
  let calls=0;const limiter={take:async()=>{calls++;}};
  for(const extra of [{origin:'https://evil.test'},{origin:'null'},{'sec-fetch-site':'same-site'},{'sec-fetch-site':'cross-site'}]) {
    assert.equal((await handleProfileSession(request(undefined,{},extra),{...options,limiter})).status,403);
  }
  const missing=request();missing.headers.delete('origin');
  assert.equal((await handleProfileSession(missing,{...options,limiter})).status,403);
  const wrongUrl=new Request('https://attacker.test/api/profile/session',request());
  assert.equal((await handleProfileSession(wrongUrl,{...options,limiter})).status,403);
  assert.equal(calls,0);
  for(const override of [{secret:''},{origin:origin+'/'},{origin:'http://gyeol.test'}]) assert.equal((await handleProfileSession(request(),{...options,...override})).status,503);
});

test('browser capability authenticates profile without a bearer secret and hides extra cache fields',async()=>{
  const {cookie,csrfToken}=await bootstrap();let calls=0;const charged=[];
  const cache={connect:async()=>{calls++;return {status:'public',snapshotId:'safe-snapshot',expires_at:epoch+10000,refresh_required:false,receipt:accessKey,secret};}};
  const response=await handleProfileConnection(request('/api/profile',input,{cookie,'x-gyeol-csrf':csrfToken}),
    {accessKey,cache,browser:options,limiter:{take:async(...args)=>charged.push(args)}});
  assert.equal(response.status,200);assert.equal(calls,1);assert.equal(charged[0][0],'connect');assert.match(charged[0][1],/^[a-f0-9]{64}$/);
  assert.deepEqual(await response.json(),{status:'public',snapshotId:'safe-snapshot',expires_at:epoch+10000,refresh_required:false});
});

test('tampered expired duplicate cookies, bad CSRF and wrong origin fail before limiter/provider',async()=>{
  const {cookie,csrfToken}=await bootstrap();let calls=0;
  const dependencies={accessKey,browser:options,cache:{connect:async()=>{calls++;}},limiter:{take:async()=>{calls++;}}};
  for(const [extra,status,browser] of [
    [{cookie:cookie+'x','x-gyeol-csrf':csrfToken},401],
    [{cookie:cookie+'; '+cookie,'x-gyeol-csrf':csrfToken},401],
    [{cookie,'x-gyeol-csrf':'wrong'},403],
    [{cookie,'x-gyeol-csrf':csrfToken,origin:'https://evil.test'},403],
    [{cookie,'x-gyeol-csrf':csrfToken,'sec-fetch-site':'same-site'},403],
    [{cookie,'x-gyeol-csrf':csrfToken},401,{...options,now:()=>epoch+1800000}],
    [{cookie,'x-gyeol-csrf':csrfToken},401,{...options,now:()=>epoch-1}],
    [{cookie,'x-gyeol-csrf':csrfToken,authorization:'Bearer wrong'},401],
    [{cookie,'x-gyeol-csrf':csrfToken,authorization:`Bearer ${accessKey}`},403]
  ]) {
    const response=await handleProfileConnection(request('/api/profile',input,extra),{...dependencies,...(browser?{browser}:{})});
    assert.equal(response.status,status);
  }
  const other=await bootstrap();assert.throws(()=>authorizeProfileBrowser(request('/api/profile',input,{cookie:other.cookie,'x-gyeol-csrf':csrfToken}),options),{status:403});
  assert.equal(calls,0);
});

test('durable counters survive instances, window reset and cookie churn; concurrent admissions never overshoot',async()=>{
  let time=epoch;const storage=memoryStorage();
  const config={storage,now:()=>time,limits:{connect:3}};
  const results=await Promise.allSettled(Array.from({length:15},(_,i)=>createProfileRequestLimit(config).take('connect','session-'+i)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
  assert.ok(results.filter(r=>r.status==='rejected').every(r=>[429,503].includes(r.reason.status)));
  await assert.rejects(createProfileRequestLimit(config).take('connect','fresh-cookie'),{status:429});
  time+=3600000;await createProfileRequestLimit(config).take('connect','fresh-cookie');
  const scoped=createProfileRequestLimit({storage:memoryStorage(),now:()=>epoch,limits:{status:100},sessionLimits:{status:2}});
  await scoped.take('status','same');await scoped.take('status','same');await assert.rejects(scoped.take('status','same'),{status:429});
});

test('session denials cannot consume the global allowance for another session',async()=>{
  const limiter=createProfileRequestLimit({storage:memoryStorage(),now:()=>epoch,limits:{connect:5},sessionLimits:{connect:2}});
  await limiter.take('connect','attacker');await limiter.take('connect','attacker');
  for(let attempt=0;attempt<20;attempt++) await assert.rejects(limiter.take('connect','attacker'),{status:429});
  await limiter.take('connect','victim');
});

test('storage ambiguity, malformed durable state and contention fail closed; limits are isolated from cache',async()=>{
  for(const storage of [
    {read:async()=>{throw new Error(secret);}},
    {read:async()=>({etag:'v',value:{version:1,window:0,count:-1}})},
    {read:async()=>null,write:async()=>null},
    {read:async()=>null,write:async()=>{throw new Error(secret);}}
  ]) {
    await assert.rejects(createProfileRequestLimit({storage}).take('connect','s'),{status:503});
  }
  const token='vercel_blob_rw_fixturestore_fixture';let calls=0;
  const storage=createPrivateBlobStorage({token,namespace:'profile-request-limit',fetchImpl:async()=>{calls++;return new Response(null,{status:404});}});
  await assert.rejects(storage.read('profile-cache/v1/'+'a'.repeat(64)+'.json'),{code:'INVALID_STORAGE_PATH'});
  assert.equal(await storage.read('profile-request-limit/v1/'+'a'.repeat(64)+'.json'),null);assert.equal(calls,1);
});

test('HTTP limit failure includes Retry-After and never calls provider; unavailable storage leaks no detail',async()=>{
  const {cookie,csrfToken}=await bootstrap();let calls=0;
  const storage=memoryStorage();const limiter=createProfileRequestLimit({storage,now:()=>epoch,limits:{connect:1}});
  await limiter.take('connect');
  const response=await handleProfileConnection(request('/api/profile',input,{cookie,'x-gyeol-csrf':csrfToken}),
    {accessKey,browser:options,limiter,cache:{connect:async()=>{calls++;}}});
  assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0);assert.equal(calls,0);
  const failed=await handleProfileSession(request(),{...options,limiter:createProfileRequestLimit({storage:{read:async()=>{throw new Error(secret);}}})});
  assert.equal(failed.status,503);assert.ok(!JSON.stringify(await failed.json()).includes(secret));
});
