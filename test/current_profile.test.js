import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildCurrentProfile } from '../lib/current_profile.js';
import { validateProfile, validateDisclosure } from '../lib/contracts.js';

const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const NOW = '2026-09-17T00:00:00.000Z';
const round = n => Math.round(n * 100) / 100;
const snapshot = await read('fixtures/ig_snapshot.json');
const photos = await read('fixtures/photo_analysis.sample.json');
const carousels = snapshot.posts.filter(post => post.child_count >= 2);
// 수동 작성 합성 분석이다. 실제 비전 모델 출력이 아니며 file_ref 만 스냅샷의 캐러셀 1번 이미지에 맞춰 둔다.
const opener = (post, overrides) => ({
  schema_version: '1.0', photo_id: `syn_${post.shortcode}`, file_ref: post.opener_image, input_index: 0,
  color: { hue_mean: 30, sat_mean: 0.3, bright_mean: 0.6, palette_hex: ['#e8dfd2'] },
  composition: 'full_frame', scale: 'fullshot', subjects: ['합성 피사체'], has_face: false, text_in_image: null,
  describable_facts: ['수동 작성 합성 분석'], quality_flags: [], analysis_source: 'heuristic',
  model: 'manual-synthetic', analyzed_at: NOW, ...overrides
});

test('아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다', () => {
  for (const input of [undefined, null, {}, { photos: [] }, { snapshot: { provenance: { account: 'a' }, posts: [] } }]) {
    const profile = buildCurrentProfile(input, NOW);
    validateProfile(profile, 'current');
    assert.equal(profile.present, false);
    assert.equal(profile.source, 'none');
    assert.equal(profile.profile_id, null);
    assert.equal(profile.sample_size, 0);
    assert.equal(profile.language, null);
    assert.deepEqual(profile.visual, {});
    assert.deepEqual(profile.sequence, {});
  }
});

test('부재 프로필은 target_only 공개와 정합하다 (E8)', () => {
  const profile = buildCurrentProfile(undefined, NOW);
  validateDisclosure({ current_profile_id: null, disclosure: 'target_only', corrected: false, deltas: [] }, profile);
  assert.throws(() => validateDisclosure({ current_profile_id: 'invented', disclosure: 'corrected', corrected: true, deltas: [] }, profile));
});

test('스냅샷 재생 경로가 source:"cached" 프로필을 만든다', () => {
  const profile = buildCurrentProfile({ snapshot }, NOW);
  validateProfile(profile, 'current');
  assert.equal(profile.present, true);
  assert.equal(profile.source, 'cached');
  assert.equal(profile.sample_size, snapshot.posts.length);
  assert.equal(profile.sequence.carousel_count, carousels.length);
  assert.equal(profile.completeness.visual, 0, '스냅샷에는 사진 분석이 없으므로 visual 은 비어 있어야 한다');
  for (const claim of Object.values(profile.language)) {
    if (Array.isArray(claim)) continue;
    assert.ok(claim.evidence.length > 0 && claim.evidence.every(e => e.kind === 'ig_post'), '스냅샷 근거는 실제 게시물을 가리킨다');
  }
});

test('같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다', () => {
  assert.deepEqual(buildCurrentProfile({ snapshot }, NOW), buildCurrentProfile({ snapshot }, NOW));
  assert.equal(buildCurrentProfile({ snapshot }, NOW).profile_id, 'cur_cached_29cm_official');
});

test('네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다', async () => {
  const expected = JSON.stringify(buildCurrentProfile({ snapshot }, NOW));
  const script = `
    import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; import dns from 'node:dns';
    import { readFile } from 'node:fs/promises';
    let attempts=0; const denied=()=>{attempts++;throw new Error('Network disabled');};
    globalThis.fetch=denied;
    net.connect=net.createConnection=net.Socket.prototype.connect=denied;
    http.request=http.get=https.request=https.get=denied;
    dns.lookup=dns.resolve=dns.promises.lookup=dns.promises.resolve=denied;
    const {buildCurrentProfile}=await import('./lib/current_profile.js');
    const snapshot=JSON.parse(await readFile('fixtures/ig_snapshot.json','utf8'));
    process.stdout.write('attempts:'+attempts+'\\n'+JSON.stringify(buildCurrentProfile({snapshot},'${NOW}')));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 1 << 24 });
  assert.equal(result.status, 0, result.stderr);
  const [head, body] = result.stdout.split('\n');
  assert.equal(head, 'attempts:0');
  assert.equal(body, expected);
});

test('empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다', () => {
  const withoutCaptions = buildCurrentProfile({ photos }, NOW);
  validateProfile(withoutCaptions, 'current');
  assert.equal(withoutCaptions.language, null, '캡션을 관측하지 않았으면 언어 습관을 만들어내지 않는다');
  assert.equal(withoutCaptions.completeness.language, 0);

  const withCaptions = buildCurrentProfile({ photos, captions: photos.map((_, i) => (i % 2 ? '오늘은 여기까지 걸었어요' : '')) }, NOW);
  validateProfile(withCaptions, 'current');
  assert.ok(Object.hasOwn(withCaptions.language, 'empty_caption_ratio'));
  assert.equal(withCaptions.language.empty_caption_ratio.value, round(photos.filter((_, i) => i % 2 === 0).length / photos.length));
  assert.ok(withCaptions.completeness.language > 0);
});

test('캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다', () => {
  const profile = buildCurrentProfile({ photos, captions: photos.map(() => '') }, NOW);
  validateProfile(profile, 'current');
  assert.equal(profile.language.empty_caption_ratio.value, 1);
  for (const field of ['caption_len', 'emoji_rate', 'ending_style', 'linebreak_habit']) {
    assert.equal(Object.hasOwn(profile.language, field), false, `${field} 는 근거가 없으므로 생략한다`);
  }
  assert.equal(profile.completeness.language, 0.2);
});

test('캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다', () => {
  const profile = buildCurrentProfile({ photos: [photos[0]], captions: ['조용한 오후'] }, NOW);
  validateProfile(profile, 'current');
  assert.deepEqual(profile.language.caption_len.value, { p50: 6, p90: 6, unit: '자' });
});

test('opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다', () => {
  const withoutOpeners = buildCurrentProfile({ snapshot }, NOW);
  assert.equal(Object.hasOwn(withoutOpeners.sequence, 'opener_tendency'), false);
  assert.equal(withoutOpeners.completeness.sequence, 0.5);

  const openers = carousels.slice(0, 5).map((post, i) => opener(post, i < 4 ? {} : { scale: 'closeup' }));
  const withOpeners = buildCurrentProfile({ snapshot, openers }, NOW);
  validateProfile(withOpeners, 'current');
  assert.equal(withOpeners.sequence.opener_tendency.value, '풀샷');
  assert.equal(withOpeners.sequence.opener_tendency.confidence, 0.8);
  assert.equal(withOpeners.completeness.sequence, 1);
  assert.ok(withOpeners.sequence.opener_tendency.evidence.every(e => e.kind === 'ig_post' && e.ref.startsWith('29cm.official:')));
});

test('opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다', () => {
  const tied = buildCurrentProfile({ snapshot, openers: [opener(carousels[0]), opener(carousels[1], { scale: 'closeup' })] }, NOW);
  assert.equal(Object.hasOwn(tied.sequence, 'opener_tendency'), false, '동률은 판단이 아니다');

  const foreign = buildCurrentProfile({ snapshot, openers: [opener(carousels[0], { file_ref: 'images/무관한사진.jpg' })] }, NOW);
  assert.equal(Object.hasOwn(foreign.sequence, 'opener_tendency'), false, '이 스냅샷의 캐러셀이 아닌 분석은 근거가 아니다');

  const midshotOnly = buildCurrentProfile({ snapshot, openers: carousels.slice(0, 3).map(post => opener(post, { scale: 'midshot' })) }, NOW);
  assert.equal(Object.hasOwn(midshotOnly.sequence, 'opener_tendency'), false, '중간 스케일은 어느 성향의 증거도 아니다');
});

test("어떤 경로에서도 문자열 '불명' 이 나오지 않는다", () => {
  for (const input of [undefined, { snapshot }, { photos }, { photos, captions: photos.map(() => '') },
    { snapshot, openers: [opener(carousels[0]), opener(carousels[1], { scale: 'closeup' })] }]) {
    assert.equal(JSON.stringify(buildCurrentProfile(input, NOW)).includes('불명'), false);
  }
});

test('직접 업로드 경로가 사진 분석에서 visual 을 집계한다', () => {
  const profile = buildCurrentProfile({ photos }, NOW);
  validateProfile(profile, 'current');
  assert.equal(profile.source, 'photo_upload');
  assert.equal(profile.account_scope, 'n/a');
  assert.equal(profile.sample_size, photos.length);
  assert.equal(profile.sequence.carousel_count, 0, '업로드한 사진에서는 캐러셀 구조를 알 수 없다');
  assert.equal(Object.hasOwn(profile.visual, 'tone_words'), false, '숫자에서 낱말을 지어내지 않는다');
  for (const key of ['composition_mix', 'scale_mix']) {
    assert.ok(Math.abs(Object.values(profile.visual[key].value).reduce((sum, n) => sum + n, 0) - 1) < 1e-9);
  }
  assert.ok(profile.visual.palette.value.palette_hex.length <= 3);
});

test('hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다', () => {
  const at = hue => ({ ...photos[0], photo_id: `syn_hue_${hue}`, color: { ...photos[0].color, hue_mean: hue } });
  const profile = buildCurrentProfile({ photos: [at(359), at(1)] }, NOW);
  validateProfile(profile, 'current');
  const hue = profile.visual.palette.value.hue_mean;
  assert.ok(hue > 359.9 || hue < 0.1, `원형 평균이어야 한다: ${hue}`);
});

test('모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2)', () => {
  for (const input of [{ snapshot }, { photos, captions: photos.map(() => '짧게 적어요') }]) {
    const profile = buildCurrentProfile(input, NOW);
    validateProfile(profile, 'current'); // rule-only 근거는 validateClaim(profile=true) 가 거부한다
    for (const group of [profile.visual, profile.language ?? {}, profile.sequence]) {
      for (const [key, claim] of Object.entries(group)) {
        if (key === 'banned_words' || key === 'carousel_count') continue;
        assert.ok(claim.evidence.length > 0 && claim.evidence.every(e => e.kind !== 'rule'), key);
      }
    }
  }
});

test('입력을 섞거나 형식이 어긋나면 거부한다', () => {
  assert.throws(() => buildCurrentProfile({ snapshot, photos }, NOW), /one source/);
  assert.throws(() => buildCurrentProfile({ photos, captions: [] }, NOW), /caption count/);
  assert.throws(() => buildCurrentProfile({ photos, captions: photos.map(() => 1) }, NOW), /expected strings/);
  assert.throws(() => buildCurrentProfile({ photos: 'photos' }, NOW), /expected array/);
  assert.throws(() => buildCurrentProfile([], NOW), /expected object/);
  assert.throws(() => buildCurrentProfile({ snapshot: { posts: [{ shortcode: 'a', caption: '', child_count: 0 }], provenance: { account: 'a' } } }, NOW), /child_count/);
  assert.throws(() => buildCurrentProfile({ snapshot: { posts: [{ shortcode: 'a', caption: null, child_count: 1 }], provenance: { account: 'a' } } }, NOW), /caption/);
  assert.throws(() => buildCurrentProfile({ snapshot: { posts: [] } }, NOW), /account/);
  assert.throws(() => buildCurrentProfile({ photos: [{ ...photos[0], has_face: 'false' }] }, NOW), /has_face/);
});

test('스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다', () => {
  const check = snapshot.provenance.carousel_order_check;
  assert.equal(check.verdict, '같다');
  assert.ok(check.checked_posts.length >= 1 && check.checked_posts.every(post => post.mismatches === 0));
  assert.ok(check.method.length > 0 && check.limit.length > 0, '대조 방법과 그 한계가 같이 적혀 있어야 한다');
});

test('같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다', () => {
  const withoutCaptions = buildCurrentProfile({ photos }, NOW);
  const withCaptions = buildCurrentProfile({ photos, captions: photos.map(() => '짧게 적어요') }, NOW);
  assert.notEqual(withoutCaptions.profile_id, withCaptions.profile_id);
  assert.equal(buildCurrentProfile({ photos }, NOW).profile_id, withoutCaptions.profile_id);
});
