import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  createShareService,
  MemoryBlobStore,
  ShareError,
  SHARE_LIMITS,
} from '../lib/share-storage.js';

const webp = label => {
  const payload = Buffer.from(label);
  const bytes = Buffer.alloc(12 + payload.length);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WEBP', 8, 'ascii');
  payload.copy(bytes, 12);
  return bytes;
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const photos = (labels, prefix = 'photo') => labels.map((label, index) => ({
  id: `${prefix}_${index + 1}`,
  sha256: digest(webp(label)),
}));
const curation = ids => ({
  photos: ids.map((id, index) => ({
    id,
    caption: index === 0 ? '' : `caption ${index}`,
    focalPoint: { x: 0.5, y: 0.5 },
  })),
  includeProfile: false,
});

function fixture() {
  let time = Date.parse('2026-09-18T00:00:00.000Z');
  let random = 0;
  const now = () => time;
  const store = new MemoryBlobStore({ now });
  const service = createShareService({
    store,
    secret: 'share-test-secret-that-is-at-least-32-bytes',
    now,
    randomBytes(size) {
      random += 1;
      return Buffer.alloc(size, random);
    },
  });
  return {
    now,
    service,
    store,
    advance(milliseconds) {
      time += milliseconds;
    },
  };
}

async function stage(service, labels, start, prefix) {
  const expected = photos(labels, prefix);
  const pending = start ?? (await service.startShare({ photos: expected, caller: 'test' }));
  const session = await service.openUploadSession(pending.receipt, { caller: 'test' });
  for (let index = 0; index < expected.length; index += 1) {
    await service.uploadPhoto({
      receipt: pending.receipt,
      uploadToken: session.uploadToken,
      photoId: expected[index].id,
      contentType: 'image/webp',
      body: webp(labels[index]),
    });
  }
  return { expected, pending, session };
}

const throwsCode = async (promise, code) => {
  await assert.rejects(promise, error => error instanceof ShareError && error.code === code);
};

test('a signed receipt is short-lived, tamper-proof and replayed as one durable upload session', async () => {
  const { service, advance } = fixture();
  const pending = await service.startShare({ photos: photos(['a', 'b', 'c']), caller: 'one' });
  assert.equal(Buffer.from(pending.shareId, 'base64url').length, 16);
  assert.equal(Buffer.from(pending.managementKey, 'base64url').length, 32);
  const first = await service.openUploadSession(pending.receipt, { caller: 'one' });
  const replay = await service.openUploadSession(pending.receipt, { caller: 'one' });
  assert.deepEqual(replay, first);
  assert.deepEqual(first.constraints, {
    maxFiles: 3,
    contentType: 'image/webp',
    maxFileBytes: SHARE_LIMITS.maxFileBytes,
    maxTotalBytes: SHARE_LIMITS.maxTotalBytes,
  });
  assert.ok(SHARE_LIMITS.maxFileBytes * SHARE_LIMITS.maxPhotos <= SHARE_LIMITS.maxTotalBytes);
  await throwsCode(service.startShare({ photos: photos(['a', 'b']), caller: 'one' }), 'INVALID_INPUT');
  await throwsCode(
    service.startShare({ photos: photos(Array.from({ length: 16 }, (_, index) => `${index}`)), caller: 'one' }),
    'INVALID_INPUT',
  );
  await throwsCode(
    service.openUploadSession(`${pending.receipt.slice(0, -1)}x`, { caller: 'one' }),
    'INVALID_RECEIPT',
  );
  advance(SHARE_LIMITS.receiptTtlMs + 1);
  await throwsCode(service.openUploadSession(pending.receipt, { caller: 'one' }), 'INVALID_RECEIPT');
});

test('upload boundaries reject foreign ids, MIME spoofing, oversized files and hash changes', async () => {
  const { service } = fixture();
  await throwsCode(
    service.startShare({
      caller: 'one',
      photos: [
        { id: '__proto__', sha256: digest(webp('a')) },
        { id: 'b', sha256: digest(webp('b')) },
        { id: 'c', sha256: digest(webp('c')) },
      ],
    }),
    'INVALID_INPUT',
  );
  const pending = await service.startShare({ photos: photos(['a', 'b', 'c']), caller: 'one' });
  const session = await service.openUploadSession(pending.receipt, { caller: 'one' });
  const input = {
    receipt: pending.receipt,
    uploadToken: session.uploadToken,
    photoId: 'photo_1',
    contentType: 'image/webp',
  };
  await throwsCode(service.uploadPhoto({ ...input, photoId: 'foreign', body: webp('a') }), 'INVALID_SESSION');
  await throwsCode(service.uploadPhoto({ ...input, contentType: 'image/jpeg', body: webp('a') }), 'INVALID_MEDIA');
  await throwsCode(service.uploadPhoto({ ...input, body: Buffer.from('not a webp') }), 'INVALID_MEDIA');
  await throwsCode(service.uploadPhoto({ ...input, body: webp('changed') }), 'HASH_MISMATCH');
  const huge = Buffer.alloc(SHARE_LIMITS.maxFileBytes + 1);
  huge.write('RIFF');
  huge.write('WEBP', 8);
  await throwsCode(service.uploadPhoto({ ...input, body: huge }), 'INVALID_MEDIA');
});

test('publish uses immutable versions, CAS and profile-off PII omission', async () => {
  const { service, store, advance } = fixture();
  const first = await stage(service, ['one', 'two', 'three']);
  const published = await service.publish({
    receipt: first.pending.receipt,
    uploadToken: first.session.uploadToken,
    managementKey: first.pending.managementKey,
    curation: curation(first.expected.map(photo => photo.id)),
  });
  const result = await service.readShare(first.pending.shareId);
  assert.equal(result.etag, published.etag);
  assert.equal(result.share.version, 1);
  assert.deepEqual(result.share.curation.includeProfile, false);
  assert.equal(JSON.stringify(await store.get(`shares/${first.pending.shareId}/manifest.json`)).includes('username'), false);
  assert.deepEqual(
    (await service.readImage(first.pending.shareId, 'photo_1')).body,
    webp('one'),
  );
  await throwsCode(service.readImage(first.pending.shareId, 'foreign'), 'NOT_FOUND');

  const update = await service.startUpdate({
    shareId: first.pending.shareId,
    managementKey: first.pending.managementKey,
    ifMatch: published.etag,
    photos: photos(['next one', 'next two', 'next three']),
    caller: 'one',
  });
  const second = await stage(service, ['next one', 'next two', 'next three'], update);
  await throwsCode(
    service.publish({
      receipt: update.receipt,
      uploadToken: second.session.uploadToken,
      managementKey: first.pending.managementKey,
      curation: curation(second.expected.map(photo => photo.id)),
      ifMatch: '"stale"',
    }),
    'CONFLICT',
  );
  assert.equal((await store.list(`shares/${first.pending.shareId}/versions/2/`)).length, 0);
  const replaced = await service.publish({
    receipt: update.receipt,
    uploadToken: second.session.uploadToken,
    managementKey: first.pending.managementKey,
    curation: curation(second.expected.map(photo => photo.id)),
    ifMatch: published.etag,
  });
  assert.equal((await service.readShare(first.pending.shareId)).share.version, 2);
  assert.deepEqual(
    (await service.readImage(first.pending.shareId, 'photo_1')).body,
    webp('next one'),
  );
  assert.equal((await store.list(`shares/${first.pending.shareId}/versions/1/`)).length, 4);
  advance(SHARE_LIMITS.abandonedTtlMs);
  await service.cleanup();
  assert.equal((await store.list(`shares/${first.pending.shareId}/versions/1/`)).length, 0);
  assert.ok(replaced.etag);
});

test('profile data is accepted only after explicit inclusion and exact validation', async () => {
  const { service } = fixture();
  const staged = await stage(service, ['a', 'b', 'c']);
  const base = curation(staged.expected.map(photo => photo.id));
  await throwsCode(
    service.publish({
      receipt: staged.pending.receipt,
      uploadToken: staged.session.uploadToken,
      managementKey: staged.pending.managementKey,
      curation: { ...base, profile: { username: 'leak' } },
    }),
    'INVALID_INPUT',
  );
  const profile = {
    username: 'public.profile',
    displayName: 'Public Profile',
    avatarUrl: null,
    source: 'https://www.instagram.com/public.profile/',
    collectedAt: '2026-09-18T00:00:00.000Z',
  };
  await service.publish({
    receipt: staged.pending.receipt,
    uploadToken: staged.session.uploadToken,
    managementKey: staged.pending.managementKey,
    curation: { ...base, includeProfile: true, profile },
  });
  assert.deepEqual((await service.readShare(staged.pending.shareId)).share.curation.profile, profile);
});

test('concurrent updates isolate attempts and cleanup removes only the losing immutable objects', async () => {
  const { service, store, advance } = fixture();
  const first = await stage(service, ['a', 'b', 'c']);
  const published = await service.publish({
    receipt: first.pending.receipt,
    uploadToken: first.session.uploadToken,
    managementKey: first.pending.managementKey,
    curation: curation(first.expected.map(photo => photo.id)),
  });
  const makeUpdate = async (labels, prefix) => {
    const expected = photos(labels, prefix);
    const update = await service.startUpdate({
      shareId: first.pending.shareId,
      managementKey: first.pending.managementKey,
      ifMatch: published.etag,
      photos: expected,
      caller: prefix,
    });
    return stage(service, labels, update, prefix);
  };
  const [left, right] = await Promise.all([
    makeUpdate(['left a', 'left b', 'left c'], 'left'),
    makeUpdate(['right a', 'right b', 'right c'], 'right'),
  ]);
  const publish = staged => service.publish({
    receipt: staged.pending.receipt,
    uploadToken: staged.session.uploadToken,
    managementKey: first.pending.managementKey,
    curation: curation(staged.expected.map(photo => photo.id)),
    ifMatch: published.etag,
  });
  const outcomes = await Promise.allSettled([publish(left), publish(right)]);
  assert.deepEqual(outcomes.map(outcome => outcome.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(outcomes.find(outcome => outcome.status === 'rejected').reason.code, 'CONFLICT');
  const before = await store.list(`shares/${first.pending.shareId}/versions/2/`);
  assert.equal(before.length, 8);
  advance(SHARE_LIMITS.abandonedTtlMs);
  await service.cleanup();
  const current = (await service.readShare(first.pending.shareId)).share.curation;
  const after = await store.list(`shares/${first.pending.shareId}/versions/2/`);
  assert.equal(after.length, 4);
  assert.ok(after.every(item => item.path.includes(current.photos[0].id.startsWith('left') ? left.session.sessionId : right.session.sessionId)));
});

test('key rotation immediately rejects the old key and revoke writes a PII-free tombstone first', async () => {
  const { service, store } = fixture();
  const staged = await stage(service, ['a', 'b', 'c']);
  const published = await service.publish({
    receipt: staged.pending.receipt,
    uploadToken: staged.session.uploadToken,
    managementKey: staged.pending.managementKey,
    curation: curation(staged.expected.map(photo => photo.id)),
  });
  const rotated = await service.rotateKey({
    shareId: staged.pending.shareId,
    managementKey: staged.pending.managementKey,
    ifMatch: published.etag,
    caller: 'one',
  });
  await throwsCode(
    service.revoke({
      shareId: staged.pending.shareId,
      managementKey: staged.pending.managementKey,
      ifMatch: rotated.etag,
      caller: 'one',
    }),
    'UNAUTHORIZED',
  );
  const revoked = await service.revoke({
    shareId: staged.pending.shareId,
    managementKey: rotated.managementKey,
    ifMatch: rotated.etag,
    caller: 'one',
  });
  await throwsCode(service.readShare(staged.pending.shareId), 'GONE');
  await throwsCode(service.readImage(staged.pending.shareId, 'photo_1'), 'GONE');
  const tombstone = JSON.parse((await store.get(`shares/${staged.pending.shareId}/manifest.json`)).body);
  assert.deepEqual(Object.keys(tombstone).sort(), ['currentVersion', 'objects', 'revokedAt', 'shareId', 'status']);
  assert.equal((await store.list(`shares/${staged.pending.shareId}/versions/`)).length, 0);
  assert.ok(revoked.etag);
});

test('daily cleanup removes abandoned uploads, receipts and non-current version objects only after 24 hours', async () => {
  const { service, store, advance } = fixture();
  const staged = await stage(service, ['a', 'b', 'c']);
  await store.put('shares/orphan/versions/9/photos/x.webp', webp('orphan'), {
    contentType: 'image/webp',
  });
  advance(SHARE_LIMITS.abandonedTtlMs - 1);
  assert.equal((await service.cleanup()).deleted, 0);
  assert.equal((await store.list(staged.session.prefix)).length, 3);
  advance(1);
  const result = await service.cleanup();
  assert.ok(result.deleted >= 4);
  assert.equal((await store.list(staged.session.prefix)).length, 0);
  assert.equal((await store.list('share-receipts/')).length, 0);
});

test('post-CAS deletion failure still reports committed publish and revoke, then cleanup finishes', async () => {
  const { service, store } = fixture();
  const staged = await stage(service, ['a', 'b', 'c']);
  const originalDelete = store.delete.bind(store);
  let failNextDelete = true;
  store.delete = async path => {
    if (failNextDelete) {
      failNextDelete = false;
      throw new Error('injected delete failure');
    }
    return originalDelete(path);
  };
  const published = await service.publish({
    receipt: staged.pending.receipt,
    uploadToken: staged.session.uploadToken,
    managementKey: staged.pending.managementKey,
    curation: curation(staged.expected.map(photo => photo.id)),
  });
  assert.equal((await service.readShare(staged.pending.shareId)).share.version, 1);
  failNextDelete = true;
  const revoked = await service.revoke({
    shareId: staged.pending.shareId,
    managementKey: staged.pending.managementKey,
    ifMatch: published.etag,
    caller: 'one',
  });
  assert.ok(revoked.etag);
  await service.cleanup();
  assert.equal((await store.list(`shares/${staged.pending.shareId}/versions/`)).length, 0);
  assert.equal((await store.list(`temp/${staged.pending.shareId}/`)).length, 0);
});
