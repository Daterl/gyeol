// 실행: node scripts/compose-example.js — 기존 실측 사진과 지향 두 벌을 재사용한다.
import { readFile, writeFile } from 'node:fs/promises';
import { composeFeed } from '../lib/compose.js';
const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const photoAnalyses = await read('test/order.real20.json');
const currentProfile = (await read('fixtures/current_profile.sample.json')).find(p => p.present);
for (const name of ['quiet', 'detail']) {
  const targetProfile = await read(`eval/golden/case_01/target_${name}.json`);
  const feed = composeFeed({ photoAnalyses, targetProfile, currentProfile, now: '2026-09-17T00:00:00.000Z' });
  await writeFile(new URL(`../docs/specs/13-two-axis/ordered_${name}.json`, import.meta.url), JSON.stringify(feed, null, 2) + '\n');
  console.log(name, JSON.stringify({ applied: feed.applied_profile.deltas, disclosure: feed.applied_profile.disclosure,
    photo_ids: [...feed.slots].sort((a, b) => a.position - b.position).map(s => s.photo_id) }));
}
