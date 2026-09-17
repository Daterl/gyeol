# PR #21 3차 리뷰 수정 보고 — H1 · H2 · M

**기준 리뷰:** `docs/specs/1-contract-foundation/review-claude.md` (3차), `review-codex.md` (2차 M1).
**범위:** HIGH 2건(H1·H2)과 2·3차 공통 MEDIUM 1건(describable_facts 복사 변조). **이 셋만 고쳤다.**
실행 환경: macOS Darwin 24.6.0, Node `v22.22.3`, 워크트리 `.work/gyeol`, 브랜치 `feat/1-contract-foundation`.

---

## 1. 무엇이 뚫려 있었나 — 세 구멍

| # | 리뷰 지적 | 구멍의 모양 | 막은 방법 |
|---|---|---|---|
| **H1** | 지향 프로필(주축)을 통째로 지어내도 통과 | `validateFeed` 가 `TargetProfile` 을 **인수로 받지도 않았다**. `target_profile_id` 는 nonempty string 검사만 | `validateFeed(…, targetProfile, …)` 로 실제 입력을 받고, **E9** 불변식으로 `applied_profile.target_profile_id === targetProfile.profile_id` 를 대조 |
| **H2** | 입력에 없는 사진을 근거로 대도 통과 | evidence 는 `kind`/`ref`/`note` 의 **형태만** 봤다. `ref` 가 무엇을 가리키는지는 아무도 안 봄 | **E10** 불변식 — 문서 전체를 걸어가며 `kind==="uploaded_photo"` 인 모든 evidence 의 `ref` 가 실제 입력 사진 ID 로 **해소**되는지 검사. feed·export 양쪽 |
| **M** | 다른 사진의 **실제** 사실을 복사해 붙여도 통과 | 골든 번들에 `PhotoAnalysis` 파일 자체가 없어 대조가 **불가능**했다 | `eval/golden/case_01/photo_analysis.json` 추가 + **E11** 불변식 — 슬롯의 `describable_facts` 가 **그 슬롯 photo_id 의** `PhotoAnalysis.describable_facts` 부분집합인지 대조 |

세 구멍의 뿌리는 같다 — **존재 검사(있는가)만 했고 해소 검사(실제 입력에 닿는가)를 안 했다.** 그래서 고친 모양도 같다.

---

## 2. 핵심 증거 — 고치기 전 통과 → 고친 뒤 실패

리뷰가 보고한 위조 5종을 **같은 스크립트로 수정 전·후 각각 실행**했다. 스크립트 전문은 6절에 있다.

### 2-1. 고치기 전 (HEAD `7d16ff8`)

`git show HEAD:lib/contracts.js` 와 `git show HEAD:eval/invariants.js` 를 scratchpad 에 꺼내고 **아래 6절과 동일한 스크립트의 import 경로만 그쪽으로 돌려** 실행했다.

```text
### BASELINE  변조 없음 (통과해야 정상)
  validateFeed  : PASS
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P
### H1-a  target_profile_id 를 존재하지 않는 값으로
  validateFeed  : PASS
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P
### H1-b  지향 값을 실제 TargetProfile 과 정반대로 + 지어낸 ID
  validateFeed  : PASS
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P
### H2-a  슬롯 rationale 의 evidence.ref 를 입력에 없는 사진으로
  validateFeed  : PASS
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P
### H2-b  export 슬롯의 evidence.ref 를 입력에 없는 사진으로
  validateFeed  : PASS
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P
### M  ph_01 슬롯의 describable_facts 를 ph_09 의 실제 사실로 복사
  validateFeed  : PASS
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P
```

**전부 PASS.** 지어낸 지향 프로필도, 입력에 없는 사진 근거도, 복사한 사실도 전 검증을 통과한다.

### 2-2. 고친 뒤

```text
### BASELINE  변조 없음 (통과해야 정상)
  validateFeed  : PASS
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P E9:P E10:P E11:P
### H1-a  target_profile_id 를 존재하지 않는 값으로
  validateFeed  : FAIL(E9: target profile ID differs from actual input)
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P E9:F E10:P E11:P
### H1-b  지향 값을 실제 TargetProfile 과 정반대로 + 지어낸 ID
  validateFeed  : FAIL(E9: target profile ID differs from actual input)
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P E9:F E10:P E11:P
### H2-a  슬롯 rationale 의 evidence.ref 를 입력에 없는 사진으로
  validateFeed  : FAIL(E10: OrderedFeed.slots.0.rationale.evidence.0.ref does not r)
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P E9:P E10:F E11:P
### H2-b  export 슬롯의 evidence.ref 를 입력에 없는 사진으로
  validateFeed  : PASS
  validateExport: FAIL(E10: F3Export.slots.0.evidence.0.ref does not resolve to an )
  evaluate      : E1:P E2:P E3:P E6:P E8:P E9:P E10:F E11:P
### M  ph_01 슬롯의 describable_facts 를 ph_09 의 실제 사실로 복사
  validateFeed  : FAIL(E11: describable fact is not a fact of ph_01)
  validateExport: PASS
  evaluate      : E1:P E2:P E3:P E6:P E8:P E9:P E10:P E11:F
```

**BASELINE(정상)은 그대로 통과하고, 위조 5종은 각각 자기 자리에서 실패한다.**

| 위조 | 전 | 후 | 실패 지점 |
|---|---|---|---|
| H1-a 존재하지 않는 `target_profile_id` | PASS | **FAIL** | `E9: target profile ID differs from actual input` |
| H1-b 정반대 값 + 지어낸 ID | PASS | **FAIL** | 같음 (ID 동일성에서 걸린다) |
| H2-a 슬롯 rationale 의 `evidence.ref` | PASS | **FAIL** | `E10: OrderedFeed.slots.0.rationale.evidence.0.ref does not resolve…` |
| H2-b export 슬롯의 `evidence.ref` | PASS | **FAIL** | `E10: F3Export.slots.0.evidence.0.ref does not resolve…` |
| M `ph_01` 슬롯에 `ph_09` 의 실제 사실 복사 | PASS | **FAIL** | `E11: describable fact is not a fact of ph_01` |

---

## 3. `npm test` — 67/67 통과

```text
1..67
# tests 67
# suites 0
# pass 67
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 90.6035
```

60 → 67 로 늘었다. 추가한 7 중 4는 위 세 구멍의 회귀 테스트이고(`test/contracts.test.js` 끝부분), 3은 새 불변식 E9·E10·E11 의 "정상 통과 + 저장된 broken 실패" 쌍이다.

## 4. `npm run eval` — 정상 8 PASS × 2케이스, broken 8 EXPECTED FAIL × 2케이스 (exit 0)

```text
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

`eval/broken/` 에 새로 넣은 세 케이스:

- `E9.json` — `applied_profile.target_profile_id` → `"tgt_DOES_NOT_EXIST_ANYWHERE"`
- `E10.json` — `slots[0].rationale.evidence[0].ref` → `"ph_NOT_AN_INPUT"`
- `E11.json` — `slots[0].caption_inputs.describable_facts` → `ph_09` 의 **실제** 사실 `["단색 카드","synthetic 9 표기"]`

E11 broken 이 **지어낸 문자열이 아니라 같은 입력 묶음 안 다른 사진의 진짜 사실**인 것이 요점이다. 3차 리뷰가 "2차보다 잡기 어려운 형태"라고 지적한 그 형태다.

## 5. `npm run check` 와 로컬 HTTP

```text
> node scripts/check.js
PASS: 29 JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.
```

```text
?mock=1                              -> 200
?mock=1&resource=photo_analysis      -> 200
?mock=1&resource=target_profile      -> 200
?                                    -> 501
```

---

## 6. 재현용 스크립트

수정 전 커밋(`7d16ff8`)에서도 그대로 돌아간다 — 구 `validateFeed` 는 남는 인수를 무시한다.

```js
// 세 가지 위조 입력이 검증을 통과하는지 확인한다. 고치기 전/후 같은 스크립트를 돌린다.
import { readFile } from 'node:fs/promises';
import { validateFeed, validateExport } from '/Users/chowonjae/Desktop/projects/wanted/.work/gyeol/lib/contracts.js';
import { evaluate } from '/Users/chowonjae/Desktop/projects/wanted/.work/gyeol/eval/invariants.js';

const ROOT = '/Users/chowonjae/Desktop/projects/wanted/.work/gyeol/';
const read = async p => JSON.parse(await readFile(ROOT + p, 'utf8'));

const input = await read('eval/golden/case_01/input.json');
const currentProfile = await read('eval/golden/case_01/current_profile.json');
const targetProfile = await read('eval/golden/case_01/target_quiet.json');
const feed = await read('eval/golden/case_01/ordered_quiet.json');
const output = await read('eval/golden/case_01/export_quiet.json');
const photos = await read('fixtures/photo_analysis.sample.json');

const base = { inputPhotoIds: input.photo_ids, currentProfile, targetProfile, feed, output, photoAnalyses: photos };

const forgeries = {
  'BASELINE  변조 없음 (통과해야 정상)': b => b,
  'H1-a  target_profile_id 를 존재하지 않는 값으로': b => {
    b.feed.applied_profile.target_profile_id = 'tgt_DOES_NOT_EXIST_ANYWHERE'; return b;
  },
  'H1-b  지향 값을 실제 TargetProfile 과 정반대로 + 지어낸 ID': b => {
    const a = b.feed.applied_profile;
    a.target_profile_id = 'tgt_invented';
    a.visual.tone_words.value = ['시끄럽고 길게', '과장되게'];
    a.language.caption_len.value.p50 = 900;
    a.language.caption_len.value.p90 = 1200;
    return b;
  },
  'H2-a  슬롯 rationale 의 evidence.ref 를 입력에 없는 사진으로': b => {
    b.feed.slots[0].rationale.evidence[0].ref = 'ph_NOT_AN_INPUT'; return b;
  },
  'H2-b  export 슬롯의 evidence.ref 를 입력에 없는 사진으로': b => {
    b.output.slots[0].evidence[0].ref = 'ph_NOT_AN_INPUT'; return b;
  },
  'M  ph_01 슬롯의 describable_facts 를 ph_09 의 실제 사실로 복사': b => {
    const nine = b.photoAnalyses.find(p => p.photo_id === 'ph_09');
    b.feed.slots.find(s => s.photo_id === 'ph_01').caption_inputs.describable_facts = [...nine.describable_facts];
    return b;
  },
};

const attempt = fn => { try { fn(); return 'PASS'; } catch (e) { return 'FAIL(' + e.message.slice(0, 60) + ')'; } };

for (const [label, forge] of Object.entries(forgeries)) {
  const b = forge(structuredClone(base));
  const vf = attempt(() => validateFeed(b.feed, b.inputPhotoIds, b.currentProfile, b.targetProfile, b.photoAnalyses));
  const ve = attempt(() => validateExport(b.output, b.feed, b.inputPhotoIds));
  const ev = evaluate(b);
  const line = Object.entries(ev).map(([id, r]) => `${id}:${r.pass ? 'P' : 'F'}`).join(' ');
  console.log(`### ${label}`);
  console.log(`  validateFeed  : ${vf}`);
  console.log(`  validateExport: ${ve}`);
  console.log(`  evaluate      : ${line}`);
}
```

---

## 7. 바뀐 파일

| 파일 | 무엇 |
|---|---|
| `lib/contracts.js` | `validateTargetAxis`·`validatePhotoRefs`·`validateFactProvenance` 추가. `validateFeed(v, inputPhotoIds, currentProfile, targetProfile, photoAnalyses)`, `validateExport(v, feed, inputPhotoIds)` 로 시그니처 확장 |
| `eval/invariants.js` | `evaluate()` 에 E9·E10·E11 추가, 번들에 `photoAnalyses` |
| `eval/run.js` | 골든 `photo_analysis.json` 을 읽고 broken 루프에 E9·E10·E11 추가 |
| `eval/broken/E9.json` · `E10.json` · `E11.json` | 새 broken 케이스 3종 |
| `eval/golden/case_01/photo_analysis.json` | **신규** — 골든 번들만으로 사진→재료 대조가 되게 |
| `api/feed.js` | mock 경로에도 실제 target·photos 를 넘긴다. 출력의 `target_profile_id` 를 오라클로 쓰지 않도록 fixture 목록의 첫 target 을 적용 대상으로 명시 |
| `test/contracts.test.js` | 호출부 갱신 + 세 구멍의 회귀 테스트 4개 |
| `schemas/ordered_feed.md` | 기존 필드는 그대로 두고 E9·E10·E11 규칙과 새 검증기 시그니처만 기술 |
| `CLAUDE.md` | 6-2 불변식 표에 E9·E10·E11 3행 추가 (기존 5행 무수정) |

**스키마 4종의 필드 의미는 바꾸지 않았다.** `scripts/check.js` 가 비교하는 `schemas/*.md` 의 JSON 예시는 한 글자도 건드리지 않았다(check PASS 가 그 증거다).

---

## 8. 수용 — 고치지 않은 것과 그 이유

3차·2차 리뷰의 나머지 지적은 **이번 범위 밖으로 두고 수용을 기록한다.**

| 항목 | 등급 | 수용 이유 |
|---|---|---|
| **M3 — fixtures 의 `carousel_count` 가 전부 0 이라 실제 데이터와 어긋난다** | MEDIUM | **#9~#12 에서 다룰 일이다.** 순서축의 실측 형태는 실제 추출(#10) 결과가 있어야 만들어진다. 지금 손으로 0 이 아닌 값을 넣으면 그것도 여전히 합성이고, 실측이라는 오해만 더한다. `opener_tendency`·`sample_size` 도 같은 이유로 그대로 둔다 |
| **M2 — `corrected=true` 분기가 골든·mock·broken 어디에도 없다** | MEDIUM | 계약과 단위 테스트는 이 분기를 덮는다(`lib/contracts.js:122–124`, `test/contracts.test.js` 의 delta 테스트). 미검증 코드가 아니라 **목업 커버리지** 문제이고, 골든 case_02 추가는 이번 지시 범위 밖이다 |
| **B1 — 필수 게이트 전에 Draft→Ready 전환 + 빈 본문 승인** | BLOCKER | **코드 결함이 아니라 PR 상태 결함이며 사람이 판단할 사안이다.** AI 가 원격 PR 의 승인 상태를 되돌리지 않는다. `CLAUDE.md:188` 의 `schemas/` 합의 기록은 두 사람 사이의 합의(자동 작업 루프 "사람이 개입하는 경우" 4번)라 여기서 대신 남길 수 없다 |
| **E4 (캡션의 고유명사 ⊆ describable_facts)** | — | `CLAUDE.md:280` 이 이미 **자동 판정 생략 → 수동 스팟체크**로 기록한 결정이다. 이번에 막은 것은 체인의 **앞쪽 절반(사진→재료, E11)** 이고, 뒤쪽 절반(재료→캡션)은 기록된 합의대로 사람이 본다 |
| **E9 를 값 수준까지 합성 검증하지 않음** | — | 두 축을 섞는 규칙(`tilt`)이 이 PR 에 정의돼 있지 않다. **ID 동일성만이 지금 검증 가능한 전부**라는 3차 리뷰의 판단을 그대로 따른다 |
| **E10 을 `uploaded_photo` 외 kind 로 확장하지 않음** | — | `ig_post`/`user_text`/`aggregate`/`rule` 의 참조 도메인은 이 계약 안에 없다. 해소할 대상이 없는 것을 해소 검사할 수 없다 |
| **LOW 전반** | LOW | 리뷰가 "새로 찾은 것"으로 분류했으나 이번 지시가 명시적으로 범위에서 뺐다 |
