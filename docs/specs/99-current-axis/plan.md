# 어떤 순서로 만드는가

각 단계는 **확인 수단**이 붙어 있을 때만 다음으로 넘어간다.

## 0단계 — 수정 전 상태를 먼저 기록한다 (완료)

- 이슈가 쓴 재현을 그대로 돌려 **수정 전 4종이 전부 같은 배열**임을 실측으로 확보한다.
- 확인: 4종의 `position` 정렬 `photo_id` 배열이 1종류. `applied_profile.language.caption_len.p50` 은
  이미 292/290/29/527 로 **갈라져 있다** — 즉 합성은 되고 있고 순서만 안 듣고 있다는 것이 확인된다.
- 산출물: `report.md` 3절 "수정 전" 표.

## 1단계 — `lib/order.js` : 합성 규칙을 한 곳으로 모은다

- `composeCaptionLen(targetProfile, currentProfile)` 를 **새로 export** 한다.
  내용은 `lib/compose.js` 에 있던 `log_midpoint` 계산을 **그대로 옮긴 것**이다(수식 변경 없음).
  반환: `{ target, current, resolved, profileId, claim, delta }` 또는 `null`.
- 확인: 이 단계만으로는 동작이 하나도 안 바뀌어야 한다 → `npm test` 전부 통과.

## 2단계 — `lib/compose.js` : 인라인 계산을 걷어내고 1단계 함수를 부른다

- `composeProfile` 이 `composeCaptionLen` 의 `claim` · `delta` 를 그대로 싣는다.
- 방향(import)은 기존과 같다 — `compose.js → order.js`. **순환 import 를 만들지 않는다.**
- 확인: `npm test` 통과, 특히 `test/compose.test.js` 가 값 변화 없이 통과.
  0단계 스크립트의 `applied caption_len.p50` 이 292/290/29/527 그대로인지 재확인.

## 3단계 — `lib/order.js` : `resolveDirection` 이 합성값을 읽는다

- `resolveDirection(target, correction)` 로 인자 하나 추가.
  `caption_len` 분기에서 `p50 = correction ? correction.resolved : 원값`.
- 합성값이 두 기준값 사이로 떨어지면 기존 `none` 분기로 내려가되, **`correction` 을 언급하는
  note 와 evidence 를 달고** 내려간다(그냥 기존 마지막 return 으로 새면 W2 위반).
- `orderFeed` 가 `composeCaptionLen(targetProfile, currentProfile)` 을 한 번 부르고
  `resolveDirection` 에 넘긴다. 동시에 자기 `applied_profile` 에도 같은 합성 결과를 싣는다
  (안 그러면 `orderFeed` 단독 호출 시 "순서는 29자로 잡았는데 applied 는 292자" 가 된다 = W4).
- 확인: 0단계 스크립트 재실행 → 캡션 2자 배열이 나머지와 갈라진다. `none` 은 그대로.

## 4단계 — `lib/order.js` : 근거 문장에 드러나게 한다 (P2)

- `rationale()` 의 opener 문장 끝에 합성 사실 한 문장을 덧붙인다 —
  **두 관측값·합성값·"보정축이 없었다면 어떻게 읽었을지"** 를 같이 적는다.
- evidence 에 `{kind:'aggregate', ref:<current profile_id>}` 한 건을 더한다.
  보정축 사진/게시물 근거를 직접 넣지 않는다(E10, spec 6절).
- 확인: 0단계 스크립트가 찍는 opener rationale 문장에 292·2·29 가 전부 보인다.
  보정축이 방향에 닿지 않은 회차(`none`, 950자)에는 그 문장이 **없다**(W3).

## 5단계 — 회귀 테스트 `test/order-current-axis.test.js` (새 파일 1개)

고정할 것 넷:
1. 4종 보정축 중 **캡션 2자 ≠ 950자** (`position` 정렬 `photo_id` 배열로)
2. `present:false` 는 **보정축을 아예 안 넘긴 호출과 바이트 단위로 같은 순서**
3. 방향이 바뀐 회차의 1번 자리 `rationale.value` 에 두 관측값이 들어 있고,
   `evidence` 에 보정축 `profile_id` 를 가리키는 `aggregate` 가 있다
4. 방향이 안 바뀐 회차의 1번 자리 근거에는 보정축 언급이 **없다**

- 확인: `npm test` 통과 → `resolveDirection` 의 `correction` 사용을 되돌려 **실패하는지** 직접 확인.

## 6단계 — 검증 5종 + report.md

- `npm test` / `npm run eval` / `check` / `lint` / `typecheck` 를 실제로 돌리고 출력을 `report.md` 에 붙인다.
- 수정 전/후 4종 배열 대조표를 `report.md` 에 싣는다.
- 실모델은 이 이슈의 DoD 에 필요하지 않다 — 순서는 모델 호출 0회 경로다. 돌린 것만 적는다.

## 7단계 — Draft PR (`--base develop`) + 칸반

- 본문에 이슈 #99 하나만 참조. 자동으로 닫지 않는다.
- **남은 간극을 명시한다:** 시각축·`opener_tendency` 미반영, F1-4 tilt 0.7 vs `log_midpoint` 어긋남(`#13`).
