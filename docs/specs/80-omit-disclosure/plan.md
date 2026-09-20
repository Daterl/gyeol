# plan — 비움 공개(omission disclosure) (#80)

> **재작업 (2026-09-18).** 첫 시도인 PR #90 은 머지되지 않고 닫혔다. 같은 파일을 만진 PR #87
> (`caption_coverage`)이 먼저 develop 에 들어갔기 때문이다. 이 계획의 설계(서버 계수 + `validateOmission`)는
> 그대로 두고, 브랜치를 `origin/develop`(#87 포함) 위에서 새로 파 다시 올린다. 바뀐 것은 아래 6·7번 줄과
> 5단계뿐이다.

크기: **M**. 경계 계약(`schemas/` 4종)을 건드리지 않고, 연결 계약 문서 한 줄과 서버 파일 3개를 만진다.

## 건드리는 파일

| # | 파일 | 무엇을 | 소유자 / 리뷰 |
|---|---|---|---|
| 1 | `lib/interaction.js` | `validateGenerateResponse` 에 `omission` 선택 필드 허용 + **세지 않고 지어낸 값을 거부하는 검증** 추가 | enzo (본인) |
| 2 | `lib/output-generation.js` | mode=all 결과에 `omission` 을 계산해 붙인다 | **diego 소유 — 리뷰 요청 대상.** 승인된 로컬 초안 편집 범위(CLAUDE.md 0·4절) |
| 3 | `schemas/interaction.md` | `POST /api/generate` 절에 `omission` 한 줄 추가 | **diego 결정 문서 — 리뷰 요청 대상.** 추가만, 기존 필드 의미 변경 없음 |
| 4 | `prompts/output/omit_reason.md` | "이 개수는 서버가 세서 응답에 적는다" 한 줄. 모델에게 주는 지시는 **바뀌지 않는다** | **diego 소유 — 리뷰 요청 대상** |
| 5 | `test/generate.test.js` | 기존 mode=all deepEqual 기대값에 `omission` 반영 + 새 테스트 | enzo (본인) |
| 6 | `src/types/contracts.ts` | `GenerateResponse` 에 `omission` 타입만 추가 (Codex 리뷰 지적). 화면 구현은 범위 밖 | enzo (본인) |
| 7 | `docs/specs/80-omit-disclosure/report.md` | 0개 회차 / 0개 아닌 회차 실제 출력 + 결함 주입 결과 | enzo (본인) |

`src/` 는 타입 한 곳 말고 건드리지 않는다. `schemas/` 4종은 건드리지 않는다. #87 의 `caption_coverage` 동작은 바꾸지 않는다.

## 순서

### 1단계 — 계약 검증부터 (`lib/interaction.js`)
`omission` 을 허용하고, 동시에 **거짓 값을 거부**한다. 검증을 먼저 쓰는 이유: 이 필드의 존재 이유가 "추론이 아니라 실측"이라서, 그걸 강제하는 코드가 없으면 필드 자체가 무의미하다.

**확인:** `node --test test/interaction.test.js` — 기존 `{output:...}` (omission 없음) 응답이 여전히 통과한다.

### 2단계 — 계산 (`lib/output-generation.js`)
`stabilizeOmission` 이 끝난 **뒤** 최종 `output.slots` 를 세서 붙인다. 순서가 중요하다 — 안정화 규칙이 만든 비움도 세야 한다.

**확인:** `node --test test/generate.test.js`

### 3단계 — 테스트
- 기존 mode=all deepEqual 기대값 갱신 (omission 추가)
- 새 테스트 3개:
  - 전부 filled → `omitted:0, note_key:'omission.none'`
  - 전부 omitted → `omitted:3, note_key:'omission.some'`
  - `stabilizeOmission` 이 1자리 바꾼 회차 → `omitted:1` (바뀐 뒤 개수)
  - mode=slot → `omission` 없음
  - 조작한 `omitted` 값 → `MODEL_CONTRACT` 거부

**확인:** `npm test` 전체 통과

### 4단계 — 문서 (`schemas/interaction.md`, `prompts/output/omit_reason.md`)
한 줄씩. 모델 지시는 바꾸지 않는다.

**확인:** `node --test test/output-prompts.test.js` (금지어 검사 포함)

### 5단계 — 실증 (`report.md`)
같은 입력으로 **모델이 0개를 낸 회차**와 **0개가 아닌 회차**를 재현해 응답 JSON 을 나란히 붙인다.
두 갈래로 나눈다.
- **결함 주입**: 서버의 계수 코드를 6가지로 망가뜨리고 `/api/generate` 가 `MODEL_CONTRACT 502` 로 거부하는지 본다. 목 provider 를 쓴다.
- **실모델 3회**: `.env` 의 키로 실제 provider 를 호출해 `some` 분기와 `none` 분기가 실경로에서 붙는지 본다.

무엇이 목이고 무엇이 실모델인지 report 에 회차별로 명시한다.

**확인:** `npm test && npm run eval` 출력 전문 첨부

### 6단계 — Draft PR (`--base develop`)
본문에 이슈 번호 하나(`Refs #80`), 검증 출력 요약, diego 리뷰가 필요한 파일 3개, 아직 안 된 것(실모델 반복 실측·화면 반영).

## 하지 않는 것

- 프롬프트를 강제형으로 바꾸지 않는다
- `stabilizeOmission` 의 임계값·조건을 건드리지 않는다
- temperature·모델 교체를 하지 않는다
- 화면을 만들지 않는다
