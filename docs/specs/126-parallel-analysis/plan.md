# #126 — 어떤 순서로 만드는가

| # | 파일 | 무엇 | 무엇으로 확인하나 |
|---|---|---|---|
| 0 | — | 고치기 전 실측 1회 (순차 15장) | `run-before.txt` — 155.0초 기록됨 ✅ |
| 1 | `src/features/input/input.ts` | 워커 풀 + 재시도 + 재색인. `upload()` 가 `{analyses, failed}` 반환 | `npm run test:ui` |
| 2 | `src/features/editor/store.ts` | `loadFeed` 의 사진 동일성 검사를 부분집합으로 완화, 생존분으로 `photos` 정리 | `npm run test:ui` |
| 3 | `src/features/input/input.test.ts` | 경계값 테스트 추가 (병렬 상한 준수 / 1장 실패 → 나머지 재색인 / 생존 부족 → 실패 / 인증 오류 재시도 안 함) | `npm run test:ui` |
| 4 | — | 고친 뒤 실측 3회: 상한 후보 3개(5 / 8 / 15)를 실사진 15장으로 각 1회 | 벽시계 시간 + 429 발생 여부 |
| 5 | `src/features/input/input.ts` | 4단계 결과로 `ANALYZE_CONCURRENCY` 확정 | `report.md` 에 근거 기록 |
| 6 | — | 한 장 실패 시나리오 실측 (`/api/feed` 200 확인) | 실행 로그 |
| 7 | — | `npm test` · `eval` · `check` · `lint` · `typecheck` | 전부 통과 |
| 8 | — | Draft PR (`--base develop`) | — |

**4단계를 상한 선택에 쓰는 이유:** "고친 뒤 3회" 라는 측정 예산 안에서 상한의 실측 근거를 만드는 유일한 방법이다.
측정만 3번 하고 상한은 추측으로 고르면 DoD 3번을 만족하지 못한다.

**측정 시 주의:** `lib/photo_analysis.js:347` 의 관측 캐시는 이미지 해시 기준 프로세스 수명 캐시다.
같은 사진을 다시 올리면 모델을 부르지 않는다. 그래서 매 측정마다 **다른 15장**(`OFFSET`) 을 쓴다.
