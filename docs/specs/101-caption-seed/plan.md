# 구현 및 확인 순서

기준 SHA: 558e21dc3e937d7f787b2c583deec976dea0d1eb. 브랜치 feat/101-caption-seed, PR base develop.

1. 이전 comparison/metrics/caption-v2와 제품 원천을 읽고 intent→spec→plan을 작성한다. npm ci를 선행한다.
2. prompts/output/caption.md만 단서 형식·원문 근거·비움 보존 규칙으로 수정한다. title/shared/schema/화면은 수정하지 않는다.
3. lib/output-generation.js의 비움 0개 안내에 남은 “문장”을 “쓸 거리”로 맞추고 해당 테스트 기대값을 갱신한다. 의미나 개수는 바꾸지 않는다.
4. docs/specs/101-caption-seed/measure.mjs에서 이전 사진/입력을 재사용해 실제 출력 12회를 실행한다. 원문을 먼저 저장하고 형식/P2/P3를 집계한다. 새 분석이 필요하면 한 장마다 analyzePhoto를 호출한다.
5. 각 사진을 직접 열고 180개 슬롯의 소재를 전수 대조한 s4-audit.json과 사람 판정표를 만든다. 실패 시 최대 세 번 수정하며 실패 자료를 지우지 않는다.
6. npm test, npm run eval, npm run check, npm run typecheck, npm run lint 출력과 한계를 report.md에 기록한다. 수정 파일·타이틀 및 schema 무변경을 git diff로 확인한다.
7. feat 브랜치를 push하고 develop 대상 Draft PR 하나를 연다. 사람 판정 pending과 모델/검증 결과를 명시하고 보드를 검토·인수 대기로 갱신한다. merge·배포는 하지 않는다.
