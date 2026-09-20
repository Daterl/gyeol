import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { instagramAccount, validProfileDisplayName } from './apify_ingest.js';
import { resolvePublicProfile } from './profile-cache.js';

export const SHARE_LIMITS = Object.freeze({
  maxPhotos: 15,
  minPhotos: 3,
  maxFileBytes: 4 * 1024 * 1024,
  maxTotalBytes: 60 * 1024 * 1024,
  receiptTtlMs: 10 * 60 * 1000,
  abandonedTtlMs: 24 * 60 * 60 * 1000,
});

export class ShareError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'ShareError';
    this.code = code;
    this.details = details;
  }
}

const fail = (condition, code = 'INVALID_INPUT', details) => {
  if (!condition) throw new ShareError(code, details);
};
const sha256 = value =>
  createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(JSON.stringify(value));
const parse = blob => JSON.parse(blob.body.toString('utf8'));
const safeEqual = (left, right) => {
  const a = Buffer.from(left ?? '');
  const b = Buffer.from(right ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
};
const exactKeys = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();
const idPattern = /^(?!(?:__proto__|prototype|constructor)$)[A-Za-z0-9_-]{1,80}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const revisionPattern = /^"[a-f0-9]{64}"$/;
const managementKey = value =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_-]{43}$/.test(value) &&
  Buffer.from(value, 'base64url').length === 32 &&
  Buffer.from(value, 'base64url').toString('base64url') === value;
const isWebp = bytes =>
  bytes.length >= 12 &&
  bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
  bytes.subarray(8, 12).toString('ascii') === 'WEBP';

/** Minimal Private Blob contract. The G8 adapter must preserve get/put/list/delete semantics. */
export class MemoryBlobStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.values = new Map();
  }

  async get(path) {
    const value = this.values.get(path);
    return value ? { ...value, body: Buffer.from(value.body) } : null;
  }

  async put(path, body, { contentType, ifMatch, ifNoneMatch = false } = {}) {
    const current = this.values.get(path);
    if ((ifNoneMatch && current) || (ifMatch !== undefined && current?.etag !== ifMatch)) {
      throw new ShareError('CONFLICT');
    }
    const bytes = Buffer.from(body);
    const value = {
      body: bytes,
      contentType,
      etag: `"${sha256(bytes)}"`,
      uploadedAt: this.now(),
    };
    this.values.set(path, value);
    return { ...value, body: Buffer.from(bytes) };
  }

  async delete(path) {
    this.values.delete(path);
  }

  async list(prefix = '') {
    return [...this.values.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, value]) => ({
        path,
        contentType: value.contentType,
        etag: value.etag,
        size: value.body.length,
        uploadedAt: value.uploadedAt,
      }));
  }
}

export function createMemoryRateLimiter({ limit = 20, windowMs = 60_000 } = {}) {
  const attempts = new Map();
  return {
    check(bucket, key, now) {
      const id = `${bucket}:${key}`;
      const active = (attempts.get(id) ?? []).filter(time => time > now - windowMs);
      fail(active.length < limit, 'RATE_LIMITED');
      active.push(now);
      attempts.set(id, active);
    },
  };
}

const receiptBody = (value, secret) => {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
};

const readReceipt = (receipt, secret, now) => {
  fail(typeof receipt === 'string' && receipt.length <= 8192, 'INVALID_RECEIPT');
  const segments = receipt.split('.');
  fail(
    segments.length === 2 && segments.every(segment =>
      /^[A-Za-z0-9_-]+$/.test(segment) &&
      Buffer.from(segment, 'base64url').toString('base64url') === segment),
    'INVALID_RECEIPT',
  );
  const [body, signature] = segments;
  const expected = createHmac('sha256', secret)
    .update(body ?? '')
    .digest('base64url');
  fail(safeEqual(signature, expected), 'INVALID_RECEIPT');
  let value;
  try {
    value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new ShareError('INVALID_RECEIPT');
  }
  fail(
    exactKeys(value, [
      'v',
      'shareId',
      'version',
      'photos',
      'keyHash',
      'issuedAt',
      'expiresAt',
    ]) &&
      value.v === 1 &&
      idPattern.test(value.shareId) &&
      Number.isInteger(value.version) &&
      value.version > 0 &&
      digestPattern.test(value.keyHash) &&
      Number.isInteger(value.issuedAt) &&
      Number.isInteger(value.expiresAt) &&
      value.expiresAt > value.issuedAt &&
      value.expiresAt - value.issuedAt <= SHARE_LIMITS.receiptTtlMs &&
      now <= value.expiresAt,
    'INVALID_RECEIPT',
  );
  validatePhotos(value.photos);
  return value;
};

const validatePhotos = photos => {
  fail(
    Array.isArray(photos) &&
      photos.length >= SHARE_LIMITS.minPhotos &&
      photos.length <= SHARE_LIMITS.maxPhotos,
  );
  const ids = new Set();
  for (const photo of photos) {
    fail(
      exactKeys(photo, ['id', 'sha256']) &&
        idPattern.test(photo.id) &&
        digestPattern.test(photo.sha256) &&
        !ids.has(photo.id),
    );
    ids.add(photo.id);
  }
};

const validateCuration = (curation, receipt) => {
  fail(
    curation &&
      typeof curation === 'object' &&
      !Array.isArray(curation) &&
      Array.isArray(curation.photos),
  );
  fail(curation.photos.length === receipt.photos.length);
  for (let index = 0; index < curation.photos.length; index += 1) {
    const photo = curation.photos[index];
    const keys = Object.keys(photo ?? {});
    fail(
      photo &&
        typeof photo === 'object' &&
        keys.every(key => ['id', 'caption', 'focalPoint'].includes(key)) &&
        idPattern.test(photo.id) &&
        photo.id === receipt.photos[index].id &&
        (photo.caption === undefined ||
          (typeof photo.caption === 'string' && photo.caption.length <= 2200)) &&
        (photo.focalPoint === undefined ||
          (exactKeys(photo.focalPoint, ['x', 'y']) &&
            Number.isFinite(photo.focalPoint.x) &&
            Number.isFinite(photo.focalPoint.y) &&
            photo.focalPoint.x >= 0 &&
            photo.focalPoint.x <= 1 &&
            photo.focalPoint.y >= 0 &&
            photo.focalPoint.y <= 1)),
    );
  }
  if (curation.includeProfile !== true) {
    fail(
      curation.includeProfile === false &&
        exactKeys(curation, ['photos', 'includeProfile']),
    );
    return { photos: curation.photos, includeProfile: false };
  }
  fail(
    exactKeys(curation, ['photos', 'includeProfile', 'profileSnapshotId']) &&
      typeof curation.profileSnapshotId === 'string' &&
      curation.profileSnapshotId.trim().length > 0 &&
      curation.profileSnapshotId.length <= 2048,
  );
  return {
    photos: curation.photos,
    includeProfile: true,
    profileSnapshotId: curation.profileSnapshotId,
  };
};

const publicProfile = resolved => {
  let account;
  try {
    account = instagramAccount(resolved?.source_url).account;
  } catch {
    fail(false, 'INVALID_PROFILE_REFERENCE');
  }
  const snapshot = resolved?.snapshot;
  fail(
    snapshot?.handle === account &&
      typeof resolved.collected_at === 'string' &&
      !Number.isNaN(Date.parse(resolved.collected_at)),
    'INVALID_PROFILE_REFERENCE',
  );
  const displayName =
    snapshot.profile_display?.name_source === 'apify.ownerFullName' &&
    validProfileDisplayName(snapshot.profile_display.display_name)
      ? snapshot.profile_display.display_name.trim()
      : null;
  return {
    username: account,
    displayName,
    avatarUrl: null,
    source: resolved.source_url,
    collectedAt: resolved.collected_at,
  };
};

const immutablePut = async (store, path, body, contentType) => {
  try {
    return await store.put(path, body, { contentType, ifNoneMatch: true });
  } catch (error) {
    if (!(error instanceof ShareError) || error.code !== 'CONFLICT') throw error;
    const current = await store.get(path);
    fail(
      current &&
        current.contentType === contentType &&
        safeEqual(sha256(current.body), sha256(body)),
      'CONFLICT',
    );
    return current;
  }
};

export function createShareService({
  store,
  secret,
  now = () => Date.now(),
  randomBytes = nodeRandomBytes,
  rateLimiter = createMemoryRateLimiter(),
  resolveProfile = resolvePublicProfile,
} = {}) {
  fail(store && typeof store.get === 'function' && typeof store.put === 'function', 'NOT_CONFIGURED');
  fail(typeof secret === 'string' && secret.length >= 32, 'NOT_CONFIGURED');

  const randomToken = size => randomBytes(size).toString('base64url');
  const manifestPath = shareId => `shares/${shareId}/manifest.json`;
  const withRevision = value => {
    const { revision: _revision, ...manifest } = value;
    return { ...manifest, revision: `"${sha256(json(manifest))}"` };
  };
  const revisionOf = (blob, value) => {
    const { revision, ...manifest } = value;
    return revisionPattern.test(revision) &&
      safeEqual(revision, `"${sha256(json(manifest))}"`)
      ? revision
      : `"${sha256(blob.body)}"`;
  };
  const receiptPath = hash => `share-receipts/${hash}.json`;
  const versionPrefix = (shareId, version) => `shares/${shareId}/versions/${version}/`;
  const deletePrefix = async prefix => {
    try {
      for (const item of await store.list(prefix)) {
        try {
          await store.delete(item.path);
        } catch {
          // The manifest is already committed; daily cleanup retries orphan deletion.
        }
      }
    } catch {
      // Listing failure must not turn a committed publish/revoke into a reported failure.
    }
  };
  const sessionToken = receiptHash =>
    createHmac('sha256', secret).update(`upload:${receiptHash}`).digest('base64url');
  const issue = ({ shareId, version, photos, keyHash }) => {
    validatePhotos(photos);
    const issuedAt = now();
    return receiptBody(
      {
        v: 1,
        shareId,
        version,
        photos,
        keyHash,
        issuedAt,
        expiresAt: issuedAt + SHARE_LIMITS.receiptTtlMs,
      },
      secret,
    );
  };
  const getManifest = async shareId => {
    fail(idPattern.test(shareId), 'INVALID_INPUT');
    const blob = await store.get(manifestPath(shareId));
    fail(blob, 'NOT_FOUND');
    return { blob, value: parse(blob) };
  };
  // A Private Blob ETag cannot guard this write (#210). The value `get` returns is not what the
  // store compares `ifMatch` against, so every rotate and revoke failed with CONFLICT in
  // production while passing against an in-memory store. The manifest's own revision guards it
  // instead: the caller compares the revision it read, and this re-reads what actually landed.
  // A racing writer that lands last makes the loser's re-read fail, which is the outcome the
  // conditional write was there to produce.
  const writeManifest = async (shareId, value) => {
    await store.put(manifestPath(shareId), json(value), {
      contentType: 'application/json',
      revision: true,
    });
    const { value: stored } = await getManifest(shareId);
    fail(stored.revision === value.revision, 'CONFLICT');
  };
  const validateUploadState = async receipt => {
    const current = await store.get(manifestPath(receipt.shareId));
    if (!current) {
      // Only an initial receipt may precede manifest publication.
      fail(receipt.version === 1, 'CONFLICT');
      return;
    }
    const manifest = parse(current);
    fail(manifest.status === 'active', 'GONE');
    fail(safeEqual(manifest.managementKeyHash, receipt.keyHash), 'UNAUTHORIZED');
    fail(manifest.currentVersion + 1 === receipt.version, 'CONFLICT');
  };
  const authorizeUpload = async ({ receipt, uploadToken, photoId }) => {
    const value = readReceipt(receipt, secret, now());
    const receiptHash = sha256(receipt);
    fail(safeEqual(uploadToken, sessionToken(receiptHash)), 'UNAUTHORIZED');
    const marker = await store.get(receiptPath(receiptHash));
    fail(marker, 'INVALID_SESSION');
    const session = parse(marker);
    fail(
      session.expiresAt >= now() && session.photoIds.includes(photoId),
      'INVALID_SESSION',
    );
    await validateUploadState(value);
    return {
      expiresAt: session.expiresAt,
      pathname: `${session.prefix}${photoId}.webp`,
      receiptHash,
      session,
      value,
    };
  };
  const authorize = (manifest, key) => {
    fail(
      typeof key === 'string' &&
        safeEqual(sha256(key), manifest.managementKeyHash),
      'UNAUTHORIZED',
    );
  };
  const limit = (bucket, caller = 'anonymous') =>
    rateLimiter.check(bucket, caller, now());

  return {
    async startShare({ photos, caller } = {}) {
      await limit('share-start', caller);
      validatePhotos(photos);
      const shareId = randomToken(16);
      const managementKey = randomToken(32);
      const receipt = issue({
        shareId,
        version: 1,
        photos,
        keyHash: sha256(managementKey),
      });
      return { shareId, managementKey, receipt };
    },

    async startUpdate({ shareId, managementKey, ifMatch, photos, caller } = {}) {
      await limit('share-manage', caller);
      const { blob, value } = await getManifest(shareId);
      fail(value.status === 'active', 'GONE');
      authorize(value, managementKey);
      fail(ifMatch === revisionOf(blob, value), 'CONFLICT');
      return {
        shareId,
        receipt: issue({
          shareId,
          version: value.currentVersion + 1,
          photos,
          keyHash: value.managementKeyHash,
        }),
      };
    },

    async openUploadSession(receipt, { caller } = {}) {
      await limit('upload-session', caller);
      const value = readReceipt(receipt, secret, now());
      const receiptHash = sha256(receipt);
      await validateUploadState(value);
      const path = receiptPath(receiptHash);
      let marker = await store.get(path);
      if (!marker) {
        const created = {
          receiptHash,
          shareId: value.shareId,
          version: value.version,
          sessionId: receiptHash.slice(0, 32),
          prefix: `temp/${value.shareId}/${value.version}/${receiptHash.slice(0, 32)}/`,
          photoIds: value.photos.map(photo => photo.id),
          constraints: {
            maxFiles: value.photos.length,
            contentType: 'image/webp',
            maxFileBytes: SHARE_LIMITS.maxFileBytes,
            maxTotalBytes: SHARE_LIMITS.maxTotalBytes,
          },
          expiresAt: value.expiresAt,
        };
        try {
          marker = await store.put(path, json(created), {
            contentType: 'application/json',
            ifNoneMatch: true,
          });
        } catch (error) {
          if (!(error instanceof ShareError) || error.code !== 'CONFLICT') throw error;
          marker = await store.get(path);
        }
      }
      const session = parse(marker);
      fail(session.receiptHash === receiptHash, 'CONFLICT');
      await validateUploadState(value);
      return { ...session, uploadToken: sessionToken(receiptHash) };
    },

    async authorizePhotoUpload({
      receipt,
      uploadToken,
      photoId,
      caller,
    } = {}) {
      await limit('upload-token', caller);
      const { expiresAt, pathname } = await authorizeUpload({
        receipt,
        uploadToken,
        photoId,
      });
      return { expiresAt, pathname };
    },

    async uploadPhoto({ receipt, uploadToken, photoId, contentType, body } = {}) {
      const authorized = await authorizeUpload({ receipt, uploadToken, photoId });
      const { receiptHash, session, value } = authorized;
      fail(contentType === 'image/webp', 'INVALID_MEDIA');
      const bytes = Buffer.from(body ?? []);
      fail(
        bytes.length > 0 &&
          bytes.length <= SHARE_LIMITS.maxFileBytes &&
          isWebp(bytes),
        'INVALID_MEDIA',
      );
      const expected = value.photos.find(photo => photo.id === photoId);
      fail(expected && safeEqual(sha256(bytes), expected.sha256), 'HASH_MISMATCH');
      const existing = await store.list(session.prefix);
      const previous = existing.find(item => item.path.endsWith(`/${photoId}.webp`));
      const total = existing.reduce((sum, item) => sum + item.size, 0) - (previous?.size ?? 0) + bytes.length;
      fail(total <= SHARE_LIMITS.maxTotalBytes, 'INVALID_MEDIA');
      const path = authorized.pathname;
      await immutablePut(store, path, bytes, contentType);
      try {
        await validateUploadState(value);
      } catch (error) {
        if (error instanceof ShareError &&
            ['GONE', 'UNAUTHORIZED', 'CONFLICT'].includes(error.code)) {
          try {
            // Never delete published objects or another receipt's attempt.
            await store.delete(path);
          } catch {
            // The next cleanup retries tombstoned temp; other stale temp expires at 24h.
          }
        }
        throw error;
      }
      return { photoId, size: bytes.length, sha256: expected.sha256 };
    },

    async publish({ receipt, uploadToken, managementKey, curation, ifMatch, caller } = {}) {
      await limit('share-publish', caller);
      const value = readReceipt(receipt, secret, now());
      const receiptHash = sha256(receipt);
      fail(safeEqual(uploadToken, sessionToken(receiptHash)), 'UNAUTHORIZED');
      fail(
        typeof managementKey === 'string' &&
          safeEqual(sha256(managementKey), value.keyHash),
        'UNAUTHORIZED',
      );
      const marker = await store.get(receiptPath(receiptHash));
      fail(marker, 'INVALID_SESSION');
      const session = parse(marker);
      fail(session.expiresAt >= now(), 'INVALID_SESSION');
      const requestedCuration = validateCuration(curation, value);
      const current = await store.get(manifestPath(value.shareId));
      let previous;
      if (value.version === 1) fail(!current && ifMatch === undefined, 'CONFLICT');
      else {
        fail(current, 'CONFLICT');
        previous = parse(current);
        fail(ifMatch === revisionOf(current, previous), 'CONFLICT');
        fail(
          previous.status === 'active' &&
            previous.currentVersion + 1 === value.version &&
            safeEqual(previous.managementKeyHash, value.keyHash),
          'CONFLICT',
        );
      }
      const uploads = [];
      let total = 0;
      const attemptPrefix = `${versionPrefix(value.shareId, value.version)}${receiptHash.slice(0, 32)}/`;
      for (const photo of value.photos) {
        const uploaded = await store.get(`${session.prefix}${photo.id}.webp`);
        fail(uploaded && uploaded.contentType === 'image/webp', 'UPLOAD_INCOMPLETE');
        fail(isWebp(uploaded.body), 'INVALID_MEDIA');
        fail(
          uploaded.body.length <= SHARE_LIMITS.maxFileBytes &&
            safeEqual(sha256(uploaded.body), photo.sha256),
          'HASH_MISMATCH',
        );
        total += uploaded.body.length;
        fail(total <= SHARE_LIMITS.maxTotalBytes, 'INVALID_MEDIA');
        uploads.push({ photo, uploaded });
      }
      let safeCuration = requestedCuration;
      if (requestedCuration.includeProfile) {
        let resolved;
        try {
          resolved = await resolveProfile(requestedCuration.profileSnapshotId);
        } catch (error) {
          if (error instanceof ShareError) throw error;
          if (
            ['INVALID_SNAPSHOT_REFERENCE', 'PROFILE_NOT_READY'].includes(
              error?.code,
            )
          )
            throw new ShareError('INVALID_PROFILE_REFERENCE');
          if (['NOT_CONFIGURED', 'STORAGE_ERROR'].includes(error?.code))
            throw new ShareError('NOT_CONFIGURED');
          throw new ShareError('INTERNAL_ERROR');
        }
        safeCuration = {
          photos: requestedCuration.photos,
          includeProfile: true,
          profile: publicProfile(resolved),
        };
      }
      const objects = {};
      for (const { photo, uploaded } of uploads) {
        const pathname = `${attemptPrefix}photos/${photo.id}.webp`;
        await immutablePut(store, pathname, uploaded.body, 'image/webp');
        objects[photo.id] = {
          pathname,
          sha256: photo.sha256,
          contentType: 'image/webp',
          size: uploaded.body.length,
        };
      }
      const curationPath = `${attemptPrefix}curation.json`;
      await immutablePut(store, curationPath, json(safeCuration), 'application/json');
      const manifest = withRevision({
        status: 'active',
        shareId: value.shareId,
        currentVersion: value.version,
        objects,
        curationPath,
        managementKeyHash: value.keyHash,
        profile: safeCuration.includeProfile
          ? {
              included: true,
              source: safeCuration.profile.source,
              collectedAt: safeCuration.profile.collectedAt,
            }
          : { included: false },
        confirmedAt: new Date(now()).toISOString(),
      });
      // Creating the manifest still guards on absence, which the store answers reliably.
      // Replacing it cannot use a Blob ETag (#210), so the revision guards that write.
      if (current) await writeManifest(value.shareId, manifest);
      else
        await store.put(manifestPath(value.shareId), json(manifest), {
          contentType: 'application/json',
          ifNoneMatch: true,
        });
      await deletePrefix(session.prefix);
      return {
        shareId: value.shareId,
        version: value.version,
        etag: manifest.revision,
      };
    },

    async readShare(shareId) {
      const { blob, value } = await getManifest(shareId);
      fail(value.status === 'active', 'GONE');
      const curation = await store.get(value.curationPath);
      fail(curation, 'NOT_FOUND');
      return {
        etag: revisionOf(blob, value),
        share: {
          shareId,
          version: value.currentVersion,
          curation: parse(curation),
        },
      };
    },

    async readImage(shareId, photoId) {
      fail(idPattern.test(photoId), 'INVALID_INPUT');
      const { value } = await getManifest(shareId);
      fail(value.status === 'active', 'GONE');
      const object =
        value.objects && Object.hasOwn(value.objects, photoId)
          ? value.objects[photoId]
          : null;
      fail(
        object &&
          object.pathname.startsWith(versionPrefix(shareId, value.currentVersion)),
        'NOT_FOUND',
      );
      const image = await store.get(object.pathname);
      fail(
        image &&
          image.contentType === 'image/webp' &&
          image.body.length === object.size &&
          safeEqual(sha256(image.body), object.sha256),
        'NOT_FOUND',
      );
      return { body: image.body, contentType: image.contentType };
    },

    async rotateKey({
      shareId,
      managementKey: currentKey,
      nextManagementKey,
      ifMatch,
      caller,
    } = {}) {
      await limit('share-manage', caller);
      const { blob, value } = await getManifest(shareId);
      fail(value.status === 'active', 'GONE');
      fail(managementKey(nextManagementKey), 'INVALID_INPUT');
      if (safeEqual(sha256(nextManagementKey), value.managementKeyHash))
        return {
          managementKey: nextManagementKey,
          etag: revisionOf(blob, value),
        };
      authorize(value, currentKey);
      fail(ifMatch === revisionOf(blob, value), 'CONFLICT');
      const updated = withRevision({
        ...value,
        managementKeyHash: sha256(nextManagementKey),
      });
      await writeManifest(shareId, updated);
      return {
        managementKey: nextManagementKey,
        etag: updated.revision,
      };
    },

    async revoke({ shareId, managementKey, ifMatch, caller } = {}) {
      await limit('share-manage', caller);
      const { blob, value } = await getManifest(shareId);
      fail(value.status === 'active', 'GONE');
      authorize(value, managementKey);
      fail(ifMatch === revisionOf(blob, value), 'CONFLICT');
      const tombstone = withRevision({
        status: 'revoked',
        shareId,
        currentVersion: null,
        objects: {},
        revokedAt: new Date(now()).toISOString(),
      });
      await writeManifest(shareId, tombstone);
      await deletePrefix(`shares/${shareId}/versions/`);
      await deletePrefix(`temp/${shareId}/`);
      return { etag: tombstone.revision };
    },

    async cleanup() {
      const cutoff = now() - SHARE_LIMITS.abandonedTtlMs;
      let deleted = 0;
      const manifests = await store.list('shares/');
      const active = new Map();
      for (const item of manifests.filter(item => item.path.endsWith('/manifest.json'))) {
        const blob = await store.get(item.path);
        const value = parse(blob);
        active.set(
          value.shareId,
          value.status === 'active'
            ? value.curationPath.slice(0, -'curation.json'.length)
            : null,
        );
      }
      for (const item of await store.list('temp/')) {
        const shareId = item.path.match(/^temp\/([^/]+)\//)?.[1];
        if ((shareId && active.has(shareId) && active.get(shareId) === null) || item.uploadedAt <= cutoff) {
          await store.delete(item.path);
          deleted += 1;
        }
      }
      for (const item of await store.list('share-receipts/')) {
        if (item.uploadedAt <= cutoff) {
          await store.delete(item.path);
          deleted += 1;
        }
      }
      for (const item of manifests.filter(item => item.path.includes('/versions/'))) {
        const match = item.path.match(/^shares\/([^/]+)\/versions\/(\d+)\//);
        const tombstoned = match && active.has(match[1]) && active.get(match[1]) === null;
        const referenced = match && active.get(match[1]) && item.path.startsWith(active.get(match[1]));
        if (match && !referenced && (tombstoned || item.uploadedAt <= cutoff)) {
          await store.delete(item.path);
          deleted += 1;
        }
      }
      return { deleted };
    },
  };
}
