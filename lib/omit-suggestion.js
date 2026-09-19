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

// 배치 안에서 자기보다 먼저 들어왔고 **남기기로 한** 사진 중 구조가 가장 가까운 한 장. 없으면 null.
// 후보군을 retained(남는 사진)로 제한하는 이유: 이미 빼기를 권한 사진을 비교 원본으로 삼으면
// A←B←C 연쇄에서 "B를 빼라"와 "B를 남기고 C를 빼라"를 동시에 말하게 된다. 권고를 모두 따르면
// C의 유일한 근거 B가 사라지고, 남은 A와 C는 기준 밖이라 근거 없는 권고가 된다(P2).
// retained 대표만 비교하면 남는 사진과의 직접 거리가 항상 기준 미만임이 보장된다.
function nearestRetained(photo, retained) {
  if (!photo.structure_signature) return null;
  let best = null;
  for (const other of retained) {
    if (!other.structure_signature) continue;
    const distance = signatureDistance(photo.structure_signature, other.structure_signature);
    if (distance === null || distance >= SIMILAR_DISTANCE) continue;
    if (!best || distance < best.distance || (distance === best.distance && other.input_index < best.photo.input_index)) best = { photo: other, distance };
  }
  return best;
}

// 입력 순서대로 한 번 훑으며 각 사진의 빼기 판정을 정한다. 빼기를 권한 사진은 retained 에 들어가지
// 않으므로 다음 사진의 비교 원본이 되지 않는다. 같은 입력은 항상 같은 결과를 낸다.
function decide(photos, byId) {
  const retained = [], decisions = new Map();
  for (const photo of [...photos].sort((a, b) => a.input_index - b.input_index)) {
    const refs = duplicateRefs(photo);
    const original = refs.length === 1 ? byId.get(refs[0]) : null;
    // A missing/self/cyclic/chained reference cannot identify an unambiguous original.
    if (original && original.photo_id !== photo.photo_id && duplicateRefs(original).length === 0) {
      decisions.set(photo.photo_id, { kind: 'duplicate', original });
      continue;
    }
    // 동일 바이트 중복이 이미 잡힌 사진은 그 근거가 더 강하므로 유사 판정을 덧붙이지 않는다.
    const similar = nearestRetained(photo, retained);
    if (similar) { decisions.set(photo.photo_id, { kind: 'similar', ...similar }); continue; }
    retained.push(photo);
  }
  return decisions;
}

export function withOmitSuggestions(feed, photos) {
  const byId = new Map(photos.map(photo => [photo.photo_id, photo]));
  const hasDuplicateObservation = photos.some(photo => duplicateRefs(photo).length > 0);
  const decisions = decide(photos, byId);
  let similarCount = 0;
  const slots = feed.slots.map(slot => {
    const photo = byId.get(slot.photo_id);
    const decision = decisions.get(slot.photo_id) ?? null;
    if (decision?.kind === 'similar') similarCount++;
    const omit_suggestion = decision?.kind === 'duplicate' ? {
      recommended: true,
      reason: `${decision.original.photo_id}와 동일 바이트 중복으로 관측되어 이 사진은 빼는 것을 권합니다.`,
      evidence: [
        { kind: 'uploaded_photo', ref: photo.photo_id, note: `PhotoAnalysis.quality_flags의 관측값: duplicate_of:${decision.original.photo_id}` },
        { kind: 'uploaded_photo', ref: decision.original.photo_id, note: `${photo.photo_id}의 duplicate_of가 가리키는 현재 입력 사진입니다.` }
      ]
    } : decision?.kind === 'similar' ? {
      recommended: true,
      reason: `${decision.photo.photo_id}와 화면 배치가 거의 같게 관측되어(구조 거리 ${decision.distance}, 기준 ${SIMILAR_DISTANCE} 미만) 이 사진은 빼는 것을 권합니다.`,
      evidence: [
        { kind: 'uploaded_photo', ref: photo.photo_id, note: `PhotoAnalysis.structure_signature로 잰 ${decision.photo.photo_id}와의 구조 거리 ${decision.distance} (기준 ${SIMILAR_DISTANCE} 미만일 때만 권합니다)` },
        { kind: 'uploaded_photo', ref: decision.photo.photo_id, note: `먼저 올린 사진이라 이 장을 남기고 ${photo.photo_id}를 뺄 후보로 뒀습니다.` }
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
