Models: claude-haiku-4-5-20251001, claude-sonnet-5

## 검토 결과

**대상 파일**: `src/features/captions/*`, `src/features/editor/store.ts`, `src/features/export/export.ts`, `src/features/input/photo-input.tsx`, `src/features/result/result-screen.tsx`, `src/copy/captions.ko.json` (base `8b7a3a7` → 워킹 트리)

**실행한 명령**: `npm test`(node --test, 184 pass) / `npm run eval`(설계된 PASS/EXPECTED FAIL 그대로 통과) / `npm run test:ui`(vitest, 35 pass) / `npm run typecheck`(clean) — 전부 통과.

### 지적 사항 (blocking 이슈 없음)

1. **[Low] 다운로드 로직 미검증** — `src/features/export/export.ts`의 `downloadOutput`(DOM 조작: `document.createElement`, `URL.createObjectURL`)은 어떤 테스트에서도 실행되지 않습니다. `vitest.config.ts:7`가 `environment: 'node'`라 `document`가 없고, `caption-editor.test.ts`는 `renderToStaticMarkup`으로만 마크업을 확인할 뿐 버튼 클릭을 시뮬레이션하지 않습니다(`exportText`만 간접 검증됨). "JSON 받기/텍스트 받기" 버튼의 실제 다운로드 동작은 수동 확인이 필요합니다.

2. **[Low] 중복 검증** — `src/features/editor/store.ts:165-167`에서 `run(input, controller.signal)` 호출 결과에 대해 `validateGenerateResponse`를 다시 호출하지만, 기본 `run`(`generateOutput`, `src/lib/api.ts:198`)과 `previewOutput`(`preview-output.ts` 내부) 모두 이미 자체적으로 같은 검증을 수행합니다. 버그는 아니나 불필요한 이중 검증입니다.

3. **[Info] 미리보기가 실제 `/api/generate` 경로를 전혀 타지 않음** — `analyzePhoto`/`orderPhotos`는 `mock=1` 쿼리로 서버 라우트를 그대로 통과하지만, 캡션 미리보기(`previewOutput`)는 네트워크 호출 자체를 대체(`generate(id, mock ? previewOutput : undefined)`)하여 `/api/generate` 라우트(`src/app/api/generate/route.ts`)를 전혀 거치지 않습니다. `output-generation.js`에는 mock 분기도 없습니다. 공격 표면 문제는 아니지만(플래그는 서버 컴포넌트 `searchParams`로만 전달되는 기존 패턴과 동일), mock QA가 실제 API 계약을 검증하지 못한다는 점은 인지하고 있어야 합니다.

4. **[Nit] i18n 불일치** — `caption-editor.tsx`에서 "직접 비움" 라벨은 `captions.ko.json`을 쓰지 않고 하드코딩되어 있어, 나머지 3개 상태 라벨과 관리 방식이 다릅니다.

### 결론
자동화 검사(4종)는 모두 통과했으며, 로직(store 병합, 검증 스키마, 버튼 상태 분기)도 교차 확인한 결과 치명적 정확성/보안 결함은 발견되지 않았습니다. 다만 다운로드 버튼의 실제 브라우저 동작은 테스트로 커버되지 않으므로 수동 확인을 권장합니다. 유료 모델 품질이나 DoD 완료 여부는 평가하지 않았습니다.
