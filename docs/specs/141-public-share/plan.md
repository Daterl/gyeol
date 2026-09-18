# #141 — 구현 순서

| 단계 | 구현 | 확인 |
|---|---|---|
| 1 | G6 응답 validator와 주입 가능한 no-store loader | on/off·404·410·malformed 테스트 |
| 2 | profile 조건부 헤더와 모바일 3열 그리드 | PII omission·3열·935px 테스트 |
| 3 | 원본 비율 상세와 caption dialog | 버튼 이름·상세·닫기·reduced-motion 계약 |
| 4 | 동적 route와 noindex metadata | route metadata 테스트 |
| 5 | 전체 검증과 독립 리뷰 | test·typecheck·lint·build |

G8은 G6 route에 실제 Private Blob service를 주입한다. G7 loader와 화면은 해당 연결을 바꾸지 않고 사용한다.
