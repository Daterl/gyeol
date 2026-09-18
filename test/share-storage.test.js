import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
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
const resolvedProfile = {
  source_url: 'https://www.instagram.com/public.profile/',
  collected_at: '2026-09-18T00:00:00.000Z',
  snapshot: {
    handle: 'public.profile',
    profile_display: {
      display_name: 'Public Profile',
      name_source: 'apify.ownerFullName',
    },
  },
};
const resolveProfile = async snapshotId => {
  if (snapshotId !== 'signed-profile-reference')
    throw Object.assign(new Error('invalid reference'), {
      code: 'INVALID_SNAPSHOT_REFERENCE',
    });
  return resolvedProfile;
};

function fixture(options = {}) {
  let time = Date.parse('2026-09-18T00:00:00.000Z');
  let random = 0;
  const now = () => time;
  const store = new MemoryBlobStore({ now });
  const service = createShareService({
    store,
    secret: 'share-test-secret-that-is-at-least-32-bytes',
    now,
    resolveProfile,
    randomBytes(size) {
      random += 1;
      return Buffer.alloc(size, random);
    },
    ...options,
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
  await throwsCode(service.readImage(first.pending.shareId, 'toString'), 'NOT_FOUND');

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

test('publish revalidates the bytes written by a direct-upload provider', async () => {
  const { service, store } = fixture();
  const invalid = Buffer.from('not actually webp');
  const expected = [
    { id: 'photo_1', sha256: digest(invalid) },
    ...photos(['b', 'c']).map((photo, index) => ({ ...photo, id: `photo_${index + 2}` })),
  ];
  const pending = await service.startShare({ photos: expected, caller: 'one' });
  const session = await service.openUploadSession(pending.receipt, { caller: 'one' });
  await store.put(`${session.prefix}photo_1.webp`, invalid, { contentType: 'image/webp' });
  for (const [id, label] of [['photo_2', 'b'], ['photo_3', 'c']]) {
    await service.uploadPhoto({
      receipt: pending.receipt,
      uploadToken: session.uploadToken,
      photoId: id,
      contentType: 'image/webp',
      body: webp(label),
    });
  }
  await throwsCode(
    service.publish({
      receipt: pending.receipt,
      uploadToken: session.uploadToken,
      managementKey: pending.managementKey,
      curation: curation(expected.map(photo => photo.id)),
      caller: 'one',
    }),
    'INVALID_MEDIA',
  );
});

test('profile publishing resolves only the signed reference and stores no capability', async () => {
  let resolves = 0;
  const { service, store } = fixture({
    resolveProfile: async snapshotId => {
      resolves += 1;
      return resolveProfile(snapshotId);
    },
  });
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
  await throwsCode(
    service.publish({
      receipt: staged.pending.receipt,
      uploadToken: staged.session.uploadToken,
      managementKey: staged.pending.managementKey,
      curation: { ...base, includeProfile: 'false' },
    }),
    'INVALID_INPUT',
  );
  assert.equal(resolves, 0);
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
    curation: {
      ...base,
      includeProfile: true,
      profileSnapshotId: 'signed-profile-reference',
    },
  });
  assert.deepEqual((await service.readShare(staged.pending.shareId)).share.curation.profile, profile);
  assert.equal(resolves, 1);
  const stored = JSON.stringify(
    (await service.readShare(staged.pending.shareId)).share,
  );
  assert.doesNotMatch(stored, /signed-profile-reference|profileSnapshotId/);
  assert.equal(
    (await store.list(`shares/${staged.pending.shareId}/versions/1/`)).length,
    4,
  );
});

test('invalid profile references fail before immutable writes and stale updates fail before resolution', async () => {
  let resolves = 0;
  const invalid = fixture({
    resolveProfile: async () => {
      resolves += 1;
      throw Object.assign(new Error('expired'), { code: 'PROFILE_NOT_READY' });
    },
  });
  const staged = await stage(invalid.service, ['a', 'b', 'c']);
  const withProfile = {
    ...curation(staged.expected.map(photo => photo.id)),
    includeProfile: true,
    profileSnapshotId: 'expired-reference',
  };
  await throwsCode(
    invalid.service.publish({
      receipt: staged.pending.receipt,
      uploadToken: staged.session.uploadToken,
      managementKey: staged.pending.managementKey,
      curation: withProfile,
    }),
    'INVALID_PROFILE_REFERENCE',
  );
  assert.equal(resolves, 1);
  assert.equal(
    (await invalid.store.list(`shares/${staged.pending.shareId}/versions/`))
      .length,
    0,
  );

  const current = fixture({
    resolveProfile: async reference => {
      resolves += 1;
      return resolveProfile(reference);
    },
  });
  const first = await stage(current.service, ['a', 'b', 'c']);
  const published = await current.service.publish({
    receipt: first.pending.receipt,
    uploadToken: first.session.uploadToken,
    managementKey: first.pending.managementKey,
    curation: curation(first.expected.map(photo => photo.id)),
  });
  const update = await current.service.startUpdate({
    shareId: first.pending.shareId,
    managementKey: first.pending.managementKey,
    ifMatch: published.etag,
    photos: first.expected,
  });
  const uploaded = await stage(current.service, ['a', 'b', 'c'], update);
  const before = resolves;
  await throwsCode(
    current.service.publish({
      receipt: update.receipt,
      uploadToken: uploaded.session.uploadToken,
      managementKey: first.pending.managementKey,
      curation: {
        ...curation(first.expected.map(photo => photo.id)),
        includeProfile: true,
        profileSnapshotId: 'signed-profile-reference',
      },
      ifMatch: '"stale"',
    }),
    'CONFLICT',
  );
  assert.equal(resolves, before);
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


const restart = ({ store, now }) => createShareService({
  store, now, resolveProfile,
  secret: 'share-test-secret-that-is-at-least-32-bytes',
});
const uploadFirst = staged => ({
  receipt: staged.pending.receipt,
  uploadToken: staged.session.uploadToken,
  photoId: 'photo_1', contentType: 'image/webp', body: webp('a'),
});
const publishStaged = (service, staged, extra = {}) => service.publish({
  receipt: staged.pending.receipt,
  uploadToken: staged.session.uploadToken,
  managementKey: staged.pending.managementKey,
  curation: curation(staged.expected.map(photo => photo.id)),
  ...extra,
});
async function pendingUpdate(f) {
  const first = await stage(f.service, ['a', 'b', 'c']);
  const published = await publishStaged(f.service, first);
  const auth = { ...first.pending, ifMatch: published.etag };
  const update = await f.service.startUpdate({ ...auth, photos: photos(['a', 'b', 'c']) });
  const staged = await stage(f.service, ['a', 'b', 'c'], update);
  return { first, auth, staged };
}
function pausePut(store, matches) {
  const put = store.put.bind(store);
  let entered;
  let release;
  const ready = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  let once = true;
  store.put = async (path, ...args) => {
    if (once && matches(path)) {
      once = false;
      entered();
      await wait;
    }
    return put(path, ...args);
  };
  return { ready, release };
}

test('canonical receipts reject suffixes, empty segments, padding and noncanonical signed encodings', async () => {
  const f = fixture();
  const staged = await stage(f.service, ['a', 'b', 'c']);
  const receipt = staged.pending.receipt;
  const [body, signature] = receipt.split('.');
  const sign = body => `${body}.${createHmac('sha256', 'share-test-secret-that-is-at-least-32-bytes').update(body).digest('base64url')}`;
  for (const invalid of [
    `${receipt}.`, `${receipt}..unsigned-A`, `${receipt}..unsigned-B`,
    `${receipt}.extra`, `.${signature}`, `${body}.`, `${receipt}=`,
    sign(`${body}=`), sign(`${body}\n`), sign(`${body}!`),
  ]) {
    await throwsCode(restart(f).openUploadSession(invalid), 'INVALID_RECEIPT');
    await throwsCode(f.service.uploadPhoto({ ...uploadFirst(staged), receipt: invalid }), 'INVALID_RECEIPT');
    await throwsCode(publishStaged(f.service, staged, { receipt: invalid }), 'INVALID_RECEIPT');
  }
  const sessions = await Promise.all(Array.from({ length: 10 }, () => restart(f).openUploadSession(receipt)));
  for (const session of sessions) assert.deepEqual(session, staged.session);
  assert.equal((await f.store.list('share-receipts/')).length, 1);
});

test('concurrent first receipt openings share one durable marker across service instances', async () => {
  const f = fixture();
  const pending = await f.service.startShare({ photos: photos(['a', 'b', 'c']) });
  const sessions = await Promise.all(Array.from({ length: 10 }, () => restart(f).openUploadSession(pending.receipt)));
  for (const session of sessions) assert.deepEqual(session, sessions[0]);
  assert.deepEqual(await restart(f).openUploadSession(pending.receipt), sessions[0]);
  assert.equal((await f.store.list('share-receipts/')).length, 1);
});

test('revocation rejects both original and pending update receipts and existing upload tokens after restart', async () => {
  const f = fixture();
  const { first, auth, staged } = await pendingUpdate(f);
  await f.service.revoke(auth);
  for (const attempt of [first, staged]) {
    await throwsCode(restart(f).openUploadSession(attempt.pending.receipt), 'GONE');
    await throwsCode(restart(f).uploadPhoto(uploadFirst(attempt)), 'GONE');
  }
  assert.equal((await f.store.list(`temp/${auth.shareId}/`)).length, 0);
  await throwsCode(f.service.readImage(auth.shareId, 'photo_1'), 'GONE');
});

for (const change of ['revoke', 'rotateKey', 'publish']) {
  test(`in-flight upload rechecks ${change} and removes only its temporary object`, async () => {
    const f = fixture();
    const { auth, staged } = await pendingUpdate(f);
    const gate = pausePut(f.store, path => path.startsWith('temp/'));
    const uploading = restart(f).uploadPhoto(uploadFirst(staged));
    await gate.ready;
    if (change === 'publish') await publishStaged(f.service, staged, { managementKey: auth.managementKey, ifMatch: auth.ifMatch });
    else await f.service[change](auth);
    gate.release();
    await throwsCode(uploading, change === 'revoke' ? 'GONE' : change === 'rotateKey' ? 'UNAUTHORIZED' : 'CONFLICT');
    assert.equal(await f.store.get(`${staged.session.prefix}photo_1.webp`), null);
    if (change === 'revoke') {
      assert.equal((await f.store.list(`temp/${auth.shareId}/`)).length, 0);
      await throwsCode(f.service.readShare(auth.shareId), 'GONE');
    } else {
      assert.deepEqual((await f.service.readImage(auth.shareId, 'photo_1')).body, webp('a'));
    }
  });
}

test('session issuance rechecks tombstone after a concurrent marker write', async () => {
  const f = fixture();
  const { auth } = await pendingUpdate(f);
  f.advance(1);
  const update = await f.service.startUpdate({ ...auth, photos: photos(['a', 'b', 'c']) });
  const gate = pausePut(f.store, path => path.startsWith('share-receipts/'));
  const opening = restart(f).openUploadSession(update.receipt);
  await gate.ready;
  await f.service.revoke(auth);
  gate.release();
  await throwsCode(opening, 'GONE');
});

test('manifest key and next version bind update receipts without blocking prepublish uploads', async () => {
  const f = fixture();
  const { auth, staged } = await pendingUpdate(f);
  await f.service.rotateKey(auth);
  await throwsCode(restart(f).openUploadSession(staged.pending.receipt), 'UNAUTHORIZED');
  await throwsCode(restart(f).uploadPhoto(uploadFirst(staged)), 'UNAUTHORIZED');
  const other = fixture();
  const pending = await pendingUpdate(other);
  await publishStaged(other.service, pending.staged, { managementKey: pending.auth.managementKey, ifMatch: pending.auth.ifMatch });
  for (const attempt of [pending.first, pending.staged]) {
    await throwsCode(restart(other).openUploadSession(attempt.pending.receipt), 'CONFLICT');
    await throwsCode(restart(other).uploadPhoto(uploadFirst(attempt)), 'CONFLICT');
  }
  assert.deepEqual((await other.service.readImage(pending.auth.shareId, 'photo_1')).body, webp('a'));
});

test('receipt body rejects signed nonzero base64url pad bits', async () => {
  const f = fixture();
  const pending = await f.service.startShare({ photos: photos(['a', 'b', 'c']) });
  let decoded = Buffer.from(pending.receipt.split('.')[0], 'base64url').toString();
  while (Buffer.byteLength(decoded) % 3 === 0) decoded += ' ';
  const body = Buffer.from(decoded).toString('base64url');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const alias = body.slice(0, -1) + alphabet[alphabet.indexOf(body.at(-1)) + 1];
  assert.deepEqual(Buffer.from(alias, 'base64url'), Buffer.from(body, 'base64url'));
  const signature = createHmac('sha256', 'share-test-secret-that-is-at-least-32-bytes').update(alias).digest('base64url');
  await throwsCode(f.service.openUploadSession(`${alias}.${signature}`), 'INVALID_RECEIPT');
  assert.equal((await f.store.list('share-receipts/')).length, 0);
});

test('late losing upload cannot delete a distinct CAS winner or another active share', async () => {
  const f = fixture();
  const { auth, staged } = await pendingUpdate(f);
  const other = await stage(f.service, ['other a', 'other b', 'other c']);
  await publishStaged(f.service, other);
  const update = await f.service.startUpdate({ ...auth, photos: photos(['winner a', 'winner b', 'winner c']) });
  const winner = await stage(f.service, ['winner a', 'winner b', 'winner c'], update);
  const gate = pausePut(f.store, path => path.startsWith(staged.session.prefix));
  const uploading = restart(f).uploadPhoto(uploadFirst(staged));
  await gate.ready;
  await publishStaged(f.service, winner, { managementKey: auth.managementKey, ifMatch: auth.ifMatch });
  gate.release();
  await throwsCode(uploading, 'CONFLICT');
  assert.equal(await f.store.get(`${staged.session.prefix}photo_1.webp`), null);
  assert.deepEqual((await f.service.readImage(auth.shareId, 'photo_1')).body, webp('winner a'));
  assert.deepEqual((await f.service.readImage(other.pending.shareId, 'photo_1')).body, webp('other a'));
});

test('failed post-write deletion rejects the upload and tombstone cleanup retries', async () => {
  const f = fixture();
  const { auth, staged } = await pendingUpdate(f);
  const gate = pausePut(f.store, path => path.startsWith(staged.session.prefix));
  const uploading = restart(f).uploadPhoto(uploadFirst(staged));
  await gate.ready;
  await f.service.revoke(auth);
  const originalDelete = f.store.delete.bind(f.store);
  f.store.delete = async () => { throw new Error('injected cleanup outage'); };
  gate.release();
  await throwsCode(uploading, 'GONE');
  assert.equal((await f.store.list(staged.session.prefix)).length, 1);
  await throwsCode(f.service.readImage(auth.shareId, 'photo_1'), 'GONE');
  f.store.delete = originalDelete;
  await restart(f).cleanup();
  assert.equal((await f.store.list(staged.session.prefix)).length, 0);
});

test('update receipt cannot open or upload if its required manifest is absent', async () => {
  const f = fixture();
  const { auth, staged } = await pendingUpdate(f);
  await f.store.delete(`shares/${auth.shareId}/manifest.json`);
  await throwsCode(restart(f).openUploadSession(staged.pending.receipt), 'CONFLICT');
  await throwsCode(restart(f).uploadPhoto(uploadFirst(staged)), 'CONFLICT');
});
