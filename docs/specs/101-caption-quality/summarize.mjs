// No model calls. Mechanical indicators are not a publishability score.
import {readFile, writeFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const inputs=await read('inputs.json');
const phases={before:await read('before.json'),after:await read('after.json')};
const judgments=await read('judgments.json').catch(()=>({rows:[]}));
const banned=['이처럼','또한','이를 통해','이러한','마침내','최고의','완벽한','반드시','인생샷','미쳤다','역대급'];
const descriptive=/(?:보입니다|있습니다|보인다|있다|모습|화면|상반신|인물)/u;
const metrics={};
for(const [phase,runs] of Object.entries(phases)) {
  const filled=[];const unmatched=[];const bannedHits=[];let omitted=0,notes=0;
  for(const run of runs) {
    if(!run.ok) continue;
    const request=inputs.find(s=>s.name===run.scenario).request;
    for(const slot of run.result.output.slots) {
      if(slot.caption_state==='filled') filled.push(slot.text); else omitted++;
      const facts=request.feed.slots.find(s=>s.photo_id===slot.photo_id).caption_inputs.describable_facts;
      for(const evidence of slot.evidence.filter(e=>e.kind==='uploaded_photo')) {
        notes++;
        if(!facts.some(f=>f.includes(evidence.note))) unmatched.push({run:run.run,photo_id:slot.photo_id,note:evidence.note});
      }
    }
    const published=[run.result.output.title,...run.result.output.slots.flatMap(s=>[s.text,s.omit_reason])].filter(Boolean).join('\n');
    for(const word of banned) if(published.includes(word)) bannedHits.push({run:run.run,word});
  }
  metrics[phase]={attempts:runs.length,success:runs.filter(r=>r.ok).length,failures:runs.filter(r=>!r.ok).map(r=>({run:r.run,...r.error})),filled:filled.length,omitted,mean_caption_length:Math.round(filled.reduce((n,t)=>n+[...t].length,0)/filled.length*10)/10,description_marker_count:filled.filter(t=>descriptive.test(t)).length,formal_description_ending_count:filled.filter(t=>/보입니다|있습니다/u.test(t)).length,uploaded_photo_notes:notes,unmatched_notes:unmatched,banned_hits:bannedHits};
}
await writeFile(new URL('metrics.json',root),JSON.stringify(metrics,null,2)+'\n');
const escape=s=>String(s??'비움').replaceAll('|','\\|').replaceAll('\n','<br>');
let md='# 전후 캡션 전수 대조\n\n각 회차는 같은 입력 SHA-256을 사용한다. 실패 회차도 표시한다. 자동 지표는 metrics.json, 에이전트 판정은 judgments.json을 본다. 사람 판정은 아직 없다.\n';
for(const before of phases.before) {
  const after=phases.after.find(r=>r.run===before.run);
  if(!after) continue;
  if(before.input_sha256!==after.input_sha256) throw new Error('Different paired input');
  md+=`\n## 회차 ${before.run} (${before.scenario})\n\n전: ${escape(before.result?.output.title??before.error?.code)} / 후: ${escape(after.result?.output.title??after.error?.code)}\n\n|사진|수정 전|수정 후|에이전트 전/후|사람 전 O/X|사람 후 O/X|\n|---|---|---|---|---|---|\n`;
  const request=inputs.find(s=>s.name===before.scenario).request;
  for(const slot of request.feed.slots) {
    const b=before.result?.output.slots.find(s=>s.photo_id===slot.photo_id);
    const a=after.result?.output.slots.find(s=>s.photo_id===slot.photo_id);
    const verdict=phase=>judgments.rows.find(j=>j.phase===phase&&j.run===before.run&&j.photo_id===slot.photo_id)?.verdict??'생성 실패';
    md+=`|${slot.photo_id}|${escape(before.ok?b?.text:before.error?.code)}|${escape(after.ok?a?.text:after.error?.code)}|${verdict('before')} / ${verdict('after')}|미판정|미판정|\n`;
  }
}
await writeFile(new URL('comparison.md',root),md);
console.log(JSON.stringify(Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,{...v,unmatched_notes:v.unmatched_notes.length}])),null,2));
