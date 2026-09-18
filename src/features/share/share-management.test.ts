import { expect, test } from 'vitest';
import {
  loadShareManagement,
  removeShareManagement,
  SHARE_MANAGEMENT_KEY,
  type ShareManagementRecord,
  saveShareManagement,
} from './share-management';

const base = {
  v: 1 as const,
  managementKey: 'A'.repeat(43),
  shareId: 'share_id',
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
}

test('publishing, active and rotating v1 records round trip exactly', () => {
  const storage = memoryStorage();
  const records: ShareManagementRecord[] = [
    { ...base, etag: null },
    { ...base, etag: '"etag"' },
    {
      ...base,
      etag: '"etag"',
      nextManagementKey: `${'B'.repeat(42)}A`,
    },
  ];
  for (const record of records) {
    expect(saveShareManagement(storage, record)).toBe(true);
    expect(loadShareManagement(storage)).toEqual({
      available: true,
      record,
    });
  }
  expect(removeShareManagement(storage)).toBe(true);
  expect(storage.getItem(SHARE_MANAGEMENT_KEY)).toBeNull();
});

test('mixed or malformed variants are removed and storage failure is contained', () => {
  const storage = memoryStorage();
  for (const record of [
    { ...base, etag: null, nextManagementKey: `${'B'.repeat(42)}A` },
    { ...base, etag: '"etag"', extra: true },
    { ...base, etag: '"etag"', managementKey: 'a'.repeat(43) },
  ]) {
    storage.setItem(SHARE_MANAGEMENT_KEY, JSON.stringify(record));
    expect(loadShareManagement(storage)).toEqual({
      available: true,
      record: null,
    });
    expect(storage.getItem(SHARE_MANAGEMENT_KEY)).toBeNull();
  }

  const unavailable = {
    ...storage,
    getItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  } satisfies Storage;
  expect(loadShareManagement(unavailable).available).toBe(false);
  expect(saveShareManagement(unavailable, { ...base, etag: null })).toBe(false);
  expect(removeShareManagement(unavailable)).toBe(false);
});
