# 독립 실행 리뷰

GPT-6 구현/검토 + 실제 modelUsage claude-sonnet-5. base e821361의 동일 제품 diff.

Only one `<h1>` now, in `PhotoInput`. Good — no correctness issue there.

## 검토 대상

`e821361`부터 워킹트리(스테이징 포함)까지의 diff: `src/app/globals.css`, `src/app/page.tsx`, `src/components/companion.tsx`(신규), `src/features/captions/caption-editor.tsx`, `src/features/input/photo-input.tsx`, `src/features/result/result-screen.tsx`, `src/features/sample/sample-preview.tsx`.

## 실행한 명령

- `npm test` → 186 pass / 0 fail
- `npm run eval` → 전부 통과 (EXPECTED FAIL 케이스 포함, 정상 동작)
- `npm run typecheck` → 통과
- `npm run test:ui` → 9 files / 29 tests, 전부 통과

## 발견 사항

**[Low] Companion 상태가 캡션 생성 오류에도 "recovery"로 표시됨**
`src/features/input/photo-input.tsx:119-129`에서 상단 배너의 `Companion` state는 `request.status`만 보고 `recovery`를 결정하는데, `request.status === 'error'`는 `operation: 'feed'`(사진 분석) 뿐 아니라 `operation: 'all' | 'slot'`(캡션/문장 재생성) 실패에도 true가 됩니다(`src/features/editor/store.ts:17-18`). 반면 바로 아래 `identity.current.open = true` 로직(`photo-input.tsx:32-39`)은 `operation === 'feed'`로 정확히 한정합니다. 결과적으로 캡션 재생성만 실패해도 사진 분석 자체는 성공한 상태에서 상단 캐릭터가 "복구/오류" 이미지로 바뀌어 사용자에게 불필요한 오류 인상을 줄 수 있습니다. 기능 차단은 아니며 시각적 일관성 문제입니다.
- 재현: 샘플이 아닌 실제 흐름에서 사진 3장 업로드 → 성공 → `문장 다시 제안받기` 클릭 시 API 실패 유도(mock 아님, 키 없음/타임아웃 등) → 상단 `Companion`이 `recovery`로 바뀌는지 확인.
- 제안: `request.operation === 'feed'`일 때만 `recovery`로 분기.

기타 확인한 항목(문제 없음):
- `--color-omission`은 `@theme` 블록 내부에 있어 `border-omission` 유틸리티가 정상 생성됨.
- `Companion`이 참조하는 4개 webp 파일 모두 `public/images/gyeol-character/`에 존재, 512×512 정방형이라 96×96 지정과 비율 불일치 없음.
- `page.tsx`에서 중복 `<h1>` 없음(기존 인트로 블록 제거 후 `PhotoInput` 내부 `<h1>` 하나만 남음).
- 모바일 그리드 레이아웃(`result-screen.tsx` `grid-cols-[104px_...]`) 자동 배치가 `col-span-2` 요소들과 충돌 없이 정상 동작(CSS grid auto-flow 규칙상 문제 없음, 테스트로도 확인 불가하나 마크업 검토상 안전).

## 확인하지 않은 부분

시각적 QA(320/390/1440px 브라우저 확인, 실제 업로드/오류/재시도 흐름)는 요청 범위(테스트/eval/typecheck/test:ui) 밖이라 실행하지 않았습니다. DoD 완료 여부나 모델 품질에 대한 주장은 하지 않습니다.

Low 대응: 반영하지 않음. 이 캐릭터는 분석 전용 배너가 아니라 편집 세션 전체의 장식이다. feed뿐 아니라 caption 실패/대기도 나타내는 것이 #34/#36 계약이며, 이미지에 분석 실패 문구를 굽지 않고 정확한 복구 문구는 각 HTML 영역에 남는다. 최종 lifecycle/cancel 회귀를 추가해 UI30으로 확인했다. 브라우저 QA는 아래 별도 기록.
