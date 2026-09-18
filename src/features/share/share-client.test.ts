import { createHash } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import type { F3Export } from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';
import {
  handleManage,
  handleShare,
  handleShareUpload,
} from '../../../lib/share-api.js';
import {
  createShareService,
  MemoryBlobStore,
} from '../../../lib/share-storage.js';
import {
  type ConfirmedCuration,
  createCurationEditorStore,
} from '../editor/curation-store';
import { curationFixture } from '../editor/curation-test-fixture';
import {
  createBlobPhotoUploader,
  createManagementKey,
  createShareClient,
  type PhotoUploader,
  ShareApiError,
  type SharePhoto,
  toShareCuration,
} from './share-client';

test('browser management keys are canonical 32-byte base64url tokens', () => {
  const keys = new Set(Array.from({ length: 3 }, () => createManagementKey()));
  expect(keys.size).toBe(3);
  for (const key of keys) {
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(key, 'base64url')).toHaveLength(32);
    expect(Buffer.from(key, 'base64url').toString('base64url')).toBe(key);
  }
});

test('browser photo upload uses the private token-exchange contract', async () => {
  const upload = vi.fn(async () => ({
    contentDisposition: 'inline',
    contentType: 'image/webp',
    downloadUrl: 'https://blob.test/download',
    etag: 'etag',
    pathname: 'share-upload/session/photo.webp',
    url: 'https://blob.test/photo',
  }));
  const uploader = createBlobPhotoUploader(upload);
  const session = {
    constraints: {
      contentType: 'image/webp' as const,
      maxFileBytes: 100,
      maxFiles: 15,
      maxTotalBytes: 1500,
    },
    expiresAt: 1_800_000_000_000,
    photoIds: ['photo'],
    prefix: 'share-upload/session/',
    sessionId: 'session',
    shareId: 'share',
    uploadToken: 'upload-token',
    version: 1,
  };

  await uploader({
    photo: { id: 'photo', body: webp('photo') },
    receipt: 'receipt',
    session,
  });

  expect(upload).toHaveBeenCalledWith(
    'share-upload/session/photo.webp',
    expect.any(ArrayBuffer),
    {
      access: 'private',
      clientPayload: JSON.stringify({
        receipt: 'receipt',
        uploadToken: 'upload-token',
        photoId: 'photo',
      }),
      contentType: 'image/webp',
      handleUploadUrl: '/api/share-blob-upload',
    },
  );
});

const webp = (label: string) => {
  const bytes = Buffer.alloc(12 + label.length);
  bytes.write('RIFF');
  bytes.write('WEBP', 8);
  bytes.write(label, 12);
  return new Uint8Array(bytes);
};
const photoIds = fixture.feed.slots.map((slot) => slot.photo_id);
const sharePhotos = (label = 'a'): SharePhoto[] =>
  photoIds.map((id) => ({ id, body: webp(`${label}-${id}`) }));

async function confirmedStore() {
  const store = createCurationEditorStore(null);
  await store.getState().loadCuration(async () => {
    const value = curationFixture();
    return value;
  });
  await store.getState().generate(undefined, async () => ({
    output: structuredClone(fixture.all_omitted) as F3Export,
  }));
  store.getState().editCaption(photoIds[0], '첫 문장');
  store.getState().editCaption(photoIds[2], '셋째 문장');
  store.getState().setProfileSharing(true);
  return store;
}

function server() {
  let random = 0;
  const now = () => 1_800_000_000_000;
  // The G6 core is untyped JS; the test pins only the members it drives.
  const create = createShareService as (options: unknown) => {
    openUploadSession: (
      receipt: string,
      options?: unknown,
    ) => Promise<{ uploadToken: string }>;
    startShare: (input: unknown) => Promise<{
      managementKey: string;
      receipt: string;
      shareId: string;
    }>;
    uploadPhoto: (input: unknown) => Promise<unknown>;
  };
  const service = create({
    store: new MemoryBlobStore({ now }),
    secret: 'share-client-test-secret-at-least-32-bytes',
    now,
    randomBytes(size: number) {
      random += 1;
      return Buffer.alloc(size, random);
    },
    async resolveProfile(snapshotId: string) {
      if (!['public-reference', 'another-reference'].includes(snapshotId))
        throw Object.assign(new Error('invalid reference'), {
          code: 'INVALID_SNAPSHOT_REFERENCE',
        });
      return {
        source_url: 'https://www.instagram.com/public_example/',
        collected_at: '2026-09-18T10:00:00Z',
        snapshot: {
          handle: 'public_example',
          profile_display: {
            display_name: 'Public Example',
            name_source: 'apify.ownerFullName',
          },
        },
      };
    },
  });
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://share.test');
    const request = new Request(url, init);
    if (url.pathname === '/api/share-upload')
      return handleShareUpload(request, { service });
    const manage = url.pathname.match(/^\/api\/manage\/([^/]+)$/);
    if (manage) return handleManage(request, { service, shareId: manage[1] });
    const share = url.pathname.match(/^\/api\/share\/([^/]+)$/);
    if (share) return handleShare(request, { service, shareId: share[1] });
    return new Response(null, { status: 404 });
  };
  const uploadPhoto: PhotoUploader = async ({ photo, receipt, session }) => {
    await service.uploadPhoto({
      receipt,
      uploadToken: session.uploadToken,
      photoId: photo.id,
      contentType: 'image/webp',
      body: photo.body,
    });
  };
  return {
    client: createShareClient({ fetcher, uploadPhoto }),
    fetcher,
    service,
    uploadPhoto,
  };
}

test('publish awaits durable start recovery before uploading any photo', async () => {
  const running = server();
  const events: string[] = [];
  const client = createShareClient({
    fetcher: running.fetcher,
    uploadPhoto: async (input) => {
      events.push('upload');
      await running.uploadPhoto(input);
    },
  });
  const store = await confirmedStore();
  const input = {
    confirmed: store.getState().confirmCuration(),
    photos: sharePhotos(),
  };

  await client.publish({
    ...input,
    onStarted: async () => {
      events.push('started');
      await Promise.resolve();
      events.push('persisted');
    },
  });
  expect(events.slice(0, 3)).toEqual(['started', 'persisted', 'upload']);

  const aborted = server();
  const upload = vi.fn(aborted.uploadPhoto);
  await expect(
    createShareClient({
      fetcher: aborted.fetcher,
      uploadPhoto: upload,
    }).publish({
      ...input,
      onStarted: () => {
        throw new ShareApiError('STORAGE_REQUIRED');
      },
    }),
  ).rejects.toMatchObject({ code: 'STORAGE_REQUIRED' });
  expect(upload).not.toHaveBeenCalled();
});

test('profile sharing sends only the signed reference when explicitly enabled', async () => {
  const store = await confirmedStore();
  store.getState().setProfileSharing(false);
  const off = toShareCuration(store.getState().confirmCuration());
  expect(off.includeProfile).toBe(false);
  expect('profile' in off).toBe(false);
  expect('profileSnapshotId' in off).toBe(false);

  store.getState().setProfileSharing(true);
  store.getState().setCrop(photoIds[0], { x: 20, y: 80 });
  const on = toShareCuration(store.getState().confirmCuration());
  expect(on.includeProfile).toBe(true);
  expect(on.includeProfile && on.profileSnapshotId).toBe('public-reference');
  expect(JSON.stringify(on)).not.toMatch(
    /public_example|displayName|avatarUrl|source|collectedAt/,
  );
  expect(on.photos[0].focalPoint).toEqual({ x: 0.2, y: 0.8 });
  expect(on.photos[0].caption).toBe('첫 문장');
  expect(on.photos[1].caption).toBeUndefined();
  expect(on.photos[2].caption).toBe('셋째 문장');
});

test('a confirmation with no signed profile reference is refused before network', async () => {
  const { fetcher, uploadPhoto } = server();
  const calls: string[] = [];
  const client = createShareClient({
    fetcher: (input, init) => {
      calls.push(String(input));
      return fetcher(input, init);
    },
    uploadPhoto,
  });
  const store = await confirmedStore();
  const confirmed = store.getState().confirmCuration();
  const legacy = structuredClone(confirmed) as ConfirmedCuration;
  delete legacy.profileSnapshotId;

  await expect(
    client.publish({ confirmed: legacy, photos: sharePhotos() }),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  expect(calls).toEqual([]);

  // Sharing off never needed the profile, so the same draft still publishes.
  const shared = await client.publish({
    confirmed: { ...legacy, profileSharing: false },
    photos: sharePhotos(),
  });
  expect(shared.version).toBe(1);
});

test('the signed profile reference follows the confirmation, not later editor state', async () => {
  const store = await confirmedStore();
  const first = store.getState().confirmCuration();
  await store.getState().loadCuration(async () => {
    const value = curationFixture();
    value.curation.profile_snapshot_id = 'another-reference';
    return value;
  });
  await store.getState().generate(undefined, async () => ({
    output: structuredClone(fixture.all_omitted) as F3Export,
  }));
  store.getState().setProfileSharing(true);
  const second = store.getState().confirmCuration();
  const reference = (value: typeof first) => {
    const curation = toShareCuration(value);
    return curation.includeProfile ? curation.profileSnapshotId : null;
  };
  expect(reference(first)).toBe('public-reference');
  expect(reference(second)).toBe('another-reference');
});

test('publish, reconfirm, rotate and revoke drive the real share contract', async () => {
  const { client } = server();
  const store = await confirmedStore();
  const photos = sharePhotos();
  const published = await client.publish({
    confirmed: store.getState().confirmCuration(),
    photos,
  });
  expect(published.version).toBe(1);

  const read = await client.read(published.shareId);
  expect(read.etag).toBe(published.etag);
  expect(read.share.curation.includeProfile).toBe(true);
  expect(
    read.share.curation.includeProfile && read.share.curation.profile,
  ).toMatchObject({
    avatarUrl: null,
    collectedAt: '2026-09-18T10:00:00Z',
    displayName: 'Public Example',
    source: 'https://www.instagram.com/public_example/',
    username: 'public_example',
  });

  store.getState().editCaption(photoIds[0], '재확정한 문장');
  const next = sharePhotos('b');
  const reconfirmed = await client.reconfirm({
    confirmed: store.getState().confirmCuration(),
    etag: published.etag,
    managementKey: published.managementKey,
    photos: next,
    shareId: published.shareId,
  });
  expect(reconfirmed.version).toBe(2);
  const updated = await client.read(published.shareId);
  expect(updated.share.version).toBe(2);
  expect(updated.share.curation.photos[0].caption).toBe('재확정한 문장');

  await expect(
    client.reconfirm({
      confirmed: store.getState().confirmCuration(),
      etag: published.etag,
      managementKey: published.managementKey,
      photos: sharePhotos('c'),
      shareId: published.shareId,
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await client.read(published.shareId)).share.version).toBe(2);

  const nextManagementKey = Buffer.alloc(32, 9).toString('base64url');
  const rotated = await client.rotateKey({
    etag: updated.etag as string,
    managementKey: published.managementKey,
    nextManagementKey,
    shareId: published.shareId,
  });
  await expect(
    client.revoke({
      etag: rotated.etag,
      managementKey: published.managementKey,
      shareId: published.shareId,
    }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

  await client.revoke({
    etag: rotated.etag,
    managementKey: nextManagementKey,
    shareId: published.shareId,
  });
  await expect(client.read(published.shareId)).rejects.toBeInstanceOf(
    ShareApiError,
  );
});

test('a photo set that differs from the confirmation never reaches the server', async () => {
  const { fetcher, uploadPhoto } = server();
  const calls: string[] = [];
  const client = createShareClient({
    fetcher: (input, init) => {
      calls.push(String(input));
      return fetcher(input, init);
    },
    uploadPhoto,
  });
  const store = await confirmedStore();
  const confirmed = store.getState().confirmCuration();
  for (const photos of [
    sharePhotos().slice(0, 2),
    [...sharePhotos()].reverse(),
  ])
    await expect(client.publish({ confirmed, photos })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  expect(calls).toEqual([]);
});

test('uploaded bytes are bound to the receipt hash the client computed', async () => {
  const { service } = server();
  const photos = sharePhotos();
  const started = await service.startShare({
    photos: photos.map((photo) => ({
      id: photo.id,
      sha256: createHash('sha256').update(photo.body).digest('hex'),
    })),
    caller: 'test',
  });
  const session = await service.openUploadSession(started.receipt, {
    caller: 'test',
  });
  await expect(
    service.uploadPhoto({
      receipt: started.receipt,
      uploadToken: session.uploadToken,
      photoId: photos[0].id,
      contentType: 'image/webp',
      body: webp('tampered'),
    }),
  ).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
});
