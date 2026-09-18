import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { placementVoice } from '../lib/curation-voice.js';
import { orderFeed } from '../lib/order.js';
import { extractFromFreetext, planFromPhotos } from '../lib/target_profile.js';
import { buildCurrentProfile } from '../lib/current_profile.js';
import { buildFeed } from '../lib/pipeline.js';

const real = JSON.parse(await readFile(new URL('./order.real20.json', import.meta.url)));
// Synthetic observations: these test provenance, not a fresh model's visual accuracy.
const facts = ['갈색 가방이 보인다', '분홍색 신발이 놓여 있다', '흰 개가 앉아 있다'];
const fixture = count => real.slice(0, count).map((p, i) => ({...p,
  color: {...real[0].color}, analysis_source: 'vision_model', model: 'fixture',
  describable_facts: ['물체가 보인다', facts[i % facts.length]]
}));

test('same-color placement quotes distinguishing own and adjacent observations verbatim', () => {
  const [previous, current, next] = fixture(3);
  for (const role of ['opener', 'sustain', 'turn', 'closer']) {
    const adjacent = role === 'opener' ? next : previous;
    const voice = placementVoice(current, role === 'opener' ? null : previous, role, next);
    for (const p of [current, adjacent]) {
      assert.ok(voice.value.includes(p.describable_facts[1]));
      assert.ok(voice.evidence.some(e => e.kind === 'uploaded_photo' && e.ref === p.photo_id && e.note === p.describable_facts[1]));
    }
    assert.doesNotMatch(voice.value, /다음 사진을 이어서 보여줘요|앞 장보다|같은 장소|같은 사람/);
    assert.match(voice.value, /순서를 정한 근거는 아니/);
  }
});

test('shared, absent and heuristic facts disclose limits instead of inventing differences', () => {
  const [a, b] = fixture(3);
  for (const edit of [
    {describable_facts: ['물체가 보인다']},
    {describable_facts: []},
    {analysis_source: 'heuristic', describable_facts: ['행복한 오후의 가족 여행']}
  ]) {
    const voice = placementVoice({...b, ...edit}, {...a, ...edit}, 'turn');
    assert.match(voice.value, /구분할 관측이 부족/);
    assert.doesNotMatch(voice.value, /변화를|가족|여행|행복|오후/);
    assert.deepEqual(new Set(voice.evidence.filter(e => e.kind === 'uploaded_photo').map(e => e.ref)), new Set([a.photo_id, b.photo_id]));
  }
});

test('measured contrast cites both photos and does not require model observations', () => {
  const [a, b] = real;
  const current = {...b, color: {...b.color, bright_mean: a.color.bright_mean + .2}};
  const voice = placementVoice(current, a, 'closer');
  assert.match(voice.value, /환한 화면/);
  assert.deepEqual(new Set(voice.evidence.filter(e => e.kind === 'uploaded_photo').map(e => e.ref)), new Set([a.photo_id, b.photo_id]));
});

for (const count of [3, 15]) test(`${count}-photo fixture preserves order decisions and source while tracing every placement`, () => {
  const photos = fixture(count), before = structuredClone(photos);
  for (const targetProfile of [extractFromFreetext('조용하고 담백하게'), planFromPhotos(photos)]) {
    const run = photoAnalyses => orderFeed({photoAnalyses, targetProfile,
      currentProfile: buildCurrentProfile(), now: '2026-09-18T00:00:00.000Z'});
    const feed = run(photos);
    const withoutFacts = run(photos.map(p => ({...p, describable_facts: []})));
    const decisions = f => f.slots.map(s => [s.photo_id, s.position, s.narrative_role,
      s.rationale.evidence.filter(e => /^order\.R[1-4](\.decision)?$/.test(e.ref))]);
    assert.deepEqual(decisions(feed), decisions(withoutFacts));
    const ordered = feed.slots.map(s => photos.find(p => p.photo_id === s.photo_id));
    for (const [i, slot] of feed.slots.entries()) {
      const own = ordered[i], adjacent = ordered[i === 0 ? 1 : i - 1];
      for (const p of [own, adjacent]) {
        const evidence = slot.rationale.evidence.filter(e => e.kind === 'uploaded_photo' && e.ref === p.photo_id && p.describable_facts.includes(e.note));
        assert.ok(evidence.length, `missing observation for ${p.photo_id} at ${i + 1}`);
        assert.ok(evidence.some(e => slot.rationale.value.includes(e.note)));
      }
      assert.deepEqual(slot.caption_inputs.describable_facts, own.describable_facts);
      // Repetition is legitimate when the same observations recur; never vary by index.
      assert.deepEqual(placementVoice(own, i ? adjacent : null, slot.narrative_role, i ? undefined : adjacent),
        placementVoice({...own, input_index: 999}, i ? adjacent : null, slot.narrative_role, i ? undefined : adjacent));
    }
  }
  assert.deepEqual(photos, before);
});

test('archived model observations trace through buildFeed for 3 and 15 photos without new model calls', async () => {
  const archive = JSON.parse(await readFile(new URL('../docs/specs/101-caption-quality/audit-analyses.json', import.meta.url)));
  const recovered = JSON.parse(await readFile(new URL('../docs/specs/101-caption-quality/recovered-analysis.json', import.meta.url)));
  const all = archive.map((item, i) => {
    if (item.ok) return item.a;
    assert.ok(item.file.endsWith(recovered.analysis.file_ref));
    // The recovered analysis used a different session's ID. Restore the archive
    // slot ID only; keep observations and their model/source metadata unchanged.
    return {...recovered.analysis, photo_id: `ph_${String(i + 1).padStart(2, '0')}`};
  });
  for (const count of [3, 15]) {
    const photos = all.slice(0, count), before = structuredClone(photos);
    const {feed, context} = await buildFeed({schema_version:'1.0',session_id:'placement-archive',photos,
      identity:{target:{kind:'text',text:'조용하고 담백하게'},current:{kind:'none'}}});
    for (const [i, slot] of feed.slots.entries()) {
      const adjacentId = feed.slots[i === 0 ? 1 : i - 1].photo_id;
      const own = photos.find(p => p.photo_id === slot.photo_id);
      assert.deepEqual(slot.caption_inputs.describable_facts, own.describable_facts);
      for (const id of [slot.photo_id, adjacentId]) {
        const photo = photos.find(p => p.photo_id === id);
        assert.ok(slot.rationale.evidence.some(e => e.kind === 'uploaded_photo' && e.ref === id &&
          photo.describable_facts.includes(e.note) && slot.rationale.value.includes(e.note)));
      }
    }
    assert.deepEqual(context.photos, before);
    assert.deepEqual(photos, before);
  }
});
