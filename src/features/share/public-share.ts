const idPattern = /^[A-Za-z0-9_-]{1,80}$/;
const usernamePattern = /^[A-Za-z0-9._]{1,30}$/;

export type PublicSharePhoto = {
  caption?: string;
  focalPoint?: { x: number; y: number };
  id: string;
};

export type PublicShareProfile = {
  avatarUrl: null | string;
  collectedAt: string;
  displayName: null | string;
  source: string;
  username: string;
};

export type PublicShare = {
  curation:
    | {
        includeProfile: false;
        photos: PublicSharePhoto[];
      }
    | {
        includeProfile: true;
        photos: PublicSharePhoto[];
        profile: PublicShareProfile;
      };
  shareId: string;
  version: number;
};

export type PublicShareLoadState =
  | { type: 'error' }
  | { type: 'ready'; share: PublicShare }
  | { type: 'unavailable' };

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAllowedAvatarUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.port === '' &&
      ['cdninstagram.com', 'fbcdn.net'].some(
        (hostname) =>
          url.hostname === hostname || url.hostname.endsWith(`.${hostname}`),
      )
    );
  } catch {
    return false;
  }
};

function parsePhoto(value: unknown): PublicSharePhoto | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  if (!idPattern.test(value.id)) return null;
  if (
    value.caption !== undefined &&
    (typeof value.caption !== 'string' || value.caption.length > 2200)
  )
    return null;
  let focalPoint: PublicSharePhoto['focalPoint'];
  if (value.focalPoint !== undefined) {
    if (
      !isRecord(value.focalPoint) ||
      typeof value.focalPoint.x !== 'number' ||
      !Number.isFinite(value.focalPoint.x) ||
      value.focalPoint.x < 0 ||
      value.focalPoint.x > 1 ||
      typeof value.focalPoint.y !== 'number' ||
      !Number.isFinite(value.focalPoint.y) ||
      value.focalPoint.y < 0 ||
      value.focalPoint.y > 1
    )
      return null;
    focalPoint = { x: value.focalPoint.x, y: value.focalPoint.y };
  }
  return {
    ...(value.caption === undefined ? {} : { caption: value.caption }),
    ...(focalPoint ? { focalPoint } : {}),
    id: value.id,
  };
}

function parseProfile(value: unknown): PublicShareProfile | null {
  if (!isRecord(value)) return null;
  const { avatarUrl, collectedAt, displayName, source, username } = value;
  if (
    !(
      avatarUrl === null ||
      (typeof avatarUrl === 'string' && avatarUrl.length <= 2048)
    ) ||
    typeof collectedAt !== 'string' ||
    Number.isNaN(Date.parse(collectedAt)) ||
    !(
      displayName === null ||
      (typeof displayName === 'string' && displayName.length <= 100)
    ) ||
    typeof source !== 'string' ||
    source.length > 2048 ||
    typeof username !== 'string' ||
    !usernamePattern.test(username)
  )
    return null;
  return {
    avatarUrl:
      typeof avatarUrl === 'string' && isAllowedAvatarUrl(avatarUrl)
        ? avatarUrl
        : null,
    collectedAt,
    displayName,
    source,
    username,
  };
}

export function parsePublicShare(
  value: unknown,
  expectedShareId: string,
): PublicShare | null {
  if (
    !isRecord(value) ||
    value.shareId !== expectedShareId ||
    typeof value.version !== 'number' ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    !isRecord(value.curation) ||
    !Array.isArray(value.curation.photos) ||
    value.curation.photos.length < 3 ||
    value.curation.photos.length > 15
  )
    return null;
  const photos = value.curation.photos.map(parsePhoto);
  if (photos.some((photo) => photo === null)) return null;
  const safePhotos = photos as PublicSharePhoto[];
  if (new Set(safePhotos.map((photo) => photo.id)).size !== safePhotos.length)
    return null;
  if (value.curation.includeProfile === false) {
    if (value.curation.profile !== undefined) return null;
    return {
      curation: { includeProfile: false, photos: safePhotos },
      shareId: expectedShareId,
      version: value.version,
    };
  }
  if (value.curation.includeProfile !== true) return null;
  const profile = parseProfile(value.curation.profile);
  if (!profile) return null;
  return {
    curation: { includeProfile: true, photos: safePhotos, profile },
    shareId: expectedShareId,
    version: value.version,
  };
}

export async function loadPublicShare(
  shareId: string,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<PublicShareLoadState> {
  if (!idPattern.test(shareId)) return { type: 'unavailable' };
  let response: Response;
  try {
    response = await fetcher(`/api/share/${encodeURIComponent(shareId)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch {
    return { type: 'error' };
  }
  if (response.status === 404 || response.status === 410)
    return { type: 'unavailable' };
  if (!response.ok) return { type: 'error' };
  try {
    const share = parsePublicShare(await response.json(), shareId);
    return share ? { type: 'ready', share } : { type: 'error' };
  } catch {
    return { type: 'error' };
  }
}

export function publicImageUrl(shareId: string, photoId: string) {
  return `/api/share/${encodeURIComponent(shareId)}/image/${encodeURIComponent(photoId)}`;
}
