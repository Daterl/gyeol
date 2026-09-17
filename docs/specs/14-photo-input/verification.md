# #14 검증 / 2026-09-17

담당 diego.yoon, 협업 enzo.cho. 기준 develop 887177c. GPT-6 구현 + Claude Sonnet 5 독립 리뷰. main/Production 변경·제품 유료 모델 호출 없음.

- PASS: Node 184, UI 30, eval/check/typecheck/build. Biome 포맷 2건 수정 후 lint 재실행 PASS.
- PASS: 실제 Chrome 기본 파일 선택 창으로 JPEG 3장 → 썸네일 → 1장 삭제 → 2장 진행 차단. 삭제 후 다음 삭제 버튼 포커스.
- PASS: 다시 3장 → 빈 아이덴티티 → localhost:8354/?mock=1 실제 업로드 → 3장 응답, 결과 제목 포커스. local-success.png.
- PASS: 준비되지 않은 인스타 계정 → 설명 오류, 사진 유지 → URL 비움 → 재시도 성공.
- PASS: 초기화 → 0장 및 사진 고르기 포커스. 21개 파일 선택 → 20장 보존·초과 안내 → 실제 20장 업로드·20슬롯 응답.
- PASS: 320/390/1440px 읽기 전용 DOM 측정에서 가로 넘침 없음. 390px 버튼 44/48px, mobile-390.png.
- PASS: 미지원/빈/3MB 초과 파일, 취소·늦은 응답·URL 해제는 실행 가능한 input/store 테스트로 검증. UI 전송 고지 및 선택 아이덴티티, 캡션 완성률 UI 없음.
- 실제 파일 드래그·느린 네트워크 중 취소의 수동 브라우저 재현은 #27 통합 QA에 남김. 파일 선택 경로와 공유 검증 함수는 통과.

리뷰 수정: 기존 게시물 21장 직접 submitPhotos 호출 시 사전 차단 누락 재현(수정 전 NETWORK 실패/수정 후 INVALID_SELECTION·fetch 0회 PASS). 업로드 이전/이후 identity 검증은 서로 다른 단계라 유지, URL+기존사진 충돌은 분석 전에 확인한다. mock 모드는 제품 요구이며 배너로 모델 미사용을 명시한다.

배포 환경 확인은 PR Preview 이후 추가한다. 실제 모델 품질은 이 이슈의 증거에 포함하지 않는다.
