# #141 — 로그인 없는 공개 공유 페이지

## 범위

G7은 G6의 `GET /api/share/{shareId}`와 `GET /api/share/{shareId}/image/{photoId}`만 사용해 확정된 큐레이션을 읽기 전용으로 보여 준다. 실제 Private Blob 서비스 주입은 G8 범위다. 서비스가 아직 없거나 응답 계약이 맞지 않으면 사진·캡션·프로필을 일부라도 표시하지 않는다.

## 읽기 경계

- 브라우저는 공유 JSON을 `cache: no-store`로 요청하고 `shareId`, version, 3~15장의 고유 photo ID, caption, focal point와 profile 선택을 검증한다.
- `404 NOT_FOUND`와 `410 GONE`은 같은 콘텐츠 없는 안내로 수렴한다. 네트워크·설정·계약 오류도 공유 데이터 없이 닫힌다.
- 사진 URL은 client payload가 아닌 검증된 `shareId + photoId`로 G6 image route를 조합한다.
- route의 `shareId`가 바뀌면 이전 ready state를 즉시 숨겨 새 URL 아래에서 이전 공유가 한 프레임도 노출되지 않게 한다.
- avatar는 Instagram profile CDN만 허용하고 Next image proxy로 읽는다. 임의 HTTPS URL은 외부 요청 대신 로컬 이니셜 fallback으로 바꾼다.
- 테스트는 주입 가능한 fetcher와 결정적 on/off manifest를 사용한다. Production route에 mock query나 mock 데이터를 노출하지 않는다.

## 화면 계약

- 모바일부터 항상 3열, 1:1 썸네일 그리드를 유지하며 전체 폭은 935px을 넘지 않는다.
- 썸네일은 focal point를 반영해 채우고, 상세는 `object-contain`으로 잘리지 않은 사진과 caption을 표시한다.
- 각 썸네일은 이름이 있는 버튼이다. Enter/Space로 상세를 열고 Radix Dialog의 Escape·닫기 버튼·focus restore로 닫는다.
- 전환은 `motion-safe`에서만 적용해 reduced-motion에서는 정적으로 바뀐다.
- profile은 `includeProfile: true`이면서 전체 profile 계약이 유효할 때만 사진·표시 이름·사용자명을 표시한다. off면 일반 GYEOL 헤더만 표시한다.
- Instagram 로고·연결 버튼과 좋아요·댓글·팔로워 수는 표시하지 않는다.
- route metadata는 `index: false`, `follow: false`다.

## 인수 기준

- generic/profile manifest의 헤더 분기와 3열·935px·상세 caption이 테스트된다.
- revoked/not-found 응답 body는 읽지 않고 콘텐츠 없는 상태로 수렴한다.
- malformed/foreign manifest와 fetch 오류는 부분 렌더링 없이 실패한다.
- 관련 Vitest, typecheck, lint, production build가 통과한다.
