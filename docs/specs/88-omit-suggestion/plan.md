# 실행 계획

기준 SHA: fc79110. 작업 브랜치: feat/88-omit-suggestion, PR base: develop.
실행 담당: 이 세션. 서버 리뷰 책임: enzo, OrderedFeed 추가 필드 소비자 합의: enzo·diego pending.

1. 구현 전 `observations-before-code.json`에 실제 JPEG 15장과 동일 바이트 재입력 관측을 남긴다. 완료: 15장 무권고 후보, 재입력 duplicate_of 확인.
2. `lib/omit-suggestion.js`에 중복 관측만 읽는 권고 계산과 feed 확장 함수를 만든다. 기존 입력·슬롯을 수정하지 않는다.
3. `lib/order.js`의 지향 순서 경로와 `lib/pipeline.js`의 사진만 경로에 연결한다. 같은 사진의 권고는 순서·프로필에 독립적이어야 한다.
4. `lib/contracts.js`에서 확장 존재 시 요약·슬롯 권고를 실제 분석과 대조한다. 기존 확장 없는 fixture는 유지한다.
5. `test/omit-suggestion.test.js`에 0개·실제 중복·외부/자기/순환/연쇄 참조·3/20장·원본 보존·조작 거부와 HTTP 양쪽 경로 검증을 쓴다.
6. `scripts/verify-omit-suggestion.js`에서 pivot 실사진 15장을 한 장씩 분석하고 `/api/feed` 핸들러를 호출한다. 15장 원본 및 마지막 사진을 첫 사진 바이트로 교체한 15장 입력을 구분한다. 미관측 필드 변조 전후 권고를 사진 ID별 대조한다.
7. `report.md`에 실사진 실행 출력, npm test/eval/check/lint/typecheck 전체 출력 파일 링크·요약과 DoD 판정을 남긴다. E1·E10·권고 0개·미관측 값 영향 0건을 실제 검사한다.
8. 문서·diff 검토, 커밋, develop 대상 Draft PR 작성, 이슈 댓글과 칸반을 검토·인수 대기로 갱신한다. 교차 모델 리뷰·소비자 합의·배포 검증은 실행하지 않았다면 pending으로 적는다.

허용 변경: 위 lib/test/scripts 및 docs/specs/88-omit-suggestion 아래 파일.
금지: 다른 워크트리, pivot 수정, schemas/, src/, 배포 설정, merge.
