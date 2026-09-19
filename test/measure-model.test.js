import test from 'node:test';
import assert from 'node:assert/strict';
import { measureModel } from '../scripts/measure-model.js';

const image = new URL('../fixtures/jpeg/solid_white_baseline.jpg', import.meta.url);
const success = async ({ photoId, fileRef }) => ({
  analysis: { photo_id: photoId, file_ref: fileRef, analysis_source: 'vision_model', describable_facts: ['흰 면'] },
  fromCache: false, usage: { input_tokens: 12, output_tokens: 8 }, execution: { attempts: 1, cache_hit: false },
});

test('1/3/15 calls record fresh results, duplicate inputs, usage and explicit local scope', async () => {
  for (const count of [1, 3, 15]) {
    let calls = 0;
    const report = await measureModel(Array(count).fill(image), { apiKey: 'fake', revision: 'test-sha',
      analyze: async args => { calls++; return success(args); } });
    assert.equal(calls, count);
    assert.equal(report.status, 'MEASURED');
    assert.equal(report.completed_count, count);
    assert.equal(report.unique_image_count, 1);
    assert.equal(report.environment, 'local-node-library');
    assert.equal(report.revision, 'test-sha');
    assert.equal(report.usage_coverage, count);
    assert.equal(report.billing.actual_usd, null);
    assert.equal(report.billing.estimated_usd, null);
    assert.equal(report.quality.status, 'PENDING');
    assert.equal(report.server_deadline.status, 'PENDING');
    assert.deepEqual(report.results[0].analysis.describable_facts, ['흰 면']);
    assert.ok(report.results[0].input_bytes > 0);
    assert.ok(report.results[0].width > 0);
    assert.equal(report.results[0].sha256.length, 64);
    assert.ok(!JSON.stringify(report).includes('/fixtures/'));
  }
});

test('invalid batch or missing credentials does not call the model', async () => {
  const analyze = () => assert.fail('must not call');
  assert.equal((await measureModel([image, image], { apiKey: 'fake', analyze })).code, 'INPUT_COUNT');
  assert.equal((await measureModel([image, image, image], { apiKey: '', analyze })).reason, 'missing_api_key');
  const report = await measureModel([image, image, '/private/missing-secret-file'], { apiKey: 'fake', analyze });
  assert.equal(report.code, 'INPUT_READ');
  assert.equal(report.failed_index, 2);
  assert.ok(!JSON.stringify(report).includes('missing-secret-file'));
});

test('deadline failure remains a failure with partial usage, while later photos are measured', async () => {
  let calls = 0;
  const report = await measureModel(Array(3).fill(image), { apiKey: 'fake', analyze: args => {
    if (++calls === 2) throw Object.assign(new Error('secret-provider-body'), { code: 'MODEL_TIMEOUT' });
    return success(args);
  } });
  assert.equal(report.status, 'FAILED');
  assert.equal(report.completed_count, 2);
  assert.equal(report.failed_count, 1);
  assert.equal(report.unattempted_count, 0);
  assert.equal(report.usage_coverage, 2);
  assert.equal(report.results[1].code, 'MODEL_TIMEOUT');
  assert.ok(!JSON.stringify(report).includes('secret-provider-body'));
});

test('account failure stops paid attempts and reports safe status only', async () => {
  let calls = 0;
  const report = await measureModel(Array(15).fill(image), { apiKey: 'fake', analyze: () => {
    calls++;
    throw Object.assign(new Error('secret'), { code: 'MODEL_HTTP', status: 401 });
  } });
  assert.equal(calls, 1);
  assert.equal(report.unattempted_count, 14);
  assert.equal(report.results[0].http_status, 401);
  assert.equal(report.usage_coverage, 0);
});

test('cache and heuristic results cannot be advertised as live measurements', async () => {
  for (const patch of [{ fromCache: true }, { analysis: { analysis_source: 'heuristic' } }]) {
    const report = await measureModel([image], { apiKey: 'fake', analyze: async args => ({ ...await success(args), ...patch }) });
    assert.equal(report.status, 'FAILED');
    assert.equal(report.results[0].code, 'NOT_FRESH_MODEL');
  }
});
