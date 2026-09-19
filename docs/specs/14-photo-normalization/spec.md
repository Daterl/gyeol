# #14 모바일 사진 선택·정규화

담당: diego.yoon (`jangwonyoon`) · 협업: enzo.cho

## 계약

- 새 큐레이션 사진은 선택 순서대로 3~15장만 받는다. 2장과 16장은 네트워크 요청 전에 거부한다.
- 브라우저가 EXIF 방향을 적용해 디코딩한 픽셀을 긴 변 최대 1440px 캔버스에 그린 뒤 `image/webp`로 다시 인코딩한다.
- 캔버스 출력만 앱 상태와 서버 요청에 사용한다. 원본 바이트와 EXIF·GPS는 서버, localStorage, IndexedDB, Blob에 저장하지 않는다.
- 정규화 결과는 장당 3MB를 넘으면 거부한다. JPEG·PNG·WebP 이외 형식과 빈 파일은 파일별 오류로 알리고, 정상 파일의 선택 순서는 유지한다.
- `photo_id`는 정규화된 `File`이 처음 선택 상태에 들어갈 때 한 번 만들고, 같은 상태 안에서 추가·삭제해도 기존 ID와 순서를 보존한다.

`validateOrderRequest`도 신규 selected photos를 최대 15장으로 제한한다. 과거 feed/schema를 읽는 일반 검증의 20장 상한은 호환을 위해 유지한다.

## UI·접근성

- 네이티브 `input[type=file][multiple]`과 MIME `accept`를 사용하며 카메라를 강제하지 않는다.
- 정규화 중 picker와 제출을 잠그고 스크린리더 상태 문구를 제공한다.
- 선택·삭제 버튼은 최소 44px이며 삭제 후 인접 삭제 버튼 또는 사진 선택 버튼으로 포커스를 옮긴다.
- 파일별 오류는 `role=alert`로 알린다.

## 자동 검증

- Vitest: 세로·가로·방향 반영 디코딩, 1440px 상한, WebP 출력, 원본 메타데이터 비전파, 지원하지 않는 형식, 선택 순서.
- Node contract: selected photos 3·15 통과, 2·16 거부. legacy response 검증은 유지.
- 전체 `test`, `test:ui`, `typecheck`, `lint`, `build`를 통과해야 한다.

2026-09-18 로컬 Chrome에서 360×800, 390×844, 430×844를 확인했다. 세 크기 모두 가로 넘침이 없고 사진 선택 버튼은 44px, 제출 버튼은 48px였다. 네이티브 picker는 `multiple`과 `accept="image/jpeg,image/png,image/webp"`를 유지한다.
