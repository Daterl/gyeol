# PR #31 교차 리뷰 수정 보고 — H1 · M1 · M3

**기준 리뷰:** `docs/specs/12-order-proposal/review-codex.md` (Codex 교차 리뷰, 2026-09-17).
**범위:** BLOCKER 0건, HIGH 1건(H1), 코디네이터가 지정한 MEDIUM 2건(M1·M3). **이 셋만 고쳤다.** M2·LOW 는 아래 6절에 수용으로 기록한다.
**rebase:** `origin/main` = `98cd5c72eff69c363df3603e95138992fb665e50` (PR #32 — Next 기반 merge 이후) 위로 rebase 했다. 리뷰 시점 base `32eff4f` 가 아니다.
실행 환경: macOS Darwin 24.6.0, Node `v22.22.3`, 워크트리 `.work/gyeol-12`, 브랜치 `feat/12-order-proposal`.

---

## 0. rebase 로 달라진 기준 — 먼저 적는다

리뷰가 쓴 base `32eff4f` 는 이미 PR #21(계약 기반·E9·E10·E11)을 포함하고 있었다. **E9·E10·E11 은 이 브랜치가 갈라진 시점에 이미 있었고**, 리뷰의 eval 출력이 그것을 그대로 보여준다. rebase 로 새로 들어온 것은 PR #32 (Next.js 기반)다.

| 바뀐 것 | 리뷰 시점 | rebase 후 | 이 PR 에 준 영향 |
|---|---|---|---|
| base | `32eff4f` | `98cd5c72eff69c363df3603e95138992fb665e50` | 충돌 0건. 이 PR 이 건드리는 `lib/order.js`·`test/order.*`·`docs/specs/12-*` 는 #32 와 겹치지 않는다 |
| `npm run check` 문구 | `32 JS/JSON files … zero dependencies` | `33 JS/JSON files … TypeScript is checked separately` | **report.md 의 "의존성 0개 유지" 주장이 레포 수준에서는 더 이상 참이 아니다.** #32 가 next·react 등을 넣었다. `lib/order.js` 가 `node:crypto` 만 쓴다는 것은 그대로 참이고, 그렇게 좁혀 다시 적었다 |
| `src/app/api/feed/route.ts` | 없음 | 있음 | H1 의 "사진만 입력" 경로가 실재하는 파일이 됐다. **다만 `lib/feed.js:28` 이 여전히 `501 LIVE_NOT_IMPLEMENTED` 를 돌려주므로 live 경로는 아직 없다** — H1 판정은 바뀌지 않는다 |

앞선 PR #21 의 H1(지향축 미검증)·H2(evidence ref 미해소)가 이 코드에도 같은 형태로 있는지 봤다. **없다** — 이 PR 은 생성기이고, 생성한 피드를 반환 전에 `validateFeed(feed, ids, currentProfile, targetProfile, photoAnalyses)` 로 통과시킨다(`lib/order.js:177`). 리뷰가 직접 실행해 E9·E10·E11 이 각각 위조를 거부하는 것을 확인했다(review-codex.md 6절). 남은 구멍은 M2 하나이고 그것은 기존 validator 의 범위 한계다 — 6절 수용 기록 참조.

---

## 1. H1 — "사진만 입력" DoD 를 PASS 로 쓴 것을 정정했다

### 1-1. 무엇이 틀렸나

report.md 는 이 DoD 를 **PASS** 로 적고 근거로 테스트 2·3·4번을 댔다. 그런데 그 테스트들의 `run()` 헬퍼는 **모든 호출에 `quiet` TargetProfile 과 absent CurrentProfile 을 주입한다**(`test/order.test.js:20-21`). 사진만 넣은 호출은 한 번도 없었다. 리뷰가 지적한 그대로다.

이슈 문구에 가장 가까운 입력을 실제로 돌리면:

```text
H1 photos-only REJECT — targetProfile: expected object
```

### 1-2. 고치는 방향 — 기능 추가가 아니라 주장 정정

**`orderFeed` 의 `targetProfile` 필수 계약은 그대로 둔다.** 프로필이 없을 때 기본 프로필을 지어 넣는 것은 PR #21 의 **E9 가 막으라고 만들어진 바로 그 위조**다(`applied_profile.target_profile_id` 가 실제 입력 프로필과 같아야 한다). 없는 지향축을 함수가 발명하면 E9 는 자기가 발명한 값과 자기를 대조하게 된다.

그래서 세 가지만 했다.

1. **report.md 의 해당 행을 PASS → 부분 PASS / PENDING 으로 정정했다.** ID 보존(3·20장)은 PASS 그대로, "사진만 입력 성공 경로"는 PENDING 이다.
2. **인수 조건을 확정해 적었다** (아래 1-3).
3. **경계를 고정하는 테스트를 추가했다** — 프로필을 주입한 테스트를 다시 "사진만 입력 PASS" 로 읽지 못하게 한다.

### 1-3. 사진만 입력을 어떤 조건에서 인수하는가 — 확정

**담당: #24 배선.** 아래 두 가지가 **동시에** 보일 때 인수한다. 하나라도 없으면 인수하지 않는다.

| # | 인수 조건 | 왜 이것인가 |
|---|---|---|
| A1 | `GET /api/feed` 가 **사진만 받은 요청**에 501 이 아니라 200 + `OrderedFeed` 를 돌려준다 | 지금은 `lib/feed.js:28` 이 `LIVE_NOT_IMPLEMENTED` 로 501 이다. 사용자 입력 경로가 아직 존재하지 않는다 |
| A2 | 그 응답의 `applied_profile.target_profile_id` 가 **#10 추출기가 그 사용자의 실제 입력에서 뽑은** TargetProfile 의 ID 와 같다 (E9 통과) | 코드에 상수 기본 프로필을 심어 A1 만 만족시키면 **지어낸 지향축**이다. 그건 인수 조건이 아니라 E9 가 잡아야 할 결함이다 |

인수 시 그 경로에서 **3·15·20장 photo_id 보존을 다시 확인한다**(지금은 `orderFeed` 직접 호출에서만 확인됐다).

### 1-4. 증거 — 고치기 전/후

H1 은 **코드 결함이 아니라 문서의 완료 주장 결함**이다. 그래서 "공격 입력이 수정 전 통과 → 수정 후 실패" 형태로는 나타나지 않는다. 그 사실을 감추지 않고 그대로 적는다.

| | 수정 전 | 수정 후 |
|---|---|---|
| `orderFeed({photoAnalyses: photos20})` 의 **동작** | `ContractError: targetProfile: expected object` | **같다 (의도적으로 안 바꿨다)** |
| report.md 의 **주장** | "사진만 입력도 정상 처리 … **PASS**" | "부분 PASS / **PENDING** — 인수 조건 A1·A2, 담당 #24" |
| 그 주장을 **다시 못 하게 막는 것** | 없음 (아무 테스트도 사진만 입력을 돌리지 않았다) | 새 테스트 15번이 사진만 입력의 거부를 고정한다 |

새 테스트 15번 `photo-only input is rejected here; the photo-only DoD belongs to the wiring layer` 는 수정 전·후 **둘 다 통과한다**. 동작을 안 바꿨으니 당연하다. 회귀 방지용 고정이지 before→after 증거가 아니다. **이것을 H1 을 고쳤다는 증거로 쓰지 않는다.**

---

## 2. M1 — 보너스가 순서를 뒤집었는데 "측정 점수가 가장 높다"고 말하던 문장

### 2-1. 재현 (수정 전)

리뷰와 같은 입력: `quiet` + `opener_tendency: 인물`(캐러셀 12건 관측) + `ph_09` 에 관측된 얼굴.

```text
M1 무보너스 방향 점수 [ [ 'ph_09', 0.8254 ], [ 'ph_11', 0.906 ] ]
M1 1번 자리 사진 ph_09
M1 rationale.value: 밝기 0.612 · 채도 0.097 · 한 색이 넓게 깔린 화면이라 지향 방향(조용한 쪽) 점수가
  입력 20장 중 가장 높아 1번에 뒀다 캐러셀 여는 사진 경향(얼굴이 관측된 사진)도 같은 방향이다.
M1 "가장 높아" 주장 포함? true
M1 총점/보너스 명시? false
```

측정 점수 1위는 `ph_11`(0.906)이고 `ph_09`(0.825)는 2위다. 보너스 +0.15 가 뒤집은 것인데 문장은 **측정 점수가 1위라서 뽑았다**고 말한다. 보너스는 "도 같은 방향이다"라는 부수적 일치로 밀려나 있다. 사용자에게 직접 보이는 `rationale.value` 가 선택의 실제 원인을 잘못 요약한다 (P2).

### 2-2. 고친 것

`lib/order.js` 의 첫 자리 문장을 `openerText()` 로 분리하고, **무보너스 점수 1위인지**(`score.topByMeasure`)를 받아 세 갈래로 쓴다. 알고리즘·가중치·보너스 상한은 **한 글자도 안 바꿨다** — 같은 입력이 같은 순서를 낸다.

```text
수정 후 (보너스가 뒤집은 자리):
밝기 0.612 · 채도 0.097 · 한 색이 넓게 깔린 화면이다. 지향 방향(조용한 쪽) 측정 점수는 0.825 로
입력 20장 중 1위가 아니지만, 보너스 0.15 를 더한 총점이 0.975 로 가장 높아 1번에 뒀다
— 캐러셀 여는 사진 경향, 얼굴이 관측된 사진.

수정 후 (보너스가 걸렸지만 측정 점수도 1위인 자리):
… 지향 방향(조용한 쪽) 측정 점수가 0.906 로 입력 20장 중 가장 높아 1번에 뒀다.
캐러셀 여는 사진 경향 보너스 0.15 도 같은 방향이다 — 얼굴이 관측된 사진.

수정 후 (보너스 없음 — 바뀌지 않았다, 바이트 동일):
밝기 0.808 · 채도 0.086 · 한 색이 넓게 깔린 화면이라 지향 방향(조용한 쪽) 점수가
입력 20장 중 가장 높아 1번에 뒀다
```

`rule` evidence 의 보너스 표기(`보너스 0.15 를 더했다`)와 `ig_post` evidence 는 그대로 남는다. 바뀐 것은 사람이 읽는 주 문장뿐이다.

### 2-3. 증거 — 공격 입력이 수정 전 통과 → 수정 후 실패

새 테스트 14번 `a bonus that flipped the opener is named as the reason, not hidden behind the measurement` 를 **수정 전 `lib/order.js`(`git show HEAD:lib/order.js`)에 그대로 돌렸다.**

```text
=== 수정 전 lib/order.js + 수정 후 테스트 ===
ok 13 - carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
not ok 14 - a bonus that flipped the opener is named as the reason, not hidden behind the measurement
ok 15 - photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
ok 16 - rejects inputs the contract cannot accept instead of guessing
# tests 16
# pass 15
# fail 1

  name: 'AssertionError'
  operator: 'match'
  actual: '밝기 0.612 · 채도 0.097 · 한 색이 넓게 깔린 화면이라 지향 방향(조용한 쪽) 점수가 입력 20장 중
           가장 높아 1번에 뒀다 캐러셀 여는 사진 경향(얼굴이 관측된 사진)도 같은 방향이다.'
  stack: test/order.test.js:159

=== 복원 후 재실행 ===
# tests 16
# pass 16
# fail 0
```

**수정 전에는 그 문장이 그대로 나와서 테스트가 깨지고, 수정 후에는 통과한다.** 테스트는 세 갈래를 다 건다 — (a) 뒤집힌 자리는 "1위가 아니지만 … 총점이 가장 높아"를 말해야 하고 "점수가 입력 20장 중 가장 높아"를 말하면 안 된다, (b) 이미 1위인 자리는 1위 주장이 맞으니 그대로 쓴다, (c) 보너스 없는 자리의 문장은 안 바뀐다.

### 2-4. `eval/broken/` 에 케이스를 남기지 않은 이유

남기려 했으나 **이 구조에 들어갈 자리가 없다.** `eval/broken/*.json` 은 `{invariant, document, path, value}` 로 문서 한 필드를 바꾸고 **기존 불변식 하나**가 그것을 잡는지 보는 형식이다(`eval/run.js:17-21`, `eval/invariants.js:28-34`). M1 은 `rationale.value` 라는 **한국어 문장의 의미**가 틀린 것이고 이를 잡는 불변식이 없다. 새 불변식(E12)을 만들면 (a) 이슈 #12 범위 밖의 eval 계약 변경이고, (b) 검증기가 자연어 의미를 판정하게 된다 — 리뷰가 명시적으로 요구하지 않는다고 적은 바로 그것이다("범용 자연어 의미 검증을 요구하지 않는다"). 그래서 회귀는 `test/order.test.js` 14번에 두고, **`eval/` 은 이 PR 에서 여전히 한 줄도 건드리지 않았다.**

---

## 3. M3 — #26 캡션 차이와 #20 인계 기록

이슈 원문은 "#13을 생략해도 다른 프로필 2벌에서 position 정렬 photo_id **및 #26 캡션 차이**를 **#20에 남긴다**"이다. report 는 순서 차이만 보고 PASS 로 적었다. 셋으로 갈라 다시 적는다.

| 조각 | 판정 | 근거 / 남은 것 |
|---|---|---|
| 프로필 2벌의 position 정렬 photo_id | **PASS** | report.md 3절. 실사진 15·20장 두 프로필 4벌의 배열 |
| **#26 캡션 차이** | **PENDING — 이 PR 범위 밖** | #26(출력 생성 서버)과 F3 는 이 PR 이 호출하지 않는다. F2 는 `caption_inputs` 만 넘기고 캡션을 채우지도 비우지도 않는다. 캡션 차이는 F3 가 생긴 뒤에만 만들어진다 |
| **#20 에 남기기** | **PENDING → 이 수정에서 처리** | 리뷰 확인 시점에 #20 댓글 0건이었다. 아래 순서 자료를 #20 에 인계 댓글로 남긴다. 캡션 차이 몫은 #26·F3 담당이 이어서 남긴다 |

#20 에 넘기는 자료(실사진 · 같은 입력 · 프로필만 교체):

```text
15장 quiet   ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_13 ph_14 ph_04 ph_07 ph_08 ph_15 ph_12 ph_10 ph_05
15장 detail  ph_03 ph_11 ph_02 ph_09 ph_01 ph_14 ph_04 ph_15 ph_06 ph_07 ph_08 ph_13 ph_10 ph_12 ph_05
20장 quiet   ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_03 ph_16 ph_17 ph_12 ph_15 ph_07 ph_18 ph_13 ph_10 ph_20 ph_08 ph_05
20장 detail  ph_03 ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_17 ph_16 ph_13 ph_18 ph_07 ph_08 ph_15 ph_12 ph_10 ph_20 ph_05
```

---

## 4. 바뀐 파일

| 파일 | 무엇이 |
|---|---|
| `lib/order.js` | 첫 자리 문장을 `openerText()` 로 분리, 무보너스 점수 1위 여부를 받아 보너스가 결정 원인일 때 총점을 주 문장에 쓴다. **순서를 정하는 로직은 안 바꿨다** |
| `test/order.test.js` | 테스트 2건 추가 (14 = M1 회귀, 15 = H1 경계 고정). 81 → 83 |
| `docs/specs/12-order-proposal/report.md` | DoD 표의 H1·M3 행 정정, rebase 로 달라진 기준 SHA·check 문구·의존성 주장 정정 |
| `docs/specs/12-order-proposal/fix-report.md` | 이 문서 (신규) |
| `docs/specs/12-order-proposal/{test,eval,check}.txt` | rebase 후 재실행 출력으로 교체 |
| `docs/specs/12-order-proposal/review-codex.md` | 리뷰 원문 (신규, 리뷰어가 남긴 것) |

**`schemas/` 4종: 변경 0.** `eval/`: 변경 0. `lib/contracts.js`: 변경 0.

---

## 5. 전 검증 재실행 — rebase 후 새 계약 기준

### `npm test` (exit 0)

```text
1..83
# tests 83
# suites 0
# pass 83
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 138.270834
```

81 → **83**. 추가 2건은 위 H1·M1 회귀다. 기존 81건 회귀 0.

### `npm run eval` (exit 0)

```text
Synthetic manual bootstrap only; no AI quality or human agreement claim.
quiet:  E1 PASS, E2 PASS, E3 PASS, E6 PASS, E8 PASS, E9 PASS, E10 PASS, E11 PASS
detail: E1 PASS, E2 PASS, E3 PASS, E6 PASS, E8 PASS, E9 PASS, E10 PASS, E11 PASS
quiet broken E1:  EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2:  EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3:  EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6:  EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8:  EXPECTED FAIL — E8: absent current requires honest target-only disclosure
quiet broken E9:  EXPECTED FAIL — E9: target profile ID differs from actual input
quiet broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
quiet broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_01
detail 8종도 동일하게 EXPECTED FAIL (ph_15)
E4/E5/E7: manual spot-check only; real demo review pending.
```

전문은 같은 폴더 `eval.txt`. 표 형태 원본 그대로다.

### `npm run check` (exit 0)

```text
PASS: 33 JS/JSON files checked; four schema examples match fixtures.
Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```

**문구가 리뷰 시점과 다르다.** rebase 로 들어온 #32 가 `scripts/check.js` 와 의존성 상황을 바꿨다 — 0절 참조. 레포에 의존성 0개라는 주장은 더 이상 못 한다. **`lib/order.js` 가 `node:crypto` 만 import 한다**는 좁은 주장만 유지한다.

### 재현 스크립트

```sh
# H1·M1 공격 입력 (수정 전/후 모두 같은 스크립트)
node probe.mjs                     # 6-1 의 스크립트. ORDER_MODULE 로 수정 전/후 모듈을 갈아끼운다
# M1 회귀가 수정 전 코드에서 깨지는지
git show HEAD:lib/order.js > /tmp/order.prefix.js && cp lib/order.js /tmp/order.fixed.js
cp /tmp/order.prefix.js lib/order.js && node --test test/order.test.js   # 14번 not ok
cp /tmp/order.fixed.js lib/order.js && node --test test/order.test.js    # 16/16 ok
```

---

## 6. 수용 — 고치지 않기로 한 것

| # | 리뷰 지적 | 수용 이유 |
|---|---|---|
| **M2** | E10 은 "같은 입력 집합에 있다"만 본다. 다른 슬롯의 rationale 통째 복사·rule-only 손상은 통과한다 | **기존 validator 의 알려진 범위 한계**이고 이 PR 이 만든 구멍이 아니다. 리뷰도 "새 생성기 HIGH 회귀로 세지 않는다"고 적었다. PR #21 의 **E11 이 사진 단위 대조(describable_facts 출처)를 이미 하고 있어** 가장 위험한 형태는 막힌다. 여기서 더 파려면 자연어 의미 검증이 필요하고 그건 #12 범위 밖이다. 대신 **문서 주장을 좁혔다** — report.md 의 "E10 으로 필드/판단까지 역추적 보장"을 "입력 사진 ID 해소까지"로 고쳤다 |
| **M2 부속** | `applied_profile.visual` 을 detail 값으로 바꿔도 ACCEPT | 리뷰가 "앞선 리뷰가 명시적으로 제외한 값 수준 프로필 합성 검증 범위"라고 스스로 적었다. E9 는 ID 동일성까지가 설계다. 값 수준 대조는 #13(두 축 합성) 소관 |
| **LOW-1** | 실사진 fixture 가 raw 게시물/캐러셀이 아니라 PhotoAnalysis 스냅샷이다. vision_model 경로 미검증 | report.md 6절이 이미 PENDING 으로 고지했다. `ANTHROPIC_API_KEY` 가 없어 이 세션에서 해소 불가. 리뷰도 "중복 산정하지 않는다"고 적었다 |
| **LOW-2** | `spec.md` 의 "동일 측정값이면 입력 순서 유지"가 tie-break 와 최종 순서를 혼동시킨다 | 지적이 맞다(리뷰가 실행으로 확인: 동일 측정값 3장 입력 `ph_01 ph_02 ph_03` → 출력 `ph_01 ph_03 ph_02`). **다만 `spec.md` 문구 수정은 코디네이터가 지정한 수정 범위 밖이라 하지 않았다.** 결정성 자체는 문제없고, 정확한 문구는 "각 선택의 동점은 input_index 우선"이다 — 다음 회차 후보로 남긴다 |

### 6-1. 공격 입력 재현 스크립트

```js
// ORDER_MODULE=<경로> 로 수정 전/후 lib/order.js 를 갈아끼운다. 레포 파일은 수정하지 않는다.
import fs from 'node:fs';
const root = '/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-12/';
const { orderFeed } = await import(process.env.ORDER_MODULE ?? root + 'lib/order.js');
const read = p => JSON.parse(fs.readFileSync(root + p));
const p = read('test/order.real20.json');
const q = read('eval/golden/case_01/target_quiet.json');
const c = read('eval/golden/case_01/current_profile.json');
const run = (photos = p, target = q) =>
  orderFeed({ photoAnalyses: photos, targetProfile: target, currentProfile: c, now: '2026-09-17T00:00:00.000Z' });

// H1: 사진만 입력
try { console.log('H1 photos-only ACCEPT', orderFeed({ photoAnalyses: p }).slots.length); }
catch (e) { console.log('H1 photos-only REJECT —', e.message); }

// M1: 보너스가 순서를 뒤집었을 때의 근거 문장
const t = structuredClone(q);
t.sequence = { carousel_count: 12, opener_tendency: { value: '인물', confidence: .6, evidence: [{ kind: 'ig_post', ref: 'carousel', note: '관측' }] } };
const faces = p.map(a => a.photo_id === 'ph_09' ? { ...a, has_face: true, analysis_source: 'vision_model', model: 'test' } : a);
const nudged = run(faces, t).slots.find(s => s.position === 1);
const score = a => .4 * a.color.bright_mean + .4 * (a.composition === 'negative_space') + .2 * (1 - a.color.sat_mean);
console.log('M1 무보너스 방향 점수', p.filter(a => ['ph_09','ph_11'].includes(a.photo_id)).map(a => [a.photo_id, +score(a).toFixed(4)]));
console.log('M1 1번 자리 사진', nudged.photo_id);
console.log('M1 rationale.value:', nudged.rationale.value);
console.log('M1 총점/보너스 명시?', /보너스|총점/.test(nudged.rationale.value));
console.log('CTRL 무보너스 rationale:', run().slots.find(s => s.position === 1).rationale.value);
```

---

## 7. 남은 게이트 (변동분만)

| # | 남은 것 | 누가 |
|---|---|---|
| G1 | **다중 모델 리뷰** — Codex 교차 리뷰 1건 완료. 두 번째 모델 미실행 | 이 PR 필수 게이트 |
| G2 | **사람 merge** — AI 는 merge 하지 않는다 | 코디네이터 |
| **G8** | **사진만 입력 인수 (H1 1-3절의 A1·A2)** | #24 배선 |
| **G9** | **#26 캡션 차이를 #20 에 남기기** | #26 · F3 담당 |
| G4 | 스키마 변경 요청 5건 심의 (`spec.md` 8절) | `CLAUDE.md` 4-2절 |
| — | 기존 G3·G5·G6·G7 은 report.md 7절 그대로 | |
