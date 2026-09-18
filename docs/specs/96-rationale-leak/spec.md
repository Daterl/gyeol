# 무엇을 만드는가 — 출력 모델 입력의 슬롯 화이트리스트

## 1. 바뀌는 지점 하나

`lib/output-generation.js` 의 `generateOutput` 이 출력 모델 user 메시지로 싣는 JSON.

**전**
```
{ mode, applied_profile, slots: [ OrderedFeed 슬롯 통째 ] }
```
슬롯 통째 = `{position, photo_id, narrative_role, rationale, caption_inputs}`.

**후**
```
{ mode, applied_profile, slots: [ {position, photo_id, caption_inputs} ] }
```

## 2. 왜 그 세 필드인가 (추측이 아니라 확인)

`prompts/output/*.md` 와 `prompts/shared/style_guard.md` 전체를 훑어 슬롯 필드 참조를 센 결과:

| 필드 | 프롬프트에서 쓰이는가 | 근거 |
|---|---|---|
| `position` | 쓴다 | caption.md "받은 feed 의 photo_id 와 원래 position 을 유지한다" |
| `photo_id` | 쓴다 | caption.md 같은 문장 / evidence 의 ref |
| `caption_inputs.describable_facts` | 쓴다 | caption.md "해당 슬롯의 describable_facts 에서만 말한다" |
| `caption_inputs.adjacent_overlap` | 쓴다 | omit_reason.md "제안 재료" |
| `caption_inputs.is_visual_peak` | 쓴다 | omit_reason.md 같은 문장 |
| `narrative_role` | **쓰지 않는다** | `grep -rn "narrative_role" prompts/` → 0건 |
| `rationale` | **쓰지 않는다** | `grep -rn "rationale" prompts/` → 0건 |

`applied_profile` 은 그대로 둔다. caption.md 가 `applied_profile.language` 로 길이·문체를
참고하라고 명시하고, title.md 가 `target_only`/`corrected` 를 읽는다. 이슈 범위 밖이다.

## 3. 입력/출력 계약

- **스키마 무변경.** `schemas/ordered_feed.md` 의 `slots[].rationale` 은 그대로다.
  OrderedFeed 객체 자체는 아무것도 잃지 않는다. 바뀌는 것은 **그 객체에서 출력 모델에게
  복사해 보내는 부분집합** 하나다. `validateFeed` · `validateGenerateRequest` ·
  `validateGenerateResponse` 는 전부 원본 `input.feed` 를 계속 본다.
- **응답 계약 무변경.** `{output:{title,slots[]}}` / `{slot}` 그대로.
- **mode=slot** 도 같은 화이트리스트를 거친다 (필터 뒤에 map).

## 4. 이중 방어 — 프롬프트 규정

`prompts/shared/style_guard.md` 에 한 줄을 넣는다: 순서·비움을 정할 때 쓴 내부 규칙의
이름·용어·측정 수치를 제목이나 문장의 소재로 쓰지 않는다. 금지 예시를 함께 적는다
(`색 거리`, `지향 방향`, `앞자리`, `R1~R4`, 좌표·점수 수치).

style_guard 에 넣는 이유: title.md 와 caption.md 양쪽에 중복해 적을 필요가 없고,
그 파일이 이미 "공통 출력 문체" 로 두 프롬프트에 모두 로드되기 때문이다.

**1번이 근본이고 2번은 이중 방어다.** 1번만으로 막히는지 먼저 실측하고 2번을 넣는다.

## 5. 정확성 기준 — 무엇을 하면 틀린 것인가

- 출력 모델 요청 body 의 `messages[0].content[0].text` 를 파싱했을 때 `slots[*]` 에
  `rationale` 또는 `narrative_role` 키가 하나라도 있으면 **틀렸다.**
- 원본 `input.feed.slots` 가 변형되면 **틀렸다** (계약 검증이 원본을 본다).
- `lib/order.js` 의 rationale 문자열이 달라지면 **틀렸다** (범위 밖).
- 실모델 10회 생성의 `title` · `slots[].text` · `slots[].omit_reason` 중 하나라도
  아래 금지 패턴에 걸리면 **틀렸다.**

### 금지 패턴 (기계 탐지 목록)

이슈의 5개를 포함한 상위집합이며, 전부 `lib/order.js` 의 rationale/evidence 생성기에서
실제로 나오는 어휘다.

```
색 거리 / 측정 색 / 색상각 / 지향 방향 / 지향이 잰
앞자리 / 번에 뒀다 / 자리에 뒀다 / 전환 자리
점수 / 총점 / 보너스 / 측정값 / 상위 밴드
밝기 0. / 채도 0. / 한 색이 넓게
서사 규칙 / R1 / R2 / R3 / R4 / order.r
narrative_role / adjacent_overlap / is_visual_peak / opener / sustain / closer
소수 3자리 이상 수치 (\d\.\d{3,})
```

## 6. 경계값

- `mode='slot'` — 필터 결과 1개에도 화이트리스트가 적용된다.
- `applied_profile.language=null` (photo_plan 1.1 경로) — 화이트리스트와 무관하다.
- `stabilizeOmission` 이 붙이는 `gyeol.omit.overlap` rule evidence 의 note 는
  `adjacent_overlap=` 를 포함한다. 이것은 **서버가 만든 근거 필드**이지 사용자에게 나가는
  문장(title/text/omit_reason)이 아니므로 탐지 대상이 아니다. 근거는 펼쳐 보는 것이라는
  P2 원칙이 그대로 적용된다.

---

# 개정 2 — 프롬프트가 아니라 검증으로 막는다 (PR #108 리뷰 반영, 2026-09-18)

## 개정 이유 — 앞의 spec 이 틀렸던 지점

위 1~3절은 **입력을 줄이는 것**과 **프롬프트 규정**으로 유출을 막았다. 실모델 45회에서
유출 0건이었다. 그러나 리뷰어(jangwonyoon)의 지적이 맞다:

> 모델이 title/text/evidence.note에 `밝기 0.712`, `adjacent_overlap 0.8`,
> `is_visual_peak=false`를 그대로 반환해도 현재 결과 검증이 성공합니다.
> 프롬프트 지시를 한 번 어긴 응답이 사용자 결과로 노출되는 재현이 확인됐습니다.

**프롬프트는 확률이고 검증은 보장이다.** 45회 0건은 "이 모델이 이 입력에서 대체로 지킨다"는
뜻이지 "어긴 응답이 사용자에게 못 나간다"는 뜻이 아니다. 그리고 앞의 45회 측정 자체가
불완전했다 — `evidence.note` 를 검사면에서 빼놓았다. 같은 하네스로 note 까지 검사하자
**10회 중 5회** 유출이 관측됐다(6절).

## 4. 출력 경계 계약 (새로 추가)

`generateOutput` 은 최종 observation 을 사용자에게 돌려주기 전, 아래 필드 전부를 검사한다.
하나라도 걸리면 `ModelError('MODEL_CONTRACT')` — 부분 통과도, 문장 삭제·치환도 없다(실패 폐쇄).

| 검사 대상 | 허용 범위 |
|---|---|
| `output.title` | 피드 **모든** 슬롯의 `describable_facts` |
| `slot.text` | **그 슬롯의** `describable_facts` |
| `slot.omit_reason` | 같음 |
| `slot.evidence[].note` | 같음 |
| `omission.note` · `omission.evidence[].note` | 모든 슬롯의 `describable_facts` |

**금지 표현 (`INTERNAL_EXPRESSIONS`)**
1. 내부 필드명 — `narrative_role` `rationale` `adjacent_overlap` `is_visual_peak`
   `caption_inputs` `caption_state` `applied_profile` `describable_facts` `omit_reason`
   `photo_plan_id` `target_profile_id` `current_profile_id` `empty_caption_ratio`
   `caption_len` `caption_coverage` `emoji_rate` `ending_style` `linebreak_habit`
   `opener_tendency` `composition_mix` `scale_mix` `palette_hex` `hue_mean` `sat_mean`
   `bright_mean`, 그리고 모델에게 새로 넘기는 두 이름
2. `narrative_role` 값(`opener` `sustain` `closer`)과 순서 규칙 이름(`R1`~`R4`, `order.r*`)
3. `lib/order.js` 순서 규칙 어휘 — 서사 규칙 · 상위 밴드 · 총점 · 보너스 · 측정값 ·
   측정 색 · 색 거리 · 색상각 · 지향 방향 · 지향이 잰 · 앞자리 · 전환 자리 ·
   자리에 뒀다 · N번에 뒀다 · 한 색이 넓게
4. 내부 측정 어휘 — 밝기 · 채도 · 점수 · 측정
5. 내부 측정 수치 — `\d+\.\d+` (0.712 · 0.8 · 0.909)

**정확성 기준 (무엇을 하면 틀린 것인가)**

- 금지 표현이 그 사진의 `describable_facts` 에 **실제로 있으면 통과시켜야 한다.**
  거부하면 틀렸다. 사진에 "밝기 0.5 라고 적힌 조절 다이얼"이 관측됐다면 그것은 사진의 사실이다.
- 같은 표현을 **다른 사진의** 문장에 쓰면 거부해야 한다. 그 사진의 사실이 아니다.
- 통과시키면서 문장을 고치지 않는다. 우리가 대신 써 주는 순간 그것은 근거 없는 출력이다.

**경계값**
- `describable_facts` 가 빈 배열 → 금지 표현 전부 거부 (허용 근거가 없다)
- `text=null` (omitted) → 검사 대상이 아니다
- mode=slot → 그 한 슬롯만 검사한다
- 서버가 직접 쓰는 문장(`stabilizeOmission` 의 rule note, `discloseOmission` 의 note)도
  같은 검사를 통과한다. 예외를 두지 않는다 — 그래서 rule note 의 문면을 고쳤다(5절).

## 5. 입력을 더 줄인다 — 넘기지 않은 값은 샐 수 없다

검증만 붙이면 계약은 닫히지만 **거부율 10회 중 5회**가 된다(6절). 원인은 우리 쪽에 있었다:
프롬프트가 내부 필드 이름을 부르고, payload 가 그 값을 실어 주었다.

| 넘기던 것 | 바뀐 것 | 근거 |
|---|---|---|
| `applied_profile` 전체 | `{disclosure, corrected, deltas, language, *_id}` | `visual`·`sequence` 는 `prompts/output/` 참조 0건. 그런데 `visual.palette.value` = `{hue_mean, sat_mean, bright_mean}` — 리뷰가 지적한 `밝기 0.712` 의 출처다 |
| `language` 의 Claim 통째 | Claim 의 `value` 만 | `confidence`(0.7 같은 수치)와 `evidence` 는 프롬프트 참조 0건. 출처 추적은 서버가 계속 한다 |
| `caption_inputs.adjacent_overlap: 0.786` | `앞_사진과_겹침: '높음'\|'낮음'` | 비움 제안에 필요한 것은 세기다. 임계는 서버의 `OMIT_OVERLAP_MIN` 이 결정론적으로 적용하므로 새 상수를 만들지 않았다 |
| `caption_inputs.is_visual_peak: false` | `피드_안에서_색이_가장_진함: false` | 같은 정보, 옮겨 적어도 내부 이름이 아닌 이름 |

**원본 `feed` 는 아무것도 잃지 않는다.** `rationale` · `adjacent_overlap` · `is_visual_peak` ·
Claim 의 `confidence`/`evidence` 는 사용자가 근거를 펼쳐 볼 자리와 계약 검증에 그대로 남는다.
바뀌는 것은 모델에게 **복사해 보내는 부분집합** 하나다. `schemas/` 4종 무변경.
