# plan — #10

`CLAUDE.md` 3절 표에서 size/M 은 plan 생략이 원칙이다. 여기서는 **파일 6개가 움직이고 그중 4개가 골든(공유)** 이라 예고용으로 짧게 남긴다.

| # | 파일 | 무엇 | 확인 방법 |
|---|---|---|---|
| 1 | `fixtures/ref_snapshot.sample.json` (신규) | 실제 인스타 스냅샷 30건을 spec 2-1 의 5개 필드로 깎아 넣는다. 좋아요·댓글·URL·이미지는 **안 가져온다** | `npm run check` 가 JSON 파싱 + 의존성 0 확인 |
| 2 | `lib/target_profile.js` (신규, Owned) | 공개 함수 4개 + `UnsupportedReferenceError` + `validatePhotoPlan`. `lib/contracts.js` 는 **import 만** 하고 고치지 않는다 | `node --check`, 아래 3번 |
| 3 | `test/target_profile.test.js` (신규) | spec 6절 정확성 기준 8개 + 7절 경계값 전부를 테스트 1개씩 | `npm test` |
| 4 | `prompts/input/target_extract.md` (신규, Owned) | 모델 경로 계약. 지금은 배선하지 않는다는 것을 문서에 명시 | 사람이 읽음 |
| 5 | `scripts/make_golden_targets.js` (신규) | 골든 2벌 + `ordered_*.json` 의 `applied_profile` 거울을 **재생성**한다. 손으로 JSON 을 고치지 않는다 | `node scripts/make_golden_targets.js` 후 git diff |
| 6 | `eval/golden/case_01/{target,ordered}_{quiet,detail}.json` (교체, 공유) | 5번의 출력 | `npm run eval` — `CLAUDE.md` 3-2절대로 **교체 전후 5개 불변식 비교** |

## 순서

1. 1번 fixture → 2번 lib → 3번 test (테스트가 빨간 것부터 확인하고 통과시킨다)
2. `npm test` / `npm run check` 통과
3. 5번으로 골든 재생성 → `npm run eval` → 교체 전 출력과 나란히 `report.md` 에 붙인다
4. Draft PR. 이슈는 닫지 않는다.

## 안 하는 것

- `schemas/` 4종 수정 — 필요하다고 판단되면 PR 본문에만 적는다
- `lib/contracts.js` 수정 — `PhotoPlan` 검증은 내 파일 안에 둔다
- 화면·UI·확인용 임시 화면
- 모델 호출 배선, 라이브 수집, 배포 설정
