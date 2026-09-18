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

// Heuristic facts are pixel summaries, not observed subjects. Quote model facts
// verbatim, never turn their wording into a claim about shared people/time/place.
const observations = photo => photo?.analysis_source === 'vision_model'
  ? photo.describable_facts.filter(fact => fact.trim()) : [];
const factEvidence = (photo, fact) => ({kind:'uploaded_photo', ref:photo.photo_id, note:fact});

export function placementVoice(photo, previous, role, next) {
  const adjacent = role === 'opener' ? next : previous;
  const ownFacts = observations(photo), adjacentFacts = observations(adjacent);
  // Prefer an observation not repeated by the neighbor; retain the original text.
  const own = ownFacts.find(fact => !adjacentFacts.includes(fact)) ?? ownFacts[0];
  const other = adjacentFacts.find(fact => !ownFacts.includes(fact)) ?? adjacentFacts[0];
  const evidence = [...(adjacent ? [measurement(adjacent)] : []), measurement(photo)];
  if (other) evidence.push(factEvidence(adjacent, other));
  if (own) evidence.push(factEvidence(photo, own));
  const label = role === 'opener' ? '다음 사진' : '앞 사진';
  const observed = [other ? `${label} 관측: “${other}”.` : '', own ? `이 사진 관측: “${own}”.` : ''].filter(Boolean).join(' ');
  const end = {opener:'이 사진으로 묶음을 열어요.',sustain:'이 사진으로 흐름을 이어가요.',
    turn:'이 사진을 전환 자리에 두어요.',closer:'이 사진으로 묶음을 마무리해요.'}[role];
  if (own && other && own !== other) {
    evidence.push({kind:'rule',ref:'order.observed_placement',
      note:'해당 사진과 인접 사진의 모델 관측을 원문으로 인용한다. 관측 문구는 자리 설명이며 순서 점수에 사용하지 않았다. 문구 차이로 피사체의 관계를 추론하지 않는다.'});
    return {value:`${observed} ${end} 관측 내용은 순서를 정한 근거는 아니에요.`, evidence};
  }
  const bright = previous && role !== 'opener' ? photo.color.bright_mean - previous.color.bright_mean : 0;
  const sat = previous && role !== 'opener' ? photo.color.sat_mean - previous.color.sat_mean : 0;
  const change = bright >= VISIBLE_STEP ? '앞 장보다 환한 화면으로'
    : bright <= -VISIBLE_STEP ? '앞 장보다 어두운 화면으로'
      : sat >= VISIBLE_STEP ? '앞 장보다 짙은 색으로'
        : sat <= -VISIBLE_STEP ? '앞 장보다 옅은 색으로' : null;
  const contrastEnd = {sustain:'흐름을 이어가요.',turn:'흐름에 변화를 줘요.',closer:'묶음을 마무리해요.'}[role];
  evidence.push(change
    ? {kind:'rule',ref:'order.visible_step',note:`앞 사진과 밝기 또는 채도 차이가 ${VISIBLE_STEP} 이상일 때만 대비를 설명한다. 임계값은 설계 상수다.`}
    : {kind:'rule',ref:'order.placement_limit',note:'서로 구분할 모델 관측이 부족하다. 시작 자리는 앞 사진이 없으며, 다른 자리는 밝기·채도 차이도 설명 임계값 미만이다. 추가 구도·관계·시간은 추정하지 않는다.'});
  return {value: [observed, change ? `${change} ${contrastEnd}`
    : `${end} 인접 사진과 구분할 관측이 부족해 이 자리의 내용상 이유는 설명하기 어려워요.`].filter(Boolean).join(' '), evidence};
}
