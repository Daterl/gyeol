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
