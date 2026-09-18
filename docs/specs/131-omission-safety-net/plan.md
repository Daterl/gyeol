# plan — #131

1. **`.work131/probe/gates.mjs`** — 게이트 값 실측 스크립트를 남긴다.
   확인: 네 경로의 `applied_profile.language` / `caption_coverage` / `source` / GATE1~3 결과가 표로 찍힌다.
2. **`test/generate.test.js`** — 고치기 전에 실패하는 회귀 테스트를 먼저 추가한다.
   - 기본 경로(`kind:'none'`)에서 겹침 ≥ 0.9 인 사진을 넣으면 비움 1개 + `uploaded_photo` 근거
   - 자유입력에서 커버리지를 말하지 않아도 켜짐
   - 겹침 0.899 면 안 켜짐 / `coverage:'all'` 이면 안 켜짐
   확인: `node --test test/generate.test.js` 가 새 테스트에서만 실패한다.
3. **`lib/output-generation.js`** — `stabilizeOmission` 의 게이트를 spec 의 판단 규칙대로 고친다.
   #123 워커가 같은 파일의 `restoreOwnPhotoNotes` / verbatim evidence 영역을 만지므로
   변경은 `stabilizeOmission` 함수 블록 안으로만 좁힌다.
   확인: 2 의 테스트가 통과하고 기존 테스트가 깨지지 않는다.
4. **기존 테스트 조정** — 게이트가 열리면서 기대가 달라지는 기존 assertion 을 조정한다.
   `test()` 선언은 하나도 지우지 않는다. 확인: `git diff origin/develop -- test/` 에서 삭제된 `test(` 0건.
5. **실사진 5회 측정** — `.work131/probe/d5.mjs` 로 실사진 15장 × 5회 D5 결과를 찍는다.
   확인: 회차별 filled/omitted 를 `report.md` 에 그대로 붙인다. 실패해도 그대로 적는다.
6. **게이트 전체** — `npm test` · `npm run eval` · `npm run check` · `npm run lint` · `npm run typecheck`.
7. **Draft PR** — `--base develop`.
