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
      /^\/[\w.]{1,30}\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
};
const cropsValid = (value: unknown, photoIds: string[]) =>
  record(value) &&
  Object.entries(value).every(
    ([id, crop]) =>
      photoIds.includes(id) &&
      record(crop) &&
      ['x', 'y'].every(
        (axis) =>
          typeof crop[axis] === 'number' &&
          Number.isFinite(crop[axis]) &&
          crop[axis] >= 0 &&
          crop[axis] <= 100,
      ),
  );

// Validate the adapter extension inside G3's existing revision transaction.
// Absence remains compatible with drafts written before the curation UI.
export function validateCurationState(
  value: unknown,
  photoIds: string[],
  original: FeedResponse | null,
): asserts value is CurationEdits {
  if (
    !record(value) ||
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
      typeof curation.profile_snapshot_id !== 'string' ||
      !curation.profile_snapshot_id ||
      !record(curation.profile) ||
      !sourceUrl(curation.profile.source_url) ||
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
  const confirmed = value.confirmed;
  if (confirmed === null) return;
  if (
    !record(confirmed) ||
    !record(confirmed.output) ||
    typeof confirmed.output.title !== 'string' ||
    !confirmed.output.title.trim() ||
    !Array.isArray(confirmed.output.slots) ||
    confirmed.output.slots.length < 1 ||
    confirmed.output.slots.length > 15 ||
    !ids(confirmed.excluded) ||
    typeof confirmed.profileSharing !== 'boolean'
  )
    throw new Error('Invalid confirmation');
  const confirmedIds = confirmed.output.slots.map((slot) =>
    record(slot) ? slot.photo_id : undefined,
  );
  if (
    !ids(confirmedIds) ||
    !cropsValid(confirmed.crops, confirmedIds) ||
    confirmed.output.slots.some(
      (slot, index) =>
        !record(slot) ||
        slot.position !== index + 1 ||
        !['user', 'seed', 'omitted'].includes(String(slot.caption_state)) ||
        !(slot.text === null || typeof slot.text === 'string') ||
        !(slot.omit_reason === null || typeof slot.omit_reason === 'string') ||
        'evidence' in slot,
    )
  )
    throw new Error('Invalid confirmed output');
  if (
    confirmed.profile !== undefined &&
    (!confirmed.profileSharing ||
      !record(confirmed.profile) ||
      !sourceUrl(confirmed.profile.source_url))
  )
    throw new Error('Invalid confirmed profile');
}
