Model: claude-haiku-4-5-20251001, claude-sonnet-5

## 검토 결과 (base `887177c` → 워킹 트리, issue 14-final)

**대상 파일**: `src/app/page.tsx`, `src/features/input/input.ts`(신규), `src/features/input/input.test.ts`(신규), `src/features/input/photo-input.tsx`(신규), `src/features/input/photo-picker.tsx`(신규), `src/features/sample/sample-preview.tsx`

**실행한 명령** (모두 통과):
- `npm test` — 184 pass (단, `test/*.test.js`만 실행 대상이라 신규 `src/features/input/input.test.ts`는 여기 포함되지 않음 — vitest 기반이라 별도)
- `npm run eval` — 모든 E1/E2/E3/E6/E8/E9/E10/E11 invariant PASS
- `npm run test:ui` (vitest) — 7 files / 30 tests pass (신규 input.test.ts 포함)
- `npm run typecheck` — 에러 없음

## 발견 사항

**[Low] `?mock=1`가 인증 없이 공개 홈페이지 쿼리 파라미터로 노출됨** — `src/app/page.tsx:11`
`searchParams.mock === '1'`만으로 실제 사진 업로드 시 `/api/analyze?mock=1` 무모델(휴리스틱) 경로를 누구나 강제로 사용할 수 있습니다. 서버 라우트(`src/app/api/analyze/route.ts`, 이번 diff 밖)가 이 플래그를 그대로 신뢰하는 구조라면, 실제 사용자도 URL에 `?mock=1`만 붙이면 정상 분석 대신 휴리스틱 경로를 타게 됩니다. 데모/QA용 의도라면 문제없지만, 프로덕션에서 비용 우회나 결과 조작 벡터가 될 수 있으니 의도된 동작인지 확인이 필요합니다.

**[Info/중복, 버그 아님] `submitPhotos`의 이중 `identityInput` 호출** — `src/features/input/input.ts:112-122`
업로드 전 `identityInput(fields, [])`로 한 번 검증하고 반환값을 버린 뒤, 업로드 후 `identityInput(fields, previous)`를 다시 호출합니다. 현재 로직상 두 결과가 달라질 케이스는 없어 실제 버그는 아니지만, 첫 호출은 형식 검증 목적의 부작용(side-effect)만을 위한 죽은 코드에 가까워 가독성이 떨어집니다.

**보안 관련 확인된 항목 (문제 없음)**:
- `reference()` (lib/interaction.js, diff 밖) 로 인스타그램 URL을 `https` + 화이트리스트 호스트 + 자격정보 없음으로 제한 → `javascript:` 스킴 등은 테스트대로 차단됨 확인.
- 파일명·caption 등 사용자 입력은 모두 React가 자동 이스케이프하는 위치에만 렌더링, `dangerouslySetInnerHTML` 없음 → XSS 벡터 없음.
- object URL(`URL.createObjectURL`)은 제거/리셋/언마운트 시점에 모두 `revokeObjectURL` 처리되어 메모리 누수 없음.
- 업로드 파일 크기(3MB)/개수(20장)/MIME 화이트리스트 검증이 클라이언트와 서버(계약 검증) 양쪽에 있어 방어가 이중화됨.

기타 로직(addFiles 순서/브레이크, identity 상호배타 검사, 업로드 순차 처리, cancel 시그널 처리)은 첨부된 테스트와 일치하며 별도 결함을 찾지 못했습니다.

*(참고: 유료 모델 품질이나 DoD 전체 완료 여부는 확인하지 않았습니다.)*
