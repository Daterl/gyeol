import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
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

test('selected model failure is explicit and never cached', async () => {
  resetAnalysisState();
  const seen = [];
  await assert.rejects(analyzePhoto({ ...card, apiKey: 'test-key', onModelError: e => seen.push(e.message),
    client: async () => { throw new Error('model HTTP 529: overloaded'); }
  }), { code: 'MODEL_FAILURE' });
  assert.equal(analysisCounters().modelFailures, 1);
  assert.equal(analysisCounters().cacheSize, 0);
  assert.match(seen[0], /529/);
});

test('model observations are accepted but measured color overrides the model estimate', async () => {
  resetAnalysisState();
  const { analysis } = await analyzePhoto({
    ...card, apiKey: 'test-key',
    client: async () => ({
      model: 'claude-opus-5-test',
      observation: {
        color: { hue_mean: 0, sat_mean: 0, bright_mean: 0, palette_hex: ['#000000'] },
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

test('model receives a 512px thumbnail instead of the original large raster', async () => {
  resetAnalysisState();
  const bytes=await sharp({create:{width:1200,height:900,channels:3,background:'#6b7280'}}).jpeg({quality:90}).toBuffer();
  let sent;
  const observation={
    color:{hue_mean:0,sat_mean:0,bright_mean:0,palette_hex:['#000000']},
    composition:'full_frame',scale:'midshot',subjects:['회색 카드'],has_face:false,
    text_in_image:null,describable_facts:['회색 카드가 보인다'],quality_flags:[]
  };
  const result=await analyzePhoto({...card,bytes,mediaType:'image/jpeg',apiKey:'key',client:async input=>{
    sent=input;
    return {model:'test-model',observation};
  }});
  const metadata=await sharp(sent.bytes).metadata();
  assert.equal(sent.mediaType,'image/jpeg');
  assert.equal(Math.max(metadata.width,metadata.height),512);
  assert.equal(result.measurement.width,1200,'measurement remains tied to the original upload');
  assert.deepEqual(result.analysis.describable_facts,observation.describable_facts);
});

test('discarded model color may be invalid only when trusted pixel color replaces it', async () => {
  const invalid={
    color:{hue_mean:0,sat_mean:0,bright_mean:0,palette_hex:['not-a-hex']},
    composition:'full_frame',scale:'midshot',subjects:[],has_face:false,
    text_in_image:null,describable_facts:[],quality_flags:[]
  };
  const client=async()=>({model:'test-model',observation:invalid});
  const images=[
    ['image/jpeg',await read('fixtures/jpeg/solid_white_baseline.jpg')],
    ['image/png',await sharp({create:{width:32,height:32,channels:3,background:'#ffffff'}}).png().toBuffer()],
    ['image/webp',await sharp({create:{width:32,height:32,channels:3,background:'#ffffff'}}).webp().toBuffer()]
  ];
  for (const [mediaType,bytes] of images) {
    resetAnalysisState();
    const result=await analyzePhoto({...card,bytes,mediaType,apiKey:'key',client});
    assert.deepEqual(result.analysis.color.palette_hex,['#ffffff'],mediaType);
  }

  resetAnalysisState();
  await assert.rejects(analyzePhoto({...card,bytes:opaquePng,mediaType:'image/png',apiKey:'key',client}),{code:'MODEL_CONTRACT'});
});

test('contract violations fail before correction and never enter cache', async () => {
  const valid = { color: { hue_mean: 0, sat_mean: 0, bright_mean: 0, palette_hex: [] }, composition: 'full_frame',
    scale: 'midshot', subjects: [], has_face: false, text_in_image: null, describable_facts: [], quality_flags: [] };
  for (const patch of [{ composition: 'sideways' }, { text_in_image: '' }, { color: { hue_mean: 999 } },
    { photo_id: 'ghost' }, { quality_flags: ['duplicate_of:ghost'] }, { subjects: undefined }]) {
    resetAnalysisState();
    let calls = 0;
    const client = async () => ({ model: 'test-model', observation: ++calls === 1 ? { ...valid, ...patch } : valid });
    await assert.rejects(analyzePhoto({ ...card, apiKey: 'key', client }), { code: 'MODEL_CONTRACT' });
    assert.equal(analysisCounters().cacheSize, 0);
    const recovered = await analyzePhoto({ ...card, apiKey: 'key', client });
    assert.equal(calls, 2);
    assert.equal(recovered.fromCache, false);
    assert.equal(recovered.analysis.analysis_source, 'vision_model');
  }
});

test('key/model namespaces separate heuristic and model cache; callers cannot poison cached facts', async () => {
  resetAnalysisState();
  const heuristic = await analyzePhoto(card);
  assert.equal(heuristic.execution.reason, 'missing_api_key');
  const client = async () => ({ model: 'm', observation: { color: { hue_mean: 1, sat_mean: 0, bright_mean: 0, palette_hex: [] },
    composition: 'full_frame', scale: 'midshot', subjects: [], has_face: false, text_in_image: null,
    describable_facts: ['관측된 사실'], quality_flags: [] } });
  const first = await analyzePhoto({ ...card, apiKey: 'k', model: 'a', client });
  assert.equal(first.fromCache, false);
  first.analysis.describable_facts.push('오염');
  first.analysis.color.palette_hex.push('bad');
  const cached = await analyzePhoto({ ...card, apiKey: 'k', model: 'a', client });
  assert.equal(cached.fromCache, true);
  assert.deepEqual(cached.analysis.describable_facts, ['관측된 사실']);
  validatePhoto(cached.analysis);
  assert.equal((await analyzePhoto({ ...card, apiKey: 'k', model: 'b', client })).fromCache, false);
  assert.equal((await analyzePhoto({ ...card, apiKey: 'other-key', model: 'a', client })).fromCache, false);
  assert.equal((await analyzePhoto(card)).analysis.analysis_source, 'heuristic');
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

// review-codex.md H1. The old test above decoded no real JPEG at all, so it could not
// see that a baseline scan never consumed its AC coefficients and therefore read every
// DC after the first from the wrong bit offset. Both checks below need no image library:
// a solid image's colour is known by construction, and the two encodings of the
// gradient are the same pixels, so they have to agree.
test('baseline JPEG is measured, not mis-read: solid colours are exact', async () => {
  for (const [file, bright, sat, hex] of [
    ['solid_white_baseline.jpg', 1, 0, '#ffffff'],
    ['solid_black_baseline.jpg', 0, 0, '#000000']
  ]) {
    const m = measurePixels(await read(`fixtures/jpeg/${file}`), 'image/jpeg');
    assert.ok(m, `${file} must be measurable`);
    assert.equal(m.color.bright_mean, bright, `${file} brightness`);
    assert.equal(m.color.sat_mean, sat, `${file} saturation — a grey image has no colour`);
    assert.deepEqual(m.color.palette_hex, [hex], `${file} palette`);
  }
});

test('baseline and progressive encodings of the same pixels agree', async () => {
  const base = measurePixels(await read('fixtures/jpeg/gradient_baseline.jpg'), 'image/jpeg');
  const prog = measurePixels(await read('fixtures/jpeg/gradient_progressive.jpg'), 'image/jpeg');
  assert.ok(base && prog, 'both encodings must decode');
  assert.equal(base.width, prog.width);
  assert.equal(base.height, prog.height);
  for (const key of ['bright_mean', 'sat_mean']) {
    assert.ok(Math.abs(base.color[key] - prog.color[key]) < 0.02,
      `${key} drifted between encodings: ${base.color[key]} vs ${prog.color[key]}`);
  }
  // Before the fix the baseline read 0.714/0.118 where the progressive twin read
  // 0.623/0.432 — the drift, not the absolute value, is what proves the bug.
  assert.ok(base.color.sat_mean > 0.3, `baseline saturation collapsed: ${base.color.sat_mean}`);
});

// review-codex.md H3.
test('SVG is measured only as the flat-colour card it claims to support', async () => {
  const rejected = {
    'zero-area rect counted as half the frame':
      '<svg width="100" height="100"><rect width="100" height="100" fill="#ffffff"/><rect width="0" height="0" fill="#000000"/></svg>',
    'unclosed document': '<svg width="100" height="100" fill="#ffffff"',
    'rect does not cover the canvas': '<svg width="100" height="100"><rect width="10" height="10" fill="#000000"/></svg>',
    'offset rect': '<svg width="100" height="100"><rect x="20" y="0" width="100" height="100" fill="#000000"/></svg>',
    'invisible rect': '<svg width="100" height="100"><rect width="100" height="100" fill="#000000" opacity="0"/></svg>',
    'no explicit canvas size': '<svg><rect width="100" height="100" fill="#000000"/></svg>',
    'fill is not a plain colour': '<svg width="100" height="100"><rect width="100" height="100" fill="url(#g)"/></svg>'
  };
  for (const [why, svg] of Object.entries(rejected)) {
    assert.equal(measurePixels(Buffer.from(svg), 'image/svg+xml'), null, `should be unmeasurable: ${why}`);
    resetAnalysisState();
    await assert.rejects(analyzePhoto({ ...card, bytes: Buffer.from(svg) }), AnalysisUnavailableError, why);
  }
});

test('SVG text is reported only when a viewer could see it, and unescaped', async () => {
  const cardSvg = body => Buffer.from(`<svg width="100" height="100"><rect width="100" height="100" fill="#ffffff"/>${body}</svg>`);
  for (const hidden of ['<text display="none">서울 &amp; 부산</text>', '<text visibility="hidden">서울</text>', '<text opacity="0">서울</text>']) {
    assert.equal(measurePixels(cardSvg(hidden), 'image/svg+xml').text_in_image, null, hidden);
  }
  // Visible text is in the bytes, so it is reported — as the characters, not the escape.
  assert.equal(measurePixels(cardSvg('<text x="8" y="50">서울 &amp; 부산</text>'), 'image/svg+xml').text_in_image, '서울 & 부산');
  assert.equal(measurePixels(cardSvg('<text x="8" y="50">   </text>'), 'image/svg+xml').text_in_image, null);
});

// review-codex.md H4.
test('composition is a documented constant, not a reading of the colour histogram', async () => {
  resetAnalysisState();
  const compositions = new Set();
  for (const [name, bytes] of [
    // A checkerboard fills the whole frame and used to score negative_space because
    // white and black each took 50% of the buckets.
    ['checker', await read('fixtures/jpeg/gradient_baseline.jpg')],
    ['solid', await read('fixtures/jpeg/solid_white_baseline.jpg')],
    ['card', svg]
  ]) {
    const { analysis } = await analyzePhoto({ ...card, bytes, photoId: `ph_${name}` });
    assert.equal(analysis.composition, 'full_frame', `${name}: heuristic must not claim negative space`);
    compositions.add(analysis.composition);
    // The colour share is still reported — as a colour share, which is what it is.
    assert.ok(analysis.describable_facts.some(f => /^주요 색 #[0-9a-f]{6} \(점유 \d+%\)$/.test(f)), name);
  }
  assert.equal(compositions.size, 1, 'a constant must carry no information about the image');
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
  assert.equal(response.headers['X-Gyeol-Analysis-Source'], 'heuristic');
  assert.equal(response.headers['X-Gyeol-Analysis-Reason'], 'missing_api_key');
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

test('the folder runner records a model failure and continues with the next photo', () => {
  const preload=`data:text/javascript,${encodeURIComponent("globalThis.fetch=async()=>new Response('{}',{status:500})")}`;
  const result=spawnSync(process.execPath,['--import',preload,'scripts/run_pipeline.js','fixtures/jpeg','2'],{
    cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,ANTHROPIC_API_KEY:'fake'}
  });
  assert.equal(result.status,1);
  assert.deepEqual(JSON.parse(result.stdout),[],'the runner must finish and emit valid JSON');
  assert.match(result.stderr,/ph_01: Model HTTP 500/);
  assert.match(result.stderr,/ph_02: Model HTTP 500/);
});

// The structured-output API rejects these array keywords outright (maxItems, uniqueItems)
// or for values other than 0/1 (minItems). A schema carrying one makes every real
// vision call fail with HTTP 400 while every mock-path test still passes, so assert on
// the schema actually handed to the model client rather than on a copy.
test('W5: the observation schema sent to the model uses no rejected array keywords', async () => {
  let sent = null;
  await analyzePhoto({
    ...card,
    apiKey: 'test-key-not-used-for-network',
    client: async ({ schema }) => { sent = schema; throw new Error('captured'); }
  }).catch(() => {});
  assert.ok(sent, 'the model client was never called, so no schema was captured');

  const offenders = [];
  (function walk(node, path) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (Object.hasOwn(node, 'maxItems')) offenders.push(`${path}.maxItems`);
    if (Object.hasOwn(node, 'uniqueItems')) offenders.push(`${path}.uniqueItems`);
    if (Object.hasOwn(node, 'minItems') && node.minItems !== 0 && node.minItems !== 1) {
      offenders.push(`${path}.minItems=${node.minItems}`);
    }
    for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
  })(sent, 'schema');

  assert.deepEqual(offenders, [], `schema carries keywords the model API rejects: ${offenders.join(', ')}`);
});
