import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { smoke } from './smoke-next.js';

const transport = (overrides = {}) => async (url, init = {}) => {
  const method = init.method ?? 'GET';
  if (url.pathname === '/') return new Response(overrides.page ?? '<main id="main">GYEOL</main>', { status: overrides.pageStatus ?? 200 });
  const headers = { 'cache-control': 'no-store', allow: 'GET' };
  if (method === 'HEAD') return new Response(null, { status: 405, headers });
  if (method === 'POST') return Response.json({ error: { code: 'INVALID_REQUEST' } }, { status: overrides.postStatus ?? 400, headers });
  const resource = url.searchParams.get('resource');
  if (['ordered_feed', 'photo_analysis', 'target_profile', 'current_profile'].includes(resource)) {
    return new Response(await readFile(new URL(`../fixtures/${resource}.sample.json`, import.meta.url)), { headers });
  }
  return new Response('', { status: url.search ? 400 : 501, headers });
};
test('smoke checks current page and invalid POST 400 using explicit fixture GETs', async () => {
  await smoke('http://localhost:3100', transport());
});
test('obsolete POST 405 does not pass', async () => {
  await assert.rejects(smoke('http://localhost:3100', transport({ postStatus: 405 })));
});
test('missing application or protected page does not pass', async () => {
  await assert.rejects(smoke('http://localhost:3100', transport({ page: 'GYEOL' })));
  await assert.rejects(smoke('http://localhost:3100', transport({ pageStatus: 401 })));
});
