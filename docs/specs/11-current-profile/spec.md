# spec — #11 CurrentProfile 추출

크기: **M** (경계 계약 `schemas/`·`OrderedFeed`·`api/` 응답 모양을 건드리지 않는다. 새 모듈 1개 + 새 fixture 1개 + 프롬프트 1개).
`schemas/current_profile.md` 는 **바꾸지 않는다.** 아래 계약은 전부 그 문서에 맞춰 쓴 것이고, 어긋나는 곳이 있으면 스키마가 이긴다.

---

## 1. 무엇을 만드는가

`lib/current_profile.js` — 입력을 받아 `schemas/current_profile.md` 를 만족하는 `CurrentProfile` 객체 하나를 돌려주는 순수 함수.
**네트워크를 쓰지 않고, 모델을 호출하지 않고, 파일 시스템을 읽지 않는다.** 스냅샷 JSON 은 **호출자가 읽어서 인자로 넘긴다.**

```js
import { buildCurrentProfile } from '../lib/current_profile.js';
const profile = buildCurrentProfile(input, now);
```

| 인자 | 타입 | 뜻 |
|---|---|---|
| `input` | `{}` \| `{snapshot}` \| `{photos}` | 아래 3-1~3-3. `{}` · `null` · `undefined` 전부 부재 경로 |
| `now` | `Date` \| ISO string | `created_at` 에 그대로 들어간다. 생략하면 `new Date()` |

`snapshot` 과 `photos` 를 **동시에 주면 `ContractError` 로 거부한다.** 한 프로필의 `source` 는 하나여야 하고,
둘을 섞으면 어느 관측에서 나온 값인지 `source` 가 설명하지 못한다.

## 2. 입력 계약

### 2-1. 스냅샷 (`fixtures/ig_snapshot.json` 재생)

```jsonc
{
  "snapshot_version": "1.0",
  "provenance": { "account": "29cm.official", "account_scope": "main", ... },
  "posts": [
    { "shortcode": "DdVKdyACaC1", "url": "...", "timestamp": "ISO",
      "caption": "…", "child_count": 10, "opener_image": "images/…jpg" }
  ]
}
```

- `posts[].caption` 은 문자열이다. 캡션이 없던 게시물은 `""` 로 들어온다 (**키 자체는 항상 있다** — 관측했고 비어 있었다는 뜻).
- `child_count` 는 캐러셀 내부 장수. 1이면 단일 사진, ≥2 면 캐러셀.
- `opener_image` 는 캐러셀 1번 이미지의 로컬 상대 경로. A2 판정(6절)이 "같다"여야만 의미가 있다.

### 2-2. 기존 게시물 직접 업로드 (비공개 계정 대체 경로)

```jsonc
{ "photos": [ <PhotoAnalysis>, ... ],          // schemas/photo_analysis.md 를 통과한 객체들
  "captions": [ "…", "" ] }                    // 선택. 없으면 키 자체를 넣지 않는다
```

- `photos` 의 각 원소는 **사진 1장을 1회 분석한 결과**다. 이 모듈은 사진을 분석하지 않는다 —
  `docs/intent.md` 8절 A1 대응 ①("분석을 사진 단위로 쪼개 여러 번 호출")을 깨지 않기 위해, 여러 장을 한 번에 처리하는
  경로를 이 모듈 안에 만들지 않는다.
- `captions` 는 **선택**이다. 키가 없으면 "캡션을 관측하지 않았다", `["", "…"]` 는 "관측했고 일부가 비어 있었다".
  **이 구분이 `empty_caption_ratio` 의 유무를 결정한다.** 키를 넣었으면 길이가 `photos` 와 1:1 로 맞아야 한다 —
  0건 관측은 관측이 아니므로 `[]` 는 거부한다.

### 2-3. 부재

`buildCurrentProfile()` · `buildCurrentProfile({})` · `buildCurrentProfile(null)` — 전부 같다.

## 3. 출력 계약 — 경로별로 무엇이 채워지는가

| 경로 | `source` | `visual` | `language` | `sequence` |
|---|---|---|---|---|
| 부재 | `none` | `{}` | `null` | `{}` |
| 스냅샷 | `cached` | `{}` (스냅샷에는 사진 분석이 없다) | 캡션에서 추출 | `carousel_count` (+조건부 `opener_tendency`) |
| 직접 업로드 | `photo_upload` | 사진 분석에서 집계 | `captions` 가 있을 때만 | `carousel_count: 0` |

### 3-1. 부재 (`present: false`)

스키마가 값을 전부 고정해 두었다. 그대로 낸다.
`profile_id:null` · `source:"none"` · `account_scope:"n/a"` · `sample_size:0` · `completeness` 전부 0 ·
`visual:{}` · `language:null` · `sequence:{}` · `raw_freetext:null`.
**이 경로는 예외를 던지지 않는다.** 파이프라인 정상 종료가 곧 이 경로의 성공이다.

### 3-2. 관측이 0건이면 부재로 접는다

`posts` 가 빈 배열이거나 `photos` 가 빈 배열이면 **`present:false` 를 낸다.** `sample_size` 는 present 일 때 ≥1 이어야 하고,
0건에서 배울 수 있는 것은 없다. "스냅샷을 줬으니 present" 는 입력의 존재를 관측의 존재로 바꿔치기하는 것이다.

### 3-3. `profile_id`

- 스냅샷: `cur_cached_<account를 소문자·[a-z0-9]외 _ 치환>`
- 업로드: `cur_upload_<photo_id 들을 정렬해 이은 문자열의 FNV-1a 32bit hex>`

같은 입력이면 같은 ID 다. 시각·난수·카운터를 쓰지 않는다 (재생 결정성).

### 3-4. `account_scope`

스냅샷의 `provenance.account_scope` 를 **그대로 옮긴다** (관측이 아니라 수집 시점의 기록이다).
업로드 경로는 계정을 모른다 → `n/a`. 부재 → `n/a`.

## 4. 판단 규칙 — 각 필드를 무엇으로 정하는가

모든 Claim 의 `evidence` 는 **길이 ≥ 1 이고 `kind:"rule"` 만으로 이루어지지 않는다**(E1 + `schemas/current_profile.md`
"프로필의 rule-only 근거는 금지").
- 스냅샷 경로: `{kind:"ig_post", ref:"<account>:<shortcode>", note:"…"}` — 실제 게시물 1건을 가리킨다.
  집계 필드는 대표 게시물 최대 3건을 근거로 단다 (전 건을 다 다는 것은 UI 에서 읽을 수 없다).
- 업로드 경로: `{kind:"uploaded_photo", ref:"<photo_id>", note:"…"}`.
- `note` 는 한국어 한 줄이고 **UI 의 [근거 보기] 에 그대로 뜬다**(CLAUDE.md 6-1).

### 4-1. `language` — 캡션이 있을 때만

`captions` 를 관측하지 않았으면 **`language: null`, `completeness.language: 0`**. (스키마가 역도 성립시킨다.)

| 필드 | 규칙 | 안 채우는 조건 |
|---|---|---|
| `caption_len` | **비어 있지 않은** 캡션들의 글자 수로 p50·p90 (nearest-rank, 오름차순 `ceil(p/100 * n)` 번째). `unit:"자"` | 비어 있지 않은 캡션이 0건 |
| `emoji_rate` | 캡션 1건당 이모지 평균 개수. 이모지 = `\p{Extended_Pictographic}` (Node 내장 유니코드 속성) | 비어 있지 않은 캡션이 0건 |
| `ending_style` | 캡션 끝 어미를 4분류하고 **최빈값**. 최빈 비율 < 0.6 이면 `혼합` | 분류 가능한 캡션이 0건 |
| `linebreak_habit` | 빈 줄(`\n\n`)이 절반 이상 → `문단`; 줄바꿈 평균 < 0.5 → `없음`; 그 외 `짧게 자주` | 비어 있지 않은 캡션이 0건 |
| `empty_caption_ratio` | `비어 있는 캡션 수 / 전체 캡션 수` | **`captions` 자체가 없을 때 — 이때는 `language` 가 통째로 null 이라 필드가 존재할 수 없다** |
| `banned_words` | 고정 목록 (`이처럼·또한·이를 통해·이러한·마침내`) | — Claim 이 아니다. 관측이 아니라 **설계 상수**이며 출처는 CLAUDE.md 6-3(d) |

**어미 4분류** — 캡션에서 **해시태그(`#…`)와 멘션(`@…`)을 먼저 떼어낸** 뒤 **마지막 한글 덩어리**를 본다.
떼어내지 않으면 끝에 붙은 태그 뭉치의 마지막 낱말이 어미로 읽힌다(실제로 29cm 스냅샷에서 그렇게 된다).
`해요` = `요`·`여요`·`에요`·`예요`로 끝남 / `다` = `다`·`까`·`자`로 끝남 / `명사형` = 위 둘이 아님 /
분류 불가 = **한글 덩어리가 아예 없음**(영문·이모지·URL·기호뿐) → 이 건은 분모에서 뺀다.
`confidence` = 최빈값 비율(0..1), 소수 둘째 자리 반올림.

> 이 분류는 **형태소 분석이 아니다.** 한국어 종결 어미의 표면형만 본다. 정확성 기준은 6-2절에 적는다.

### 4-2. `sequence`

- `carousel_count` = `child_count >= 2` 인 게시물 수. 업로드 경로는 캐러셀 구조를 알 수 없으므로 **0**.
- `opener_tendency` — **아래 3개가 전부 참일 때만 낸다:**
  1. `carousel_count >= 1`
  2. 캐러셀 1번 사진의 `PhotoAnalysis` 가 **호출자로부터 실제로 들어왔고**(`input.openers`, 선택 인자),
     그 `file_ref` 가 스냅샷의 `posts[].opener_image` 와 **일치한다** — 일치하지 않는 분석은 이 스냅샷의 근거가 아니므로 투표에서 뺀다
  3. 분류 결과에 최빈값이 하나로 정해진다 (동률이면 안 낸다)

  분류: `has_face === true` → `인물`; 아니고 `scale === "closeup"` → `클로즈업`; 아니고 `scale === "fullshot"` → `풀샷`;
  `midshot` → **투표하지 않는다**(중간 스케일은 셋 중 어느 성향의 증거도 아니다).

  **하나라도 어긋나면 필드를 생략한다. 문자열 `"불명"` 을 넣지 않는다.**
  (스키마는 `carousel_count === 0` 일 때 `"불명"` 을 허용하지만, 허용은 의무가 아니다. 생략이 더 정직하다.)

### 4-3. `visual` — 업로드 경로에서만

`photos`(PhotoAnalysis[]) 를 집계한다. 스냅샷 경로는 사진 분석이 없으므로 `{}` 이고 `completeness.visual = 0`.

| 필드 | 규칙 |
|---|---|
| `palette` | `hue_mean` = **원형 평균**(각도라서 산술평균은 359°와 1°를 180°로 만든다). `sat_mean`·`bright_mean` = 산술평균. `palette_hex` = 최빈 hex 최대 3개 |
| `composition_mix` | `full_frame`/`negative_space` 각각의 비율. 합 = 1 |
| `scale_mix` | `closeup`/`midshot`/`fullshot` 비율. 합 = 1 |
| `subjects` | 2장 이상에 나온 subject 를 빈도순 최대 5개. 1장에만 나온 것은 습관이 아니다 |
| `tone_words` | **만들지 않는다.** 숫자에서 낱말을 지어내는 일이고 근거를 댈 수 없다 |

합이 1 인 mix 는 **반올림하지 않는다.** 반올림하면 합이 1 에서 벗어나 `lib/contracts.js` 의 `mix()` 가 거부한다.

**`confidence` 를 정하는 규칙 (전 필드 공통)** — 관측값을 그대로 계산한 것(개수·평균·비율)은 `1`,
여러 후보 중 최빈값을 고른 것(`ending_style`·`opener_tendency`·`subjects`)은 **최빈값의 점유 비율**이다.
추론을 안 한 곳에 1 미만을 쓰면 겸손해 보일 뿐 뜻이 없고, 최빈값에 1 을 쓰면 소수 의견을 감춘다.

### 4-4. `completeness`

`visual` = 채운 visual Claim 수 / 5 · `language` = 채운 language Claim 수 / 5 · `sequence` = `carousel_count>0 ? (opener_tendency ? 1 : 0.5) : 0`.
분모 5 는 스키마가 정의한 선택 Claim 개수다(`banned_words` 는 Claim 이 아니므로 제외).
`language === null` ⟺ `completeness.language === 0` 은 `lib/contracts.js` 가 강제한다.

## 5. 무엇을 하면 틀린 것인가 (정확성 기준)

1. **부재 경로가 예외를 던진다** → 틀림. 1차 타깃의 다수 경로가 죽는다.
2. **캡션 입력이 없는데 `language` 에 값이 있다** → 틀림. 없는 관측을 만든 것이다.
3. **`empty_caption_ratio` 가 캡션 미관측 상태에서 `0` 으로 나온다** → 틀림. "항상 캡션을 쓴다"는 거짓 관측.
4. **`opener_tendency` 가 `"불명"` 문자열로 존재한다** → 틀림. 미관측을 판단으로 바꿔치기한 것이다.
5. **같은 스냅샷을 두 번 넣었는데 결과가 다르다**(`created_at` 제외) → 틀림. 재생 경로가 재생이 아니다.
6. **네트워크를 끊으면 결과가 달라지거나 죽는다** → 틀림. C1 결정이 코드에 반영되지 않은 것이다.
7. **어떤 Claim 의 evidence 가 비었거나 `kind:"rule"` 뿐이다** → 틀림 (E1 · P2).
8. **`lib/contracts.js` 의 `validateProfile(profile, 'current')` 가 거부한다** → 틀림. 스키마가 이긴다.

## 6. 경계값 · 판정

### 6-1. 경계값

| 입력 | 기대 |
|---|---|
| `undefined` / `{}` / `null` | `present:false`, 예외 없음 |
| `{snapshot:{posts:[]}}` | `present:false` (3-2) |
| `{photos:[]}` | `present:false` |
| 캡션 전부 `""` | `empty_caption_ratio:1`, `caption_len`·`emoji_rate`·`ending_style`·`linebreak_habit` **생략**, `completeness.language = 0.2` |
| 캡션 1건 | p50 = p90 = 그 길이 (`p90 >= p50` 유지) |
| 캐러셀 0건 | `carousel_count:0`, `opener_tendency` 생략 |
| 캐러셀 있지만 opener 분석 없음 | `carousel_count:N`, `opener_tendency` 생략, `completeness.sequence = 0.5` |
| opener 분류 동률 | `opener_tendency` 생략 |
| `photos` 와 `snapshot` 동시 | `ContractError` |
| 사진 1장 | 정상 (프로필 추출은 3~20 제약 대상이 아니다 — 그건 `validateInputIds` 가 보는 **생성 입력**의 제약이다) |

### 6-2. 4-1 어미 분류의 정확성 한계 (미리 적는다)

표면형 규칙이라 `"…했다고 하더라구요"`(해요) 같은 건 맞히지만, `"…인가요?"` 처럼 물음표로 끝나면
마지막 한글 덩어리를 보기 때문에 `요` 를 잡는다. 반면 `"…감사합니다!!🖤"` 는 이모지로 끝나도 마지막 **한글 덩어리**가
`감사합니다` 이므로 `다` 로 잡는다. **분류 실패는 값을 지어내지 않고 분모에서 빠지며, 그만큼 `confidence` 가 내려간다.**
형태소 분석기를 넣지 않는 이유는 의존성 0 원칙(`scripts/check.js` 가 강제)과 3.5일이다.

### 6-3. A2 판정 — 캐러셀 내부 순서

`docs/intent.md` 8절 A2 의 판정을 여기서 기록한다. 결과와 근거는 `report.md` 3절에 있고, 요약은:

> **판정: 같다.** Apify `childPosts` 배열 순서 == 인스타그램 웹 게시물의 캐러셀 DOM 순서.
> 게시물 2건(`DdVKdyACaC1` 10장, `DdJWXXTHCMv` 20장) 전부 인덱스 단위로 일치, 불일치 0건.
> 방법은 **앱 화면 눈 대조가 아니라 웹 게시물 DOM 순서 수집본과의 대조**다 — 이 차이를 `report.md` 에 그대로 적는다.

따라서 `opener_tendency` 를 순서 근거로 쓰는 것이 **허용된다.** 다만 4-2 의 3조건은 그대로 유지한다 —
A2 가 통과했다는 것은 "순서를 믿어도 된다"이지 "openers 를 분석하지 않고도 값을 내도 된다"가 아니다.

## 7. 이 이슈에서 안 하는 것

- `api/feed.js` 응답에 CurrentProfile 추출 결과를 끼워 넣지 않는다 (응답 모양 변경 = L, #24 계약 소관).
- `schemas/` 4종을 바꾸지 않는다. 바꿔야 한다고 판단한 것은 PR 본문에 적는다.
- 사진을 분석하지 않는다 (#12 소관). 이 모듈은 분석 결과를 **받는다.**
- Apify 라이브 호출을 만들지 않는다 (C1).
- 화면 코드를 만들지 않는다 (디에고 소유).
- `eval/golden/` 케이스를 늘리지 않는다 (C4 가 1케이스로 고정했다).
