// #99 회귀: 보정축(CurrentProfile)이 순서에 실제로 영향을 주고, 그 사실이 근거에 드러나며,
// 보정축이 비어 있으면 아무것도 바뀌지 않는다는 것을 고정한다.
// 대조는 반드시 position 오름차순으로 정렬한 photo_id 배열로 한다 —
// slots[].position 끼리 비교하면 언제나 [1..N] 이라 어떤 회귀도 잡지 못한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composeFeed } from '../lib/compose.js';
import { buildCurrentProfile } from '../lib/current_profile.js';
import { extractFromReference } from '../lib/target_profile.js';

const NOW = '2026-09-18T00:00:00.000Z';
const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const all = await read('test/order.real20.json');
const photos = all.slice(0, 11);       // 이번 회차 입력 사진
const currentPhotos = all.slice(11, 14); // 보정축이 관측한 내 과거 사진 3장
const target = await extractFromReference('https://instagram.com/29cm', { createdAt: NOW });
const snapshot = await read('fixtures/ig_snapshot.json');

// #99 가 기록한 수정 전 순서. 보정축 4종이 전부 이 배열이었다.
const BEFORE = ['ph_07', 'ph_11', 'ph_02', 'ph_09', 'ph_01', 'ph_03', 'ph_06', 'ph_04', 'ph_10', 'ph_08', 'ph_05'];

const current = {
  none: buildCurrentProfile(undefined, new Date(NOW)),
  ig: buildCurrentProfile({ snapshot }, new Date(NOW)),
  short: buildCurrentProfile({ photos: currentPhotos, captions: ['오늘', '비', 'ㅎㅎ'] }, new Date(NOW)),
  long: buildCurrentProfile({ photos: currentPhotos, captions: Array(3).fill('가'.repeat(950)) }, new Date(NOW))
};
const feedOf = (currentProfile, currentPhotoAnalyses = []) =>
  composeFeed({ photoAnalyses: photos, targetProfile: target, currentProfile, currentPhotoAnalyses, now: NOW });
const orderOf = feed => [...feed.slots].sort((a, b) => a.position - b.position).map(slot => slot.photo_id);
const opener = feed => feed.slots.find(slot => slot.position === 1).rationale;

test('#99 보정축만 바꿔도 순서가 갈린다 — 캡션 2자와 950자가 다른 photo_id 배열을 낸다', () => {
  const short = orderOf(feedOf(current.short, currentPhotos));
  const long = orderOf(feedOf(current.long, currentPhotos));
  assert.notDeepEqual(short, long, '보정축이 극단으로 달라도 순서가 같으면 제품이 스타일 프리셋이다 (W4)');
  // 두 배열은 같은 사진 11장의 순열이어야 한다. 사진이 사라지거나 생기면 안 된다.
  assert.deepEqual([...short].sort(), [...long].sort());
});

test('#99 보정축이 비어 있으면 수정 전과 한 자리도 다르지 않다', () => {
  // 없는 축이 기본값으로 순서를 움직이면 #9·#12·#41·#69·#96 과 같은 함정의 여섯 번째가 된다.
  assert.deepEqual(orderOf(feedOf(current.none)), BEFORE);
});

test('#99 보정축이 순서를 바꾸면 그 사실이 1번 자리 근거에 드러난다 (P2)', () => {
  const feed = feedOf(current.short, currentPhotos);
  const { value, evidence } = opener(feed);
  // 두 관측값과 합성값이 사용자에게 보이는 문장에 전부 있어야 한다.
  for (const shown of ['292', '2자', '29자']) assert.ok(value.includes(shown), `근거 문장에 ${shown} 가 없다: ${value}`);
  // 보정축 근거는 프로필 ID 로 추적된다. 원근거 전문은 applied_profile.deltas 에 있다.
  const pointer = evidence.find(item => item.kind === 'aggregate' && item.ref === current.short.profile_id);
  assert.ok(pointer, '1번 자리 근거가 보정축 프로필을 가리키지 않는다');
  assert.equal(feed.applied_profile.deltas[0].current, current.short.language.caption_len.value.p50);
});

test('#99 보정축이 방향에 쓰이지 않았으면 근거가 보정축을 언급하지 않는다', () => {
  // 안 쓴 값을 썼다고 말하는 것은 반대 방향의 같은 거짓말이다.
  const { value, evidence } = opener(feedOf(current.none));
  assert.ok(!value.includes('보정축'), `보정축이 없는데 근거가 보정축을 말한다: ${value}`);
  assert.ok(!evidence.some(item => item.kind === 'aggregate' && item.ref?.startsWith('cur_')));
});

test('#99 같은 입력은 같은 순서를 낸다 — 무작위성이 섞이지 않았다', () => {
  for (const [name, profile] of Object.entries(current)) {
    const photoSet = name === 'short' || name === 'long' ? currentPhotos : [];
    assert.deepEqual(orderOf(feedOf(profile, photoSet)), orderOf(feedOf(profile, photoSet)), `${name} 이 결정적이지 않다`);
  }
});
