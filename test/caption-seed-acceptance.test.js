// #101: 기록된 실모델 회차를 모델 호출 0회로 다시 채점한다. 통과를 지어낼 수 없는지도 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scoreArtifact, scoreSeed, scoreTitle, tally, validateArtifact, renderReview} from '../scripts/caption-seed-acceptance.mjs';

const saved = JSON.parse(await readFile(new URL('../docs/specs/101-caption-seed-acceptance/live-evidence.json', import.meta.url), 'utf8'));

test('recorded live round satisfies the five deterministic conditions', () => {
  const scored = validateArtifact(saved);
  assert.equal(scored.totals.banned, 0);
  assert.equal(scored.totals.unsupported_materials, 0);
  assert.equal(scored.totals.malformed_seeds, 0);
  assert.equal(scored.totals.offsource_notes, 0);
  assert.equal(scored.totals.interpretive_notes, 0);
  assert.equal(scored.totals.title_digits, 0);
  assert.equal(scored.totals.title_lifted, 0);
  assert.ok(scored.titles.length >= 10, '타이틀 10회 이상을 전수 기록한다');
});

test('agent image review reaches a majority without standing in for the human gate', () => {
  const t = tally(saved.review);
  assert.equal(t.majority, true);
  assert.equal(saved.acceptance.human, 'PENDING');
  assert.ok(saved.review.every(row => row.agent.reviewer.includes('agent')));
});

test('scoring reads the artifact only — no network, no model', async () => {
  const fetchImpl = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Rescoring must not call out'); };
  try { assert.deepEqual(scoreArtifact(saved).totals, saved.scores.totals); }
  finally { globalThis.fetch = fetchImpl; }
});

test('a paraphrased material or a lifted title phrase cannot be scored clean', () => {
  const paraphrased = structuredClone(saved);
  const slot = paraphrased.rounds[0].generated.output.slots.find(s => s.caption_state === 'seed');
  slot.text = '쓸 거리: 원문에 없는 소재\n이 중 기억에 남은 건?';
  assert.ok(scoreArtifact(paraphrased).totals.unsupported_materials > 0);

  const lifted = structuredClone(saved);
  lifted.rounds[0].generated.output.title = lifted.photos.find(p => p.text_in_image)?.text_in_image.slice(0, 8);
  assert.ok(scoreArtifact(lifted).totals.title_lifted > 0);
});

test('an unreviewed or promoted field cannot become a pass', () => {
  for (const edit of [
    a => { a.acceptance.human = 'PASS'; },
    a => { a.review[0].human.verdict = 'PASS'; },
    a => { a.review[0].agent.verdict = null; },
    a => { a.review.pop(); },
    a => { a.photos[0].describable_facts[0] = 'invented'; },
    a => { a.rounds.length = 4; },
    a => { a.provenance.generation = 'FAKE injected transport'; },
    a => { a.provenance.network_calls = 0; }
  ]) {
    const changed = structuredClone(saved);
    edit(changed);
    assert.throws(() => validateArtifact(changed));
  }
});

test('seed and title scoring catch the shapes the audit found', () => {
  const facts = ['검은 벨트에 은색 버클이 있다', '흰 화분에 초록 잎이 있다'];
  assert.deepEqual(scoreSeed('쓸 거리: 검은 벨트\n이 중 기억에 남은 건?', facts).unsupported, []);
  assert.deepEqual(scoreSeed('쓸 거리: 은색 벨트\n이 중 기억에 남은 건?', facts).unsupported, ['은색 벨트']);
  assert.equal(scoreSeed('완성된 캡션입니다', facts).shape, false);
  // develop #123: 한 슬롯에 소재는 하나다. 두 사실의 명사를 이으면 형식 위반이다.
  assert.equal(scoreSeed('쓸 거리: 검은 벨트 · 초록 잎\n이 중 기억에 남은 건?', facts).over_count, true);

  const photos = [{photo_id: 'p1', text_in_image: '가을 맛집 브랜드 25곳'}];
  assert.deepEqual(scoreTitle('가을 맛집 브랜드 25곳, 의류부터', photos).digits, ['25']);
  assert.ok(scoreTitle('가을 맛집 브랜드 25곳, 의류부터', photos).lifted_overlay.length > 0);
  assert.deepEqual(scoreTitle('사진을 잇는 순서', photos).lifted_overlay, []);
});

test('the checked-in worksheet renders exactly from its validated artifact', async () => {
  assert.equal(await readFile(new URL('../docs/specs/101-caption-seed-acceptance/review.md', import.meta.url), 'utf8'), renderReview(saved));
});

// #101 리뷰: 같은 사진을 두 번 적어 15장 대조를 채우는 길을 막는다.
test('duplicate review rows cannot stand in for fifteen distinct photos', () => {
  for (const edit of [
    a => { a.review[1] = structuredClone(a.review[0]); },
    a => { a.review[1].file_ref = a.review[0].file_ref; },
    a => { a.review[1].file_ref = 'not_a_recorded_file.jpg'; }
  ]) {
    const changed = structuredClone(saved);
    edit(changed);
    assert.throws(() => validateArtifact(changed));
  }
});

// #101 리뷰: 시도 16회 중 4회가 실패한 회차를 PASS 라고 부르지 않는다.
test('a round with generation failures may not be recorded as a live_model pass', () => {
  assert.ok(saved.provenance.generate_failures.length > 0);
  assert.equal(saved.acceptance.live_model, 'PARTIAL');
  const promoted = structuredClone(saved);
  promoted.acceptance.live_model = 'PASS';
  assert.throws(() => validateArtifact(promoted));
});

// #101 리뷰: 관측 원문 대조는 원본 사진 대조가 아니다. 둘을 같은 칸에 적지 않는다.
test('source-consistency and original-image factuality are counted apart', () => {
  const s = scoreArtifact(saved);
  assert.equal(s.totals.unsupported_materials, 0, '관측 원문 대조');
  const t = tally(saved.review);
  assert.ok(t.image_factuality_failures > 0, '원본 사진 대조에서는 실패가 있었다');
  assert.equal(t.image_factuality_failures, t.not_usable);
  // 수식 없는 홑낱말 소재는 관측을 그대로 옮긴 것이므로 유용성 근거가 되지 못한다.
  assert.ok(s.totals.bare_materials > 0);
});
