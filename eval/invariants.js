import { validateClaims, validateClaim, validatePhotoConservation, validatePositions, validateTitle, validateDisclosure, validateTargetAxis, validatePhotoRefs, validateFactProvenance } from '../lib/contracts.js';

// Expected inputs are supplied by the caller from the independent input manifest.
export function evaluate({ feed, output, inputPhotoIds, targetProfile, currentProfile, photoAnalyses }) {
  const checks = {
    E1: () => {
      validateClaims({ feed, output, targetProfile, currentProfile });
      // Mandatory rationale must be a Claim even if every Claim-shaped key is removed.
      if (!Array.isArray(feed?.slots)) throw new Error('Missing slots');
      feed.slots.forEach(s=>validateClaim(s.rationale,'rationale'));
    },
    E2: () => validatePhotoConservation(feed,inputPhotoIds),
    E3: () => validatePositions(feed?.slots,inputPhotoIds.length),
    E6: () => validateTitle(output),
    E8: () => validateDisclosure(feed?.applied_profile,currentProfile),
    // Target axis is the primary axis; without this the applied profile can be invented wholesale.
    E9: () => validateTargetAxis(feed?.applied_profile,targetProfile),
    // Evidence that resolves to nothing is not evidence.
    E10: () => { validatePhotoRefs(feed,inputPhotoIds,'feed'); validatePhotoRefs(output,inputPhotoIds,'export'); },
    // describable_facts must be that photo's own facts, not another photo's real facts.
    E11: () => validateFactProvenance(feed,photoAnalyses)
  };
  return Object.fromEntries(Object.entries(checks).map(([id,check])=> {
    try { check(); return [id,{pass:true}]; }
    catch(error) { return [id,{pass:false,reason:error.message}]; }
  }));
}
export function breakFixture(bundle, mutation) {
  const copy=structuredClone(bundle);
  let target=mutation.document==='export'?copy.output:copy.feed;
  for(const key of mutation.path.slice(0,-1)) target=target[key];
  target[mutation.path.at(-1)]=mutation.value;
  return copy;
}
