# PR #75 Codex 교차 리뷰

**필요성 판정: #79로 실모델 정상 경로의 순서 문제는 이미 해결됐다. 그러나 #75는 휴리스틱·혼합 입력의 순서 제안을 활성화하므로 여전히 필요한 변경이다. 실모델 경로를 처음 연결하는 PR로 설명하면 부정확하다.**

**Merge 판정: 보류. 새로 열리는 혼합 입력 경로에서 미관측 구도 상수가 첫 사진을 결정하고 근거 문장은 이를 숨기는 P2 결함을 먼저 해결해야 한다.**

검토 시점: 2026-09-18 KST. 비교 기준은 `origin/develop=23d5f005a2322c0b15da881fe786ef9d5edd4565`(#79 포함), PR HEAD는 `e0b4f442dea3e84473ee900486d889224349597b`다. 코드 수정·커밋·리뷰 게시·merge·배포는 하지 않았다.

## 1. 같은 입력으로 비교한 결과

`origin/develop`을 `/tmp/pr75-codex-review`에 `git archive`로 추출했다. PR 작업 트리는 원본 그대로 실행했다. 최종 대조는 두 서버 모두 Next 16.3.5 기본 Turbopack 개발 서버이며, 포트는 develop 3176 / PR 3175다. 분석은 PR 서버의 실제 `POST /api/analyze`에서 한 번 확보하고, **동일한 PhotoAnalysis JSON**을 두 서버의 실제 `POST /api/feed`에 재전송했다. 모델을 두 번 돌려 생길 확률적 차이를 브랜치 차이로 오인하지 않았다. `/api/feed` 자체는 모델을 호출하지 않는다.

프로필 A는 `짧게, 조용하게`, B는 `자세하게, 기록하듯`, C는 `{kind:'none'}`이다. 현재 프로필은 모두 `{kind:'none'}`이다. 혼합 입력은 실모델 분석 15장 중 ph_01만 같은 사진의 실제 휴리스틱 분석으로 교체했다.

| 입력 | develop A/B | PR A/B | 브랜치 간 순서 차이 | PR의 A/B 차이 |
|---|---|---|---|---|
| 실모델 15장 | 둘 다 재배치 | 둘 다 재배치 | 없음. A/B 각각 슬롯 전체도 동일 | 앞 4자리 다름 |
| 휴리스틱 15장 | 둘 다 입력 유지 | 둘 다 재배치 | 있음 | 앞 4자리 다름 |
| 실모델 14 + 휴리스틱 1 | 둘 다 입력 유지 | 둘 다 재배치 | 있음 | 앞 4자리 다름 |
| 사진만 C, 위 3종 | 입력 유지 | 입력 유지 | photo_id 순서 차이 없음 | 해당 없음 |

18개 조합 모두 HTTP 200, 슬롯 15개, position 1..15가 한 번씩 나왔다. 모든 슬롯에 uploaded_photo 근거가 있고 그 ref는 해당 요청의 실제 입력 photo_id에 속했다. 이는 참조 무결성 검증이며 문장 의미의 정확성까지 보장하지 않는다.

비교한 것은 항상 다음 배열이다. feed_id·generated_at 같은 실행별 필드는 비교에서 제외했다.

```js
[...response.feed.slots].sort((a,b) => a.position-b.position).map(s => s.photo_id)
```

실행 출력에서 ph_ 접두사를 생략해 표기하면 다음과 같다.

```text
입력 / 모든 C / develop의 heuristic·mixed A/B:
01 02 03 04 05 06 07 08 09 10 11 12 13 14 15

real A: develop == PR
02 01 04 03 10 11 13 09 07 12 05 15 08 06 14
real B: develop == PR
04 03 02 01 10 11 13 09 07 12 05 15 08 06 14

PR heuristic A 및 mixed A:
02 01 04 03 10 11 13 09 07 12 05 15 08 06 14
PR heuristic B 및 mixed B:
04 03 02 01 10 11 13 09 07 12 05 15 08 06 14

real: base.A.order == head.A.order: true
real: base.B.order == head.B.order: true
real: base.A.slots == head.A.slots: true
real: base.B.slots == head.B.slots: true
head.A.order != input: true
head.B.order != input: true
head.A.order != head.B.order: true (4/15 positions)
```

따라서 S3의 배열 차이는 재현됐다. 다만 캡션·화면의 차이까지 요구하는 제품 D6 전체나 순서의 미적 품질을 이 결과만으로 통과 처리하지 않는다.

또한 “HTTP 400 → 자동 heuristic 폴백 → preserveOrder”는 현재 코드의 실제 경로가 아니다. [photo_analysis.js](../../../lib/photo_analysis.js)의 `analyzePhoto`는 키가 있으면 모델 실패를 예외로 반환하고, [model.js](../../../lib/model.js)의 `modelRoute`는 키 부재일 때 heuristic을 선택한다. 명시적 `?mock=1`도 heuristic 경로다. #79 이후에도 이 두 경로와 혼합된 기존 분석 입력은 존재하며, #75의 실효 범위가 여기다. 이미 수정된 maxItems는 결함으로 다시 지적하지 않는다.

## 2. 실모델 실행 조건과 한계

키는 `/Users/chowonjae/Desktop/projects/wanted/.env`에서 `process.loadEnvFile`로 프로세스 환경에만 읽었다. 파일 복사·키 출력은 하지 않았다. 실제 반환 모델은 15장 모두 `claude-opus-5`, `analysis_source`와 `X-Gyeol-Analysis-Source`는 모두 `vision_model`이었다. source 필드만 바꾼 fixture가 아니다.

입력은 읽기 전용 `pivot/apify-check/fixtures/images`의 서로 다른 게시물 15건이다. 아래 순서로 `ph_01`부터 `ph_15`, input_index 0..14를 부여했다.

```text
c29_Dc-2OOrFBnb_00.jpg
c29_Dc-GJ-iCezC_00.jpg
c29_Dc-auqBCVXI_00.jpg
c29_Dc7cY9WiUbs_00.jpg
c29_Dc8RZMAjXm8_00.jpg
c29_Dc94ZfOD1-q_00.jpg
c29_DdAdNz0jcEF_00.jpg
c29_DdBaYWQswYI_00.jpg
c29_DdDCDKgFCLE_00.jpg
c29_DdDx752PuVM_00.jpg
c29_DdEAAeHm6u0_00.jpg
c29_DdFvaJRiXnx_00.jpg
c29_DdGkodnCOAZ_00.jpg
c29_DdILtQ0CRl8_00.jpg
c29_DdIt_2szpfb_00.jpg
```

원본 ph_06은 20초 제한으로 3회 HTTP 504 `MODEL_TIMEOUT`이었다. 이 사진만 메모리에서 Sharp `resize({width:512,height:512,fit:'inside'}).jpeg({quality:80})` 처리 후 성공했다. ph_13은 원본 그대로 2회 504 뒤 3번째 성공했다. 나머지는 원본으로 성공했다. 서버 로그상 성공한 새 모델 분석은 대략 9.8~14.9초였으며, 재시작한 클라이언트에서 이미 성공한 사진은 서버 캐시를 재사용했다. **원본 15장 무재시도 성공이나 30초 전체 완료를 주장하지 않는다.**

휴리스틱 대조도 같은 최종 이미지 바이트를 `/api/analyze?mock=1`에 보내 확보했다. 원본 파일은 수정하지 않았다. 최종 15장 실모델 관측의 composition은 모두 full_frame이므로, 아래 혼합 구도 결함은 이 실사진 세트만으로 발견되지 않는다. 별도 합성 최소 사례로 검증했다.

업로드 요청은 다음 형태였다.

```js
{
  schema_version: '1.0', photo_id: 'ph_01', input_index: 0,
  file_ref: 'c29_Dc-2OOrFBnb_00.jpg', media_type: 'image/jpeg',
  image_base64: bytes.toString('base64')
}
// POST /api/analyze 응답 15개를 그대로 photos에 넣는다.
{
  schema_version: '1.0', session_id: 'codex-review-75', photos,
  identity: {target: {kind:'text',text:'짧게, 조용하게'},current:{kind:'none'}}
}
```

재현용 임시 자료는 `/tmp/pr75-live.mjs`, `/tmp/pr75-replay.mjs`, `/tmp/pr75-analyses.json`, `/tmp/pr75-outputs.json`, `/tmp/pr75-live-original.log`, `/tmp/pr75-live.log`, `/tmp/pr75-replay.log`다. 임시 분석 JSON SHA-256은 `1d091f9dc3b80f754b75ec1cecf0313fdcc181b6f98078510d023a65022b93e5`다. 이 문서는 임시 파일 없이도 판정을 읽을 수 있도록 주요 입력·출력을 위에 남겼다.

초기 Webpack 개발 서버에서는 `/api/analyze`가 즉시 500이었고 기본 Turbopack으로 전환해 실모델 경로를 실행했다. 마지막에는 두 브랜치 모두 Turbopack으로 18개 feed 요청을 재실행했고, 이전 비교와 순서가 모두 같았다. 이 도구 경로 차이를 #75 결함으로 분류하지 않았다.

## 3. 심각도별 지적

### P2 — 혼합 입력에서 미관측 구도가 순위를 바꾸고 문장에서는 숨겨진다

위치: [lib/order.js:131–140](../../../lib/order.js), [lib/pipeline.js:66–74](../../../lib/pipeline.js). 특히 “휴리스틱에서는 전 사진 공통이라 순위를 흔들지 않는다”는 새 주석은 **전부 휴리스틱인 배치에서만** 성립한다. 이번 변경은 `some(heuristic)` 우회를 제거해 혼합 배치도 orderFeed로 보낸다.

`attributes`는 source와 무관하게 full_frame을 flat=0으로 바꾼다. dense 점수는 `0.4*(1-flat)+0.4*sat+0.2*bright`이므로, 관측 못 한 사진에도 full_frame이라는 가정으로 0.4가 붙는다. 새 문장은 그 구도 항을 감추고 밝기·채도 때문에 점수가 가장 높다고 설명한다.

다음은 실제 사진 관측으로 위장하지 않은 **합성 계약 입력**이다. `test/order.real20.json`의 첫 3개 유효 객체를 복제하고 ID·source·model·composition·bright/sat·input_index만 다음 값으로 바꿨다. 색상각 등 나머지 필드는 그대로다. input 순서는 dark, observed, unknown이다.

| ID | source | composition | bright | sat | dense 점수 |
|---|---|---|---:|---:|---:|
| dark | vision_model | negative_space | 0.1 | 0.1 | 0.06 |
| observed | vision_model | negative_space | 0.8 | 0.3 | 0.28 |
| unknown | heuristic | full_frame(미관측 상수) | 0.5 | 0.2 | 0.58 |

`POST /api/feed`, target B 결과:

```text
develop HTTP 200: dark observed unknown (입력 유지 고지)
PR      HTTP 200: unknown observed dark
PR opener rationale:
밝기 0.5 · 채도 0.2 인 사진이라 지향 방향(빼곡한 쪽) 점수가 입력 3장 중 가장 높아 1번에 뒀다
```

사용자에게 제시한 두 관측값만의 가중합은 unknown 0.18 < observed 0.28이다. unknown을 앞으로 올린 0.4는 **관측하지 않은 full_frame**에서 왔다. 진단용 대조로 unknown의 구도를 모델이 관측한 negative_space로 바꾸면 opener가 observed로 바뀐다. 이 대조는 실제 unknown 사진의 구도를 알아냈다는 주장이 아니라 미관측 상수의 인과적 영향 확인이다.

전부 휴리스틱일 때 구도 문구를 제거한 것은 P2를 개선한다. 하지만 혼합에서는 선택 원인 자체가 여전히 미관측값에 의존하며 설명까지 빠져 추적성이 약해진다. 같은 배치에서 비교 가능한 관측 신호만 점수에 쓰도록 처리하고 이 최소 사례를 회귀 검증해야 한다. 혼합 입력에 대한 별도 제품 범위 확대를 요구하는 것이 아니라, 이번에 새로 여는 조건의 정확성 문제다.

재현 파일: `/tmp/pr75-mixed-http.mjs`, `/tmp/pr75-mixed-http.log`, `/tmp/pr75-mixed.mjs`, `/tmp/pr75-mixed.log`.

### P3 — photo_plan 유지의 구조적 근거와 제품 판단을 구분해야 한다

위치: [lib/pipeline.js:34–39](../../../lib/pipeline.js), [spec.md §2-1](spec.md).

현재 계약에서 PhotoPlan은 TargetProfile이 아니므로 그대로 composeFeed/orderFeed에 넣을 수 없다는 설명은 맞다. 임시 복제에서 photo_plan 우회만 제거하자 사진만 입력 테스트가 실제로 실패했다. 따라서 **이번 PR에서 우회를 유지하는 판단은 호환성 측면에서 옳다.**

그러나 “지향이 없으면 순서의 근거를 댈 수 없다”는 제품적 단정은 코드와 일치하지 않는다. order.js에는 WEIGHT.none과 ‘첫 자리 기본 규칙’이 있고, 밝기·채도와 명시적 서사 규칙을 근거로 배열할 수 있다. 실제 target text=`안녕하세요`는 방향 신호가 없는데도 ph_11을 opener로 택하며 `밝기 0.808 · 채도 0.086 … 첫 자리 기본 규칙`을 출력했다. [상위 제품 의도](../../intent.md)는 사진 여러 장의 순서 제안을 핵심으로 둔다.

사진만으로 취향을 추정해서는 안 된다는 것과 사진만으로 어떤 배치도 해서는 안 된다는 것은 다르다. “현재 스키마·경로의 호환성을 유지한다”로 주석의 범위를 한정하는 편이 정확하다. 이 리뷰는 photo-only 재설계를 merge 조건으로 요구하지 않는다.

### P3 — 기존 실행 보고서에 #79 이전 차단 상태가 남아 있다

[report.md §6·§8](report.md)는 모델 분석 차단을 현재 미해결 문제로 적고 테스트를 192건으로 적는다. 재베이스 후 현재 상태는 실모델 성공 및 193건 통과다. 과거 실행 기록으로 시점을 표시하고 현재 판정과 구분해야 한다. 이는 maxItems 결함의 재지적이 아니라 **이미 해결된 문제를 미해결로 표시한 문서 상태**에 대한 지적이다.

P0/P1 결함은 확인하지 못했다.

## 4. 새 회귀 테스트 3개의 실제 검출력

PR의 테스트 파일만 develop 임시 복제에 붙였고 production lib는 develop 원본 그대로 유지했다. 결과는 총 8개 중 7 pass / 1 fail이다.

| 새 테스트 | develop 코드에서 | 추가 변이 실험 | 판정 |
|---|---|---|---|
| 15장 휴리스틱 재배치 + 프로필 2벌 | FAIL: 입력 순서가 그대로다 | PR에서는 PASS | 제거한 우회를 실제로 검출 |
| 상수 composition을 관측으로 말하지 않음 | PASS | PR pipeline + develop order.js에서는 FAIL, slot 문장의 ‘넓게 깔’ 검출 | 문장 수정 회귀는 잡지만, 전체 이전 코드에서는 preserveOrder 덕에 통과 |
| photo-only 입력 순서 유지 | PASS | PR에서 photo_plan 우회만 제거하면 FAIL | 기존 동작 보호용으로 유효; 새 기능 검출 테스트는 아님 |

실행 명령은 각 임시 복제에서 `node --test test/pipeline.test.js`다. 두 번째 변이에서 7 pass / 1 fail, 세 번째에서 기존 photo-only 테스트까지 포함해 6 pass / 2 fail이었다. 실제 작업 트리 코드에는 변이를 적용하지 않았다.

이전 코드에서 실패한 새 테스트는 1개이고 나머지 2개는 통과했다. 그렇다고 세 테스트가 무의미한 것도 아니다. 다만 세 테스트 모두 혼합 source + 관측 negative_space 사례가 없어서 P2 결함은 잡지 못한다. 두 번째 테스트의 source를 vision_model로 바꾸는 부분은 문장 분기 검증일 뿐 실모델 실행 증거가 아니다. 첫 번째의 ‘real HTTP path’ 역시 Request를 만들어 handleFeed를 직접 부르는 단위 검증이며 TCP/Next 라우트 검증은 이번 별도 실행으로 보충했다.

## 5. 요청한 게이트와 DoD 판정

실행 환경은 macOS, Node v22.22.3이었다. package.json의 Node 24.x와 다르므로 Node 24 재현까지 주장하지 않는다.

```text
npm test
# tests 193
# pass 193
# fail 0
# skipped 0

npm run eval
quiet/detail E1 E2 E3 E6 E8 E9 E10 E11 PASS
broken E1/E2/E3/E6/E8/E9/E10/E11: EXPECTED FAIL
E4/E5/E7: manual spot-check only; real demo review pending.
Injected model variant 0/1: E1/E2/E3/E8/E9/E10/E11 PASS
foreign fact E11 EXPECTED FAIL (not AI quality)

npm run check
PASS: 65 JS/JSON files checked; four schema examples match fixtures.

npm run lint
Checked 40 files in 42ms. No fixes applied.

npm run typecheck
Generating route types...
✓ Types generated successfully
(tsc --noEmit 완료, 오류 없음)
```

| #69 DoD | 재현 판정 |
|---|---|
| 실제 HTTP 15장, 입력과 다른 순서 | PASS. 실제 모델 관측 15장으로 재현. develop도 이미 PASS |
| 전 슬롯 근거 및 실제 입력 ref | PASS. 단, 의미 정확성은 P2 지적 별도 |
| 프로필 2벌의 position 정렬 photo_id 차이 | PASS. 앞 4자리 다름 |
| 남은 photo_plan 분기와 이유 명시 | 구조·호환성은 PASS, 제품적 단정은 P3 |
| visual.palette 미충족 상태 기록 | 확인. text A/B에 palette가 없고 양쪽 tie 문장도 없음; PhotoPlan만 palette를 가지나 orderFeed 우회 |
| test/eval/check/lint/typecheck | 위 환경에서 모두 PASS |

이는 #69의 6개 체크리스트에 대한 재현이다. 배포된 UI·D1/D2·캡션 품질·사람 평가·Node 24 검증을 대체하지 않는다. 실제 API 키를 넣은 원본 15장 무재시도 완료도 별도 제한으로 남는다. 자동 테스트와 ref 존재 여부만으로 P2의 문장 진실성을 판정하지 않았다.

검증 로그는 `/tmp/pr75-{test,eval,check,lint,typecheck}.log`, 변이 로그는 `/tmp/pr75-regression-base.log`, `/tmp/pr75-mutation-{order,plan}.log`에 있다. 개발 서버가 생성한 CLAUDE.md/next-env.d.ts 변경은 실행 전 HEAD 내용으로 되돌렸고 검증 서버는 종료했다. 최종 산출물은 이 보고서 한 파일이다.
