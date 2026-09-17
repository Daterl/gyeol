# #23 Next.js 실행 기반

- 담당: diego.yoon. 입력/mock 리뷰 협업: enzo.cho.
- 목적: intent D1 공개 실행 환경과 D2 샘플 경로의 기반. 제품 입력·편집·생성은 #14~#17·#25·#26에서 구현한다.
- 기준: main `32eff4f` (PR #21). 브랜치 `feat/23-nextjs-foundation`.
- 크기: M. 기존 HTTP 계약·스키마는 바꾸지 않는다.

## 범위

Next.js App Router, React, TypeScript strict, Tailwind v4/PostCSS, shadcn/ui(Radix Nova·Button), tv, Zustand 설치와 lockfile. Server Component 페이지에 작은 샘플 Client Component를 둔다. Zustand 제품 store는 #25 소유이므로 여기서 중복 구현하지 않는다.

`api/feed.js`를 `lib/feed.js`로 이동해 기존 Node 어댑터와 fixture 검증을 재사용하고 Next Route Handler를 연결한다. root /api의 중복 feed 함수는 제거한다. scripts/server.js와 test/api.test.js의 import만 인계한다. scripts/check.js의 foundation 의존성 0개 제한은 사용자 확정 스택으로 대체하고 문법·JSON·schema 검사는 유지한다.

Owned: src/app, src/features/sample, Next/TS/PostCSS/Vitest 설정, docs/reference 및 이 spec.
Shared: package/lockfile, lib/feed.js 이동, scripts/server.js·check.js, test/api.test.js, CLAUDE/README/ADR. #30의 scripts/server.js 변경과 병합 시 import를 보존한다.
Forbidden: schemas·fixture 값·입력 분석·모델 호출·편집 상태·타인 PR merge.

## 완료 조건

- [x] Biome lint·format 명령을 제공하고 신규 FE 코드 검사가 통과한다.
- [x] shadcn/ui Button과 components.json을 추가하고 공식 MCP 연결을 확인한다.
- [x] 원본 HTML 2개를 docs/reference에 해시와 함께 보존한다.
- [x] Node 24와 stable 패키지 조합이 clean install·typecheck·build를 통과한다.
- [x] 기존 Node test/eval/check가 통과한다.
- [x] mock 4종 응답, invalid query 400, live 501, 비GET 405와 no-store를 보존한다. Next HEAD는 HTTP 규약대로 body 없이 응답한다.
- [x] 실제 production server에서 /와 /api/feed?mock=1을 확인한다. fixture가 배포 번들에 포함된다.
- [x] 샘플 버튼이 고정 예시임을 표시하고 API 성공·실패·재시도를 제공한다. 근거·photo_id를 보존하고 position 순으로 렌더링한다.
- [x] HTML의 종이색·초록색·타이포·여백과 키보드 포커스를 적용하고 모바일 화면을 확인한다.
- [ ] PR과 Preview 증거를 남긴다. 사람 리뷰·merge·Production·A1은 별도 게이트다.

제품 AI 호출·업로드·실제 개인화·최종 결과 화면은 이 노드의 완료로 주장하지 않는다.
