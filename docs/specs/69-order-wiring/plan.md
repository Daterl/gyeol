# plan — #69 순서 제안 실경로 연결

크기: **M** (경계 계약 `schemas/` 를 안 건드리고 입력 이해 영역 안에서 끝난다).
AI 실행 담당: 이 세션 / 사람 리뷰 책임자: enzo.cho (@onejaejae).

## 건드리는 파일

| # | 파일 | 무엇을 | 무엇으로 확인하는가 |
|---|---|---|---|
| 1 | `lib/pipeline.js` | `buildFeed` 의 우회 조건에서 `analysis_source==='heuristic'` 제거, `photo_plan` 만 남기고 **왜 남는지** 주석. `preserveOrder` 근거 문장도 남는 경로에 맞게 정리 | `npm test` — 기존 `test/pipeline.test.js:11` (target `none` → '그대로') 가 계속 통과해야 한다 |
| 2 | `lib/order.js` | `measured()` 와 `rationale()` 의 구도 구절을 `analysis_source === 'vision_model'` 일 때만 낸다 (spec 2-3) | 새 테스트 + `npm test` 전체 |
| 3 | `test/pipeline.test.js` | 회귀 테스트 3개 추가: (a) 휴리스틱 + text 지향 → 입력과 다른 순서, (b) 같은 사진 2벌 지향 → `position` 정렬 `photo_id` 다름, (c) 휴리스틱 근거 문장에 구도 구절 없음 | `npm test` |
| 4 | `docs/specs/69-order-wiring/report.md` | 실행 출력과 DoD 항목별 판정 | 사람이 읽는다 |

**안 건드리는 것:** `schemas/` 4종 · `eval/` · `src/`(디에고 소유 화면) · 배포 설정 · `lib/target_profile.js`(palette 는 기록만).

## 순서

### 1단계 — `lib/order.js` 구도 문구 정직화 (먼저 한다)
2단계보다 먼저 하는 이유: 2단계가 이 문장을 프로덕션에 내보내므로, 내보내기 전에 고쳐야 한다.
- `attributes()` 가 이미 `source` 를 싣고 있으므로 새 필드를 만들지 않는다.
- `measured(photo)`: `source==='vision_model'` 일 때만 구도 구절을 붙인다.
- `rationale()`/`openerText()`: `flatWord` 를 같은 조건으로 낸다. 없으면 `밝기 X · 채도 Y` 까지만 말한다.
- **점수(`WEIGHT`)와 `flat` 자체는 안 건드린다.** 휴리스틱에서 상수라 순위에 영향이 없다.
- 확인: `npm test` (특히 `test/order.test.js` 의 E1~E11·S1)

### 2단계 — `lib/pipeline.js` 우회 조건 축소
- `target.kind==='photo_plan' || photos.some(...heuristic)` → `target.kind==='photo_plan'`
- `preserveOrder` 위 주석을 "#41 이 끝나면 교체" 에서 **"photo_plan 은 TargetProfile 이 아니라 `orderFeed` 의 `validateProfile` 을 통과하지 못한다"** 는 현재 이유로 교체한다.
- `preserveOrder` 안의 `rule` 근거 note 도 "사진 계획 또는 제한된 픽셀 분석에서는" → 사진 계획 경로만 남은 현실에 맞춘다.
- 확인: `npm test` — `test/pipeline.test.js:11` 이 `identity.target={kind:'none'}` 으로 '그대로' 를 단언하므로 이 테스트가 photo_plan 분기 유지의 회귀 검사다.

### 3단계 — 회귀 테스트 추가 (`test/pipeline.test.js`)
`test/order.real20.json` 15장(전부 휴리스틱)을 `buildFeed` 에 넣는다 — 합성 카드가 아니라 실측값이어야 순서 차이가 증명된다.
- (a) W1: `position` 정렬 `photo_id` !== 입력 순서
- (b) W2: 지향 `'짧게, 조용하게'` vs `'자세하게, 기록하듯'` → `position` 정렬 `photo_id` 배열이 다름
- (c) W3: 모든 슬롯에 `kind:'uploaded_photo'` 근거가 있고 `ref` 가 입력 사진
- (d) W4: 휴리스틱 사진 근거 문장에 `넓게 깔` 문구 없음
- 확인: `npm test`

### 4단계 — 실 HTTP 경로 실행 증거 (DoD 1번)
`scripts/` 에 영구 파일을 만들지 않는다. 일회성 스크립트를 `.probe/`(gitignore 대상, 커밋 안 함)에서 돌리고 **출력만** `report.md` 에 붙인다.
- `handleFeed(new Request('http://localhost/api/feed', …))` 로 15장 투입 → 응답 JSON 에서 순서·근거 출력
- 지향 2벌 각각 실행 → 두 배열 비교
- 확인: 터미널 출력을 그대로 `report.md` 에 붙인다

### 5단계 — 전체 게이트
`npm test` → `npm run eval` → `npm run check` → `npm run lint` → `npm run typecheck` 를 실제로 돌리고 출력을 `report.md` 에 붙인다.

### 6단계 — Draft PR
`--base develop --draft`. 본문에 `Refs #69` 하나만. 검증 출력 요약 + 안 한 것(`visual.palette` 미충족, `photo_plan` 순서 유지) 명시. **이슈를 닫지 않는다.**

## 막히면
3회 고쳐도 안 되면 `gh issue comment 69` 로 무엇이 왜 막혔는지 남기고 칸반을 '막힘'(d4be9059) 으로 바꾸고 멈춘다.
