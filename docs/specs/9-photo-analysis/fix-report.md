# PR #30 수정 1회차 — `review-codex.md` BLOCKER·HIGH 반영

**결론: HIGH 4건(H1~H4) 전부 코드로 막았다. BLOCKER 는 원래 없었다. MEDIUM 은 M2 한 건만 고치고 M1·M3 는 수용 기록으로 남겼다(이유는 6절).**
스키마 `schemas/` 4종은 한 글자도 바꾸지 않았다. 기능을 추가하지 않았고 이슈 #9 범위 밖으로 나가지 않았다.

## 0. 기준선 — rebase 결과

**rebase 를 두 번 했다.** 작업 도중 `origin/main` 이 움직였기 때문이다.

**1차 (작업 시작 시) — no-op.**

```text
merge-base = origin/main = 32eff4f   (PR #21)
HEAD = aab1a18 의 부모가 이미 32eff4f
```

PR #21 이 merge 된 `32eff4f` 가 이미 내 커밋의 부모였다. 불변식 **E9·E10·E11 은 이 브랜치 기준선에 처음부터 들어 있었다.** 충돌 없음.

**2차 (수정·검증 후) — 충돌 1건.** push 이후 `origin/main` 이 5커밋 전진했다(PR #28 #29 #32).

```text
origin/main = e871480
충돌: scripts/server.js  ← PR #32(Next 기반)가 api/feed.js → lib/feed.js 로 옮김
```

**해소 방식: main 쪽을 따랐다.** feed 의 import 경로는 main 의 `../lib/feed.js` 를 쓰고, 내 `analyze` 라우트 한 줄만 유지했다. 계약 파일(`schemas/`, `lib/contracts.js`, `eval/`)은 양쪽 모두 건드리지 않았다.

**⚠️ 코디네이터 확인 요청:** PR #32 가 `api/` 를 **비웠다**(`api/.gitkeep` 만 남음). 핸들러는 `lib/<name>.js`, Next 래퍼는 `src/app/api/<name>/route.ts` 가 새 패턴이다. **내 `api/analyze.js` 는 그 패턴 밖에 있다.** 옮기지 않은 이유: 리뷰가 "프레임워크 이식을 추가 요구하지 않는다"(LOW)고 명시했고 `#24` 의 일이며, 옮기면 이번 수정 전체보다 큰 diff 가 된다. **merge 는 되지만 구조 정합성은 남은 판단이다.**

`docs/specs/1-contract-foundation/review-claude.md` 의 H1·H2 를 읽고 **같은 형태의 구멍이 내 코드에 있는지** 확인했다. 그 두 건의 뿌리는 *"필드가 있는지만 보고 무엇을 가리키는지는 아무도 보지 않는다"* 다. 내 코드에 같은 형태가 하나 있었다 — `review-codex.md` 가 M2 로 등급한 건이다. **MEDIUM 이지만 고쳤다**(6절에 이유).

## 1. 무엇을 고쳤나 — 한 줄씩

| # | 지적 | 고친 방향 | 위치 |
|---|---|---|---|
| H1 | 베이스라인 JPEG 의 AC 를 다음 DC 로 읽어 틀린 색 반환 | **AC 계수를 소비**해 블록 경계를 맞춤 (값은 여전히 안 쓴다) | `lib/jpeg_dc.js:81` `consumeAcBlock`, `:128`, `:200`, `:206` |
| H2 | 계약 위반 응답이 500 + 캐시 고착 | 계약 검증을 **fallback 안 · 캐시 쓰기 전**으로 이동 | `lib/photo_analysis.js:344` |
| H3 | 비가시 SVG 를 사실로 생성 | 지원 형태를 **fixture 카드 하나**로 좁히고 그 밖은 거절 | `lib/photo_analysis.js:139–188` (`measureSvg`) |
| H4 | 색 빈도를 '여백' 으로 단정 | `composition` 을 **고정값으로 내려앉힘** (`scale` 과 같은 처리) | `lib/photo_analysis.js:30–39` (상수+근거), `:214` |
| M2 | 주입 observation 이 실제 photo 신원을 덮어씀 | 스키마 선언 필드만 채택 + 신원은 **항상 호출자 값으로 재각인** | `lib/photo_analysis.js:251–270` (`pickObservation`·`stampAnalysis`), `:344` |

### 뿌리 문제에 대한 답 — "측정한 척하는 값" 3건

H1·H3·H4 는 전부 같은 병이었다: **확인할 수 없는 것에 그럴듯한 숫자를 붙였다.** 고친 방향은 정확도를 올린 것이 아니라 **말하지 않는 것**이다.

- **H4 `composition`** — 색 히스토그램에는 위치도, 연결된 빈 영역도, 피사체도 없다. 그래서 `dominantShare >= 0.28 → negative_space` 매핑을 **버렸다.** `#12` 워커가 `scale`·`has_face` 에 한 것과 같은 처리다: 스키마에 `unknown` 이 없으므로 **눈에 보이게 고정된 값**을 내고, spec 에 "downstream 은 이것을 공간적 근거로 읽지 말라"를 못박았다. 점유율 자체는 버리지 않았다 — **색 점유율이라고 말하는 형태로** `describable_facts` 의 `"주요 색 #xxxxxx (점유 26%)"` 문장에 이미 있다. 관측을 지운 게 아니라 **관측이 아닌 해석을 지웠다.**
- **H3 SVG** — `fill` 속성 개수는 면적이 아니고, `display="none"` 인 요소는 관측이 아니다. 래스터라이저가 없으므로 면적을 알 방법이 rect 기하 하나뿐이고, 그래서 **지원 형태를 골든 fixture 가 쓰는 그 하나로 좁혔다.** 그 밖은 값을 만들지 않고 `ANALYSIS_UNAVAILABLE` 로 비운다. 일반 SVG 렌더러는 추가하지 않았다(리뷰가 요구하지 않았고 범위 밖이다).
- **H1 JPEG** — 여기만 유일하게 **"비우기" 가 아니라 "제대로 재기"** 를 택했다. 리뷰가 준 두 선택지(`올바르게 소비` / `baseline 거절`) 중 전자다. 이유: baseline 거절은 **정상 사진 4장을 실패**시키는데(리뷰 표의 "정상 파일 실패" 행), AC 소비는 12줄이고 **증명 가능하게 정확**하다 — 순백이 정확히 `1.000/0.000`, 순흑이 `0.000/0.000`, 그리고 같은 화소의 baseline·progressive 두 인코딩이 일치한다. 비울 이유가 없다: **잴 수 있는 것이었고, 이제 정말로 잰다.** 그래서 spec 의 SOF0/1 지원 주장도 정정할 필요가 없어졌고(이제 참이다), 대신 "AC 는 값은 안 쓰지만 소비는 해야 한다"는 이유를 spec 과 코드 주석에 남겼다.

## 2. 증명 — 공격 입력이 수정 전 통과 → 수정 후 실패

리뷰어가 재현한 입력을 그대로 만들고, **같은 스크립트를 수정 전/후 코드에 각각 돌렸다.** 통과만 확인하면 무엇이 막혔는지 알 수 없으므로 양쪽을 남긴다.

### A1 — 베이스라인 JPEG 오측정 (H1)

정답은 Pillow 전체 디코드와 **구성상 자명한 값**(순백=1.0, 순흑=0.0) 두 가지로 잡았다.

| 입력 | 정답 (bright/sat) | **수정 전** | **수정 후** |
|---|---|---|---|
| 순백 64×64 baseline | `1.000 / 0.000` | `0.968 / 0.013`, hue 151.7, `#f4f7f5` ← **틀린 색을 정상 반환** | **`1 / 0`**, hue 0, `#ffffff` |
| 순흑 64×64 baseline | `0.000 / 0.000` | `0 / 0.016`, hue **120** ← **무채색에 색조 생성** | **`0 / 0`**, hue 0 |
| gradient 96×64 baseline | `0.626 / 0.435` | `0.714 / 0.118` ← **채도 3.7배 오차** | **`0.624 / 0.431`** |
| gradient 96×64 progressive (같은 화소) | `0.626 / 0.435` | `0.623 / 0.432` | `0.623 / 0.432` (변화 없음) |

**실제 인스타 사진을 baseline 으로 재인코딩한 쌍** — 리뷰 표의 "정상 파일 실패" 행을 그대로 재현:

| 입력 | Pillow 전체 디코드 | **수정 전** | **수정 후** |
|---|---|---|---|
| `kr29cm_Dc-GJ-iCezC_00-base.jpg` | `0.743 / 0.162` | **`null` (측정 불가)** | **`0.742 / 0.161`** |
| `kr29cm_Dc-GJ-iCezC_00-prog.jpg` | `0.743 / 0.162` | `0.741 / 0.161` | `0.741 / 0.161` |
| `c29_DdILtQ0CRl8_00-base.jpg` | `0.329 / 0.307` | **`null` (측정 불가)** | **`0.327 / 0.301`** |
| `c29_DdILtQ0CRl8_00-prog.jpg` | `0.329 / 0.307` | `0.327 / 0.303` | `0.327 / 0.303` |

정답과의 오차가 `0.001~0.006` 이다. **progressive 경로의 값은 한 자리도 변하지 않았다** — 고친 것이 baseline 경계뿐임을 그 불변성이 보여준다.

### A2~A5 — 나머지 세 HIGH 와 M2

```text
### A2  계약 위반 모델 응답 → 500 / 캐시 고착 (H2)
                                   수정 전                                        수정 후
호출 1      throw: PhotoAnalysis.text_in_image: expected nonempty   →  통과 source=heuristic
            modelFailures:0 cacheSize:1                                modelFailures:1 cacheSize:1
호출 2      throw: 같은 예외 (모델 재시도 없음)                        →  통과 source=heuristic
재요청      throw: 같은 예외  ← 캐시 고착                              →  복구 source=heuristic

### A3  비가시 SVG / 깨진 SVG 를 사실로 생성 (H3)
                                   수정 전                                        수정 후
svg-hidden  통과(!) bright=0.5 palette=["#ffffff","#000000"]          →  거절: no observable pixels
            text="서울 &amp; 부산"  ← 면적 0 인 rect 가 "50%",
            display:none 글자가 사실, 엔티티도 미해제
            facts=[…"주요 색 #000000 (점유 50%)"]
svg-broken  통과(!) bright=1 palette=["#ffffff"]  ← 닫히지도 않은 SVG  →  거절: no observable pixels

### A4  색 빈도를 여백으로 단정 (H4)
                                   수정 전                                        수정 후
checker_progressive.jpg   composition=negative_space                   →  composition=full_frame (고정값)
checker_baseline.jpg      composition=full_frame (H1 때문에 우연히)     →  composition=full_frame (고정값)
실사진 15장               negative_space 3장 / full_frame 12장          →  15장 전부 동일 고정값
                          ← 값이 변한다는 것이 "측정한 척" 의 증거        ← 상수는 정보를 나르지 않는다

### A5  주입 observation 이 실제 photo 신원을 덮어씀 (M2)
                                   수정 전                                        수정 후
injected-identity  photo_id=ghost file_ref=other.jpg input_index=99   →  photo_id=real_photo
                   ← "항상 재각인" 주장이 성립하지 않았다                   file_ref=real.svg input_index=0
```

### 회귀 방지 — 새 테스트 7개가 수정 전 코드에서 **전부 실패**한다

공격 입력을 `test/photo_analysis.test.js` 에 회귀 케이스로 남겼다. 통과만으로는 증거가 아니므로, **수정 전 `lib/` 로 되돌려 같은 테스트를 돌렸다:**

```text
$ git checkout HEAD~1 -- lib/photo_analysis.js lib/jpeg_dc.js   # 수정 전 lib 로 되돌림
$ node --test --test-name-pattern='<새 테스트 7개>' test/photo_analysis.test.js
not ok 1 - a contract-violating model response falls back to heuristic and is not cached
not ok 2 - an observation cannot relabel which photo was analyzed
not ok 3 - baseline JPEG is measured, not mis-read: solid colours are exact
not ok 4 - baseline and progressive encodings of the same pixels agree
not ok 5 - SVG is measured only as the flat-colour card it claims to support
not ok 6 - SVG text is reported only when a viewer could see it, and unescaped
not ok 7 - composition is a documented constant, not a reading of the colour histogram
# tests 7
# pass 0
# fail 7
```

수정 후 같은 7개가 전부 통과한다(3절). **7/7 이 수정 전 실패 → 수정 후 통과** 이므로 이 테스트들은 실제로 해당 결함을 붙잡고 있다.

H1 회귀 테스트는 **이미지 라이브러리를 필요로 하지 않는다**(Pillow 는 fixture 생성과 정답 대조에만 썼고 제품·테스트 의존성으로 추가하지 않았다). 두 가지 방법으로 정답을 만든다: ① 단색 이미지의 색은 구성상 자명하다, ② 같은 화소의 baseline·progressive 두 인코딩은 서로 일치해야 한다. 커밋한 fixture 는 JPEG 4개 (`fixtures/jpeg/`, 합계 3,989 bytes).

**고친 테스트 2개** — 둘 다 틀린 동작을 성공으로 고정하고 있었다:
- `a model response that violates the contract is rejected, not trusted` → `assert.rejects` 로 **spec 의 "계약위반 → heuristic" 과 정반대**를 못박고 있었다. 이름과 내용을 fallback + 캐시 미오염 + 복구 검사로 바꿨다(리뷰 H2 지적 그대로).
- `heuristic-svg-fill@1` → `heuristic-svg-card@1`. 측정 방법이 `fill` 개수 세기에서 rect 기하로 바뀌었으므로 출처 라벨도 바꿨다. **라벨이 방법을 가리켜야 한다.**

## 3. 검증 — 세 명령 실제 출력 (rebase 된 새 계약 기준)

```text
$ npm test
> node --test test/*.test.js
1..127
# tests 127
# suites 0
# pass 127
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 301.217292
exit 0

$ node --test test/photo_analysis.test.js        # 이 PR 의 테스트 파일만
# tests 20
# pass 20
# fail 0

$ npm run check
> node scripts/check.js
PASS: 42 JS/JSON files checked; four schema examples match fixtures. Foundation JS
syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
exit 0

$ npm run eval
> node eval/run.js
Synthetic manual bootstrap only; no AI quality or human agreement claim.
quiet:  E1 E2 E3 E6 E8 E9 E10 E11 = 全 PASS
quiet broken E1:  EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2:  EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3:  EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6:  EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8:  EXPECTED FAIL — E8: absent current requires honest target-only disclosure
quiet broken E9:  EXPECTED FAIL — E9: target profile ID differs from actual input
quiet broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
quiet broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_01
detail: E1 E2 E3 E6 E8 E9 E10 E11 = 全 PASS
detail broken E1~E11: 동일하게 8건 EXPECTED FAIL (E11 만 ph_15)
E4/E5/E7: manual spot-check only; real demo review pending.
exit 0
```

eval 의 정상 표 두 개와 detail 쪽 broken 8줄만 축약했다. 그 외는 실제 stdout 이다. `check` 는 문법·JSON 검사이지 별도 lint/typecheck 통과가 **아니다** — 2차 rebase 로 들어온 `npm run typecheck`·`npm run lint`·`npm run test:ui` 는 **돌리지 않았다**(이 PR 은 TS·React 파일을 만들지 않는다. 판정 대상이라면 코디네이터가 지시해 주기를 요청한다).

**숫자가 1차 검증과 다른 이유:** 2차 rebase 로 main 의 PR #28·#29·#32 가 들어왔다. 테스트 `87 → 127`(main 의 `lib/feed.js`·`target_profile`·`current_profile` 테스트가 추가됨. 이 PR 의 파일은 `20`), check `34 → 42파일`. 또 **`check` 의 "의존성 0개" 게이트는 main 이 없앴다** — PR #32 가 Next·React 를 도입했기 때문이다. 아래에서 "의존성 0개" 라고 쓴 곳은 **"이미지 라이브러리를 추가하지 않았다"** 로 읽어야 정확하다. 불변식 E9·E10·E11 은 내가 추가한 것이 아니라 PR #21 이 넣은 것이며, 이 브랜치에서 그대로 통과한다.

### 실사진 15장 재실행 — 측정값은 한 자리도 변하지 않았다

```text
$ env -u ANTHROPIC_API_KEY node scripts/run_pipeline.js <real15> 15
1회차 (콜드 캐시)      사진 15 · 모델호출 0 · 모델실패 0 · 캐시적중 0  · 캐시미스 15 · 실패 0 · 214ms
2회차 (같은 바이트)    사진 15 · 모델호출 0 · 모델실패 0 · 캐시적중 15 · 캐시미스 0  · 실패 0 · 4ms
캐시 항목 수 = 15 (상한 64, 프로세스 수명 한정 · 영속 아님)
facts 90개 (15장 × 6줄)
```

`report.md` 2-1 표와 **`bright`·`sat`·`hue`·`top색점유`·`detail`·해상도·`facts` 전부 동일**하다. 달라진 칸은 `comp` 하나다: `negative_space` 3장(ph_02·ph_04·ph_09) → 15장 전부 고정값. **H4 만 바뀌고 측정은 그대로라는 것을 이 동일성이 보여준다.**

콜드 214ms 는 `report.md` 의 129ms 보다 느리지만 같은 자리 수이고, **시간은 고정값이 아니다**(리뷰도 같은 단서를 달았다). 15장 모두 progressive 이므로 H1 의 AC 소비 경로를 타지 않는다 — 즉 이 차이는 코드가 아니라 I/O·머신 변동이다. 실키 비용·지연은 여전히 측정하지 않았다(**PENDING**).

골든 SVG 카드 15장: `1회차 15 miss / 2회차 15 hit`, 실패 0, `facts` 60개, `model=heuristic-svg-card@1`, `ph_01` 은 `#e8dfd2` / hue 35.5 / text `synthetic 1` — 커밋된 fixture 의 `fill` 과 일치한다.

## 4. 이슈 #9 DoD — 리뷰가 FAIL 로 본 두 항목

| # | 조건 | 리뷰 판정 | 이번 판정 | 근거 |
|---|---|---|---|---|
| 5 | 모델 실패 → heuristic, 에러 아님 | **FAIL** | **PASS** | H2 수정. 계약 위반·throw 양쪽 모두 heuristic 이고 캐시에 남지 않는다(A2, 테스트 2건) |
| 7 | fallback 이 모르는 사실을 채우지 않음 | **FAIL** | **PASS** | H1 정확 측정 + H3 비가시 거절 + H4 구도 단정 제거(A1·A3·A4, 테스트 5건) |

나머지 6항목의 판정은 리뷰와 같다. **DoD 6(실키 토큰 비용)은 여전히 PENDING** 이며 리뷰와 같이 결함으로 세지 않는다. **DoD 2(사람 전수 대조)** 도 리뷰 표현을 유지한다 — 이번 실행에서 90개 항목이 이전과 동일함을 확인했을 뿐, 사람의 독립 전수 재인증을 새로 한 것은 아니다.

## 5. 스키마에 손대지 않았다

`schemas/` 4종은 변경 0줄이다(`git diff --stat` 에 나타나지 않는다). H4 를 고치면서 `composition` 에 `unknown` 이 없다는 것이 다시 걸렸지만 **바꾸지 않고** spec 8절의 스키마 변경 요청에 5번째 항목으로 적었다. `scale`·`has_face`·`analysis_source`·`duplicate_of` 에 이어 같은 형태의 요청이다. 네 건 모두 `CLAUDE.md` 4-2절 절차(L 크기, 양쪽 사람 승인) 대상이므로 이 PR 에서 손대지 않는다.

## 6. 고치지 않은 것 — 수용 기록

**MEDIUM·LOW 는 지시대로 고치지 않았다.** 예외는 M2 한 건이다.

| # | 지적 | 판단 | 이유 |
|---|---|---|---|
| **M2** | 주입 observation 이 photo 신원을 덮어씀 | **고쳤다 (MEDIUM 인데 예외)** | foundation `review-claude.md` H1·H2 와 **같은 형태의 구멍**이다 — 필드를 받고 실제 입력과 대조하지 않는다. 그 형태를 찾아보라는 지시가 있었고, H2 를 고치려면 같은 함수(observation→analysis 병합)를 어차피 다시 쓴다. 두 줄이고 H2 수정 범위 안이다. |
| M1 | 반환 객체가 캐시와 배열·색 객체를 공유 → 호출자가 편집하면 전역 캐시가 바뀐다 | **수용** | 실제 결함이고 깊은 복사로 막힌다. MEDIUM 이며 API 요청으로 exploit 되는 경로는 리뷰도 확인하지 못했다(모듈 호출자가 반환값을 직접 편집해야 한다). H1~H4 와 달리 **잘못된 값을 내보내는 문제가 아니라 호출자 규율 문제**다. 다음 회차 권고. |
| M3 | 전역 캐시의 `duplicate_of` 가 현재 입력에 없는 이전 세션 ID 를 가리킴 | **수용** | 리뷰 지적이 맞다. 다만 고치려면 "해시 관측 재사용" 과 "세션 내 중복 판정" 을 분리해야 하고, **판정 주체가 계약에 없다**(spec 8절 4번이 이미 적어 둔 스키마 문제다). 계약 변경 없이 고치면 또 다른 "측정한 척" 이 된다. 스키마 변경 요청과 함께 처리할 건. |
| LOW | fixture 대표성 — JPEG 테스트에 정상 JPEG 이 없었다 | **부분 해소** | H1 회귀가 정상 baseline/progressive 쌍과 순백·순흑을 넣으므로 **이 지적의 핵심은 해소됐다.** 인스타 수집기는 리뷰 지시대로 추가하지 않았다. |
| LOW | 이슈 본문 Owned 의 `src/app/api/analyze/route.ts` 와 실제 `api/analyze.js` 불일치 | **수용** | `#24` 인계 시 라우트 정합성 확인 사항. 리뷰도 프레임워크 이식을 요구하지 않았고 범위 밖이다. |

### `eval/broken/` 에 케이스를 남기지 못한 이유

지시는 "가능하면" 공격 입력을 `eval/broken/` 에 남기라는 것이었다. **남기지 않았고, 이유는 형식 불일치다.**

`eval/broken/*.json` 은 `{"path":[...],"value":...}` 로 **OrderedFeed/export 번들의 필드를 변조**하는 형식이고(`eval/invariants.js:28` `breakFixture`), `eval/run.js:17` 이 `E1 E2 E3 E6 E8 E9 E10 E11` 을 하드코딩해 돌린다. 내 공격 입력은 **이미지 바이트와 모델 응답** 수준이다 — JPEG 바이트열, SVG 문자열, 주입 client 의 반환값. 이 harness 로는 표현할 수 없다.

표현하려면 `eval/` 에 이미지-바이트용 두 번째 harness 를 새로 만들어야 하는데, 그 디렉토리는 PR #21 의 계약 검증 자산이고 **#9 범위 밖의 새 인프라**다. 그래서 공격 입력은 `npm test` 의 회귀 케이스로 남겼다(7개, 위에서 수정 전 전부 실패함을 보였다). `npm test` 가 CI 게이트이므로 회귀는 실제로 막힌다. **`eval/broken/` 확장이 필요하다고 판단되면 코디네이터가 별도 건으로 지시해 주기를 요청한다.**

## 7. 변경 파일

```text
scripts/server.js                   |   1 +          2차 rebase 충돌 해소 (main 의 lib/feed.js 경로 채택)
docs/specs/9-photo-analysis/spec.md |  27 +++---     H1 AC 소비 근거 / H4 고정값 / H3 카드 형태 / 스키마요청 5번
lib/jpeg_dc.js                      |  36 +++++-     H1
lib/photo_analysis.js               | 138 ++++-----   H2 H3 H4 M2
prompts/input/photo_analysis.md     |   2 +-         H4 (모델 응답일 때만 뜻을 가진다는 경계)
test/photo_analysis.test.js         | 135 ++++++--    회귀 7개 (신규 6 + 교체 1)
fixtures/jpeg/*.jpg                 |   4 files      H1 회귀 fixture (합계 3,989 bytes · 의존성 아님)
schemas/                            |   변경 없음
```

## 8. 남은 것

- **실키 토큰 비용·지연(DoD 6, A1 실측)** — PENDING. 키가 없어 측정하지 않았고, 추정치를 적지 않았다.
- **M1·M3** — 6절의 수용 기록. 다음 회차 또는 스키마 변경과 함께.
- **사람의 독립 전수 대조(DoD 2)** — 리뷰 표현 유지. 90개 항목이 이전 실행과 동일함만 확인했다.
- **merge 판단** — 하지 않았다. 코디네이터 판단 사항이다.
