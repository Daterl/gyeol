# #139 선택 프롬프트와 로컬 초안 복구

## 계약

- 편집 메타데이터는 `localStorage`의 `gyeol.editor.draft.v1` 한 항목에 저장한다. 내용은 공개 프로필 참조, 프롬프트, 사진 ID·순서, 피드와 편집 결과뿐이며 이미지 바이트·data URL·blob URL은 포함하지 않는다.
- G2가 만든 `image/webp` Blob 3~15개는 IndexedDB `gyeol-editor/drafts`에 저장한다. 원본 JPEG·PNG와 정규화 전 파일은 저장하지 않는다.
- 두 저장소는 같은 임의 revision을 가진다. revision, 사진 ID 집합, WebP 타입 또는 런타임 계약이 다르면 부분 복구하지 않고 두 저장소를 지운다.
- 사진 집합이 같을 때 프롬프트·순서·편집 내용은 localStorage에 즉시 갱신하고 IndexedDB의 WebP를 다시 쓰지 않는다. 사진 집합이 바뀔 때만 새 revision으로 두 저장소를 커밋한다.
- 새 revision 커밋이 실패하면 직전 메타데이터와 WebP를 복원한다. 복구가 진행되는 동안 입력을 잠그고, 초기화·화면 이탈이 먼저 일어나면 늦은 복구 결과를 버린다.
- `restoreDraft()`는 WebP를 `File`과 object URL로 복원하고 기존 Zustand editor store에 주입한다. `clearDraft()`는 메모리와 두 저장소를 함께 초기화한다.
- 로드 경로에서만 과거 큐레이션 확인본(1~2장, optional `collected_at`을 포함한 snake_case 공개 프로필, camelCase 공개 프로필 + `confirmedProfileSource`)을 식별해 확인본과 복제 identity/provenance만 제거한다. 나머지 메타데이터와 같은 revision의 WebP는 복구하며, 다음 자동 저장은 profile-on일 때 서명된 `profileSnapshotId`만 허용하는 현재 엄격한 스키마로 정착한다. 그 밖의 손상은 기존대로 두 저장소를 삭제한다.

## G2/UI 인계

G2가 WebP 정규화를 마치면 `store.getState().persistDraft(webpByPhotoId)`를 호출한다. 편집 화면 마운트 시 한 번 `restoreDraft()`를 호출하고, 사용자의 명시적 새로 시작하기 동작은 `reset()` 대신 `clearDraft()`를 기다린다. 프롬프트·프로필 입력은 각각 `setPrompt`, `setProfileReference`로 연결한다.

## 확인

- 15장 선택 허용, 16장 거부
- 메타데이터 문자열에 이미지 바이트·data URL·blob URL이 없음
- 같은 사진 ID·순서·프롬프트·프로필 참조와 WebP 복구
- localStorage 손상 또는 IndexedDB revision 불일치 시 양쪽 초기화
- 비 WebP 거부와 명시적 양쪽 삭제
