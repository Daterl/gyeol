# 실행 계획

실행 담당: task_9378a9d699e0 / feat/43-model-wiring. 사람 리뷰 책임: enzo(입력), 교차 리뷰 담당자.
작업 범위는 이 워크트리만이며 schemas·화면·배포 설정·다른 워크트리는 수정하지 않는다.

1. 기존 사진 테스트로 휴리스틱·identity·캐시 회귀 기준을 확인한다.
2. lib/model.js와 config/models.json: 공식 기본 모델, 계정 확인, 제한 시간·재시도·안전한 오류·JSON 응답 연결. test/model.test.js에서 fetch 주입으로 확인한다.
3. lib/photo_analysis.js: 기존 기본 클라이언트 제거·중앙 클라이언트 재사용, 원 응답 계약 검증, 실패 전파, 경로 분리 캐시. 사진 테스트에 실패 주입·복구·키 전환 검증을 추가한다.
4. api/analyze.js: 기존 JSON을 유지하면서 출처 헤더와 모델 오류를 전달한다. HTTP 테스트로 확인한다.
5. scripts/measure-model.js와 .env.example: 키만 넣는 실행법·실측 기록. 키 없는 PENDING 출력을 확인한다.
6. eval/model-path.js를 eval/run.js에 연결: 서로 다른 유효 응답을 사진→프로필→순서→불변식 검사에 통과시킨다. 의도적 계약 위반은 테스트에서 실패를 확인한다.
7. npm test / npm run eval / npm run check 실제 출력을 report.md에 붙인다. 다중 모델 리뷰·실모델·배포 미실행을 PENDING으로 명시한다.
8. Lore trailers 및 지정 Co-Authored-By로 커밋하고 push한다. dev 대상 Draft PR 작성, 이슈 검증 댓글·보드 상태 갱신을 시도한다. merge하지 않는다.

공유 파일: eval/run.js는 기존 eval 확장만 한다. 패키지·lockfile·schemas 변경 및 새 의존성은 없다.
