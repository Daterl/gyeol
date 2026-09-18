# 실행 계획
1. 기존 order 회귀검사를 실행하고 실사진 기준선 출력을 보관한다. 사진은 한 장씩 분석한다.
2. lib/curation-voice.js에 관측된 명암·색 차이 기반 컨셉과 자리 설명을 둔다.
3. lib/order.js는 기존 계산을 evidence로 이동하고 value만 교체한다. lib/pipeline.js의 사진만 입력 경로에도 컨셉을 반영한다.
4. test/order*.test.js의 수치 설명 검사를 evidence로 옮기고 컨셉 경계·무근거 생성 방지·순서 보존 검사를 추가한다.
5. scripts/verify-curation-voice.js로 실사진 15장을 재측정하고 전후 표·금지어 검사·근거 보존 결과를 report.md에 남긴다.
6. npm test, npm run eval, npm run check, npm run lint, npm run typecheck를 실행하고 원문 로그를 보존한다.
7. Draft PR에 사람 판정·리뷰 등 미완료 게이트를 명시한다. 화면 및 schemas는 수정하지 않는다.
실행 담당은 이 워커, 사람 리뷰 책임자는 enzo이며 화면 배치는 기존 디에고 구현을 사용한다.

## 리뷰 2회차 계획 (2026-09-18)
0. origin/develop (eb6624d·64965a5 포함) 로 rebase. → 확인: `git merge-base --is-ancestor origin/develop HEAD`
1. 실패하는 회귀 테스트를 먼저 쓴다. → 확인: 수정 전 `npm test` 에서 이 2건만 실패
   - 순서를 바꿔도 컨셉이 슬롯을 따라 이동하지 않음 (test/curation-voice.test.js)
   - 임계 미달 경계에서 `concept` 필드 생략 + 임계 도달에서 rule note 문자열 일치
2. lib/curation-voice.js — `bundleConcept` 이 Claim 또는 null 을 돌려주고 evidence 를 photo_id 로 정렬.
3. lib/contracts.js — `validateFeed` 에 선택적 `concept` 검증. 존재하면 재계산과 전 필드 대조 (omit_summary 패턴).
4. lib/order.js · lib/pipeline.js — 슬롯 변형을 제거하고 `feed.concept` 로 붙인다.
5. src/features/result/result-screen.tsx — 정렬 목록(`<ol>`) 위에 컨셉 문장 + 별도 `<details>` 근거 접힘.
   src/types/contracts.ts 에 optional `concept` 추가. → 확인: `npm run typecheck` exit 0
6. 증거 파일 정리 — 원시 테스트 로그(test.txt/baseline-tests.txt/order-tests.txt/before.json/after.json)를
   재현 명령 + 결과 요약으로 대체. → 확인: `git diff --stat origin/develop...HEAD` 파일 수·용량 감소
7. `npm test` / `check` / `lint` / `typecheck` 실행, `git diff origin/develop -- test/` 삭제 줄 0건 확인.
