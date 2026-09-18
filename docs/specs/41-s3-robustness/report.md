# report.md — #41 검증 결과

브랜치 `feat/41-s3-robustness` · base `origin/dev` · 워크트리 `.work/gyeol-41` · 실행 2026-09-17 · Node v22.22.3

**Verdict: 두 결정 모두 실행 완료. 아래 출력은 전부 실제 실행 결과다.**
**막힌 곳 없음.** 다만 4절에 이 작업이 **못 막는 겹침**을 명시했다 — 그건 고쳤다고 쓰면 안 되는 부분이다.

---

## 1. 작업 2 — 픽스처를 현실로 되돌렸다

### 1-1. 재생성 방법 (재현 가능)

현재 분석기 `lib/photo_analysis.js` 의 `analyzePhoto` 를 **사진 한 장마다 한 번씩** 호출했다.
`photo_id`·`input_index`·`file_ref` 는 기존 픽스처 값을 그대로 넘겼고 `analyzed_at` 만 고정했다(픽스처 결정성).
모델 키 없이 돌려 휴리스틱 경로를 탔다 — 기존 픽스처와 같은 경로다(`analysis_source: "heuristic"`).

```js
// scratchpad/regen.mjs — 리포지토리에 남기지 않는다(일회성). 아래가 전문이다.
import { readFile, writeFile } from 'node:fs/promises';
import { analyzePhoto } from '../lib/photo_analysis.js';
const ROOT = '<repo 상위>/wanted/';
const OUT = new URL('../test/order.real20.json', import.meta.url);
const old = JSON.parse(await readFile(OUT, 'utf8'));
const out = [];
for (const prev of old) {
  const bytes = await readFile(ROOT + prev.file_ref);
  const { analysis } = await analyzePhoto({
    bytes, photoId: prev.photo_id, inputIndex: prev.input_index, fileRef: prev.file_ref, apiKey: null });
  out.push({ ...analysis, analyzed_at: prev.analyzed_at });
}
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
```

```
$ env -u ANTHROPIC_API_KEY node scripts/.regen41.mjs
changed fields per photo:
  ph_02 -> composition
  ph_05 -> composition
  ph_07 -> composition
  ph_09 -> composition
  ph_11 -> composition
  ph_18 -> composition
  ph_20 -> composition
composition before: ph_02 ph_05 ph_07 ph_09 ph_11 ph_18 ph_20
composition after : (none)
```

**바뀐 필드는 `composition` 하나뿐이다.** 20장 중 7장이 `negative_space` → `full_frame`.
색·`describable_facts`·`palette_hex` 는 한 글자도 안 바뀌었다 — #9 이후 분석기가 이 20장에 대해
색은 똑같이 재고 있고 **구도 해석만 버렸다**는 뜻이다. 픽스처가 낡은 지점이 정확히 한 군데였음이 확인된다.

### 1-2. ★ 신호 생사 표 — 이 작업의 가장 중요한 산출물

실측 20장에서 각 신호의 **고유값 개수 / 표준편차**다. 고유값 1개 = 상수 = 변별력 0.

| 신호 | 재생성 전 | 재생성 후 | 판정 |
|---|---|---|---|
| `color.bright_mean` | 20 / 0.113 | 20 / 0.113 | **살아 있다** |
| `color.sat_mean` | 19 / 0.084 | 19 / 0.084 | **살아 있다** |
| `color.hue_mean` | 20 / 109.313 | 20 / 109.313 | **살아 있다** |
| `composition` → `flat` | 2 / 0.477 | **1 / 0.000** | **죽었다 (0 이 됐다)** |
| `color.palette_hex[0]` | 20 | 20 | 살아 있다 (근거 문장용) |
| `describable_facts` | 20 | 20 | 살아 있다 (근거 문장용) |
| `scale` | 1 | 1 | 원래부터 죽어 있었다 (#9·#12 가 이미 안 씀) |
| `has_face` | 1 (전부 false) | 1 | 원래부터 죽어 있었다 (#12 가 `true` 일 때만 씀) |

**결론: `flat` 만 죽었고, 죽은 것은 `flat` 하나다.** 이슈가 예측한 그대로다.

### 1-3. `flat` 이 죽으면 방향 점수 식이 어떻게 되나

```
quiet = 0.4·bright + 0.4·flat + 0.2·(1−sat)   →   0.4·bright + 0.2·(1−sat)
dense = 0.4·(1−flat) + 0.4·sat + 0.2·bright   →   0.4 + 0.4·sat + 0.2·bright   (상수항)
none  = 0.5·bright + 0.5·flat                 →   0.5·bright
```

| 방향 | 전 1위(점수) | 전 1·2위차 | 후 1위(점수) | 후 1·2위차 |
|---|---|---|---|---|
| quiet | ph_11 (0.906) | 0.0806 | ph_11 (0.506) | 0.0720 |
| dense | ph_03 (0.655) | 0.0220 | **ph_07** (0.662) | **0.0070** |
| none | ph_11 (0.904) | 0.0980 | ph_11 (0.404) | 0.0660 |

두 가지가 드러난다.

1. **`dense` 의 1번이 `ph_03` → `ph_07` 로 바뀌었다.** 픽스처가 낡아 있는 동안 우리는 실제 파이프라인이
   내지 않는 답을 보고 있었다.
2. **`quiet` 와 `none` 이 사실상 같은 식이 됐다** (`0.4·bright + 0.2·(1−sat)` vs `0.5·bright`).
   실측 20장에서 `ph_11` 은 밝기 0.808(최대)이면서 채도 0.086(최소)이라 **두 식에서 모두 1위**다.
   이슈가 적은 "위험 1" 이 재생성 뒤에 **더 뚜렷해졌다.**
3. **`#9` 가 죽인 것은 사진 축만이 아니다.** `resolveDirection` 의 **1순위** 신호인
   `visual.composition_mix` 는 이제 **죽은 사진 축을 가리킨다** — 가장 확신 높은(confidence 1) 프로필
   신호가 순서를 아무것도 바꾸지 못한다. 이슈 본문에 없던 발견이다.

### 1-4. 재생성 뒤 실제 순서가 어떻게 달라졌나

```
quiet   전: ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_03 ph_16 ph_17 ph_12 ph_15 ph_07 ph_18 ph_13 ph_10 ph_20 ph_08 ph_05
        후: ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_03 ph_16 ph_17 ph_12 ph_15 ph_07 ph_18 ph_13 ph_10 ph_20 ph_08 ph_05
        달라진 자리: 0 /20   1번 ph_11 → ph_11
detail  전: ph_03 ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_17 ph_16 ph_13 ph_18 ph_07 ph_08 ph_15 ph_12 ph_10 ph_20 ph_05
        후: ph_07 ph_11 ph_02 ph_19 ph_01 ph_09 ph_20 ph_03 ph_06 ph_17 ph_16 ph_13 ph_18 ph_04 ph_14 ph_12 ph_15 ph_08 ph_10 ph_05
        달라진 자리: 9 /20   1번 ph_03 → ph_07

재생성 후 S3: quiet vs detail different? true  opener ph_11 vs ph_07
```

**S3 은 재생성 뒤에도 통과한다.** `quiet`(밝기 지배)와 `dense`(채도 지배)가 여전히 반대 성질을 보기 때문이다.

### 1-5. 무엇이 깨졌고 어떻게 처리했나

재생성 직후 `npm test` = **142 pass / 1 fail.**

```
not ok 103 - a bonus that flipped the opener is named as the reason, not hidden behind the measurement
  error: The input did not match the regular expression /측정 점수는 0\.825 로 입력 20장 중 1위가 아니지만/.
  Input: '... 지향 방향(조용한 쪽) 측정 점수는 0.425 로 입력 20장 중 1위가 아니지만, 보너스 0.15 를
          더한 총점이 0.575 로 가장 높아 1번에 뒀다 — 캐러셀 여는 사진 경향, 얼굴이 관측된 사진.'
```

**깨진 것은 불변식이 아니라 픽스처에서 계산해 리터럴로 박아 둔 기대 숫자 3개다**
(`0.825` → `0.425`, `0.975` → `0.575`, `0.906` → `0.506`). `flat` 항 0.4 가 빠진 만큼 그대로 내려간 값이다.
테스트가 주장하는 성질 — "보너스가 1번을 뒤집었으면 문장이 그 사실을 말해야 한다" — 은 **재생성 뒤에도 통과했다**
(실패 지점이 `assert.match` 의 숫자였지 주장이 아니다).

처리: 숫자를 새 리터럴로 다시 박지 않고 **픽스처에서 계산**하도록 바꿨다. 같은 일이 또 일어나지 않는다.

```js
const shown = n => String(Math.round(n * 1000) / 1000).replace('.', '\\.');
assert.match(flipped.rationale.value, new RegExp(`측정 점수는 ${shown(scoreOf('ph_09'))} 로 입력 20장 중 1위가 아니지만`));
```

`assert.notDeepEqual` · `notEqual` · 집합 보존 · `skip` 없음 — **주장은 한 글자도 약화하지 않았다.**
덧붙여 `ph_09`(0.081)·`ph_20`(0.183)의 1위 대비 점수 **차이는 재생성 전후가 같다** —
`ph_11`·`ph_09` 가 둘 다 `negative_space` 였어서 `flat` 항이 같은 만큼 줄었기 때문이다.
그래서 보너스 상한(0.15) 양쪽을 고정한 이 테스트의 설계 의도는 그대로 살아 있다.

---

## 2. 작업 1 — R1 타이브레이크

바꾼 제품 파일은 `lib/order.js` 하나다(+40/−4). `schemas/` 4종, `lib/contracts.js`, `eval/` 은 안 건드렸다.

- `TIE_BAND = 0.02` — 1위와의 차가 이 안이면 방향 점수가 두 사진을 **가르지 못한 것**으로 본다.
- `resolveTiebreak(target)` — `target.visual.palette`(스키마 26행이 선언한 항목)를 읽는다. 없으면 `null` → 꺼짐.
- 밴드가 2장 이상이고 잰 색이 있으면, **R4 가 이미 쓰는 `distance()` 그대로** 색이 가장 가까운 사진을 고른다.
- **무작위성 없음. 동점은 `input_index` 오름차순.** 같은 입력은 같은 출력이다(테스트 99번이 고정).

근거 설계는 spec.md 4절에 있다. 요지는 "밴드가 갈랐으면 점수 1위였다고 말하지 않는다" 이다.

### 2-1. ★ 겹침 → 분기, 전/후 실제 실행

같은 사진 20장, 같은 `dense` 방향, **`visual.palette` 만 다른** 두 프로필.
잰 색은 손으로 쓰지 않고 실측 20장의 부분집합을 `planFromPhotos`(#10) 에 넣어 뽑았다.

```
잰 색 A(따뜻한 쪽 4장): {"hue_mean":7.75,"sat_mean":0.23,"bright_mean":0.51,"palette_hex":["#100e0e","#c3c1bd","#e8e9e7"]}
잰 색 B(차가운 쪽 4장): {"hue_mean":159.55,"sat_mean":0.21,"bright_mean":0.48,"palette_hex":["#0a1014","#bdbbba","#374249"]}

--- 타이브레이크 전 (두 프로필 모두 visual.palette 없음) ---
A: ph_07 ph_11 ph_02 ph_19 ph_01 ph_09 ph_20 ph_03 ph_06 ph_17 ph_16 ph_13 ph_18 ph_04 ph_14 ph_12 ph_15 ph_08 ph_10 ph_05
B: ph_07 ph_11 ph_02 ph_19 ph_01 ph_09 ph_20 ph_03 ph_06 ph_17 ph_16 ph_13 ph_18 ph_04 ph_14 ph_12 ph_15 ph_08 ph_10 ph_05
different? false   opener diff? false

--- 타이브레이크 후 (잰 색만 다름) ---
A: ph_03 ph_11 ph_02 ph_19 ph_01 ph_09 ph_04 ph_14 ph_06 ph_17 ph_16 ph_13 ph_18 ph_07 ph_08 ph_15 ph_12 ph_10 ph_20 ph_05
B: ph_07 ph_11 ph_02 ph_19 ph_01 ph_09 ph_20 ph_03 ph_06 ph_17 ph_16 ph_13 ph_18 ph_04 ph_14 ph_12 ph_15 ph_08 ph_10 ph_05
different? true   opener diff? true   같은 20장 집합? true
달라진 자리 수: 9 / 20
```

**전에는 20슬롯이 바이트 단위로 같고, 후에는 1번을 포함해 9자리가 갈린다.**
R1 이 갈리면 R4(앞자리와 색 거리 최대)의 그리디 사슬이 통째로 바뀌기 때문이다.

### 2-2. 왜 그 사진을 골랐는지가 근거로 나온다 (P2)

```
A 1번: 밝기 0.589 · 채도 0.343 · 한 색이 넓게 깔리지 않은 화면이다. 지향 방향(빼곡한 쪽) 점수가 상위 2장을
       0.02 안에서 가르지 못해, 지향이 잰 색(밝기 0.51 · 채도 0.23 · 색상각 7.75)에 가장 가까운 사진이라
       1번에 뒀다 — 지향이 잰 색과의 거리 0.076.
B 1번: 밝기 0.512 · 채도 0.399 · 한 색이 넓게 깔리지 않은 화면이다. 지향 방향(빼곡한 쪽) 점수가 상위 2장을
       0.02 안에서 가르지 못해, 지향이 잰 색(밝기 0.48 · 채도 0.21 · 색상각 159.55)에 가장 가까운 사진이라
       1번에 뒀다 — 지향이 잰 색과의 거리 0.086.
```

`rationale.evidence` 에는 잰 색 Claim 의 근거(`aggregate: photo_analysis:n=4`)가 실리고,
R1 rule note 에 `"방향 점수가 상위 2장을 0.02 안에서 가르지 못해 2순위 이하까지 내려가 지향이 잰 색으로 갈랐다"`
가 붙는다. **조용히 다른 사진을 고르는 경로가 없다.**

### 2-3. 밴드 밖은 덮지 않는다

```
--- 밴드 밖은 안 덮는다: quiet(1·2위 차 0.072) 에 같은 잰 색을 넣어도 ---
 quiet + 잰 색 A → 1번 ph_11
 quiet + 잰 색 B → 1번 ph_11
 quiet 기본 → 1번 ph_11
```

프로필 신호가 측정값 차이를 덮으면 `OPENER_BONUS` 상한을 둔 이유가 무너진다. 테스트 98번이 이 경계를 고정한다.

---

## 3. 세 검증 명령 — 실제 출력

### `npm test`

```
1..144
# tests 144
# pass 144
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

`order.test.js` 부분(기존 16건 + #41 신규 1건 = 17건):

```
ok 90 - measured fixture itself satisfies the PhotoAnalysis contract
ok 91 - 3 photos produce 3 slots covering positions 1..3 exactly once
ok 92 - 15 photos produce 15 slots covering positions 1..15 exactly once
ok 93 - 20 photos produce 20 slots covering positions 1..20 exactly once
ok 94 - every eval invariant except the F3 export one passes on a generated feed
ok 95 - no slot is justified by rules alone, and every photo evidence resolves to its own slot
ok 96 - rationales never speak of scale, absent faces or "여백"
ok 97 - two target profiles order the same photos differently
ok 98 - two profiles that agree on direction collide at R1, and the measured palette splits them
ok 99 - the same input produces byte-identical output
ok 100 - an absent current profile ends normally as target_only
ok 101 - a present current profile is reported but not yet used to correct
ok 102 - caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot
ok 103 - carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap
ok 104 - a bonus that flipped the opener is named as the reason, not hidden behind the measurement
ok 105 - photo-only input is rejected here; the photo-only DoD belongs to the wiring layer
ok 106 - rejects inputs the contract cannot accept instead of guessing
```

### `npm run eval`

```
┌─────────┬──────────┬───────────┬────────┬────────┐
│ (index) │ case     │ invariant │ result │ reason │
├─────────┼──────────┼───────────┼────────┼────────┤
│ 0       │ 'quiet'  │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'quiet'  │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'quiet'  │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'quiet'  │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'quiet'  │ 'E8'      │ 'PASS' │ ''     │
│ 5       │ 'quiet'  │ 'E9'      │ 'PASS' │ ''     │
│ 6       │ 'quiet'  │ 'E10'     │ 'PASS' │ ''     │
│ 7       │ 'quiet'  │ 'E11'     │ 'PASS' │ ''     │
└─────────┴──────────┴───────────┴────────┴────────┘
quiet broken E1..E11: EXPECTED FAIL (8/8)
┌─────────┬──────────┬───────────┬────────┬────────┐
│ 0       │ 'detail' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'detail' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'detail' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'detail' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'detail' │ 'E8'      │ 'PASS' │ ''     │
│ 5       │ 'detail' │ 'E9'      │ 'PASS' │ ''     │
│ 6       │ 'detail' │ 'E10'     │ 'PASS' │ ''     │
│ 7       │ 'detail' │ 'E11'     │ 'PASS' │ ''     │
└─────────┴──────────┴───────────┴────────┴────────┘
detail broken E1..E11: EXPECTED FAIL (8/8)
E4/E5/E7: manual spot-check only; real demo review pending.
exit 0
```

### `npm run check`

```
> node scripts/check.js
PASS: 45 JS/JSON files checked; four schema examples match fixtures.
Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
exit 0
```

---

## 4. 고치지 않은 것 — 다음 사람이 알아야 할 경계

이 작업은 **S3 을 슬롯 1개 의존에서 벗어나게 하지 못했다.** 통로를 하나 더 열었을 뿐이다.

1. **R1 은 여전히 프로필이 닿는 유일한 자리다.** R2·R3·R4 는 그대로 프로필과 무관하다.
   타이브레이크는 그 한 자리가 읽는 프로필 신호를 `direction.kind` 하나에서 `+ visual.palette` 로 늘렸다.
2. **밴드 밖의 겹침은 못 막는다.** 이슈 본문의 `quiet` vs `none` 겹침(1·2위 차 0.072)은 밴드 밖이라
   잰 색이 있어도 R1 이 안 바뀐다. `flat` 이 죽은 뒤 `quiet ≈ 0.4·bright + 0.2·(1−sat)` 와
   `none = 0.5·bright` 가 거의 같은 식이 된 것이 원인이고, **타이브레이크가 아니라 식 자체의 문제다**
   (선택지 A 영역 — #13 또는 별도 이슈).
3. **오늘 두 추출 경로는 `visual.palette` 를 채우지 않는다.** `freetext` 는 `tone_words` 만,
   `ig_reference` 는 캡션만 채운다. 즉 프로덕션에서는 이 경로가 **아직 꺼져 있다.**
   `resolveDirection` 의 1순위 `composition_mix` 도 똑같이 아무 추출기가 안 채우는데 이미 읽고 있다 —
   같은 성격의 선행 읽기이고, 사진 기반 레퍼런스가 들어오면(#13/#24) 켜진다.
4. **`composition_mix` 는 이제 죽은 사진 축을 가리킨다** (1-3 절 3번). confidence 1 짜리 최상위 방향 신호가
   순서를 못 바꾼다. `composition_mix` 를 `palette` 로 대체하거나 `resolveDirection` 순위를 다시 잡는 판단이
   필요한데, **제품 설계 판단이라 여기서 하지 않았다.**
5. **`planFromPhotos` 의 `palette` Claim 은 `uploaded_photo` 근거를 2건 달고 나온다.** 그대로 1번 슬롯에
   실으면 "슬롯마다 `uploaded_photo` 근거 1개" 를 고정한 테스트 95번(S1)과 충돌한다. 테스트에서는 `aggregate`
   근거만 남겼다. **실제 배선에서 이 충돌을 어떻게 풀지는 정하지 않았다** — PR 본문에 남긴다.
