import { expect, test } from 'vitest';
import {
  createDraftStorage,
  type DraftBinaryStore,
  type DraftMetadata,
} from './draft-storage';

function stores() {
  const values = new Map<string, string>();
  type Stored = NonNullable<Awaited<ReturnType<DraftBinaryStore['load']>>>;
  const stored = new Map<string, Stored>();
  let latest: string | null = null;
  const local = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const binary: DraftBinaryStore = {
    clear: async () => {
      stored.clear();
      latest = null;
    },
    load: async (revision) => stored.get(revision) ?? null,
    prune: async (keepRevision) => {
      for (const revision of stored.keys())
        if (revision !== keepRevision) stored.delete(revision);
      latest = stored.has(keepRevision) ? keepRevision : null;
    },
    remove: async (revision) => {
      stored.delete(revision);
      if (latest === revision) latest = [...stored.keys()].at(-1) ?? null;
    },
    save: async (value) => {
      stored.set(value.revision, value);
      latest = value.revision;
    },
  };
  return {
    binary,
    local,
    readBinary: () => (latest ? (stored.get(latest) ?? null) : null),
    readBinaryRevisions: () => [...stored.keys()],
    readLocal: () => [...values.values()][0] ?? null,
    replaceBinary: (value: Stored | null) => {
      stored.clear();
      if (value) stored.set(value.revision, value);
      latest = value?.revision ?? null;
    },
    replaceLocal: (value: string) => {
      values.set('gyeol.editor.draft.v1', value);
    },
  };
}

const metadata = (): DraftMetadata => ({
  draft: null,
  order: ['photo-2', 'photo-1', 'photo-3'],
  original: null,
  originalOutput: null,
  photoIds: ['photo-1', 'photo-2', 'photo-3'],
  profileReference: {
    displayName: 'Diego',
    profileImageUrl: 'https://example.com/profile.webp',
    username: 'jangwon_diego_yoon',
  },
  prompt: '초록빛 흐름으로',
});
const images = () =>
  new Map(
    metadata().photoIds.map((id) => [
      id,
      new Blob([`private-binary-${id}`], { type: 'image/webp' }),
    ]),
  );

test('stores only metadata locally and restores matching WebP blobs', async () => {
  const memory = stores();
  const storage = createDraftStorage(
    memory.local,
    memory.binary,
    () => 'revision-1',
  );
  await storage.save(metadata(), images());
  storage.saveMetadata({ ...metadata(), prompt: '바뀐 프롬프트' });

  expect(memory.readLocal()).not.toContain('private-binary');
  expect(memory.readLocal()).not.toContain('data:image');
  expect(memory.readLocal()).not.toContain('blob:');
  const restored = await storage.load();
  expect(restored).toMatchObject({
    order: ['photo-2', 'photo-1', 'photo-3'],
    photoIds: ['photo-1', 'photo-2', 'photo-3'],
    prompt: '바뀐 프롬프트',
  });
  expect(restored?.images.get('photo-1')).toMatchObject({
    size: 22,
    type: 'image/webp',
  });
});

test('failed metadata commit restores the previous complete draft', async () => {
  const memory = stores();
  let failNextWrite = false;
  let revision = 0;
  const storage = createDraftStorage(
    {
      ...memory.local,
      setItem: (key, value) => {
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error('quota');
        }
        memory.local.setItem(key, value);
      },
    },
    memory.binary,
    () => `revision-${++revision}`,
  );
  await storage.save(metadata(), images());
  failNextWrite = true;
  await expect(
    storage.save({ ...metadata(), prompt: '잃으면 안 되는 새 값' }, images()),
  ).rejects.toThrow('quota');
  expect(await storage.load()).toMatchObject({
    prompt: '초록빛 흐름으로',
  });
});

test('load waits for an in-flight revision commit', async () => {
  const memory = stores();
  const commit = Promise.withResolvers<void>();
  let saves = 0;
  const storage = createDraftStorage(
    memory.local,
    {
      ...memory.binary,
      save: async (value) => {
        saves++;
        if (saves === 2) await commit.promise;
        await memory.binary.save(value);
      },
    },
    () => `revision-${saves + 1}`,
  );
  await storage.save(metadata(), images());

  const saving = storage.save(
    { ...metadata(), prompt: '완전히 커밋된 값' },
    images(),
  );
  const loading = storage.load();
  commit.resolve();

  await saving;
  expect(await loading).toMatchObject({ prompt: '완전히 커밋된 값' });
});

test('load prunes orphaned image revisions', async () => {
  const memory = stores();
  const storage = createDraftStorage(
    memory.local,
    memory.binary,
    () => 'current',
    (task) => task(),
  );
  await storage.save(metadata(), images());
  await memory.binary.save({
    images: [...images()].map(([photoId, blob]) => ({ blob, photoId })),
    revision: 'orphan',
  });

  expect(await storage.load()).not.toBeNull();
  expect(memory.readBinaryRevisions()).toEqual(['current']);
});

test('a shared lock protects an in-flight revision from another tab', async () => {
  const memory = stores();
  const commit = Promise.withResolvers<void>();
  let lockQueue = Promise.resolve();
  let revision = 0;
  let saves = 0;
  const lock = <T>(task: () => Promise<T>) => {
    const operation = lockQueue.then(task);
    lockQueue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  };
  const binary: DraftBinaryStore = {
    ...memory.binary,
    save: async (value) => {
      saves++;
      if (saves === 2) await commit.promise;
      await memory.binary.save(value);
    },
  };
  const firstTab = createDraftStorage(
    memory.local,
    binary,
    () => `revision-${++revision}`,
    lock,
  );
  const secondTab = createDraftStorage(
    memory.local,
    binary,
    () => `revision-${++revision}`,
    lock,
  );
  await firstTab.save(metadata(), images());

  const saving = secondTab.save(
    { ...metadata(), prompt: '다른 탭의 새 값' },
    images(),
  );
  const loading = firstTab.load();
  commit.resolve();

  await saving;
  expect(await loading).toMatchObject({ prompt: '다른 탭의 새 값' });
});

test('clear keeps metadata when image deletion fails so it can be retried', async () => {
  const memory = stores();
  let fail = false;
  const storage = createDraftStorage(memory.local, {
    ...memory.binary,
    clear: async () => {
      if (fail) {
        fail = false;
        throw new Error('indexeddb unavailable');
      }
      await memory.binary.clear();
    },
  });
  await storage.save(metadata(), images());
  fail = true;

  await expect(storage.clear()).rejects.toThrow('indexeddb unavailable');
  expect(memory.readLocal()).not.toBeNull();
  expect(memory.readBinary()).not.toBeNull();
  await storage.clear();
  expect(memory.readLocal()).toBeNull();
  expect(memory.readBinary()).toBeNull();
});

test('clears both stores when either side is corrupt or mismatched', async () => {
  const memory = stores();
  const storage = createDraftStorage(
    memory.local,
    memory.binary,
    () => 'revision-1',
  );
  await storage.save(metadata(), images());
  memory.replaceLocal('{broken');
  expect(await storage.load()).toBeNull();
  expect(memory.readLocal()).toBeNull();
  expect(memory.readBinary()).toBeNull();

  await storage.save(metadata(), images());
  const saved = memory.readBinary();
  if (!saved) throw new Error('Expected saved images');
  memory.replaceBinary({ ...saved, revision: 'different' });
  expect(await storage.load()).toBeNull();
  expect(memory.readLocal()).toBeNull();
  expect(memory.readBinary()).toBeNull();
});

test('rejects non-WebP bytes and explicit clear removes both stores', async () => {
  const memory = stores();
  const storage = createDraftStorage(memory.local, memory.binary);
  const invalid = images();
  invalid.set('photo-2', new Blob(['jpeg'], { type: 'image/jpeg' }));
  await expect(storage.save(metadata(), invalid)).rejects.toThrow(
    'Invalid draft image',
  );
  expect(memory.readLocal()).toBeNull();
  expect(memory.readBinary()).toBeNull();

  const oversized = images();
  oversized.set(
    'photo-2',
    new Blob([new Uint8Array(3_000_001)], { type: 'image/webp' }),
  );
  await expect(storage.save(metadata(), oversized)).rejects.toThrow(
    'Invalid draft image',
  );
  expect(memory.readLocal()).toBeNull();
  expect(memory.readBinary()).toBeNull();

  await storage.save(metadata(), images());
  await storage.clear();
  expect(memory.readLocal()).toBeNull();
  expect(memory.readBinary()).toBeNull();
});
