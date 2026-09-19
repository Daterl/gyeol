// Usage: node scripts/verify-omit-suggestion.js /path/to/pivot/apify-check/fixtures/images
// Reads original photos without modifying them; one real image per analyze request.
// 검증 경로는 제품이 실제로 서빙하는 POST /api/feed(큐레이션)다. 사용자가 보는 필드는
// curation.slots[].exclusion_candidate 이므로 feed 확장과 그 필드를 함께 대조한다.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {handleAnalyze,handleFeed} from '../lib/pipeline.js';
import {resetAnalysisState,analysisCounters} from '../lib/photo_analysis.js';
import {validateFeedResponse} from '../lib/interaction.js';

const imageRoot=process.argv[2];
if(!imageRoot) throw new Error('실사진 images 디렉터리를 인수로 지정하세요.');
// 서버 전용 영수증 키다. 이 스크립트 안에서만 쓰고 배포 값과 무관하다.
const SECRET='verify-omit-suggestion-receipt-secret-32';
const SESSION='verify-omit-suggestion';
const manifest=JSON.parse(await readFile(new URL('../test/order.real20.json',import.meta.url),'utf8')).slice(0,15);
const curationFixture=JSON.parse(await readFile(new URL('../fixtures/curation.sample.json',import.meta.url),'utf8'));
const byId=slots=>Object.fromEntries(slots.map(s=>[s.photo_id,s.omit_suggestion??s.exclusion_candidate]));
async function feed(photos,prompt) {
  const body={schema_version:'1.0',session_id:SESSION,profile_snapshot_id:'g5-public-snapshot',
    profile_url:curationFixture.resolution.source_url,photos,...(prompt?{prompt}:{})};
  const response=await handleFeed(new Request('http://localhost/api/feed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
    {resolveSnapshot:async()=>structuredClone(curationFixture.resolution),now:()=>Date.parse(curationFixture.now),receiptSecret:SECRET});
  assert.equal(response.status,200,await response.clone().text());
  const {curation,...feedResponse}=await response.json();
  validateFeedResponse(feedResponse);
  assert.equal(feedResponse.feed.slots.length,15);
  assert.deepEqual(new Set(feedResponse.feed.slots.map(s=>s.photo_id)),new Set(photos.map(p=>p.photo_id)));
  // 자동 제외 금지: 권고가 있어도 모든 사진은 included 로 남는다.
  assert.ok(curation.slots.every(s=>s.included===true));
  assert.deepEqual(byId(curation.slots),byId(feedResponse.feed.slots));
  return {feed:feedResponse.feed,curation};
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
    const upload={schema_version:'1.0',session_id:SESSION,collection:'selected',photo_id:manifest[i].photo_id,input_index:i,
      file_ref:selected.file_ref,media_type:'image/jpeg',image_base64:bytes.toString('base64')};
    const response=await handleAnalyze(new Request('http://localhost/api/analyze?mock=1',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(upload)}),{receiptSecret:SECRET});
    assert.equal(response.status,200);
    photos.push(await response.json());
    digests.push(createHash('sha256').update(bytes).digest('hex'));
  }
  // 분석 응답 자체는 중복을 주장하지 않는다. 같은 요청 안의 서명된 해시만 비교 대상이다.
  assert.ok(photos.every(p=>p.quality_flags.every(f=>!f.startsWith('duplicate_of:'))));
  if(repeat) assert.equal(digests[0],digests[14]);
  const outputs=[];
  for(const prompt of [null,'짧게, 조용하게']) {
    const result=await feed(photos,prompt);
    assert.equal(result.feed.omit_summary.recommended_count,repeat?1:0);
    if(repeat) {
      const choices=byId(result.curation.slots);
      assert.equal(choices.ph_01.recommended,false);
      assert.equal(choices.ph_15.recommended,true);
      assert.deepEqual(choices.ph_15.evidence.map(e=>e.ref),['ph_15','ph_01']);
      // E10: 근거 ref 는 실제 입력 사진으로 해소된다.
      assert.ok(choices.ph_15.evidence.every(e=>photos.some(p=>p.photo_id===e.ref)));
    }
    const baseline=byId(result.curation.slots);
    for(let i=0;i<photos.length;i++) for(const mutate of Object.values(mutations)) {
      const altered=structuredClone(photos);mutate(altered[i]);
      const next=byId((await feed(altered,prompt)).curation.slots);
      comparisons++;
      try {assert.deepEqual(next,baseline);} catch(error) {changedDecisions++;throw error;}
    }
    outputs.push({prompt,slots:result.curation.slots.map(({position,photo_id,included,exclusion_candidate})=>({position,photo_id,included,exclusion_candidate})),
      omit_summary:result.feed.omit_summary,E1:'PASS: 15 photos = 15 slots',E10:'PASS: all uploaded_photo refs resolve'});
  }
  assert.equal(analysisCounters().modelCalls,0);
  runs.push({scenario:repeat?'실사진 14종 + 첫 사진 동일 바이트 재입력 = 15장':'서로 다른 실사진 15장',photos,digests,analysisCounters:analysisCounters(),outputs});
}
console.log(JSON.stringify({verified_at:new Date().toISOString(),runs,mutationCheck:{fields:Object.keys(mutations),comparisons,changedDecisions},limitations:['실제 픽셀 분석이며 외부 모델 호출은 0회','mock=1은 키 사용을 끄며 사진 바이트는 실제로 분석한다','프로필 스냅샷은 fixtures/curation.sample.json 주입이며 Apify 실수집이 아니다','HTTP Request/Response 핸들러 실행이며 배포 네트워크 검증은 아니다','중복은 같은 요청 안의 서명된 동일 바이트 해시에 한정하며 미관측 중복은 권고하지 않는다']},null,2));
