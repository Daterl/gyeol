// fault-injection.mjs 가 자식 프로세스로 부른다 — 주입된 코드를 새 모듈 그래프로 읽기 위해서다.
import {readFile} from 'node:fs/promises';
import {handleGenerate} from '../../../lib/output-generation.js';

const fixture = JSON.parse(await readFile(new URL('../../../fixtures/interaction.sample.json', import.meta.url), 'utf8'));
const input = {schema_version: '1.0', mode: 'all', feed: structuredClone(fixture.feed), context: structuredClone(fixture.context)};
const provider = process.argv[2] === 'some'
  ? {output: structuredClone(fixture.all_omitted)}
  : {output: {title: '세 장의 기록', slots: fixture.feed.slots.map(slot => ({
      photo_id: slot.photo_id, position: slot.position, caption_state: 'seed',
      text: `쓸 거리: ${slot.caption_inputs.describable_facts[0]}\n이 중 기억에 남은 건?`, omit_reason: null,
      evidence: [{kind: 'uploaded_photo', ref: slot.photo_id, note: slot.caption_inputs.describable_facts[0]}]
    }))}};
const fetchImpl = async url => url.includes('/models/')
  ? Response.json({id: 'probe', capabilities: {image_input: {supported: false}, structured_outputs: {supported: true}}})
  : Response.json({model: 'probe', stop_reason: 'end_turn', content: [{type: 'text', text: JSON.stringify(provider)}]});

const response = await handleGenerate(new Request('http://localhost/api/generate', {
  method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input)
}), {apiKey: 'fake-key', fetchImpl});
const body = await response.json();
console.log(`HTTP ${response.status} ${body.error ? body.error.code : 'OK ' + JSON.stringify(body.omission)}`);
