import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import handler from '../api/feed.js';
async function call(url,method='GET') {
  const headers={}; let body;
  const res={statusCode:200,setHeader:(key,value)=>headers[key]=value,end:value=>{body=JSON.parse(value);}};
  await handler({url,method},res); return {status:res.statusCode,headers,body};
}
test('GET mock returns 15 slots and all four resources',async()=>{
  const response=await call('/api/feed?mock=1'); assert.equal(response.status,200);assert.equal(response.body.slots.length,15);
  for(const name of ['photo_analysis','target_profile','current_profile']) {
    const r=await call(`/api/feed?mock=1&resource=${name}`);assert.equal(r.status,200);assert.ok(Array.isArray(r.body));
  }
});
test('live is explicit error, invalid query and method are controlled',async()=>{
  const live=await call('/api/feed');assert.equal(live.status,501);assert.equal(live.body.error.code,'LIVE_NOT_IMPLEMENTED');
  for(const query of ['mock=0','mock=true','mock=','mock=1&mock=1','mock=1&resource=unknown','mock=1&resource=target_profile&resource=current_profile']) assert.equal((await call('/api/feed?'+query)).status,400);
  const post=await call('/api/feed?mock=1','POST');assert.equal(post.status,405);assert.equal(post.headers.Allow,'GET');
});
test('mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts',()=>{
  const script=`
    import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; import dns from 'node:dns';
    let attempts=0; const denied=()=>{attempts++;throw new Error('Network disabled');};
    globalThis.fetch=denied;
    net.connect=net.createConnection=net.Socket.prototype.connect=denied;
    http.request=http.get=https.request=https.get=denied;
    dns.lookup=dns.resolve=dns.promises.lookup=dns.promises.resolve=denied;
    const {mockResource}=await import('./api/feed.js');
    for(const resource of ['ordered_feed','photo_analysis','target_profile','current_profile']) await mockResource(resource);
    if(attempts!==0) throw new Error('Outbound attempted');
    console.log('outbound attempts: '+attempts);
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/outbound attempts: 0/);
});
