# #127 intent — 기본 진입(사진만 올리기)이 순서를 정하게 한다

## 1. `preserveOrder` 가 왜 들어갔는가 (이력에서 확인한 것)

찾았다. 두 곳에 근거가 남아 있다.

- 도입: `887177c [18] 업로드·피드 HTTP를 연결하고 관측 경계를 보존한다 (#53)` — HTTP 연결 시점에 `orderFeed` 를
  통과시킬 수 없는 입력(사진만)을 일단 입력 순서로 응답하게 둔 것.
- 유지 판단: `a2c8f43 [69] 순서 제안을 실경로에 붙인다 — 휴리스틱 우회 제거, photo_plan 분기만 남긴다 (#75)`.
  이 커밋이 `preserveOrder` 우회 두 조건(`heuristic`, `photo_plan`) 을 따로 판정해 **heuristic 만 제거하고
  photo_plan 은 의도적으로 남겼다.** 커밋 메시지와 `lib/pipeline.js` 주석에 이유가 두 줄로 적혀 있다.

  1. **구조** — `orderFeed` 는 첫머리에서 `validateProfile(targetProfile,'target')` 을 부르는데
     `planFromPhotos` 산출물은 TargetProfile 이 아니다(`kind:'photo_plan'` · `language:null` ·
     `target_profile:null`). `schemas/target_profile.md` 가 axis=target 을 `ig_reference|freetext` 로만
     허용한 결과이지 미구현이 아니다.
  2. **제품** — "지향이 없으면 `resolveDirection` 이 `'none'` 으로 떨어져 방향 신호가 없다. 방향 없이 자리를
     바꾸면 왜 이 순서인가에 답할 수 없다."

즉 이것은 버그가 아니라 **명시적으로 기록된 판단**이다. 뒤집으려면 근거를 대야 한다.

## 2. 그 판단을 뒤집는 근거

(1) 구조 사유는 **계약이 아니라 호출 형태**의 문제다. `lib/contracts.js:196` 의 `validateFeed` 와
`lib/interaction.js:70` 의 `validateContext` 는 **이미 `targetProfile.kind==='photo_plan'` 을 1급으로 다룬다**
(OrderedFeed 1.1 · `applied_profile.photo_plan_id` · `language===null` 강제 · PhotoPlan 사진 참조 검증).
막고 있는 것은 `orderFeed`/`composeProfile` 안의 `validateProfile(...,'target')` 한 줄뿐이다.
스키마를 바꾸지 않고 그 호출을 축 종류에 따라 갈라 부르면 끝난다 — `schemas/` 4종은 손대지 않는다.

(2) 제품 사유는 **R1 에만 해당한다.** `lib/order.js` 의 네 규칙 중 방향 점수를 쓰는 것은 R1 뿐이고,
R2(가장 어두운 사진 → 마지막) · R3(채도 최고 → 전환) · R4(앞자리와 측정 색 거리 최대) 는 **지향을 전혀 읽지
않는다.** 세 규칙의 입력은 업로드한 사진에서 실제 관측된 `color.bright_mean` · `sat_mean` · `hue_mean` 이다.
게다가 R1 자체도 `direction.kind==='none'` 분기를 이미 갖고 있고, 그 분기는 지향이 있어도 시각축·캡션 길이가
비어 있으면 타는 정상 경로다(`resolveDirection` 마지막 return). 따라서 photo_plan 에서 `orderFeed` 를 안 부르는
것은 "근거가 없어서"가 아니라 **있는 근거(사진)를 안 쓰는 것**이다.

(3) 남은 진짜 제약은 하나다. **관측된 차이가 없는 묶음에서는 순서를 바꿀 근거도 없다.** #69 의 우려는 이
경우에 대해서는 여전히 옳다. 그래서 우회를 없애는 것이 아니라 **조건을 바꾼다** — "지향이 없으면" 이 아니라
"관측된 차이가 없으면" 유지한다.

## 3. 무엇이 되면 끝인가

- 사진만 올린 실사진 15장이 **업로드 순서와 다른 순서**로 나오고, 자리마다 그 사진의 `PhotoAnalysis`
  필드로 역추적되는 근거가 붙는다.
- 측정값이 서로 같은 묶음은 **여전히 순서를 바꾸지 않고**, 그 이유를 "차이가 관측되지 않았다"로 말한다.
  ("취향이 없어서"가 아니다 — 그 문장은 사실이지만 순서를 바꾸지 않은 이유가 아니었다.)
- 지향이 있는 경로의 출력은 **한 바이트도 바뀌지 않는다.** 두 경로의 근거가 서로 다른 것을 말한다.
