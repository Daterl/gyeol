import { timingSafeEqual } from 'node:crypto';
import { createProfileCache } from './profile-cache.js';

export async function handleProfileCacheCleanup(request, { secret = process.env.CRON_SECRET, createCache = createProfileCache } = {}) {
  const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'GET') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
  if (typeof secret !== 'string' || secret.length < 32) return reply(503, { error: 'NOT_CONFIGURED' });
  const expected = `Bearer ${secret}`;
  const provided = request.headers.get('authorization') ?? '';
  if (Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return reply(401, { error: 'UNAUTHORIZED' });
  }
  try { return reply(200, await createCache().cleanup()); }
  catch { return reply(503, { error: 'CLEANUP_UNAVAILABLE' }); }
}
