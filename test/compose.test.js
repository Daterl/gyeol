import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composeFeed, composeProfile } from '../lib/compose.js';
import { evaluate } from '../eval/invariants.js';

const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const quiet = await read('eval/golden/case_01/target_quiet.json');
const detail = await read('eval/golden/case_01/target_detail.json');
const absent = await read('eval/golden/case_01/current_profile.json');
const present = (await read('fixtures/current_profile.sample.json')).find(p => p.present);
const photos = await read('test/order.real20.json');
const length = (profile, p50) => {
  const copy = structuredClone(profile);
  copy.language.caption_len.value = { p50, p90: p50, unit: '자' };
  return copy;
};
const pair = (t, c) => ({ targetProfile: length(detail, t), currentProfile: length(present, c) });
const run = options => composeFeed({ photoAnalyses: photos, now: '2026-09-17T00:00:00.000Z', ...options });

test('present current profiles are traced without claiming an unsupported correction', () => {
  for (const currentLength of [2, 18, 120, 950]) {
    const input = pair(120, currentLength);
    const before = structuredClone(input);
    const result = run(input).applied_profile;
    assert.equal(result.current_profile_id, input.currentProfile.profile_id);
    assert.equal(result.corrected, false);
    assert.equal(result.disclosure, 'target_only');
    assert.deepEqual(result.deltas, []);
    assert.equal(result.language.caption_len.value.p50, 120);
    assert.deepEqual(result.visual, input.targetProfile.visual);
    assert.deepEqual(result.sequence, input.targetProfile.sequence);
    assert.deepEqual(input, before);
  }
});

test('absent current completes pipeline and E8 with no delta', () => {
  const feed = run({ targetProfile: quiet, currentProfile: absent });
  assert.equal(feed.applied_profile.disclosure, 'target_only');
  assert.equal(feed.applied_profile.current_profile_id, null);
  assert.deepEqual(feed.applied_profile.deltas, []);
  const results = evaluate({ feed, inputPhotoIds: photos.map(p => p.photo_id), currentProfile: absent, targetProfile: quiet, photoAnalyses: photos });
  assert.equal(results.E8.pass, true);
});

test('invalid or unevidenced profiles are rejected', () => {
  for (const value of [-1, 1.5, NaN, Infinity]) assert.throws(() => composeProfile(pair(value, 18)));
  const input = pair(120, 18);
  input.currentProfile.language.caption_len.evidence = [];
  assert.throws(() => composeProfile(input));
  assert.throws(() => composeProfile({ targetProfile: quiet }));
});

test('same target and photos stay identical when only the current profile changes', () => {
  const profiles = [absent, length(present, 2), length(present, 950)];
  const feeds = profiles.map(currentProfile => run({targetProfile:quiet,currentProfile}));
  const orders = feeds.map(feed => [...feed.slots].sort((a,b)=>a.position-b.position).map(slot=>slot.photo_id));
  assert.deepEqual(orders[0],orders[1]);
  assert.deepEqual(orders[1],orders[2]);
  for (const feed of feeds) {
    assert.equal(feed.applied_profile.disclosure,'target_only');
    assert.deepEqual(feed.applied_profile.deltas,[]);
  }
});

test('same measured photos and different targets change position-sorted photo IDs', () => {
  const ids = targetProfile => run({ targetProfile, currentProfile: present }).slots.sort((a, b) => a.position - b.position).map(s => s.photo_id);
  assert.notDeepEqual(ids(quiet), ids(detail));
});
