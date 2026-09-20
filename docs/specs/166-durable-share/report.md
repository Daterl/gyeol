# #166 로컬 구현 보고서

구현은 공식 `@vercel/blob` 2.8.0의 private origin `get`, conditional `put`, `list`, `del`, client `upload`와 token handler를 사용한다. SDK는 server route에 Blob credential을 유지하고 브라우저에는 exact pathname·MIME·크기·만료로 제한된 token만 돌려준다.

공유 route는 이제 lazy durable service를 주입한다. Blob/secret 미설정은 503, storage outage는 세부 정보를 숨긴 503, definitive precondition failure는 G6 `CONFLICT`로 변환한다. 요청 제한은 action별 global 1개와 caller hash 첫 byte 256개로 저장 키 수를 제한한다. bucket 충돌은 허용량을 늘리지 않고 보수적으로 제한한다.

화면은 확정본 순서의 정규화 WebP만 게시한다. 공유 성공 뒤 링크 공유, 새 확정본 반영, 관리 키 교체와 공유 중지를 제공한다. 게시 시작 capability는 업로드 전에 저장하고 응답 유실 시 공개 share를 읽어 ETag를 회복한다. 키 회전은 브라우저가 만든 새 키를 요청 전에 저장하며 서버는 이미 같은 키로 회전된 retry를 성공으로 반환한다. 관리 키는 검증된 local management record에만 두고 공유 URL에 포함하지 않는다.

로컬 fake Blob과 실제 SDK 계약 모의 검사는 provider의 실제 CAS·origin visibility·callback 전달을 증명하지 않는다. Preview 환경에 `BLOB_READ_WRITE_TOKEN`, `SHARE_STORAGE_SECRET`, `CRON_SECRET`이 필요하며 profile-on 게시에는 `PROFILE_CACHE_SECRET`도 필요하다. 비밀값은 이 문서와 이슈에 기록하지 않는다.
