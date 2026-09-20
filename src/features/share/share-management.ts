export const SHARE_MANAGEMENT_KEY = 'gyeol.share.management.v1';

type ManagementBase = {
  v: 1;
  shareId: string;
  managementKey: string;
};
export type ShareManagementRecord =
  | (ManagementBase & { etag: null })
  | (ManagementBase & { etag: string; nextManagementKey?: never })
  | (ManagementBase & { etag: string; nextManagementKey: string });

const token = (value: unknown) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
const shareId = (value: unknown) =>
  typeof value === 'string' &&
  /^(?!(?:__proto__|prototype|constructor)$)[A-Za-z0-9_-]{1,80}$/.test(value);

export function parseShareManagementTransfer(
  reference: string,
  managementKey: string,
) {
  const input = reference.trim();
  const key = managementKey.trim();
  if (!token(key)) return null;
  if (shareId(input)) return { shareId: input, managementKey: key };

  try {
    const url = new URL(input, 'https://gyeol.invalid');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const match = /^\/share\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) return null;
    const parsedShareId = decodeURIComponent(match[1]);
    return shareId(parsedShareId)
      ? { shareId: parsedShareId, managementKey: key }
      : null;
  } catch {
    return null;
  }
}

const valid = (value: unknown): value is ShareManagementRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort().join();
  const base =
    record.v === 1 && shareId(record.shareId) && token(record.managementKey);
  if (!base) return false;
  if (record.etag === null)
    return keys === ['etag', 'managementKey', 'shareId', 'v'].join();
  if (
    typeof record.etag !== 'string' ||
    !/^[\x21-\x7e]{1,256}$/.test(record.etag)
  )
    return false;
  return record.nextManagementKey === undefined
    ? keys === ['etag', 'managementKey', 'shareId', 'v'].join()
    : keys ===
        ['etag', 'managementKey', 'nextManagementKey', 'shareId', 'v'].join() &&
        token(record.nextManagementKey);
};

export function loadShareManagement(storage: Storage) {
  try {
    const raw = storage.getItem(SHARE_MANAGEMENT_KEY);
    if (raw === null) return { available: true, record: null } as const;
    const record: unknown = JSON.parse(raw);
    if (valid(record)) return { available: true, record } as const;
    storage.removeItem(SHARE_MANAGEMENT_KEY);
    return { available: true, record: null } as const;
  } catch {
    return { available: false, record: null } as const;
  }
}

export function saveShareManagement(
  storage: Storage,
  record: ShareManagementRecord,
) {
  try {
    if (!valid(record)) return false;
    storage.setItem(SHARE_MANAGEMENT_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function removeShareManagement(
  storage: Storage,
  expected?: { shareId: string; managementKey: string },
) {
  try {
    if (expected) {
      const raw = storage.getItem(SHARE_MANAGEMENT_KEY);
      if (raw === null) return true;
      const current: unknown = JSON.parse(raw);
      if (
        valid(current) &&
        (current.shareId !== expected.shareId ||
          current.managementKey !== expected.managementKey)
      )
        return true;
    }
    storage.removeItem(SHARE_MANAGEMENT_KEY);
    return true;
  } catch {
    return false;
  }
}
