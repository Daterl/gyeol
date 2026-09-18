# #141 — 구현·검증 보고

## 결과

- `/share/[shareId]`는 로그인 없이 열리고 브라우저에서 G6 share/image route를 `no-store`로 소비한다.
- G6 응답을 검증한 뒤에만 사진·caption·profile을 렌더링한다. `404`, `410`, 계약 위반, 설정/네트워크 오류에서는 공유 콘텐츠를 전혀 전달하지 않는다.
- profile off는 GYEOL 일반 헤더, on은 사진·표시 이름·사용자명만 표시한다. profile source는 링크나 화면 텍스트로 노출하지 않는다.
- route 전환 시 state의 shareId가 다르면 이전 ready 화면을 즉시 loading으로 대체한다. avatar는 허용된 profile CDN만 Next image proxy로 가져오며 임의 외부 URL은 이니셜 fallback으로 바꾼다.
- 썸네일은 모바일부터 3열 1:1이고 컨테이너 최대 폭은 935px이다. 상세는 사진을 자르지 않고 caption을 함께 보여 준다.
- 썸네일 버튼은 Enter/Space로 열리고 Escape·닫기 버튼으로 닫힌다. 닫힌 뒤 실제로 열었던 버튼으로 초점이 돌아간다.
- metadata에서 `noindex, nofollow`를 출력하고 reduced-motion에서는 전환·확대 효과를 제거한다.

## 결정적 브라우저 증거

실제 Blob adapter를 Production 코드에 임시 연결하지 않았다. Playwright에서만 G6 JSON/image route를 결정적으로 intercept해 같은 화면 계약을 검증했다.

- [390px 3열](mobile-390.png)
- [390px 원본 비율 상세와 caption](detail-390.png)
- [935px 최대 폭](desktop-935.png)

접근성 snapshot에서 3개 썸네일이 모두 이름 있는 button으로 노출됐다. 첫 버튼에 키보드 Enter를 보내 dialog가 열리고, Escape 후 같은 첫 버튼이 active element로 복원되는 것을 확인했다. profile on snapshot에는 `Diego`, `@diego.public`만 나타났고, 410 fixture에서는 안내 heading 외 사진·caption·profile이 없었다. 브라우저 metadata는 `noindex, nofollow`였다.

## 자동 검증

- `npm run test:ui`: 17 files, 67 tests PASS
- `npm test`: 349 tests PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS, `/share/[shareId]` dynamic route 생성
- `git diff --check`: PASS

## G8 인계

현재 G6 route는 service가 없으면 의도대로 `503 NOT_CONFIGURED`다. G8은 route에 Private Blob service를 주입하고 동일한 URL·JSON 계약을 유지해야 한다. G7에는 mock query나 Production mock manifest가 없다.
