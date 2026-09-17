# Next.js Foundation Implementation Plan

> 실행: 사용자 AGENTS의 순차 실행 규칙에 따라 메인 에이전트가 구현·검토한다. 추가 실행 승인은 요청하지 않는다.

**Goal:** #23 실행 기반과 기존 mock의 Next.js 배포 경로를 만든다.
**Architecture:** 기존 lib 검증과 Node handler를 보존하고 얇은 Route Handler로 연결한다. 서버 페이지와 샘플 Client Component를 분리한다.
**Tech Stack:** Next.js·React·TypeScript strict·Zustand·Tailwind CSS·shadcn/ui·tv, npm, Node 24, Vitest.

## 실행

1. [x] package.json·lockfile·.nvmrc·tsconfig.json·next.config.ts·postcss.config.mjs·vitest.config.ts를 구성한다. 기존 test/eval/check 명령을 유지한다.
2. [x] api/feed.js→lib/feed.js 이동, scripts/server.js와 test/api.test.js import 조정. src/app/api/feed/route.ts와 route.test.ts에서 4종 fixture·오류·메서드·no-store 회귀를 검증한다.
3. [x] src/app/layout.tsx·page.tsx·globals.css·icon.svg, src/features/sample의 fetch/최소 응답 검사·샘플 표시·테스트를 구현한다. docs/reference에 HTML 원본과 SHA256을 기록한다.
4. [x] Node 24에서 npm ci, npm test, npm run eval, npm run check, npm run test:ui, npm run typecheck, npm run build. npm start로 HTTP 및 브라우저 데스크톱/모바일을 검증한다.
5. [x] diff와 타인 파일 변경을 검토하고 보고서를 남긴다. Lore commit·Draft PR, Preview 검증 후 #23 Project를 검토·인수 대기로 이동한다. 사람 merge는 pending.

계약 변경이 필요해지면 #24로 분리한다. 새 의존성은 설치된 stable 버전을 lockfile에 고정하며 optional peer를 불필요하게 추가하지 않는다.
