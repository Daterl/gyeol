// CurrentProfile 추출. 네트워크·모델 호출·파일 읽기를 하지 않는다 — 호출자가 데이터를 인자로 넘긴다.
// 사진 분석은 이 모듈이 하지 않는다. 사진 1장 = 1회 호출 구조(docs/intent.md 8절 A1 ①)를 여기서 깨지 않기 위해서다.
import { ContractError, validatePhoto } from './contracts.js';

// 설계 상수다. 사용자 관측이 아니라 CLAUDE.md 6-3(d) 의 한국어 AI 문체 금지어 목록이다.
const BANNED_WORDS = ['이처럼', '또한', '이를 통해', '이러한', '마침내'];
const EMOJI = /\p{Extended_Pictographic}/gu;
const HANGUL = /[가-힣]+/g;

const fail = (path, message) => { throw new ContractError(path, message); };
const round2 = n => Math.round(n * 100) / 100;
const text = (v, p) => { if (typeof v !== 'string' || v.trim().length === 0) fail(p, 'expected nonempty string'); return v; };
// nearest-rank. 1건이면 p50 === p90 이라 스키마의 p90 >= p50 이 그대로 유지된다.
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const claim = (value, confidence, evidence) => ({ value, confidence, evidence });
const fnv1a = s => { let h = 0x811c9dc5; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

const absent = created_at => ({
  schema_version: '1.0', profile_id: null, axis: 'current', present: false, source: 'none', account_scope: 'n/a',
  sample_size: 0, completeness: { visual: 0, language: 0, sequence: 0 },
  visual: {}, language: null, sequence: {}, raw_freetext: null, created_at
});

// 캡션 마지막 한글 덩어리의 표면형만 본다. 형태소 분석이 아니다 — 한계는 spec.md 6-2절.
// 끝에 붙는 해시태그·멘션 뭉치는 문장의 끝맺음이 아니므로 먼저 떼어낸다. 안 떼면 태그의 마지막 낱말이 어미로 읽힌다.
function ending(caption) {
  const runs = caption.replace(/[#@][^\s#@]+/g, ' ').match(HANGUL);
  if (!runs) return null; // 한글이 없는 캡션은 분모에서 뺀다. 값을 지어내지 않는다.
  const last = runs.at(-1);
  if (/(?:여요|에요|예요|요)$/.test(last)) return '해요';
  if (/[다까자]$/.test(last)) return '다';
  return '명사형';
}
function topOf(counts) {
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  if (ranked[1] && ranked[1][1] === ranked[0][1]) return null; // 동률은 판단이 아니다
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { value: ranked[0][0], share: ranked[0][1] / total };
}
const tally = items => items.reduce((counts, item) => { if (item !== null) counts[item] = (counts[item] ?? 0) + 1; return counts; }, {});

function buildLanguage(captions, cite) {
  const language = { banned_words: [...BANNED_WORDS] };
  const filled = ['empty_caption_ratio'];
  const all = captions.map((_, i) => i);
  const writtenIdx = all.filter(i => captions[i].trim().length > 0);
  const written = writtenIdx.map(i => captions[i]);
  language.empty_caption_ratio = claim(round2((captions.length - written.length) / captions.length), 1,
    cite(all, `캡션 ${captions.length}건 전체에서 빈 캡션 수를 세어 나눈 값이다`));
  if (written.length) {
    const lengths = written.map(t => [...t.trim()].length).sort((a, b) => a - b);
    language.caption_len = claim({ p50: percentile(lengths, 50), p90: percentile(lengths, 90), unit: '자' }, 1,
      cite(writtenIdx, `캡션을 쓴 게시물 ${written.length}건 전체의 글자 수 분포에서 읽은 중앙값과 상위 10% 지점이다`));
    language.emoji_rate = claim(round2(written.reduce((sum, t) => sum + (t.match(EMOJI)?.length ?? 0), 0) / written.length), 1,
      cite(writtenIdx, `캡션을 쓴 게시물 ${written.length}건 전체의 1건당 이모지 개수 평균이다`));
    filled.push('caption_len', 'emoji_rate');
    const endings = writtenIdx.map(i => ending(captions[i]));
    const style = topOf(tally(endings));
    // 근거는 그 끝맺음으로 분류된 캡션만 고른다. 앞에서 3개 자르면 다른 어미의 캡션을 근거라고 부르게 된다.
    if (style) {
      language.ending_style = claim(style.value, round2(style.share),
        cite(writtenIdx.filter((_, k) => endings[k] === style.value),
          `이 캡션의 끝맺음을 ${style.value} 으로 분류했고, 분류된 캡션 중 이 끝맺음이 가장 잦았다`));
      filled.push('ending_style');
    }
    const paragraphs = written.filter(t => /\n\s*\n/.test(t)).length;
    const breaks = written.reduce((sum, t) => sum + (t.match(/\n/g)?.length ?? 0), 0) / written.length;
    language.linebreak_habit = claim(paragraphs * 2 >= written.length ? '문단' : breaks < 0.5 ? '없음' : '짧게 자주', 1,
      cite(writtenIdx, `캡션을 쓴 게시물 ${written.length}건 전체의 빈 줄과 줄바꿈 횟수를 세어 정한 줄바꿈 습관이다`));
    filled.push('linebreak_habit');
  }
  return { language, completeness: filled.length / 5 };
}

function buildVisual(photos, cite) {
  const visual = {};
  const n = photos.length;
  const all = photos.map((_, i) => i);
  const mean = pick => photos.reduce((sum, p) => sum + pick(p), 0) / n;
  // 색상환은 각도라서 산술평균이 359도와 1도를 180도로 만든다. 원형 평균을 쓴다.
  const hue = ((Math.atan2(mean(p => Math.sin(p.color.hue_mean * Math.PI / 180)), mean(p => Math.cos(p.color.hue_mean * Math.PI / 180))) * 180 / Math.PI) % 360 + 360) % 360;
  const hexes = tally(photos.flatMap(p => p.color.palette_hex.map(hex => hex.toLowerCase())));
  visual.palette = claim({
    hue_mean: round2(hue), sat_mean: round2(mean(p => p.color.sat_mean)), bright_mean: round2(mean(p => p.color.bright_mean)),
    palette_hex: Object.entries(hexes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([hex]) => hex)
  }, 1, cite(all, `올린 사진 ${n}장 전체의 색상·채도·밝기를 모아 평균낸 값이다`));
  // 반올림하면 합이 1 에서 벗어나 lib/contracts.js 의 mix() 가 거부한다. 그대로 둔다.
  const share = (key, names) => Object.fromEntries(names.map(name => [name, photos.filter(p => p[key] === name).length / n]));
  visual.composition_mix = claim(share('composition', ['full_frame', 'negative_space']), 1,
    cite(all, `올린 사진 ${n}장 전체에서 화면을 꽉 채운 사진과 여백을 둔 사진의 비율이다`));
  visual.scale_mix = claim(share('scale', ['closeup', 'midshot', 'fullshot']), 1,
    cite(all, `올린 사진 ${n}장 전체에서 가까이 찍은 사진과 멀리서 찍은 사진의 비율이다`));
  if (!photos.every(p => p.analysis_source === 'vision_model')) {
    delete visual.composition_mix; delete visual.scale_mix;
  }
  const subjects = tally(photos.flatMap(p => [...new Set(p.subjects)]));
  const repeated = Object.entries(subjects).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
  // 1장에만 나온 피사체는 습관이 아니다.
  // 근거는 그 피사체가 실제로 찍힌 사진만 고른다. 앞에서 3장 자르면 고양이가 없는 사진을 고양이의 근거라고 부르게 된다.
  if (repeated.length) {
    const chosen = repeated.map(([name]) => name);
    visual.subjects = claim(chosen, round2(repeated[0][1] / n),
      cite(all.filter(i => photos[i].subjects.some(name => chosen.includes(name))),
        '이 사진에 그 피사체가 찍혀 있었고, 같은 피사체가 두 장 이상에서 반복해 나왔다'));
  }
  return { visual, completeness: Object.keys(visual).length / 5 };
}

// opener_tendency 는 아래 넷이 전부 참일 때만 나온다: 이 스냅샷의 A2 판정이 "같다"이고, 캐러셀이 있고,
// 1번 사진 분석이 실제로 들어왔고, 최빈값이 하나다. 하나라도 어긋나면 필드를 생략한다.
// 문자열 '불명' 을 넣지 않는다 — 그건 미관측이 아니라 판단이다.
// A2 가 "다르다"·"확인 불가"거나 기록이 아예 없으면 1번 사진이 진짜 1번인지 모른다. 그 위에 세운 성향은 근거가 아니다.
function buildSequence(carousels, openers, account, orderTrusted) {
  const sequence = { carousel_count: carousels.length };
  if (!carousels.length || !openers?.length || !orderTrusted) return { sequence, completeness: carousels.length ? 0.5 : 0 };
  const byImage = new Map(carousels.map(post => [post.opener_image, post]));
  const classify = photo => photo.has_face === true ? '인물' : photo.scale === 'closeup' ? '클로즈업' : photo.scale === 'fullshot' ? '풀샷' : null;
  const matched = openers.map(photo => ({ photo, post: byImage.get(photo.file_ref) })).filter(pair => pair.post && pair.photo.analysis_source === 'vision_model');
  const top = topOf(tally(matched.map(({ photo }) => classify(photo))));
  if (!top) return { sequence, completeness: 0.5 };
  // 근거는 그 성향으로 분류된 캐러셀만 고른다. 앞에서 3개 자르면 결론과 반대인 게시물을 근거라고 부르게 된다.
  sequence.opener_tendency = claim(top.value, round2(top.share),
    matched.filter(({ photo }) => classify(photo) === top.value).slice(0, 3).map(({ post }) =>
      ({ kind: 'ig_post', ref: `${account}:${post.shortcode}`, note: `이 캐러셀의 1번 사진 분석을 ${top.value} 으로 분류했고, 분류된 캐러셀 중 이 성향이 가장 잦았다` })));
  return { sequence, completeness: 1 };
}

function fromSnapshot(snapshot, openers, created_at) {
  const posts = snapshot?.posts;
  if (!Array.isArray(posts)) fail('snapshot.posts', 'expected array');
  const account = text(snapshot.provenance?.account, 'snapshot.provenance.account');
  const scope = snapshot.provenance?.account_scope ?? 'n/a';
  if (!['main', 'sub', 'n/a'].includes(scope)) fail('snapshot.provenance.account_scope', 'expected main|sub|n/a');
  posts.forEach((post, i) => {
    text(post?.shortcode, `snapshot.posts[${i}].shortcode`);
    if (typeof post.caption !== 'string') fail(`snapshot.posts[${i}].caption`, 'expected string; 캡션 없음은 "" 로 들어온다');
    if (!Number.isInteger(post.child_count) || post.child_count < 1) fail(`snapshot.posts[${i}].child_count`, 'expected integer >= 1');
  });
  if (!posts.length) return absent(created_at); // 관측 0건에서 배울 수 있는 것은 없다
  openers?.forEach(validatePhoto);
  // 근거는 그 판단을 실제로 지지한 게시물만 가리킨다. 인덱스로 받아서 여기서 ref 로 바꾼다.
  const cite = (indexes, note) => indexes.slice(0, 3).map(i => ({ kind: 'ig_post', ref: `${account}:${posts[i].shortcode}`, note }));
  // A2(docs/intent.md 8절) 판정이 "같다"로 기록된 스냅샷에서만 캐러셀 내부 순서를 믿는다.
  // "다르다"·"확인 불가"·기록 누락은 전부 같은 뜻이다 — 1번 사진이 진짜 1번인지 모른다.
  const orderTrusted = snapshot.provenance?.carousel_order_check?.verdict === '같다';
  const language = buildLanguage(posts.map(post => post.caption), cite);
  const sequence = buildSequence(posts.filter(post => post.child_count >= 2), openers, account, orderTrusted);
  return {
    schema_version: '1.0', profile_id: `cur_cached_${account.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    axis: 'current', present: true, source: 'cached', account_scope: scope, sample_size: posts.length,
    completeness: { visual: 0, language: language.completeness, sequence: sequence.completeness },
    visual: {}, language: language.language, sequence: sequence.sequence, raw_freetext: null, created_at
  };
}

function fromPhotos(photos, captions, created_at) {
  photos.forEach(validatePhoto);
  if (!photos.length) return absent(created_at);
  const cite = (indexes, note) => indexes.slice(0, 3).map(i => ({ kind: 'uploaded_photo', ref: photos[i].photo_id, note }));
  const visual = buildVisual(photos, cite);
  // 캡션을 관측하지 않았으면 언어 습관을 만들어내지 않는다. null 과 빈 배열은 다르다.
  const language = captions === undefined ? { language: null, completeness: 0 } : buildLanguage(captions, cite);
  return {
    // 캡션까지 해시에 넣는다. 같은 사진을 캡션 있이/없이 넣으면 서로 다른 프로필인데 ID 가 같으면 E8 대조가 둘을 구별하지 못한다.
    schema_version: '1.0', profile_id: `cur_upload_${fnv1a([...photos.map(p => p.photo_id)].sort().join('|') + '#' + (captions ?? []).join('\u0000'))}`,
    axis: 'current', present: true, source: 'photo_upload', account_scope: 'n/a', sample_size: photos.length,
    completeness: { visual: visual.completeness, language: language.completeness, sequence: 0 },
    visual: visual.visual, language: language.language, sequence: { carousel_count: 0 }, raw_freetext: null, created_at
  };
}

export function buildCurrentProfile(input, now = new Date()) {
  const created_at = (now instanceof Date ? now : new Date(now)).toISOString();
  if (input === null || input === undefined) return absent(created_at);
  if (typeof input !== 'object' || Array.isArray(input)) fail('CurrentProfile.input', 'expected object');
  const { snapshot, photos, openers } = input;
  // 한 프로필의 source 는 하나다. 둘을 섞으면 어느 관측에서 나온 값인지 source 가 설명하지 못한다.
  if (snapshot && photos) fail('CurrentProfile.input', 'snapshot and photos cannot describe one source');
  if (snapshot) return fromSnapshot(snapshot, openers, created_at);
  if (photos !== undefined) {
    if (!Array.isArray(photos)) fail('CurrentProfile.input.photos', 'expected array');
    if (Object.hasOwn(input, 'captions')) {
      if (!Array.isArray(input.captions)) fail('CurrentProfile.input.captions', 'expected array; 관측하지 않았으면 키를 넣지 않는다');
      if (input.captions.some(caption => typeof caption !== 'string')) fail('CurrentProfile.input.captions', 'expected strings');
      // 캡션을 관측했다면 사진과 1:1 로 맞는다. 0건 관측은 관측이 아니므로 키를 빼야 한다.
      if (input.captions.length !== photos.length) fail('CurrentProfile.input.captions', 'caption count differs from photo count');
    }
    return fromPhotos(photos, Object.hasOwn(input, 'captions') ? input.captions : undefined, created_at);
  }
  return absent(created_at);
}
