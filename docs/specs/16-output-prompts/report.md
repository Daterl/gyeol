# 출력 프롬프트 자체 검토

담당 diego.yoon, 협업 enzo.cho. 세 프롬프트는 공통 style_guard 한 파일을 참조한다. 기존 금지어/최상급 규칙을 완화하지 않았다.

- PASS: 타이틀 정확히 한 문자열·한 줄, all/slot envelope, filled/omitted 구분 및 user 상태 서버 생성 금지.
- PASS: 사진만/target_only/corrected/단일 슬롯의 수동 합성 예시. filled는 각 슬롯 describable_facts의 실제 문자열을 선택했고 omitted는 해당 overlap 근거를 인용한다.
- PASS: 수동 예시에서 공통 금지어·단정 표현 0건, 기존 validateExport와 ID/position 대조 통과.
- #24 기술 계약 초안을 입력으로 작성했으며 실제 서버의 파일 로딩은 #26에서 구현한다. 이 문서와 수동 예시는 실모델 생성 품질 증거가 아니다.
- 검증 명령: node --test test/output-prompts.test.js. 2 PASS.
