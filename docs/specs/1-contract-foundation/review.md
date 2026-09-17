# 리뷰 기록

기준 구현: `7ed8d4cdf86f637f9f39fcc723ca9ce546c05d68`, base `92cbb4d35e5a5d34185d616bafa290b490b87de8`. 2026-09-17 KST.

- 독립 Codex (`gpt-6-astra`, Orca 실행 상태에서 확인): 아래 두 P2를 재현했다. 두 건 모두 반영했다. 현재 입력 생략/undefined 거부와 사용자 입력 근거 검사를 회귀 테스트로 확인했다.
- CodeRabbit CLI 0.7.6: 공식 배포 SHA256과 설치 바이너리 일치를 확인하고 `review --agent --committed --base main`을 실행했다. 이 구현 커밋의 56개 파일 리뷰 완료, 지적 0건. 서비스 내부 모델 ID는 공개되지 않아 서로 다른 두 모델 검증의 증거로 계산하지 않는다.
- Claude: 문서 작업 세션이 시작 직후 사용량 제한을 반환했다. 별도 리뷰는 시작하지 않았으며 미실행 상태다. 지적 0건으로 계산하지 않는다.

최종 변경 전체의 서로 다른 두 모델 리뷰와 사람의 계약 합의는 pending이다. Draft를 Ready로 올리거나 merge하는 근거가 아니다.

후속 검증: 테스트 60/60, eval 정상 10건 및 broken 예상 실패 10건, check 통과. 수정 후 실제 로컬 HTTP에서도 mock 200·15개 고유 사진·target_only 및 live 501을 다시 확인했다.

## 독립 리뷰 원문

# Foundation cold review

Reviewed commit: `7ed8d4cdf86f637f9f39fcc723ca9ce546c05d68`
Base main observed: `92cbb4d35e5a5d34185d616bafa290b490b87de8`
Repository: `Daterl/gyeol`
Result: **2 P2 findings**. No project files, Git state, or remote resources changed. This report is the only file written.

## Cold read, before consulting neighboring documents or implementation

The supplied artifact defines a proposed version 1.0 F2-to-F3 OrderedFeed contract, a separate F3 export contract, and a local fixture-only HTTP endpoint. It expects 3–20 independently supplied photo IDs, exactly one slot per input photo, positions covering 1..N, typed claims with evidence, honest current-profile disclosure, and explicit output identity preservation. The export adds one single-line title and filled/omitted/user captions, including evidence and omission reasons. It does not promise an implemented generation endpoint, AI quality checks, real user data, or completed collaborator agreement.

What I could not determine from that artifact alone:

- The exact visual/language/sequence types require TargetProfile, which is referenced but not defined here.
- Whether a missing CurrentProfile argument is valid is unstated. The document says the validator receives it separately and explicitly models absence using null current identity; an omitted argument must not silently authorize invented identity.
- `corrected=true` with zero deltas is not explicitly forbidden. `log_midpoint` has no formula, rounding rule, or zero-value convention, and numeric correspondence between the delta and applied language is not explicitly specified.
- Position is explicit, but array order significance is not stated. Later tests expressly make array order irrelevant.
- The document requires facts to be copied from photo analysis, but the validator inputs described here include only photo IDs and CurrentProfile, so equality of copied facts cannot be independently checked from those arguments.
- Whether evidence supports an omission is semantic; structural validation alone cannot establish that. User-authored captions do have an objectively distinguishable source kind, `user_text`.
- Timestamp timezone strictness, unknown-field handling, and the numeric relationship between missing profile judgments and completeness are underspecified.

These ambiguities were not converted into findings about synthesis quality or missing generation functionality.

## Findings

### P2 — Do not bypass actual-current validation when its argument is missing

**Location:** `lib/contracts.js:120–123` (`validateDisclosure`), reached through `validateFeed` at line 130 and E8 at `eval/invariants.js:15`.

The actual-input comparison is wrapped in `if (currentProfile !== undefined)`. A caller that omits the third `validateFeed` argument can therefore submit an invented non-null current ID with `corrected=true` and `disclosure='corrected'`, and validation succeeds. The same candidate is rejected when the actual absent-current fixture is passed. This defeats the separate-input check stated in `schemas/ordered_feed.md:18,31–32` precisely when callers forget the input context. It also allows an evaluator bundle missing `currentProfile` to treat a fabricated correction as valid.

**Reproduction:** clone the valid sample feed, assign `{current_profile_id:'invented-current', corrected:true, disclosure:'corrected'}` to its applied profile, and call `validateFeed(candidate, ids)`; it returns successfully. Calling `validateFeed(candidate, ids, currents[1])` throws `E8: current profile ID differs from actual input`.

**Minimal fix:** require an explicit CurrentProfile at the public validation boundary and validate it unconditionally. Absence already has a concrete valid fixture representation. If omitted context is intentionally supported, explicitly normalize it to absence and require null identity, false corrected, target-only disclosure, and no deltas.

**Regression:** test both `validateFeed` and E8 with omitted/undefined context and an invented correction. Existing tests at `test/contracts.test.js:56,68–70` always provide the actual profile and consequently miss this branch. Current fixture HTTP and eval callers provide the argument, so the demonstrated impact is the exported validator/evaluator contract, not a claim that the existing mock response is corrupt.

### P2 — Require user-input evidence for a user-authored caption

**Location:** `lib/contracts.js:151` (`validateExport`).

Export validation checks only that evidence is nonempty and structurally valid, irrespective of caption state. Changing the first golden export slot from `filled` to `user` leaves its sole evidence as `uploaded_photo:ph_01`, yet `validateExport` accepts it. This violates the explicit requirement that user-written sentences link to user-input provenance (`schemas/ordered_feed.md:44`). A consumer can mark generated text as user-authored without recording any user input.

**Reproduction:** clone `eval/golden/case_01/export_quiet.json`, set `slots[0].caption_state='user'`, and call `validateExport(candidate, feed)` without changing the existing uploaded-photo evidence; it returns successfully.

**Minimal fix:** require at least one `kind === 'user_text'` evidence entry for `caption_state === 'user'`, preserving any additional photo evidence. This enforces the available structural source distinction; authenticating a specific user-input reference would need a separately defined input/reference contract and is not requested here.

**Regression:** add a user-state case containing photo-only evidence that must fail, plus a user-state case with valid user_text evidence that must pass. Existing export tests at `test/contracts.test.js:79–86` cover titles, identity and omission evidence but do not exercise this state-specific provenance rule.

## Validation evidence and limitations

Node version: `v22.22.3`.

All source and fixture content was read with `git show <full-commit>:<path>`. Modules were loaded as data URLs in memory, so mutable working documents were not executed and no temporary source checkout was written.

- All 47 committed contract tests passed.
- The first two committed API tests passed: fixture resources and controlled method/query errors.
- Total executed adapted committed tests: **49 passed, 0 failed**. Adaptation replaced module URLs and file reads with immutable Git-backed reads; validation assertions were unchanged.
- The third API test's separate subprocess/socket-denial test was not run because it imports the mutable checkout directly. No claim is made that this entire npm test suite or npm check was run unchanged.
- Baseline feed and export both passed before each targeted mutation family.
- Both reported invalid candidates passed; the explicit absent-current control rejected the fabricated correction.

One observed test-scope limitation is **not counted as a finding**: deleting export `slots[1].evidence` leaves E1/E2/E3/E6/E8 all green, while `validateExport` correctly rejects it. E1 in `CLAUDE.md:253` is specifically about Claim evidence, and F3 export evidence is not wrapped in a Claim. `eval/run.js:12` runs the full export validator before the invariant checks, so the existing golden eval command still rejects that invalid export. Preserve that full-validator gate; the five individual E flags alone do not certify export validity.

No live generation, deployment, AI quality, semantic omission reasoning, or E4/E5/E7 automation was evaluated. Review findings were checked against the immutable contract and executable reproductions; speculative synthesis and schema-policy concerns were left as cold-read questions.

## Reproduction command (read-only; no source files written)

Run from the repository above:

```sh
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
const rev = '7ed8d4cdf86f637f9f39fcc723ca9ce546c05d68';
const get = p => execFileSync('git', ['show', `${rev}:${p}`], {encoding:'utf8'});
const dataUrl = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const C = await import(dataUrl(get('lib/contracts.js')));
const read = p => JSON.parse(get(p));
const feed = read('fixtures/ordered_feed.sample.json');
const ids = read('eval/golden/case_01/input.json').photo_ids;
const currents = read('fixtures/current_profile.sample.json');
const output = read('eval/golden/case_01/export_quiet.json');
C.validateFeed(feed, ids, currents[1]);
C.validateExport(output, feed);
const forged = structuredClone(feed);
Object.assign(forged.applied_profile, {
  current_profile_id:'invented-current', corrected:true, disclosure:'corrected'
});
C.validateFeed(forged, ids);
console.log('BUG: invented current accepted with omitted actual input');
try {
  C.validateFeed(forged, ids, currents[1]);
  console.log('Unexpected explicit-context pass');
} catch (e) {
  console.log('Control rejected: ' + e.message);
}
const user = structuredClone(output);
user.slots[0].caption_state = 'user';
C.validateExport(user, feed);
console.log('BUG: user caption accepted with photo-only evidence');
NODE
```

Observed output:

```text
BUG: invented current accepted with omitted actual input
Control rejected: E8: current profile ID differs from actual input
BUG: user caption accepted with photo-only evidence
```
