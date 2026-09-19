// Test-process preload only: production application code has no mock switch.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = ['shared/style_guard.md', 'output/title.md', 'output/caption.md', 'output/omit_reason.md'];
const parts = await Promise.all(files.map(file => readFile(new URL('../../prompts/' + file, import.meta.url), 'utf8')));
const expected = parts.join('\n\n');
export function assertPrompt(system) {
  assert.equal(system, expected, 'Production system prompt must contain every source file, in order and verbatim');
}

// Prove the oracle rejects each individual omission, including the shared guard.
for (let index = 0; index < parts.length; index++) {
  assert.throws(() => assertPrompt(parts.filter((_, i) => i !== index).join('\n\n')));
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === 'string' || url instanceof URL ? url : url.url);
  if (target.origin !== 'https://api.anthropic.com') return originalFetch(url, options);
  if (target.pathname.startsWith('/v1/models/')) return Response.json({ id: 'production-test-model' });
  assert.equal(target.pathname, '/v1/messages');
  const body = JSON.parse(options.body);
  // Return a deterministic error instead of letting model luck hide missing assets.
  try { assertPrompt(body.system); }
  catch { return Response.json({ error: 'production_prompt_mismatch' }, { status: 422 }); }
  const input = JSON.parse(body.messages[0].content[0].text);
  const slots = input.slots.map(slot => ({
    position: slot.position, photo_id: slot.photo_id, caption_state: 'seed',
    text: `쓸 거리: ${slot.caption_inputs.describable_facts[0].text}\n이 중 기억에 남은 건?`,
    omit_reason: null, fact_index: 0, evidence: [],
  }));
  const observation = input.mode === 'all' ? { output: { title: '사진의 기록', slots } } : { slot: slots[0] };
  return Response.json({ model: 'production-test-model', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(observation) }] });
};
