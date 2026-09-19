// Paid local HTTP acceptance against a separately started, unmodified next start.
// node scripts/verify-production-generation.mjs <local-base> <images-dir> <report.json> [analysis-report.json]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFeed } from '../lib/pipeline.js';
import { validateGenerateResponse } from '../lib/interaction.js';

const [base, directory, reportPath, analysisPath = 'docs/specs/123-generation/acceptance.json'] = process.argv.slice(2);
assert.ok(base && directory && reportPath, 'Pass local base URL, original images directory, and report path');
const endpoint = new URL('/api/generate', base);
assert.ok(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname), 'Local HTTP server only');
const prior = JSON.parse(await readFile(analysisPath, 'utf8'));
assert.equal(prior.analyses.length, 15, '15 original analyses required');
const report = { started_at: new Date().toISOString(), node: process.version,
  method: 'Real next start HTTP and real provider; reused image analyses verified against original SHA-256; no harness retries',
  analysis_source: analysisPath, photos: [], runs: [], status: 'running' };
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
try {
  const photos = [];
  for (const source of prior.analyses) {
    const hash = createHash('sha256').update(await readFile(resolve(directory, source.file))).digest('hex');
    assert.equal(hash, source.sha256, `Image hash mismatch: ${source.file}`);
    assert.equal(source.analysis.analysis_source, 'vision_model');
    report.photos.push({ file: source.file, sha256: hash });
    photos.push(source.analysis);
  }
  assert.equal(new Set(photos.map(photo => photo.photo_id)).size, 15);
  for (const count of [3, 15]) {
    for (const prompt of ['', '사진의 분위기를 짧고 담백하게 기록해 줘']) {
      const built = await buildFeed({ schema_version: '1.0', session_id: `issue-183-${count}`, photos: photos.slice(0, count),
        identity: { target: prompt ? { kind: 'text', text: prompt } : { kind: 'none' }, current: { kind: 'none' } } });
      const input = { schema_version: '1.0', mode: 'all', ...built };
      const start = performance.now();
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(60000) });
      const body = await response.json();
      const run = { count, prompt, status: response.status, elapsed_ms: Math.round(performance.now() - start), body, verified: false };
      report.runs.push(run);
      await save();
      assert.equal(response.status, 200, `${count}/${prompt ? 'written' : 'empty'}: ${JSON.stringify(body)}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      validateGenerateResponse(body, input);
      assert.equal(body.output.slots.length, count);
      assert.deepEqual(body.output.slots.map(slot => [slot.photo_id, slot.position]), built.feed.slots.map(slot => [slot.photo_id, slot.position]));
      for (const slot of body.output.slots) {
        const facts = built.feed.slots.find(item => item.photo_id === slot.photo_id).caption_inputs.describable_facts;
        const own = slot.evidence.filter(item => item.kind === 'uploaded_photo');
        assert.equal(own.length, 1);
        assert.equal(own[0].ref, slot.photo_id);
        assert.ok(facts.length ? facts.includes(own[0].note) : own[0].note === '확인한 관측 사실이 없음');
      }
      run.verified = true;
      await save();
      console.log(`PASS ${count} photos / ${prompt ? 'written' : 'empty'} prompt: HTTP 200, contract, photo IDs/order/evidence (${run.elapsed_ms} ms)`);
    }
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  throw error;
} finally {
  await save();
}
