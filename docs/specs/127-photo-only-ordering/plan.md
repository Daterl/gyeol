# #127 plan

| # | 파일 | 무엇을 | 무엇으로 확인 |
|---|---|---|---|
| 1 | `lib/order.js` | `hasOrderingBasis(analyses)` export 추가 (밝기·채도 범위 + 최대 색 거리 vs `TIE_BAND`) | 새 단위 테스트: 동일 15장 → false, `order.real20.json` 15장 → true |
| 2 | `lib/order.js` | `orderFeed` 가 photo_plan 을 받는다 — `validatePhotoPlan` 분기, 방향 강제 `none`, 타이브레이크 `null`, `feed_id`/`schema_version`/`applied_profile` 을 plan 형태로 | `orderFeed({targetProfile: plan})` 직접 호출 테스트 |
| 3 | `lib/order.js` | photo_plan 1번 자리 `rationale.value` 를 "지향 없이 사진만으로" 문장으로 | 15장 응답의 1번 문장 확인 |
| 4 | `lib/compose.js` | `composeProfile` 에 photo_plan 분기 → `composeFeed` 가 두 축 모두 처리 | 기존 compose 테스트 무회귀 |
| 5 | `lib/pipeline.js` | 분기 조건을 `kind==='photo_plan'` → `kind==='photo_plan' && !hasOrderingBasis(photos)` 로. `preserveOrder` 의 문장·근거를 "관측된 차이 없음"으로 고치고 죽은 `isPlan` 삼항 제거 | `test/pipeline.test.js` |
| 6 | `test/pipeline.test.js` | 기존 photo-only 테스트의 주장을 실제 규칙에 맞춘다(선언 삭제 없음) + 실사진 15장 photo-only 회귀 테스트 추가: 순서 변경 · 문장 종수 · 근거 역추적 | `npm test` |
| 7 | `test/order.test.js` | 지향 경로 무회귀 고정: 지향 2벌 출력이 변경 전과 동일 바이트 | `npm test` |
| 8 | — | `npm test` · `eval` · `check` · `lint` · `typecheck` + `git diff origin/develop -- test/` 로 삭제된 `test(` 0건 | `report.md` |
