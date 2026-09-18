# spec — #69 순서 제안 실경로 연결

## 0. 이 문서가 다루는 것

`POST /api/feed` (→ `lib/pipeline.js:buildFeed`) 가 어떤 조건에서 `lib/order.js:orderFeed` 를 부르고
어떤 조건에서 부르지 않는가. 그리고 부르지 않을 때 그 조건이 무엇을 근거로 정당한가.

**스키마는 건드리지 않는다.** `schemas/` 4종(`target_profile` · `current_profile` · `photo_analysis` · `ordered_feed`)은
이 이슈의 입력 제약이며, 어긋나는 것이 있으면 스키마가 아니라 이 spec 을 맞춘다.

---

## 1. 입력 / 출력 계약

변경 없음. `lib/interaction.js` 의 `validateOrderRequest` / `validateFeedResponse` 가 그대로 경계다.

| | 형태 | 출처 |
|---|---|---|
| 입력 | `OrderRequest` — `{schema_version, session_id, photos: PhotoAnalysis[3..20], identity:{target, current}}` | `schemas/photo_analysis.md`, `lib/interaction.js` |
| 출력 | `OrderedFeed` — `{schema_version, feed_id, session_id, applied_profile, slots[], invariants, generated_at}` | `schemas/ordered_feed.md` |

바뀌는 것은 **같은 입력에 대해 `slots[].photo_id` 가 놓이는 순서**뿐이다. 필드는 늘지도 줄지도 않는다.

---

## 2. 판단 규칙 — `preserveOrder` 우회는 언제 정당한가

`buildFeed` 는 두 갈래 중 하나를 고른다. 각 갈래의 조건을 **개별 근거로** 판정한다.

### 2-1. 조건 A — `target.kind === 'photo_plan'` → **우회를 유지한다**

**근거(구조):** `orderFeed` 는 첫머리에서 `validateProfile(targetProfile, 'target')` 을 부른다.
`planFromPhotos`(`lib/target_profile.js:275`)의 산출물은 TargetProfile 이 아니다 —
`kind:'photo_plan'` · `language: null` · `target_profile: null` 이고, `validatePhotoPlan` 이라는 별도 검증기를 탄다.
`lib/target_profile.js:2-3` 주석이 이유를 적어 뒀다: *"Photo-only input never becomes a TargetProfile:
schemas/target_profile.md allows axis=target only with present=true and source ig_reference|freetext."*

**근거(제품):** 사진만 있고 지향이 없으면 `resolveDirection` 이 `kind:'none'` 으로 떨어져 방향 신호가 없다.
방향 없이 자리를 바꾸면 "왜 이 순서인가"에 답할 수 없다 — P2(근거 추적) 위반이다.

→ **분기로 남기고, 조건을 `target.kind === 'photo_plan'` 한 가지로 명시한다.**

### 2-2. 조건 B — `photos.some(p => p.analysis_source === 'heuristic')` → **우회를 제거한다**

**근거(레포 안에 이미 있는 실행 증거):** `test/order.real20.json` 은 실제 인스타 사진 20장을 측정한 PhotoAnalysis 20개이고,
`test/order.test.js:31` 이 `photos20.every(p => p.analysis_source === 'heuristic')` 를 단언한다.
#12·#41 은 **바로 그 전부-휴리스틱 입력으로** `orderFeed` 의 D3·S3·E1~E11 을 검증했다.
즉 "휴리스틱 입력에서 `orderFeed` 가 정상 동작한다" 는 주장은 이미 테스트로 서 있는데, 실경로에서만 꺼져 있었다.

**근거(신호별 확인):** `orderFeed` 가 읽는 값 중 휴리스틱 경로에서 관측된 것과 아닌 것.

| 신호 | 휴리스틱 경로 | `orderFeed` 의 처리 |
|---|---|---|
| `color.bright_mean` · `sat_mean` · `hue_mean` | **실측** (JPEG DC 블록) | 그대로 쓴다 — 순서를 정하는 주 신호 |
| `color.palette_hex` | **실측** | 근거 문장의 "주요 색" |
| `describable_facts` | **실측값만** (`lib/photo_analysis.js:224`) | `caption_inputs` 로 전달 |
| `scale` | **고정값**(관측 아님) | `openerBonus` 가 `source === 'vision_model'` 로 이미 차단 |
| `has_face` | 항상 `false`(관측 못 함) | `face: has_face === true` → 보너스 안 켜짐 |
| `composition` | **항상 `full_frame`** (아래 2-3) | 점수에는 상수라 영향 없음. **근거 문장에서는 빼야 한다** |

→ **조건 B 를 제거한다.**

### 2-3. 조건 B 제거가 새로 드러내는 것 — 구도 문구 (이 이슈에서 같이 고친다)

휴리스틱 경로는 `composition` 을 관측하지 않고 상수 `full_frame` 을 낸다.
확인: `test/order.real20.json` 20장 전부 `full_frame`, 그리고 `lib/photo_analysis.js` 의 휴리스틱 분기는
`negative_space` 를 낼 수 없다. `test/photo_analysis.test.js:246` 이 *"heuristic must not claim negative space"* 로 못 박는다.

그런데 `lib/order.js` 의 근거 문장은 그 상수를 관측처럼 말한다:

```
측정값 — 밝기 0.808 · 채도 0.086 · 한 색이 넓게 깔리지 않음
밝기 0.808 · 채도 0.086 · 한 색이 넓게 깔리지 않은 화면이라 …
```

지금까지는 휴리스틱 사진이 `orderFeed` 에 들어가지 않아 프로덕션에 안 보였다.
조건 B 를 없애면 **이 문장이 사용자에게 나간다.** 관측하지 않은 것을 관측했다고 말하는 것이므로
P2(근거를 못 대는 판단은 출력하지 않는다) 위반이다.

→ **`analysis_source !== 'vision_model'` 인 사진의 근거 문장에서 구도 구절을 뺀다.**
점수 계산(`WEIGHT`)은 건드리지 않는다 — 휴리스틱에서는 상수라 순위에 영향이 없고, 점수는 사용자에게 보이는 주장이 아니다.

---

## 3. 정확성 기준 — 무엇을 하면 틀린 것인가

| # | 틀린 것 |
|---|---|
| W1 | 사진 15장 + 지향 프로필을 실제 HTTP 경로에 넣었는데 `slots` 를 `position` 으로 정렬한 `photo_id` 배열이 입력 배열과 같다 |
| W2 | 같은 사진 + 서로 다른 지향 2벌인데 `position` 정렬 `photo_id` 배열이 같다 |
| W3 | 어떤 슬롯의 `rationale.evidence` 에 `kind:'uploaded_photo'` 가 없거나, 그 `ref` 가 입력에 없는 `photo_id` 다 |
| W4 | 휴리스틱 분석 사진의 근거 문장이 구도(`한 색이 넓게 깔림/깔리지 않음`)를 관측처럼 말한다 |
| W5 | `photo_plan`(사진만 입력) 경로에서 순서가 바뀐다 — 방향 근거가 없는데 순서를 주장한 것이다 |
| W6 | `preserveOrder` 우회 조건이 코드에 있는데 왜 남는지가 코드에 안 적혀 있다 |
| W7 | `schemas/` 4종 중 하나라도 변경됐다 |
| W8 | `npm test` / `eval` / `check` / `lint` / `typecheck` 중 하나라도 실패한다 |

> ⚠️ **W2 의 함정(이슈 본문이 경고한 것):** `slots[].position` 배열끼리 비교하면 언제나 `[1..N]` 이라 항상 같다.
> 반드시 **`position` 으로 정렬한 뒤 `photo_id` 를 꺼내서** 비교한다.

---

## 4. 경계값

| 경계 | 기대 |
|---|---|
| 사진 2장 / 21장 | `validateOrderRequest` 가 400 `INVALID_REQUEST`. 변경 전과 같다 |
| 사진 3장 (최소) | `orderFeed` 가 3슬롯. `turnPosition = min(count-1, max(2, ceil(3*2/3))) = 2` → opener/turn/closer |
| 사진 20장 (최대) | 20슬롯, `position` 1..20 |
| `identity.target.kind === 'none'` | `photo_plan` → `preserveOrder`. `schema_version` 은 `1.1` 유지 |
| `identity.target.kind === 'text'` / `'reference'` | `orderFeed`. 분석 출처와 무관 |
| 전부 휴리스틱 + text 지향 | `orderFeed`. 구도 구절 없는 근거 문장 |
| 혼합(휴리스틱 + vision_model) + text 지향 | `orderFeed`. 구도 구절은 **사진별로** 갈린다 |
| 지향에 `visual.palette` 없음 | `resolveTiebreak` → `null`, 타이브레이크 꺼짐. **현재 모든 TargetProfile 경로가 여기 해당** (5절) |

---

## 5. 기록만 하고 고치지 않는 것 — `visual.palette` 미충족

`lib/order.js:resolveTiebreak` 는 `target.visual?.palette` 가 있어야 켜진다. 확인한 현재 상태:

| TargetProfile 생성 경로 | `visual` 내용 | `palette` |
|---|---|---|
| `extractFromFreetext` (text) | `tone_words` 만 | **없음** |
| `extractFromReference` (ig URL) | `{}` — `completeness.visual: 0` | **없음** |
| `planFromPhotos` (사진만) | `palette` · `composition_mix` · `scale_mix` · `subjects` | **있음** (`lib/target_profile.js:282`) |

**palette 를 채우는 유일한 경로는 TargetProfile 이 아닌 `photo_plan` 이고, `photo_plan` 은 `orderFeed` 에 들어가지 않는다.**
따라서 `resolveTiebreak` 는 프로덕션에서 **항상 `null`** 이고 R1 동점 타이브레이크는 꺼져 있다. #41 보고의 지적이 그대로 확인된다.

이 이슈는 이것을 **고치지 않는다.** DoD 가 "현재 상태를 기록한다" 이고, 고치려면 지향 축에 새 관측을 만들어야 하는데
그것은 `schemas/target_profile.md` 와 #10 의 범위다. `report.md` 와 PR 본문에 남기고 후속 이슈 후보로 넘긴다.
