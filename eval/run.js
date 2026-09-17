import { readFile } from 'node:fs/promises';
import { evaluate, breakFixture } from './invariants.js';
import { validateProfile, validateFeed, validateExport } from '../lib/contracts.js';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const root='./golden/case_01/';
const input=await read(root+'input.json');
const currentProfile=await read(root+'current_profile.json');
let failed=false;
console.log('Synthetic manual bootstrap only; no AI quality or human agreement claim.');
for(const name of ['quiet','detail']) {
  const bundle={inputPhotoIds:input.photo_ids,currentProfile,targetProfile:await read(root+`target_${name}.json`),feed:await read(root+`ordered_${name}.json`),output:await read(root+`export_${name}.json`)};
  validateProfile(bundle.targetProfile,'target'); validateFeed(bundle.feed,input.photo_ids,currentProfile); validateExport(bundle.output,bundle.feed);
  const results=evaluate(bundle);
  console.table(Object.entries(results).map(([invariant,result])=>({case:name,invariant,result:result.pass?'PASS':'FAIL',reason:result.reason??''})));
  if(Object.values(results).some(r=>!r.pass)) failed=true;
  for(const id of ['E1','E2','E3','E6','E8']) {
    const broken=breakFixture(bundle,await read(`./broken/${id}.json`));
    const actual=evaluate(broken)[id];
    console.log(`${name} broken ${id}: ${actual.pass?'UNEXPECTED PASS':'EXPECTED FAIL'}${actual.reason?` — ${actual.reason}`:''}`);
    if(actual.pass) failed=true;
  }
}
console.log('E4/E5/E7: manual spot-check only; real demo review pending.');
process.exitCode=failed?1:0;
