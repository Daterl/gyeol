# #166 — durable 공유 저장과 게시 화면

## 목표

ADR-0008의 `큐레이션 확정 → 공유 링크`를 실제 Private Vercel Blob 경로에 연결한다. 기존 G6 저장 계약과 G7 공개 페이지 URL은 유지한다. 이 변경은 Production 배포나 실제 Blob 인수 완료를 주장하지 않는다.

## 계약

- 서버는 `BLOB_READ_WRITE_TOKEN`과 독립된 32자 이상 `SHARE_STORAGE_SECRET`이 모두 있을 때만 공유 서비스를 구성한다. 미설정이면 실제 route는 `503`으로 실패한다.
- manifest, 버전별 WebP·curation, upload-session marker, 임시 업로드, 요청 제한 레코드만 strict allowlist pathname에 저장한다. private origin read, create-if-absent, ETag `ifMatch`, paginated list와 idempotent delete를 사용한다.
- 브라우저는 `@vercel/blob/client`로 WebP 한 장씩 Private Blob에 직접 올린다. 서버가 영수증·upload token·photo ID·현재 share 상태·정확한 임시 pathname을 확인한 뒤 `image/webp`, 4MiB, 영수증 만료, suffix·overwrite 금지 토큰을 발급한다.
- 게시 서버는 provider 업로드 결과를 신뢰하지 않고 private origin에서 모든 파일을 다시 읽어 RIFF/WEBP signature, MIME, 크기, receipt SHA-256을 확인한 뒤 manifest를 조건부 게시한다.
- start, session, upload-token, publish와 manage는 Private Blob의 고정 global/caller bucket으로 시간당 제한한다. 일일 인증 cron은 24시간이 지난 temp·receipt·orphan version을 기존 G6 정책대로 정리한다.
- 확정 화면은 게시, 같은 링크 재확정, Web Share/clipboard, 관리 키 회전, 비활성화를 제공한다. 게시 시작과 새 회전 키를 네트워크 요청 전에 exact management record로 localStorage에 저장한다. 응답 유실 시 share read 또는 같은 새 키 회전 재시도로 복구하며 서버·공유 URL·로그에는 관리 키 원문을 넣지 않는다.
- 프로필 포함은 브라우저 identity DTO가 아니라 확정본의 서명된 `profileSnapshotId`만 전송하고 서버가 `resolvePublicProfile`로 다시 확인하는 기존 계약을 유지한다.

## 완료 조건

- [x] unit/integration test에서 strict pathname, private origin read, CAS conflict, pagination과 durable rate limit이 재현된다.
- [x] upload token은 다른 pathname·photo, 만료 receipt, 잘못된 capability를 거부하고 제한 옵션을 고정한다.
- [x] Production route가 durable service를 주입하고 설정 누락 시 fail-closed 한다.
- [x] 확정 화면에서 publish, 링크 공유, reconfirm, rotate, revoke를 실행할 수 있고 publishing/active/rotating 관리 레코드를 복원한다.
- [x] cleanup은 `CRON_SECRET`을 저장소 접근 전에 확인하고 schedule에 등록된다.
- [ ] 같은 결과 커밋의 Preview에서 실제 Blob publish/read/reconfirm/CAS/rotate/revoke/delete와 다른 브라우저 조회를 확인한다.

마지막 항목은 #166과 통합 인수 #27에 pending으로 남긴다. mock과 로컬 빌드는 live Blob 증거를 대신하지 않는다.
