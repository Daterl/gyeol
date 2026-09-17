import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Run against a started production build (also reusable for an unprotected Preview).
const base = process.argv[2];
assert(base, 'Usage: npm run test:smoke -- http://localhost:3100');
const page = await fetch(new URL('/', base));
assert.equal(page.status, 200);
assert.equal(page.redirected, false, 'Unexpected redirect; a protected Preview requires browser verification.');
assert.ok((await page.text()).includes('샘플 순서 살펴보기'), 'GYEOL sample page missing');
for (const resource of ['ordered_feed', 'photo_analysis', 'target_profile', 'current_profile']) {
  const response = await fetch(new URL(`/api/feed?mock=1&resource=${resource}`, base));
  assert.equal(response.status, 200, resource);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const expected = JSON.parse(await readFile(new URL(`../fixtures/${resource}.sample.json`, import.meta.url), 'utf8'));
  assert.deepEqual(await response.json(), expected, resource);
}
for (const [query, method, status] of [
  ['', 'GET', 501], ['?mock=0', 'GET', 400],
  ['?mock=1&resource=unknown', 'GET', 400],
  ['?mock=1', 'POST', 405], ['?mock=1', 'HEAD', 405],
]) {
  const response = await fetch(new URL(`/api/feed${query}`, base), { method });
  assert.equal(response.status, status, `${method} ${query}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  if (status === 405) assert.equal(response.headers.get('allow'), 'GET');
  if (method === 'HEAD') assert.equal(await response.text(), '');
}
console.log('PASS: production page, four exact fixtures, errors, methods and no-store.');
