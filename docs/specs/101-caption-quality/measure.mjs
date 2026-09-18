// node --env-file=/absolute/path/to/.env docs/specs/101-caption-quality/measure.mjs prepare|before|after
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { analyzePhoto } from '../../../lib/photo_analysis.js';
import { buildFeed } from '../../../lib/pipeline.js';
import { generateOutput } from '../../../lib/output-generation.js';
import { OUTPUT_MODEL } from '../../../lib/model.js';
const root = new URL('./', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const save = (name, value) => writeFile(new URL(name, root), JSON.stringify(value, null, 2)+'\n');
const phase = process.argv[2];
if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_WORKSPACE_ID) throw new Error('Model credentials missing');
if (phase === 'prepare') {
  const source = await read('audit-analyses.json');
  const photos = [];
  for (const [index, row] of source.entries()) {
    const file = row.file.replace(/^p\d+__/, '');
    let analysis = row.a;
    if (!row.ok) {
      const result = await read('recovered-analysis.json').catch(async () => analyzePhoto({
        bytes: await readFile('/Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/images/'+file),
        photoId: 'ph_15', inputIndex: index, fileRef: file, timeoutMs: 60000,
      }));
      await save('recovered-analysis.json', result);
      analysis = result.analysis;
    }
    photos.push({...analysis, photo_id: 'cq_'+String(index+1).padStart(2,'0'), input_index: index, file_ref: file});
  }
  const reference={kind:'reference',url:'https://www.instagram.com/29cm/'};
  const scenarios=[
    {name:'reference',target:reference,current:{kind:'none'}},
    {name:'freetext',target:{kind:'text',text:'차분하고 여백 많은 느낌으로'},current:{kind:'none'}},
    {name:'photos_only',target:{kind:'none'},current:{kind:'none'}},
    {name:'corrected',target:reference,current:{kind:'posts',photos:photos.slice(0,5).map((p,i)=>({...p,photo_id:'old_'+i,input_index:i}))}},
  ];
  const inputs=[];
  for (const scenario of scenarios) {
    const built=await buildFeed({schema_version:'1.0',session_id:'caption-quality-101',photos,identity:{target:scenario.target,current:scenario.current}});
    inputs.push({name:scenario.name,request:{schema_version:'1.0',mode:'all',...built}});
  }
  await save('inputs.json',inputs);
  console.log('Prepared',photos.length,'photos and',inputs.length,'scenarios');
} else if (['before','after','integrated'].includes(phase)) {
  const inputs=await read('inputs.json');
  const schedule=[0,1,2,3,0,1,2,3,0,1,0,1];
  const rows=await read(phase+'.json').catch(() => []);
  let next=rows.length ? Math.max(...rows.map(row=>row.run)) : 0;
  let checkpoint=Promise.resolve();
  async function worker() {
    while (next<schedule.length) {
      const index=next++;
      const scenario=inputs[schedule[index]];
      const row={run:index+1,scenario:scenario.name,input_sha256:createHash('sha256').update(JSON.stringify(scenario.request)).digest('hex'),requested_model:OUTPUT_MODEL,started_at:new Date().toISOString(),calls:[]};
      const started=performance.now();
      const fetchImpl=async(url,options)=>{
        if(url.endsWith('/messages')) row.prompt_sha256=createHash('sha256').update(JSON.parse(options.body).system).digest('hex');
        const response=await fetch(url,options);
        if(url.endsWith('/messages')) {
          const raw=await response.clone().json();
          row.calls.push({status:response.status,model:raw.model,usage:raw.usage,stop_reason:raw.stop_reason,...(raw.error?{error:raw.error}:{}),raw_content:raw.content});
        }
        return response;
      };
      try {row.result=await generateOutput(scenario.request,{fetchImpl,model:OUTPUT_MODEL,timeoutMs:45000});row.ok=true;}
      catch(error){row.ok=false;row.error={code:error.code,message:error.message};}
      row.elapsed_ms=Math.round(performance.now()-started);
      rows.push(row);
      checkpoint=checkpoint.then(()=>save(phase+'.json',rows.sort((a,b)=>a.run-b.run)));
      await checkpoint;
      console.log(phase,row.run,row.scenario,row.ok,row.elapsed_ms,row.error?.code??'');
    }
  }
  await Promise.all([worker(),worker()]);
  if(rows.some(row=>!row.ok)) process.exitCode=1;
} else throw new Error('Expected prepare, before or after');
