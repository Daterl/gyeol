import { validateFeed, validateProfile } from './contracts.js';
import { composeCaptionLen, orderFeed } from './order.js';

// 캡션 길이 1종만 보정한다. 원근거는 복사하며 새 관측이나 UI 문장은 만들지 않는다.
export function composeProfile({ targetProfile, currentProfile } = {}) {
  validateProfile(targetProfile, 'target');
  validateProfile(currentProfile, 'current');
  const applied = {
    target_profile_id: targetProfile.profile_id,
    current_profile_id: currentProfile.present ? currentProfile.profile_id : null,
    corrected: false, disclosure: 'target_only', deltas: [],
    visual: structuredClone(targetProfile.visual),
    language: structuredClone(targetProfile.language),
    sequence: structuredClone(targetProfile.sequence)
  };
  // 합성 규칙은 lib/order.js 에 한 벌만 둔다. 여기서 다시 계산하면 화면(간극 카드)과
  // 순서(resolveDirection)가 서로 다른 값을 쓰게 된다 — #99 가 잡아낸 상태가 그것이다.
  const correction = composeCaptionLen(targetProfile, currentProfile);
  if (!correction) return applied;
  applied.language.caption_len = correction.claim;
  applied.corrected = true;
  applied.disclosure = 'corrected';
  applied.deltas = [correction.delta];
  return applied;
}

// 순서 근거는 원래 지향에 대한 것이다. 합성된 언어를 가짜 TargetProfile로 재포장하지 않는다.
export function composeFeed(options = {}) {
  const applied = composeProfile(options);
  const feed = orderFeed(options);
  feed.applied_profile = applied;
  validateFeed(feed, options.photoAnalyses.map(photo => photo.photo_id),
    options.currentProfile, options.targetProfile, options.photoAnalyses, (options.currentPhotoAnalyses ?? []).map(photo => photo.photo_id));
  return feed;
}
