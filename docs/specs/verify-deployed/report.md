# 배포 검증: 실제 피드 → 문장 생성 흐름

실행일: 2026-09-18 KST. 브랜치: `fix/verify-real-flow`, 기준 커밋: `2ffaf46445d716e785ae269f749db738ab21eae9`.
대상: https://project-7klb1.vercel.app. 명령: `npm run verify:deployed`. 종료 코드: **0**, PASS 7 / SKIP 2 / FAIL 0.

D4·D5는 **미검증**이다. 실제 생성 API가 `503 GENERATION_UNAVAILABLE`을 반환했으며, 읽은 서버 계약상 배포 환경의 `ANTHROPIC_API_KEY`가 없거나 공백인 경우다. 환경변수 관리 화면을 조회한 결과가 아니라 API 응답과 서버 분기로 판정했다. 키를 설정한 뒤 같은 명령을 다시 실행해야 생성 성공을 판정할 수 있다. 제품 코드 결함으로 판정하지 않았고 이번 실행에서 새 제품 결함은 확인되지 않았다.

## 요청 계약과 범위

- `test/pipeline.test.js`와 `test/interaction.test.js`의 요청 예시를 따라 기존 `fixtures/interaction.sample.json`의 `context.photos` 3장을 사용했다. 원본 이미지 업로드·분석 검증은 제외한다.
- `POST /api/feed`에는 JSON 헤더와 `{schema_version:'1.0', session_id:'verify-deployed', photos, identity:{target:{kind:'none'},current:{kind:'none'}}}`를 전송한다. POST 경로는 `lib/pipeline.js`의 `handleFeed`를 사용하며 GET mock 피드와 다르다.
- `validateFeedResponse`로 반환된 `{feed, context}`를 확인한 뒤 `POST /api/generate`에 `{schema_version:'1.0', mode:'all', feed, context}`를 전송한다. `photo_id`는 보내지 않는다.
- D4는 비어 있지 않은 한 줄 타이틀, D5는 채움 슬롯 ≥1, 비움 슬롯 ≥1, 모든 비움 슬롯의 비어 있지 않은 `omit_reason`을 요구한다. 200 응답에는 `validateGenerateResponse`도 적용한다.
- `503 GENERATION_UNAVAILABLE`만 SKIP이다. 다른 오류는 원문을 보존한 FAIL이며, 피드 실패로 생성을 실행하지 못한 경우에도 D4·D5를 PASS로 표시하지 않는다.

계약 근거: `lib/interaction.js`의 `validateGenerateRequest`·`validateFeedResponse`·`validateGenerateResponse`, `lib/output-generation.js`, `lib/upload.js`의 `readJsonRequest`, `src/app/api/feed/route.ts`의 POST 경로.

## 실제 배포 실행 출력 전문

```text

> gyeol@0.1.0 verify:deployed
> node scripts/verify-deployed.mjs

대상: https://project-7klb1.vercel.app

PASS D1    공개 URL 이 로그인 없이 열린다
      status=200 (571ms)
PASS D2    첫 화면 응답이 30초 안
      218ms
PASS D3    POST 피드 응답이 JSON·계약을 만족한다
      status=200 (229ms)
PASS D3    position 이 1..N 을 한 번씩
      슬롯 3개
PASS D3    자리마다 근거가 있다
      3/3 슬롯에 근거
SKIP D4    문장 생성 판정
      배포 환경에 API 키가 없다 (ANTHROPIC_API_KEY 미설정). 기능 검증 미실행.
status=503 (243ms)
{"error":{"code":"GENERATION_UNAVAILABLE","message":"문장 생성이 아직 연결되지 않았어요. 나중에 다시 시도해 주세요.","retryable":false}}
SKIP D5    문장 생성 판정
      배포 환경에 API 키가 없다 (ANTHROPIC_API_KEY 미설정). 기능 검증 미실행.
status=503 (243ms)
{"error":{"code":"GENERATION_UNAVAILABLE","message":"문장 생성이 아직 연결되지 않았어요. 나중에 다시 시도해 주세요.","retryable":false}}
PASS ROUTE /api/analyze 라우트가 배포돼 있다
      status=405
PASS ROUTE /api/generate 라우트가 배포돼 있다
      status=405

7/9 통과, SKIP 2건, FAIL 0건 (1722ms)
SKIP 은 통과가 아니다. 배포 환경에 API 키를 설정한 뒤 D4·D5 를 다시 검증해야 한다.
```

## 판정별 근거

| 판정 | 이유 |
|---|---|
| D1 PASS | 공개 URL이 리다이렉트 없이 HTTP 200을 반환했다. |
| D2 PASS | 첫 HTML 응답이 218ms로 30초 미만이었다. |
| D3 JSON·계약 PASS | POST 피드가 200이며 반환된 feed와 context가 계약 검증을 통과했다. |
| D3 position PASS | 반환된 3슬롯의 position이 1..3을 한 번씩 포함했다. |
| D3 근거 PASS | 3/3 슬롯에 rationale.evidence가 있었다. |
| D4 SKIP | 생성 서버가 API 키 부재에 해당하는 503 GENERATION_UNAVAILABLE을 반환해 타이틀을 받지 못했다. |
| D5 SKIP | 같은 생성 실패로 캡션을 받지 못해 채움·비움·omit_reason을 검사하지 못했다. |
| ROUTE analyze PASS | GET 요청에 405를 반환해 라우트 존재를 확인했다. 분석 성공을 뜻하지 않는다. |
| ROUTE generate PASS | GET 요청에 405를 반환해 라우트 존재를 확인했다. 생성 성공을 뜻하지 않는다. |

## 로컬 검증

| 명령 | 결과 |
|---|---|
| `node --check scripts/verify-deployed.mjs` | PASS |
| `node --test scripts/verify-deployed.test.mjs` | 12/12 PASS |
| `npm test` | 189/189 PASS |
| `npm run eval` | PASS, 의도적으로 깨뜨린 fixture는 EXPECTED FAIL; E4/E5/E7 수동 검토는 pending |
| `npm run check` | PASS, JS/JSON 65개와 스키마 fixture 일치 확인 |
| `npm run lint` | PASS, 40개 파일 검사; 기존 설정상 scripts/*.mjs는 lint 범위 밖 |
| `npm run typecheck` | PASS |

회귀 검사는 로컬 HTTP 서버로 실제 CLI를 실행해 POST 순서·헤더·요청 모양, 정상 성공, 키 부재 SKIP, 빈/여러 줄 타이틀, 일부 비움 사유 누락, 채움/비움 부재, 다른 400/502/503 오류의 원문 보존, 잘못된 200 JSON, 피드 실패를 확인했다. 이 합성 응답 검사는 스크립트 판정의 증거이며 실제 모델 생성 품질의 증거는 아니다. 회귀 검사 파일은 scripts/에 두어 요청된 스크립트·문서 수정 범위를 지켰으며 npm test와 별도로 실행한다.

`npm ci`는 성공했으나 현재 Node v22.22.3은 package.json의 Node 24.x 요구와 달라 엔진 경고가 있었다. 이 보고서의 검사는 현재 Node에서 통과한 결과이며 Node 24 재검증 증거는 없다.

## 한계와 후속 조치

[CLAUDE.md의 한계](../../../CLAUDE.md#한계--이-스크립트가-못-보는-것)를 따른다. 드래그·키보드·모바일 폭·원클릭 전체 시간·원본 사진 분석·문장 품질은 이 실행으로 확인되지 않는다. 서버와 같은 계약 검증기를 재사용하므로 계약 구현 자체의 결함을 독립 검증한 것은 아니며, D4·D5 직접 조건과 오류 주입 회귀 검사로 판정 누락을 보완했다.

API 키 설정 및 배포 후 생성 성공 경로 재검증이 남아 있다. 제품 코드 수정, 배포, merge는 수행하지 않았다. 별도 리뷰 에이전트와 다중 모델 리뷰는 실행하지 않았으며 리뷰 완료로 간주하지 않는다.
