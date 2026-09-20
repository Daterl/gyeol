import type { CaptionSlot, CurationResponse } from '@/types/contracts';
import type { ConnectedProfile } from '../input/profile-connection';
import { createBrowserDraftStorage, type DraftStorage } from './draft-storage';
import { createEditorStore } from './store';

export type CropCenter = { x: number; y: number };
export type ConfirmedCuration = {
  output: { title: string; slots: Omit<CaptionSlot, 'evidence'>[] };
  crops: Record<string, CropCenter>;
  excluded: string[];
  profileSharing: boolean;
  profileSnapshotId?: string;
};
export type CurationEdits = {
  curation: CurationResponse['curation'] | null;
  excluded: string[];
  crops: Record<string, CropCenter>;
  profileSharing: boolean;
  confirmed: ConfirmedCuration | null;
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const nested of Object.values(value)) freeze(nested);
  }
  return value;
}
function profileSnapshotReference(
  curation: NonNullable<CurationEdits['curation']>,
) {
  const { profile } = curation;
  try {
    const url = new URL(profile.source_url);
    const username = url.pathname.replace(/^\/|\/$/g, '').toLowerCase();
    const displayName =
      profile.display?.name_source === 'apify.ownerFullName'
        ? (profile.display.display_name ?? null)
        : null;
    if (
      url.protocol !== 'https:' ||
      !['instagram.com', 'www.instagram.com'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      typeof curation.profile_snapshot_id !== 'string' ||
      curation.profile_snapshot_id.trim().length === 0 ||
      curation.profile_snapshot_id.length > 2048 ||
      !/^[a-z0-9_.]{1,30}$/.test(username) ||
      (profile.display?.username !== undefined &&
        profile.display.username !== username) ||
      (profile.display?.display_name !== undefined) !==
        (profile.display?.name_source === 'apify.ownerFullName') ||
      (displayName !== null &&
        (displayName.trim().length === 0 ||
          displayName.length > 100 ||
          [...displayName].some((character) => {
            const code = character.charCodeAt(0);
            return code < 32 || (code >= 127 && code <= 159);
          }))) ||
      Number.isNaN(Date.parse(profile.collected_at))
    )
      throw new Error('invalid profile');
    return curation.profile_snapshot_id;
  } catch {
    throw new Error('공유할 공개 프로필 정보를 다시 확인해 주세요.');
  }
}
export function canRegenerateCuration(
  curation: CurationEdits['curation'],
  profile: ConnectedProfile | null,
) {
  if (!curation || !profile || profile.expires_at <= Date.now()) return false;
  try {
    const account = (url: string) =>
      new URL(url).pathname.replace(/\/$/, '').toLowerCase();
    return (
      curation.profile_snapshot_id === profile.snapshotId &&
      account(curation.profile.source_url) === account(profile.url)
    );
  } catch {
    return false;
  }
}
export function createCurationEditorStore(
  persistence: DraftStorage | null = createBrowserDraftStorage(),
) {
  const base = createEditorStore(persistence, {
    save: () => {
      const { curation, excluded, crops, profileSharing, confirmed } =
        store.getState();
      return {
        curationState: {
          curation,
          excluded,
          crops,
          profileSharing,
          confirmed,
        },
      };
    },
    restore: (metadata) =>
      store.setState(
        metadata.curationState
          ? {
              ...structuredClone(metadata.curationState),
              confirmed: freeze(
                structuredClone(metadata.curationState.confirmed),
              ),
            }
          : defaults(),
      ),
  });
  const defaults = (): CurationEdits => ({
    curation: null,
    excluded: [],
    crops: {},
    profileSharing: false,
    confirmed: null,
  });
  let loadSequence = 0;
  const actions = {
    async loadCuration(
      task: (signal: AbortSignal) => Promise<CurationResponse>,
    ) {
      const sequence = ++loadSequence;
      const before = base.getState().original;
      let curation: CurationResponse['curation'] | null = null;
      await base.getState().loadFeed(async (signal) => {
        const result = await task(signal);
        curation = structuredClone(result.curation);
        return { feed: result.feed, context: result.context };
      });
      if (
        sequence === loadSequence &&
        base.getState().original !== before &&
        base.getState().request.status === 'ready' &&
        curation
      ) {
        store.setState({ curation });
        return true;
      }
      return false;
    },
    setIncluded(id: string, included: boolean) {
      const state = store.getState();
      if (!state.order.includes(id)) return;
      store.setState({
        excluded: included
          ? state.excluded.filter((value) => value !== id)
          : [...new Set([...state.excluded, id])],
      });
    },
    setCrop(id: string, center: CropCenter) {
      if (
        !store.getState().order.includes(id) ||
        !Number.isFinite(center.x) ||
        !Number.isFinite(center.y)
      )
        return;
      store.setState({
        crops: {
          ...store.getState().crops,
          [id]: {
            x: Math.max(0, Math.min(100, center.x)),
            y: Math.max(0, Math.min(100, center.y)),
          },
        },
      });
    },
    setProfileSharing(profileSharing: boolean) {
      store.setState({ profileSharing });
    },
    confirmCuration() {
      const state = store.getState();
      if (state.request.status === 'loading')
        throw new Error('요청이 끝난 뒤 확정해 주세요.');
      const output = state.exportDraft();
      output.slots = output.slots
        .filter((slot) => !state.excluded.includes(slot.photo_id))
        .map((slot, index) => ({ ...slot, position: index + 1 }));
      if (output.slots.length < 3)
        throw new Error('큐레이션에는 사진을 3장 이상 포함해 주세요.');
      let profileSnapshotId: string | undefined;
      if (state.profileSharing) {
        if (!state.curation)
          throw new Error('공유할 공개 프로필 정보를 다시 확인해 주세요.');
        profileSnapshotId = profileSnapshotReference(state.curation);
      }

      const confirmed = freeze(
        structuredClone({
          output: {
            title: output.title,
            slots: output.slots.map(({ evidence: _evidence, ...slot }) => slot),
          },
          crops: Object.fromEntries(
            output.slots.map((slot) => [
              slot.photo_id,
              state.crops[slot.photo_id] ?? { x: 50, y: 50 },
            ]),
          ),
          excluded: state.excluded,
          profileSharing: state.profileSharing,
          ...(profileSnapshotId ? { profileSnapshotId } : {}),
        }),
      );
      store.setState({ confirmed });
      return confirmed;
    },
  };
  type State = ReturnType<typeof base.getState> &
    CurationEdits &
    typeof actions;
  const store = base as unknown as Omit<
    typeof base,
    'getState' | 'getInitialState' | 'setState' | 'subscribe'
  > &
    import('zustand/vanilla').StoreApi<State>;
  store.setState({ ...defaults(), ...actions });
  const initial = store.getState();
  store.getInitialState = () => initial;
  // G3 owns the base store. This adapter only resets its own metadata when the source changes.
  store.subscribe((state, previous) => {
    if (state.original !== previous.original)
      store.setState({
        ...defaults(),
        confirmed: state.original ? state.confirmed : null,
      });
  });
  return store;
}
export type CurationEditorStore = ReturnType<typeof createCurationEditorStore>;
