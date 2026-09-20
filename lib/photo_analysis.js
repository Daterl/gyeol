// PhotoAnalysis extraction for one photo. See docs/specs/9-photo-analysis/spec.md.
//
// Two rules shape this file:
//   1. One photo per call. There is no batch path, because the serverless function
//      time limit is still unmeasured (docs/intent.md section 8, A1; issue #6).
//   2. Nothing is reported that was not observed. Color/brightness come from real
//      pixels (lib/jpeg_dc.js); the heuristic path never names a subject, place,
//      time or mood, because it cannot see one.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ContractError, validatePhoto } from './contracts.js';
import { readJpegBlocks } from './jpeg_dc.js';
import { analyzeWithModel, modelRoute, ModelError, DEFAULT_MODEL, MODEL_TIMEOUT_MS } from './model.js';
export { DEFAULT_MODEL, MODEL_TIMEOUT_MS } from './model.js';

export const CACHE_LIMIT = 64;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const PROMPT_PATH = new URL('../prompts/input/photo_analysis.md', import.meta.url);

const PALETTE_MIN_SHARE = 0.05;
const DARK_BRIGHTNESS = 0.25;
const MODEL_IMAGE_SIDE = 512;
const MEASURED_RASTER_TYPES = ['image/jpeg','image/png','image/webp'];
// scale has no measurable proxy here. Block-detail was tried and rejected: the
// smoothest photo in the real set is a midshot of a person against a plain
// backdrop, so detail tracks background flatness, not subject distance. A wrong
// varying value would hand #12 ordering evidence that looks measured and is not —
// docs/intent.md section 8 A2 calls that worse than no evidence. The schema has no
// "unknown", so the heuristic emits a constant and says so.
const HEURISTIC_SCALE = 'midshot';
// composition is not observable here either. A dominant-colour share was used for it
// and that was wrong: a colour histogram has no position, no connected empty region
// and no subject, so "one tone covers 28% of the buckets" is not a sighting of
// negative space. A checkerboard that fills the whole frame scored negative_space,
// and so did a portrait of a person filling the frame (review-codex.md H4). The share
// itself is real and is still reported — as what it is, a colour share, in
// describable_facts ("주요 색 #xxxxxx (점유 N%)"). The enum has no "unknown", so as
// with scale the heuristic emits a constant and the spec forbids downstream from
// reading it as spatial evidence.
const HEURISTIC_COMPOSITION = 'full_frame';

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

// Flat-colour cards only — the one shape the golden fixtures use:
//   <svg width=W height=H><rect width=W height=H fill=#rrggbb/>[<text …>…</text>]</svg>
//
// Nothing in this repo rasterises. Counting `fill` attributes is not measuring area,
// and an element a viewer cannot see is not something observed: a white card with a
// zero-area black rect and a display:none <text> was reported as 50% black with the
// hidden words as fact, and an unclosed SVG was measured too (review-codex.md H3).
// So anything outside this exact shape returns null and the caller fails honestly.
// This is not a general SVG renderer and must not be grown into one.
const SVG_CARD = /^\s*<svg\b([^<>]*)>\s*<rect\b([^<>]*?)\/>\s*(?:<text\b([^<>]*)>([^<]*)<\/text>\s*)?<\/svg>\s*$/;
const attrOf = (source, name) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(source)?.[1];
// display:none / visibility:hidden / (fill-)opacity:0, as attribute or inline style.
const HIDDEN = /\b(?:display\s*[:=]\s*["']?none|visibility\s*[:=]\s*["']?hidden|opacity\s*[:=]\s*["']?0(?:\.0+)?(?:["';]|\s|$))/i;
const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = value => {
  let valid = true;
  const text = value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, entity) => {
    if (entity[0] !== '#') return XML_ENTITIES[entity] ?? whole;
    const code = Number(entity[1] === 'x' ? `0x${entity.slice(2)}` : entity.slice(1));
    if (![9, 10, 13].includes(code) && !(code >= 0x20 && code <= 0xd7ff)
      && !(code >= 0xe000 && code <= 0xfffd) && !(code >= 0x10000 && code <= 0x10ffff)) {
      valid = false;
      return whole;
    }
    return String.fromCodePoint(code);
  });
  return valid ? text : null;
};

export function measureSvg(bytes) {
  const card = SVG_CARD.exec(Buffer.from(bytes).toString('utf8'));
  if (!card) return null;
  const [, svgAttrs, rectAttrs, textAttrs, textBody] = card;
  if (HIDDEN.test(svgAttrs)) return null;
  const width = Number(attrOf(svgAttrs, 'width')), height = Number(attrOf(svgAttrs, 'height'));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  // The rect has to actually cover the canvas, or its colour is not the image's colour.
  const fill = attrOf(rectAttrs, 'fill')?.toLowerCase() ?? '';
  const covers = Number(attrOf(rectAttrs, 'width')) === width && Number(attrOf(rectAttrs, 'height')) === height
    && Number(attrOf(rectAttrs, 'x') ?? 0) === 0 && Number(attrOf(rectAttrs, 'y') ?? 0) === 0;
  if (!covers || !/^#[0-9a-f]{6}$/.test(fill) || HIDDEN.test(rectAttrs)) return null;
  const r = parseInt(fill.slice(1, 3), 16), g = parseInt(fill.slice(3, 5), 16), b = parseInt(fill.slice(5, 7), 16);
  const { h, s, v } = rgbToHsv(r, g, b);
  // An SVG's text is literally in the bytes, so returning null would deny what the file
  // shows — but only for text that would actually be on screen.
  const decodedText = textBody === undefined ? '' : unescapeXml(textBody);
  if (decodedText === null) return null;
  const text_in_image = textAttrs !== undefined && !HIDDEN.test(textAttrs)
    ? (decodedText.trim() || null) : null;
  return {
    source: 'svg-card',
    width, height, blocks: 1,
    detail: 0, dominantShare: 1, text_in_image,
    color: {
      hue_mean: Math.min(360, Math.max(0, Number(h.toFixed(1)))),
      sat_mean: Number(s.toFixed(3)),
      bright_mean: Number(v.toFixed(3)),
      palette_hex: [fill]
    },
    shares: [1]
  };
}

export function measurePixels(bytes, mediaType) {
  if (mediaType === 'image/jpeg') return measureJpeg(bytes);
  if (mediaType === 'image/svg+xml') return measureSvg(bytes);
  return null;   // PNG/WebP/GIF need an inflate+filter or VP8 decoder; not built. Honest miss.
}

// Reuse the installed decoder and JPEG measurement for PNG/WebP, rather than a second histogram implementation.
async function measureRaster(bytes, mediaType) {
  if (!['image/png','image/webp'].includes(mediaType) || detectMediaType(bytes)!==mediaType) return null;
  try {
    const raster=sharp(bytes,{limitInputPixels:40_000_000,failOn:'error'});
    const metadata=await raster.metadata();
    if ((metadata.pages ?? 1)>1 || metadata.format!==mediaType.slice(6)) return null;
    const encoded=await raster.flatten({background:'#ffffff'}).resize({width:MODEL_IMAGE_SIDE,height:MODEL_IMAGE_SIDE,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
    const measured=measureJpeg(encoded);
    return measured && {...measured,source:'raster-thumbnail-jpeg-dc',width:metadata.width,height:metadata.height,alphaFlattened:metadata.hasAlpha===true};
  } catch { return null; }
}

async function modelImage(bytes, mediaType) {
  if (!MEASURED_RASTER_TYPES.includes(mediaType)) return {bytes,mediaType};
  try {
    const image=sharp(bytes,{limitInputPixels:40_000_000,failOn:'error'});
    const metadata=await image.metadata();
    if ((metadata.pages ?? 1)>1 || Math.max(metadata.width ?? 0,metadata.height ?? 0)<=MODEL_IMAGE_SIDE) return {bytes,mediaType};
    return {bytes:await image.rotate().flatten({background:'#ffffff'}).resize({width:MODEL_IMAGE_SIDE,height:MODEL_IMAGE_SIDE,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer(),mediaType:'image/jpeg'};
  } catch { return {bytes,mediaType}; }
}

const band = (value, cuts, labels) => labels[cuts.findIndex(c => value < c) === -1 ? labels.length - 1 : cuts.findIndex(c => value < c)];

/** describable_facts for the heuristic path: measured values only, nothing inferred. */
function measuredFacts(m) {
  const facts = [];
  if (m.source==='raster-thumbnail-jpeg-dc') facts.push(`색 수치는 긴 변 최대 ${MODEL_IMAGE_SIDE}px JPEG 변환본의 근사 측정`);
  if (m.alphaFlattened) facts.push('투명 영역은 흰 바탕으로 합성하여 측정');
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
    composition: HEURISTIC_COMPOSITION,   // not observed; see the constant above
    scale: HEURISTIC_SCALE,               // not observed; see the constant above
    subjects: [],                 // cannot see subjects
    has_face: false,              // not observed; see spec section 5 — never surfaced as a fact
    text_in_image: m.text_in_image ?? null,   // no OCR; only set where the bytes carry text (SVG)
    describable_facts: measuredFacts(m),
    quality_flags: m.color.bright_mean < DARK_BRIGHTNESS ? ['dark'] : [],
    analysis_source: 'heuristic',
    model: `heuristic-${m.source}@1`,
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
        // maxItems is rejected by the structured-output API; the 'at most 3' bound lives in the prompt and contracts.js.
        palette_hex: { type: 'array', items: { type: 'string' } }
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

const OBSERVATION_FIELDS = Object.keys(OBSERVATION_SCHEMA.properties);
function validateObservation(raw, identity, model, measuredColor) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ContractError('observation', 'expected object');
  for (const field of Object.keys(raw)) {
    if (!OBSERVATION_FIELDS.includes(field)) throw new ContractError(`observation.${field}`, 'unknown field');
  }
  for (const field of OBSERVATION_FIELDS) {
    if (!Object.hasOwn(raw, field)) throw new ContractError(`observation.${field}`, 'missing field');
  }
  validatePhoto({ ...raw, ...(measuredColor ? {color:measuredColor} : {}), schema_version: '1.0', photo_id: identity.photoId, file_ref: identity.fileRef,
    input_index: identity.inputIndex, analysis_source: 'vision_model', model, analyzed_at: new Date().toISOString() });
  if (!measuredColor) {
    for (const field of Object.keys(raw.color)) {
      if (!Object.hasOwn(OBSERVATION_SCHEMA.properties.color.properties, field)) throw new ContractError(`observation.color.${field}`, 'unknown field');
    }
  }
  if (raw.quality_flags.some(flag => !OBSERVATION_SCHEMA.properties.quality_flags.items.enum.includes(flag))) throw new ContractError('observation.quality_flags', 'flag is not permitted in a model observation');
  return raw;
}

/**
 * The PhotoAnalysis the caller gets back. Identity is re-stamped from the request on
 * every path — cache hit, model, heuristic — so it can never come from an observation.
 */
function stampAnalysis(observation, { photoId, fileRef, inputIndex }, extraFlags = []) {
  const { measurement, usage, originPhotoId, execution, ...facts } = observation;
  return {
    schema_version: '1.0', photo_id: photoId, file_ref: fileRef, input_index: inputIndex,
    ...facts, quality_flags: [...new Set([...facts.quality_flags, ...extraFlags])]
  };
}

let promptText = null;
const loadPrompt = async () => (promptText ??= await readFile(PROMPT_PATH, 'utf8'));

// Key absence is a disclosed heuristic path. A selected model must succeed or fail
// explicitly; malformed observations never become a successful fallback/cache entry.
export async function analyzePhoto({
  bytes, photoId, inputIndex, fileRef, mediaType,
  client = analyzeWithModel, apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.GYEOL_VISION_MODEL || DEFAULT_MODEL,
  timeoutMs = MODEL_TIMEOUT_MS, onModelError, beforeProvider
} = {}) {
  const buffer = bytes instanceof Uint8Array ? bytes : Buffer.from(bytes ?? []);
  if (!buffer.length) throw new AnalysisUnavailableError('empty image bytes');
  if (buffer.length > MAX_IMAGE_BYTES) { const e = new Error('image exceeds byte limit'); e.code = 'IMAGE_TOO_LARGE'; throw e; }
  const resolvedType = mediaType ?? detectMediaType(buffer);
  if (!SUPPORTED_MEDIA_TYPES.includes(resolvedType)) { const e = new Error(`unsupported media type ${resolvedType}`); e.code = 'UNSUPPORTED_MEDIA_TYPE'; throw e; }

  const digest = createHash('sha256').update(buffer).digest('hex');
  const route = modelRoute(apiKey);
  const prompt = route.source === 'vision_model' ? await loadPrompt() : '';
  const namespace = route.source === 'vision_model'
    ? `${model}:${createHash('sha256').update(apiKey).digest('hex')}:${createHash('sha256').update(prompt).digest('hex')}` : 'heuristic';
  const cacheKey = `${digest}:${resolvedType}:${namespace}`;
  let observation = observations.get(cacheKey), fromCache = Boolean(observation);
  if (fromCache) counters.cacheHits++;
  else {
    counters.cacheMisses++;
    const measurement = measurePixels(buffer, resolvedType) ?? await measureRaster(buffer, resolvedType);
    if (route.source === 'vision_model') {
      await beforeProvider?.();
      counters.modelCalls++;
      try {
        const input=await modelImage(buffer,resolvedType);
        const result = await client({ ...input, prompt, schema: OBSERVATION_SCHEMA, model, apiKey, timeoutMs });
        const observed = validateObservation(result.observation, { photoId, fileRef, inputIndex }, result.model,
          MEASURED_RASTER_TYPES.includes(resolvedType) ? measurement?.color : null);
        observation = {
          ...observed,
          // Measured pixels always beat a model estimate for color.
          color: measurement ? measurement.color : observed.color,
          quality_flags: [...new Set([...(observed.quality_flags ?? []), ...(measurement && measurement.color.bright_mean < DARK_BRIGHTNESS ? ['dark'] : [])])],
          analysis_source: 'vision_model', model: result.model,
          analyzed_at: new Date().toISOString(), usage: result.usage, measurement,
          execution: { ...route, elapsed_ms: result.elapsedMs ?? null, attempts: result.attempts ?? null, verified_at: result.verifiedAt ?? null }
        };
        validatePhoto(stampAnalysis(observation, { photoId, fileRef, inputIndex }));
      } catch (error) {
        counters.modelFailures++;
        onModelError?.(error);
        if (error instanceof ModelError) throw error;
        throw new ModelError(error instanceof ContractError ? 'MODEL_CONTRACT' : 'MODEL_FAILURE',
          error instanceof ContractError ? error.message : 'Model analysis failed.');
      }
    }
    if (!observation) {
      if (!measurement) throw new AnalysisUnavailableError(`no observable pixels in ${fileRef ?? photoId} (${resolvedType})`);
      observation = { ...heuristicObservation(measurement), execution: { ...route, elapsed_ms: null, attempts: 0 } };
    }
    if (observations.size >= CACHE_LIMIT) observations.delete(observations.keys().next().value);
    observations.set(cacheKey, structuredClone(observation));
  }

  const cached = structuredClone(observations.get(cacheKey));
  const analysis = stampAnalysis(cached, { photoId, fileRef, inputIndex });
  validatePhoto(analysis);
  return { analysis, fromCache, measurement: cached.measurement, usage: cached.usage, digest, execution: { ...cached.execution, cache_hit: fromCache } };
}
