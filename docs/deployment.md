# Vercel 배포 준비

- 담당: **diego.yoon** (`@jangwonyoon`), 입력 모델·A1 실측 협업: **enzo.cho** (`@onejaejae`).
- 실행 노드: [#6](https://github.com/Daterl/gyeol/issues/6), Next.js 기반: [#23](https://github.com/Daterl/gyeol/issues/23).
- 2026-09-17 확인: GitHub Daterl/gyeol과 조직 설정 접근 가능. Vercel GitHub App을 gyeol 한 저장소로 설치했고, Vercel의 Connected Git Repository에서 Daterl/gyeol 연결을 확인했다.
- Vercel 팀은 `jangwon’s projects` (`jangwons-projects-c001fb62`, Hobby). GitHub 조직과 Vercel 팀은 별개다.
- 생성된 [gyeol 프로젝트](https://vercel.com/jangwons-projects-c001fb62/gyeol)의 ID: `prj_PMp7eLUJ3ecRKdo5MNdkBP7uibhE`. PR #21 foundation이 main(32eff4f)에 병합돼 자동 배포가 실행됐으나 Next.js 의존성이 없어 실패했다. 정상 Production Deployment는 아직 없다.
- Framework Preset: **Next.js** 저장 완료. Node.js: **24.x** 기본값 확인. root는 저장소 루트, build/install/output override는 꺼져 있다. #23에서 package engines와 로컬 Node를 맞추고 빌드를 검증한다.

## 연결

공식 MCP를 로컬 Codex에 등록하고 OAuth 인증을 완료했다. 기존 gyeol 권한 승인은 이미 있었으며 만료된 콜백을 새 로그인으로 연결했다. CLI의 Successfully logged in 및 mcp list의 enabled=true, auth_status=o_auth를 확인했다. 현재 대화에는 새 MCP 도구가 노출되지 않아 실제 도구 호출은 새 세션에서 확인한다.

```sh
codex mcp add vercel --url https://mcp.vercel.com
codex mcp login vercel
codex mcp list
```

GitHub Vercel App은 `Only select repositories → Daterl/gyeol`로 설치했다. Vercel에는 빈 프로젝트를 생성하고 원본 Git 저장소를 연결했다. MCP 접근 범위는 gyeol 한 개이며 전체 현재/향후 프로젝트 접근은 선택하지 않았다.

Production Branch Tracking은 `main`으로 확인했다. 환경변수는 아직 없고 실제 빌드는 No Next.js version detected로 실패했다. #23에서 Next.js 앱·package 의존성을 넣은 뒤 빌드와 공개 URL을 검증한다.

## 인수 증거

#6에 Vercel 팀/프로젝트·공개 URL·기준 SHA·main 자동 배포·함수 제한·A1 실측을 남긴다. #23 완료 시 Next.js preset과 `next build`, Node runtime API를 같은 프로젝트에서 확인한다. 환경변수 값과 OAuth 토큰은 문서·이슈에 기록하지 않는다.

근거: [Vercel 공식 MCP 안내](https://vercel.com/docs/agent-resources/vercel-mcp), [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation).
