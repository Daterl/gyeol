import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = path => {
  const result = spawnSync(process.execPath, ['scripts/measure-generation.js', path], {
    encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' },
  });
  return { exit: result.status, report: JSON.parse(result.stdout) };
};

test('generation measurement does not expose unreadable input paths', () => {
  const { exit, report } = run('/private/secret-analysis-file');
  assert.equal(exit, 1);
  assert.equal(report.reason, 'unreadable_analysis_report');
  assert.ok(!JSON.stringify(report).includes('secret-analysis-file'));
});

test('generation measurement refuses incomplete or synthetic source reports before network', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gyeol-measure-'));
  try {
    const path = join(dir, 'input.json');
    for (const source of ['heuristic', 'vision_model']) {
      writeFileSync(path, JSON.stringify({ status: 'MEASURED', requested_count: 3,
        results: Array.from({ length: source === 'heuristic' ? 3 : 1 }, () => ({ status: 'MEASURED', analysis: { analysis_source: source } })) }));
      const { report } = run(path);
      assert.equal(report.reason, 'complete_live_analysis_required');
      assert.equal(report.results.length, 0);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('generation measurement discloses missing credentials without heuristic generation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gyeol-measure-'));
  try {
    const path = join(dir, 'input.json');
    writeFileSync(path, JSON.stringify({ status: 'MEASURED', requested_count: 3,
      results: Array.from({ length: 3 }, () => ({ status: 'MEASURED', analysis: { analysis_source: 'vision_model' } })) }));
    const { report } = run(path);
    assert.equal(report.reason, 'missing_api_key');
    assert.equal(report.billing.actual_usd, null);
    assert.equal(report.results.length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
