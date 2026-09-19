# OrderedFeed

`schema_version: "1.0"`. 로컬 제안 계약이며 두 사람 합의는 pending.
모든 예시는 합성 수동 fixture로 실제 사용자·사진·AI 분석이 아니다.
검증 구현은 `lib/contracts.js`, JSON 예시는 `fixtures/`에 있다.

공통 Evidence = `{kind, ref, note}`. kind는 ig_post/uploaded_photo/user_text/aggregate/rule,
ref와 note는 비어 있지 않은 문자열이다. `kind="uploaded_photo"` 의 ref는 실제 입력 사진 ID로 해소되어야 한다 (E10; 다른 kind의 참조 도메인은 이 계약 밖이다). Claim<T> = `{value:T, confidence:number[0,1], evidence:Evidence[1..]}`.
필수 Claim의 키나 evidence를 지우면 거부한다. 프로필의 rule-only 근거는 금지한다.
알 수 없는 프로필 판단은 해당 필드를 생략하고 completeness를 낮춘다.

F2→F3의 유일한 객체이며 이 문서가 실행 계약이다. 입력 3~20장에 대해 slots가 정확히 N개다.

| 필드 | 타입·규칙 |
|---|---|
| feed_id / session_id | nonempty string |
| applied_profile.target_profile_id | nonempty string, 실제 TargetProfile 입력의 profile_id와 일치 (E9) |
| applied_profile.current_profile_id | nonempty string 또는 null, 실제 current 입력 ID와 일치 |
| applied_profile.corrected | boolean, disclosure=corrected와 동치 |
| applied_profile.disclosure | "corrected" 또는 "target_only" |
| applied_profile.deltas | 아래 delta[0..1] |
| applied_profile.visual/language/sequence | TargetProfile의 같은 필드 계약; 합성 결과. freetext target의 선택 `caption_coverage: Claim<all|sparse>`를 그대로 보존 |
| slots[].position | 정수 1..N, 빠짐없이 한 번씩 |
| slots[].photo_id | 실제 입력 ID를 중복·누락·외부 ID 없이 한 번씩 |
| slots[].narrative_role | opener / sustain / turn / closer |
| slots[].rationale | Claim<nonempty string>, F3가 다듬어도 evidence 보존 |
| slots[].caption_inputs | describable_facts:string[], adjacent_overlap:number 0..1, is_visual_peak:boolean |
| slots[].omit_suggestion | `{recommended:boolean,reason:string|null,evidence:Evidence[]}`. 자동 제외하지 않으며 서명된 동일 바이트 중복만 true |
| omit_summary | `{recommended_count:integer,message:string}`. 권고 0개도 명시 |
| invariants | input_count/output_count:integer N, unique_photo_ids:true |
| generated_at | ISO timestamp |

current_profile_id=null이면 corrected=false, disclosure=target_only, deltas=[]이어야 한다.
검증기는 실제 입력 사진 ID와 CurrentProfile을 별도 인수로 받는다. invariants는 진실의 원천이 아니며 관측값과 추가 대조한다.
`validateFeed(feed, inputPhotoIds, currentProfile, targetProfile, photoAnalyses)`와 E8 평가에는 실제 CurrentProfile 입력이 필수다. 같은 방식으로 실제 TargetProfile(E9)과 실제 PhotoAnalysis 목록(E11)도 필수 인수다. `validateExport(output, feed, inputPhotoIds)`는 export의 evidence 해소(E10)를 위해 실제 입력 ID를 받는다. 인수/필드 생략과 undefined는 거부한다. 현재 프로필이 없으면 CurrentProfile 계약의 `present:false` 객체를 명시적으로 전달한다. 출력의 current_profile_id로 입력을 추측하거나 생략된 입력을 자동 보정하지 않는다.
slots 배열의 저장 순서는 의미가 없으며 표시 순서는 position이 결정한다. 소비자는 position 오름차순으로 표시한다.
사진 목록에서 caption_inputs.describable_facts를 복사한다. 복사원은 **그 슬롯의 photo_id와 같은** PhotoAnalysis이며, 다른 사진의 사실을 섞으면 E11로 거부한다. 비움 후보의 overlap 등은 F3의 재료이며 F2가 캡션 상태를 결정하지 않는다.
`omit_suggestion`은 입력 N장과 출력 N슬롯을 바꾸지 않는다. 공개 `/api/feed`는 `analysis_receipt` 두 개가 같은 세션·묶음·바이트 해시를 인증할 때만 `duplicate_of`를 관측값으로 사용하며, 호출자가 직접 보낸 중복 플래그는 제거한다.

delta는 `{field:"language.caption_len.p50",target:number≥0,current:number≥0,resolved:number≥0,rule:"log_midpoint",note_key:"caption_len_gap",evidence:Evidence[1..]}`.
초안 대비 F3 export에 photo_id와 omit_reason을 추가했다 (아래). delta를 1종·최대 1개로 제한하고 absent 정합성과 입력 ID 대조를 명시했다.

## PhotoPlan 확장 (OrderedFeed 1.1)

사진만 경로는 기존 PhotoPlan 1.0을 `context.target`으로 전달한다. 이때 applied_profile은 `target_profile_id:null`, `photo_plan_id:plan.plan_id`, `language:null`, `corrected:false`, `disclosure:"target_only"`, `deltas:[]`이다. 가짜 TargetProfile을 만들지 않는다. 사진 ID·근거·PhotoPlan.sample_size를 실제 입력과 대조한다. 기존 TargetProfile을 쓰는 OrderedFeed 1.0과 아래 예시는 그대로 유효하다.

기존 게시물을 업로드한 경우 current 사진은 선택 사진과 별도 ID로 제공하고 해당 프로필 근거만 그 ID를 참조한다. 자세한 요청/오류/내보내기 구분은 [연결 계약](interaction.md)과 fixtures/interaction.sample.json을 따른다.

## F3 export (별도 출력, OrderedFeed에 섞지 않음)

`{title:string, slots:[{position:integer,photo_id:string,omit_reason:string|null,caption_state:"seed"|"omitted"|"user",text:string|null,evidence:Evidence[1..]}]}`.
title은 공백만인 값·배열·개행을 허용하지 않는 단일 문자열 하나이며 titles 배열을 함께 보내지 않는다.
export positions도 1..N을 한 번씩 가진다. 각 position의 photo_id는 전달받은 OrderedFeed와 일치해야 한다.
omitted이면 omit_reason은 nonempty string이고 evidence가 그 이유를 뒷받침한다. seed/user의 omit_reason은 null이다. omitted이면 text=null, seed/user이면 nonempty string이다. seed는 `쓸 거리: …\n이 중 기억에 남은 건?` 두 줄이며 완성 캡션으로 내보내지 않는다.
비움의 evidence도 보존하며 사용자가 쓴 문장의 evidence는 사용자 입력 출처로 연결한다.
`caption_state="user"`는 유효한 `kind="user_text"` Evidence를 최소 1개 포함해야 한다. 사진 근거를 함께 넣을 수 있지만 사진 근거만으로 user 상태를 허용하지 않는다. ref/note의 형식을 검사하며 실제 사용자 입력의 진위 인증은 이 계약의 범위가 아니다.
서버 export slots는 배열의 저장 순서와 무관하게 position으로 순서를 정하고 원본 feed의 photo_id와 대조한다. 사용자 draft는 validateEditedExport로 같은 사진 집합의 재정렬을 허용하며 원본 근거를 photo_id에 보존한다.
E6는 이 별도 export를 읽으며 feed에 title이 없다고 실패시키지 않는다.
E4/E5/E7 자동 판정은 생략하며 수동 스팟체크로 대체한다 (실제 데모 검증 pending).
즉 재료→캡션(E4)은 여전히 사람이 보고, 사진→재료(E11)는 자동으로 본다. 체인의 앞쪽 절반만 기계가 막는다는 뜻이다.

생성 연결 계약 제안: 향후 POST /api/generate 요청은 `{feed:OrderedFeed}`, 응답은 `{output:F3Export}`이다.
입력 feed의 순서와 photo_id를 유지하며 export validator는 원본 feed와 비교한다.
이 foundation에는 generate 경로가 없으며 아직 구현된 API라는 뜻이 아니다.

## Mock HTTP

GET /api/feed?mock=1 → 아래 OrderedFeed 단일 객체 (200).
resource=target_profile/current_profile/photo_analysis를 붙이면 각 샘플 배열 (200).
mock 없음 → 501 LIVE_NOT_IMPLEMENTED, 잘못된 mock/resource → 400, GET 외 → 405.
외부 호출·지연·SSE는 없다. 네트워크 키 없이 로컬 파일만 읽는다.

## 15슬롯 전체 예시

```json
{
  "schema_version": "1.0",
  "feed_id": "fd_tgt_synthetic_quiet",
  "session_id": "ss_synthetic",
  "applied_profile": {
    "target_profile_id": "tgt_synthetic_quiet",
    "current_profile_id": null,
    "corrected": false,
    "disclosure": "target_only",
    "deltas": [],
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
    }
  },
  "slots": [
    {
      "position": 1,
      "photo_id": "ph_01",
      "narrative_role": "opener",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_01",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 1 표기"
        ],
        "adjacent_overlap": 0,
        "is_visual_peak": true
      }
    },
    {
      "position": 2,
      "photo_id": "ph_02",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_02",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 2 표기"
        ],
        "adjacent_overlap": 0.8,
        "is_visual_peak": false
      }
    },
    {
      "position": 3,
      "photo_id": "ph_03",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_03",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 3 표기"
        ],
        "adjacent_overlap": 0,
        "is_visual_peak": false
      }
    },
    {
      "position": 4,
      "photo_id": "ph_04",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_04",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 4 표기"
        ],
        "adjacent_overlap": 0.8,
        "is_visual_peak": false
      }
    },
    {
      "position": 5,
      "photo_id": "ph_05",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_05",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 5 표기"
        ],
        "adjacent_overlap": 0,
        "is_visual_peak": false
      }
    },
    {
      "position": 6,
      "photo_id": "ph_06",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_06",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 6 표기"
        ],
        "adjacent_overlap": 0.8,
        "is_visual_peak": false
      }
    },
    {
      "position": 7,
      "photo_id": "ph_07",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_07",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 7 표기"
        ],
        "adjacent_overlap": 0,
        "is_visual_peak": false
      }
    },
    {
      "position": 8,
      "photo_id": "ph_08",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_08",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 8 표기"
        ],
        "adjacent_overlap": 0.8,
        "is_visual_peak": false
      }
    },
    {
      "position": 9,
      "photo_id": "ph_09",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_09",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 9 표기"
        ],
        "adjacent_overlap": 0,
        "is_visual_peak": false
      }
    },
    {
      "position": 10,
      "photo_id": "ph_10",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_10",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 10 표기"
        ],
        "adjacent_overlap": 0.8,
        "is_visual_peak": false
      }
    },
    {
      "position": 11,
      "photo_id": "ph_11",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_11",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 11 표기"
        ],
        "adjacent_overlap": 0,
        "is_visual_peak": false
      }
    },
    {
      "position": 12,
      "photo_id": "ph_12",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_12",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 12 표기"
        ],
        "adjacent_overlap": 0.8,
        "is_visual_peak": false
      }
    },
    {
      "position": 13,
      "photo_id": "ph_13",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_13",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 13 표기"
        ],
        "adjacent_overlap": 0,
        "is_visual_peak": false
      }
    },
    {
      "position": 14,
      "photo_id": "ph_14",
      "narrative_role": "sustain",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_14",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 14 표기"
        ],
        "adjacent_overlap": 0.8,
        "is_visual_peak": false
      }
    },
    {
      "position": 15,
      "photo_id": "ph_15",
      "narrative_role": "closer",
      "rationale": {
        "value": "합성 입력 순서를 사용한 목업 자리",
        "confidence": 1,
        "evidence": [
          {
            "kind": "uploaded_photo",
            "ref": "ph_15",
            "note": "수동 작성 합성 예시; 실제 사용자 관측 아님"
          }
        ]
      },
      "caption_inputs": {
        "describable_facts": [
          "단색 카드",
          "synthetic 15 표기"
        ],
        "adjacent_overlap": 0,
        "is_visual_peak": false
      }
    }
  ],
  "invariants": {
    "input_count": 15,
    "output_count": 15,
    "unique_photo_ids": true
  },
  "generated_at": "2026-09-17T00:00:00.000Z"
}
```
