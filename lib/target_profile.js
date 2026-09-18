// TargetProfile extraction. Built-ins only, zero model calls, zero network.
// Photo-only input never becomes a TargetProfile: schemas/target_profile.md allows
// axis=target only with present=true and source ig_reference|freetext.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ContractError, validateClaim, validateProfile, validatePhoto, validatePhotoPlan } from './contracts.js';

export class UnsupportedReferenceError extends Error {
  constructor(requested, supported) {
    super(`Reference snapshot is not prepared for ${requested}`);
    this.name = 'UnsupportedReferenceError';
    this.code = 'REFERENCE_NOT_PREPARED';
    this.requested = requested;
    this.supported = supported;
    this.fallbacks = ['freetext', 'photo_only'];
  }
}

const BANNED_WORDS = ['이처럼', '또한', '이를 통해', '이러한', '마침내'];
const NOT_HANDLE = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 's', 'accounts', 'direct']);
const round2 = n => Math.round(n * 100) / 100;
const id = (prefix, seed) => `${prefix}_${createHash('sha1').update(seed).digest('hex').slice(0, 8)}`;
// 반환값은 호출자 소유다. 모듈 상수(LEXICON.value, BANNED_WORDS)를 그대로 넘기면
// 호출자가 결과를 고칠 때 다음 호출이 오염된다.
const claim = (value, confidence, evidence) => ({ value: structuredClone(value), confidence, evidence });

// ── reference URL → prepared snapshot ────────────────────────────────────────
export function referenceHandle(url) {
  let parsed;
  try { parsed = new URL(String(url).trim()); } catch { return null; }
  if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
  const first = parsed.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  if (!first || NOT_HANDLE.has(first)) return null;
  return first;
}
export async function loadDefaultRegistry() {
  const snapshot = JSON.parse(await readFile(new URL('../fixtures/ref_snapshot.sample.json', import.meta.url), 'utf8'));
  return { [snapshot.handle]: snapshot };
}
// Never substitutes another account's snapshot for an unknown handle.
export function resolveReference(url, registry) {
  const supported = Object.keys(registry ?? {});
  const handle = referenceHandle(url);
  if (!handle || !Object.hasOwn(registry ?? {}, handle)) throw new UnsupportedReferenceError(handle ?? String(url), supported);
  return { handle, snapshot: registry[handle] };
}

// ── caption statistics ───────────────────────────────────────────────────────
const EMOJI = /\p{Extended_Pictographic}/gu;
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
// Korean date notation ("9. 30 (수)") must not be read as a sentence end, and a
// trailing schedule line is not a sentence: take the last segment that has words.
const lastSentence = caption => {
  const cleaned = caption.replace(/[#@][^\s#@]+/gu, ' ').replace(EMOJI, ' ').replace(/(?<=\d)\s*\.\s*(?=\d)/gu, '·');
  const parts = cleaned.split(/[.!?…\n]+/u).map(s => s.trim()).filter(s => (s.match(/[가-힣]/gu) ?? []).length >= 4);
  return parts.at(-1) ?? '';
};
const endingOf = caption => {
  const t = lastSentence(caption).replace(/[\s~!?.,·"'”’)\]]+$/u, '');
  if (!t) return null;
  if (/[요용]$/u.test(t)) return '해요';
  if (/[다죠까]$/u.test(t)) return '다';
  if (/[가-힣A-Za-z0-9]$/u.test(t)) return '명사형';
  return null;
};
// Indices of the k values closest to target, so an average still points at real posts.
const nearest = (values, target, k) => values
  .map((v, i) => [Math.abs(v - target), i]).sort((a, b) => a[0] - b[0]).slice(0, k).map(([, i]) => i);

// ── evidence builders ────────────────────────────────────────────────────────
const aggregateEvidence = (snapshot, note, posts, describe) => [
  { kind: 'aggregate', ref: snapshot.snapshot_id, note },
  ...posts.map(p => ({ kind: 'ig_post', ref: p.shortCode, note: describe(p) }))
];
const textEvidence = (profileId, phrase) => ({ kind: 'user_text', ref: `${profileId}:${phrase}`, note: `입력 문장에서 "${phrase}" 를 찾았다` });
const ruleEvidence = row => ({ kind: 'rule', ref: 'docs/specs/10-target-profile/spec.md#3', note: row });

// ── path 1: prepared reference snapshot ──────────────────────────────────────
export async function extractFromReference(url, { registry, profileId, createdAt } = {}) {
  const { handle, snapshot } = resolveReference(url, registry ?? await loadDefaultRegistry());
  const posts = snapshot.posts ?? [];
  if (posts.length === 0) throw new ContractError('ref_snapshot.posts', 'snapshot has no posts');
  const written = posts.filter(p => (p.caption ?? '').trim().length > 0);
  const language = {};

  if (written.length > 0) {
    const lengths = written.map(p => p.caption.length);
    const sorted = [...lengths].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p90 = Math.max(percentile(sorted, 0.9), p50);
    language.caption_len = claim({ p50, p90, unit: '자' }, 0.9, aggregateEvidence(
      snapshot, `비어 있지 않은 캡션 ${written.length}건의 길이 분포`,
      [written[lengths.indexOf(p50)], written[lengths.indexOf(percentile(sorted, 0.9))]].filter(Boolean),
      p => `캡션 ${p.caption.length}자`));

    const counts = written.map(p => (p.caption.match(EMOJI) ?? []).length);
    const rate = round2(counts.reduce((a, b) => a + b, 0) / written.length);
    language.emoji_rate = claim(rate, 0.9, aggregateEvidence(
      snapshot, `캡션 ${written.length}건의 그림문자 코드포인트 평균`,
      nearest(counts, rate, 2).map(i => written[i]), p => `그림문자 ${(p.caption.match(EMOJI) ?? []).length}개`));

    const endings = written.map(p => endingOf(p.caption));
    const classified = endings.filter(Boolean);
    if (classified.length > 0) {
      const tally = classified.reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map());
      const [top, hits] = [...tally].sort((a, b) => b[1] - a[1])[0];
      const share = hits / classified.length;
      const style = share >= 0.6 ? top : '혼합';
      language.ending_style = claim(style, round2(share), aggregateEvidence(
        snapshot, `분류된 캡션 ${classified.length}건 중 "${top}" ${hits}건 (${Math.round(share * 100)}%)`,
        written.filter((_, i) => endings[i] === top).slice(0, 2), p => `마지막 문장 "${lastSentence(p.caption).slice(-20)}"`));
    }

    const lineCounts = written.map(p => p.caption.split('\n').length);
    const lineLens = written.map(p => {
      const lines = p.caption.split('\n').map(l => l.trim()).filter(Boolean);
      return lines.reduce((a, l) => a + l.length, 0) / lines.length;
    });
    const meanLines = lineCounts.reduce((a, b) => a + b, 0) / written.length;
    const meanLen = lineLens.reduce((a, b) => a + b, 0) / written.length;
    const habit = meanLines < 1.5 ? '없음' : (meanLen < 25 && meanLines >= 3 ? '짧게 자주' : '문단');
    language.linebreak_habit = claim(habit, 0.7, aggregateEvidence(
      snapshot, `캡션당 평균 ${round2(meanLines)}줄, 줄당 평균 ${round2(meanLen)}자`,
      nearest(lineCounts, meanLines, 2).map(i => written[i]), p => `${p.caption.split('\n').length}줄`));

    const emptyRatio = round2((posts.length - written.length) / posts.length);
    language.empty_caption_ratio = claim(emptyRatio, 0.95, aggregateEvidence(
      snapshot, `게시물 ${posts.length}건 중 빈 캡션 ${posts.length - written.length}건`, [], () => ''));
    language.banned_words = [...BANNED_WORDS];
  }

  const filled = Object.keys(language).filter(k => k !== 'banned_words').length;
  return validateProfileEvidence(validateProfile({
    schema_version: '1.0',
    profile_id: profileId ?? id('tgt_ig', `${snapshot.snapshot_id}:${handle}`),
    axis: 'target',
    present: true,
    source: 'ig_reference',
    account_scope: 'n/a',
    sample_size: posts.length,
    // Reference images are never analysed: docs/intent.md C2 removed that path.
    completeness: { visual: 0, language: round2(filled / 5), sequence: 0 },
    visual: {},
    language: filled > 0 ? language : null,
    sequence: { carousel_count: posts.filter(p => (p.child_count ?? 0) >= 2).length },
    raw_freetext: null,
    created_at: createdAt ?? new Date().toISOString()
  }, 'target'), { snapshot });
}

// ── evidence 는 "있는가" 가 아니라 "실제 입력에 닿는가" 로 본다 ───────────
// PR #21 의 E9·E10 이 feed 경계에서 한 일을 프로필 경계에서 같은 방식으로 한다.
// 의미 분석은 하지 않는다 — 참조가 실제 입력으로 해소되는지만 대조한다.
// snapshot 은 ig_reference 경로, photoIds 는 photo_only 경로가 쓴다. freetext 는
// 자기 raw_freetext 를 가지고 있으므로 추가 입력이 필요 없다.
export function validateProfileEvidence(profile, { snapshot, photoIds } = {}) {
  const src = profile?.source;
  const posts = new Set((snapshot?.posts ?? []).map(p => p.shortCode));
  const photos = new Set(photoIds ?? []);
  const raw = profile?.raw_freetext ?? '';
  const bad = (path, message) => { throw new ContractError(path, message); };
  const check = (e, path) => {
    if (e.kind === 'rule') return;                       // 명세 포인터다. rule-only 는 validateClaim 이 이미 막는다.
    if (e.kind === 'aggregate') {
      if (src === 'ig_reference' && e.ref !== snapshot?.snapshot_id) bad(`${path}.ref`, 'aggregate evidence does not resolve to the actual snapshot');
      if (src === 'photo_only' && e.ref !== `photo_analysis:n=${profile.sample_size}`) bad(`${path}.ref`, 'aggregate evidence does not resolve to the actual photo set');
      return;
    }
    if (e.kind === 'ig_post') {
      if (src !== 'ig_reference') bad(`${path}.kind`, `a ${src} profile cannot cite an Instagram post`);
      if (!posts.has(e.ref)) bad(`${path}.ref`, 'does not resolve to a post in the actual snapshot');
      return;
    }
    if (e.kind === 'user_text') {
      if (src !== 'freetext') bad(`${path}.kind`, `a ${src} profile cannot cite the user's own sentence`);
      const colon = e.ref.indexOf(':');
      const owner = colon < 0 ? e.ref : e.ref.slice(0, colon);
      const quote = colon < 0 ? '' : e.ref.slice(colon + 1);
      if (owner !== profile.profile_id) bad(`${path}.ref`, 'user_text evidence belongs to another profile');
      if (quote !== 'raw' && !raw.includes(quote)) bad(`${path}.ref`, 'quoted phrase is not in the actual input sentence');
      return;
    }
    if (e.kind === 'uploaded_photo' && !photos.has(e.ref)) bad(`${path}.ref`, 'does not resolve to an actual input photo');
  };
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && typeof node.kind === 'string' && typeof node.ref === 'string') check(node, path);
    for (const [k, child] of Object.entries(node)) walk(child, `${path}.${k}`);
  };
  walk(profile, src === 'photo_only' ? 'PhotoPlan' : 'targetProfile');
  return profile;
}

// ── path 2: free text ────────────────────────────────────────────────────────
const LEXICON = [
  { field: 'caption_len', words: ['짧게', '간결', '짤막', '한 줄'], value: { p50: 15, p90: 30, unit: '자' }, confidence: 0.6, row: '짧게·간결·짤막·한 줄 → p50 15자 / p90 30자' },
  { field: 'caption_len', words: ['길게', '자세히', '자세하게', '디테일', '꼼꼼'], value: { p50: 90, p90: 180, unit: '자' }, confidence: 0.6, row: '길게·자세히·디테일·꼼꼼 → p50 90자 / p90 180자' },
  { field: 'emoji_rate', words: ['이모지 없이', '이모티콘 없이', '이모지 안', '이모지는 빼'], value: 0, confidence: 0.7, row: '이모지 없이 → 0개' },
  { field: 'emoji_rate', words: ['이모지 많이', '이모지 잔뜩', '이모지 팍팍'], value: 1.5, confidence: 0.5, row: '이모지 많이 → 1.5개' },
  { field: 'ending_style', words: ['해요', '존댓말'], value: '해요', confidence: 0.6, row: '해요·존댓말 → 해요체' },
  { field: 'ending_style', words: ['담백', '문어체', '단정하게'], value: '다', confidence: 0.6, row: '담백·문어체 → 다체' },
  { field: 'ending_style', words: ['명사형', '단어로'], value: '명사형', confidence: 0.6, row: '명사형·단어로 → 명사형' },
  { field: 'linebreak_habit', words: ['줄바꿈 없이', '한 덩어리', '붙여서'], value: '없음', confidence: 0.6, row: '줄바꿈 없이 → 없음' },
  { field: 'linebreak_habit', words: ['짧게 자주', '행갈이', '자주 끊어'], value: '짧게 자주', confidence: 0.6, row: '짧게 자주·행갈이 → 짧게 자주' },
  { field: 'linebreak_habit', words: ['문단', '단락'], value: '문단', confidence: 0.6, row: '문단·단락 → 문단' }
];
const COVERAGE_PATTERNS = [
  { pattern: /말수가\s*적/gu, value: 'sparse', row: '말수가 적 → sparse' },
  { pattern: /말수(?:는)?\s*적게/gu, value: 'sparse', row: '말수 적게 → sparse' },
  { pattern: /일부(?:는)?\s*(?:비우|비워)/gu, value: 'sparse', row: '일부는 비워 → sparse' },
  { pattern: /사진만\s*(?:두|둬)/gu, value: 'sparse', row: '사진만 두 → sparse' },
  { pattern: /몇\s*장(?:만|에만)\s*(?:(?:문장|캡션|글|한\s*줄)|자세히\s*(?:쓰|써)|(?:쓰|써))/gu, value: 'sparse', row: '몇 장에만 문장·글을 쓰기 → sparse' },
  { pattern: /모든\s*사진에\s*(?:(?:문장|캡션|글|한\s*줄)|짧게\s*(?:쓰|써)|(?:쓰|써))/gu, value: 'all', row: '모든 사진에 문장·글을 쓰기 → all' },
  { pattern: /사진마다\s*(?:(?:한\s*줄|문장|캡션|글)|(?:쓰|써))/gu, value: 'all', row: '사진마다 문장·글을 쓰기 → all' },
  { pattern: /한\s*장도\s*비우지/gu, value: 'all', row: '한 장도 비우지 → all', intrinsicNegative: true },
  { pattern: /전부\s*(?:쓰|써|채우|채워)/gu, value: 'all', row: '전부 쓰기·채우기 → all' }
];
const UNSUPPORTED_COVERAGE = /(?:캡션\s*없이|전부\s*사진만)/u;
// 사용자가 부정·대조로 말한 것을 긍정으로 뒤집지 않는다. 의미를 반대로 해석하는 것도
// 아니다 — 부정이 섞인 절은 통째로 버리고 그 항목을 비운다(P3). NLP 도 새 모델도 쓰지 않는다.
const clauses = text => text.split(/[,·\n]|그리고|하고\s/u).map(s => s.trim().replace(/[.!?]+$/u, '')).filter(Boolean);
const NEGATION = /(말고|말구|말아|지\s*마|싫|아니|별로|반대|안\s)/u;
// 어휘 자체가 부정형일 수 있으므로("이모지 없이") 매치 어구를 지운 나머지에서만 부정을 찾는다.
const negates = (clause, phrase) => NEGATION.test(clause.replace(phrase, ' '));
const coverageSegments = text => {
  const marker = '하지만';
  const contrast = text.lastIndexOf(marker);
  const offset = contrast < 0 ? 0 : contrast + marker.length;
  const scoped = text.slice(offset);
  const segments = [];
  const separator = /[,·\n]|그리고|하고\s/gu;
  let cursor = 0;
  for (const match of scoped.matchAll(separator)) {
    segments.push([cursor, match.index]);
    cursor = match.index + match[0].length;
  }
  segments.push([cursor, scoped.length]);
  return segments.map(([start,end]) => {
    const raw = scoped.slice(start,end);
    const leading = raw.match(/^\s*/u)[0].length;
    return { text: raw.trim().replace(/[.!?]+$/u, ''), index: offset + start + leading };
  }).filter(segment => segment.text);
};
const coverageNegates = (clause, match, intrinsicNegative) => {
  const before = clause.slice(0,match.index);
  const after = clause.slice(match.index + match[0].length);
  const prefix = /^\s*(?:싫(?:은|었던)?\s*건|아닌\s*건|반대(?:인\s*건|로)|별로인\s*건|안\s+)/u.test(before);
  const judgment = /(싫|별로|반대)/u.test(after);
  if (intrinsicNegative) return prefix || judgment;
  return prefix || judgment || /(지(?:는)?\s*(?:마|않)|고\s*싶지(?:는)?\s*않|말고|말구|말아|아니)/u.test(after);
};
// The user's own wording, not an interpretation of it.
const toneWords = text => clauses(text).filter(c => !NEGATION.test(c))
  .map(s => s.split(/\s+/u).slice(0, 2).join(' ')).slice(0, 5);

export function extractFromFreetext(text, { profileId, createdAt } = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) throw new ContractError('freetext', 'expected nonempty string');
  const raw = text.trim();
  const pid = profileId ?? id('tgt_ft', raw);
  const parts = clauses(raw);
  const language = {};
  const coverageParts = coverageSegments(raw);
  const coverageMatches = coverageParts.flatMap(part => COVERAGE_PATTERNS.flatMap(entry =>
    [...part.text.matchAll(entry.pattern)].map(match => ({
      entry, phrase:match[0], index:part.index+match.index,
      negated:coverageNegates(part.text,match,entry.intrinsicNegative)
    }))));
  const coverageValues = new Set(coverageMatches.filter(match => !match.negated).map(match => match.entry.value));
  // 1차: 부정된 어구가 가리키는 항목을 먼저 봉쇄한다. 순서에 좌우되지 않게 하려고 두 번 돈다.
  const blocked = new Set();
  for (const entry of LEXICON) for (const w of entry.words) {
    if (parts.some(c => c.includes(w) && negates(c, w))) blocked.add(entry.field);
  }
  // 2차: 봉쇄되지 않은 항목만 채운다.
  for (const entry of LEXICON) {
    if (blocked.has(entry.field) || Object.hasOwn(language, entry.field)) continue;
    const phrase = entry.words.find(w => parts.some(c => c.includes(w)));
    if (!phrase) continue;
    // user_text carries the match, rule carries the mapping: never rule-only.
    language[entry.field] = claim(entry.value, entry.confidence, [textEvidence(pid, phrase), ruleEvidence(entry.row)]);
  }
  if (!coverageParts.some(part => UNSUPPORTED_COVERAGE.test(part.text)) && coverageValues.size === 1) {
    const candidates = coverageMatches.filter(match => !match.negated).sort((a,b) => a.index-b.index);
    if (candidates.length > 0) {
      const selected = candidates[0];
      language.caption_coverage = claim(selected.entry.value, 0.8,
        [textEvidence(pid, selected.phrase), ruleEvidence(selected.entry.row)]);
    }
  }
  const filled = Object.keys(language).length;
  if (filled > 0) language.banned_words = [...BANNED_WORDS];
  const words = toneWords(raw);
  return validateProfileEvidence(validateProfile({
    schema_version: '1.0',
    profile_id: pid,
    axis: 'target',
    present: true,
    source: 'freetext',
    account_scope: 'n/a',
    sample_size: 1,
    // Free text cannot see photographs, so visual stays near-empty on purpose.
    completeness: { visual: round2((words.length > 0 ? 1 : 0) / 5), language: round2(filled / 5), sequence: 0 },
    visual: words.length > 0
      ? { tone_words: claim(words, 1, [{ kind: 'user_text', ref: `${pid}:raw`, note: '사용자가 쓴 표현을 그대로 옮겼다' }]) }
      : {},
    language: filled > 0 ? language : null,
    sequence: { carousel_count: 0 },
    raw_freetext: raw,
    created_at: createdAt ?? new Date().toISOString()
  }, 'target'), {});
}

// ── path 3: photos only — a plan, not a TargetProfile ────────────────────────
const shareMix = (analyses, key, names) => {
  const mix = {};
  names.forEach(n => { mix[n] = analyses.filter(a => a[key] === n).length / analyses.length; });
  // Assign the remainder to the last key so the mix sums to exactly 1.
  mix[names.at(-1)] = 1 - names.slice(0, -1).reduce((sum, n) => sum + mix[n], 0);
  return mix;
};
const topBy = (items, limit) => [...items.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())]
  .sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v);
const photoEvidence = (analyses, note, picks) => [
  { kind: 'aggregate', ref: `photo_analysis:n=${analyses.length}`, note },
  ...picks.map(a => ({ kind: 'uploaded_photo', ref: a.photo_id, note: `분석 출처 ${a.analysis_source} · 밝기 ${a.color.bright_mean} · 채도 ${a.color.sat_mean}` }))
];

export function planFromPhotos(analyses, { planId, createdAt } = {}) {
  if (!Array.isArray(analyses) || analyses.length === 0) throw new ContractError('photo_analyses', 'expected at least one PhotoAnalysis');
  analyses.forEach(validatePhoto);
  const n = analyses.length;
  const mean = pick => round2(analyses.reduce((sum, a) => sum + pick(a), 0) / n);
  const picks = analyses.slice(0, 2);
  const visual = {
    palette: claim({
      hue_mean: mean(a => a.color.hue_mean),
      sat_mean: mean(a => a.color.sat_mean),
      bright_mean: mean(a => a.color.bright_mean),
      palette_hex: topBy(analyses.flatMap(a => a.color.palette_hex), 3)
    }, 0.8, photoEvidence(analyses, `사진 ${n}장의 색 평균과 최빈 색 3개`, picks)),
    composition_mix: claim(shareMix(analyses, 'composition', ['full_frame', 'negative_space']), 0.9,
      photoEvidence(analyses, `사진 ${n}장의 구도 비율`, picks)),
    scale_mix: claim(shareMix(analyses, 'scale', ['closeup', 'midshot', 'fullshot']), 0.9,
      photoEvidence(analyses, `사진 ${n}장의 스케일 비율`, picks)),
    subjects: claim(topBy(analyses.flatMap(a => a.subjects), 5), 0.8,
      photoEvidence(analyses, `사진 ${n}장에서 관측된 피사체 최빈 5개`, picks))
  };
  // Heuristic composition/scale are placeholders, not spatial observations.
  if (!analyses.every(a => a.analysis_source === 'vision_model')) {
    delete visual.composition_mix; delete visual.scale_mix;
  }
  return validateProfileEvidence(validatePhotoPlan({
    schema_version: '1.0',
    kind: 'photo_plan',
    plan_id: planId ?? id('plan_photo', analyses.map(a => a.photo_id).join(',')),
    source: 'photo_only',
    sample_size: n,
    // No tone_words and no language: a photograph carries no sentence and no preference.
    completeness: { visual: round2(Object.keys(visual).length / 5), language: 0, sequence: 0 },
    visual,
    language: null,
    sequence: { carousel_count: 0 },
    target_profile: null,
    created_at: createdAt ?? new Date().toISOString(),
    disclaimer: `업로드한 사진 ${n}장에서 관측된 값이며 사용자의 취향·과거 습관이 아니다`
  }), { photoIds: analyses.map(a => a.photo_id) });
}

export { validatePhotoPlan } from './contracts.js';
