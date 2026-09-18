import { createHash, timingSafeEqual } from 'node:crypto';
import { createInstagramIngest, IngestError, LIMITS } from './apify_ingest.js';
const headers = { 'Cache-Control': 'no-store' };
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/;

// This reference ledger is safe only inside one persistent process. Serverless/public paid starts
// must inject a durable implementation with the same run(caller,key,fingerprint,start) contract.
export function createIngestSession({ budgetUsd = Number(process.env.APIFY_INGEST_SESSION_BUDGET_USD ?? LIMITS.maxTotalChargeUsd) } = {}) {
  const entries = new Map();
  const reserved = new Map();
  return {
    run(caller, key, fingerprint, start) {
      if (!Number.isFinite(budgetUsd) || budgetUsd < LIMITS.maxTotalChargeUsd) throw new IngestError('NOT_CONFIGURED');
      if (!IDEMPOTENCY_KEY.test(key ?? '')) throw new IngestError('INVALID_INPUT');
      const entryKey = `${caller}:${key}`;
      const prior = entries.get(entryKey);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new IngestError('INVALID_INPUT');
        return prior.promise;
      }
      const used = reserved.get(caller) ?? 0;
      if (used + LIMITS.maxTotalChargeUsd > budgetUsd + Number.EPSILON) throw new IngestError('COST_LIMIT', { reserved_usd: used, budget_usd: budgetUsd });
      reserved.set(caller, used + LIMITS.maxTotalChargeUsd);
      const promise = Promise.resolve().then(start).catch(error => {
        // An ambiguous provider POST may already be billable, so its claim remains reserved and replayable.
        if (error instanceof IngestError && error.code !== 'START_UNCONFIRMED') {
          entries.delete(entryKey);
          reserved.set(caller, Math.max(0, (reserved.get(caller) ?? 0) - LIMITS.maxTotalChargeUsd));
        }
        throw error;
      });
      entries.set(entryKey, { fingerprint, promise });
      return promise;
    },
  };
}
export async function handleIngest(request, { accessKey = process.env.APIFY_INGEST_ACCESS_KEY, ingest, session } = {}) {
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
    const client = ingest ?? createInstagramIngest({ accessKey });
    let result;
    if (input.action === 'start') {
      // Explicit acknowledgement is required before a billable start.
      if (input.confirmLive !== true) throw new IngestError('INVALID_INPUT');
      if (!session) throw new IngestError('NOT_CONFIGURED');
      const idempotencyKey = request.headers.get('idempotency-key');
      const startInput = { url: input.url, limit: input.limit, knownPrivate: input.knownPrivate, accountScope: input.accountScope };
      const caller = createHash('sha256').update(accessKey).digest('base64url');
      result = await session.run(caller, idempotencyKey, JSON.stringify(startInput), () => client.start(startInput));
    } else if (input.action === 'status') result = await client.inspect(input.receipt);
    else if (input.action === 'cancel') result = await client.cancel(input.receipt);
    else throw new IngestError('INVALID_INPUT');
    return Response.json(result, { status: result.status === 'RUNNING' ? 202 : 200, headers });
  } catch (error) {
    const known = error instanceof IngestError;
    const code = known ? error.code : 'PROVIDER_ERROR';
    const status = code === 'UNAUTHORIZED' ? 401 : code === 'NOT_CONFIGURED' ? 503 : code.startsWith('INVALID_') ? 400 : code === 'PROVIDER_TIMEOUT' ? 504 : ['PRIVATE_ACCOUNT', 'ACCOUNT_NOT_FOUND', 'ACCESS_UNAVAILABLE', 'ACCOUNT_UNCONFIRMED'].includes(code) ? 422 : code === 'COST_LIMIT' ? 429 : 502;
    return Response.json({ error: { code, message: known ? error.message : '수집 결과를 처리하지 못했어요.', details: known ? error.details : {} } }, { status, headers });
  }
}
