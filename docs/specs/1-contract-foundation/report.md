# 구현·검증 인계 — #1 / #7 / #8

2026-09-17, feat/1-contract-foundation, Node v22.22.3. 최초 구현 기록에 이어 초기 구현 커밋 `7ed8d4c` 이후의 P2 수정·재검증을 반영했다. 이 후속 worker는 커밋/push/merge/이슈 변경을 수행하지 않았고 CLAUDE.md를 수정하지 않았다.

## 결과

- schemas 4종 v1.0, 대응 JSON 4종, 15슬롯 mock, current present/absent, target ref/freetext 제공.
- Node ESM 내장 모듈만 사용, dependencies/devDependencies 0개.
- GET /api/feed?mock=1은 OrderedFeed 단일 객체. resource=photo_analysis/target_profile/current_profile은 대응 샘플 배열.
- live GET은 501 LIVE_NOT_IMPLEMENTED. 잘못된 mock/resource 400, GET 이외 405.
- F3 export는 단일 한 줄 title, position/photo_id/caption_state/text/omit_reason/evidence를 가진다. 원본 feed의 위치별 ID와 대조해 재배치 후 잘못된 캡션 연결을 거부한다.
- 생성 요청 `{feed}` / 응답 `{output}`은 향후 계약 제안만 문서화했다. generate API 구현은 없다.

## 검증 증거

| 실행 | 실제 결과 | 원문 |
|---|---|---|
| npm test (P2 수정 후 재실행) | 60/60 pass, 0 fail; 최초 기록은 50/50 | [test.txt](test.txt) |
| npm run eval | 2프로필 × E1/E2/E3/E6/E8 = 10 PASS; 각 broken fixture 10건 EXPECTED FAIL | [eval.txt](eval.txt) |
| npm run check | JS/JSON 25파일 구문 확인, 의존성 0, 스키마 4개 예시와 fixtures 일치 | [check.txt](check.txt) |
| PORT=43127 npm start + curl (최초 구현 시 기록) | HTTP 200, 15슬롯, position 1..15, target_only | [헤더](curl-mock.headers.txt), [응답](curl-mock.json) |
| curl live (최초 구현 시 기록) | HTTP 501 LIVE_NOT_IMPLEMENTED | [응답](curl-live.txt) |

재현: `npm start` 후 `curl -i 'http://127.0.0.1:3000/api/feed?mock=1'`.
검증 서버는 종료했다. 별도 linter/typechecker/build는 없으며 check를 그런 검사로 주장하지 않는다.

네트워크 금지 테스트는 별도 Node 프로세스에서 fetch, HTTP/HTTPS, socket 연결, DNS를 모두 실패 함수로 바꾼 뒤 4종 mock을 읽었다. 시도 횟수 0이며 키가 필요 없다. OS 전체 네트워크 차단 실험은 아니다.

3/20장 통과, 2/21장 거부, 중복·누락·동일 개수의 외부 ID 대체·거짓 invariants·문자열 숫자·잘못된 Claim/Evidence·프로필 타입·단일 타이틀·재배치 identity를 검사했다.

## 초기 커밋 이후 P2 후속 검증

- 외부 리뷰의 두 P2를 현재 작업 트리에서 독립 회귀 테스트로 재현했다. 구현 변경 전에 계약 테스트 57건 중 48 pass / 9 fail: 누락·undefined CurrentProfile × 정상 target-only·조작된 correction × validateFeed·E8의 8건, photo-only user 캡션 1건이 실패했다. 새 valid user_text 통제 테스트는 통과했다.
- validateDisclosure의 선택적 입력 검사를 제거해 validateFeed와 E8 모두 실제 CurrentProfile을 항상 검증한다. absence는 명시적인 present:false 객체이며, 누락 입력을 API 호출자나 출력으로 추측하지 않는다.
- user 캡션은 유효한 user_text evidence를 최소 1개 요구한다. 사진 evidence와 함께 제공하면 통과하며 빈 사용자 ref는 거부한다. 사용자 입력 ref의 실제 진위는 인증하지 않는다.
- 스키마에 필수 current 입력과 position 기준 순서(배열 저장 순서는 무관)를 명시했다. 기존 eval 전체 export 검증 게이트는 유지했다.
- 수정 후 npm test / npm run eval / npm run check를 모두 재실행하고 위 원문 파일을 갱신했다. eval/check 출력은 이전 기록과 동일하다. HTTP curl smoke는 이번 후속 작업에서 재실행하지 않았으며 npm test의 API 테스트 3건은 재실행했다.

## 초안 대비 계약 결정

- TargetProfile.source에서 photo_upload 제외 (intent C2).
- CurrentProfile absent를 profile_id=null/source=none/account_scope=n/a/sample_size=0/completeness=0/visual={}/language=null/sequence={}/raw_freetext=null로 명시.
- caption_len_gap만 허용, delta 최대 1개. target_only는 delta 없음.
- PhotoAnalysis 필드 변경 없음. 샘플은 실제 입력 ID 대조를 위해 15개 제공.
- F3 export에 photo_id와 omit_reason 추가. omitted는 text=null, 근거 있는 이유 필수. filled/user는 omit_reason=null.
- 프로필 선택 판단은 미상일 때 생략 가능, 언어 completeness=0과 language=null은 동치.

## 검증 한계·남은 게이트

- **두 사람 합의, 사람 merge, 다중 모델 리뷰, 공개 배포 smoke는 pending.** 로컬 AI 자동화 승인만 반영했다. 이슈 전체 완료/닫힘을 주장하지 않는다.
- 골든은 실제 사진이 아닌 **수동 합성 SVG 카드 15개** 1벌 × 수동 target 2벌이다. 순서 차이도 수동으로 정했으므로 D6 개인화 품질 증거가 아니다.
- #10 이후 실제 target 추출 결과 및 실제 데모 사진으로 교체하고 불변식 전후 비교가 필요하다.
- E4/E5/E7은 **수동 스팟체크로 대체함**. 합성 export에는 filled/omitted가 있지만 실제 데모 사진의 사실·금지어·비움 검토는 pending이다.
- live AI, UI, 업로드, F3 생성, Vercel 배포는 이번 범위에 없다.

## 자체 점검

mandela: 수동 결과를 만든 사람이 평가기도 작성한 verifier=designer 한계가 있다. input.json의 독립 ID와 외부 ID 대체 negative 테스트로 구조 검사의 순환을 줄였지만 품질 검증으로 승격하지 않는다.
ssotize 읽기 전용: schemas가 계약 원천, fixtures는 실행 예시, lib/contracts.js는 강제 구현이다. 스키마의 JSON 예시는 fixtures와 기계 대조하며 별도 사실 원천으로 취급하지 않는다. consolidation 변경은 하지 않았다.
별도 fresh-context/다중 모델 리뷰는 이 worker에서 수행하지 않았다. 코디네이터의 F3 identity 피드백은 구현·회귀 테스트에 반영했다.
