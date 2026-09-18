# 실행 계획

실행 담당: 이슈 101 워커. 사람 리뷰 책임: enzo와 출력 영역 담당 diego.
공유 style_guard와 출력 모델 입력 투영은 다른 작업과 충돌을 피하기 위해 변경하지 않는다.

1. 감사 분석 원자료 14건을 보존하고 실패한 사진 한 장만 analyzePhoto로 보완한다. 입력 15장과 지향 4종을 작업 폴더 JSON으로 고정한다.
2. 작업 폴더 measure.mjs에서 실제 generateOutput 경로로 기존 프롬프트 10회 실행한다. 요청·모델·usage·시간·실패 원문을 보존한다.
3. prompts/output/caption.md에서 캡션 목적·핵심 선택·광고 인용 금지·note 원문 규칙을 명시한다. prompts/output/title.md에서 단일 사진 텍스트의 확대를 막는다.
4. 같은 입력·모델로 수정 후 10회 실행한다. 비교표와 기계적 보조 지표를 만든 후 에이전트가 읽은 판정을 기록한다. 사람 판정은 분리한다.
5. npm test, npm run eval, npm run check, npm run typecheck, npm run lint의 실제 출력·종료코드를 report.md와 로그에 남긴다. 실패를 기존/변경 유발로 구분한다.
6. 제한·미완료 게이트가 드러나는 한국어 report.md와 Draft PR을 작성한다. PR 대상 상충은 코디네이터 답을 따른다. 배포·merge는 하지 않는다.

프롬프트 문구 복사 여부만 검사하는 테스트를 품질 증거로 만들지 않는다. 기존 생성 계약 테스트와 실모델 전후 비교를 사용한다.

## 개정 2026-09-18 — 리뷰(@jangwonyoon) 대응 실행 순서

1. `origin/develop` 재베이스. #96 의 `forModelSlot` 출력 모델 입력 축소가 들어간 상태에서만 재측정한다.
   확인: `git diff origin/develop -- test/` 삭제 줄 0건.
2. `prompts/output/title.md` 를 develop 판으로 되돌린다. title 은 #109(PR #113) 소관이다.
   확인: `git diff origin/develop -- prompts/output/title.md` 가 비어 있다.
3. `lib/output-generation.js` 의 기존 `validatePublicOutput` 자리에 계약 3종을 붙인다.
   새 경계를 만들지 않는다. 확인: 가드를 지우면 새 회귀 3종이 실패한다.
4. `prompts/output/caption.md` 를 단서 형식으로 바꾼다 (PR #115 에서 실모델 36회로 측정된 판을 가져온다).
5. UI 의미: `src/copy/captions.ko.json` 과 편집란 라벨·placeholder 만 바꾼다. 새 화면을 만들지 않는다.
6. `npm test` / `eval` / `check` / `typecheck` / `lint` / `test:ui` 를 돌려 로그를 남긴다.
7. develop 통합 상태에서 실모델 12회 재측정(`measure.mjs integrated`). 숫자를 report.md 에 적는다.
8. PR #112 에 지적별 대응표 코멘트. merge 하지 않는다.
