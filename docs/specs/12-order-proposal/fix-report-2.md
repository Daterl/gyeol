# #12 수정 2회차 — S3 회귀 ("두 프로필이 같은 순서를 낸다")

`origin/dev` 로 rebase 한 뒤 `test/order.test.js:76` (S3) 만 실패했다. 142 pass / 1 fail.
S3 는 `docs/intent.md` 7-3 절이 "깨지면 제품이 다른 물건이 된다"고 적어 둔 불변식이므로
테스트가 아니라 제품을 고쳤다.

## 1. 가설 검증 — 지목된 원인(#9)이 아니었다

디스패치 가설은 "#9(PR #30)가 `composition` 을 상수화해서 #12 의 변별 신호가 굶었다" 였다.
**확인한 결과 사실이 아니다.**

```
$ git diff --stat origin/main origin/dev
```
→ `lib/order.js` · `test/order.real20.json` · `eval/golden/**` · `lib/contracts.js`
   **어느 것도 바뀌지 않았다.** #9 은 `lib/photo_analysis.js` · `lib/jpeg_dc.js` · `api/analyze.js`
   와 자기 테스트만 더했다.

`test/order.real20.json` 은 #12 가 커밋한 고정 파일이고 `composition` 이 20장 중
`negative_space` 6장 / `full_frame` 14장으로 여전히 갈린다. 즉 `flat` 신호는 이 픽스처에서
살아 있다. (별건으로 3절에 남긴다.)

실제 원인은 rebase 로 **`eval/golden/case_01/target_detail.json` 이 #10 의 추출 결과로 교체된 것**이다.

| | rebase 전 (합성 · 손으로 씀) | rebase 후 (#10 이 실제 추출) |
|---|---|---|
| `target_detail.visual` | `tone_words: ["자세하게 기록"]` | `{}` (비어 있음) |
| `completeness.visual` | 0.2 | **0** |
| `resolveDirection` 결과 | `dense` | **`none`** |

`ig_reference` 경로(스냅샷 30건 집계)는 캡션만 읽으므로 **시각축을 아예 채우지 못한다.**
합성 픽스처가 손으로 써 준 `tone_words` 가 사라지자 `detail` 의 방향이 통째로 없어졌다.

## 2. 왜 방향이 없으면 순서가 통째로 같아지는가

`orderFeed` 에서 지향 방향이 닿는 자리는 **R1(1번 자리) 하나뿐**이다.
R2(가장 어두운 사진) · R3(채도 최고) · R4(앞자리와 색 거리 최대)는 프로필과 무관하다.
따라서 **R1 이 같은 사진을 고르면 피드 전체가 바이트 단위로 같아진다.**

무보너스 방향 점수 상위 3장:

```
quiet   ph_11=0.906  ph_09=0.825  ph_07=0.725
none    ph_11=0.904  ph_09=0.806  ph_07=0.756   ← detail 이 여기로 떨어졌다
dense   ph_03=0.655  ph_04=0.633  ph_12=0.623
```

`quiet`(0.4·bright + 0.4·flat + 0.2·(1−sat))와 `none`(0.5·bright + 0.5·flat)은 **둘 다 밝고
평평한 사진을 고르는 같은 성격의 식**이라 1위가 `ph_11` 로 겹쳤다. 그래서 20슬롯이 전부 같았다.

## 3. 고친 것 — 살아 있는 신호만으로 갈리게 했다 (1순위 해결)

`#9` 가 버린 값(`composition` 의 '여백' 해석 · `scale` · `has_face`)은 **되살리지 않았다.**
무작위성도 넣지 않았다. `schemas/` 4종은 건드리지 않았다. 바꾼 파일은 `lib/order.js` 하나(+21/−1)다.

`resolveDirection` 에 **3순위 경로**를 더했다. 이미 잰 값 중 아직 안 쓰던 것 하나만 읽는다.

```
1순위  visual.composition_mix   (측정된 구성비)          confidence 1
2순위  visual.tone_words        (사용자가 쓴 말 해석)     confidence 0.5
3순위  language.caption_len.p50 (실제 게시물에서 잰 길이)  confidence 0.4  ← 추가
그 외  방향 없음 → 기본 규칙
```

- 기준선은 **새로 만든 수치가 아니다.** `docs/specs/10-target-profile/spec.md` 3절 매핑표에 이미
  적혀 있는 두 기준값 그대로다 — `"짧게" → p50 15자`, `"자세하게" → p50 90자`.
  `p50 ≥ 90` → `dense`, `p50 ≤ 15` → `quiet`, **그 사이(16~89자)는 애매하므로 한쪽으로 밀지 않는다.**
- 캡션 길이는 "한 게시물에 얼마나 많이 담는 계정인가"를 말한다. 다만 사용자가 시각 의도를 말한 것이
  아니라 **언어축을 건너 읽은 해석**이므로 문구 해석(0.5)보다 낮은 `confidence 0.4` 를 주고,
  근거 문장에 그 사실을 그대로 적는다 — 측정한 척하지 않는다.
- 근거 evidence 는 `caption_len` 이 들고 있던 실제 refs(`ig_snapshot_29cm_2026-09-17`,
  `DdVDlTviVrG` 292자, `DdFvaJRiXnx` 914자)를 그대로 복사한다. 지어낸 ref 가 없다.

## 4. 눈으로 확인한 S3 — 두 프로필의 `photo_id` 배열

`position` 오름차순, 입력은 실측 20장(`test/order.real20.json`) 동일.

```
quiet : ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_03 ph_16 ph_17 ph_12 ph_15 ph_07 ph_18 ph_13 ph_10 ph_20 ph_08 ph_05
detail: ph_03 ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_17 ph_16 ph_13 ph_18 ph_07 ph_08 ph_15 ph_12 ph_10 ph_20 ph_05

different? true      opener diff? true      같은 20장 집합? true
```

### 왜 다른가 — 근거

1. **1번 자리가 갈린다.**
   `quiet`(자연어 "조용하고 짧게, 이모지 없이 해요체로", p50 15자) → `tone_words` 2순위에서 `quiet`.
   방향 점수 1위 `ph_11`(밝기 0.808 · 채도 0.086 · 한 색이 넓게 깔린 화면) = 0.906.
   `detail`(29cm 스냅샷 30건, p50 292자) → 3순위에서 `dense`.
   방향 점수 1위 `ph_03`(밝기 0.589 · 채도 0.343 · 한 색이 넓게 깔리지 않은 화면) = 0.655.
   두 식이 정반대 성질을 본다 — `quiet` 는 `flat` 에 +0.4, `dense` 는 `(1−flat)` 에 +0.4 를 준다.
   `ph_11` 은 `dense` 점수 0.196 으로 20장 중 16위, `ph_03` 은 `quiet` 점수 0.367 로 12위다 —
   한쪽에서 1위인 사진이 다른 쪽에서는 하위권이다.

2. **1번이 갈리면 뒤가 줄줄이 갈린다.** R4 는 "앞자리 사진과 색 거리가 가장 먼 사진"을 고르는
   그리디 사슬이라 시작점이 바뀌면 사슬 전체가 바뀐다. 20자리 중 **18자리의 사진이 달라졌다**
   (같은 사진이 남은 자리는 14번(`ph_07`)과 20번(`ph_05`) 둘뿐).

3. **집합은 같다.** 입력 20장이 빠짐없이 한 번씩 나온다 — 순서만 달라졌다.

근거 문장도 실제로 갈라진다:
```
quiet  1번: 밝기 0.808 · 채도 0.086 · 한 색이 넓게 깔린 화면이라 지향 방향(조용한 쪽) 점수가 입력 20장 중 가장 높아 1번에 뒀다
detail 1번: 밝기 0.589 · 채도 0.343 · 한 색이 넓게 깔리지 않은 화면이라 지향 방향(빼곡한 쪽) 점수가 입력 20장 중 가장 높아 1번에 뒀다
        R1 note: … 잰 캡션 길이 p50 292자를 빼곡한 쪽으로 읽었다 (시각 의도가 아니라 언어축을 건너 읽은 해석이다)
```

## 5. 검증

```
npm test    143 pass / 0 fail   (exit 0)   ← S3 포함, 이전 142+1fail
npm run eval  exit 0
npm run check exit 0   PASS: 45 JS/JSON files checked
```

테스트는 한 글자도 약화하지 않았다 — `assert.notDeepEqual` · `assert.notEqual(quietOrder[0], detailOrder[0])` ·
`deepEqual(정렬한 집합)` 세 줄 모두 원문 그대로이고 skip 도 없다. `git diff` 는 `lib/order.js` 단일 파일이다.

## 6. 남긴 것 — 고치지 않고 보고만 한다

1. **지향 방향이 R1 한 자리에만 닿는다.** 이번엔 `dense`/`quiet` 가 정반대 사진을 골라 전체가
   갈렸지만, 두 프로필이 같은 방향으로 읽히면 피드는 여전히 완전히 같아진다. 그건 "같은 지향이면
   같은 순서"라는 정상 동작이기도 하지만, S3 가 R1 하나에 매달려 있다는 뜻이기도 하다.
   R4 의 색 거리 목표를 방향에 따라 바꾸는(조용한 쪽은 인접 대비를 줄이고 빼곡한 쪽은 키우는) 안이
   있으나 **범위 밖이라 하지 않았다.** #13 또는 별도 이슈에서 판단할 일이다.
2. **`test/order.real20.json` 의 `composition` 은 현재 분석기가 더 이상 내지 않는 값이다.**
   `lib/photo_analysis.js` 는 `HEURISTIC_COMPOSITION = 'full_frame'` 상수를 낸다(#9 이 실사진으로
   반증해서 버린 값). 픽스처는 그 이전 분석기로 뽑은 것이라 `negative_space` 6장을 아직 들고 있고,
   `orderFeed` 의 `flat` 신호는 **이 픽스처에서만 살아 있고 실제 파이프라인에서는 전부 0 이다.**
   실제 입력에서는 `quiet`/`dense` 식의 `flat` 항이 상수가 되어 변별이 밝기·채도로만 남는다
   `flat` 을 전부 0 으로 두고 다시 계산하면 `quiet` 1위는 `ph_11`(0.506), `dense` 1위는
   `ph_07`(0.662, `ph_03` 0.655 근소 2위)로 **여전히 갈리기는 한다.** 다만 두 식의 차이가
   밝기·채도만 남아 여유가 줄어든다.
   **픽스처 재생성 또는 `flat` 신호 폐기는 #9·#12 경계에 걸친 판단이라 여기서 손대지 않았다.**
   이 리포트에 남기고 이슈 #12 에 올린다.
