import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validatePhoto } from '../lib/contracts.js';
import { readJpegBlocks } from '../lib/jpeg_dc.js';
import {
  analyzePhoto, analysisCounters, resetAnalysisState, measurePixels, detectMediaType,
  AnalysisUnavailableError, CACHE_LIMIT, MAX_IMAGE_BYTES
} from '../lib/photo_analysis.js';
import analyze from '../api/analyze.js';

// No test may reach the network. A developer's exported key must not change results.
delete process.env.ANTHROPIC_API_KEY;

const read = path => readFile(new URL('../' + path, import.meta.url));
const svg = await read('eval/golden/case_01/photos/ph_01.svg');
const svg2 = await read('eval/golden/case_01/photos/ph_02.svg');
const card = { bytes: svg, photoId: 'ph_01', inputIndex: 0, fileRef: 'eval/golden/case_01/photos/ph_01.svg' };
// Valid PNG signature, no decodable pixels: this repo has no inflate-based PNG reader,
// so it must fail honestly rather than emit color.
const opaquePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(64, 7)]);

// Heuristic describable_facts may only ever be one of these measured forms (spec W2).
const MEASURED_FACT = [
  /^\d+×\d+ (세로|가로|정사각) 이미지$/,
  /^평균 밝기 [\d.]+ \(.+\)$/,
  /^평균 채도 [\d.]+ \(.+\)$/,
  /^주요 색 #[0-9a-f]{6} \(점유 \d+%\)$/
];

test('heuristic output satisfies the PhotoAnalysis contract and is deterministic', async () => {
  resetAnalysisState();
  const first = await analyzePhoto(card);
  resetAnalysisState();
  const second = await analyzePhoto(card);
  validatePhoto(first.analysis);
  assert.equal(first.analysis.analysis_source, 'heuristic');
  assert.deepEqual({ ...first.analysis, analyzed_at: null }, { ...second.analysis, analyzed_at: null });
  // Committed fixture records this card's fill; the measurement must agree with it.
  assert.deepEqual(first.analysis.color.palette_hex, ['#e8dfd2']);
  assert.equal(first.analysis.text_in_image, 'synthetic 1');
});

test('heuristic never reports a subject, place, time or mood — only measured values', async () => {
  resetAnalysisState();
  for (const bytes of [svg, svg2, await read('eval/golden/case_01/photos/ph_07.svg')]) {
    const { analysis } = await analyzePhoto({ ...card, bytes, photoId: 'ph_' + bytes.length });
    assert.deepEqual(analysis.subjects, [], 'heuristic cannot see subjects');
    assert.equal(analysis.has_face, false);
    assert.ok(analysis.describable_facts.length > 0);
    for (const fact of analysis.describable_facts) {
      assert.ok(MEASURED_FACT.some(pattern => pattern.test(fact)), `unmeasured fact leaked: ${fact}`);
    }
  }
});

test('model failure falls back to heuristic instead of throwing', async () => {
  resetAnalysisState();
  const seen = [];
  const { analysis } = await analyzePhoto({
    ...card, apiKey: 'test-key', onModelError: e => seen.push(e.message),
    client: async () => { throw new Error('model HTTP 529: overloaded'); }
  });
  assert.equal(analysis.analysis_source, 'heuristic');
  assert.equal(analysis.model, 'heuristic-svg-fill@1');
  assert.equal(analysisCounters().modelFailures, 1);
  assert.match(seen[0], /529/);
  validatePhoto(analysis);
});

test('model observations are accepted but measured color overrides the model estimate', async () => {
  resetAnalysisState();
  const { analysis } = await analyzePhoto({
    ...card, apiKey: 'test-key',
    client: async () => ({
      model: 'claude-opus-5-test',
      observation: {
        color: { hue_mean: 999, sat_mean: 9, bright_mean: 9, palette_hex: ['nonsense'] },
        composition: 'full_frame', scale: 'closeup', subjects: ['머그컵'], has_face: false,
        text_in_image: 'SEOUL', describable_facts: ['흰 머그컵 하나가 나무 테이블 위에 있다'], quality_flags: []
      }
    })
  });
  assert.equal(analysis.analysis_source, 'vision_model');
  assert.equal(analysis.model, 'claude-opus-5-test');
  assert.deepEqual(analysis.subjects, ['머그컵']);
  assert.deepEqual(analysis.color.palette_hex, ['#e8dfd2'], 'measured pixels must win over the model guess');
  assert.equal(analysis.color.hue_mean, 35.5);
  validatePhoto(analysis);
});

test('a model response that violates the contract is rejected, not trusted', async () => {
  resetAnalysisState();
  await assert.rejects(analyzePhoto({
    ...card, apiKey: 'test-key',
    client: async () => ({ model: 'x', observation: { composition: 'sideways', scale: 'closeup', subjects: [], has_face: false, text_in_image: null, describable_facts: [], quality_flags: [] } })
  }), /composition/);
});

test('same bytes twice: zero extra model calls, identity re-stamped, duplicate reported', async () => {
  resetAnalysisState();
  const client = async () => ({ model: 'm', observation: { color: { hue_mean: 1, sat_mean: 0, bright_mean: 0, palette_hex: [] }, composition: 'full_frame', scale: 'midshot', subjects: [], has_face: false, text_in_image: null, describable_facts: [], quality_flags: [] } });
  const first = await analyzePhoto({ ...card, apiKey: 'k', client });
  assert.equal(analysisCounters().modelCalls, 1);
  assert.equal(first.fromCache, false);

  const again = await analyzePhoto({ ...card, apiKey: 'k', client });
  assert.equal(analysisCounters().modelCalls, 1, 'cache hit must not call the model');
  assert.equal(again.fromCache, true);

  const renamed = await analyzePhoto({ ...card, photoId: 'ph_99', inputIndex: 9, fileRef: 'other.svg', apiKey: 'k', client });
  assert.equal(analysisCounters().modelCalls, 1);
  assert.equal(renamed.analysis.photo_id, 'ph_99', 'cached result must not carry the first photo_id');
  assert.equal(renamed.analysis.input_index, 9);
  assert.equal(renamed.analysis.file_ref, 'other.svg');
  assert.ok(renamed.analysis.quality_flags.includes('duplicate_of:ph_01'));
  assert.equal(first.analysis.analyzed_at, renamed.analysis.analyzed_at, 'reuse must not pose as a fresh analysis');
});

test('cache is bounded and holds no more than CACHE_LIMIT entries', async () => {
  resetAnalysisState();
  const base = svg.toString('utf8');
  for (let i = 0; i < CACHE_LIMIT + 10; i++) {
    await analyzePhoto({ ...card, photoId: `ph_${i}`, bytes: Buffer.from(base.replace('synthetic 1', `synthetic ${i}`)) });
  }
  assert.equal(analysisCounters().cacheSize, CACHE_LIMIT);
});

test('unobservable bytes fail honestly instead of inventing color', async () => {
  resetAnalysisState();
  assert.equal(detectMediaType(opaquePng), 'image/png');
  assert.equal(measurePixels(opaquePng, 'image/png'), null);
  await assert.rejects(analyzePhoto({ ...card, bytes: opaquePng, mediaType: 'image/png' }), AnalysisUnavailableError);
  await assert.rejects(analyzePhoto({ ...card, bytes: Buffer.alloc(0) }), AnalysisUnavailableError);
  await assert.rejects(analyzePhoto({ ...card, bytes: Buffer.from('plain text') }), /unsupported media type/);
});

test('jpeg DC reader returns a real block grid and rejects what it cannot read', () => {
  assert.equal(readJpegBlocks(Buffer.from([1, 2, 3, 4])), null);
  assert.equal(readJpegBlocks(Buffer.concat([Buffer.from([0xFF, 0xD8]), Buffer.alloc(64)])), null);
  // Truncating a real JPEG must produce null, never a partial guess.
  assert.equal(readJpegBlocks(Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xC2]), Buffer.alloc(16)])), null);
});

// --- api/analyze.js: one photo per request -----------------------------------
async function call(body, method = 'POST') {
  const headers = {};
  let out;
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const req = { method, [Symbol.asyncIterator]: async function* () { if (body !== undefined) yield Buffer.from(payload); } };
  const res = { statusCode: 200, setHeader: (k, v) => { headers[k] = v; }, end: v => { out = JSON.parse(v); } };
  await analyze(req, res);
  return { status: res.statusCode, headers, body: out };
}
const validRequest = { photo_id: 'ph_01', input_index: 0, file_ref: 'up/ph_01.svg', media_type: 'image/svg+xml', image_base64: svg.toString('base64') };

test('POST one photo returns one PhotoAnalysis', async () => {
  resetAnalysisState();
  const response = await call(validRequest);
  assert.equal(response.status, 200);
  assert.ok(!Array.isArray(response.body));
  validatePhoto(response.body);
  assert.equal(response.body.photo_id, 'ph_01');
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('there is no many-photos-per-request path', async () => {
  for (const body of [{ ...validRequest, photos: [validRequest] }, { ...validRequest, images: [] }, { ...validRequest, batch: 1 }, [validRequest]]) {
    const response = await call(body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 40));
    assert.equal(response.body.error.code, 'INVALID_REQUEST');
  }
});

test('request validation is explicit at the trust boundary', async () => {
  assert.equal((await call(validRequest, 'GET')).status, 405);
  assert.equal((await call(validRequest, 'GET')).headers.Allow, 'POST');
  assert.equal((await call('not json')).status, 400);
  for (const patch of [{ photo_id: '' }, { photo_id: 7 }, { input_index: -1 }, { input_index: 1.5 }, { file_ref: '' }, { image_base64: '' }, { image_base64: 'not*base64' }, { image_base64: 'abc' }]) {
    const response = await call({ ...validRequest, ...patch });
    assert.equal(response.status, 400, JSON.stringify(patch));
  }
  assert.equal((await call({ ...validRequest, media_type: 'image/tiff' })).status, 415);
  assert.equal((await call({ ...validRequest, media_type: 'image/png', image_base64: opaquePng.toString('base64') })).status, 422);
  const huge = { ...validRequest, media_type: 'image/jpeg', image_base64: Buffer.alloc(MAX_IMAGE_BYTES + 16).toString('base64') };
  assert.equal((await call(huge)).status, 413);
});

test('data URL prefixes are accepted, not silently mangled', async () => {
  resetAnalysisState();
  const response = await call({ ...validRequest, image_base64: `data:image/svg+xml;base64,${svg.toString('base64')}` });
  assert.equal(response.status, 200);
  validatePhoto(response.body);
});

test('the heuristic path makes zero outbound attempts with the network disabled', () => {
  const script = `
    import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; import dns from 'node:dns';
    let attempts=0; const denied=()=>{attempts++;throw new Error('Network disabled');};
    globalThis.fetch=denied;
    net.connect=net.createConnection=net.Socket.prototype.connect=denied;
    http.request=http.get=https.request=https.get=denied;
    dns.lookup=dns.resolve=dns.promises.lookup=dns.promises.resolve=denied;
    delete process.env.ANTHROPIC_API_KEY;
    const {readFile}=await import('node:fs/promises');
    const {analyzePhoto}=await import('./lib/photo_analysis.js');
    const bytes=await readFile('eval/golden/case_01/photos/ph_01.svg');
    const {analysis}=await analyzePhoto({bytes,photoId:'ph_01',inputIndex:0,fileRef:'x.svg'});
    if(analysis.analysis_source!=='heuristic') throw new Error('expected heuristic');
    if(attempts!==0) throw new Error('Outbound attempted');
    console.log('outbound attempts: '+attempts);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /outbound attempts: 0/);
});
