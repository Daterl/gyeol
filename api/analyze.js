// One request = one photo. There is deliberately no batch shape: the serverless
// function time limit is unmeasured (docs/intent.md section 8 A1 / issue #6), so a
// many-photos-per-call path must not exist to be depended on later.
// The transport contract (upload shape, byte/resolution limits, error codes) is
// #24's to fix and was still open when this was written — this is the minimum shape.
import { analyzePhoto, AnalysisUnavailableError, MAX_IMAGE_BYTES, SUPPORTED_MEDIA_TYPES } from '../lib/photo_analysis.js';

const MAX_BODY_BYTES = 16 * 1024 * 1024;   // base64 of MAX_IMAGE_BYTES plus JSON overhead
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) { const error = new Error('body too large'); error.code = 'IMAGE_TOO_LARGE'; throw error; }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function decodeImage(value) {
  if (typeof value !== 'string' || !value.length) return null;
  const stripped = value.replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
  if (!BASE64.test(stripped) || stripped.length % 4 !== 0) return null;   // Buffer.from is lenient; do not be
  const bytes = Buffer.from(stripped, 'base64');
  return bytes.length ? bytes : null;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  const fail = (status, code, message) => send(status, { error: { code, message } });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST with exactly one photo.'); }

  let body;
  try { body = await readBody(req); }
  catch (error) {
    if (error.code === 'IMAGE_TOO_LARGE') return fail(413, 'IMAGE_TOO_LARGE', `Request body exceeds ${MAX_BODY_BYTES} bytes.`);
    return fail(400, 'INVALID_REQUEST', 'Body must be JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'INVALID_REQUEST', 'Body must be a JSON object.');
  // Refuse any many-photos wording outright so the split-per-photo design cannot be bypassed.
  for (const key of ['photos', 'images', 'batch']) if (key in body) return fail(400, 'INVALID_REQUEST', `One photo per request; "${key}" is not accepted.`);

  const { photo_id: photoId, input_index: inputIndex, file_ref: fileRef, media_type: mediaType } = body;
  if (typeof photoId !== 'string' || !photoId.trim()) return fail(400, 'INVALID_REQUEST', 'photo_id must be a nonempty string.');
  if (!Number.isInteger(inputIndex) || inputIndex < 0) return fail(400, 'INVALID_REQUEST', 'input_index must be an integer >= 0.');
  if (typeof fileRef !== 'string' || !fileRef.trim()) return fail(400, 'INVALID_REQUEST', 'file_ref must be a nonempty string.');
  if (mediaType !== undefined && !SUPPORTED_MEDIA_TYPES.includes(mediaType)) return fail(415, 'UNSUPPORTED_MEDIA_TYPE', `Supported: ${SUPPORTED_MEDIA_TYPES.join(', ')}`);
  const bytes = decodeImage(body.image_base64);
  if (!bytes) return fail(400, 'INVALID_REQUEST', 'image_base64 must be nonempty base64.');
  if (bytes.length > MAX_IMAGE_BYTES) return fail(413, 'IMAGE_TOO_LARGE', `Image exceeds ${MAX_IMAGE_BYTES} bytes.`);

  try {
    const { analysis, execution } = await analyzePhoto({ bytes, photoId, inputIndex, fileRef, mediaType });
    res.setHeader('X-Gyeol-Analysis-Source', execution.source);
    res.setHeader('X-Gyeol-Analysis-Reason', execution.reason);
    return send(200, analysis);
  } catch (error) {
    if (error.code?.startsWith('MODEL_')) return fail(error.code === 'MODEL_TIMEOUT' ? 504 : 502, error.code, error.message);
    if (error instanceof AnalysisUnavailableError) return fail(422, 'ANALYSIS_UNAVAILABLE', 'Neither the model nor the pixels could be read; no values were invented.');
    if (error.code === 'UNSUPPORTED_MEDIA_TYPE') return fail(415, 'UNSUPPORTED_MEDIA_TYPE', `Supported: ${SUPPORTED_MEDIA_TYPES.join(', ')}`);
    if (error.code === 'IMAGE_TOO_LARGE') return fail(413, 'IMAGE_TOO_LARGE', `Image exceeds ${MAX_IMAGE_BYTES} bytes.`);
    return fail(500, 'INTERNAL_ERROR', 'Analysis failed.');
  }
}
