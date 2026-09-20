# #207 모델 API 접근·예산 계약

- 유료 provider가 켜진 `/api/analyze`, `/api/generate`는 기존 signed browser session cookie와 CSRF를 요구한다. 브라우저 클라이언트는 같은 `/api/profile/session`을 재사용한다.
- 유효한 본문이 실제 provider 경로로 갈 때만 Private Blob CAS 카운터의 full signed-session key와 공용 global 시간당 예산을 소비한다. 프로필 연결의 256 bucket 제한은 모델 예산에 사용하지 않는다. 첫 배포값은 session/global `40/600`이다. 40은 15장 각각의 브라우저 재시도 1회, 최초 생성 1회, 편집 생성 8회를 포함한다. 휴리스틱·캐시 적중·잘못된 본문은 예산을 소비하지 않는다.
- 인증 실패, 잘못된 예산 설정, Blob 장애·경합 실패, 예산 소진은 provider 호출 0회로 실패 폐쇄한다.
- 비브라우저 운영 검증은 별도 `GYEOL_MODEL_API_ACCESS_KEY`만 허용한다. 브라우저 헤더와 bearer를 섞지 않는다.
- `GYEOL_MODEL_PROVIDER_ENABLED=1`은 capability, Blob, 예산 변수를 먼저 설정한 뒤 마지막에 켠다.
