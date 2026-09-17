# plan.md — #12 실행 계획

기준 SHA **`32eff4f`** (= `origin/main`, PR #21 squash merge 이후) · 브랜치 `feat/12-order-proposal` · 워크트리 `.work/gyeol-12`
AI 실행 담당: 이 세션 · 사람 리뷰 책임자: 원재(enzo, `@onejaejae`) · 경계 계약 변경이므로 상대(디에고) 확인 필요

## 최소 스코프 — 건드리는 파일과 안 건드리는 것

| 파일 | 왜 | 소유 |
|---|---|---|
| `lib/order.js` (신규) | F2 본체. 이슈가 지정한 Owned 파일 | 원재 |
| `test/order.test.js` (신규) | DoD 를 실제 실행으로 증명하는 자리 | 원재 |
| `docs/specs/12-order-proposal/*` (신규) | SOP 산출물 | 원재 |

**안 건드리는 것:** `schemas/` 4종 · `lib/contracts.js` · `eval/`(골든·broken) · `fixtures/` · `api/` · `scripts/` ·
다른 워크트리 · `pivot/`(읽기 전용) · 배포 설정. `prompts/input/order.md` 와 `src/app/api/feed/route.ts` 는 **만들지 않는다**(`spec.md` 7절).

## 단계와 확인 방법

| # | 무엇 | 무엇으로 확인하는가 |
|---|---|---|
| 1 | **근거 후보 값 실사진 검증** | 실사진 15장 측정 + 4장 눈 대조. 쓸 값/못 쓸 값 표를 `spec.md` 2절에 고정 |
| 2 | 캐러셀 불일치 정리 | `ig_feed_29cm.json` 직접 카운트(26/30)와 fixture 0 의 출처 차이 확인 → 보너스 경로를 관측값에만 걸기 |
| 3 | `lib/order.js` 구현 | `node -e` 로 15장 1회 실행해 눈으로 본다 |
| 4 | `test/order.test.js` | `npm test` — 3·15·20장, 프로필 2벌, 결정성, 근거 역추적, 경계값 |
| 5 | 불변식 재실행 | `npm run eval` · `npm run check` 회귀 0 |
| 6 | 15슬롯 근거 전수 대조 | 15장 근거 문장을 한 줄씩 측정값과 맞춰 본다 (W5·W6·W11) |
| 7 | `report.md` + Draft PR | 실제 출력 붙이고 남은 게이트 명시. 이슈는 닫지 않는다 |

## 이 계획의 위험

- **위험 1 — 근거가 "측정된 것처럼" 보이는 것.** 1단계를 코드보다 먼저 두는 이유다. 확인 못 한 값은 문장에서 뺀다.
- **위험 2 — S3(프로필이 순서를 바꾼다)가 우연히 성립하는 것.** 두 프로필이 서로 다른 *구조화된* 신호를 타는지 테스트로 고정한다.
- **위험 3 — 경계 계약(`OrderedFeed`)을 혼자 확정하는 것.** 이 PR 은 Draft 이고 상대 리뷰 전까지 합의는 pending 이다.
