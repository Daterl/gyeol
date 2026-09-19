import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {orderFeed} from '../lib/order.js';
// 저장된 실사진 측정 픽스처만 읽는다. 모델·네트워크 호출 0회.
const read = p => JSON.parse(readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)),'utf8'));
const photos = read('test/order.real20.json').slice(0,15);
const feed = orderFeed({photoAnalyses:photos, targetProfile:read('eval/golden/case_01/target_quiet.json'), currentProfile:read('eval/golden/case_01/current_profile.json'), now:'2026-09-18T00:00:00.000Z'});
console.log('CONCEPT:', feed.concept ? feed.concept.value : '(없음)');
for (const s of feed.slots) {
  const p = photos.find(x=>x.photo_id===s.photo_id);
  console.log(`\n${s.position} / ${s.photo_id} [${s.narrative_role}] b=${p.color.bright_mean} s=${p.color.sat_mean}`);
  console.log('  VALUE: '+s.rationale.value);
}
const vals = feed.slots.map(s=>s.rationale.value);
const dup = {};
for (const v of vals) dup[v]=(dup[v]||0)+1;
console.log('\n--- 중복 문장 ---');
for (const [v,c] of Object.entries(dup)) if (c>1) console.log(`${c}회: ${v}`);
