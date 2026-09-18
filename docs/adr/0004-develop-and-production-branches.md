# ADR-0004: develop 통합과 main Production 릴리스 분리

- 날짜: 2026-09-17
- 상태: 사용자 지시로 확정. 원격 develop 생성·GitHub 기본 브랜치 변경 완료.
- 결정자: **diego.yoon** (`@jangwonyoon`)
- 협업자: **enzo.cho** (`@onejaejae`)

## 이유

기능 PR을 main으로 병합할 때마다 Vercel Production이 갱신된다. 개발 중 변경을 통합하는 시점과 공개 배포 시점을 분리한다. 기존 CLAUDE.md의 main 단일 장기 브랜치·develop 금지 규칙은 이 결정으로 대체한다.

## 결정

| 브랜치 / PR | 용도 | Vercel |
|---|---|---|
| `develop` | GitHub 기본 브랜치·개발 통합 | Preview |
| `feat/*`, `fix/*`, `docs/*` → `develop` | 최신 origin/develop에서 분기, 사람 리뷰 후 squash merge | Preview |
| `develop` → `main` | 배포할 변경이 준비됐을 때 만드는 릴리스 PR, 사람 리뷰 후 merge commit | main 반영 시 Production |

main의 최신 merge `e9020fcf0b757177142f5fef259764795439e6c5`에서 develop을 만들었다. 기존 미커밋 변경과 작업 브랜치는 보존한다. 전환 시 열린 PR은 0개였으며, 이미 병합된 PR의 base는 소급 변경하지 않는다. 새 작업은 origin/develop 기준으로 시작한다.

릴리스에 merge commit을 쓰면 develop의 커밋 이력이 main에도 보존되어 다음 릴리스에서 이전 변경이 다시 나타나는 문제를 피할 수 있다. GitHub는 merge commit과 squash를 모두 허용하고 있다. 두 장기 브랜치는 삭제·force-push하지 않는다. 긴급 main 수정이 생기면 후속 main → develop PR로 동기화한다.

AI는 로컬 구현·검증과 Draft PR 생성까지 진행한다. 사람 리뷰·merge·릴리스 권한은 그대로 유지한다. Production 검증이 필요한 이슈는 develop 병합만으로 닫지 않고 `Refs #N`을 유지한다. 문서 전용 작업처럼 Production 검증이 해당없으면 별도로 기록한다.

## 검증

- 원격 main과 새 develop이 생성 시 같은 SHA인지 확인했다.
- GitHub `default_branch=develop` 확인. 로컬 remote HEAD도 develop으로 맞춘다.
- [Vercel Production 설정](https://vercel.com/jangwons-projects-c001fb62/gyeol/settings/environments/production)의 Branch Tracking 입력값이 **main**임을 GitHub 기본 브랜치 변경 후 직접 확인했다. Vercel 설정은 변경하지 않았다.
- Preview 배포 자체를 끄는 정책은 아니다. 검토용 Preview는 계속 사용하며 main의 공개 URL 갱신만 릴리스 시점으로 제한한다.
- 첫 develop 변경의 Preview 배포와 이후 실제 릴리스는 각각 실행 후 증거를 기록한다. 브랜치 생성 자체를 릴리스 기능 검증 완료로 표시하지 않는다.

작업 순서: `origin/develop → 작업 브랜치 → Draft PR(base: develop) → 사람 merge → Preview 검증 → 릴리스 PR(base: main) → 사람 merge → Production 검증`.
