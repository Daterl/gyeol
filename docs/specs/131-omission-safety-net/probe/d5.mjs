// #131 D5 측정 — 실사진 15장 × 5회. 기본 경로(사진만)와 자유입력 경로 각각.
// 사진 분석은 사진 한 장마다 한 번 호출한다 (여러 장 일괄 경로에 의존하지 않는다).
import {readdir,readFile} from 'node:fs/promises';
import {analyzePhoto} from '../../../../lib/photo_analysis.js';
import {buildFeed} from '../../../../lib/pipeline.js';
import {generateOutput} from '../../../../lib/output-generation.js';

const IMAGE_DIR='/Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/images';
const ROUNDS=5, PER_ROUND=15;
const APPLY_KEY=process.argv.includes('--model');

const hint=fact=>`쓸 거리: ${fact}\n이 중 기억에 남은 건?`;
// 모델이 15자리를 전부 채운 회차 — 안전망이 존재하는 이유가 되는 최악의 입력이다.
const allSeed=feed=>({output:{title:'열다섯 장의 기록',slots:feed.slots.map(slot=>({
  photo_id:slot.photo_id,position:slot.position,caption_state:'seed',
  text:hint(slot.caption_inputs.describable_facts[0]),omit_reason:null,
  evidence:[{kind:'uploaded_photo',ref:slot.photo_id,note:slot.caption_inputs.describable_facts[0]}]
}))}});
const transport=value=>async url=>url.includes('/models/')
  ?Response.json({id:'test-text-model',capabilities:{image_input:{supported:false},structured_outputs:{supported:true}}})
  :Response.json({model:'test-text-model',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}]});

const files=(await readdir(IMAGE_DIR)).filter(f=>f.endsWith('.jpg')).sort();
console.log(`실사진 풀: ${files.length}장 (${IMAGE_DIR})`);
console.log(APPLY_KEY?'사진 분석: 실모델':'사진 분석: 휴리스틱(모델 호출 0회). 색은 실제 JPEG 에서 잰 실측값이다.');

const rows=[];
for (let round=0; round<ROUNDS; round++) {
  const picked=files.slice(round*PER_ROUND,(round+1)*PER_ROUND);
  const photos=[];
  for (const [index,name] of picked.entries()) {
    const bytes=await readFile(`${IMAGE_DIR}/${name}`);
    const {analysis}=await analyzePhoto({bytes,photoId:`ph_${round}_${index}`,inputIndex:index,fileRef:name,
      ...(APPLY_KEY?{}:{apiKey:''})});
    photos.push(analysis);
  }
  for (const [label,target] of [['기본(사진만)',{kind:'none'}],['자유입력 "짧게 조용하게"',{kind:'text',text:'짧게 조용하게'}]]) {
    const built=await buildFeed({schema_version:'1.0',session_id:`d5-${round}`,photos:structuredClone(photos),
      identity:{target,current:{kind:'none'}}});
    const result=await generateOutput({schema_version:'1.0',mode:'all',feed:built.feed,context:built.context},
      {apiKey:'fake-key',fetchImpl:transport(allSeed(built.feed))});
    const omitted=result.output.slots.filter(s=>s.caption_state==='omitted');
    const overlaps=built.feed.slots.map(s=>s.caption_inputs.adjacent_overlap);
    rows.push({round:round+1,path:label,filled:result.output.slots.length-omitted.length,omitted:omitted.length,
      D5:(result.output.slots.length-omitted.length>0 && omitted.length>0)?'PASS':'FAIL',
      비움자리:omitted.map(s=>s.position).join(',')||'-',
      근거종류:omitted[0]?[...new Set(omitted[0].evidence.map(e=>e.kind))].join('+'):'-',
      피드최대겹침:Math.max(...overlaps)});
  }
}
console.table(rows);
const pass=rows.filter(r=>r.D5==='PASS').length;
console.log(`D5 통과: ${pass}/${rows.length} (기본 ${rows.filter(r=>r.path.startsWith('기본')&&r.D5==='PASS').length}/5, 자유입력 ${rows.filter(r=>r.path.startsWith('자유')&&r.D5==='PASS').length}/5)`);
