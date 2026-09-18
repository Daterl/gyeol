// 승인된 환경 파일을 --env-file로 주입. 키/헤더는 결과에 기록하지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { generateOutput } from '../../../lib/output-generation.js';
import { OUTPUT_MODEL } from '../../../lib/model.js';
const root = new URL('./', import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const save = (name, value) => writeFile(new URL(name, root), JSON.stringify(value, null, 2)+'\n');
if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_WORKSPACE_ID) throw new Error('Model credentials missing');
const inputs = await read('inputs.json');
const label = process.argv[2] || 'run-1';
if (!/^run-[1-3]$/.test(label)) throw new Error('Expected run-1, run-2 or run-3');
const files = ['shared/style_guard.md','output/title.md','output/caption.md','output/omit_reason.md'];
const prompts = {};
for (const file of files) prompts[file] = await readFile(new URL('../../../prompts/'+file, root), 'utf8');
await save(label+'-prompts.json', prompts);
const imagesRoot = process.env.GYEOL_IMAGES_DIR;
if (!imagesRoot) throw new Error('GYEOL_IMAGES_DIR must point to the original 15 images');
const manifest = [];
for (const p of inputs[0].request.context.photos) {
  const bytes = await readFile(imagesRoot+'/'+p.file_ref);
  manifest.push({photo_id:p.photo_id,file:p.file_ref,sha256:hash(bytes),analysis_source:'previous 101-caption-quality/inputs.json, unchanged'});
}
await save('photos.json', manifest);
const schedule = [0,1,2,3,0,1,2,3,0,1,0,1];
const rows = await read(label+'.json').catch(() => []);
let next = rows.length ? Math.max(...rows.map(row => row.run)) : 0;
let checkpoint = Promise.resolve();
async function worker() {
  while (next < schedule.length) {
    const index = next++;
    const scenario = inputs[schedule[index]];
    const row = {run:index+1,scenario:scenario.name,input_sha256:hash(JSON.stringify(scenario.request)),requested_model:OUTPUT_MODEL,started_at:new Date().toISOString(),calls:[]};
    const started = performance.now();
    const fetchImpl = async (url, options) => {
      if (url.endsWith('/messages')) row.prompt_sha256 = hash(JSON.parse(options.body).system);
      const response = await fetch(url, options);
      if (url.endsWith('/messages')) {
        const raw = await response.clone().json();
        row.calls.push({status:response.status,model:raw.model,usage:raw.usage,stop_reason:raw.stop_reason,...(raw.error?{error:raw.error}:{}),raw_content:raw.content});
      }
      return response;
    };
    try { row.result=await generateOutput(scenario.request,{fetchImpl,model:OUTPUT_MODEL,timeoutMs:45000}); row.ok=true; }
    catch (error) { row.ok=false; row.error={code:error.code,message:error.message}; }
    row.elapsed_ms=Math.round(performance.now()-started);
    rows.push(row);
    checkpoint=checkpoint.then(() => save(label+'.json',rows.sort((a,b) => a.run-b.run)));
    await checkpoint;
    console.log(label,row.run,row.scenario,row.ok,row.elapsed_ms,row.error?.code??'');
  }
}
await Promise.all([worker(),worker()]);
if (rows.some(row => !row.ok)) process.exitCode=1;
