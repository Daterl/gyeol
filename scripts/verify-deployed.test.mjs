import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildFeed } from '../lib/pipeline.js';
import { validateGenerateRequest } from '../lib/interaction.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/interaction.sample.json', import.meta.url), 'utf8'));

async function run(generation, feedStatus = 200) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    calls.push([req.method, req.url]);
    if (req.method === 'POST') {
      try {
        assert.match(req.headers['content-type'], /application\/json/);
        const body = JSON.parse(raw);
        if (req.url === '/api/feed') {
          assert.deepEqual(body.photos, fixture.context.photos);
          assert.equal(body.schema_version, '1.0');
          res.writeHead(feedStatus).end(JSON.stringify(await buildFeed(body)));
          return;
        }
        validateGenerateRequest(body);
        assert.equal(body.mode, 'all');
        assert.equal(Object.hasOwn(body, 'photo_id'), false);
        const output = { title: '사진의 하루', slots: body.feed.slots.map((slot, i) => ({
          position: slot.position, photo_id: slot.photo_id,
          caption_state: i === 0 ? 'seed' : 'omitted',
          text: i === 0 ? '쓸 거리: 빛이 든 자리\n이 중 기억에 남은 건?' : null,
          omit_reason: i === 0 ? null : '사진만으로 충분해요',
          evidence: [{ kind: 'uploaded_photo', ref: slot.photo_id, note: '사진 근거' }],
        })) };
        const response = generation(output);
        res.writeHead(response.status ?? 200).end(response.raw ?? JSON.stringify(response.body ?? { output }));
      } catch (error) { res.writeHead(400).end(String(error)); }
    } else res.writeHead(req.url === '/' ? 200 : 405).end('');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const child = spawn(process.execPath, ['scripts/verify-deployed.mjs', `http://127.0.0.1:${server.address().port}`]);
    let text = '';
    child.stdout.on('data', chunk => { text += chunk; });
    child.stderr.on('data', chunk => { text += chunk; });
    const code = await new Promise(resolve => child.on('close', resolve));
    return { code, text, calls };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('real POST request sequence and complete generated result pass', async () => {
  const result = await run(() => ({}));
  assert.equal(result.code, 0, result.text);
  assert.doesNotMatch(result.text, /^(FAIL|SKIP)/m);
  assert.deepEqual(result.calls.filter(([method]) => method === 'POST'), [['POST', '/api/feed'], ['POST', '/api/generate']]);
});
test('only 503 GENERATION_UNAVAILABLE skips both criteria without counting them as passes', async () => {
  const result = await run(() => ({ status: 503, body: { error: { code: 'GENERATION_UNAVAILABLE' } } }));
  assert.equal(result.code, 0);
  assert.match(result.text, /SKIP D4/);
  assert.match(result.text, /SKIP D5/);
  assert.match(result.text, /배포 환경에 API 키가 없다/);
  assert.match(result.text, /7\/9 통과, SKIP 2건, FAIL 0건/);
});
for (const [name, mutate, expected] of [
  ['blank title', output => { output.title = ' '; }, /FAIL D4/],
  ['multiline title', output => { output.title = 'a\rb'; }, /FAIL D4/],
  ['one missing omission reason', output => { output.slots[2].omit_reason = ' '; }, /FAIL D5.*omit_reason/],
  ['no seed slots', output => { Object.assign(output.slots[0], { caption_state: 'omitted', text: null, omit_reason: '사진으로 충분해요' }); }, /FAIL D5.*일부/],
  ['no omitted slots', output => { output.slots.forEach(slot => Object.assign(slot, { caption_state: 'seed', text: '쓸 거리: 사진\n이 중 기억에 남은 건?', omit_reason: null })); }, /FAIL D5.*일부/],
]) test(name + ' fails', async () => {
  const result = await run(output => { mutate(output); return {}; });
  assert.equal(result.code, 1, result.text);
  assert.match(result.text, expected);
});
for (const status of [400, 502, 503]) test(`other HTTP ${status} preserves response body and fails`, async () => {
  const raw = '{"error":{"code":"MODEL_HTTP","message":"original body"}}';
  const result = await run(() => ({ status, raw }));
  assert.equal(result.code, 1);
  assert.ok(result.text.includes(raw));
  assert.doesNotMatch(result.text, /^SKIP/m);
});
test('malformed 200 fails instead of throwing or passing', async () => {
  const result = await run(() => ({ raw: 'not json' }));
  assert.equal(result.code, 1);
  assert.match(result.text, /FAIL D4/);
  assert.match(result.text, /FAIL D5/);
  assert.match(result.text, /not json/);
});
test('feed failure blocks generation and cannot pass D4/D5', async () => {
  const result = await run(() => ({}), 500);
  assert.equal(result.code, 1);
  assert.equal(result.calls.some(([method, path]) => method === 'POST' && path === '/api/generate'), false);
  assert.match(result.text, /FAIL D4/);
  assert.match(result.text, /FAIL D5/);
});
