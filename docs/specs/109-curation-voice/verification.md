# 검증 — 재현 명령과 결과 요약 (2026-09-18, 리뷰 2회차)

원시 로그(test.txt · baseline-tests.txt · order-tests.txt · eval.txt · check.txt · lint.txt ·
typecheck.txt · before.json · after.json)는 리뷰 소음이라 지웠다. 아래 명령으로 그대로 재현된다.

기준: `feat/109-curation-voice` @ `origin/develop` rebase 직후 (develop = 64965a5 포함).
환경: Node 22 (레포 요구 버전은 24 — 이 차이는 미해소로 남는다).

| 명령 | exit | 결과 요약 |
|---|---|---|
| `npm test` | 0 | 276/276 통과 (develop 기준선 268 + 이 PR 회귀 8) |
| `npm run -s test:ui` | 0 | 37/37 통과 (화면 회귀 2건 포함) |
| `npm run -s check` | 0 | JS/JSON 78개 파일, 스키마 예시 4종 = fixtures 일치 |
| `npm run -s lint` | 0 | biome 42개 파일, 오류·경고 0 |
| `npm run -s typecheck` | 0 | next typegen + tsc --noEmit |
| `npm run -s eval` | 0 | E1·E2·E3·E8·E9·E10·E11 PASS, 의도된 broken 케이스는 EXPECTED FAIL. E4·E5·E7 은 자동 판정 없음(수동) |
| `node scripts/verify-curation-voice.js` | 0 | 실사진 15장 재분석 — before/after 피드를 다시 생성한다 (지운 before.json·after.json 을 이 명령이 만든다) |
| `git diff origin/develop -- test/` | — | 삭제 줄 0건 (#84·#89·#95·#99·#96 테스트 보존 확인) |

## 회귀 테스트가 공허하지 않음을 확인한 방법
지적 1·2 각각에 대해 **고치기 전에 먼저 실패하는 것을 확인**했다.

1. 피드 단위 컨셉 (지적 1)
   - `test/curation-voice.test.js` 4건 추가 → 수정 전 `node --test test/curation-voice.test.js` = pass 4 / **fail 4**
   - `src/features/result/result-screen.test.ts` 2건 추가 → 옛 구현(첫 슬롯 주입 + 컨셉 섹션 없음)으로
     되돌려 실행하니 **2건 실패**, 새 구현에서 4/4 통과. 즉 화면 배치 자체를 검사한다.
2. abstention (지적 2)
   - 경계값 0.25 = 컨셉 있음, 0.2499·0.449·0.4499 = `Object.hasOwn(feed,'concept') === false`
   - rule note 문자열을 `assert.equal` 로 전문 대조하고, 어떤 근거에도 `/비운다/` 가 없음을 확인
   - 위조 방어: 측정 미달인데 concept 를 끼워 넣거나 value·evidence·evidence 길이를 바꾸면 `ContractError: concept`

## 아직 안 된 것
- **사람 인스타 적합성 0/15.** 통과율 미측정이며 이 PR 은 인수 완료가 아니다.
- 에이전트 의견 5/15 는 반복적인 설명으로 X 판정이 남아 있다 (`agent-review.json`).
- 브라우저 인수, 다중 모델 리뷰, Node 24 재검증 pending.
