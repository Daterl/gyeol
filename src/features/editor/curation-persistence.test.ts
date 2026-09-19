import { expect, test } from 'vitest';
import type { F3Export } from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';
import { migrateCurationStateOnLoad } from './curation-persistence';
import {
  canRegenerateCuration,
  createCurationEditorStore,
} from './curation-store';
import { curationFixture } from './curation-test-fixture';
import { createDraftStorage, type DraftBinaryStore } from './draft-storage';

function memoryStorage() {
  let raw: string | null = null;
  const binaries = new Map<
    string,
    NonNullable<Awaited<ReturnType<DraftBinaryStore['load']>>>
  >();
  const binary: DraftBinaryStore = {
    clear: async () => {
      binaries.clear();
    },
    load: async (revision) => binaries.get(revision) ?? null,
    prune: async () => {},
    remove: async (revision) => {
      binaries.delete(revision);
    },
    save: async (value) => {
      binaries.set(value.revision, value);
    },
  };
  const storage = createDraftStorage(
    {
      getItem: () => raw,
      setItem: (_key, value) => {
        raw = value;
      },
      removeItem: () => {
        raw = null;
      },
    },
    binary,
  );
  return {
    storage,
    binary,
    raw: () => raw,
    replaceRaw: (value: string) => {
      raw = value;
    },
  };
}

async function ready(storage: ReturnType<typeof memoryStorage>['storage']) {
  const store = createCurationEditorStore(storage);
  store.setState({
    photos: fixture.context.photos.map((photo) => ({
      photo_id: photo.photo_id,
      file: new File(['webp'], `${photo.photo_id}.webp`, {
        type: 'image/webp',
      }),
      url: `blob:${photo.photo_id}`,
    })),
  });
  await store.getState().loadCuration(async () => curationFixture());
  await store.getState().generate(undefined, async () => ({
    output: structuredClone(fixture.all_omitted) as F3Export,
  }));
  return store;
}
const persist = (store: ReturnType<typeof createCurationEditorStore>) =>
  store
    .getState()
    .persistDraft(
      new Map(
        store.getState().photos.map((photo) => [photo.photo_id, photo.file]),
      ),
    );

test('G3 round trip restores all curation edits, normalized photos and detached frozen confirmation', async () => {
  const { storage, raw } = memoryStorage();
  const store = await ready(storage);
  const [first, second] = store.getState().order;
  store.getState().setPrompt('saved prompt');
  store.getState().setProfileReference({
    username: 'public_example',
    displayName: 'public_example',
    profileImageUrl: null,
  });
  store.getState().editTitle('edited title');
  store.getState().editCaption(first, 'edited caption');
  store.getState().movePhoto(first, 1);
  store.getState().setCrop(first, { x: 70, y: 25 });
  store.getState().setProfileSharing(true);
  const confirmed = store.getState().confirmCuration();
  store.getState().setIncluded(second, false);
  await persist(store);
  store.getState().editTitle('unconfirmed edit');
  await persist(store);
  expect(raw()).not.toContain('blob:');
  const restored = createCurationEditorStore(storage);
  expect(await restored.getState().restoreDraft()).toBe(true);
  for (const key of [
    'draft',
    'order',
    'curation',
    'excluded',
    'crops',
    'profileSharing',
    'prompt',
    'profileReference',
    'confirmed',
  ] as const)
    expect(restored.getState()[key]).toEqual(store.getState()[key]);
  expect(
    restored
      .getState()
      .photos.every((photo) => photo.file.type === 'image/webp'),
  ).toBe(true);
  expect(restored.getState().confirmed).not.toBe(confirmed);
  expect(Object.isFrozen(restored.getState().confirmed?.output.slots[0])).toBe(
    true,
  );
  expect(Object.isFrozen(restored.getState().confirmed?.crops[first])).toBe(
    true,
  );
  expect(canRegenerateCuration(restored.getState().curation, null)).toBe(false);
  restored.getState().editCaption(first, 'later');
  expect(restored.getState().confirmed).toEqual(confirmed);
  await restored.getState().clearDraft();
  expect(await storage.load()).toBeNull();
  expect(restored.getState().confirmed).toBeNull();
});

test('load-only migration drops a legacy confirmation while preserving edits and WebP revision', async () => {
  const memory = memoryStorage();
  const store = await ready(memory.storage);
  const first = store.getState().order[0];
  store.getState().editTitle('legacy title');
  store.getState().editCaption(first, 'legacy caption');
  store.getState().setCrop(first, { x: 25, y: 75 });
  store.getState().setProfileSharing(true);
  store.getState().confirmCuration();
  await persist(store);

  const current = JSON.parse(memory.raw() ?? 'null');
  const legacy = structuredClone(current);
  delete legacy.curationState.confirmed.profileSnapshotId;
  legacy.curationState.confirmed.profile = {
    source_url: 'https://www.instagram.com/public_example/',
    username: 'public_example',
    collected_at: '2026-09-18T10:00:00Z',
  };
  legacy.curationState.confirmed.output.slots =
    legacy.curationState.confirmed.output.slots.slice(0, 2);
  const legacyIds = legacy.curationState.confirmed.output.slots.map(
    (slot: { photo_id: string }) => slot.photo_id,
  );
  legacy.curationState.confirmed.crops = Object.fromEntries(
    Object.entries(legacy.curationState.confirmed.crops).filter(([id]) =>
      legacyIds.includes(id),
    ),
  );
  const legacyRaw = JSON.stringify(legacy);
  memory.replaceRaw(legacyRaw);

  const restored = createCurationEditorStore(memory.storage);
  expect(await restored.getState().restoreDraft()).toBe(true);
  expect(restored.getState()).toMatchObject({
    confirmed: null,
    crops: { [first]: { x: 25, y: 75 } },
    profileSharing: true,
  });
  expect(restored.getState().curation).toEqual(store.getState().curation);
  expect(restored.getState().draft).toEqual(store.getState().draft);
  expect(restored.getState().photos).toHaveLength(3);
  expect(memory.raw()).toBe(legacyRaw);

  restored.getState().editTitle('settled current schema');
  await persist(restored);
  const settled = JSON.parse(memory.raw() ?? 'null');
  expect(settled.revision).toBe(current.revision);
  expect(settled.curationState).toMatchObject({
    confirmed: null,
    profileSharing: true,
  });
  expect('confirmedProfileSource' in settled.curationState).toBe(false);
  expect(settled.draft.title).toBe('settled current schema');
  const settledImages = await memory.binary.load(settled.revision);
  expect(settledImages?.images).toHaveLength(3);
  expect(
    settledImages?.images.every(
      ({ blob }) => blob.type === 'image/webp' && blob.size === 4,
    ),
  ).toBe(true);
});

test('load migration recognizes the old photo minimum and snake-case profile independently', async () => {
  const store = await ready(memoryStorage().storage);
  store.getState().setProfileSharing(true);
  store.getState().confirmCuration();
  const state = {
    curation: store.getState().curation,
    crops: store.getState().crops,
    excluded: store.getState().excluded,
    profileSharing: store.getState().profileSharing,
    confirmed: store.getState().confirmed,
  };
  const tooFew = structuredClone(state);
  if (!tooFew.confirmed) throw new Error('Expected confirmation');
  delete tooFew.confirmed.profileSnapshotId;
  tooFew.confirmed.profileSharing = false;
  tooFew.confirmed.output.slots = tooFew.confirmed.output.slots.slice(0, 2);
  const tooFewIds = tooFew.confirmed.output.slots.map((slot) => slot.photo_id);
  tooFew.confirmed.crops = Object.fromEntries(
    Object.entries(tooFew.confirmed.crops).filter(([id]) =>
      tooFewIds.includes(id),
    ),
  );
  expect(migrateCurationStateOnLoad(tooFew)).toMatchObject({
    confirmed: null,
  });

  const snakeCase = structuredClone(state);
  if (!snakeCase.confirmed) throw new Error('Expected confirmation');
  delete snakeCase.confirmed.profileSnapshotId;
  (snakeCase.confirmed as unknown as Record<string, unknown>).profile = {
    source_url: 'https://www.instagram.com/public_example/',
    username: 'public_example',
    collected_at: '2026-09-18T10:00:00Z',
  };
  expect(migrateCurationStateOnLoad(snakeCase)).toMatchObject({
    confirmed: null,
  });

  const camelCase = structuredClone(state) as typeof state & {
    confirmedProfileSource?: Record<string, unknown>;
  };
  if (!camelCase.confirmed) throw new Error('Expected confirmation');
  delete camelCase.confirmed.profileSnapshotId;
  (camelCase.confirmed as unknown as Record<string, unknown>).profile = {
    username: 'public_example',
    displayName: null,
    avatarUrl: null,
    source: 'https://www.instagram.com/public_example/',
    collectedAt: '2026-09-18T10:00:00Z',
  };
  camelCase.confirmedProfileSource = {
    username: 'public_example',
    displayName: null,
    nameSource: null,
    source: 'https://www.instagram.com/public_example/',
    collectedAt: '2026-09-18T10:00:00Z',
  };
  const migratedCamel = migrateCurationStateOnLoad(camelCase);
  expect(migratedCamel).toMatchObject({ confirmed: null });
  expect(migratedCamel).not.toHaveProperty('confirmedProfileSource');
});

test('legacy markers cannot hide separate confirmation corruption', async () => {
  const memory = memoryStorage();
  const store = await ready(memory.storage);
  store.getState().setProfileSharing(true);
  store.getState().confirmCuration();
  await persist(store);

  const current = JSON.parse(memory.raw() ?? 'null');
  const revision = current.revision as string;
  const corrupted = structuredClone(current);
  delete corrupted.curationState.confirmed.profileSnapshotId;
  corrupted.curationState.confirmed.output.slots =
    corrupted.curationState.confirmed.output.slots.slice(0, 2);
  corrupted.curationState.confirmed.profile = { username: 42 };
  memory.replaceRaw(JSON.stringify(corrupted));

  expect(await memory.storage.load()).toBeNull();
  expect(memory.raw()).toBeNull();
  expect(await memory.binary.load(revision)).toBeNull();
});

test('failed binary reads preserve a valid persisted draft for retry', async () => {
  const memory = memoryStorage();
  const store = await ready(memory.storage);
  await persist(store);
  const saved = memory.raw();
  const load = memory.binary.load;
  memory.binary.load = async () => {
    throw Error('temporary read failure');
  };
  await expect(memory.storage.load()).rejects.toThrow('temporary read failure');
  expect(memory.raw()).toBe(saved);
  memory.binary.load = load;
  expect(await memory.storage.load()).not.toBeNull();
});

test('failed save and invalid adapter edits leave the last valid revision intact', async () => {
  const memory = memoryStorage();
  const store = await ready(memory.storage);
  store.getState().confirmCuration();
  await persist(store);
  const saved = memory.raw();
  store.setState({ crops: { invalid: { x: 50, y: 50 } } });
  await expect(persist(store)).rejects.toThrow('Invalid curation edits');
  expect(memory.raw()).toBe(saved);
  expect(
    (await memory.storage.load())?.curationState?.confirmed,
  ).not.toBeNull();
});

test('a late restore after reset cannot restore curation metadata or confirmation', async () => {
  const memory = memoryStorage();
  const store = await ready(memory.storage);
  store.getState().confirmCuration();
  await persist(store);
  const saved = await memory.storage.load();
  const deferred = Promise.withResolvers<typeof saved>();
  const restored = createCurationEditorStore({
    ...memory.storage,
    load: () => deferred.promise,
  });
  const pending = restored.getState().restoreDraft();
  await restored.getState().clearDraft();
  deferred.resolve(saved);
  expect(await pending).toBe(false);
  expect(restored.getState().confirmed).toBeNull();
  expect(restored.getState().curation).toBeNull();
  expect(restored.getState().photos).toEqual([]);
});

test('optional display fields validate before restore and confirmation stores only a server reference', async () => {
  const { validateCurationState } = await import('./curation-persistence');
  const store = await ready(memoryStorage().storage);
  store.getState().setProfileSharing(true);
  store.getState().confirmCuration();
  const {
    curation,
    crops,
    excluded,
    confirmed,
    profileSharing,
    original,
    photos,
  } = store.getState();
  const metadata = {
    curation,
    crops,
    excluded,
    confirmed,
    profileSharing,
  };
  const photoIds = photos.map((photo) => photo.photo_id);
  const valid = JSON.parse(JSON.stringify(metadata));
  valid.curation.profile.display = {
    username: 'public_example',
    display_name: 'Public Name',
    name_source: 'apify.ownerFullName',
  };
  expect(() => validateCurationState(valid, photoIds, original)).not.toThrow();
  for (const mutate of [
    (value: typeof valid) => {
      value.curation.profile.display.display_name = { bad: 'React child' };
    },
    (value: typeof valid) => {
      value.curation.profile.display.username = 'different_account';
    },
    (value: typeof valid) => {
      value.curation.profile.display.name_source = 'guessed';
    },
    (value: typeof valid) => {
      delete value.curation.profile.display.name_source;
    },
    (value: typeof valid) => {
      value.confirmed.profileSnapshotId = ' ';
    },
    (value: typeof valid) => {
      value.confirmed.profileSnapshotId = 'x'.repeat(2049);
    },
    (value: typeof valid) => {
      delete value.confirmed.profileSnapshotId;
    },
    (value: typeof valid) => {
      value.confirmed.profile = {
        username: 'public_example',
        displayName: 'Injected Name',
        avatarUrl: 'https://cdn.example/arbitrary-avatar.jpg',
        source: 'https://www.instagram.com/public_example/',
        collectedAt: '2026-09-18T10:00:00Z',
      };
    },
    (value: typeof valid) => {
      value.confirmed.username = 'public_example';
    },
    (value: typeof valid) => {
      value.confirmed.avatarUrl = null;
    },
    (value: typeof valid) => {
      value.confirmed.evidence = ['internal'];
    },
    (value: typeof valid) => {
      value.confirmed.output.slots[0].signed_ref = 'internal';
    },
    (value: typeof valid) => {
      value.confirmed.crops[photoIds[0]].evidence = 'internal';
    },
  ]) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    expect(() => validateCurationState(invalid, photoIds, original)).toThrow();
  }
  const historical = structuredClone(valid);
  const previousId = historical.confirmed.output.slots[0].photo_id;
  historical.confirmed.output.slots[0].photo_id = 'older-photo';
  historical.confirmed.crops['older-photo'] =
    historical.confirmed.crops[previousId];
  delete historical.confirmed.crops[previousId];
  historical.curation.profile_snapshot_id = 'new-reference';
  historical.curation.profile.source_url = 'https://www.instagram.com/another/';
  historical.curation.profile.display = { username: 'another' };
  historical.curation.profile.collected_at = '2026-09-18T11:00:00Z';
  expect(() =>
    validateCurationState(historical, photoIds, original),
  ).not.toThrow();

  const missingProfile = structuredClone(valid);
  delete missingProfile.confirmed.profileSnapshotId;
  expect(() =>
    validateCurationState(missingProfile, photoIds, original),
  ).toThrow('Invalid confirmed profile reference');
  const unexpectedProfile = structuredClone(valid);
  unexpectedProfile.confirmed.profileSharing = false;
  expect(() =>
    validateCurationState(unexpectedProfile, photoIds, original),
  ).toThrow('Invalid confirmed profile reference');
  const extraLocalIdentity = structuredClone(valid);
  extraLocalIdentity.confirmedProfileSource = null;
  expect(() =>
    validateCurationState(extraLocalIdentity, photoIds, original),
  ).toThrow();
  const tooFew = structuredClone(valid);
  tooFew.confirmed.output.slots = tooFew.confirmed.output.slots.slice(0, 2);
  expect(() => validateCurationState(tooFew, photoIds, original)).toThrow(
    'Invalid confirmation',
  );
  const sharingWithoutCuration = {
    confirmed: null,
    crops: {},
    curation: null,
    excluded: [],
    profileSharing: true,
  };
  expect(() =>
    validateCurationState(sharingWithoutCuration, photoIds, original),
  ).toThrow('Invalid shared profile state');
});
