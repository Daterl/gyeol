// Server-only adapter for the Vercel Blob REST protocol. See the pinned sources
// and live-verification boundary in docs/specs/143-profile-cache/report.md.
export const PROFILE_CACHE_PREFIX = 'profile-cache/v1/';
const NAMESPACES = new Set(['profile-cache', 'profile-request-limit']);
const API = 'https://vercel.com/api/blob';

export class ProfileStorageError extends Error {
  constructor(code = 'STORAGE_ERROR') { super(code); this.name = 'ProfileStorageError'; this.code = code; }
}

export function createPrivateBlobStorage({ token = process.env.BLOB_READ_WRITE_TOKEN, fetchImpl = fetch, timeoutMs = 10000, namespace = 'profile-cache' } = {}) {
  const storeId = typeof token === 'string' ? token.split('_')[3] : '';
  if (!token?.startsWith('vercel_blob_rw_') || !/^[a-zA-Z0-9]+$/.test(storeId ?? '')) throw new ProfileStorageError('NOT_CONFIGURED');
  if (!NAMESPACES.has(namespace)) throw new ProfileStorageError('INVALID_STORAGE_PATH');
  const prefix = `${namespace}/v1/`;
  const path = value => {
    if (typeof value !== 'string' || !value.startsWith(prefix) || !/^[a-f0-9]{64}\.json$/.test(value.slice(prefix.length))) throw new ProfileStorageError('INVALID_STORAGE_PATH');
    return value;
  };
  async function request(url, init = {}) {
    try {
      return await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'x-api-version': '12',
        'x-vercel-blob-store-id': storeId, 'Accept-Encoding': 'identity', ...init.headers },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    } catch { throw new ProfileStorageError(); }
  }
  async function json(response) {
    try { return await response.json(); } catch { throw new ProfileStorageError(); }
  }
  return {
    async read(key) {
      const response = await request(`https://${storeId.toLowerCase()}.private.blob.vercel-storage.com/${path(key)}?cache=0`);
      if (response.status === 404) return null;
      if (!response.ok) throw new ProfileStorageError();
      const etag = response.headers.get('etag');
      if (!etag) throw new ProfileStorageError();
      return { value: await json(response), etag };
    },
    // null is a definite precondition conflict. Unknown write outcomes throw;
    // callers must never interpret network errors as ownership of a reservation.
    async write(key, value, { ifMatch } = {}) {
      if (ifMatch !== undefined && (typeof ifMatch !== 'string' || !ifMatch)) throw new ProfileStorageError();
      const response = await request(`${API}/?${new URLSearchParams({ pathname: path(key) })}`, {
        method: 'PUT', body: JSON.stringify(value), headers: {
          'content-type': 'application/json', 'x-content-type': 'application/json', 'x-vercel-blob-access': 'private',
          'x-add-random-suffix': '0', 'x-allow-overwrite': ifMatch ? '1' : '0',
          ...(ifMatch ? { 'x-if-match': ifMatch } : {}),
        },
      });
      if (!response.ok) {
        const body = await json(response);
        if (body?.error?.code === 'precondition_failed') return null;
        throw new ProfileStorageError();
      }
      const result = await json(response);
      if (!result.etag || result.pathname !== key) throw new ProfileStorageError();
      return { value, etag: result.etag };
    },
    async list({ cursor } = {}) {
      const query = new URLSearchParams({ prefix, limit: '1000', ...(cursor ? { cursor } : {}) });
      const response = await request(`${API}?${query}`);
      if (!response.ok) throw new ProfileStorageError();
      const result = await json(response);
      if (!Array.isArray(result.blobs) || typeof result.hasMore !== 'boolean' || (result.hasMore && !result.cursor)) throw new ProfileStorageError();
      return { keys: result.blobs.map(blob => path(blob.pathname)), cursor: result.hasMore ? result.cursor : null };
    },
  };
}
