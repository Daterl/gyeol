# 검증 보고 — 보정축이 순서에 영향을 준다

## 1. 결론

| 완료 조건 | 결과 |
|---|---|
| 보정축만 다른 두 세션이 서로 다른 `photo_id` 배열을 낸다 | **충족** — 캡션 2자 ≠ 950자 (3절) |
| 그 차이가 어떤 관측 신호에서 왔는지 근거 문장에 있다 | **충족** — 1번 자리 문장에 292자·2자·29자가 전부 있다 (4절) |
| 보정축이 비어 있으면 차이가 없다 | **충족** — `present:false` 는 수정 전과 한 자리도 다르지 않다 (3절) |
| 회귀 테스트로 고정하고, 되돌리면 실패한다 | **충족** — 5절 |
| `npm test` / `eval` / `check` / `lint` / `typecheck` | **전부 통과** (8절) |

## 2. 재현 조건

- 입력 사진 **11장** — `test/order.real20.json` 앞 11장. 실사진(29cm 게시물 이미지)에서 뽑은 관측값이며
  전부 `analysis_source: 'heuristic'` 이다(밝기·채도·색상각은 실측, 구도·스케일은 상수라 점수에서 빠진다).
- 지향 고정 — `extractFromReference('https://instagram.com/29cm')`.
  `language.caption_len.p50 = 292`, **`visual = {}`** (레퍼런스 경로는 시각축을 채우지 못한다).
- 보정축만 4종으로 교체. 보정축 사진은 입력과 겹치지 않는 별도 3장.
- `now` 고정. 모델 호출 0회 · 네트워크 0회.

## 3. 4종 보정축 전/후 `photo_id` 배열 대조 — 이 작업의 핵심 증거

`slots[].position` 은 언제나 `[1..N]` 이라 대조에 쓸 수 없다. 아래는 전부
**`position` 오름차순으로 정렬한 `photo_id` 배열**이다.

### 수정 전 — 4종이 완전히 동일하다 (이슈가 기록한 상태 재현)

```
cur=none                 ph_07 ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_04 ph_10 ph_08 ph_05
cur=ig(29cm)             ph_07 ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_04 ph_10 ph_08 ph_05
cur=posts(캡션 2자)       ph_07 ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_04 ph_10 ph_08 ph_05
cur=posts(캡션 950자)     ph_07 ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_04 ph_10 ph_08 ph_05
                                                                    서로 다른 배열: 1 / 4
```

**수정 전에 이미 드러나 있던 사실 하나.** 같은 회차의 `applied_profile.language.caption_len.p50` 은
**292 / 290 / 29 / 527 로 이미 갈라져 있었다.** 즉 합성은 되고 있었고 **순서만 그 값을 안 읽고 있었다.**
화면은 "29자를 제안합니다" 라고 말하면서 순서는 292자로 잡고 있었다는 뜻이다.

### 수정 후 — 캡션 2자가 갈린다

```
cur=none                 ph_07 ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_04 ph_10 ph_08 ph_05   (수정 전과 동일)
cur=ig(29cm)             ph_07 ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_04 ph_10 ph_08 ph_05
cur=posts(캡션 2자)       ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_04 ph_07 ph_08 ph_10 ph_05   ← 갈린다
cur=posts(캡션 950자)     ph_07 ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_04 ph_10 ph_08 ph_05
                                                                    서로 다른 배열: 2 / 4
```

| 보정축 | 보정축이 잰 p50 | 합성 p50 | 방향 | 순서 |
|---|---|---|---|---|
| `none` (`present:false`) | — | 292 (합성 없음) | `dense` | **수정 전과 동일** |
| `ig(29cm)` | 289 | 290 | `dense` | 동일 |
| `posts`(캡션 2자) | 2 | **29** | **`none`(기본 규칙)** | **갈린다** |
| `posts`(캡션 950자) | 950 | 527 | `dense` | 동일 |

**"2종만 갈린 것"이 미달이 아닌 이유.** 4종이 전부 갈리게 하려면 관측된 차이가 없는 곳에서도 차이를
만들어야 한다. `ig(29cm)` 보정축은 지향과 같은 계정이라 캡션 길이가 289자 대 292자로 거의 같고,
950자는 합성해도 여전히 빼곡한 쪽이다. **같은 결을 가진 사람에게 같은 결과가 나오는 것은 정상 동작이고,
여기서 억지로 차이를 만들면 그게 `#9`·`#12`·`#41`·`#69`·`#96` 과 같은 함정의 여섯 번째다.**
이슈가 요구한 합격선도 "최소한 캡션 2자와 950자가 서로 다른 배열" 이었다.

## 4. 순서가 바뀐 이유가 근거에 드러나는가 (P2)

`cur=posts(캡션 2자)` 회차의 **1번 자리** `rationale.value`:

```
밝기 0.808 · 채도 0.086 인 사진이라 첫 자리 기본 규칙에 입력 11장 중 가장 잘 맞아 1번에 뒀다.
이 방향은 지향이 잰 캡션 길이 292자를 보정축이 잰 2자와 합성한 29자로 정했다 — 보정축이 없었다면 292자로 읽었다.
```

같은 자리의 `rationale.evidence`:

```
uploaded_photo : ph_11                        ← 이번 회차 입력 사진의 측정값
aggregate      : ig_snapshot_29cm_2026-09-17  ← 지향이 잰 캡션 길이의 원근거
ig_post        : DdVDlTviVrG / DdFvaJRiXnx    ← 그 게시물들
aggregate      : cur_upload_3027bc13          ← 보정축 프로필
rule           : order.R1                     ← 규칙 + direction.note
```

- **두 관측값과 합성값이 사용자에게 보이는 문장에 전부 있다.** 그리고 "보정축이 없었다면 292자로
  읽었다" 까지 적어 **무엇이 바뀌었는지가 문장만으로 확인된다.**
- **보정축이 방향에 닿지 않은 회차에는 이 문장이 없다.** `cur=none` 의 1번 자리 문장에는 보정축 언급이
  전혀 없다. 안 쓴 값을 썼다고 말하는 것도 반대 방향의 같은 거짓말이기 때문이다.
- **보정축 사진 근거를 슬롯에 직접 싣지 않은 이유.** `lib/contracts.js` 의 E10 은 `feed.slots` 안의
  `uploaded_photo` 근거를 **이번 회차 입력 사진**으로만 허용한다. 보정축 사진은 이번 입력이 아니다.
  **E10 을 느슨하게 고치지 않았다.** 슬롯에는 보정축 프로필 ID 를 `aggregate` 로 가리키고,
  **원근거 전문은 `applied_profile.deltas[0].evidence` 에 그대로 실려** 검증된다(그쪽은 보정축 사진 ID 를
  허용해 검증한다). 추적은 끊기지 않고 지어낸 근거도 없다.

## 5. 회귀 테스트와 되돌림 검사

새 파일 `test/order-current-axis.test.js` 5건:

1. 캡션 2자 ≠ 950자 (`position` 정렬 `photo_id` 배열) — **이 작업을 지키는 핵심 단언**
2. `present:false` 는 수정 전 배열(`BEFORE` 상수로 박아 둠)과 정확히 같다
3. 방향이 바뀐 회차의 1번 자리 문장에 292·2자·29자가 있고, 근거가 보정축 프로필을 가리킨다
4. 보정축이 없으면 근거가 보정축을 언급하지 않는다
5. 같은 입력이 같은 순서를 낸다(무작위성 없음)

**되돌림 검사 (실제 실행).** `lib/order.js` 에서 `resolveDirection` 이 합성값을 읽는 한 줄만
지향 원값으로 되돌리고 전체 테스트를 돌렸다:

```
=== lib 변경을 되돌린 상태 ===
not ok 133 - #99 보정축만 바꿔도 순서가 갈린다 — 캡션 2자와 950자가 다른 photo_id 배열을 낸다
# pass 216   # fail 1
=== 복구 후 ===
# pass 217   # fail 0
```

> **정직하게 적는다.** 되돌렸을 때 **실패하는 것은 위 1번 한 건**이다.
> 6-2 에서 추가한 `different targets still change the order while a current profile is present` 는
> 되돌려도 **통과한다.** 그 테스트의 목적은 이 수정을 지키는 것이 아니라 **지향축 커버리지가 줄지
> 않았음을 보장하는 것**이기 때문이다. 둘은 서로 다른 것을 지킨다.

## 6. 기존 테스트 하나의 fixture 를 바꿨다 — 무엇을 왜

### 6-1. 무엇이 어긋났나

`test/compose.test.js` 의 `same measured photos and different targets change position-sorted photo IDs`
가 실패했다. 같은 사진 + **보정축 `present`(캡션 18자)** 에서 지향 `quiet`(15자) 와 `detail`(292자) 이
다른 순서를 내야 한다는 테스트다.

실패 원인(실측):

```
detail 292자 + 보정축 18자 → log_midpoint 합성 74자 → 기준값 15 / 90 사이 → 방향 'none'
quiet 은 visual.tone_words 로 방향 'quiet'
이 사진 set 에서 WEIGHT.quiet 와 WEIGHT.none 이 같은 1번 사진(ph_11)을 고른다 → 두 배열이 같아짐
```

### 6-2. 무엇을 고쳤나 — 단언이 아니라 격리 조건

테스트 이름이 **"different targets"**, 즉 **지향축이 순서를 가른다**는 주장이다. 그런데 `#99` 이후
**보정축도 방향 판단에 관여**하므로, 보정축이 `present` 인 채로는 **지향축만 격리되지 않는다.**
이 테스트가 `present` 로도 통과하던 것은 **보정축이 순서에 닿지 않던 시절의 부작용**이었다.
테스트가 틀린 것이 아니라 fixture 가 자기 주장과 어긋나게 된 것이다.

- **보정축을 `absent` 로 바꿔 지향축을 격리했다.** `assert.notDeepEqual` 단언은 **그대로 두었다.**
  주장을 약화시키지 않았다.
- **커버리지가 줄지 않도록 새 테스트를 추가했다** —
  `different targets still change the order while a current profile is present`.
  보정축 캡션 **120자**를 쓴다. `detail`(292자)과 합성해도 `>=90자` 버킷을 무너뜨리지 않는 값이라
  지향축의 효과가 보정축에 삼켜지지 않는다. 즉 **"보정축이 있어도 지향이 순서를 가른다"** 를 따로 증명한다.
- 왜 바꿨는지는 `test/compose.test.js` 의 해당 테스트 바로 위 주석에도 남겼다.

## 7. 코디네이터 확인 요청 항목 — `none` 으로 떨어지는 것이 제품적으로 옳은가

**한 줄 판단: 합성 결과가 `none` 이 되는 것 자체는 옳다. 다만 `none` 과 `quiet` 이 출력으로 구분되지
않는 것은 별개의 실재하는 약점이며, `#12` 계열 함정은 아니다. 범위 밖이므로 별도 이슈 후보로 남긴다.**

근거:

- **`none` 으로 떨어지는 것은 옳다.** 292자를 쓰는 레퍼런스와 18자를 쓰는 사람의 합성값 74자는
  "빼곡한 쪽"이라고도 "조용한 쪽"이라고도 말할 근거가 없는 중간이다. 이때 한쪽으로 미는 것이야말로
  근거 없는 판단이다. 기존 코드가 **지향 단독일 때 이미 같은 판단**을 하고 있다
  (*"두 기준값 사이는 애매하므로 한쪽으로 밀지 않는다"*). 새 분기를 만든 것이 아니라 기존 분기가
  새 입력을 받은 것뿐이다.
- **`#12` 계열 함정은 아니다.** `#9`·`#12`·`#41`·`#69`·`#96` 은 전부
  **"관측되지 않은 값이 판단을 바꾸는데 근거에는 나타나지 않는다"** 였다. 여기서는 미관측 값이
  판단에 들어오지 않는다. 실측으로 확인했다 — 이 배치는 전부 휴리스틱이라 `flat` 이 **전 사진 0** 이고
  (`#69` 가 의도적으로 상수화한 결과), 두 점수식에 남는 입력은 **관측된 밝기·채도뿐**이다.
- **그래도 실재하는 약점은 맞다.** `flat` 이 상수인 배치(= 휴리스틱 경로 전부)에서
  `quiet = 0.4·밝기 + 0.2·(1−채도)` 와 `none = 0.5·밝기` 는 **둘 다 밝기 지배**가 되어 사실상 같은 순위를 낸다.
  실측:

  ```
  20장   quiet→ph_11 (1위 마진 0.0720)   none→ph_11 (1위 마진 0.0660)   dense→ph_07
  11장   quiet→ph_11 (1위 마진 0.0806)   none→ph_11 (1위 마진 0.0980)   dense→ph_07
  ```

  마진이 넉넉하므로 **아슬아슬한 우연이 아니라 구조적 일치**다. 즉 **"방향 없음"과 "조용한 쪽"이
  출력으로 구별되지 않는다.** 근거를 날조하지는 않지만 방향 신호의 표현력이 3단이 아니라 사실상 2단이다.
- **별도 이슈 후보:** *"휴리스틱 배치에서 `WEIGHT.quiet` 와 `WEIGHT.none` 이 같은 1번 사진을 골라
  '방향 없음'과 '조용한 쪽'이 구분되지 않는다."* 이번 PR 범위 밖이므로 고치지 않았다.

## 8. 검증 명령 출력

### `npm test`

```
# tests 217
# suites 0
# pass 217
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1573.909333
```

### `npm run eval`

```
┌─────────┬──────────┬───────────┬────────┬────────┐
│ (index) │ case     │ invariant │ result │ reason │
├─────────┼──────────┼───────────┼────────┼────────┤
│ 0       │ 'detail' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'detail' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'detail' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'detail' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'detail' │ 'E8'      │ 'PASS' │ ''     │
│ 5       │ 'detail' │ 'E9'      │ 'PASS' │ ''     │
│ 6       │ 'detail' │ 'E10'     │ 'PASS' │ ''     │
│ 7       │ 'detail' │ 'E11'     │ 'PASS' │ ''     │
└─────────┴──────────┴───────────┴────────┴────────┘
broken 케이스는 전부 EXPECTED FAIL (의도된 음성 대조군).
E4/E5/E7: manual spot-check only; real demo review pending.
Injected model variant 0: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).
Injected model variant 1: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).
```

### `npm run check`

```
PASS: 66 JS/JSON files checked; four schema examples match fixtures.
Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```

### `npm run lint`

```
> biome check .
Checked 40 files in 45ms. No fixes applied.
```

### `npm run typecheck`

```
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
```

### 실모델 호출

**돌리지 않았다.** 이 이슈의 완료 조건은 전부 `orderFeed` 경로이고 그 경로는
**모델 호출 0회 · 네트워크 0회**다(`lib/order.js` 파일 머리말). 실모델을 돌려도 순서 판단에 대한
추가 정보가 나오지 않으므로 키를 쓰지 않았다. 이슈 본문의 **실측 3**(적용 `caption_len` 과 실제 생성
캡션 길이의 역전)은 F3 생성 경로의 문제이며 **이번 범위 밖**이다(9절 4번).

## 9. 남은 간극 — 이번에 고치지 않은 것

1. **지향이 `visual.composition_mix` 나 `tone_words` 를 가지면 보정축은 여전히 방향에 닿지 않는다.**
   그 두 필드의 합성은 `applied_profile.visual` 과 간극 카드를 함께 늘려야 하므로 `#13` 소관이다.
   즉 **자연어·사진 업로드로 들어온 지향에서는 이 이슈가 아직 절반만 해결돼 있다.**
2. **F1-4 의 `tilt 0.7` 과 구현의 `log_midpoint` 가 어긋나 있다.**
   `20-product-definition.md` F1-4 는 `merged = target*0.7 + current*0.3` 이라고 적었고
   `lib/compose.js` 는 로그 공간 중점(사실상 0.5:0.5)으로 구현돼 있다. **이번 작업이 만든 어긋남이
   아니라 `#13` 이 이미 내보낸 상태**이며, `lib/contracts.js` 가 `delta.rule` 을 `log_midpoint` 하나로
   못박아 두었다. 여기서 고치면 순서 PR 이 아니라 간극 카드 수치를 바꾸는 PR 이 된다. **고치지 않았다.**
3. **F1-4 의 간극 3단(작음/중간/큼)이 구현돼 있지 않다.** 특히 "큼 → 기울이지 않고 사용자에게 묻는다"
   가 없어서, 292자 대 2자 같은 큰 간극도 조용히 합성된다. `#13` 소관.
4. **이슈 실측 3 — 적용 `caption_len` 과 실제 생성 캡션 길이의 역전.**
   F3 생성 경로(`lib/output-generation.js`) 문제이며 순서와 무관하다. 이번 범위 밖.
5. **`sequence.opener_tendency` · 시각축 · `empty_caption_ratio` 미반영.** 근거는 `spec.md` 1-2 표.
6. **`WEIGHT.quiet` 와 `WEIGHT.none` 이 구분되지 않는 문제** — 7절. 별도 이슈 후보.

**`schemas/` 4종은 바꾸지 않았다.**
