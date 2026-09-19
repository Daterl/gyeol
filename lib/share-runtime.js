import {
  createDurableShareRateLimiter,
  createPrivateShareBlobStore,
} from './share-blob-storage.js';
import { createShareService, ShareError } from './share-storage.js';

let service;

export function getShareService() {
  if (service !== undefined) return service;
  try {
    const store = createPrivateShareBlobStore();
    service = createShareService({
      store,
      secret: process.env.SHARE_STORAGE_SECRET,
      rateLimiter: createDurableShareRateLimiter({ store }),
    });
  } catch (error) {
    if (error instanceof ShareError && error.code === 'NOT_CONFIGURED') {
      service = null;
    } else {
      throw error;
    }
  }
  return service;
}

export function resetShareServiceForTests() {
  service = undefined;
}
