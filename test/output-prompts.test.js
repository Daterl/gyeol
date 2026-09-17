import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateExport} from '../lib/contracts.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const examples=JSON.parse(await read('docs/specs/16-output-prompts/manual-examples.json'));
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
  const ids=examples.feed.slots.map(s=>s.photo_id);
  for(const example of examples.cases) {
    const output=example.mode==='all'?example.output:{title:'사진 세 장',slots:examples.cases[0].output.slots.map(s=>s.photo_id===example.photo_id?example.slot:s)};
    validateExport(output,examples.feed,ids);
    for(const slot of output.slots) {
      const input=examples.feed.slots.find(s=>s.photo_id===slot.photo_id);
      if(slot.caption_state==='filled') assert.ok(input.caption_inputs.describable_facts.includes(slot.text));
      else assert.ok(input.caption_inputs.adjacent_overlap>0.5);
      for(const word of banned) assert.ok(!JSON.stringify([output.title,slot.text,slot.omit_reason]).includes(word));
    }
  }
});
