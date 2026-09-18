# 실행 계획
1. 기존 order 회귀검사를 실행하고 실사진 기준선 출력을 보관한다. 사진은 한 장씩 분석한다.
2. lib/curation-voice.js에 관측된 명암·색 차이 기반 컨셉과 자리 설명을 둔다.
3. lib/order.js는 기존 계산을 evidence로 이동하고 value만 교체한다. lib/pipeline.js의 사진만 입력 경로에도 컨셉을 반영한다.
4. test/order*.test.js의 수치 설명 검사를 evidence로 옮기고 컨셉 경계·무근거 생성 방지·순서 보존 검사를 추가한다.
5. scripts/verify-curation-voice.js로 실사진 15장을 재측정하고 전후 표·금지어 검사·근거 보존 결과를 report.md에 남긴다.
6. npm test, npm run eval, npm run check, npm run lint, npm run typecheck를 실행하고 원문 로그를 보존한다.
7. Draft PR에 사람 판정·리뷰 등 미완료 게이트를 명시한다. 화면 및 schemas는 수정하지 않는다.
실행 담당은 이 워커, 사람 리뷰 책임자는 enzo이며 화면 배치는 기존 디에고 구현을 사용한다.
