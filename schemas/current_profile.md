# CurrentProfile

`schema_version: "1.0"`. 로컬 제안 계약이며 두 사람 합의는 pending.
모든 예시는 합성 수동 fixture로 실제 사용자·사진·AI 분석이 아니다.
검증 구현은 `lib/contracts.js`, JSON 예시는 `fixtures/`에 있다.

공통 Evidence = `{kind, ref, note}`. kind는 ig_post/uploaded_photo/user_text/aggregate/rule,
ref와 note는 비어 있지 않은 문자열이다. Claim<T> = `{value:T, confidence:number[0,1], evidence:Evidence[1..]}`.
필수 Claim의 키나 evidence를 지우면 거부한다. 프로필의 rule-only 근거는 금지한다.
알 수 없는 프로필 판단은 해당 필드를 생략하고 completeness를 낮춘다.

| 필드 | 타입·규칙 |
|---|---|
| profile_id | present이면 비어 있지 않은 string, absent이면 null |
| axis / present | target 또는 current / boolean |
| source | 아래 축별 enum |
| account_scope | main / sub / n/a |
| sample_size | 정수, present이면 ≥1, absent이면 0 |
| completeness | visual/language/sequence 각각 number 0..1 |
| visual | 아래 선택 Claim들의 객체 |
| language | 아래 선택 Claim들의 객체, completeness.language=0이면 null (역도 성립) |
| sequence | carousel_count 정수 ≥0, 선택 opener_tendency Claim |
| raw_freetext | freetext 입력이면 nonempty string, 그 외 null |
| created_at | ISO timestamp string |

visual의 선택 항목: palette Claim<{hue_mean:0..360,sat_mean:0..1,bright_mean:0..1,palette_hex:hex string[0..3]}>,
tone_words/subjects Claim<string[]>, composition_mix Claim<{full_frame:0..1,negative_space:0..1}> (합 1),
scale_mix Claim<{closeup:0..1,midshot:0..1,fullshot:0..1}> (합 1).
language의 선택 항목: caption_len Claim<{p50:integer≥0,p90:integer≥p50,unit:"자"}>, emoji_rate Claim<number≥0>,
ending_style Claim<해요|다|명사형|혼합>, linebreak_habit Claim<없음|짧게 자주|문단>, empty_caption_ratio Claim<number[0,1]>.
language가 객체이면 banned_words:string[]은 필수이며 Claim이 아니다.
sequence.opener_tendency는 Claim<풀샷|클로즈업|인물|불명>. carousel_count=0이면 생략하거나 불명만 가능하다.

axis=current. present=true이면 source는 instagram_api/cached/photo_upload이다 (API 구현을 뜻하지 않음).
present=false는 정상 입력: profile_id=null, source=none, account_scope=n/a, sample_size=0,
completeness 전부 0, visual={}, language=null, sequence={}, raw_freetext=null.
초안에서 불명확하던 absent의 필드 값을 위와 같이 구체화했다.
아래 배열은 present/absent 샘플이며 개별 계약은 배열 원소 하나다.

```json
[
  {
    "schema_version": "1.0",
    "profile_id": "cur_synthetic",
    "axis": "current",
    "present": true,
    "source": "cached",
    "account_scope": "n/a",
    "sample_size": 1,
    "completeness": {
      "visual": 0.2,
      "language": 0.4,
      "sequence": 0
    },
    "visual": {
      "tone_words": {
        "value": [
          "조용하고 짧게"
        ],
        "confidence": 1,
        "evidence": [
          {
            "kind": "user_text",
            "ref": "tgt_synthetic_quiet:input",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      }
    },
    "language": {
      "caption_len": {
        "value": {
          "p50": 18,
          "p90": 18,
          "unit": "자"
        },
        "confidence": 1,
        "evidence": [
          {
            "kind": "user_text",
            "ref": "tgt_synthetic_quiet:input",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "empty_caption_ratio": {
        "value": 0.5,
        "confidence": 1,
        "evidence": [
          {
            "kind": "user_text",
            "ref": "tgt_synthetic_quiet:input",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "banned_words": [
        "이처럼",
        "또한",
        "이를 통해",
        "이러한",
        "마침내"
      ]
    },
    "sequence": {
      "carousel_count": 0
    },
    "raw_freetext": null,
    "created_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "profile_id": null,
    "axis": "current",
    "present": false,
    "source": "none",
    "account_scope": "n/a",
    "sample_size": 0,
    "completeness": {
      "visual": 0,
      "language": 0,
      "sequence": 0
    },
    "visual": {},
    "language": null,
    "sequence": {},
    "raw_freetext": null,
    "created_at": "2026-09-17T00:00:00.000Z"
  }
]
```
