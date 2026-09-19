import { createHash } from 'node:crypto';
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  get,
  list,
  put,
} from '@vercel/blob';
import { ShareError } from './share-storage.js';

const id = '[A-Za-z0-9_-]{1,80}';
const objectPaths = [
  new RegExp(`^shares/${id}/manifest\\.json$`),
  new RegExp(`^shares/${id}/versions/[1-9][0-9]*/[a-f0-9]{32}/curation\\.json$`),
  new RegExp(`^shares/${id}/versions/[1-9][0-9]*/[a-f0-9]{32}/photos/${id}\\.webp$`),
  new RegExp(`^temp/${id}/[1-9][0-9]*/[a-f0-9]{32}/${id}\\.webp$`),
  /^share-receipts\/[a-f0-9]{64}\.json$/,
  /^share-rate-limit\/v1\/[a-f0-9]{64}\.json$/,
];
const prefixes = [
  /^shares\/$/,
  new RegExp(`^shares/${id}/versions/$`),
  /^temp\/$/,
  new RegExp(`^temp/${id}/$`),
  new RegExp(`^temp/${id}/[1-9][0-9]*/[a-f0-9]{32}/$`),
  /^share-receipts\/$/,
  /^share-rate-limit\/v1\/$/,
];
const valid = (value, patterns) =>
  typeof value === 'string' && patterns.some(pattern => pattern.test(value));
const path = value => {
  if (!valid(value, objectPaths)) throw new ShareError('INVALID_STORAGE_PATH');
  return value;
};
const prefix = value => {
  if (!valid(value, prefixes)) throw new ShareError('INVALID_STORAGE_PATH');
  return value;
};
const storageError = error => {
  if (error instanceof ShareError) return error;
  if (error instanceof BlobPreconditionFailedError) return new ShareError('CONFLICT');
  return new ShareError('STORAGE_ERROR');
};
const contentType = pathname =>
  pathname.endsWith('.webp') ? 'image/webp' : 'application/json';

export function createPrivateShareBlobStore({
  token = process.env.BLOB_READ_WRITE_TOKEN,
  client = { del, get, list, put },
} = {}) {
  if (typeof token !== 'string' || !token)
    throw new ShareError('NOT_CONFIGURED');
  const options = { token };
  return {
    async get(pathname) {
      try {
        const result = await client.get(path(pathname), {
          ...options,
          access: 'private',
          useCache: false,
        });
        if (!result) return null;
        return {
          body: Buffer.from(await new Response(result.stream).arrayBuffer()),
          contentType: result.blob.contentType,
          etag: result.blob.etag,
          uploadedAt: result.blob.uploadedAt.getTime(),
        };
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw storageError(error);
      }
    },
    async put(pathname, body, { contentType: type, ifMatch, ifNoneMatch } = {}) {
      if ((ifMatch !== undefined) === Boolean(ifNoneMatch))
        throw new ShareError('INVALID_STORAGE_WRITE');
      try {
        const result = await client.put(path(pathname), Buffer.from(body), {
          ...options,
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: ifMatch !== undefined,
          cacheControlMaxAge: 60,
          contentType: type,
          ...(ifMatch !== undefined ? { ifMatch } : {}),
        });
        return {
          body: Buffer.from(body),
          contentType: type,
          etag: result.etag,
          uploadedAt: Date.now(),
        };
      } catch (error) {
        throw storageError(error);
      }
    },
    async delete(pathname) {
      try {
        await client.del(path(pathname), options);
      } catch (error) {
        if (!(error instanceof BlobNotFoundError)) throw storageError(error);
      }
    },
    async list(pathPrefix) {
      const requested = prefix(pathPrefix);
      const items = [];
      let cursor;
      try {
        do {
          const page = await client.list({
            ...options,
            cursor,
            limit: 1000,
            prefix: requested,
          });
          for (const blob of page.blobs) {
            items.push({
              path: path(blob.pathname),
              contentType: contentType(blob.pathname),
              etag: blob.etag,
              size: blob.size,
              uploadedAt: blob.uploadedAt.getTime(),
            });
          }
          cursor = page.hasMore ? page.cursor : undefined;
          if (page.hasMore && !cursor) throw new ShareError('STORAGE_ERROR');
        } while (cursor);
        return items.sort((left, right) => left.path.localeCompare(right.path));
      } catch (error) {
        throw storageError(error);
      }
    },
  };
}

const digest = value => createHash('sha256').update(value).digest('hex');
const WINDOW_MS = 60 * 60 * 1000;
const limits = Object.freeze({
  'share-start': [1_000, 20],
  'upload-session': [5_000, 100],
  'upload-token': [5_000, 100],
  'share-publish': [1_000, 30],
  'share-manage': [2_000, 60],
});

export function createDurableShareRateLimiter({ store } = {}) {
  if (!store) throw new ShareError('NOT_CONFIGURED');
  const consume = async (action, scope, maximum, now) => {
    const pathname = `share-rate-limit/v1/${digest(`${action}:${scope}`)}.json`;
    const window = Math.floor(now / WINDOW_MS);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await store.get(pathname);
      let value;
      try {
        value = current ? JSON.parse(current.body.toString('utf8')) : null;
      } catch {
        throw new ShareError('STORAGE_ERROR');
      }
      if (
        value &&
        (value.v !== 1 ||
          !Number.isSafeInteger(value.window) ||
          !Number.isSafeInteger(value.count) ||
          value.count < 0 ||
          value.window > window)
      )
        throw new ShareError('STORAGE_ERROR');
      const count = value?.window === window ? value.count : 0;
      if (count >= maximum) throw new ShareError('RATE_LIMITED');
      try {
        await store.put(
          pathname,
          Buffer.from(JSON.stringify({ v: 1, window, count: count + 1 })),
          {
            contentType: 'application/json',
            ...(current ? { ifMatch: current.etag } : { ifNoneMatch: true }),
          },
        );
        return;
      } catch (error) {
        if (!(error instanceof ShareError) || error.code !== 'CONFLICT')
          throw error;
      }
    }
    throw new ShareError('STORAGE_ERROR');
  };
  return {
    async check(action, caller = 'anonymous', now = Date.now()) {
      const configured = limits[action];
      if (!configured) throw new ShareError('STORAGE_ERROR');
      await consume(action, digest(caller).slice(0, 2), configured[1], now);
      await consume(action, 'global', configured[0], now);
    },
  };
}
