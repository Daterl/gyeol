import type { F3Export, FeedResponse } from '@/types/contracts';
import { validateEditedExport } from '../../../lib/contracts.js';
import { validateFeedResponse } from '../../../lib/interaction.js';

const DATABASE_NAME = 'gyeol-editor';
const DATABASE_VERSION = 1;
const DRAFT_KEY = 'current';
const LOCAL_KEY = 'gyeol.editor.draft.v1';
const STORE_NAME = 'drafts';

export type DraftProfileReference = {
  displayName: string;
  profileImageUrl: string | null;
  username: string;
};

export type DraftMetadata = {
  draft: F3Export | null;
  order: string[];
  original: FeedResponse | null;
  originalOutput: F3Export | null;
  photoIds: string[];
  profileReference: DraftProfileReference | null;
  prompt: string;
};

export type RestoredDraft = DraftMetadata & {
  images: ReadonlyMap<string, Blob>;
};

type StoredMetadata = DraftMetadata & { revision: string; version: 1 };
type StoredImages = {
  images: { blob: Blob; photoId: string }[];
  revision: string;
};

type LocalStore = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
export type DraftBinaryStore = {
  clear: () => Promise<void>;
  load: () => Promise<StoredImages | null>;
  save: (value: StoredImages) => Promise<void>;
};
export type DraftStorage = {
  clear: () => Promise<void>;
  load: () => Promise<RestoredDraft | null>;
  save: (
    metadata: DraftMetadata,
    images: ReadonlyMap<string, Blob>,
  ) => Promise<void>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validateProfileReference(
  value: unknown,
): asserts value is DraftProfileReference | null {
  if (value === null) return;
  if (
    !isRecord(value) ||
    typeof value.displayName !== 'string' ||
    (value.profileImageUrl !== null &&
      (typeof value.profileImageUrl !== 'string' ||
        !value.profileImageUrl.startsWith('https://'))) ||
    typeof value.username !== 'string' ||
    !/^[\w.]{1,30}$/.test(value.username)
  )
    throw new Error('Invalid draft profile reference');
}

function validateMetadata(value: unknown): asserts value is StoredMetadata {
  if (!isRecord(value)) throw new Error('Invalid draft metadata');
  const {
    draft,
    order,
    original,
    originalOutput,
    photoIds,
    profileReference,
    prompt,
    revision,
    version,
  } = value;
  if (
    version !== 1 ||
    typeof revision !== 'string' ||
    !revision ||
    typeof prompt !== 'string' ||
    prompt.length > 2_000 ||
    !Array.isArray(photoIds) ||
    photoIds.length < 3 ||
    photoIds.length > 15 ||
    !photoIds.every((id) => typeof id === 'string' && id.length > 0) ||
    new Set(photoIds).size !== photoIds.length ||
    !Array.isArray(order) ||
    order.length !== photoIds.length ||
    !order.every((id) => typeof id === 'string' && photoIds.includes(id)) ||
    new Set(order).size !== order.length
  )
    throw new Error('Invalid draft metadata');
  validateProfileReference(profileReference);
  if (original !== null) {
    validateFeedResponse(original);
    const validatedOriginal = original as FeedResponse;
    const originalIds = validatedOriginal.context.photos.map(
      (photo) => photo.photo_id,
    );
    if (
      originalIds.length !== photoIds.length ||
      !photoIds.every((id) => originalIds.includes(id))
    )
      throw new Error('Draft photos differ from the saved feed');
  }
  if (draft !== null) {
    if (original === null) throw new Error('Draft output is missing its feed');
    validateEditedExport(
      draft,
      (original as FeedResponse).feed,
      photoIds as string[],
    );
  }
  if (originalOutput !== null) {
    if (original === null)
      throw new Error('Original output is missing its feed');
    validateEditedExport(
      originalOutput,
      (original as FeedResponse).feed,
      photoIds as string[],
    );
  }
}

function validateImages(
  value: StoredImages | null,
  metadata: StoredMetadata,
): asserts value is StoredImages {
  if (
    !value ||
    value.revision !== metadata.revision ||
    !Array.isArray(value.images) ||
    value.images.length !== metadata.photoIds.length
  )
    throw new Error('Draft images do not match metadata');
  const ids = new Set<string>();
  for (const image of value.images) {
    if (
      !isRecord(image) ||
      typeof image.photoId !== 'string' ||
      !metadata.photoIds.includes(image.photoId) ||
      !(image.blob instanceof Blob) ||
      image.blob.type !== 'image/webp' ||
      image.blob.size === 0
    )
      throw new Error('Invalid draft image');
    ids.add(image.photoId);
  }
  if (ids.size !== metadata.photoIds.length)
    throw new Error('Duplicate draft image');
}

export function createDraftStorage(
  local: LocalStore,
  binary: DraftBinaryStore,
  createRevision: () => string = () => crypto.randomUUID(),
): DraftStorage {
  const clear = async () => {
    await Promise.all([
      binary.clear(),
      Promise.resolve().then(() => local.removeItem(LOCAL_KEY)),
    ]);
  };
  const discard = async () => {
    await Promise.allSettled([
      binary.clear(),
      Promise.resolve().then(() => local.removeItem(LOCAL_KEY)),
    ]);
  };
  return {
    clear,
    load: async () => {
      try {
        const raw = local.getItem(LOCAL_KEY);
        if (raw === null) {
          await binary.clear();
          return null;
        }
        const metadata: unknown = JSON.parse(raw);
        validateMetadata(metadata);
        const storedImages = await binary.load();
        validateImages(storedImages, metadata);
        return {
          draft: structuredClone(metadata.draft),
          images: new Map(
            storedImages.images.map(({ blob, photoId }) => [photoId, blob]),
          ),
          order: [...metadata.order],
          original: structuredClone(metadata.original),
          originalOutput: structuredClone(metadata.originalOutput),
          photoIds: [...metadata.photoIds],
          profileReference: structuredClone(metadata.profileReference),
          prompt: metadata.prompt,
        };
      } catch {
        await discard();
        return null;
      }
    },
    save: async (metadata, images) => {
      const revision = createRevision();
      const value: StoredMetadata = {
        draft: structuredClone(metadata.draft),
        order: [...metadata.order],
        original: structuredClone(metadata.original),
        originalOutput: structuredClone(metadata.originalOutput),
        photoIds: [...metadata.photoIds],
        profileReference: structuredClone(metadata.profileReference),
        prompt: metadata.prompt,
        revision,
        version: 1,
      };
      validateMetadata(value);
      const storedImages: StoredImages = {
        images: value.photoIds.map((photoId) => {
          const blob = images.get(photoId);
          if (!blob) throw new Error(`Missing WebP for ${photoId}`);
          return { blob, photoId };
        }),
        revision,
      };
      validateImages(storedImages, value);
      try {
        await binary.save(storedImages);
        local.setItem(LOCAL_KEY, JSON.stringify(value));
      } catch (error) {
        await discard();
        throw error;
      }
    },
  };
}

export function createIndexedDbBinaryStore(
  factory: IDBFactory,
): DraftBinaryStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME))
          request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
    });
  const run = async <T>(
    mode: IDBTransactionMode,
    task: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const database = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = task(transaction.objectStore(STORE_NAME));
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  };
  return {
    clear: async () => {
      await run('readwrite', (store) => store.delete(DRAFT_KEY));
    },
    load: () =>
      run<StoredImages | null>('readonly', (store) => store.get(DRAFT_KEY)),
    save: async (value) => {
      await run('readwrite', (store) => store.put(value, DRAFT_KEY));
    },
  };
}

export function createBrowserDraftStorage(): DraftStorage | null {
  try {
    if (typeof localStorage === 'undefined' || typeof indexedDB === 'undefined')
      return null;
    return createDraftStorage(
      localStorage,
      createIndexedDbBinaryStore(indexedDB),
    );
  } catch {
    return null;
  }
}
