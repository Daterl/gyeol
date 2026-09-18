import { isCollectedAtInstant } from '../editor/curation-persistence';
import type { ConfirmedCuration } from '../editor/curation-store';
import {
  type PublicShare,
  type PublicShareProfile,
  parsePublicShare,
} from './public-share';

export class ShareApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
    this.name = 'ShareApiError';
  }
}

export type ShareCurationPhoto = {
  caption?: string;
  focalPoint?: { x: number; y: number };
  id: string;
};
export type ShareCuration =
  | { includeProfile: false; photos: ShareCurationPhoto[] }
  | {
      includeProfile: true;
      photos: ShareCurationPhoto[];
      profile: PublicShareProfile;
    };

/**
 * G5 confirmation -> G6 curation payload.
 *
 * The collection time is taken only from the profile evidence frozen into this
 * confirmation, never from the live editor state, so a later reconnection can
 * not backdate or advance an already confirmed share. A confirmation made before
 * that evidence was bound carries no collection time, so it is refused here and
 * has to be confirmed again. No avatar is verified anywhere in the pipeline, so
 * it stays null, and sharing off drops the whole profile rather than emitting
 * empty fields.
 */
export function toShareCuration(confirmed: ConfirmedCuration): ShareCuration {
  const photos = confirmed.output.slots.map((slot) => {
    const crop = confirmed.crops[slot.photo_id];
    return {
      id: slot.photo_id,
      ...(slot.caption_state !== 'omitted' && slot.text
        ? { caption: slot.text }
        : {}),
      ...(crop ? { focalPoint: { x: crop.x / 100, y: crop.y / 100 } } : {}),
    };
  });
  if (!confirmed.profileSharing || !confirmed.profile)
    return { includeProfile: false, photos };
  const { collected_at, display_name, source_url, username } =
    confirmed.profile;
  if (!isCollectedAtInstant(collected_at))
    throw new ShareApiError('INVALID_INPUT');
  return {
    includeProfile: true,
    photos,
    profile: {
      avatarUrl: null,
      collectedAt: collected_at,
      displayName: display_name ?? null,
      source: source_url,
      username,
    },
  };
}

export type SharePhoto = { body: Uint8Array; id: string };
export type UploadSession = {
  constraints: {
    contentType: 'image/webp';
    maxFileBytes: number;
    maxFiles: number;
    maxTotalBytes: number;
  };
  expiresAt: number;
  photoIds: string[];
  prefix: string;
  sessionId: string;
  shareId: string;
  uploadToken: string;
  version: number;
};
/** G8 supplies the durable transport; image bytes never pass through the JSON route. */
export type PhotoUploader = (upload: {
  photo: SharePhoto;
  receipt: string;
  session: UploadSession;
}) => Promise<void>;
type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const hex = async (body: Uint8Array) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    body.slice().buffer as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export function createShareClient({
  fetcher = fetch,
  uploadPhoto,
}: {
  fetcher?: Fetcher;
  uploadPhoto: PhotoUploader;
}) {
  const call = async (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) => {
    let response: Response;
    try {
      response = await fetcher(path, {
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...headers },
        method: 'POST',
      });
    } catch {
      throw new ShareApiError('NETWORK_ERROR');
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const error =
        payload && typeof payload === 'object'
          ? (payload as { error?: { code?: unknown } }).error
          : undefined;
      throw new ShareApiError(
        typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
        response.status,
      );
    }
    return {
      etag: response.headers.get('etag') ?? undefined,
      value: payload as Record<string, unknown>,
    };
  };
  const auth = (managementKey: string) => ({
    Authorization: `Bearer ${managementKey}`,
  });
  const manifest = (photos: SharePhoto[]) =>
    Promise.all(
      photos.map(async (photo) => ({
        id: photo.id,
        sha256: await hex(photo.body),
      })),
    );
  const ordered = (curation: ShareCuration, photos: SharePhoto[]) => {
    if (
      photos.length !== curation.photos.length ||
      curation.photos.some((photo, index) => photo.id !== photos[index]?.id)
    )
      throw new ShareApiError('INVALID_INPUT');
  };
  const send = async (
    receipt: string,
    photos: SharePhoto[],
    curation: ShareCuration,
    managementKey: string,
    ifMatch?: string,
  ) => {
    const { value } = await call('/api/share-upload', {
      action: 'session',
      receipt,
    });
    const session = value as unknown as UploadSession;
    for (const photo of photos) await uploadPhoto({ photo, receipt, session });
    const published = await call(
      '/api/share-upload',
      {
        action: 'publish',
        curation,
        receipt,
        uploadToken: session.uploadToken,
      },
      { ...auth(managementKey), ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
    );
    return published.value as {
      etag: string;
      shareId: string;
      version: number;
    };
  };
  return {
    /** Re-read the current share and its ETag after a CONFLICT instead of overwriting. */
    async read(shareId: string) {
      let response: Response;
      try {
        response = await fetcher(`/api/share/${encodeURIComponent(shareId)}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
      } catch {
        throw new ShareApiError('NETWORK_ERROR');
      }
      if (!response.ok) throw new ShareApiError('NOT_FOUND', response.status);
      const share = parsePublicShare(await response.json(), shareId);
      if (!share) throw new ShareApiError('INVALID_RESPONSE', response.status);
      return {
        etag: response.headers.get('etag') ?? undefined,
        share: share as PublicShare,
      };
    },
    async publish({
      confirmed,
      photos,
    }: {
      confirmed: ConfirmedCuration;
      photos: SharePhoto[];
    }) {
      const curation = toShareCuration(confirmed);
      ordered(curation, photos);
      const { value } = await call('/api/share-upload', {
        action: 'start',
        photos: await manifest(photos),
      });
      const started = value as unknown as {
        managementKey: string;
        receipt: string;
        shareId: string;
      };
      const published = await send(
        started.receipt,
        photos,
        curation,
        started.managementKey,
      );
      return { ...published, managementKey: started.managementKey };
    },
    async reconfirm({
      confirmed,
      etag,
      managementKey,
      photos,
      shareId,
    }: {
      confirmed: ConfirmedCuration;
      etag: string;
      managementKey: string;
      photos: SharePhoto[];
      shareId: string;
    }) {
      const curation = toShareCuration(confirmed);
      ordered(curation, photos);
      const { value } = await call(
        '/api/share-upload',
        { action: 'update', photos: await manifest(photos), shareId },
        { ...auth(managementKey), 'If-Match': etag },
      );
      const receipt = (value as { receipt: string }).receipt;
      return send(receipt, photos, curation, managementKey, etag);
    },
    async rotateKey({
      etag,
      managementKey,
      shareId,
    }: {
      etag: string;
      managementKey: string;
      shareId: string;
    }) {
      const { value } = await call(
        `/api/manage/${encodeURIComponent(shareId)}`,
        { action: 'rotate' },
        { ...auth(managementKey), 'If-Match': etag },
      );
      return value as unknown as { etag: string; managementKey: string };
    },
    async revoke({
      etag,
      managementKey,
      shareId,
    }: {
      etag: string;
      managementKey: string;
      shareId: string;
    }) {
      const { value } = await call(
        `/api/manage/${encodeURIComponent(shareId)}`,
        { action: 'revoke' },
        { ...auth(managementKey), 'If-Match': etag },
      );
      return value as unknown as { etag: string };
    },
  };
}
export type ShareClient = ReturnType<typeof createShareClient>;
