// node --env-file=/private/path/.env.local scripts/measure-model.js <1, 3 or 15 image paths>
// Local library measurement, not a deployed function or end-to-end UI measurement.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { analyzePhoto, resetAnalysisState, detectMediaType, MAX_IMAGE_BYTES } from '../lib/photo_analysis.js';
import { modelRoute, DEFAULT_MODEL, MODEL_TIMEOUT_MS } from '../lib/model.js';

export async function measureModel(files, {
  apiKey = process.env.ANTHROPIC_API_KEY,
  analyze = analyzePhoto,
  revision = null,
} = {}) {
  const report = {
    status: 'PENDING', started_at: new Date().toISOString(), revision,
    environment: 'local-node-library', node: process.version,
    requested_count: files.length, processing: 'sequential', cache: 'reset before every photo',
    configured_model: process.env.GYEOL_VISION_MODEL || DEFAULT_MODEL,
    timeout_ms: MODEL_TIMEOUT_MS, results: [],
    billing: { status: 'PENDING', actual_usd: null, estimated_usd: null,
      reason: 'Provider usage is not billed cost; failed and retried requests may also be billed.' },
    quality: { status: 'PENDING', reason: 'Compare recorded analysis against original photos; contract validity does not establish visual truth.' },
    server_deadline: { status: 'PENDING', reason: 'Local calls do not measure Vercel function limits or round trips.' },
  };
  // Preflight the entire batch before incurring any model cost.
  if (![1, 3, 15].includes(files.length)) return { ...report, status: 'FAILED', code: 'INPUT_COUNT' };
  const route = modelRoute(apiKey);
  if (route.source === 'heuristic') return { ...report, reason: route.reason, source: 'heuristic' };
  const inputs = [];
  try {
    for (const file of files) {
      const bytes = await readFile(file);
      const mediaType = detectMediaType(bytes);
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) {
        return { ...report, status: 'FAILED', code: 'INPUT_IMAGE', failed_index: inputs.length };
      }
      const metadata = await sharp(bytes).metadata();
      inputs.push({ bytes, mediaType, width: metadata.width, height: metadata.height,
        sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  } catch {
    // Never log a raw filesystem/provider error, which may contain private paths or data.
    return { ...report, status: 'FAILED', code: 'INPUT_READ', failed_index: inputs.length };
  }
  report.unique_image_count = new Set(inputs.map(input => input.sha256)).size;
  const started = performance.now();
  for (const [i, input] of inputs.entries()) {
    resetAnalysisState();
    const photoId = `measurement_${i + 1}`;
    const record = { photo_id: photoId, input_bytes: input.bytes.length,
      width: input.width, height: input.height, media_type: input.mediaType, sha256: input.sha256 };
    const photoStarted = performance.now();
    try {
      const result = await analyze({ bytes: input.bytes, mediaType: input.mediaType,
        photoId, inputIndex: i, fileRef: photoId, apiKey });
      if (result.analysis.analysis_source !== 'vision_model' || result.fromCache) {
        report.results.push({ ...record, status: 'FAILED', code: 'NOT_FRESH_MODEL', wall_ms: performance.now() - photoStarted });
        break;
      }
      report.results.push({ ...record, status: 'MEASURED', wall_ms: performance.now() - photoStarted,
        execution: result.execution, usage: result.usage ?? null, analysis: result.analysis });
    } catch (error) {
      const allowed = ['MODEL_KEY_MISSING', 'MODEL_MEDIA_UNSUPPORTED', 'MODEL_CONFIG', 'MODEL_TIMEOUT',
        'MODEL_NETWORK', 'MODEL_HTTP', 'MODEL_JSON', 'MODEL_UNAVAILABLE', 'MODEL_INCOMPLETE', 'MODEL_CONTRACT', 'MODEL_FAILURE'];
      report.results.push({ ...record, status: 'FAILED', wall_ms: performance.now() - photoStarted,
        code: allowed.includes(error.code) ? error.code : 'MEASUREMENT_ERROR',
        http_status: Number.isInteger(error.status) ? error.status : null, usage: null });
      // Stop on account/config/network errors; retain per-photo quality/deadline failures.
      if (!['MODEL_TIMEOUT', 'MODEL_JSON', 'MODEL_CONTRACT', 'MODEL_INCOMPLETE'].includes(error.code)) break;
    }
  }
  report.total_ms = performance.now() - started;
  report.completed_count = report.results.filter(result => result.status === 'MEASURED').length;
  report.failed_count = report.results.length - report.completed_count;
  report.unattempted_count = files.length - report.results.length;
  report.status = report.completed_count === files.length ? 'MEASURED' : 'FAILED';
  // Preserve provider usage per response, including cache fields. Do not manufacture
  // aggregate usage when a failure or an omitted usage object makes it incomplete.
  report.usage_coverage = report.results.filter(result => result.usage != null).length;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let revision = null;
  try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  const report = await measureModel(process.argv.slice(2), { revision });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'FAILED') process.exitCode = 1;
}
