// Usage: node scripts/verify-omit-suggestion.js /path/to/pivot/apify-check/fixtures/images
// Reads original photos without modifying them; one real image per analyze request.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {handleAnalyze,handleFeed} from '../lib/pipeline.js';
import {resetAnalysisState,analysisCounters} from '../lib/photo_analysis.js';
import {validateFeedResponse} from '../lib/interaction.js';

const imageRoot=process.argv[2];
if(!imageRoot) throw new Error('실사진 images 디렉터리를 인수로 지정하세요.');
const manifest=JSON.parse(await readFile(new URL('../test/order.real20.json',import.meta.url),'utf8')).slice(0,15);
const byId=feed=>Object.fromEntries(feed.slots.map(s=>[s.photo_id,s.omit_suggestion]));
async function feed(photos,target) {
  const input={schema_version:'1.0',session_id:'real-88',photos,identity:{target,current:{kind:'none'}}};
  const response=await handleFeed(new Request('http://localhost/api/feed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));
  assert.equal(response.status,200);
  const result=await response.json();validateFeedResponse(result);
  assert.equal(result.feed.slots.length,15);
  assert.deepEqual(new Set(result.feed.slots.map(s=>s.photo_id)),new Set(photos.map(p=>p.photo_id)));
  return result.feed;
}
const mutations={
  composition:p=>{p.composition='negative_space';},
  scale:p=>{p.scale='fullshot';},
  has_face:p=>{p.has_face=true;},
  subjects:p=>{p.subjects=['미관측 값 변조 검사'];},
  text_in_image:p=>{p.text_in_image='미관측 값 변조 검사';},
  dark:p=>{p.quality_flags.push('dark');},
  blurry:p=>{p.quality_flags.push('blurry');}
};
const runs=[];
let comparisons=0,changedDecisions=0;
for(const repeat of [false,true]) {
  resetAnalysisState();
  const photos=[],digests=[];
  for(let i=0;i<15;i++) {
    const selected=manifest[repeat&&i===14?0:i];
    const bytes=await readFile(resolve(imageRoot,basename(selected.file_ref)));
    const upload={schema_version:'1.0',photo_id:manifest[i].photo_id,input_index:i,
      file_ref:selected.file_ref,media_type:'image/jpeg',image_base64:bytes.toString('base64')};
    const response=await handleAnalyze(new Request('http://localhost/api/analyze?mock=1',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(upload)}));
    assert.equal(response.status,200);
    photos.push(await response.json());
    digests.push(createHash('sha256').update(bytes).digest('hex'));
  }
  if(repeat) {
    assert.equal(digests[0],digests[14]);
    assert.ok(photos[14].quality_flags.includes('duplicate_of:ph_01'));
  }
  const outputs=[];
  for(const target of [{kind:'none'},{kind:'text',text:'짧게, 조용하게'}]) {
    const result=await feed(photos,target);
    assert.equal(result.omit_summary.recommended_count,repeat?1:0);
    if(repeat) {
      const choices=byId(result);
      assert.equal(choices.ph_01.recommended,false);
      assert.equal(choices.ph_15.recommended,true);
      assert.deepEqual(choices.ph_15.evidence.map(e=>e.ref),['ph_15','ph_01']);
    }
    const baseline=byId(result);
    for(let i=0;i<photos.length;i++) for(const mutate of Object.values(mutations)) {
      const altered=structuredClone(photos);mutate(altered[i]);
      const next=byId(await feed(altered,target));
      comparisons++;
      try {assert.deepEqual(next,baseline);} catch(error) {changedDecisions++;throw error;}
    }
    outputs.push({target,slots:result.slots.map(({position,photo_id,omit_suggestion})=>({position,photo_id,omit_suggestion})),omit_summary:result.omit_summary,E1:'PASS: 15 photos = 15 slots',E10:'PASS: all uploaded_photo refs resolve'});
  }
  assert.equal(analysisCounters().modelCalls,0);
  runs.push({scenario:repeat?'실사진 14종 + 첫 사진 동일 바이트 재입력 = 15장':'서로 다른 실사진 15장',photos,digests,analysisCounters:analysisCounters(),outputs});
}
console.log(JSON.stringify({verified_at:new Date().toISOString(),runs,mutationCheck:{fields:Object.keys(mutations),comparisons,changedDecisions},limitations:['실제 픽셀 분석이며 외부 모델 호출은 0회','mock=1은 키 사용을 끄며 사진 바이트는 실제로 분석한다','HTTP Request/Response 핸들러 실행이며 배포 네트워크 검증은 아니다','중복 플래그는 프로세스 캐시에 의존하며 미관측 중복은 권고하지 않는다']},null,2));
