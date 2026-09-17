# 입력·생성·편집 연결 계약

D2~D6의 사진만 시작/근거 보존/편집을 연결한다. 담당 diego.yoon, 협업 enzo.cho. ADR-0005 위임 범위의 기존 제품 기술 계약 결정이다.

- 3~20장, 세션별 photo_id 유지. 실제 사진과 샘플 사진 ID를 섞지 않는다.
- 사용자 JPEG/PNG/WebP 최대 3,000,000 bytes/장, 긴 변 8192px 및 40MP. 1장씩 base64 JSON 전송, 요청 4,100,000 bytes 이하. SVG/GIF는 사용자 입력에서 제외한다.
- Vercel의 4.5MB request/response 한도 아래에서 제한한다. https://vercel.com/docs/functions/limitations (2026-09-17 확인).
- 현재 사진만 계획은 TargetProfile이 아니다. 기존 PhotoPlan을 참조하는 OrderedFeed 1.1을 정의하고 1.0은 유지한다. photo_plan_id와 target_profile_id:null로 출처를 구별한다.
- 아이덴티티는 target none/text/reference, current none/reference/posts. 알 수 없는 URL은 REFERENCE_NOT_PREPARED. 내 기존 게시물은 올릴 사진과 별도 ID이며 내 사진 1장씩의 분석/선택 캡션을 전달한다.
- generate all/slot 한 API, feed와 실제 context를 검증한다. 서버 원본 출력은 원본 position 고정, 사용자 편집 출력은 동일 ID 집합의 재정렬 허용.
- Error는 code/message/retryable, 실패를 빈 성공으로 반환하지 않는다. timeout은 504, 요청 400/413/415/422, 모델 502/503.
- fixture에 사진만/target_only/corrected/filled/omitted/user/모두 비움/재정렬/오류 포함. 유효·거부 사례를 실행한다.

API handler와 생성 제품 로직 자체는 #18/#26에서 이 검사를 호출한다. 이 계약 PR만으로 배포 실경로 또는 유료 모델 품질을 완료로 기록하지 않는다.
