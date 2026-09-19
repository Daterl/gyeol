// Reuse saved live photo analyses; do not pay for the same image analysis again.
// node --env-file=/private/path/.env.local scripts/measure-generation.js analysis.json
import { readFile } from 'node:fs/promises';
import { buildFeed } from '../lib/pipeline.js';
import { generateOutput } from '../lib/output-generation.js';
import { OUTPUT_MODEL } from '../lib/model.js';

const report = { environment: 'local-node-library', node: process.version,
  started_at: new Date().toISOString(), status: 'PENDING', results: [],
  billing: { status: 'PENDING', actual_usd: null, estimated_usd: null },
  quality: 'PENDING: compare captions with source photos; contract checks are not visual quality',
  server_deadline: 'PENDING: not a Vercel function measurement' };
try {
  const analysis = JSON.parse(await readFile(process.argv[2], 'utf8'));
  report.analysis_revision = analysis.revision;
  report.photo_count = analysis.requested_count;
  if (analysis.status !== 'MEASURED' || ![3, 15].includes(analysis.requested_count)
    || analysis.results.length !== analysis.requested_count
    || analysis.results.some(result => result.status !== 'MEASURED' || result.analysis?.analysis_source !== 'vision_model')) {
    report.reason = 'complete_live_analysis_required';
  } else if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    report.reason = 'missing_api_key';
  } else {
    for (const target of [{ kind: 'none' }, { kind: 'text', text: '차분하고 담백하게, 사진에 보이는 것만 짧은 한국어로 써 주세요.' }]) {
      const record = { prompt: target.kind === 'none' ? '' : target.text, status: 'FAILED',
        configured_model: process.env.GYEOL_OUTPUT_MODEL || OUTPUT_MODEL, responses: [] };
      const started = performance.now();
      try {
        const built = await buildFeed({ schema_version: '1.0', session_id: 'measurement',
          photos: analysis.results.map(result => result.analysis), identity: { current: { kind: 'none' }, target } });
        record.output = await generateOutput({ schema_version: '1.0', mode: 'all', ...built }, {
          fetchImpl: async (url, options) => {
            const response = await fetch(url, options);
            if (url.endsWith('/messages') && response.ok) {
              const body = await response.clone().json();
              record.responses.push({ model: body.model, usage: body.usage ?? null, stop_reason: body.stop_reason });
            }
            return response;
          },
        });
        record.status = 'MEASURED';
      } catch (error) {
        // Only known application codes, never raw error messages or provider bodies.
        record.code = /^MODEL_[A-Z_]+$/.test(error.code ?? '') ? error.code : 'GENERATION_FAILED';
        record.http_status = Number.isInteger(error.status) ? error.status : null;
      }
      record.wall_ms = performance.now() - started;
      report.results.push(record);
      if (['MODEL_HTTP', 'MODEL_KEY_MISSING', 'MODEL_UNAVAILABLE'].includes(record.code)) break;
    }
    report.status = report.results.length === 2 && report.results.every(result => result.status === 'MEASURED') ? 'MEASURED' : 'FAILED';
  }
} catch {
  report.status = 'FAILED';
  report.reason = 'unreadable_analysis_report';
}
console.log(JSON.stringify(report, null, 2));
if (report.status === 'FAILED') process.exitCode = 1;
