// #131 의 "고치기 전" 게이트 조건을 그대로 재현하는 진단 스크립트다. 원인 규명용이므로
// lib/output-generation.js 를 고친 뒤에도 이 파일의 GATE1~3 식은 옛 조건 그대로 둔다.
import {readFile} from 'node:fs/promises';
import {buildFeed} from '../../../../lib/pipeline.js';
import {measuredColorOverlap} from '../../../../lib/order.js';
const fixture=JSON.parse(await readFile(new URL('../../../../fixtures/interaction.sample.json',import.meta.url),'utf8'));
const orderInput=(target)=>({schema_version:'1.0',session_id:'probe131',
  photos:fixture.context.photos.map((p,i)=>({...structuredClone(p),photo_id:`new_${i}`,input_index:i})),
  identity:{target,current:{kind:'none'}}});

for (const [label,target] of [
  ['기본(사진만) kind:none',{kind:'none'}],
  ['자유입력 "짧게 조용하게"',{kind:'text',text:'짧게 조용하게'}],
  ['자유입력 "자세하게 기록처럼 촘촘히"',{kind:'text',text:'자세하게 기록처럼 촘촘히'}],
  ['자유입력 "사진만 두고 싶어요"(sparse)',{kind:'text',text:'사진만 두고 싶어요'}],
]) {
  const built=await buildFeed(orderInput(target));
  const input={mode:'all',feed:built.feed,context:built.context};
  const appliedLanguage=input.feed.applied_profile.language;
  const t=input.context.target;
  const tl=t.kind==='photo_plan'?null:t.language;
  const coverage=tl?.caption_coverage?.value;
  const ratios=[tl?.empty_caption_ratio?.value,
    ...(input.feed.applied_profile.disclosure==='corrected'?[input.context.current.language?.empty_caption_ratio?.value]:[])]
    .filter(v=>v!==undefined);
  const gate1 = !appliedLanguage || coverage==='all';
  const gate2 = coverage!=='sparse' && (t.source==='freetext'
    || tl?.caption_len?.value?.p50>=90 || appliedLanguage?.caption_len?.value?.p50>=90
    || ratios.includes(0) || !ratios.some(v=>v>0) || Math.max(...ratios)*input.feed.slots.length<1);
  // gate3: candidate identity check
  const byPos=new Map(input.feed.slots.map(s=>[s.position,s]));
  const byId=new Map(input.context.photos.map(p=>[p.photo_id,p]));
  const cands=input.feed.slots.filter(s=>s.position>1).map(s=>{
    const prev=byPos.get(s.position-1);
    return {pos:s.position, stored:s.caption_inputs.adjacent_overlap,
      measured:measuredColorOverlap(byId.get(prev.photo_id),byId.get(s.photo_id))};
  });
  console.log('\n===',label);
  console.log(' target.kind        =',t.kind,' source =',t.source);
  console.log(' applied.language   =',appliedLanguage===null?'null':'(있음)');
  console.log(' caption_coverage   =',coverage);
  console.log(' disclosure         =',input.feed.applied_profile.disclosure);
  console.log(' ratios             =',JSON.stringify(ratios));
  console.log(' GATE1 (!lang||all) =',gate1, gate1?'→ 꺼짐':'');
  console.log(' GATE2 (coverage)   =',gate2, gate2?'→ 꺼짐':'');
  console.log(' GATE3 stored vs measured adjacent_overlap:');
  for(const c of cands) console.log(`   pos${c.pos}: stored=${c.stored} measured=${c.measured} match=${c.stored===c.measured}`);
}
