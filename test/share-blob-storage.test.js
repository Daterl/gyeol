import assert from 'node:assert/strict';
import test from 'node:test';
import { BlobPreconditionFailedError } from '@vercel/blob';
import {
  createDurableShareRateLimiter,
  createPrivateShareBlobStore,
} from '../lib/share-blob-storage.js';
import { MemoryBlobStore } from '../lib/share-storage.js';

const uploadedAt = new Date('2026-09-19T00:00:00Z');

test('private share adapter performs origin reads, conditional writes and paginated lists', async () => {
  const calls = [];
  const client = {
    async get(pathname, options) {
      calls.push(['get', pathname, options]);
      return {
        stream: new Blob(['{}']).stream(),
        blob: {
          contentType: 'application/json',
          etag: 'read-etag',
          uploadedAt,
        },
      };
    },
    async put(pathname, body, options) {
      calls.push(['put', pathname, Buffer.from(body).toString(), options]);
      return { etag: 'write-etag' };
    },
    async list(options) {
      calls.push(['list', options]);
      return options.cursor
        ? {
            blobs: [
              {
                pathname: 'shares/share/manifest.json',
                etag: 'two',
                size: 2,
                uploadedAt,
              },
            ],
            hasMore: false,
          }
        : {
            blobs: [
              {
                pathname:
                  'shares/share/versions/1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/curation.json',
                etag: 'one',
                size: 1,
                uploadedAt,
              },
            ],
            cursor: 'next',
            hasMore: true,
          };
    },
    async del(pathname, options) {
      calls.push(['delete', pathname, options]);
    },
  };
  const store = createPrivateShareBlobStore({ token: 'private-token', client });

  const read = await store.get('shares/share/manifest.json');
  assert.equal(read.body.toString(), '{}');
  assert.deepEqual(calls[0], [
    'get',
    'shares/share/manifest.json',
    { token: 'private-token', access: 'private', useCache: false },
  ]);
  const written = await store.put(
    'shares/share/manifest.json',
    Buffer.from('{}'),
    { contentType: 'application/json', ifMatch: 'old-etag' },
  );
  assert.equal(written.etag, 'write-etag');
  assert.deepEqual(calls[1][3], {
    token: 'private-token',
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: 'application/json',
    ifMatch: 'old-etag',
  });
  assert.deepEqual(
    (await store.list('shares/')).map(item => item.path),
    [
      'shares/share/manifest.json',
      'shares/share/versions/1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/curation.json',
    ],
  );
  await store.delete('shares/share/manifest.json');
  await assert.rejects(() => store.get('../secret'), {
    code: 'INVALID_STORAGE_PATH',
  });
});

test('private share adapter translates definite conditional conflicts and unknown failures', async () => {
  const store = createPrivateShareBlobStore({
    token: 'private-token',
    client: {
      async put() {
        throw new BlobPreconditionFailedError();
      },
    },
  });
  await assert.rejects(
    () =>
      store.put('shares/share/manifest.json', Buffer.from('{}'), {
        contentType: 'application/json',
        ifNoneMatch: true,
      }),
    { code: 'CONFLICT' },
  );
  await assert.rejects(() => store.list('shares/'), { code: 'STORAGE_ERROR' });
});

test('durable share limiter survives instances and uses bounded caller buckets', async () => {
  const store = new MemoryBlobStore();
  const first = createDurableShareRateLimiter({ store });
  const second = createDurableShareRateLimiter({ store });
  for (let count = 0; count < 20; count += 1)
    await (count % 2 ? first : second).check('share-start', '198.51.100.8', 0);
  await assert.rejects(() => first.check('share-start', '198.51.100.8', 0), {
    code: 'RATE_LIMITED',
  });
  assert.equal((await store.list('share-rate-limit/v1/')).length, 2);
});

test('caller denials cannot consume the global allowance for other callers', async () => {
  const store = new MemoryBlobStore();
  const limiter = createDurableShareRateLimiter({ store });
  for (let count = 0; count < 20; count += 1)
    await limiter.check('share-start', 'attacker', 0);
  for (let count = 0; count < 980; count += 1)
    await assert.rejects(() => limiter.check('share-start', 'attacker', 0), {
      code: 'RATE_LIMITED',
    });
  await limiter.check('share-start', 'victim', 0);
});
