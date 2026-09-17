# PR #21 독립 Claude 리뷰 — 3차

**Merge 판정: 조건부.** 아래 BLOCKER(B1)의 PR 상태 문제를 사람이 판단해 되돌리거나 명시적으로 수용하고, HIGH 2건(H1·H2)을 고치거나 계약 책임자가 수용을 기록한 뒤에 상대 사람이 merge할 수 있다. 코드 실행 장애는 발견하지 못했다.

## 1. 리뷰 신원과 기준

- 대상: https://github.com/Daterl/gyeol/pull/21
- 실행: 2026-09-17 KST, macOS(Darwin 24.6.0), Node `v22.22.3`.
- HEAD: `7d16ff870f1304de8ec86a5de4ac1b7fa8103a4c`, base: `92cbb4d35e5a5d34185d616bafa290b490b87de8`. 59파일 +5207/-52.
  1차(`review.md`)는 `7ed8d4c` 기준, 2차(`review-codex.md`)와 본 리뷰는 같은 `7d16ff8` 기준이다.
- **리뷰 모델: Claude Opus 5 (`claude-opus-5`).** 이 값은 실행 하네스가 세션에 알려준 모델 ID이며, 내가 외부에서 독립 확인한 값이 아니다. 코디네이터가 dispatch 기록의 `projection.provider.model` 로 대조해 주기를 요청한다.
  - 1차·2차는 둘 다 `gpt-6-astra` 였다(`review-codex.md` "리뷰 모델" 절). **본 리뷰가 다른 모델이므로, 모델 ID 대조가 끝나면 `CLAUDE.md:238` 의 "L의 두 모델 리뷰" 게이트는 이 리뷰로 닫힌다.** 남는 게이트는 사람의 계약 합의다(B1 참조).
- **제품 코드·fixture·스키마·원격 PR 을 수정하지 않았다.** 모든 변형 실험은 `structuredClone` 사본 또는 scratchpad 에서만 했다. 추가한 파일은 이 보고서 하나다.
  - 리뷰 시작 시점에 이미 워크트리에 있던 것: `.gitignore` 의 `/.workflow-be/` 한 줄 수정, 미추적 `docs/issue-review.md`, 미추적 `review-codex.md`. **내가 만든 것이 아니며 건드리지 않았다.**
- 1·2차가 이미 지적한 내용은 재확인만 하고 다시 쓰지 않는다. 5절은 **새로 찾은 것만** 담는다.

## 2. 실행 명령과 실제 출력

```sh
node --version          # v22.22.3
npm test
npm run eval
node scripts/check.js
PORT=43231 node scripts/server.js   # 실제 로컬 HTTP
gh pr view 21 --repo Daterl/gyeol --json isDraft,reviewDecision,mergeStateStatus
```

`npm test` (요약부):

```text
1..60
# tests 60
# suites 0
# pass 60
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 102.884333
```

`npm run eval` (exit 0):

```text
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
(detail 케이스도 동일하게 5 PASS / 5 EXPECTED FAIL)
E4/E5/E7: manual spot-check only; real demo review pending.
```

`node scripts/check.js`:

```text
PASS: 25 JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.
```

실제 로컬 HTTP (curl, `PORT=43231`):

```text
GET ?mock=1                 -> 200
GET ?mock=1&resource=ordered_feed   -> 200  OBJECT keys=schema_version,feed_id,session_id,applied_profile,slots,invariants,generated_at (slots=15)
GET ?mock=1&resource=photo_analysis -> 200  ARRAY len=15
GET ?mock=1&resource=target_profile -> 200  ARRAY len=2  ["tgt_synthetic_quiet","tgt_synthetic_detail"]
GET ?mock=1&resource=current_profile-> 200  ARRAY len=2  ["cur_synthetic", null]
GET (mock 없음)             -> 501 {"error":{"code":"LIVE_NOT_IMPLEMENTED","message":"Live generation is not implemented; use ?mock=1 for synthetic fixtures."}}
GET ?mock=0                 -> 400
GET ?mock=1&resource=bogus  -> 400
POST ?mock=1                -> 405 {"error":{"code":"METHOD_NOT_ALLOWED"}}
POST (mock 없음)            -> 405   ← 501 이 아니다. 6절 참조
```

## 3. 1·2차 주장 재현 여부

| 주장 | 출처 | 내 실행 결과 | 판정 |
|---|---|---|---|
| 테스트 60/60 | 1차·2차 | 60 실행 / 60 pass / 0 fail | **재현** |
| 정상 불변식 10건 PASS | 1차·2차 | quiet·detail 각 E1/E2/E3/E6/E8 PASS | **재현** |
| broken 예상 실패 10건 | 1차·2차 | 10건 모두 EXPECTED FAIL, eval exit 0 | **재현** |
| check 통과·의존성 0 | 1차·2차 | 25파일, 예시 4종 일치 | **재현** |
| 실제 HTTP mock 200 / live 501 | 1차·2차 | 위 curl 출력 그대로 | **재현** |
| 입력 0장·21장 거부 | 2차 | 0·1·2·21 전부 `REJECT inputPhotoIds: requires 3..20 photos`, 3·20 PASS | **재현 + 확장** |
| M1 사진 사실 변조를 eval 이 못 잡는다 | 2차 | 재현. 더 잡기 어려운 형태로도 재현 (4절) | **재현** |
| L1 E1 단독은 프로필 Claim 형태 삭제를 못 잡는다 | 2차 | `validateFeed` 는 rule-only evidence 를 거부하지만 `evaluate().E1` 은 PASS. 단독 판정 한계 확인 | **재현** |
| L2 존재하지 않는 날짜 통과 | 2차 | `date()` 가 `Date.parse` 유한값만 보므로 재현 | **재현** |
| 1차 P2 2건이 반영됐다 | 1차 | `lib/contracts.js:120`(무조건 `validateProfile(currentProfile)`), `:152`(user 상태의 `user_text` 강제) 확인. 회귀 테스트 `test/contracts.test.js:108–115` 존재 | **재현** |
| 두 모델 게이트 미충족 (B1) | 2차 | **본 리뷰로 모델 축은 닫힌다. 다만 PR 상태가 그 사이에 바뀌었다 → 5절 B1** | **상태 변경** |

## 4. 2차 MEDIUM(M1, 사진 사실 복사) 재현 결과와 판단

### 재현 — 했다. 그리고 2차보다 잡기 어려운 형태로도 통과한다

2차는 `describable_facts` 를 `['Invented fact absent from photo analysis']` 같은 **명백히 가짜인 문자열**로 바꿔 통과를 보였다. 나는 한 단계 더 나쁜 형태를 넣었다 — **같은 입력 묶음 안의 다른 사진의 사실을 그대로 복사**한 것이다.

```text
ph_01 원래 facts = ["단색 카드","synthetic 1 표기"]
ph_09 의 facts   = ["단색 카드","synthetic 9 표기"]
→ ph_01 슬롯의 facts 를 ph_09 것으로 교체

validateFeed   : PASS
validateExport : PASS
evaluate       : E1:P E2:P E3:P E6:P E8:P
```

이 형태가 더 나쁜 이유는 두 가지다. 첫째, 값이 여전히 **이 세션에 실제로 존재하는 사진의 실제 사실**이라 사람이 눈으로 훑어도 이상해 보이지 않는다("Invented fact…" 는 눈에 띈다). 둘째, 실제 서비스에서 이 오류는 날조가 아니라 **인덱스 밀림·매핑 버그**로 자연스럽게 발생하는 형태다. 즉 M1 이 막지 못하는 것은 악의적 변조가 아니라 **가장 흔한 종류의 실수**다.

### 판단 — `20-product-definition.md` F3 기준을 지키지 못하게 하는가: **그렇다. 단, 조건부다**

F3 정확성 기준 첫 줄: *"사진에 없는 사실을 단정한다 (장소·인물·시간·감정 날조). PhotoAnalysis 에 없는 정보를 문장에 넣으면 틀린 것이다."*

- `caption_inputs.describable_facts` 는 F3 가 캡션을 쓸 때 쓰는 **재료 목록**이다(`schemas/ordered_feed.md:35` "사진 목록에서 caption_inputs.describable_facts 를 복사한다").
- 재료가 ph_09 것인데 캡션이 ph_01 에 붙으면, F3 가 규칙을 완벽히 지켜 "재료 안에서만" 써도 **결과는 ph_01 에 없는 사실을 단정한 문장**이 된다. F3 의 잘못이 아니라 F2 단계에서 이미 틀린 것이다.
- 그런데 이 PR 의 스코프는 "계약·목업·검증 기반"이고 F3 자체는 없다. 그래서 **지금 당장 틀린 출력이 나가고 있지는 않다** — 현재 15슬롯의 실제 값은 `fixtures/photo_analysis.sample.json` 과 전부 일치함을 직접 확인했다(quiet·detail 양쪽, 부분집합 위반 0건).
- 문제는 **이 검증 기반이 그 일치를 지켜줄 수 없다**는 것이다. 지금 맞는 것은 사람이 손으로 맞춰 놨기 때문이지 검증기가 막아서가 아니다.

**여기에 2차가 못 본 것을 하나 더한다.** `CLAUDE.md:280` 은 E4(캡션의 고유명사가 `describable_facts` 안에 있다)를 **자동 판정 생략 → 수동 스팟체크**로 명시적으로 내렸다. 즉 F3 정확성 체인의 **뒤쪽 절반(재료→캡션)은 이미 "검증 안 함"이 기록된 결정**이다. M1 이 보여준 것은 **앞쪽 절반(사진→재료)도 검증되지 않는다**는 것이고, 이쪽은 **기록된 결정이 아니다**. 체인 양쪽이 모두 열려 있고 한쪽만 합의된 상태다.

### 최소 조치 (스코프를 키우지 않는다)

1. **mock 경로는 지금 당장 공짜다.** `api/feed.js:9–14` 는 이미 `photos` 와 `feed` 를 같은 스코프에 들고 있다. 한 줄이면 된다 — feed 의 각 슬롯 `describable_facts` 가 같은 `photo_id` 의 `PhotoAnalysis.describable_facts` 의 부분집합인지 확인.
2. **eval 경로는 한 파일이 더 필요하다.** 2차가 언급하지 않은 사실인데, **`eval/golden/case_01/` 에는 PhotoAnalysis 파일이 아예 없다**(`current_profile / export_* / input / ordered_* / target_* / photos/*.svg` 뿐). 즉 골든 번들만으로는 이 대조를 **할 수가 없다.** `eval/golden/case_01/photo_analysis.json` 을 추가해야 비로소 가능하다.
3. 하지 않는다면, `schemas/ordered_feed.md:50` 이 이미 E4/E5/E7 에 대해 하고 있는 것처럼 **"사진→재료 복사 규칙은 자동 검증 범위 밖"이라고 같은 줄에 적고 사람이 수용을 기록**한다. 지금은 계약이 "복사한다"고 단언만 하고 검증은 없다.

의미 분석·AI 호출·E4 구현을 요구하는 것이 아니다.

## 5. 새로 찾은 지적

### BLOCKER

**B1. 필수 게이트가 통과되기 전에 PR 이 Draft 에서 Ready 로 전환됐고, 지금 merge 가능 상태다.**

`CLAUDE.md:238` 원문: *"Ready for review는 해당 크기의 필수 사전 게이트(필요한 테스트·요구사항 검증·**L의 두 모델 리뷰·계약 합의**)가 통과한 뒤다."*
이 PR 은 `schemas/` 4종을 새로 넣으므로 L 이고, `CLAUDE.md:188` 은 *"양쪽 사람이 이슈에 '합의함'을 남긴다. **미응답은 pending이다.**"* 라고 못 박는다.

확인한 실제 상태:

```text
gh pr view 21 --json isDraft,reviewDecision,mergeStateStatus,state
{"isDraft":false,"mergeStateStatus":"CLEAN","reviewDecision":"APPROVED","state":"OPEN"}

timeline event: {"event":"ready_for_review","actor":"jangwonyoon","created_at":"2026-09-17T06:22:50Z"}
reviews:        {"user":"jangwonyoon","state":"APPROVED","submitted_at":"2026-09-17T06:22:56Z",
                 "commit_id":"7d16ff870f1304de8ec86a5de4ac1b7fa8103a4c", body=""}
last commit:    7d16ff87 at 2026-09-17T05:45:20Z
issue #1 / #7 / #8 comments: 0건
PR #21 comments:              0건
```

사실관계만 적는다.

1. **2차 리뷰는 06:11~06:17Z(15:11~15:17 KST)에 실행돼 "두 모델 게이트 미충족, Draft 유지"로 끝났다.** 그로부터 **약 6분 뒤인 06:22:50Z 에 Ready 로 전환**됐고, 6초 뒤 승인이 달렸다.
2. **승인 본문은 비어 있다.** 지적도 근거도 없다.
3. **`schemas/` 합의는 어디에도 기록돼 있지 않다.** 이슈 #1·#7·#8 과 PR #21 의 코멘트가 전부 0건이다. `CLAUDE.md:188` 의 "이슈에 합의함을 남긴다"가 충족된 흔적이 없다. 규칙상 미응답 = pending 이다.
4. 전환 시점 기준으로 기록된 리뷰는 1차·2차 **둘 다 `gpt-6-astra`** 였다. 즉 "두 모델 리뷰"도 그 시점에 미충족이었다.

**이것은 코드 결함이 아니라 PR 상태 결함이다.** 그리고 merge 권한(`CLAUDE.md:241` "merge는 상대 사람 리뷰어가 누른다")은 지켜지고 있다 — PR 작성자는 `onejaejae`, 승인자는 `jangwonyoon` 으로 서로 다르다. 문제는 **누가 누르느냐가 아니라 누르기 전에 닫혔어야 할 게이트**다.

**최소 조치:** 사람이 둘 중 하나를 고른다. ① Draft 로 되돌리고 `schemas/` 합의를 이슈 #1 에 기록한 뒤 다시 Ready 로 올린다. ② 게이트를 의도적으로 건너뛴 것이라면 **그 결정과 이유를 PR 본문 또는 이슈 #1 에 기록**한다. AI 가 대신 판단할 사안이 아니므로 나는 어느 쪽도 실행하지 않았다.

> 참고: 본 리뷰가 기록되면 **모델 축 게이트는 닫힌다**(1절). B1 이 남기는 것은 **사람의 계약 합의 기록**이다.

### HIGH

**H1. 지향축(TargetProfile)에는 E8 에 해당하는 대조 장치가 아예 없다. 출력이 지향 프로필 전체를 지어내도 전부 통과한다.**

- 위치: `lib/contracts.js:126` (`validateFeed(v, inputPhotoIds, currentProfile)`), `:129`, `eval/run.js:12`, `eval/invariants.js:4`.
- **`validateFeed` 는 TargetProfile 을 인수로 받지 않는다.** 현재축은 `validateDisclosure`(`:117–124`)가 실제 `CurrentProfile` 입력과 ID 를 대조하지만(E8), 지향축은 `target_profile_id` 를 **nonempty string 인지만** 보고(`:129`), `applied_profile.visual/language/sequence` 는 **형태만** 본다.

실제 실행 결과:

```text
### N1a  target_profile_id 를 존재하지 않는 값으로 교체
  target_profile_id = 'tgt_DOES_NOT_EXIST_ANYWHERE'
  validateFeed: PASS   validateExport: PASS   evaluate: E1:P E2:P E3:P E6:P E8:P

### N1b  적용된 지향 값을 실제 TargetProfile 과 정반대로 교체
  실제 target tone_words   = ["조용하고 짧게"]      → 적용값 ["시끄럽고 길게","과장되게"]
  실제 target caption_len  = {"p50":18,"p90":18}   → 적용값 {"p50":900,"p90":1200}
  target_profile_id        = 'tgt_invented'
  validateFeed: PASS   validateExport: PASS   evaluate: E1:P E2:P E3:P E6:P E8:P
```

- **왜 HIGH 인가.** `20-product-definition.md` 는 **`TargetProfile` 이 주축**이고 `CurrentProfile` 은 보정축이라고 명시한다. 이 PR 은 보정축(E8)은 두 번이나 단단히 막았고(1차 P2 반영 포함) **주축은 한 번도 막지 않았다.** F2 정확성 기준 첫 줄이 *"배열 근거를 `PhotoAnalysis` 필드나 `merged` 항목으로 역추적할 수 없다 → P2 위반"* 인데, `merged` 에 해당하는 `applied_profile` 자체가 검증되지 않으면 **그 아래 15개 rationale 이 전부 검증되지 않은 것을 근거로 삼는다.**
- **현재 fixture 는 틀리지 않았다.** `ordered_feed.sample.json` 의 `tgt_synthetic_quiet`, 골든 quiet/detail 모두 대응하는 target 파일의 `profile_id` 와 일치함을 직접 확인했다. 지금 맞는 것은 검증기 덕분이 아니다.
- **최소 조치:** `eval/run.js:12` 는 **이미 `target_${name}.json` 을 읽어서 `evaluate()` 에 넘기고 있다**(E1 이 쓴다). 객체가 이미 손에 있다. `applied_profile.target_profile_id === targetProfile.profile_id` 한 줄 대조만 추가하면 된다. **값 수준의 합성 검증은 요구하지 않는다** — 두 축을 섞는 규칙(`tilt`)이 이 PR 에 정의돼 있지 않으므로 지금 스코프가 아니다. ID 동일성만이 지금 검증 가능한 전부다.

**H2. Evidence 는 "있는지"만 보고 "무엇을 가리키는지"는 아무도 보지 않는다. 존재하지 않는 사진을 근거로 대도 전부 통과한다.**

- 위치: `lib/contracts.js:19–22` (`validateEvidence`), `:26`, `:151`, `eval/invariants.js:6–10` (E1).
- `validateEvidence` 는 `kind` 가 enum 안이고 `ref`·`note` 가 비어 있지 않은 문자열인지만 본다. E1 은 `evidence.length > 0` 만 본다. **`ref` 가 실제 입력 사진을 가리키는지는 어디서도 검사하지 않는다.**

```text
### N6   슬롯 rationale 의 evidence.ref 를 입력에 없는 'ph_NOT_AN_INPUT' 으로 교체
  validateFeed: PASS   validateExport: PASS   evaluate: E1:P E2:P E3:P E6:P E8:P
### N6b  export 슬롯의 evidence.ref 를 'ph_NOT_AN_INPUT' 으로 교체
  validateFeed: PASS   validateExport: PASS   evaluate: E1:P E2:P E3:P E6:P E8:P
```

- **왜 HIGH 인가.** E2 는 `slots[].photo_id` 를 실제 입력과 대조한다. 그런데 **같은 슬롯의 `rationale.evidence[].ref` 는 대조하지 않는다.** 즉 사진 보존은 지키면서 **그 사진에 대한 근거는 다른(존재하지 않는) 사진을 가리킬 수 있다.** 이것이 P2(근거 추적)의 실체를 비운다 — 근거가 **있기는 한데 아무 데도 닿지 않는** 상태가 전 검증을 통과한다. 골든 fixture 의 evidence 는 전부 `kind:"uploaded_photo"`, `ref:"ph_NN"` 형태라서 이 대조가 당장 적용 가능하다.
- **최소 조치:** `validateFeed` 는 `inputPhotoIds` 를 이미 인수로 받는다. `kind === 'uploaded_photo'` 인 evidence 에 한해 `ref ∈ inputPhotoIds` 를 강제한다. 다른 `kind`(`ig_post`/`user_text`/`aggregate`/`rule`)는 참조 도메인이 이 계약 안에 없으므로 **건드리지 않는다.** H1 과 같은 뿌리(존재 검사 vs 해소 검사)이고 고치는 모양도 같다.

### MEDIUM

**M2. 보정(corrected) 분기는 골든·mock 어디에도 없다. 다음 슬라이스가 그 형태를 한 번도 못 본다.**

확인한 값:

```text
fixtures/ordered_feed.sample.json        disclosure=target_only corrected=false deltas=0 current_profile_id=null
eval/golden/case_01/ordered_quiet.json   disclosure=target_only corrected=false deltas=0 current_profile_id=null
eval/golden/case_01/ordered_detail.json  disclosure=target_only corrected=false deltas=0 current_profile_id=null
eval/golden/case_01/current_profile.json present=false / profile_id=null
eval/broken/E8.json = {"path":["applied_profile","disclosure"],"value":"corrected"}   ← absent 쪽을 한 번 더 때리는 변형
```

- 정상 10건·broken 10건이 **전부 `present=false` / `target_only` 한쪽 가지**에 있다. `corrected=true` + 실제 delta 조합은 골든에도, mock 에도, broken 에도 없다.
- 계약과 단위 테스트는 이 분기를 덮는다(`lib/contracts.js:122–124`, `test/contracts.test.js:120–126`). **그래서 "미검증 코드"가 아니다.** 문제는 다른 데 있다 — **`?mock=1` 로 붙는 F3 개발자는 non-null `current_profile_id` 도, `corrected` 고지도, delta 도 평생 한 번도 못 받는다.** 그런데 `20-product-definition.md` 의 **간극 카드**(지표 L5 ②, F1-5 규칙 2)가 바로 그 분기 위에 서 있다. 목업이 한쪽 가지만 보여주면 화면은 그 한쪽만 구현된다.
- **최소 조치:** `fixtures/current_profile.sample.json` 에 **이미 `present:true` 인 `cur_synthetic` 이 있고**, `test/contracts.test.js:123` 에 **유효한 delta 한 벌이 이미 적혀 있다.** 둘을 붙여 골든 case_02 하나를 추가하면 끝난다. 새 기능도, 새 규칙도 필요 없다.

**M3. 순서축(sequence) 은 어떤 fixture 에서도 실측 형태를 갖지 않는다. 그런데 F2 의 근거가 바로 그 축이다.**

```text
carousel_count 값: 전부 0
  fixtures/current_profile.sample.json:66 / target_profile.sample.json:66,135 / ordered_feed.sample.json:62
  eval/golden/case_01/{target_quiet,target_detail,ordered_quiet,ordered_detail}.json
opener_tendency: schemas/*.md 문서에만 존재. fixtures·eval·test 전체에 실물 0건
sample_size: 전부 0 또는 1
```

- `lib/contracts.js:74` 는 `carousel_count === 0` 이면 `opener_tendency` 가 `'불명'` 이어야 한다고 강제한다. 모든 fixture 가 0 이므로 **순서축에서 실제로 밟히는 경로는 "캐러셀 근거 없음 → 불명" 하나뿐**이다. `풀샷/클로즈업/인물` 분기는 어디에서도 실행되지 않는다.
- 실측 대조 (`pivot/apify-check/fixtures/`, 직접 집계):

  | 계정 | 게시물 | 캐러셀 | 캐러셀 장수 분포 | 단일/영상 |
  |---|---|---|---|---|
  | `ig_feed_29cm.json` (한글) | 30 | **26** | 7·8·9(2)·10(19)·13·15·16 | 4 (Video) |
  | `dazedkorea_ko.json` (한글) | 10 | 5 | 5·7·10·11(2) | 5 (Video) |
  | `ig_feed_humansofny.json` | 100 | 71 | 2~**20** (20장 1건) | 29 |
  | `wantedlab_ko.json` | 11 | 4 | 3(4건) | **7 (단일 Image)** |

  현실은 캐러셀이 **다수**다. fixture 는 전부 0 이다.
- `20-product-definition.md` 의 트리거 **T2("캐러셀 1번 장을 고르는 순간")** 와 F2 의 근거 예시(*"기존 캐러셀 3건 모두 1번이 풀샷이었음"*)가 **아무 fixture 도 덮지 않는 가지 위에** 있다.
- **최소 조치:** 기존 target fixture 하나의 `carousel_count` 를 실측에 가까운 값으로 올리고 `opener_tendency` Claim 을 채운다. 파일 추가 없이 한 fixture 수정이면 된다.

**M4. `completeness` 는 실제 필드 개수와 전혀 대조되지 않는다. "모르면 생략하고 completeness 를 낮춘다" 의 뒤쪽 절반이 비어 있다.**

- 위치: `lib/contracts.js:80`, `:90`. 검사하는 것은 **0..1 범위**와 **`completeness.language===0 ⟺ language===null`** 둘뿐이다.
- `schemas/ordered_feed.md:10` 원문: *"알 수 없는 프로필 판단은 해당 필드를 **생략하고 completeness를 낮춘다**."* 생략은 허용되지만 **낮추는 쪽은 강제되지 않는다.**

```text
visual 이 5축 중 tone_words 1개만, language 가 5개 Claim 중 caption_len 1개만 있는 프로필에
completeness = {visual:1, language:1, sequence:1} 을 선언  →  validateProfile PASS
```

- **실측이 이걸 바로 때린다.** `wantedlab_ko` 는 11건 중 **10건이 빈 캡션**이다. 이 계정의 `ending_style`·`emoji_rate`·`linebreak_habit` 은 관측할 근거가 없으므로 생략해야 한다(생략 자체는 계약이 허용한다 — 실제로 넣어 보니 PASS). 그런데 **그렇게 생략하고도 `completeness.language = 1.0` 을 선언하는 것을 아무것도 막지 않는다.**
- **왜 중요한가.** F3 정확성 기준 마지막 줄: *"언어 축이 선언값뿐인데 '당신의 말투는' 이라고 단정한다 → 위반. **근거 강도에 맞는 문장을 써야 한다.**"* `completeness` 가 바로 그 "근거 강도"를 나르는 숫자인데, 지금은 **아무 근거 없이 아무 값이나 쓸 수 있는 자유 숫자**다.
- **최소 조치:** 축별로 `completeness ≤ (존재하는 필드 수 / 정의된 필드 수)` 를 강제한다. 정확한 가중치 규칙을 새로 정의하라는 뜻이 아니라 **상한만** 거는 것이다.

**M5. 보이지 않는 문자가 "비어 있지 않은 문자열" 검사를 통과한다 — 한국어 사용자에게 특히 그렇다.**

- 위치: `lib/contracts.js:8` — `text = (v,p) => ok(typeof v === 'string' && v.trim().length > 0, ...)`.
- JS `trim()` 은 공백·NBSP·BOM 은 지우지만 **U+3164 HANGUL FILLER**, **U+200B ZERO WIDTH SPACE**, **U+2800 BRAILLE BLANK** 은 지우지 않는다.

```text
U+3164 HANGUL FILLER     trim().length = 1  → text() 통과
U+200B ZERO WIDTH SPACE  trim().length = 1  → text() 통과
U+2800 BRAILLE BLANK     trim().length = 1  → text() 통과
U+FEFF BOM / U+00A0 NBSP / 공백            → 정상 거부

### N3a  title = "ㅤ"        validateExport: PASS   evaluate: E6:P
### N3b  title = "​"        validateExport: PASS   evaluate: E6:P
### N3c  filled 캡션 text = "ㅤㅤㅤ"   validateExport: PASS
```

- **`schemas/ordered_feed.md:43` 이 이미 "title은 공백만인 값을 허용하지 않는다"고 적어 놨다.** 새 요구가 아니라 **적힌 규칙이 구현에서 안 지켜지는** 경우다.
- **왜 한국어 특화인가.** U+3164(ㅤ)는 한국 인스타그램 사용자가 **캡션·줄을 비어 보이게 만들 때 쓰는 표준 수법**이다. 우리 1차 타깃이 정확히 그 사용자다.
- **왜 제품이 아픈가.** F3 규칙 1 은 `비움` 과 `채움` 을 **1급 구분**으로 못 박는다 — *"빈 칸은 '아직 안 한 일'로 읽히고, 카드는 '내려진 판단'으로 읽힌다."* U+3164 로 채운 `filled` 슬롯은 **화면에서는 빈 칸인데 계약상으로는 채워진 것**이다. W3(비움이 1급 결과)의 구분이 조용히 무너진다.
- **최소 조치:** `text()` 의 비어 있음 판정 직전에 default-ignorable + Hangul filler 계열을 한 번 제거한다. 예: `v.replace(/[\s​-‏⁠⠀ㅤ﻿]/gu, '').length > 0`. 한 줄이고 다른 검사에 영향이 없다.

**M6. mock 은 CurrentProfile 을 두 벌 내려주면서 "어느 쪽이 입력이었는지"를 끝내 말하지 않는다. 계약이 금지한 추론을 클라이언트가 할 수밖에 없다.**

```text
GET ?mock=1&resource=current_profile → ARRAY len=2
  [0] profile_id="cur_synthetic" present=true    ← 연결 필드 없음
  [1] profile_id=null            present=false   ← 연결 필드 없음
GET ?mock=1&resource=ordered_feed   → current_profile_id = null,  session_id = "ss_synthetic"
```

- `api/feed.js:14` 는 서버 안에서 `currents.find(p => !p.present)` 로 **한쪽을 고른다.** 그 선택은 HTTP 로 전혀 나가지 않는다.
- 그런데 `schemas/ordered_feed.md:33` 은 *"**출력의 current_profile_id로 입력을 추측하거나** 생략된 입력을 자동 보정하지 않는다"* 라고 명시한다. 그리고 **E8 을 돌리려면 실제 CurrentProfile 입력이 필수**다(같은 줄).
- 즉 **mock 을 소비하는 클라이언트가 E8 을 스스로 돌리려면, 계약이 금지한 바로 그 추론을 해야 한다.** 두 축의 비대칭이 선명하다 — **지향축은 ID 로 해소는 되지만 검증이 없고(H1), 현재축은 검증은 되지만 HTTP 로 해소가 안 된다(M6).**
- 이것이 **"mock 과 live 의 계약이 실제로 같은가"에 대한 내 답**이다. live 는 실제 입력 CurrentProfile 이 정확히 하나일 것이므로 이 모호성이 없다. **mock 에만 있는 모호성이고, live 가 501 이라 아무도 마주친 적이 없다.**
- **최소 조치:** 셋 중 하나. ① feed 에 어느 current 가 입력이었는지 참조를 싣는다, ② mock 이 feed 에 대응하는 current **한 벌만** 내려준다, ③ 못 싣는다면 `schemas/ordered_feed.md` 의 Mock HTTP 절에 **"mock 의 E8 입력은 `present:false` 쪽"이라고 한 줄 적는다.** ③이 가장 싸다.

### LOW

**L3. unknown field 차단(`keys()`)이 4개 객체에만 걸려 있고 나머지는 전부 열려 있다.**

```text
applied_profile.visual 에 모르는 키 추가   → REJECT   (keys() 가 걸린 곳)
feed 루트에 predicted_reach              → PASS
slots[] 루트에 engagement_score          → PASS
caption_inputs 에 place:"제주 애월 카페"   → PASS
applied_profile 루트에 tilt              → PASS
invariants 에 all_good:true              → PASS
export slots[] 에 predicted_likes        → PASS
evidence 에 임의 키                       → PASS
```

- `keys()` 는 `visual`/`language`/`sequence`/`F3Export` 루트에만 적용된다(`lib/contracts.js:48,58,71,136`).
- 2차는 "unknown-field 처리 미규정"을 **cold-read 질문**으로만 남겼다. 새로 적는 것은 **이 비대칭** — 일부는 닫고 일부는 연 상태이고, 어느 쪽이 의도인지 계약에 없다.
- 제품 관점 한 가지: `20-product-definition.md` 5절은 **인게이지먼트 예측 점수**를 *"나중에 추가가 아니라 원칙적으로 안 하는 쪽"* 으로 못 박았다. `export.slots[].predicted_likes` 는 지금 전 검증을 통과한다.
- **최소 조치:** 나머지 객체에도 `keys()` 를 걸거나, 계약에 "미정의 필드는 무시한다"를 한 줄 적는다. 둘 중 무엇이든 정하면 된다.

**L4. `narrative_role` 에 개수 규칙이 없다 — 이건 구현 결함이 아니라 계약 문서의 빈칸이다.**

```text
15슬롯 전부 narrative_role="opener"            → validateFeed PASS, 전 불변식 PASS
opener 0개 (position 1 이 "closer")            → validateFeed PASS, 전 불변식 PASS
```

- `lib/contracts.js:132` 는 enum 소속만 본다. `schemas/ordered_feed.md:25` 도 `opener / sustain / turn / closer` 네 값만 적고 개수·위치를 말하지 않는다. **구현은 문서를 정확히 따르고 있다.** 빠진 것은 문서 쪽이다.
- 다만 `20-product-definition.md` 의 **T2** 는 *"캐러셀 1번 장을 고르는 순간"* 을 세 트리거 중 하나로 이름 붙였다. opener 가 0개이거나 15개인 피드는 제품이 이름 붙인 그 순간에 아무 말도 못 한다.
- **최소 조치:** 스키마에 한 줄. "opener 는 정확히 1개이고 position 1 이다" 같은 규칙을 **사람이 정하면** 검사는 한 줄이다. 규칙이 없는 상태로 두기로 했다면 그 결정을 적는다. **내가 규칙을 발명해 요구하지 않는다.**

**L5. fixture 프로필의 수치가 실측과 자릿수가 다르고, 분산이 0이다.**

| | `caption_len.p50` | `p90` | `sample_size` |
|---|---|---|---|
| `tgt_synthetic_quiet` | 18 | 18 | 1 |
| `tgt_synthetic_detail` | 80 | 80 | 1 |
| 실측 `ig_feed_29cm`(한글) | **368** | **1056** | 30 |
| 실측 `dazedkorea_ko`(한글) | 295 | 589 | 10 |
| 실측 `wantedlab_ko` | 0 | 0 (max 230) | 11 |
| 실측 `humansofny` | 1831 | 2196 | 100 |

- 모든 fixture 가 `p50 === p90` 이다. 즉 **분산이 0**이다. 이 PR 이 지원하는 단 하나의 delta 가 `language.caption_len.p50` + `log_midpoint` 인데, **그 규칙이 다룰 간극을 어떤 fixture 도 만들어내지 않는다.**
- fixture 가 합성이라는 것은 문서에 정직하게 적혀 있으므로(`schemas/ordered_feed.md:4`) **결함으로 세지 않는다.** 다만 "delta 규칙이 동작한다"는 주장이 **현실적인 간극에 대해서는 한 번도 시험된 적이 없다**는 사실은 남는다. M2 의 골든 case_02 를 추가할 때 실측 자릿수를 쓰면 이 항목도 같이 닫힌다.

## 6. 확인했으나 결함이 아니었던 것 (추정으로 올리지 않는다)

- **경계값 0/1/2/3/20/21.** 실제로 N슬롯 feed 를 만들어 넣었다. `0·1·2·21 → REJECT inputPhotoIds: requires 3..20 photos`, `3·20 → PASS`. **3..20 은 정확히 지켜진다.** 실측에서도 최대 캐러셀은 20장(`humansofny` 1건)으로 인스타그램 상한과 일치하므로 **상한 자체는 현실과 맞다.**
  - 곁가지: `validateExport(output, feed)` 는 N 을 `feed.slots.length` 에서 가져오므로(`:140`) 단독 호출 시 0장·21장 export 도 통과한다. 그러나 `eval/run.js:12` 와 `api/feed.js:14` 가 항상 `validateFeed` 를 먼저 돌려 3..20 을 강제하므로 **실제 경로에 구멍은 없다.** 별도 지적으로 올리지 않는다.
- **"fixtures 가 영어 위주"라는 가설 — 사실이 아니다.** 한글 포함 라인 수: `ordered_feed.sample.json` 70, `photo_analysis.sample.json` 45, `target_profile.sample.json` 21, `export_quiet.json` 31. **fixture 는 한국어로 쓰여 있다.** `ending_style`·`linebreak_habit` enum 도 한글 값(`해요/다/명사형/혼합`, `없음/짧게 자주/문단`)이다. 검증기에서 한글 때문에 깨지는 지점은 **M5 의 보이지 않는 문자 계열 외에 발견하지 못했다.**
- **빈 캡션 계정을 계약이 표현할 수 있는가 — 할 수 있다.** `wantedlab_ko`(11건 중 10건 빈 캡션) 형태를 실제로 만들어 `validateProfile` 에 넣었다. `ending_style` 을 **생략**하면 통과한다(`schemas/ordered_feed.md:10` 이 허용하는 방식). 표현력 문제가 아니라 **그때 `completeness` 를 낮추도록 강제되지 않는 것**이 문제이고, 그건 M4 로 올렸다.
- **`POST /api/feed` (mock 없음) → 501 이 아니라 405.** `api/feed.js:22` 의 메서드 검사가 `:24` 의 mock 검사보다 먼저이기 때문이다. `/api/feed` 는 GET 전용 fixture 조회이고 제안된 live 경로는 `POST /api/generate`(`schemas/ordered_feed.md:52`)로 **아직 없는 엔드포인트**이므로, **일관된 동작이며 결함이 아니다.** 확인했다는 사실만 남긴다.
- **1차 P2 2건의 수정은 실재한다.** `validateFeed` 에서 `currentProfile` 생략·undefined 거부(`:120`), `caption_state='user'` 의 `user_text` evidence 강제(`:152`), 회귀 테스트 `test/contracts.test.js:108–115`. 재현했다.
- **`rule`-only 프로필 Claim 은 막힌다.** `applied_profile.visual` 의 evidence 를 `kind:'rule'` 하나로 바꾸면 `validateFeed` 가 `rule-only profile claim is not personalization` 으로 거부한다. (단, `evaluate().E1` 단독으로는 PASS — 2차 L1 과 같은 성격이라 새 지적으로 올리지 않는다.)
- **시크릿·개인정보.** 2차가 정규식 스캔을 이미 수행했고 0건이었다. 중복 수행하지 않았다. **내 리뷰는 이 항목의 독립 증거가 아니다.**
- **외부 호출 차단 실험.** 2차가 Node API 차단 preload 로 수행했다. 중복하지 않았다. 내 HTTP 확인은 평범한 로컬 서버 실행이며 **네트워크 격리 증거가 아니다.**

## 7. 결론

**사람이 merge 해도 되는가 — 조건부 "예".** 코드에서 merge 를 막을 실행 장애는 찾지 못했고(테스트 60/60, eval 20/20, HTTP 계약 전부 재현), 발견한 것은 전부 **검증 범위의 구멍**과 **PR 상태 문제**다. 아래 세 조건이 충족되면 merge 해도 된다.

1. **B1 해소** — Draft 로 되돌려 `schemas/` 합의를 이슈 #1 에 기록한 뒤 다시 Ready 로 올리거나, 게이트를 의도적으로 건너뛴 결정과 이유를 PR 본문·이슈에 기록한다. *(사람이 판단할 사안. AI 가 대신 누르지 않는다.)*
2. **H1·H2 를 고치거나 수용을 기록** — 각각 한 줄짜리 대조 추가이고 이미 손에 있는 데이터로 가능하다. 고치지 않기로 한다면 **"지향축 ID 와 evidence 참조는 자동 검증 범위 밖"을 `schemas/ordered_feed.md:50` 옆에 적고** 사람이 수용을 기록한다.
3. **M1(2차)·M2~M6 는 merge 를 막지 않는다.** 다만 **M2(보정 분기 골든 부재)와 M6(mock 의 current 모호성)은 다음 슬라이스가 시작되기 전에** 닫는 편이 싸다 — 둘 다 이미 있는 fixture 를 붙이거나 문서에 한 줄 적는 일이다.

**모델 게이트에 대하여:** 1차·2차가 모두 `gpt-6-astra` 였고 **본 리뷰는 Claude Opus 5 로, 2차와 동일한 HEAD `7d16ff8` 를 대상으로 했다.** 코디네이터가 dispatch 기록의 모델 ID 를 대조해 주면 `CLAUDE.md:238` 의 "L의 두 모델 리뷰" 게이트는 이 리뷰로 닫힌다. 남는 것은 **사람의 계약 합의 기록**이며, 그것은 리뷰가 대신할 수 없다.
