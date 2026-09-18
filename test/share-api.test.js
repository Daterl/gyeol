import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  handleManage,
  handleShare,
  handleShareUpload,
} from '../lib/share-api.js';
import { createShareService, MemoryBlobStore } from '../lib/share-storage.js';

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
      { action: 'rotate' },
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
