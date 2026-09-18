import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { CurationResponse } from '@/types/contracts';
import fixture from '../../../fixtures/curation.sample.json';
import { buildCuration } from '../../../lib/curation.js';
import { createPhotoReceipt } from '../../../lib/photo-receipt.js';
import { previewOutput } from '../captions/preview-output';
import {
  type CurationEditorStore,
  createCurationEditorStore,
} from '../editor/curation-store';
import { CurationPreview } from './curation-preview';

vi.mock('zustand', () => ({
  useStore: (
    store: CurationEditorStore,
    selector: (state: ReturnType<CurationEditorStore['getState']>) => unknown,
  ) => selector(store.getState()),
}));

test('two authenticated equal digests among three photos produce one visible recommendation but never automatic exclusion; distinct digests produce zero', async () => {
  for (const duplicates of [true, false]) {
    const body = structuredClone(fixture.request);
    const receiptSecret = 'offline-ui-receipt-fixture-only-secret';
    const photos = body.photos.map((photo, index) => ({
      ...photo,
      analysis_receipt: createPhotoReceipt(
        {
          analysis: photo,
          collection: 'selected',
          digest: (duplicates && index === 1 ? '0' : String(index)).repeat(64),
          sessionId: body.session_id,
        },
        receiptSecret,
      ),
    }));
    const result = (await buildCuration(
      { ...body, photos },
      {
        resolveSnapshot: async () => ({
          ...structuredClone(fixture.resolution),
          currentProfile: null,
          targetProfile: null,
        }),
        now: () => Date.parse(fixture.now),
        receiptSecret,
      },
    )) as CurationResponse;
    expect(
      result.curation.slots.filter(
        (slot) => slot.exclusion_candidate.recommended,
      ),
    ).toHaveLength(duplicates ? 1 : 0);
    const store = createCurationEditorStore();
    await store.getState().loadCuration(async () => result);
    await store.getState().generate(undefined, previewOutput);
    expect(store.getState().excluded).toEqual([]);
    if (duplicates) {
      const candidate = result.curation.slots.find(
        (slot) => slot.exclusion_candidate.recommended,
      );
      if (!candidate) throw new Error('Expected candidate');
      store.getState().movePhoto(candidate.photo_id, 0);
      const markup = renderToStaticMarkup(
        createElement(CurationPreview, { store, mock: true }),
      );
      expect(markup).toContain(candidate.exclusion_candidate.reason);
      expect(markup).toContain('사진 3장 포함');
      expect(markup).toContain('사진 제외');
      store.getState().setIncluded(candidate.photo_id, false);
      expect(
        renderToStaticMarkup(
          createElement(CurationPreview, { store, mock: true }),
        ),
      ).toContain('사진 복원');
      store.getState().setIncluded(candidate.photo_id, true);
      expect(store.getState().excluded).toEqual([]);
    }
    const first = store.getState().confirmCuration();
    await store.getState().loadCuration(async () => result);
    expect(store.getState().confirmed).toBe(first);
    const off = renderToStaticMarkup(
      createElement(CurationPreview, { store, mock: true }),
    );
    expect(off).toContain('GYEOL · 나의 사진 기록');
    expect(off).not.toContain('@g5_public');
    store.getState().setProfileSharing(true);
    expect(
      renderToStaticMarkup(
        createElement(CurationPreview, { store, mock: true }),
      ),
    ).toContain('@g5_public');
    expect(first.output.slots.every((slot) => !('evidence' in slot))).toBe(
      true,
    );
  }
});
