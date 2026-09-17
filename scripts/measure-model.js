// Run with: node --env-file-if-exists=.env scripts/measure-model.js <one image | 15 images>
// Each image is analyzed sequentially; no batch server function is introduced.
import { readFile } from 'node:fs/promises';
import { analyzePhoto, resetAnalysisState } from '../lib/photo_analysis.js';
import { modelRoute } from '../lib/model.js';

if (modelRoute().source === 'heuristic') {
  console.log(JSON.stringify({ status: 'PENDING', reason: 'missing_api_key', source: 'heuristic',
    single_photo_latency_ms: 'PENDING', fifteen_photo_total_ms: 'PENDING', cost: 'PENDING' }, null, 2));
} else {
  const files = process.argv.slice(2);
  if (![1, 15].includes(files.length)) throw new Error('Pass exactly 1 or 15 image paths.');
  resetAnalysisState();
  const results = [];
  const started = performance.now();
  try {
    for (const [i, file] of files.entries()) {
      // Measure every requested call, including repeated bytes, rather than cache hits.
      resetAnalysisState();
      const result = await analyzePhoto({ bytes: await readFile(file), photoId: `measurement_${i + 1}`, inputIndex: i, fileRef: file });
      results.push({ photo_id: result.analysis.photo_id, model: result.analysis.model,
        source: result.analysis.analysis_source, ...result.execution, usage: result.usage ?? null });
    }
    console.log(JSON.stringify({ status: 'MEASURED', total_ms: performance.now() - started,
      results, cost: 'PENDING: reconcile actual provider billing; token counts are not a billed amount',
      quality: 'PENDING: compare observations against original photos', server_deadline: 'PENDING' }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ status: 'FAILED', code: error.code ?? 'INPUT_ERROR', completed: results,
      cost: 'PENDING: failed or retried requests may be billed' }, null, 2));
    process.exitCode = 1;
  }
}
