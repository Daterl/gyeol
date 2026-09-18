// 모델 호출 없음. 기계 지표는 게시 가능성 점수가 아니다.
// develop 통합 상태(#96 forModelSlot 포함)에서 돌린 integrated.json 을 센다.
import {readFile, writeFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const inputs=await read('inputs.json');
const runs=await read('integrated.json');
const banned=['이처럼','또한','이를 통해','이러한','마침내','최고의','완벽한','반드시','인생샷','미쳤다','역대급'];
const HINT=/^쓸 거리: (.+)\n이 중 기억에 남은 건\?$/;
const NO_FACTS='확인한 관측 사실이 없음';
const hints=[];const titles=[];const offShape=[];const ungroundedSeeds=[];const unmatched=[];const bannedHits=[];
let omitted=0,notes=0,slots=0;
for(const run of runs) {
  if(!run.ok) continue;
  const request=inputs.find(s=>s.name===run.scenario).request;
  titles.push({run:run.run,scenario:run.scenario,title:run.result.output.title});
  for(const slot of run.result.output.slots) {
    slots++;
    const facts=request.feed.slots.find(s=>s.photo_id===slot.photo_id).caption_inputs.describable_facts;
    if(slot.caption_state==='filled') {
      hints.push(slot.text);
      const match=HINT.exec(slot.text);
      if(!match) offShape.push({run:run.run,photo_id:slot.photo_id,text:slot.text});
      else for(const seed of match[1].split(' · ')) if(!facts.some(f=>f.includes(seed))) ungroundedSeeds.push({run:run.run,photo_id:slot.photo_id,seed});
    } else omitted++;
    for(const item of slot.evidence.filter(e=>e.kind==='uploaded_photo'&&e.ref===slot.photo_id)) {
      notes++;
      const ok=facts.length===0?item.note===NO_FACTS:facts.includes(item.note);
      if(!ok) unmatched.push({run:run.run,photo_id:slot.photo_id,note:item.note});
    }
  }
  const published=[run.result.output.title,...run.result.output.slots.flatMap(s=>[s.text,s.omit_reason]),
    ...run.result.output.slots.flatMap(s=>s.evidence.map(e=>e.note))].filter(Boolean).join('\n');
  for(const word of banned) if(published.includes(word)) bannedHits.push({run:run.run,word});
}
const metrics={
  attempts:runs.length, success:runs.filter(r=>r.ok).length,
  failures:runs.filter(r=>!r.ok).map(r=>({run:r.run,scenario:r.scenario,...r.error})),
  slots, hints:hints.length, omitted,
  mean_hint_length:hints.length?Math.round(hints.reduce((n,t)=>n+[...t].length,0)/hints.length*10)/10:null,
  hint_shape_violations:offShape, ungrounded_seeds:ungroundedSeeds,
  uploaded_photo_notes:notes, unmatched_notes:unmatched, banned_hits:bannedHits, titles,
};
await writeFile(new URL('integrated-metrics.json',root),JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify({...metrics,
  hint_shape_violations:offShape.length, ungrounded_seeds:ungroundedSeeds.length,
  unmatched_notes:unmatched.length, banned_hits:bannedHits.length,
  titles:titles.length},null,2));
