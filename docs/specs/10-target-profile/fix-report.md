# PR #28 교차 리뷰 수정 보고 — B1 · H1 · H2 · H3

**기준 리뷰:** `docs/specs/10-target-profile/review-codex.md` (Codex 교차 리뷰).
**범위:** BLOCKER 1건 + HIGH 3건. **MEDIUM·LOW 는 고치지 않고 3절에 수용 근거를 남긴다.**
실행 환경: macOS Darwin 24.6.0, Node `v22.22.3`, 워크트리 `.work/gyeol-10`, 브랜치 `feat/10-target-profile`.

---

## 0. 먼저 — `origin/main` 재베이스

PR #21 이 merge 되며 불변식 **E9·E10·E11** 이 들어왔다. 이 브랜치는 그 전에 갈라졌으므로 계약이 낡아 있었다.

`origin/main` 은 이 브랜치의 기반 커밋 2개(`7ed8d4c` 계약 기반, `7d16ff8` 3차 리뷰 수정)를
**포함하는 상위 집합**이었다. 그래서 그 둘을 다시 replay 하지 않고 **`origin/main` 위에 #10 커밋 하나만 얹었다.**
충돌은 `eval/golden/case_01/README.md` 1건이었고, **계약 쪽(E9·E10·E11 문장)을 남기고** #10 문장을 합쳤다.

```sh
git fetch origin && git reset --hard origin/main && git cherry-pick fbf84fa
```

**재베이스가 드러낸 실제 결함 1건 (리뷰가 못 본 것):**
`scripts/make_golden_targets.js` 가 옛 3-인자 `validateFeed(feed, ids, current)` 를 부르고 있었다.
PR #21 이 시그니처를 `(feed, ids, current, targetProfile, photoAnalyses)` 로 바꿨으므로 **골든 재생성이 죽는다.**

```text
ContractError: targetProfile: expected object
    at validateTargetAxis (lib/contracts.js:129:3)
    at validateFeed (lib/contracts.js:158:30)
    at scripts/make_golden_targets.js:30:3
```

`npm run check` 는 JS 구문/JSON 파싱만 하므로 이걸 잡지 못한다. 새 시그니처로 고쳤고, 재생성 후
**골든 JSON 은 한 바이트도 바뀌지 않았다**(`git diff --stat eval/golden/` 빈 출력).
아래 수정이 정상 경로를 건드리지 않았다는 증거다.

---

## 1. 무엇이 뚫려 있었나

| # | 리뷰 지적 | 구멍의 모양 | 막은 방법 |
|---|---|---|---|
| **B1** | 사진만 입력의 합의 계약 없이 DoD 5 를 완료로 판정 | 코드가 아니라 **판정의 문제**. `#24` 는 OPEN·댓글 0, `schemas/interaction.md` 부재 | `report.md` DoD 5 를 `PASS (계약 pending)` → **`PENDING`**, DoD 8 을 **부분 PASS / PENDING**, Verdict 를 **부분 PASS / DoD 5·8 PENDING** 으로 정정. Draft 유지, merge 안 함 |
| **H1** | 부정한 지향을 긍정 지향으로 뒤집는다 | `raw.includes` 가 문장 전체에서 어휘를 찾고, tone 은 두 어절만 잘라 **뒤의 부정어를 삭제**했다 | **절(clause) 단위**로 자르고, 부정이 섞인 절은 통째로 버려 그 항목을 **비운다**. 반대 의미로 해석하지 않는다(P3) |
| **H2** | 반환 객체가 모듈 상수를 공유해 다음 호출을 오염시킨다 | `claim(entry.value, …)` 가 `LEXICON` 의 객체를, `banned_words` 가 `BANNED_WORDS` 배열을 **복사 없이** 넘겼다 | `claim()` 에서 `structuredClone(value)`, `banned_words` 는 `[...BANNED_WORDS]`. **반환값 소유권을 호출자에게 넘긴다** |
| **H3** | 프로필 evidence 의 `ref` 가 무엇을 가리키는지 아무도 안 본다 | `validateClaim` 은 evidence 의 **모양**(kind·ref·note 존재, rule-only 아님)만 봤다 | `validateProfileEvidence(profile, {snapshot, photoIds})` 추가 — 모든 evidence 의 `ref` 가 **실제 입력에 해소**되는지 대조. 세 추출 경로가 반환 직전 스스로 건다 |

H1·H2·H3 의 뿌리는 PR #21 이 feed 경계에서 막은 것과 **같다 — 존재 검사만 하고 해소 검사를 안 했다.**
그래서 H3 는 E9·E10 이 feed 에서 한 일을 **프로필 경계에서 같은 방식으로** 한다. 의미 분석도 AI 호출도 없다.

**공용 계약(`lib/contracts.js`, `schemas/` 4종)은 한 글자도 바꾸지 않았다.** 새 검사는 `lib/target_profile.js` 안에 산다.

### H3 가 대조하는 것 (해소 규칙)

| evidence.kind | 무엇에 해소되어야 하는가 |
|---|---|
| `aggregate` | `ig_reference` → 그 스냅샷의 `snapshot_id`. `photo_only` → `photo_analysis:n=<실제 장수>` |
| `ig_post` | 그 스냅샷 `posts` 안의 `shortCode`. **`freetext`·`photo_only` 프로필은 인용 자체가 금지** |
| `user_text` | `<자기 profile_id>:<인용구>` 이고 인용구가 `raw_freetext` 안에 실제로 있는 문자열. **`freetext` 프로필만 허용** |
| `uploaded_photo` | 실제 입력 사진 ID. TargetProfile 에는 입력 사진이 없으므로 항상 거부된다 |
| `rule` | 명세 포인터다. 그대로 둔다 — rule-only 는 `validateClaim` 이 이미 막는다 |

---

## 2. 핵심 증거 — 고치기 전 통과 → 고친 뒤 실패

리뷰가 재현한 공격 입력을 **같은 프로브 스크립트로 수정 전·후 각각 실행**했다.
H2 는 실제로 모듈 상수를 오염시켜 뒤 프로브를 가리므로 **그룹마다 별도 프로세스**로 돌렸다.

### 2-1. 고치기 전 (재베이스 직후 · 수정 전)

```text
### H1  부정/대조 입력 — 비워야 할 것을 채우는가
  짧게 말고 길게 써줘                          {"language":{"caption_len":{"p50":15,"p90":30,"unit":"자"}},"tone":["짧게 말고"],"completeness":{"visual":0.2,"language":0.2,"sequence":0}}
  이모지 많이 쓰지 마                          {"language":{"emoji_rate":1.5},"tone":["이모지 많이"],"completeness":{"visual":0.2,"language":0.2,"sequence":0}}
  해요체는 싫어요                             {"language":{"ending_style":"해요"},"tone":["해요체는 싫어요"],"completeness":{"visual":0.2,"language":0.2,"sequence":0}}
  밝고 따뜻한 느낌은 싫어요                       {"language":null,"tone":["밝고 따뜻한"],"completeness":{"visual":0.2,"language":0,"sequence":0}}
### H1-control  정상 입력은 그대로 통과해야 한다
  조용하고 짧게, 이모지 없이 해요체로                 {"caption_len":{"p50":15,"p90":30,"unit":"자"},"emoji":0,"ending":"해요","tone":["조용","짧게","이모지 없이"],"completeness":{"visual":0.2,"language":0.6,"sequence":0}}
  그냥 나답게                               {"language":null,"tone":["그냥 나답게"]}
  이모지는 빼고 써줘                           {"emoji":0}
### H2a  caption_len value 가 LEXICON 상수를 공유하는가
  반환값 수정 → 다음 호출                       REJECT ContractError: targetProfile.language.caption_len.value.p90: expected number 999..Infinity
### H2b  banned_words 배열을 공유하는가 (freetext)
  반환값 push → 다음 호출                     ["이처럼","또한","이를 통해","이러한","마침내","오염어"]
### H2c  banned_words 배열을 공유하는가 (ig_reference)
  반환값 push → 다음 호출                     ["이처럼","또한","이를 통해","이러한","마침내","오염어"]
### H2d  planFromPhotos 반환값이 다음 호출을 오염시키는가
  palette_hex push → 다음 호출             ["#e8dfd2","#8f9b86","#d4a891"]
### H3  프로필 evidence 의 ref 가 실제 입력에 해소되는가
  ig_post ref 를 없는 게시물로                ACCEPTED
  aggregate ref 를 없는 스냅샷으로             ACCEPTED
  ref 프로필에 가짜 user_text 근거             ACCEPTED
  freetext ref 를 남의 프로필 ID로            ACCEPTED
  freetext 인용구를 입력에 없는 말로              ACCEPTED
  freetext 프로필에 가짜 ig_post 근거          ACCEPTED
### H3-control  정상 프로필은 통과해야 한다
  ig_reference 정상                      ACCEPTED
  freetext 정상                          ACCEPTED
```

### 2-2. 고친 뒤

```text
### H1  부정/대조 입력 — 비워야 할 것을 채우는가
  짧게 말고 길게 써줘                          {"language":null,"tone":null,"completeness":{"visual":0,"language":0,"sequence":0}}
  이모지 많이 쓰지 마                          {"language":null,"tone":null,"completeness":{"visual":0,"language":0,"sequence":0}}
  해요체는 싫어요                             {"language":null,"tone":null,"completeness":{"visual":0,"language":0,"sequence":0}}
  밝고 따뜻한 느낌은 싫어요                       {"language":null,"tone":null,"completeness":{"visual":0,"language":0,"sequence":0}}
### H1-control  정상 입력은 그대로 통과해야 한다
  조용하고 짧게, 이모지 없이 해요체로                 {"caption_len":{"p50":15,"p90":30,"unit":"자"},"emoji":0,"ending":"해요","tone":["조용","짧게","이모지 없이"],"completeness":{"visual":0.2,"language":0.6,"sequence":0}}
  그냥 나답게                               {"language":null,"tone":["그냥 나답게"]}
  이모지는 빼고 써줘                           {"emoji":0}
### H2a  caption_len value 가 LEXICON 상수를 공유하는가
  반환값 수정 → 다음 호출                       {"p50":15,"p90":30,"unit":"자"}
### H2b  banned_words 배열을 공유하는가 (freetext)
  반환값 push → 다음 호출                     ["이처럼","또한","이를 통해","이러한","마침내"]
### H2c  banned_words 배열을 공유하는가 (ig_reference)
  반환값 push → 다음 호출                     ["이처럼","또한","이를 통해","이러한","마침내"]
### H2d  planFromPhotos 반환값이 다음 호출을 오염시키는가
  palette_hex push → 다음 호출             ["#e8dfd2","#8f9b86","#d4a891"]
### H3  프로필 evidence 의 ref 가 실제 입력에 해소되는가
  ig_post ref 를 없는 게시물로                REJECT ContractError: targetProfile.language.caption_len.evidence.1.ref: does not resolve to a post in the actual snapshot
  aggregate ref 를 없는 스냅샷으로             REJECT ContractError: targetProfile.language.caption_len.evidence.0.ref: aggregate evidence does not resolve to the actual snapshot
  ref 프로필에 가짜 user_text 근거             REJECT ContractError: targetProfile.language.caption_len.evidence.0.kind: a ig_reference profile cannot cite the user's own sentence
  freetext ref 를 남의 프로필 ID로            REJECT ContractError: targetProfile.language.caption_len.evidence.0.ref: user_text evidence belongs to another profile
  freetext 인용구를 입력에 없는 말로              REJECT ContractError: targetProfile.language.caption_len.evidence.0.ref: quoted phrase is not in the actual input sentence
  freetext 프로필에 가짜 ig_post 근거          REJECT ContractError: targetProfile.language.caption_len.evidence.2.kind: a freetext profile cannot cite an Instagram post
### H3-control  정상 프로필은 통과해야 한다
  ig_reference 정상                      ACCEPTED
  freetext 정상                          ACCEPTED
```

### 2-3. 대조표

| 공격 입력 | 전 | 후 |
|---|---|---|
| `"짧게 말고 길게 써줘"` | `caption_len {p50:15,p90:30}`, tone `["짧게 말고"]` | **전부 비었다** — `language:null`, tone 없음, completeness 0 |
| `"이모지 많이 쓰지 마"` | `emoji_rate 1.5`, tone `["이모지 많이"]` | **비었다** |
| `"해요체는 싫어요"` | `ending_style "해요"` | **비었다** |
| `"밝고 따뜻한 느낌은 싫어요"` | tone `["밝고 따뜻한"]` confidence 1 | **비었다** |
| 반환 `caption_len.value.p50 = 999` → 다음 호출 | `ContractError …p90: expected number 999..Infinity` (**정상 입력이 죽는다**) | `{p50:15,p90:30}` — 영향 없음 |
| 반환 `banned_words.push(…)` → 다음 호출 (freetext·ref 양쪽) | 오염어가 따라온다 | 원본 그대로 |
| `ig_post.ref` = 없는 게시물 | ACCEPTED | **REJECT** `does not resolve to a post in the actual snapshot` |
| `aggregate.ref` = 없는 스냅샷 | ACCEPTED | **REJECT** `aggregate evidence does not resolve to the actual snapshot` |
| ref 프로필에 가짜 `user_text` 근거 | ACCEPTED | **REJECT** `a ig_reference profile cannot cite the user's own sentence` |
| freetext `ref` 를 남의 프로필 ID로 | ACCEPTED | **REJECT** `user_text evidence belongs to another profile` |
| freetext 인용구를 입력에 없는 말로 | ACCEPTED | **REJECT** `quoted phrase is not in the actual input sentence` |
| freetext 프로필에 가짜 `ig_post` 근거 | ACCEPTED | **REJECT** `a freetext profile cannot cite an Instagram post` |

**정상 입력(control)은 전·후 모두 그대로 통과한다.** `"조용하고 짧게, 이모지 없이 해요체로"` 는
`caption_len {p50:15,p90:30}` · `emoji 0` · `해요` · tone `["조용","짧게","이모지 없이"]` · completeness `{visual:0.2, language:0.6}` 로 전후 동일하다.
`"그냥 나답게"` 의 tone 도, 어휘 자체가 부정형인 `"이모지는 빼고 써줘"` → `emoji_rate 0` 도 유지된다 —
부정 표지 검사가 **매치 어구를 지운 나머지**에서만 돌기 때문이다.

### 2-4. 사진 계획 경로 (H3 의 같은 수정이 닿는 곳)

```text
### PhotoPlan 근거 해소 (H3 수정의 사진 경로)
  정상 계획                                  "ACCEPTED"
  uploaded_photo ref 를 없는 사진으로           REJECT ContractError: PhotoPlan.visual.palette.evidence.1.ref: does not resolve to an actual input photo
  aggregate ref 를 다른 장수로                 REJECT ContractError: PhotoPlan.visual.palette.evidence.0.ref: aggregate evidence does not resolve to the actual photo set
  계획에 지어낸 user_text 취향 Claim             REJECT ContractError: PhotoPlan.visual.tone_words.evidence.0.kind: a photo_only profile cannot cite the user's own sentence
  validatePhotoPlan 단독 (M1: 미수정)         "ACCEPTED"
```

마지막 줄이 중요하다. `validatePhotoPlan` 을 **단독으로** 부르면 여전히 통과한다 —
그 함수는 입력 사진 목록을 받지 않으므로 해소를 할 수가 없다. 이것이 리뷰 **M1** 이며 **고치지 않았다**(3절).
생성 경로(`planFromPhotos`)는 자기 입력을 알기 때문에 이제 스스로 건다.

### 2-5. 회귀 테스트가 수정 전 코드에서 실제로 실패하는가

통과만 확인하는 것은 증거가 아니므로, **새 테스트를 수정 전 트리에 얹어** 돌렸다.
(수정 전에는 `validateProfileEvidence` 가 없으므로 "아무것도 안 막는 통과" 스텁으로 두었다.)

```text
not ok 15 - H1: a negated or contrasted wish is left empty, never flipped into a positive one
ok 16 - H1 control: a plainly positive wish still fills the same fields it always did
not ok 17 - H2: editing a returned profile never changes what the next call returns
not ok 18 - H3: profile evidence must resolve to the actual input, not merely exist
# tests 18
# pass 15
# fail 3
```

**세 회귀 테스트는 수정 전 실패 · 수정 후 통과. 컨트롤은 양쪽 통과** — "무엇이든 바뀌면 빨개지는" 테스트가 아니다.

`eval/broken/` 에는 넣지 않았다. 그 디렉터리는 **feed·export 번들**을 깨뜨려 `evaluate()` 의 E-불변식을 검사하는 곳이고,
H1·H2·H3 는 **프로필 추출 경계**에서 일어난다. 여기에 넣으려면 새 E-불변식을 만들어야 하는데
그건 `CLAUDE.md` 의 공용 불변식 표를 바꾸는 일이라 `#24`/계약 책임자 몫이다. 회귀는 `test/target_profile.test.js` 가 고정한다.

---

## 3. 고치지 않은 것 — 수용 기록

지시대로 **MEDIUM·LOW 는 고치지 않았다.** 각각 왜 남겨도 되는지, 무엇을 감수하는지 적는다.

| # | 지적 | 수용 이유 |
|---|---|---|
| **M1** | `validatePhotoPlan` 이 필드 허용 목록·값 범위·채움률 정합을 안 본다 | 이 검증기의 **거부 계약 자체가 `#24` 합의 사항**이다 (B1 과 같은 뿌리). 합의 전에 경계를 정해 넣으면 두 번 고친다. 단, **없는 사진 ID 통과**는 리뷰도 "H3 와 같은 유형"이라 했고 생성 경로에서 함께 닫혔다(2-4절). 남는 것은 `hue_mean=999`·빈 `visual` 등 **값·구조 검사**이며, 현재 `planFromPhotos` 는 그런 값을 스스로 만들지 않는다 |
| **M2** | 주입 registry 의 key 와 `snapshot.handle` 불일치를 확인 안 함 | 기본 레지스트리는 안전하고 임의 URL 이 저절로 이 상태를 만들지 않는다. `registry` 를 주입하는 경로는 **테스트 전용**이며 제품 호출자는 `loadDefaultRegistry()` 를 쓴다. 감수하는 것: registry 를 받는 공개 경계가 잘못된 계정 매핑을 신뢰한다. DoD 8 판정에 **PENDING** 으로 반영했다 |
| **M3** | 한국어 "자" 수가 UTF-16 코드 단위다 | 단위를 바꾸면 **골든 `caption_len` 값(292/914)이 바뀌고**, 그건 `eval/golden/` 과 `applied_profile` 거울을 함께 흔든다. 리뷰도 완성형 한글만 있을 때는 맞게 센다고 확인했다(29cm 30건: UTF-16 292 vs grapheme 289). **이번 수정 범위를 정상 경로 무변경으로 유지**하려고 남긴다. 감수하는 것: 이모지·결합문자가 섞인 캡션의 "자" 수가 사람이 세는 수와 다르다 |
| **L1** | 축약 fixture 가 단일 사진·20장 캐러셀·빈 캡션 경계를 안 덮는다 | 원본 30건에도 없는 형태다. 해당 경계는 이미 `test/target_profile.test.js` 의 합성 스냅샷 테스트가 덮는다. 실제 데이터 추가 수집은 리뷰도 요구하지 않았다 |
| **L2** | 깨진 스냅샷 `caption:7` 이 `ContractError` 대신 `TypeError` | 실패로 **드러나며** 성공으로 오인되지 않는다. 준비된 fixture 는 정상이고 스냅샷은 사전 수집 산출물이다. 입력 타입 검사는 `#24` 가 스냅샷 계약을 정할 때 함께 넣는 편이 낫다 |
| **H3 잔여** | `applied_profile.language` 를 다른 프로필 것으로 통째 교체(ID 는 유지)해도 통과 | **공용 계약이 이미 명시적으로 수용한 범위다.** `CLAUDE.md` E9 행: *"ID 동일성만 본다; 두 축을 섞는 규칙(tilt)이 아직 없으므로 값 수준 합성은 검증 범위 밖"*. 값 수준 대조는 tilt 규칙이 생긴 뒤 `#11`/계약 책임자가 정할 일이며, 여기서 혼자 바꾸면 공용 계약을 무단 변경하는 것이다 |

**스키마 4종은 바꾸지 않았다.** 바꿔야 한다고 판단한 항목도 없다 —
사진만 입력은 스키마를 건드리지 않는 별도 `kind:"photo_plan"` 로 남겨 `#24` 합의 후 되돌리기 쉽게 두었다.

---

## 4. `npm test` — 85건 전부 통과

재베이스 직후 81 → 수정 후 **85**. 늘어난 4는 위 세 구멍의 회귀 테스트와 정상 입력 컨트롤이다.

```text
ok 82 - H1: a negated or contrasted wish is left empty, never flipped into a positive one
ok 83 - H1 control: a plainly positive wish still fills the same fields it always did
ok 84 - H2: editing a returned profile never changes what the next call returns
ok 85 - H3: profile evidence must resolve to the actual input, not merely exist
```

```text
1..85
# tests 85
# suites 0
# pass 85
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 402.065125
```

## 5. `npm run eval` — 정상 8 PASS × 2케이스, broken 8 EXPECTED FAIL × 2케이스 (exit 0)

**재베이스로 기준이 바뀌었으므로 새 계약(E9·E10·E11 포함)으로 다시 돌렸다.** 5개가 아니라 8개다.

```text
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

## 6. `npm run check` (exit 0)

```text
> node scripts/check.js
PASS: 33 JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.
```

29 → 33 파일. 늘어난 4는 `origin/main` 이 가져온 `eval/broken/E9·E10·E11.json` 과 `golden/photo_analysis.json` 이다.
`schemas/` 4종과 `fixtures/` 샘플의 일치가 유지된다 — **스키마를 한 글자도 바꾸지 않았다.**

---

## 7. 남은 것 — merge 전에 사람이 해야 하는 일

| 항목 | 상태 | 누가 |
|---|---|---|
| `#24` 사진만 입력 계약 합의 (`PhotoPlan` 이름·`source` 기본값·`schemas/interaction.md`) | **OPEN, 댓글 0** | 계약 책임자. 이것이 B1 이며 **DoD 5·8 을 PENDING 으로 묶어두는 유일한 이유**다 |
| merge 판정 | **Draft 유지** | 코디네이터. 이 작업은 merge 하지 않았다 |
| M1 의 나머지(값·구조 경계) | `#24` 합의 후 | 3절 수용 기록대로 |
| 실모델 경로·실제 데모 사진 전수 대조 | 이 PR 범위 밖 | `#6`·`#9` |

프로브 스크립트는 저장소에 남기지 않았다(`/tmp` scratchpad 에서 실행). 회귀는 `test/target_profile.test.js` 가 고정한다.
