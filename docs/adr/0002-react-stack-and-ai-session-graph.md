# ADR-0002: React 기반과 AI Session 작업 그래프

- 날짜: 2026-09-17
- 상태: 사용자 지시로 확정. 구현·계약 합의는 각 티켓에서 검증
- 결정자: **diego.yoon** (`@jangwonyoon`)
- 협업자: **enzo.cho** (`@onejaejae`)

## 결정

프론트엔드는 Next.js App Router·React·TypeScript strict·Zustand·Tailwind CSS·shadcn/ui·tailwind-variants(`tv`)를 사용한다. Next.js 사용 허용과 Vercel 배포 계획에 따라 초기 Vite 제안을 대체한다. 패키지 관리는 기존 foundation과 같은 npm이다. Tailwind utility와 tv로 화면을 구성하고 공통 시각 값은 CSS 테마에 둔다.

2026-09-17 npm registry의 latest 조회값은 Next.js 16.3.5, React 19.3.0, TypeScript 7.0.2, Zustand 5.0.15, Tailwind CSS 4.3.3, tailwind-variants 3.3.1이다. 이 조합을 #23의 package-lock.json에 고정한다. 검증 증거는 #23 보고서에 남긴다.

사용자 추가 지시에 따라 Biome 2.5.14를 FE lint·format·import 검사에 적용한다. 기존 서버 검증은 유지하고 신규 src와 루트 FE 설정부터 적용한다.

사용자 추가 지시에 따라 shadcn/ui와 공식 MCP를 사용한다. Radix Nova의 필요한 컴포넌트만 CLI로 추가하고 variant는 기존 tv로 통일한다. 시스템 한글 폰트와 HTML의 색상은 유지한다. MCP는 사용자 단위 설정이며 저장소에 토큰이나 머신 경로를 넣지 않는다.

페이지·레이아웃은 Server Component를 기본으로 하고 파일 입력·편집·Zustand는 Client Component 경계에 둔다. 서버 요청 간 전역 편집 store를 공유하지 않는다. API는 Node runtime의 `src/app/api/**/route.ts`에서 기존 `lib/` 로직을 호출한다. PR #21의 계약·fixture·Node 검증을 재사용하며 `/api/feed?mock=1`의 URL과 응답을 유지한다. #23에서 mock HTTP 어댑터를 인계하고 입력 API는 enzo.cho, 출력 API는 diego.yoon이 구현한다. 개인정보 응답을 공유 캐시하지 않으며 키는 서버 전용으로 둔다.

배포 #6의 담당은 사용자 최종 정정에 따라 **diego.yoon**이다. enzo.cho는 입력 이해·실측에 협업한다. MCP 연결과 공개 배포 완료는 별도 검증한다.

기존 문서의 바닐라 JS·프레임워크 미사용 결정은 이 ADR로 대체한다. HTML은 시각·흐름 참고 자료이며 샘플 분석 로직을 실제 AI로 취급하지 않는다. 현재 제품 흐름과 공유 계약은 [ADR-0008](0008-public-profile-curation-and-sharing.md)을 따른다.

## 작업 그래프

- 노드: 제품 계약 엄브렐라 #65 → G1~G8 전달 게이트 → 필요한 기존 품질·검증 하위 이슈. 하위 이슈가 없는 실제 leaf만 한 AI Session/한 PR 단위다.
- 범위 관계: GitHub native parent/sub-issue.
- 실행 관계: GitHub native blocked-by. 부모의 완료를 자식의 선행 조건으로 쓰지 않는다.
- 파일 충돌: Owned·Shared·Forbidden과 파일별 인계로 관리한다. 같은 파일을 쓴다는 이유만으로 제품 의존성을 만들지 않는다.
- 노드 본문: 문제·근거, 원천, 입출력, 담당, 범위, 실행 단계, 검증·완료 조건, Verdict·인계.
- 기록: Project는 상태, 이슈/PR은 실행 증거, 마일스톤은 제출 범위, ADR은 결정.

과거 #22와 E1~E4(#2~#5)는 ADR-0008의 제품 계약으로 대체해 종료했다. 재사용 가능한 이슈는 G1 #68, G2 #14, G4 #26, G5 #17, G8 #27로 이동했고 G3 #139, G6 #140, G7 #141만 새로 만들었다. 기존 구현·진행 증거는 각 노드의 하위 이슈로 보존한다. 별도 그래프 DB나 스케줄러는 만들지 않는다. 실제 생성된 노드·관계는 [AI Session 실행 문서](../ai-session-workflow.md)에 연결한다.

## 근거

- [KHDS #372: 엄브렐라·의존성 DAG·실행 규칙](https://github.com/khc-dp/khds/issues/372)
- KHDS `.github/ISSUE_TEMPLATE/ai-session-task.yml`: 목적·소유권·검증·Verdict를 가진 세션 계약 형식만 참고한다. KHDS 전용 디자인/배포 규칙을 가져오지 않는다.
- [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation), [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Tailwind Next.js 설치](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [Zustand](https://zustand.docs.pmnd.rs/), [tv 변형](https://www.tailwind-variants.org/docs/variants)
- [GitHub sub-issues](https://docs.github.com/en/rest/issues/sub-issues), [issue dependencies](https://docs.github.com/en/rest/issues/issue-dependencies)
