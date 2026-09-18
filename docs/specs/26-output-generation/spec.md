# #26 출력 생성 서버

담당 diego.yoon, 협업 enzo.cho. 기준 develop e1d6624, #24·#16 인수 완료.

- Node Route Handler → 공통 readJsonRequest/validateGenerateRequest → 실제 출력/공통 프롬프트 로딩 → 기존 모델 전송 재사용 → validateGenerateResponse → JSON 응답.
- all/slot을 한 endpoint로 처리한다. 입력 분석/수집 재호출·응답 공유 캐시 없음. 슬롯 요청의 모델 입력은 지정 슬롯만 포함한다.
- lib/model.js의 기존 20초 deadline, 계정 Models 조회, 최대 1회 재시도, JSON 구조 출력을 공통 requestStructuredModel로 추출한다. 기존 analyzeWithModel은 이미지 검증/단일 이미지 wrapper를 유지한다. 실제 소비자가 두 개이므로 별도 SDK/전송 구현을 추가하지 않는다.
- 모델 설정은 기존 확인 대상 모델을 기본값으로 재사용하며 호출 시 접근을 검사한다. 실계정 접근/품질/비용은 pending, 테스트는 fake fetch만 사용한다. 키 없으면 503이고 성공으로 치환하지 않는다.
- HTTP 400/413/502/503/504와 retryable을 공통 계약으로 반환한다. raw provider/키/내부 오류는 응답에 넣지 않는다.
- Next tracing에 prompt 파일을 명시한다. 실행 시 디스크에서 읽는 내용이 모델 system에 들어갔는지 검사한다.

검증: Node fake transport의 전체/슬롯, invalid input/output, timeout, missing key, HTTP retry, JSON fail. Next route Vitest 및 로컬 HTTP. 배포 valid 요청은 유료 모델 호출을 금지한 현재 범위에서 미실행으로 남긴다. 배포에서는 invalid/oversized 요청 경계만 확인한다. 실제 두 프로필 품질·D6는 #6/#43 선행 후 별도 인수한다.

공식 wire 근거: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (2026-09-17 확인). output_config.format의 json_schema를 사용한다. 구조 검사와 사실 품질은 별도다.
