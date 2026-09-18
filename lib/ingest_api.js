import { timingSafeEqual } from 'node:crypto';
import { createInstagramIngest, IngestError } from './apify_ingest.js';
const headers = { 'Cache-Control': 'no-store' };
export async function handleIngest(request, { accessKey = process.env.APIFY_INGEST_ACCESS_KEY, ingest } = {}) {
  try {
    if (!accessKey || accessKey.length < 32) throw new IngestError('NOT_CONFIGURED');
    const provided = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${accessKey}`;
    if (Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) throw new IngestError('UNAUTHORIZED');
    if (request.method !== 'POST') return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers: { ...headers, Allow: 'POST' } });
    // Bound decoded input even when Content-Length is absent or dishonest.
    const reader = request.body?.getReader();
    if (!reader) throw new IngestError('INVALID_INPUT');
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8192) { await reader.cancel(); throw new IngestError('INVALID_INPUT'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new IngestError('INVALID_INPUT'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new IngestError('INVALID_INPUT');
    const client = ingest ?? createInstagramIngest();
    let result;
    if (input.action === 'start') {
      // Explicit acknowledgement is required before a billable start.
      if (input.confirmLive !== true) throw new IngestError('INVALID_INPUT');
      result = await client.start(input);
    } else if (input.action === 'status') result = await client.inspect(input.receipt);
    else if (input.action === 'cancel') result = await client.cancel(input.receipt);
    else throw new IngestError('INVALID_INPUT');
    return Response.json(result, { status: result.status === 'RUNNING' ? 202 : 200, headers });
  } catch (error) {
    const known = error instanceof IngestError;
    const code = known ? error.code : 'PROVIDER_ERROR';
    const status = code === 'UNAUTHORIZED' ? 401 : code === 'NOT_CONFIGURED' ? 503 : code.startsWith('INVALID_') ? 400 : code === 'PROVIDER_TIMEOUT' ? 504 : ['PRIVATE_ACCOUNT', 'ACCOUNT_NOT_FOUND', 'ACCESS_UNAVAILABLE', 'ACCOUNT_UNCONFIRMED'].includes(code) ? 422 : code === 'COST_LIMIT' ? 429 : 502;
    return Response.json({ error: { code, message: known ? error.message : '수집 결과를 처리하지 못했어요.', ...(known ? error.details : {}) } }, { status, headers });
  }
}
