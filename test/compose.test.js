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

test('120/18 yields one evidenced delta, 47 chars and honest correction', () => {
  const input = pair(120, 18);
  const before = structuredClone(input);
  const result = run(input).applied_profile;
  assert.equal(result.corrected, true);
  assert.equal(result.disclosure, 'corrected');
  assert.equal(result.deltas.length, 1);
  const delta = result.deltas[0];
  assert.deepEqual([delta.target, delta.current, delta.resolved, delta.rule], [120, 18, 47, 'log_midpoint']);
  assert.equal(delta.note_key, 'caption_len_gap');
  assert.equal(result.language.caption_len.value.p50, 47);
  assert.deepEqual(delta.evidence.slice(0, -1), [...input.targetProfile.language.caption_len.evidence, ...input.currentProfile.language.caption_len.evidence]);
  assert.deepEqual(result.visual, input.targetProfile.visual);
  assert.deepEqual(result.sequence, input.targetProfile.sequence);
  assert.deepEqual(input, before);
  result.language.caption_len.evidence[0].note = 'mutation';
  assert.deepEqual(input, before);
  assert.notEqual(delta.evidence[0].note, 'mutation');
  assert.equal(Object.hasOwn(delta, 'text'), false);
});

for (const [t, c, expected] of [[0, 120, 10], [120, 0, 10], [18, 120, 47], [0, 0, 0], [1, 2, 1], [120, 120, 120]]) {
  test(`boundary ${t}/${c}: ${expected}`, () => {
    const result = run(pair(t, c)).applied_profile;
    assert.equal(result.language.caption_len.value.p50, expected);
    assert.ok(result.language.caption_len.value.p90 >= expected);
    assert.equal(result.deltas.length, expected === t ? 0 : 1);
    assert.equal(result.disclosure, expected === t ? 'target_only' : 'corrected');
  });
}

test('absent current completes pipeline and E8 with no delta', () => {
  const feed = run({ targetProfile: quiet, currentProfile: absent });
  assert.equal(feed.applied_profile.disclosure, 'target_only');
  assert.equal(feed.applied_profile.current_profile_id, null);
  assert.deepEqual(feed.applied_profile.deltas, []);
  const results = evaluate({ feed, inputPhotoIds: photos.map(p => p.photo_id), currentProfile: absent, targetProfile: quiet, photoAnalyses: photos });
  assert.equal(results.E8.pass, true);
});

test('missing caption measurement is not a fabricated gap', () => {
  for (const axis of ['targetProfile', 'currentProfile']) {
    const input = pair(120, 18);
    delete input[axis].language.caption_len;
    const result = run(input).applied_profile;
    assert.equal(result.disclosure, 'target_only');
    assert.deepEqual(result.deltas, []);
  }
});

test('invalid or unevidenced profiles are rejected', () => {
  for (const value of [-1, 1.5, NaN, Infinity]) assert.throws(() => composeProfile(pair(value, 18)));
  const input = pair(120, 18);
  input.currentProfile.language.caption_len.evidence = [];
  assert.throws(() => composeProfile(input));
  assert.throws(() => composeProfile({ targetProfile: quiet }));
});

// 지향축이 순서를 가른다는 주장이다. 그래서 보정축을 absent 로 둔다 — #99 이후 보정축도 방향 판단에
// 관여하므로(lib/order.js resolveDirection), 보정축이 present 인 채로는 지향축만 격리되지 않는다.
// 이 테스트가 present 를 쓰던 시절에는 보정축이 순서에 닿지 않아 격리가 저절로 됐던 것뿐이다.
// 주장과 단언은 그대로 두고 격리 조건만 바로잡았다. 보정축이 있는 경우는 바로 아래 테스트가 따로 증명한다.
const orderIds = options => run(options).slots.sort((a, b) => a.position - b.position).map(s => s.photo_id);

test('same measured photos and different targets change position-sorted photo IDs', () => {
  const ids = targetProfile => orderIds({ targetProfile, currentProfile: absent });
  assert.notDeepEqual(ids(quiet), ids(detail));
});

// #99: 위 테스트가 보정축을 absent 로 격리했으므로, "보정축이 있어도 지향이 순서를 가른다" 를 여기서 따로 고정한다.
// 보정축 캡션 120자는 detail(292자)과 합성해도 방향 버킷(>=90자)을 무너뜨리지 않는 값이라
// 지향축의 효과가 보정축에 삼켜지지 않는다.
test('different targets still change the order while a current profile is present', () => {
  const currentProfile = length(present, 120);
  const ids = targetProfile => orderIds({ targetProfile, currentProfile });
  assert.notDeepEqual(ids(quiet), ids(detail));
});
