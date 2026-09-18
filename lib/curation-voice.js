// 색에서 장소·시간·감정을 추측하지 않는다. 문장 경계는 보수적인 설계 상수이며 측정값이 아니다.
const CONCEPT_SPREAD = 0.25;
const VISIBLE_STEP = 0.12;
const measurement = photo => ({kind: 'uploaded_photo', ref: photo.photo_id,
  note: `묶음·인접 비교 측정값 — 밝기 ${photo.color.bright_mean} · 채도 ${photo.color.sat_mean}`});

// 컨셉은 사진 한 장이 아니라 묶음 전체의 판단이므로 슬롯이 아니라 피드(OrderedFeed.concept)에 붙는다.
// 임계 미달이면 null 을 돌려주고 호출자는 필드를 생략한다 — 말할 근거가 없으면 값도 내지 않는다.
// evidence 는 photo_id 오름차순으로 고정한다. 입력 배열 순서가 달라도 재계산 검증과 일치해야 한다.
export function bundleConcept(photos) {
  const spread = key => Math.max(...photos.map(p => p.color[key])) - Math.min(...photos.map(p => p.color[key]));
  const value = spread('sat_mean') >= CONCEPT_SPREAD
    ? '옅은 색과 짙은 색이 어우러지는 흐름으로 엮어요.'
    : spread('bright_mean') >= CONCEPT_SPREAD
      ? '밝고 어두운 화면이 어우러지는 흐름으로 엮어요.'
      : null;
  if (value === null) return null;
  const sources = [...photos].sort((a, b) => a.photo_id < b.photo_id ? -1 : a.photo_id > b.photo_id ? 1 : 0);
  return {value, confidence: 1, evidence: [...sources.map(measurement), {kind:'rule',ref:'order.bundle_concept',
    note:`컨셉은 채도 범위, 밝기 범위 순으로 ${CONCEPT_SPREAD} 이상일 때만 설명한다. 임계값은 설계 상수이며 미달이면 컨셉을 내지 않는다.`}]};
}

export function placementVoice(photo, previous, role) {
  if (role === 'opener') return {value:'이 사진으로 묶음의 첫인상을 열어요.', evidence:[]};
  const bright = photo.color.bright_mean - previous.color.bright_mean;
  const sat = photo.color.sat_mean - previous.color.sat_mean;
  const change = bright >= VISIBLE_STEP ? '앞 장보다 환한 화면으로'
    : bright <= -VISIBLE_STEP ? '앞 장보다 어두운 화면으로'
      : sat >= VISIBLE_STEP ? '앞 장보다 짙은 색으로'
        : sat <= -VISIBLE_STEP ? '앞 장보다 옅은 색으로' : null;
  const end = {sustain:'흐름을 이어가요.',turn:'흐름에 변화를 줘요.',closer:'묶음을 마무리해요.'}[role];
  const fallback = {sustain:'다음 사진을 이어서 보여줘요.',turn:'이 사진을 흐름의 연결점으로 두어요.',closer:'마지막 사진으로 묶음을 마무리해요.'}[role];
  return {value: change ? `${change} ${end}` : fallback,
    evidence: change ? [measurement(previous), {kind:'rule',ref:'order.visible_step',note:`앞 사진과 밝기 또는 채도 차이가 ${VISIBLE_STEP} 이상일 때만 대비를 설명한다. 임계값은 설계 상수다.`}] : []};
}
