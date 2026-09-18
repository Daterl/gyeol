# 이슈 #96 검증 보고 — 내부 순서 규칙 어휘의 타이틀·캡션 유출

- 워크트리 `.work/gyeol-96` · 브랜치 `fix/96-rationale-leak` (origin/develop 기준)
- 출력 모델 `claude-haiku-4-5-20251001` · 사진 분석 `claude-opus-5`
- 실행일 2026-09-18

## 0. 한 줄

**수정 전 15회 중 2회 유출 관측 → 수정 후 15회 중 0회.** 탐지는 눈이 아니라 금지 패턴 정규식이 했다.

## 1. 실험 설계 — 왜 "같은 feed" 인가

`docs/specs/96-rationale-leak/probe.mjs` 가 두 단계로 나뉜다.

```
build  실사진 11장 analyzePhoto (사진 1장 = 호출 1회)
       → buildFeed(target=reference:29cm, current=posts 4장+캡션)
       → feed.json 으로 고정
run    그 feed.json 하나로 generateOutput(mode:'all') 을 N회
       → title · slots[].text · slots[].omit_reason 을 금지 패턴으로 기계 탐지
```

feed 를 매번 새로 만들면 순서도 rationale 도 달라져 전/후 비교가 성립하지 않는다.
**같은 입력을 고정해 두고 출력 생성만 반복**해야 "무엇이 바뀌어서 유출이 사라졌나"에 답할 수 있다.
`feed.json` · `before.json` · `after.json` 을 이 폴더에 그대로 남긴다.

재현:
```bash
set -a && . ../wanted/.env && set +a
node docs/specs/96-rationale-leak/probe.mjs build <이미지폴더> /tmp/feed.json
node docs/specs/96-rationale-leak/probe.mjs run   /tmp/feed.json 15 /tmp/before.json
node docs/specs/96-rationale-leak/probe.mjs rescan /tmp/before.json   # 모델 호출 없이 재채점
```

사진: `pivot/apify-check/fixtures/images/` 실제 공개 계정 수집본. 11장 중 분석이 실패한
1장(`MODEL_TIMEOUT`)은 건너뛰고 다음 후보로 채웠다 — 값을 지어내지 않았다.

### 유출원 — 이 feed 의 rationale 원문

```
1. 밝기 0.455 · 채도 0.317 · 한 색이 넓게 깔리지 않은 화면이라 지향 방향(빼곡한 쪽) 점수가 입력 11장 중 가장 높아 1번에 뒀다
2. 앞자리 사진과 측정 색 거리 0.214 로 남은 사진 중 가장 멀어 2번에 뒀다 (밝기 0.742 · 채도 0.161)
8. 채도 0.31 로 남은 사진 중 가장 진해 8번 전환 자리에 뒀다
11. 밝기 0.317 로 남은 사진 중 가장 어두워 마지막 11번에 뒀다
```
이 11개 문장이 수정 전에는 출력 모델 입력에 그대로 실려 있었다.

## 2. 금지 패턴 — 눈이 아니라 정규식

전부 `lib/order.js` 의 rationale/evidence 생성기에서 실제로 나오는 어휘다 (probe.mjs `BANNED`).

```
색 거리 · 측정 색 · 측정 · 측정값 · 색상각 · 지향 방향 · 지향이 잰
앞자리 · 번에 뒀다 · 자리에 뒀다 · 전환 자리
밝기 · 채도 · 한 색이 넓게 · 점수 · 총점 · 보너스 · 상위 밴드
서사 규칙 · R1~R4 · order.r*
narrative_role · adjacent_overlap · is_visual_peak · caption_inputs · rationale
opener · sustain · closer · 소수 3자리 이상 수치 (\d\.\d{3,})
```

`밝기` · `채도` 를 수치 없이도 금지한 근거: **이 feed 의 `describable_facts` 129건 어디에도
`밝기`/`채도`/`측정` 이 나오지 않는다.** 즉 출력에 등장하면 사진의 사실이 아니라 내부 규칙에서
온 것이다. (이슈 DoD 는 `밝기 0.` 형태만 적었는데, 실제 유출은 `"밝기와 채도로 연결한 11장"`
처럼 수치 없이 나왔다. 좁은 목록이었으면 놓쳤다.)

`stabilizeOmission` 이 붙이는 `gyeol.omit.overlap` rule evidence 의 note 는 `adjacent_overlap=`
을 포함하지만 탐지 대상이 아니다. 그건 사용자가 펼쳐 보는 **근거 필드**이지 문장이 아니다 (P2).

## 3. 수정 전 — 15회 중 2회 유출 (실패 0)

`before.json`

| 회 | title | 히트 |
|---|---|---|
| 1 | 사진을 잇는 순서 | 0 |
| 2 | 색감 변주로 이어가는 룩북 | 0 |
| 3 | 색감 변화로 이어가는 룩북 | 0 |
| 4 | 옷과 소품으로 표현하는 계절의 무드 | 0 |
| 5 | 사진을 잇는 순서 | 0 |
| 6 | 색감의 대비로 만드는 운동화와 재킷의 스타일링 | 0 |
| 7 | 색깔 변화를 따라 풀어낸 층 입기 | 0 |
| 8 | 색 톤으로 이은 열 한 장의 착장 | 0 |
| **9** | **밝기와 채도로 연결한 11장** | **4** |
| 10 | 색감을 가르는 열 장의 순서 | 0 |
| 11 | 색감의 호흡을 맞춘 열 한 장 | 0 |
| 12 | 옷과 소품의 톤 맞춤 | 0 |
| 13 | 색감 변화를 담은 11장의 의류 스타일링 | 0 |
| **14** | **밝기와 채도로 이어가는 옷차림** | **2** |
| 15 | 사진을 잇는 순서 | 0 |

**성공 15/15 · 유출 관측 2회 (13.3%)** — 이슈의 1/10 관측과 같은 자리수다.

히트 원문:
```
9회  [밝기]   title: 밝기와 채도로 연결한 11장
9회  [채도]   title: 밝기와 채도로 연결한 11장
9회  [측정 색] slot5.omit_reason: 앞 사진과 측정 색이 같아 설명이 겹칠 수 있어, 사진만 두는 편을 제안해요.
9회  [측정]   slot5.omit_reason: (같은 문장)
14회 [밝기]   title: 밝기와 채도로 이어가는 옷차림
14회 [채도]   title: 밝기와 채도로 이어가는 옷차림
```
이슈에 적힌 `"피드 11장을 색 거리로 이어가는 배열"` 과 정확히 같은 구조다 —
**내부 측정 어휘가 "이 피드의 공통 사실" 로 승격되어 제목이 됐다.**

## 4. 수정 — 두 겹

### 4-1. 근본: 출력 모델에게 보내는 슬롯을 화이트리스트로 줄인다

`lib/output-generation.js`
```js
const forOutput = ({position,photo_id,caption_inputs}) => ({position,photo_id,caption_inputs});
const slots = selected.map(forOutput);
```

세 필드인 근거는 추측이 아니라 프롬프트 전수 조사다.

| 필드 | 프롬프트가 쓰는가 | 확인 |
|---|---|---|
| `position` · `photo_id` | 쓴다 | caption.md "받은 feed 의 photo_id 와 원래 position 을 유지한다" |
| `caption_inputs.describable_facts` | 쓴다 | caption.md "해당 슬롯의 describable_facts 에서만 말한다" |
| `caption_inputs.adjacent_overlap` · `is_visual_peak` | 쓴다 | omit_reason.md "제안 재료" |
| `narrative_role` | **안 쓴다** | `grep -rn narrative_role prompts/` → 0건 |
| `rationale` | **안 쓴다** | `grep -rn rationale prompts/` → 0건 |

원본 `input.feed` 는 손대지 않는다. `validateGenerateRequest` · `validateGenerateResponse` ·
`validateFeed` 는 전부 원본을 계속 본다. `lib/order.js` 의 rationale 생성 로직은 무변경이다.

### 4-2. 이중 방어: 프롬프트 규정

`prompts/shared/style_guard.md` 에 한 줄. title.md · caption.md 양쪽에 이미 로드되는 파일이라
중복해 적을 필요가 없다.

> 순서와 비움을 정할 때 쓴 **내부 규칙의 이름·용어·측정 수치를 제목이나 문장의 소재로 쓰지 않는다.**
> 그것은 사진에서 확인한 사실이 아니라 우리가 자리를 정한 계산이며, 사용자는 근거를 펼쳐 볼 때 읽는다.
> 금지 예: `색 거리` `측정 색` `색상각` `지향 방향` `앞자리` `전환 자리` `밝기` `채도` `점수` `총점`
> `보너스` `측정값` `서사 규칙` `R1`~`R4`, 그리고 `narrative_role` `rationale` `adjacent_overlap`
> `is_visual_peak` 같은 입력 필드 이름과 그 수치.

## 5. 4-1 만으로 돌렸을 때 — 유출은 0이지만 계약 실패가 6회 났다

`after-code-only.json` (프롬프트 수정 전, 코드만)

| 회 | title | 히트 |
|---|---|---|
| 1 | — (MODEL_CONTRACT 실패) | — |
| 2 | 계절 아이템으로 만드는 일상의 스타일링 | 0 |
| 3 | — (MODEL_CONTRACT 실패) | — |
| 4 | 일상 속 스타일링, 계절감 있는 색감과 레이어드 | 0 |
| 5 | 옷과 소품으로 계절 무드를 나타내기 | 0 |
| 6 | 계절 무드의 레이어드 스타일 | 0 |
| 7 | — (MODEL_CONTRACT 실패) | — |
| 8 | 계절 옷차림을 입고 도시를 걷다 | 0 |
| 9 | 계절 감각, 레이어링으로 완성 | 0 |
| 10 | — (MODEL_CONTRACT 실패) | — |
| 11 | 스트릿 스타일 레이어드 무드 | 0 |
| 12 | — (MODEL_CONTRACT 실패) | — |
| 13 | 레이어링과 컬러로 만드는 가을 스타일 | 0 |
| 14 | 계절 무드의 레이어링과 컬러 조화 | 0 |
| 15 | — (MODEL_CONTRACT 실패) | — |

**성공 9/15 · 실패 6 · 유출 0.** 수정 전에는 실패가 0이었으므로 이 실패는 내 변경이 만든 것이다.
그냥 "유출 0" 만 보고 끝냈으면 넘어갔을 자리라 원인을 끝까지 팠다.

`generateOutput` 이 실제 오류를 `MODEL_CONTRACT` 로 삼켜서, 같은 요청을 검증만 떼어 다시 돌렸다:

```
5 FAIL ContractError evidence.note: expected nonempty string
  slot 2 {"kind":"rule","ref":"gyeol.omit.overlap","note":""}
  slot 3 / 5 / 7 / 8  동일
```

**원인:** rationale 이 입력에 있던 동안 그 안의 evidence(`{kind:'rule', note:'서사 규칙 R4 — …'}`,
`{kind:'uploaded_photo', note:'측정값 — 밝기 …'}`)가 모델에게 **잘 쓰인 note 의 본보기 노릇**을 하고
있었다. 재료를 치우자 본보기도 같이 사라져, 모델이 `rule` 근거의 note 를 빈 문자열로 내기 시작했다.

즉 유출원이 동시에 우연한 목발이었다. 목발을 도로 끼우는 대신, 계약에 이미 있던 요구를
프롬프트에 명시했다 (`schemas/ordered_feed.md`: "ref와 note는 비어 있지 않은 문자열이다").

`prompts/output/caption.md`
> **모든 evidence 항목의 ref와 note는 비어 있지 않은 문자열이다** — `rule` 근거도 note를 빈
> 문자열로 두지 않고 그 규칙을 왜 적용했는지 한 구절로 적는다. 빈 note는 거부된다.

## 6. 수정 후 — 15회 중 0회 유출, 실패도 0

`after.json`

| 회 | title | 히트 |
|---|---|---|
| 1 | 옷 색감과 소품을 맞춘 일상 장면 | 0 |
| 2 | 계절 전환기 레이어링과 액세서리 조화 | 0 |
| 3 | 계절 옷과 소품의 레이어링 | 0 |
| 4 | 비니와 레이어드로 표현한 가을 스타일 | 0 |
| 5 | 일상 속 스타일 조각 | 0 |
| 6 | 색감과 레이어드로 잇는 일상 착장 | 0 |
| 7 | 스타일 조합으로 이루는 가을 룩 | 0 |
| 8 | 도시 곳곳에서 입은 사계절 스타일 | 0 |
| 9 | 도시 거리의 일상 스타일링 | 0 |
| 10 | 일상 속 미니멀한 레이어드 스타일 | 0 |
| 11 | 일상 속 옷차림의 색감과 소품 조합 | 0 |
| 12 | 도시 배경에서 담은 일상 스타일 | 0 |
| 13 | 가을 색감의 레이어링과 소품 매치 | 0 |
| 14 | 카라멜 톤의 레이어드 스타일 일상 | 0 |
| 15 | 계절 전환기 핵심 아이템을 담은 열 장의 스냅 | 0 |

**성공 15/15 · 실패 0 · 유출 관측 0회.**

제목이 전부 사진에서 확인 가능한 소재(레이어드·비니·도시 배경·소품)로 바뀌었다.
수정 전의 "색감", "톤" 계열 표현도 사라지고 실제 사물 이름이 들어왔다 — 모델이 봐야 할 것을
보게 됐다는 뜻이다.

| | 회수 | 성공 | 계약 실패 | 유출 |
|---|---|---|---|---|
| 수정 전 | 15 | 15 | 0 | **2** |
| 코드만 (4-1) | 15 | 9 | 6 | 0 |
| 수정 후 (4-1+4-2) | 15 | 15 | 0 | **0** |

## 7. 회귀 — 재발하면 깨진다

`test/generate.test.js` 에 2건 추가.

1. `output model never sees slot rationale or narrative_role, in either mode`
   - mode=all · mode=slot 양쪽에서 전송 body 의 슬롯 키가 정확히
     `['caption_inputs','photo_id','position']` 인지
   - 전송 JSON 문자열에 `rationale`/`narrative_role` 과 실제 rationale 문장이 없는지
   - **원본 요청의 feed.slots[0].rationale 은 그대로인지** (근거는 남아 있어야 한다)
2. `style guard forbids internal ordering vocabulary as title or caption material`
   - 실제 system 지시문에 금지 규정과 예시 어휘가 들어가는지

**변이 확인:** `slots = selected.map(forOutput)` → `slots = selected` 로 되돌리면
`all: slot fields are whitelisted` 가 실패한다 (`# pass 15 / # fail 1` 로 직접 확인).

## 8. 실행 출력

```
$ npm test
# tests 210
# pass 210
# fail 0

$ npm run eval
(모든 FAIL 이 "EXPECTED FAIL" — 의도된 broken fixture. 예기치 않은 FAIL 0건)
E4/E5/E7: manual spot-check only; real demo review pending.
Injected model variant 0: E1/E2/E3/E8/E9/E10/E11 PASS
Injected model variant 1: E1/E2/E3/E8/E9/E10/E11 PASS

$ npm run lint
Checked 40 files in 40ms. No fixes applied.
```

## 9. 아직 안 된 것 / 한계

- **`applied_profile` 은 줄이지 않았다.** caption.md 가 `applied_profile.language` 를, title.md 가
  `target_only`/`corrected` 를 명시적으로 쓰므로 필요한 입력이다. 다만 그 안의
  `deltas[].rule:"log_midpoint"` · `note_key` 는 내부 규칙 이름이다. 이번 15회에서는 유출되지
  않았고 이슈 범위 밖이라 손대지 않았다. **별도 이슈 후보로 남긴다.**
- **15회는 13%대 사건에 대한 표본이다.** 0/15 는 "발생률이 15회 안에서 관측될 만큼 높지 않다"는
  뜻이지 0% 의 증명이 아니다. 구조적 보장은 회귀 테스트(7절) 쪽이고, 15회는 그 구조 변경이
  실제 출력 품질로 이어졌다는 보조 증거다.
- **탐지 목록은 `lib/order.js` 어휘 기준이다.** order.js 가 새 문구를 만들면 목록도 같이
  늘려야 한다. probe.mjs 가 그 목록의 단일 출처다.
- `schemas/` 무변경. `src/` 무변경. `lib/order.js` 무변경.

---

# 개정 2 보고 — 프롬프트가 아니라 검증으로 막았다 (PR #108 CHANGES_REQUESTED 반영)

2026-09-18. 리뷰어: jangwonyoon (사람). 리뷰 상태 `CHANGES_REQUESTED`.

## 0. 리뷰 지적을 그대로 인정한다

리뷰어의 네 가지 지적은 전부 맞았고, 그중 하나는 **내 측정이 틀렸다는 것**이었다.

앞의 45회 측정은 `title` · `slots[].text` · `slots[].omit_reason` 만 검사면으로 잡고
**`evidence[].note` 를 빼놓았다.** note 는 사용자가 근거를 펼쳐 읽는 문장이다.
같은 하네스에 note 를 넣고 다시 재자, 실모델 10회 중 **5회**에서 유출이 나왔다:

```
 9회 17244ms  거부 MODEL_CONTRACT
      ⛔ [내부 필드명]    slot1.evidence[1].note: 슬롯의 is_visual_peak가 true이므로 캡션을 작성했다
      ⛔ [내부 필드명]    slot2.evidence[1].note: adjacent_overlap 0.786으로 설명 중복 가능성이 높다
      ⛔ [소수 3자리 수치] slot2.evidence[1].note: adjacent_overlap 0.786으로 설명 중복 가능성이 높다
      ⛔ [내부 필드명]    slot8.evidence[1].note: adjacent_overlap 0.946으로 상의와 하의, 가방 색감이 매우 유사하다
      ...
 8회 13072ms  거부 MODEL_CONTRACT   (같은 형태 5건)
 7회 ...      거부 MODEL_CONTRACT   ⛔ adjacent_overlap 0.909로 앞 슬롯과의 겹침
성공 5/10 · 거부 5회 (금지 표현 있음 5 · 없음 0) · 사용자 결과에 남은 유출 0회
```

즉 리뷰어가 말한 "프롬프트 지시를 한 번 어긴 응답"은 드문 사고가 아니라 **절반**이었다.
검증이 없던 동안 이 다섯 회차는 그대로 사용자 결과가 됐다.

## 1. 무엇을 고쳤나 — 리뷰 4항목 대응

| 리뷰 항목 | 대응 | 파일 |
|---|---|---|
| 1. title/text/omit_reason/노출 evidence.note 에서 내부 표현 실패 폐쇄 거부 | `rejectInternalLeak` 추가. 최종 observation 을 검사하고 걸리면 `MODEL_CONTRACT` | `lib/output-generation.js` |
| 2. 정상 사진 표현은 해당 `describable_facts` 에 있을 때만 허용 | 금지 표현마다 "그 슬롯의 사실에 실제로 있는가"를 본다. 타이틀·비움 고지는 피드 전체 사실이 허용 범위 | 같음 |
| 3. 각 출력 필드에 금지 표현을 넣은 provider 응답이 `MODEL_CONTRACT` 로 거부되는 회귀 | 회귀 2건 추가 (금지 표현 9종 × 출력 필드 4종 × mode 2종 + HTTP 502 경계 + 과잉 거부 방지) | `test/generate.test.js` |
| 4. 최신 develop 에 rebase, #84·#89·#95 복원 기능·테스트 유지 | `origin/develop`(bbe9d78) 위로 rebase. 충돌 2건 수동 해소 — 양쪽 다 살렸다 | — |

추가로 **입력을 더 줄였다** (리뷰 지적의 근본 원인). 아래 3절.

## 2. 왜 프롬프트가 아니라 검증인가

프롬프트는 확률이다. `style_guard.md` 에 금지어를 적어 두면 위반 빈도는 내려가지만,
**한 번의 위반이 한 명의 사용자 결과**다. 검증은 그 한 번을 막는다.

- 프롬프트 = 모델이 대체로 지키는 규칙
- 검증 = 어긴 응답이 사용자에게 도달하지 못하는 보장

둘 다 둔다. 프롬프트는 거부율을 낮추고, 검증은 경계를 닫는다.
`style_guard.md` 에 "이 규정은 지시가 아니라 계약이다 — … 응답 전체가 거부된다"를 명시해
프롬프트와 검증이 같은 목록을 말하게 했다.

## 3. 입력을 더 줄였다 — 넘기지 않은 값은 샐 수 없다

검증만 붙였을 때 **거부율 10회 중 5회**였다. 사용자에게 절반이 502 를 받는다는 뜻이고,
그건 계약을 닫았을 뿐 제품이 되지 않은 상태다. 원인은 모델이 아니라 우리 쪽에 있었다.

- `prompts/output/omit_reason.md` 가 `caption_inputs.adjacent_overlap` 과 `is_visual_peak` 를
  **이름으로 불렀다** → 모델이 그 이름을 근거로 인용하는 것이 자연스러웠다
- payload 가 `"adjacent_overlap": 0.786` 을 **값으로 실어 주었다** → 옮겨 적을 수치가 있었다
- `applied_profile.visual.palette.value` = `{hue_mean, sat_mean, bright_mean}` 이 실려 갔다
  → 리뷰가 지적한 `밝기 0.712` 의 실제 출처다. `prompts/output/` 참조는 **0건**이었다

고친 것:

| 넘기던 것 | 바뀐 것 |
|---|---|
| `applied_profile` 전체 | `{disclosure, corrected, deltas, language, *_id}` — `visual`·`sequence` 제거 |
| `language` 의 Claim 통째 | Claim 의 `value` 만 (`confidence` 0.7 도 옮겨 적을 수 있는 수치였다) |
| `adjacent_overlap: 0.786` | `앞_사진과_겹침: '높음'\|'낮음'` (임계는 서버 `OMIT_OVERLAP_MIN` 그대로) |
| `is_visual_peak: false` | `피드_안에서_색이_가장_진함: false` |

원본 `feed` 는 아무것도 잃지 않는다. 사용자가 펼쳐 보는 근거와 계약 검증은 계속 원본을 읽는다.

## 4. 증명 — 각 출력 필드별 주입 거부

금지 표현 9종(`밝기 0.712로 이은 세 장`, `adjacent_overlap 0.8인 자리`,
`is_visual_peak=false라 그대로 뒀어요`, `측정 색 거리 0.214로 앞자리와 이었다`,
`서사 규칙 R1 로 고른 첫 자리`, `sustain 자리의 기록`, `채도가 가장 진한 자리`,
`보너스 포함 총점이 가장 높아`, `narrative_role 이 closer 인 사진`)을
provider 응답의 각 출력 필드에 심어 주입한다.

| 출력 필드 | mode | 결과 |
|---|---|---|
| `output.title` | all | 9/9 `MODEL_CONTRACT` |
| `slot.text` | all · slot | 9/9 · 9/9 |
| `slot.omit_reason` | all · slot | 9/9 · 9/9 |
| `slot.evidence[].note` | all · slot | 9/9 · 9/9 |
| HTTP 경계 | all | 502 `MODEL_CONTRACT`, 응답 본문에 `0.712` 없음 |

대조군: 같은 응답에서 금지 표현만 빼면 통과한다 (거부 원인이 이 검증이라는 것을 고정).

**과잉 거부 방지 (리뷰 2항)**: `밝기 0.5 라고 적힌 조절 다이얼`을 ph_01 의
`describable_facts` 에 넣으면 — ph_01 의 캡션으로는 통과, 타이틀로도 통과,
**ph_02 의 캡션으로 쓰면 거부**된다. 그 사진의 사실이 아니기 때문이다.

## 5. 되돌림 검사 (변이)

검증·축소를 하나씩 되돌리면 그 회귀가 실제로 깨진다.

| 되돌린 것 | 결과 |
|---|---|
| `rejectInternalLeak(observation,input)` 호출 제거 | `253 → 251 pass, 2 fail` (주입 거부 + 과잉 거부 방지) |
| `appliedForOutput(...)` → 원본 `applied_profile` | `253 → 251 pass, 2 fail` |
| `selected.map(forOutput)` → `selected` | `253 → 252 pass, 1 fail` |

## 6. 실모델 재측정 (10회, 축소 후)

`claude-haiku-4-5`, 같은 고정 feed(`feed.json`, 선택 11장 · 기존 4장), 검사면에 note 포함.

```
성공 10/10 · 거부 0회 (금지 표현 있음 0 · 없음 0) · 사용자 결과에 남은 유출 0회
p50 16.1s · 근거 note 142건 전부 통과 · 비움 슬롯 회차별 2~5개 (비움 기능 살아 있다)
```

| 단계 | 성공 | 거부 | 사용자 결과에 남은 유출 |
|---|---|---|---|
| 개정 1 (프롬프트만, note 검사 빠진 측정) | 15/15 | 0 | 0 — **측정이 note 를 안 봤다** |
| 개정 1 + note 까지 검사 | 5/10 | 5 (전부 실제 유출) | 0 |
| 개정 2 (검증 + 입력 축소) | **10/10** | **0** | **0** |

거부 5건은 전부 `rejected_hits ≥ 1`, 즉 **과잉 거부 0건**이었다.
원문은 `after-validation.json` 의 각 회차 `provider_output` 에 남는다.

## 7. 알려진 천장 — 정직하게 적는다

- **휴리스틱 분석 경로의 `describable_facts` 자체가 측정값이다.** vision 없이 분석하면
  `"평균 밝기 0.346 (다소 어두움)"` 같은 문장이 사실로 기록된다. 그 문장이 사실이므로
  출력에 쓰여도 이 검증은 통과시킨다(리뷰 2항의 요구 그대로다). 그 문면을 고치는 일은
  출력 경계가 아니라 분석기의 사실 표기 문제이며 이 PR 범위 밖이다.
- **`lib/order.js` 의 `rationale` 은 그대로 둔다.** 근거는 사용자가 펼쳐 볼 자리에 있어야 한다.
  바뀐 것은 모델에게 복사해 보내는 부분집합뿐이다.
- 금지 목록은 `lib/order.js` 의 현재 어휘를 기준으로 한 유한 목록이다. order 규칙 어휘가
  늘면 목록도 같이 늘려야 한다. 목록이 놓친 표현은 통과한다.

## 8. 다섯 검증 명령 (2026-09-18, rebase 후)

```
$ npm test          → # tests 253 · # pass 253 · # fail 0
$ npm run eval      → 예기치 않은 FAIL 0건 (EXPECTED FAIL 18건은 고의 파손 케이스)
$ npm run check     → PASS: 75 JS/JSON files checked; four schema examples match fixtures
$ npm run lint      → Checked 41 files. No fixes applied.
$ npm run typecheck → ✓ Types generated successfully
$ npm run test:ui   → Test Files 10 passed · Tests 31 passed
```

rebase 결과: `git diff origin/develop -- test/` 에 **삭제 줄 0건**. #84·#89·#95 복원 테스트와
#99 테스트를 모두 유지했고, 충돌 2건(`lib/output-generation.js` · `test/generate.test.js`)은
양쪽 변경을 모두 살려 해소했다.
