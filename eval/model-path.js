// Injected observations exercise production wiring, not real model quality.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzePhoto, resetAnalysisState } from '../lib/photo_analysis.js';
import { extractFromFreetext, validateProfileEvidence } from '../lib/target_profile.js';
import { buildCurrentProfile } from '../lib/current_profile.js';
import { orderFeed } from '../lib/order.js';
import { validateFeed, validateProfile } from '../lib/contracts.js';
import { evaluate } from './invariants.js';

export async function evaluateModelPath() {
  const bytes = await readFile(new URL('../fixtures/jpeg/solid_white_baseline.jpg', import.meta.url));
  const inputPhotoIds = ['input_1', 'input_2', 'input_3']; // independent caller manifest
  const checked = ['E1', 'E2', 'E3', 'E8', 'E9', 'E10', 'E11'];
  for (const variant of [0, 1]) {
    resetAnalysisState();
    const photoAnalyses = [];
    for (const [inputIndex, photoId] of inputPhotoIds.entries()) {
      // Reset so every injected variant actually traverses the model boundary.
      resetAnalysisState();
      const { analysis } = await analyzePhoto({ bytes, photoId, inputIndex, fileRef: `${photoId}.jpg`, apiKey: 'eval-fake-key',
        client: async () => ({ model: 'injected-eval-only', observation: {
          color: { hue_mean: 0, sat_mean: 0, bright_mean: 1, palette_hex: ['#ffffff'] },
          composition: variant ? 'negative_space' : 'full_frame', scale: variant ? 'closeup' : 'midshot',
          subjects: [], has_face: false, text_in_image: null,
          describable_facts: variant ? ['흰 바탕이 보인다'] : [], quality_flags: []
        } }) });
      photoAnalyses.push(analysis);
    }
    const targetProfile = extractFromFreetext('짧게, 담백');
    validateProfileEvidence(targetProfile);
    const currentProfile = buildCurrentProfile({ photos: photoAnalyses });
    validateProfile(currentProfile, 'current');
    const feed = orderFeed({ photoAnalyses, targetProfile, currentProfile });
    validateFeed(feed, inputPhotoIds, currentProfile, targetProfile, photoAnalyses);
    const bundle = { feed, inputPhotoIds, targetProfile, currentProfile, photoAnalyses };
    const result = evaluate(bundle);
    for (const id of checked) assert.equal(result[id].pass, true, `${id}: ${result[id].reason}`);
    const broken = structuredClone(bundle);
    broken.feed.slots[0].caption_inputs.describable_facts = ['입력에 없는 장소'];
    assert.equal(evaluate(broken).E11.pass, false, 'foreign facts must fail even for a model path');
    console.log(`Injected model variant ${variant}: ${checked.join('/')} PASS; foreign fact E11 EXPECTED FAIL (not AI quality).`);
  }
  resetAnalysisState();
}
