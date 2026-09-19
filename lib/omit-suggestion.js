// Only the analyzer's observed duplicate relation can trigger this suggestion.
// Colour similarity, dark thresholds and heuristic spatial defaults are not evidence.
import { signatureDistance } from './photo_signature.js';

const duplicateRefs = photo => photo.quality_flags
  .filter(flag => flag.startsWith('duplicate_of:'))
  .map(flag => flag.slice('duplicate_of:'.length));

// 같은 배치 안에서 "비슷한 사진" 이라고 말할 수 있는 구조 서명 거리의 상한.
// 측정값이 아니라 실측 분포에서 고른 설계 상수이고, 고른 근거는 실사진 291장 42,195쌍이다
// (docs/specs/97-exclusion-quality/report.md 2-3절):
//   - 서로 다른 게시물 40,726쌍의 최솟값이 0.5515 다. 이 값 아래로 내려온 무관한 쌍은 0건이었다.
//   - 이 상한 아래로 들어온 실사진 쌍 8건을 전부 눈으로 열어 대조했고 모두 같은 배치의 같은 판형이었다.
// 0.5515 에 붙이지 않고 0.40 으로 여유를 두는 이유는, 관측된 최솟값은 표본의 바닥이지 경계가 아니기 때문이다.
// 이 상수는 판정을 바꾸므로 반드시 근거 문장과 evidence.note 에 숫자로 함께 나타난다 (#9·#12·#41·#69 의 함정).
export const SIMILAR_DISTANCE = 0.40;

// 배치 안에서 자기보다 먼저 들어온 사진 중 구조가 가장 가까운 한 장. 없으면 null.
// 먼저 들어온 쪽을 남기므로 같은 배치에서 같은 입력은 항상 같은 결과를 낸다.
function nearestEarlier(photo, photos) {
  if (!photo.structure_signature) return null;
  let best = null;
  for (const other of photos) {
    if (other.input_index >= photo.input_index || !other.structure_signature) continue;
    const distance = signatureDistance(photo.structure_signature, other.structure_signature);
    if (distance === null || distance >= SIMILAR_DISTANCE) continue;
    if (!best || distance < best.distance || (distance === best.distance && other.input_index < best.photo.input_index)) best = { photo: other, distance };
  }
  return best;
}

export function withOmitSuggestions(feed, photos) {
  const byId = new Map(photos.map(photo => [photo.photo_id, photo]));
  let hasDuplicateObservation = false;
  let similarCount = 0;
  const slots = feed.slots.map(slot => {
    const photo = byId.get(slot.photo_id);
    const refs = duplicateRefs(photo);
    hasDuplicateObservation ||= refs.length > 0;
    const original = refs.length === 1 ? byId.get(refs[0]) : null;
    // A missing/self/cyclic/chained reference cannot identify an unambiguous original.
    const recommended = Boolean(original && original.photo_id !== photo.photo_id
      && duplicateRefs(original).length === 0);
    // 동일 바이트 중복이 이미 잡힌 사진은 그 근거가 더 강하므로 유사 판정을 덧붙이지 않는다.
    const similar = recommended ? null : nearestEarlier(photo, photos);
    if (similar) similarCount++;
    const omit_suggestion = recommended ? {
      recommended: true,
      reason: `${original.photo_id}와 동일 바이트 중복으로 관측되어 이 사진은 빼는 것을 권합니다.`,
      evidence: [
        { kind: 'uploaded_photo', ref: photo.photo_id, note: `PhotoAnalysis.quality_flags의 관측값: duplicate_of:${original.photo_id}` },
        { kind: 'uploaded_photo', ref: original.photo_id, note: `${photo.photo_id}의 duplicate_of가 가리키는 현재 입력 사진입니다.` }
      ]
    } : similar ? {
      recommended: true,
      reason: `${similar.photo.photo_id}와 화면 배치가 거의 같게 관측되어(구조 거리 ${similar.distance}, 기준 ${SIMILAR_DISTANCE} 미만) 이 사진은 빼는 것을 권합니다.`,
      evidence: [
        { kind: 'uploaded_photo', ref: photo.photo_id, note: `PhotoAnalysis.structure_signature로 잰 ${similar.photo.photo_id}와의 구조 거리 ${similar.distance} (기준 ${SIMILAR_DISTANCE} 미만일 때만 권합니다)` },
        { kind: 'uploaded_photo', ref: similar.photo.photo_id, note: `먼저 올린 사진이라 이 장을 남기고 ${photo.photo_id}를 뺄 후보로 뒀습니다.` }
      ]
    } : { recommended: false, reason: null, evidence: [] };
    return { ...slot, omit_suggestion };
  });
  const recommended_count = slots.filter(slot => slot.omit_suggestion.recommended).length;
  const duplicateCount = recommended_count - similarCount;
  const parts = [];
  if (duplicateCount > 0) parts.push(`동일 바이트 중복이 관측된 ${duplicateCount}장`);
  if (similarCount > 0) parts.push(`화면 배치가 거의 같게 관측된 ${similarCount}장`);
  return {
    ...feed, slots,
    omit_summary: {
      recommended_count,
      message: recommended_count === 0
        ? hasDuplicateObservation
          ? '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'
          : '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
        : `${parts.join('과 ')}의 빼기를 권합니다. 사진은 모두 유지했으며 제외 여부는 직접 결정해 주세요.`
    }
  };
}
