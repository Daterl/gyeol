# #140 — 공유 저장·관리 키 계약

## 범위

G6는 확정된 큐레이션을 안전하게 저장·조회·갱신·비활성화하는 코어를 만든다. UI와 실제 Vercel Blob 연결은 각각 G5와 G8 범위다. `@vercel/blob`이 아직 없으므로 이 변경의 Next route는 저장소가 설정되지 않은 상태에서 `503 NOT_CONFIGURED`로 실패를 닫는다.

## 저장 구조

- `shares/{shareId}/versions/{version}/...`: 사진과 `curation.json` 불변 객체
- `shares/{shareId}/manifest.json`: active current version 또는 PII 없는 revoked tombstone
- `share-receipts/{receiptHash}.json`: 조건부 생성하는 durable upload-session marker
- `temp/{shareId}/{version}/{sessionId}/...`: 24시간 뒤 정리할 중단 업로드

`MemoryBlobStore`는 `get`, `put(ifMatch|ifNoneMatch)`, `list`, `delete` 계약의 결정적 검증 구현이다. G8 Private Blob adapter도 동일한 조건부 쓰기와 일관 읽기를 보장해야 한다.

## 보안 경계

- share ID는 CSPRNG 128bit, 관리 키는 256bit다. 서버에는 관리 키 SHA-256만 남긴다.
- HMAC-SHA256 receipt는 share/version/정렬 photo ID·SHA-256/관리 키 hash/발급·만료 시각을 묶으며 수명은 최대 10분이다.
- 같은 receipt는 조건부 marker 생성으로 같은 session ID와 upload token을 반환한다.
- 세션은 최대 15장, `image/webp`, 파일당 4MiB, 전체 60MiB, 지정 photo ID·hash·prefix에 묶인다. 파일별 상한 × 최대 장수가 전체 상한을 넘지 않아 병렬 업로드도 총량을 초과할 수 없다. MIME 문자열뿐 아니라 RIFF/WEBP signature도 확인한다.
- publish는 receipt, upload token, 관리 키, 모든 예상 객체의 RIFF/WEBP signature·타입·크기·hash가 맞아야 한다. manifest 쓰기는 첫 버전 `ifNoneMatch`, 갱신 `ifMatch` CAS다.
- 공유·이미지 응답은 `no-store`다. 이미지 조회는 `shareId + photoId`만 받고 active manifest의 current version pathname을 서버가 결정한다.
- 프로필 포함 기본값은 off다. off 상태에서 profile 입력을 거부하고 manifest·curation에 PII를 저장하지 않는다.
- revoke는 먼저 PII 없는 tombstone을 CAS로 쓴 다음 version/temp 객체를 삭제한다. 관리 키 회전이 성공하면 이전 키는 즉시 실패한다.
- active 공유는 자동 만료하지 않는다. 이전 version은 새 manifest가 게시되는 즉시 접근 경로에서 빠지고 24시간 cleanup에서 삭제한다. 이 유예는 이미 이전 manifest를 읽은 요청과 삭제가 충돌하는 것을 막는다. 중단 temp·receipt marker·orphan version도 24시간 뒤 정리한다.

## HTTP 계약

- `POST /api/share-upload`: `start | update | session | publish`
- `GET /api/share/{shareId}`: current confirmed curation
- `GET /api/share/{shareId}/image/{photoId}`: current confirmed WebP
- `POST /api/manage/{shareId}`: `rotate | revoke`

JSON body는 64KiB로 제한한다. 이미지 바이트는 이 Function route로 받지 않으며 G8 client upload adapter가 session 제한을 provider token에 옮긴다. 시작·세션 발급·publish·관리 요청은 주입한 rate limiter를 사용한다.

## 인수 기준

- receipt 위변조·만료·replay, foreign ID·MIME spoof·hash·크기 경계가 실패한다.
- 3장 publish와 current read가 성공하며 stale ETag는 덮어쓰지 않는다.
- 새 version 게시 후 이전 version을 읽을 수 없고 foreign photo ID도 실패한다.
- profile off PII omission, key rotation, tombstone-first revoke, 24시간 cleanup이 재현된다.
- live Blob adapter가 없을 때 모든 실제 route는 캐시 없이 `503`으로 실패한다.
