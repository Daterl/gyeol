# 출력 프롬프트 자체 검토

담당 diego.yoon, 협업 enzo.cho. 세 프롬프트는 공통 style_guard 한 파일을 참조한다. 기존 금지어/최상급 규칙을 완화하지 않았다.

- PASS: 타이틀 정확히 한 문자열·한 줄, all/slot envelope, filled/omitted 구분 및 user 상태 서버 생성 금지.
- PASS: 사진만/target_only/corrected/단일 슬롯의 수동 합성 예시. filled는 각 슬롯 describable_facts의 실제 문자열을 선택했고 omitted는 해당 overlap 근거를 인용한다.
- PASS: 수동 예시에서 공통 금지어·단정 표현 0건, 기존 validateExport와 ID/position 대조 통과.
- #24 기술 계약 초안을 입력으로 작성했으며 실제 서버의 파일 로딩은 #26에서 구현한다. 이 문서와 수동 예시는 실모델 생성 품질 증거가 아니다.
- 검증 명령: node --test test/output-prompts.test.js. 2 PASS.

최종 검증: #24 인수 abd5488 반영, Node173/UI14/eval/check/lint/typecheck/build PASS. 초기 리뷰에서 photo-only 예시 입력의 실제 대조가 없음을 발견해, 공통 feed 복제본을 삭제하고 각 예시가 fixtures/interaction.sample.json의 해당 feed/context를 직접 참조하도록 수정했다. 강화 검사 before 1 FAIL → after 2 PASS.

Codex GPT-6 자체 검토 + Claude Sonnet5 동일 diff 독립 npm test/eval(173 PASS). 최종 correctness/security finding 0. fixture 최상위가 target_only이고 모든 예시가 같은 합성 사진 3장을 사용하는 것은 명시된 테스트 구성이다. 추가 omit 규칙별 실모델 검증은 #26의 품질 검토 범위다. 사용자 상태는 서버 생성 금지이며 #24에 별도 편집 fixture가 있다.
