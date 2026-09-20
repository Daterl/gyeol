# #127 spec — photo_plan 경로의 순서 제안

## 1. 입력 / 출력 계약

변경 없음. `POST /api/feed` 의 요청·응답 스키마와 `schemas/` 4종은 그대로다.

- 입력: `identity.target.kind === 'none'` → `planFromPhotos(photos)` → `PhotoPlan`(`kind:'photo_plan'`).
- 출력: `OrderedFeed` **schema_version `1.1`** (`lib/contracts.js:197` 이 photo_plan 에 대해 이미 강제).
  `applied_profile` = `{target_profile_id:null, photo_plan_id, current_profile_id, corrected:false,
  disclosure:'target_only', deltas:[], visual:<plan.visual>, language:null, sequence:<plan.sequence>}`.
  이 형태도 새로 만든 것이 아니라 기존 `preserveOrder` 가 내던 것과 같고 `validateTargetAxis` 가 검사한다.

## 2. 판단 규칙

### 2-1. 순서를 바꿀 근거가 있는가 (새 게이트)

`hasOrderingBasis(analyses)` — 다음 세 축 중 **하나라도** 묶음 안 차이가 `TIE_BAND`(0.02) 이상이면 참.

| 축 | 쓰는 규칙 | 값 |
|---|---|---|
| 밝기 범위 | R2 | `max(bright_mean) - min(bright_mean)` |
| 채도 범위 | R3 | `max(sat_mean) - min(sat_mean)` |
| 최대 색 거리 | R4 · R1 | 모든 쌍의 `distance()` 최대값 |

- `TIE_BAND` 는 **새 상수가 아니다.** `lib/order.js` 가 R1 동점 밴드로 이미 쓰는 값이고, 그 주석이 근거를
  똑같이 적어 놨다 — 측정값이 소수 셋째 자리까지만 보고되고 가중치도 측정값이 아니므로 이보다 좁은 차이는
  "그 값이 두 사진을 갈랐다"고 말할 자격이 없다. 같은 판단을 묶음 단위로 한 번 더 쓴다.
- 참 → `orderFeed` 로 순서를 정한다. 거짓 → **입력 순서를 유지**하고 그 이유를 말한다.

### 2-2. 순서를 정할 때 (게이트 참)

`orderFeed` 를 그대로 쓴다. photo_plan 일 때만 다음 세 가지가 달라진다.

1. **방향은 항상 `none`.** `resolveDirection(plan)` 을 부르지 않는다. plan 의 `visual.composition_mix` ·
   `palette` 는 **업로드한 사진 자신의 평균**이지 사용자가 지향한 방향이 아니다. 그것을 "지향 방향"으로 읽으면
   없는 지향을 지어내는 것이고 #9 #12 #41 #69 #96 #99 #100 이 거부한 실패와 같은 종류다.
   따라서 R1 은 `WEIGHT.none = 0.5*bright + 0.5*flat` — 관측된 밝기(그리고 배치 전체가 모델 관측일 때만 구도).
2. **타이브레이크 없음.** `resolveTiebreak` 는 "지향이 잰 색에 가장 가까운 사진"이라는 문장을 낸다. 지향이
   없으므로 그 문장을 쓸 수 없고, plan palette 는 입력 평균이라 순환 근거다. → `null`. 동점은 입력 순서가 이긴다.
3. **여는 사진 보너스 없음.** plan 의 `sequence` 는 `{carousel_count:0}` 이고 `opener_tendency` 가 없어
   `openerBonus` 가 이미 자동으로 `null` 을 낸다. 코드 변경 없음.

R2 · R3 · R4 는 지향 경로와 **완전히 같다.** 세 규칙의 입력이 원래부터 지향이 아니라 사진 측정값이기 때문이다.

### 2-3. 근거 문장 (두 경로가 달라야 하는 지점)

지향이 순서에 개입하는 자리는 R1(첫 자리) 하나다. 그래서 문장도 그 자리에서 갈린다.

| | 지향 있음 | 사진만 |
|---|---|---|
| 1번 `rationale.value` | `이 사진으로 묶음의 첫인상을 열어요.` | `지향을 넣지 않아, 올린 사진에서 보이는 것만으로 이 사진을 첫 자리에 뒀어요.` |
| 1번 `evidence[order.R1].note` | `… 지향 구성비/문구/캡션 길이 …` | `… 지향이 없어 올린 사진에서 관측된 밝기·채도·색 거리만으로 정했다` |
| 2~N번 | 앞 사진과의 관측된 대비 (`placementVoice`) | **같다** |

2~N번을 같게 두는 것은 의도다. 그 자리의 근거는 두 경로 모두 "앞 사진과 이 사진의 측정된 색 차이" 하나이고,
지향 경로에서도 지향은 그 자리를 정하지 않는다. 같은 근거를 다른 문장으로 포장하면 문장이 근거보다 많아진다.

### 2-4. 순서를 유지할 때 (게이트 거짓)

입력 순서 유지. 15자리가 같은 한 문장을 갖는 것은 이 경우에 한해 **옳다** — 판단이 하나이기 때문이다.
단 문장의 이유를 고친다.

- 전: `선택한 순서를 그대로 두었어요. 취향에 맞춰 다시 정렬한 결과는 아니에요.`
- 후: `올린 사진들의 밝기와 색이 서로 거의 같아 순서를 바꿀 근거가 없어요. 올린 순서를 그대로 두었어요.`
- `evidence`: `uploaded_photo`(그 사진의 밝기·채도 측정값) + `rule:order.no_measured_difference`
  (세 축과 `TIE_BAND` 를 적는다).

## 3. 정확성 기준 — 무엇을 하면 틀린 것인가

1. plan 의 `composition_mix` · `palette` · `subjects` 가 순서나 근거 문장에 **방향으로** 등장하면 틀렸다.
2. `rationale.value` 에 수치가 등장하면 틀렸다(#109). 수치는 `evidence[].note` 에만 둔다.
3. 관측된 차이가 `TIE_BAND` 안인 묶음에서 순서가 바뀌면 틀렸다.
4. 지향이 있는 입력의 출력이 한 바이트라도 바뀌면 틀렸다.
5. `evidence` 의 `uploaded_photo.ref` 가 그 자리의 사진을 가리키지 않거나, note 의 수치가 해당
   `PhotoAnalysis.color` 와 다르면 틀렸다 (`validateFeed` / E10 이 이미 거부한다).
6. `schemas/` 4종을 수정했으면 틀렸다.

## 4. 경계값

- 사진 3장(최소) · 20장(최대): 게이트·규칙 동일. R3 전환 자리는 `min(n-1, max(2, ceil(n*2/3)))`.
- 차이가 정확히 `TIE_BAND` 인 묶음: 게이트 참(`>=`). 밴드 **안**은 "가르지 못한 것"이고 경계는 가른 것으로 센다.
- 밝기만 같고 채도만 다른 묶음: 게이트 참(축 OR). R1 은 밝기로 동점 → 입력 순서, R3·R4 가 자리를 가른다.
- 전부 같은 사진 15장(현 `fixtures/interaction.sample.json`): 게이트 거짓 → 입력 순서 유지.
