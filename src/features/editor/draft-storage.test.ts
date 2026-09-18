import { expect, test } from 'vitest';
import {
  createDraftStorage,
  type DraftBinaryStore,
  type DraftMetadata,
} from './draft-storage';

function stores() {
  const values = new Map<string, string>();
  let stored: Awaited<ReturnType<DraftBinaryStore['load']>> = null;
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
      stored = null;
    },
    load: async () => stored,
    save: async (value) => {
      stored = value;
    },
  };
  return {
    binary,
    local,
    readBinary: () => stored,
    readLocal: () => [...values.values()][0] ?? null,
    replaceBinary: (value: typeof stored) => {
      stored = value;
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

  expect(memory.readLocal()).not.toContain('private-binary');
  expect(memory.readLocal()).not.toContain('data:image');
  expect(memory.readLocal()).not.toContain('blob:');
  const restored = await storage.load();
  expect(restored).toMatchObject({
    order: ['photo-2', 'photo-1', 'photo-3'],
    photoIds: ['photo-1', 'photo-2', 'photo-3'],
    prompt: '초록빛 흐름으로',
  });
  expect(restored?.images.get('photo-1')).toMatchObject({
    size: 22,
    type: 'image/webp',
  });
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

  await storage.save(metadata(), images());
  await storage.clear();
  expect(memory.readLocal()).toBeNull();
  expect(memory.readBinary()).toBeNull();
});
