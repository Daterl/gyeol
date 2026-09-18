import { expect, test } from 'vitest';
import type { F3Export } from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';
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
  return { storage, binary, raw: () => raw };
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
  store.getState().setIncluded(second, false);
  store.getState().setCrop(first, { x: 70, y: 25 });
  store.getState().setProfileSharing(true);
  const confirmed = store.getState().confirmCuration();
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

test('optional display fields validate before restore and public confirmation rejects internal metadata', async () => {
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
  const metadata = { curation, crops, excluded, confirmed, profileSharing };
  const photoIds = photos.map((photo) => photo.photo_id);
  const valid = JSON.parse(JSON.stringify(metadata));
  valid.curation.profile.display = {
    username: 'public_example',
    display_name: 'Public Name',
    name_source: 'apify.ownerFullName',
  };
  valid.confirmed.profile = {
    source_url: curation?.profile.source_url,
    username: 'public_example',
    collected_at: curation?.profile.collected_at,
    display_name: 'Public Name',
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
      value.confirmed.profile.display_name = 'x'.repeat(101);
    },
    (value: typeof valid) => {
      value.confirmed.profile.display_name = 'control\u0000';
    },
    (value: typeof valid) => {
      value.confirmed.profile.username = {};
    },
    (value: typeof valid) => {
      value.confirmed.profile.snapshot_id = 'signed-internal-reference';
    },
    (value: typeof valid) => {
      delete value.confirmed.profile.collected_at;
    },
    (value: typeof valid) => {
      value.confirmed.profile.collected_at = 'whenever';
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
  expect(() =>
    validateCurationState(historical, photoIds, original),
  ).not.toThrow();
});
