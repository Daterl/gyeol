# spec — #131 `stabilizeOmission` 게이트

## 규명된 원인 (실측값, 추측 아님)

`.work131/probe/gates.mjs` 로 `buildFeed` 산출물을 그대로 찍은 값이다.

| 경로 | `applied_profile.language` | `caption_coverage` | `target.source` | 어디서 되돌아 나오나 |
|---|---|---|---|---|
| 사진만 (`kind:'none'` → `photo_plan`) | **`null`** | `undefined` | `photo_only` | `if (!appliedLanguage) return` — GATE1 |
| 자유입력 "짧게 조용하게" | 있음 | `undefined` | `freetext` | `coverage!=='sparse' && target.source==='freetext'` — GATE2 |
| 자유입력 "자세하게 기록처럼 촘촘히" | 있음 | `undefined` | `freetext` | 같은 GATE2 |
| 자유입력 "사진만 두고 싶어요" | 있음 | `sparse` | `freetext` | 통과 |

**세 번째 원인 (기존 진단에 없던 것) — GATE3.**
기본 경로를 GATE1 에서 뚫어 줘도 후보가 0개다. `caption_inputs.adjacent_overlap` 의 **정의가 경로마다 다르다**:

- `lib/pipeline.js:54` (photo_plan) → `describable_facts` 중복 비율
- `lib/order.js:249` (지향 경로) → `measuredColorOverlap` (색 실측)

`stabilizeOmission` 은 `slot.caption_inputs.adjacent_overlap === measuredColorOverlap(...)` 로 후보를 거른다.
photo_plan 경로에서는 저장값(facts 겹침 0.5)과 재계산값(색 겹침 1)이 **구조적으로 절대 같지 않다**.

**임계값이 실사진에서 실제로 걸리는지도 쟀다** (`test/order.real20.json`, 실사진 20장 인접 19쌍):

- 색 겹침 `>= 0.9` : **7/19 쌍**, 최대 0.976 → 0.9 임계값은 실사진에서 실제로 걸린다
- facts 겹침 `>= 0.9` : **0/19 쌍**, 최대 0.167 → facts 겹침을 신호로 쓰면 안전망은 여전히 안 켜진다

## 입력/출력 계약

입력·출력 스키마는 바꾸지 않는다 (`schemas/` 4종 무변경). `stabilizeOmission` 내부 판단만 바꾼다.

## 판단 규칙

1. **안전망을 끄는 것은 "채워 달라"는 신호가 실제로 있을 때뿐이다.**
   - `caption_coverage === 'all'` → 끈다 (사용자가 말했다)
   - `coverage !== 'sparse'` 이고 관측된 빈 캡션 비율이 있는데 `max(ratios) * 슬롯수 < 1` → 끈다
     (그 계정은 이 길이의 피드에서 한 자리도 안 비우는 것으로 **관측**됐다. `ratio === 0` 은 여기에 포함된다)
   - 그 밖 — 지향이 없거나(`photo_plan`), 커버리지를 말하지 않은 자유입력 — 은 **"전부 채워 달라" 가 아니다.**
     지향 없음과 "전부 채워" 를 같게 취급한 것이 이 버그다.
2. **비움 판단 신호는 경로와 무관하게 `measuredColorOverlap`** 이다. `context.photos` 의 PhotoAnalysis 에서 다시 잰다.
   caller 가 보낸 feed 값을 신호로 쓰지 않으므로 위조로 비움을 만들 수 없다.
3. **feed 정합성 검사는 그 경로의 정의대로** 한다. photo_plan 경로면 facts 겹침으로,
   지향 경로면 색 겹침으로 `caption_inputs.adjacent_overlap` 과 대조한다. 어긋나는 슬롯은 후보에서 뺀다.
   (기존 위조 방지 수준을 그대로 유지한다. 완화가 아니다.)
4. 후보는 `position > 1` 인 자리 중 색 겹침 최댓값. 동점이면 앞 자리가 이긴다 (결정적).
5. **`overlap < 0.9` 면 비우지 않는다.** 임계값을 낮춰 개수를 만들지 않는다.
6. 비우는 자리는 **정확히 하나**다. 비율을 주입하지 않는다.

## 정확성 기준 — 무엇을 하면 틀린 것인가

- 근거(겹침 ≥ 0.9) 없이 아무 자리나 비우면 **틀렸다** (P2 위반).
- 임계값이나 개수를 D5 를 맞추려고 조정하면 **틀렸다** (이슈 본문의 명시 금지 조건).
- 비움 자리의 evidence 가 `kind:'rule'` 하나뿐이면 **미달**이다. 그 판단이 실제 사진 두 장을 재서 나왔다는
  것을 가리키는 `kind:'uploaded_photo'` 근거가 함께 있어야 한다.
- 공개 텍스트에 측정값·내부 필드명이 새면 **틀렸다** (`forbiddenOutputPatterns` 가 이미 막는다.
  그래서 evidence note 에 겹침 수치나 "밝기/채도" 를 쓰지 않는다).
- `caption_coverage === 'all'` 인데 비우면 **틀렸다** (사용자가 말한 것을 뒤집는다).

## 경계값

| 상황 | 기대 |
|---|---|
| 겹침 최댓값 0.9 | 비운다 (경계 포함) |
| 겹침 최댓값 0.899 | 비우지 않는다 |
| 슬롯 1개 | `position>1` 후보 없음 → 비우지 않는다 |
| 모델이 이미 한 자리를 비움 | 함수 앞머리에서 그대로 둔다 (`some(caption_state!=='seed')`) |
| `coverage==='all'` + 겹침 0.99 | 비우지 않는다 |
| 관측 ratio 0.5, 슬롯 3개 → 1.5 ≥ 1 | 안전망 유효 (기존 레퍼런스 경로 동작 유지) |
| feed 의 `adjacent_overlap` 이 그 경로 정의와 어긋남 | 그 슬롯은 후보에서 제외 |
