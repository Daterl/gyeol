// F2 순서 제안. PhotoAnalysis 배열 + 두 축 프로필 → OrderedFeed 하나.
// 모델 호출 0회, 네트워크 0회, 의존성 0개. 같은 입력은 같은 출력을 낸다(now 고정 시 바이트 단위로 같다).
// 근거로 쓰는 값은 docs/specs/12-order-proposal/spec.md 2절에서 실제 사진으로 확인한 것만이다:
//  - 쓴다: color.bright_mean · color.sat_mean · color.hue_mean (눈 대조 일치)
//  - 쓰되 이름을 믿지 않는다: composition 은 "여백"이 아니라 "한 색이 넓게 깔림"이다 (실사진 반례 1장)
//  - 쓰지 않는다: scale(휴리스틱 경로 고정값) · has_face === false(관측 못 함이지 없음이 아님)
// 지향 방향은 시각축이 비어 있어도 정해져야 한다. ig_reference 로 뽑은 지향축은 language 만 채우므로
// (eval/golden/case_01/target_detail.json 의 completeness.visual 은 0 이다) 시각축만 보면 방향이 없고,
// 방향이 없으면 프로필이 순서를 바꾸지 못한다 — S3 가 깨진다. 그래서 잰 캡션 길이를 마지막으로 읽는다.
import { createHash } from 'node:crypto';
import { ContractError, validateFeed, validateInputIds, validatePhoto, validateProfile } from './contracts.js';

// 아래 숫자는 측정값이 아니라 설계 상수다.
const WEIGHT = {
  quiet: p => 0.4 * p.bright + 0.4 * p.flat + 0.2 * (1 - p.sat),
  dense: p => 0.4 * (1 - p.flat) + 0.4 * p.sat + 0.2 * p.bright,
  none: p => 0.5 * p.bright + 0.5 * p.flat
};
// 캐러셀 경향은 "있으면 보태는 보너스"다(docs/intent.md 8절 A2). 측정값 차이가 큰 두 사진의
// 순서를 뒤집지 못하도록 상한을 작게 둔다.
const OPENER_BONUS = 0.15;
const TURN_RATIO = 2 / 3;
const TONE_WORDS = [
  ['quiet', ['조용', '차분', '고요', '잔잔', '여백', '심플', '미니멀', '담백', '짧게']],
  ['dense', ['자세', '기록', '촘촘', '빼곡', '화려', '선명', '풍부']]
];
const TENDENCY_SCALE = { 풀샷: 'fullshot', 클로즈업: 'closeup' };
const RULE_NOTE = {
  R1: '서사 규칙 R1 — 첫 자리는 지향 방향 점수가 가장 높은 사진',
  R2: '서사 규칙 R2 — 마지막 자리는 남은 사진 중 가장 어두운 사진',
  R3: '서사 규칙 R3 — 전환 자리는 남은 사진 중 채도가 가장 높은 사진',
  R4: '서사 규칙 R4 — 나머지는 앞자리 사진과 측정 색이 가장 먼 사진부터'
};
const DIRECTION_WORD = { quiet: '조용한 쪽', dense: '빼곡한 쪽', none: '기본' };
// 캡션 길이 기준선은 새로 만든 수치가 아니라 #10 매핑표(docs/specs/10-target-profile/spec.md 3절)에
// 이미 적힌 두 기준값 그대로다 — "짧게" → p50 15자, "자세하게" → p50 90자.
const CAPTION_QUIET = 15;
const CAPTION_DENSE = 90;

const round = (n, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;
const clone = value => structuredClone(value);

function attributes(analyses) {
  return analyses.map((analysis, order) => {
    validatePhoto(analysis);
    return {
      id: analysis.photo_id, order, index: analysis.input_index,
      bright: analysis.color.bright_mean, sat: analysis.color.sat_mean, hue: analysis.color.hue_mean,
      flat: analysis.composition === 'negative_space' ? 1 : 0,
      palette: analysis.color.palette_hex, facts: analysis.describable_facts,
      face: analysis.has_face === true, scale: analysis.scale, source: analysis.analysis_source
    };
  });
}

// 동점은 입력 순서가 이긴다. 그래서 출력이 결정적이다.
const pick = (pool, value) => [...pool].sort((a, b) => value(b) - value(a) || a.index - b.index || a.order - b.order)[0];

// 색상각은 채도가 낮으면 노이즈이므로 두 사진의 낮은 쪽 채도로 가중한다.
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return (d > 180 ? 360 - d : d) / 180; };
const distance = (a, b) =>
  0.5 * Math.abs(a.bright - b.bright) + 0.3 * Math.abs(a.sat - b.sat) + 0.2 * hueGap(a.hue, b.hue) * Math.min(a.sat, b.sat);

// 지향 방향은 한 번만 정한다. 구조화된 수치가 있으면 그것이 이기고, 없으면 사용자가 쓴 말의 해석이며,
// 둘 다 없으면 방향 없이 기본 규칙만 쓴다. 애매하면 한쪽으로 밀지 않는다.
function resolveDirection(target) {
  const mix = target.visual?.composition_mix;
  if (mix) return {
    kind: mix.value.negative_space >= 0.5 ? 'quiet' : 'dense', confidence: 1, evidence: clone(mix.evidence),
    note: `지향 구성비 negative_space ${mix.value.negative_space} 로 방향을 정했다`
  };
  const tone = target.visual?.tone_words;
  if (tone) {
    const text = tone.value.join(' ');
    const hits = TONE_WORDS.filter(([, words]) => words.some(word => text.includes(word))).map(([kind]) => kind);
    if (hits.length === 1) return {
      kind: hits[0], confidence: 0.5, evidence: clone(tone.evidence),
      note: `지향 문구 "${text}" 를 ${DIRECTION_WORD[hits[0]]}으로 읽었다 (측정이 아니라 해석이다)`
    };
  }
  // 시각축이 통째로 비어 있는 지향(ig_reference 경로)도 방향을 가질 수 있다. 캡션 길이는 실제 게시물에서
  // 잰 값이고 "한 게시물에 얼마나 많이 담는 계정인가"를 말한다. 다만 사용자가 시각 의도를 말한 것이
  // 아니라 언어축을 건너 읽은 해석이므로 문구 해석(0.5)보다 낮은 확신으로 쓰고, 두 기준값 사이는
  // 애매하므로 한쪽으로 밀지 않는다.
  const length = target.language?.caption_len;
  if (length) {
    const p50 = length.value.p50;
    const kind = p50 >= CAPTION_DENSE ? 'dense' : p50 <= CAPTION_QUIET ? 'quiet' : null;
    if (kind) return {
      kind, confidence: 0.4, evidence: clone(length.evidence),
      note: `지향에 구성비도 문구도 없어 잰 캡션 길이 p50 ${p50}자를 ${DIRECTION_WORD[kind]}으로 읽었다 (시각 의도가 아니라 언어축을 건너 읽은 해석이다)`
    };
  }
  return { kind: 'none', confidence: 1, evidence: [], note: '지향에 구성비도 문구도 없고 캡션 길이도 두 기준값 사이라 기본 규칙만 썼다' };
}

// 캐러셀 학습은 관측된 경향이 있을 때만 켜진다. carousel_count 가 0 이면 계약상 opener_tendency 는
// 없거나 "불명" 이므로 이 경로가 자동으로 꺼진다. 추측으로 켜지지 않는다.
function openerBonus(photo, target) {
  const tendency = target.sequence?.opener_tendency;
  if (!tendency || tendency.value === '불명') return null;
  if (tendency.value === '인물' && photo.face) return { evidence: clone(tendency.evidence), note: '얼굴이 관측된 사진' };
  // scale 은 휴리스틱 경로에서 고정값이라 근거가 되지 못한다. 모델이 본 사진에만 적용한다.
  if (TENDENCY_SCALE[tendency.value] && photo.source === 'vision_model' && photo.scale === TENDENCY_SCALE[tendency.value])
    return { evidence: clone(tendency.evidence), note: `모델이 본 scale 이 ${photo.scale}` };
  return null;
}

const measured = photo =>
  `측정값 — 밝기 ${round(photo.bright)} · 채도 ${round(photo.sat)} · ${photo.flat ? '한 색이 넓게 깔림' : '한 색이 넓게 깔리지 않음'}`
  + (photo.palette[0] ? ` · 주요 색 ${photo.palette[0]}` : '');

// 첫 자리 문장. 보너스가 순서를 뒤집었으면 "측정 점수가 가장 높다"고 말해선 안 된다 —
// 실제 결정 원인은 측정 점수 + 보너스의 총점이다. 그래서 무보너스 점수 1위인지를 받아서 갈라 쓴다.
function openerText({ bright, sat, flatWord, direction, count, bonus, score }) {
  const look = `밝기 ${bright} · 채도 ${sat} · ${flatWord}`;
  const label = direction.kind === 'none' ? '첫 자리 기본 규칙' : `지향 방향(${DIRECTION_WORD[direction.kind]})`;
  if (!bonus) return direction.kind === 'none'
    ? `밝기 ${bright} · ${flatWord}이라 첫 자리 기본 규칙에 입력 ${count}장 중 가장 잘 맞아 1번에 뒀다`
    : `${look}이라 ${label} 점수가 입력 ${count}장 중 가장 높아 1번에 뒀다`;
  return score.topByMeasure
    ? `${look}이라 ${label} 측정 점수가 ${round(score.base)} 로 입력 ${count}장 중 가장 높아 1번에 뒀다. 캐러셀 여는 사진 경향 보너스 ${OPENER_BONUS} 도 같은 방향이다 — ${bonus.note}.`
    : `${look}이다. ${label} 측정 점수는 ${round(score.base)} 로 입력 ${count}장 중 1위가 아니지만, 보너스 ${OPENER_BONUS} 를 더한 총점이 ${round(score.base + OPENER_BONUS)} 로 가장 높아 1번에 뒀다 — 캐러셀 여는 사진 경향, ${bonus.note}.`;
}

function rationale({ photo, role, rule, position, previous, direction, count, bonus, score }) {
  const bright = round(photo.bright), sat = round(photo.sat);
  const flatWord = photo.flat ? '한 색이 넓게 깔린 화면' : '한 색이 넓게 깔리지 않은 화면';
  const text = {
    opener: openerText({ bright, sat, flatWord, direction, count, bonus, score }),
    sustain: previous
      ? `앞자리 사진과 측정 색 거리 ${round(distance(previous, photo))} 로 남은 사진 중 가장 멀어 ${position}번에 뒀다 (밝기 ${bright} · 채도 ${sat})`
      : `밝기 ${bright} · 채도 ${sat} 로 ${position}번에 뒀다`,
    turn: `채도 ${sat} 로 남은 사진 중 가장 진해 ${position}번 전환 자리에 뒀다`,
    closer: `밝기 ${bright} 로 남은 사진 중 가장 어두워 마지막 ${position}번에 뒀다`
  }[role];
  const evidence = [{ kind: 'uploaded_photo', ref: photo.id, note: measured(photo) }];
  if (role === 'opener') evidence.push(...direction.evidence);
  if (bonus) evidence.push(...bonus.evidence);
  evidence.push({
    kind: 'rule', ref: `order.${rule}`,
    note: RULE_NOTE[rule] + (role === 'opener' ? `. ${direction.note}` : '')
      + (bonus ? `. 캐러셀에서 배운 여는 사진 경향과 같아 보너스 ${OPENER_BONUS} 를 더했다 — ${bonus.note}` : '')
  });
  return { value: text, confidence: role === 'opener' ? direction.confidence : 1, evidence };
}

export function orderFeed({ photoAnalyses, targetProfile, currentProfile, sessionId, feedId, now } = {}) {
  if (!Array.isArray(photoAnalyses)) throw new ContractError('photoAnalyses', 'expected array');
  const photos = attributes(photoAnalyses);
  const ids = photos.map(photo => photo.id);
  validateInputIds(ids);
  validateProfile(targetProfile, 'target');
  validateProfile(currentProfile, 'current');

  const count = photos.length;
  const direction = resolveDirection(targetProfile);
  const bonuses = new Map(photos.map(photo => [photo.id, openerBonus(photo, targetProfile)]));
  const peakId = pick(photos, photo => photo.sat).id;
  // 무보너스 방향 점수와 그 1위. 근거 문장이 "측정 점수가 1위"라고 말할 자격이 있는지 판단하는 데만 쓴다.
  const directionScore = photo => WEIGHT[direction.kind](photo);
  const topByMeasureId = pick(photos, directionScore).id;

  const pool = new Map(photos.map(photo => [photo.id, photo]));
  const take = value => { const photo = pick(pool.values(), value); pool.delete(photo.id); return photo; };
  const placed = new Array(count + 1);
  placed[1] = { photo: take(photo => directionScore(photo) + (bonuses.get(photo.id) ? OPENER_BONUS : 0)), role: 'opener', rule: 'R1' };
  placed[count] = { photo: take(photo => -photo.bright), role: 'closer', rule: 'R2' };
  const turnPosition = Math.min(count - 1, Math.max(2, Math.ceil(count * TURN_RATIO)));
  placed[turnPosition] = { photo: take(photo => photo.sat), role: 'turn', rule: 'R3' };
  // 알려진 천장: 그리디라서 앞자리가 먼 사진을 먼저 가져가고 뒤쪽에 비슷한 사진이 남는다.
  // 전역 최적은 15~20장에서 눈에 띄는 개선인지 확인하지 않았으므로 하지 않는다(spec.md 4-2).
  for (let position = 2; position < count; position++) {
    if (placed[position]) continue;
    const previous = placed[position - 1].photo;
    placed[position] = { photo: take(photo => distance(previous, photo)), role: 'sustain', rule: 'R4' };
  }

  const slots = [];
  for (let position = 1; position <= count; position++) {
    const { photo, role, rule } = placed[position];
    const previous = position > 1 ? placed[position - 1].photo : null;
    const bonus = position === 1 ? bonuses.get(photo.id) : null;
    slots.push({
      position, photo_id: photo.id, narrative_role: role,
      rationale: rationale({ photo, role, rule, position, previous, direction, count, bonus, score: { base: directionScore(photo), topByMeasure: photo.id === topByMeasureId } }),
      caption_inputs: {
        describable_facts: [...photo.facts],
        adjacent_overlap: previous ? round(1 - distance(previous, photo)) : 0,
        is_visual_peak: photo.id === peakId
      }
    });
  }

  const digest = createHash('sha1').update(ids.join('|')).digest('hex').slice(0, 8);
  const feed = {
    schema_version: '1.0',
    feed_id: feedId ?? `fd_${targetProfile.profile_id}_${digest}`,
    session_id: sessionId ?? `ss_${digest}`,
    applied_profile: {
      target_profile_id: targetProfile.profile_id,
      current_profile_id: currentProfile.present ? currentProfile.profile_id : null,
      // 두 축 합성과 caption_len_gap 델타는 #13 소관이다. F2 는 지향축만 그대로 싣는다.
      corrected: false, disclosure: 'target_only', deltas: [],
      visual: clone(targetProfile.visual), language: clone(targetProfile.language), sequence: clone(targetProfile.sequence)
    },
    slots,
    invariants: { input_count: count, output_count: slots.length, unique_photo_ids: true },
    generated_at: now ?? new Date().toISOString()
  };
  validateFeed(feed, ids, currentProfile, targetProfile, photoAnalyses);
  return feed;
}
