# AI Session 실행 그래프

[최상위 #22](https://github.com/Daterl/gyeol/issues/22) · [작업 칸반](https://github.com/orgs/Daterl/projects/2/views/1) · [제출 마일스톤](https://github.com/Daterl/gyeol/milestone/1)

## 노드와 관계

엄브렐라는 범위를 모으고 leaf 하나는 AI Session/PR 하나의 실행 계약이다. GitHub native parent/sub-issue가 범위 관계, blocked-by가 실행 선행 관계다. 실제 관계와 상태는 GitHub가 원천이고 이 문서는 운영 방법을 기록한다.

- #22 → #2 기반, #3 입력 이해, #4 화면·출력 생성, #5 통합·제출.
- 신규 leaf: #23 React 기반, #24 연결 계약, #25 편집 세션, #26 생성 서버, #27 사용자 경로 검증.
- 기존 #1·#6~#20은 번호·담당을 유지하고 AI Session 계약으로 보강했다.
- diego.yoon (`@jangwonyoon`): 화면·출력 생성·Vercel 배포(#6). enzo.cho (`@onejaejae`): 입력 이해·기반. 공유 계약은 공동 리뷰.

## 세션 시작

1. 해당 이슈의 목표·원천·완료 조건, 선행 노드의 실제 산출물과 인수 증거를 읽는다. 부모 umbrella 종료를 기다리지 않는다.
2. 최신 `origin/develop`에서 작업 브랜치를 만들고 PR base를 `develop`으로 정한다. 기준 SHA, branch/worktree, 실행 담당, Owned·Shared·Forbidden 파일을 기록한다. 공유 파일은 담당자 한 명이 수정하고 인계한다.
3. 선행 계약이 부분 인수됐다면 인수된 산출물만 사용하는 초안을 진행할 수 있다. 계약 확정·merge·완료와 구분한다.
4. Project를 진행 중으로 옮긴다. M은 spec, L은 spec+plan을 작성하고 해당 노드의 최소 구현·검증을 수행한다.

## 세션 종료와 인계

이슈/PR에 다음 기록을 남긴다. 실행하지 않은 항목은 PENDING이다.

```text
Verdict: PASS | FAIL | BLOCKED | PENDING
기준/결과 SHA와 PR:
변경 파일:
검증 명령 → 결과 → 증거:
실제 모델/배포 확인:
남은 게이트·막힘 해제 조건:
다음 행동·담당:
```

PASS는 기록한 검증 범위에만 적용한다. 로컬 테스트 성공이나 PR 생성만으로 완료 처리하지 않는다. 해당 이슈의 사람 합의·리뷰·merge·필요한 배포 검증을 확인한 뒤 완료로 옮긴다. 작업 시작·PR 작성·막힘·인수마다 Project를 갱신한다.

## 개발 통합과 Production 릴리스

[ADR-0004](adr/0004-develop-and-production-branches.md)를 따른다. 작업 PR은 `develop`에서 사람 리뷰·squash merge하고 Preview로 검증한다. 공개 배포는 별도 `develop → main` 릴리스 PR을 사람이 merge commit으로 병합할 때 수행한다. Preview 통과를 Production 확인으로 기록하지 않는다. Production 인수가 필요한 leaf는 배포 확인 전까지 완료로 옮기지 않는다.

## 의존성과 검증의 구분

- #1·#7·#8은 PR #21에 기반 구현이 있으므로 재작성하지 않고 합의·리뷰·인수 증거를 확인한다.
- #6 배포와 #23 React 기반은 독립 착수 가능하다. `package.json`, lockfile, `vercel.json`은 순차 인계한다.
- #16은 프롬프트와 수동 예시로 인수한다. 실제 모델 품질은 #26에서 검증해 #16↔#26 교착을 피한다.
- #17은 F3 fixture로 진행한다. live 연결은 #18이며 #26 완료를 UI 착수 조건으로 만들지 않는다.
- #19 샘플 재생은 #18 실모델 통합과 별도다. #27에서 두 경로를 검증하고 #20으로 증거를 모은다.
- #13은 선택 범위다. 생략해도 D6의 프로필별 실제 결과 비교는 유지한다.
- 키·모델·배포 접근 등 외부 게이트는 각 노드에서 명시한다. 초안 진행과 외부 게이트 통과를 혼동하지 않는다.

## 구현 기준

[ADR-0001](adr/0001-single-screen-photo-only-entry.md)의 한 화면·사진만 입력과 [ADR-0002](adr/0002-react-stack-and-ai-session-graph.md)의 Next.js App Router·React·TypeScript·Zustand·Tailwind CSS·shadcn/ui·tv·Biome를 따른다. 기존 바닐라 JS 및 2단계 입력 문구보다 두 ADR이 우선한다. PR #21 병합 시에도 새 결정을 보존한다.

원본 HTML의 시각·흐름은 #23에서 팀이 접근할 수 있는 참조 자료로 보존하고 경로를 기록한다. 로컬 파일명만 있는 상태를 공유 완료로 간주하지 않는다. 사진 속성·계정 프로필을 해시로 고르는 프로토타입 계산은 실제 분석으로 이식하지 않는다.

재사용한 선례: [KHDS #372](https://github.com/khc-dp/khds/issues/372)와 KHDS AI Session Task 템플릿. 별도 그래프 DB·스케줄러·대시보드를 만들지 않고 GitHub 관계·Mermaid·Project를 사용한다.
