# 실행 계획

실행 담당: 배정된 Codex 작업자. 사람 리뷰 책임: enzo(입력 합성), diego(출력 소비 계약). 크기 L이며 사람 계약 합의·서로 다른 두 모델 리뷰는 별도 pending 게이트다.

1. lib/compose.js에 composeProfile과 composeFeed를 구현한다. 기존 validators와 orderFeed를 재사용한다. lib/order.js·schemas·화면·배포 설정은 수정하지 않는다.
2. test/compose.test.js에서 고정 수치, 동일/부재/누락, 0과 반올림, 양방향 보정, 입력 복사, 근거와 E8을 검증한다. 실측 test/order.real20.json과 기존 지향 두 벌로 순서 비교를 수행한다.
3. scripts/compose-example.js가 같은 입력으로 재현 가능한 두 JSON을 docs/specs/13-two-axis/에 기록한다. 문장은 기존 순서 함수에서만 오며 합성은 숫자·키·근거만 추가한다.
4. npm test, npm run eval, npm run check 출력과 종료 코드를 report.md에 기록한다. 요구사항별 판정과 HTTP/화면 연결 및 교차 리뷰의 미완료를 숨기지 않는다.
5. 이슈 댓글에 완료조건 판정과 두 JSON을 남긴다. Lore 형식과 지정 공동저자 트레일러로 커밋하고 dev 대상 Draft PR을 연다. merge·배포는 하지 않는다.
