import { expect, test } from 'vitest';
import {
  loadShareManagement,
  parseShareManagementTransfer,
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

test('one tab never removes a different share saved by another tab', () => {
  const storage = memoryStorage();
  const first = { ...base, etag: '"first"' } as const;
  const second = {
    ...base,
    shareId: 'another_share',
    managementKey: `${'B'.repeat(42)}A`,
    etag: '"second"',
  } as const;
  expect(saveShareManagement(storage, second)).toBe(true);
  expect(removeShareManagement(storage, first)).toBe(true);
  expect(loadShareManagement(storage).record).toEqual(second);
  expect(removeShareManagement(storage, second)).toBe(true);
  expect(loadShareManagement(storage).record).toBeNull();
});

test('management transfer accepts only a share id or public share URL with a canonical key', () => {
  const managementKey = 'A'.repeat(43);
  const expected = { shareId: 'share_id', managementKey };

  expect(parseShareManagementTransfer('share_id', managementKey)).toEqual(
    expected,
  );
  expect(
    parseShareManagementTransfer(
      'https://gyeol.example/share/share_id/',
      ` ${managementKey} `,
    ),
  ).toEqual(expected);
  expect(
    parseShareManagementTransfer('/share/share_id', managementKey),
  ).toEqual(expected);

  for (const reference of [
    'https://gyeol.example/not-share/share_id',
    'https://gyeol.example/share/share_id?managementKey=secret',
    'https://gyeol.example/share/share_id#secret',
    'https://user:secret@gyeol.example/share/share_id',
  ]) {
    expect(parseShareManagementTransfer(reference, managementKey)).toBeNull();
  }
  expect(parseShareManagementTransfer('share_id', 'not-a-key')).toBeNull();
});
