// 모델 호출 없음. integrated.json 에 보존된 모델 원문에 계약 검사를 하나씩 따로 적용해
// MODEL_CONTRACT 가 '어느 검사'에서 났는지 귀속한다.
import {readFile, writeFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const inputs=await read('inputs.json');
const runs=await read('integrated.json');
const BANNED=['이처럼','또한','이를 통해','이러한','마침내','최고의','완벽한','반드시'];
const HINT=/^쓸 거리: (.+)\n이 중 기억에 남은 건\?$/;
const NO_FACTS='확인한 관측 사실이 없음';
// develop 의 #96 가드를 그대로 비춘다. 이 스크립트는 판정을 바꾸지 않고 귀속만 한다.
const INTERNAL=/\b(?:mode|slots|position|rationale|narrative_role|caption_inputs|describable_facts|applied_profile|target_profile_id|current_profile_id|photo_plan_id|disclosure|language|caption_state|omit_reason|photo_id|empty_caption_ratio|caption_coverage|caption_len|emoji_rate|ending_style|linebreak_habit|banned_words|p50|p90|unit|R[1-4])\b/gi;
const leaks=(value,facts)=>{
  if(typeof value!=='string') return [];
  const grounded=new Set(facts.flatMap(f=>f.match(INTERNAL)??[]).map(w=>w.toLowerCase()));
  return [...new Set((value.match(INTERNAL)??[]).filter(w=>!grounded.has(w.toLowerCase())))];
};
const rows=[];
for(const run of runs) {
  const request=inputs.find(s=>s.name===run.scenario).request;
  const facts=new Map(request.feed.slots.map(s=>[s.photo_id,s.caption_inputs.describable_facts]));
  const last=run.calls.at(-1);
  let parsed=null;
  try { parsed=JSON.parse(last.raw_content.map(part=>part.text??'').join('')); } catch {}
  const row={run:run.run,scenario:run.scenario,ok:run.ok,stop_reason:last?.stop_reason,parsed:Boolean(parsed),findings:[],observations:[]};
  if(parsed?.output) {
    for(const word of BANNED) if(JSON.stringify(parsed).includes(word)) row.findings.push({check:'banned_word',word});
    for(const slot of parsed.output.slots??[]) {
      const own=facts.get(slot.photo_id)??[];
      if(slot.caption_state==='filled') {
        const match=HINT.exec(slot.text??'');
        if(!match) row.findings.push({check:'hint_shape',photo_id:slot.photo_id,text:slot.text});
        else {
          const seeds=match[1].split(' · ');
          if(seeds.length>2) row.findings.push({check:'hint_seed_count',photo_id:slot.photo_id,seeds});
          // 계약이 거부하지 않는다. 사람 인수 게이트로 넘기는 관찰 지표다.
          for(const seed of seeds) if(!own.some(f=>f.includes(seed))) row.observations.push({check:'hint_seed_not_verbatim',photo_id:slot.photo_id,seed});
        }
      }
      for(const field of [slot.text,slot.omit_reason,...(slot.evidence??[]).map(e=>e.note)])
        for(const word of leaks(field,own)) row.findings.push({check:'internal_field_leak',photo_id:slot.photo_id,word,text:field});
      for(const item of (slot.evidence??[]).filter(e=>e.kind==='uploaded_photo'&&e.ref===slot.photo_id)) {
        const ok=own.length===0?item.note===NO_FACTS:own.includes(item.note);
        if(!ok) row.findings.push({check:'note_not_verbatim',photo_id:slot.photo_id,note:item.note});
      }
      if(!(slot.evidence??[]).some(e=>e.kind==='uploaded_photo'&&e.ref===slot.photo_id)) row.findings.push({check:'missing_own_photo_evidence',photo_id:slot.photo_id});
    }
  }
  rows.push(row);
}
const tally={};const observed={};
for(const row of rows) {
  for(const f of row.findings) tally[f.check]=(tally[f.check]??0)+1;
  for(const f of row.observations) observed[f.check]=(observed[f.check]??0)+1;
}
const firstCheck={};
for(const row of rows.filter(r=>!r.ok)) {
  const kinds=[...new Set(row.findings.map(f=>f.check))];
  const key=kinds.length?kinds.join('+'):(row.parsed?'unknown':'unparsed');
  firstCheck[key]=(firstCheck[key]??0)+1;
}
await writeFile(new URL('integrated-diagnosis.json',root),JSON.stringify({rows,tally,observed,failing_run_profile:firstCheck},null,2)+'\n');
console.log(JSON.stringify({attempts:runs.length,success:runs.filter(r=>r.ok).length,enforced_violations:tally,observed_not_enforced:observed,failing_run_profile:firstCheck},null,2));
