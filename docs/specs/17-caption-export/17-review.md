Models: claude-haiku-4-5-20251001, claude-sonnet-5

Lint 실행이 거부되었습니다. 요청된 4가지 커맨드(npm test, npm run eval, npm run test:ui, npm run typecheck)만으로 리뷰를 마무리합니다.

## 리뷰 대상
Base `8b7a3a7` → 워킹트리(스테이지 포함) 패치, 이슈 #17 (caption export) 관련 파일:
`src/copy/captions.ko.json`, `src/features/captions/{caption-editor.tsx,caption-editor.test.ts,preview-output.ts}`, `src/features/export/export.ts`, `src/features/editor/store.ts`(diff hunk만), `src/features/input/photo-input.tsx`, `src/features/result/result-screen.tsx`

## 실행한 커맨드
- `npm test` → 184 pass
- `npm run eval` → 예상된 PASS/EXPECTED FAIL 모두 정상 (모델 품질 주장 아님, "Synthetic manual bootstrap only")
- `npm run test:ui` (vitest) → 9 files / 34 tests pass
- `npm run typecheck` (`next typegen && tsc --noEmit`) → 통과

전부 그린이지만, 자동 테스트가 통과한다고 해서 아래 발견 사항이 없다는 뜻은 아닙니다.

## 발견 사항

**[Medium] 캡션 생성 실패가 사진 제출 폼의 "다시 시도하기" 라벨을 오염시킴**
`src/features/input/photo-input.tsx:150-155`
`request`(`RequestState`)는 `loadFeed`와 `generate` 양쪽에서 공유됩니다. 이번 diff는 에러 배너 노출만 `!hasResult`로 막았지만(`photo-input.tsx:168`), 제출 버튼 라벨 로직(`request.status === 'error' ? '다시 시도하기' : ...`)은 고치지 않았습니다. 재현: 사진 업로드 성공 → 결과 화면에서 "제목과 문장 제안받기" 실행 중 `generate`가 실패(예: NO_OBSERVATION, 네트워크 오류)하면 `request.status`가 `'error'`가 되어 이미 성공한 사진 제출 폼의 제출 버튼이 "다시 시도하기"로 바뀝니다. 사용자가 이를 누르면 이미 완료된 사진 분석을 불필요하게 재요청하며, 현재 상태를 잘못 설명합니다. 배너를 숨긴 것과 동일한 `hasResult` 조건을 버튼 라벨에도 적용해야 합니다.

**[Low] `downloadOutput`이 DOM에 붙지 않은 `<a>`에서 `click()` 호출**
`src/features/export/export.ts:19-28`
`anchor`를 `document.body`에 append하지 않고 `click()`을 호출합니다. 최신 Chromium/Firefox/Safari에서는 동작하지만, 일부 구형 브라우저·확장 프로그램 차단 환경에서 `download` 속성이 무시될 수 있습니다. 지원 대상 브라우저 범위를 알 수 없어 심각도는 낮게 잡았습니다.

**[Info] 검증 중복 (버그 아님)**
`store.ts`의 `generate`는 `run(input, ...)` 이후 `validateGenerateResponse(result, input)`을 다시 호출합니다. 기본 `generateOutput`(`src/lib/api.ts`)은 내부 `post()`에서 이미 같은 검증을 수행하고, 테스트에서 주입하는 `previewOutput`도 자체적으로 검증합니다. 기능상 문제는 없지만 (mock 경로 기준) 검증이 최대 2~3회 중복 실행됩니다. Defense-in-depth로 의도된 것이라면 무시 가능.

보안 이슈(XSS, 인젝션 등)는 발견되지 않았습니다 — 사용자 입력은 React controlled input과 `JSON.stringify`/텍스트 Blob으로만 처리되어 `innerHTML` 등에 노출되지 않습니다.

명시된 대로, 저는 모델 품질(caption 내용)이나 DoD 전체 완료를 주장하지 않습니다 — 위 항목은 코드 정확성/보안 관점의 발견 사항일 뿐입니다.
