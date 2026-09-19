# #127 report — 검증 출력

기준 커밋: `origin/develop` = `9ec8f62`. 브랜치 `fix/127-photo-only-ordering` (재베이스 후 재검증).
입력: `test/order.real20.json` 앞 15장 (실제 인스타 사진 측정값, 전부 `analysis_source==='heuristic'`).

## 1. 기본 진입(사진만) — 전/후

```
전  1..15 = ph_01 ph_02 ph_03 ph_04 ph_05 ph_06 ph_07 ph_08 ph_09 ph_10 ph_11 ph_12 ph_13 ph_14 ph_15
후  1..15 = ph_11 ph_02 ph_09 ph_01 ph_03 ph_06 ph_13 ph_14 ph_04 ph_07 ph_08 ph_15 ph_12 ph_10 ph_05
```

입력 순서와 다르다. `schema_version` 1.1 · `applied_profile.target_profile_id` null ·
`photo_plan_id` = 실제 plan · `language` null (전과 같다).

## 2. 근거 문장 종수 — 1종 → **8종**

전(15자리 전부 같은 한 문장):

```
선택한 순서를 그대로 두었어요. 취향에 맞춰 다시 정렬한 결과는 아니에요.   × 15
```

후:

| 횟수 | 문장 |
|---|---|
| 1 | 지향을 넣지 않아, 올린 사진에서 보이는 것만으로 이 사진을 첫 자리에 뒀어요. |
| 4 | 다음 사진을 이어서 보여줘요. |
| 3 | 앞 장보다 어두운 화면으로 흐름을 이어가요. |
| 2 | 앞 장보다 환한 화면으로 흐름을 이어가요. |
| 2 | 앞 장보다 짙은 색으로 흐름을 이어가요. |
| 1 | 앞 장보다 옅은 색으로 흐름을 이어가요. |
| 1 | 이 사진을 흐름의 연결점으로 두어요. |
| 1 | 앞 장보다 어두운 화면으로 묶음을 마무리해요. |

15자리 15문장이 아니라 **8종**이다. 문장은 "앞 사진과의 관측된 색 차이"라는 판단을 말하고, 같은
판단에는 같은 문장을 쓴다. 판단이 8가지였으므로 문장도 8종이다. 수치는 어느 문장에도 없다(#109).

## 3. 근거 역추적 (앞 4자리)

| 자리 | 사진 | `uploaded_photo` 근거 note | 입력 `PhotoAnalysis.color` |
|---|---|---|---|
| 1 | ph_11 | 측정값 — 밝기 0.808 · 채도 0.086 · 주요 색 #fcfcfc | bright_mean 0.808 / sat_mean 0.086 / palette_hex[0] #fcfcfc |
| 2 | ph_02 | 측정값 — 밝기 0.346 · 채도 0.273 · 주요 색 #0a1014 (+ 앞자리 ph_11 비교값) | bright_mean 0.346 / sat_mean 0.273 |
| 3 | ph_09 | 측정값 — 밝기 0.612 · 채도 0.097 · 주요 색 #bfc1bf (+ 앞자리 ph_02 비교값) | bright_mean 0.612 / sat_mean 0.097 |
| 4 | ph_01 | 측정값 — 밝기 0.375 · 채도 0.288 · 주요 색 #16150f (+ 앞자리 ph_09 비교값) | bright_mean 0.375 / sat_mean 0.288 |

`test/pipeline.test.js` 의 `#127 …` 테스트가 15자리 전부에 대해 이 대조를 자동으로 한다
(자기 사진 근거가 정확히 1개 · note 의 밝기·채도가 입력 `color` 와 일치 · 모든 `uploaded_photo.ref`
가 실제 입력 사진). 1번 자리 규칙 근거:

```
order.R1       서사 규칙 R1 — 지향이 없으면 첫 자리는 기본 규칙(관측된 밝기) 점수가 가장 높은 사진.
               지향이 없어 올린 사진에서 관측된 밝기·채도·색 거리만으로 정했다 (지향 방향 점수는 쓰지 않았다)
order.R1.decision  밝기 0.808 · 채도 0.086 인 사진이라 첫 자리 기본 규칙에 입력 15장 중 가장 잘 맞아 1번에 뒀다
```

`지향이 잰 색` · `캐러셀` 문구는 15자리 어디에도 없다 — 없는 지향을 지어내지 않았다(테스트가 고정).

## 4. 지향이 있는 경로 무회귀

같은 15장에 지향 2벌을 넣은 응답을 `feed_id`·`generated_at`·`profile_id` 만 정규화해 전/후 비교:

```
quiet ("짧게, 조용하게")     JSON 완전 동일: true
dense ("자세하게, 기록하듯")  JSON 완전 동일: true
```

순서도 코드에 고정했다 (`test/pipeline.test.js` → `#127 targeted ordering is byte-stable …`).
`schema_version` 은 1.0 그대로이고 사진만 경로의 문장이 새지 않는다.

**정직하게 남기는 관측 하나:** 이 15장에서 `quiet` 지향의 순서와 사진만 경로의 순서가 **우연히 같다.**
두 점수식이 다르고(`quiet = 0.4b + 0.4f + 0.2(1-s)` vs `none = 0.5b + 0.5f`, 전부 휴리스틱이므로 f=0)
`dense` 는 다른 순서를 낸다. 이 입력에서 두 식의 순위가 일치한 것이지 경로가 합쳐진 것이 아니며,
문장은 1번 자리에서 갈린다. 다른 입력에서는 갈라진다 — 게이트가 아니라 데이터의 성질이다.

## 5. 관측된 차이가 없는 묶음

`fixtures/interaction.sample.json` 3장은 밝기·채도·색상각이 전부 같다(팔레트만 다르다).
이 입력을 15장으로 늘린 묶음은 게이트가 거짓이므로 **여전히 입력 순서를 유지**하고, 문장이 이유를 말한다.

```
올린 사진들의 밝기와 색이 서로 거의 같아 순서를 바꿀 근거가 없어요. 올린 순서를 그대로 두었어요.
근거 order.no_measured_difference — 묶음의 밝기 범위·채도 범위·최대 색 거리가 모두 R1 동점 밴드(0.02)
안이라 측정값이 사진들을 가르지 못했다. 가르지 못한 값으로 자리를 바꾸지 않는다
```

게이트 경계는 `test/order.test.js` 의 `#127 the ordering gate …` 가 고정한다 — `TIE_BAND` 정확히
경계면 가른 것, 절반이면 못 가른 것, 빈 입력은 거부.

## 6. 전체 검증 (재베이스 후)

```
npm test        # tests 287 / pass 287 / fail 0
npm run eval    # exit 0 — E1..E11 PASS, broken 8종 EXPECTED FAIL, 모델 주입 변이 2종 PASS
npm run check   # PASS: 79 JS/JSON files checked; four schema examples match fixtures
npm run lint    # Checked 42 files. No fixes applied.
npm run typecheck  # Types generated successfully (tsc --noEmit 무출력)
npm run test:ui # Test Files 11 passed / Tests 38 passed
git diff origin/develop -- test/ | grep -c '^-.*test('   # 0
```

## 7. 하지 않은 것

- 화면·UI 는 건드리지 않았다. 이슈 본문의 A안/B안(`<details open>` · 결과 화면 안내 문구)은 이 PR 범위가
  아니다 — 코디네이터 코멘트가 `lib/pipeline.js` 분기 쪽으로 담당과 범위를 옮겼다.
- `schemas/` 4종은 수정하지 않았다. 바꿔야 할 항목도 발견하지 못했다 — photo_plan 축은 이미 계약에 있었다.
- `docs/submission/README.md` 의 D3 칸은 손대지 않았다. 이슈 본문의 그 체크항목은 "기본 경로는 순서를
  바꾸지 않는다"를 명시하라는 것이었고, 이 PR 이 그 전제를 없앴다. 제출 문서 갱신은 소유자 판단이 필요하다.
- 전역 최적 순서(그리디 천장)는 그대로다 — `lib/order.js` 의 알려진 천장이고 #12 범위다.
