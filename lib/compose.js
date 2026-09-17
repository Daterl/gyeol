import { validateFeed, validateProfile } from './contracts.js';
import { orderFeed } from './order.js';

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
  const target = targetProfile.language?.caption_len;
  const current = currentProfile.language?.caption_len;
  if (!currentProfile.present || !target || !current || target.value.p50 === current.value.p50) return applied;
  const t = target.value.p50, c = current.value.p50;
  const resolved = Math.min(Math.max(t, c), Math.max(Math.min(t, c),
    Math.round(Math.expm1((Math.log1p(t) + Math.log1p(c)) / 2))));
  if (resolved === t) return applied;
  const evidence = structuredClone([...target.evidence, ...current.evidence, {
    kind: 'rule', ref: 'compose.log_midpoint',
    note: 'p50=round(expm1((log1p(target)+log1p(current))/2)); p90=max(target.p90,resolved); 설계 규칙이며 재측정한 분포가 아니다'
  }]);
  applied.language.caption_len = {
    value: { p50: resolved, p90: Math.max(target.value.p90, resolved), unit: '자' },
    confidence: Math.min(target.confidence, current.confidence), evidence
  };
  applied.corrected = true;
  applied.disclosure = 'corrected';
  applied.deltas = [{
    field: 'language.caption_len.p50', target: t, current: c, resolved,
    rule: 'log_midpoint', note_key: 'caption_len_gap', evidence: structuredClone(evidence)
  }];
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
