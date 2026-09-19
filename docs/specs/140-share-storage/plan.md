# #140 — 구현 순서

| 단계 | 구현 | 확인 |
|---|---|---|
| 1 | Blob-like 조건부 저장소와 오류 계약 | store CAS 테스트 |
| 2 | receipt, replay marker, upload session 경계 | 위변조·만료·replay·WebP/hash/size 테스트 |
| 3 | immutable version과 current manifest publish | 새 공유·갱신·stale ETag 테스트 |
| 4 | share/image 조회와 프로필 off | 객체 격리·PII omission 테스트 |
| 5 | 관리 키 회전, revoke, cleanup | 이전 키 거부·tombstone·24시간 테스트 |
| 6 | Next route adapter | `no-store`, method, `NOT_CONFIGURED` 테스트 |
| 7 | 전체 회귀 확인과 커밋 | test/check/lint/typecheck/build |

G8은 Private Vercel Blob의 일관 읽기, ETag 조건부 쓰기, client-upload token 제한, durable rate limit, 일일 cleanup 실행을 이 계약에 연결한다. 이 변경은 임시 in-memory 저장소를 Production에 활성화하지 않는다.
