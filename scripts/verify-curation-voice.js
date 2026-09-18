// 실사진 경로는 호출자가 제공한다. 한 사진당 한 번 분석하고 모델 호출은 하지 않는다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import assert from 'node:assert/strict';
import { analyzePhoto } from '../lib/photo_analysis.js';
import sharp from 'sharp';
import { orderFeed } from '../lib/order.js';
const out = 'docs/specs/109-curation-voice';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const root = process.argv[2];
assert.ok(root, '실사진 images 디렉터리를 인수로 지정하세요');
const source = (await read('test/order.real20.json')).slice(0, 15);
const photos = [];
await mkdir(`${out}/photos`, {recursive:true});
for (const photo of source) {
  const path = resolve(root, basename(photo.file_ref));
  const { analysis } = await analyzePhoto({bytes: await readFile(path), photoId: photo.photo_id, inputIndex: photo.input_index, fileRef: photo.file_ref, apiKey: ''});
  photos.push(analysis);
  await sharp(path).resize({width:240}).jpeg({quality:75}).toFile(`${out}/photos/${photo.photo_id}.jpg`);
}
const input = {photoAnalyses: photos, targetProfile: await read('eval/golden/case_01/target_quiet.json'), currentProfile: await read('eval/golden/case_01/current_profile.json'), now: '2026-09-18T00:00:00.000Z'};
const feed = orderFeed(input);
const baseline = process.argv.includes('--baseline');
await writeFile(`${out}/${baseline ? 'before' : 'after'}.json`, JSON.stringify({photos, feed}, null, 2)+'\n');
if (baseline) { console.log('PASS: baseline 15 actual photos, one analysis call each'); process.exit(0); }
const before = await read(`${out}/before.json`);
const observations = list => list.map(({analyzed_at, ...photo}) => photo);
assert.deepEqual(observations(photos), observations(before.photos), '시각 외 동일 사진 측정으로 비교');
assert.deepEqual(feed.slots.map(s => [s.photo_id,s.caption_inputs,s.narrative_role]), before.feed.slots.map(s => [s.photo_id,s.caption_inputs,s.narrative_role]), '순서 및 캡션 재료 불변');
const forbidden = /채도|밝기\s*0\.|색 거리|\bR[1-4]\b|측정값|#[0-9a-f]{6}\b/gi;
const hits = feed.slots.flatMap(s => [...s.rationale.value.matchAll(forbidden)]);
assert.equal(hits.length, 0);
for (const slot of feed.slots) {
  const old = before.feed.slots.find(s => s.photo_id === slot.photo_id);
  for (const evidence of old.rationale.evidence) assert.ok(slot.rationale.evidence.some(e => JSON.stringify(e)===JSON.stringify(evidence)), '기존 근거 보존');
  assert.ok(slot.rationale.evidence.some(e => e.note.includes(old.rationale.value)), '선택 계산 설명 보존');
}
const reviews = await read(`${out}/agent-review.json`);
const rows = feed.slots.map(slot => {
  const old = before.feed.slots.find(s => s.photo_id===slot.photo_id);
  return `| ${slot.position} / ${slot.photo_id} ![${slot.photo_id}](photos/${slot.photo_id}.jpg) | ${old.rationale.value} | ${slot.rationale.value} | ${reviews[slot.photo_id].agent_suitability} | □ O / □ X |`;
});
await writeFile(`${out}/comparison.md`, '# 실사진 15장 전후 비교\n\n| 자리 / 사진 | 수정 전 | 수정 후 | 에이전트 의견 (사람 아님) | 사람 판정: 그대로 인스타에 올릴 수 있는가 |\n|---|---|---|---|---|\n'+rows.join('\n')+'\n');
console.log('PASS: 15 real photos; visible forbidden hits 0; order/caption inputs unchanged; original evidence and decision calculations retained');
