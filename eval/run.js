import { readFile } from 'node:fs/promises';
import { evaluate, breakFixture } from './invariants.js';
import { validateProfile, validateFeed, validateExport } from '../lib/contracts.js';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const root='./golden/case_01/';
const input=await read(root+'input.json');
const currentProfile=await read(root+'current_profile.json');
const photoAnalyses=await read(root+'photo_analysis.json');
let failed=false;
console.log('Synthetic manual bootstrap only; no AI quality or human agreement claim.');
for(const name of ['quiet','detail']) {
  const bundle={inputPhotoIds:input.photo_ids,currentProfile,photoAnalyses,targetProfile:await read(root+`target_${name}.json`),feed:await read(root+`ordered_${name}.json`),output:await read(root+`export_${name}.json`)};
  validateProfile(bundle.targetProfile,'target'); validateFeed(bundle.feed,input.photo_ids,currentProfile,bundle.targetProfile,photoAnalyses); validateExport(bundle.output,bundle.feed,input.photo_ids);
  const results=evaluate(bundle);
  console.table(Object.entries(results).map(([invariant,result])=>({case:name,invariant,result:result.pass?'PASS':'FAIL',reason:result.reason??''})));
  if(Object.values(results).some(r=>!r.pass)) failed=true;
  for(const id of ['E1','E2','E3','E6','E8','E9','E10','E11']) {
    const broken=breakFixture(bundle,await read(`./broken/${id}.json`));
    const actual=evaluate(broken)[id];
    console.log(`${name} broken ${id}: ${actual.pass?'UNEXPECTED PASS':'EXPECTED FAIL'}${actual.reason?` — ${actual.reason}`:''}`);
    if(actual.pass) failed=true;
  }
}
console.log('E4/E5/E7: 자동 판정 없음. 실사진 15장 1벌 전수 대조와 원본 사진 육안 확인은 docs/submission/factuality-audit.md (에이전트 판정, 사람 인수 PENDING).');
process.exitCode=failed?1:0;

const { evaluateModelPath } = await import('./model-path.js');
await evaluateModelPath();
