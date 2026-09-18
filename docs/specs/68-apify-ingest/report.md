# 검증 보고서

## 판정

PASS: 공개 URL 1개 실수집 → 스냅샷 → 현재·지향 프로필 추출 및 인증된 서버 핸들러까지 확인했다. 화면의 기존 URL 입력은 아직 이 API를 호출하지 않는다. 화면 연결·서버 배포·사람 리뷰·머지는 미실행이다.

- 작업 브랜치: `feat/68-apify-ingest`, PR 대상: `develop`.
- 최종 통합 기준 SHA: `23d5f005a2322c0b15da881fe786ef9d5edd4565` (최신 origin/develop 반영 후 아래 검사 재실행).
- 시작 기준 SHA: `2ffaf46445d716e785ae269f749db738ab21eae9`.
- `npm ci`: 464개 설치, audit 취약점 0. 로컬 Node v22.22.3이며 package의 24.x 요구와 다른 engine 경고가 있었다. 아래 실행 검사는 모두 이 환경의 결과다.
- 새 유료 수집: 공개 `29cm.official` 3건, **1회**. 비공개 계정 실수집 없음. 사진·언어 모델 호출 없이 기존 통계 추출기 사용.
- [실행 근거](live-evidence.json): run `h9dl4E9wmvW8wYaUa`, build `HFnaHhQGkDXjgZHDp`, 제공자 실행 15.74초, 인증된 `usageTotalUsd` **$0.0081**. 완료 10초 이후 재조회한 관측이며 다른 계정의 시간·가격을 보장하지 않는다.
- 키·receipt·전체 로컬 결과는 Git 제외 `.tmp/apify-68/`에만 있다. 원본 .env 복사, schemas/화면/배포 설정 수정은 하지 않았다.

## DoD 판정

| 기준 | 판정 | 실제 근거 |
|---|---|---|
| 공개 계정 URL에서 실제 수집·스냅샷 생성 | PASS | 새 run SUCCEEDED, 3 posts, 아래 실행 출력 |
| 스냅샷으로 currentProfile/targetProfile 추출 | PASS | 양쪽 sample_size=3, 기존 계약 검증 |
| 확인된 비공개 fixture를 접근불가/미확인과 구분 | PASS | PRIVATE_ACCOUNT / ACCESS_UNAVAILABLE / ACCOUNT_UNCONFIRMED 개별 테스트; 실제 비공개 호출 없음 |
| provenance 및 근거 해소 | PASS | snapshot/shortCode/account:shortcode → 원본 URL evidence_refs, 양쪽 프로필 역참조 검사 |
| 시간·비용 실측 | PASS | 인증된 run 응답, provisional=false 재조회, 15.74초/$0.0081 |
| 데모 기본은 사전 스냅샷 | PASS | 기존 pipeline/feed/sample 파일 변경 없음, 기존 전체 회귀 검사 통과 |
| npm test/eval/check/lint/typecheck | PASS | 아래 실제 출력·종료 코드 |
| Actor 고정·댓글 제외·미디어/순서/출처/결측 | PASS | 새 run + 기존 pivot 30건/26캐러셀; caption_exact와 child_order_exact=true |

## 실행 출력

기존 fixture 검사는 `/Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/ig_feed_29cm.json`을 읽기 전용으로 사용했다. 새 수집과 다른 데이터임을 구분한다.

```json
{
  "http_status": 200,
  "status": "SUCCEEDED",
  "metrics": {
    "observed_at": "2026-09-18T01:27:26.550Z",
    "provisional": false,
    "run_id": "h9dl4E9wmvW8wYaUa",
    "build_id": "HFnaHhQGkDXjgZHDp",
    "started_at": "2026-09-18T01:20:35.213Z",
    "finished_at": "2026-09-18T01:20:51.119Z",
    "duration_seconds": 15.74,
    "usage_total_usd": 0.0081
  },
  "provider_options": {
    "build": "latest",
    "timeoutSecs": 120,
    "memoryMbytes": 512,
    "maxItems": 3,
    "maxTotalChargeUsd": 0.1,
    "isMaxTotalChargeUsdSetByUser": true,
    "diskMbytes": 2048
  },
  "pricing_model": "PAY_PER_EVENT",
  "posts": 3,
  "current_sample_size": 3,
  "target_sample_size": 3,
  "fixture": {
    "source": "pivot/apify-check/fixtures/ig_feed_29cm.json",
    "posts": 30,
    "carousels": 26,
    "current_sample_size": 30,
    "target_sample_size": 30,
    "caption_exact": true,
    "child_order_exact": true
  }
}
```

## 자동 검사

<details>
<summary>npm test — exit 0</summary>

```text

> gyeol@0.1.0 test
> node --test test/*.test.js

TAP version 13
# Subtest: GET mock returns 15 slots and all four resources
ok 1 - GET mock returns 15 slots and all four resources
  ---
  duration_ms: 29.029333
  type: 'test'
  ...
# Subtest: live is explicit error, invalid query and method are controlled
ok 2 - live is explicit error, invalid query and method are controlled
  ---
  duration_ms: 1.282042
  type: 'test'
  ...
# Subtest: mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts
ok 3 - mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts
  ---
  duration_ms: 102.073667
  type: 'test'
  ...
# Subtest: strict account URLs only; never arbitrary hosts or post/comment endpoints
ok 4 - strict account URLs only; never arbitrary hosts or post/comment endpoints
  ---
  duration_ms: 0.749333
  type: 'test'
  ...
# Subtest: normalization preserves Unicode, child IDs/order/types, separates comments/tags/dates and leaves unknown fields empty
ok 5 - normalization preserves Unicode, child IDs/order/types, separates comments/tags/dates and leaves unknown fields empty
  ---
  duration_ms: 2.882834
  type: 'test'
  ...
# Subtest: both existing extractors consume same snapshot and every observation reference resolves
ok 6 - both existing extractors consume same snapshot and every observation reference resolves
  ---
  duration_ms: 2.234625
  type: 'test'
  ...
# Subtest: confirmed private, nonexistent, access unavailable and unknown responses are distinct
ok 7 - confirmed private, nonexistent, access unavailable and unknown responses are distinct
  ---
  duration_ms: 0.26075
  type: 'test'
  ...
# Subtest: missing observations, mixed errors, duplicate posts or wrong accounts cannot become success
ok 8 - missing observations, mixed errors, duplicate posts or wrong accounts cannot become success
  ---
  duration_ms: 0.332208
  type: 'test'
  ...
# Subtest: start pins actor/posts mode and hard limits; known private and invalid limits perform zero calls
ok 9 - start pins actor/posts mode and hard limits; known private and invalid limits perform zero calls
  ---
  duration_ms: 16.183875
  type: 'test'
  ...
# Subtest: asynchronous completion supplies real run metrics and both profiles
ok 10 - asynchronous completion supplies real run metrics and both profiles
  ---
  duration_ms: 4.841042
  type: 'test'
  ...
# Subtest: signed receipts prevent foreign-run requests and survive creating a new client
ok 11 - signed receipts prevent foreign-run requests and survive creating a new client
  ---
  duration_ms: 1.288583
  type: 'test'
  ...
# Subtest: ambiguous paid starts never retry; reads retry at most once
ok 12 - ambiguous paid starts never retry; reads retry at most once
  ---
  duration_ms: 1.672041
  type: 'test'
  ...
# Subtest: provider timeout/budget failure preserve receipt and measurements
ok 13 - provider timeout/budget failure preserve receipt and measurements
  ---
  duration_ms: 10.298417
  type: 'test'
  ...
# Subtest: cancel preserves receipt; late completed run is not discarded
ok 14 - cancel preserves receipt; late completed run is not discarded
  ---
  duration_ms: 1.245416
  type: 'test'
  ...
# Subtest: HTTP requires server access key and explicit paid acknowledgement; never silently starts by default
ok 15 - HTTP requires server access key and explicit paid acknowledgement; never silently starts by default
  ---
  duration_ms: 3.876209
  type: 'test'
  ...
# Subtest: cancel on an already completed run performs no abort request
ok 16 - cancel on an already completed run performs no abort request
  ---
  duration_ms: 0.634333
  type: 'test'
  ...
# Subtest: failed abort racing completion retains the completed result
ok 17 - failed abort racing completion retains the completed result
  ---
  duration_ms: 0.515959
  type: 'test'
  ...
# Subtest: malformed receipt signatures fail closed even with multibyte characters
ok 18 - malformed receipt signatures fail closed even with multibyte characters
  ---
  duration_ms: 0.128375
  type: 'test'
  ...
# Subtest: unknown costs stay null and empty completed datasets are not live successes
ok 19 - unknown costs stay null and empty completed datasets are not live successes
  ---
  duration_ms: 0.204917
  type: 'test'
  ...
# Subtest: malformed or unsupported carousel media cannot become successful observations
ok 20 - malformed or unsupported carousel media cannot become successful observations
  ---
  duration_ms: 0.111
  type: 'test'
  ...
# Subtest: completed-run billing remains provisional until re-observed after ten seconds
ok 21 - completed-run billing remains provisional until re-observed after ten seconds
  ---
  duration_ms: 2.383834
  type: 'test'
  ...
# Subtest: API access key alone cannot forge receipts signed with separate server secret
ok 22 - API access key alone cannot forge receipts signed with separate server secret
  ---
  duration_ms: 0.48075
  type: 'test'
  ...
# Subtest: 120/18 yields one evidenced delta, 47 chars and honest correction
ok 23 - 120/18 yields one evidenced delta, 47 chars and honest correction
  ---
  duration_ms: 23.907917
  type: 'test'
  ...
# Subtest: boundary 0/120: 10
ok 24 - boundary 0/120: 10
  ---
  duration_ms: 4.952625
  type: 'test'
  ...
# Subtest: boundary 120/0: 10
ok 25 - boundary 120/0: 10
  ---
  duration_ms: 4.299542
  type: 'test'
  ...
# Subtest: boundary 18/120: 47
ok 26 - boundary 18/120: 47
  ---
  duration_ms: 2.786333
  type: 'test'
  ...
# Subtest: boundary 0/0: 0
ok 27 - boundary 0/0: 0
  ---
  duration_ms: 2.496084
  type: 'test'
  ...
# Subtest: boundary 1/2: 1
ok 28 - boundary 1/2: 1
  ---
  duration_ms: 1.220625
  type: 'test'
  ...
# Subtest: boundary 120/120: 120
ok 29 - boundary 120/120: 120
  ---
  duration_ms: 3.37975
  type: 'test'
  ...
# Subtest: absent current completes pipeline and E8 with no delta
ok 30 - absent current completes pipeline and E8 with no delta
  ---
  duration_ms: 1.61475
  type: 'test'
  ...
# Subtest: missing caption measurement is not a fabricated gap
ok 31 - missing caption measurement is not a fabricated gap
  ---
  duration_ms: 2.996167
  type: 'test'
  ...
# Subtest: invalid or unevidenced profiles are rejected
ok 32 - invalid or unevidenced profiles are rejected
  ---
  duration_ms: 1.312542
  type: 'test'
  ...
# Subtest: same measured photos and different targets change position-sorted photo IDs
ok 33 - same measured photos and different targets change position-sorted photo IDs
  ---
  duration_ms: 2.069291
  type: 'test'
  ...
# Subtest: four sample types and independent golden input files satisfy contracts
ok 34 - four sample types and independent golden input files satisfy contracts
  ---
  duration_ms: 76.345
  type: 'test'
  ...
# Subtest: E1: valid input passes and stored broken fixture fails
ok 35 - E1: valid input passes and stored broken fixture fails
  ---
  duration_ms: 5.851166
  type: 'test'
  ...
# Subtest: E2: valid input passes and stored broken fixture fails
ok 36 - E2: valid input passes and stored broken fixture fails
  ---
  duration_ms: 3.959959
  type: 'test'
  ...
# Subtest: E3: valid input passes and stored broken fixture fails
ok 37 - E3: valid input passes and stored broken fixture fails
  ---
  duration_ms: 5.556708
  type: 'test'
  ...
# Subtest: E6: valid input passes and stored broken fixture fails
ok 38 - E6: valid input passes and stored broken fixture fails
  ---
  duration_ms: 3.969625
  type: 'test'
  ...
# Subtest: E8: valid input passes and stored broken fixture fails
ok 39 - E8: valid input passes and stored broken fixture fails
  ---
  duration_ms: 1.909584
  type: 'test'
  ...
# Subtest: E9: valid input passes and stored broken fixture fails
ok 40 - E9: valid input passes and stored broken fixture fails
  ---
  duration_ms: 6.236625
  type: 'test'
  ...
# Subtest: E10: valid input passes and stored broken fixture fails
ok 41 - E10: valid input passes and stored broken fixture fails
  ---
  duration_ms: 2.86825
  type: 'test'
  ...
# Subtest: E11: valid input passes and stored broken fixture fails
ok 42 - E11: valid input passes and stored broken fixture fails
  ---
  duration_ms: 3.899667
  type: 'test'
  ...
# Subtest: 3 photo boundary passes
ok 43 - 3 photo boundary passes
  ---
  duration_ms: 0.475833
  type: 'test'
  ...
# Subtest: 20 photo boundary passes
ok 44 - 20 photo boundary passes
  ---
  duration_ms: 0.447583
  type: 'test'
  ...
# Subtest: 2 input photos rejected
ok 45 - 2 input photos rejected
  ---
  duration_ms: 0.111917
  type: 'test'
  ...
# Subtest: 21 input photos rejected
ok 46 - 21 input photos rejected
  ---
  duration_ms: 0.028667
  type: 'test'
  ...
# Subtest: reject duplicate output ID despite true flag
ok 47 - reject duplicate output ID despite true flag
  ---
  duration_ms: 0.078125
  type: 'test'
  ...
# Subtest: reject missing slot despite declared output count
ok 48 - reject missing slot despite declared output count
  ---
  duration_ms: 1.077417
  type: 'test'
  ...
# Subtest: reject foreign replacement ID with same count
ok 49 - reject foreign replacement ID with same count
  ---
  duration_ms: 0.086583
  type: 'test'
  ...
# Subtest: reject lying counts
ok 50 - reject lying counts
  ---
  duration_ms: 0.072
  type: 'test'
  ...
# Subtest: reject count string
ok 51 - reject count string
  ---
  duration_ms: 0.06075
  type: 'test'
  ...
# Subtest: reject unique flag string
ok 52 - reject unique flag string
  ---
  duration_ms: 0.068542
  type: 'test'
  ...
# Subtest: reject position string
ok 53 - reject position string
  ---
  duration_ms: 0.063167
  type: 'test'
  ...
# Subtest: reject duplicate position
ok 54 - reject duplicate position
  ---
  duration_ms: 0.074292
  type: 'test'
  ...
# Subtest: reject zero position
ok 55 - reject zero position
  ---
  duration_ms: 0.055291
  type: 'test'
  ...
# Subtest: reject fractional position
ok 56 - reject fractional position
  ---
  duration_ms: 0.055334
  type: 'test'
  ...
# Subtest: reject missing rationale Claim
ok 57 - reject missing rationale Claim
  ---
  duration_ms: 0.091709
  type: 'test'
  ...
# Subtest: reject evidence missing
ok 58 - reject evidence missing
  ---
  duration_ms: 0.081125
  type: 'test'
  ...
# Subtest: reject evidence wrong type
ok 59 - reject evidence wrong type
  ---
  duration_ms: 0.072209
  type: 'test'
  ...
# Subtest: reject invalid confidence
ok 60 - reject invalid confidence
  ---
  duration_ms: 0.074375
  type: 'test'
  ...
# Subtest: reject empty evidence reference
ok 61 - reject empty evidence reference
  ---
  duration_ms: 0.080333
  type: 'test'
  ...
# Subtest: reject overlap string
ok 62 - reject overlap string
  ---
  duration_ms: 0.081208
  type: 'test'
  ...
# Subtest: reject invented current input
ok 63 - reject invented current input
  ---
  duration_ms: 0.061083
  type: 'test'
  ...
# Subtest: reject false corrected claim
ok 64 - reject false corrected claim
  ---
  duration_ms: 0.058667
  type: 'test'
  ...
# Subtest: reject unknown delta
ok 65 - reject unknown delta
  ---
  duration_ms: 0.061667
  type: 'test'
  ...
# Subtest: duplicate/malformed actual input rejected
ok 66 - duplicate/malformed actual input rejected
  ---
  duration_ms: 0.061709
  type: 'test'
  ...
# Subtest: E2 does not trust output input_count/unique flags as expected input IDs
ok 67 - E2 does not trust output input_count/unique flags as expected input IDs
  ---
  duration_ms: 0.277125
  type: 'test'
  ...
# Subtest: E8 uses actual absent input even if response invents consistent correction
ok 68 - E8 uses actual absent input even if response invents consistent correction
  ---
  duration_ms: 0.348833
  type: 'test'
  ...
# Subtest: validateFeed rejects missing current context with target-only disclosure
ok 69 - validateFeed rejects missing current context with target-only disclosure
  ---
  duration_ms: 1.889042
  type: 'test'
  ...
# Subtest: E8 rejects missing current context with target-only disclosure
ok 70 - E8 rejects missing current context with target-only disclosure
  ---
  duration_ms: 0.236875
  type: 'test'
  ...
# Subtest: validateFeed rejects undefined current context with target-only disclosure
ok 71 - validateFeed rejects undefined current context with target-only disclosure
  ---
  duration_ms: 0.037292
  type: 'test'
  ...
# Subtest: E8 rejects undefined current context with target-only disclosure
ok 72 - E8 rejects undefined current context with target-only disclosure
  ---
  duration_ms: 0.124958
  type: 'test'
  ...
# Subtest: validateFeed rejects missing current context with invented correction
ok 73 - validateFeed rejects missing current context with invented correction
  ---
  duration_ms: 0.027458
  type: 'test'
  ...
# Subtest: E8 rejects missing current context with invented correction
ok 74 - E8 rejects missing current context with invented correction
  ---
  duration_ms: 0.12475
  type: 'test'
  ...
# Subtest: validateFeed rejects undefined current context with invented correction
ok 75 - validateFeed rejects undefined current context with invented correction
  ---
  duration_ms: 0.379
  type: 'test'
  ...
# Subtest: E8 rejects undefined current context with invented correction
ok 76 - E8 rejects undefined current context with invented correction
  ---
  duration_ms: 0.138
  type: 'test'
  ...
# Subtest: profile absence/types/rule-only claims are checked
ok 77 - profile absence/types/rule-only claims are checked
  ---
  duration_ms: 0.214084
  type: 'test'
  ...
# Subtest: photo field types are checked
ok 78 - photo field types are checked
  ---
  duration_ms: 0.078833
  type: 'test'
  ...
# Subtest: reject title null
ok 79 - reject title null
  ---
  duration_ms: 0.095459
  type: 'test'
  ...
# Subtest: reject title []
ok 80 - reject title []
  ---
  duration_ms: 0.0785
  type: 'test'
  ...
# Subtest: reject title ["one","two"]
ok 81 - reject title ["one","two"]
  ---
  duration_ms: 0.038084
  type: 'test'
  ...
# Subtest: reject title ""
ok 82 - reject title ""
  ---
  duration_ms: 0.045292
  type: 'test'
  ...
# Subtest: reject title " "
ok 83 - reject title " "
  ---
  duration_ms: 0.108625
  type: 'test'
  ...
# Subtest: reject title "one\\ntwo"
ok 84 - reject title "one\\ntwo"
  ---
  duration_ms: 0.061916
  type: 'test'
  ...
# Subtest: reject title "one\\rtwo"
ok 85 - reject title "one\\rtwo"
  ---
  duration_ms: 0.023334
  type: 'test'
  ...
# Subtest: reject title 3
ok 86 - reject title 3
  ---
  duration_ms: 0.171666
  type: 'test'
  ...
# Subtest: reject title "one two"
ok 87 - reject title "one two"
  ---
  duration_ms: 0.100833
  type: 'test'
  ...
# Subtest: F3 export retains stable identity at every position, including after reorder
ok 88 - F3 export retains stable identity at every position, including after reorder
  ---
  duration_ms: 1.104167
  type: 'test'
  ...
# Subtest: E4/E5/E7 are intentionally not automated quality checks
ok 89 - E4/E5/E7 are intentionally not automated quality checks
  ---
  duration_ms: 0.840417
  type: 'test'
  ...
# Subtest: user caption rejects photo-only evidence
ok 90 - user caption rejects photo-only evidence
  ---
  duration_ms: 0.133459
  type: 'test'
  ...
# Subtest: user caption accepts valid user_text evidence with additional photo evidence
ok 91 - user caption accepts valid user_text evidence with additional photo evidence
  ---
  duration_ms: 0.155709
  type: 'test'
  ...
# Subtest: present current can be honestly corrected with the single supported delta
ok 92 - present current can be honestly corrected with the single supported delta
  ---
  duration_ms: 0.287583
  type: 'test'
  ...
# Subtest: absent account and extra title fields cannot smuggle contradictory states
ok 93 - absent account and extra title fields cannot smuggle contradictory states
  ---
  duration_ms: 0.057833
  type: 'test'
  ...
# Subtest: validateFeed rejects an invented target profile ID
ok 94 - validateFeed rejects an invented target profile ID
  ---
  duration_ms: 0.261833
  type: 'test'
  ...
# Subtest: validateFeed and validateExport reject evidence that resolves to no input photo
ok 95 - validateFeed and validateExport reject evidence that resolves to no input photo
  ---
  duration_ms: 1.007667
  type: 'test'
  ...
# Subtest: validateFeed rejects describable_facts copied from another real photo
ok 96 - validateFeed rejects describable_facts copied from another real photo
  ---
  duration_ms: 1.355666
  type: 'test'
  ...
# Subtest: golden bundle carries its own PhotoAnalysis matching the input manifest
ok 97 - golden bundle carries its own PhotoAnalysis matching the input manifest
  ---
  duration_ms: 10.585334
  type: 'test'
  ...
# Subtest: 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다
ok 98 - 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다
  ---
  duration_ms: 2.955166
  type: 'test'
  ...
# Subtest: 부재 프로필은 target_only 공개와 정합하다 (E8)
ok 99 - 부재 프로필은 target_only 공개와 정합하다 (E8)
  ---
  duration_ms: 0.168541
  type: 'test'
  ...
# Subtest: 스냅샷 재생 경로가 source:"cached" 프로필을 만든다
ok 100 - 스냅샷 재생 경로가 source:"cached" 프로필을 만든다
  ---
  duration_ms: 2.477459
  type: 'test'
  ...
# Subtest: 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다
ok 101 - 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다
  ---
  duration_ms: 3.048709
  type: 'test'
  ...
# Subtest: 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다
ok 102 - 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다
  ---
  duration_ms: 94.753333
  type: 'test'
  ...
# Subtest: empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다
ok 103 - empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다
  ---
  duration_ms: 1.277708
  type: 'test'
  ...
# Subtest: 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다
ok 104 - 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다
  ---
  duration_ms: 0.223167
  type: 'test'
  ...
# Subtest: 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다
ok 105 - 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다
  ---
  duration_ms: 0.1125
  type: 'test'
  ...
# Subtest: opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다
ok 106 - opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다
  ---
  duration_ms: 1.014334
  type: 'test'
  ...
# Subtest: opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다
ok 107 - opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다
  ---
  duration_ms: 2.640708
  type: 'test'
  ...
# Subtest: 어떤 경로에서도 문자열 '불명' 이 나오지 않는다
ok 108 - 어떤 경로에서도 문자열 '불명' 이 나오지 않는다
  ---
  duration_ms: 3.270959
  type: 'test'
  ...
# Subtest: 직접 업로드 경로가 사진 분석에서 visual 을 집계한다
ok 109 - 직접 업로드 경로가 사진 분석에서 visual 을 집계한다
  ---
  duration_ms: 0.264125
  type: 'test'
  ...
# Subtest: hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다
ok 110 - hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다
  ---
  duration_ms: 0.098834
  type: 'test'
  ...
# Subtest: 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2)
ok 111 - 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2)
  ---
  duration_ms: 0.608917
  type: 'test'
  ...
# Subtest: 입력을 섞거나 형식이 어긋나면 거부한다
ok 112 - 입력을 섞거나 형식이 어긋나면 거부한다
  ---
  duration_ms: 0.295875
  type: 'test'
  ...
# Subtest: 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다
ok 113 - 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다
  ---
  duration_ms: 0.038042
  type: 'test'
  ...
# Subtest: 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다
ok 114 - 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다
  ---
  duration_ms: 0.252583
  type: 'test'
  ...
# Subtest: A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1)
ok 115 - A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1)
  ---
  duration_ms: 2.763333
  type: 'test'
  ...
# Subtest: opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2)
ok 116 - opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2)
  ---
  duration_ms: 1.607708
  type: 'test'
  ...
# Subtest: subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2)
ok 117 - subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2)
  ---
  duration_ms: 0.30325
  type: 'test'
  ...
# Subtest: ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2)
ok 118 - ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2)
  ---
  duration_ms: 0.1435
  type: 'test'
  ...
# Subtest: 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2)
ok 119 - 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2)
  ---
  duration_ms: 0.981667
  type: 'test'
  ...
# Subtest: all generation preserves each contract path and loads actual shared/output prompts
ok 120 - all generation preserves each contract path and loads actual shared/output prompts
  ---
  duration_ms: 28.386333
  type: 'test'
  ...
# Subtest: single slot sends only its photo and rejects other photo, position, user state or foreign evidence
ok 121 - single slot sends only its photo and rejects other photo, position, user state or foreign evidence
  ---
  duration_ms: 7.8395
  type: 'test'
  ...
# Subtest: invalid input, missing key and HTTP method fail without provider calls
ok 122 - invalid input, missing key and HTTP method fail without provider calls
  ---
  duration_ms: 3.08375
  type: 'test'
  ...
# Subtest: HTTP full/slot success uses the shared runtime contract without caching
ok 123 - HTTP full/slot success uses the shared runtime contract without caching
  ---
  duration_ms: 3.717709
  type: 'test'
  ...
# Subtest: timeout, malformed provider JSON and model contract violations use honest HTTP errors
ok 124 - timeout, malformed provider JSON and model contract violations use honest HTTP errors
  ---
  duration_ms: 27.407333
  type: 'test'
  ...
# Subtest: contract fixtures cover identities, photo-only, corrected, three states and all omitted
ok 125 - contract fixtures cover identities, photo-only, corrected, three states and all omitted
  ---
  duration_ms: 3.732792
  type: 'test'
  ...
# Subtest: request boundaries reject foreign IDs, bad versions, false photo targets and mixed identities
ok 126 - request boundaries reject foreign IDs, bad versions, false photo targets and mixed identities
  ---
  duration_ms: 1.09025
  type: 'test'
  ...
# Subtest: generation all and single-slot responses keep the requested original photo and position
ok 127 - generation all and single-slot responses keep the requested original photo and position
  ---
  duration_ms: 1.559208
  type: 'test'
  ...
# Subtest: current post evidence resolves to a separate supplied photo set
ok 128 - current post evidence resolves to a separate supplied photo set
  ---
  duration_ms: 4.28075
  type: 'test'
  ...
# Subtest: actual JPEG/PNG/WebP metadata, MIME and byte/dimension limits are checked
ok 129 - actual JPEG/PNG/WebP metadata, MIME and byte/dimension limits are checked
  ---
  duration_ms: 14.52325
  type: 'test'
  ...
# Subtest: JSON byte limit applies without Content-Length; invalid JSON/errors never become success
ok 130 - JSON byte limit applies without Content-Length; invalid JSON/errors never become success
  ---
  duration_ms: 11.513
  type: 'test'
  ...
# Subtest: missing key reports heuristic route and direct model calls fail without network
ok 131 - missing key reports heuristic route and direct model calls fail without network
  ---
  duration_ms: 0.833625
  type: 'test'
  ...
# Subtest: wire format carries exactly one image and returns observed usage/model/time
ok 132 - wire format carries exactly one image and returns observed usage/model/time
  ---
  duration_ms: 13.124
  type: 'test'
  ...
# Subtest: 429/529 retry once; auth errors never retry or expose provider body
ok 133 - 429/529 retry once; auth errors never retry or expose provider body
  ---
  duration_ms: 304.889041
  type: 'test'
  ...
# Subtest: deadline bounds discovery and stalled response parsing; no network retry
ok 134 - deadline bounds discovery and stalled response parsing; no network retry
  ---
  duration_ms: 23.08225
  type: 'test'
  ...
# Subtest: refusal, truncation, malformed JSON and non-object responses fail explicitly
ok 135 - refusal, truncation, malformed JSON and non-object responses fail explicitly
  ---
  duration_ms: 1.389125
  type: 'test'
  ...
# Subtest: key alone activates production client and loaded prompt; invalid response is not cached
ok 136 - key alone activates production client and loaded prompt; invalid response is not cached
  ---
  duration_ms: 2.908917
  type: 'test'
  ...
# Subtest: HTTP exposes model contract failure instead of returning heuristic success
ok 137 - HTTP exposes model contract failure instead of returning heuristic success
  ---
  duration_ms: 0.756417
  type: 'test'
  ...
# Subtest: key-present SVG is an explicit 415 from the production HTTP client, with no network
ok 138 - key-present SVG is an explicit 415 from the production HTTP client, with no network
  ---
  duration_ms: 1.121583
  type: 'test'
  ...
# Subtest: thinking 블록이 앞에 와도 text 블록 하나를 읽는다
ok 139 - thinking 블록이 앞에 와도 text 블록 하나를 읽는다
  ---
  duration_ms: 0.31475
  type: 'test'
  ...
# Subtest: text 블록이 없거나 둘 이상이면 실패한다
ok 140 - text 블록이 없거나 둘 이상이면 실패한다
  ---
  duration_ms: 0.451709
  type: 'test'
  ...
# Subtest: 워크스페이스 ID 가 있으면 헤더로 보내고 없으면 보내지 않는다
ok 141 - 워크스페이스 ID 가 있으면 헤더로 보내고 없으면 보내지 않는다
  ---
  duration_ms: 0.306875
  type: 'test'
  ...
# Subtest: a tie caused by opener bonus explains total score rather than unequal direction scores
ok 142 - a tie caused by opener bonus explains total score rather than unequal direction scores
  ---
  duration_ms: 9.938541
  type: 'test'
  ...
# Subtest: measured fixture itself satisfies the PhotoAnalysis contract
ok 143 - measured fixture itself satisfies the PhotoAnalysis contract
  ---
  duration_ms: 2.155875
  type: 'test'
  ...
# Subtest: 3 photos produce 3 slots covering positions 1..3 exactly once
ok 144 - 3 photos produce 3 slots covering positions 1..3 exactly once
  ---
  duration_ms: 4.141542
  type: 'test'
  ...
# Subtest: 15 photos produce 15 slots covering positions 1..15 exactly once
ok 145 - 15 photos produce 15 slots covering positions 1..15 exactly once
  ---
  duration_ms: 2.848333
  type: 'test'
  ...
# Subtest: 20 photos produce 20 slots covering positions 1..20 exactly once
ok 146 - 20 photos produce 20 slots covering positions 1..20 exactly once
  ---
  duration_ms: 7.994208
  type: 'test'
  ...
# Subtest: every eval invariant except the F3 export one passes on a generated feed
ok 147 - every eval invariant except the F3 export one passes on a generated feed
  ---
  duration_ms: 5.272
  type: 'test'
  ...
# Subtest: no slot is justified by rules alone, and every photo evidence resolves to its own slot
ok 148 - no slot is justified by rules alone, and every photo evidence resolves to its own slot
  ---
  duration_ms: 3.662709
  type: 'test'
  ...
# Subtest: rationales never speak of scale, absent faces or "여백"
ok 149 - rationales never speak of scale, absent faces or "여백"
  ---
  duration_ms: 1.75025
  type: 'test'
  ...
# Subtest: two target profiles order the same photos differently
ok 150 - two target profiles order the same photos differently
  ---
  duration_ms: 6.850542
  type: 'test'
  ...
# Subtest: two profiles that agree on direction collide at R1, and the measured palette splits them
ok 151 - two profiles that agree on direction collide at R1, and the measured palette splits them
  ---
  duration_ms: 7.811375
  type: 'test'
  ...
# Subtest: the same input produces byte-identical output
ok 152 - the same input produces byte-identical output
  ---
  duration_ms: 4.427375
  type: 'test'
  ...
# Subtest: an absent current profile ends normally as target_only
ok 153 - an absent current profile ends normally as target_only
  ---
  duration_ms: 0.384042
  type: 'test'
  ...
# Subtest: a present current profile is reported but not yet used to correct
ok 154 - a present current profile is reported but not yet used to correct
  ---
  duration_ms: 0.436541
  type: 'test'
  ...
# Subtest: caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
ok 155 - caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
  ---
  duration_ms: 1.570417
  type: 'test'
  ...
# Subtest: carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
ok 156 - carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
  ---
  duration_ms: 5.714708
  type: 'test'
  ...
# Subtest: a bonus that flipped the opener is named as the reason, not hidden behind the measurement
ok 157 - a bonus that flipped the opener is named as the reason, not hidden behind the measurement
  ---
  duration_ms: 2.425542
  type: 'test'
  ...
# Subtest: photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
ok 158 - photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
  ---
  duration_ms: 0.812959
  type: 'test'
  ...
# Subtest: rejects inputs the contract cannot accept instead of guessing
ok 159 - rejects inputs the contract cannot accept instead of guessing
  ---
  duration_ms: 0.909625
  type: 'test'
  ...
# Subtest: output prompts reference one shared style guard without copied banned lists
ok 160 - output prompts reference one shared style guard without copied banned lists
  ---
  duration_ms: 20.335292
  type: 'test'
  ...
# Subtest: manual examples match photo facts and original slots without banned language
ok 161 - manual examples match photo facts and original slots without banned language
  ---
  duration_ms: 15.755625
  type: 'test'
  ...
# Subtest: hidden SVG roots and invalid numeric entities fail without invented observations
ok 162 - hidden SVG roots and invalid numeric entities fail without invented observations
  ---
  duration_ms: 1.882375
  type: 'test'
  ...
# Subtest: JPEG invalid headers are rejected before allocating pixel grids
ok 163 - JPEG invalid headers are rejected before allocating pixel grids
  ---
  duration_ms: 5.951208
  type: 'test'
  ...
# Subtest: returned facts and measurement cannot mutate later cache hits
ok 164 - returned facts and measurement cannot mutate later cache hits
  ---
  duration_ms: 4.423292
  type: 'test'
  ...
# Subtest: heuristic output satisfies the PhotoAnalysis contract and is deterministic
ok 165 - heuristic output satisfies the PhotoAnalysis contract and is deterministic
  ---
  duration_ms: 4.580834
  type: 'test'
  ...
# Subtest: heuristic never reports a subject, place, time or mood — only measured values
ok 166 - heuristic never reports a subject, place, time or mood — only measured values
  ---
  duration_ms: 3.754458
  type: 'test'
  ...
# Subtest: selected model failure is explicit and never cached
ok 167 - selected model failure is explicit and never cached
  ---
  duration_ms: 1.024416
  type: 'test'
  ...
# Subtest: model observations are accepted but measured color overrides the model estimate
ok 168 - model observations are accepted but measured color overrides the model estimate
  ---
  duration_ms: 0.582583
  type: 'test'
  ...
# Subtest: contract violations fail before correction and never enter cache
ok 169 - contract violations fail before correction and never enter cache
  ---
  duration_ms: 1.092375
  type: 'test'
  ...
# Subtest: key/model namespaces separate heuristic and model cache; callers cannot poison cached facts
ok 170 - key/model namespaces separate heuristic and model cache; callers cannot poison cached facts
  ---
  duration_ms: 0.339375
  type: 'test'
  ...
# Subtest: same bytes twice: zero extra model calls, identity re-stamped, duplicate reported
ok 171 - same bytes twice: zero extra model calls, identity re-stamped, duplicate reported
  ---
  duration_ms: 0.181916
  type: 'test'
  ...
# Subtest: cache is bounded and holds no more than CACHE_LIMIT entries
ok 172 - cache is bounded and holds no more than CACHE_LIMIT entries
  ---
  duration_ms: 2.3045
  type: 'test'
  ...
# Subtest: unobservable bytes fail honestly instead of inventing color
ok 173 - unobservable bytes fail honestly instead of inventing color
  ---
  duration_ms: 1.673625
  type: 'test'
  ...
# Subtest: jpeg DC reader returns a real block grid and rejects what it cannot read
ok 174 - jpeg DC reader returns a real block grid and rejects what it cannot read
  ---
  duration_ms: 0.471958
  type: 'test'
  ...
# Subtest: baseline JPEG is measured, not mis-read: solid colours are exact
ok 175 - baseline JPEG is measured, not mis-read: solid colours are exact
  ---
  duration_ms: 3.877959
  type: 'test'
  ...
# Subtest: baseline and progressive encodings of the same pixels agree
ok 176 - baseline and progressive encodings of the same pixels agree
  ---
  duration_ms: 2.594667
  type: 'test'
  ...
# Subtest: SVG is measured only as the flat-colour card it claims to support
ok 177 - SVG is measured only as the flat-colour card it claims to support
  ---
  duration_ms: 0.351875
  type: 'test'
  ...
# Subtest: SVG text is reported only when a viewer could see it, and unescaped
ok 178 - SVG text is reported only when a viewer could see it, and unescaped
  ---
  duration_ms: 0.310792
  type: 'test'
  ...
# Subtest: composition is a documented constant, not a reading of the colour histogram
ok 179 - composition is a documented constant, not a reading of the colour histogram
  ---
  duration_ms: 1.498167
  type: 'test'
  ...
# Subtest: POST one photo returns one PhotoAnalysis
ok 180 - POST one photo returns one PhotoAnalysis
  ---
  duration_ms: 0.399625
  type: 'test'
  ...
# Subtest: there is no many-photos-per-request path
ok 181 - there is no many-photos-per-request path
  ---
  duration_ms: 0.150333
  type: 'test'
  ...
# Subtest: request validation is explicit at the trust boundary
ok 182 - request validation is explicit at the trust boundary
  ---
  duration_ms: 61.001541
  type: 'test'
  ...
# Subtest: data URL prefixes are accepted, not silently mangled
ok 183 - data URL prefixes are accepted, not silently mangled
  ---
  duration_ms: 0.334583
  type: 'test'
  ...
# Subtest: the heuristic path makes zero outbound attempts with the network disabled
ok 184 - the heuristic path makes zero outbound attempts with the network disabled
  ---
  duration_ms: 71.780417
  type: 'test'
  ...
# Subtest: W5: the observation schema sent to the model uses no rejected array keywords
ok 185 - W5: the observation schema sent to the model uses no rejected array keywords
  ---
  duration_ms: 0.381708
  type: 'test'
  ...
# Subtest: 3/20 actual input IDs survive photo-only and heuristic target/current paths without invented spatial observations
ok 186 - 3/20 actual input IDs survive photo-only and heuristic target/current paths without invented spatial observations
  ---
  duration_ms: 11.159958
  type: 'test'
  ...
# Subtest: model observations use composed ordering and preserve current-post evidence references
ok 187 - model observations use composed ordering and preserve current-post evidence references
  ---
  duration_ms: 1.945
  type: 'test'
  ...
# Subtest: prepared references are exact and unprepared URLs never become another account
ok 188 - prepared references are exact and unprepared URLs never become another account
  ---
  duration_ms: 18.338416
  type: 'test'
  ...
# Subtest: mock upload reads actual JPEG/PNG/WebP pixels, preserving ID and disabling provider even with a key
ok 189 - mock upload reads actual JPEG/PNG/WebP pixels, preserving ID and disabling provider even with a key
  ---
  duration_ms: 8.537542
  type: 'test'
  ...
# Subtest: invalid upload and feed stay errors rather than empty successes
ok 190 - invalid upload and feed stay errors rather than empty successes
  ---
  duration_ms: 1.370292
  type: 'test'
  ...
# Subtest: heuristic defaults are not promoted to observed composition, scale or opener habits
ok 191 - heuristic defaults are not promoted to observed composition, scale or opener habits
  ---
  duration_ms: 9.557542
  type: 'test'
  ...
# Subtest: both input paths produce the same TargetProfile schema with their own source
ok 192 - both input paths produce the same TargetProfile schema with their own source
  ---
  duration_ms: 0.535292
  type: 'test'
  ...
# Subtest: what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence
ok 193 - what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence
  ---
  duration_ms: 0.28175
  type: 'test'
  ...
# Subtest: E1: every Claim in both profiles and the photo plan carries at least one evidence
ok 194 - E1: every Claim in both profiles and the photo plan carries at least one evidence
  ---
  duration_ms: 0.205542
  type: 'test'
  ...
# Subtest: no profile item is made of rule evidence alone
ok 195 - no profile item is made of rule evidence alone
  ---
  duration_ms: 0.123167
  type: 'test'
  ...
# Subtest: a free text mapping cites the matched phrase and the mapping row separately
ok 196 - a free text mapping cites the matched phrase and the mapping row separately
  ---
  duration_ms: 0.131792
  type: 'test'
  ...
# Subtest: an aggregate value can be traced back to the posts it was read from
ok 197 - an aggregate value can be traced back to the posts it was read from
  ---
  duration_ms: 0.058458
  type: 'test'
  ...
# Subtest: free text never invents an empty caption ratio and never rounds up to a default
ok 198 - free text never invents an empty caption ratio and never rounds up to a default
  ---
  duration_ms: 0.205208
  type: 'test'
  ...
# Subtest: free text is the floor that always succeeds, but blank input is not natural language
ok 199 - free text is the floor that always succeeds, but blank input is not natural language
  ---
  duration_ms: 0.154208
  type: 'test'
  ...
# Subtest: an unprepared URL fails and names the fallbacks instead of borrowing another account
ok 200 - an unprepared URL fails and names the fallbacks instead of borrowing another account
  ---
  duration_ms: 0.368375
  type: 'test'
  ...
# Subtest: the photo only path returns a plan, never a TargetProfile with an undefined absent state
ok 201 - the photo only path returns a plan, never a TargetProfile with an undefined absent state
  ---
  duration_ms: 0.273666
  type: 'test'
  ...
# Subtest: the photo only path claims no preference and no sentence
ok 202 - the photo only path claims no preference and no sentence
  ---
  duration_ms: 0.103625
  type: 'test'
  ...
# Subtest: the photo plan aggregates only what a photo can show, and the mixes stay exact
ok 203 - the photo plan aggregates only what a photo can show, and the mixes stay exact
  ---
  duration_ms: 2.524625
  type: 'test'
  ...
# Subtest: boundary: an all blank snapshot yields no language and a carousel free one yields no opener
ok 204 - boundary: an all blank snapshot yields no language and a carousel free one yields no opener
  ---
  duration_ms: 0.209
  type: 'test'
  ...
# Subtest: the two golden profiles differ in a way a reader can see
ok 205 - the two golden profiles differ in a way a reader can see
  ---
  duration_ms: 11.5385
  type: 'test'
  ...
# Subtest: H1: a negated or contrasted wish is left empty, never flipped into a positive one
ok 206 - H1: a negated or contrasted wish is left empty, never flipped into a positive one
  ---
  duration_ms: 0.413625
  type: 'test'
  ...
# Subtest: H1 control: a plainly positive wish still fills the same fields it always did
ok 207 - H1 control: a plainly positive wish still fills the same fields it always did
  ---
  duration_ms: 0.154959
  type: 'test'
  ...
# Subtest: H2: editing a returned profile never changes what the next call returns
ok 208 - H2: editing a returned profile never changes what the next call returns
  ---
  duration_ms: 5.409333
  type: 'test'
  ...
# Subtest: H3: profile evidence must resolve to the actual input, not merely exist
ok 209 - H3: profile evidence must resolve to the actual input, not merely exist
  ---
  duration_ms: 0.742459
  type: 'test'
  ...
1..209
# tests 209
# suites 0
# pass 209
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 830.207292
```

</details>

<details>
<summary>npm run eval — exit 0</summary>

```text

> gyeol@0.1.0 eval
> node eval/run.js

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
quiet broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
quiet broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_01
┌─────────┬──────────┬───────────┬────────┬────────┐
│ (index) │ case     │ invariant │ result │ reason │
├─────────┼──────────┼───────────┼────────┼────────┤
│ 0       │ 'detail' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'detail' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'detail' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'detail' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'detail' │ 'E8'      │ 'PASS' │ ''     │
│ 5       │ 'detail' │ 'E9'      │ 'PASS' │ ''     │
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

</details>

<details>
<summary>npm run check — exit 0</summary>

```text

> gyeol@0.1.0 check
> node scripts/check.js

PASS: 69 JS/JSON files checked; four schema examples match fixtures. Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```

</details>

<details>
<summary>npm run lint — exit 0</summary>

```text

> gyeol@0.1.0 lint
> biome check .

Checked 41 files in 26ms. No fixes applied.
```

</details>

<details>
<summary>npm run typecheck — exit 0</summary>

```text

> gyeol@0.1.0 typecheck
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
```

</details>

## 검증 한계와 인계

- 화면 담당: `/api/ingest`는 서버 간 키로 보호된 선택 경로다. 브라우저에 키를 넣지 말고 사용자별 인증·요청량 제한·라이브 고지·폴링·feed 연결을 구현해야 한다. 이 PR은 UI를 변경하지 않는다.
- 원재님이 하실 것: 운영용 APIFY_TOKEN·APIFY_INGEST_ACCESS_KEY·별도 APIFY_INGEST_RECEIPT_SECRET을 서버 환경에 설정하고 월간 예산을 결정한다. 로컬 CLI 인증은 배포 인증이 아니다.
- 배포·Preview/Production 실요청과 실제 기기 UI 확인은 미실행. 로컬 HTTP 핸들러 실행과 혼동하지 않는다.
- 실행당 최대 요청 30건·USD 0.10은 여러 번 start의 합계 예산을 제한하지 않는다. 키를 가진 서버만 호출할 수 있으며 공개 브라우저 API로 열지 않는다.
- 전체 계정 게시물 완전성·임의 계정 성공률·AI 취향 추출 품질·사진 분석 품질은 검증하지 않았다.
- eval은 기존 합성 데이터 불변식 검사다. 실수집 성공 증거는 독립적인 제공자 run 응답과 저장된 evidence이며 eval 점수를 실제 품질로 사용하지 않는다.
- 리뷰와 후속 수정 내역은 [review.md](review.md)에 기록한다. 이슈 자동 종료·merge·배포는 하지 않는다.

## CLI 재개 출력

같은 receipt로 `node scripts/ingest-instagram.js status .tmp/apify-68`을 실행했다. 새 유료 실행은 만들지 않았다.

```json
{
  "status": "SUCCEEDED",
  "metrics": {
    "observed_at": "2026-09-18T01:28:28.395Z",
    "provisional": false,
    "run_id": "h9dl4E9wmvW8wYaUa",
    "build_id": "HFnaHhQGkDXjgZHDp",
    "started_at": "2026-09-18T01:20:35.213Z",
    "finished_at": "2026-09-18T01:20:51.119Z",
    "duration_seconds": 15.74,
    "usage_total_usd": 0.0081
  },
  "posts": 3,
  "current_sample_size": 3,
  "target_sample_size": 3
}
```

## sip 검토

- factchk: Actor·상한·실행 지표를 spec의 공식 문서와 인증된 실응답으로 확인했다. 제공자 문서가 완료 직후 비용/통계가 잠정값일 수 있다고 명시하므로 provisional과 후속 조회를 구현했다.
- mandela: 합성 실패 fixture는 분류 규칙의 회귀 검사이며 제공자의 실제 비공개/없는 계정 동작 증명이 아니다. 실제 공개 계정 run과 기존 수집 fixture를 따로 기록해 순환 검증을 피했다. 사진 품질·프로필 취향 정확도는 검증 주장에 포함하지 않는다.
- ssotize(읽기 전용): Actor 정책의 원천은 ADR-0006, 실행 상한의 원천은 lib/apify_ingest.js의 LIMITS, 기존 프로필 계약은 schemas다. 이름 검색과 정책/오류 코드 검색으로 재확인했으며 기존 파일과 충돌하는 계약 변경은 없다. 통합·이동은 수행하지 않았다.
- re0: 오류 코드, 호출/저장 계약, 별도 서명 키, 잠정 비용 처리와 실제 화면 연결 한계를 spec 본문에 통합했다.
- detool: 이 문서는 Apify 운영 계약이며 도구 독립성을 주장하지 않으므로 생략했다.
