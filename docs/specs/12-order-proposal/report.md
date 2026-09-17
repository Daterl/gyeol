# report.md — #12 검증 결과

기준 SHA **`98cd5c7`** (= `origin/main`, PR #32 Next 기반 merge 이후) · 브랜치 `feat/12-order-proposal` · 워크트리 `.work/gyeol-12` · 실행 2026-09-17 · Node v22+

> **2026-09-17 정정.** 이 문서의 최초 판은 base `32eff4f` 기준이었고, 교차 리뷰(`review-codex.md`)가 완료 주장 2건의 오류를 잡았다.
> 정정한 행은 아래 표에 ⚠️ 로 표시했고, 정정 근거와 재검증 출력은 같은 폴더 **`fix-report.md`** 에 있다.

**Verdict: 부분 PASS (명시한 로컬 검증 범위) / 사진만 입력 경로·실모델·배포·사람 리뷰 PENDING**
아래 출력은 전부 실제 실행 결과를 붙인 것이다. 미실행을 PASS 로 쓰지 않았다.

---

## 0. 이슈 DoD 대조

| 이슈 DoD | 판정 | 근거 |
|---|---|---|
| 사진 15장 → 15슬롯. E2·E3 통과 | **PASS** | 1·3절. 3·15·20장 전부 실행 |
| 모든 슬롯 `rationale.evidence` 가 PhotoAnalysis 필드/프로필 항목으로 역추적 | ⚠️ **부분 PASS** | 3·4절. 슬롯마다 `uploaded_photo` ref = 그 슬롯 `photo_id` 이고 문장의 숫자가 그 사진 측정값과 일치한다(15슬롯 전수). **E10 이 보장하는 것은 "ref 가 입력 사진 ID 로 해소된다"까지다** — 다른 슬롯의 rationale 을 통째로 복사해도 E10 은 통과한다(`fix-report.md` 6절 M2 수용) |
| 근거가 전부 `kind:"rule"` 인 슬롯 0개 (S1) | **PASS** | 1절 테스트 6번, 4절 전수 대조 |
| `caption_inputs` 3종이 슬롯마다 | **PASS** | 1절 테스트 12번. F2 는 캡션 상태를 판단하지 않는다 |
| `CurrentProfile.present == false` 여도 정상 종료 + `target_only` (E8) | **PASS** | 1절 테스트 10·11번 |
| A2 반영 — 1순위 근거는 PhotoAnalysis, `opener_tendency` 는 보너스 | **PASS** | 2·5절. 보너스는 관측이 있을 때만 켜지고 상한 0.15 로 측정값 차이를 뒤집지 못한다 |
| 사진만 입력도 정상 처리 | ⚠️ **PENDING** | **최초 판의 PASS 는 틀렸다.** 근거로 댄 테스트 2·3·4번은 `run()` 헬퍼가 모든 호출에 TargetProfile 을 주입한다(`test/order.test.js:20`). `orderFeed({photoAnalyses})` 는 `targetProfile: expected object` 로 거부한다. 사용자 입력 경로는 아직 없다(`lib/feed.js:28` 이 501). 인수 조건 A1·A2 와 담당(#24)은 `fix-report.md` 1절 |
| 실제 photo_id 를 3~20장 끝까지 보존 | **PASS** | 1절 테스트 2·3·4·15번. 3·15·20장 전부 입력 집합 == 출력 집합 |
| 다른 프로필 2벌에서 position 정렬 photo_id 차이 | **PASS** | 3절. 실사진 15·20장 × 프로필 2벌 |
| ⚠️ 위 순서 차이 **및 #26 캡션 차이**를 **#20 에 남긴다** | ⚠️ **부분 PASS / PENDING** | **최초 판이 조건을 축약했다.** 순서 차이는 PASS. **#26 캡션 차이는 이 PR 이 F3 를 호출하지 않아 만들어지지 않는다**(PENDING, #26·F3 소관). #20 인계는 이 수정에서 댓글로 남긴다 — `fix-report.md` 3절 |
| 1회 실행 토큰 비용 | **해당 없음** | 순서 결정에 모델을 호출하지 않는다(6절) |

---

## 1. 테스트·정적 검사 — 실제 출력

### `npm test`
```
1..83
# tests 83
# suites 0
# pass 83
# fail 0
# cancelled 0
# skipped 0
# todo 0
```
기존 67건 + `order.test.js` **16건**(최초 14건 + 교차 리뷰 수정의 회귀 2건). 기존 회귀 0.

```
ok 1 - measured fixture itself satisfies the PhotoAnalysis contract
ok 2 - 3 photos produce 3 slots covering positions 1..3 exactly once
ok 3 - 15 photos produce 15 slots covering positions 1..15 exactly once
ok 4 - 20 photos produce 20 slots covering positions 1..20 exactly once
ok 5 - every eval invariant except the F3 export one passes on a generated feed
ok 6 - no slot is justified by rules alone, and every photo evidence resolves to its own slot
ok 7 - rationales never speak of scale, absent faces or "여백"
ok 8 - two target profiles order the same photos differently
ok 9 - the same input produces byte-identical output
ok 10 - an absent current profile ends normally as target_only
ok 11 - a present current profile is reported but not yet used to correct
ok 12 - caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
ok 13 - carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
ok 14 - a bonus that flipped the opener is named as the reason, not hidden behind the measurement
ok 15 - photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
ok 16 - rejects inputs the contract cannot accept instead of guessing
# tests 16
# pass 16
# fail 0
```

**테스트 5번이 이 이슈의 핵심 증거다.** 내가 만든 assert 가 아니라 **`eval/invariants.js` 의 `evaluate()` 그대로**를
생성된 피드에 돌려 E1·E2·E3·E8·E9·E10·E11 을 전부 PASS 로 받았다(E6 은 F3 export 소관이라 제외).

### `npm run eval`
```
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
quiet broken E1..E11: 8종 전부 EXPECTED FAIL
detail 케이스도 동일하게 8개 PASS / 파손 8종 EXPECTED FAIL
E4/E5/E7: manual spot-check only; real demo review pending.
```
전문은 같은 폴더 `eval.txt`. **이 이슈는 `eval/` 을 한 줄도 건드리지 않았다** — 회귀가 없다는 증거다.
골든 번들은 여전히 수동 fixture 를 읽는다. 생성기 출력을 골든으로 덮어쓰면 검증기가 자기 출력을 채점하게 되므로 하지 않았다.

### `npm run check`
```
PASS: 33 JS/JSON files checked; four schema examples match fixtures.
Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```
⚠️ **정정.** 최초 판은 `zero dependencies` 출력과 함께 "의존성 0개 유지"라고 적었다. rebase 로 들어온 PR #32(Next 기반)가 next·react 등을 넣어 **레포 수준에서는 더 이상 참이 아니다.**
유지되는 좁은 주장만 남긴다 — **`lib/order.js` 는 `node:crypto` 하나만 import 하고 이 PR 은 의존성을 0개 추가했다.**

---

## 2. ★ 근거로 쓸 값을 실제 사진으로 먼저 확인했다

#9 의 교훈("변하는 틀린 값은 #12 에 '측정된 것처럼 보이는' 근거를 준다")을 그대로 받아, **코드보다 이 확인을 먼저 했다.**

### 2-1. 재현 방법

```bash
# #9 브랜치의 분석기를 임시 폴더로 꺼내 실사진을 측정한다 (코드를 내 브랜치로 복사하지 않았다)
mkdir -p /tmp/a9/lib && for f in lib/jpeg_dc.js lib/photo_analysis.js lib/contracts.js; do
  git show origin/feat/9-photo-analysis:$f > /tmp/a9/$f; done
# pivot/apify-check/fixtures/images 에서 파일명 정렬 31칸 간격으로 20장을 뽑아 analyzePhoto 를 1장씩 호출
```
결과 20장을 그대로 커밋한 것이 `test/order.real20.json` 이다(측정값 스냅샷, 합성 아님).
#9 가 `report.md` 에 적은 15장 값과 **같은 파일에서 같은 숫자가 재현됐다**(예: `kr29cm_Dc-GJ-iCezC_00.jpg` → bright 0.742 · sat 0.161 · negative_space).

### 2-2. 눈 대조 결과 — 쓸 값과 못 쓸 값

실사진 4장을 **직접 열어서** 측정값과 맞춰 봤다.

| 파일 | 측정값 | 실제 사진 | 판정 |
|---|---|---|---|
| `kr29cm_Dc-GJ-iCezC_00` | bright **0.742**(최대) · `negative_space`(최상위 색 점유 0.334) | 크림색 배경이 화면 1/3 이상을 채운 스튜디오 인물컷 | ✅ 밝기·넓은 단색 면 둘 다 일치 |
| `c29_DdILtQ0CRl8_00` | bright **0.328**(최소) · `negative_space`(0.285) | 그늘진 야외. **여백은 없고** 짙은 플리스 재킷이 화면을 덮는다 | ⚠️ 밝기는 일치. **`negative_space` = 여백이 아니었다** — 넓은 단색 *피사체*였다 |
| `c29_Dc7cY9WiUbs_08` | bright 0.617 · sat **0.126**(최소) · `negative_space`(0.331) | 크림색 메모지의 빈 면이 실제로 넓다. 회색·검정뿐 | ✅ |
| `kr29cm_DdIt_2szpfb_00` | sat **0.344** · hue **152.8** · `full_frame`(0.079) | 청록 니트 인물이 프레임을 꽉 채운 사무실 사진 | ✅ 채도·색상각·꽉 찬 화면 일치 |

**결론 — 이 이슈가 쓰는 값:**

| 값 | 결정 | 이유 |
|---|---|---|
| `bright_mean` · `sat_mean` · `hue_mean` | **쓴다** | 4장 눈 대조 전부 일치 |
| `composition` | **쓰되 "여백"이라고 부르지 않는다** | 4장 중 1장이 반례. 실제로 재는 것은 "가장 넓은 단색 면이 28% 이상"이다. 근거 문장은 `한 색이 넓게 깔린 화면` 으로만 쓴다(테스트 7번이 "여백" 문자열을 금지한다) |
| `scale` | **쓰지 않는다** | 실사진 20장 전부 `midshot`. 휴리스틱 경로의 고정값이라 상수다 |
| `has_face` | **`true` 일 때만 쓴다** | 내가 연 4장 중 3장에 얼굴이 또렷한데 전부 `false` 였다. `false` 는 "없다"가 아니라 "못 봤다" |

### 2-3. 캐러셀 근거와 `carousel_count=0` 불일치

- **A2 는 확인된 상태로 받았다:** #11 이 캐러셀 2건(10장·20장)을 브라우저 실제 순서와 대조해 불일치 0, 코디네이터가 3계정 80개에서 커버 == `children[0]` 100%.
- **내가 직접 센 실제 데이터:** `pivot/apify-check/fixtures/ig_feed_29cm.json` → 게시물 30건, `childPosts ≥ 2` 인 캐러셀 **26건**(`type` 분포 `Sidecar` 26 / `Video` 4).
- **불일치의 정체:** 레포 `fixtures/` 의 `carousel_count: 0` 은 **자연어·합성 스냅샷으로 만든 목업**이라 캐러셀을 한 건도 관측하지 않은 값이고(그 출처에서는 0 이 정직하다),
  실제 ref 스냅샷에서 뽑으면 #10 의 추출기(`lib/target_profile.js:143`)가 `child_count >= 2` 를 세어 26 을 채운다. **fixture 가 틀린 게 아니라 출처가 다르다.**
- **처리:** fixture 를 고치지 않았다(#10·#1 소관). 대신 코드가 **관측된 경향에만 의존**한다 —
  `opener_tendency` 가 없거나 `"불명"` 이면 보너스를 아예 계산하지 않는다. 계약상 `carousel_count=0` 이면 `opener_tendency` 는 없거나 `"불명"` 뿐이라
  **현재 fixture 로는 이 경로가 자동으로 꺼진다.** 테스트 13번이 이 두 방향을 모두 고정한다.

---

## 3. 프로필 2벌 → 순서 2벌 (S3 · #20 기록용)

실사진 15장 · 같은 입력 · 프로필만 교체. 커밋된 골든 합성 카드 15장은 **밝기·채도·구성이 전부 같아서** 어떤 순서 규칙을 넣어도 입력 순서가 유지된다 — 그래서 S3 를 실사진으로 증명했다.

```
$ node -e "... orderFeed({photoAnalyses: real20.slice(0,15), targetProfile: <각 프로필>, currentProfile: absent})"
15 quiet  ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_13 ph_14 ph_04 ph_07 ph_08 ph_15 ph_12 ph_10 ph_05
15 detail ph_03 ph_11 ph_02 ph_09 ph_01 ph_14 ph_04 ph_15 ph_06 ph_07 ph_08 ph_13 ph_10 ph_12 ph_05
20 quiet  ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_03 ph_16 ph_17 ph_12 ph_15 ph_07 ph_18 ph_13 ph_10 ph_20 ph_08 ph_05
20 detail ph_03 ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_17 ph_16 ph_13 ph_18 ph_07 ph_08 ph_15 ph_12 ph_10 ph_20 ph_05
```
첫 자리가 갈리는 이유가 곧 프로필이 쓰였다는 증거다.
- `quiet`(지향 문구 "조용하고 짧게") → **`ph_11`** (`hony_DdJWXXTHCMv_13.jpg`, 밝기 0.808 · 채도 0.086 · 한 색이 넓게 깔림)
- `detail`(지향 문구 "자세하게 기록") → **`ph_03`** (`c29_Dc94ZfOD1-q_07.jpg`, 채도 0.343 · 밝기 0.589 · 한 색이 넓게 깔리지 않음)

같은 사진 집합을 유지하면서 배열만 달라진다(테스트 8번이 집합 동일·배열 상이를 동시에 확인한다).

---

## 4. 15슬롯 근거 전수 대조 (W5·W6·W11)

방법: 15슬롯의 근거 문장을 한 줄씩 **그 사진의 실제 측정값과 맞춰 봤다.** 전문은 같은 폴더 `run-15.txt`.

```
[ 1] ph_11 opener  conf=0.5 peak=n ov=0
     근거: 밝기 0.808 · 채도 0.086 · 한 색이 넓게 깔린 화면이라 지향 방향(조용한 쪽) 점수가 입력 15장 중 가장 높아 1번에 뒀다
     실제 측정: bright=0.808 sat=0.086 hue=110.5 comp=negative_space 파일=hony_DdJWXXTHCMv_13.jpg
     evidence: uploaded_photo(ph_11) + user_text(tgt_synthetic_quiet:input) + rule(order.R1)
[10] ph_07 turn    conf=1 peak=Y ov=0.887
     근거: 채도 0.399 로 남은 사진 중 가장 진해 10번 전환 자리에 뒀다
     실제 측정: bright=0.512 sat=0.399 hue=215.5 comp=negative_space 파일=c29_DdOTLpSIBNf_07.jpg
     evidence: uploaded_photo(ph_07) + rule(order.R3)
[15] ph_05 closer  conf=1 peak=n ov=0.881
     근거: 밝기 0.328 로 남은 사진 중 가장 어두워 마지막 15번에 뒀다
     실제 측정: bright=0.328 sat=0.301 hue=104.1 comp=negative_space 파일=c29_DdILtQ0CRl8_01.jpg
     evidence: uploaded_photo(ph_05) + rule(order.R2)
```

**결과: 15슬롯 전부 일치. 근거 문장에 등장한 숫자가 그 사진의 측정값과 다른 자리 0개.**
- 문장에 `scale`·`has_face`·"여백"·장소·인물·시간·감정·좋아요 예측이 들어간 자리 **0개**.
- 눈으로 확인한 것 2장: 1번 자리 `hony_DdJWXXTHCMv_13.jpg` 는 흰 여백이 실제로 화면 절반 이상이고(조용한 쪽 첫 자리로 납득된다), 10번 자리 `c29_DdOTLpSIBNf_07.jpg` 는 노란 캡션 박스와 파란 셔츠가 들어간 사진이다.
- **정직한 한계:** 10번 자리를 "채도 최대"라고 부른 것은 측정값 그대로지만, 그 사진이 **사람이 느끼는 "시각적 정점"인지는 확인하지 않았다.** `is_visual_peak` 이라는 이름과 우리가 잴 수 있는 값(평균 채도) 사이의 간극이며, `spec.md` 8절 변경 요청 4번에 적었다. 근거 문장에는 "시각적 정점"이라고 쓰지 않는다.

---

## 5. 순서를 정하는 규칙 (요약)

| 규칙 | 무엇으로 | 근거 종류 |
|---|---|---|
| R1 1번 자리 | 지향 방향 점수 최대 (`composition_mix` → `tone_words` → 없으면 기본) | 사진 측정값 + 프로필 항목 + 규칙 |
| R1b 캐러셀 보너스 | `opener_tendency` 가 관측됐을 때만 +0.15 | + `ig_post` 근거. **보너스가 순서를 뒤집었으면 근거 문장이 측정 점수·보너스·총점을 그대로 말한다**(`fix-report.md` 2절) |
| R2 마지막 자리 | 남은 사진 중 밝기 최소 | 사진 측정값 + 규칙 |
| R3 전환 자리 `ceil(2N/3)` | 남은 사진 중 채도 최대 | 사진 측정값 + 규칙 |
| R4 나머지 | 앞자리 사진과 측정 색 거리 최대 | 사진 측정값 + 규칙 |

- 가중치(0.4/0.4/0.2)와 보너스 상한(0.15)은 **설계 상수**이며 측정값이 아니다 — 코드 주석과 `spec.md` 4절에 그대로 적혀 있다.
- 동점은 입력 순서가 이긴다 → 출력이 결정적이다(테스트 9번).
- `confidence` 는 확률이 아니라 **근거 종류 라벨 2단계**(1 = 측정값만, 0.5 = 지향 문구 해석 개입)다. 스키마가 0..1 number 만 허용해서 이렇게 썼고, 변경 요청 1번으로 올렸다.
- `adjacent_overlap` 은 `1 - 색 거리`다. 실사진 20장 190쌍의 색 거리는 **0.020~0.305(평균 0.109)** 라 실제 값은 0.70~0.98 에 몰린다. 절대값으로 "몇 % 겹친다"고 읽으면 안 되고 **한 피드 안에서 상대 비교**로 써야 한다.

---

## 6. 하지 않은 것 · 측정하지 못한 것

| 항목 | 상태 |
|---|---|
| `prompts/input/order.md` | **만들지 않았다.** 순서 결정에 모델을 호출하지 않는다. 프롬프트 파일이 없는 것이 설계다 |
| `src/app/api/feed/route.ts` | **만들지 않았다.** 이 레포는 `api/feed.js` 구조이고 배선은 #24 소관이다 |
| `api/feed.js` 에 live 경로 연결 | **안 했다.** #24 소관. `?mock=1` 분기를 건드리지 않았다 |
| 두 축 합성 · `caption_len_gap` 델타 | **안 했다.** #13 소관. `disclosure` 는 항상 `target_only` 다 |
| 캡션 상태(채움/비움) 판단 | **안 했다.** F3 소관. F2 는 `caption_inputs` 만 넘긴다 |
| 화면·확인용 임시 UI | **안 만들었다.** 디에고 소유 영역이다 |
| 모델 경로(`vision_model`) 입력으로의 검증 | **PENDING.** `ANTHROPIC_API_KEY` 가 없어 실사진 20장이 전부 휴리스틱 경로다. `scale`·`has_face:true` 가 실제로 오는 상황은 테스트 13번의 합성 입력으로만 확인했다 |
| 배포 환경 검증 | **해당 없음(이 이슈 범위 밖)** + #9 가 보고한 기준선 배포 실패가 아직 열려 있다(#6 소관) |
| 다중 모델 리뷰 | **미실행.** L 크기라 필수 게이트다. 0건으로 기록하지 않는다 |

---

## 7. 남은 게이트

| # | 남은 것 | 누가·언제 |
|---|---|---|
| G1 | **다중 모델 리뷰**(같은 diff, 서로 다른 모델 2개) | 이 PR 의 필수 게이트 |
| G2 | **사람 merge** — 경계 계약(`OrderedFeed`)이라 양쪽 사람 확인 | 상대 리뷰어. AI 는 merge 하지 않는다 |
| G3 | **#9·#10·#11 merge 후 재검증** — 세 브랜치가 아직 미merge다. 배선(#24)에서 실제 `PhotoAnalysis`·실제 프로필로 다시 돌린다 | #24 |
| G4 | **스키마 변경 요청 5건 심의**(`spec.md` 8절) | `CLAUDE.md` 4-2절 절차 |
| G5 | **모델 경로 입력으로 `scale`·`has_face` 보너스 재확인** | API 키 확보 후 |
| G6 | **골든 번들을 실사진으로 교체** — 현재 골든 15장은 측정값이 모두 같아 순서 회귀를 못 잡는다 | #1·#20 |
| G7 | **배포 환경 검증** | 배포 담당 |

## 8. 다음 행동

1. Draft PR 을 열고 이슈 #12 에 DoD 대조를 댓글로 남긴다 (**이슈는 닫지 않는다**).
2. G1 다중 모델 리뷰를 돌린다.
3. #24 에 배선 시 주의점을 넘긴다 — `orderFeed` 는 순수 함수이고 `CurrentProfile.present:false` 객체를 **명시적으로** 넘겨야 한다.
4. G6(골든 실사진 교체)을 #20 후보로 적는다.
