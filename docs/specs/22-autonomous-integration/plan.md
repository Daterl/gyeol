# Develop 통합·위임 실행 Implementation Plan

> **For agentic workers:** writing-plans의 단계별 실행·검토를 따르되, 사용자 AGENTS의 도구 매핑에 따라 현재 세션에서 순차 실행한다. 미설치 superpowers 실행 스킬을 실행했다고 기록하지 않는다.

**Goal:** 기존 BE 변경을 보존해 develop으로 통합하고, 위임 범위의 기능·디자인을 검증 증거와 함께 순차 인수한다.

**Architecture:** 기존 schemas/lib와 Next Route Handlers를 재사용한다. 기술 계약 → 편집 세션 → 입력/결과/캡션 → 출력 서버·샘플 → UI 검증 순서다. 디자인은 별도 파일에서 정적 방향을 확정하고 이미지 에셋으로 적용한다.

**Tech Stack:** Next.js, React, TypeScript, Zustand, Tailwind/tv, shadcn/ui, Biome, Node tests, Vitest.

## 1. 기존 브랜치 통합
- [x] 기준 origin/develop 9627d77, origin/dev 40dbe3d를 별도 worktree에서 이력 보존 merge.
- [x] CLAUDE의 dev/develop 충돌 지침 정리·ADR-0005 위임 기록.
- [x] npm ci → test/eval/check/test:ui/lint/typecheck/build 실제 실행, 출력 보존.
- [ ] 통합 diff 검토, PR develop 생성, 근거 기록 후 merge commit으로 인수.
- [ ] 기존 dev 기반 PR #44/#45를 develop으로 재지정하고 변경별 검증·리뷰 확인.

## 2. 다음 실행 단위 (각각 spec/plan·PR로 분리)
- [ ] #24: schemas/interaction.md·fixtures·계약 검사. 잘못된 업로드/응답·재정렬 export 거부/허용을 확인.
- [ ] #25: src/features/editor/store.ts·src/lib/api.ts·src/types/contracts.ts. 늦은 응답·reset·편집 보존 검사.
- [ ] #34: docs/design/ui-review.md·mockups. 사진 중심 재설계와 모바일/키보드 증거.
- [ ] #14 → #15 → #17: input/result/captions/export. 사진 3/20장 경계·실패 복구·순서/근거·비움·편집·내보내기.
- [ ] #16 → #26: prompts/output·generate Route Handler·lib/output-generation.js. fake-provider 성공/오류/timeout, 유료 호출 없음.
- [ ] #19·#18·#27: 샘플 및 준비된 실경로 연결·브라우저 검증. 키 없는 실모델 검증은 pending.
- [ ] #35 → #36 → #37: 최종 이미지·정적 적용·후속 Motion. 이미지만 사용하고 reduced-motion 검증.

파일 범위·구현 코드·구체 검사는 각 leaf를 시작할 때 실제 선행 코드를 읽고 별도 spec에 고정한다. 기존 사용자 미커밋 변경은 유지하며 main에 merge하지 않는다.
