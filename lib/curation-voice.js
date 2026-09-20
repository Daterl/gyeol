// 색에서 장소·시간·감정을 추측하지 않는다. 문장 경계는 보수적인 설계 상수이며 측정값이 아니다.
const CONCEPT_SPREAD = 0.25;
const VISIBLE_STEP = 0.12;
const measurement = photo => ({kind: 'uploaded_photo', ref: photo.photo_id,
  note: `묶음·인접 비교 측정값 — 밝기 ${photo.color.bright_mean} · 채도 ${photo.color.sat_mean}`});

// 컨셉은 사진 한 장이 아니라 묶음 전체의 판단이므로 슬롯이 아니라 피드(OrderedFeed.concept)에 붙는다.
// evidence 는 photo_id 오름차순으로 고정한다. 입력 배열 순서가 달라도 재계산 검증과 일치해야 한다.
//
// 임계 미달도 관측이다(#109 실사진 3장 감사). 예전에는 채도·밝기 범위가 둘 다 미달이면 null 을 돌려주고
// 호출자가 필드를 생략했는데, 3장 묶음은 거의 항상 그 자리라 화면에서 컨셉이 통째로 사라졌다.
// "범위가 넓다"와 "범위가 좁다"는 같은 측정값을 읽는 두 방향이고 둘 다 잰 것이다 — 좁은 쪽을
// 말하지 않을 이유가 없다. 임계값을 낮추지 않았고 새 값을 들이지도 않았다.
export function bundleConcept(photos) {
  const spread = key => Math.max(...photos.map(p => p.color[key])) - Math.min(...photos.map(p => p.color[key]));
  const wide = spread('sat_mean') >= CONCEPT_SPREAD ? 'sat' : spread('bright_mean') >= CONCEPT_SPREAD ? 'bright' : null;
  const value = wide === 'sat' ? '옅은 색과 짙은 색이 어우러지는 흐름으로 엮어요.'
    : wide === 'bright' ? '밝고 어두운 화면이 어우러지는 흐름으로 엮어요.'
      : '톤이 고르게 이어지는 흐름으로 엮어요.';
  const sources = [...photos].sort((a, b) => a.photo_id < b.photo_id ? -1 : a.photo_id > b.photo_id ? 1 : 0);
  return {value, confidence: 1, evidence: [...sources.map(measurement), {kind:'rule',ref:'order.bundle_concept',
    note:`컨셉은 채도 범위, 밝기 범위 순으로 ${CONCEPT_SPREAD} 이상이면 대비를, 둘 다 미만이면 고른 톤을 설명한다. 임계값은 설계 상수이며 범위 자체는 측정값이다.`}]};
}

// 사용자에게 보이는 문장은 **우리가 픽셀에서 잰 값**만 말한다. 모델이 쓴 관측 문장(describable_facts)은
// 인용하지 않는다. 두 가지 이유가 있고 둘 다 실사진에서 확인됐다(#109 품질 평가):
//  1) 그 문장은 순서를 정하는 데 쓰이지 않았다. 점수는 밝기·채도·색상각만 본다. 그래서 인용한 뒤
//     "관측 내용은 순서를 정한 근거는 아니에요"라고 고지해야 했고, 15/15 슬롯이 그 문장으로 끝났다.
//     이유를 말한 뒤 이유가 아니라고 말하는 문장은 자리의 근거가 아니다.
//  2) 모델 관측이 틀리면 제품이 대신 거짓말을 한다 — 8번 자리의 "양손으로 휴대폰을 들고"는 원본에서
//     한 손이었다. E10·E11 은 이걸 못 잡는다. 그 값은 실제로 그 사진의 목록에 *있기* 때문이다.
// 관측 문장은 캡션 재료(caption_inputs.describable_facts)로 그대로 남는다. 버리는 것이 아니라
// 사실성을 보증할 수 있는 자리에만 둔다.
// sustain 은 묶음의 대부분을 차지한다(실사진 15장에서 11자리). 자리 역할이 같으니 역할 문구도 같아
// 한 문장이 11번 반복됐다(#109 품질 평가 ①). 같은 역할 안에서도 **묶음의 어디쯤인지**는 서로 다르고,
// 그건 슬롯이 이미 들고 있는 position·count 에서 바로 나온다 — 새 관측도 새 상수도 아니라서
// 근거를 따로 달 것이 없다(evidence 에 있는 position 이 곧 출처다).
const phase = (position, count) => position * 3 <= count ? '초반 분위기를 이어가요.'
  : position * 3 <= count * 2 ? '중간 흐름을 이어가요.' : '마무리로 가는 흐름을 이어가요.';
// 전환·마무리는 인접 비교가 아니라 자기 규칙(R3 남은 사진 중 채도 최고 · R2 남은 사진 중 최저 밝기)이
// 자리를 정했다. 그 규칙이 실제로 이 자리를 골랐을 때만 rule 문장을 쓴다 — 인접 대비를 덧붙이면
// 진짜 이유가 흐려진다. 규칙이 고르지 않은 경로에서는 tail 로 돌아간다(placementVoice 주석).
const ROLE = {
  opener: {lead: '다음 장', tail: '묶음을 열어요.'},
  sustain: {lead: '앞 장', tail: '흐름을 이어가요.'},
  turn: {lead: '앞 장', tail: '흐름에 변화를 줘요.', rule: '남은 사진 중 색이 가장 짙어 여기서 분위기가 한 번 바뀌어요.'},
  closer: {lead: '앞 장', tail: '묶음을 마무리해요.', rule: '남은 사진 중 가장 어두워 마지막을 차분하게 닫아요.'}
};
const STEP_NOTE = `인접 사진(첫 자리는 다음 사진, 나머지는 앞 사진)과 밝기 또는 채도 차이가 ${VISIBLE_STEP} 이상일 때만 변화를 설명한다. 미만이면 눈에 띄는 변화라고 말할 수 없으므로 고른 톤이라고 말한다. 임계값은 설계 상수다.`;
const RULE_NOTE = {
  turn: '전환 자리는 남은 사진 중 채도가 가장 높은 사진이다. 문장은 그 선택 근거를 옮긴 것이다.',
  closer: '마지막 자리는 남은 사진 중 밝기가 가장 낮은 사진이다. 문장은 그 선택 근거를 옮긴 것이다.'
};

export function placementVoice(photo, previous, role, next, place) {
  const adjacent = role === 'opener' ? next : previous;
  const {lead, rule} = ROLE[role];
  const tail = role === 'sustain' && place ? phase(place.position, place.count) : ROLE[role].tail;
  const evidence = [...(adjacent ? [measurement(adjacent)] : []), measurement(photo)];
  // R2·R3 의 선택 근거는 그 규칙이 실제로 이 자리를 골랐을 때만 말할 수 있다. 입력 순서를 보존한 묶음
  // (lib/pipeline.js preserveOrder)은 세 축이 전부 동점 밴드 안이라 **어떤 규칙도 자리를 고르지 않았고**,
  // 그때 "남은 사진 중 가장 어두워"라고 말하면 같은 문단이 두 문장 앞에서 "밝기와 색이 서로 거의 같다"고
  // 한 것과 정면으로 어긋나는 거짓이 된다. 그 경로는 인접 비교 문장으로 돌아간다 — 없는 선택 근거를
  // 지어내지 않는 것은 인용을 끊은 이유(③)와 같다.
  if (rule && place?.rulePlaced !== false) {
    evidence.push({kind: 'rule', ref: `order.${role}_rule`, note: RULE_NOTE[role]});
    return {value: rule, evidence};
  }
  // 임계를 넘은 축을 **전부** 말한다. 한 축만 말하면 실사진에서 밝기 오르내림 두 문장으로 수렴한다
  // (#109 품질 평가 ①의 반복). 두 축 모두 우리가 잰 값이고 둘 다 넘었으면 둘 다 일어난 일이다.
  const step = (value, up, down) => value >= VISIBLE_STEP ? up : value <= -VISIBLE_STEP ? down : null;
  const bright = adjacent ? step(photo.color.bright_mean - adjacent.color.bright_mean, '환해지', '어두워지') : null;
  const sat = adjacent ? step(photo.color.sat_mean - adjacent.color.sat_mean, '짙어지', '옅어지') : null;
  // 밝기와 채도가 같은 방향이면 '도', 반대 방향이면 '은' 으로 잇는다. 두 축이 함께 움직였는지
  // 엇갈렸는지가 사용자에게 보이는 유일한 차이이고, 그 판정도 잰 값에서 나온다.
  const together = (bright === '환해지') === (sat === '짙어지');
  const change = bright && sat ? `${lead}보다 ${bright}고 색${together ? '도' : '은'} ${sat}면서`
    : bright ? `${lead}보다 ${bright}면서`
      : sat ? `${lead}보다 색이 ${sat}면서` : null;
  evidence.push(change
    ? {kind: 'rule', ref: 'order.visible_step', note: STEP_NOTE}
    : {kind: 'rule', ref: 'order.placement_limit', note: adjacent
      ? `인접 사진과 밝기·채도 차이가 모두 ${VISIBLE_STEP} 미만이라 눈에 띄는 변화가 없다. 없는 대비를 지어내지 않는다.`
      : '비교할 인접 사진이 없다. 없는 대비를 지어내지 않는다.'});
  return {value: `${change ?? `${adjacent ? `${lead}과 비슷한 톤으로` : '이 사진으로'}`} ${tail}`, evidence};
}
