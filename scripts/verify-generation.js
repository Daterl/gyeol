// Paid real-model acceptance: node --env-file=.env.local scripts/verify-generation.js <images-dir> <report.json>
// Analyze 15 actual images once; reuse those observations for five fresh generations per size.
// Optional third argument reuses a saved report after checking each image hash.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzePhoto } from '../lib/photo_analysis.js';
import { buildFeed } from '../lib/pipeline.js';
import { handleGenerate } from '../lib/output-generation.js';
import { validateGenerateResponse } from '../lib/interaction.js';
import { DEFAULT_MODEL, OUTPUT_MODEL } from '../lib/model.js';

const [directory, reportPath, analysisReport] = process.argv.slice(2);
assert.ok(directory && reportPath, 'Pass images directory and report path');
const report = {
  started_at: new Date().toISOString(), status: 'running',
  vision_model: process.env.GYEOL_VISION_MODEL || DEFAULT_MODEL,
  output_model: process.env.GYEOL_OUTPUT_MODEL || OUTPUT_MODEL,
  node: process.version,
  method: '15 real images analyzed once; five fresh POST handler calls each for 3 and 15 photos; no harness retries or mocks; server may retry one rejected hint selection within the shared deadline',
  analyses: [], runs: [],
};
const save = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
try {
  assert.ok(process.env.ANTHROPIC_API_KEY?.trim(), 'ANTHROPIC_API_KEY is missing');
  const files = (await readdir(directory)).filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file)).sort().slice(0, 15);
  assert.equal(files.length, 15, 'Need at least 15 actual images');
  const photos = [];
  const saved = analysisReport ? JSON.parse(await readFile(analysisReport, 'utf8')).analyses : null;
  report.reused_analyses = analysisReport ?? null;
  for (const [index, file] of files.entries()) {
    const bytes = await readFile(resolve(directory, file));
    const prior = saved?.[index];
    if (prior) {
      assert.equal(prior.file, file);
      assert.equal(prior.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
    const result = prior ? { analysis: prior.analysis, execution: { ...prior.execution, acceptance_reuse: true } } : await analyzePhoto({ bytes, photoId: `ph_${String(index + 1).padStart(2, '0')}`, inputIndex: index, fileRef: file });
    assert.equal(result.analysis.analysis_source, 'vision_model');
    photos.push(result.analysis);
    report.analyses.push({ file, sha256: createHash('sha256').update(bytes).digest('hex'), analysis: result.analysis, execution: result.execution });
    await save();
    console.log(`analyzed ${index + 1}/15`);
  }
  for (const count of [3, 15]) {
    for (let run = 1; run <= 5; run++) {
      const built = await buildFeed({ schema_version: '1.0', session_id: `accept-123-${count}-${run}`, photos: photos.slice(0, count), identity: { target: { kind: 'none' }, current: { kind: 'none' } } });
      const input = { schema_version: '1.0', mode: 'all', feed: built.feed, context: built.context };
      const start = performance.now();
      const provider = [];
      const fetchImpl = async (...args) => {
        const response = await fetch(...args);
        if (String(args[0]).endsWith('/messages')) provider.push(await response.clone().json());
        return response;
      };
      const response = await handleGenerate(new Request('http://localhost/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }), { fetchImpl });
      const body = await response.json();
      const entry = { count, run, status: response.status, elapsed_ms: Math.round(performance.now() - start), body, provider };
      report.runs.push(entry);
      await save();
      assert.equal(response.status, 200, JSON.stringify(body));
      validateGenerateResponse(body, input);
      assert.equal(body.output.slots.length, count);
      assert.ok(body.output.title.trim() && !/[\r\n]/.test(body.output.title));
      assert.deepEqual(body.output.slots.map(slot => [slot.photo_id, slot.position]), built.feed.slots.map(slot => [slot.photo_id, slot.position]));
      for (const slot of body.output.slots) {
        const facts = built.feed.slots.find(item => item.photo_id === slot.photo_id).caption_inputs.describable_facts;
        const own = slot.evidence.filter(item => item.kind === 'uploaded_photo');
        assert.equal(own.length, 1);
        assert.equal(own[0].ref, slot.photo_id);
        assert.ok(facts.length ? facts.includes(own[0].note) : own[0].note === '확인한 관측 사실이 없음');
        if (slot.caption_state === 'omitted') assert.ok(slot.omit_reason?.trim());
        else assert.equal(slot.caption_state, 'seed');
      }
      entry.verified = true;
      await save();
      console.log(`${count} photos run ${run}: 200 verified`);
    }
  }
  report.status = 'passed';
} catch (error) {
  report.status = error.status === 401 || error.status === 403 || !process.env.ANTHROPIC_API_KEY?.trim() ? 'blocked' : 'failed';
  report.error = { code: error.code ?? 'ACCEPTANCE_FAILED', message: error.message, ...(error.status ? { http_status: error.status } : {}) };
  process.exitCode = 1;
} finally {
  report.finished_at = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ status: report.status, error: report.error, completed_runs: report.runs.length }));
}
