// PhotoAnalysis extraction for one photo. See docs/specs/9-photo-analysis/spec.md.
//
// Two rules shape this file:
//   1. One photo per call. There is no batch path, because the serverless function
//      time limit is still unmeasured (docs/intent.md section 8, A1; issue #6).
//   2. Nothing is reported that was not observed. Color/brightness come from real
//      pixels (lib/jpeg_dc.js); the heuristic path never names a subject, place,
//      time or mood, because it cannot see one.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validatePhoto } from './contracts.js';
import { readJpegBlocks } from './jpeg_dc.js';

export const CACHE_LIMIT = 64;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MODEL_TIMEOUT_MS = 20_000;
export const DEFAULT_MODEL = 'claude-opus-5';
export const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const PROMPT_PATH = new URL('../prompts/input/photo_analysis.md', import.meta.url);

// Fixed from the measured distribution over the 15-photo real set (observed numbers
// in docs/specs/9-photo-analysis/report.md): top-share ran 0.079..0.334, p75 ~0.26.
const NEGATIVE_SPACE_SHARE = 0.28;   // >=28% of the frame in one flat tone reads as negative space
const PALETTE_MIN_SHARE = 0.05;
const DARK_BRIGHTNESS = 0.25;
// scale has no measurable proxy here. Block-detail was tried and rejected: the
// smoothest photo in the real set is a midshot of a person against a plain
// backdrop, so detail tracks background flatness, not subject distance. A wrong
// varying value would hand #12 ordering evidence that looks measured and is not —
// docs/intent.md section 8 A2 calls that worse than no evidence. The schema has no
// "unknown", so the heuristic emits a constant and says so.
const HEURISTIC_SCALE = 'midshot';

export class AnalysisUnavailableError extends Error {
  constructor(message) { super(message); this.name = 'AnalysisUnavailableError'; this.code = 'ANALYSIS_UNAVAILABLE'; }
}

// Process-lifetime cache. Not persisted, not shared across serverless instances,
// never assumed to be warm — a miss just costs one more measurement.
const observations = new Map();
const counters = { modelCalls: 0, modelFailures: 0, cacheHits: 0, cacheMisses: 0 };

export const analysisCounters = () => ({ ...counters, cacheSize: observations.size });
export function resetAnalysisState() {
  observations.clear();
  for (const key of Object.keys(counters)) counters[key] = 0;
}

export function detectMediaType(bytes) {
  const b = bytes;
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57) return 'image/webp';
  if (b.length > 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  const head = Buffer.from(b.subarray(0, Math.min(512, b.length))).toString('utf8');
  if (head.includes('<svg')) return 'image/svg+xml';
  return null;
}

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max > 0 ? d / max : 0, v: max / 255 };
}
const hex = (r, g, b) => '#' + [r, g, b].map(n => Math.round(n).toString(16).padStart(2, '0')).join('');

/** Pixel measurement from JPEG DC blocks. Returns null when the file cannot be read. */
export function measureJpeg(bytes) {
  const decoded = readJpegBlocks(bytes);
  if (!decoded) return null;
  const [luma, cbComp, crComp] = decoded.components;
  const w = luma.usedW, h = luma.usedH;
  if (!w || !h) return null;
  const chroma = (comp, bx, by) => {
    if (!comp) return 128;
    const cx = Math.min(comp.usedW - 1, Math.floor((bx * comp.h) / luma.h));
    const cy = Math.min(comp.usedH - 1, Math.floor((by * comp.v) / luma.v));
    return comp.grid[cy * comp.bw + cx];
  };
  const red = new Uint8Array(w * h), green = new Uint8Array(w * h), blue = new Uint8Array(w * h);
  let sumSin = 0, sumCos = 0, sumWeight = 0, sumSat = 0, sumVal = 0;
  const buckets = new Map();
  for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
    const y = luma.grid[by * luma.bw + bx], cb = chroma(cbComp, bx, by) - 128, cr = chroma(crComp, bx, by) - 128;
    const r = clamp255(y + 1.402 * cr), g = clamp255(y - 0.344136 * cb - 0.714136 * cr), b = clamp255(y + 1.772 * cb);
    const i = by * w + bx;
    red[i] = r; green[i] = g; blue[i] = b;
    const { h: hue, s, v } = rgbToHsv(r, g, b);
    const radians = (hue * Math.PI) / 180;
    sumSin += s * Math.sin(radians); sumCos += s * Math.cos(radians); sumWeight += s;
    sumSat += s; sumVal += v;
    const key = (Math.min(5, (r * 6) >> 8) * 36) + (Math.min(5, (g * 6) >> 8) * 6) + Math.min(5, (b * 6) >> 8);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b;
    buckets.set(key, bucket);
  }
  const blocks = w * h;
  let deltaSum = 0, deltaCount = 0;
  for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
    const i = by * w + bx;
    for (const j of [bx + 1 < w ? i + 1 : -1, by + 1 < h ? i + w : -1]) {
      if (j < 0) continue;
      deltaSum += (Math.abs(red[i] - red[j]) + Math.abs(green[i] - green[j]) + Math.abs(blue[i] - blue[j])) / (3 * 255);
      deltaCount++;
    }
  }
  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const hueMean = sumWeight > 1e-9 ? ((Math.atan2(sumSin, sumCos) * 180) / Math.PI + 360) % 360 : 0;
  return {
    source: 'jpeg-dc',
    width: decoded.width, height: decoded.height, blocks,
    detail: deltaCount ? deltaSum / deltaCount : 0,
    dominantShare: ranked.length ? ranked[0].count / blocks : 0,
    color: {
      hue_mean: Math.min(360, Math.max(0, Number(hueMean.toFixed(1)))),
      sat_mean: Number((sumSat / blocks).toFixed(3)),
      bright_mean: Number((sumVal / blocks).toFixed(3)),
      palette_hex: ranked.filter(x => x.count / blocks >= PALETTE_MIN_SHARE).slice(0, 3)
        .map(x => hex(x.r / x.count, x.g / x.count, x.b / x.count))
    },
    shares: ranked.filter(x => x.count / blocks >= PALETTE_MIN_SHARE).slice(0, 3).map(x => x.count / blocks)
  };
}

/** Flat-color SVG cards only (eval/golden/case_01/photos). Not a general SVG renderer. */
export function measureSvg(bytes) {
  const text = Buffer.from(bytes).toString('utf8');
  const fills = [...text.matchAll(/fill\s*=\s*"(#[0-9a-fA-F]{6})"/g)].map(m => m[1].toLowerCase());
  if (!fills.length) return null;
  const size = /viewBox\s*=\s*"[\d.\s-]*?([\d.]+)\s+([\d.]+)"/.exec(text) ?? [];
  const width = Math.round(Number(/width\s*=\s*"([\d.]+)"/.exec(text)?.[1] ?? size[1] ?? 0));
  const height = Math.round(Number(/height\s*=\s*"([\d.]+)"/.exec(text)?.[1] ?? size[2] ?? 0));
  const counts = new Map();
  for (const f of fills) counts.set(f, (counts.get(f) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // Unlike a raster file, an SVG's text is literally in the bytes — reporting null
  // here would assert an absence the file disproves.
  const text_in_image = [...text.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map(m => m[1].replace(/<[^>]*>/g, '').trim()).find(Boolean) ?? null;
  let sumSin = 0, sumCos = 0, sumWeight = 0, sumSat = 0, sumVal = 0;
  for (const [value, count] of ranked) {
    const r = parseInt(value.slice(1, 3), 16), g = parseInt(value.slice(3, 5), 16), b = parseInt(value.slice(5, 7), 16);
    const { h, s, v } = rgbToHsv(r, g, b), radians = (h * Math.PI) / 180;
    sumSin += count * s * Math.sin(radians); sumCos += count * s * Math.cos(radians); sumWeight += count * s;
    sumSat += count * s; sumVal += count * v;
  }
  const hueMean = sumWeight > 1e-9 ? ((Math.atan2(sumSin, sumCos) * 180) / Math.PI + 360) % 360 : 0;
  return {
    source: 'svg-fill',
    width: width || 0, height: height || 0, blocks: fills.length,
    detail: 0, dominantShare: ranked[0][1] / fills.length, text_in_image,
    color: {
      hue_mean: Math.min(360, Math.max(0, Number(hueMean.toFixed(1)))),
      sat_mean: Number((sumSat / fills.length).toFixed(3)),
      bright_mean: Number((sumVal / fills.length).toFixed(3)),
      palette_hex: ranked.slice(0, 3).map(([value]) => value)
    },
    shares: ranked.slice(0, 3).map(([, count]) => count / fills.length)
  };
}

export function measurePixels(bytes, mediaType) {
  if (mediaType === 'image/jpeg') return measureJpeg(bytes);
  if (mediaType === 'image/svg+xml') return measureSvg(bytes);
  return null;   // PNG/WebP/GIF need an inflate+filter or VP8 decoder; not built. Honest miss.
}

const band = (value, cuts, labels) => labels[cuts.findIndex(c => value < c) === -1 ? labels.length - 1 : cuts.findIndex(c => value < c)];

/** describable_facts for the heuristic path: measured values only, nothing inferred. */
function measuredFacts(m) {
  const facts = [];
  if (m.width && m.height) {
    const shape = m.height > m.width * 1.05 ? '세로' : m.width > m.height * 1.05 ? '가로' : '정사각';
    facts.push(`${m.width}×${m.height} ${shape} 이미지`);
  }
  facts.push(`평균 밝기 ${m.color.bright_mean} (${band(m.color.bright_mean, [0.25, 0.45, 0.7], ['어두움', '다소 어두움', '중간', '밝음'])})`);
  facts.push(`평균 채도 ${m.color.sat_mean} (${band(m.color.sat_mean, [0.15, 0.3, 0.55], ['매우 낮음', '낮음', '중간', '높음'])})`);
  m.color.palette_hex.forEach((value, i) => facts.push(`주요 색 ${value} (점유 ${Math.round((m.shares[i] ?? 0) * 100)}%)`));
  return facts;
}

function heuristicObservation(m) {
  return {
    color: m.color,
    composition: m.dominantShare >= NEGATIVE_SPACE_SHARE ? 'negative_space' : 'full_frame',
    scale: HEURISTIC_SCALE,       // not observed; see the constant above
    subjects: [],                 // cannot see subjects
    has_face: false,              // not observed; see spec section 5 — never surfaced as a fact
    text_in_image: m.text_in_image ?? null,   // no OCR; only set where the bytes carry text (SVG)
    describable_facts: measuredFacts(m),
    quality_flags: m.color.bright_mean < DARK_BRIGHTNESS ? ['dark'] : [],
    analysis_source: 'heuristic',
    model: m.source === 'svg-fill' ? 'heuristic-svg-fill@1' : 'heuristic-jpeg-dc@1',
    analyzed_at: new Date().toISOString(),
    measurement: m
  };
}

const OBSERVATION_SCHEMA = {
  type: 'object',
  properties: {
    color: {
      type: 'object',
      properties: {
        hue_mean: { type: 'number' }, sat_mean: { type: 'number' }, bright_mean: { type: 'number' },
        palette_hex: { type: 'array', items: { type: 'string' }, maxItems: 3 }
      },
      required: ['hue_mean', 'sat_mean', 'bright_mean', 'palette_hex'], additionalProperties: false
    },
    composition: { type: 'string', enum: ['full_frame', 'negative_space'] },
    scale: { type: 'string', enum: ['closeup', 'midshot', 'fullshot'] },
    subjects: { type: 'array', items: { type: 'string' } },
    has_face: { type: 'boolean' },
    text_in_image: { type: ['string', 'null'] },
    describable_facts: { type: 'array', items: { type: 'string' } },
    quality_flags: { type: 'array', items: { type: 'string', enum: ['blurry', 'dark'] } }
  },
  required: ['color', 'composition', 'scale', 'subjects', 'has_face', 'text_in_image', 'describable_facts', 'quality_flags'],
  additionalProperties: false
};

let promptText = null;
const loadPrompt = async () => (promptText ??= await readFile(PROMPT_PATH, 'utf8'));

// Raw fetch rather than @anthropic-ai/sdk: this repo is gated at zero dependencies
// (scripts/check.js). Wire shape per the documented output_config.format contract.
async function defaultClient({ bytes, mediaType, prompt, model, apiKey, timeoutMs, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 4096,
        // Stable prompt first so the prefix can cache across the N per-photo calls;
        // effect unverified (the prompt may fall under the minimum cacheable prefix).
        system: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
        // effort low: A1 latency is the risk this issue is designed around, and the
        // task is observation, not reasoning.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: OBSERVATION_SCHEMA } },
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: Buffer.from(bytes).toString('base64') } }] }]
      })
    });
    if (!response.ok) throw new Error(`model HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const body = await response.json();
    if (body.stop_reason === 'refusal') throw new Error('model refused the request');
    const parsed = body.parsed_output ?? JSON.parse(body.content?.find(b => b.type === 'text')?.text ?? 'null');
    if (!parsed || typeof parsed !== 'object') throw new Error('model returned no parsable observation');
    return { observation: parsed, model: body.model ?? model, usage: body.usage ?? null };
  } finally { clearTimeout(timer); }
}

/**
 * Analyze exactly one photo. Never throws on model failure — it falls back to the
 * measured heuristic. Throws AnalysisUnavailableError only when nothing was observable.
 */
export async function analyzePhoto({
  bytes, photoId, inputIndex, fileRef, mediaType,
  client = defaultClient, apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.GYEOL_VISION_MODEL ?? DEFAULT_MODEL,
  timeoutMs = MODEL_TIMEOUT_MS, onModelError
} = {}) {
  const buffer = bytes instanceof Uint8Array ? bytes : Buffer.from(bytes ?? []);
  if (!buffer.length) throw new AnalysisUnavailableError('empty image bytes');
  if (buffer.length > MAX_IMAGE_BYTES) { const e = new Error('image exceeds byte limit'); e.code = 'IMAGE_TOO_LARGE'; throw e; }
  const resolvedType = mediaType ?? detectMediaType(buffer);
  if (!SUPPORTED_MEDIA_TYPES.includes(resolvedType)) { const e = new Error(`unsupported media type ${resolvedType}`); e.code = 'UNSUPPORTED_MEDIA_TYPE'; throw e; }

  const digest = createHash('sha256').update(buffer).digest('hex');
  let observation = observations.get(digest), fromCache = Boolean(observation);
  if (fromCache) counters.cacheHits++;
  else {
    counters.cacheMisses++;
    const measurement = measurePixels(buffer, resolvedType);
    if (apiKey) {
      counters.modelCalls++;
      try {
        const result = await client({ bytes: buffer, mediaType: resolvedType, prompt: await loadPrompt(), model, apiKey, timeoutMs });
        observation = {
          ...result.observation,
          // Measured pixels always beat a model estimate for color.
          color: measurement ? measurement.color : result.observation.color,
          quality_flags: [...new Set([...(result.observation.quality_flags ?? []), ...(measurement && measurement.color.bright_mean < DARK_BRIGHTNESS ? ['dark'] : [])])],
          analysis_source: 'vision_model', model: result.model,
          analyzed_at: new Date().toISOString(), usage: result.usage, measurement
        };
      } catch (error) {
        counters.modelFailures++;
        onModelError?.(error);
        observation = null;
      }
    }
    if (!observation) {
      if (!measurement) throw new AnalysisUnavailableError(`no observable pixels in ${fileRef ?? photoId} (${resolvedType})`);
      observation = heuristicObservation(measurement);
    }
    if (observations.size >= CACHE_LIMIT) observations.delete(observations.keys().next().value);
    observations.set(digest, { ...observation, originPhotoId: photoId });
  }

  const cached = observations.get(digest);
  const { measurement, usage, originPhotoId, ...facts } = cached;
  // A cache hit under a different photo_id means the same bytes arrived twice: that
  // is an observation, so it is reported as duplicate_of rather than hidden.
  const duplicate = fromCache && originPhotoId && originPhotoId !== photoId ? [`duplicate_of:${originPhotoId}`] : [];
  const analysis = {
    schema_version: '1.0', photo_id: photoId, file_ref: fileRef, input_index: inputIndex,
    ...facts, quality_flags: [...new Set([...facts.quality_flags, ...duplicate])]
  };
  validatePhoto(analysis);
  return { analysis, fromCache, measurement, usage, digest };
}
