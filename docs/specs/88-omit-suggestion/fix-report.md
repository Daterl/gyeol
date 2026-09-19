# PR #89 교차 리뷰 수정 보고서

HIGH-1과 MEDIUM-1(TS 계약 타입)만 수정했다. 권고 조건, 분석 캐시, 사진 슬롯, 순서 및 스키마 원문은 유지했다. merge·배포하지 않았다.

## 변경과 결과

- `lib/omit-suggestion.js`: 이미 계산한 refs로 중복 관측 여부를 누적한다. 권고 0건에서 관측 없음과 비교 대상 확정 불가를 구분한다. 외부 ID뿐 아니라 자기·순환·연쇄·모호한 참조에도 부정확한 설명을 하지 않는다.
- `test/omit-suggestion.test.js`: 같은 JPEG 바이트를 서로 다른 ID의 연속 두 분석 HTTP 요청으로 보내며 캐시를 요청 사이에 초기화하지 않는다. 두 번째 응답이 첫 요청 ID를 가리키는지 확인하고, 두 feed 경로에서 실제 응답 문장을 검증한다. 기존 외부·자기·순환·모호한 참조 검사도 강화했다.
- `src/types/contracts.ts`: OmitSuggestion 판별 유니온, OmitSummary 및 OrderedFeed의 선택적 확장 필드를 선언했다. 기존 확장 없는 feed와 호환된다. 화면 구현·소비자 합의 완료를 뜻하지 않는다.
- `spec.md`: 수정된 0건 메시지 계약을 반영했다.

## Production 관측을 이용한 전후 재현

2026-09-18 `https://project-7klb1.vercel.app/api/analyze`에 저장소 `fixtures/jpeg/gradient_baseline.jpg`의 같은 바이트를 서로 다른 photo_id로 **연속 두 요청** 전송했다. 둘 다 HTTP 200/cache hit이고 기존 `audit_review`를 가리켰다. 첫 호출부터 캐시가 따뜻했던 실제 상태다.

Production에는 이 PR이 미배포이므로, 아래 summaryBefore/After는 **Production 분석 응답을 그대로 PR의 로컬 buildFeed에 전달한 결과**다. 배포된 feed가 수정됐다는 주장이 아니다. 3장 입력을 유지했고 비교 대상은 현재 입력 밖에 있으므로 올바른 결과는 여전히 권고 0건이며, 중복 관측 사실을 인정하는 문장만 달라진다.

```json
[
  {
    "status": 200,
    "cache": "hit",
    "analysis": {
      "photo_id": "fix88_1789703577931_0",
      "quality_flags": [
        "duplicate_of:audit_review"
      ],
      "analysis_source": "heuristic"
    },
    "summaryBefore": {
      "recommended_count": 0,
      "message": "관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다."
    },
    "summaryAfter": {
      "recommended_count": 0,
      "message": "중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다."
    }
  },
  {
    "status": 200,
    "cache": "hit",
    "analysis": {
      "photo_id": "fix88_1789703577931_1",
      "quality_flags": [
        "duplicate_of:audit_review"
      ],
      "analysis_source": "heuristic"
    },
    "summaryBefore": {
      "recommended_count": 0,
      "message": "관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다."
    },
    "summaryAfter": {
      "recommended_count": 0,
      "message": "중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다."
    }
  }
]
```

## 회귀 및 되돌림 증명

회귀 테스트를 먼저 추가한 상태: 6개 중 4 PASS / 2 FAIL, 잘못된 0건 문장을 actual로 확인했다. 수정 후: 6/6 PASS. 수정 파일만 HEAD 내용으로 잠시 되돌렸을 때: exit 1, 동일 2건 FAIL. finally에서 수정본을 복원한 뒤 아래 전체 검증을 실행했다. 문장 기대값은 프로덕션 함수에서 생성하지 않고 테스트에 독립적으로 명시했다.

## HIGH-2 수용: 실제 발화율이 사실상 0인 범위

제공된 Claude 리뷰(`review-claude.md`)의 SHA-256 전수 조사에 따르면 단일 스크랩 실사진 **296장**에서 동일 바이트 26쌍은 모두 같은 게시물의 커버/첫 캐러셀 이미지 수집 중복이다. **서로 다른 게시물 간 동일 바이트는 0쌍**이었다. 따라서 이 표본에서 실제 사진 선택에 대한 권고 발화율은 사실상 0이다. 이는 전체 현실 사진의 통계적 발화율을 추정한 값이 아니다.

현재 기능은 완전히 동일한 파일의 관측된 중복만 권한다. 실사진 15종에서 0건인 것은 범위의 결과이며 결함이 아니다. 사용자가 “권하는 표시만”으로 범위를 좁혔고 근거 없는 권고는 P2 위반이므로 범위를 넓히지 않는다. 이번 작업에서 296장 조사를 재실행한 것으로 주장하지 않으며, 검토자가 이 한계를 알고 판단하도록 PR 본문에도 기록한다.

## 수정하지 않고 수용한 항목

- MEDIUM-2: 캐시 64개 축출 및 인스턴스 수명에 따라 중복 관측이 사라지는 제약을 수용한다. 캐시 크기·축출·세션 처리 변경 없음.
- MEDIUM-3: changedDecisions를 증가시킨 직후 rethrow하므로 성공 출력은 항상 0이며, 누적 변경 건수를 끝까지 측정하지 못한다는 증거 위생 문제를 수용한다. 리뷰어의 독립 720회 검증과 구분하며 카운터 수정 없음.
- LOW 항목, 추가 휴리스틱, 유사 이미지 판정, UI 구현은 범위 밖이다.
- 교차 리뷰 재승인·소비자 계약 합의·수정본 배포 검증은 별도다. 이번 요청의 merge 금지를 유지한다.

## 검증 출력

아래 여섯 명령은 모두 exit 0. Node v22.22.3에서 실행했다. Node 24 재검증은 하지 않았다.

| 명령 | 결과 |
|---|---|
| npm test | 205 PASS / 0 FAIL |
| npm run test:ui | 31 PASS / 10 files |
| npm run eval | 정상 케이스 PASS / 의도적 실패 EXPECTED FAIL |
| npm run check | 68 JS/JSON files PASS |
| npm run lint | 40 files, No fixes applied |
| npm run typecheck | route type generation + tsc exit 0 |

### before

```text
TAP version 13
# Subtest: zero observations means explicit zero suggestions on photo-only and target paths; 3/20 slots conserved
ok 1 - zero observations means explicit zero suggestions on photo-only and target paths; 3/20 slots conserved
  ---
  duration_ms: 37.260333
  type: 'test'
  ...
# Subtest: one-photo analyzer duplicate observation reaches both HTTP feed paths without removing slots
ok 2 - one-photo analyzer duplicate observation reaches both HTTP feed paths without removing slots
  ---
  duration_ms: 7.101167
  type: 'test'
  ...
# Subtest: foreign, self, cyclic, chained and ambiguous duplicate observations abstain
not ok 3 - foreign, self, cyclic, chained and ambiguous duplicate observations abstain
  ---
  duration_ms: 0.7425
  type: 'test'
  location: '/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-88/test/omit-suggestion.test.js:52:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
    - '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'
  actual: '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/chowonjae/Desktop/projects/wanted/.work/gyeol-88/test/omit-suggestion.test.js:63:12)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: heuristic defaults, dark/blurry flags, colour, profile and order cannot change omission decisions
ok 4 - heuristic defaults, dark/blurry flags, colour, profile and order cannot change omission decisions
  ---
  duration_ms: 4.169917
  type: 'test'
  ...
# Subtest: extension validation rejects forged decisions, evidence, partial fields and wrong count; legacy feeds survive
ok 5 - extension validation rejects forged decisions, evidence, partial fields and wrong count; legacy feeds survive
  ---
  duration_ms: 2.589916
  type: 'test'
  ...
# Subtest: consecutive upload requests preserve warm-cache observations in the zero-suggestion message
not ok 6 - consecutive upload requests preserve warm-cache observations in the zero-suggestion message
  ---
  duration_ms: 8.56225
  type: 'test'
  location: '/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-88/test/omit-suggestion.test.js:110:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
    - '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'
  actual: '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/chowonjae/Desktop/projects/wanted/.work/gyeol-88/test/omit-suggestion.test.js:133:14)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
1..6
# tests 6
# suites 0
# pass 4
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 530.715375
```

### after

```text
TAP version 13
# Subtest: zero observations means explicit zero suggestions on photo-only and target paths; 3/20 slots conserved
ok 1 - zero observations means explicit zero suggestions on photo-only and target paths; 3/20 slots conserved
  ---
  duration_ms: 40.838709
  type: 'test'
  ...
# Subtest: one-photo analyzer duplicate observation reaches both HTTP feed paths without removing slots
ok 2 - one-photo analyzer duplicate observation reaches both HTTP feed paths without removing slots
  ---
  duration_ms: 8.715542
  type: 'test'
  ...
# Subtest: foreign, self, cyclic, chained and ambiguous duplicate observations abstain
ok 3 - foreign, self, cyclic, chained and ambiguous duplicate observations abstain
  ---
  duration_ms: 4.306583
  type: 'test'
  ...
# Subtest: heuristic defaults, dark/blurry flags, colour, profile and order cannot change omission decisions
ok 4 - heuristic defaults, dark/blurry flags, colour, profile and order cannot change omission decisions
  ---
  duration_ms: 3.94
  type: 'test'
  ...
# Subtest: extension validation rejects forged decisions, evidence, partial fields and wrong count; legacy feeds survive
ok 5 - extension validation rejects forged decisions, evidence, partial fields and wrong count; legacy feeds survive
  ---
  duration_ms: 2.334
  type: 'test'
  ...
# Subtest: consecutive upload requests preserve warm-cache observations in the zero-suggestion message
ok 6 - consecutive upload requests preserve warm-cache observations in the zero-suggestion message
  ---
  duration_ms: 12.972875
  type: 'test'
  ...
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 565.78125
```

### reverted

```text
TAP version 13
# Subtest: zero observations means explicit zero suggestions on photo-only and target paths; 3/20 slots conserved
ok 1 - zero observations means explicit zero suggestions on photo-only and target paths; 3/20 slots conserved
  ---
  duration_ms: 38.146917
  type: 'test'
  ...
# Subtest: one-photo analyzer duplicate observation reaches both HTTP feed paths without removing slots
ok 2 - one-photo analyzer duplicate observation reaches both HTTP feed paths without removing slots
  ---
  duration_ms: 9.54975
  type: 'test'
  ...
# Subtest: foreign, self, cyclic, chained and ambiguous duplicate observations abstain
not ok 3 - foreign, self, cyclic, chained and ambiguous duplicate observations abstain
  ---
  duration_ms: 1.033375
  type: 'test'
  location: '/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-88/test/omit-suggestion.test.js:52:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
    - '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'
  actual: '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/chowonjae/Desktop/projects/wanted/.work/gyeol-88/test/omit-suggestion.test.js:63:12)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: heuristic defaults, dark/blurry flags, colour, profile and order cannot change omission decisions
ok 4 - heuristic defaults, dark/blurry flags, colour, profile and order cannot change omission decisions
  ---
  duration_ms: 3.066208
  type: 'test'
  ...
# Subtest: extension validation rejects forged decisions, evidence, partial fields and wrong count; legacy feeds survive
ok 5 - extension validation rejects forged decisions, evidence, partial fields and wrong count; legacy feeds survive
  ---
  duration_ms: 2.445875
  type: 'test'
  ...
# Subtest: consecutive upload requests preserve warm-cache observations in the zero-suggestion message
not ok 6 - consecutive upload requests preserve warm-cache observations in the zero-suggestion message
  ---
  duration_ms: 16.260375
  type: 'test'
  location: '/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-88/test/omit-suggestion.test.js:110:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
    - '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: '중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.'
  actual: '관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/chowonjae/Desktop/projects/wanted/.work/gyeol-88/test/omit-suggestion.test.js:133:14)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
1..6
# tests 6
# suites 0
# pass 4
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 544.555333
```

### test

```text

> gyeol@0.1.0 test
> node --test test/*.test.js

TAP version 13
# Subtest: GET mock returns 15 slots and all four resources
ok 1 - GET mock returns 15 slots and all four resources
  ---
  duration_ms: 70.195833
  type: 'test'
  ...
# Subtest: live is explicit error, invalid query and method are controlled
ok 2 - live is explicit error, invalid query and method are controlled
  ---
  duration_ms: 2.087084
  type: 'test'
  ...
# Subtest: mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts
ok 3 - mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts
  ---
  duration_ms: 383.546208
  type: 'test'
  ...
# Subtest: 120/18 yields one evidenced delta, 47 chars and honest correction
ok 4 - 120/18 yields one evidenced delta, 47 chars and honest correction
  ---
  duration_ms: 6.533375
  type: 'test'
  ...
# Subtest: boundary 0/120: 10
ok 5 - boundary 0/120: 10
  ---
  duration_ms: 2.149584
  type: 'test'
  ...
# Subtest: boundary 120/0: 10
ok 6 - boundary 120/0: 10
  ---
  duration_ms: 1.598417
  type: 'test'
  ...
# Subtest: boundary 18/120: 47
ok 7 - boundary 18/120: 47
  ---
  duration_ms: 1.94725
  type: 'test'
  ...
# Subtest: boundary 0/0: 0
ok 8 - boundary 0/0: 0
  ---
  duration_ms: 1.075125
  type: 'test'
  ...
# Subtest: boundary 1/2: 1
ok 9 - boundary 1/2: 1
  ---
  duration_ms: 0.852958
  type: 'test'
  ...
# Subtest: boundary 120/120: 120
ok 10 - boundary 120/120: 120
  ---
  duration_ms: 1.900875
  type: 'test'
  ...
# Subtest: absent current completes pipeline and E8 with no delta
ok 11 - absent current completes pipeline and E8 with no delta
  ---
  duration_ms: 1.909208
  type: 'test'
  ...
# Subtest: missing caption measurement is not a fabricated gap
ok 12 - missing caption measurement is not a fabricated gap
  ---
  duration_ms: 7.579792
  type: 'test'
  ...
# Subtest: invalid or unevidenced profiles are rejected
ok 13 - invalid or unevidenced profiles are rejected
  ---
  duration_ms: 0.66875
  type: 'test'
  ...
# Subtest: same measured photos and different targets change position-sorted photo IDs
ok 14 - same measured photos and different targets change position-sorted photo IDs
  ---
  duration_ms: 9.327792
  type: 'test'
  ...
# Subtest: four sample types and independent golden input files satisfy contracts
ok 15 - four sample types and independent golden input files satisfy contracts
  ---
  duration_ms: 230.636417
  type: 'test'
  ...
# Subtest: E1: valid input passes and stored broken fixture fails
ok 16 - E1: valid input passes and stored broken fixture fails
  ---
  duration_ms: 3.472125
  type: 'test'
  ...
# Subtest: E2: valid input passes and stored broken fixture fails
ok 17 - E2: valid input passes and stored broken fixture fails
  ---
  duration_ms: 49.30025
  type: 'test'
  ...
# Subtest: E3: valid input passes and stored broken fixture fails
ok 18 - E3: valid input passes and stored broken fixture fails
  ---
  duration_ms: 7.918917
  type: 'test'
  ...
# Subtest: E6: valid input passes and stored broken fixture fails
ok 19 - E6: valid input passes and stored broken fixture fails
  ---
  duration_ms: 12.471792
  type: 'test'
  ...
# Subtest: E8: valid input passes and stored broken fixture fails
ok 20 - E8: valid input passes and stored broken fixture fails
  ---
  duration_ms: 8.567208
  type: 'test'
  ...
# Subtest: E9: valid input passes and stored broken fixture fails
ok 21 - E9: valid input passes and stored broken fixture fails
  ---
  duration_ms: 7.020292
  type: 'test'
  ...
# Subtest: E10: valid input passes and stored broken fixture fails
ok 22 - E10: valid input passes and stored broken fixture fails
  ---
  duration_ms: 3.093583
  type: 'test'
  ...
# Subtest: E11: valid input passes and stored broken fixture fails
ok 23 - E11: valid input passes and stored broken fixture fails
  ---
  duration_ms: 6.309167
  type: 'test'
  ...
# Subtest: 3 photo boundary passes
ok 24 - 3 photo boundary passes
  ---
  duration_ms: 1.636958
  type: 'test'
  ...
# Subtest: 20 photo boundary passes
ok 25 - 20 photo boundary passes
  ---
  duration_ms: 0.936125
  type: 'test'
  ...
# Subtest: 2 input photos rejected
ok 26 - 2 input photos rejected
  ---
  duration_ms: 0.49325
  type: 'test'
  ...
# Subtest: 21 input photos rejected
ok 27 - 21 input photos rejected
  ---
  duration_ms: 0.034208
  type: 'test'
  ...
# Subtest: reject duplicate output ID despite true flag
ok 28 - reject duplicate output ID despite true flag
  ---
  duration_ms: 0.093334
  type: 'test'
  ...
# Subtest: reject missing slot despite declared output count
ok 29 - reject missing slot despite declared output count
  ---
  duration_ms: 0.063125
  type: 'test'
  ...
# Subtest: reject foreign replacement ID with same count
ok 30 - reject foreign replacement ID with same count
  ---
  duration_ms: 0.061834
  type: 'test'
  ...
# Subtest: reject lying counts
ok 31 - reject lying counts
  ---
  duration_ms: 0.132833
  type: 'test'
  ...
# Subtest: reject count string
ok 32 - reject count string
  ---
  duration_ms: 0.087209
  type: 'test'
  ...
# Subtest: reject unique flag string
ok 33 - reject unique flag string
  ---
  duration_ms: 0.080375
  type: 'test'
  ...
# Subtest: reject position string
ok 34 - reject position string
  ---
  duration_ms: 0.0705
  type: 'test'
  ...
# Subtest: reject duplicate position
ok 35 - reject duplicate position
  ---
  duration_ms: 0.062959
  type: 'test'
  ...
# Subtest: reject zero position
ok 36 - reject zero position
  ---
  duration_ms: 0.058708
  type: 'test'
  ...
# Subtest: reject fractional position
ok 37 - reject fractional position
  ---
  duration_ms: 0.057791
  type: 'test'
  ...
# Subtest: reject missing rationale Claim
ok 38 - reject missing rationale Claim
  ---
  duration_ms: 0.097166
  type: 'test'
  ...
# Subtest: reject evidence missing
ok 39 - reject evidence missing
  ---
  duration_ms: 0.086625
  type: 'test'
  ...
# Subtest: reject evidence wrong type
ok 40 - reject evidence wrong type
  ---
  duration_ms: 0.076042
  type: 'test'
  ...
# Subtest: reject invalid confidence
ok 41 - reject invalid confidence
  ---
  duration_ms: 0.076708
  type: 'test'
  ...
# Subtest: reject empty evidence reference
ok 42 - reject empty evidence reference
  ---
  duration_ms: 0.077042
  type: 'test'
  ...
# Subtest: reject overlap string
ok 43 - reject overlap string
  ---
  duration_ms: 0.084667
  type: 'test'
  ...
# Subtest: reject invented current input
ok 44 - reject invented current input
  ---
  duration_ms: 0.059375
  type: 'test'
  ...
# Subtest: reject false corrected claim
ok 45 - reject false corrected claim
  ---
  duration_ms: 0.057875
  type: 'test'
  ...
# Subtest: reject unknown delta
ok 46 - reject unknown delta
  ---
  duration_ms: 0.063292
  type: 'test'
  ...
# Subtest: duplicate/malformed actual input rejected
ok 47 - duplicate/malformed actual input rejected
  ---
  duration_ms: 0.056667
  type: 'test'
  ...
# Subtest: E2 does not trust output input_count/unique flags as expected input IDs
ok 48 - E2 does not trust output input_count/unique flags as expected input IDs
  ---
  duration_ms: 0.250875
  type: 'test'
  ...
# Subtest: E8 uses actual absent input even if response invents consistent correction
ok 49 - E8 uses actual absent input even if response invents consistent correction
  ---
  duration_ms: 0.309417
  type: 'test'
  ...
# Subtest: validateFeed rejects missing current context with target-only disclosure
ok 50 - validateFeed rejects missing current context with target-only disclosure
  ---
  duration_ms: 0.142541
  type: 'test'
  ...
# Subtest: E8 rejects missing current context with target-only disclosure
ok 51 - E8 rejects missing current context with target-only disclosure
  ---
  duration_ms: 0.623792
  type: 'test'
  ...
# Subtest: validateFeed rejects undefined current context with target-only disclosure
ok 52 - validateFeed rejects undefined current context with target-only disclosure
  ---
  duration_ms: 0.099334
  type: 'test'
  ...
# Subtest: E8 rejects undefined current context with target-only disclosure
ok 53 - E8 rejects undefined current context with target-only disclosure
  ---
  duration_ms: 0.251292
  type: 'test'
  ...
# Subtest: validateFeed rejects missing current context with invented correction
ok 54 - validateFeed rejects missing current context with invented correction
  ---
  duration_ms: 0.032584
  type: 'test'
  ...
# Subtest: E8 rejects missing current context with invented correction
ok 55 - E8 rejects missing current context with invented correction
  ---
  duration_ms: 0.124708
  type: 'test'
  ...
# Subtest: validateFeed rejects undefined current context with invented correction
ok 56 - validateFeed rejects undefined current context with invented correction
  ---
  duration_ms: 0.02625
  type: 'test'
  ...
# Subtest: E8 rejects undefined current context with invented correction
ok 57 - E8 rejects undefined current context with invented correction
  ---
  duration_ms: 0.160416
  type: 'test'
  ...
# Subtest: profile absence/types/rule-only claims are checked
ok 58 - profile absence/types/rule-only claims are checked
  ---
  duration_ms: 0.377208
  type: 'test'
  ...
# Subtest: photo field types are checked
ok 59 - photo field types are checked
  ---
  duration_ms: 0.264
  type: 'test'
  ...
# Subtest: reject title null
ok 60 - reject title null
  ---
  duration_ms: 0.057125
  type: 'test'
  ...
# Subtest: reject title []
ok 61 - reject title []
  ---
  duration_ms: 0.02575
  type: 'test'
  ...
# Subtest: reject title ["one","two"]
ok 62 - reject title ["one","two"]
  ---
  duration_ms: 0.038542
  type: 'test'
  ...
# Subtest: reject title ""
ok 63 - reject title ""
  ---
  duration_ms: 0.093625
  type: 'test'
  ...
# Subtest: reject title " "
ok 64 - reject title " "
  ---
  duration_ms: 0.046292
  type: 'test'
  ...
# Subtest: reject title "one\\ntwo"
ok 65 - reject title "one\\ntwo"
  ---
  duration_ms: 0.064625
  type: 'test'
  ...
# Subtest: reject title "one\\rtwo"
ok 66 - reject title "one\\rtwo"
  ---
  duration_ms: 0.027334
  type: 'test'
  ...
# Subtest: reject title 3
ok 67 - reject title 3
  ---
  duration_ms: 0.023375
  type: 'test'
  ...
# Subtest: reject title "one
two"
ok 68 - reject title "one
two"
  ---
  duration_ms: 0.022583
  type: 'test'
  ...
# Subtest: F3 export retains stable identity at every position, including after reorder
ok 69 - F3 export retains stable identity at every position, including after reorder
  ---
  duration_ms: 2.432959
  type: 'test'
  ...
# Subtest: E4/E5/E7 are intentionally not automated quality checks
ok 70 - E4/E5/E7 are intentionally not automated quality checks
  ---
  duration_ms: 13.958792
  type: 'test'
  ...
# Subtest: user caption rejects photo-only evidence
ok 71 - user caption rejects photo-only evidence
  ---
  duration_ms: 7.969042
  type: 'test'
  ...
# Subtest: user caption accepts valid user_text evidence with additional photo evidence
ok 72 - user caption accepts valid user_text evidence with additional photo evidence
  ---
  duration_ms: 0.492459
  type: 'test'
  ...
# Subtest: present current can be honestly corrected with the single supported delta
ok 73 - present current can be honestly corrected with the single supported delta
  ---
  duration_ms: 0.345916
  type: 'test'
  ...
# Subtest: absent account and extra title fields cannot smuggle contradictory states
ok 74 - absent account and extra title fields cannot smuggle contradictory states
  ---
  duration_ms: 0.067083
  type: 'test'
  ...
# Subtest: validateFeed rejects an invented target profile ID
ok 75 - validateFeed rejects an invented target profile ID
  ---
  duration_ms: 0.410667
  type: 'test'
  ...
# Subtest: validateFeed and validateExport reject evidence that resolves to no input photo
ok 76 - validateFeed and validateExport reject evidence that resolves to no input photo
  ---
  duration_ms: 0.584666
  type: 'test'
  ...
# Subtest: validateFeed rejects describable_facts copied from another real photo
ok 77 - validateFeed rejects describable_facts copied from another real photo
  ---
  duration_ms: 49.575542
  type: 'test'
  ...
# Subtest: golden bundle carries its own PhotoAnalysis matching the input manifest
ok 78 - golden bundle carries its own PhotoAnalysis matching the input manifest
  ---
  duration_ms: 55.756625
  type: 'test'
  ...
# Subtest: 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다
ok 79 - 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다
  ---
  duration_ms: 33.380084
  type: 'test'
  ...
# Subtest: 부재 프로필은 target_only 공개와 정합하다 (E8)
ok 80 - 부재 프로필은 target_only 공개와 정합하다 (E8)
  ---
  duration_ms: 0.566041
  type: 'test'
  ...
# Subtest: 스냅샷 재생 경로가 source:"cached" 프로필을 만든다
ok 81 - 스냅샷 재생 경로가 source:"cached" 프로필을 만든다
  ---
  duration_ms: 4.147916
  type: 'test'
  ...
# Subtest: 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다
ok 82 - 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다
  ---
  duration_ms: 18.164709
  type: 'test'
  ...
# Subtest: 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다
ok 83 - 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다
  ---
  duration_ms: 130.865708
  type: 'test'
  ...
# Subtest: empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다
ok 84 - empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다
  ---
  duration_ms: 12.793083
  type: 'test'
  ...
# Subtest: 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다
ok 85 - 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다
  ---
  duration_ms: 5.185666
  type: 'test'
  ...
# Subtest: 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다
ok 86 - 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다
  ---
  duration_ms: 1.151334
  type: 'test'
  ...
# Subtest: opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다
ok 87 - opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다
  ---
  duration_ms: 3.776625
  type: 'test'
  ...
# Subtest: opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다
ok 88 - opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다
  ---
  duration_ms: 24.489875
  type: 'test'
  ...
# Subtest: 어떤 경로에서도 문자열 '불명' 이 나오지 않는다
ok 89 - 어떤 경로에서도 문자열 '불명' 이 나오지 않는다
  ---
  duration_ms: 2.808125
  type: 'test'
  ...
# Subtest: 직접 업로드 경로가 사진 분석에서 visual 을 집계한다
ok 90 - 직접 업로드 경로가 사진 분석에서 visual 을 집계한다
  ---
  duration_ms: 0.600875
  type: 'test'
  ...
# Subtest: hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다
ok 91 - hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다
  ---
  duration_ms: 0.887
  type: 'test'
  ...
# Subtest: 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2)
ok 92 - 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2)
  ---
  duration_ms: 6.37025
  type: 'test'
  ...
# Subtest: 입력을 섞거나 형식이 어긋나면 거부한다
ok 93 - 입력을 섞거나 형식이 어긋나면 거부한다
  ---
  duration_ms: 1.582333
  type: 'test'
  ...
# Subtest: 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다
ok 94 - 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다
  ---
  duration_ms: 1.135084
  type: 'test'
  ...
# Subtest: 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다
ok 95 - 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다
  ---
  duration_ms: 0.305792
  type: 'test'
  ...
# Subtest: A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1)
ok 96 - A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1)
  ---
  duration_ms: 4.072625
  type: 'test'
  ...
# Subtest: opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2)
ok 97 - opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2)
  ---
  duration_ms: 3.829625
  type: 'test'
  ...
# Subtest: subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2)
ok 98 - subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2)
  ---
  duration_ms: 0.336125
  type: 'test'
  ...
# Subtest: ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2)
ok 99 - ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2)
  ---
  duration_ms: 0.55575
  type: 'test'
  ...
# Subtest: 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2)
ok 100 - 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2)
  ---
  duration_ms: 2.471
  type: 'test'
  ...
# Subtest: all generation preserves each contract path and loads actual shared/output prompts
ok 101 - all generation preserves each contract path and loads actual shared/output prompts
  ---
  duration_ms: 282.149667
  type: 'test'
  ...
# Subtest: single slot sends only its photo and rejects other photo, position, user state or foreign evidence
ok 102 - single slot sends only its photo and rejects other photo, position, user state or foreign evidence
  ---
  duration_ms: 18.733167
  type: 'test'
  ...
# Subtest: all generation stabilizes one evidence-backed omission without forcing other contexts
ok 103 - all generation stabilizes one evidence-backed omission without forcing other contexts
  ---
  duration_ms: 16.627708
  type: 'test'
  ...
# Subtest: real feed context blocks stabilization without affirmative omission evidence
ok 104 - real feed context blocks stabilization without affirmative omission evidence
  ---
  duration_ms: 24.303083
  type: 'test'
  ...
# Subtest: client overlap cannot replace the canonical color measurement
ok 105 - client overlap cannot replace the canonical color measurement
  ---
  duration_ms: 2.751667
  type: 'test'
  ...
# Subtest: existing omissions and single-slot generation are preserved
ok 106 - existing omissions and single-slot generation are preserved
  ---
  duration_ms: 1.539209
  type: 'test'
  ...
# Subtest: invalid input, missing key and HTTP method fail without provider calls
ok 107 - invalid input, missing key and HTTP method fail without provider calls
  ---
  duration_ms: 2.844708
  type: 'test'
  ...
# Subtest: HTTP full/slot success uses the shared runtime contract without caching
ok 108 - HTTP full/slot success uses the shared runtime contract without caching
  ---
  duration_ms: 11.927125
  type: 'test'
  ...
# Subtest: timeout, malformed provider JSON and model contract violations use honest HTTP errors
ok 109 - timeout, malformed provider JSON and model contract violations use honest HTTP errors
  ---
  duration_ms: 41.958291
  type: 'test'
  ...
# Subtest: contract fixtures cover identities, photo-only, corrected, three states and all omitted
ok 110 - contract fixtures cover identities, photo-only, corrected, three states and all omitted
  ---
  duration_ms: 8.650709
  type: 'test'
  ...
# Subtest: request boundaries reject foreign IDs, bad versions, false photo targets and mixed identities
ok 111 - request boundaries reject foreign IDs, bad versions, false photo targets and mixed identities
  ---
  duration_ms: 25.078167
  type: 'test'
  ...
# Subtest: generation all and single-slot responses keep the requested original photo and position
ok 112 - generation all and single-slot responses keep the requested original photo and position
  ---
  duration_ms: 5.208291
  type: 'test'
  ...
# Subtest: current post evidence resolves to a separate supplied photo set
ok 113 - current post evidence resolves to a separate supplied photo set
  ---
  duration_ms: 2.692875
  type: 'test'
  ...
# Subtest: actual JPEG/PNG/WebP metadata, MIME and byte/dimension limits are checked
ok 114 - actual JPEG/PNG/WebP metadata, MIME and byte/dimension limits are checked
  ---
  duration_ms: 40.142625
  type: 'test'
  ...
# Subtest: JSON byte limit applies without Content-Length; invalid JSON/errors never become success
ok 115 - JSON byte limit applies without Content-Length; invalid JSON/errors never become success
  ---
  duration_ms: 119.725292
  type: 'test'
  ...
# Subtest: missing key reports heuristic route and direct model calls fail without network
ok 116 - missing key reports heuristic route and direct model calls fail without network
  ---
  duration_ms: 1.587792
  type: 'test'
  ...
# Subtest: wire format carries exactly one image and returns observed usage/model/time
ok 117 - wire format carries exactly one image and returns observed usage/model/time
  ---
  duration_ms: 185.256291
  type: 'test'
  ...
# Subtest: 429/529 retry once; auth errors never retry or expose provider body
ok 118 - 429/529 retry once; auth errors never retry or expose provider body
  ---
  duration_ms: 311.398291
  type: 'test'
  ...
# Subtest: deadline bounds discovery and stalled response parsing; no network retry
ok 119 - deadline bounds discovery and stalled response parsing; no network retry
  ---
  duration_ms: 24.860084
  type: 'test'
  ...
# Subtest: refusal, truncation, malformed JSON and non-object responses fail explicitly
ok 120 - refusal, truncation, malformed JSON and non-object responses fail explicitly
  ---
  duration_ms: 5.261791
  type: 'test'
  ...
# Subtest: key alone activates production client and loaded prompt; invalid response is not cached
ok 121 - key alone activates production client and loaded prompt; invalid response is not cached
  ---
  duration_ms: 5.364084
  type: 'test'
  ...
# Subtest: HTTP exposes model contract failure instead of returning heuristic success
ok 122 - HTTP exposes model contract failure instead of returning heuristic success
  ---
  duration_ms: 0.867209
  type: 'test'
  ...
# Subtest: key-present SVG is an explicit 415 from the production HTTP client, with no network
ok 123 - key-present SVG is an explicit 415 from the production HTTP client, with no network
  ---
  duration_ms: 3.908333
  type: 'test'
  ...
# Subtest: thinking 블록이 앞에 와도 text 블록 하나를 읽는다
ok 124 - thinking 블록이 앞에 와도 text 블록 하나를 읽는다
  ---
  duration_ms: 0.444541
  type: 'test'
  ...
# Subtest: text 블록이 없거나 둘 이상이면 실패한다
ok 125 - text 블록이 없거나 둘 이상이면 실패한다
  ---
  duration_ms: 0.543541
  type: 'test'
  ...
# Subtest: 워크스페이스 ID 가 있으면 헤더로 보내고 없으면 보내지 않는다
ok 126 - 워크스페이스 ID 가 있으면 헤더로 보내고 없으면 보내지 않는다
  ---
  duration_ms: 1.792792
  type: 'test'
  ...
# Subtest: zero observations means explicit zero suggestions on photo-only and target paths; 3/20 slots conserved
ok 127 - zero observations means explicit zero suggestions on photo-only and target paths; 3/20 slots conserved
  ---
  duration_ms: 149.181583
  type: 'test'
  ...
# Subtest: one-photo analyzer duplicate observation reaches both HTTP feed paths without removing slots
ok 128 - one-photo analyzer duplicate observation reaches both HTTP feed paths without removing slots
  ---
  duration_ms: 12.531916
  type: 'test'
  ...
# Subtest: foreign, self, cyclic, chained and ambiguous duplicate observations abstain
ok 129 - foreign, self, cyclic, chained and ambiguous duplicate observations abstain
  ---
  duration_ms: 1.250875
  type: 'test'
  ...
# Subtest: heuristic defaults, dark/blurry flags, colour, profile and order cannot change omission decisions
ok 130 - heuristic defaults, dark/blurry flags, colour, profile and order cannot change omission decisions
  ---
  duration_ms: 2.655958
  type: 'test'
  ...
# Subtest: extension validation rejects forged decisions, evidence, partial fields and wrong count; legacy feeds survive
ok 131 - extension validation rejects forged decisions, evidence, partial fields and wrong count; legacy feeds survive
  ---
  duration_ms: 2.470916
  type: 'test'
  ...
# Subtest: consecutive upload requests preserve warm-cache observations in the zero-suggestion message
ok 132 - consecutive upload requests preserve warm-cache observations in the zero-suggestion message
  ---
  duration_ms: 21.91475
  type: 'test'
  ...
# Subtest: a tie caused by opener bonus explains total score rather than unequal direction scores
ok 133 - a tie caused by opener bonus explains total score rather than unequal direction scores
  ---
  duration_ms: 10.074375
  type: 'test'
  ...
# Subtest: measured fixture itself satisfies the PhotoAnalysis contract
ok 134 - measured fixture itself satisfies the PhotoAnalysis contract
  ---
  duration_ms: 1.416042
  type: 'test'
  ...
# Subtest: 3 photos produce 3 slots covering positions 1..3 exactly once
ok 135 - 3 photos produce 3 slots covering positions 1..3 exactly once
  ---
  duration_ms: 8.397083
  type: 'test'
  ...
# Subtest: 15 photos produce 15 slots covering positions 1..15 exactly once
ok 136 - 15 photos produce 15 slots covering positions 1..15 exactly once
  ---
  duration_ms: 2.526042
  type: 'test'
  ...
# Subtest: 20 photos produce 20 slots covering positions 1..20 exactly once
ok 137 - 20 photos produce 20 slots covering positions 1..20 exactly once
  ---
  duration_ms: 6.450375
  type: 'test'
  ...
# Subtest: every eval invariant except the F3 export one passes on a generated feed
ok 138 - every eval invariant except the F3 export one passes on a generated feed
  ---
  duration_ms: 49.175916
  type: 'test'
  ...
# Subtest: no slot is justified by rules alone, and every photo evidence resolves to its own slot
ok 139 - no slot is justified by rules alone, and every photo evidence resolves to its own slot
  ---
  duration_ms: 1.067334
  type: 'test'
  ...
# Subtest: rationales never speak of scale, absent faces or "여백"
ok 140 - rationales never speak of scale, absent faces or "여백"
  ---
  duration_ms: 1.541125
  type: 'test'
  ...
# Subtest: two target profiles order the same photos differently
ok 141 - two target profiles order the same photos differently
  ---
  duration_ms: 134.679792
  type: 'test'
  ...
# Subtest: two profiles that agree on direction collide at R1, and the measured palette splits them
ok 142 - two profiles that agree on direction collide at R1, and the measured palette splits them
  ---
  duration_ms: 182.772792
  type: 'test'
  ...
# Subtest: the same input produces byte-identical output
ok 143 - the same input produces byte-identical output
  ---
  duration_ms: 15.880334
  type: 'test'
  ...
# Subtest: an absent current profile ends normally as target_only
ok 144 - an absent current profile ends normally as target_only
  ---
  duration_ms: 0.559
  type: 'test'
  ...
# Subtest: a present current profile is reported but not yet used to correct
ok 145 - a present current profile is reported but not yet used to correct
  ---
  duration_ms: 2.523584
  type: 'test'
  ...
# Subtest: caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
ok 146 - caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
  ---
  duration_ms: 0.489208
  type: 'test'
  ...
# Subtest: carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
ok 147 - carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
  ---
  duration_ms: 9.851208
  type: 'test'
  ...
# Subtest: a bonus that flipped the opener is named as the reason, not hidden behind the measurement
ok 148 - a bonus that flipped the opener is named as the reason, not hidden behind the measurement
  ---
  duration_ms: 2.847334
  type: 'test'
  ...
# Subtest: photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
ok 149 - photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
  ---
  duration_ms: 32.392542
  type: 'test'
  ...
# Subtest: rejects inputs the contract cannot accept instead of guessing
ok 150 - rejects inputs the contract cannot accept instead of guessing
  ---
  duration_ms: 2.691875
  type: 'test'
  ...
# Subtest: output prompts reference one shared style guard without copied banned lists
ok 151 - output prompts reference one shared style guard without copied banned lists
  ---
  duration_ms: 12.754375
  type: 'test'
  ...
# Subtest: manual examples match photo facts and original slots without banned language
ok 152 - manual examples match photo facts and original slots without banned language
  ---
  duration_ms: 144.896917
  type: 'test'
  ...
# Subtest: hidden SVG roots and invalid numeric entities fail without invented observations
ok 153 - hidden SVG roots and invalid numeric entities fail without invented observations
  ---
  duration_ms: 5.133083
  type: 'test'
  ...
# Subtest: JPEG invalid headers are rejected before allocating pixel grids
ok 154 - JPEG invalid headers are rejected before allocating pixel grids
  ---
  duration_ms: 11.654917
  type: 'test'
  ...
# Subtest: returned facts and measurement cannot mutate later cache hits
ok 155 - returned facts and measurement cannot mutate later cache hits
  ---
  duration_ms: 2.406458
  type: 'test'
  ...
# Subtest: heuristic output satisfies the PhotoAnalysis contract and is deterministic
ok 156 - heuristic output satisfies the PhotoAnalysis contract and is deterministic
  ---
  duration_ms: 4.34425
  type: 'test'
  ...
# Subtest: heuristic never reports a subject, place, time or mood — only measured values
ok 157 - heuristic never reports a subject, place, time or mood — only measured values
  ---
  duration_ms: 67.455667
  type: 'test'
  ...
# Subtest: selected model failure is explicit and never cached
ok 158 - selected model failure is explicit and never cached
  ---
  duration_ms: 5.203708
  type: 'test'
  ...
# Subtest: model observations are accepted but measured color overrides the model estimate
ok 159 - model observations are accepted but measured color overrides the model estimate
  ---
  duration_ms: 0.547791
  type: 'test'
  ...
# Subtest: contract violations fail before correction and never enter cache
ok 160 - contract violations fail before correction and never enter cache
  ---
  duration_ms: 1.0625
  type: 'test'
  ...
# Subtest: key/model namespaces separate heuristic and model cache; callers cannot poison cached facts
ok 161 - key/model namespaces separate heuristic and model cache; callers cannot poison cached facts
  ---
  duration_ms: 0.356125
  type: 'test'
  ...
# Subtest: same bytes twice: zero extra model calls, identity re-stamped, duplicate reported
ok 162 - same bytes twice: zero extra model calls, identity re-stamped, duplicate reported
  ---
  duration_ms: 0.1985
  type: 'test'
  ...
# Subtest: cache is bounded and holds no more than CACHE_LIMIT entries
ok 163 - cache is bounded and holds no more than CACHE_LIMIT entries
  ---
  duration_ms: 4.482542
  type: 'test'
  ...
# Subtest: unobservable bytes fail honestly instead of inventing color
ok 164 - unobservable bytes fail honestly instead of inventing color
  ---
  duration_ms: 5.274417
  type: 'test'
  ...
# Subtest: jpeg DC reader returns a real block grid and rejects what it cannot read
ok 165 - jpeg DC reader returns a real block grid and rejects what it cannot read
  ---
  duration_ms: 0.569084
  type: 'test'
  ...
# Subtest: baseline JPEG is measured, not mis-read: solid colours are exact
ok 166 - baseline JPEG is measured, not mis-read: solid colours are exact
  ---
  duration_ms: 5.200292
  type: 'test'
  ...
# Subtest: baseline and progressive encodings of the same pixels agree
ok 167 - baseline and progressive encodings of the same pixels agree
  ---
  duration_ms: 6.274791
  type: 'test'
  ...
# Subtest: SVG is measured only as the flat-colour card it claims to support
ok 168 - SVG is measured only as the flat-colour card it claims to support
  ---
  duration_ms: 0.47375
  type: 'test'
  ...
# Subtest: SVG text is reported only when a viewer could see it, and unescaped
ok 169 - SVG text is reported only when a viewer could see it, and unescaped
  ---
  duration_ms: 1.813625
  type: 'test'
  ...
# Subtest: composition is a documented constant, not a reading of the colour histogram
ok 170 - composition is a documented constant, not a reading of the colour histogram
  ---
  duration_ms: 1.563875
  type: 'test'
  ...
# Subtest: POST one photo returns one PhotoAnalysis
ok 171 - POST one photo returns one PhotoAnalysis
  ---
  duration_ms: 0.408792
  type: 'test'
  ...
# Subtest: there is no many-photos-per-request path
ok 172 - there is no many-photos-per-request path
  ---
  duration_ms: 0.147834
  type: 'test'
  ...
# Subtest: request validation is explicit at the trust boundary
ok 173 - request validation is explicit at the trust boundary
  ---
  duration_ms: 108.122708
  type: 'test'
  ...
# Subtest: data URL prefixes are accepted, not silently mangled
ok 174 - data URL prefixes are accepted, not silently mangled
  ---
  duration_ms: 0.345625
  type: 'test'
  ...
# Subtest: the heuristic path makes zero outbound attempts with the network disabled
ok 175 - the heuristic path makes zero outbound attempts with the network disabled
  ---
  duration_ms: 193.518417
  type: 'test'
  ...
# Subtest: W5: the observation schema sent to the model uses no rejected array keywords
ok 176 - W5: the observation schema sent to the model uses no rejected array keywords
  ---
  duration_ms: 0.340834
  type: 'test'
  ...
# Subtest: 3/20 actual input IDs survive photo-only and heuristic target/current paths without invented spatial observations
ok 177 - 3/20 actual input IDs survive photo-only and heuristic target/current paths without invented spatial observations
  ---
  duration_ms: 197.077792
  type: 'test'
  ...
# Subtest: model observations use composed ordering and preserve current-post evidence references
ok 178 - model observations use composed ordering and preserve current-post evidence references
  ---
  duration_ms: 3.662709
  type: 'test'
  ...
# Subtest: prepared references are exact and unprepared URLs never become another account
ok 179 - prepared references are exact and unprepared URLs never become another account
  ---
  duration_ms: 85.58275
  type: 'test'
  ...
# Subtest: mock upload reads actual JPEG/PNG/WebP pixels, preserving ID and disabling provider even with a key
ok 180 - mock upload reads actual JPEG/PNG/WebP pixels, preserving ID and disabling provider even with a key
  ---
  duration_ms: 19.901958
  type: 'test'
  ...
# Subtest: invalid upload and feed stay errors rather than empty successes
ok 181 - invalid upload and feed stay errors rather than empty successes
  ---
  duration_ms: 1.947125
  type: 'test'
  ...
# Subtest: \#69 real HTTP path reorders 15 heuristic photos once a target exists, and two targets disagree
ok 182 - \#69 real HTTP path reorders 15 heuristic photos once a target exists, and two targets disagree
  ---
  duration_ms: 6.04025
  type: 'test'
  ...
# Subtest: \#69 heuristic photos never have their constant composition reported as an observation
ok 183 - \#69 heuristic photos never have their constant composition reported as an observation
  ---
  duration_ms: 3.995584
  type: 'test'
  ...
# Subtest: \#69 photo-only input still keeps the input order, and the branch is the only one left
ok 184 - \#69 photo-only input still keeps the input order, and the branch is the only one left
  ---
  duration_ms: 3.302291
  type: 'test'
  ...
# Subtest: \#69 P2 an unobserved composition constant must not decide the order in a mixed batch
ok 185 - \#69 P2 an unobserved composition constant must not decide the order in a mixed batch
  ---
  duration_ms: 2.4605
  type: 'test'
  ...
# Subtest: \#69 P2 flipping an unobserved photo’s composition constant changes nothing
ok 186 - \#69 P2 flipping an unobserved photo’s composition constant changes nothing
  ---
  duration_ms: 2.363083
  type: 'test'
  ...
# Subtest: heuristic defaults are not promoted to observed composition, scale or opener habits
ok 187 - heuristic defaults are not promoted to observed composition, scale or opener habits
  ---
  duration_ms: 9.554417
  type: 'test'
  ...
# Subtest: both input paths produce the same TargetProfile schema with their own source
ok 188 - both input paths produce the same TargetProfile schema with their own source
  ---
  duration_ms: 0.541792
  type: 'test'
  ...
# Subtest: what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence
ok 189 - what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence
  ---
  duration_ms: 1.53275
  type: 'test'
  ...
# Subtest: E1: every Claim in both profiles and the photo plan carries at least one evidence
ok 190 - E1: every Claim in both profiles and the photo plan carries at least one evidence
  ---
  duration_ms: 0.532792
  type: 'test'
  ...
# Subtest: no profile item is made of rule evidence alone
ok 191 - no profile item is made of rule evidence alone
  ---
  duration_ms: 0.20675
  type: 'test'
  ...
# Subtest: a free text mapping cites the matched phrase and the mapping row separately
ok 192 - a free text mapping cites the matched phrase and the mapping row separately
  ---
  duration_ms: 0.154542
  type: 'test'
  ...
# Subtest: an aggregate value can be traced back to the posts it was read from
ok 193 - an aggregate value can be traced back to the posts it was read from
  ---
  duration_ms: 0.068792
  type: 'test'
  ...
# Subtest: free text never invents an empty caption ratio and never rounds up to a default
ok 194 - free text never invents an empty caption ratio and never rounds up to a default
  ---
  duration_ms: 0.205041
  type: 'test'
  ...
# Subtest: free text is the floor that always succeeds, but blank input is not natural language
ok 195 - free text is the floor that always succeeds, but blank input is not natural language
  ---
  duration_ms: 0.174083
  type: 'test'
  ...
# Subtest: an unprepared URL fails and names the fallbacks instead of borrowing another account
ok 196 - an unprepared URL fails and names the fallbacks instead of borrowing another account
  ---
  duration_ms: 0.518667
  type: 'test'
  ...
# Subtest: the photo only path returns a plan, never a TargetProfile with an undefined absent state
ok 197 - the photo only path returns a plan, never a TargetProfile with an undefined absent state
  ---
  duration_ms: 0.342209
  type: 'test'
  ...
# Subtest: the photo only path claims no preference and no sentence
ok 198 - the photo only path claims no preference and no sentence
  ---
  duration_ms: 0.132667
  type: 'test'
  ...
# Subtest: the photo plan aggregates only what a photo can show, and the mixes stay exact
ok 199 - the photo plan aggregates only what a photo can show, and the mixes stay exact
  ---
  duration_ms: 84.942292
  type: 'test'
  ...
# Subtest: boundary: an all blank snapshot yields no language and a carousel free one yields no opener
ok 200 - boundary: an all blank snapshot yields no language and a carousel free one yields no opener
  ---
  duration_ms: 4.5465
  type: 'test'
  ...
# Subtest: the two golden profiles differ in a way a reader can see
ok 201 - the two golden profiles differ in a way a reader can see
  ---
  duration_ms: 22.31175
  type: 'test'
  ...
# Subtest: H1: a negated or contrasted wish is left empty, never flipped into a positive one
ok 202 - H1: a negated or contrasted wish is left empty, never flipped into a positive one
  ---
  duration_ms: 0.384541
  type: 'test'
  ...
# Subtest: H1 control: a plainly positive wish still fills the same fields it always did
ok 203 - H1 control: a plainly positive wish still fills the same fields it always did
  ---
  duration_ms: 0.174084
  type: 'test'
  ...
# Subtest: H2: editing a returned profile never changes what the next call returns
ok 204 - H2: editing a returned profile never changes what the next call returns
  ---
  duration_ms: 1.793
  type: 'test'
  ...
# Subtest: H3: profile evidence must resolve to the actual input, not merely exist
ok 205 - H3: profile evidence must resolve to the actual input, not merely exist
  ---
  duration_ms: 0.595958
  type: 'test'
  ...
1..205
# tests 205
# suites 0
# pass 205
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1231.457834
```

### test-ui

```text

> gyeol@0.1.0 test:ui
> vitest run


 RUN  v5.0.1 /Users/chowonjae/Desktop/projects/wanted/.work/gyeol-88


 Test Files  10 passed (10)
      Tests  31 passed (31)
   Start at  12:53:35
   Duration  1.44s (transform 56%, import 35%, tests 7%, worker 1%)

  Transform  transforming modules took 3.33s · 56% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

### eval

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

### check

```text

> gyeol@0.1.0 check
> node scripts/check.js

PASS: 68 JS/JSON files checked; four schema examples match fixtures. Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```

### lint

```text

> gyeol@0.1.0 lint
> biome check .

Checked 40 files in 65ms. No fixes applied.
```

### typecheck

```text

> gyeol@0.1.0 typecheck
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
```
