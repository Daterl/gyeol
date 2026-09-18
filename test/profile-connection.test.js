import test from 'node:test';
import assert from 'node:assert/strict';
import {handleProfileConnection} from '../lib/profile-connection.js';
const accessKey='fixture-only-access-key-32-characters';
const url='https://www.instagram.com/g5_public/';
const request=(body,authorization=`Bearer ${accessKey}`)=>new Request('http://localhost/api/profile',{method:'POST',headers:{'content-type':'application/json',authorization},body:JSON.stringify(body)});
const input={schema_version:'1.0',action:'connect',profile_url:url,confirmLive:true};

test('profile HTTP rejects missing authorization and paid-start consent before cache access',async()=>{
  let calls=0;const cache={connect:async()=>{calls++;}};
  for(const authorization of ['', 'Bearer wrong']) {
    const response=await handleProfileConnection(request(input,authorization),{accessKey,limiter:{take:async()=>{}},cache});assert.equal(response.status,401);
  }
  for(const body of [{...input,confirmLive:false},{...input,confirmLive:undefined},{...input,snapshot:{status:'public'}},{...input,receipt:'client'},{...input,refresh:'yes'}]) {
    const response=await handleProfileConnection(request(body),{accessKey,limiter:{take:async()=>{}},cache});assert.equal(response.status,400);
  }
  assert.equal(calls,0);
});

test('profile HTTP delegates connect and status, returning only safe cache connection metadata',async()=>{
  let connected,inspected;
  const cache={
    async connect(value){connected=value;return {status:'pending',expires_at:1789808400000,refresh_required:false};},
    async inspect(value){inspected=value;return {status:'public',snapshotId:'signed-reference',expires_at:1789808400000,refresh_required:false};}
  };
  const pending=await handleProfileConnection(request({...input,refresh:true}),{accessKey,limiter:{take:async()=>{}},cache});
  assert.equal(pending.status,202);assert.equal(pending.headers.get('cache-control'),'no-store');
  assert.deepEqual(connected,{url,refresh:true});
  const ready=await handleProfileConnection(request({schema_version:'1.0',action:'status',profile_url:url}),{accessKey,limiter:{take:async()=>{}},cache});
  assert.equal(ready.status,200);assert.deepEqual(inspected,{url});
  assert.deepEqual(await ready.json(),{status:'public',snapshotId:'signed-reference',expires_at:1789808400000,refresh_required:false});
});

test('profile HTTP keeps private/unconfirmed outcomes explicit and hides storage errors',async()=>{
  for(const status of ['private','unconfirmed','timeout','not_found','expired']) {
    const response=await handleProfileConnection(request(input),{accessKey,limiter:{take:async()=>{}},cache:{connect:async()=>({status,refresh_required:status==='expired'})}});
    assert.equal(response.status,200);assert.equal((await response.json()).status,status);
  }
  for(const code of ['STORAGE_ERROR','NOT_CONFIGURED']) {
    const response=await handleProfileConnection(request(input),{accessKey,limiter:{take:async()=>{}},cache:{connect:async()=>{throw Object.assign(new Error('secret details'),{code});}}});
    assert.equal(response.status,503);assert.ok(!JSON.stringify(await response.json()).includes('secret details'));
  }
  const invalid=await handleProfileConnection(request(input),{accessKey,limiter:{take:async()=>{}},cache:{connect:async()=>({status:'public',snapshot:{private:'payload'}})}});
  assert.equal(invalid.status,502);
});
