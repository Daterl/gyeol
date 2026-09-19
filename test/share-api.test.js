import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  handleManage,
  handleShare,
  handleShareBlobUpload,
  handleShareCleanup,
  handleShareUpload,
} from '../lib/share-api.js';
import {
  createShareService,
  MemoryBlobStore,
  ShareError,
} from '../lib/share-storage.js';

const body = label => {
  const value = Buffer.alloc(12 + label.length);
  value.write('RIFF');
  value.write('WEBP', 8);
  value.write(label, 12);
  return value;
};
const hash = value => createHash('sha256').update(value).digest('hex');
const request = (url, value, headers = {}) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(value),
  });

function fixture(options = {}) {
  let random = 0;
  const service = createShareService({
    store: new MemoryBlobStore({ now: () => 1_800_000_000_000 }),
    secret: 'route-test-secret-that-is-at-least-32-bytes',
    now: () => 1_800_000_000_000,
    randomBytes(size) {
      random += 1;
      return Buffer.alloc(size, random);
    },
    ...options,
  });
  return service;
}

test('upload API is bounded, no-store and explicit when the live adapter is absent', async () => {
  const unavailable = await handleShareUpload(
    request('http://localhost/api/share-upload', { action: 'start', photos: [] }),
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await unavailable.json(), {
    error: { code: 'NOT_CONFIGURED', details: {} },
  });

  const wrongMethod = await handleShareUpload(
    new Request('http://localhost/api/share-upload'),
    { service: fixture() },
  );
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
});

test('an asynchronous durable rate limiter rejects before share creation', async () => {
  const service = fixture({
    rateLimiter: {
      async check() {
        await Promise.resolve();
        throw new ShareError('RATE_LIMITED');
      },
    },
  });
  const bytes = ['a', 'b', 'c'].map(body);
  const response = await handleShareUpload(
    request('http://localhost/api/share-upload', {
      action: 'start',
      photos: bytes.map((value, index) => ({
        id: `p_${index}`,
        sha256: hash(value),
      })),
    }),
    { service },
  );

  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), {
    error: { code: 'RATE_LIMITED', details: {} },
  });
});

test('JSON control routes reject simple cross-site content types before service work', async () => {
  let touched = false;
  const response = await handleShareUpload(
    new Request('http://localhost/api/share-upload', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ action: 'start', photos: [] }),
    }),
    {
      service: {
        async startShare() {
          touched = true;
        },
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal(touched, false);
});

test('HTTP adapters expose start, current share/image, rotation and revoke without caching', async () => {
  const rateChecks = [];
  const service = fixture({
    rateLimiter: {
      check(...args) {
        rateChecks.push(args);
      },
    },
  });
  const bytes = ['a', 'b', 'c'].map(body);
  const photos = bytes.map((value, index) => ({
    id: `p_${index}`,
    sha256: hash(value),
  }));
  const startedResponse = await handleShareUpload(
    request('http://localhost/api/share-upload', { action: 'start', photos }),
    { service },
  );
  assert.equal(startedResponse.status, 201);
  const started = await startedResponse.json();
  const sessionResponse = await handleShareUpload(
    request('http://localhost/api/share-upload', {
      action: 'session',
      receipt: started.receipt,
    }),
    { service },
  );
  const session = await sessionResponse.json();
  for (let index = 0; index < bytes.length; index += 1) {
    await service.uploadPhoto({
      receipt: started.receipt,
      uploadToken: session.uploadToken,
      photoId: photos[index].id,
      contentType: 'image/webp',
      body: bytes[index],
    });
  }
  const publishResponse = await handleShareUpload(
    request('http://localhost/api/share-upload', {
      action: 'publish',
      receipt: started.receipt,
      uploadToken: session.uploadToken,
      curation: {
        photos: photos.map(photo => ({ id: photo.id })),
        includeProfile: false,
      },
    }, {
      authorization: `Bearer ${started.managementKey}`,
      'x-forwarded-for': '203.0.113.7',
    }),
    { service },
  );
  assert.equal(publishResponse.status, 200);
  assert.deepEqual(rateChecks.at(-1), ['share-publish', '203.0.113.7', 1_800_000_000_000]);
  const published = await publishResponse.json();

  const shared = await handleShare(
    new Request(`http://localhost/api/share/${started.shareId}`),
    { service, shareId: started.shareId },
  );
  assert.equal(shared.status, 200);
  assert.equal(shared.headers.get('cache-control'), 'no-store');
  assert.equal((await shared.json()).version, 1);
  const image = await handleShare(
    new Request(`http://localhost/api/share/${started.shareId}/image/p_0`),
    { service, shareId: started.shareId, photoId: 'p_0' },
  );
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes[0]);

  const rotate = await handleManage(
    request(
      `http://localhost/api/manage/${started.shareId}`,
      {
        action: 'rotate',
        nextManagementKey: Buffer.alloc(32, 9).toString('base64url'),
      },
      { authorization: `Bearer ${started.managementKey}`, 'if-match': published.etag },
    ),
    { service, shareId: started.shareId },
  );
  assert.equal(rotate.status, 200);
  const rotated = await rotate.json();
  const revoke = await handleManage(
    request(
      `http://localhost/api/manage/${started.shareId}`,
      { action: 'revoke' },
      { authorization: `Bearer ${rotated.managementKey}`, 'if-match': rotated.etag },
    ),
    { service, shareId: started.shareId },
  );
  assert.equal(revoke.status, 200);
  assert.equal(
    (
      await handleShare(
        new Request(`http://localhost/api/share/${started.shareId}`),
        { service, shareId: started.shareId },
      )
    ).status,
    410,
  );
});

test('client upload token exchange authorizes the exact temporary WebP path', async () => {
  const bytes = ['a', 'b', 'c'].map(body);
  const photos = bytes.map((value, index) => ({
    id: `p_${index}`,
    sha256: hash(value),
  }));
  const service = fixture();
  const started = await service.startShare({ photos, caller: 'test' });
  const session = await service.openUploadSession(started.receipt, {
    caller: 'test',
  });
  let tokenOptions;
  const response = await handleShareBlobUpload(
    request('http://localhost/api/share-blob-upload', {
      type: 'blob.generate-client-token',
      payload: {},
    }),
    {
      service,
      async uploadHandler(options) {
        tokenOptions = await options.onBeforeGenerateToken(
          `${session.prefix}p_0.webp`,
          JSON.stringify({
            receipt: started.receipt,
            uploadToken: session.uploadToken,
            photoId: 'p_0',
          }),
          false,
        );
        return { type: 'blob.generate-client-token', clientToken: 'limited' };
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    type: 'blob.generate-client-token',
    clientToken: 'limited',
  });
  assert.deepEqual(tokenOptions, {
    allowedContentTypes: ['image/webp'],
    maximumSizeInBytes: 4 * 1024 * 1024,
    validUntil: session.expiresAt,
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 60,
  });

  const wrongPath = await handleShareBlobUpload(
    request('http://localhost/api/share-blob-upload', {}),
    {
      service,
      async uploadHandler(options) {
        await options.onBeforeGenerateToken(
          'temp/another/1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/p_0.webp',
          JSON.stringify({
            receipt: started.receipt,
            uploadToken: session.uploadToken,
            photoId: 'p_0',
          }),
          false,
        );
      },
    },
  );
  assert.equal(wrongPath.status, 400);
});

test('share cleanup authenticates before touching storage', async () => {
  let touched = false;
  const service = {
    async cleanup() {
      touched = true;
      return { deleted: 2 };
    },
  };
  const denied = await handleShareCleanup(
    new Request('http://localhost/api/share-cleanup'),
    { service, secret: 'cron-secret' },
  );
  assert.equal(denied.status, 401);
  assert.equal(touched, false);
  const accepted = await handleShareCleanup(
    new Request('http://localhost/api/share-cleanup', {
      headers: { authorization: 'Bearer cron-secret' },
    }),
    { service, secret: 'cron-secret' },
  );
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { deleted: 2 });
});
