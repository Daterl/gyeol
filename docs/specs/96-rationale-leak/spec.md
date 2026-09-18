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
