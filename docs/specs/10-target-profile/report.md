# report — #10 TargetProfile 추출

- 기준 SHA: `7d16ff8`
- 브랜치: `feat/10-target-profile`
- 실행 일시: 2026-09-17
- **Verdict: 부분 PASS / DoD 5·8 PENDING** — merge·배포·실모델 검증은 포함하지 않는다.

> **이 문서는 교차 리뷰 전 1차 보고다.** 리뷰(`review-codex.md`)와 그 수정·재검증은
> **`fix-report.md`** 에 있다. 아래 숫자(테스트 74건, check 29파일)는 `origin/main` rebase **전** 값이며,
> rebase 후 값은 `fix-report.md` 를 본다. 리뷰에서 뒤집힌 판정은 이 문서에도 반영했다.

## 1. DoD 대조

| # | 완료 조건 | 판정 | 근거 (아래 절) |
|---|---|:---:|---|
| 1 | 같은 스키마의 TargetProfile 이 두 경로 모두에서 | PASS | 4절 `[1]`, 테스트 61 |
| 2 | 자연어 visual 낮음 / ref language 채워짐 | PASS (수정 후) | 4절 `[2]`, 테스트 62. **부정 입력에서 비워야 할 것을 채우던 결함(리뷰 H1)은 `fix-report.md` 에서 수정**했다 |
| 3 | 모든 Claim 의 evidence ≥ 1 (E1) | PASS | 4절 `[3]`, 테스트 63, `npm run eval` E1 |
| 4 | rule 만으로 된 항목 0개 | PASS | 4절 `[4]`, 테스트 64 |
| 5 | 지향 입력이 비면 사진 근거 계획, 미정의 present:false 없음 | **PENDING** | 구현은 4절 `[5]`, 테스트 70·71 로 재현된다. 그러나 DoD 는 **"#24 에서 합의한" 사진 계획**을 요구하고 `#24` 는 OPEN·댓글 0 이며 `schemas/interaction.md` 가 없다. PhotoPlan 모양은 **합의 전 제안**이므로 PASS 로 셀 수 없다 (리뷰 B1) |
| 6 | 골든 TargetProfile 2벌을 `eval/golden/case_01/` 에 | PASS | 3절, 테스트 74 |
| 7 | ADR-0001 사진만 입력 경로 포함, 취향·습관이라 부르지 않음 | PASS | 4절 `[5]` 고지 문구, 테스트 71 |
| 8 | 임의 URL 에 다른 계정 스냅샷 연결 금지, 대체 경로 안내 | **부분 PASS / PENDING** | 기본 레지스트리의 URL 3종 거부·대안 안내는 PASS (4절 `[8]`, 테스트 69). **#24 가 정할 `source` 기본값 합의는 PENDING** 이고, 주입 레지스트리의 key/handle 불일치는 막지 않는다 (리뷰 M2, 수용 — `fix-report.md` 3절) |

미실행을 PASS 로 쓰지 않았다. 아래 6절에 **아직 안 된 것**을 따로 적었다.
교차 리뷰로 뒤집힌 항목(5·8)과 의미 결함(2)은 `fix-report.md` 에서 다시 판정했다.

## 2. `npm test`

```
# tests 74
# suites 0
# pass 74
# fail 0

ok 61 - both input paths produce the same TargetProfile schema with their own source
ok 62 - what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence
ok 63 - E1: every Claim in both profiles and the photo plan carries at least one evidence
ok 64 - no profile item is made of rule evidence alone
ok 65 - a free text mapping cites the matched phrase and the mapping row separately
ok 66 - an aggregate value can be traced back to the posts it was read from
ok 67 - free text never invents an empty caption ratio and never rounds up to a default
ok 68 - free text is the floor that always succeeds, but blank input is not natural language
ok 69 - an unprepared URL fails and names the fallbacks instead of borrowing another account
ok 70 - the photo only path returns a plan, never a TargetProfile with an undefined absent state
ok 71 - the photo only path claims no preference and no sentence
ok 72 - the photo plan aggregates only what a photo can show, and the mixes stay exact
ok 73 - boundary: an all blank snapshot yields no language and a carousel free one yields no opener
ok 74 - the two golden profiles differ in a way a reader can see
```

기존 60개는 그대로 통과하고 #10 이 14개를 더했다. 새 테스트는 `spec.md` 6절 정확성 기준 8개와 7절 경계값을 1:1로 덮는다.

## 3. `npm run eval` — 골든 교체 전후

`CLAUDE.md` 3-2절: "#10 완료 후 골든 프로필을 실제 추출 결과로 교체할 때 교체 전후 5개 불변식을 다시 확인한다."

**교체 전 (SHA `7d16ff8`, 손으로 쓴 합성 프로필 2벌)**

```
quiet : E1 PASS / E2 PASS / E3 PASS / E6 PASS / E8 PASS
detail: E1 PASS / E2 PASS / E3 PASS / E6 PASS / E8 PASS
의도적 실패 10건 전부 EXPECTED FAIL
```

**교체 후 (추출 결과 2벌)**

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
└─────────┴─────────┴───────────┴────────┴────────┘
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
┌─────────┬──────────┬───────────┬────────┬────────┐
│ (index) │ case     │ invariant │ result │ reason │
├─────────┼──────────┼───────────┼────────┼────────┤
│ 0       │ 'detail' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'detail' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'detail' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'detail' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'detail' │ 'E8'      │ 'PASS' │ ''     │
└─────────┴──────────┴───────────┴────────┴────────┘
detail broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
detail broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
detail broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
detail broken E6: EXPECTED FAIL — E6.title: expected nonempty string
detail broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
E4/E5/E7: manual spot-check only; real demo review pending.
```

**결과: 동일하다.** 프로필을 손으로 쓴 값에서 추출값으로 바꿔도 5개 불변식과 의도적 실패 10건이 그대로다.

교체된 값:

| | quiet | detail |
|---|---|---|
| `profile_id` | `tgt_quiet_freetext` | `tgt_detail_ig_29cm` |
| `source` | `freetext` | `ig_reference` |
| 입력 | "조용하고 짧게, 이모지 없이 해요체로" | 사전 수집 스냅샷 30건 (공개 계정 29cm) |
| `completeness` | visual 0.2 / language 0.6 | visual 0 / language 1 |
| `caption_len` | p50 15자 | p50 292자 · p90 914자 |
| `carousel_count` | 0 | 26 |

`ordered_*.json` 의 `applied_profile` 거울도 같은 스크립트가 다시 썼다. 손으로 고친 JSON 은 없다.

## 4. DoD 실행 증거

`node` 로 세 경로를 실제로 돌린 출력이다.

```
[1] 같은 스키마 · 두 경로
 ig_reference: tgt_ig_5075f917 axis=target present=true sample_size=30
 freetext    : tgt_ft_1b64cd24 axis=target present=true sample_size=1

[2] 비어야 할 것이 비어 있다 (completeness)
 ig_reference: {"visual":0,"language":1,"sequence":0} visual={}
 freetext    : {"visual":0.2,"language":0.6,"sequence":0} language keys=caption_len,emoji_rate,ending_style,banned_words

[3] E1 — 모든 Claim 의 evidence 길이
 ig_reference: claims=5 min evidence=1 (모두 >=1: true)
 freetext    : claims=4 min evidence=1 (모두 >=1: true)
 photo_plan  : claims=4 min evidence=3 (모두 >=1: true)

[4] rule-only 항목 수
 ig_reference: 0개
 freetext    : 0개
 photo_plan  : 0개

[5] 지향 입력이 비었을 때 — PhotoPlan (TargetProfile 아님)
 kind/source : photo_plan / photo_only
 axis·present: false / false  (둘 다 false 여야 한다)
 language    : null
 근거 종류   : aggregate,uploaded_photo
 고지        : 업로드한 사진 15장에서 관측된 값이며 사용자의 취향·과거 습관이 아니다

[6] 골든 2벌 차이 (D6 축)
 quiet  p50 : 15자
 detail p50 : 292자, p90 914자
 어미       : 해요 vs 명사형
 캐러셀     : 0 vs 26

[7] 근거 추적 (P2) — 집계값이 어느 게시물에서 왔는가
[
 {
  "kind": "aggregate",
  "ref": "ig_snapshot_29cm_2026-09-17",
  "note": "비어 있지 않은 캡션 30건의 길이 분포"
 },
 {
  "kind": "ig_post",
  "ref": "DdVDlTviVrG",
  "note": "캡션 292자"
 },
 {
  "kind": "ig_post",
  "ref": "DdFvaJRiXnx",
  "note": "캡션 914자"
 }
]

[8] 준비되지 않은 URL
 https://www.instagram.com/someone_else/
   → REFERENCE_NOT_PREPARED supported=["29cm"] fallbacks=["freetext","photo_only"]
 https://www.instagram.com/p/DdVKdyACaC1/
   → REFERENCE_NOT_PREPARED supported=["29cm"] fallbacks=["freetext","photo_only"]
 https://example.com/29cm
   → REFERENCE_NOT_PREPARED supported=["29cm"] fallbacks=["freetext","photo_only"]
```

## 5. `npm run check`

```
PASS: 29 JS/JSON files checked; zero dependencies; four schema examples match fixtures.
JS syntax/JSON parsing only, no separate typechecker or linter.
```

`schemas/` 4종과 `fixtures/` 샘플의 일치가 유지된다 — **스키마를 한 글자도 바꾸지 않았다.**

## 6. 아직 안 된 것 (PASS 아님)

| 항목 | 상태 | 왜 |
|---|---|---|
| `PhotoPlan` 모양의 양측 합의 (DoD 5·8) | **PENDING — merge 전 사람 합의 필요** | `#24` 가 열려 있다 (OPEN, 댓글 0). `schemas/interaction.md` 가 아직 없어 합의된 이름·source 기본값이 없다. TargetProfile 스키마를 건드리지 않는 쪽으로 제안만 했다 |
| 모델 경로 배선 | **미착수 (의도)** | `prompts/input/target_extract.md` 는 계약 문서이고 코드는 결정적 규칙만 쓴다. `#6` A1 실측 전에 모델을 크리티컬 패스에 넣지 않는다 |
| ref 스냅샷 계정 수 | 1개 (`29cm`) | 레지스트리 구조는 N개를 받지만 준비된 스냅샷이 1벌이다. 준비 안 된 핸들은 실패가 정답이다 |
| `ending_style` 분류 정확도 | 사람 대조 안 함 | 29cm 30건 중 21건 `명사형` (72%). 근거에 마지막 문장 원문이 붙어 있어 되짚을 수 있지만 **사람이 전수 대조하지 않았다** |
| `opener_tendency` | 항상 생략 | ref 이미지 분석 경로가 `intent.md` C2 로 잘렸다. 사진만 입력에서도 순서 판단은 `#11` 몫이다 |
| 배포 환경 검증 | 해당 없음 | 이 PR 은 `lib/`·`fixtures/`·`eval/` 만 바꾸며 서버 함수 동작을 바꾸지 않는다 |
| 다중 모델 리뷰 | 미실행 | size/M 에서 권장. 시간상 생략 |

## 7. 남긴 판단

- **`PhotoPlan` 을 TargetProfile 안에 넣지 않았다.** `schemas/target_profile.md` 는 target 축에 `present:true` 와
  `source: ig_reference|freetext` 만 허용한다. 사진만 입력을 여기 넣으려면 스키마를 바꿔야 하는데 그건 `#24` 양측 합의 사안이다.
  스키마를 안 바꾸고 별도 `kind:"photo_plan"` 으로 낸 뒤, 필요하면 `#24` 에서 이름을 정하는 쪽이 되돌리기 쉽다.
- **자연어에서 `empty_caption_ratio` 를 만들지 않았다.** "가끔 비워"를 숫자로 바꿀 근거가 없다.
  비우는 쪽이 P3 이고, 그래서 `completeness.language` 가 0.6 에서 멈춘다. 이 0.4 는 실패가 아니라 정직함이다.
- **`ending_style` 의 마지막 문장 규칙이 두 번 틀렸다.** 처음엔 `9. 30 (수)` 같은 날짜의 마침표를 문장 끝으로 읽었고,
  다음엔 캡션 끝 일정 줄(`9·17 (목) 10:00 - ...`)을 어미로 읽었다. 두 규칙을 `spec.md` 4절에 적고 고쳤다.
