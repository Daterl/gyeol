# spec — 비움 공개(omission disclosure) (#80)

## 1. 한 줄

`POST /api/generate` 의 **mode=all 응답에 `omission` 필드를 하나 더 둔다.** 이 필드는 그 응답의 `output.slots` 를 실제로 세서 만든다.

## 2. 입력 / 출력 계약

### 입력
바뀌지 않는다. 요청은 그대로 `{schema_version:"1.0", mode:"all"|"slot", feed, context, photo_id?}` 다.

### 출력 — mode=all

```jsonc
{
  "output": { "title": "...", "slots": [ ... ] },   // 기존 F3Export. 바뀌지 않는다
  "omission": {
    "omitted": 0,                                    // 정수 ≥ 0
    "total": 15,                                     // 정수 ≥ 1
    "note_key": "omission.none",                     // "omission.none" | "omission.some"
    "note": "이번에는 15자리 모두에 문장을 두는 편이 낫다고 봤어요.",
    "evidence": [
      { "kind": "rule", "ref": "gyeol.omit.disclosure",
        "note": "생성 결과의 omitted 슬롯을 세어 0/15로 적었다" }
    ]
  }
}
```

### 출력 — mode=slot
**`omission` 을 붙이지 않는다.** 한 슬롯만 보고 피드 전체의 비움 개수를 말할 수 없다. 없는 사실을 만들지 않는다(S4).

### 왜 `output` 안이 아니라 옆인가
`F3Export` 는 사용자 draft·내보내기(`validateExport` / `validateEditedExport`)가 같이 쓰는 모양이다. 여기에 필드를 넣으면 **사용자가 재정렬·편집한 draft 에도 서버 시점의 개수가 따라붙어** 실제와 어긋난다. `omission` 은 **서버가 낸 그 응답에 대한 사실**이므로 응답 envelope 에 둔다.

## 3. 판단 규칙

| 이름 | 규칙 |
|---|---|
| `omitted` | `output.slots.filter(s => s.caption_state === 'omitted').length` |
| `total` | `output.slots.length` |
| `note_key` | `omitted === 0` 이면 `omission.none`, 아니면 `omission.some` |
| `note` | 0개: `이번에는 {total}자리 모두에 문장을 두는 편이 낫다고 봤어요.` / 그 외: `{total}자리 중 {omitted}자리는 사진만 두는 편이 낫다고 봤어요.` |
| `evidence` | `[{kind:'rule', ref:'gyeol.omit.disclosure', note:'생성 결과의 omitted 슬롯을 세어 {omitted}/{total}로 적었다'}]` |

두 문장은 **같은 서술어(`…편이 낫다고 봤어요`)** 로 끝난다. 0개가 실패로 읽히지 않게 하려는 의도적 선택이다. "미완성", "채워 주세요", "몇 개만 더" 같은 표현은 `prompts/shared/style_guard.md` 가 금지한다.

계산 주체는 **서버**다. 모델이 아니다. 모델이 이 필드를 보내와도 서버가 센 값으로 덮는다 — 모델에 보내는 structured output 스키마에 이 필드가 없으므로 정상 경로에서는 오지 않는다.

## 4. 정확성 기준 — 무엇을 하면 틀린 것인가

`lib/interaction.js` 의 `validateGenerateResponse` 가 아래를 **강제한다.** 하나라도 어긋나면 응답이 거부된다.

1. `omitted` 가 `output.slots` 의 실제 omitted 개수와 다르다 → 틀림
2. `total` 이 `output.slots.length` 와 다르다 → 틀림
3. `note_key` 가 `omitted` 와 어긋난다 (0개인데 `omission.some` 등) → 틀림
4. `note` 가 빈 문자열이거나 200자 초과 → 틀림
5. `evidence` 에 `gyeol.omit.disclosure` rule 근거가 없다 → 틀림
6. mode=slot 응답에 `omission` 이 있다 → 틀림

이것이 "이 사실을 추론으로 만들지 마라(P2)" 의 집행 지점이다. **세지 않고 지어낸 값은 계약을 통과하지 못한다.**

## 5. 경계값

| 경우 | 기대 |
|---|---|
| 슬롯 15개, omitted 0개 | `{omitted:0,total:15,note_key:"omission.none"}` |
| 슬롯 15개, omitted 15개 (전부 비움) | `{omitted:15,total:15,note_key:"omission.some"}` — 전부 비움도 성공 결과다 |
| 슬롯 3개, omitted 1개 | `{omitted:1,total:3,note_key:"omission.some"}` |
| 기존 안정화 규칙(`stabilizeOmission`)이 1자리를 omitted 로 바꾼 회차 | 개수는 **바뀐 뒤** 값을 센다. 규칙이 만든 비움도 비움이다 |
| mode=slot | `omission` 없음 |

## 5-1. PR #87 의 `caption_coverage` 와의 관계

둘은 **서로 다른 기능**이고, 이 변경은 #87 의 동작을 건드리지 않는다.

| | #87 `caption_coverage` | #80 `omission` |
|---|---|---|
| 방향 | 입력 — 사용자가 요청한 커버리지 **의도** 보존 | 출력 — 그 응답의 실제 비움 **개수** 고지 |
| 값의 출처 | 자유 텍스트 정규 추출(`extractFromFreetext`) | 최종 `output.slots` 계수 |
| 읽는 곳 | `stabilizeOmission` 의 분기, `validateCanonicalCoverage` | `discloseOmission` 이후 `validateOmission` |

`coverage==='all'` 이면 `stabilizeOmission` 이 새 비움을 만들지 않으므로 비움이 0개로 끝나는 경우가 많다.
그 회차에도 **고지는 실측을 따른다** — `omitted:0, note_key:'omission.none'`. 요청 의도가 아니라 결과를 센다.
반대로 `sparse` 라 안정화 규칙이 한 자리를 비운 회차는 **규칙 적용 뒤** 개수를 센다.

## 6. 기존 `schemas/` 4종과의 관계

`target_profile.md` · `current_profile.md` · `photo_analysis.md` · `ordered_feed.md` 는 **바꾸지 않는다.** 이 변경은 그 4종의 어떤 필드도 읽지 않고 의미도 바꾸지 않는다.

`schemas/interaction.md`(화면·서버 연결 계약, diego.yoon 결정)는 `POST /api/generate` 의 응답 모양을 적은 문서이므로 **한 줄 추가**가 필요하다. 필드를 지우거나 기존 필드 의미를 바꾸지 않는 **추가**이며, 소유자 리뷰 대상으로 PR 본문에 명시한다.

## 7. 완료 조건 (관측 가능)

- [ ] `npm test` 통과
- [ ] `npm run eval` 통과
- [ ] mode=all 응답에 `omission` 이 항상 있고, `omitted` 가 실제 omitted 슬롯 수와 같다
- [ ] mode=slot 응답에 `omission` 이 없다
- [ ] `omitted` 를 실제와 다르게 조작한 응답이 `MODEL_CONTRACT` 로 거부된다
- [ ] **같은 입력으로 비움 0개 회차와 0개가 아닌 회차의 실제 출력이 `report.md` 에 나란히 있고 서로 다르다**
- [ ] 비움 개수 분포를 바꾸는 코드·프롬프트 변경이 diff 에 없다
- [ ] `caption_coverage` 가 `all` 인 회차에서도 고지가 실측과 일치한다 (#87 와 충돌하지 않는다)
- [ ] `src/types/contracts.ts` 의 `GenerateResponse` 에 `omission` 타입이 있다
