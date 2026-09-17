import { validateClaims, validateClaim, validatePhotoConservation, validatePositions, validateTitle, validateDisclosure } from '../lib/contracts.js';

// Expected inputs are supplied by the caller from the independent input manifest.
export function evaluate({ feed, output, inputPhotoIds, targetProfile, currentProfile }) {
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
    E8: () => validateDisclosure(feed?.applied_profile,currentProfile)
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
