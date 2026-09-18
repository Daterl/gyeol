# spec — #10 TargetProfile 추출

기준 SHA `7d16ff8`. 스키마 원천은 `schemas/target_profile.md`, 런타임 계약은 `lib/contracts.js` 다.
**이 spec 은 스키마에 맞춘다. 어긋나면 스키마가 아니라 이 문서를 고친다.**

---

## 1. 무엇을 만드는가

`lib/target_profile.js` 하나. 외부 호출 0회, 의존성 0개, 순수 함수.
모델 호출은 여기서 하지 않는다 — `prompts/input/target_extract.md` 는 **모델 경로의 계약 문서**이며 아직 배선하지 않는다(PR 에 남긴다).

### 공개 함수 4개

| 함수 | 입력 | 출력 | 실패 |
|---|---|---|---|
| `resolveReference(url, registry?)` | 인스타 URL 문자열 | `{handle, snapshot}` | `UnsupportedReferenceError` |
| `extractFromReference(url, opts?)` | 위 URL | `TargetProfile` (`source:"ig_reference"`) | `UnsupportedReferenceError` / `ContractError` |
| `extractFromFreetext(text, opts?)` | 자연어 문자열 | `TargetProfile` (`source:"freetext"`) | 빈 문자열이면 `ContractError` |
| `planFromPhotos(analyses, opts?)` | `PhotoAnalysis[]` | `PhotoPlan` (**TargetProfile 아님**) | `ContractError` |

`opts` 는 `{profileId, createdAt}` 만 받는다. 시각을 주입할 수 있어야 골든이 재현된다.

---

## 2. 경로별 입출력 계약

### 2-1. ref 인스타 URL (`source: "ig_reference"`)

- 입력: 사전 수집 스냅샷 1벌(`fixtures/ref_snapshot.sample.json`). `intent.md` **C1** — 라이브 수집을 크리티컬 패스에서 뺀다.
- 스냅샷 원소: `{shortCode, caption, type, child_count, timestamp}`. 이것 말고는 읽지 않는다.
- URL → 핸들 파싱: `instagram.com/<handle>` 의 첫 경로 조각. `p/`, `reel/`, `explore/`, `stories/` 는 핸들이 아니다.
- **핸들이 레지스트리에 없으면 그 자리에서 실패한다.** 다른 계정 스냅샷으로 대체하지 않는다.
- 산출:
  - `language`: `caption_len` / `emoji_rate` / `ending_style` / `linebreak_habit` / `empty_caption_ratio` + `banned_words`
  - `sequence.carousel_count` = 캐러셀(자식 2장 이상) 게시물 수. `opener_tendency` 는 **생략**한다(C2 로 ref 이미지 분석 경로가 없다).
  - `visual`: `{}` (빈 객체), `completeness.visual = 0`
  - `raw_freetext`: `null`, `sample_size` = 스냅샷 게시물 수

### 2-2. 자연어 (`source: "freetext"`)

- `intent.md` C2 — **항상 성공하는 바닥**. 아무 규칙도 안 맞으면 `tone_words` 만 남고 나머지는 비운다.
- `tone_words` = 사용자가 쓴 어구 그대로(구분자 `,`·`·`·개행·`그리고`·`하고` 로 자름, 앞뒤 2어절까지, 최대 5개).
  값이 사용자 문장 자체이므로 근거는 `user_text` **단독**이고 confidence 1 이다.
- 나머지 항목은 아래 3절 어휘표에 걸릴 때만 나온다. **안 걸리면 필드를 생략하고 completeness 를 낮춘다.**
- `empty_caption_ratio` 는 자연어에서 **만들지 않는다.** "가끔 비워"를 숫자로 바꿀 근거가 없다.
- 명시적인 캡션 커버리지 문구만 `caption_coverage: Claim<"all"|"sparse">`로 남긴다. 부정 문구는 반대로 해석하지 않고, all/sparse 충돌이나 전체 무캡션 요청은 claim을 생략한다.
- `sequence.carousel_count = 0`, `opener_tendency` 생략, `completeness.sequence = 0`
- `raw_freetext` = 원문, `sample_size = 1`

### 2-3. 사진만 입력 (`PhotoPlan` — TargetProfile 아님)

`#24` 가 아직 열려 있어 합의된 이름이 없다. **합의 전까지 TargetProfile 스키마를 건드리지 않는 쪽**을 택한다.

```
{ schema_version:"1.0", kind:"photo_plan", plan_id, source:"photo_only",
  sample_size:N, completeness:{visual, language:0, sequence:0},
  visual:{palette, composition_mix, scale_mix, subjects},
  language:null, sequence:{carousel_count:0},
  target_profile:null, created_at,
  disclaimer:"업로드한 사진 N장에서 관측된 값이며 사용자의 취향·과거 습관이 아니다" }
```

- 입력은 `#9` 가 만드는 `PhotoAnalysis[]`. **사진 1장 = 호출 1회 구조는 `#9` 쪽에 있고, 여기서는 이미 나온 분석만 합친다.**
  따라서 이 경로는 사진 장수가 늘어도 모델 호출이 0회다.
- `tone_words` 를 만들지 않는다. 사진에서 "조용한 느낌"을 읽는 것은 사진에 없는 사실이다.
- `language` 는 `null` 이다. 사진에는 문장이 없다.
- `target_profile:null` 로 **TargetProfile 이 아님을 명시**한다. `present:false` 를 target 축에 만들지 않는다.

---

## 3. 판단 규칙 (자연어 어휘표)

걸린 어구를 `evidence[0].ref` 에 **그대로** 기록한다. 매핑 자체는 `evidence[1] = {kind:"rule"}` 로 따로 적는다.
즉 **모든 항목이 `user_text` 1개 + `rule` 1개**이고, rule 단독은 존재하지 않는다.

| 필드 | 걸리는 어구 | 값 | confidence |
|---|---|---|---|
| `caption_len` | 짧게·간결·짤막·한 줄 | `{p50:15, p90:30}` | 0.6 |
| | 길게·자세히·자세하게·디테일·꼼꼼 | `{p50:90, p90:180}` | 0.6 |
| `emoji_rate` | 이모지 없이·이모티콘 없이·이모지 안 | `0` | 0.7 |
| | 이모지 많이·이모지 잔뜩 | `1.5` | 0.5 |
| `ending_style` | 해요·존댓말 → `해요` / 담백·문어체·~다 → `다` / 명사형·단어로 → `명사형` | 해당 enum | 0.6 |
| `linebreak_habit` | 줄바꿈 없이·한 덩어리 → `없음` / 짧게 자주·행갈이 → `짧게 자주` / 문단·단락 → `문단` | 해당 enum | 0.6 |
| `caption_coverage` | 말수가 적고·말수 적게 기록해 달라는 요청·일부는 비워 달라는 요청·사진만 두고 싶다는 요청·몇 장만+쓰기 요청 → `sparse` / 모든 사진·사진마다+쓰기 요청·사진마다 한 줄씩·한 장도 비우지 않았으면 한다는 요청·전부 써/채워 달라는 요청 → `all` | 해당 enum | 0.8 |

`사진마다`와 `몇 장만`은 단독 cue가 아니다. 문장·캡션·글·한 줄과 완결된 쓰기 요청이 같은 승인 패턴에 있어야 한다. “적당/적절/적혀/적어도”, 사진 장수, 구도·간판 설명 같은 부분 단어와 서술형은 매치하지 않는다. `하지만` 뒤에 실제 coverage cue가 있으면 뒤 절로 선택을 갱신하고, 부정된 cue뿐이면 필드를 생략한다. 뒤 절이 사진 순서·색감처럼 무관하면 앞의 명시 요청을 유지한다. “싫다/원하지 않는다/말아야 한다/아니다/반대/별로”가 있는 절은 보수적으로 버린다. `한 장도 비우지 않았으면 해요`처럼 승인된 완전 표현만 intrinsic-negative all로 허용한다.

confidence 가 1 이 아닌 이유: 어구 하나에서 숫자를 끌어냈으므로 관측이 아니라 해석이다.
`p50:15` 같은 숫자는 **출처 없는 수치가 아니라 이 표에 적힌 매핑값**이고, 근거에 `rule` 로 표시된다.

---

## 4. 집계 규칙 (ref 스냅샷)

캡션이 공백만인 게시물은 "빈 캡션"이고 길이 집계에서 뺀다. 빈 캡션만 있으면 `language = null`.

| 필드 | 계산 |
|---|---|
| `caption_len.p50/p90` | 비어 있지 않은 캡션 길이의 최근접 순위 백분위(정수). `p90 < p50` 이면 `p90 = p50` 으로 올린다 |
| `emoji_rate` | 캡션 1건당 `\p{Extended_Pictographic}` 평균 개수, 소수 2자리 |
| `ending_style` | 캡션 마지막 문장의 어미 분류. 최빈값 비율 ≥ 0.6 이면 그 값, 아니면 `혼합` |

**마지막 문장을 고르는 규칙** — 실제 스냅샷에서 두 번 틀렸고 그래서 규칙이 두 줄 붙었다.
1. 숫자 사이의 마침표는 문장 끝이 아니다 (`9. 30 (수)` 는 날짜다). 문장 분리 전에 `·` 로 바꾼다.
2. **한글 4자 미만 조각은 문장이 아니다.** 캡션 끝의 일정·가격 줄(`9·17 (목) 10:00 - 9·30 (수) 23:59`)을 어미로 읽지 않는다.
   조건에 맞는 마지막 조각을 쓰고, 하나도 없으면 그 캡션은 분류에서 뺀다.
| `linebreak_habit` | 개행 0 → `없음` / 평균 줄 길이 < 25자 && 평균 줄 수 ≥ 3 → `짧게 자주` / 그 외 `문단` |
| `empty_caption_ratio` | 빈 캡션 수 / 전체, 소수 2자리 |
| `carousel_count` | `child_count ≥ 2` 인 게시물 수 |

근거는 `aggregate` 1개(`ref = <snapshot_id>`, `note = "캡션 N건 집계"`) + 실제 그 값을 만든 게시물 `ig_post` 최대 2개다.
`ig_post.ref` 는 shortCode 다. **집계값이 어느 게시물에서 왔는지 되짚을 수 있어야 한다(P2).**

`banned_words` 는 Claim 이 아니며 스키마상 필수다. 기존 fixture 의 5개를 그대로 쓴다.

---

## 5. completeness 계산

장식 수치를 만들지 않기 위해 **채운 항목 수 / 정의된 항목 수**로 고정한다.

```
visual    = 채운 수 / 5   (palette, tone_words, subjects, composition_mix, scale_mix)
language  = 채운 수 / 5   (caption_len, emoji_rate, ending_style, linebreak_habit, caption coverage)
sequence  = opener_tendency 있으면 1, 없으면 0
```

caption coverage 차원은 ref 관측의 `empty_caption_ratio` 또는 freetext 의도의 `caption_coverage` 중 해당 경로가 허용하는 하나다. 두 필드를 함께 채우지 않는다.

소수 2자리로 반올림한다. `language === null` 이면 `completeness.language === 0` 이어야 한다(`lib/contracts.js:90` 이 강제).

---

## 6. 정확성 기준 — 무엇을 하면 틀린 것인가

1. 준비되지 않은 URL 에 다른 계정 스냅샷을 붙이면 **틀렸다**. 반드시 실패해야 한다.
2. 어떤 Claim 이든 `evidence` 가 비거나 `kind:"rule"` 만 있으면 **틀렸다**.
3. ref 경로가 `completeness.visual > 0` 을 내면 **틀렸다**. ref 이미지를 안 봤다.
4. 자연어 경로가 `empty_caption_ratio` 를 내거나, ref/current가 `caption_coverage`를 내면 **틀렸다**. 관측 비율과 현재 의도는 다른 값이다.
5. 사진만 입력이 `axis`/`present` 를 달고 나오면 **틀렸다**. TargetProfile 이 아니다.
6. 사진만 입력이 `tone_words`·`language` 를 채우면 **틀렸다**. 사진에 없는 사실이다.
7. 어구가 하나도 안 걸렸는데 기본값으로 필드를 채우면 **틀렸다**. 비우는 것이 맞다(P3).
8. 좋아요·도달·조회 수를 프로필에 넣으면 **틀렸다**. 스냅샷에 있어도 읽지 않는다.

## 7. 경계값

| 입력 | 기대 |
|---|---|
| `""` / 공백만 자연어 | `ContractError` (`raw_freetext` 는 비어 있을 수 없다) |
| 어구 0개 걸린 자연어 | 성공. `language = null`, `completeness.language = 0`, `visual` 은 `tone_words` 만 |
| 캡션이 전부 빈 스냅샷 | `language = null`, `completeness.language = 0`, `empty_caption_ratio` 도 없음 |
| 캐러셀 0건 스냅샷 | `carousel_count = 0`, `opener_tendency` 생략(스키마상 0이면 `불명`만 허용되므로 아예 안 낸다) |
| `PhotoAnalysis` 0장 | `ContractError` |
| 핸들 없는 URL (`instagram.com/p/XXXX`) | `UnsupportedReferenceError` |
| 인스타가 아닌 URL | `UnsupportedReferenceError` |
| `palette_hex` 후보 4개 이상 | 빈도 상위 3개만 (스키마 상한) |

`UnsupportedReferenceError` 는 `{code:"REFERENCE_NOT_PREPARED", requested, supported:[...], fallbacks:["freetext","photo_only"]}` 를 들고 있다.
`supported` 는 레지스트리에 실제로 있는 핸들만 적는다.
