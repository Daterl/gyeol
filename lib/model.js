// One image per request; built-in fetch, no SDK or implicit fallback.
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../config/models.json', import.meta.url), 'utf8'));
export const DEFAULT_MODEL = config.vision_model;
export const MODEL_TIMEOUT_MS = 20_000;
const API = 'https://api.anthropic.com/v1';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export class ModelError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ModelError';
    this.code = code;
    this.status = status;
  }
}

export function modelRoute(apiKey = process.env.ANTHROPIC_API_KEY) {
  return typeof apiKey === 'string' && apiKey.trim()
    ? { source: 'vision_model', reason: 'api_key_present' }
    : { source: 'heuristic', reason: 'missing_api_key' };
}

export async function analyzeWithModel({
  bytes, mediaType, prompt, schema, apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.GYEOL_VISION_MODEL || DEFAULT_MODEL,
  timeoutMs = MODEL_TIMEOUT_MS, fetchImpl = globalThis.fetch
}) {
  if (modelRoute(apiKey).source !== 'vision_model') {
    throw new ModelError('MODEL_KEY_MISSING', 'ANTHROPIC_API_KEY is missing; no model request was made.');
  }
  if (!IMAGE_TYPES.includes(mediaType)) throw new ModelError('MODEL_MEDIA_UNSUPPORTED', 'Model accepts JPEG, PNG, WebP or GIF only.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new ModelError('MODEL_CONFIG', 'timeoutMs must be positive.');
  const controller = new AbortController();
  const started = performance.now();
  let timer;
  // Race also bounds a stalled body reader or a transport that ignores AbortSignal.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ModelError('MODEL_TIMEOUT', 'Model operation exceeded its deadline.'));
    }, timeoutMs);
  });
  let attempts = 0;
  const request = async (path, body) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      controller.signal.throwIfAborted();
      let response;
      try {
        response = await fetchImpl(`${API}${path}`, {
          method: body ? 'POST' : 'GET', signal: controller.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
      } catch {
        throw new ModelError(controller.signal.aborted ? 'MODEL_TIMEOUT' : 'MODEL_NETWORK', 'Model transport failed.');
      }
      if (body) attempts++;
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        await response.body?.cancel();
        if (retryable && attempt === 0) {
          // Fixed bounded delay; never sleep beyond the shared operation deadline.
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        throw new ModelError('MODEL_HTTP', `Model HTTP ${response.status}.`, response.status);
      }
      try { return await response.json(); }
      catch { throw new ModelError('MODEL_JSON', 'Provider returned invalid JSON.'); }
    }
  };
  try {
    return await Promise.race([deadline, (async () => {
      const info = await request(`/models/${encodeURIComponent(model)}`);
      if (typeof info.id !== 'string' || !info.id || info.capabilities?.image_input?.supported === false
        || info.capabilities?.structured_outputs?.supported === false) {
        throw new ModelError('MODEL_UNAVAILABLE', 'Selected model does not support this request.');
      }
      const body = await request('/messages', {
        model: info.id, max_tokens: 4096,
        system: prompt,
        output_config: { format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content: [{ type: 'image', source: {
          type: 'base64', media_type: mediaType, data: Buffer.from(bytes).toString('base64')
        } }] }]
      });
      if (body.stop_reason !== 'end_turn') throw new ModelError('MODEL_INCOMPLETE', 'Model refused or did not complete its response.');
      const blocks = body.content;
      if (!Array.isArray(blocks) || blocks.length !== 1 || blocks[0].type !== 'text') {
        throw new ModelError('MODEL_JSON', 'Expected exactly one JSON text block.');
      }
      let observation;
      try { observation = JSON.parse(blocks[0].text); }
      catch { throw new ModelError('MODEL_JSON', 'Model returned invalid JSON text.'); }
      if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
        throw new ModelError('MODEL_JSON', 'Expected a JSON observation object.');
      }
      if (typeof body.model !== 'string' || !body.model) throw new ModelError('MODEL_JSON', 'Missing response model identity.');
      return { observation, model: body.model, usage: body.usage ?? null,
        elapsedMs: performance.now() - started, attempts, verifiedAt: new Date().toISOString() };
    })()]);
  } finally { clearTimeout(timer); }
}
