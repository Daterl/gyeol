import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeWithModel, modelRoute, requestStructuredModel } from '../lib/model.js';
import { analyzePhoto, resetAnalysisState, analysisCounters } from '../lib/photo_analysis.js';
import handler from '../api/analyze.js';

process.env.GYEOL_MODEL_PROVIDER_ENABLED = '1';

const bytes = await readFile(new URL('../fixtures/jpeg/solid_white_baseline.jpg', import.meta.url));
const observation = { color: { hue_mean: 0, sat_mean: 0, bright_mean: 1, palette_hex: ['#ffffff'] },
  composition: 'full_frame', scale: 'midshot', subjects: [], has_face: false, text_in_image: null,
  describable_facts: ['흰 면'], quality_flags: [] };
const args = { bytes, mediaType: 'image/jpeg', prompt: 'test prompt', schema: { type: 'object' }, apiKey: 'fake-key', model: 'test-model' };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const message = (patch = {}) => ({ model: 'test-model', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(observation) }],
  usage: { input_tokens: 12, output_tokens: 8 }, ...patch });
const fetchFor = callback => async (url, options) => url.includes('/models/') ? response({ id: 'test-model' }) : callback(url, options);

test('missing key reports heuristic route and direct model calls fail without network', async () => {
  assert.deepEqual(modelRoute('  '), { source: 'heuristic', reason: 'missing_api_key' });
  await assert.rejects(analyzeWithModel({ ...args, apiKey: '', fetchImpl: () => { throw new Error('must not call'); } }), { code: 'MODEL_KEY_MISSING' });
});

test('provider calls require the exact opt-in value and recheck before transport', async () => {
  const previous = process.env.GYEOL_MODEL_PROVIDER_ENABLED;
  let calls = 0;
  try {
    for (const value of [undefined, '0', 'true', 'typo']) {
      if (value === undefined) delete process.env.GYEOL_MODEL_PROVIDER_ENABLED;
      else process.env.GYEOL_MODEL_PROVIDER_ENABLED = value;
      assert.deepEqual(modelRoute('fake-key'), { source: 'heuristic', reason: 'provider_disabled' });
      await assert.rejects(requestStructuredModel({ ...args, content: [], fetchImpl: () => { calls++; throw new Error('must not call'); } }), { code: 'MODEL_KEY_MISSING' });
    }
    assert.equal(calls, 0);
    process.env.GYEOL_MODEL_PROVIDER_ENABLED = '1';
    assert.deepEqual(modelRoute('fake-key'), { source: 'vision_model', reason: 'api_key_present' });
    await analyzeWithModel({ ...args, fetchImpl: async url => {
      calls++;
      return response(url.includes('/models/') ? { id: 'test-model' } : message());
    } });
    assert.equal(calls, 2);
  } finally {
    if (previous === undefined) delete process.env.GYEOL_MODEL_PROVIDER_ENABLED;
    else process.env.GYEOL_MODEL_PROVIDER_ENABLED = previous;
  }
});

test('wire format carries exactly one image and returns observed usage/model/time', async () => {
  const seen = [];
  const result = await analyzeWithModel({ ...args, fetchImpl: async (url, options) => {
    seen.push({ url, options });
    return response(url.includes('/models/') ? { id: 'test-model' } : message());
  } });
  assert.equal(seen.length, 2);
  assert.match(seen[0].url, /\/models\/test-model$/);
  const sent = JSON.parse(seen[1].options.body);
  assert.equal(sent.messages.length, 1);
  assert.equal(sent.messages[0].content.length, 1);
  assert.equal(sent.messages[0].content[0].source.data, bytes.toString('base64'));
  assert.equal(sent.system, args.prompt);
  assert.deepEqual(sent.output_config.format.schema, args.schema);
  assert.deepEqual(result.observation, observation);
  assert.equal(result.usage.input_tokens, 12);
  assert.ok(result.elapsedMs >= 0);
  assert.equal(result.attempts, 1);
});

test('429/529 retry once; auth errors never retry or expose provider body', async () => {
  for (const status of [429, 529, 401]) {
    let calls = 0;
    await assert.rejects(analyzeWithModel({ ...args, fetchImpl: fetchFor(() => {
      calls++;
      return response({ error: 'secret-provider-body' }, status);
    }) }), error => error.code === 'MODEL_HTTP' && error.status === status && !error.message.includes('secret'));
    assert.equal(calls, status === 401 ? 1 : 2);
  }
  let calls = 0;
  const result = await analyzeWithModel({ ...args, fetchImpl: fetchFor(() => ++calls === 1 ? response({}, 429) : response(message())) });
  assert.equal(result.attempts, 2);
});

test('deadline bounds discovery and stalled response parsing; no network retry', async () => {
  let signal;
  await assert.rejects(analyzeWithModel({ ...args, timeoutMs: 10, fetchImpl: (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } }), { code: 'MODEL_TIMEOUT' });
  assert.equal(signal.aborted, true);
  await assert.rejects(analyzeWithModel({ ...args, timeoutMs: 10, fetchImpl: fetchFor(() => ({ ok: true, json: () => new Promise(() => {}) })) }), { code: 'MODEL_TIMEOUT' });
  let calls = 0;
  await assert.rejects(analyzeWithModel({ ...args, fetchImpl: () => { calls++; throw new Error('key or transport detail'); } }), { code: 'MODEL_NETWORK' });
  assert.equal(calls, 1);
});

test('refusal, truncation, malformed JSON and non-object responses fail explicitly', async () => {
  for (const [patch, code] of [
    [{ stop_reason: 'refusal' }, 'MODEL_INCOMPLETE'], [{ stop_reason: 'max_tokens' }, 'MODEL_INCOMPLETE'],
    [{ content: [{ type: 'text', text: '{broken' }] }, 'MODEL_JSON'],
    [{ content: [{ type: 'text', text: '[]' }] }, 'MODEL_JSON'], [{ content: [] }, 'MODEL_JSON'],
    [{ model: null }, 'MODEL_JSON']
  ]) await assert.rejects(analyzeWithModel({ ...args, fetchImpl: fetchFor(() => response(message(patch))) }), { code });
  await assert.rejects(analyzeWithModel({ ...args, mediaType: 'image/svg+xml' }), { code: 'MODEL_MEDIA_UNSUPPORTED' });
});

test('enabled key activates production client and loaded prompt; invalid response is not cached', async () => {
  resetAnalysisState();
  const oldKey = process.env.ANTHROPIC_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'fake-key';
  let posts = 0;
  globalThis.fetch = fetchFor((_, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.system, /관측된 사실/);
    posts++;
    return response(message({ content: [{ type: 'text', text: JSON.stringify(posts === 1 ? { ...observation, scale: 'invented' } : observation) }] }));
  });
  try {
    const input = { bytes, photoId: 'real', inputIndex: 0, fileRef: 'real.jpg' };
    await assert.rejects(analyzePhoto(input), { code: 'MODEL_CONTRACT' });
    assert.equal(analysisCounters().cacheSize, 0);
    const valid = await analyzePhoto(input);
    assert.equal(valid.analysis.analysis_source, 'vision_model');
    assert.equal(valid.analysis.photo_id, 'real');
    assert.equal(posts, 2);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
    resetAnalysisState();
  }
});

test('HTTP exposes model contract failure instead of returning heuristic success', async () => {
  const oldKey = process.env.ANTHROPIC_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'fake-key';
  globalThis.fetch = fetchFor(() => response(message({ content: [{ type: 'text', text: '{}' }] })));
  resetAnalysisState();
  try {
    let output;
    const res = { setHeader() {}, end(value) { output = JSON.parse(value); } };
    await handler({ method: 'POST', body: { photo_id: 'one', input_index: 0, file_ref: 'one.jpg', image_base64: bytes.toString('base64') } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(output.error.code, 'MODEL_CONTRACT');
    assert.equal(analysisCounters().cacheSize, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
    resetAnalysisState();
  }
});

test('key-present SVG is an explicit 415 from the production HTTP client, with no network', async () => {
  const oldKey = process.env.ANTHROPIC_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'fake-key';
  let attempts = 0;
  globalThis.fetch = () => { attempts++; throw new Error('must not call'); };
  resetAnalysisState();
  try {
    let output;
    const res = { setHeader() {}, end(value) { output = JSON.parse(value); } };
    const image = await readFile(new URL('../eval/golden/case_01/photos/ph_01.svg', import.meta.url));
    await handler({ method: 'POST', body: { photo_id: 'svg', input_index: 0, file_ref: 'svg', image_base64: image.toString('base64') } }, res);
    assert.equal(res.statusCode, 415);
    assert.equal(output.error.code, 'MODEL_MEDIA_UNSUPPORTED');
    assert.equal(attempts, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
    resetAnalysisState();
  }
});

test('thinking 블록이 앞에 와도 text 블록 하나를 읽는다', async () => {
  // claude-opus-5 는 thinking 이 기본으로 켜져 있어 content 가 [thinking, text] 로 온다.
  // 블록 개수를 1로 강제하면 실모델 호출이 100% MODEL_JSON 으로 죽는다.
  const withThinking = message({ content: [
    { type: 'thinking', thinking: '어떤 사진인지 살핀다.' },
    { type: 'text', text: JSON.stringify(observation) }
  ]});
  const result = await analyzeWithModel({ ...args, fetchImpl: fetchFor(() => response(withThinking)) });
  assert.deepEqual(result.observation, observation);
});

test('text 블록이 없거나 둘 이상이면 실패한다', async () => {
  const noText = message({ content: [{ type: 'thinking', thinking: '생각만 했다.' }] });
  await assert.rejects(analyzeWithModel({ ...args, fetchImpl: fetchFor(() => response(noText)) }), { code: 'MODEL_JSON' });
  const twoText = message({ content: [
    { type: 'text', text: JSON.stringify(observation) },
    { type: 'text', text: '{}' }
  ]});
  await assert.rejects(analyzeWithModel({ ...args, fetchImpl: fetchFor(() => response(twoText)) }), { code: 'MODEL_JSON' });
});

test('워크스페이스 ID 가 있으면 헤더로 보내고 없으면 보내지 않는다', async () => {
  // 워크스페이스에 묶이지 않은 키는 이 헤더가 없으면 API 가 400 을 돌려준다.
  let seen = null;
  const capture = () => async (url, options) => {
    if (url.includes('/models/')) return response({ id: 'test-model' });
    seen = options.headers['anthropic-workspace-id'];
    return response(message());
  };
  await analyzeWithModel({ ...args, workspaceId: 'wrkspc_test', fetchImpl: capture() });
  assert.equal(seen, 'wrkspc_test');
  seen = null;
  await analyzeWithModel({ ...args, workspaceId: undefined, fetchImpl: capture() });
  assert.equal(seen, undefined);
});
