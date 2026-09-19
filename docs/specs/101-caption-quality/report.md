# 캡션 품질 수정 실측 보고서

**상태: 막힘. 세 번의 프롬프트 수정으로는 품질 완료 조건을 충족하지 못했다. Draft 후보이며 merge 대상이 아니다.**

기존 설명문을 짧게 만드는 효과는 있었지만 마지막 버전에도 사실 뒤집힘과 부정확한 note가 남았다. 통과 숫자를 만들려고 후처리로 문장을 교체하거나 실패 회차를 삭제하지 않았다. 사람의 게시 가능 판정은 미실행이다.

## 변경과 범위

- `prompts/output/caption.md`: 인스타 게시 목적, 사실 하나 선택, 짧은 구절, 광고 인용 금지, 원문 note와 기존 계약을 명시했다.
- `prompts/output/title.md`: 사진 속 광고·계절·숫자·브랜드를 전체 묶음의 사실로 확대하지 않도록 했다.
- 제품 함수·화면·공통 style_guard·schemas/·모델 설정·배포 설정은 변경하지 않았다.
- rationale 유출 작업의 입력 투영과 공통 규칙 변경은 포함하지 않았다. 그 브랜치의 미커밋 diff를 읽었으며 caption.md의 note 문단이 통합 접점이다.

## 재현 조건

기준선 커밋 b152c45. 원격에 audit/product-quality 브랜치가 없어 로컬 audit/product-quality 2e7a700의 a3_analyses.json을 읽었다. 감사에서 성공한 14장 분석을 재사용하고 실패했던 과자 사진 한 장만 analyzePhoto로 단일 호출하여 복구했다. 원본 사진 15장을 직접 열어 대조했다. 반복 이미지 cq_01/cq_13도 원래 15장 구성을 그대로 보존했다.

사진은 pivot/apify-check/fixtures/images/에서 읽기만 했다. 현재 입력에는 감사 분석에서 넘어온 하늘색/청록색 같은 색 명명의 모호함이 있어, 모델이 사실 배열을 지키는지와 원사진의 완전한 정확성은 같은 주장이 아니다. 사진 분석 전체를 다시 평가한 결과로 해석하지 않는다.

`inputs.json`에 reference·freetext·photos_only·corrected의 요청 전문을 고정했다. reference는 현재 준비된 29cm 계정 스냅샷이다. 네 조건을 1,2,3,4,1,2,3,4,1,2,1,2 순으로 실행했다. 각 전후 회차의 입력 SHA-256은 같다. 서버 generateOutput 그대로 호출했고 모델은 claude-haiku-4-5-20251001, 타임아웃 45초, 동시 실행 2개다. 원문에는 실제 응답 모델·usage·시각·프롬프트 SHA-256·provider content를 남겼다. API 키는 저장하지 않았다.

기준선 10회 시도 중 timeout 1회와 빈 rule note 계약실패 1회가 나와 11·12회차를 추가했다. 수정 세 버전도 같은 12회차 스케줄을 실행했다. 성공 10쌍은 1~8·11·12회차다. 생성 단계 총 48회 시도와 별도 사진 분석 1회를 사용했다. 청구 비용은 계산하지 않았다.

```sh
node --env-file=/절대경로/.env docs/specs/101-caption-quality/measure.mjs prepare
node --env-file=/절대경로/.env docs/specs/101-caption-quality/measure.mjs before
node --env-file=/절대경로/.env docs/specs/101-caption-quality/measure.mjs after
node docs/specs/101-caption-quality/summarize.mjs
python3 docs/specs/101-caption-quality/write-report.py
```

prepare의 복구 결과와 phase JSON이 있으면 이어서 읽는다. 새 측정은 기존 원자료를 별도 보존한 뒤 실행해야 한다. before 재측정은 caption-before.md/title-before.md의 프롬프트 상태에서 수행한다. 원자료와 동일 프롬프트 해시인지 확인한다.

## 전후 실측

|항목|수정 전|최종 수정 후|
|---|---:|---:|
|시도|12|12|
|생성 성공|10|12|
|filled 슬롯|116|141|
|omitted 슬롯|34|39|
|평균 캡션 문자 수|98.6|40.5|
|설명형 보조 지표 해당 슬롯|104|75|
|보입니다/있습니다 해당 슬롯|0|0|
|uploaded_photo note 원문 불일치|149/150|7/180|
|금지어·과장 문자열 검출 회차|0|0|

설명형 보조 지표는 `보입니다/있습니다/보인다/있다/모습/화면/상반신/인물` 중 하나가 있는 슬롯 수다. `보입니다/있습니다`만 보면 전후 모두 0이므로 품질 차이를 잡지 못한다. 짧은 문장과 지표 감소는 게시 가능성의 증명이 아니다. note 일치 검사도 의미상 근거 충분성까지 증명하지 않는다.

## 에이전트 판정과 사람 판정

5분 1차 검토용 [human-review.md](human-review.md)에 O/X 칸을 남겼다. 전수 문장은 [comparison.md](comparison.md), 슬롯별 판정·사유·사실 오류는 [judgments.json](judgments.json)에 있다. 작성자 에이전트가 사진과 문장을 읽은 비블라인드 판정이므로 독립 사용자 조사로 취급하지 않는다. **사람 판정은 0건, 통과율은 미측정**이다.

|회차|전 캡션/filled|후 캡션/filled|후 전체 15슬롯 중 과반|
|---|---:|---:|---|
|1|0/15 (0.0%)|0/15 (0.0%)|아니오|
|2|0/4 (0.0%)|2/3 (66.7%)|아니오|
|3|0/15 (0.0%)|2/15 (13.3%)|아니오|
|4|0/8 (0.0%)|0/15 (0.0%)|아니오|
|5|0/15 (0.0%)|0/15 (0.0%)|아니오|
|6|0/9 (0.0%)|0/7 (0.0%)|아니오|
|7|0/15 (0.0%)|1/15 (6.7%)|아니오|
|8|0/15 (0.0%)|0/15 (0.0%)|아니오|
|9|생성 실패|0/15 (0.0%)|아니오|
|10|생성 실패|0/3 (0.0%)|아니오|
|11|0/15 (0.0%)|0/8 (0.0%)|아니오|
|12|0/5 (0.0%)|11/15 (73.3%)|예|

before: filled 기준 0/116 (0.0%). 생성 성공 회차의 모든 슬롯 기준 0/150 (0.0%).

after: filled 기준 16/141 (11.3%). 생성 성공 회차의 모든 슬롯 기준 16/180 (8.9%).

12회차 일부는 캡션 구절로 판단했지만, 대부분 회차가 설명문이고 사실 위반도 있어 전체 통과가 아니다. 초기 두 버전은 after-v1.json(11/12 성공)·after-v2.json(12/12 성공)에 보존했다. 첫 버전에는 광고 문구·계절·기분 추론, 두 번째에는 잘못된 색·의류 겹침과 계절 추론이 남았다. 마지막 버전도 이를 완전히 막지 못했다.

## 실제 실패와 경계

|구분|회차·사진|실제 출력|대조 근거|
|---|---|---|---|
|최종 S4|4 / cq_03|갈색 스웨이드 재킷 위 흰 리본 끈 상의|사실은 재킷 안에 흰 리본 끈 상의를 입었다|
|최종 S4|5 / cq_10|손가락마다 반지|사실은 여러 손가락에 반지를 꼈다. 전체 손가락으로 확대했다|
|최종 위치 모호성|12 / cq_06|크림색 소파 위 검은색 핸드백|사실은 무릎 앞에 놓여 있다. 보수적 탈락|
|최종 P2|11 / 7개 비움 슬롯|사진 속 묘사 가능한 사실이 부족합니다.|각 사진에 여러 사실이 있는데 원문 대신 부족하다는 note를 생성했다|
|기준선 S4|2 / cq_04|분홍색 신발|음식 사진과 입력에 없는 사물|
|기준선 S4|1 / cq_08|하늘색 상의|입력은 흰색 상의|

S4 위반 0건 조건은 **미충족**이다. 이 표는 발견한 구체 사례이며 전체 제품에서의 발생률 추정이 아니다. 금지어 0건을 S4 통과로 해석하지 않는다. P3 비움은 유지했으나 11회차의 부정확한 note를 정상 비움 근거로 인정하지 않는다.

## 타이틀 전수

|회차|전|후|
|---|---|---|
|1|가을 시즌 브랜드와 아이템 둘러보기|사진을 잇는 순서|
|2|차분한 색감으로 잇는 소품과 일상|크림색 노트부터 시작하는 열다섯 장|
|3|선택한 사진들을 순서대로 담았어요.|사진 모음|
|4|음식과 일상 소품으로 엮은 15장|사진을 잇는 순서|
|5|음식과 옷, 일상 소품 모음|사진 모음|
|6|차분한 물건과 사람들|노트와 옷, 음식을 담은 사진들|
|7|사진을 잇는 순서|사진 모음|
|8|분식부터 패션까지, 좋아하는 것들 담기|사진을 잇는 순서|
|9|MODEL_TIMEOUT|사진을 잇는 순서|
|10|MODEL_CONTRACT|사진을 잇는 순서|
|11|가을 초입, 먹거리와 옷과 소소한 것들|사진 모음|
|12|차분한 색으로 이어가는 사진들|노트부터 차분하게|

최종 12개 타이틀에서 단일 사진의 광고 숫자·시즌을 묶음의 사실로 올린 사례는 발견하지 못했다. 중립 폴백이 반복돼 타이틀의 제품 가치는 아직 낮다. 최종 2회차의 열다섯 장은 실제 입력 장수이며 광고 숫자가 아니다.

## 다섯 검증 명령의 실제 출력

환경: Node v22.22.3, npm 10.9.8. npm ci 성공(464개 설치, 취약점 0). package engines는 24.x여서 엔진 경고가 있었으며 Node 24 재검증은 미실행이다.

### `npm run test` — 종료 0

```text
1..208
# tests 208
# suites 0
# pass 208
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 893.630875
```

전체 출력: [test.log](test.log).

### `npm run eval` — 종료 0

```text
│ 6       │ 'detail' │ 'E10'     │ 'PASS' │ ''     │
│ 7       │ 'detail' │ 'E11'     │ 'PASS' │ ''     │
└─────────┴──────────┴───────────┴────────┴────────┘
detail broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
detail broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
detail broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
detail broken E6: EXPECTED FAIL — E6.title: expected nonempty string
detail broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
detail broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
detail broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
detail broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_15
E4/E5/E7: manual spot-check only; real demo review pending.
Injected model variant 0: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).
Injected model variant 1: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).
```

전체 출력: [eval.log](eval.log).

### `npm run check` — 종료 0

```text
> gyeol@0.1.0 check
> node scripts/check.js

PASS: 65 JS/JSON files checked; four schema examples match fixtures. Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```

전체 출력: [check.log](check.log).

### `npm run typecheck` — 종료 0

```text
> gyeol@0.1.0 typecheck
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
```

전체 출력: [typecheck.log](typecheck.log).

### `npm run lint` — 종료 0

```text
> gyeol@0.1.0 lint
> biome check .

Checked 40 files in 64ms. No fixes applied.
```

전체 출력: [lint.log](lint.log).

check는 기초 JS/JSON, lint는 설정상 src와 설정 파일을 검사한다. 두 실험 스크립트는 별도로 node --check를 통과했다. 기존 생성 계약 208개 테스트의 통과는 새 캡션 문체의 보증이 아니다. 프롬프트 문구만 비교하는 형식적 테스트는 추가하지 않았다.

## 남은 것과 인수

- 세 번 수정 후에도 재현된 S4/P2/게시 문체 실패를 이슈 댓글로 남기고 칸반을 **막힘**으로 변경했다. 이슈는 닫지 않는다.
- 사람의 전후 전수 판정, 다른 모델의 독립 리뷰, Node 24 검증은 미실행이다.
- rationale 입력 축소와 합친 뒤에도 효과가 있는지 별도 확인이 필요하다. 현재 보고는 그 변경 없이 측정한 결과다.
- 모델 교체·입력 계약 변경·후처리 우회·배포·merge는 하지 않았다.
- PR base는 코디네이터의 2026-09-18 응답으로 develop을 확정했다. dev는 폐기된 브랜치이며 origin/dev는 사용하지 않는다. Draft PR은 품질 미통과와 사람 판정 pending을 명시한다.

---

# 개정 2026-09-18 — 리뷰(@jangwonyoon) 대응과 develop 통합 상태 재측정

이 절 위의 기록은 **프롬프트만 고쳤던 회차의 실패 기록**이다. 지우지 않았다.
리뷰가 지적한 대로 그 회차는 #101 을 통과하지 못했다(설명문 75/141, 에이전트 사용 가능 16/141,
사람 판정 0건, S4/position 실패 3건, note 불일치 7/180). 아래는 그 실패 위에서 한 작업이다.

## 1. 무엇을 바꿨나

### 1-1. 규칙을 프롬프트에서 결과 경계로 옮겼다
`lib/output-generation.js` 의 기존 `validatePublicOutput` **같은 자리**에 붙였다. 새 경계를 만들지 않았다.

| 계약 | 강제 내용 | 위반 시 |
|---|---|---|
| 공통 금지어 | `이처럼` `또한` `이를 통해` `이러한` `마침내` 와 단정·최상급 `최고의` `완벽한` `반드시` 가 제목·본문·비움 이유·근거 note 어디에도 없다 | `MODEL_CONTRACT` |
| 사진 근거 note 결합 | `kind='uploaded_photo'` 이고 `ref` 가 그 슬롯인 근거의 `note` 는 그 슬롯 `describable_facts` 의 한 요소와 **글자 단위로 같다** | `MODEL_CONTRACT` |
| 빈 facts 고정 문구 | `describable_facts` 가 빈 배열일 때만 `확인한 관측 사실이 없음`(`NO_FACTS_NOTE`). 모델이 한계 문구를 지어내지 못한다. 사실이 있는데 이 문구를 써도 거부 | `MODEL_CONTRACT` |
| 단서 형식 | `filled` 의 `text` 는 `쓸 거리: <소재>[ · <소재>]` + `이 중 기억에 남은 건?` 두 줄. 소재 최대 2개, 빈 소재 금지 | `MODEL_CONTRACT` |

회귀 테스트는 `test/generate.test.js` 세 개다. **가드를 지우면 세 개가 모두 실패한다**(확인함).
리뷰가 "성공으로 통과했다"고 지적한 세 응답이 각각 거부된다.

| 리뷰가 든 예 | 지금 |
|---|---|
| 금지어 `또한` 이 든 사물 나열 캡션 | `MODEL_CONTRACT` |
| `가을 브랜드 25곳, 최고의 추천` 제목 | `MODEL_CONTRACT` (`최고의`) |
| `가을 감정과 방문 의도` evidence note | `MODEL_CONTRACT` (사실 원문 불일치) |

### 1-2. 선택된 제품 방향(사용자가 완성하는 짧은 힌트)을 계약으로 구현했다
`prompts/output/caption.md` 를 단서 형식으로 바꾸고(실모델 36회로 측정된 PR #115 판),
그 형식을 위 표대로 코드가 강제한다. UI 의미도 맞췄다.

- `src/copy/captions.ko.json`: `filled` 라벨 `제안됨` → `쓸 거리 제안`
- `src/features/captions/caption-editor.tsx`: 편집란 `N번 사진의 문장` → `N번 사진에 내가 쓸 문장`,
  placeholder 가 제안을 지우고 자기 말로 쓰도록 안내

새 화면을 만들지 않았다. `schemas/` 4종을 바꾸지 않았다.

### 1-3. title 변경을 이 PR 에서 뺐다
`prompts/output/title.md` 는 `origin/develop` 판과 **동일**하다(`git diff origin/develop -- prompts/output/title.md` 비어 있음).
title 은 #109(PR #113) 소관이다.

### 1-4. 삭제하지 않았다
`git diff origin/develop --numstat -- test/` = `64 추가 / 5 삭제`, **삭제된 테스트 0개**(268 → 271).
5줄은 전부 같은 자리에서 고쳐 쓴 줄이다: import 한 줄, `filledOutput` 헬퍼 두 줄, 근거 note 한 줄,
비움 고지 문구 한 줄. #84·#89·#95·#99·#96 의 기능과 테스트는 건드리지 않았다.
`fixtures/interaction.sample.json` 의 note 7건과 filled text 2건은 새 계약에 맞게 **수정**했다(삭제 아님).

## 2. 코드로 판정하지 않기로 한 것 — 그리고 그 근거

처음에는 단서의 소재까지 "그 슬롯 사실의 연속 부분 문자열"로 강제했다.
develop 통합 상태에서 실모델 12회를 돌린 결과 **12회 중 10회가 거부**됐고(성공 2회),
거부된 41건을 전수로 읽었더니 대부분이 사실은 맞고 낱말만 바꾼 경우였다.

```
사실:  진주 형태의 흰 목걸이를 착용하고 있다   → 소재: 진주 목걸이     (거부됨)
사실:  갈색 스웨이드 질감의 오버사이즈 재킷     → 소재: 갈색 스웨이드 재킷 (거부됨)
사실:  노트 표지는 흰색에 가까운 크림색이다     → 소재: 크림색 노트      (거부됨)
```

이것은 **낱말이 사실을 옳게 옮겼는가**라는 의미 판정이고, 리뷰가 "코드로 판정하지 말고 실측 인수 게이트로
남기라"고 한 바로 그 축이다. 그래서 이 검사만 계약에서 뺐다. 형식·근거 원문·금지어는 그대로 강제한다.
뺀 판단의 원자료는 `integrated-strict-seed.json` 과 `integrated-strict-seed-diagnosis.json` 에 남겼다.
출처 추적(P2)은 `uploaded_photo.note` 원문 일치가 맡는다.

## 3. develop 통합 상태 실모델 재측정 (2026-09-18)

- 기준 커밋: `origin/develop` = `64965a5` (#96 `forModelSlot` 출력 모델 입력 축소 + 실패 폐쇄 포함)
- 입력: 같은 실사진 15장, 지향 4종(reference / freetext / photos_only / corrected), 12회 고정 스케줄
- 입력을 develop 통합 상태에서 **다시 만들었다**(`inputs.json` 재생성). 이전 숫자를 재사용하지 않았다.
- 재현: `node --env-file=<.env> docs/specs/101-caption-quality/measure.mjs prepare && ... integrated`
  채점: `node docs/specs/101-caption-quality/summarize-integrated.mjs`, 귀속: `... diagnose.mjs` (모델 호출 0회)

| 지표 | 값 |
|---|---|
| 생성 시도 / 성공 | 12 / **10** |
| 실패 2건 | 회차 1 `hint_shape`(모델이 `쓰기리:` 로 오타), 회차 11 `internal_field_leak`(비움 이유에 `position` 유출 — develop #96 가드가 잡음) |
| 슬롯 합계 | 150 |
| 단서(filled) / 비움(omitted) | 86 / **64** |
| 단서 평균 길이 | **35.5자** (감사 기준선 98.6자) |
| `uploaded_photo` note 수 / **원문 불일치** | 158 / **0** (이전 회차 7/180) |
| 공통 금지어 | **0건** |
| 단서 형식 위반(성공 회차) | **0건** |

### 3-1. 소재 167개의 출처 전수 분류 (성공 10회)

| 분류 | 건수 | 뜻 |
|---|---|---|
| 그 슬롯 사실의 원문 | **134** (80%) | 문제 없음 |
| **다른 슬롯의 사실** | **1** | 회차 3 `cq_04` 의 `흰색 실로 꽃 자수` — 실제로는 `cq_02` 의 사실이다. **S4 위반이다** |
| 원문에 없는 표현 | 32 | `진주 목걸이` 류. 사실 여부는 사람이 판정해야 한다 |

**교차 오염 1건은 계약이 잡지 못했다.** 사실로 확인되지 않은 32건도 자동으로 통과한다.
이것이 코드 계약으로 닫히지 않는 잔여 구멍이며, 사람 인수 게이트가 필요한 이유다.

### 3-2. 타이틀 10개 (이 PR 은 title 프롬프트를 바꾸지 않았다)

|회차|지향|타이틀|
|---|---|---|
|2|freetext|일상 속 물건과 입은 것들|
|3|photos_only|옷과 소품으로 표현하는 일상의 순간|
|4|corrected|음식과 옷, 일상 소품을 담은 선택|
|5|reference|음식과 옷, 소품으로 꾸린 일상|
|6|freetext|사진을 잇는 순서|
|7|photos_only|옷과 소품으로 표현한 일상|
|8|corrected|음식과 옷, 소품으로 채운 선택|
|9|reference|음식과 옷, 소품으로 고르는 취향|
|10|freetext|선택과 기억을 담은 사진들|
|12|freetext|물건과 옷으로 담은 일상|

감사가 지적한 `가을 브랜드 25곳` 류의 **단일 사진 광고 문구 확대는 이번 10회에서 나오지 않았다.**
다만 이는 title 프롬프트 변경의 효과가 아니라 출력 모델 입력이 #96 으로 줄어든 상태의 관측이며,
title 판정은 #109 소관이다.

### 3-3. 비움 분포 (P3)

|회차|지향|비움/전체|
|---|---|---|
|2|freetext|10/15|
|3|photos_only|3/15|
|4|corrected|4/15|
|5|reference|6/15|
|6|freetext|8/15|
|7|photos_only|7/15|
|8|corrected|6/15|
|9|reference|4/15|
|10|freetext|7/15|
|12|freetext|9/15|

자연어 지향에서 비움이 많다(7~10). 이전 회차에서 관측된 `0개` 회귀는 이번 12회에서 나오지 않았다.

## 4. 검증 명령 (전부 exit 0)

| 명령 | 결과 | 로그 |
|---|---|---|
| `npm test` | **271/271 pass** | `logs/test.log` |
| `npm run test:ui` | 11 files / 35 tests pass | `logs/test-ui.log` |
| `npm run eval` | pass (E1~E11 expected-fail 유지) | `logs/eval.log` |
| `npm run check` | PASS: 75 files | `logs/check.log` |
| `npm run lint` | 42 files, no fixes | `logs/lint.log` |
| `npm run typecheck` | 통과 | `logs/typecheck.log` |

## 5. 아직 안 된 것 (통과로 포장하지 않는다)

- **사람의 게시 가능 판정은 여전히 0건이다.** #101 의 "사람이 과반 판정" 완료 조건은 **미충족**이다.
- 소재 32건은 사실 여부가 확인되지 않았고, 교차 오염 1건은 **확인된 S4 위반**이다. 코드 계약이 잡지 못한다.
- 실모델 12회 중 2회가 `MODEL_CONTRACT` 로 실패한다(16.7%). 사용자에게는 재시도로 보인다.
- 이 PR 은 **#101 을 닫지 않는다.** 닫히려면 사람 인수 게이트와 위 두 구멍이 먼저 해결돼야 한다.
