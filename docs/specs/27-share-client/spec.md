# #27 로컬 범위 — 확정본 → 공유 매니페스트 어댑터와 공유 클라이언트

## 범위

G8 통합 인수(#27) 중 **결정적 로컬 테스트로 증명 가능한 부분**만 담는다.
live Apify·live Blob adapter·Preview·실기기·Production은 이 변경의 범위가 아니며 #27에 그대로 남는다.

- G5 확정 DTO(`ConfirmedCuration`) → G6 curation payload(`PublicShare` 공개 계약) 명시 매핑
- publish / reconfirm / rotate / revoke 클라이언트 배선

## 입력과 출력

G5 확정본은 `{ output, crops, excluded, profileSharing, profile? }`이고,
`profile`은 `{ source_url, username, collected_at, display_name? }`다.
G6 curation은 `{ photos, includeProfile, profile? }`이고
`profile`은 `{ username, displayName, avatarUrl, source, collectedAt }`다.

| G6 필드 | 출처 | 근거 |
|---|---|---|
| `username` | `confirmed.profile.username` | 확정 시점에 고정된 공개 계정 |
| `displayName` | `confirmed.profile.display_name ?? null` | 검증된 공개 표시 이름만, 없으면 `null` |
| `avatarUrl` | 항상 `null` | 파이프라인에 **검증된 avatar가 없다.** 지어내지 않는다 |
| `source` | `confirmed.profile.source_url` | 확정본에 묶인 공개 프로필 URL |
| `collectedAt` | `confirmed.profile.collected_at` | **확정본에 바인딩된 수집 시각.** 현재 편집 상태를 읽지 않는다 |

`profileSharing`이 꺼져 있으면 `includeProfile: false`이고 `profile` 키 자체를 내보내지 않는다.
`crops`(0~100)는 `focalPoint`(0~1)로 옮기고, `caption_state === 'omitted'` 슬롯은 캡션을 싣지 않는다.

`collected_at`은 이번 변경에서 확정본에 새로 **바인딩**한다. 확정 이후 프로필을 다시 연결하면
`curation.profile.collected_at`이 바뀌는데, 이전 확정본이 그 새 값을 가져가면 공개 페이지가
실제로 수집하지 않은 시각을 표시하게 된다. 확정 시점에 얼려 두는 것이 유일하게 정직한 출처다.
내부 메타데이터(`snapshot_id` · `expires_at` · `evidence_refs` · receipt)는 여전히 확정본에 넣지 않는다.

### 기존 초안 호환 (draft-storage version 1 유지)

`collected_at`은 이 변경에서 **새로 생긴 필드**이고 IndexedDB 스키마 버전은 1 그대로다.
따라서 이 변경 이전에 저장된 확정본에는 이 필드가 없다. 복원 단계에서 필수로 요구하면
그런 초안이 통째로 버려지므로(#139·#159가 세운 초안 복원 보장 위반), 다음처럼 가른다.

| 시점 | 동작 |
|---|---|
| 복원 (`validateCurationState`) | `collected_at` **없어도 통과**. 있으면 완전한 ISO instant여야 한다 |
| 공유 (`toShareCuration`) | 프로필 공유 on인데 없으면 `INVALID_INPUT`으로 **거부**. 다시 확정해야 한다 |
| 프로필 공유 off | `collected_at`이 필요 없으므로 기존 초안도 그대로 공유된다 |

없는 값을 현재 편집 상태의 `collected_at`으로 **채우지 않는다.** 그게 이 어댑터가 막으려는 바로 그 동작이다.

수집 시각은 날짜만으로는 부족하므로 `YYYY-MM-DDThh:mm(:ss(.sss))?(Z|±hh:mm)` 형태의
완전한 instant만 통과시킨다(`isCollectedAtInstant`).

## 완료 조건

- [x] 프로필 공유 off → `includeProfile: false`, `profile` 키 없음
- [x] 프로필 공유 on → 위 표대로 매핑되고 `avatarUrl`은 `null`
- [x] 확정 후 프로필을 다시 연결해도 **이전 확정본의 `collectedAt`이 바뀌지 않는다**
- [x] publish → read → reconfirm → read가 실제 G6 route·service를 통과하고 같은 링크가 최신 확정본을 보여 준다
- [x] stale ETag reconfirm은 `CONFLICT`로 거부되고 덮어쓰지 않으며, 재조회로 현재 버전을 얻는다
- [x] 회전 뒤 이전 관리 키는 `UNAUTHORIZED`, revoke 뒤 공유 조회는 실패한다
- [x] 확정본과 다른 사진 집합(개수·순서)은 **네트워크 요청 0회**로 거부된다
- [x] `collected_at`이 없는 기존 확정본도 복원된다. 프로필 공유 on이면 **네트워크 요청 0회**로 거부하고, off면 그대로 공유된다
- [x] 날짜만 있는 값(`2026-09-18`)은 확정본에서 거부된다

## 경계

- 이미지 바이트는 JSON route로 보내지 않는다(#140 계약). `PhotoUploader`는 주입하며, G8이 durable adapter를 넣는다.
- 라우트에 `service`가 없는 한 모든 실제 요청은 `503 NOT_CONFIGURED`로 닫힌다. 이 변경은 그 fail-closed를 바꾸지 않는다.
- 테스트는 `MemoryBlobStore` 기반이다. **실제 provider 일관성·공유 가능 증거가 아니다.**
- 화면 배선(#141 공개 페이지, 편집 화면의 공유 버튼)은 건드리지 않았다.
