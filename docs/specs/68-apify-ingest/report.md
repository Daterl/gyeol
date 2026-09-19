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

기존 fixture 검사는 작업공간의 읽기 전용 형제 폴더 `pivot/apify-check/fixtures/ig_feed_29cm.json`을 읽기 전용으로 사용했다. 새 수집과 다른 데이터임을 구분한다.

```json
{
  "http_status": 200,
  "status": "SUCCEEDED",
  "metrics": {
    "observed_at": "2026-09-18T01:32:23.531Z",
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
  duration_ms: 26.376209
  type: 'test'
  ...
# Subtest: live is explicit error, invalid query and method are controlled
ok 2 - live is explicit error, invalid query and method are controlled
  ---
  duration_ms: 0.778666
  type: 'test'
  ...
# Subtest: mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts
ok 3 - mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts
  ---
  duration_ms: 173.2295
  type: 'test'
  ...
# Subtest: strict account URLs only; never arbitrary hosts or post/comment endpoints
ok 4 - strict account URLs only; never arbitrary hosts or post/comment endpoints
  ---
  duration_ms: 0.700541
  type: 'test'
  ...
# Subtest: normalization preserves Unicode, child IDs/order/types, separates comments/tags/dates and leaves unknown fields empty
ok 5 - normalization preserves Unicode, child IDs/order/types, separates comments/tags/dates and leaves unknown fields empty
  ---
  duration_ms: 8.336333
  type: 'test'
  ...
# Subtest: both existing extractors consume same snapshot and every observation reference resolves
ok 6 - both existing extractors consume same snapshot and every observation reference resolves
  ---
  duration_ms: 3.445458
  type: 'test'
  ...
# Subtest: confirmed private, nonexistent, access unavailable and unknown responses are distinct
ok 7 - confirmed private, nonexistent, access unavailable and unknown responses are distinct
  ---
  duration_ms: 0.277083
  type: 'test'
  ...
# Subtest: missing observations, mixed errors, duplicate posts or wrong accounts cannot become success
ok 8 - missing observations, mixed errors, duplicate posts or wrong accounts cannot become success
  ---
  duration_ms: 0.218625
  type: 'test'
  ...
# Subtest: start pins actor/posts mode and hard limits; known private and invalid limits perform zero calls
ok 9 - start pins actor/posts mode and hard limits; known private and invalid limits perform zero calls
  ---
  duration_ms: 19.968666
  type: 'test'
  ...
# Subtest: asynchronous completion supplies real run metrics and both profiles
ok 10 - asynchronous completion supplies real run metrics and both profiles
  ---
  duration_ms: 1.14675
  type: 'test'
  ...
# Subtest: signed receipts prevent foreign-run requests and survive creating a new client
ok 11 - signed receipts prevent foreign-run requests and survive creating a new client
  ---
  duration_ms: 0.658667
  type: 'test'
  ...
# Subtest: ambiguous paid starts never retry; reads retry at most once
ok 12 - ambiguous paid starts never retry; reads retry at most once
  ---
  duration_ms: 1.033416
  type: 'test'
  ...
# Subtest: provider timeout/budget failure preserve receipt and measurements
ok 13 - provider timeout/budget failure preserve receipt and measurements
  ---
  duration_ms: 2.183291
  type: 'test'
  ...
# Subtest: cancel preserves receipt; late completed run is not discarded
ok 14 - cancel preserves receipt; late completed run is not discarded
  ---
  duration_ms: 1.934833
  type: 'test'
  ...
# Subtest: HTTP requires server access key and explicit paid acknowledgement; never silently starts by default
ok 15 - HTTP requires server access key and explicit paid acknowledgement; never silently starts by default
  ---
  duration_ms: 2.048458
  type: 'test'
  ...
# Subtest: cancel on an already completed run performs no abort request
ok 16 - cancel on an already completed run performs no abort request
  ---
  duration_ms: 0.502542
  type: 'test'
  ...
# Subtest: failed abort racing completion retains the completed result
ok 17 - failed abort racing completion retains the completed result
  ---
  duration_ms: 0.423208
  type: 'test'
  ...
# Subtest: malformed receipt signatures fail closed even with multibyte characters
ok 18 - malformed receipt signatures fail closed even with multibyte characters
  ---
  duration_ms: 0.113834
  type: 'test'
  ...
# Subtest: unknown costs stay null and empty completed datasets are not live successes
ok 19 - unknown costs stay null and empty completed datasets are not live successes
  ---
  duration_ms: 0.188542
  type: 'test'
  ...
# Subtest: malformed or unsupported carousel media cannot become successful observations
ok 20 - malformed or unsupported carousel media cannot become successful observations
  ---
  duration_ms: 0.086125
  type: 'test'
  ...
# Subtest: completed-run billing remains provisional until re-observed after ten seconds
ok 21 - completed-run billing remains provisional until re-observed after ten seconds
  ---
  duration_ms: 1.811
  type: 'test'
  ...
# Subtest: API access key alone cannot forge receipts signed with separate server secret
ok 22 - API access key alone cannot forge receipts signed with separate server secret
  ---
  duration_ms: 0.207333
  type: 'test'
  ...
# Subtest: requested URL alone cannot attribute a foreign owner post to the requested account
ok 23 - requested URL alone cannot attribute a foreign owner post to the requested account
  ---
  duration_ms: 0.05875
  type: 'test'
  ...
# Subtest: provider hidden errors are preserved through dataset retrieval and classified
ok 24 - provider hidden errors are preserved through dataset retrieval and classified
  ---
  duration_ms: 0.487375
  type: 'test'
  ...
# Subtest: post IDs and shortcodes have independent duplicate namespaces
ok 25 - post IDs and shortcodes have independent duplicate namespaces
  ---
  duration_ms: 0.076541
  type: 'test'
  ...
# Subtest: abort failure preserves the valid receipt for later inspection
ok 26 - abort failure preserves the valid receipt for later inspection
  ---
  duration_ms: 0.262333
  type: 'test'
  ...
# Subtest: provider 429 does not trigger a second request or lose its budget classification
ok 27 - provider 429 does not trigger a second request or lose its budget classification
  ---
  duration_ms: 0.119916
  type: 'test'
  ...
# Subtest: missing run completion time stays unknown rather than becoming collection time now
ok 28 - missing run completion time stays unknown rather than becoming collection time now
  ---
  duration_ms: 0.672458
  type: 'test'
  ...
# Subtest: HTTP status/cancel/method and streamed input bound are enforced without paid calls
ok 29 - HTTP status/cancel/method and streamed input bound are enforced without paid calls
  ---
  duration_ms: 0.910375
  type: 'test'
  ...
# Subtest: 120/18 yields one evidenced delta, 47 chars and honest correction
ok 30 - 120/18 yields one evidenced delta, 47 chars and honest correction
  ---
  duration_ms: 9.64625
  type: 'test'
  ...
# Subtest: boundary 0/120: 10
ok 31 - boundary 0/120: 10
  ---
  duration_ms: 4.350583
  type: 'test'
  ...
# Subtest: boundary 120/0: 10
ok 32 - boundary 120/0: 10
  ---
  duration_ms: 1.438292
  type: 'test'
  ...
# Subtest: boundary 18/120: 47
ok 33 - boundary 18/120: 47
  ---
  duration_ms: 7.43825
  type: 'test'
  ...
# Subtest: boundary 0/0: 0
ok 34 - boundary 0/0: 0
  ---
  duration_ms: 2.381042
  type: 'test'
  ...
# Subtest: boundary 1/2: 1
ok 35 - boundary 1/2: 1
  ---
  duration_ms: 1.478375
  type: 'test'
  ...
# Subtest: boundary 120/120: 120
ok 36 - boundary 120/120: 120
  ---
  duration_ms: 0.689708
  type: 'test'
  ...
# Subtest: absent current completes pipeline and E8 with no delta
ok 37 - absent current completes pipeline and E8 with no delta
  ---
  duration_ms: 3.7785
  type: 'test'
  ...
# Subtest: missing caption measurement is not a fabricated gap
ok 38 - missing caption measurement is not a fabricated gap
  ---
  duration_ms: 3.605
  type: 'test'
  ...
# Subtest: invalid or unevidenced profiles are rejected
ok 39 - invalid or unevidenced profiles are rejected
  ---
  duration_ms: 1.721
  type: 'test'
  ...
# Subtest: same measured photos and different targets change position-sorted photo IDs
ok 40 - same measured photos and different targets change position-sorted photo IDs
  ---
  duration_ms: 3.295125
  type: 'test'
  ...
# Subtest: four sample types and independent golden input files satisfy contracts
ok 41 - four sample types and independent golden input files satisfy contracts
  ---
  duration_ms: 78.907334
  type: 'test'
  ...
# Subtest: E1: valid input passes and stored broken fixture fails
ok 42 - E1: valid input passes and stored broken fixture fails
  ---
  duration_ms: 3.965125
  type: 'test'
  ...
# Subtest: E2: valid input passes and stored broken fixture fails
ok 43 - E2: valid input passes and stored broken fixture fails
  ---
  duration_ms: 10.615458
  type: 'test'
  ...
# Subtest: E3: valid input passes and stored broken fixture fails
ok 44 - E3: valid input passes and stored broken fixture fails
  ---
  duration_ms: 6.503291
  type: 'test'
  ...
# Subtest: E6: valid input passes and stored broken fixture fails
ok 45 - E6: valid input passes and stored broken fixture fails
  ---
  duration_ms: 3.775584
  type: 'test'
  ...
# Subtest: E8: valid input passes and stored broken fixture fails
ok 46 - E8: valid input passes and stored broken fixture fails
  ---
  duration_ms: 3.855
  type: 'test'
  ...
# Subtest: E9: valid input passes and stored broken fixture fails
ok 47 - E9: valid input passes and stored broken fixture fails
  ---
  duration_ms: 1.559708
  type: 'test'
  ...
# Subtest: E10: valid input passes and stored broken fixture fails
ok 48 - E10: valid input passes and stored broken fixture fails
  ---
  duration_ms: 1.792292
  type: 'test'
  ...
# Subtest: E11: valid input passes and stored broken fixture fails
ok 49 - E11: valid input passes and stored broken fixture fails
  ---
  duration_ms: 3.601333
  type: 'test'
  ...
# Subtest: 3 photo boundary passes
ok 50 - 3 photo boundary passes
  ---
  duration_ms: 0.513667
  type: 'test'
  ...
# Subtest: 20 photo boundary passes
ok 51 - 20 photo boundary passes
  ---
  duration_ms: 0.461208
  type: 'test'
  ...
# Subtest: 2 input photos rejected
ok 52 - 2 input photos rejected
  ---
  duration_ms: 0.1175
  type: 'test'
  ...
# Subtest: 21 input photos rejected
ok 53 - 21 input photos rejected
  ---
  duration_ms: 0.029167
  type: 'test'
  ...
# Subtest: reject duplicate output ID despite true flag
ok 54 - reject duplicate output ID despite true flag
  ---
  duration_ms: 2.163041
  type: 'test'
  ...
# Subtest: reject missing slot despite declared output count
ok 55 - reject missing slot despite declared output count
  ---
  duration_ms: 0.511959
  type: 'test'
  ...
# Subtest: reject foreign replacement ID with same count
ok 56 - reject foreign replacement ID with same count
  ---
  duration_ms: 0.235958
  type: 'test'
  ...
# Subtest: reject lying counts
ok 57 - reject lying counts
  ---
  duration_ms: 0.182167
  type: 'test'
  ...
# Subtest: reject count string
ok 58 - reject count string
  ---
  duration_ms: 0.119875
  type: 'test'
  ...
# Subtest: reject unique flag string
ok 59 - reject unique flag string
  ---
  duration_ms: 0.151125
  type: 'test'
  ...
# Subtest: reject position string
ok 60 - reject position string
  ---
  duration_ms: 0.137375
  type: 'test'
  ...
# Subtest: reject duplicate position
ok 61 - reject duplicate position
  ---
  duration_ms: 0.076875
  type: 'test'
  ...
# Subtest: reject zero position
ok 62 - reject zero position
  ---
  duration_ms: 0.061625
  type: 'test'
  ...
# Subtest: reject fractional position
ok 63 - reject fractional position
  ---
  duration_ms: 0.058375
  type: 'test'
  ...
# Subtest: reject missing rationale Claim
ok 64 - reject missing rationale Claim
  ---
  duration_ms: 0.092542
  type: 'test'
  ...
# Subtest: reject evidence missing
ok 65 - reject evidence missing
  ---
  duration_ms: 0.093709
  type: 'test'
  ...
# Subtest: reject evidence wrong type
ok 66 - reject evidence wrong type
  ---
  duration_ms: 0.078542
  type: 'test'
  ...
# Subtest: reject invalid confidence
ok 67 - reject invalid confidence
  ---
  duration_ms: 0.220834
  type: 'test'
  ...
# Subtest: reject empty evidence reference
ok 68 - reject empty evidence reference
  ---
  duration_ms: 0.462166
  type: 'test'
  ...
# Subtest: reject overlap string
ok 69 - reject overlap string
  ---
  duration_ms: 0.336584
  type: 'test'
  ...
# Subtest: reject invented current input
ok 70 - reject invented current input
  ---
  duration_ms: 0.223708
  type: 'test'
  ...
# Subtest: reject false corrected claim
ok 71 - reject false corrected claim
  ---
  duration_ms: 0.471792
  type: 'test'
  ...
# Subtest: reject unknown delta
ok 72 - reject unknown delta
  ---
  duration_ms: 0.18
  type: 'test'
  ...
# Subtest: duplicate/malformed actual input rejected
ok 73 - duplicate/malformed actual input rejected
  ---
  duration_ms: 0.3165
  type: 'test'
  ...
# Subtest: E2 does not trust output input_count/unique flags as expected input IDs
ok 74 - E2 does not trust output input_count/unique flags as expected input IDs
  ---
  duration_ms: 1.101584
  type: 'test'
  ...
# Subtest: E8 uses actual absent input even if response invents consistent correction
ok 75 - E8 uses actual absent input even if response invents consistent correction
  ---
  duration_ms: 0.575709
  type: 'test'
  ...
# Subtest: validateFeed rejects missing current context with target-only disclosure
ok 76 - validateFeed rejects missing current context with target-only disclosure
  ---
  duration_ms: 0.170167
  type: 'test'
  ...
# Subtest: E8 rejects missing current context with target-only disclosure
ok 77 - E8 rejects missing current context with target-only disclosure
  ---
  duration_ms: 0.68575
  type: 'test'
  ...
# Subtest: validateFeed rejects undefined current context with target-only disclosure
ok 78 - validateFeed rejects undefined current context with target-only disclosure
  ---
  duration_ms: 0.095792
  type: 'test'
  ...
# Subtest: E8 rejects undefined current context with target-only disclosure
ok 79 - E8 rejects undefined current context with target-only disclosure
  ---
  duration_ms: 1.015625
  type: 'test'
  ...
# Subtest: validateFeed rejects missing current context with invented correction
ok 80 - validateFeed rejects missing current context with invented correction
  ---
  duration_ms: 0.048375
  type: 'test'
  ...
# Subtest: E8 rejects missing current context with invented correction
ok 81 - E8 rejects missing current context with invented correction
  ---
  duration_ms: 0.572958
  type: 'test'
  ...
# Subtest: validateFeed rejects undefined current context with invented correction
ok 82 - validateFeed rejects undefined current context with invented correction
  ---
  duration_ms: 0.107042
  type: 'test'
  ...
# Subtest: E8 rejects undefined current context with invented correction
ok 83 - E8 rejects undefined current context with invented correction
  ---
  duration_ms: 0.307125
  type: 'test'
  ...
# Subtest: profile absence/types/rule-only claims are checked
ok 84 - profile absence/types/rule-only claims are checked
  ---
  duration_ms: 0.556541
  type: 'test'
  ...
# Subtest: photo field types are checked
ok 85 - photo field types are checked
  ---
  duration_ms: 0.106584
  type: 'test'
  ...
# Subtest: reject title null
ok 86 - reject title null
  ---
  duration_ms: 0.041791
  type: 'test'
  ...
# Subtest: reject title []
ok 87 - reject title []
  ---
  duration_ms: 0.02275
  type: 'test'
  ...
# Subtest: reject title ["one","two"]
ok 88 - reject title ["one","two"]
  ---
  duration_ms: 0.032417
  type: 'test'
  ...
# Subtest: reject title ""
ok 89 - reject title ""
  ---
  duration_ms: 0.037792
  type: 'test'
  ...
# Subtest: reject title " "
ok 90 - reject title " "
  ---
  duration_ms: 0.018583
  type: 'test'
  ...
# Subtest: reject title "one\\ntwo"
ok 91 - reject title "one\\ntwo"
  ---
  duration_ms: 0.045542
  type: 'test'
  ...
# Subtest: reject title "one\\rtwo"
ok 92 - reject title "one\\rtwo"
  ---
  duration_ms: 0.029042
  type: 'test'
  ...
# Subtest: reject title 3
ok 93 - reject title 3
  ---
  duration_ms: 4.610292
  type: 'test'
  ...
# Subtest: reject title "one two"
ok 94 - reject title "one two"
  ---
  duration_ms: 0.103
  type: 'test'
  ...
# Subtest: F3 export retains stable identity at every position, including after reorder
ok 95 - F3 export retains stable identity at every position, including after reorder
  ---
  duration_ms: 1.6815
  type: 'test'
  ...
# Subtest: E4/E5/E7 are intentionally not automated quality checks
ok 96 - E4/E5/E7 are intentionally not automated quality checks
  ---
  duration_ms: 4.259167
  type: 'test'
  ...
# Subtest: user caption rejects photo-only evidence
ok 97 - user caption rejects photo-only evidence
  ---
  duration_ms: 1.029166
  type: 'test'
  ...
# Subtest: user caption accepts valid user_text evidence with additional photo evidence
ok 98 - user caption accepts valid user_text evidence with additional photo evidence
  ---
  duration_ms: 0.905167
  type: 'test'
  ...
# Subtest: present current can be honestly corrected with the single supported delta
ok 99 - present current can be honestly corrected with the single supported delta
  ---
  duration_ms: 1.285375
  type: 'test'
  ...
# Subtest: absent account and extra title fields cannot smuggle contradictory states
ok 100 - absent account and extra title fields cannot smuggle contradictory states
  ---
  duration_ms: 0.595958
  type: 'test'
  ...
# Subtest: validateFeed rejects an invented target profile ID
ok 101 - validateFeed rejects an invented target profile ID
  ---
  duration_ms: 1.487834
  type: 'test'
  ...
# Subtest: validateFeed and validateExport reject evidence that resolves to no input photo
ok 102 - validateFeed and validateExport reject evidence that resolves to no input photo
  ---
  duration_ms: 2.000292
  type: 'test'
  ...
# Subtest: validateFeed rejects describable_facts copied from another real photo
ok 103 - validateFeed rejects describable_facts copied from another real photo
  ---
  duration_ms: 1.636625
  type: 'test'
  ...
# Subtest: golden bundle carries its own PhotoAnalysis matching the input manifest
ok 104 - golden bundle carries its own PhotoAnalysis matching the input manifest
  ---
  duration_ms: 7.014709
  type: 'test'
  ...
# Subtest: 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다
ok 105 - 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다
  ---
  duration_ms: 7.43325
  type: 'test'
  ...
# Subtest: 부재 프로필은 target_only 공개와 정합하다 (E8)
ok 106 - 부재 프로필은 target_only 공개와 정합하다 (E8)
  ---
  duration_ms: 2.212625
  type: 'test'
  ...
# Subtest: 스냅샷 재생 경로가 source:"cached" 프로필을 만든다
ok 107 - 스냅샷 재생 경로가 source:"cached" 프로필을 만든다
  ---
  duration_ms: 3.2605
  type: 'test'
  ...
# Subtest: 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다
ok 108 - 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다
  ---
  duration_ms: 1.707375
  type: 'test'
  ...
# Subtest: 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다
ok 109 - 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다
  ---
  duration_ms: 126.144625
  type: 'test'
  ...
# Subtest: empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다
ok 110 - empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다
  ---
  duration_ms: 6.237334
  type: 'test'
  ...
# Subtest: 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다
ok 111 - 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다
  ---
  duration_ms: 2.362583
  type: 'test'
  ...
# Subtest: 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다
ok 112 - 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다
  ---
  duration_ms: 0.144959
  type: 'test'
  ...
# Subtest: opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다
ok 113 - opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다
  ---
  duration_ms: 2.545666
  type: 'test'
  ...
# Subtest: opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다
ok 114 - opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다
  ---
  duration_ms: 2.604
  type: 'test'
  ...
# Subtest: 어떤 경로에서도 문자열 '불명' 이 나오지 않는다
ok 115 - 어떤 경로에서도 문자열 '불명' 이 나오지 않는다
  ---
  duration_ms: 2.423708
  type: 'test'
  ...
# Subtest: 직접 업로드 경로가 사진 분석에서 visual 을 집계한다
ok 116 - 직접 업로드 경로가 사진 분석에서 visual 을 집계한다
  ---
  duration_ms: 0.311584
  type: 'test'
  ...
# Subtest: hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다
ok 117 - hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다
  ---
  duration_ms: 0.107625
  type: 'test'
  ...
# Subtest: 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2)
ok 118 - 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2)
  ---
  duration_ms: 1.408458
  type: 'test'
  ...
# Subtest: 입력을 섞거나 형식이 어긋나면 거부한다
ok 119 - 입력을 섞거나 형식이 어긋나면 거부한다
  ---
  duration_ms: 0.314041
  type: 'test'
  ...
# Subtest: 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다
ok 120 - 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다
  ---
  duration_ms: 0.045667
  type: 'test'
  ...
# Subtest: 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다
ok 121 - 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다
  ---
  duration_ms: 0.25775
  type: 'test'
  ...
# Subtest: A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1)
ok 122 - A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1)
  ---
  duration_ms: 2.268125
  type: 'test'
  ...
# Subtest: opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2)
ok 123 - opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2)
  ---
  duration_ms: 0.967625
  type: 'test'
  ...
# Subtest: subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2)
ok 124 - subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2)
  ---
  duration_ms: 0.253209
  type: 'test'
  ...
# Subtest: ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2)
ok 125 - ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2)
  ---
  duration_ms: 0.120625
  type: 'test'
  ...
# Subtest: 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2)
ok 126 - 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2)
  ---
  duration_ms: 0.376875
  type: 'test'
  ...
# Subtest: all generation preserves each contract path and loads actual shared/output prompts
ok 127 - all generation preserves each contract path and loads actual shared/output prompts
  ---
  duration_ms: 31.362209
  type: 'test'
  ...
# Subtest: single slot sends only its photo and rejects other photo, position, user state or foreign evidence
ok 128 - single slot sends only its photo and rejects other photo, position, user state or foreign evidence
  ---
  duration_ms: 12.496958
  type: 'test'
  ...
# Subtest: invalid input, missing key and HTTP method fail without provider calls
ok 129 - invalid input, missing key and HTTP method fail without provider calls
  ---
  duration_ms: 4.007291
  type: 'test'
  ...
# Subtest: HTTP full/slot success uses the shared runtime contract without caching
ok 130 - HTTP full/slot success uses the shared runtime contract without caching
  ---
  duration_ms: 7.056792
  type: 'test'
  ...
# Subtest: timeout, malformed provider JSON and model contract violations use honest HTTP errors
ok 131 - timeout, malformed provider JSON and model contract violations use honest HTTP errors
  ---
  duration_ms: 28.863875
  type: 'test'
  ...
# Subtest: contract fixtures cover identities, photo-only, corrected, three states and all omitted
ok 132 - contract fixtures cover identities, photo-only, corrected, three states and all omitted
  ---
  duration_ms: 2.963875
  type: 'test'
  ...
# Subtest: request boundaries reject foreign IDs, bad versions, false photo targets and mixed identities
ok 133 - request boundaries reject foreign IDs, bad versions, false photo targets and mixed identities
  ---
  duration_ms: 1.160792
  type: 'test'
  ...
# Subtest: generation all and single-slot responses keep the requested original photo and position
ok 134 - generation all and single-slot responses keep the requested original photo and position
  ---
  duration_ms: 2.078459
  type: 'test'
  ...
# Subtest: current post evidence resolves to a separate supplied photo set
ok 135 - current post evidence resolves to a separate supplied photo set
  ---
  duration_ms: 2.659
  type: 'test'
  ...
# Subtest: actual JPEG/PNG/WebP metadata, MIME and byte/dimension limits are checked
ok 136 - actual JPEG/PNG/WebP metadata, MIME and byte/dimension limits are checked
  ---
  duration_ms: 19.531625
  type: 'test'
  ...
# Subtest: JSON byte limit applies without Content-Length; invalid JSON/errors never become success
ok 137 - JSON byte limit applies without Content-Length; invalid JSON/errors never become success
  ---
  duration_ms: 15.283167
  type: 'test'
  ...
# Subtest: missing key reports heuristic route and direct model calls fail without network
ok 138 - missing key reports heuristic route and direct model calls fail without network
  ---
  duration_ms: 0.799625
  type: 'test'
  ...
# Subtest: wire format carries exactly one image and returns observed usage/model/time
ok 139 - wire format carries exactly one image and returns observed usage/model/time
  ---
  duration_ms: 15.706167
  type: 'test'
  ...
# Subtest: 429/529 retry once; auth errors never retry or expose provider body
ok 140 - 429/529 retry once; auth errors never retry or expose provider body
  ---
  duration_ms: 306.402167
  type: 'test'
  ...
# Subtest: deadline bounds discovery and stalled response parsing; no network retry
ok 141 - deadline bounds discovery and stalled response parsing; no network retry
  ---
  duration_ms: 21.438208
  type: 'test'
  ...
# Subtest: refusal, truncation, malformed JSON and non-object responses fail explicitly
ok 142 - refusal, truncation, malformed JSON and non-object responses fail explicitly
  ---
  duration_ms: 1.417875
  type: 'test'
  ...
# Subtest: key alone activates production client and loaded prompt; invalid response is not cached
ok 143 - key alone activates production client and loaded prompt; invalid response is not cached
  ---
  duration_ms: 3.183542
  type: 'test'
  ...
# Subtest: HTTP exposes model contract failure instead of returning heuristic success
ok 144 - HTTP exposes model contract failure instead of returning heuristic success
  ---
  duration_ms: 0.737625
  type: 'test'
  ...
# Subtest: key-present SVG is an explicit 415 from the production HTTP client, with no network
ok 145 - key-present SVG is an explicit 415 from the production HTTP client, with no network
  ---
  duration_ms: 1.013167
  type: 'test'
  ...
# Subtest: thinking 블록이 앞에 와도 text 블록 하나를 읽는다
ok 146 - thinking 블록이 앞에 와도 text 블록 하나를 읽는다
  ---
  duration_ms: 0.288417
  type: 'test'
  ...
# Subtest: text 블록이 없거나 둘 이상이면 실패한다
ok 147 - text 블록이 없거나 둘 이상이면 실패한다
  ---
  duration_ms: 0.422875
  type: 'test'
  ...
# Subtest: 워크스페이스 ID 가 있으면 헤더로 보내고 없으면 보내지 않는다
ok 148 - 워크스페이스 ID 가 있으면 헤더로 보내고 없으면 보내지 않는다
  ---
  duration_ms: 0.2425
  type: 'test'
  ...
# Subtest: a tie caused by opener bonus explains total score rather than unequal direction scores
ok 149 - a tie caused by opener bonus explains total score rather than unequal direction scores
  ---
  duration_ms: 9.034291
  type: 'test'
  ...
# Subtest: measured fixture itself satisfies the PhotoAnalysis contract
ok 150 - measured fixture itself satisfies the PhotoAnalysis contract
  ---
  duration_ms: 0.824416
  type: 'test'
  ...
# Subtest: 3 photos produce 3 slots covering positions 1..3 exactly once
ok 151 - 3 photos produce 3 slots covering positions 1..3 exactly once
  ---
  duration_ms: 3.497417
  type: 'test'
  ...
# Subtest: 15 photos produce 15 slots covering positions 1..15 exactly once
ok 152 - 15 photos produce 15 slots covering positions 1..15 exactly once
  ---
  duration_ms: 4.823167
  type: 'test'
  ...
# Subtest: 20 photos produce 20 slots covering positions 1..20 exactly once
ok 153 - 20 photos produce 20 slots covering positions 1..20 exactly once
  ---
  duration_ms: 3.060958
  type: 'test'
  ...
# Subtest: every eval invariant except the F3 export one passes on a generated feed
ok 154 - every eval invariant except the F3 export one passes on a generated feed
  ---
  duration_ms: 4.664125
  type: 'test'
  ...
# Subtest: no slot is justified by rules alone, and every photo evidence resolves to its own slot
ok 155 - no slot is justified by rules alone, and every photo evidence resolves to its own slot
  ---
  duration_ms: 5.260334
  type: 'test'
  ...
# Subtest: rationales never speak of scale, absent faces or "여백"
ok 156 - rationales never speak of scale, absent faces or "여백"
  ---
  duration_ms: 1.447625
  type: 'test'
  ...
# Subtest: two target profiles order the same photos differently
ok 157 - two target profiles order the same photos differently
  ---
  duration_ms: 3.282125
  type: 'test'
  ...
# Subtest: two profiles that agree on direction collide at R1, and the measured palette splits them
ok 158 - two profiles that agree on direction collide at R1, and the measured palette splits them
  ---
  duration_ms: 9.985917
  type: 'test'
  ...
# Subtest: the same input produces byte-identical output
ok 159 - the same input produces byte-identical output
  ---
  duration_ms: 2.706416
  type: 'test'
  ...
# Subtest: an absent current profile ends normally as target_only
ok 160 - an absent current profile ends normally as target_only
  ---
  duration_ms: 0.36825
  type: 'test'
  ...
# Subtest: a present current profile is reported but not yet used to correct
ok 161 - a present current profile is reported but not yet used to correct
  ---
  duration_ms: 0.632333
  type: 'test'
  ...
# Subtest: caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
ok 162 - caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
  ---
  duration_ms: 0.363959
  type: 'test'
  ...
# Subtest: carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
ok 163 - carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
  ---
  duration_ms: 3.17325
  type: 'test'
  ...
# Subtest: a bonus that flipped the opener is named as the reason, not hidden behind the measurement
ok 164 - a bonus that flipped the opener is named as the reason, not hidden behind the measurement
  ---
  duration_ms: 3.466667
  type: 'test'
  ...
# Subtest: photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
ok 165 - photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
  ---
  duration_ms: 8.444
  type: 'test'
  ...
# Subtest: rejects inputs the contract cannot accept instead of guessing
ok 166 - rejects inputs the contract cannot accept instead of guessing
  ---
  duration_ms: 0.296459
  type: 'test'
  ...
# Subtest: output prompts reference one shared style guard without copied banned lists
ok 167 - output prompts reference one shared style guard without copied banned lists
  ---
  duration_ms: 14.095416
  type: 'test'
  ...
# Subtest: manual examples match photo facts and original slots without banned language
ok 168 - manual examples match photo facts and original slots without banned language
  ---
  duration_ms: 12.986084
  type: 'test'
  ...
# Subtest: hidden SVG roots and invalid numeric entities fail without invented observations
ok 169 - hidden SVG roots and invalid numeric entities fail without invented observations
  ---
  duration_ms: 1.848166
  type: 'test'
  ...
# Subtest: JPEG invalid headers are rejected before allocating pixel grids
ok 170 - JPEG invalid headers are rejected before allocating pixel grids
  ---
  duration_ms: 6.42375
  type: 'test'
  ...
# Subtest: returned facts and measurement cannot mutate later cache hits
ok 171 - returned facts and measurement cannot mutate later cache hits
  ---
  duration_ms: 3.666
  type: 'test'
  ...
# Subtest: heuristic output satisfies the PhotoAnalysis contract and is deterministic
ok 172 - heuristic output satisfies the PhotoAnalysis contract and is deterministic
  ---
  duration_ms: 3.6145
  type: 'test'
  ...
# Subtest: heuristic never reports a subject, place, time or mood — only measured values
ok 173 - heuristic never reports a subject, place, time or mood — only measured values
  ---
  duration_ms: 5.293625
  type: 'test'
  ...
# Subtest: selected model failure is explicit and never cached
ok 174 - selected model failure is explicit and never cached
  ---
  duration_ms: 2.095208
  type: 'test'
  ...
# Subtest: model observations are accepted but measured color overrides the model estimate
ok 175 - model observations are accepted but measured color overrides the model estimate
  ---
  duration_ms: 1.196292
  type: 'test'
  ...
# Subtest: contract violations fail before correction and never enter cache
ok 176 - contract violations fail before correction and never enter cache
  ---
  duration_ms: 1.165208
  type: 'test'
  ...
# Subtest: key/model namespaces separate heuristic and model cache; callers cannot poison cached facts
ok 177 - key/model namespaces separate heuristic and model cache; callers cannot poison cached facts
  ---
  duration_ms: 0.366375
  type: 'test'
  ...
# Subtest: same bytes twice: zero extra model calls, identity re-stamped, duplicate reported
ok 178 - same bytes twice: zero extra model calls, identity re-stamped, duplicate reported
  ---
  duration_ms: 0.196167
  type: 'test'
  ...
# Subtest: cache is bounded and holds no more than CACHE_LIMIT entries
ok 179 - cache is bounded and holds no more than CACHE_LIMIT entries
  ---
  duration_ms: 4.05075
  type: 'test'
  ...
# Subtest: unobservable bytes fail honestly instead of inventing color
ok 180 - unobservable bytes fail honestly instead of inventing color
  ---
  duration_ms: 3.322667
  type: 'test'
  ...
# Subtest: jpeg DC reader returns a real block grid and rejects what it cannot read
ok 181 - jpeg DC reader returns a real block grid and rejects what it cannot read
  ---
  duration_ms: 0.497375
  type: 'test'
  ...
# Subtest: baseline JPEG is measured, not mis-read: solid colours are exact
ok 182 - baseline JPEG is measured, not mis-read: solid colours are exact
  ---
  duration_ms: 3.328541
  type: 'test'
  ...
# Subtest: baseline and progressive encodings of the same pixels agree
ok 183 - baseline and progressive encodings of the same pixels agree
  ---
  duration_ms: 3.977083
  type: 'test'
  ...
# Subtest: SVG is measured only as the flat-colour card it claims to support
ok 184 - SVG is measured only as the flat-colour card it claims to support
  ---
  duration_ms: 0.474
  type: 'test'
  ...
# Subtest: SVG text is reported only when a viewer could see it, and unescaped
ok 185 - SVG text is reported only when a viewer could see it, and unescaped
  ---
  duration_ms: 0.349833
  type: 'test'
  ...
# Subtest: composition is a documented constant, not a reading of the colour histogram
ok 186 - composition is a documented constant, not a reading of the colour histogram
  ---
  duration_ms: 1.954541
  type: 'test'
  ...
# Subtest: POST one photo returns one PhotoAnalysis
ok 187 - POST one photo returns one PhotoAnalysis
  ---
  duration_ms: 0.405
  type: 'test'
  ...
# Subtest: there is no many-photos-per-request path
ok 188 - there is no many-photos-per-request path
  ---
  duration_ms: 0.149375
  type: 'test'
  ...
# Subtest: request validation is explicit at the trust boundary
ok 189 - request validation is explicit at the trust boundary
  ---
  duration_ms: 63.605167
  type: 'test'
  ...
# Subtest: data URL prefixes are accepted, not silently mangled
ok 190 - data URL prefixes are accepted, not silently mangled
  ---
  duration_ms: 0.399042
  type: 'test'
  ...
# Subtest: the heuristic path makes zero outbound attempts with the network disabled
ok 191 - the heuristic path makes zero outbound attempts with the network disabled
  ---
  duration_ms: 72.64475
  type: 'test'
  ...
# Subtest: W5: the observation schema sent to the model uses no rejected array keywords
ok 192 - W5: the observation schema sent to the model uses no rejected array keywords
  ---
  duration_ms: 0.424708
  type: 'test'
  ...
# Subtest: 3/20 actual input IDs survive photo-only and heuristic target/current paths without invented spatial observations
ok 193 - 3/20 actual input IDs survive photo-only and heuristic target/current paths without invented spatial observations
  ---
  duration_ms: 13.938125
  type: 'test'
  ...
# Subtest: model observations use composed ordering and preserve current-post evidence references
ok 194 - model observations use composed ordering and preserve current-post evidence references
  ---
  duration_ms: 1.709667
  type: 'test'
  ...
# Subtest: prepared references are exact and unprepared URLs never become another account
ok 195 - prepared references are exact and unprepared URLs never become another account
  ---
  duration_ms: 23.87275
  type: 'test'
  ...
# Subtest: mock upload reads actual JPEG/PNG/WebP pixels, preserving ID and disabling provider even with a key
ok 196 - mock upload reads actual JPEG/PNG/WebP pixels, preserving ID and disabling provider even with a key
  ---
  duration_ms: 9.4395
  type: 'test'
  ...
# Subtest: invalid upload and feed stay errors rather than empty successes
ok 197 - invalid upload and feed stay errors rather than empty successes
  ---
  duration_ms: 1.53325
  type: 'test'
  ...
# Subtest: heuristic defaults are not promoted to observed composition, scale or opener habits
ok 198 - heuristic defaults are not promoted to observed composition, scale or opener habits
  ---
  duration_ms: 8.37175
  type: 'test'
  ...
# Subtest: both input paths produce the same TargetProfile schema with their own source
ok 199 - both input paths produce the same TargetProfile schema with their own source
  ---
  duration_ms: 0.536875
  type: 'test'
  ...
# Subtest: what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence
ok 200 - what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence
  ---
  duration_ms: 0.358792
  type: 'test'
  ...
# Subtest: E1: every Claim in both profiles and the photo plan carries at least one evidence
ok 201 - E1: every Claim in both profiles and the photo plan carries at least one evidence
  ---
  duration_ms: 0.201834
  type: 'test'
  ...
# Subtest: no profile item is made of rule evidence alone
ok 202 - no profile item is made of rule evidence alone
  ---
  duration_ms: 0.1575
  type: 'test'
  ...
# Subtest: a free text mapping cites the matched phrase and the mapping row separately
ok 203 - a free text mapping cites the matched phrase and the mapping row separately
  ---
  duration_ms: 0.139208
  type: 'test'
  ...
# Subtest: an aggregate value can be traced back to the posts it was read from
ok 204 - an aggregate value can be traced back to the posts it was read from
  ---
  duration_ms: 0.060292
  type: 'test'
  ...
# Subtest: free text never invents an empty caption ratio and never rounds up to a default
ok 205 - free text never invents an empty caption ratio and never rounds up to a default
  ---
  duration_ms: 0.210792
  type: 'test'
  ...
# Subtest: free text is the floor that always succeeds, but blank input is not natural language
ok 206 - free text is the floor that always succeeds, but blank input is not natural language
  ---
  duration_ms: 0.497833
  type: 'test'
  ...
# Subtest: an unprepared URL fails and names the fallbacks instead of borrowing another account
ok 207 - an unprepared URL fails and names the fallbacks instead of borrowing another account
  ---
  duration_ms: 0.9725
  type: 'test'
  ...
# Subtest: the photo only path returns a plan, never a TargetProfile with an undefined absent state
ok 208 - the photo only path returns a plan, never a TargetProfile with an undefined absent state
  ---
  duration_ms: 0.322541
  type: 'test'
  ...
# Subtest: the photo only path claims no preference and no sentence
ok 209 - the photo only path claims no preference and no sentence
  ---
  duration_ms: 0.119125
  type: 'test'
  ...
# Subtest: the photo plan aggregates only what a photo can show, and the mixes stay exact
ok 210 - the photo plan aggregates only what a photo can show, and the mixes stay exact
  ---
  duration_ms: 2.444375
  type: 'test'
  ...
# Subtest: boundary: an all blank snapshot yields no language and a carousel free one yields no opener
ok 211 - boundary: an all blank snapshot yields no language and a carousel free one yields no opener
  ---
  duration_ms: 0.420958
  type: 'test'
  ...
# Subtest: the two golden profiles differ in a way a reader can see
ok 212 - the two golden profiles differ in a way a reader can see
  ---
  duration_ms: 9.740625
  type: 'test'
  ...
# Subtest: H1: a negated or contrasted wish is left empty, never flipped into a positive one
ok 213 - H1: a negated or contrasted wish is left empty, never flipped into a positive one
  ---
  duration_ms: 1.576375
  type: 'test'
  ...
# Subtest: H1 control: a plainly positive wish still fills the same fields it always did
ok 214 - H1 control: a plainly positive wish still fills the same fields it always did
  ---
  duration_ms: 0.165
  type: 'test'
  ...
# Subtest: H2: editing a returned profile never changes what the next call returns
ok 215 - H2: editing a returned profile never changes what the next call returns
  ---
  duration_ms: 2.262042
  type: 'test'
  ...
# Subtest: H3: profile evidence must resolve to the actual input, not merely exist
ok 216 - H3: profile evidence must resolve to the actual input, not merely exist
  ---
  duration_ms: 1.944833
  type: 'test'
  ...
1..216
# tests 216
# suites 0
# pass 216
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 622.396209
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

Checked 41 files in 35ms. No fixes applied.
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

## PR 및 상태

Draft PR: https://github.com/Daterl/gyeol/pull/84 · base develop. 칸반은 검토·인수 대기로 갱신했다. 보드 권한 오류는 없었다.

## 기존 추출기 단위 차이

실제 결과를 수동으로 맞추지 않았다. current_profile은 trim 후 Unicode 코드포인트 수로 p50=585/p90=883을 계산하고 target_profile은 UTF-16 코드 유닛 수로 p50=639/p90=892를 계산한다. 같은 원본 3건의 길이는 코드포인트 기준 184/883/585, UTF-16 기준 187/892/639다. live-evidence의 길이 필드에 단위를 명시했다. 기존 추출기끼리의 단위 통일은 이 수집 PR에서 변경하지 않았으며 이후 두 축 수치 비교 시 고려해야 한다.
