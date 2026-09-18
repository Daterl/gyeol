import { validateFeed, validatePhotoPlan, validateProfile } from './contracts.js';
import { orderFeed } from './order.js';

// 현재 프로필을 결과에 사용했다는 주장을 할 수 있는 검증된 보정 규칙이 없다.
// ID는 입력 추적용으로 남기되 결과는 지향만 복사하고 target_only로 공개한다.
export function composeProfile({ targetProfile, currentProfile } = {}) {
  // 사진만 올린 경로는 지향축 자리에 PhotoPlan 이 온다. 가짜 TargetProfile 로 재포장하지 않고 plan 그대로
  // 싣는다 — 어느 쪽이 실렸는지는 target_profile_id/photo_plan_id 로 드러나고 validateTargetAxis 가 검사한다.
  const plan = targetProfile?.kind === 'photo_plan' ? targetProfile : null;
  if (plan) validatePhotoPlan(plan); else validateProfile(targetProfile, 'target');
  validateProfile(currentProfile, 'current');
  const applied = {
    ...(plan ? { target_profile_id: null, photo_plan_id: plan.plan_id } : { target_profile_id: targetProfile.profile_id }),
    current_profile_id: currentProfile.present ? currentProfile.profile_id : null,
    corrected: false, disclosure: 'target_only', deltas: [],
    visual: structuredClone(targetProfile.visual),
    language: structuredClone(targetProfile.language),
    sequence: structuredClone(targetProfile.sequence)
  };
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
