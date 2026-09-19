// #101 caption-seed acceptance: live round over the recorded REAL photos, then
// deterministic scoring of the five observable conditions. Scoring reads only the
// artifact; it never calls a model, so a recorded round stays re-checkable offline.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {composeFeed} from '../lib/compose.js';
import {buildCurrentProfile} from '../lib/current_profile.js';
import {extractFromReference, extractFromFreetext, planFromPhotos} from '../lib/target_profile.js';
import {analyzePhoto} from '../lib/photo_analysis.js';
import {generateOutput, liftedFromOverlay} from '../lib/output-generation.js';

export const OUT_DIR = new URL('../docs/specs/101-caption-seed-acceptance/', import.meta.url);
export const SOURCE = 'docs/specs/101-caption-quality/inputs.json';
export const BANNED = ['이처럼', '또한', '이를 통해', '이러한', '마침내', '최고의', '완벽한', '반드시'];
// style_guard bans time/emotion/intent claims; these are the vocabulary families the
// #101 audit found leaking into evidence notes.
export const INTERPRETIVE = ['감정', '감성', '느낌', '분위기', '계절', '가을', '봄', '여름', '겨울', '마무리', '의도', '취향', '일상', '추억', '상호작용', '연출'];
export const SEED_QUESTION = '이 중 기억에 남은 건?';
export const SEED_LEAD = '쓸 거리: ';
const hash = v => createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest('hex');

// ---- scoring (no model, no network) -------------------------------------------------

/** Per-seed material check: every material must be a verbatim slice of THIS slot's facts. */
export function scoreSeed(text, facts) {
  const lines = String(text ?? '').split('\n');
  const shape = lines.length === 2 && lines[0].startsWith(SEED_LEAD) && lines[1] === SEED_QUESTION;
  const materials = shape ? lines[0].slice(SEED_LEAD.length).split(' · ') : [];
  return {
    shape, materials,
    // 관측 원문과 글자 단위로 같은지만 본다. 원본 사진과 맞는지는 이 코드가 알 수 없다.
    unsupported: materials.filter(m => !facts.some(f => f.includes(m))),
    // 수식 없는 홑낱말('접시')은 관측을 그대로 옮긴 alt-text 다. 참이지만 쓸 거리로는 약하다.
    bare: materials.filter(m => !/\s/.test(m)),
    // develop #123: 한 슬롯에 소재는 하나다. 서로 다른 사실의 명사를 잇지 않는다.
    over_count: materials.length !== 1
  };
}

/** A title must not promote one photo's on-image text. 런타임 가드와 같은 판정을 쓴다 —
 *  채점이 더 느슨하면 게이트가 막은 것을 보고서가 통과로 적는다. */
export function scoreTitle(title, photos) {
  const value = String(title ?? '');
  return {value, digits: value.match(/\d+/g) ?? [], lifted_overlay: liftedFromOverlay(value, photos)};
}

export function scoreRound(round, photos) {
  const facts = new Map(photos.map(p => [p.photo_id, p.describable_facts]));
  const slots = round.generated.output.slots.map(slot => {
    const own = facts.get(slot.photo_id) ?? [];
    const notes = slot.evidence.filter(e => e.kind === 'uploaded_photo');
    return {
      photo_id: slot.photo_id, position: slot.position, caption_state: slot.caption_state,
      text: slot.text, omit_reason: slot.omit_reason,
      seed: slot.caption_state === 'seed' ? scoreSeed(slot.text, own) : null,
      note_offsource: notes.filter(e => !own.includes(e.note)).map(e => e.note),
      note_interpretive: notes.flatMap(e => INTERPRETIVE.filter(w => e.note.includes(w)).map(w => ({note: e.note, word: w})))
    };
  });
  const prose = [round.generated.output.title, ...slots.flatMap(s => [s.text, s.omit_reason, ...round.generated.output.slots.find(o => o.photo_id === s.photo_id).evidence.map(e => e.note)])]
    .filter(Boolean).join('\n');
  return {
    direction: round.direction, attempt: round.attempt,
    title: scoreTitle(round.generated.output.title, photos),
    banned: BANNED.filter(w => prose.includes(w)),
    seed_count: slots.filter(s => s.caption_state === 'seed').length,
    omitted_count: slots.filter(s => s.caption_state === 'omitted').length,
    unsupported_materials: slots.flatMap(s => (s.seed?.unsupported ?? []).map(m => ({photo_id: s.photo_id, material: m}))),
    malformed_seeds: slots.filter(s => s.seed && (!s.seed.shape || s.seed.over_count)).map(s => s.photo_id),
    bare_materials: slots.flatMap(s => (s.seed?.bare ?? []).map(m => ({photo_id: s.photo_id, material: m}))),
    offsource_notes: slots.flatMap(s => s.note_offsource.map(n => ({photo_id: s.photo_id, note: n}))),
    interpretive_notes: slots.flatMap(s => s.note_interpretive.map(n => ({photo_id: s.photo_id, ...n}))),
    slots
  };
}

const EMPTY = () => ({verdict: null, reviewer: null, reviewed_at: null, notes: null});
// OMITTED_OK 은 근거 있는 비움이다. 실패도 아니고 '고쳐서 쓸 수 있는 단서'도 아니므로
// 과반 판정의 분모에서 뺀다 (P3: 비움은 유효한 결과다).
export const VERDICTS = ['USABLE', 'OMITTED_OK', 'NOT_USABLE'];

export function scoreArtifact(a) {
  const rounds = a.rounds.map(round => scoreRound(round, a.photos));
  const sum = key => rounds.reduce((n, r) => n + r[key].length, 0);
  return {
    rounds,
    titles: rounds.map(r => ({direction: r.direction, attempt: r.attempt, title: r.title.value, digits: r.title.digits, lifted_overlay: r.title.lifted_overlay})),
    totals: {
      rounds: rounds.length, seeds: rounds.reduce((n, r) => n + r.seed_count, 0), omitted: rounds.reduce((n, r) => n + r.omitted_count, 0),
      banned: sum('banned'), unsupported_materials: sum('unsupported_materials'), malformed_seeds: sum('malformed_seeds'),
      bare_materials: sum('bare_materials'),
      offsource_notes: sum('offsource_notes'), interpretive_notes: sum('interpretive_notes'),
      title_digits: rounds.reduce((n, r) => n + r.title.digits.length, 0),
      title_lifted: rounds.reduce((n, r) => n + r.title.lifted_overlay.length, 0)
    }
  };
}

/** Structural integrity + the ban on promoting an unreviewed field to a pass. */
export function validateArtifact(a) {
  assert.equal(a.schema_version, 1);
  assert.equal(a.provenance.generation, 'LIVE model responses');
  assert.ok(a.provenance.network_calls > 0, 'A live round must record real calls');
  assert.equal(a.photos_sha256, hash(a.photos));
  assert.equal(a.photos.length, 15);
  assert.ok(a.rounds.length >= 10, 'Fewer than ten recorded rounds cannot answer the title condition');
  for (const round of a.rounds) {
    // 회차마다 사진을 복사해 두지 않는다. 모든 회차가 같은 15장을 쓴다는 것은
    // feed 의 photo_id 집합과 위 photos_sha256 으로 확인한다.
    assert.deepEqual([...round.feed.slots.map(s => s.photo_id)].sort(), a.photos.map(p => p.photo_id).sort());
    assert.equal(round.generated.output.slots.length, 15);
    assert.deepEqual(round.generated.output.slots.map(s => s.position), Array.from({length: 15}, (_, i) => i + 1));
  }
  // Human publishability is not producible by this harness; agent review is separate evidence.
  assert.equal(a.acceptance.human, 'PENDING');
  // 시도 중 하나라도 실패한 회차는 PASS 가 아니다. 12/16 을 통과로 적을 수 없다.
  assert.equal(a.acceptance.live_model, a.provenance.generate_failures.length ? 'PARTIAL' : 'PASS');
  const photoById = new Map(a.photos.map(p => [p.photo_id, p]));
  for (const row of a.review) {
    const photo = photoById.get(row.photo_id);
    assert.ok(photo, 'Review row must name a recorded photo');
    // 대조한 파일이 그 사진의 파일이 아니면 '원본 사진을 봤다' 가 성립하지 않는다.
    assert.equal(row.file_ref, photo.file_ref, 'Review row must cite the file of the photo it reviews');
    assert.deepEqual(row.human, EMPTY(), 'Human verdicts stay empty in the generated artifact');
    assert.ok(VERDICTS.includes(row.agent.verdict), 'Agent review must be decided');
    assert.equal(typeof row.agent.reviewed_at, 'string');
  }
  assert.equal(a.review.length, 15);
  // 같은 사진을 두 번 적어 15장 대조를 채울 수 없다.
  assert.equal(new Set(a.review.map(r => r.photo_id)).size, 15, 'Fifteen distinct photos must be reviewed');
  assert.equal(new Set(a.review.map(r => r.file_ref)).size, 15, 'Fifteen distinct original files must be reviewed');
  const scored = scoreArtifact(a);
  assert.deepEqual(a.scores.totals, scored.totals, 'Stored scores must match a fresh recount');
  assert.deepEqual(a.scores.titles, scored.titles);
  return scored;
}

const cell = v => String(typeof v === 'string' ? v : JSON.stringify(v))
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replaceAll('\n', '<br>');

export function tally(review) {
  const count = verdict => review.filter(row => row.agent.verdict === verdict).length;
  const seeds = review.length - count('OMITTED_OK');
  return {usable: count('USABLE'), omitted_ok: count('OMITTED_OK'), not_usable: count('NOT_USABLE'),
    // 원본 사진 대조에서 사실과 다르다고 본 슬롯. 관측 원문 대조(unsupported_materials)와 다른 축이다.
    image_factuality_failures: count('NOT_USABLE'),
    seed_slots: seeds, majority: count('USABLE') * 2 > seeds};
}

export function renderReview(a) {
  const s = validateArtifact(a);
  const last = a.rounds.at(-1);
  const t = tally(a.review);
  return `# #101 캡션 씨앗 인수 — 실모델 회차와 실사진 대조

생성: LIVE (${a.provenance.model.output}) · 사진 분석: LIVE (${a.provenance.model.vision}) · 실모델 회차: **${a.acceptance.live_model}** · 사람 게시 가능 판정: **PENDING**

에이전트가 원본 이미지 15장을 직접 열어 판정한 결과다. **사람 판정을 대체하지 않는다.** 사람 칸은 비워 둔다.

아래 표는 두 축을 나눠 센다. **관측 원문 대조**는 단서가 그 슬롯 관측문과 글자 단위로 같은지만 본다 — 관측 자체가 틀렸으면 통과한다. **원본 사진 대조**는 에이전트가 원본 파일을 열어 본 결과다.

| 합계 | 값 |
|---|---|
| 성공 회차 / 시도 | ${s.totals.rounds} / ${s.totals.rounds + a.provenance.generate_failures.length} (실패 ${a.provenance.generate_failures.length}회 — 품질 통과로 읽지 않는다) |
| 원본 사진 대조 — 쓸 수 있음 / 근거 있는 비움 / 사실과 다름 | ${t.usable} / ${t.omitted_ok} / ${t.image_factuality_failures} (단서 슬롯 ${t.seed_slots}개 중 과반: ${t.majority ? '충족' : '미충족'} — 에이전트 판정이며 사람 인수가 아니다) |
| 그중 수식 없는 홑낱말 소재 (관측을 그대로 옮긴 alt-text) | ${s.totals.bare_materials} |
| 단서 / 비움 슬롯 | ${s.totals.seeds} / ${s.totals.omitted} |
| 금지어·단정 | ${s.totals.banned} |
| 관측 원문 대조 — 소재가 그 슬롯 관측문에 없음 (S4 아님) | ${s.totals.unsupported_materials} |
| 형식 위반 단서 | ${s.totals.malformed_seeds} |
| note가 그 슬롯 원문이 아님 | ${s.totals.offsource_notes} |
| note의 감정·계절·의도 어휘 | ${s.totals.interpretive_notes} |
| 타이틀 속 숫자 / 사진 글 발췌 | ${s.totals.title_digits} / ${s.totals.title_lifted} |

## 회차별 타이틀 (${s.titles.length}회 전수)

| # | 지향 | 타이틀 | 숫자 | 사진 글 발췌 |
|---|---|---|---|---|
${s.titles.map((t, i) => `| ${i + 1} | ${t.direction} | ${cell(t.title)} | ${cell(t.digits)} | ${cell(t.lifted_overlay)} |`).join('\n')}

## 실사진 대조 — 마지막 회차 (${last.direction} / ${last.attempt})

| 자리 | 원본 파일 | 단서 또는 비움 | 근거 note | 에이전트 판정 | 에이전트 근거 | 사람 판정 |
|---|---|---|---|---|---|---|
${a.review.map(row => {
  const slot = last.generated.output.slots.find(s => s.photo_id === row.photo_id);
  return `| ${slot.position} | ${row.file_ref} | ${cell(slot.text ?? `(비움) ${slot.omit_reason}`)} | ${cell(slot.evidence.filter(e => e.kind === 'uploaded_photo').map(e => e.note))} | ${row.agent.verdict} | ${cell(row.agent.notes)} | □ |`;
}).join('\n')}

## 전후 비교 — 감사 회차와 이번 회차

| 자리 | 감사 회차 캡션 (설명문) | 이번 회차 단서 |
|---|---|---|
${a.before.map(b => {
  const slot = last.generated.output.slots.find(s => s.photo_id === b.photo_id);
  return `| ${b.position} | ${cell(b.text ?? '(비움)')} | ${cell(slot.text ?? '(비움)')} |`;
}).join('\n')}
`;
}

// ---- live round ---------------------------------------------------------------------

async function loadPhotos(imageDir) {
  const recorded = JSON.parse(await readFile(new URL(`../${SOURCE}`, import.meta.url), 'utf8'))[0].request.context.photos;
  let calls = 0;
  const photos = [];
  for (const record of recorded) {
    const bytes = await readFile(new URL(record.file_ref, imageDir));
    calls++;
    const {analysis} = await analyzePhoto({bytes, photoId: record.photo_id, inputIndex: record.input_index, fileRef: record.file_ref});
    photos.push(analysis);
  }
  return {photos, calls};
}

async function directions(photos, snapshot) {
  const registry = {'29cm.official': {...snapshot, snapshot_id: `apify_run:${snapshot.provenance.source_run}`, posts: snapshot.posts.map(p => ({...p, shortCode: p.shortcode}))}};
  const reference = await extractFromReference('https://www.instagram.com/29cm.official/', {registry});
  return [
    {name: 'reference', target: reference, current: buildCurrentProfile(null)},
    {name: 'freetext', target: extractFromFreetext('차분하고 여백 많은 느낌으로'), current: buildCurrentProfile(null)},
    {name: 'photos_only', target: planFromPhotos(photos), current: buildCurrentProfile(null)},
    {name: 'corrected', target: reference, current: buildCurrentProfile({snapshot})}
  ];
}

export async function runLive({imageDir, attempts = 4, analyzed}) {
  const {photos, calls: visionCalls} = analyzed ?? await loadPhotos(imageDir);
  const snapshot = JSON.parse(await readFile(new URL('../fixtures/ig_snapshot.json', import.meta.url), 'utf8'));
  const rounds = [];
  let generateCalls = 0, failures = [];
  for (const direction of await directions(photos, snapshot)) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const feed = composeFeed({photoAnalyses: photos, targetProfile: direction.target, currentProfile: direction.current, currentPhotoAnalyses: [], sessionId: `acc-101-${direction.name}-${attempt}`});
      const context = {photos, current: direction.current, target: direction.target, current_photos: []};
      generateCalls++;
      try {
        const generated = await generateOutput({schema_version: '1.0', mode: 'all', feed, context});
        rounds.push({direction: direction.name, attempt, feed, generated});
        process.stderr.write(`ok ${direction.name}/${attempt} title=${generated.output.title}\n`);
      } catch (error) {
        // cause 가 없으면 어느 규칙이 걸렸는지 보고서에 적을 수 없다.
        failures.push({direction: direction.name, attempt, code: error.code ?? null, message: error.message,
          cause: error.cause?.message ?? null});
        process.stderr.write(`FAIL ${direction.name}/${attempt} ${error.code ?? ''} ${error.cause?.message ?? error.message}\n`);
      }
    }
  }
  const outputModel = process.env.GYEOL_OUTPUT_MODEL ?? JSON.parse(await readFile(new URL('../config/models.json', import.meta.url), 'utf8')).output_model;
  // Audit-round captions for the side-by-side, taken from the first recorded reference run.
  const beforeRuns = JSON.parse(await readFile(new URL('../docs/specs/101-caption-quality/before.json', import.meta.url), 'utf8'));
  const beforeRun = beforeRuns.find(r => r.scenario === 'reference' && r.calls?.[0]?.raw_content?.[0]?.text);
  const before = JSON.parse(beforeRun.calls[0].raw_content[0].text).output.slots
    .map(s => ({position: s.position, photo_id: s.photo_id, text: s.text}))
    .sort((a, b) => a.position - b.position);
  return {
    schema_version: 1, created_at: new Date().toISOString(),
    code_revision: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
    provenance: {
      generation: 'LIVE model responses', source: SOURCE, image_dir: String(imageDir),
      analysis: 'LIVE vision re-analysis of the same 15 original image files',
      model: {vision: photos[0].model, output: outputModel},
      network_calls: visionCalls + generateCalls, generate_attempts: generateCalls, generate_failures: failures
    },
    acceptance: {live_model: failures.length ? 'PARTIAL' : 'PASS', human: 'PENDING'},
    photos, photos_sha256: hash(photos), before, rounds, review: [], scores: null
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const saved = JSON.parse(await readFile(new URL('live-evidence.json', OUT_DIR), 'utf8'));
  console.log(JSON.stringify(validateArtifact(saved).totals, null, 2));
  await mkdir(OUT_DIR, {recursive: true});
  await writeFile(new URL('review.md', OUT_DIR), renderReview(saved));
  console.log('Rescored from the recorded artifact with zero model calls.');
}
