# report — #131 비움 안전망이 기본 경로에서 항상 꺼진다

브랜치 `fix/131-omission-safety-net` (base `origin/develop`).

---

## 1. 안전망이 꺼지던 정확한 원인 — 실측값

추측이 아니라 `buildFeed` 산출물을 그대로 찍은 값이다.
재현: `node docs/specs/131-omission-safety-net/probe/gates.mjs`

```
=== 기본(사진만) kind:none
 target.kind        = photo_plan  source = photo_only
 applied.language   = null
 caption_coverage   = undefined
 disclosure         = target_only
 ratios             = []
 GATE1 (!lang||all) = true → 꺼짐
 GATE2 (coverage)   = true → 꺼짐
 GATE3 stored vs measured adjacent_overlap:
   pos2: stored=0.5 measured=1 match=false
   pos3: stored=0.5 measured=1 match=false

=== 자유입력 "짧게 조용하게"
 target.kind        = undefined  source = freetext
 applied.language   = (있음)
 caption_coverage   = undefined
 disclosure         = target_only
 ratios             = []
 GATE1 (!lang||all) = false
 GATE2 (coverage)   = true → 꺼짐
 GATE3 stored vs measured adjacent_overlap:
   pos2: stored=1 measured=1 match=true
   pos3: stored=1 measured=1 match=true

=== 자유입력 "자세하게 기록처럼 촘촘히"
 target.kind        = undefined  source = freetext
 applied.language   = (있음)
 caption_coverage   = undefined
 GATE2 (coverage)   = true → 꺼짐

=== 자유입력 "사진만 두고 싶어요"(sparse)
 caption_coverage   = sparse
 GATE1 = false / GATE2 = false   ← 유일하게 통과하던 갈래
```

### 원인 세 개

**GATE1 — `applied_profile.language === null`** (`lib/output-generation.js` 옛 141행 `if (!appliedLanguage) return`)
사진만 올리는 기본 경로는 `lib/pipeline.js` 의 photo_plan 갈래를 타고, 그 갈래는 **언어축 자체를 만들지 않는다**
(`language:null`). 안전망은 이 `null` 을 "언어 지향을 못 읽었으니 손대지 말자" 로 읽었다.
그러나 **지향이 없다는 것과 "전부 채워 달라"는 다른 말이다.** 기본 경로는 100% 여기서 되돌아 나왔다.

**GATE2 — `coverage!=='sparse' && target.source==='freetext'`** (옛 142행)
자유입력은 커버리지를 **명시적으로 sparse 로 읽힌 문구**가 아니면 무조건 꺼졌다.
`lib/target_profile.js` 의 `COVERAGE_PATTERNS` 에 걸리는 말("말수가 적고", "사진만 두고 싶어", "몇 장만 써 줘")을
정확히 써야만 켜졌고, "짧게 조용하게" / "차분한 느낌으로" 는 걸리지 않는다.
같은 줄의 `caption_len.p50>=90` 도 "자세하게 촘촘히" 회차를 껐다 — **길이 지향을 개수 지향으로 읽은 것**이다.

**GATE3 — `adjacent_overlap` 의 정의가 경로마다 다르다 (이슈 본문에 없던 세 번째 원인)**
GATE1 을 뚫어 줘도 기본 경로는 후보가 0개다.

| 어디서 쓰나 | `caption_inputs.adjacent_overlap` 의 뜻 |
|---|---|
| `lib/pipeline.js:54` (photo_plan) | `describable_facts` 중복 비율 |
| `lib/order.js:249` (지향 경로) | `measuredColorOverlap` (색 실측) |

옛 `stabilizeOmission` 은 `slot.caption_inputs.adjacent_overlap === measuredColorOverlap(...)` 로 후보를 걸렀다.
기본 경로에서는 저장값(facts 겹침 0.5)과 재계산값(색 겹침 1)이 **구조적으로 절대 같아지지 않는다.**
위 출력의 `match=false` 두 줄이 그 증거다.

### 임계값이 실사진에서 실제로 걸리는지도 쟀다

`test/order.real20.json` (실사진 20장, 인접 19쌍):

| 신호 | `>= 0.9` 인 쌍 | 최댓값 |
|---|---|---|
| 색 겹침 `measuredColorOverlap` | **7 / 19** | 0.976 |
| facts 겹침 | **0 / 19** | 0.167 |

→ 0.9 임계값은 실사진에서 실제로 걸린다. 반대로 **facts 겹침을 비움 신호로 쓰면 안전망은 고쳐도 안 켜진다.**
그래서 비움 판단 신호는 경로와 무관하게 색 실측으로 통일했다.

---

## 2. 무엇을 고쳤나

`lib/output-generation.js` 의 `stabilizeOmission` 블록만 바꿨다 (#123 워커와 같은 파일이라 범위를 좁혔다).

1. **`!appliedLanguage` 로 끄던 것을 없앴다.** 안전망을 끄는 것은 "채워 달라"는 신호가 실제로 있을 때뿐이다:
   `caption_coverage === 'all'` 이거나, 관측된 빈 캡션 비율이 이 길이의 피드에서 한 자리에도 못 미칠 때
   (`max(ratios) * 슬롯수 < 1`, `ratio === 0` 포함).
2. **`target.source === 'freetext'` 와 `caption_len.p50 >= 90` 조건을 제거했다.**
   전자는 "커버리지를 말하지 않았다"를 "전부 채워 달라"로 읽은 것이고,
   후자는 캡션 **길이** 지향을 **개수** 지향으로 읽은 것이다. 둘 다 근거가 없다.
3. **비움 신호를 `measuredColorOverlap` 으로 통일**하고, feed 가 적어 둔 `adjacent_overlap` 은
   **그 경로의 정의대로** 대조해 위조를 걸러내는 데에만 쓴다 (photo_plan 이면 facts 겹침, 지향 경로면 색 겹침).
   판단값은 `context.photos` 에서 다시 재므로 caller 가 feed 를 위조해도 비움을 만들 수 없다 — 기존 위조 방지 수준 유지.
4. **비움 자리의 근거에 관측을 붙였다.** `kind:'rule'` 하나로 끝내면 "설계가 그렇게 정해서"와 구분되지 않는다.
   판단에 실제로 쓴 앞 자리 사진을 `kind:'uploaded_photo'` 로 함께 가리킨다.
   측정값·내부 용어(밝기·채도·소수)는 공개 문장에 쓰지 않는다 — `forbiddenOutputPatterns` 가 이미 막고 있고 그대로 통과한다.

**바꾸지 않은 것**: 임계값 `OMIT_OVERLAP_MIN = 0.9`, 비우는 자리 개수 1, `discloseOmission`, `schemas/` 4종.

---

## 3. 회귀 테스트 — 고치기 전 실패, 고친 뒤 통과

`test/generate.test.js` 에 `test()` 4개를 추가했다. **삭제한 `test()` 선언은 0건이다.**

| 테스트 | 고치기 전 | 고친 뒤 |
|---|---|---|
| `#131 the omission safety net turns on in the default photo-only path with observed evidence` | **not ok** | ok |
| `#131 free text without a coverage request no longer disables the safety net` | **not ok** | ok |
| `#131 the safety net stays off without an overlap signal or when every slot was requested` | ok | ok (가드) |
| `#131 a forged adjacent_overlap cannot manufacture an omission` | ok | ok (가드) |

고치기 전 실행 결과:
```
not ok 32 - #131 the omission safety net turns on in the default photo-only path with observed evidence
not ok 33 - #131 free text without a coverage request no longer disables the safety net
ok 34 - #131 the safety net stays off without an overlap signal or when every slot was requested
ok 35 - #131 a forged adjacent_overlap cannot manufacture an omission
# pass 33
# fail 2
```

### 기존 테스트 2건의 기대를 조정했다 (선언은 유지)

두 테스트는 **버그 자체를 기대값으로 굳혀 두고 있었다.**

- `negated or non-caption coverage wording stays unset through generation`
  본래 주장인 "부정 표현을 긍정으로 뒤집지 않는다"는 `caption_coverage === undefined` 단언이 그대로 지킨다.
  뒤에 붙어 있던 "그러므로 생성 결과가 통째로 그대로여야 한다"는 부분만, 겹침 근거로 켜진 한 자리를 제외한
  나머지 seed 가 글자 그대로 남는지로 바꿨다. 비움 자리에는 `gyeol.omit.overlap` 근거를 요구한다.
- `real feed context blocks stabilization without affirmative omission evidence`
  라벨 9개를 **꺼져야 하는 맥락 / 이제 켜지는 맥락**으로 갈랐다.
  꺼지는 쪽: 겹침 근거가 없는 `photo only`, 사용자가 전부 써 달라고 말한 2건,
  그리고 **새로 추가한 `observed zero-omission account`** (모든 게시물에 캡션이 있는 레퍼런스 → `empty_caption_ratio 0`).
  마지막 것은 `ratios` 차단 갈래의 커버리지를 유지하려고 넣었다 — 그 갈래를 느슨하게 한 것이 아니다.
  켜지는 쪽 6건은 비움 1개 + `rule` + 앞 자리 사진 `uploaded_photo` 근거를 단언한다.

---

## 4. D5 실측 — 실사진 15장 × 5회 × 2경로

재현: `node docs/specs/131-omission-safety-net/probe/d5.mjs`
사진 풀: `pivot/apify-check/fixtures/images/` 실사진 614장. 회차마다 **다른 15장**을 쓴다
(같은 15장을 5번 돌리면 결정적 파이프라인이라 같은 값이 5번 나올 뿐이고, 그건 측정이 아니다).

```
실사진 풀: 614장 (/Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/images)
사진 분석: 휴리스틱(모델 호출 0회). 색은 실제 JPEG 에서 잰 실측값이다.
┌─────────┬───────┬────────────────────────────┬────────┬─────────┬────────┬──────────┬───────────────────────┬──────────────┐
│ (index) │ round │ path                       │ filled │ omitted │ D5     │ 비움자리 │ 근거종류              │ 피드최대겹침 │
├─────────┼───────┼────────────────────────────┼────────┼─────────┼────────┼──────────┼───────────────────────┼──────────────┤
│ 0       │ 1     │ '기본(사진만)'             │ 14     │ 1       │ 'PASS' │ '2'      │ 'uploaded_photo+rule' │ 1            │
│ 1       │ 1     │ '자유입력 "짧게 조용하게"' │ 14     │ 1       │ 'PASS' │ '12'     │ 'uploaded_photo+rule' │ 0.942        │
│ 2       │ 2     │ '기본(사진만)'             │ 14     │ 1       │ 'PASS' │ '9'      │ 'uploaded_photo+rule' │ 1            │
│ 3       │ 2     │ '자유입력 "짧게 조용하게"' │ 14     │ 1       │ 'PASS' │ '14'     │ 'uploaded_photo+rule' │ 0.912        │
│ 4       │ 3     │ '기본(사진만)'             │ 14     │ 1       │ 'PASS' │ '5'      │ 'uploaded_photo+rule' │ 1            │
│ 5       │ 3     │ '자유입력 "짧게 조용하게"' │ 14     │ 1       │ 'PASS' │ '10'     │ 'uploaded_photo+rule' │ 0.922        │
│ 6       │ 4     │ '기본(사진만)'             │ 14     │ 1       │ 'PASS' │ '12'     │ 'uploaded_photo+rule' │ 1            │
│ 7       │ 4     │ '자유입력 "짧게 조용하게"' │ 14     │ 1       │ 'PASS' │ '14'     │ 'uploaded_photo+rule' │ 0.998        │
│ 8       │ 5     │ '기본(사진만)'             │ 14     │ 1       │ 'PASS' │ '7'      │ 'uploaded_photo+rule' │ 1            │
│ 9       │ 5     │ '자유입력 "짧게 조용하게"' │ 14     │ 1       │ 'PASS' │ '14'     │ 'uploaded_photo+rule' │ 0.986        │
└─────────┴───────┴────────────────────────────┴────────┴─────────┴────────┴──────────┴───────────────────────┴──────────────┘
D5 통과: 10/10 (기본 5/5, 자유입력 5/5)
```

비움 자리가 회차마다 다르다 (2·9·5·12·7 / 12·14·10·14·14). **고정 위치를 주입한 것이 아니라
그 회차 사진들에서 실제로 잰 값이 고른 자리다.**

### 이 측정이 못 말하는 것 — 정직하게

- **사진 분석은 휴리스틱 경로다 (모델 호출 0회).** `CLAUDE.md` 7절과 ADR-0005 가 유료 모델 호출을 보류로 두고
  있어 실모델 vision 호출 75회를 쓰지 않았다. 색(`hue_mean`·`sat_mean`·`bright_mean`)은 **실제 JPEG 픽셀에서
  잰 실측값**이고 비움 판단은 이 색만 쓰므로, 안전망의 판정 자체는 실사진 값으로 측정된 것이 맞다.
  실모델로 돌리려면 `node docs/specs/131-omission-safety-net/probe/d5.mjs --model` 이다 — **비용 승인 필요.**
- **문장 생성은 스텁 응답이다.** "모델이 15자리를 전부 채웠다"는 최악의 입력을 고정으로 넣었다.
  안전망이 존재하는 이유가 바로 그 회차이고, 비움 판단은 모델 출력과 무관하게 서버에서 결정적으로 돈다.
  스텁이 결과를 유리하게 만든 것이 아니라 **가장 불리한 입력을 고정한 것**이다.
- **배포 환경에서는 안 돌렸다.** `npm run verify:deployed` 는 이 브랜치가 develop 에 들어간 뒤에 의미가 있다.
- 휴리스틱 경로의 `describable_facts` 는 사진마다 같아서 기본 경로의 `피드최대겹침` 이 1로 찍힌다
  (그 열은 feed 가 적어 둔 값이고, 비움 자리를 고른 것은 색 실측이다). 실모델 분석에서는 이 값이 달라지지만
  정합성 검사는 같은 정의로 재계산하므로 판정은 바뀌지 않는다.

---

## 5. 게이트 실행 결과

| 명령 | 결과 |
|---|---|
| `npm test` | **288/288 pass, 0 fail** |
| `npm run eval` | **통과** (exit 0). E1·E2·E3·E6·E8·E9·E10·E11 PASS, 의도적 파손 8건 전부 EXPECTED FAIL |
| `npm run check` | **PASS** — 79 JS/JSON files checked; four schema examples match fixtures |
| `npm run lint` | **통과** — biome, Checked 42 files, no fixes applied |
| `npm run typecheck` | **통과** — next typegen + tsc --noEmit, 오류 0 |
| `git diff origin/develop -- test/` 삭제된 `test()` | **0건** (추가 4건) |

---

## 6. 남은 것 / 하지 않은 것

- **실모델 경로 측정 미실행** — 비용 승인이 필요하다 (위 4절). 안 했다는 사실을 그대로 적는다.
- **배포 환경 검증 미실행** — merge 이후 단계다.
- `schemas/` 4종은 건드리지 않았다. 바꿔야 한다고 판단한 것도 없다.
- `discloseOmission` 은 그대로 뒀다. 비움 0개를 정직하게 적는 동작은 옳고, 이 이슈는 **0개가 기본값이 된 것**을 고쳤다.
- 이 변경은 비움을 **1개까지만** 만든다. 15자리 중 여러 자리가 겹침 근거를 가져도 한 자리만 비운다.
  더 비울지는 근거 설계가 따로 필요하고 이 이슈 범위 밖이다.
