# 무엇을 만드는가 — 보정축을 순서 판단에 연결한다

## 1. 결정: 무엇을 근거로, 어떻게 반영할 것인가

### 1-1. 결정 요약

> **보정축은 `language.caption_len.p50` 하나를 통해서만 순서에 영향을 준다.**
> 그 반영 경로는 **새 규칙이 아니라 이미 존재하는 두 규칙을 연결하는 것**이다 —
> `lib/compose.js` 가 이미 계산하고 있는 **두 축 합성값**을,
> `lib/order.js` 의 `resolveDirection` 이 **지향 원값 대신** 읽게 한다.

### 1-2. 왜 `caption_len` 인가 — 다른 후보를 실제로 따져 본 결과

보정축이 무엇을 담는지 먼저 읽었다(`lib/current_profile.js`, `schemas/current_profile.md`).
경로별로 실제로 채워지는 필드가 다르다.

| 보정축 입력 | `visual` | `language` | `sequence` |
|---|---|---|---|
| `none` (`present:false`) | `{}` | `null` | `{}` |
| `reference`(내 IG URL) → `fromSnapshot` | **`{}` — 통째로 비어 있다** | caption_len · emoji_rate · ending_style · linebreak_habit · empty_caption_ratio | carousel_count, 조건부 opener_tendency |
| `posts`(내 사진+캡션) → `fromPhotos` | palette, 조건부 composition_mix · scale_mix · subjects | 위와 같음 | `carousel_count: 0` — **opener_tendency 없음** |

여기서 후보들이 하나씩 탈락한다.

| 후보 | 왜 안 되는가 |
|---|---|
| `sequence.opener_tendency`(첫 장 경향) | `posts` 경로에서는 **원리적으로 나오지 않는다**(`carousel_count:0`). `reference` 경로에서도 A2 판정이 "같다"일 때만 나온다. 즉 **비어 있는 것이 정상**인 축이라, 이걸 유일한 통로로 삼으면 이슈가 요구한 4종 중 두 종(`posts` 2자·950자)에서 아무 일도 일어나지 않는다 |
| 시각 축(`palette` · `composition_mix`) | `reference`(URL) 경로에서 `visual` 이 **통째로 비어 있다**. 그리고 이슈가 요구한 4종 중 `posts` 두 종은 **같은 사진 3장**을 쓰므로 시각축 값이 서로 완전히 같다 — 캡션 2자와 950자를 갈라 낼 수 없다 |
| `language.empty_caption_ratio`(비움 비율) | 4종 중 세 종에서 값이 `0` 으로 같다(빈 캡션이 없다). 그리고 이 필드가 답하는 질문은 "캡션을 붙일까 말까" 이지 "어느 사진이 1번인가" 가 아니다. `#80`·`#96` 이 다루는 F3 비움 규칙의 입력이며, 순서로 끌고 오면 필드 의미를 비튼다 |
| **`language.caption_len`** | **두 경로 모두에서 항상 관측된다**(캡션을 한 건이라도 썼으면). 그리고 `lib/order.js` 가 **이미 지향 쪽 `caption_len` 을 방향 신호로 읽고 있다** — 새 신호를 발명하는 게 아니라, 이미 쓰고 있는 신호의 **한쪽 축만 읽던 것을 양쪽으로 고치는 것**이다 |

`lib/order.js` 의 기존 주석이 이 신호의 자격을 이미 논증해 뒀다(파일 머리말):

> *"지향 방향은 시각축이 비어 있어도 정해져야 한다. `ig_reference` 로 뽑은 지향축은 `language` 만
> 채우므로 시각축만 보면 방향이 없고, 방향이 없으면 프로필이 순서를 바꾸지 못한다 — S3 가 깨진다.
> 그래서 잰 캡션 길이를 마지막으로 읽는다."*

**같은 논증이 보정축에도 그대로 성립한다.** 캡션 길이는 "한 게시물에 얼마나 많이 담는 사람인가" 를
말하고, 그건 실제 게시물에서 **잰** 값이다. 지어낸 값이 아니다.

### 1-3. 지향과 충돌할 때 어느 쪽으로 기우는가 — F1-4 를 따른다

`20-product-definition.md` **F1-4(두 축을 어떻게 합치는가)** 에 합성 규칙이 이미 있다. 새로 만들지 않는다.

- 필드 단위로 돈다. **지향에만 있으면 지향**, **현재에만 있으면 현재**, **둘 다 있으면 blend.**
- `caption_len` 은 수치형이고 **둘 다 있는** 필드이므로 `blend` 다.
- **그리고 이 blend 는 이 레포에 이미 구현돼 있다** — `lib/compose.js` 의 `composeProfile` 이
  `log_midpoint` 규칙으로 계산해 `applied_profile.language.caption_len` 과 `deltas[0]` 에 싣는다.

**그래서 이번 작업이 고르는 값은 "새로 정한 합성값" 이 아니라 "이미 화면에 나가고 있는 합성값" 이다.**
이게 이 결정의 핵심 근거다. 지금 상태는 이렇다:

```
화면(applied_profile)  : "레퍼런스는 292자, 당신은 2자 — 29자를 제안합니다"
순서(resolveDirection) : 292자로 방향을 잡는다        ← 화면과 다른 값을 쓴다
```

즉 **제품은 이미 "29자를 제안한다"고 말하고 있는데, 순서만 그 말을 안 듣고 있다.** 여기에 별도의
기울기 상수를 새로 도입하면 한 필드에 합성 규칙이 두 개가 되고, 화면과 순서가 또 갈라진다.
**합성 규칙은 한 곳에만 둔다** — 그것이 이 설계 결정의 이유다.

> ⚠️ **정직하게 적어 두는 어긋남.** F1-4 의 문자 그대로는 `merged = target*0.7 + current*0.3`(tilt 0.7)이고,
> `lib/compose.js` 의 구현은 로그 공간 중점(`log_midpoint`, 사실상 0.5:0.5)이다. **이 어긋남은 이번 작업이
> 만든 것이 아니라 `#13` 이 이미 내보낸 상태**이며, `lib/contracts.js` 가 `delta.rule` 을 `log_midpoint`
> 하나로 못박아 두었다(`oneOf(d.rule,['log_midpoint'],...)`). **여기서 고치지 않는다** — 고치면 이번 PR 이
> 순서 문제가 아니라 간극 카드 수치를 바꾸는 PR 이 된다. PR 본문에 남긴다.

### 1-4. 이 결정이 만드는 결과 (실측 후 `report.md` 에 그대로 옮긴다)

지향 = `ig_reference(29cm)` → `caption_len.p50 = 292`, `visual = {}`.
방향 기준값은 기존 상수 그대로 — `CAPTION_QUIET = 15`, `CAPTION_DENSE = 90`.

| 보정축 | 합성 p50 | 방향 | 순서 |
|---|---|---|---|
| `none` (`present:false`) | 292 (합성 없음) | `dense` | **수정 전과 같다** |
| `ig(29cm)` | 290 | `dense` | 같다 — 지향과 같은 사람이면 같은 것이 맞다 |
| `posts`(캡션 2자) | **29** | **`none`(기본 규칙)** | **갈린다** |
| `posts`(캡션 950자) | 527 | `dense` | 같다 |

캡션 2자인 사람의 합성값 29자는 두 기준값 **사이**로 떨어진다. 그러면 방향이 `none` 이 되고,
`WEIGHT.none` 이 `WEIGHT.dense` 와 다른 사진을 1번으로 고른다 → R1 이 갈리고 R4 사슬이 따라 갈린다.

**`none` 으로 떨어지는 것이 왜 정직한가:** "짧게 쓰는 사람 × 길게 쓰는 레퍼런스" 의 합성값은
어느 쪽이라고 말할 근거가 없는 중간이다. 이때 한쪽으로 미는 것이야말로 근거 없는 판단이다.
기존 코드가 지향 단독일 때 이미 같은 판단을 하고 있다(*"두 기준값 사이는 애매하므로 한쪽으로 밀지 않는다"*).
**새 분기를 만들지 않고 기존 분기가 새 입력을 받는 것뿐이다.**

## 2. 입력/출력 계약

### 2-1. 바뀌는 것

| 항목 | 전 | 후 |
|---|---|---|
| `orderFeed` 의 `currentProfile` 사용처 | `validateProfile` + `applied_profile.current_profile_id` | **+ `resolveDirection` 의 입력** |
| `resolveDirection` 의 캡션 길이 입력 | `targetProfile.language.caption_len.value.p50` | **두 축 합성값**(있으면), 없으면 지향 원값 |
| 합성 규칙 구현 위치 | `lib/compose.js` 안에 인라인 | `lib/order.js` 가 export 하는 `composeCaptionLen` 하나. `lib/compose.js` 가 그것을 부른다 |

### 2-2. 바뀌지 않는 것 (명시)

- **`schemas/` 4종을 바꾸지 않는다.** 새 필드도, 새 `delta.rule` 도, 새 `note_key` 도 없다.
- **R1~R4 규칙의 의미를 바꾸지 않는다.** `WEIGHT` · `OPENER_BONUS` · `TURN_RATIO` · `TIE_BAND` ·
  `CAPTION_QUIET` · `CAPTION_DENSE` 상수를 하나도 건드리지 않는다. 방향이 정해진 뒤의 자리 배치 코드는 그대로다.
- **모델 호출 0회 · 네트워크 0회 · 무작위성 0.** 같은 입력은 바이트 단위로 같은 출력을 낸다.
- `applied_profile` 의 `deltas` · `disclosure` 의 의미(`#13` 소관)는 그대로다.

## 3. 판단 규칙

```
composeCaptionLen(target, current) -> correction | null

  null 을 내는 경우 (= 순서가 절대 바뀌지 않는다):
    · current.present === false            ← 보정축 없음. 가장 중요한 분기
    · target.language?.caption_len 없음
    · current.language?.caption_len 없음   ← 캡션을 한 건도 안 쓴 사람
    · 두 p50 이 같다
    · 합성값이 지향 원값과 같다             ← 바뀐 게 없으면 바뀌었다고 말하지 않는다

  correction 을 낼 때:
    resolved = clamp(round(expm1((log1p(t)+log1p(c))/2)), min(t,c), max(t,c))
    (lib/compose.js 가 쓰던 식 그대로. 옮겨 온 것이지 새로 만든 것이 아니다)

resolveDirection(target, correction)

  1) target.visual.composition_mix 있음  -> 그 값으로 방향. correction 무시
  2) target.visual.tone_words 가 한쪽만 맞음 -> 그 해석으로 방향. correction 무시
  3) target.language.caption_len 있음    -> p50 = correction ? correction.resolved : 원값
                                            >= 90 dense / <= 15 quiet / 그 사이 none
  4) 그 외                               -> none
```

**1·2 에서 `correction` 을 무시하는 것은 결손이 아니라 F1-4 다.** 그 둘은 `caption_len` 이 아닌 다른
필드이고, 그 필드의 합성은 이번 범위가 아니다. 무시했다는 사실은 근거 문장에도 나타나지 않는다 —
**실제로 순서에 영향을 주지 않았으므로 근거에 적으면 그게 거짓말이다.**

## 4. 정확성 기준 — 무엇을 하면 틀린 것인가

| # | 틀린 것 | 왜 |
|---|---|---|
| **W1** | `present:false` 인데 수정 전과 순서가 다르다 | 없는 축이 순서를 움직였다. `#9`·`#12`·`#41`·`#69`·`#96` 과 같은 함정의 여섯 번째 |
| **W2** | 보정축이 방향을 바꿨는데 `slots[0].rationale` 에 그 사실이 없다 | P2 위반. 근거를 못 대는 판단 |
| **W3** | 보정축이 방향에 닿지 못했는데 근거 문장이 보정축을 언급한다 | 반대 방향의 같은 거짓말. 안 쓴 값을 썼다고 말한다 |
| **W4** | 합성값을 `applied_profile` 과 `resolveDirection` 이 서로 다르게 계산한다 | 화면과 순서가 갈라진다. 이 이슈가 잡은 상태 그대로 |
| **W5** | 캡션을 한 건도 안 쓴 보정축(`caption_len` 없음)에 기본값을 넣어 방향을 만든다 | 미관측을 관측으로 승격 |
| **W6** | 같은 입력에 두 번 돌려 다른 순서가 나온다 | 결정성 상실. 근거를 댈 수 없다 |
| **W7** | `slots[].position` 배열로 전/후를 대조해 "같다/다르다" 를 판정한다 | 언제나 `[1..N]` 이라 아무것도 증명하지 못한다 |

## 5. 경계값

| 입력 | 기대 |
|---|---|
| `current.present === false` | `correction = null`. 순서·근거 문장 **전부** 수정 전과 동일 |
| `current.language === null` (캡션 미관측 사진 업로드) | `correction = null` |
| 캡션 전부 빈 문자열 | `buildLanguage` 가 `caption_len` 을 안 만든다 → `correction = null` |
| `t === c` (지향과 나의 캡션 길이가 같다) | `correction = null`. F1-4 "간극 작음 — 말하지 않는다" |
| 합성값이 `t` 와 같아짐 (예: 292 vs 289 → 290… 이 아니라 292) | `correction = null`. 바뀐 게 없으면 근거를 만들지 않는다 |
| 합성값이 정확히 15 또는 90 | 기존 경계 그대로 — `<=15` quiet, `>=90` dense |
| 지향에 `composition_mix` 가 있다 | 방향은 그것으로 결정. `correction` 은 순서에 영향 없음 → 근거 문장에도 안 나온다 |
| 사진 3장(최소) / 20장(최대) | `validateInputIds` 의 기존 범위 그대로 |

## 6. 근거(P2)를 어디에 어떻게 싣는가

보정축이 방향을 바꾼 회차에서 **1번 자리 `rationale`** 에 다음 셋이 모두 들어간다.

1. **사용자에게 보이는 문장(`rationale.value`)** — 두 관측값과 합성값, 그리고 **보정축이 없었다면
   어떻게 읽었을지**를 같이 적는다. 그래야 "무엇이 바뀌었나" 가 문장만으로 확인된다.
2. **근거 목록(`rationale.evidence`)** — 지향 쪽 `caption_len` 의 원근거 + 보정축을 가리키는
   `{kind:'aggregate', ref:<current profile_id>}` 한 건 + 합성 규칙 `{kind:'rule', ref:'compose.log_midpoint'}`.
3. **규칙 근거의 note** — `direction.note` 가 기존대로 `order.R1` 근거에 이어 붙는다.

> **왜 보정축 원근거(게시물·사진 단위)를 슬롯에 직접 넣지 않는가.**
> `lib/contracts.js` 의 E10 이 `feed.slots` 안의 `kind:'uploaded_photo'` 근거를 **이번 회차 입력 사진**
> 으로만 허용한다(`validatePhotoRefs(feedFields, inputPhotoIds, ...)`, `relatedPhotoIds` 없음).
> 보정축 사진은 이번 입력이 아니므로 그대로 넣으면 계약 위반이다. **E10 을 느슨하게 고치지 않는다** —
> 그 가드는 "슬롯 근거는 이번 사진을 가리킨다" 를 지키는 장치다.
> 대신 슬롯에는 보정축 **프로필 ID** 를 `aggregate` 로 가리키고, **원근거 전문은 이미
> `applied_profile.deltas[0].evidence` 에 실려 있다**(그쪽은 `currentPhotoIds` 를 허용해 검증된다).
> 추적은 끊기지 않고, 지어낸 근거도 없다.

## 7. 증명 방법 (report.md 로 간다)

같은 사진 11장(`test/order.real20.json` 앞 11장, 전부 실사진 관측) · 같은 지향(`ig_reference(29cm)`) ·
보정축만 4종으로 바꿔 `composeFeed` 를 호출하고, **`position` 오름차순으로 정렬한 `photo_id` 배열**을
수정 전/후로 대조한다. `position` 배열끼리 비교하지 않는다(W7).

합격선: **수정 전 4종 전부 동일 / 수정 후 캡션 2자 ≠ 950자 / `present:false` 는 수정 전과 동일.**
