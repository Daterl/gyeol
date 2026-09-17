# #18 HTTP 연결부 부분 구현

담당 diego.yoon / 협업 enzo.cho. 기준 develop 0ef1daf. 전체 이슈의 live 15장·D6 인수와 분리해, #14 화면이 호출할 수 있는 analyze/feed Node 어댑터를 먼저 연결한다. 모델 키 없이도 실제 픽셀 heuristic 경로는 가능하고, ?mock=1은 실제 사용자 사진을 synthetic 분석으로 치환하지 않고 모델을 끈다.

- analyze: #24 readUploadRequest → 기존 analyzePhoto → 요청 ID/file/index 보존 및 실행 출처 헤더. Node runtime, no-store, 실제 한도/오류 schema.
- feed POST: #24 입력 검사 → 준비된 ref 정확 조회/원문 텍스트/현재 게시물/없음 → target/profile/PhotoPlan → 원본 ID를 보존한 feed/context. GET synthetic 계약은 유지한다.
- #41 진행 중인 order.js는 수정하지 않는다. PhotoPlan 또는 heuristic 입력은 선택 순서를 그대로 유지하고 그 사실을 rationale에 명시한다. 실제 모델 관측과 TargetProfile이 있는 경로만 composeFeed를 사용한다. 임시 ceiling과 #41 이후 개선 조건을 코드에 남긴다.
- 실제 관측 없이 고정된 heuristic composition/scale을 Profile의 관측으로 승격하는 문제는 공통 planFromPhotos/buildCurrentProfile에서 차단한다. fixture 먼저 회귀 재현 → 공통 함수 수정, 허위 개인화는 만들지 않는다.
- lib/model.js/생성 API는 #26 그대로, 실제 유료 호출 0. 배포 함수 보호는 유지한다. 새로운 error 계약/DB/스토리지/라이브 수집은 추가하지 않는다.

검증: 실제 합성 JPEG/PNG를 HTTP 업로드해 동일 ID/픽셀 분석 → 3/20장 feed와 photo-only/target/corrected 경로를 통과한다. unknown ref/잘못된 bytes/잘못된 feed/크기/선택 범위는 오류다. Vitest 어댑터·Node 계약·기존 tests/eval·빌드 검증. Live 모델/15장 실사 화면은 #18 OPEN 상태로 유지한다.

검사 중 PNG/WebP가 키 없이 처리되지 않는 기존 천장을 확인했다. 이미 설치한 sharp로 최대 512px JPEG 측정용 사본을 만들고 기존 JPEG DC 측정을 재사용한다. 사용자 원본 파일은 수정하지 않고, model/source 및 describable_facts에 축소·변환 근사값/흰 배경 합성 여부를 표시한다. 애니메이션/잘못된 형식은 거부한다. #41 order.js를 수정하거나 JPEG decoder를 새로 구현하지 않는다.
