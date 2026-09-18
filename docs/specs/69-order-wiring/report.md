# report — #69 순서 제안 실경로 연결

브랜치 `feat/69-order-wiring` (base `origin/develop`, 기준 커밋 `531b134`).
실행 환경: macOS · Node v22.22.3 · Next.js 16.3.5 · 로컬 `npx next start -p 3069` (실제 HTTP 서버).

> **기록 경계:** 이 본문은 `531b134`에서 수행한 최초 측정 스냅샷이다. 최신 인수 판정은 [`fix-report.md`](./fix-report.md)와 PR #75 최종 커밋 `a2c8f43004e18cb65d48f7afc1048e3273de1b47`을 기준으로 한다.

---

## 1. 무엇을 바꿨는가

| 파일 | 변경 | 왜 |
|---|---|---|
| `lib/pipeline.js` | `buildFeed` 의 `preserveOrder` 우회 조건에서 `photos.some(p=>p.analysis_source==='heuristic')` 제거. `target.kind==='photo_plan'` 만 남김 | 휴리스틱 우회는 근거가 사라졌다 (아래 2절) |
| `lib/pipeline.js` | `preserveOrder` 위 주석을 "#41 이후 교체 예정" 에서 **photo_plan 이 구조적으로 orderFeed 를 통과하지 못하는 이유**로 교체. `order.input_order` 근거 note 도 남은 경로에 맞게 수정 | DoD "분기 조건이 명시돼 있다" |
| `lib/order.js` | 근거 문장의 구도 구절을 `analysis_source==='vision_model'` 일 때만 낸다 (`observedComposition`) | 아래 3절 — 이 변경이 새로 드러낸 근거 없는 주장 |
| `test/pipeline.test.js` | 실경로 회귀 테스트 3개 추가 (실측 사진 `test/order.real20.json` 사용) | 깨지면 아무도 모르는 코드를 남기지 않는다 |

**`schemas/` 4종은 건드리지 않았다.** `eval/` · `src/`(디에고 소유) · 배포 설정도 건드리지 않았다.

---

## 2. 두 우회 조건을 개별 판정했다

이슈 본문은 "pipeline 이 preserveOrder 를 쓴다" 라고 적었지만, 실제 코드는 **조건부**였다.
`orderFeed` 는 `composeFeed` 를 통해 이미 연결돼 있었고, 두 조건 중 하나라도 걸리면 큐레이션이 통째로 꺼지는 구조였다.

### 2-1. `target.kind === 'photo_plan'` → **남긴다**
- **구조:** `orderFeed` 는 `validateProfile(targetProfile,'target')` 을 부른다. `planFromPhotos` 산출물은 `kind:'photo_plan'` · `language:null` · `target_profile:null` 이라 통과하지 못한다. `schemas/target_profile.md` 가 axis=target 을 `ig_reference|freetext` 로만 허용한 결과이지 미구현이 아니다.
- **제품:** 지향이 없으면 `resolveDirection` 이 `'none'` 으로 떨어져 방향 신호가 없다. 방향 없이 자리를 바꾸면 "왜 이 순서인가"에 답할 수 없다.
- 이유를 `lib/pipeline.js` 주석에 적었고, 아래 4절 C 케이스가 실행으로 확인한다.

### 2-2. `analysis_source === 'heuristic'` → **제거한다**
- **이미 레포 안에 있던 증거:** `test/order.real20.json` 20장은 전부 `analysis_source==='heuristic'` 이고(`test/order.test.js:31` 이 단언), #12·#41 은 **바로 그 입력으로** `orderFeed` 의 D3·S3·E1~E11 을 검증했다. 휴리스틱 입력에서 `orderFeed` 가 동작한다는 주장이 이미 테스트로 서 있었는데 실경로에서만 꺼져 있었다.
- **관측 안 된 신호는 `orderFeed` 안에서 이미 차단돼 있다:** `scale` 은 `source==='vision_model'` 일 때만(`openerBonus`), `has_face` 는 `=== true` 일 때만. 밝기·채도·색상각·주요 색은 휴리스틱 경로에서도 JPEG DC 블록 실측이다.

---

## 3. 이 변경이 새로 드러낸 것 — 구도 문구 (같이 고쳤다)

휴리스틱 경로는 `composition` 을 관측하지 않는다. 항상 상수 `full_frame` 이다.

- `test/order.real20.json` 20장 전부 `full_frame` (`jq '[.[].composition]|group_by(.)|map({(.[0]):length})|add'` → `{"full_frame":20}`)
- 아래 4절에서 실사진 15장을 `/api/analyze?mock=1` 에 넣은 결과도 15장 전부 `composition=full_frame`
- `test/photo_analysis.test.js:246` 이 *"heuristic must not claim negative space"* 로 못 박는다

그런데 `lib/order.js` 의 근거 문장은 그 상수를 관측처럼 말하고 있었다:

```
측정값 — 밝기 0.808 · 채도 0.086 · 한 색이 넓게 깔리지 않음
밝기 0.808 · 채도 0.086 · 한 색이 넓게 깔리지 않은 화면이라 지향 방향(조용한 쪽) 점수가 …
```

지금까지는 휴리스틱 사진이 `orderFeed` 에 들어가지 않아 프로덕션에 안 보였다.
**2-2 를 제거하면 이 문장이 사용자에게 나간다** — 관측하지 않은 것을 관측했다고 말하는 것이다.
그래서 근거 문장에서만 뺐다. **점수(`WEIGHT`)와 `flat` 값 자체는 안 건드렸다** — 휴리스틱에서는 전 사진 공통이라 순위에 영향이 없고, 점수는 사용자에게 보이는 주장이 아니다. 모델이 본 사진에서는 문구가 그대로 남는다(테스트로 확인).

---

## 4. DoD 실행 증거 — 실제 HTTP 서버 · 실제 인스타 사진 15장

최초 측정은 **서로 다른 게시물 15건에서 1장씩** 고른 미커밋 원본 이미지를 사용했다. 저장소에서 재현 가능한 정규화 입력은 `test/order.real20.json`이다.
(같은 캐러셀 연속 컷만 쓰면 색이 비슷해 순서 차이가 덜 드러나므로 게시물 단위로 골랐다.)

```
# 입력: 서로 다른 게시물 15건의 미커밋 원본 이미지; 정규화 재현 입력은 test/order.real20.json
POST /api/analyze?mock=1 -> 200  ph_01  c29_Dc-2OOrFBnb_00.jpg  source=heuristic  composition=full_frame  bright=0.375  sat=0.288
POST /api/analyze?mock=1 -> 200  ph_02  c29_Dc-GJ-iCezC_00.jpg  source=heuristic  composition=full_frame  bright=0.742  sat=0.161
POST /api/analyze?mock=1 -> 200  ph_03  c29_Dc-auqBCVXI_00.jpg  source=heuristic  composition=full_frame  bright=0.432  sat=0.195
POST /api/analyze?mock=1 -> 200  ph_04  c29_Dc7cY9WiUbs_00.jpg  source=heuristic  composition=full_frame  bright=0.666  sat=0.349
POST /api/analyze?mock=1 -> 200  ph_05  c29_Dc8RZMAjXm8_00.jpg  source=heuristic  composition=full_frame  bright=0.473  sat=0.259
POST /api/analyze?mock=1 -> 200  ph_06  c29_Dc94ZfOD1-q_00.jpg  source=heuristic  composition=full_frame  bright=0.501  sat=0.293
POST /api/analyze?mock=1 -> 200  ph_07  c29_DdAdNz0jcEF_00.jpg  source=heuristic  composition=full_frame  bright=0.551  sat=0.334
POST /api/analyze?mock=1 -> 200  ph_08  c29_DdBaYWQswYI_00.jpg  source=heuristic  composition=full_frame  bright=0.453  sat=0.198
POST /api/analyze?mock=1 -> 200  ph_09  c29_DdDCDKgFCLE_00.jpg  source=heuristic  composition=full_frame  bright=0.375  sat=0.195
POST /api/analyze?mock=1 -> 200  ph_10  c29_DdDx752PuVM_00.jpg  source=heuristic  composition=full_frame  bright=0.649  sat=0.216
POST /api/analyze?mock=1 -> 200  ph_11  c29_DdEAAeHm6u0_00.jpg  source=heuristic  composition=full_frame  bright=0.441  sat=0.362
POST /api/analyze?mock=1 -> 200  ph_12  c29_DdFvaJRiXnx_00.jpg  source=heuristic  composition=full_frame  bright=0.429  sat=0.367
POST /api/analyze?mock=1 -> 200  ph_13  c29_DdGkodnCOAZ_00.jpg  source=heuristic  composition=full_frame  bright=0.521  sat=0.221
POST /api/analyze?mock=1 -> 200  ph_14  c29_DdILtQ0CRl8_00.jpg  source=heuristic  composition=full_frame  bright=0.328  sat=0.301
POST /api/analyze?mock=1 -> 200  ph_15  c29_DdIt_2szpfb_00.jpg  source=heuristic  composition=full_frame  bright=0.515  sat=0.344

## POST /api/feed -> 200  지향 A: 짧게, 조용하게
position 정렬 photo_id: ph_02 → ph_01 → ph_04 → ph_03 → ph_10 → ph_11 → ph_13 → ph_09 → ph_07 → ph_12 → ph_05 → ph_06 → ph_08 → ph_15 → ph_14
position 배열        : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]  ← 이것만 비교하면 항상 같다(함정)
전 슬롯 uploaded_photo 근거가 실제 입력 사진을 가리킴: 예
구도(넓게 깔) 문구를 말한 슬롯 수: 0 / 15  (휴리스틱 분석이므로 0 이어야 한다)
  [1] ph_02 opener — 밝기 0.742 · 채도 0.161 인 사진이라 지향 방향(조용한 쪽) 점수가 입력 15장 중 가장 높아 1번에 뒀다
  [2] ph_01 sustain — 앞자리 사진과 측정 색 거리 0.227 로 남은 사진 중 가장 멀어 2번에 뒀다 (밝기 0.375 · 채도 0.288)
  [3] ph_04 sustain — 앞자리 사진과 측정 색 거리 0.166 로 남은 사진 중 가장 멀어 3번에 뒀다 (밝기 0.666 · 채도 0.349)

## POST /api/feed -> 200  지향 B: 자세하게, 기록하듯
position 정렬 photo_id: ph_04 → ph_03 → ph_02 → ph_01 → ph_10 → ph_11 → ph_13 → ph_09 → ph_07 → ph_12 → ph_05 → ph_06 → ph_08 → ph_15 → ph_14
position 배열        : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]  ← 이것만 비교하면 항상 같다(함정)
전 슬롯 uploaded_photo 근거가 실제 입력 사진을 가리킴: 예
구도(넓게 깔) 문구를 말한 슬롯 수: 0 / 15  (휴리스틱 분석이므로 0 이어야 한다)
  [1] ph_04 opener — 밝기 0.666 · 채도 0.349 인 사진이라 지향 방향(빼곡한 쪽) 점수가 입력 15장 중 가장 높아 1번에 뒀다
  [2] ph_03 sustain — 앞자리 사진과 측정 색 거리 0.2 로 남은 사진 중 가장 멀어 2번에 뒀다 (밝기 0.432 · 채도 0.195)
  [3] ph_02 sustain — 앞자리 사진과 측정 색 거리 0.195 로 남은 사진 중 가장 멀어 3번에 뒀다 (밝기 0.742 · 채도 0.161)

## POST /api/feed -> 200  지향 C: 지향 없음(사진만)
position 정렬 photo_id: ph_01 → ph_02 → ph_03 → ph_04 → ph_05 → ph_06 → ph_07 → ph_08 → ph_09 → ph_10 → ph_11 → ph_12 → ph_13 → ph_14 → ph_15
position 배열        : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]  ← 이것만 비교하면 항상 같다(함정)
전 슬롯 uploaded_photo 근거가 실제 입력 사진을 가리킴: 예
구도(넓게 깔) 문구를 말한 슬롯 수: 0 / 15  (휴리스틱 분석이므로 0 이어야 한다)
  [1] ph_01 opener — 선택한 순서를 그대로 두었어요. 취향에 맞춰 다시 정렬한 결과는 아니에요.
  [2] ph_02 sustain — 선택한 순서를 그대로 두었어요. 취향에 맞춰 다시 정렬한 결과는 아니에요.
  [3] ph_03 sustain — 선택한 순서를 그대로 두었어요. 취향에 맞춰 다시 정렬한 결과는 아니에요.

## DoD 판정
입력 순서            : ph_01 → ph_02 → ph_03 → ph_04 → ph_05 → ph_06 → ph_07 → ph_08 → ph_09 → ph_10 → ph_11 → ph_12 → ph_13 → ph_14 → ph_15
A 가 입력과 다른가   : true
B 가 입력과 다른가   : true
A 와 B 가 다른가     : true
C(사진만) 는 입력 유지: true
```

### 4-1. 프로필이 바꾸는 범위는 앞 4자리다 — 정직하게 적는다

A 와 B 는 **1~4번 자리에서만** 갈리고 5~15번은 같다. D6("다른 결과 2벌")은 만족하지만,
"프로필이 피드 전체를 다시 짠다"는 아니다. 이유는 규칙 구조에 있다:
방향 점수는 **R1(첫 자리)** 에만 들어가고, R4 는 "앞자리와 색이 가장 먼 사진"이라 한 번 체인이 붙으면 같은 사슬을 탄다.
이것은 이 이슈에서 고치는 대상이 아니라 `lib/order.js` 의 알려진 천장이며, 5절의 타이브레이크 미작동과 같은 뿌리다.

---

## 5. `visual.palette` 미충족 — 현재 상태 기록 (DoD 5번, 고치지 않음)

`lib/order.js:resolveTiebreak` 는 `target.visual?.palette` 가 있어야 켜진다. 없으면 `null` 을 내고 타이브레이크가 아예 안 켜진다.

| TargetProfile 생성 경로 | `visual` 내용 | `palette` |
|---|---|---|
| `extractFromFreetext` (text) | `tone_words` 만 | **없음** |
| `extractFromReference` (ig URL) | `{}` · `completeness.visual: 0` | **없음** |
| `planFromPhotos` (사진만) | `palette`·`composition_mix`·`scale_mix`·`subjects` (`lib/target_profile.js:282`) | **있음** |

**palette 를 채우는 유일한 경로는 TargetProfile 이 아닌 `photo_plan` 이고, `photo_plan` 은 `orderFeed` 에 들어가지 않는다.**
→ `resolveTiebreak` 는 **프로덕션에서 항상 `null`**, R1 동점 타이브레이크는 꺼져 있다. #41 보고의 지적이 그대로 확인된다.
위 4절 A/B 실행의 어느 슬롯에도 타이브레이크 문장("총점이 상위 N장을 0.02 안에서 가르지 못해")이 나오지 않는 것이 그 증거다.

이 이슈에서 **고치지 않는다.** 고치려면 지향 축에 새 관측을 만들어야 하고 그것은 `schemas/target_profile.md` 와 #10 의 범위다. 후속 이슈 후보로 남긴다.

---

## 6. 최초 측정에서 발견한 차단 — #79에서 해결됨

**아래는 `531b134`에서 발견한 역사적 증거다.** #69 범위에서는 고치지 않았고, 이후 #79의 `23d5f005a2322c0b15da881fe786ef9d5edd4565`에서 `maxItems`를 제거해 해결했다. 400→502 연쇄는 최초 원인을 보존하기 위해 남긴다.

당시 `.env` 의 실제 키를 넣고 `POST /api/analyze` (mock 없이) 를 부르면 **모든 사진이 502 `MODEL_HTTP` 로 실패했다.**

```
POST https://api.anthropic.com/v1/messages -> 400
{"type":"error","error":{"type":"invalid_request_error",
 "message":"output_config.format.schema: For 'array' type, property 'maxItems' is not supported"},
 "request_id":"req_011Cf9zNrMVmap2SdE4z2jJY"}
→ ModelError MODEL_HTTP 400  →  /api/analyze 502
```

원인은 `lib/photo_analysis.js:263` 한 줄이다:

```js
palette_hex: { type: 'array', items: { type: 'string' }, maxItems: 3 }
```

Anthropic structured outputs 가 배열의 `maxItems` 를 받지 않는다.
확인: 그 한 줄에서 `maxItems: 3` 만 임시로 지우고 같은 사진을 돌리면 **14.2초에 성공**하고 `analysis_source='vision_model'` 이 나온다
(`reason: 'api_key_present'`, `elapsed_ms: 14161.7`, `attempts: 1`). **즉 이 한 줄이 유일한 차단 원인이다.**
확인 후 그 편집은 되돌렸다 — 이 PR 의 diff 에 포함돼 있지 않다.

심각도: `lib/model.js` 는 키가 있으면 휴리스틱으로 **폴백하지 않는다**(의도된 설계, "A selected model must succeed or fail loudly").
따라서 당시에는 **키가 설정된 환경에서 `/api/analyze` 가 아무 결과도 내지 못했다.** 이 차단은 #79에서 해결됐다.

이 차단 때문에 4절 증거는 `?mock=1`(휴리스틱 픽셀 측정) 경로로 만들었다. `/api/feed` 는 모델을 부르지 않고 `PhotoAnalysis` 를 입력으로 받으므로 DoD 1번의 "실제 HTTP 경로" 요건은 그대로 충족한다. 오히려 **휴리스틱 입력이야말로 이 이슈가 우회를 걷어낸 바로 그 입력**이다.

---

## 7. 게이트 실행 출력

아래 192건은 `531b134` 최초 실행 결과다. PR #75 최종 커밋의 최신 인수 결과는 `fix-report.md`의 **195/195 통과**를 따른다.

```
### npm test
# tests 192
# suites 0
# pass 192
# fail 0
# cancelled 0
# skipped 0
# todo 0

### npm run eval
detail broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
detail broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
detail broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_15
E4/E5/E7: manual spot-check only; real demo review pending.
Injected model variant 0: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).
Injected model variant 1: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).

### npm run check
PASS: 65 JS/JSON files checked; four schema examples match fixtures. Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.

### npm run lint

Checked 40 files in 50ms. No fixes applied.

### npm run typecheck

Generating route types...
✓ Types generated successfully
```

---

## 8. DoD 항목별 판정

| DoD | 판정 | 근거 |
|---|---|---|
| 실제 HTTP 경로(`POST /api/feed`)로 사진 15장 → 입력과 다른 순서 | ✅ | 4절. `next start -p 3069` 실서버, 실사진 15장. A·B 모두 `A 가 입력과 다른가: true` / `B 가 입력과 다른가: true` |
| 각 슬롯에 근거가 있고 `evidence.ref` 가 실제 입력 사진을 가리킨다 | ✅ | 4절 "전 슬롯 uploaded_photo 근거가 실제 입력 사진을 가리킴: 예" (A·B·C 3케이스). `test/pipeline.test.js` 회귀 테스트도 같은 것을 단언 |
| 같은 사진 + 프로필 2벌 → `position` 정렬 `photo_id` 배열이 다르다 | ✅ | 4절 `A 와 B 가 다른가: true`. **함정 회피 확인** — `position` 배열은 A·B 모두 `[1..15]` 로 같다는 것을 같은 출력에 나란히 찍어 뒀다. 다만 차이는 앞 4자리에 한정된다(4-1절) |
| `preserveOrder` 가 여전히 필요한 경우의 분기 조건이 명시돼 있다 | ✅ | `target.kind==='photo_plan'` 하나. 이유는 `lib/pipeline.js` 주석 6줄 + 2-1절. 4절 C 케이스가 실행으로 확인(`C(사진만) 는 입력 유지: true`) |
| `visual.palette` 미충족으로 타이브레이크가 꺼지는 문제의 현재 상태를 기록 | ✅ | 5절. 경로 3종 표 + 프로덕션에서 항상 `null` 인 이유 + 실행 증거 |
| `npm test` / `eval` / `check` / `lint` / `typecheck` 통과 | ✅ | 7절 최초 실행은 test 192/192. 최신 인수는 `fix-report.md`의 195/195 · eval 전 항목 PASS(broken 변형은 EXPECTED FAIL) · check 65파일 · lint 40파일 0건 · typecheck 0 에러 |

**이 PR 로 끝나지 않는 것:** 5절의 `visual.palette` 미충족, 4-1절의 "프로필이 앞 4자리만 바꾼다". 6절의 실모델 분석 차단은 이후 #79(`23d5f00`)에서 해결됐다.
