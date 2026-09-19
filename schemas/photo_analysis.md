# PhotoAnalysis

`schema_version: "1.0"`. 로컬 제안 계약이며 두 사람 합의는 pending.
모든 예시는 합성 수동 fixture로 실제 사용자·사진·AI 분석이 아니다.
검증 구현은 `lib/contracts.js`, JSON 예시는 `fixtures/`에 있다.

공통 Evidence = `{kind, ref, note}`. kind는 ig_post/uploaded_photo/user_text/aggregate/rule,
ref와 note는 비어 있지 않은 문자열이다. Claim<T> = `{value:T, confidence:number[0,1], evidence:Evidence[1..]}`.
필수 Claim의 키나 evidence를 지우면 거부한다. 프로필의 rule-only 근거는 금지한다.
알 수 없는 프로필 판단은 해당 필드를 생략하고 completeness를 낮춘다.

| 필드 | 타입·규칙 |
|---|---|
| photo_id / file_ref | nonempty string / nonempty string, 입력 파일 또는 오브젝트 참조 |
| input_index | 0부터 시작하는 정수 |
| color | hue_mean:number 0..360, sat_mean/bright_mean:number 0..1, palette_hex:hex string[0..3] |
| composition | full_frame / negative_space |
| scale | closeup / midshot / fullshot |
| subjects / describable_facts | string[] (불명확하면 빈 배열) |
| has_face / text_in_image | boolean / nonempty string 또는 null |
| quality_flags | (blurry / dark / duplicate_of:<id>)[] |
| analysis_source / model | vision_model 또는 heuristic / nonempty string |
| analyzed_at | ISO timestamp |
| analysis_receipt | 선택 opaque string. 서버가 세션·사진 묶음·사진 ID·바이트 해시를 서명한 경우에만 포함 |

초안 대비 필드 변경 없음. F3는 describable_facts 밖의 장소·인물·시간·감정을 만들어내지 않는다.
샘플 모음은 독립 입력 ID 대조를 위해 3장이 아닌 15장이다. 합성 SVG 카드이며 실사진 분석이 아니다.

```json
[
  {
    "schema_version": "1.0",
    "photo_id": "ph_01",
    "file_ref": "eval/golden/case_01/photos/ph_01.svg",
    "input_index": 0,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#e8dfd2"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 1",
    "describable_facts": [
      "단색 카드",
      "synthetic 1 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_02",
    "file_ref": "eval/golden/case_01/photos/ph_02.svg",
    "input_index": 1,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#8f9b86"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 2",
    "describable_facts": [
      "단색 카드",
      "synthetic 2 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_03",
    "file_ref": "eval/golden/case_01/photos/ph_03.svg",
    "input_index": 2,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#d4a891"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 3",
    "describable_facts": [
      "단색 카드",
      "synthetic 3 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_04",
    "file_ref": "eval/golden/case_01/photos/ph_04.svg",
    "input_index": 3,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#e8dfd2"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 4",
    "describable_facts": [
      "단색 카드",
      "synthetic 4 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_05",
    "file_ref": "eval/golden/case_01/photos/ph_05.svg",
    "input_index": 4,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#8f9b86"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 5",
    "describable_facts": [
      "단색 카드",
      "synthetic 5 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_06",
    "file_ref": "eval/golden/case_01/photos/ph_06.svg",
    "input_index": 5,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#d4a891"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 6",
    "describable_facts": [
      "단색 카드",
      "synthetic 6 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_07",
    "file_ref": "eval/golden/case_01/photos/ph_07.svg",
    "input_index": 6,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#e8dfd2"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 7",
    "describable_facts": [
      "단색 카드",
      "synthetic 7 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_08",
    "file_ref": "eval/golden/case_01/photos/ph_08.svg",
    "input_index": 7,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#8f9b86"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 8",
    "describable_facts": [
      "단색 카드",
      "synthetic 8 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_09",
    "file_ref": "eval/golden/case_01/photos/ph_09.svg",
    "input_index": 8,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#d4a891"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 9",
    "describable_facts": [
      "단색 카드",
      "synthetic 9 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_10",
    "file_ref": "eval/golden/case_01/photos/ph_10.svg",
    "input_index": 9,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#e8dfd2"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 10",
    "describable_facts": [
      "단색 카드",
      "synthetic 10 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_11",
    "file_ref": "eval/golden/case_01/photos/ph_11.svg",
    "input_index": 10,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#8f9b86"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 11",
    "describable_facts": [
      "단색 카드",
      "synthetic 11 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_12",
    "file_ref": "eval/golden/case_01/photos/ph_12.svg",
    "input_index": 11,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#d4a891"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 12",
    "describable_facts": [
      "단색 카드",
      "synthetic 12 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_13",
    "file_ref": "eval/golden/case_01/photos/ph_13.svg",
    "input_index": 12,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#e8dfd2"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 13",
    "describable_facts": [
      "단색 카드",
      "synthetic 13 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_14",
    "file_ref": "eval/golden/case_01/photos/ph_14.svg",
    "input_index": 13,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#8f9b86"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 14",
    "describable_facts": [
      "단색 카드",
      "synthetic 14 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  },
  {
    "schema_version": "1.0",
    "photo_id": "ph_15",
    "file_ref": "eval/golden/case_01/photos/ph_15.svg",
    "input_index": 14,
    "color": {
      "hue_mean": 34,
      "sat_mean": 0.3,
      "bright_mean": 0.7,
      "palette_hex": [
        "#d4a891"
      ]
    },
    "composition": "negative_space",
    "scale": "fullshot",
    "subjects": [
      "합성 색상 카드"
    ],
    "has_face": false,
    "text_in_image": "synthetic 15",
    "describable_facts": [
      "단색 카드",
      "synthetic 15 표기"
    ],
    "quality_flags": [],
    "analysis_source": "heuristic",
    "model": "manual-synthetic-bootstrap",
    "analyzed_at": "2026-09-17T00:00:00.000Z"
  }
]
```
