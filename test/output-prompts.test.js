import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateExport} from '../lib/contracts.js';
import {validateGenerateRequest,validateGenerateResponse} from '../lib/interaction.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const examples=JSON.parse(await read('docs/specs/16-output-prompts/manual-examples.json'));
const contract=JSON.parse(await read('fixtures/interaction.sample.json'));
const guard=await read('prompts/shared/style_guard.md');
const banned=[...guard.matchAll(/`([^`]+)`/g)].map(m=>m[1]);

test('output prompts reference one shared style guard without copied banned lists',async()=>{
  assert.ok(banned.length>=8);
  for(const file of ['title','caption','omit_reason']) {
    const prompt=await read(`prompts/output/${file}.md`);
    assert.ok(prompt.includes('../shared/style_guard.md'));
    for(const word of banned) assert.ok(!prompt.includes('`'+word+'`'));
  }
});
test('manual examples match photo facts and original slots without banned language',()=>{
  for(const example of examples.cases) {
    assert.ok(['photo_only','target_only','corrected'].includes(example.input_case));
    const source=example.input_case==='target_only'?contract:contract[example.input_case];
    const request={schema_version:'1.0',mode:example.mode,feed:source.feed,context:source.context,...(example.photo_id?{photo_id:example.photo_id}:{})};
    validateGenerateRequest(request);
    validateGenerateResponse(example.mode==='all'?{output:example.output}:{slot:example.slot},request);
    const ids=source.feed.slots.map(s=>s.photo_id);
    const output=example.mode==='all'?example.output:{title:'사진 세 장',slots:examples.cases[0].output.slots.map(s=>s.photo_id===example.photo_id?example.slot:s)};
    validateExport(output,source.feed,ids);
    for(const slot of output.slots) {
      const input=source.feed.slots.find(s=>s.photo_id===slot.photo_id);
      if(slot.caption_state==='seed') {
        const match=/^쓸 거리: (.+)\n이 중 기억에 남은 건\?$/.exec(slot.text);
        const own=slot.evidence.filter(item=>item.kind==='uploaded_photo' && item.ref===slot.photo_id);
        assert.ok(match); assert.equal(own.length,1);
        assert.ok(input.caption_inputs.describable_facts.includes(own[0].note));
        for(const seed of match[1].split(' · ')) assert.ok(own[0].note.includes(seed));
      } else assert.ok(input.caption_inputs.adjacent_overlap>0.5);
      for(const word of banned) assert.ok(!JSON.stringify([output.title,slot.text,slot.omit_reason]).includes(word));
    }
  }
});
