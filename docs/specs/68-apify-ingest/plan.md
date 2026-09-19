# 구현 순서

실행 담당: 이 작업 세션. 사람 리뷰 책임: 원재. 입력 API는 원재 영역이며 화면·배포·schemas는 수정하지 않는다.
기준: origin/develop에서 생성된 feat/68-apify-ingest. 완료 산출물은 develop 대상 Draft PR이다.

1. `lib/apify_ingest.js`: URL 검증·게시물 정규화·출처 매핑·시작/조회/취소 어댑터. 실제 pivot fixture와 실패 응답을 테스트한다.
2. `lib/ingest_api.js`, `src/app/api/ingest/route.ts`: 인증된 선택 서버 경로로 시작/조회/취소를 노출한다. HTTP 상태·키 누출·변조 receipt를 검사한다.
3. `scripts/ingest-instagram.js`: 새 실행을 명시적으로 시작하고 receipt를 먼저 파일에 저장한다. 재개 조회로 불필요한 유료 재시도를 방지한다.
4. `test/apify_ingest.test.js`: 지정 Actor·상한·한글·캐러셀·근거·개인정보 상태·비용/시간초과·취소/늦은 완료·프로필 추출·데모 무변경을 검증한다.
5. 공개 계정 3건을 최소 1회 실수집하고 정규화 및 두 추출기의 실제 출력과 제공자 청구액·시간을 기록한다. 실패 시 새 유료 실행을 반복하지 않는다.
6. npm test/eval/check/lint/typecheck의 실제 출력을 `report.md`에 기록한다. CodeRabbit 및 가능한 독립 리뷰를 실행하며 미실행 게이트는 명시한다.
7. 커밋·push·Draft PR을 develop에 열고 이슈 댓글·칸반을 갱신한다. 화면 인계, 리뷰, 배포 등 미완료 범위는 숨기지 않는다.
