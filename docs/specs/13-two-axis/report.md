# 검증 보고

기준 SHA: e4901582b9e99586f975155ab8f853ab3689c34e. 로컬 계약 검증이며 실제 모델·사용자 품질·배포 검증은 아니다.

## npm test

종료 코드: 0

```text

> gyeol@0.1.0 test
> node --test test/*.test.js

TAP version 13
# Subtest: GET mock returns 15 slots and all four resources
ok 1 - GET mock returns 15 slots and all four resources
  ---
  duration_ms: 28.050625
  type: 'test'
  ...
# Subtest: live is explicit error, invalid query and method are controlled
ok 2 - live is explicit error, invalid query and method are controlled
  ---
  duration_ms: 0.439042
  type: 'test'
  ...
# Subtest: mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts
ok 3 - mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts
  ---
  duration_ms: 79.542292
  type: 'test'
  ...
# Subtest: 120/18 yields one evidenced delta, 47 chars and honest correction
ok 4 - 120/18 yields one evidenced delta, 47 chars and honest correction
  ---
  duration_ms: 8.271875
  type: 'test'
  ...
# Subtest: boundary 0/120: 10
ok 5 - boundary 0/120: 10
  ---
  duration_ms: 2.026209
  type: 'test'
  ...
# Subtest: boundary 120/0: 10
ok 6 - boundary 120/0: 10
  ---
  duration_ms: 5.052875
  type: 'test'
  ...
# Subtest: boundary 18/120: 47
ok 7 - boundary 18/120: 47
  ---
  duration_ms: 2.680959
  type: 'test'
  ...
# Subtest: boundary 0/0: 0
ok 8 - boundary 0/0: 0
  ---
  duration_ms: 2.323334
  type: 'test'
  ...
# Subtest: boundary 1/2: 1
ok 9 - boundary 1/2: 1
  ---
  duration_ms: 1.092041
  type: 'test'
  ...
# Subtest: boundary 120/120: 120
ok 10 - boundary 120/120: 120
  ---
  duration_ms: 2.009791
  type: 'test'
  ...
# Subtest: absent current completes pipeline and E8 with no delta
ok 11 - absent current completes pipeline and E8 with no delta
  ---
  duration_ms: 2.305417
  type: 'test'
  ...
# Subtest: missing caption measurement is not a fabricated gap
ok 12 - missing caption measurement is not a fabricated gap
  ---
  duration_ms: 2.544125
  type: 'test'
  ...
# Subtest: invalid or unevidenced profiles are rejected
ok 13 - invalid or unevidenced profiles are rejected
  ---
  duration_ms: 0.779792
  type: 'test'
  ...
# Subtest: same measured photos and different targets change position-sorted photo IDs
ok 14 - same measured photos and different targets change position-sorted photo IDs
  ---
  duration_ms: 3.864417
  type: 'test'
  ...
# Subtest: four sample types and independent golden input files satisfy contracts
ok 15 - four sample types and independent golden input files satisfy contracts
  ---
  duration_ms: 57.943084
  type: 'test'
  ...
# Subtest: E1: valid input passes and stored broken fixture fails
ok 16 - E1: valid input passes and stored broken fixture fails
  ---
  duration_ms: 2.506625
  type: 'test'
  ...
# Subtest: E2: valid input passes and stored broken fixture fails
ok 17 - E2: valid input passes and stored broken fixture fails
  ---
  duration_ms: 1.804917
  type: 'test'
  ...
# Subtest: E3: valid input passes and stored broken fixture fails
ok 18 - E3: valid input passes and stored broken fixture fails
  ---
  duration_ms: 1.699875
  type: 'test'
  ...
# Subtest: E6: valid input passes and stored broken fixture fails
ok 19 - E6: valid input passes and stored broken fixture fails
  ---
  duration_ms: 2.1355
  type: 'test'
  ...
# Subtest: E8: valid input passes and stored broken fixture fails
ok 20 - E8: valid input passes and stored broken fixture fails
  ---
  duration_ms: 1.542709
  type: 'test'
  ...
# Subtest: E9: valid input passes and stored broken fixture fails
ok 21 - E9: valid input passes and stored broken fixture fails
  ---
  duration_ms: 1.175459
  type: 'test'
  ...
# Subtest: E10: valid input passes and stored broken fixture fails
ok 22 - E10: valid input passes and stored broken fixture fails
  ---
  duration_ms: 1.389125
  type: 'test'
  ...
# Subtest: E11: valid input passes and stored broken fixture fails
ok 23 - E11: valid input passes and stored broken fixture fails
  ---
  duration_ms: 1.411167
  type: 'test'
  ...
# Subtest: 3 photo boundary passes
ok 24 - 3 photo boundary passes
  ---
  duration_ms: 1.664125
  type: 'test'
  ...
# Subtest: 20 photo boundary passes
ok 25 - 20 photo boundary passes
  ---
  duration_ms: 0.859375
  type: 'test'
  ...
# Subtest: 2 input photos rejected
ok 26 - 2 input photos rejected
  ---
  duration_ms: 0.19425
  type: 'test'
  ...
# Subtest: 21 input photos rejected
ok 27 - 21 input photos rejected
  ---
  duration_ms: 0.035916
  type: 'test'
  ...
# Subtest: reject duplicate output ID despite true flag
ok 28 - reject duplicate output ID despite true flag
  ---
  duration_ms: 0.379542
  type: 'test'
  ...
# Subtest: reject missing slot despite declared output count
ok 29 - reject missing slot despite declared output count
  ---
  duration_ms: 0.225667
  type: 'test'
  ...
# Subtest: reject foreign replacement ID with same count
ok 30 - reject foreign replacement ID with same count
  ---
  duration_ms: 0.067916
  type: 'test'
  ...
# Subtest: reject lying counts
ok 31 - reject lying counts
  ---
  duration_ms: 0.0615
  type: 'test'
  ...
# Subtest: reject count string
ok 32 - reject count string
  ---
  duration_ms: 0.05525
  type: 'test'
  ...
# Subtest: reject unique flag string
ok 33 - reject unique flag string
  ---
  duration_ms: 0.069916
  type: 'test'
  ...
# Subtest: reject position string
ok 34 - reject position string
  ---
  duration_ms: 0.0615
  type: 'test'
  ...
# Subtest: reject duplicate position
ok 35 - reject duplicate position
  ---
  duration_ms: 0.313
  type: 'test'
  ...
# Subtest: reject zero position
ok 36 - reject zero position
  ---
  duration_ms: 0.076541
  type: 'test'
  ...
# Subtest: reject fractional position
ok 37 - reject fractional position
  ---
  duration_ms: 0.065375
  type: 'test'
  ...
# Subtest: reject missing rationale Claim
ok 38 - reject missing rationale Claim
  ---
  duration_ms: 0.29375
  type: 'test'
  ...
# Subtest: reject evidence missing
ok 39 - reject evidence missing
  ---
  duration_ms: 0.09625
  type: 'test'
  ...
# Subtest: reject evidence wrong type
ok 40 - reject evidence wrong type
  ---
  duration_ms: 0.08525
  type: 'test'
  ...
# Subtest: reject invalid confidence
ok 41 - reject invalid confidence
  ---
  duration_ms: 0.074541
  type: 'test'
  ...
# Subtest: reject empty evidence reference
ok 42 - reject empty evidence reference
  ---
  duration_ms: 0.076334
  type: 'test'
  ...
# Subtest: reject overlap string
ok 43 - reject overlap string
  ---
  duration_ms: 0.0955
  type: 'test'
  ...
# Subtest: reject invented current input
ok 44 - reject invented current input
  ---
  duration_ms: 0.063959
  type: 'test'
  ...
# Subtest: reject false corrected claim
ok 45 - reject false corrected claim
  ---
  duration_ms: 0.063625
  type: 'test'
  ...
# Subtest: reject unknown delta
ok 46 - reject unknown delta
  ---
  duration_ms: 0.143334
  type: 'test'
  ...
# Subtest: duplicate/malformed actual input rejected
ok 47 - duplicate/malformed actual input rejected
  ---
  duration_ms: 0.063875
  type: 'test'
  ...
# Subtest: E2 does not trust output input_count/unique flags as expected input IDs
ok 48 - E2 does not trust output input_count/unique flags as expected input IDs
  ---
  duration_ms: 0.363583
  type: 'test'
  ...
# Subtest: E8 uses actual absent input even if response invents consistent correction
ok 49 - E8 uses actual absent input even if response invents consistent correction
  ---
  duration_ms: 0.3805
  type: 'test'
  ...
# Subtest: validateFeed rejects missing current context with target-only disclosure
ok 50 - validateFeed rejects missing current context with target-only disclosure
  ---
  duration_ms: 0.147042
  type: 'test'
  ...
# Subtest: E8 rejects missing current context with target-only disclosure
ok 51 - E8 rejects missing current context with target-only disclosure
  ---
  duration_ms: 0.708541
  type: 'test'
  ...
# Subtest: validateFeed rejects undefined current context with target-only disclosure
ok 52 - validateFeed rejects undefined current context with target-only disclosure
  ---
  duration_ms: 0.108625
  type: 'test'
  ...
# Subtest: E8 rejects undefined current context with target-only disclosure
ok 53 - E8 rejects undefined current context with target-only disclosure
  ---
  duration_ms: 0.406
  type: 'test'
  ...
# Subtest: validateFeed rejects missing current context with invented correction
ok 54 - validateFeed rejects missing current context with invented correction
  ---
  duration_ms: 0.040041
  type: 'test'
  ...
# Subtest: E8 rejects missing current context with invented correction
ok 55 - E8 rejects missing current context with invented correction
  ---
  duration_ms: 0.129958
  type: 'test'
  ...
# Subtest: validateFeed rejects undefined current context with invented correction
ok 56 - validateFeed rejects undefined current context with invented correction
  ---
  duration_ms: 0.026334
  type: 'test'
  ...
# Subtest: E8 rejects undefined current context with invented correction
ok 57 - E8 rejects undefined current context with invented correction
  ---
  duration_ms: 0.111042
  type: 'test'
  ...
# Subtest: profile absence/types/rule-only claims are checked
ok 58 - profile absence/types/rule-only claims are checked
  ---
  duration_ms: 0.248708
  type: 'test'
  ...
# Subtest: photo field types are checked
ok 59 - photo field types are checked
  ---
  duration_ms: 0.092625
  type: 'test'
  ...
# Subtest: reject title null
ok 60 - reject title null
  ---
  duration_ms: 0.039375
  type: 'test'
  ...
# Subtest: reject title []
ok 61 - reject title []
  ---
  duration_ms: 0.019125
  type: 'test'
  ...
# Subtest: reject title ["one","two"]
ok 62 - reject title ["one","two"]
  ---
  duration_ms: 0.018667
  type: 'test'
  ...
# Subtest: reject title ""
ok 63 - reject title ""
  ---
  duration_ms: 0.043875
  type: 'test'
  ...
# Subtest: reject title " "
ok 64 - reject title " "
  ---
  duration_ms: 0.018333
  type: 'test'
  ...
# Subtest: reject title "one\\ntwo"
ok 65 - reject title "one\\ntwo"
  ---
  duration_ms: 0.043
  type: 'test'
  ...
# Subtest: reject title "one\\rtwo"
ok 66 - reject title "one\\rtwo"
  ---
  duration_ms: 0.018333
  type: 'test'
  ...
# Subtest: reject title 3
ok 67 - reject title 3
  ---
  duration_ms: 0.01825
  type: 'test'
  ...
# Subtest: reject title "one two"
ok 68 - reject title "one two"
  ---
  duration_ms: 0.018584
  type: 'test'
  ...
# Subtest: F3 export retains stable identity at every position, including after reorder
ok 69 - F3 export retains stable identity at every position, including after reorder
  ---
  duration_ms: 0.263833
  type: 'test'
  ...
# Subtest: E4/E5/E7 are intentionally not automated quality checks
ok 70 - E4/E5/E7 are intentionally not automated quality checks
  ---
  duration_ms: 0.135334
  type: 'test'
  ...
# Subtest: user caption rejects photo-only evidence
ok 71 - user caption rejects photo-only evidence
  ---
  duration_ms: 0.085292
  type: 'test'
  ...
# Subtest: user caption accepts valid user_text evidence with additional photo evidence
ok 72 - user caption accepts valid user_text evidence with additional photo evidence
  ---
  duration_ms: 0.581916
  type: 'test'
  ...
# Subtest: present current can be honestly corrected with the single supported delta
ok 73 - present current can be honestly corrected with the single supported delta
  ---
  duration_ms: 1.028
  type: 'test'
  ...
# Subtest: absent account and extra title fields cannot smuggle contradictory states
ok 74 - absent account and extra title fields cannot smuggle contradictory states
  ---
  duration_ms: 0.057125
  type: 'test'
  ...
# Subtest: validateFeed rejects an invented target profile ID
ok 75 - validateFeed rejects an invented target profile ID
  ---
  duration_ms: 0.254292
  type: 'test'
  ...
# Subtest: validateFeed and validateExport reject evidence that resolves to no input photo
ok 76 - validateFeed and validateExport reject evidence that resolves to no input photo
  ---
  duration_ms: 0.512583
  type: 'test'
  ...
# Subtest: validateFeed rejects describable_facts copied from another real photo
ok 77 - validateFeed rejects describable_facts copied from another real photo
  ---
  duration_ms: 1.12975
  type: 'test'
  ...
# Subtest: golden bundle carries its own PhotoAnalysis matching the input manifest
ok 78 - golden bundle carries its own PhotoAnalysis matching the input manifest
  ---
  duration_ms: 5.20825
  type: 'test'
  ...
# Subtest: 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다
ok 79 - 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다
  ---
  duration_ms: 4.466625
  type: 'test'
  ...
# Subtest: 부재 프로필은 target_only 공개와 정합하다 (E8)
ok 80 - 부재 프로필은 target_only 공개와 정합하다 (E8)
  ---
  duration_ms: 1.533583
  type: 'test'
  ...
# Subtest: 스냅샷 재생 경로가 source:"cached" 프로필을 만든다
ok 81 - 스냅샷 재생 경로가 source:"cached" 프로필을 만든다
  ---
  duration_ms: 1.455458
  type: 'test'
  ...
# Subtest: 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다
ok 82 - 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다
  ---
  duration_ms: 2.900083
  type: 'test'
  ...
# Subtest: 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다
ok 83 - 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다
  ---
  duration_ms: 64.060041
  type: 'test'
  ...
# Subtest: empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다
ok 84 - empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다
  ---
  duration_ms: 2.041625
  type: 'test'
  ...
# Subtest: 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다
ok 85 - 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다
  ---
  duration_ms: 0.863875
  type: 'test'
  ...
# Subtest: 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다
ok 86 - 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다
  ---
  duration_ms: 0.166125
  type: 'test'
  ...
# Subtest: opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다
ok 87 - opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다
  ---
  duration_ms: 1.207625
  type: 'test'
  ...
# Subtest: opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다
ok 88 - opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다
  ---
  duration_ms: 1.515791
  type: 'test'
  ...
# Subtest: 어떤 경로에서도 문자열 '불명' 이 나오지 않는다
ok 89 - 어떤 경로에서도 문자열 '불명' 이 나오지 않는다
  ---
  duration_ms: 1.154084
  type: 'test'
  ...
# Subtest: 직접 업로드 경로가 사진 분석에서 visual 을 집계한다
ok 90 - 직접 업로드 경로가 사진 분석에서 visual 을 집계한다
  ---
  duration_ms: 0.204667
  type: 'test'
  ...
# Subtest: hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다
ok 91 - hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다
  ---
  duration_ms: 0.106792
  type: 'test'
  ...
# Subtest: 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2)
ok 92 - 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2)
  ---
  duration_ms: 0.629125
  type: 'test'
  ...
# Subtest: 입력을 섞거나 형식이 어긋나면 거부한다
ok 93 - 입력을 섞거나 형식이 어긋나면 거부한다
  ---
  duration_ms: 0.275125
  type: 'test'
  ...
# Subtest: 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다
ok 94 - 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다
  ---
  duration_ms: 0.038666
  type: 'test'
  ...
# Subtest: 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다
ok 95 - 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다
  ---
  duration_ms: 0.247708
  type: 'test'
  ...
# Subtest: A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1)
ok 96 - A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1)
  ---
  duration_ms: 2.0985
  type: 'test'
  ...
# Subtest: opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2)
ok 97 - opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2)
  ---
  duration_ms: 0.736416
  type: 'test'
  ...
# Subtest: subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2)
ok 98 - subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2)
  ---
  duration_ms: 0.258792
  type: 'test'
  ...
# Subtest: ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2)
ok 99 - ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2)
  ---
  duration_ms: 0.123291
  type: 'test'
  ...
# Subtest: 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2)
ok 100 - 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2)
  ---
  duration_ms: 0.409375
  type: 'test'
  ...
# Subtest: measured fixture itself satisfies the PhotoAnalysis contract
ok 101 - measured fixture itself satisfies the PhotoAnalysis contract
  ---
  duration_ms: 4.014833
  type: 'test'
  ...
# Subtest: 3 photos produce 3 slots covering positions 1..3 exactly once
ok 102 - 3 photos produce 3 slots covering positions 1..3 exactly once
  ---
  duration_ms: 2.610791
  type: 'test'
  ...
# Subtest: 15 photos produce 15 slots covering positions 1..15 exactly once
ok 103 - 15 photos produce 15 slots covering positions 1..15 exactly once
  ---
  duration_ms: 4.933125
  type: 'test'
  ...
# Subtest: 20 photos produce 20 slots covering positions 1..20 exactly once
ok 104 - 20 photos produce 20 slots covering positions 1..20 exactly once
  ---
  duration_ms: 1.535
  type: 'test'
  ...
# Subtest: every eval invariant except the F3 export one passes on a generated feed
ok 105 - every eval invariant except the F3 export one passes on a generated feed
  ---
  duration_ms: 3.619
  type: 'test'
  ...
# Subtest: no slot is justified by rules alone, and every photo evidence resolves to its own slot
ok 106 - no slot is justified by rules alone, and every photo evidence resolves to its own slot
  ---
  duration_ms: 1.72325
  type: 'test'
  ...
# Subtest: rationales never speak of scale, absent faces or "여백"
ok 107 - rationales never speak of scale, absent faces or "여백"
  ---
  duration_ms: 0.738542
  type: 'test'
  ...
# Subtest: two target profiles order the same photos differently
ok 108 - two target profiles order the same photos differently
  ---
  duration_ms: 2.790625
  type: 'test'
  ...
# Subtest: the same input produces byte-identical output
ok 109 - the same input produces byte-identical output
  ---
  duration_ms: 2.340667
  type: 'test'
  ...
# Subtest: an absent current profile ends normally as target_only
ok 110 - an absent current profile ends normally as target_only
  ---
  duration_ms: 1.125875
  type: 'test'
  ...
# Subtest: a present current profile is reported but not yet used to correct
ok 111 - a present current profile is reported but not yet used to correct
  ---
  duration_ms: 1.421083
  type: 'test'
  ...
# Subtest: caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
ok 112 - caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
  ---
  duration_ms: 0.836208
  type: 'test'
  ...
# Subtest: carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
ok 113 - carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
  ---
  duration_ms: 4.344042
  type: 'test'
  ...
# Subtest: a bonus that flipped the opener is named as the reason, not hidden behind the measurement
ok 114 - a bonus that flipped the opener is named as the reason, not hidden behind the measurement
  ---
  duration_ms: 1.958375
  type: 'test'
  ...
# Subtest: photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
ok 115 - photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
  ---
  duration_ms: 0.977958
  type: 'test'
  ...
# Subtest: rejects inputs the contract cannot accept instead of guessing
ok 116 - rejects inputs the contract cannot accept instead of guessing
  ---
  duration_ms: 0.256209
  type: 'test'
  ...
# Subtest: heuristic output satisfies the PhotoAnalysis contract and is deterministic
ok 117 - heuristic output satisfies the PhotoAnalysis contract and is deterministic
  ---
  duration_ms: 6.041958
  type: 'test'
  ...
# Subtest: heuristic never reports a subject, place, time or mood — only measured values
ok 118 - heuristic never reports a subject, place, time or mood — only measured values
  ---
  duration_ms: 7.548333
  type: 'test'
  ...
# Subtest: model failure falls back to heuristic instead of throwing
ok 119 - model failure falls back to heuristic instead of throwing
  ---
  duration_ms: 4.324834
  type: 'test'
  ...
# Subtest: model observations are accepted but measured color overrides the model estimate
ok 120 - model observations are accepted but measured color overrides the model estimate
  ---
  duration_ms: 0.322666
  type: 'test'
  ...
# Subtest: a contract-violating model response falls back to heuristic and is not cached
ok 121 - a contract-violating model response falls back to heuristic and is not cached
  ---
  duration_ms: 0.575
  type: 'test'
  ...
# Subtest: an observation cannot relabel which photo was analyzed
ok 122 - an observation cannot relabel which photo was analyzed
  ---
  duration_ms: 0.130334
  type: 'test'
  ...
# Subtest: same bytes twice: zero extra model calls, identity re-stamped, duplicate reported
ok 123 - same bytes twice: zero extra model calls, identity re-stamped, duplicate reported
  ---
  duration_ms: 0.197208
  type: 'test'
  ...
# Subtest: cache is bounded and holds no more than CACHE_LIMIT entries
ok 124 - cache is bounded and holds no more than CACHE_LIMIT entries
  ---
  duration_ms: 1.2365
  type: 'test'
  ...
# Subtest: unobservable bytes fail honestly instead of inventing color
ok 125 - unobservable bytes fail honestly instead of inventing color
  ---
  duration_ms: 0.507666
  type: 'test'
  ...
# Subtest: jpeg DC reader returns a real block grid and rejects what it cannot read
ok 126 - jpeg DC reader returns a real block grid and rejects what it cannot read
  ---
  duration_ms: 0.423791
  type: 'test'
  ...
# Subtest: baseline JPEG is measured, not mis-read: solid colours are exact
ok 127 - baseline JPEG is measured, not mis-read: solid colours are exact
  ---
  duration_ms: 8.460708
  type: 'test'
  ...
# Subtest: baseline and progressive encodings of the same pixels agree
ok 128 - baseline and progressive encodings of the same pixels agree
  ---
  duration_ms: 6.973708
  type: 'test'
  ...
# Subtest: SVG is measured only as the flat-colour card it claims to support
ok 129 - SVG is measured only as the flat-colour card it claims to support
  ---
  duration_ms: 0.551542
  type: 'test'
  ...
# Subtest: SVG text is reported only when a viewer could see it, and unescaped
ok 130 - SVG text is reported only when a viewer could see it, and unescaped
  ---
  duration_ms: 0.356125
  type: 'test'
  ...
# Subtest: composition is a documented constant, not a reading of the colour histogram
ok 131 - composition is a documented constant, not a reading of the colour histogram
  ---
  duration_ms: 2.395417
  type: 'test'
  ...
# Subtest: POST one photo returns one PhotoAnalysis
ok 132 - POST one photo returns one PhotoAnalysis
  ---
  duration_ms: 0.411583
  type: 'test'
  ...
# Subtest: there is no many-photos-per-request path
ok 133 - there is no many-photos-per-request path
  ---
  duration_ms: 0.155833
  type: 'test'
  ...
# Subtest: request validation is explicit at the trust boundary
ok 134 - request validation is explicit at the trust boundary
  ---
  duration_ms: 63.329542
  type: 'test'
  ...
# Subtest: data URL prefixes are accepted, not silently mangled
ok 135 - data URL prefixes are accepted, not silently mangled
  ---
  duration_ms: 0.273541
  type: 'test'
  ...
# Subtest: the heuristic path makes zero outbound attempts with the network disabled
ok 136 - the heuristic path makes zero outbound attempts with the network disabled
  ---
  duration_ms: 53.57175
  type: 'test'
  ...
# Subtest: both input paths produce the same TargetProfile schema with their own source
ok 137 - both input paths produce the same TargetProfile schema with their own source
  ---
  duration_ms: 0.57775
  type: 'test'
  ...
# Subtest: what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence
ok 138 - what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence
  ---
  duration_ms: 0.404709
  type: 'test'
  ...
# Subtest: E1: every Claim in both profiles and the photo plan carries at least one evidence
ok 139 - E1: every Claim in both profiles and the photo plan carries at least one evidence
  ---
  duration_ms: 0.275333
  type: 'test'
  ...
# Subtest: no profile item is made of rule evidence alone
ok 140 - no profile item is made of rule evidence alone
  ---
  duration_ms: 0.145333
  type: 'test'
  ...
# Subtest: a free text mapping cites the matched phrase and the mapping row separately
ok 141 - a free text mapping cites the matched phrase and the mapping row separately
  ---
  duration_ms: 0.153958
  type: 'test'
  ...
# Subtest: an aggregate value can be traced back to the posts it was read from
ok 142 - an aggregate value can be traced back to the posts it was read from
  ---
  duration_ms: 0.064666
  type: 'test'
  ...
# Subtest: free text never invents an empty caption ratio and never rounds up to a default
ok 143 - free text never invents an empty caption ratio and never rounds up to a default
  ---
  duration_ms: 0.212334
  type: 'test'
  ...
# Subtest: free text is the floor that always succeeds, but blank input is not natural language
ok 144 - free text is the floor that always succeeds, but blank input is not natural language
  ---
  duration_ms: 0.283875
  type: 'test'
  ...
# Subtest: an unprepared URL fails and names the fallbacks instead of borrowing another account
ok 145 - an unprepared URL fails and names the fallbacks instead of borrowing another account
  ---
  duration_ms: 0.3965
  type: 'test'
  ...
# Subtest: the photo only path returns a plan, never a TargetProfile with an undefined absent state
ok 146 - the photo only path returns a plan, never a TargetProfile with an undefined absent state
  ---
  duration_ms: 0.266542
  type: 'test'
  ...
# Subtest: the photo only path claims no preference and no sentence
ok 147 - the photo only path claims no preference and no sentence
  ---
  duration_ms: 0.11075
  type: 'test'
  ...
# Subtest: the photo plan aggregates only what a photo can show, and the mixes stay exact
ok 148 - the photo plan aggregates only what a photo can show, and the mixes stay exact
  ---
  duration_ms: 0.073458
  type: 'test'
  ...
# Subtest: boundary: an all blank snapshot yields no language and a carousel free one yields no opener
ok 149 - boundary: an all blank snapshot yields no language and a carousel free one yields no opener
  ---
  duration_ms: 0.164041
  type: 'test'
  ...
# Subtest: the two golden profiles differ in a way a reader can see
ok 150 - the two golden profiles differ in a way a reader can see
  ---
  duration_ms: 10.100417
  type: 'test'
  ...
# Subtest: H1: a negated or contrasted wish is left empty, never flipped into a positive one
ok 151 - H1: a negated or contrasted wish is left empty, never flipped into a positive one
  ---
  duration_ms: 0.319041
  type: 'test'
  ...
# Subtest: H1 control: a plainly positive wish still fills the same fields it always did
ok 152 - H1 control: a plainly positive wish still fills the same fields it always did
  ---
  duration_ms: 0.1565
  type: 'test'
  ...
# Subtest: H2: editing a returned profile never changes what the next call returns
ok 153 - H2: editing a returned profile never changes what the next call returns
  ---
  duration_ms: 2.358041
  type: 'test'
  ...
# Subtest: H3: profile evidence must resolve to the actual input, not merely exist
ok 154 - H3: profile evidence must resolve to the actual input, not merely exist
  ---
  duration_ms: 1.07425
  type: 'test'
  ...
1..154
# tests 154
# suites 0
# pass 154
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 273.640958
```

## npm run eval

종료 코드: 0

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
```

## npm run check

종료 코드: 0

```text

> gyeol@0.1.0 check
> node scripts/check.js

PASS: 48 JS/JSON files checked; four schema examples match fixtures. Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```

## 완료조건 판정과 인계

- PASS: 고정 120/18 입력에서 target=120, current=18, resolved=47, rule=log_midpoint 및 corrected와 간극 1개를 확인했다.
- PASS: 동일값·측정 누락·반올림 후 변경 없음에서 간극 0개이며, 현재 부재 파이프라인이 정상 종료하고 E8을 통과했다.
- PASS: 같은 실측 사진 20장과 다른 지향 두 벌의 position 정렬 photo_id 배열이 다르다. ordered_quiet.json과 ordered_detail.json은 `node scripts/compose-example.js`로 재현한다. 현재 입력은 수동 합성 fixture이며 실제 개인화 품질 증거가 아니다.
- PASS: 합성은 숫자·note_key·원근거·설계 규칙만 내며 UI 문장이나 미측정 빈 캡션 비율을 만들지 않는다. 기존 orderFeed의 순서 근거 문장은 그대로 보존한다.
- PASS: order.js, schemas 4종, src, 배포 설정을 수정하지 않았다. 사진 분석이나 외부 모델 호출을 추가하지 않았다.
- PENDING: HTTP는 목업 전용이며 후속 연결 담당자가 composeFeed를 호출해야 한다. 화면 상단의 “보정 없이 지향만 반영함” 표시는 화면 담당자 인계 항목이고 이번 작업에서 확인하지 않았다.
- PENDING: 서로 다른 모델 2개의 동일 diff 리뷰·사람 계약 합의·merge·배포 검증. Draft 개설은 이 게이트의 완료가 아니다.
- 보드: 시작 때 read:project 부족으로 댓글만 남겼다. Draft 생성 후 재조회가 성공해 실제 칸 “검토·인수 대기”로 갱신했다.

## 인계 전 자체 검토 (sip)

mandela: 순서 비교에서 지향도 바뀌므로 이를 현재축만의 기여 증거로 해석하면 Wrong null hypothesis가 된다. 순서 비교는 기존 순서 계약 확인으로 한정하고, 현재축 효과는 고정 지향 120에 현재 18을 넣어 47로 바뀌는 독립 수치 기대값으로 확인했다. 실제 사용자 품질은 검증하지 않았다.
ssotize 읽기 전용 감사: 계약 원천은 schemas/ordered_feed.md이며 lib/compose.js의 필드·disclosure와 대조했다. log_midpoint의 수학적 세부 규칙은 이 이슈 spec에서 정의하고 구현과 경계 테스트로 확인했다. 기존 스키마의 값을 복제해 새 검증기를 만들지 않았다.
re0: 문서 전체를 다시 읽고 추출 관측과 설계 상수를 구분했다. 새 외부 사실·도구 중립성 주장이 없어 factchk와 detool은 적용하지 않았다.
shower: 설치 역할 agent_type을 지정할 수 있는 네이티브 실행 표면이 이 세션에 없어 별도 무맥락 독자는 실행하지 못했다. 교차 리뷰와 함께 pending이며 자체 읽기를 독립 리뷰로 집계하지 않는다.
## npm run lint

의존성 npm ci --ignore-scripts 설치 후 실행. 종료 코드: 0

```text

> gyeol@0.1.0 lint
> biome check .

Checked 18 files in 23ms. No fixes applied.
```

## npm run typecheck

의존성 npm ci --ignore-scripts 설치 후 실행. 종료 코드: 0

```text

> gyeol@0.1.0 typecheck
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
```

## 리뷰 증거와 잔여 작업

CodeRabbit CLI 0.7.6, 2026-09-17T08:53:27.184632+00:00, `coderabbit review --agent --uncommitted`: 6개 파일 검토 완료, findings=0, 종료 코드 0. 검토한 staged diff SHA-256: `c66bae97a2eb3e701e39cd5428a78e882ed4f3eda7f0299ce5e94ea43f385ed4`. 실제 응답은 [review.txt](review.txt)에 있다. 모델 식별자가 공개되지 않아 두 모델 교차 리뷰를 충족했다고 집계하지 않는다. 메타데이터 baseBranch=main은 CLI 기본값이며 실행 대상은 uncommitted 6개 파일이다. PR 대상은 dev다.

두 JSON 이슈 댓글: https://github.com/Daterl/gyeol/issues/13#issuecomment-5711665626 및 https://github.com/Daterl/gyeol/issues/13#issuecomment-5711665956.

추가 개선 후보는 없다. 기존 후속 연결에서 composeFeed 호출과 target_only 고지 표시를 확인하고, 사람이 계약·교차 리뷰 게이트를 판단한다. 새 기능 종류는 늘리지 않는다.

Draft PR: https://github.com/Daterl/gyeol/pull/44 (base dev, Draft 확인).
