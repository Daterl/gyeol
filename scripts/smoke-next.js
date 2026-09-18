import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// HTTP/fixture smoke only: never invokes analysis, profile collection or generation.
export async function smoke(base, fetchImpl = fetch) {
  assert(base, 'Usage: npm run test:smoke -- http://localhost:3100');
  const page = await fetchImpl(new URL('/', base), { redirect: 'manual' });
  assert.equal(page.status, 200, 'Public page must respond without login/redirect');
  const html = await page.text();
  assert.match(html, /GYEOL/, 'GYEOL page missing');
  assert.match(html, /<main\b[^>]*\bid="main"/, 'Main application landmark missing');
  for (const resource of ['ordered_feed', 'photo_analysis', 'target_profile', 'current_profile']) {
    const response = await fetchImpl(new URL(`/api/feed?mock=1&resource=${resource}`, base));
    assert.equal(response.status, 200, resource);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const expected = JSON.parse(await readFile(new URL(`../fixtures/${resource}.sample.json`, import.meta.url), 'utf8'));
    assert.deepEqual(await response.json(), expected, resource);
  }
  for (const [query, method, status] of [
    ['', 'GET', 501], ['?mock=0', 'GET', 400],
    ['?mock=1&resource=unknown', 'GET', 400],
    ['?mock=1', 'POST', 400], ['?mock=1', 'HEAD', 405],
  ]) {
    const response = await fetchImpl(new URL(`/api/feed${query}`, base), { method });
    assert.equal(response.status, status, `${method} ${query}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (status === 405) assert.equal(response.headers.get('allow'), 'GET');
    if (method === 'HEAD') assert.equal(await response.text(), '');
    if (method === 'POST') assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await smoke(process.argv[2]);
  console.log('PASS: HTTP page, explicit mock fixtures, rejection/methods and no-store.');
  console.log('PENDING: ADR-0008 connected-profile flow, actual model quality and physical mobile acceptance.');
}
