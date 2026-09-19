// Offline replay: recorded REAL-photo analyses, current functions, FAKE generation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {placementVoice} from '../lib/curation-voice.js';
import {composeFeed} from '../lib/compose.js';
import {buildCurrentProfile} from '../lib/current_profile.js';
import {extractFromReference,extractFromFreetext} from '../lib/target_profile.js';
import {generateOutput,NO_FACTS_NOTE} from '../lib/output-generation.js';
const source='docs/specs/101-caption-quality/inputs.json';
const sourceBytes=await readFile(new URL(`../${source}`,import.meta.url));
const snapshot=JSON.parse(await readFile(new URL('../fixtures/ig_snapshot.json',import.meta.url),'utf8'));
const sourcePhotos=JSON.parse(sourceBytes)[0].request.context.photos;
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const human=()=>({fields:{title:null,caption:null,omission:null,exclusion:null,rationale:null},verdict:null,reviewer:null,reviewed_at:null,unsupported_claim_count:null,notes:null});
const acceptance=()=>({live_model:'PENDING',human:'PENDING',unsupported_claim_count:null});
const rowsFor=(photos,feed,generated)=>feed.slots.map(slot=>({
  photo_id:slot.photo_id,position:slot.position,
  file_ref:photos.find(p=>p.photo_id===slot.photo_id).file_ref,
  observations:photos.find(p=>p.photo_id===slot.photo_id).describable_facts,
  title:generated.output.title,title_provenance:'FAKE transport; no factual attribution established',
  caption:generated.output.slots.find(p=>p.photo_id===slot.photo_id),
  exclusion:{included:true,...slot.omit_suggestion},
  rationale:slot.rationale,human:human()
}));
export function sameObservationProbe() {
  const photos=Array.from({length:15},(_,i)=>({...structuredClone(sourcePhotos[0]),photo_id:`control_${i}`,input_index:i}));
  const rows=photos.map((p,i)=>({photo_id:p.photo_id,...placementVoice(p,photos[i-1],i===0?'opener':i===14?'closer':'sustain',photos[i+1])}));
  return {provenance:'SYNTHETIC control: one recorded observation cloned 15 times, not 15 independently analyzed photos',unique_rationale_count:new Set(rows.map(r=>r.value)).size,rows};
}
export async function buildArtifact() {
  const runs=[];
  for(const count of [3,15]) for(const prompt of ['blank','written']) {
    const photos=structuredClone(sourcePhotos.slice(0,count));
    const input={schema_version:'1.0',session_id:`offline-${count}-${prompt}`,photos,
      identity:{current:{kind:'reference',url:'https://www.instagram.com/29cm.official/'},
        target:prompt==='blank'?{kind:'reference',url:'https://www.instagram.com/29cm.official/'}:{kind:'text',text:'짧게, 조용하게'}}};
    const current=buildCurrentProfile({snapshot});
    const target=prompt==='blank'
      ?await extractFromReference(input.identity.target.url,{registry:{'29cm.official':{...snapshot,snapshot_id:`apify_run:${snapshot.provenance.source_run}`,posts:snapshot.posts.map(p=>({...p,shortCode:p.shortcode}))}}})
      :extractFromFreetext(input.identity.target.text);
    const built={feed:composeFeed({photoAnalyses:photos,targetProfile:target,currentProfile:current,currentPhotoAnalyses:[],sessionId:input.session_id}),context:{photos,current,target,current_photos:[]}};
    // Same injected transport shape as test/generate.test.js; never delegates to fetch.
    const fake={output:{title:'사진 기록',slots:built.feed.slots.map((slot,index)=>{
      const fact=slot.caption_inputs.describable_facts[0];
      const omitted=index===0||!fact;
      return {photo_id:slot.photo_id,position:slot.position,caption_state:omitted?'omitted':'seed',
        text:omitted?null:`쓸 거리: ${fact}\n이 중 기억에 남은 건?`,
        omit_reason:omitted?'사진만 두는 선택을 제안해요.':null,
        evidence:[{kind:'uploaded_photo',ref:slot.photo_id,note:fact??NO_FACTS_NOTE}]};
    })}};
    let fakeRequests=0;
    const generated=await generateOutput({schema_version:'1.0',mode:'all',...built},{apiKey:'offline-fake-key',fetchImpl:async url=>{
      fakeRequests++;
      return url.includes('/models/')?Response.json({id:'offline-fake',capabilities:{image_input:{supported:false},structured_outputs:{supported:true}}}):Response.json({model:'offline-fake',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(fake)}]});
    }});
    runs.push({count,prompt,photos,photos_sha256:hash(photos),input,context:built.context,feed:built.feed,generated,fake_requests:fakeRequests,
      unique_rationale_count:new Set(built.feed.slots.map(s=>s.rationale.value)).size,
      rows:rowsFor(photos,built.feed,generated)});
  }
  const artifact={schema_version:1,created_at:new Date().toISOString(),
    code_revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    provenance:{analysis:'Recorded real-photo vision observations from #101; not revalidated against image bytes',source,source_sha256:hash(sourceBytes),
      generation:'FAKE injected transport; current validator only',profile:'Recorded fixtures/ig_snapshot.json; not a live profile connection',profile_sha256:hash(await readFile(new URL('../fixtures/ig_snapshot.json',import.meta.url))),
      boundary:'develop composeFeed with one recorded profile; NOT PR153 buildCuration or browser acceptance',network_calls:0},
    acceptance:acceptance(),same_observation_probe:sameObservationProbe(),runs};
  validateArtifact(artifact);return artifact;
}
export function validateArtifact(a) {
  assert.deepEqual(a.same_observation_probe,sameObservationProbe());
  assert.deepEqual(a.acceptance,acceptance(),'Offline data cannot establish live/human acceptance');
  assert.equal(a.provenance.source_sha256,hash(sourceBytes));
  assert.equal(a.provenance.generation,'FAKE injected transport; current validator only');
  assert.equal(a.provenance.network_calls,0);
  assert.deepEqual(a.runs.map(r=>[r.count,r.prompt]),[[3,'blank'],[3,'written'],[15,'blank'],[15,'written']]);
  for(const r of a.runs) {
    assert.deepEqual(r.photos,sourcePhotos.slice(0,r.count),'Recorded input identity changed');
    assert.equal(r.photos_sha256,hash(r.photos));
    assert.deepEqual(r.input.photos,r.photos);
    assert.equal(r.feed.slots.length,r.count);
    assert.equal(r.generated.output.slots.length,r.count);
    assert.deepEqual([...r.feed.slots.map(s=>s.photo_id)].sort(),r.photos.map(p=>p.photo_id).sort());
    assert.deepEqual([...r.generated.output.slots.map(s=>s.photo_id)].sort(),r.photos.map(p=>p.photo_id).sort());
    assert.deepEqual(r.feed.slots.map(s=>s.position),Array.from({length:r.count},(_,i)=>i+1));
    assert.deepEqual(r.rows,rowsFor(r.photos,r.feed,r.generated),'Evidence rows must preserve outputs and empty human fields');
  }
  return true;
}
const cell=value=>String(typeof value==='string'?value:JSON.stringify(value)).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('|','&#124;').replaceAll('\n','<br>');
export function renderReview(a) {
  validateArtifact(a);
  return '# Offline evidence and human review worksheet\n\nLive model: PENDING. Human review: PENDING. Unsupported claims: unmeasured (not zero).\n\nRecorded REAL-photo analyses are observations by an earlier model, not verified ground truth. Title, caption and omission text below are FAKE transport responses, not live model output. Exclusion and rationale are current deterministic outputs. This worksheet cannot close human acceptance. Review each original file_ref against every visible field; record unsupported place/person/time claims and reviewer/date in a separate reviewed copy. Null exclusion reason means no recommendation, not missing evidence.\n\n'+a.runs.map(r=>`## ${r.count} photos / ${r.prompt}\n\nInput SHA-256: ${r.photos_sha256}. Distinct rationale sentences: ${r.unique_rationale_count} (diagnostic only).\n\n| Position / photo / original file | Recorded observations | FAKE title | FAKE caption, omission and evidence | Exclusion / evidence | Rationale / evidence | Human verdict |\n|---|---|---|---|---|---|---|\n`+r.rows.map(row=>`| ${cell([row.position,row.photo_id,row.file_ref])} | ${cell(row.observations)} | ${cell(row.title)} | ${cell(row.caption)} | ${cell(row.exclusion)} | ${cell(row.rationale)} | □ |`).join('\n')).join('\n\n')+'\n';
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const out=new URL('../docs/specs/remaining-quality/',import.meta.url);
  const artifact=await buildArtifact();await mkdir(out,{recursive:true});
  await writeFile(new URL('offline-evidence.json',out),JSON.stringify(artifact,null,2)+'\n');
  await writeFile(new URL('human-review.md',out),renderReview(artifact));
  console.log('Offline integrity verified: 4 cases, 36 rows; live model and human acceptance PENDING');
}
