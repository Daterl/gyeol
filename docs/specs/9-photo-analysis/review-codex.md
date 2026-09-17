# PR #30 교차 리뷰 — PhotoAnalysis 추출

**Merge 판정: 아니오. H1~H4를 해소하고 실패 입력으로 재검증해야 한다.** 기존 테스트 숫자는 재현되지만, 베이스라인 JPEG의 잘못된 측정과 모델 응답 실패 복구 누락을 실제 실행으로 확인했다.

## 기준·범위

- 리뷰: Codex, 2026-09-17, Node `v22.22.3`. Claude 작성 코드에 대한 독립 리뷰다. 정확한 실행 모델 ID는 코디네이터의 dispatch 기록으로 확인할 사항이며 추정하지 않는다.
- `gh pr view 30 --repo Daterl/gyeol --json headRefName,headRefOid,baseRefName,files`: `feat/9-photo-analysis`, `aab1a189c25b7b867037d5214e97633645d8d66c`, base `main`. 로컬 HEAD도 동일하다.
- 판정 기준: `gh issue view 9 --repo Daterl/gyeol` 전문, 이 폴더의 intent/spec/plan/report, CLAUDE.md 마지막 자동 작업 규칙까지, pivot 제품 정의 P2·P3, foundation `review-claude.md`의 H1·H2와 사실 복사 구멍.
- 수정 파일은 이 보고서 하나다. 제품 코드·테스트·스키마·다른 워크트리·pivot은 수정하지 않았다. 실험 파일과 별도 Pillow 환경은 `/tmp/gyeol9-*`에만 만들었다. merge·원격 승인/거부 리뷰·댓글은 하지 않았다.
- CodeRabbit 스킬의 CLI 설치/인증 확인까지 수행했다(`0.7.6`, 인증됨). 아래 판정은 CodeRabbit 출력이 아닌 직접 실행·코드 대조·이미지 열람 결과다.
- 외부 모델 호출은 하지 않았다. 키 없는 경로는 `env -u ANTHROPIC_API_KEY`로 실행했고, 모델 오류 실험은 주입 client 또는 메모리의 `globalThis.fetch` 대체로 실행했다. 실모델·비용 PENDING은 결함으로 세지 않는다.

## 1. 보고서 숫자 재현

작업 디렉토리는 모두 `/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-9`다.

```text
$ npm test
> node --test test/*.test.js
1..81
# tests 81
# suites 0
# pass 81
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 458.532459
exit 0

$ npm run eval
> node eval/run.js
Synthetic manual bootstrap only; no AI quality or human agreement claim.
quiet: E1 E2 E3 E6 E8 E9 E10 E11 = 全 PASS
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
quiet broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
quiet broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
quiet broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_01
detail: E1 E2 E3 E6 E8 E9 E10 E11 = 全 PASS
detail broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
detail broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
detail broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
detail broken E6: EXPECTED FAIL — E6.title: expected nonempty string
detail broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
detail broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
detail broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
detail broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_15
E4/E5/E7: manual spot-check only; real demo review pending.
exit 0

$ npm run check
> node scripts/check.js
PASS: 34 JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.
exit 0
```

eval의 정상 표 두 개만 한 줄씩 축약했다. 그 외 실패 메시지와 테스트 합계는 실제 stdout이다. check는 문법·JSON 검사이지 별도 lint/typecheck 통과가 아니다.

| report.md 주장 | 직접 실행 결과 | 재현 여부 |
|---|---|---|
| tests 81 / pass 81 / fail 0 | 동일 | 재현 |
| 두 케이스 각각 불변식 8 PASS + 파손 8 EXPECTED FAIL | 정상 16, 예상 실패 16 | 재현 |
| check 34파일·의존성 0·예시 4종 일치 | 동일 | 재현 |
| 실사진 15개·실패 0·facts 90개 | 명시된 15파일로 동일 | 재현 |
| 표의 밝기·채도·hue·해상도·composition | 명시된 15파일에서 표의 모든 행 동일 | 재현 |
| cold 15 miss / warm 15 hit / cacheSize 15 | 동일, 모델 호출은 양쪽 0 | 재현 |
| cold 129ms / warm 4ms | 이번 134ms / 4ms | 성능 근사 재현; 시간은 고정값 아님 |
| SVG 15개·두 번째 호출 0 | 15개, 실패 0 | 재현 |
| 모델 실패는 에러 아닌 heuristic | throw한 HTTP 529는 복구; 계약 위반 응답은 500 및 캐시 오염 | **부분 실패, H2** |
| 휴리스틱 값은 관측값뿐 | 베이스라인 순백 JPEG가 회녹색; 비가시 SVG가 사실로 채택 | **일반 주장 반증, H1·H3** |
| facts 90개 무근거 0 | 같은 90문장 생성. 이미지 표본에서 장소·인물·시간 날조는 발견하지 않음 | 표본 확인; 사람 전수 대조의 독립 재수행은 아님 |
| 실모델 비용·품질 | 실행하지 않음 | PENDING 유지, 결함 아님 |

실사진 재현은 report.md 2-1의 **명시 파일 15개**를 `/tmp/gyeol9-real15`로 복사해 수행했다. 원본 폴더에 단순 `15` 제한을 걸면 다른 첫 15장이 선택되므로 같은 검증이 아니다. 실제로 그 경우 13개 고유 해시·중복 2개였고, 명시 표본으로 바꾸자 보고서 수치가 재현됐다.

```sh
env -u ANTHROPIC_API_KEY node scripts/run_pipeline.js /tmp/gyeol9-real15 15 > /tmp/gyeol9-report15.json 2> /tmp/gyeol9-report15.log
env -u ANTHROPIC_API_KEY node scripts/run_pipeline.js eval/golden/case_01/photos 15 > /tmp/gyeol9-svg.json 2> /tmp/gyeol9-svg.log
```

```text
모델 키: 없음 → 휴리스틱 경로만
1회차: 사진수 15, 모델호출 0, 모델실패 0, 캐시적중 0, 캐시미스 15, 실패 0, 소요ms 134
2회차: 사진수 15, 모델호출 0, 모델실패 0, 캐시적중 15, 캐시미스 0, 실패 0, 소요ms 4
2회차 모델 호출 = 0 (PASS: 파일 해시 캐시 적중)
캐시 항목 수 = 15 (상한 64, 프로세스 수명 한정 · 영속 아님)
real15 15 facts 90
```

## 2. 심각도별 지적

### BLOCKER — 없음

`git diff 32eff4f HEAD -- schemas` 출력은 비어 있다. PR files에도 schemas 변경이 없다. 네 계약의 기존 예시 검사는 통과한다. 다만 아래 HIGH 때문에 현재 merge는 권하지 않는다.

### HIGH H1 — 베이스라인 JPEG의 AC 데이터를 다음 DC로 읽어 실패하거나 잘못된 색을 반환한다

**위치:** `lib/jpeg_dc.js:95–105`, `:172–180`; `lib/photo_analysis.js:291`.

SOF0/1도 DC 전용 루프로 보낸다. 이 루프에는 블록의 AC 데이터를 소비하는 단계가 없고, 파싱한 `huffAC`는 사용되지 않는다. 다음 `decodeHuffman(...dcTable)`이 올바른 다음 블록 시작을 읽는다고 보장할 수 없다. 실제 재인코딩 비교에서 정상 JPEG 4장이 모두 `AnalysisUnavailableError`였고, 더 나쁜 경우인 순백 64×64 JPEG는 오류 없이 틀린 색을 반환했다.

| JPEG | Pillow 전체 디코드 밝기/채도 | 현재 분석 밝기/채도 | 결과 |
|---|---|---|---|
| 세로 사진 baseline | .743 / .162 | 관측 불가 | 정상 파일 실패 |
| 같은 사진 progressive | .743 / .162 | .741 / .160 | 근사 일치 |
| 흑백 baseline | .691 / 0 | 관측 불가 | 정상 파일 실패 |
| 흑백 progressive | .691 / 0 | .691 / 0 | 일치 |
| 매우 어두움 baseline | .056 / .175 | 관측 불가 | 정상 파일 실패 |
| 매우 어두움 progressive | .056 / .175 | .056 / .186 | 블록 근사 범위 차이 |
| 매우 밝음 baseline | .994 / .011 | 관측 불가 | 정상 파일 실패 |
| 매우 밝음 progressive | .994 / .011 | .993 / .009 | 근사 일치 |
| 순백 baseline | 1 / 0 | **.936 / .028**, `#e8efec` | 틀린 사실을 정상 반환 |
| 순흑 baseline | 0 / 0 | 0 / .016, hue 120 | 무채색에 색조 생성 |

특히 모델 성공 때에도 이 측정색으로 모델 색을 덮어쓰므로 fallback만의 문제가 아니다. `test/photo_analysis.test.js`의 “returns a real block grid” 테스트는 실제로 잘못된 바이트 세 개가 null인지밖에 검사하지 않는다. 정상 JPEG를 한 장도 디코드하지 않아 이 오류를 못 잡는다.

**최소 조치:** baseline 블록 경계를 올바르게 소비하거나, 지원하지 않는 baseline은 잘못된 수치를 반환하지 않도록 명시적으로 거절한다. 정상 baseline/progressive 쌍과 순백·흑백의 독립 디코드 기대값을 회귀 검사해야 한다. 후자는 지원 범위를 줄이는 임시 대응이므로 문서의 SOF0/1 지원 주장도 함께 정정해야 한다.

### HIGH H2 — 계약 위반 응답은 fallback 밖에서 검증되어 500이 되고, 실패 결과가 캐시에 고착된다

**위치:** `lib/photo_analysis.js:286–319`; `test/photo_analysis.test.js:89–95`.

`try/catch`는 client 호출까지만 감싼다. `validatePhoto`는 캐시 저장 **후** 실행되므로 실패해도 `modelFailures`는 0이고 잘못된 observation이 캐시에 남는다. 다음 요청은 모델도 재시도하지 않고 같은 예외를 낸다. 현재 테스트는 이 예외를 `assert.rejects`로 기대하여, spec의 “실패·타임아웃·계약위반 → heuristic”과 반대 동작을 성공으로 고정한다.

실제 기본 client 경로에서도 fetch만 대체하여 재현했다. 모델 JSON의 `text_in_image: ""`는 이 코드의 구조화 출력 스키마가 허용하는 string이지만, 최종 계약은 nonempty 또는 null만 허용한다. API 키 유무와 무관한 로컬 제어 흐름 결함이다.

```text
model-empty-text {"status":500,"out":{"error":{"code":"INTERNAL_ERROR","message":"Analysis failed."}}}
{"modelCalls":1,"modelFailures":0,"cacheHits":0,"cacheMisses":1,"cacheSize":1}
retry-without-key {"status":500,"out":{"error":{"code":"INTERNAL_ERROR","message":"Analysis failed."}}} fetchCalls=1
```

**최소 조치:** 모델 observation 계약 검증을 fallback 범위 안에서, 캐시 저장 전에 한다. 실패 결과를 저장하지 않고 측정 가능한 사진은 heuristic으로 반환하는 것과 재요청 복구를 검사한다.

### HIGH H3 — “단색 카드 전용” SVG 처리를 일반 업로드에 열어 두어 보이지 않는 색·문자를 사실로 만든다

**위치:** `lib/photo_analysis.js:127–166`, `:169–172`; `api/analyze.js:53–59`.

주석만 제한할 뿐 카드 형태 검증은 없다. 면적 대신 `fill` 속성 개수를 세고, 표시 여부와 무관하게 `<text>`를 읽는다. 실제로 흰 배경 100×100에 면적 0인 검정 rect와 숨겨진 text를 넣었더니 밝기 .5, 검정 점유 50%, 숨긴 글자가 출력됐다. 닫히지도 않은 SVG도 정상 분석됐다.

```text
svg-hidden {"color":{"hue_mean":0,"sat_mean":0,"bright_mean":0.5,"palette_hex":["#ffffff","#000000"]},"text":"서울 &amp; 부산","facts":["100×100 정사각 이미지","평균 밝기 0.5 (중간)","평균 채도 0 (매우 낮음)","주요 색 #ffffff (점유 50%)","주요 색 #000000 (점유 50%)"]}
svg-broken {"color":{"hue_mean":0,"sat_mean":0,"bright_mean":1,"palette_hex":["#ffffff"]},"text":null,"facts":["100×100 정사각 이미지","평균 밝기 1 (밝음)","평균 채도 0 (매우 낮음)","주요 색 #ffffff (점유 100%)"]}
```

P2의 “관측할 수 없는 값은 내지 않는다”에 직접 위배된다. **일반 SVG 렌더러 추가는 요구하지 않는다.** 지원하는 fixture 형태를 엄격히 제한하거나, 일반 입력에서 SVG 측정을 거절하는 것이 범위 안의 최소 대응이다.

### HIGH H4 — 색 빈도가 여백의 관측값으로 둔갑한다

**위치:** `lib/photo_analysis.js:23`, `:195`; `prompts/input/photo_analysis.md`의 composition 정의.

`dominantShare >= .28`이면 무조건 `negative_space`다. 색 히스토그램에는 위치·연결된 빈 영역·피사체 정보가 없다. 화면 전체를 채운 16px 흑백 체크무늬 JPEG를 넣었더니 `negative_space`가 나왔다(흰색과 검정 각각 50%). 이미지를 직접 열어 확인했다. 원본 ph_04도 사람이 프레임을 채우고 수목·건물 배경이 복잡한 사진인데 `negative_space`다.

```text
checker-prog.jpg color={hue_mean:0,sat_mean:0,bright_mean:0.5,palette_hex:["#ffffff","#000000"]}
composition=negative_space
```

이것이 `scale`에서 제거했다는 “측정된 것처럼 보이지만 그 뜻이 아닌 값”의 잔존 사례다. 15장의 색 점유율 분포는 임계값의 출처일 뿐, 구도 분류의 정답 근거가 아니다. downstream #12가 이를 구도 근거로 사용하면 P2가 깨진다.

**최소 조치:** 색 점유율을 여백 관측으로 주장하지 않는다. 계약 제약으로 fallback enum이 필요하다면 scale과 같은 미관측 취급 및 downstream 사용 금지 경계를 명시하거나, 실제 공간적 근거를 검증해야 한다. 스키마를 임의로 바꾸라는 요구는 아니다.

### MEDIUM M1 — 반환 객체의 배열·색 객체가 캐시와 공유되어 다른 호출의 사실을 오염시킨다

**위치:** `lib/photo_analysis.js:307–320`.

첫 반환의 `analysis.describable_facts.push('부산에서 2025년에 촬영했다')` 후 같은 바이트를 재호출하면 그 문장이 `analysis_source: heuristic`으로 돌아온다. 별도 API 요청 JSON으로 직접 exploit되는 경로는 확인하지 않았지만, 공개 모듈 호출자가 반환값을 편집하는 것만으로 전역 캐시가 바뀐다. 이는 사진별 근거를 격리하지 못하는 형태다. 불변 observation이나 반환 시 깊은 복사로 차단할 수 있다.

### MEDIUM M2 — 주입 observation의 신원 필드가 호출자의 실제 photo ID를 덮어쓴다

**위치:** `lib/photo_analysis.js:289`, `:315–319`.

실제 입력 `photoId:'real_photo', fileRef:'real.svg', inputIndex:0`에 주입 client가 `photo_id:'ghost', file_ref:'other.jpg', input_index:99`를 반환하도록 했다. 모두 그대로 출력되고 `validatePhoto`도 통과했다. “항상 재각인” W7은 성립하지 않는다.

```text
injected-identity: photo_id=ghost file_ref=other.jpg input_index=99
analysis_source=vision_model describable_facts=["다른 사진에서 복사한 사실"]
```

실제 공급자가 `additionalProperties:false`를 어겼다는 증거는 아니다. 정상 구조화 API가 그 추가 필드를 막으면 이 입력은 발생하지 않는다. 그러나 모듈의 명시된 client 주입 경계와 검증 방어는 뚫리므로 MEDIUM으로 한정한다. observation 필드 허용 목록과 마지막 신원 재각인이 최소 대응이다.

### MEDIUM M3 — 전역 캐시의 duplicate_of가 현재 입력에 없는 이전 세션 ID를 가리킨다

**위치:** `lib/photo_analysis.js:42`, `:307`, `:314`.

같은 살아 있는 인스턴스에서 사진을 `previous_session`으로 한 번 분석하고, 다른 요청에서 `new_session`으로 넣으면 `duplicate_of:previous_session`이 붙는다. 새 요청의 입력은 사진 한 장뿐이며 그 ID는 없다. 값은 `validatePhoto`를 통과한다. 같은 바이트라는 관측은 맞지만 현재 입력 내 중복이라는 보장은 없다. 해시 observation 재사용과 세션 내 중복 판정을 분리해야 한다. spec 8절 4번의 “호출자만 안다”는 문제를 실제로 확인한 것이다.

### LOW — fixture 대표성 / 스택 인계 메모

- 새 테스트의 정상 입력은 SVG 카드다. JPEG 테스트 이름과 달리 정상 JPEG 검사가 없다. H1 회귀에 정상 baseline/progressive를 넣는 것이 우선이며, 이번 범위에 인스타 수집기를 추가하지 말 것.
- 현재 이슈 본문 Owned에는 `src/app/api/analyze/route.ts`와 새 React/TypeScript 스택이 적혀 있지만 PR은 `api/analyze.js`다. 기존 워크트리에서 동작하는 경로임은 확인했다. #24 인계 시 라우트 정합성을 확인할 사항이며, 본 리뷰에서 프레임워크 이식을 추가 요구하지 않는다.

## 3. 근거 조작·빈 입력·한국어 직접 실행

기존 `validateFeed`에 복제한 fixture를 넣고 다음 변조를 실제 수행했다. foundation 리뷰의 H1/H2는 현재 기준선에서 막힌다.

```text
foreign-photo REJECT E10: OrderedFeed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
foreign-profile REJECT E9: target profile ID differs from actual input
copied-facts REJECT E11: describable fact is not a fact of ph_01
```

각 변조는 순서대로 `slots[0].rationale.evidence[0]={kind:'uploaded_photo',ref:'ghost',note:'fake'}`, `applied_profile.target_profile_id='ghost'`, `slots[0].caption_inputs.describable_facts=photos[8].describable_facts`다. 별개로 `analyzePhoto` 자체에서는 M1·M2·M3의 참조/사실 구멍을 재현했다. 모델이 지어낸 자연어 사실을 `validatePhoto`가 의미 판정하지 않는다는 점도 확인했으나, spec이 수동 판정으로 명시한 범위이므로 의미 검증기 추가를 요구하지 않는다.

```text
empty ANALYSIS_UNAVAILABLE empty image bytes
broken ANALYSIS_UNAVAILABLE no observable pixels in real.svg (image/jpeg)
over-limit IMAGE_TOO_LARGE image exceeds byte limit
array status=400 INVALID_REQUEST Body must be a JSON object.
blank-id status=400 INVALID_REQUEST photo_id must be a nonempty string.
negative-index status=400 INVALID_REQUEST input_index must be an integer >= 0.
bad-base64 status=400 INVALID_REQUEST image_base64 must be nonempty base64.
```

정상 SVG API 요청은 200이며 `analysis_source:"heuristic", model:"heuristic-svg-fill@1"`가 응답에 드러난다. **키 없음을 감춘 조용한 폴백은 아니다.** 모델 client가 HTTP 529를 throw하면 첫 호출 `modelCalls:1, modelFailures:1, cacheMisses:1`, 두 번째 `cacheHits:1`, 양쪽 `heuristic`이었다. 성공 모델 재사용은 npm test의 주입 client 테스트로 두 번째 추가 호출 0을 확인했다.

한글 ID·본문·이모지를 모델 client에 주입한 결과:

```json
{"id":"한글사진","text":"서울의 겨울 👩🏽‍💻","facts":[]}
```

문자열은 보존되고 빈 facts도 허용된다. 이 모듈은 게시물 캡션 길이를 계산하지 않으므로 한글 글자수 계산 결함은 발견하지 않았다. SVG의 `&amp;` 미해제와 숨겨진 글자 출력은 H3이다. 피사체·사실 배열을 억지로 채우지 않는 점에서는 P3 위반을 찾지 못했다. 다만 `has_face:false`와 `scale:midshot`는 문서에 인정된 미관측 대체값이므로 실제 부재/스케일 관측으로 쓰면 안 된다.

### 실제 게시물 fixture 대조

Node로 JSON 전체를 읽어 type·caption·childPosts를 집계한 실제 출력:

| 파일 | 게시물 | Sidecar | 한글 캡션 | 빈 문자열 캡션 | Image | 최대 childPosts |
|---|---:|---:|---:|---:|---:|---:|
| ig_feed_29cm.json | 30 | 26 | 30 | 0 | 0 | 16 |
| wantedlab_ko.json | 11 | 4 | 0 | 10 | 7 | 3 |
| humansofny.json | 100 | 71 | 0 | 0 | 2 | 20 |

29cm의 나머지 4건을 단일 사진이라고 추정하지 않았다. 지정 fixture에는 빈 캡션·20장 캐러셀이 없고, 같은 read-only 폴더의 다른 실제 fixture에서 확인됐다. #9는 게시물이나 캡션이 아닌 **사진 바이트 한 장**을 받는다. 따라서 게시물 캡션/캐러셀 해체는 이 PR의 기능 결함으로 올리지 않는다. 기존 계약 테스트는 3·20장 통과, 2·21장 거부를 실제 검사하며 이번 실행에서도 통과했다.

## 4. 실제 사진과 facts 표본 대조

report에 명시된 15장 contact sheet를 열어 전체를 훑고, ph_04·ph_05·ph_09는 원본 이미지도 별도로 열었다. 아래는 보고서의 ph 번호이며 단순 폴더 첫 15장 번호가 아니다.

| 표본 | 실제 출력 | 직접 보이는 내용과 판정 |
|---|---|---|
| ph_01 | 1080×1350 세로, 밝기 .375, 채도 .288, `#16150f` 26% | 수목·어두운 배경과 회색 의복. 거친 명암·색 서술과 모순 발견 못 함 |
| ph_04 | 1440×1800, 밝기 .328, `#171a18` 29% | 인물이 크게 차지하고 수목/건물이 뒤에 보임. 어두운 색 존재는 맞지만 **negative_space는 부적절** |
| ph_05 | 1080×1350, 밝기 .518, `#9b6391` 14% | 보라색 가방, 회색 배경·살색 팔을 직접 확인. 보라색 측정은 실제 보이는 색과 부합 |
| ph_09 | 1080×1350, 밝기 .742, `#f2dfcc` 33% | 밝은 크림 배경, 흰 의복·검은 머리. 거친 색·명암과 부합 |
| ph_12 | 1214×2160, 밝기 .515, 채도 .344 | 청록색 상의, 어두운 소품·복잡한 배경. 채도·색 다양성에 거친 모순 없음 |
| ph_13 | 1080×1350, 밝기 .43, 회색/검정 palette | 버건디 옷·검은 가방·회색 금속 배경. 출력은 장소·인물·시간을 주장하지 않음 |

**한계:** 눈으로 정확한 평균 .742나 양자화 버킷의 33%를 검증할 수는 없다. 색의 존재·명암·방향과 금지된 의미 서술 부재를 확인한 것이며, “90개 숫자의 정확성과 무근거 0개를 독립 전수 인증”한 것이 아니다. H1은 별도의 독립 디코더와 정답이 명확한 흰 이미지로 수치 오류를 입증했다. 원본 15장은 progressive여서 H1의 baseline 오류를 대표하지 않는다.

## 5. 이슈 #9 DoD 항목별 판정

| # | 실제 이슈 완료 조건 | 판정 | 근거·남은 것 |
|---|---|---|---|
| 1 | 15장 → PhotoAnalysis 15개, CLI 출력 이슈 첨부 | **로컬 PASS / 이슈 첨부 별도** | 명시 실사진 15개 재현. 이 리뷰는 이슈에 댓글을 쓰지 않았고 기존 댓글 첨부 여부는 별도 확인하지 않음 |
| 2 | 15장 전부 사람이 대조, 사진에 없는 facts 0개 | **기존 주장 + 표본 확인 / 독립 전수 PENDING** | 동일 90항목 재현, 표본 대조에 의미 날조 발견 없음. 리뷰 모델의 열람을 사람 전수 확인으로 바꾸어 적지 않음 |
| 3 | 동일 사진 두 번째 hash hit, API 호출 0회 | **PASS (순차·살아 있는 인스턴스)** | warm 15 hit, 주입 성공 모델 테스트도 추가 호출 0. M1~M3의 캐시 정확성은 별도 결함 |
| 4 | #6 A1 실측 반영, 사진 단위 또는 시간 상한 내 처리 | **분할 설계 PASS / A1 실측 PENDING** | API 1장, 배열 400. 실측 숫자를 확보했다고 주장하지 않음 |
| 5 | 모델 실패 → heuristic, 에러 아님 | **FAIL** | HTTP 529 throw는 복구하지만 계약 위반 응답은 500 및 캐시 고착(H2) |
| 6 | 전체 파이프라인 토큰 비용 이슈 기록 | **PENDING (결함 아님)** | 실키 없이 측정하지 않음. 사용자 지시대로 merge 반대 사유에 포함하지 않음 |
| 7 | fallback이 모르는 사실을 채우지 않고 관측 근거·출처만 출력 | **FAIL** | 출처 표시는 PASS. baseline 잘못된 색(H1), 비가시 SVG facts(H3), 색 빈도의 구도 단정(H4) |
| 8 | 영속 캐시 가정 금지, 재사용 범위·상한 spec 명시 | **PASS** | module Map, process lifetime, CACHE_LIMIT 64; 74건→64건 테스트 통과 |

## 6. 주요 반증 재현 명령

아래는 제품 파일을 바꾸지 않는 최소 재현이다. Pillow는 저장된 JPEG의 전체 디코드와 변형 표본 생성에만 사용했으며 제품 의존성으로 추가하지 않았다.

```sh
python3 -m venv /tmp/gyeol9-review-venv
/tmp/gyeol9-review-venv/bin/pip -q install Pillow
/tmp/gyeol9-review-venv/bin/python - <<'PY'
from PIL import Image, ImageOps, ImageEnhance
from pathlib import Path
out=Path('/tmp/gyeol9-jpegs'); out.mkdir(exist_ok=True)
src=Path('/Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/images/kr29cm_Dc-GJ-iCezC_00.jpg')
im=Image.open(src).convert('RGB').resize((160,200))
variants={'portrait':im,'gray':ImageOps.grayscale(im),'dark':ImageEnhance.Brightness(im).enhance(.08),'bright':ImageEnhance.Brightness(im).enhance(5)}
for name,v in variants.items():
    for progressive in [False,True]:
        v.save(out/(name+('-prog' if progressive else '-base')+'.jpg'),quality=95,progressive=progressive)
for name,c in [('black',0),('white',255)]:
    Image.new('RGB',(64,64),(c,c,c)).save(out/(name+'-base.jpg'),quality=95)
board=Image.new('RGB',(160,160)); p=board.load()
for y in range(160):
    for x in range(160): p[x,y]=(0,0,0) if (x//16+y//16)%2 else (255,255,255)
board.save(out/'checker-prog.jpg',progressive=True,quality=100)
for f in sorted(out.glob('*.jpg')):
    v=Image.open(f).convert('RGB'); pixels=list(v.getdata())
    bright=sum(max(t)/255 for t in pixels)/len(pixels)
    sat=sum((max(t)-min(t))/max(t) if max(t) else 0 for t in pixels)/len(pixels)
    print(f.name,round(bright,3),round(sat,3))
PY
node --input-type=module - <<'JS'
import fs from 'node:fs';
import {analyzePhoto,resetAnalysisState} from './lib/photo_analysis.js';
for(const f of fs.readdirSync('/tmp/gyeol9-jpegs').sort()) {
  resetAnalysisState();
  try {
    const {analysis:a}=await analyzePhoto({bytes:fs.readFileSync('/tmp/gyeol9-jpegs/'+f),photoId:f,inputIndex:0,fileRef:f,apiKey:''});
    console.log(f,JSON.stringify({color:a.color,composition:a.composition,facts:a.describable_facts}));
  } catch(e) {console.log(f,e.name,e.message)}
}
JS
```

H2/M1/M2/M3/H3의 함수 경계 재현:

```sh
node --input-type=module - <<'JS'
import fs from 'node:fs';
import {analyzePhoto,resetAnalysisState,analysisCounters} from './lib/photo_analysis.js';
const bytes=fs.readFileSync('eval/golden/case_01/photos/ph_01.svg');
const input={bytes,photoId:'real_photo',inputIndex:0,fileRef:'real.svg',apiKey:''};
const base={composition:'full_frame',scale:'midshot',subjects:[],has_face:false,text_in_image:null,describable_facts:[],quality_flags:[]};
resetAnalysisState();
for(let i=0;i<2;i++) {
  try {await analyzePhoto({...input,apiKey:'injected',client:async()=>({model:'fake',observation:{...base,composition:'sideways'}})})}
  catch(e) {console.log('invalid-model',i+1,e.message,analysisCounters())}
}
resetAnalysisState();
let a=await analyzePhoto({...input,apiKey:'injected',client:async()=>({model:'fake',observation:{...base,photo_id:'ghost',file_ref:'other.jpg',input_index:99,describable_facts:['다른 사진에서 복사한 사실']}})});
console.log('injected-identity',a.analysis);
resetAnalysisState(); a=await analyzePhoto(input);
a.analysis.describable_facts.push('부산에서 2025년에 촬영했다');
console.log('mutated-cache',(await analyzePhoto(input)).analysis.describable_facts);
resetAnalysisState(); await analyzePhoto({...input,photoId:'previous_session'});
console.log('foreign-duplicate',(await analyzePhoto({...input,photoId:'new_session'})).analysis.quality_flags);
for(const [label,svg] of [
  ['svg-hidden','<svg width="100" height="100"><rect width="100" height="100" fill="#ffffff"/><rect width="0" height="0" fill="#000000"/><text display="none">서울 &amp; 부산</text></svg>'],
  ['svg-broken','<svg width="100" height="100" fill="#ffffff"']
]) {resetAnalysisState(); console.log(label,(await analyzePhoto({...input,bytes:Buffer.from(svg)})).analysis)}
JS
```

실제 결과: invalid-model 1·2 모두 `PhotoAnalysis.composition: expected full_frame|negative_space`, 첫 호출부터 cacheSize 1, 두 번째 cacheHits 1 / modelCalls 1 / modelFailures 0. 나머지는 H3·M1~M3에 기재한 값이다.

**최종 한 줄: merge 아니오 — H1~H4의 관측 정확성·실패 복구를 고치고 정상/실패 JPEG·모델·SVG 입력으로 재검증한 뒤 다시 판정한다.**
