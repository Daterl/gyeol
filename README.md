# 결 GYEOL

**올리고 싶은 사진 여러 장을 넣으면, 어떤 순서로 / 뭐라고 열고 / 어디에 말을 붙일지를 근거와 함께 제안합니다.**

사진을 보정하지 않습니다. **고릅니다.** 그리고 굳이 말할 필요 없는 자리는 **비운 채로** 돌려줍니다.

원티드 AI 챔피언십 2026 출품작.

---

## 돌리기

Node 24에서 고정 샘플 화면과 `/api/feed?mock=1`을 실행한다. API 키 없이 사용할 수 있다. 업로드·분석·편집은 후속 티켓에서 연결한다.

```sh
nvm use
npm ci
npm run dev              # http://localhost:3000
npm run build
npm start                # production server
```

```sh
npm test                 # 기존 Node 계약/서버 회귀
npm run eval             # 출력 불변식
npm run check            # JS 문법·JSON·schema
npm run test:ui           # Next adapter·샘플 응답 검증
npm run test:smoke -- http://localhost:3100 # 별도 실행한 production 서버 검증
npm run typecheck        # Next route types·TS strict
npm run lint             # Biome lint·format·import 검사
npm run lint:fix         # 안전한 자동 수정
npm run format           # 포맷만 적용
npm run start:mock       # 기존 standalone mock 서버 (기본 3000)
```

배포 담당은 **diego.yoon**이다. [공개 Production](https://project-7klb1.vercel.app/)의 익명 HTTP·샘플 smoke는 확인했다. 실제 모델 A1 실측 등 남은 배포 인수는 #6에서 관리한다.

작업 브랜치는 최신 `origin/develop`에서 만들고 PR도 **develop**으로 보낸다. 개발 변경은 Preview에서 확인하고, 배포할 때만 **develop → main** 릴리스 PR을 만든다. Vercel Production 추적 브랜치는 **main**이다. [브랜치 운영 ADR](docs/adr/0004-develop-and-production-branches.md).

## 스택

Next.js App Router · React · TypeScript strict · Zustand · Tailwind CSS · shadcn/ui · tailwind-variants(`tv`). 서버는 Next.js Route Handlers(Node runtime)와 기존 lib/ 로직·Anthropic API를 사용한다. 라이브러리는 구현 시 최신 stable·peer·Node 호환을 확인하고 lockfile에 고정하며, 모델은 계정 접근을 확인한 ID를 사용한다.
DB와 로그인은 없다. 선택 근거는 [ADR-0002](docs/adr/0002-react-stack-and-ai-session-graph.md)에 있다.

## 구조

```
src/           React 화면·공통 shadcn/ui (디에고 소유)
public/        정적 자산
src/app/api/   Route Handlers (입력: enzo, 출력: diego)
lib/           기존 서버 로직·mock handler (입력: 원재 소유)
prompts/       input/ 원재 · output/ 디에고 · shared/ 공동
schemas/       ★ 경계 계약. 바꾸려면 양쪽 승인
fixtures/      mock 데이터
docs/intent.md ★ 무엇을 왜 만드는가. 모든 이슈가 여기를 가리킨다
CLAUDE.md      ★ 작업 규약. 코드 만지기 전에 읽는다
```

Biome 2.5.14는 `src/**`와 루트 FE 설정 파일에 적용한다. 기존 서버/fixture와 HTML 원본은 재포맷하지 않는다. Tailwind v4 directive 파싱과 Git ignore를 사용한다. [Biome 설정 문서](https://biomejs.dev/reference/configuration/).

## UI 컴포넌트와 MCP

`components.json`은 shadcn/ui Radix Nova registry 설정이다. `src/components/ui/button.tsx`는 공식 CLI로 추가하고 변형 엔진을 `tv`로 맞췄다. 종이색·초록색 토큰은 `src/app/globals.css`에 있다. 컴포넌트는 필요한 것만 추가한다.

```sh
npm exec -- shadcn add <component>
# 사용자 단위 Codex 설정 (2026-09-17 등록 및 stdio initialize/tools/list 확인)
codex mcp add shadcn -- npx -y shadcn@latest mcp
```

새 MCP 도구를 대화에서 사용하려면 Codex 세션을 다시 시작한다. 컴포넌트 추가 후 기본 cva를 프로젝트의 tv 방식에 맞추고 스타일 변경을 확인한다. [공식 MCP 문서](https://ui.shadcn.com/docs/mcp).

## 진행 기록

- [최상위 실행 그래프 #22](https://github.com/Daterl/gyeol/issues/22): E1~E4와 AI Session leaf의 native 관계·선행 DAG.
- [AI Session 운영](docs/ai-session-workflow.md): 세션 시작·파일 인계·검증·종료 기록 기준.
- [Vercel 배포 준비](docs/deployment.md): diego.yoon 담당, MCP·저장소 연결·배포 검증 기록.

- [작업 칸반](https://github.com/orgs/Daterl/projects/2/views/1): 기존 이슈의 현재 상태를 관리한다. 작업 시작·PR 작성·막힘 발생·인수 완료 시 갱신한다.
- [제출 마일스톤](https://github.com/Daterl/gyeol/milestone/1): 제출 범위와 마감 **2026-09-21 00:00 KST**를 관리한다.
- [ADR](docs/adr/0001-single-screen-photo-only-entry.md): diego.yoon의 제품 결정과 enzo.cho 협업 시 반영할 내용을 기록한다.

상태는 `대기 → 착수 가능 → 진행 중 → 검토·인수 대기 → 완료`, 진행 도중 중단은 `막힘`으로 표시한다. 진행 근거·다음 행동·막힘 해제 조건은 해당 이슈/PR에 남긴다. PR 생성이나 로컬 테스트 통과만으로 완료 처리하지 않는다.

## 팀

| 사람 | 역할 | 소유 |
|---|---|---|
| **원재** (`@onejaejae`) | 백엔드 + AI — **입력 이해** | 사진 분석 · 두 축 프로필 · 순서 제안 |
| **디에고** (`@jangwonyoon`) | 프론트엔드 + AI — **출력 생성** | 화면 전체 · 타이틀 · 캡션 · 비움 판단 |

경계선은 딱 하나, `OrderedFeed` JSON 이다. 자세한 경계는 `CLAUDE.md` 4절.

## 일정

| 시각 | 무엇 |
|---|---|
| 2026-09-19 | 참가 신청 마감 |
| **2026-09-21 00:00 KST** | **제출 마감** |
| 09-21 ~ 10-06 | 예선 — **온라인 투표** (상위 50팀) |
| 10-07 ~ 10-16 | 본선 (상위 20팀) |
| 10-17 | 데모데이 |

**실질 개발 기간은 9/20 자정까지 약 3.5일이다.** 무엇을 자르기로 했는지는 `docs/intent.md` 4절에 근거와 함께 있다.
