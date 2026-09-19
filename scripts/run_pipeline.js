// node scripts/run_pipeline.js <folder> [limit]
//
// Analyzes every image in a folder, ONE CALL PER PHOTO, then runs the identical
// input a second time to show the byte-hash cache absorbing it with zero model
// calls. Pass 1 JSON goes to stdout; the audit tables go to stderr, so
// `run_pipeline.js dir 15 > out.json` keeps the JSON clean.
import { Console } from 'node:console';
import { readdir, readFile } from 'node:fs/promises';
import { relative, join, extname } from 'node:path';
import { analyzePhoto, analysisCounters, resetAnalysisState, AnalysisUnavailableError } from '../lib/photo_analysis.js';
import { ModelError } from '../lib/model.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);
const [folder, limitArg] = process.argv.slice(2);
if (!folder) { console.error('usage: node scripts/run_pipeline.js <folder> [limit]'); process.exit(2); }
const limit = limitArg ? Number(limitArg) : Infinity;
if (!Number.isFinite(limit) && limitArg) { console.error('limit must be a number'); process.exit(2); }

const names = (await readdir(folder)).filter(n => IMAGE_EXT.has(extname(n).toLowerCase())).sort().slice(0, limit);
if (!names.length) { console.error(`no images in ${folder}`); process.exit(2); }

const inputs = await Promise.all(names.map(async (name, index) => ({
  bytes: await readFile(join(folder, name)),
  photoId: `ph_${String(index + 1).padStart(2, '0')}`,
  inputIndex: index,
  fileRef: relative(process.cwd(), join(folder, name))
})));

const modelErrors = [];
async function pass(label) {
  const before = analysisCounters();
  const results = [], failures = [];
  const started = performance.now();
  for (const input of inputs) {
    try { results.push(await analyzePhoto({ ...input, onModelError: e => modelErrors.push(`${input.photoId}: ${e.message}`) })); }
    catch (error) {
      if (!(error instanceof AnalysisUnavailableError) && !(error instanceof ModelError)) throw error;
      failures.push({ photo: input.photoId, file: input.fileRef, code: error.code, reason: error.message });
    }
  }
  const after = analysisCounters();
  return {
    label, results, failures,
    ms: Math.round(performance.now() - started),
    modelCalls: after.modelCalls - before.modelCalls,
    modelFailures: after.modelFailures - before.modelFailures,
    cacheHits: after.cacheHits - before.cacheHits,
    cacheMisses: after.cacheMisses - before.cacheMisses
  };
}

resetAnalysisState();
const first = await pass('1회차 (콜드 캐시)');
const second = await pass('2회차 (같은 바이트 재투입)');

// stdout stays pure JSON, so every human-readable table goes to stderr.
const audit = new Console(process.stderr);
const log = (...args) => audit.log(...args);
log(`\n입력 폴더: ${folder}`);
log(`이미지 ${inputs.length}장 · 호출 단위: 사진 1장 = 호출 1회 (배치 경로 없음)`);
log(`모델 키: ${process.env.ANTHROPIC_API_KEY ? '있음 → 모델 경로 시도' : '없음 → 휴리스틱 경로만'}\n`);

log('— 산출물 요약 —');
audit.table([...first.results].map(({ analysis, measurement }) => ({
  photo_id: analysis.photo_id,
  file: analysis.file_ref.split('/').pop().slice(0, 28),
  source: analysis.analysis_source,
  size: measurement ? `${measurement.width}x${measurement.height}` : '-',
  bright: analysis.color.bright_mean,
  sat: analysis.color.sat_mean,
  hue: analysis.color.hue_mean,
  top색점유: measurement ? Number(measurement.dominantShare.toFixed(3)) : '-',
  detail: measurement ? Number(measurement.detail.toFixed(4)) : '-',
  comp: analysis.composition,
  scale: analysis.scale,
  facts: analysis.describable_facts.length,
  flags: analysis.quality_flags.join(',') || '-'
})));

log('\n— 호출·캐시 카운터 (DoD 증거) —');
audit.table([first, second].map(p => ({
  pass: p.label, 사진수: p.results.length, 모델호출: p.modelCalls, 모델실패: p.modelFailures,
  캐시적중: p.cacheHits, 캐시미스: p.cacheMisses, 실패: p.failures.length, 소요ms: p.ms
})));
log(`\n2회차 모델 호출 = ${second.modelCalls} ${second.modelCalls === 0 ? '(PASS: 파일 해시 캐시 적중)' : '(FAIL: 캐시가 적중하지 않았다)'}`);
log(`캐시 항목 수 = ${analysisCounters().cacheSize} (상한 64, 프로세스 수명 한정 · 영속 아님)`);

if (modelErrors.length) { log('\n— 모델 실패 사유 (휴리스틱으로 떨어진 건) —'); modelErrors.slice(0, 5).forEach(m => log(`  ${m}`)); if (modelErrors.length > 5) log(`  ... 총 ${modelErrors.length}건`); }
if (first.failures.length) { log('\n— 관측 불가 (값을 지어내지 않고 실패) —'); first.failures.forEach(f => log(`  ${f.photo} ${f.file}: ${f.reason}`)); }

log('\n— describable_facts 전수 대조용 —');
for (const { analysis } of first.results) log(`  ${analysis.photo_id} [${analysis.analysis_source}] ${analysis.file_ref}\n${analysis.describable_facts.map(f => `      · ${f}`).join('\n') || '      (없음)'}`);

process.stdout.write(JSON.stringify(first.results.map(r => r.analysis), null, 2) + '\n');
process.exitCode = first.failures.length || second.modelCalls !== 0 ? 1 : 0;
