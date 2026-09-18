# #27 로컬 범위 — 확정본 → 공유 매니페스트 어댑터와 공유 클라이언트

## 범위

G8 통합 인수(#27) 중 **결정적 로컬 테스트로 증명 가능한 부분**만 담는다.
live Apify·live Blob adapter·Preview·실기기·Production은 이 변경의 범위가 아니며 #27에 그대로 남는다.

- G5 확정 DTO(`ConfirmedCuration`) → G6 curation payload(`PublicShare` 공개 계약) 명시 매핑
- publish / reconfirm / rotate / revoke 클라이언트 배선

## 입력과 출력

G5 확정본은 `{ output, crops, excluded, profileSharing, profileSnapshotId? }`다.
브라우저는 프로필 identity를 만들지 않고 서명된 `profileSnapshotId`만 전송한다.
G6는 게시 서버에서 이 참조를 `resolvePublicProfile()`로 검증한 뒤 공개 DTO를 만든다.

| G6 필드 | 출처 | 근거 |
|---|---|---|
| `username` | `resolved.snapshot.handle` | 서명 참조가 가리키는 공개 계정 |
| `displayName` | 검증된 `resolved.snapshot.profile_display` | 제공자 출처가 확인된 이름만, 없으면 `null` |
| `avatarUrl` | 항상 `null` | 파이프라인에 **검증된 avatar가 없다.** 지어내지 않는다 |
| `source` | `resolved.source_url` | 서버 캐시가 검증한 공개 프로필 URL |
| `collectedAt` | `resolved.collected_at` | 서버 캐시가 검증한 수집 시각 |

`profileSharing`이 꺼져 있으면 `includeProfile: false`이고 `profileSnapshotId`와 `profile`을 내보내지 않는다.
`crops`(0~100)는 `focalPoint`(0~1)로 옮기고, `caption_state === 'omitted'` 슬롯은 캡션을 싣지 않는다.

게시 서비스는 관리 키·ETag·업로드 완결성을 먼저 확인한 뒤 참조를 해석한다. 검증된 공개 DTO만
저장하고 `profileSnapshotId`, provider 원본, receipt는 공개 curation과 manifest에 남기지 않는다.

### 기존 초안 호환 (draft-storage version 1 유지)

이전 확정본은 identity를 로컬에 복제했거나 사진이 1~2장일 수 있다. 복원 단계에서 초안 전체를
버리지 않고 확정 상태만 해제한다. 사진·순서·캡션·crop·프롬프트와 WebP revision은 유지한다.

| 시점 | 동작 |
|---|---|
| 복원 (`DraftStorage.load`) | legacy confirmation을 `null`로 내려 다시 검토·확정하게 한다 |
| 저장 (`validateCurationState`) | 새 확정본은 profile on과 `profileSnapshotId` 존재가 정확히 일치해야 한다 |
| 공유 (`toShareCuration`) | profile on인데 참조가 없으면 네트워크 전에 `INVALID_INPUT`으로 거부한다 |
| 게시 (`share-storage.publish`) | 서버 resolver가 변조·만료·이전 generation을 거부한다 |

없는 참조를 현재 편집 상태에서 채우지 않는다. 사용자가 현재 프리뷰를 다시 확정해야 한다.

## 완료 조건

- [x] 프로필 공유 off → `includeProfile: false`, `profile` 키 없음
- [x] 프로필 공유 on → 브라우저는 서명 참조만 보내고 서버가 위 표대로 매핑한다
- [x] 확정 후 프로필을 다시 연결해도 이전 확정본의 참조가 바뀌지 않는다
- [x] publish → read → reconfirm → read가 실제 G6 route·service를 통과하고 같은 링크가 최신 확정본을 보여 준다
- [x] stale ETag reconfirm은 `CONFLICT`로 거부되고 덮어쓰지 않으며, 재조회로 현재 버전을 얻는다
- [x] 회전 뒤 이전 관리 키는 `UNAUTHORIZED`, revoke 뒤 공유 조회는 실패한다
- [x] 확정본과 다른 사진 집합(개수·순서)은 **네트워크 요청 0회**로 거부된다
- [x] legacy identity/1~2장 확정본은 초안 데이터를 보존하고 재확정을 요구한다
- [x] profile DTO 주입·변조·만료 참조는 게시되지 않고 immutable object도 만들지 않는다
- [x] stale ETag는 resolver 호출 전에 `CONFLICT`로 거부된다

## 경계

- 이미지 바이트는 JSON route로 보내지 않는다(#140 계약). `PhotoUploader`는 주입하며, G8이 durable adapter를 넣는다.
- 라우트에 `service`가 없는 한 모든 실제 요청은 `503 NOT_CONFIGURED`로 닫힌다. 이 변경은 그 fail-closed를 바꾸지 않는다.
- 테스트는 `MemoryBlobStore` 기반이다. **실제 provider 일관성·공유 가능 증거가 아니다.**
- 화면 배선(#141 공개 페이지, 편집 화면의 공유 버튼)은 건드리지 않았다.
