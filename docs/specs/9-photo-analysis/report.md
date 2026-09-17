# report.md — #9 검증 결과

기준 SHA **`32eff4f`** (= `main`, PR #21 squash merge) · 브랜치 `feat/9-photo-analysis` · 커밋 `a5251a6` · 실행 2026-09-17 · Node `v22+`

> **기준선 정정 이력:** 착수 시점 기준은 `7d16ff8`(미merge foundation 브랜치)이었으나, 작업 중 PR #21 이 `main` 에 squash merge 되어 `main` 이 **더 새로워졌다**(`lib/contracts.js` 34줄 추가 — 불변식 E9·E10·E11 신규). 그대로 두면 이 PR 의 diff 가 69개 파일로 부풀고 검증도 옛 계약 기준이 된다. 그래서 커밋을 `origin/main` 위로 rebase 하고 **아래 모든 검증을 새 계약으로 다시 돌렸다.** 이 문서의 숫자는 전부 rebase 이후 값이다.
> `validatePhoto` 자체는 변경되지 않았고, #9 는 `validatePhoto` 만 쓴다. 신규 E9·E10·E11 은 `validateFeed`/`validateExport` 소관(#12·#13)이다.

**Verdict: PASS (명시한 로컬 검증 범위) / 실모델·배포 검증 PENDING**
아래 출력은 전부 실제 실행 결과를 붙인 것이다. 미실행을 PASS 로 쓰지 않았다.

---

## 0. 한 줄 요약

| DoD | 판정 | 근거 |
|---|---|---|
| 사진 15장 → PhotoAnalysis 15개 | **PASS** | 2절. 실사진 15장·레포 SVG 15장 양쪽 |
| 15장 전수 대조로 무근거 항목 0개 | **PASS** | 4절. 15장 전부 사람이 열어 확인 |
| 같은 사진 2회 → API 호출 0회 | **PASS** | 2절 카운터 표 |
| #6 A1 반영 (사진 단위 분할) | **PASS (설계)** / A1 숫자 자체는 **PENDING** | 5절 |
| 모델 실패 → `heuristic`, 에러 아님 | **PASS** | 3절 테스트 + 6절 |
| 1회 전체 파이프라인 토큰 비용 | **PENDING** | 5절. API 키 없음 → 측정 불가 |
| 휴리스틱이 사실을 지어내지 않음 | **PASS** | 3·4절 |
| 영속 캐시 가정 금지·상한 명시 | **PASS** | `spec.md` 3절 + 2절 카운터 |

---

## 1. 테스트·정적 검사 — 실제 출력

### `npm test`
```
# tests 81
# pass 81
# fail 0
```
파일별 내역: `api.test.js` 3건 + `contracts.test.js` 64건(기존 합 67건) + 이번에 추가한 `photo_analysis.test.js` **14건**. 기존 67건 회귀 없음.

### `npm run eval`
```
Synthetic manual bootstrap only; no AI quality or human agreement claim.
┌─────────┬─────────┬───────────┬────────┬────────┐
│ (index) │ case    │ invariant │ result │ reason │
├─────────┼─────────┼───────────┼────────┼────────┤
│ 0       │ 'quiet' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'quiet' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'quiet' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'quiet' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'quiet' │ 'E8'      │ 'PASS' │ ''     │
│ 5       │ 'quiet' │ 'E9'      │ 'PASS' │ ''     │
│ 6       │ 'quiet' │ 'E10'     │ 'PASS' │ ''     │
│ 7       │ 'quiet' │ 'E11'     │ 'PASS' │ ''     │
└─────────┴─────────┴───────────┴────────┴────────┘
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
quiet broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
... (detail 케이스도 동일하게 8개 PASS / 파손 8종 EXPECTED FAIL)
detail broken E9:  EXPECTED FAIL — E9: target profile ID differs from actual input
detail broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
detail broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_15
E4/E5/E7: manual spot-check only; real demo review pending.
```
불변식 **8개**(E1·E2·E3·E6·E8·E9·E10·E11) PASS, 의도적 파손 8종 전부 EXPECTED FAIL. **#9 는 `eval/` 을 건드리지 않았다** — 이 출력은 새 계약에서도 회귀가 없음의 증거다.

**E11 이 이 이슈와 직접 맞물린다:** 새로 들어온 `validateFactProvenance`(E11)는 `OrderedFeed` 슬롯의 `caption_inputs.describable_facts` 가 **그 사진의 PhotoAnalysis `describable_facts` 의 부분집합**이어야 한다고 강제한다. 즉 이 이슈가 만든 배열이 캡션 허용 목록으로 실제로 기능하도록 계약이 잠겼다. `spec.md` 의 좁게 유지하는 규칙이 #12 에서 기계적으로 검사된다.

### `npm run check`
```
PASS: 34 JS/JSON files checked; zero dependencies; four schema examples match fixtures.
JS syntax/JSON parsing only, no separate typechecker or linter.
```
**의존성 0개 유지.** 이미지 디코더를 라이브러리로 붙이지 않고 `lib/jpeg_dc.js` 로 직접 읽은 이유가 이 게이트다.

---

## 2. 15장 실행 — `node scripts/run_pipeline.js <폴더> 15`

### 2-1. 실제 인스타 사진 15장

입력: `pivot/apify-check/fixtures/images/` 에서 고른 15장 (읽기 전용 디렉토리이므로 임시 폴더로 복사해 실행).
한 캐러셀에 몰리지 않도록 파일명 정렬 순서에서 41칸씩 띄어 뽑았다 — 밝은 스튜디오컷/어두운 야외컷/제품컷이 섞인다.

```
c29_Dc-2OOrFBnb_00  c29_Dc7cY9WiUbs_08  c29_DdDCDKgFCLE_05  c29_DdILtQ0CRl8_00  c29_DdLxIomoEKc_07
c29_DdQB2d7CR0w_04  c29_DdVDlTviVrG_06  c29_DdWHSQGlMt4_08  kr29cm_Dc-GJ-iCezC_00  kr29cm_Dc8RZMAjXm8_08
kr29cm_DdEAAeHm6u0_01  kr29cm_DdIt_2szpfb_00  kr29cm_DdNVPc3FBUP_07  kr29cm_DdTPMgpiZWR_04  kr29cm_DdVKdyACaC1_06
```

```
입력 폴더: <임시>/real15
이미지 15장 · 호출 단위: 사진 1장 = 호출 1회 (배치 경로 없음)
모델 키: 없음 → 휴리스틱 경로만

— 산출물 요약 —
┌─────────┬──────────┬─────────────────────────────┬─────────────┬─────────────┬────────┬───────┬───────┬───────────┬────────┬──────────────────┬───────────┬───────┬───────┐
│ (index) │ photo_id │ file                        │ source      │ size        │ bright │ sat   │ hue   │ top색점유 │ detail │ comp             │ scale     │ facts │ flags │
├─────────┼──────────┼─────────────────────────────┼─────────────┼─────────────┼────────┼───────┼───────┼───────────┼────────┼──────────────────┼───────────┼───────┼───────┤
│ 0       │ 'ph_01'  │ 'c29_Dc-2OOrFBnb_00.jpg'    │ 'heuristic' │ '1080x1350' │ 0.375  │ 0.288 │ 53    │ 0.259     │ 0.0726 │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 1       │ 'ph_02'  │ 'c29_Dc7cY9WiUbs_08.jpg'    │ 'heuristic' │ '1080x1350' │ 0.617  │ 0.126 │ 16    │ 0.331     │ 0.032  │ 'negative_space' │ 'midshot' │ 6     │ '-'   │
│ 2       │ 'ph_03'  │ 'c29_DdDCDKgFCLE_05.jpg'    │ 'heuristic' │ '1080x1346' │ 0.607  │ 0.219 │ 8.6   │ 0.244     │ 0.0289 │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 3       │ 'ph_04'  │ 'c29_DdILtQ0CRl8_00.jpg'    │ 'heuristic' │ '1440x1800' │ 0.328  │ 0.301 │ 104.1 │ 0.285     │ 0.0496 │ 'negative_space' │ 'midshot' │ 6     │ '-'   │
│ 4       │ 'ph_05'  │ 'c29_DdLxIomoEKc_07.jpg'    │ 'heuristic' │ '1080x1350' │ 0.518  │ 0.261 │ 318.3 │ 0.169     │ 0.0266 │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 5       │ 'ph_06'  │ 'c29_DdQB2d7CR0w_04.jpg'    │ 'heuristic' │ '1080x1350' │ 0.442  │ 0.209 │ 245.6 │ 0.25      │ 0.0604 │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 6       │ 'ph_07'  │ 'c29_DdVDlTviVrG_06.jpg'    │ 'heuristic' │ '1078x1350' │ 0.584  │ 0.254 │ 22.5  │ 0.221     │ 0.027  │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 7       │ 'ph_08'  │ 'c29_DdWHSQGlMt4_08.jpg'    │ 'heuristic' │ '1620x2025' │ 0.446  │ 0.354 │ 17    │ 0.127     │ 0.05   │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 8       │ 'ph_09'  │ 'kr29cm_Dc-GJ-iCezC_00.jpg' │ 'heuristic' │ '1080x1350' │ 0.742  │ 0.161 │ 24.2  │ 0.334     │ 0.0198 │ 'negative_space' │ 'midshot' │ 6     │ '-'   │
│ 9       │ 'ph_10'  │ 'kr29cm_Dc8RZMAjXm8_08.jpg' │ 'heuristic' │ '1080x1350' │ 0.563  │ 0.128 │ 35.2  │ 0.223     │ 0.0282 │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 10      │ 'ph_11'  │ 'kr29cm_DdEAAeHm6u0_01.jpg' │ 'heuristic' │ '1440x1800' │ 0.441  │ 0.362 │ 19.9  │ 0.145     │ 0.0427 │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 11      │ 'ph_12'  │ 'kr29cm_DdIt_2szpfb_00.jpg' │ 'heuristic' │ '1214x2160' │ 0.515  │ 0.344 │ 152.8 │ 0.079     │ 0.032  │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 12      │ 'ph_13'  │ 'kr29cm_DdNVPc3FBUP_07.jpg' │ 'heuristic' │ '1080x1350' │ 0.43   │ 0.246 │ 332.4 │ 0.122     │ 0.0367 │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 13      │ 'ph_14'  │ 'kr29cm_DdTPMgpiZWR_04.jpg' │ 'heuristic' │ '3072x4096' │ 0.607  │ 0.246 │ 28.6  │ 0.115     │ 0.0456 │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
│ 14      │ 'ph_15'  │ 'kr29cm_DdVKdyACaC1_06.jpg' │ 'heuristic' │ '1080x1350' │ 0.434  │ 0.145 │ 25.4  │ 0.197     │ 0.0591 │ 'full_frame'     │ 'midshot' │ 6     │ '-'   │
└─────────┴──────────┴─────────────────────────────┴─────────────┴─────────────┴────────┴───────┴───────┴───────────┴────────┴──────────────────┴───────────┴───────┴───────┘

— 호출·캐시 카운터 (DoD 증거) —
┌─────────┬──────────────────────────────┬────────┬──────────┬──────────┬──────────┬──────────┬──────┬────────┐
│ (index) │ pass                         │ 사진수 │ 모델호출 │ 모델실패 │ 캐시적중 │ 캐시미스 │ 실패 │ 소요ms │
├─────────┼──────────────────────────────┼────────┼──────────┼──────────┼──────────┼──────────┼──────┼────────┤
│ 0       │ '1회차 (콜드 캐시)'          │ 15     │ 0        │ 0        │ 0        │ 15       │ 0    │ 129    │
│ 1       │ '2회차 (같은 바이트 재투입)' │ 15     │ 0        │ 0        │ 15       │ 0        │ 0    │ 4      │
└─────────┴──────────────────────────────┴────────┴──────────┴──────────┴──────────┴──────────┴──────┴────────┘

2회차 모델 호출 = 0 (PASS: 파일 해시 캐시 적중)
캐시 항목 수 = 15 (상한 64, 프로세스 수명 한정 · 영속 아님)
```

- **PhotoAnalysis 15개 산출, 실패 0건.** stdout JSON 배열 길이 15, 전부 `validatePhoto` 통과.
- **JPEG 디코드 실패 0장.** 15장 모두 프로그레시브 JPEG 이며 DC 스캔을 읽었다.
- **2회차 모델 호출 0회.** 1회차도 0회인 것은 API 키가 없어 휴리스틱만 돌았기 때문이다. 모델 경로가 실제로 1회만 호출되고 2회차에 0회인 것은 `photo_analysis.test.js` 의 주입 클라이언트 테스트로 검증했다(3절).
- 15장 픽셀 측정 총 **129ms** (1장 평균 약 9ms). 이건 모델 왕복이 아니라 로컬 측정 시간이다.

### 2-2. 레포 안 15장 (리뷰어 재현용)

`pivot/` 은 이 레포 밖이라 리뷰어가 못 볼 수 있다. 레포만 클론해도 돌아가는 경로를 같이 남긴다.

```
$ node scripts/run_pipeline.js eval/golden/case_01/photos 15
...
┌─────────┬──────────────────────────────┬────────┬──────────┬──────────┬──────────┬──────────┬──────┬────────┐
│ (index) │ pass                         │ 사진수 │ 모델호출 │ 모델실패 │ 캐시적중 │ 캐시미스 │ 실패 │ 소요ms │
├─────────┼──────────────────────────────┼────────┼──────────┼──────────┼──────────┼──────────┼──────┼────────┤
│ 0       │ '1회차 (콜드 캐시)'          │ 15     │ 0        │ 0        │ 0        │ 15       │ 0    │ 2      │
│ 1       │ '2회차 (같은 바이트 재투입)' │ 15     │ 0        │ 0        │ 15       │ 0        │ 0    │ 0      │
└─────────┴──────────────────────────────┴────────┴──────────┴──────────┴──────────┴──────────┴──────┴────────┘
2회차 모델 호출 = 0 (PASS: 파일 해시 캐시 적중)
```
**합성 SVG 카드이므로 AI 품질 증거가 아니다.** 측정된 색이 커밋된 `fixtures/photo_analysis.sample.json` 과 일치하는지 확인하는 용도다 — `ph_01` 은 `#e8dfd2`·`text_in_image: "synthetic 1"` 로 fixture 와 같은 값이 나왔다(테스트로 고정).

---

## 3. 실패 주입·캐시 — `npm test` 안의 해당 테스트

| 테스트 | 무엇을 증명하는가 |
|---|---|
| `model failure falls back to heuristic instead of throwing` | 모델이 `HTTP 529` 로 죽어도 **throw 하지 않고** `analysis_source: "heuristic"` 이 나온다. `modelFailures` 카운터 1 |
| `model observations are accepted but measured color overrides the model estimate` | 모델이 `hue_mean: 999`·`palette_hex: ["nonsense"]` 를 줘도 출력은 측정값 `#e8dfd2`·`35.5` 다 |
| `a model response that violates the contract is rejected, not trusted` | 모델이 `composition: "sideways"` 를 주면 거부한다. 모델 출력을 신뢰해서 통과시키지 않는다 |
| `same bytes twice: zero extra model calls, identity re-stamped, duplicate reported` | 2회차 `modelCalls` 그대로 1. 다른 `photo_id` 로 넣으면 **`photo_id`·`input_index`·`file_ref` 가 새 값**이고 `quality_flags` 에 `duplicate_of:ph_01` 이 붙는다. `analyzed_at` 은 최초 시각 유지 |
| `cache is bounded and holds no more than CACHE_LIMIT entries` | 74장을 넣어도 `cacheSize === 64` |
| `unobservable bytes fail honestly instead of inventing color` | PNG(디코더 없음)·빈 바이트 → `AnalysisUnavailableError`. **색을 0 으로 채우지 않는다** |
| `heuristic never reports a subject, place, time or mood — only measured values` | `describable_facts` 의 모든 항목이 4개 측정 패턴 중 하나와 정규식으로 일치해야 통과. `subjects` 는 `[]` |
| `there is no many-photos-per-request path` | `photos`/`images`/`batch` 키, 배열 본문 → 전부 400 |
| `the heuristic path makes zero outbound attempts with the network disabled` | `fetch`·`net`·`http`·`https`·`dns` 를 전부 막은 자식 프로세스에서 `outbound attempts: 0` |

### `curl` 로 확인한 HTTP 경로
```
--- 1) POST 사진 1장 ---
{"schema_version":"1.0","photo_id":"ph_03","file_ref":"upload/ph_03.svg","input_index":2,
 "color":{"hue_mean":20.6,"sat_mean":0.316,"bright_mean":0.831,"palette_hex":["#d4a891"]},
 "composition":"negative_space", ...}
HTTP 200
--- 2) 같은 사진 재요청 (캐시) ---
HTTP 200  time=0.001404s
--- 3) 여러 장 시도 (photos 키) ---
{"error":{"code":"INVALID_REQUEST","message":"One photo per request; \"photos\" is not accepted."}}
HTTP 400
--- 4) GET ---
{"error":{"code":"METHOD_NOT_ALLOWED","message":"Use POST with exactly one photo."}}
HTTP 405
--- 5) 기존 /api/feed 회귀 확인 ---
HTTP 200
```

---

## 4. `describable_facts` 전수 대조 (DoD 핵심)

**방법:** 15장을 하나씩 실제로 열어서 보고, 그 사진의 `describable_facts` 네~여섯 줄을 한 줄씩 사진과 맞춰 봤다.
휴리스틱 경로이므로 나오는 사실은 ①해상도·방향 ②평균 밝기 ③평균 채도 ④주요 색과 점유율 네 종류뿐이다.

**결과: 사진에 없는 항목 0개 / 총 90개 항목(15장 × 6줄).**

판정 근거를 몇 장만 적는다(전부 같은 방식으로 확인했다):

| 사진 | 출력이 말한 것 | 실제 사진 | 판정 |
|---|---|---|---|
| ph_09 | 밝기 0.742(밝음) · 채도 0.161(낮음) · 주요 색 `#f2dfcc` 33% | 크림색 배경의 스튜디오 인물컷. 배경이 화면의 3분의 1 이상을 크림 단색으로 채운다 | ✅ |
| ph_01 | 밝기 0.375(다소 어두움) · 주요 색 `#16150f` 26% | 그늘진 야외, 어두운 수목이 화면 위쪽을 채운다 | ✅ |
| ph_05 | hue 318.3 · 주요 색 `#9b6391` 14% | 보라색 스웨이드 가방이 피사체 | ✅ hue 318°=자보라 |
| ph_12 | hue 152.8 · 채도 0.344 · 최상위 점유 8% | 청록색 니트 인물컷, 배경 요소가 많아 단색 면이 거의 없다 | ✅ |
| ph_13 | hue 332.4 · 주요 색 `#3d4046` 12% / `#130e10` 12% | 버건디 가죽 재킷 + 검정 가방 + 회색 금속 배경 | ✅ |
| ph_07 | `1078×1350` | 파일 헤더가 실제로 1078 폭이다(1080 으로 반올림하지 않았다) | ✅ |
| ph_14 | `3072×4096` | 리사이즈 안 된 원본 해상도 | ✅ |

**이 대조에서 확인한 것 하나 더:** 15장 중 **인물이 등장하는 사진이 11장**인데, 출력의 `describable_facts` 에 사람·장소·시간·감정이 들어간 항목은 **0개**다. 휴리스틱은 사람을 볼 수 없고, 볼 수 없는 것을 적지 않았다.

**이 대조의 한계 (정직하게):** 이번 15장은 모두 휴리스틱 경로다(API 키 없음). 즉 **모델이 쓴 `describable_facts` 는 이 대조로 검증되지 않았다.** 모델 경로의 전수 대조는 키가 확보된 뒤 다시 해야 하며, 그것이 6절의 남은 게이트다.

---

## 5. 측정하지 못한 것 — PENDING (우회하지 않았다)

### 5-1. 1회 전체 파이프라인 토큰 비용 → **PENDING**

**이유:** 이 세션 환경에 `ANTHROPIC_API_KEY` 가 없다. `env | grep -i anthropic` 결과 없음. 토큰 수를 세는 `POST /v1/messages/count_tokens` 도 인증이 필요하므로 **추정조차 실측으로 대신할 수 없다.**

**숫자를 만들지 않는 이유:** 이미지 토큰 환산식을 기억에 의존해 적으면 그건 출처 없는 수치다. `docs/intent.md` 6-1절이 "근거를 댈 수 없는 수치"를 원칙적으로 금지한 대상에 이것도 들어간다.

**대신 지금 측정 가능한 것만 기록한다:**

| 항목 | 값 | 출처 |
|---|---|---|
| 호출 횟수 (15장) | **15회** | 사진 1장 = 호출 1회 설계 |
| 15장 원본 합계 | 8.29 MiB (1장 평균 566 KiB, 최대 2.13 MiB) | `stat` 실측 |
| base64 인코딩 후 전송량 | 11.05 MiB (1장 평균 754 KiB) | 위 × 4/3 |
| 모델 | `claude-opus-5` (`GYEOL_VISION_MODEL` 로 교체 가능) | `lib/photo_analysis.js` |
| 단가 | 입력 $5 / 출력 $25 per MTok | Anthropic 공개 단가 (claude-api 레퍼런스 캐시 2026-06-24). **배포 시점에 재확인 필요** |
| `max_tokens` | 4096 / 출력은 PhotoAnalysis JSON 1개라 실제로는 훨씬 작다 | 코드 |
| `effort` | `low` | A1 지연이 이 이슈의 리스크이므로 |

**키가 생기면 이 한 줄로 측정된다:**
```bash
ANTHROPIC_API_KEY=... node scripts/run_pipeline.js <폴더> 15 2>&1 | grep -A4 "호출·캐시 카운터"
```
`usage`(입력·출력·캐시 토큰)는 `analyzePhoto` 가 이미 반환값에 담고 있다. 비용 표를 찍는 것은 그 숫자가 생긴 다음에 붙인다.

### 5-2. #6 의 A1 실측 → **PENDING (선행 이슈 소관)**

착수 시점에 #6 이슈 코멘트에 **배포 환경 왕복 시간과 함수 실행시간 상한이 아직 없다.**
그래서 이 이슈는 숫자를 기다리지 않고 `docs/intent.md` 8절 A1 **대응 ①(사진 단위 분할)을 무조건 참인 설계**로 고정했다:

- `analyzePhoto` 는 사진 1장만 받는다. 배열 인자가 없다.
- `POST /api/analyze` 는 `photos`/`images`/`batch` 키를 **400 으로 거절**한다(테스트로 고정).
- 그래서 A1 숫자가 어떤 값으로 나오더라도 **이 코드는 안 바뀐다.** 숫자가 좋게 나오면 배치를 나중에 얹을 수는 있지만, 지금 얹지 않는 것이 이 이슈의 결론이다.

**A1 숫자가 필요한 남은 판단 하나:** 모델 호출 타임아웃을 20초로 잡았다. 배포 환경 함수 상한이 그보다 짧으면 이 값을 내려야 한다. #6 이 상한을 적으면 그때 맞춘다.

### 5-3. 배포 환경 검증 → **해당없음 (이 이슈 범위 밖)** + 배포가 이미 깨져 있다

`CLAUDE.md` 1-1절 11단계는 배포 URL 에서 직접 돌려 보는 것을 요구한다. 배포는 다른 담당의 몫이고 이 세션은 배포 설정을 건드리지 않았다. **로컬 검증과 배포 검증을 구분해 적었다.**

**다만 확인 중에 발견한 것 하나를 넘긴다 — #6 소관이다.**
이 PR 커밋에 배포 실패 체크가 붙어 있는데, **내 변경 때문이 아니다. 기준선 자체가 이미 실패한다.**

```
$ gh api repos/Daterl/gyeol/commits/32eff4f/status   # = 기준선, #9 변경 없음
failure
Vercel | failure | Deployment has failed

$ gh api repos/Daterl/gyeol/commits/<이 PR>/status
failure
Vercel | failure | Deployment has failed
```

즉 PR #21 이 merge 된 시점부터 배포가 깨져 있다. `docs/intent.md` 4-3절 **D1**(공개 배포 URL 이 있고 로그인 없이 열린다)과 4-4 순번 0 이 직접 걸려 있는 사안이다.
**이 세션은 손대지 않았다** — 배포 설정 변경은 이 이슈 범위 밖이고(작업 규약), Vercel 프로젝트도 다른 계정(`jangwons-projects`) 소유라 로그를 읽을 권한이 없다. **#6 담당에게 넘긴다.**

---

## 6. 남은 게이트

| # | 남은 것 | 누가·언제 |
|---|---|---|
| G1 | **실모델 1장 왕복 시간·실토큰 비용 측정** | `ANTHROPIC_API_KEY` 확보 후. #6 의 A1 과 같은 작업 |
| G2 | **모델 경로 `describable_facts` 전수 대조** | G1 다음. 4절의 대조를 모델 출력으로 다시 한다 |
| G3 | **모델 호출 타임아웃 20초 재조정** | #6 이 함수 실행시간 상한을 적은 뒤 |
| G4 | **전송 계약 확정 반영** | #24 가 업로드 방식·바이트/해상도 한도·오류 코드를 확정하면 `api/analyze.js` 를 맞춘다 |
| G5 | **스키마 변경 4건 심의** | `spec.md` 8절. `CLAUDE.md` 4-2절 절차(L 크기, 양쪽 사람 승인). 이 PR 에서 손대지 않았다 |
| G6 | **다중 모델 리뷰** | M 크기는 권장. 아직 미실행 — 0건으로 기록하지 않는다 |
| G7 | **사람 merge** | 상대 사람 리뷰어. AI 는 merge 하지 않는다 |
| G8 | PNG·WebP 픽셀 측정 | 현재 두 포맷은 모델이 없으면 `ANALYSIS_UNAVAILABLE` 이다. 필요해지면 별도 이슈 |
| **G9** | **기준선의 배포 실패 복구** | **#6 소관. #9 변경 이전부터 깨져 있다**(5-3절 증거). D1 이 여기에 걸려 있다 |

### 6-1. 기준선 관련 메모

- `main` 이 이 세션 중에 움직였다(`7d16ff8` → `32eff4f`). 커밋은 rebase 했고 모든 검증을 새 계약으로 다시 돌렸다. 다른 워크트리(#10·#11)도 같은 기준선 이동에 걸려 있을 수 있다 — **각자 rebase 후 재검증이 필요하다.**
- 칸반 보드 갱신 SOP 를 세션 중에 전달받았으나 두 가지가 걸렸고, 둘 다 지시대로 처리했다.
  1. 지시가 가리킨 `CLAUDE.md` 의 '칸반 보드로 작업 상태를 관리한다' 절이 **내 워크트리와 `origin/main` 양쪽 모두에 없다**(`grep 칸반` → 0건). 없는 절을 추측해 따르지 않고 전달받은 메시지의 요지대로만 처리했다.
  2. **`gh` 토큰에 `read:project` 스코프가 없다.** 실제 출력:
     ```
     $ gh project item-list 2 --owner Daterl --format json
     error: your authentication token is missing required scopes [read:project]
     $ gh auth status | grep -i scopes
       - Token scopes: 'admin:org', 'gist', 'repo'
     ```
     SOP 4항("스코프가 없으면 보드를 건너뛰고 이슈 댓글로만 기록한 뒤 계속 진행하라")대로 **보드를 건너뛰고 이슈 #9 댓글로 기록했다.** `gh auth refresh` 는 사용자 토큰 스코프를 바꾸는 일이라 임의로 실행하지 않았다. 칸 이름을 확인할 수 없었으므로 **추측한 칸 이름을 쓰지도, 새 칸을 만들지도 않았다.**

## 7. 다음 행동

1. 이 PR 을 Draft 로 열고 이슈 #9 에 검증 요약을 댓글로 남긴다 (이슈는 닫지 않는다).
2. #6 담당에게 A1 숫자와 함수 상한을 요청한다 (G1·G3).
3. `spec.md` 8절 스키마 변경 4건을 #24 에 연결한다 (G5).
4. #12(F2 순서 제안)는 이 출력의 `color`·`composition` 과 `run_pipeline` 의 `detail` 측정값을 근거로 쓸 수 있다. **`scale` 은 쓰지 마라 — 측정값이 아니라 고정값이다.**
