# Vercel 배포 운영

- 담당: **diego.yoon** (`@jangwonyoon`), 입력 모델·A1 실측 협업: **enzo.cho** (`@onejaejae`).
- 실행 노드: [#6](https://github.com/Daterl/gyeol/issues/6), Next.js 기반: [#23](https://github.com/Daterl/gyeol/issues/23).
- 2026-09-17 확인: GitHub Daterl/gyeol과 조직 설정 접근 가능. Vercel GitHub App을 gyeol 한 저장소로 설치했고, Vercel의 Connected Git Repository에서 Daterl/gyeol 연결을 확인했다.
- Vercel 팀은 `jangwon’s projects` (`jangwons-projects-c001fb62`, Hobby). GitHub 조직과 Vercel 팀은 별개다.
- 생성된 [gyeol 프로젝트](https://vercel.com/jangwons-projects-c001fb62/gyeol)의 ID: `prj_PMp7eLUJ3ecRKdo5MNdkBP7uibhE`. 초기 PR #21 배포는 Next.js 의존성 부재로 실패했지만 PR #32 병합 이후 Production이 Ready로 완료됐다. 공개 대표 주소는 https://project-7klb1.vercel.app/ 이다.
- Framework Preset: **Next.js** 저장 완료. Node.js: **24.x** 기본값 확인. root는 저장소 루트, build/install/output override는 꺼져 있다. #23에서 package engines와 로컬 Node를 맞추고 빌드를 검증한다.

## 연결

공식 MCP를 로컬 Codex에 등록하고 OAuth 인증을 완료했다. 기존 gyeol 권한 승인은 이미 있었으며 만료된 콜백을 새 로그인으로 연결했다. CLI의 Successfully logged in 및 mcp list의 enabled=true, auth_status=o_auth를 확인했다. 현재 대화에는 새 MCP 도구가 노출되지 않아 실제 도구 호출은 새 세션에서 확인한다.

```sh
codex mcp add vercel --url https://mcp.vercel.com
codex mcp login vercel
codex mcp list
```

GitHub Vercel App은 `Only select repositories → Daterl/gyeol`로 설치했다. Vercel에는 빈 프로젝트를 생성하고 원본 Git 저장소를 연결했다. MCP 접근 범위는 gyeol 한 개이며 전체 현재/향후 프로젝트 접근은 선택하지 않았다.

Production Branch Tracking은 **main**이다. 2026-09-17 GitHub 기본 브랜치를 develop으로 바꾼 뒤에도 Vercel Production 설정에서 main을 다시 확인했다. 2026-09-20 실측 기준 Production·Preview Blob 연결을 완료했고, Production에는 Anthropic key/workspace와 signing/session/origin/share/cron/receipt 변수를 설정했다. Production 모델 flag `1`과 실사진 15/15 live 분석도 통과했다. #207 배포 전에 새 model budget 두 값이 더 필요하며, `APIFY_TOKEN`은 별도 #68 범위다.

`ANTHROPIC_API_KEY`만 설정해서는 모델을 호출하지 않는다. 서버 전용 `GYEOL_MODEL_PROVIDER_ENABLED=1`을 함께 설정해야 `/api/analyze`가 모델 경로를 사용하고 `/api/generate`가 생성 요청을 허용한다. 미설정·`0`·`true`·오타는 모두 비활성으로 처리한다.

모델 활성화는 다음 순서를 지킨다. 먼저 Private Blob의 `BLOB_READ_WRITE_TOKEN`, 서로 다른 32자 이상 난수 `GYEOL_BROWSER_SESSION_SECRET`, 정확한 HTTPS origin `GYEOL_APP_ORIGIN`을 설정한다. 그다음 `GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR`, `GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR`를 모두 양의 정수로 설정한다. session 값은 global 이하이어야 한다. 마지막에만 `GYEOL_MODEL_PROVIDER_ENABLED=1`을 설정한다. 예산이 없거나 잘못됐거나 Blob limiter가 실패하면 `503 MODEL_ACCESS_UNAVAILABLE`, 세션이 잘못되면 `401 UNAUTHORIZED` 또는 `403 FORBIDDEN`, 예산이 끝나면 `429 RATE_LIMITED`로 provider 호출 전에 실패한다. 첫 배포 제안은 global/session `600/40` 요청/시간이다. session 40은 15장 분석을 브라우저가 각 1회 재시도한 30요청, 최초 생성 1요청, 편집 생성 8요청까지 수용한다. provider 내부의 제한된 재시도는 새 HTTP admission을 만들지 않지만 실제 최대 비용은 별도로 관측한다.

브라우저는 `/api/profile/session`의 signed HttpOnly cookie와 CSRF를 `/api/analyze`, `/api/generate`에도 재사용한다. 브라우저 밖 운영 검증이 필요할 때만 다른 모든 비밀값과 다른 `GYEOL_MODEL_API_ACCESS_KEY`를 `Authorization: Bearer`로 보낸다. 이 경로는 Origin·cookie·CSRF가 함께 오면 거부하며 같은 durable 예산을 소비한다. `GYEOL_MODEL_API_ACCESS_KEY`는 선택값이고 일반 브라우저 동작에는 설정하지 않아도 된다.

`GYEOL_ANALYSIS_RECEIPT_SECRET`은 32자 이상의 서버 전용 값으로 Preview와 Production에 각각 설정한다. 분석 응답과 피드 요청 사이의 동일 바이트 중복 근거만 인증하며 `ANTHROPIC_API_KEY`, `APIFY_TOKEN`, `APIFY_INGEST_RECEIPT_SECRET`과 값을 공유하지 않는다. 미설정이면 분석과 순서 기능은 동작하지만 중복 사진과 유사 사진(#97) 빼기 권고는 정직하게 0개로 남는다. 두 권고 모두 서버가 잰 값임을 영수증으로 확인할 때만 나온다.

## 개발과 공개 배포 분리

[ADR-0004](adr/0004-develop-and-production-branches.md)에 따라 작업 브랜치와 기능 PR의 기준은 **develop**이다. develop/작업 브랜치 push는 자동 배포하지 않는다. 필요할 때 GitHub Actions의 `Vercel Preview (manual)`을 실행하면 Deploy Hook이 최신 develop을 Preview로 배포한다. 배포할 때만 **develop → main** 릴리스 PR을 사람이 merge commit으로 병합한다. main 반영이 Production 자동 배포를 일으키며, Preview 통과를 Production 인수로 기록하지 않는다.

Vercel Git 설정은 `main: true`, `**: false`다. `**`는 `/`가 들어간 작업 브랜치까지 포함한다. 겹치는 규칙 중 하나가 `true`면 배포하는 Vercel 규칙에 따라 main만 자동 Production 대상이고 나머지는 수동 Preview 대상이다. Deploy Hook URL은 GitHub Actions secret `VERCEL_PREVIEW_DEPLOY_HOOK`에만 저장하며 문서·로그에 기록하지 않는다.

## 인수 증거

#6에 Vercel 팀/프로젝트·공개 URL·기준 SHA·main 자동 배포·함수 제한·A1 실측을 남긴다. #23 완료 시 Next.js preset과 `next build`, Node runtime API를 같은 프로젝트에서 확인한다. 환경변수 값과 OAuth 토큰은 문서·이슈에 기록하지 않는다.

근거: [Vercel 공식 MCP 안내](https://vercel.com/docs/agent-resources/vercel-mcp), [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation).

## #23 Preview 확인 (2026-09-17)

[PR #32](https://github.com/Daterl/gyeol/pull/32), 구현 SHA `28a3b88`의 자동 Preview가 Ready로 완료됐다. [배포 상세](https://vercel.com/jangwons-projects-c001fb62/gyeol/4KYTcSQvkeVBkVWhyHpwjcTpv4Mi), [Preview](https://gyeol-ggbve05t7-jangwons-projects-c001fb62.vercel.app/).

로그인된 Chrome에서 첫 화면·샘플 버튼·15슬롯 응답을 확인했다. 익명 HTTP 접근은 Vercel 인증으로 리다이렉트되므로 공개 URL 인수로 세지 않는다. 보호 설정을 변경하지 않았다. 이 기록은 당시 Preview 범위다. 후속 Production 검증은 아래 기록을 따른다.

## 공개 Production 확인 — #38

제출용 링크: **https://project-7klb1.vercel.app/**. 익명 HTTP 200·리다이렉트 없음·샘플 15슬롯과 기존 production smoke 전체 통과를 [#38 검증 댓글](https://github.com/Daterl/gyeol/issues/38#issuecomment-5711078940)에 기록했다. 해당 검증은 main `9a69a16`의 Current/Ready 배포 기준이다. 개별 배포 URL은 SSO 보호를 받을 수 있으므로 제출에는 대표 도메인을 쓴다. 시크릿/다른 기기 화면 확인과 #6 A1 실측은 별도 미완료 항목이다.
