# #23 검증 및 인계 — 2026-09-17

담당 diego.yoon, 협업 enzo.cho. 기준 main `32eff4f`, 브랜치 `feat/23-nextjs-foundation`.

Verdict: 로컬 PASS. 사람 리뷰·merge·Production·A1은 PENDING. 구현 SHA `28a3b88`, [Draft PR #32](https://github.com/Daterl/gyeol/pull/32), Project 검토·인수 대기.

## 완료 조건 대조

| 조건 | 증거 |
|---|---|
| Biome lint·format 명령 | ✅ 2.5.14, `npm run lint` 18파일 통과. src·FE 설정 적용, 기존 서버/HTML 원본 제외 |
| shadcn/ui + MCP | ✅ 공식 CLI Radix Nova Button을 tv로 조정. stdio initialize + tools/list(7개) 성공. 현재 Codex 대화에 도구를 노출하려면 새 세션 필요 |
| HTML 보존 | ✅ docs/reference 두 원본과 SHA256 |
| Node·clean install·types·build | ✅ Node 24.11.1, npm ci, typecheck, Next 16.3.5 production build |
| 기존 회귀 | ✅ npm test 67/67, eval 2케이스 × 8불변식 및 의도적 실패 판정, check 30 JS/JSON |
| Next·클라이언트 경계 | ✅ test:ui 14/14, GET 4종·400·405·501·HEAD·no-store, 순서/중복/형식 검사 |
| 실제 production HTTP | ✅ `npm run test:smoke -- http://localhost:3100`: 첫 화면 200, 4종 fixture 완전 일치, 오류/메서드/헤더. 빌드 trace에 4종 fixture 포함 |
| 브라우저 성공·실패·재시도 | ✅ Chrome 샘플 15슬롯·근거 펼침. 서버 중단→한국어 실패 안내→서버 재시작 후 재시도 15슬롯 |
| 반응형·접근성 | ✅ 데스크톱 3열, 390px viewport(콘텐츠폭 375px) 1열, scrollWidth=clientWidth. Tab으로 본문 건너뛰기와 solid 포커스 확인 |
| PR·Preview | ✅ PR #32, Vercel Ready. 로그인된 Chrome에서 배포 화면→샘플 15슬롯 확인. 익명 HTTP smoke는 Vercel 인증으로 리다이렉트돼 인수 범위에서 제외 |

## 발견과 수정

첫 production smoke에서 API 500을 발견했다. Turbopack이 동적 `new URL(..., import.meta.url)`를 자산으로 변환해 fixture 읽기가 실패했다. 프로젝트 루트 기준 `process.cwd()` + 파일명 허용 목록으로 읽고 Next tracing에 fixture를 포함했다. 이후 같은 production smoke 및 Node/Next 회귀를 재실행해 통과했다. 서버 명령은 저장소 루트에서 실행한다.

다중 모델 리뷰는 M의 권장 항목으로 미실행했다. 동일 에이전트가 diff·HTTP 경계·타인 변경 보존·번들 fixture·실패 복구를 자체 검토했다. 실제 모델 호출과 결과 품질은 검증하지 않았다.

## 파일 인계

- root api/feed.js → lib/feed.js. Next 경로는 src/app/api/feed/route.ts, HTTP 계약/fixture 값은 동일하다. 기존 standalone scripts/server.js는 start:mock으로 유지한다.
- #30 등 입력 PR의 scripts/server.js 병합 시 lib/feed.js import를 보존한다. 입력 API는 추후 Next Route Handler로 연결하고 공용 lib 로직을 재사용한다.
- package.json/lockfile·Node 24·Next preset을 #6과 공유한다. 별도 vercel.json override는 없다.
- #24 연결 계약 → #25 Zustand 편집 store 순서. 이번에는 Zustand 설치만 한다. 업로드/실제 분석/생성 UI를 완성했다고 주장하지 않는다.
- 사람 리뷰·merge 담당은 상대 리뷰어이며 AI는 merge하지 않는다. #6은 Production/A1까지 완료 처리하지 않는다.

Preview: https://gyeol-ggbve05t7-jangwons-projects-c001fb62.vercel.app/

배포 상세: https://vercel.com/jangwons-projects-c001fb62/gyeol/4KYTcSQvkeVBkVWhyHpwjcTpv4Mi (28a3b88). 공개 Production 성공을 뜻하지 않는다.
