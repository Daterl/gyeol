import { expect, test } from 'vitest';
import type { CurationResponse, F3Export } from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';
import { createCurationEditorStore } from './curation-store';
import { curationFixture } from './curation-test-fixture';

async function ready() {
  const store = createCurationEditorStore();
  await store.getState().loadCuration(async () => curationFixture());
  await store.getState().generate(undefined, async () => ({
    output: structuredClone(fixture.all_omitted) as F3Export,
  }));
  expect(store.getState().request.status).toBe('ready');
  return store;
}
test('recommendations never exclude automatically; order, restore, empty captions and crop centers are editable', async () => {
  const store = await ready();
  const [first, second] = store.getState().order;
  expect(store.getState().excluded).toEqual([]);
  expect(store.getState().profileSharing).toBe(false);
  store.getState().movePhoto(first, 1);
  store.getState().setIncluded(second, false);
  store.getState().setIncluded(second, true);
  store.getState().editCaption(first, '직접 쓴 문장');
  store.getState().setCrop(first, { x: -20, y: 120 });
  expect(store.getState().crops[first]).toEqual({ x: 0, y: 100 });
  store.getState().setCrop(first, { x: NaN, y: 0 });
  expect(store.getState().crops[first]).toEqual({ x: 0, y: 100 });
  store.getState().editCaption(first, '');
  expect(store.getState().draft?.slots[1]).toMatchObject({
    photo_id: first,
    text: null,
    caption_state: 'omitted',
  });
  expect(store.getState().excluded).toEqual([]);
});
test('confirmation is detached, deeply frozen and omits profile by default; reconfirmation replaces only the snapshot', async () => {
  const store = await ready();
  const [first, second] = store.getState().order;
  store.getState().setIncluded(second, false);
  const snapshot = store.getState().confirmCuration();
  const serialized = JSON.stringify(snapshot);
  expect(snapshot.profile).toBeUndefined();
  expect(serialized).not.toContain('public_example');
  expect(Object.isFrozen(snapshot.output.slots[0])).toBe(true);
  expect(snapshot.output.slots.some((slot) => slot.photo_id === second)).toBe(
    false,
  );
  store.getState().editCaption(first, '다음 편집');
  store.getState().setCrop(first, { x: 80, y: 10 });
  store.getState().setIncluded(second, true);
  store.getState().setProfileSharing(true);
  expect(JSON.stringify(store.getState().confirmed)).toBe(serialized);
  const next = store.getState().confirmCuration();
  expect(next.profile).toEqual({
    source_url: 'https://www.instagram.com/public_example/',
    username: 'public_example',
    collected_at: '2026-09-18T10:00:00Z',
  });
  expect(JSON.stringify(next)).not.toMatch(
    /evidence_refs|snapshot_id|expires_at/,
  );
  expect(next.output.slots).toHaveLength(fixture.feed.slots.length);
  expect(snapshot).not.toBe(next);
});
test('empty feed cannot be confirmed; new source clears local edits; cancellation cannot install late metadata', async () => {
  const store = await ready();
  for (const id of store.getState().order)
    store.getState().setIncluded(id, false);
  expect(() => store.getState().confirmCuration()).toThrow('한 장 이상');
  const late = Promise.withResolvers<CurationResponse>();
  const pending = store.getState().loadCuration(() => late.promise);
  store.getState().reset();
  late.resolve(curationFixture());
  await pending;
  expect(store.getState().curation).toBeNull();
  expect(store.getState().confirmed).toBeNull();
  expect(store.getState().excluded).toEqual([]);
});

test('cancelling a new feed with an existing preview does not authorize automatic caption generation', async () => {
  const store = await ready();
  const original = store.getState().original;
  const curation = store.getState().curation;
  const late = Promise.withResolvers<CurationResponse>();
  const pending = store.getState().loadCuration(() => late.promise);
  store.getState().cancel();
  late.resolve(curationFixture());
  expect(await pending).toBe(false);
  expect(store.getState().original).toBe(original);
  expect(store.getState().curation).toBe(curation);
  expect(store.getState().request.status).toBe('ready');
});

test('regeneration requires the loaded account and snapshot, including same-account refresh', async () => {
  const { canRegenerateCuration } = await import('./curation-store');
  const store = await ready();
  const curation = store.getState().curation;
  const profile = {
    url: 'https://www.instagram.com/public_example/',
    snapshotId: 'public-reference',
    expires_at: Date.now() + 60000,
  };
  const confirmation = store.getState().confirmCuration();
  expect(canRegenerateCuration(curation, null)).toBe(false);
  expect(canRegenerateCuration(curation, profile)).toBe(true);
  expect(
    canRegenerateCuration(curation, {
      ...profile,
      url: 'https://www.instagram.com/another/',
    }),
  ).toBe(false);
  expect(
    canRegenerateCuration(curation, {
      ...profile,
      snapshotId: 'fresh-reference',
    }),
  ).toBe(false);
  expect(canRegenerateCuration(curation, { ...profile, expires_at: 0 })).toBe(
    false,
  );
  expect(store.getState().confirmed).toBe(confirmation);
});

test('profile display is opt-in and confirmation selects only public identity fields', async () => {
  const store = await ready();
  const result = curationFixture();
  result.curation.profile.display = {
    username: 'public_example',
    display_name: '공개 이름',
    name_source: 'apify.ownerFullName',
  };
  Object.assign(result.curation.profile.display, {
    receipt: 'private-receipt',
    avatar: 'not-an-avatar',
  });
  await store.getState().loadCuration(async () => result);
  await store.getState().generate(undefined, async () => ({
    output: structuredClone(fixture.all_omitted) as F3Export,
  }));
  expect(JSON.stringify(store.getState().confirmCuration())).not.toMatch(
    /public_example|공개 이름|private-receipt/,
  );
  store.getState().setProfileSharing(true);
  expect(store.getState().confirmCuration().profile).toEqual({
    source_url: 'https://www.instagram.com/public_example/',
    username: 'public_example',
    collected_at: '2026-09-18T10:00:00Z',
    display_name: '공개 이름',
  });
  expect(JSON.stringify(store.getState().confirmed)).not.toMatch(
    /name_source|receipt|avatar|evidence|snapshot_id/,
  );
  store.getState().setProfileSharing(false);
  expect(store.getState().confirmCuration().profile).toBeUndefined();
});
