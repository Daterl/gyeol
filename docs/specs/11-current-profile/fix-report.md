# PR #29 교차 리뷰 수정 보고 — H1 · H2

리뷰 원문: [review-codex.md](review-codex.md) (Codex, 2026-09-17, 대상 HEAD `77c77ca`).
**BLOCKER 없음. HIGH 2건(H1·H2)을 고쳤다.** MEDIUM 3건·LOW 3건은 고치지 않고 8절에 수용으로 적었다.
`schemas/` 4종은 바꾸지 않았다. 기능을 추가하지 않았다.

## 1. 먼저 rebase — 기준 계약이 바뀌었다

PR #21 이 `origin/main` 에 merge 되면서 불변식 **E9·E10·E11** 이 추가됐다. 이 브랜치는 그 전에 갈라졌다.

```
git fetch origin && git rebase origin/main
```

브랜치의 앞선 세 커밋(`7ed8d4c`·`75741f3`·`7d16ff8`)은 **#1 계약 기반을 이 워크트리에서 따로 만든 중복본**이었다.
`git ls-tree` 로 대조한 결과 **origin/main 에 없는 파일이 0개**였고, 겹치는 파일은 전부 main 쪽이 상위집합이었다
(`lib/contracts.js` 8줄 추가 / 41줄 삭제 등 — 전부 main 이 더 많이 검사한다).
그래서 지시대로 **계약은 origin/main 을 따랐고** 세 커밋을 `--skip` 으로 버렸다. 남은 것은 #11 코드 2커밋이다.

앞선 PR 의 `review-claude.md` H1(지향축 미검증)·H2(evidence ref 미해소)를 읽었다.
그 둘은 E9·E10 으로 계약에 들어와 있고, **이 PR 의 H2 는 같은 계열의 다음 구멍**이다 —
ref 가 입력에 **해소되기는 하는데**(E10 통과) 그 관측이 결론을 **지지하지 않는** 경우다.
계약은 이것을 볼 수 없으므로(의미 판단) **추출기가 막아야 한다.**

## 2. 무엇이 뚫려 있었나 — 두 구멍

**H1. A2 판정을 코드가 읽지 않았다.** `buildSequence` 는 `snapshot.provenance.carousel_order_check` 를
한 번도 보지 않았다. 판정이 `다르다`·`확인 불가` 여도, 기록이 아예 없어도 `opener_tendency` 를 만들었다.
"1번 사진이 진짜 1번인지 모르는" 입력 위에 순서 성향을 세운 것이다. #11 DoD 5번이 요구한 실패 복구가 없었다.

**H2. 근거를 관측 목록 앞에서 3개 잘라 붙였다.** `evidence = note => posts.slice(0,3)`.
그래서 결론이 `클로즈업` 인데 근거는 투표에서 제외된 `midshot` 게시물뿐이고,
결론이 `[고양이]` 인데 근거는 고양이가 없는 사진뿐인 출력이 나왔다. 둘 다 `validateProfile` 을 통과했다.
리뷰가 짚은 두 반례 외에 `ending_style` 도 같은 형태였다 — 근본 원인이 하나(공용 `evidence()` 헬퍼)라 셋을 같이 고쳤다.

## 3. 핵심 증거 — 고치기 전 통과 → 고친 뒤 실패

재현 스크립트는 [attack.mjs](attack.mjs) 로 커밋했다. 워크트리에서 `node docs/specs/11-current-profile/attack.mjs`.
`ATTACK SUCCEEDS` = 구멍이 열려 있음, `BLOCKED` = 막힘. 마지막 줄의 "남은 구멍"이 0 이어야 한다.

### 3-1. 고치기 전 (`git show HEAD:lib/current_profile.js` 로 되돌린 상태)

```text
H1-a 다르다               ATTACK SUCCEEDS — opener_tendency=풀샷/1 생성됨
H1-b 확인 불가             ATTACK SUCCEEDS — opener_tendency=풀샷/1 생성됨
H1-c 기록 누락             ATTACK SUCCEEDS — opener_tendency=풀샷/1 생성됨
H1-base 같다             OK — opener_tendency=풀샷
H2-a opener 근거         ATTACK SUCCEEDS — 주장=클로즈업, 인용=29cm.official:DdXobUvgbJS,29cm.official:DdWHSQGlMt4,29cm.official:DdVKdyACaC1 / 실제 지지=29cm.official:DdVKeJUCZsJ,29cm.official:DdVDlTviVrG
H2-b subjects 근거       ATTACK SUCCEEDS — 주장=["고양이"], 인용=ph_01,ph_02,ph_03 / 인용 사진의 피사체=[["unique_0"],["unique_1"],["unique_2"]]
H2-c ending 근거         ATTACK SUCCEEDS — 주장=명사형, 인용 캡션=["좋아요","가요","사진"]

남은 구멍: 6
```

### 3-2. 고친 뒤

```text
H1-a 다르다               BLOCKED — opener_tendency 생략
H1-b 확인 불가             BLOCKED — opener_tendency 생략
H1-c 기록 누락             BLOCKED — opener_tendency 생략
H1-base 같다             OK — opener_tendency=풀샷
H2-a opener 근거         BLOCKED — 주장=클로즈업, 인용=29cm.official:DdVKeJUCZsJ,29cm.official:DdVDlTviVrG / 실제 지지=29cm.official:DdVKeJUCZsJ,29cm.official:DdVDlTviVrG
H2-b subjects 근거       BLOCKED — 주장=["고양이"], 인용=ph_04,ph_05 / 인용 사진의 피사체=[["고양이"],["고양이"]]
H2-c ending 근거         BLOCKED — 주장=명사형, 인용 캡션=["사진","기록","풍경"]

남은 구멍: 0
```

`H1-base 같다` 는 **기준선**이다. A2 가 정상인 입력에서는 값이 계속 나와야 하며, 양쪽 모두 `OK` 다.
고쳐서 전부 생략하게 만든 것이 아니라는 증거다.

### 3-3. 같은 공격을 `npm test` 회귀로 고정

5개 테스트를 `test/current_profile.test.js` 에 넣었다. 수정 전 코드에 대고 돌리면 **정확히 이 5개가 실패**한다:

```text
$ git show HEAD:lib/current_profile.js > lib/current_profile.js && npm test
not ok 85 - A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1)
not ok 86 - opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2)
not ok 87 - subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2)
not ok 88 - ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2)
not ok 89 - 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2)
# tests 89
# pass 84
# fail 5
```

**`eval/broken/` 에는 넣지 않았다.** 그 디렉터리는 `breakFixture` 가 골든 **OrderedFeed 번들**을 변조해
E1~E11 중 하나를 깨뜨리는 케이스만 담는다. 이번 공격은 `buildCurrentProfile` 의 **입력**이고,
"근거가 결론을 지지하는가"에 해당하는 불변식은 없다. 새로 만들면 계약 확장이 되는데
리뷰가 명시적으로 #11 에서 넓히지 말라고 한 부분이다(L3). 그래서 필수 게이트인 `npm test` 에 고정했다.

## 4. 어떻게 고쳤나

**H1 — A2 를 입력마다 읽는다.** `fromSnapshot` 이 판정을 읽어 `buildSequence` 에 넘긴다.

```js
const orderTrusted = snapshot.provenance?.carousel_order_check?.verdict === '같다';
```

`같다` 가 아니면 `opener_tendency` 를 생략하고 `completeness.sequence` 는 0.5 로 둔다
(캐러셀 수는 관측했고 성향은 모르는 상태). `다르다`·`확인 불가`·기록 누락을 같은 뜻으로 묶은 것은
셋 다 "1번 사진이 진짜 1번인지 모른다"로 귀결되기 때문이다. 판정을 **fail-closed** 로 읽는다.

**H2 — 근거를 인덱스로 고른다.** 공용 `evidence(note)` 를 `cite(indexes, note)` 로 바꿨다.
호출자는 "이 판단을 지지한 관측의 인덱스"를 넘기고, `cite` 가 그것만 ref 로 바꾼다.

| Claim | 넘기는 인덱스 |
|---|---|
| `opener_tendency` | 고른 성향으로 **분류된** 캐러셀 |
| `subjects` | 고른 피사체가 **실제로 찍힌** 사진 |
| `ending_style` | 고른 끝맺음으로 **분류된** 캡션 |
| 집계 Claim (`caption_len`·`emoji_rate`·`empty_caption_ratio`·`linebreak_habit`·`palette`·`*_mix`) | 계산에 들어간 관측 집합 전체. `note` 에 **그 집합의 크기**를 적는다 |

집계 Claim 은 관측 하나가 "지지"하는 구조가 아니므로, 리뷰의 요구("어떤 관측 집합에서 계산했는지 추적 가능하게")를
`note` 에 집합 크기를 박는 것으로 만족시켰다 — 예: `캡션을 쓴 게시물 30건 전체의 글자 수 분포에서 …`.
스키마도 새 필드도 건드리지 않는다.

최빈값 Claim 은 정의상 그 값으로 분류된 관측이 1건 이상이므로 `evidence` 가 비는 경우가 없다(E1 유지).

**값은 바뀌지 않았다.** 실제 fixture 30건 재생 결과가 리뷰가 재현한 값과 같다:

```text
{"n":30,"carousel":26,"id":"cur_cached_29cm_official","source":"cached",
 "len":{"p50":289,"p90":888,"unit":"자"},"emoji":5.5,"ending":"명사형","endingConf":0.7}
ending evidence: ["29cm.official:DdWHSQGlMt4","29cm.official:DdVKdyACaC1","29cm.official:DdVKeJUCZsJ"]
```

바뀐 것은 **인용한 게시물**이다. 전에는 `DdXobUvgbJS` 가 먼저 왔는데 그 캡션은 명사형이 아니었다.

## 5. `npm test` — 89/89 통과

```text
> gyeol@0.1.0 test
> node --test test/*.test.js
# tests 89
# suites 0
# pass 89
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 160.932875
```

## 6. `npm run eval` — 새 계약(E9·E10·E11 포함)으로 다시 돌렸다

rebase 로 기준이 바뀌었으므로 전 검증을 새 계약으로 재실행했다. 정상 8 PASS × 2케이스, broken 8 EXPECTED FAIL × 2케이스, exit 0.

```text
> node eval/run.js
Synthetic manual bootstrap only; no AI quality or human agreement claim.
(console.table 전사) quiet: E1 PASS, E2 PASS, E3 PASS, E6 PASS, E8 PASS, E9 PASS, E10 PASS, E11 PASS
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
quiet broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
quiet broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
quiet broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_01
(console.table 전사) detail: E1 PASS, E2 PASS, E3 PASS, E6 PASS, E8 PASS, E9 PASS, E10 PASS, E11 PASS
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

## 7. `npm run check`

```text
> node scripts/check.js
PASS: 32 JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.
```

## 8. 수용 — 고치지 않은 것과 그 이유

지시가 **MEDIUM·LOW 는 고치지 말고 수용으로 기록**하라고 했다. 아래는 전부 "지적이 맞다, 이번에 안 고친다"이다.

| # | 지적 | 수용 이유 |
|---|---|---|
| **M1** | 같은 사진·캐러셀 관측을 두 번 넣으면 없는 습관이 생긴다 (중복이 동률을 깨고 `sample_size` 를 부풀린다) | 지적이 맞다. 다만 "관측의 동일성"을 정의하는 일은 photo_id 중복 거부만으로 끝나지 않는다(같은 ID·다른 분석값도 갈라야 한다는 지적이 함께 있다). 입력 정규화 규칙을 새로 세우는 일이라 #11 범위 밖이다. 현재 호출자가 없어 실제 오염은 없다 |
| **M2** | cached `profile_id` 가 계정만 보므로 관측 세트가 달라도 같은 ID → E8 이 구별 못 한다 | 지적이 맞다. 업로드 경로는 캡션까지 해시에 넣는데 cached 는 안 넣어 원칙이 비대칭이다. 다만 ID 생성 규칙 변경은 **#24 의 E8 대조 의미**에 직접 닿고, 리뷰도 "실제 사용자 오염이 발생했다고 주장하지 않는다"고 적었다. 계약 소유자와 같이 정할 일이다 |
| **M3** | spec 4-1 의 `혼합`(최빈 비율 <0.6) 규칙이 구현에 없다. 동률이면 혼합 대신 생략한다. spec 6-2 의 분모 설명도 산식과 안 맞는다 | 지적이 맞다 — **spec 과 코드가 어긋난 것**이라 문서/코드 중 어느 쪽을 정본으로 할지 결정이 필요하다. 현재 코드(동률이면 생략)가 P3("억지로 채우지 않는다")에 더 가까워 보이지만, 그 판단은 spec 을 쓴 사람의 것이다 |
| **L1** | 글자 수·이모지 수가 표시 단위(grapheme)가 아니라 코드포인트 기준이다. NFD·국기·keycap·ZWJ 가족이 어긋난다 | 지적이 맞다. spec 이 코드포인트/`Extended_Pictographic` 방식을 **의도적으로** 정의했고 리뷰도 스키마 위반으로 올리지 않았다. 리뷰의 제안(정의·한계 명시)은 문서 변경이라 MEDIUM·LOW 불수정 지시에 따라 미뤘다 |
| **L2** | spec 6-1 의 `{snapshot:{posts:[]}}` 예제는 absent 기대인데 실제로는 account 누락 ContractError. `openers:{}` 는 ContractError 가 아니라 TypeError | 지적이 맞다. 문서 예제와 인자 검사의 불일치이며 정상 경로는 통과한다. 문서·검사 중 어느 쪽을 맞출지가 결정 사항이라 미뤘다 |
| **L3** | 상속된 검증기는 근거 **위조**(입력에 없는 ref, 남의 값 복사, 없는 profile_id)를 못 막는다 — #24 인계, 이 PR 에서 확장하지 말 것 | 리뷰 자신이 확장 금지로 표시했다. rebase 후 E10 이 들어오면서 feed·export 의 `uploaded_photo` ref 미해소는 이제 막힌다. CurrentProfile 자체의 ref 대조는 여전히 계약 밖이며 #24 소관이다 |

### 스키마를 바꿔야 한다고 판단한 것

**없다.** H1·H2 둘 다 기존 스키마의 optional 필드 생략과 `evidence` 배열만으로 고쳤다. `schemas/` 4종 무변경.

## 9. 아직 PENDING 인 것 (이 수정으로 해소되지 않음)

**#11 DoD 4번 — 캐러셀 1건을 인스타그램 앱에서 눈으로 대조.** 이번에도 안 했다.
있는 것은 저장된 Apify `childPosts` 순서와 저장된 웹 DOM 순서의 대조(10장·20장, 불일치 0)뿐이다.
`report.md`·이슈 댓글·`fixtures/ig_snapshot.json` 의 `carousel_order_check.limit` 세 곳 모두 이 차이를 적고 있다.
**웹 DOM 대조로 앱 눈 대조를 대체해도 되는지는 요구사항 책임자의 결정**이고, 이 수정이 대신하지 않는다.

다만 H1 수정으로 **이 PENDING 의 위험은 줄었다.** 전에는 A2 가 무엇이든 코드가 순서를 믿었지만,
이제는 스냅샷이 `같다` 를 들고 올 때만 믿는다. 판정이 뒤집히면 그 입력의 `opener_tendency` 가 자동으로 사라진다.

## 10. 바뀐 파일

| 파일 | 무엇 |
|---|---|
| `lib/current_profile.js` | H1 A2 게이트, H2 근거 선택(`evidence()` → `cite()`) |
| `test/current_profile.test.js` | 회귀 5건 (수정 전 전부 실패) |
| `docs/specs/11-current-profile/attack.mjs` | 공격 재현 스크립트 (신규) |
| `docs/specs/11-current-profile/spec.md` | 4-2 에 A2 조건 추가(3→4조건), 4-4 근거 선택 규칙 신설, 6-3 문구 |
| `prompts/input/current_extract.md` | A2 를 입력마다 확인하도록, 확인 체크리스트 2줄 |
| `docs/specs/11-current-profile/report.md` | 절 번호 참조 1곳(4-4 → 4-5) |
| `docs/specs/11-current-profile/fix-report.md` | 이 문서 |

`schemas/` · `lib/contracts.js` · `eval/` · `api/` · `pivot/` · 다른 워크트리는 건드리지 않았다.
