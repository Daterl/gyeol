# 실행 계획

1. 이 spec/plan을 먼저 작성한다. fixtures를 만들고 schemas를 문서화한다.
2. lib/contracts.js에 공통 Claim/Evidence 및 네 계약 검증을 둔다.
3. api/feed.js와 scripts/server.js에 의존성 없는 Node ESM mock 경로를 만든다.
4. eval/invariants.js, eval/run.js와 수동 합성 golden 입력/출력을 만든다.
5. test/*.test.js에 5종 negative fixture, 입력 경계·중복·누락·타입·HTTP·무외부통신 검사를 둔다.
6. npm scripts와 check를 제공하고 로컬 실행 증거 및 남은 게이트를 report.md에 남긴다.

쓰기 범위: schemas/, fixtures/, lib/contracts.js, api/feed.js, scripts/, test/, eval/, package.json, docs/specs/1-contract-foundation/.
CLAUDE.md는 다른 작업자가 소유하므로 수정하지 않는다. 외부 의존성 0개, 커밋·push·GitHub 수정 없음.
테스트는 독립 입력 manifest를 기준으로 출력 ID를 비교하고, 수동 출력이 통과한다는 이유로 모델 품질을 인증하지 않는다.
