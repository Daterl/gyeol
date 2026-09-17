import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const dirs=['api','lib','scripts','test','eval','fixtures'];
let count=0;
async function check(dir) {
  for(const item of await readdir(new URL(`../${dir}/`,import.meta.url),{withFileTypes:true})) {
    const path=`${dir}/${item.name}`;
    if(item.isDirectory()) { await check(path); continue; }
    if(item.name.endsWith('.js')) {
      const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
      if(result.status!==0) throw new Error(result.stderr || 'syntax check failed');
      count++;
    }
    if(item.name.endsWith('.json')) { JSON.parse(await readFile(path,'utf8')); count++; }
  }
}
for(const dir of dirs) await check(dir);
for(const name of ['target_profile','current_profile','photo_analysis','ordered_feed']) {
  const doc=await readFile(`schemas/${name}.md`,'utf8');
  const example=JSON.parse(doc.match(/```json\n([\s\S]*?)\n```/)[1]);
  const fixture=JSON.parse(await readFile(`fixtures/${name}.sample.json`,'utf8'));
  assert.deepEqual(example,fixture,`${name} documentation and sample drift`);
}
const pkg=JSON.parse(await readFile('package.json','utf8'));
if(Object.keys(pkg.dependencies??{}).length || Object.keys(pkg.devDependencies??{}).length) throw new Error('Foundation must have zero dependencies');
console.log(`PASS: ${count} JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.`);
