# PR #31 교차 리뷰 — Codex

- 검토일: 2026-09-17. Node `v22.22.3`.
- 기준: `feat/12-order-proposal`, HEAD/PR head 모두 `7a92fd215adeed82fbc72c99d5328829e2792f9e`, base `32eff4f`, Draft=true.
- 이슈 #12 전문, 네 스키마, CLAUDE.md 전체와 끝의 자동 수정 제한, 기존 `review-claude.md` H1/H2, 제품 정의 P2/P3, 이 PR의 intent/spec/plan/report를 읽었다.
- 요청의 `docs/specs/10-*`는 이 워크트리에 없다. 실제 PR 문서 폴더인 `docs/specs/12-order-proposal/`에 기록한다.
- 코드·스키마·fixture 수정, 커밋, PR 댓글/승인/거부/merge 없음. 다른 워크트리에 접근하지 않았으며 pivot은 읽기만 했다.

## 결론

**merge 해도 되는가 — 조건부: 아래 H1의 완료 주장 정정 및 사진만 입력 경로의 담당·인수 조건 확정, M1의 보너스 근거 문장 수정·회귀 확인 후 사람 판단. 현재 상태를 이슈 #12 전체 완료로 인수하면 안 된다.**

기본 실행 숫자는 모두 재현됐다. 새 구현이 없는 사진 ID를 만들어내거나 사진을 잃는 현상, 반환값 공유 오염은 찾지 못했다. 다만 실제 이슈 DoD 두 항목을 report가 축약해서 PASS 처리했고, 보너스가 순서를 뒤집었을 때 근거 문장이 선택의 원인을 잘못 설명한다. 앞선 H1/H2의 ID 날조는 막히지만, 다른 사진의 정상 근거를 복사하는 공격은 여전히 통과한다. 이 마지막 항목은 기존 validator의 한계이며 새 생성기의 오염으로 단정하지 않는다.

## 1. 실행 명령과 실제 결과

작업 디렉토리: `/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-12`.

```sh
gh pr view 31 --repo Daterl/gyeol --json headRefName,headRefOid,isDraft
gh issue view 12 --repo Daterl/gyeol
git rev-parse HEAD
git diff 32eff4f HEAD --name-only -- schemas
npm test
npm run eval
npm run check
```

PR 출력:
```json
{"headRefName":"feat/12-order-proposal","headRefOid":"7a92fd215adeed82fbc72c99d5328829e2792f9e","isDraft":true}
```
스키마 diff 출력은 빈 문자열: 네 스키마 변경 0개.

`npm test` 실제 마지막 출력 (exit 0):
```text
1..81
# tests 81
# suites 0
# pass 81
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 267.449
```

`npm run eval` 실제 결과 (exit 0, 표의 행만 같은 내용으로 정리):
```text
Synthetic manual bootstrap only; no AI quality or human agreement claim.
quiet: E1 PASS, E2 PASS, E3 PASS, E6 PASS, E8 PASS, E9 PASS, E10 PASS, E11 PASS
detail: E1 PASS, E2 PASS, E3 PASS, E6 PASS, E8 PASS, E9 PASS, E10 PASS, E11 PASS
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
quiet broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
quiet broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
quiet broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_01
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

`npm run check` 실제 출력 (exit 0):
```text
PASS: 32 JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.
```

CodeRabbit는 `0.7.6` 및 인증 상태만 확인했다. 원격 CodeRabbit 리뷰는 실행하지 않았으며 이 문서는 Codex의 독립 실행·코드 검토 결과다. 별도 린터·타입 검사 성공으로 과장하지 않는다.

## 2. report.md 주장 대조

| report 주장 | 재현 | 증거/한계 |
|---|---|---|
| test 81/81, 신규 14 | PASS | 실제 실행 81/81; order 테스트 14개 |
| quiet/detail 불변식 8개 및 파손 8종 | PASS | 정상 16행 PASS, 파손 16행 EXPECTED FAIL |
| check 32파일, 의존성 0 | PASS | 위 출력 |
| 3/15/20장 보존, S1 rule-only 0 | PASS | 별도 직접 호출에서도 3/15/20슬롯, rule-only 각각 0 |
| S3 프로필 두 벌에서 순서 상이 | PASS | 아래 실제 position 정렬 photo_id 배열; 테스트도 photo_id를 비교함 |
| 동일 입력 결정성 | PASS, 조건부 | 고정 now로 바이트 동일. now 생략 시 generated_at은 현재 시각이므로 순수 함수/바이트 동일 주장은 고정 now 범위에서만 맞음 |
| E10으로 필드/판단까지 역추적 보장 | 부분 | 입력 사진 ID 해소만 보장. 타 사진 rationale 전체 복사도 통과 (M2) |
| 사진만 입력도 PASS | FAIL | 사진만 전달 시 targetProfile 검증에서 거부 (H1) |
| 다른 프로필 결과를 #20에 남김 | PENDING | 순서 배열은 이 PR 문서에 있음. 실제 DoD의 #26 캡션 차이 및 #20 인수 기록은 없음 |
| bright/sat/hue의 의미 | 표본 확인 | 실제 파일 4장 열람 + 20장 독립 JPEG 디코딩 비교. 숫자와 사진의 큰 경향 일치; 모든 사진의 지각 품질 보장은 아님 |
| schemas/ 변경 0 | PASS | base..HEAD 파일 diff에 schemas 없음 |

## 3. 심각도별 지적

### BLOCKER

없음. 스키마 변경이나 명령 재현 실패는 없었다. Draft 및 사람 리뷰 pending 자체를 코드 결함으로 세지 않았다.

### HIGH

**H1. “사진만 입력” DoD를 자연어 프로필을 넣은 테스트로 PASS 처리했다.**

- 위치: `lib/order.js:122–123`, `test/order.test.js:20–21`, `docs/specs/12-order-proposal/report.md:19` 부근 DoD 표.
- 실제 이슈 #12는 “사진만 입력도 정상 처리”를 요구한다. 테스트의 `run()`은 모든 성공 호출에 `quiet` TargetProfile과 absent CurrentProfile을 주입한다. 사진만 입력 검사가 아니다.
- 직접 실행 `orderFeed({photoAnalyses: photos20})` → `ContractError: targetProfile: expected object`. API live 배선도 이 PR에 없다. **함수의 명시적 입력 계약에는 맞지만, 사용자 입력 경로 DoD의 완료 증거로 쓸 수 없다.** 상위에서 프로필을 준비하는 책임이 있을 수 있으나 그 경로를 실행한 증거가 없다.
- report의 “프로필은 자연어 1벌로 충분”은 사진만 입력 조건에 별도의 사용자 입력을 추가한다.
- 최소 조치: 해당 행을 PENDING으로 정정하고 #24 등 담당 경로와 인수 증거를 연결한다. #12 전체 완료를 주장하려면 사진만 받은 실제 경로에서 3/15/20장 ID 보존까지 실행해야 한다. 이 리뷰는 계약 밖 기본 프로필을 임의로 지어내라고 요구하지 않는다.

### MEDIUM

**M1. 캐러셀 보너스가 2위 사진을 1위로 올려도 “측정 기반 지향 방향 점수가 가장 높다”고 말한다.**

- 위치: `lib/order.js:99`, `:111–114`, `:133`; 기존 보너스 테스트 `test/order.test.js:123` 이후.
- 기존 테스트와 같은 입력: quiet + 인물 opener_tendency(12건), ph_09에 관측된 얼굴을 설정. 무보너스 방향 점수는 ph_09=0.8254, ph_11=0.9060. +0.15로 ph_09가 선택된다.
- 실제 문장:
  > 밝기 0.612 · 채도 0.097 · 한 색이 넓게 깔린 화면이라 지향 방향(조용한 쪽) 점수가 입력 20장 중 가장 높아 1번에 뒀다 캐러셀 여는 사진 경향(얼굴이 관측된 사진)도 같은 방향이다.
- spec은 R1 방향 점수와 R1b 보너스를 구분한다. “측정값이라 가장 높다”가 아니라 “측정 점수는 차선이지만 관측 경향 보너스를 더한 총점이 높다”가 실제 결정이다. rule evidence에는 보너스 0.15가 나와 있어 완전한 근거 누락은 아니지만, 사용자에게 직접 보이는 rationale.value는 보너스를 부수적 일치처럼 낮춰 말한다. P2에서 중요한 선택 원인을 잘못 요약한다.
- 최소 조치: 보너스가 있을 때 총점/보너스 반영을 주 문장에 명시하고, 이 반례에서 설명도 검증한다. 알고리즘이나 새 기능 변경 요구가 아니다.

**M2. E10은 “같은 입력 집합에 있다”만 검사한다. 다른 슬롯의 rationale 복사·rule-only 손상은 통과한다.**

- 위치: 기존 `lib/contracts.js`의 `validatePhotoRefs`/`validateFeed`, 새 생성기의 `lib/order.js:177` 반환 전 검사, `test/order.test.js` S1 성공 경로.
- 직접 공격: `feed.slots[0].rationale = structuredClone(feed.slots[1].rationale)` → validateFeed ACCEPT. ph_11 자리에서 ph_02의 수치·배치 이유를 그대로 말해도 입력 집합 안의 ID라 통과한다. rationale evidence를 rule 하나로 줄여도 ACCEPT.
- 반대로 외부 ID는 E10, 타 사진의 describable_facts는 E11로 실제 거부한다. 따라서 검증기가 아무것도 하지 않는 것은 아니다.
- **기존 validator의 알려진 범위 한계**다. 생성된 정상 슬롯의 ref는 모두 자기 ID이고, 새 코드가 실제로 잘못 복사했다는 증거는 없다. 이를 새 생성기 HIGH 회귀로 세거나 범용 자연어 의미 검증을 요구하지 않는다.
- 최소 조치: F2 수준에서 rationale의 자기 사진 근거와 S1을 깨뜨린 음성 사례를 추가하거나, E10만으로 의미 역추적까지 증명했다는 문서 주장을 좁힌다. 다른 사진과의 비교 근거 자체를 금지해서는 안 된다.
- 같은 ID를 유지하고 applied_profile.visual을 detail 값으로 교체해도 ACCEPT였다. 앞선 리뷰가 명시적으로 제외한 값 수준 프로필 합성 검증 범위라 별도 HIGH로 승격하지 않는다.

**M3. 마지막 DoD에서 “#26 캡션 차이”와 “#20에 남긴다”가 누락됐다.**

- 위치: `docs/specs/12-order-proposal/report.md` 0절 마지막 기능 DoD 행.
- 이슈 원문: “#13을 생략해도 다른 프로필 2벌에서 position으로 정렬한 photo_id 및 #26 캡션 차이를 #20에 남긴다.” report는 순서 차이만 PASS 처리한다.
- `gh issue view 20 --repo Daterl/gyeol --json body,comments`에서 comments는 `[]`였다. 이 PR은 F3 호출을 하지 않으므로 #26 캡션 차이도 이 검증으로 입증되지 않는다. 순서 자료는 유효하지만 전체 조건은 PENDING이다.
- 최소 조치: 순서 부분 PASS / 캡션·#20 인계 PENDING으로 분리. 이 PR에 F3를 새로 구현하라는 요구가 아니다.

### LOW

- 현실 fixture 공백: 실사진 분석 20장은 유용하지만 raw 게시물/캐러셀 입력이 아닌 PhotoAnalysis 스냅샷이다. vision_model 경로와 실제 프로필 추출 연결은 여전히 미검증이다. report가 이미 고지했으므로 merge 결함으로 중복 산정하지 않는다.
- `spec.md`의 “동일 측정값이면 입력 순서 유지”는 tie-break와 최종 순서를 혼동할 소지가 있다. R2/R3 사전 예약으로 입력 두 번째 사진이 끝에 배치될 수 있다. 결정성 자체에는 문제가 없다. 문서를 “각 선택의 동점은 input_index 우선”으로 제한하는 편이 정확하다.

## 4. 실사진·현실 fixture·한국어·P3

실제 다음 4개 파일을 이미지 도구로 직접 열었다 (모두 `pivot/apify-check/fixtures/images/`):

| photo_id / 파일 | snapshot bright/sat/hue | 눈으로 확인한 내용 |
|---|---|---|
| ph_03 / c29_Dc94ZfOD1-q_07.jpg | .589 / .343 / 19.3 | 주황 벽과 피부, 회녹색 니트. 따뜻한 색 평균 방향과 부합 |
| ph_05 / c29_DdILtQ0CRl8_01.jpg | .328 / .301 / 104.1 | 짙은 청색 플리스와 녹색 풀. ph_11보다 어둡다. 평균 hue가 피사체 색 자체를 뜻하지 않음 |
| ph_07 / c29_DdOTLpSIBNf_07.jpg | .512 / .399 / 215.5 | 짙은 청색 배경·머리, 연한 셔츠, 노란 자막. 색상 혼합을 단일 hue로 요약하는 한계는 있으나 숫자 날조 아님 |
| ph_11 / hony_DdJWXXTHCMv_13.jpg | .808 / .086 / 110.5 | 흰 바탕이 넓고 작은 사진·검정 문장이 있음. 높은 밝기·낮은 채도와 부합 |

작성자의 JPEG DC 분석기와 독립적으로, 설치된 ffmpeg로 20장 전부 RGB 128×128로 디코딩하고 Python 표준 `colorsys.rgb_to_hsv`로 평균 V/S와 채도 가중 원형 hue를 계산했다. 이미지 변형본은 저장하지 않았다. 대표 실제 출력:

```text
ph_03 snapshot 0.589 0.343 19.3 decoded 0.589 0.341 20.0
ph_05 snapshot 0.328 0.301 104.1 decoded 0.329 0.3 107.5
ph_07 snapshot 0.512 0.399 215.5 decoded 0.512 0.402 216.8
ph_11 snapshot 0.808 0.086 110.5 decoded 0.806 0.087 113.0
```

20장 비교에서 밝기 최대 차이 약 .002, 채도 약 .006, hue 약 11.7도였다. 다른 축소/디코딩 방법의 근사 대조이며 비트 단위 재현을 주장하지 않는다. “밝은 사진에서 밝기가 높은가”는 이 표본에서 확인했다. hue는 주 피사체의 색 이름으로 쓰면 안 되며 현재 코드는 거리 계산에서만 사용한다. Pillow import는 설치 부재로 실패했고 기존 ffmpeg로 대체했다.

실제 JSON 직접 집계:

| 파일 | 게시물 | 캐러셀 | 빈 문자열 캡션 | 한글 캡션 | 단일 Image | 최대 childPosts |
|---|---:|---:|---:|---:|---:|---:|
| ig_feed_29cm.json | 30 | 26 | 0 | 30 | 0 | 16 |
| wantedlab_ko.json | 11 | 4 | 10 | 0 | 7 | 3 |
| ig_feed_humansofny.json | 100 | 71 | 0 | 0 | 2 | 20 |

29cm 한 벌에 빈 캡션·단일 Image·20장 캐러셀이 있다고 가정하지 않았다. 인접 실제 fixture에서 각각 확인했다. F2는 raw caption이나 childPosts를 읽지 않으므로 빈 게시물 캡션을 이 함수에 직접 넣는 것은 계약 밖이다. 대신 유효한 `language:null`·`describable_facts:[]` 입력을 직접 넣어 그대로 보존됨을 확인했다. 한글 2,000자와 가족 이모지 사실 문자열도 손실 없이 복사됐다. F2에는 캡션 길이 계산 코드가 없어 한글 길이 산정 자체를 검증했다고 주장하지 않는다.

P3: 빈 facts와 null language를 채워 넣지 않았고 caption_state/text/omit_reason을 만들지 않는다. F2가 캡션 비움을 결정하지 않는 경계를 지킨다. 캡션 전부 채우기 압력이나 진행률 UI는 이 변경에 없다.

## 5. 이슈 #12 DoD 항목별 판정

| 실제 이슈 완료 조건 | 판정 | 근거 |
|---|---|---|
| 15장 → 15슬롯, E2/E3 | PASS | 81개 테스트 + 별도 15장 호출 |
| 모든 rationale.evidence가 사진 필드/프로필 항목으로 역추적 | 부분 PASS | 정상 생성 ref/측정값 일치. M1 설명 오류, M2 검증 범위 구멍 |
| S1 rule-only 슬롯 0 | PASS (생성 결과) | 3/15/20장 각각 0; validator의 rule-only 거부는 보장 안 됨 |
| caption_inputs 3종, F2는 채움/비움 판단 안 함 | PASS | facts·overlap·peak 존재, 캡션 상태 없음, 빈 facts 보존 |
| current present=false 정상·target_only | PASS | 기존 테스트 + 별도 호출 |
| A2: PhotoAnalysis 우선, opener는 보너스 | PASS (선택 규칙) | +0.15 경계 양쪽 기존 테스트 통과, M1 설명 수정 필요. 잘못된 scale/여백 대체 근거 요구 안 함 |
| 사진만 입력 정상, 실제 ID 3~20장 보존 | FAIL/PENDING | ID 보존은 PASS, 사진만 입력 성공 경로는 없음/미검증 (H1) |
| #13 없이 프로필 2벌의 position 정렬 ID 및 #26 캡션 차이를 #20에 기록 | 부분 PASS / PENDING | 순서 차이 PASS, 캡션 차이·#20 기록 PENDING (M3) |

## 6. 독립 직접 호출 출력

다음은 아래 부록 스크립트를 `node /tmp/gyeol31-probe.mjs`로 실행한 실제 출력이다. `ACCEPT`는 의도적 파손에도 validator가 허용했다는 뜻이며 PASS와 구분한다.

```text
N=0 REJECT inputPhotoIds: requires 3..20 photos
N=3 {"count":3,"ids":["ph_02","ph_03","ph_01"],"ruleOnly":0}
N=15 {"count":15,"ids":["ph_11","ph_02","ph_09","ph_01","ph_03","ph_06","ph_13","ph_14","ph_04","ph_07","ph_08","ph_15","ph_12","ph_10","ph_05"],"ruleOnly":0}
N=20 {"count":20,"ids":["ph_11","ph_02","ph_19","ph_01","ph_09","ph_04","ph_14","ph_06","ph_03","ph_16","ph_17","ph_12","ph_15","ph_07","ph_18","ph_13","ph_10","ph_20","ph_08","ph_05"],"ruleOnly":0}
N=21 REJECT inputPhotoIds: requires 3..20 photos
duplicate REJECT inputPhotoIds: duplicate IDs
null REJECT PhotoAnalysis: expected object
NaN REJECT PhotoAnalysis.color.bright_mean: expected number 0..1
S3 quiet ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_13 ph_14 ph_04 ph_07 ph_08 ph_15 ph_12 ph_10 ph_05
S3 detail ph_03 ph_11 ph_02 ph_09 ph_01 ph_14 ph_04 ph_15 ph_06 ph_07 ph_08 ph_13 ph_10 ph_12 ph_05
return isolation true
photos only REJECT targetProfile: expected object
empty facts and language {"facts":true,"language":null}
foreign photo ref REJECT E10: OrderedFeed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
foreign target id REJECT E9: target profile ID differs from actual input
foreign current id REJECT E8: current profile ID differs from actual input
other photo facts REJECT E11: describable fact is not a fact of ph_11
other photo rationale "ACCEPT"
other profile values "ACCEPT"
rule only "ACCEPT"
bonus rationale 밝기 0.612 · 채도 0.097 · 한 색이 넓게 깔린 화면이라 지향 방향(조용한 쪽) 점수가 입력 20장 중 가장 높아 1번에 뒀다 캐러셀 여는 사진 경향(얼굴이 관측된 사진)도 같은 방향이다.
scores [ [ 'ph_09', 0.8254 ], [ 'ph_11', 0.9060000000000001 ] ]
Korean roundtrip true
real fixture ig_feed_29cm.json {"posts":30,"carousel":26,"empty":0,"korean":30,"single":0,"max":16}
real fixture wantedlab_ko.json {"posts":11,"carousel":4,"empty":10,"korean":0,"single":7,"max":3}
real fixture ig_feed_humansofny.json {"posts":100,"carousel":71,"empty":0,"korean":0,"single":2,"max":20}
image metrics [
  {
    id: 'ph_03',
    file: 'pivot/apify-check/fixtures/images/c29_Dc94ZfOD1-q_07.jpg',
    hue_mean: 19.3,
    sat_mean: 0.343,
    bright_mean: 0.589,
    palette_hex: [ '#120d0d', '#e0eaeb', '#777366' ]
  },
  {
    id: 'ph_05',
    file: 'pivot/apify-check/fixtures/images/c29_DdILtQ0CRl8_01.jpg',
    hue_mean: 104.1,
    sat_mean: 0.301,
    bright_mean: 0.328,
    palette_hex: [ '#171a18', '#3a3c3f', '#383e22' ]
  },
  {
    id: 'ph_07',
    file: 'pivot/apify-check/fixtures/images/c29_DdOTLpSIBNf_07.jpg',
    hue_mean: 215.5,
    sat_mean: 0.399,
    bright_mean: 0.512,
    palette_hex: [ '#060e1b', '#bbbcbd', '#c2b39a' ]
  },
  {
    id: 'ph_11',
    file: 'pivot/apify-check/fixtures/images/hony_DdJWXXTHCMv_13.jpg',
    hue_mean: 110.5,
    sat_mean: 0.086,
    bright_mean: 0.808,
    palette_hex: [ '#fcfcfc', '#c0c0bf', '#9b9a97' ]
  }
]
```

## 부록: 직접 호출 재현 스크립트

아래를 임시 mjs 파일로 저장해 Node로 실행한다. 레포 파일을 수정하지 않는다.

```js
import fs from 'node:fs';
const root='/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-12/';
const {orderFeed}=await import(root+'lib/order.js');
const {validateFeed}=await import(root+'lib/contracts.js');
const read=p=>JSON.parse(fs.readFileSync(root+p));
const p=read('test/order.real20.json'),q=read('eval/golden/case_01/target_quiet.json'),d=read('eval/golden/case_01/target_detail.json'),c=read('eval/golden/case_01/current_profile.json');
const run=(photos=p,target=q,extra={})=>orderFeed({photoAnalyses:photos,targetProfile:target,currentProfile:c,now:'2026-09-17T00:00:00.000Z',...extra});
const ids=f=>f.slots.sort((a,b)=>a.position-b.position).map(s=>s.photo_id);
function probe(name,fn){try{console.log(name,JSON.stringify(fn())??'ACCEPT')}catch(e){console.log(name,'REJECT',e.message)}}
for(const n of [0,3,15,20,21])probe('N='+n,()=>{const f=run(n===21?[...p,{...p[0],photo_id:'extra'}]:p.slice(0,n));return {count:f.slots.length,ids:ids(f),ruleOnly:f.slots.filter(s=>s.rationale.evidence.every(e=>e.kind==='rule')).length}});
probe('duplicate',()=>run([p[0],p[1],p[0]]));
for(const [name,photos] of [['null',[null,p[1],p[2]]],['NaN',p.map(a=>({...a,color:{...a.color,bright_mean:NaN}}))]])probe(name,()=>run(photos));
console.log('S3 quiet',ids(run(p.slice(0,15))).join(' '));console.log('S3 detail',ids(run(p.slice(0,15),d)).join(' '));
const baseline=JSON.stringify(run()); const f=run();f.slots[0].caption_inputs.describable_facts.push('오염');f.applied_profile.visual.tone_words.value.push('오염');f.slots[0].rationale.evidence[1].note='오염';console.log('return isolation',JSON.stringify(run())===baseline);
probe('photos only',()=>orderFeed({photoAnalyses:p}));
probe('empty facts and language',()=>{const t=structuredClone(q);t.language=null;t.completeness.language=0;const f=run(p.map(a=>({...a,describable_facts:[]})),t);return {facts:f.slots.every(s=>s.caption_inputs.describable_facts.length===0),language:f.applied_profile.language}});
for(const [name,mutate] of [
 ['foreign photo ref',f=>f.slots[0].rationale.evidence[0].ref='NOT_INPUT'],
 ['foreign target id',f=>f.applied_profile.target_profile_id='NOT_INPUT'],
 ['foreign current id',f=>f.applied_profile.current_profile_id='NOT_INPUT'],
 ['other photo facts',f=>f.slots[0].caption_inputs.describable_facts=p[0].describable_facts],
 ['other photo rationale',f=>f.slots[0].rationale=structuredClone(f.slots[1].rationale)],
 ['other profile values',f=>f.applied_profile.visual=structuredClone(d.visual)],
 ['rule only',f=>f.slots[0].rationale.evidence=f.slots[0].rationale.evidence.filter(e=>e.kind==='rule')]
])probe(name,()=>{const f=run();mutate(f);validateFeed(f,p.map(a=>a.photo_id),c,q,p);return 'ACCEPT'});
const t=structuredClone(q);t.sequence={carousel_count:12,opener_tendency:{value:'인물',confidence:.6,evidence:[{kind:'ig_post',ref:'carousel',note:'관측'}]}};
const faces=p.map(a=>a.photo_id==='ph_09'?{...a,has_face:true,analysis_source:'vision_model',model:'test'}:a);
const nudged=run(faces,t).slots[0];console.log('bonus rationale',nudged.rationale.value);
console.log('scores',p.filter(a=>['ph_09','ph_11'].includes(a.photo_id)).map(a=>[a.photo_id,.4*a.color.bright_mean+.4*(a.composition==='negative_space')+.2*(1-a.color.sat_mean)]));
const korean=p.map(a=>({...a,describable_facts:['한글 캡션 👨‍👩‍👧‍👦','가'.repeat(2000)]}));console.log('Korean roundtrip',run(korean).slots.every(s=>s.caption_inputs.describable_facts[1]==='가'.repeat(2000)));
for(const file of ['ig_feed_29cm.json','wantedlab_ko.json','ig_feed_humansofny.json']){const v=JSON.parse(fs.readFileSync('/Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/'+file));console.log('real fixture',file,JSON.stringify({posts:v.length,carousel:v.filter(a=>a.childPosts?.length>=2).length,empty:v.filter(a=>a.caption==='').length,korean:v.filter(a=>/[가-힣]/.test(a.caption??'')).length,single:v.filter(a=>a.type==='Image').length,max:Math.max(...v.map(a=>a.childPosts?.length??0))}));}
console.log('image metrics',p.map(a=>({id:a.photo_id,file:a.file_ref,...a.color})).filter(a=>['ph_03','ph_05','ph_07','ph_11'].includes(a.id)));
```

## 부록: 독립 픽셀 측정 재현

```sh
python3 - <<'PY'
import json, colorsys, math, subprocess
p=json.load(open('test/order.real20.json'))
for a in p:
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',
        '/Users/chowonjae/Desktop/projects/wanted/'+a['file_ref'],
        '-vf','scale=128:128','-f','rawvideo','-pix_fmt','rgb24','-'])
    hsv=[colorsys.rgb_to_hsv(*(v/255 for v in raw[i:i+3])) for i in range(0,len(raw),3)]
    sat=sum(v[1] for v in hsv)/len(hsv)
    bright=sum(v[2] for v in hsv)/len(hsv)
    hue=math.degrees(math.atan2(
        sum(math.sin(v[0]*2*math.pi)*v[1] for v in hsv),
        sum(math.cos(v[0]*2*math.pi)*v[1] for v in hsv)))%360
    print(a['photo_id'], 'snapshot',a['color']['bright_mean'],
        a['color']['sat_mean'],a['color']['hue_mean'],
        'decoded',round(bright,3),round(sat,3),round(hue,1))
PY
```

추가 확인: 첫 3장의 color를 동일 값(hue=0, sat=0, bright=.5, palette=[]), composition을 full_frame으로 맞춰 직접 호출했다.

```text
equal metrics input [ 'ph_01', 'ph_02', 'ph_03' ]
equal metrics output [ 'ph_01', 'ph_03', 'ph_02' ]
```

따라서 LOW의 “전체 입력 순서 유지” 문서 문제도 실행으로 확인했다. 마지막 작업 트리 확인은 `?? docs/specs/12-order-proposal/review-codex.md` 한 파일뿐이었다.
