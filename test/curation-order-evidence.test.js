import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {handleFeed} from '../lib/pipeline.js';

const fixture=JSON.parse(await readFile(new URL('../fixtures/curation.sample.json',import.meta.url),'utf8'));
const photos=JSON.parse(await readFile(new URL('./order.real20.json',import.meta.url),'utf8')).slice(0,15);
// Deliberately synthetic caption populations, not claims about live accounts.
const records=new Map(['short','long','empty'].map((name,index)=>{
  const record=structuredClone(fixture.resolution);
  record.snapshot_id=`offline-${name}`;
  record.snapshot.snapshot_id=`offline-snapshot-${name}`;
  record.snapshot.posts.forEach((post,i)=>{
    post.shortCode=post.shortcode=`${name}-${i}`;
    post.caption=index===0?'짧은 기록':index===1?'오래 걸으며 만난 장면을 차근차근 기록합니다. '.repeat(8):'';
  });
  return [record.snapshot_id,record];
}));
const order=result=>[...result.feed.slots].sort((a,b)=>a.position-b.position).map(s=>s.photo_id);

// Actual loopback HTTP, same handleFeed as the Next POST route; the resolver is offline.
test('#69 public snapshots reach ordering with traceable captions and honest missing-palette disclosure',async t=>{
  let resolutions=0;
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req) chunks.push(chunk);
    const response=await handleFeed(new Request(`http://localhost${req.url}`,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}),{
      now:()=>Date.parse(fixture.now),
      resolveSnapshot:async({snapshotId})=>{resolutions++;return structuredClone(records.get(snapshotId));}
    });
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const post=async(snapshotId,prompt)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/feed`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...fixture.request,photos,profile_snapshot_id:snapshotId,...(prompt?{prompt}:{})})
    });
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');return response.json();
  };
  try {
    const short=await post('offline-short'),long=await post('offline-long');
    for(const [result,name] of [[short,'short'],[long,'long']]) {
      const snapshot=records.get(`offline-${name}`).snapshot;
      assert.deepEqual(result.context.target.visual,{});
      assert.equal(result.context.target.completeness.visual,0);
      assert.deepEqual(result.feed.applied_profile.language,result.context.target.language);
      assert.deepEqual([...order(result)].sort(),photos.map(p=>p.photo_id).sort());
      assert.notDeepEqual(order(result),photos.map(p=>p.photo_id));
      const opener=result.feed.slots[0];
      assert.match(opener.rationale.value,/프로필의 색은 측정하지 않아/);
      assert.ok(opener.rationale.evidence.some(e=>e.ref==='order.profile_palette_unavailable' && e.kind==='rule'));
      assert.ok(opener.rationale.evidence.some(e=>e.kind==='aggregate' && e.ref===snapshot.snapshot_id));
      assert.ok(opener.rationale.evidence.some(e=>e.kind==='ig_post' && snapshot.posts.some(p=>p.shortCode===e.ref)));
      assert.match(opener.rationale.evidence.find(e=>e.ref==='order.R1').note,/언어축을 건너 읽은 해석/);
      for(const slot of result.feed.slots) for(const e of slot.rationale.evidence) {
        if(e.kind==='uploaded_photo') assert.ok(photos.some(p=>p.photo_id===e.ref));
        if(e.kind==='ig_post') assert.ok(snapshot.posts.some(p=>p.shortCode===e.ref));
        if(e.kind==='aggregate') assert.equal(e.ref,snapshot.snapshot_id);
      }
      assert.equal(result.curation.profile.ownership_verified,false);
    }
    assert.notDeepEqual(order(short),order(long));
    t.diagnostic(JSON.stringify({input:photos.map(p=>p.photo_id),short:order(short),long:order(long)}));
    assert.deepEqual((await post('offline-short')).feed.slots,short.feed.slots);
    const empty=await post('offline-empty');
    assert.equal(empty.context.target.language,null);
    assert.match(empty.feed.slots[0].rationale.evidence.find(e=>e.ref==='order.R1').note,/캡션 길이 근거가 없어/);
    assert.ok(!empty.feed.slots[0].rationale.evidence.some(e=>e.kind==='ig_post'));
    // Explicit prompt owns the target; changing the connected caption population cannot invent a palette.
    const prompt='차분하게 짧게';
    const a=await post('offline-short',prompt),b=await post('offline-long',prompt);
    assert.deepEqual(a.feed.slots,b.feed.slots);
    assert.equal(a.context.target.visual.palette,undefined);
    assert.ok(a.feed.slots[0].rationale.evidence.some(e=>e.kind==='user_text'));
    assert.equal(resolutions,6);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
