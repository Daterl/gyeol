// Only the analyzer's observed duplicate relation can trigger this suggestion.
// Colour similarity, dark thresholds and heuristic spatial defaults are not evidence.
const duplicateRefs = photo => photo.quality_flags
  .filter(flag => flag.startsWith('duplicate_of:'))
  .map(flag => flag.slice('duplicate_of:'.length));

export function withOmitSuggestions(feed, photos) {
  const byId = new Map(photos.map(photo => [photo.photo_id, photo]));
  let hasDuplicateObservation = false;
  const slots = feed.slots.map(slot => {
    const photo = byId.get(slot.photo_id);
    const refs = duplicateRefs(photo);
    hasDuplicateObservation ||= refs.length > 0;
    const original = refs.length === 1 ? byId.get(refs[0]) : null;
    // A missing/self/cyclic/chained reference cannot identify an unambiguous original.
    const recommended = Boolean(original && original.photo_id !== photo.photo_id
      && duplicateRefs(original).length === 0);
    const omit_suggestion = recommended ? {
      recommended: true,
      reason: `${original.photo_id}와 동일 바이트 중복으로 관측되어 이 사진은 빼는 것을 권합니다.`,
      evidence: [
        { kind: 'uploaded_photo', ref: photo.photo_id, note: `PhotoAnalysis.quality_flags의 관측값: duplicate_of:${original.photo_id}` },
        { kind: 'uploaded_photo', ref: original.photo_id, note: `${photo.photo_id}의 duplicate_of가 가리키는 현재 입력 사진입니다.` }
      ]
    } : { recommended: false, reason: null, evidence: [] };
    return { ...slot, omit_suggestion };
  });
  const recommended_count = slots.filter(slot => slot.omit_suggestion.recommended).length;
  return {
    ...feed, slots,
    omit_summary: {
      recommended_count,
      message: recommended_count === 0
        ? hasDuplicateObservation
          ? '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'
          : '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
        : `동일 바이트 중복이 관측된 ${recommended_count}장의 빼기를 권합니다. 사진은 모두 유지했으며 제외 여부는 직접 결정해 주세요.`
    }
  };
}
