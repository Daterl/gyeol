import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { orderFeed } from '../lib/order.js';

test('a tie caused by opener bonus explains total score rather than unequal direction scores', () => {
  const f=JSON.parse(readFileSync(new URL('../fixtures/interaction.sample.json',import.meta.url)));
  const photos=f.context.photos.map((p,i)=>({...p,analysis_source:'vision_model',model:'synthetic-bonus-repro',composition:'full_frame',has_face:i===1,color:{...p.color,bright_mean:[.8,.5,.1][i],sat_mean:.2,hue_mean:0}}));
  const target=structuredClone(f.context.target);
  target.visual={palette:{value:photos[1].color,confidence:1,evidence:[{kind:'aggregate',ref:'repro',note:'합성 재현 색'}]}};
  target.language=null;target.completeness={visual:.2,language:0,sequence:1};
  target.sequence={carousel_count:1,opener_tendency:{value:'인물',confidence:1,evidence:[{kind:'aggregate',ref:'repro',note:'합성 재현 캐러셀'}]}};
  const result=orderFeed({photoAnalyses:photos,targetProfile:target,currentProfile:f.context.current});
  const first=result.slots.find(s=>s.position===1);
  assert.equal(first.photo_id,photos[1].photo_id);
  assert.match(first.rationale.value,/보너스 포함 총점/);
  assert.match(first.rationale.evidence.at(-1).note,/보너스 포함 총점/);
  assert.doesNotMatch(first.rationale.evidence.at(-1).note,/점수가 가장 높은 사진/);
});
