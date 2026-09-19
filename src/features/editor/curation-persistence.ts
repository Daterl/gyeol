import type { FeedResponse } from '@/types/contracts';
import type { CurationEdits } from './curation-store';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const ids = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((id) => typeof id === 'string' && id.length > 0) &&
  new Set(value).size === value.length;
const sourceUrl = (value: unknown) => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['instagram.com', 'www.instagram.com'].includes(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/[\w.]{1,30}\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
};
const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const displayName = (value: unknown) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= 100 &&
  [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && (code < 127 || code > 159);
  });
const dateString = (value: unknown) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));
const usernameMatches = (value: unknown, url: string) =>
  typeof value === 'string' &&
  /^[a-z0-9_.]{1,30}$/.test(value) &&
  value === new URL(url).pathname.replace(/^\/|\/$/g, '').toLowerCase();
function validateDisplay(value: unknown, url: string) {
  if (
    !record(value) ||
    !onlyKeys(value, ['username', 'display_name', 'name_source']) ||
    !usernameMatches(value.username, url) ||
    (value.display_name !== undefined) !== (value.name_source !== undefined) ||
    (value.display_name !== undefined && !displayName(value.display_name)) ||
    (value.name_source !== undefined &&
      value.name_source !== 'apify.ownerFullName')
  )
    throw new Error('Invalid saved profile display');
}
const cropsValid = (value: unknown, photoIds: string[]) =>
  record(value) &&
  Object.entries(value).every(
    ([id, crop]) =>
      photoIds.includes(id) &&
      record(crop) &&
      onlyKeys(crop, ['x', 'y']) &&
      ['x', 'y'].every(
        (axis) =>
          typeof crop[axis] === 'number' &&
          Number.isFinite(crop[axis]) &&
          crop[axis] >= 0 &&
          crop[axis] <= 100,
      ),
  );

const profileSnapshotReference = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 2048;

const legacyProfileSourceValid = (value: unknown) =>
  record(value) &&
  onlyKeys(value, [
    'username',
    'displayName',
    'nameSource',
    'source',
    'collectedAt',
  ]) &&
  sourceUrl(value.source) &&
  usernameMatches(value.username, value.source as string) &&
  (value.displayName === null || displayName(value.displayName)) &&
  dateString(value.collectedAt) &&
  (value.displayName === null
    ? value.nameSource === null
    : value.nameSource === 'apify.ownerFullName');

const confirmedOutputValid = (
  value: unknown,
  minimumPhotos: number,
  extraKeys: string[],
) => {
  if (
    !record(value) ||
    !onlyKeys(value, [
      'output',
      'crops',
      'excluded',
      'profileSharing',
      ...extraKeys,
    ]) ||
    !record(value.output) ||
    !onlyKeys(value.output, ['title', 'slots']) ||
    typeof value.output.title !== 'string' ||
    !value.output.title.trim() ||
    !Array.isArray(value.output.slots) ||
    value.output.slots.length < minimumPhotos ||
    value.output.slots.length > 15 ||
    !ids(value.excluded) ||
    typeof value.profileSharing !== 'boolean'
  )
    return false;
  const confirmedIds = value.output.slots.map((slot) =>
    record(slot) ? slot.photo_id : undefined,
  );
  return (
    ids(confirmedIds) &&
    cropsValid(value.crops, confirmedIds) &&
    value.output.slots.every(
      (slot, index) =>
        record(slot) &&
        onlyKeys(slot, [
          'photo_id',
          'position',
          'caption_state',
          'text',
          'omit_reason',
        ]) &&
        slot.position === index + 1 &&
        ['user', 'seed', 'omitted'].includes(String(slot.caption_state)) &&
        (slot.text === null || typeof slot.text === 'string') &&
        (slot.omit_reason === null || typeof slot.omit_reason === 'string') &&
        !('evidence' in slot),
    )
  );
};

const publicProfileValid = (value: unknown) =>
  record(value) &&
  onlyKeys(value, [
    'username',
    'displayName',
    'avatarUrl',
    'source',
    'collectedAt',
  ]) &&
  sourceUrl(value.source) &&
  usernameMatches(value.username, value.source as string) &&
  (value.displayName === null || displayName(value.displayName)) &&
  value.avatarUrl === null &&
  dateString(value.collectedAt);

const oldSnakeCaseProfileValid = (value: unknown) =>
  record(value) &&
  onlyKeys(value, ['source_url', 'username', 'display_name', 'collected_at']) &&
  sourceUrl(value.source_url) &&
  (value.username === undefined ||
    usernameMatches(value.username, value.source_url as string)) &&
  (value.display_name === undefined || displayName(value.display_name)) &&
  (value.collected_at === undefined || dateString(value.collected_at));

const legacyPublicProfileMatchesSource = (
  profile: Record<string, unknown>,
  source: Record<string, unknown>,
) =>
  profile.username === source.username &&
  profile.displayName === source.displayName &&
  profile.source === source.source &&
  profile.collectedAt === source.collectedAt;

const withoutLegacySource = (value: Record<string, unknown>) => {
  const { confirmedProfileSource: _legacy, ...current } = value;
  return current;
};

// This is deliberately called only by DraftStorage.load. Save paths remain strict.
export function migrateCurationStateOnLoad(value: unknown): unknown {
  if (
    !record(value) ||
    !onlyKeys(value, [
      'curation',
      'excluded',
      'crops',
      'profileSharing',
      'confirmed',
      'confirmedProfileSource',
    ])
  )
    return value;
  const hasLegacySource = 'confirmedProfileSource' in value;
  const confirmed = value.confirmed;
  if (confirmed === null) {
    if (!hasLegacySource) return value;
    return value.confirmedProfileSource === null
      ? withoutLegacySource(value)
      : value;
  }
  if (!record(confirmed)) return value;
  if ('profileSnapshotId' in confirmed) {
    if (!hasLegacySource) return value;
    return value.confirmedProfileSource === null
      ? withoutLegacySource(value)
      : value;
  }
  if (!confirmedOutputValid(confirmed, 1, ['profile'])) return value;
  const source = value.confirmedProfileSource;
  const validLegacyProfile =
    confirmed.profileSharing === true &&
    (oldSnakeCaseProfileValid(confirmed.profile) ||
      (publicProfileValid(confirmed.profile) &&
        (!hasLegacySource ||
          (legacyProfileSourceValid(source) &&
            record(confirmed.profile) &&
            record(source) &&
            legacyPublicProfileMatchesSource(confirmed.profile, source)))));
  const validProfileOff =
    confirmed.profileSharing === false &&
    confirmed.profile === undefined &&
    (!hasLegacySource || source === null);
  if (!validLegacyProfile && !validProfileOff) return value;
  const slots = record(confirmed.output) ? confirmed.output.slots : undefined;
  const tooFewPhotos =
    Array.isArray(slots) && slots.length >= 1 && slots.length < 3;
  const current = hasLegacySource ? withoutLegacySource(value) : value;
  return tooFewPhotos || validLegacyProfile
    ? { ...current, confirmed: null }
    : current;
}

// Validate the adapter extension inside G3's existing revision transaction.
// Absence remains compatible with drafts written before the curation UI.
export function validateCurationState(
  value: unknown,
  photoIds: string[],
  original: FeedResponse | null,
): asserts value is CurationEdits {
  if (
    !record(value) ||
    !onlyKeys(value, [
      'curation',
      'excluded',
      'crops',
      'profileSharing',
      'confirmed',
    ]) ||
    !ids(value.excluded) ||
    !value.excluded.every((id) => photoIds.includes(id)) ||
    !cropsValid(value.crops, photoIds) ||
    typeof value.profileSharing !== 'boolean'
  )
    throw new Error('Invalid curation edits');
  const curation = value.curation;
  if (curation !== null) {
    if (
      !original ||
      !record(curation) ||
      curation.schema_version !== '1.0' ||
      !profileSnapshotReference(curation.profile_snapshot_id) ||
      !record(curation.profile) ||
      !sourceUrl(curation.profile.source_url) ||
      !dateString(curation.profile.collected_at) ||
      curation.profile.ownership_verified !== false ||
      !record(curation.prompt) ||
      !(
        curation.prompt.text === null ||
        typeof curation.prompt.text === 'string'
      ) ||
      !Array.isArray(curation.slots) ||
      curation.slots.length !== photoIds.length
    )
      throw new Error('Invalid saved curation');
    if (curation.profile.display !== undefined)
      validateDisplay(
        curation.profile.display,
        curation.profile.source_url as string,
      );
    if (
      curation.slots.some(
        (slot, index) =>
          !record(slot) ||
          slot.photo_id !== original.feed.slots[index]?.photo_id ||
          slot.position !== index + 1 ||
          slot.included !== true ||
          !record(slot.exclusion_candidate) ||
          typeof slot.exclusion_candidate.recommended !== 'boolean' ||
          !(
            slot.exclusion_candidate.reason === null ||
            typeof slot.exclusion_candidate.reason === 'string'
          ) ||
          !Array.isArray(slot.exclusion_candidate.evidence) ||
          slot.exclusion_candidate.evidence.some(
            (item) =>
              !record(item) ||
              typeof item.note !== 'string' ||
              typeof item.ref !== 'string',
          ),
      )
    )
      throw new Error('Invalid saved candidates');
  }
  if (value.profileSharing && curation === null)
    throw new Error('Invalid shared profile state');
  const confirmed = value.confirmed;
  if (confirmed === null) return;
  if (!confirmedOutputValid(confirmed, 3, ['profileSnapshotId']))
    throw new Error('Invalid confirmation');
  if (!record(confirmed)) throw new Error('Invalid confirmation');
  const profileReferenceIncluded = 'profileSnapshotId' in confirmed;
  if (
    confirmed.profileSharing !== profileReferenceIncluded ||
    (confirmed.profileSharing &&
      !profileSnapshotReference(confirmed.profileSnapshotId))
  )
    throw new Error('Invalid confirmed profile reference');
}
