import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { handleManage, handleShare } from '../lib/share-api.js';
import {
  createDurableShareRateLimiter,
  createPrivateShareBlobStore,
} from '../lib/share-blob-storage.js';
import { createShareService, MemoryBlobStore } from '../lib/share-storage.js';

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

test('logical revisions isolate public management CAS from Blob ETag variants', async () => {
  let revision = 0;
  const values = new Map();
  const client = {
    async get(pathname) {
      const value = values.get(pathname);
      return value
        ? {
            stream: new Blob([value.body]).stream(),
            blob: {
              contentType: value.contentType,
              etag: value.etag,
              uploadedAt,
            },
          }
        : null;
    },
    async put(pathname, body, options) {
      const current = values.get(pathname);
      // `allowOverwrite` is what the real SDK honors when no ifMatch is sent; without it a write
      // over an existing object is the absence guard. Modeling only ifMatch made this double
      // fail closed and hid that the ETag path never matched in production (#210).
      if (
        (options.ifMatch !== undefined &&
          (!current || options.ifMatch !== current.etag)) ||
        (options.ifMatch === undefined && current && !options.allowOverwrite)
      )
        throw new BlobPreconditionFailedError();
      const value = {
        body: Buffer.from(body),
        contentType: options.contentType,
        etag: `"blob-${++revision}"`,
      };
      values.set(pathname, value);
      return { etag: `"write-${revision}"`, pathname };
    },
    async list({ prefix }) {
      return {
        blobs: [...values.entries()]
          .filter(([pathname]) => pathname.startsWith(prefix))
          .map(([pathname, value]) => ({
            pathname,
            etag: value.etag,
            size: value.body.length,
            uploadedAt,
          })),
        hasMore: false,
      };
    },
    async del(pathname) {
      values.delete(pathname);
    },
  };
  const store = createPrivateShareBlobStore({
    token: 'private-token',
    client,
  });
  const shareId = 'etag-share';
  const currentKey = Buffer.alloc(32, 1).toString('base64url');
  const nextKey = Buffer.alloc(32, 2).toString('base64url');
  const attempt = 'a'.repeat(32);
  const curationPath = `shares/${shareId}/versions/1/${attempt}/curation.json`;
  await store.put(
    curationPath,
    Buffer.from(JSON.stringify({ photos: [], includeProfile: false })),
    { contentType: 'application/json', ifNoneMatch: true },
  );
  const manifest = await store.put(
    `shares/${shareId}/manifest.json`,
    Buffer.from(
      JSON.stringify({
        status: 'active',
        shareId,
        currentVersion: 1,
        objects: {},
        curationPath,
        managementKeyHash: createHash('sha256')
          .update(currentKey)
          .digest('hex'),
        profile: { included: false },
        confirmedAt: uploadedAt.toISOString(),
      }),
    ),
    { contentType: 'application/json', ifNoneMatch: true },
  );
  const service = createShareService({
    store,
    secret: 'adapter-test-secret-that-is-at-least-32-bytes',
    rateLimiter: { check() {} },
  });
  const publicRead = await handleShare(
    new Request(`https://share.test/api/share/${shareId}`),
    { service, shareId },
  );
  const currentEtag = publicRead.headers.get('x-share-etag');
  assert.match(currentEtag, /^"[a-f0-9]{64}"$/);
  assert.notEqual(currentEtag, manifest.etag);

  const manage = (action, key, etag) =>
    handleManage(
      new Request(`https://share.test/api/manage/${shareId}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'if-match': etag,
        },
        body: JSON.stringify({
          action,
          ...(action === 'rotate' ? { nextManagementKey: nextKey } : {}),
        }),
      }),
      { service, shareId },
    );

  const rotate = await manage('rotate', currentKey, currentEtag);
  assert.equal(rotate.status, 200);
  const rotated = await rotate.json();
  assert.equal((await manage('revoke', currentKey, rotated.etag)).status, 401);
  assert.equal((await manage('revoke', nextKey, currentEtag)).status, 409);
  assert.equal((await manage('revoke', nextKey, rotated.etag)).status, 200);
  assert.equal(
    (
      await handleShare(
        new Request(`https://share.test/api/share/${shareId}`),
        { service, shareId },
      )
    ).status,
    410,
  );
  assert.equal(
    (
      await handleShare(
        new Request(`https://share.test/api/share/${shareId}/image/p_0`),
        { service, shareId, photoId: 'p_0' },
      )
    ).status,
    410,
  );
  assert.deepEqual(
    (await store.list('shares/'))
      .filter(item => item.path.startsWith(`shares/${shareId}/`))
      .map(item => item.path),
    [`shares/${shareId}/manifest.json`],
  );
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
