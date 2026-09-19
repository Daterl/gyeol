# report — 비움 0개 고지를 develop(#87 포함) 위에 다시 올린다 (#80)

브랜치 `feat/80-omit-disclosure-v2`, base `develop` (`136c23d` = PR #87 머지 시점).

## 0. 왜 재작업인가

`#80` 을 두 갈래가 동시에 작업했다.

| | 무엇 | 결과 |
|---|---|---|
| PR #87 | `caption_coverage: Claim<"all"\|"sparse">` — 사용자가 요청한 커버리지 **의도**를 보존한다 | develop 머지됨 |
| PR #90 | `omission{...}` — 결과의 비움 **개수**를 고지한다 | 머지되지 않고 닫힘 |

두 기능은 다른 것이다. #87 본문도 스스로 "이 PR 은 #80 을 닫지 않습니다" 라고 적었다.
현재 develop 의 `lib/output-generation.js` 에 `omission` 은 0건이고, 사용자 결정("0개면 그 사실을 결과에 쓴다")이 아직 반영돼 있지 않다.

이번 PR 은 #90 의 설계를 그대로 유지한 채 **#87 이 들어온 develop 위에 다시 올린다.** `caption_coverage` 의 동작은 한 줄도 바꾸지 않았다.

## 1. 무엇이 바뀌었나

| 파일 | 변경 |
|---|---|
| `lib/interaction.js` | `OMISSION_RULE`, `validateOmission` 추가. `validateGenerateResponse` 의 mode=all 분기에서 `omission` 을 선택 필드로 허용하고, 있으면 **실제 slots 와 대조해 검증**한다 |
| `lib/output-generation.js` | `discloseOmission` 추가. `stabilizeOmission` **뒤**에 최종 `output.slots` 를 세서 mode=all 응답에 붙인다 |
| `schemas/interaction.md` | 응답 계약 한 줄 (`coverage==='all'` 회차의 고지 규칙 포함) |
| `prompts/output/omit_reason.md` | 한 줄 — 개수를 맞추려고 비우거나 채우지 않는다, 이 필드는 모델이 쓰지 않는다 |
| `src/types/contracts.ts` | `Omission` 타입 + `GenerateResponse` 에 `omission?` (Codex 리뷰 지적 반영). 화면 구현은 범위 밖 |
| `test/generate.test.js` | `slotsOnly` 헬퍼 + 새 테스트 3개 |

### #87 과 겹치지 않는 이유

| | #87 `caption_coverage` | #80 `omission` |
|---|---|---|
| 방향 | 입력 — 요청한 의도 | 출력 — 실제 결과 |
| 출처 | `extractFromFreetext` 정규 추출 | 최종 `output.slots` 계수 |
| 코드 지점 | `validateCanonicalCoverage`, `stabilizeOmission` 의 분기 | `discloseOmission` → `validateOmission` |

같은 파일을 만지지만 같은 줄을 만지지 않는다. `coverage==='all'` 이라 비움이 0개로 끝난 회차에도 고지는 **실측**을 말한다 (아래 4절 3회차).

## 2. 순서가 중요하다

```
모델 응답
  → validateGenerateResponse (omission 없음 — 모델 스키마에 이 필드가 없다)
  → stabilizeOmission        (#87 의 coverage 분기가 여기서 동작)
  → discloseOmission         (이 시점의 output.slots 를 센다)
  → validateGenerateResponse (센 값이 slots 와 맞는지 다시 검증)
```

안정화 규칙이 만든 비움도 세야 하므로 `discloseOmission` 은 반드시 `stabilizeOmission` 뒤다.
`omission` 을 **선택 필드**로 둔 이유는 첫 번째 검증이 모델 원본(omission 없음)을 통과해야 하기 때문이다.

## 3. 결함 주입 — `validateOmission` 이 실제로 거부하는가

서버의 계수 코드(`discloseOmission`)를 6가지로 망가뜨리고 `handleGenerate` 로 `/api/generate` 를 호출했다.
**목(mock) provider 를 쓴다** — 여기서 보려는 것은 모델 품질이 아니라 계약 검증의 동작이다.

재현: `node docs/specs/80-omit-disclosure/fault-injection.mjs` (끝나면 원본 복구).
두 회차를 각각 돌렸다. 같은 결함이라도 그 회차에서 실제로 틀린 값이 될 때만 거부된다.

| 주입 | 비움 0개 회차 (filled 3/3) | 비움 3개 회차 (all_omitted) |
|---|---|---|
| 없음 (기준선) | HTTP 200 · `omitted:0, note_key:"omission.none"` | HTTP 200 · `omitted:3, note_key:"omission.some"` |
| 개수 틀림 (`omitted+1`) | **502 MODEL_CONTRACT** | **502 MODEL_CONTRACT** |
| 총계 틀림 (`total=15`) | **502 MODEL_CONTRACT** | **502 MODEL_CONTRACT** |
| 키 틀림 (항상 `some`) | **502 MODEL_CONTRACT** | 200 — 이 회차에선 `some` 이 맞는 값 |
| 키 틀림 (항상 `none`) | 200 — 이 회차에선 `none` 이 맞는 값 | **502 MODEL_CONTRACT** |
| 근거 규칙 제거 (`gyeol.omit.overlap` 로 교체) | **502 MODEL_CONTRACT** | **502 MODEL_CONTRACT** |
| `note` 를 빈 문자열로 | **502 MODEL_CONTRACT** | **502 MODEL_CONTRACT** |

6종 전부 "그 회차에서 틀린 값일 때" 거부된다. 주입 뒤 `lib/output-generation.js` 는 원본으로 복구했다(`git diff --stat` 로 확인 — 16 insertions, 주입 전과 동일).

단위 수준 재현은 `test/generate.test.js` 의 `a generation response cannot claim an omission count it did not measure` 에 남겼다 — 조작 7종을 `validateGenerateResponse` 에 직접 넣어 전부 throw 시킨다.

## 4. 실모델 3회 — 실경로에서 붙는가

`.env` 의 `ANTHROPIC_API_KEY` + `ANTHROPIC_WORKSPACE_ID` 로 실제 provider 를 호출했다. 사진 15장, `mode=all`.
**개수를 유도하지 않았다.** 프롬프트·temperature 는 develop 그대로다.

| 회차 | target 자유 텍스트 | `caption_coverage` | 모델+서버 결과 | `note_key` |
|---|---|---|---|---|
| 1 | 차분하고 미니멀한 흑백 감성. 말수가 적고 여백이 많은 기록. | `sparse` | omitted **14/15** (8081ms) | `omission.some` |
| 2 | (동일) | `sparse` | omitted **14/15** (7869ms) | `omission.some` |
| 3 | 모든 사진에 문장을 써 줘. 차분한 흑백 감성. | `all` | omitted **0/15** (6613ms) | `omission.none` |

3회차 응답:

```json
{"omitted":0,"total":15,"note_key":"omission.none",
 "note":"이번에는 15자리 모두에 문장을 두는 편이 낫다고 봤어요.",
 "evidence":[{"kind":"rule","ref":"gyeol.omit.disclosure","note":"생성 결과의 omitted 슬롯을 세어 0/15로 적었다"}]}
```

## 5. 이 증거가 말하지 않는 것 (솔직하게)

- **3회차의 0개는 "모델이 중립 입력에서 0개를 냈다" 는 증거가 아니다.** target 이 명시적으로 "모든 사진에 문장을 써 줘" 였고, `coverage==='all'` 이면 `stabilizeOmission` 이 새 비움을 만들지 않는다. 0개가 나올 만한 입력을 준 것이다. 이 회차가 보여주는 것은 **`none` 분기가 실모델 경로에서 실제로 붙고 실측과 일치한다**는 것, 그리고 **#87 의 `all` 동작과 충돌하지 않는다**는 것 두 가지다.
- **중립 입력에서 0개가 나오는 회차는 이번에도 실모델로 관측하지 못했다.** 1·2회차는 둘 다 14개였다. 이전 Codex 리뷰의 실모델 4회도 전부 `some` 이었다. 0개가 안 나오는 것은 결함이 아니다 — 그 분기가 그 입력에서 안 쓰일 뿐이다. 억지로 0개를 만들지 않았다.
- **이슈 #80 의 `0/12/0/13/0/12` 는 이슈에 적힌 기록이고, 이번 PR 이 실모델로 재현한 분포가 아니다.** 이전 PR #90 의 `repeat-runs.mjs` 는 그 개수를 목 응답으로 **재생**한 스크립트다. 계수 구현 확인에는 유효하지만 모델 분포의 독립 증거가 아니다.
- **모델에게 주는 지시 문장은 한 줄 늘었다.** 정확한 표현은 "한 글자도 바뀌지 않았다" 가 아니라 **"강제 비움·채움이나 후처리 개수 변경을 추가하지 않았다"** 다. 추가한 줄은 개수 맞추기를 금지하고 `omission` 을 모델이 직접 쓰지 못하게 설명한다. 새 최소 비움 수·목표 quota·temperature 변경은 없다.
- **화면은 만들지 않았다.** 타입만 추가했다. 사용자가 이 문장을 실제로 보는지는 후속 작업이다.
- **`stabilizeOmission` 은 base 부터 있던 규칙이고 이번 PR 이 만들지 않았다.** "저장소 전체에 비움 후처리가 전혀 없다" 는 뜻으로 읽으면 안 된다.

## 6. 검증 명령 5종

| 명령 | 결과 | 증거 |
|---|---|---|
| `npm test` | PASS | tests 211 / pass 211 / fail 0 |
| `npm run eval` | PASS | quiet/detail 불변식 통과, 의도된 broken 입력 EXPECTED FAIL, 주입 모델 variant 0/1 통과 |
| `npm run check` | PASS | 65 JS/JSON files checked; four schema examples match fixtures |
| `npm run lint` | PASS | Checked 40 files; No fixes applied |
| `npm run typecheck` | PASS | next typegen 성공, `tsc --noEmit` 종료 성공 |

`npm run eval` 은 스스로 밝히듯 E4/E5/E7 은 manual spot-check only 다. 배포·브라우저 화면 검사는 하지 않았다.

## 7. 완료 조건 대조 (spec.md 7절)

- [x] `npm test` 통과
- [x] `npm run eval` 통과
- [x] mode=all 응답에 `omission` 이 항상 있고 `omitted` 가 실제 omitted 슬롯 수와 같다
- [x] mode=slot 응답에 `omission` 이 없다
- [x] 조작한 값이 `MODEL_CONTRACT` 로 거부된다 (3절)
- [x] 비움 0개 회차와 0개가 아닌 회차의 실제 출력이 나란히 있고 서로 다르다 (4절 — 단 0개 회차는 `coverage=all` 입력이다, 5절)
- [x] 비움 개수 분포를 바꾸는 코드 변경이 diff 에 없다 (프롬프트는 한 줄 추가 — 5절에 명시)
- [x] `caption_coverage` 가 `all` 인 회차에서도 고지가 실측과 일치한다
- [x] `src/types/contracts.ts` 의 `GenerateResponse` 에 `omission` 타입이 있다

## 8. 남은 것

- 화면 연결 — `omission.note` 를 결과 화면에 어떻게 보이느냐 (별도 이슈)
- 중립 입력에서의 0개 회차 실모델 관측 — 필요하면 별도 실험. 이번 범위 아님
- `schemas/interaction.md` · `prompts/output/omit_reason.md` · `lib/output-generation.js` 는 diego 소유 — 리뷰 대상
