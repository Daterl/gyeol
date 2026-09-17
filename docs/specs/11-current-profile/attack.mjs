// review-codex.md H1·H2 재현. 고치기 전에는 ATTACK SUCCEEDS(=구멍), 고친 뒤에는 BLOCKED 가 나와야 한다.
import { readFile } from 'node:fs/promises';
import { buildCurrentProfile } from '../../../lib/current_profile.js';
import { validateProfile } from '../../../lib/contracts.js';

const read = async p => JSON.parse(await readFile(new URL('../../../' + p, import.meta.url), 'utf8'));
const NOW = '2026-09-17T00:00:00.000Z';
const snapshot = await read('fixtures/ig_snapshot.json');
const photos = await read('fixtures/photo_analysis.sample.json');
const carousels = snapshot.posts.filter(p => p.child_count >= 2);
const clone = structuredClone;

const opener = (i, scale) => ({
  schema_version: '1.0', photo_id: `syn_${i}`, file_ref: carousels[i].opener_image, input_index: 0,
  color: { hue_mean: 30, sat_mean: 0.3, bright_mean: 0.6, palette_hex: ['#e8dfd2'] },
  composition: 'full_frame', scale, subjects: ['합성 피사체'], has_face: false, text_in_image: null,
  describable_facts: ['수동 작성 합성 분석'], quality_flags: [], analysis_source: 'heuristic',
  model: 'manual-synthetic', analyzed_at: NOW
});

let holes = 0;
const line = (id, blocked, detail) => {
  if (!blocked) holes++;
  console.log(`${id.padEnd(22)} ${blocked ? 'BLOCKED' : 'ATTACK SUCCEEDS'} — ${detail}`);
};

// ── H1: A2 판정이 "같다"가 아닌데도 opener_tendency 를 만든다 ──────────────────
for (const [id, verdict] of [['H1-a 다르다', '다르다'], ['H1-b 확인 불가', '확인 불가'], ['H1-c 기록 누락', null]]) {
  const s = clone(snapshot);
  if (verdict === null) delete s.provenance.carousel_order_check; else s.provenance.carousel_order_check.verdict = verdict;
  const profile = buildCurrentProfile({ snapshot: s, openers: [opener(0, 'fullshot')] }, NOW);
  validateProfile(profile, 'current');
  const t = profile.sequence.opener_tendency;
  line(id, t === undefined, t === undefined ? 'opener_tendency 생략' : `opener_tendency=${t.value}/${t.confidence} 생성됨`);
}
{ // 기준선: "같다" 에서는 계속 나와야 한다
  const profile = buildCurrentProfile({ snapshot, openers: [opener(0, 'fullshot')] }, NOW);
  validateProfile(profile, 'current');
  const t = profile.sequence.opener_tendency;
  console.log(`${'H1-base 같다'.padEnd(22)} ${t ? 'OK' : 'REGRESSION'} — ${t ? `opener_tendency=${t.value}` : '신뢰할 수 있는 A2 인데 생략됨'}`);
  if (!t) holes++;
}

// ── H2-a: 결론과 반대인 사진만 근거로 인용한다 ────────────────────────────────
{
  const openers = [0, 1, 2].map(i => opener(i, 'midshot')).concat([3, 4].map(i => opener(i, 'closeup')));
  const profile = buildCurrentProfile({ snapshot, openers }, NOW);
  validateProfile(profile, 'current');
  const t = profile.sequence.opener_tendency;
  const supporting = new Set(openers.filter(o => o.scale === 'closeup').map(o => `29cm.official:${carousels.find(c => c.opener_image === o.file_ref).shortcode}`));
  const cited = t.evidence.map(e => e.ref);
  const ok = cited.every(ref => supporting.has(ref));
  line('H2-a opener 근거', ok, `주장=${t.value}, 인용=${cited.join(',')} / 실제 지지=${[...supporting].join(',')}`);
}

// ── H2-b: 그 피사체가 없는 사진만 근거로 인용한다 ─────────────────────────────
{
  const ps = photos.slice(0, 5).map((p, i) => ({ ...clone(p), subjects: i < 3 ? [`unique_${i}`] : ['고양이'] }));
  const profile = buildCurrentProfile({ photos: ps }, NOW);
  validateProfile(profile, 'current');
  const c = profile.visual.subjects;
  const cited = c.evidence.map(e => e.ref);
  const ok = cited.every(ref => ps.find(p => p.photo_id === ref).subjects.some(s => c.value.includes(s)));
  line('H2-b subjects 근거', ok, `주장=${JSON.stringify(c.value)}, 인용=${cited.join(',')} / 인용 사진의 피사체=${JSON.stringify(cited.map(r => ps.find(p => p.photo_id === r).subjects))}`);
}

// ── H2-c: 어미도 같은 형태다. 결론과 다른 어미의 캡션만 인용한다 ───────────────
{
  const captions = ['좋아요', '가요', '사진', '기록', '풍경'];
  const profile = buildCurrentProfile({ photos: photos.slice(0, 5), captions }, NOW);
  validateProfile(profile, 'current');
  const c = profile.language.ending_style;
  const endings = { 사진: '명사형', 기록: '명사형', 풍경: '명사형', 좋아요: '해요', 가요: '해요' };
  const cited = c.evidence.map(e => e.ref);
  const idx = r => photos.findIndex(p => p.photo_id === r);
  const ok = cited.every(r => endings[captions[idx(r)]] === c.value);
  line('H2-c ending 근거', ok, `주장=${c.value}, 인용 캡션=${JSON.stringify(cited.map(r => captions[idx(r)]))}`);
}

console.log(`\n남은 구멍: ${holes}`);
process.exitCode = holes ? 1 : 0;
