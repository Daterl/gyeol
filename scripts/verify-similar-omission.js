// Usage: node scripts/verify-similar-omission.js /path/to/pivot/apify-check/fixtures/images
// #97 A(비슷한 사진) 실사진 검증. 원본 사진은 읽기만 한다. 외부 모델 호출 0회.
//   1) 발화율 — 사용자가 실제로 올릴 법한 두 모양의 묶음에서 권고가 몇 건 뜨는가
//   2) 미관측 값 변조 — 관측되지 않은 필드를 바꿨을 때 권고가 바뀌는가 (바뀌면 실패)
//   3) E1 — 입력 N장 = 출력 N칸이 유지되는가 (자동 제외 없음)
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {handleAnalyze,handleFeed} from '../lib/pipeline.js';
import {resetAnalysisState,analysisCounters,measureJpeg} from '../lib/photo_analysis.js';
import {validateFeedResponse} from '../lib/interaction.js';
import {SIMILAR_DISTANCE} from '../lib/omit-suggestion.js';
import {signatureDistance} from '../lib/photo_signature.js';

// 규칙이 통째로 꺼진 채 "권고 0건" 으로 성공 종료하는 것을 막는다. 비밀값이 없으면 서버가 서명을
// 지우므로(fail closed) 유사 판정은 절대 뜨지 않고, 그 0건은 발화율 측정이 아니라 미실행이다.
assert.ok(process.argv.includes('--pairs') || (process.env.GYEOL_ANALYSIS_RECEIPT_SECRET ?? '').length >= 32,
  'GYEOL_ANALYSIS_RECEIPT_SECRET(32자 이상)이 없으면 서명이 지워져 이 검증은 규칙을 실행하지 않는다.');

const profile=JSON.parse(await readFile(new URL('../fixtures/curation.sample.json',import.meta.url),'utf8'));
const NOW=Date.parse('2026-09-18T10:00:00.000Z');

const imageRoot=process.argv[2];
if(!imageRoot) throw new Error('실사진 images 디렉터리를 인수로 지정하세요.');
const SESSION='verify-similar-omission';

// 같은 바이트는 #88 소관이므로 제외한다. 이 검증은 "동일하지 않은데 비슷한" 쌍만 본다.
const files=(await readdir(imageRoot)).filter(f=>f.endsWith('.jpg')).sort();
const seen=new Set(),unique=[];
for(const file of files) {
  const bytes=await readFile(resolve(imageRoot,file));
  const sha=createHash('sha256').update(bytes).digest('hex');
  if(seen.has(sha)) continue;
  seen.add(sha);
  unique.push({file,bytes,post:file.replace(/^[^_]+_/,'').replace(/_\d+\.jpg$/,'')});
}
const byPost=new Map();
for(const photo of unique) byPost.set(photo.post,[...(byPost.get(photo.post)??[]),photo]);

async function analyzed(bundle,sessionId) {
  const photos=[];
  for(const [index,photo] of bundle.entries()) {
    const response=await handleAnalyze(new Request('http://localhost/api/analyze?mock=1',{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({schema_version:'1.0',session_id:sessionId,collection:'selected',photo_id:`ph_${String(index+1).padStart(2,'0')}`,
        input_index:index,file_ref:photo.file,media_type:'image/jpeg',image_base64:photo.bytes.toString('base64')})}));
    assert.equal(response.status,200);
    photos.push(await response.json());
  }
  return photos;
}
// 제품 진입점 그대로다. 프로필 스냅샷만 저장본 대신 fixture 로 주입해 네트워크를 쓰지 않는다.
async function feed(photos,sessionId) {
  const response=await handleFeed(new Request('https://gyeol.test/api/feed',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({...profile.request,session_id:sessionId,photos})}),
    {resolveSnapshot:async()=>structuredClone(profile.resolution),now:()=>NOW});
  if(response.status!==200) throw new Error(`feed ${response.status}: ${await response.text()}`);
  const {curation,...result}=await response.json();
  validateFeedResponse(result);
  assert.equal(curation.slots.length,photos.length,'E1: 큐레이션도 입력 N장 = 출력 N칸');
  assert.ok(curation.slots.every(s=>s.included),'자동 제외 없음: 모든 슬롯이 included');
  assert.equal(result.feed.slots.length,photos.length,'E1: 입력 N장 = 출력 N칸');
  return result.feed;
}

// 관측되지 않은 값들. 구조 서명은 관측값이므로 여기 없다 — 있으면 검사의 의미가 뒤집힌다.
const mutations={
  composition:p=>{p.composition=p.composition==='full_frame'?'negative_space':'full_frame';},
  scale:p=>{p.scale='closeup';},
  has_face:p=>{p.has_face=!p.has_face;},
  subjects:p=>{p.subjects=['미관측 값 변조 검사'];},
  text_in_image:p=>{p.text_in_image='미관측 값 변조 검사';},
  describable_facts:p=>{p.describable_facts=[...p.describable_facts,'미관측 값 변조 검사'];},
  dark:p=>{if(!p.quality_flags.includes('dark'))p.quality_flags=[...p.quality_flags,'dark'];},
  blurry:p=>{if(!p.quality_flags.includes('blurry'))p.quality_flags=[...p.quality_flags,'blurry'];}
};

// 3) all-pairs 거리 분포 — 보고서 3절 표(42,195쌍)를 만든 바로 그 계산. `--pairs` 로만 돈다.
const pct=(sorted,q)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))]:null;
async function pairStats() {
  const signed=[];
  for(const photo of unique) {
    const measured=measureJpeg(photo.bytes);
    if(measured?.structure_signature) signed.push({post:photo.post,file:photo.file,signature:measured.structure_signature});
  }
  const same=[],cross=[];
  for(let i=0;i<signed.length;i++) for(let j=i+1;j<signed.length;j++) {
    const distance=signatureDistance(signed[i].signature,signed[j].signature);
    if(distance===null) continue;
    (signed[i].post===signed[j].post?same:cross).push(distance);
  }
  same.sort((a,b)=>a-b); cross.sort((a,b)=>a-b);
  const row=list=>({n:list.length,p1:pct(list,0.01),p5:pct(list,0.05),p25:pct(list,0.25),p50:pct(list,0.50),min:list[0]??null});
  return {photos_with_signature:signed.length,pairs:same.length+cross.length,same_post:row(same),cross_post:row(cross),
    cross_post_below_threshold:cross.filter(d=>d<SIMILAR_DISTANCE).length,
    note:'탐색 표본 한 벌의 관측이다. 독립 holdout 검증이 아니며 신뢰 구간도 아니다.'};
}
if(process.argv.includes('--pairs')) {
  console.log(JSON.stringify({verified_at:new Date().toISOString(),threshold:SIMILAR_DISTANCE,
    corpus:{files:files.length,unique_bytes:unique.length,posts:byPost.size},distribution:await pairStats()},null,2));
  process.exit(0);
}

const suggestions=feed=>Object.fromEntries(feed.slots.map(s=>[s.photo_id,s.omit_suggestion]));
const scenarios=[];
let comparisons=0,changedDecisions=0;

// (a) 한 게시물 안의 사진 묶음 — 연속 촬영·같은 판형이 실제로 섞여 있는 경우
const sameBundles=[...byPost.entries()].filter(([,list])=>list.length>=3).map(([post,list])=>({post,bundle:list.slice(0,15)}));
// (b) 서로 다른 게시물에서 한 장씩 — 비슷한 사진이 없어야 정상인 경우
const posts=[...byPost.keys()];
const mixedBundles=[];
for(let start=0;start+15<=posts.length;start+=15)
  mixedBundles.push({post:`mixed_${start}`,bundle:posts.slice(start,start+15).map(p=>byPost.get(p)[0])});

for(const [label,bundles,tamper] of [['같은 게시물 묶음',sameBundles,true],['서로 다른 게시물 한 장씩',mixedBundles,true]]) {
  let photoCount=0,recommended=0,bundlesWithAny=0;
  const samples=[];
  for(const {post,bundle} of bundles) {
    resetAnalysisState();
    const sessionId=`${SESSION}-${post}`;
    const photos=await analyzed(bundle,sessionId);
    const result=await feed(photos,sessionId);
    photoCount+=photos.length;
    const hits=result.slots.filter(s=>s.omit_suggestion.recommended);
    recommended+=hits.length;
    if(hits.length) bundlesWithAny++;
    // E10: 모든 uploaded_photo 근거가 실제 입력 사진을 가리킨다
    const ids=new Set(photos.map(p=>p.photo_id));
    for(const slot of result.slots) for(const item of slot.omit_suggestion.evidence)
      assert.ok(item.kind!=='uploaded_photo'||ids.has(item.ref),`E10: ${item.ref}`);
    if(hits.length&&samples.length<4) samples.push({post,files:Object.fromEntries(photos.map((p,i)=>[p.photo_id,bundle[i].file])),
      hits:hits.map(({photo_id,omit_suggestion})=>({photo_id,omit_suggestion})),message:result.omit_summary.message});
    if(tamper) {
      const baseline=suggestions(result);
      for(let i=0;i<photos.length;i++) for(const mutate of Object.values(mutations)) {
        const altered=structuredClone(photos);mutate(altered[i]);
        comparisons++;
        try {assert.deepEqual(suggestions(await feed(altered,sessionId)),baseline);}
        catch(error) {changedDecisions++;throw error;}
      }
    }
  }
  scenarios.push({scenario:label,bundles:bundles.length,photos:photoCount,recommended,
    firing_rate_per_photo:Number((recommended/photoCount).toFixed(4)),bundles_with_any:bundlesWithAny,samples});
}
assert.equal(analysisCounters().modelCalls,0,'제품 AI 호출 0회');
assert.equal(changedDecisions,0);
// 알려진 양성 사례가 실제로 다시 뜨는지 본다. 규칙이 꺼졌거나 서명이 사라졌으면 여기서 실패한다.
const samePost=scenarios.find(s=>s.scenario==='같은 게시물 묶음');
assert.ok(samePost.recommended>=1,`같은 게시물 묶음에서 알려진 유사 양성이 0건이다(기대 >=1). 규칙이 실행되지 않았을 수 있다.`);
assert.ok(samePost.samples.some(sample=>sample.hits.some(hit=>
  /구조 거리 [0-9.]+/.test(hit.omit_suggestion.reason))),'유사 권고 문장에 측정 거리가 들어 있어야 한다');
console.log(JSON.stringify({verified_at:new Date().toISOString(),threshold:SIMILAR_DISTANCE,
  corpus:{files:files.length,unique_bytes:unique.length,posts:byPost.size},scenarios,
  mutationCheck:{fields:Object.keys(mutations),comparisons,changedDecisions},
  invariants:{E1:'PASS: 모든 묶음에서 입력 N장 = 출력 N칸',E10:'PASS: 모든 uploaded_photo 근거가 입력 사진으로 해소'},
  limitations:['실제 픽셀 분석이며 외부 모델 호출은 0회','mock=1은 키 사용을 끄며 사진 바이트는 실제로 분석한다',
    'HTTP 핸들러 실행이며 배포 네트워크 검증은 아니다','같은 바이트 쌍은 #88 소관이라 이 코퍼스에서 제거했다',
    '"같은 게시물"은 사람이 고른 유사 라벨이 아니라 수집 당시의 게시물 묶음이다']},null,2));
