import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { measureSvg, analyzePhoto, resetAnalysisState, AnalysisUnavailableError } from '../lib/photo_analysis.js';
import { readJpegBlocks } from '../lib/jpeg_dc.js';

const card = '<svg width="16" height="16"><rect width="16" height="16" fill="#ffffff"/><text>sample</text></svg>';
const input = { photoId: 'boundary', inputIndex: 0, fileRef: 'boundary.svg', mediaType: 'image/svg+xml', apiKey: '' };

test('hidden SVG roots and invalid numeric entities fail without invented observations', async () => {
  for (const svg of [
    ...['visibility="hidden"', 'style="display:none"', 'opacity="0"'].map(attr => card.replace('<svg ', `<svg ${attr} `)),
    ...['&#1114112;', '&#xD800;', '&#0;'].map(entity => card.replace('sample', entity)),
  ]) {
    resetAnalysisState();
    const bytes = Buffer.from(svg);
    assert.equal(measureSvg(bytes), null);
    await assert.rejects(analyzePhoto({ ...input, bytes }), AnalysisUnavailableError);
  }
  assert.equal(measureSvg(Buffer.from(card.replace('sample', '&#x1F331; &amp; &#65;'))).text_in_image, '🌱 & A');
});

test('JPEG invalid headers are rejected before allocating pixel grids', async () => {
  const valid = await readFile(new URL('../fixtures/jpeg/solid_white_baseline.jpg', import.meta.url));
  assert.ok(readJpegBlocks(valid));
  const frame = valid.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(frame > 0);
  const oversize = Buffer.from(valid);
  oversize.writeUInt16BE(65535, frame + 5); oversize.writeUInt16BE(65535, frame + 7);
  const badCount = Buffer.from(valid); badCount[frame + 9] = 255;
  const badSampling = Buffer.from(valid); badSampling[frame + 11] = 0xff;
  const original = globalThis.Float64Array;
  try {
    globalThis.Float64Array = class { constructor() { throw new Error('Invalid header reached pixel allocation'); } };
    for (const bytes of [oversize, badCount, badSampling]) assert.equal(readJpegBlocks(bytes), null);
  } finally { globalThis.Float64Array = original; }
});

test('returned facts and measurement cannot mutate later cache hits', async () => {
  resetAnalysisState();
  const request = { ...input, bytes: Buffer.from(card) };
  const first = await analyzePhoto(request);
  const expected = structuredClone(first.analysis);
  first.analysis.subjects.push('not observed');
  first.analysis.describable_facts.push('invented');
  first.measurement.color.palette_hex.push('#000000');
  assert.deepEqual((await analyzePhoto(request)).analysis, expected);
});
