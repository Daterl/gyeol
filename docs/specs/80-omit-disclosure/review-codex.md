# PR #90 Codex 교차 리뷰

**Merge 판정: 보류 — 실모델 4회 모두 비움이 있어, 이슈의 핵심 완료 조건인 실모델 0개/비0개 양쪽 증거는 아직 충족하지 못했다. 확인한 정상 경로에서 새로 발생한 기능 차단 버그는 발견하지 않았다.**

## 범위와 식별자

- 리뷰어: Codex (GPT-6 계열 세션), 작성자 Claude와 별도 모델 리뷰.
- 실행: 2026-09-18, 지정 워크트리 `.work/gyeol-80`에서만 검사. 코드·프롬프트 수정, 커밋, merge, 배포 없음.
- HEAD: `6666c7831bf0a256196a90d5f537504f3f1aa543`.
- 비교 base: `origin/develop` = `fc7911049f1550bc7b7639710e422ecc10faa5ff`. 로컬 `develop` 브랜치가 없어 원격 추적 ref 사용.
- `git diff origin/develop...HEAD` SHA-256: `49cb9e90dec96b19c8038026a2066f6f2a5b6b36ee375b182f7c4fbb977fe8a6`.
- Node `v22.22.3`에서 재현. package.json 선언은 Node 24.x이므로 Node 24 런타임 검증은 별도 미실시.
- CodeRabbit CLI 0.7.6 설치·인증은 확인했지만 외부 CodeRabbit 리뷰는 실행하지 않았다. 아래 판정은 Codex 직접 코드 검토와 실제 실행 증거다.

## 1. 실모델 4회 결과

`repeat-runs.mjs`의 입력 생성 방식과 동일하게 fixture 사진 관측 3개를 15개 ID로 확장했다. 같은 session_id, 같은 자유 텍스트, current=none으로 `buildFeed`를 한 번 실행한 뒤 **동일 input 객체**로 `generateOutput`을 4회 순차 호출했다. 사진 업로드/vision 분석을 새로 한 것이 아니라, 합성 관측 입력에 대한 실제 텍스트 생성 API 검증이다.

- 모델: `claude-haiku-4-5-20251001` (현재 output_model 고정 사용).
- 목표 문구: `차분하고 미니멀한 흑백 감성. 말수가 적고 여백이 많은 기록.`
- `applied_profile.language = null`; 기본 timeout 45초, max_tokens 8192, 프롬프트와 온도 변경 없음.
- `/Users/chowonjae/Desktop/projects/wanted/.env`를 `node:util.parseEnv`로 읽고 API key와 workspace ID 둘만 프로세스 환경에 설정했다. 키 출력·복사·커밋 없음.
- `fetchImpl`은 실제 `fetch`를 호출하고 응답 clone만 읽어 증거를 수집했다. 네트워크 응답 대체 없음. 유료 Messages 요청은 총 4개, 모두 HTTP 200/end_turn이며 추가 재시도 없음.
- 서버 HTTP 라우트를 네트워크로 띄우지는 않았다. 실모델 검증은 실제 서버 생성 함수 경로이며, HTTP 에러 매핑은 아래 로컬 `handleGenerate` 직접 실행으로 별도 확인했다.

실행 시작 UTC: `2026-09-18T03:38:09.992Z`. 입력 JSON SHA-256: `16d9d093295b97422629e8148ea6b9fa6bb359f99da77dbc3891255f27383e0c`.

| 회차 | 소요(ms) | 모델 원본 omitted | 반환 slots 실측 | omission.omitted | note_key | 원본 output 보존 |
|---|---:|---:|---:|---:|---|---|
| 1 | 9040 | 14 | 14 | 14 | `omission.some` | true |
| 2 | 10365 | 11 | 11 | 11 | `omission.some` | true |
| 3 | 10479 | 13 | 13 | 13 | `omission.some` | true |
| 4 | 8113 | 14 | 14 | 14 | `omission.some` | true |

모든 회차에서 모델 원본 output과 서버 반환 output의 JSON이 동일했다. 개수는 반환 슬롯을 별도 reduce로 다시 세었고, 부록에는 슬롯 전체를 남겨 사람이 개수를 재검산할 수 있게 했다.

**0개 회차는 관측되지 않았다.** “절반이 0개”라는 과거 분포는 이번 입력/모델/프롬프트 실행의 보장이 아니다. 4회 관측으로 과거 분포가 틀렸다거나 새 프롬프트가 분포를 바꿨다고 판단할 수도 없다. 예산 지시대로 4회에서 멈췄으며, 프롬프트를 바꾸거나 응답을 편집해 0개 실모델 증거를 만들지 않았다.

동일 input에 전부 filled인 **목 응답**을 넣은 별도 회귀 검증에서는 아래 값을 확인했다. 이는 실모델 0개 회차를 대신하지 않는다.

```json
{
  "omitted": 0,
  "total": 15,
  "note_key": "omission.none",
  "note": "이번에는 15자리 모두 문장을 두는 편이 낫다고 봤어요.",
  "evidence": [
    {
      "kind": "rule",
      "ref": "gyeol.omit.disclosure",
      "note": "생성 결과의 omitted 슬롯을 세어 0/15로 적었다"
    }
  ]
}
```

## 2. validateOmission 실패 경로 직접 재현

`fixtures/interaction.sample.json`의 `all_omitted` 3개 응답으로 정상 envelope를 만든 뒤 필드를 하나씩 바꿨다. 공유 validator를 직접 호출한 결과와, 변조 응답을 목 transport에 넣어 `handleGenerate(new Request(...))`로 호출한 결과를 각각 확인했다. 실모델 실행과 구분되는 **결함 주입 검사**이며 비용이 들지 않는다.

| 주입 | 공유 validator 직접 실행 | handleGenerate 결과 |
|---|---|---|
| 실제 3개인데 omitted=4 | ContractError: omission.omitted | 502, MODEL_CONTRACT, retryable=true |
| 실제 3슬롯인데 total=99 | ContractError: omission.total | 502, MODEL_CONTRACT, retryable=true |
| 실제 비움 3개인데 note_key=omission.none | ContractError: omission.note_key | 502, MODEL_CONTRACT, retryable=true |
| note만 “99자리 모두 문장을…”으로 조작 | 통과 | 200; 서버가 올바른 3/3 문장으로 재생성 |
| evidence.note만 “99/99”로 조작 | 통과 | 200; 서버가 올바른 근거로 재생성 |
| omission 전체 생략 | 통과 | 정상 원본 모델 응답에 필요한 허용; 서버 생성 단계가 필드 추가 |

따라서 “개수·키가 틀리면 MODEL_CONTRACT”는 재현됐다. 정확히 말하면 `validateOmission` 자체는 `ContractError`를 던지고, `generateOutput`의 catch가 `MODEL_CONTRACT`로 바꾼다.

## 3. 심각도별 지적

### P2 — 검증 완료 조건 미충족: 실모델 0개 분기 증거 없음

위치: [spec.md](spec.md) 7절, [report.md](report.md) 2·6·8절.

실모델에서는 some만 4/4 관측했다. 기존 보고서의 0/12/0/13/0/12는 정해 놓은 목 응답 재생이며, 모델 분포와 실제 none 경로를 증명하지 못한다. 이번 검증은 실제 생성·계수 경로의 증거를 추가했지만 **양쪽 실모델 출력**이라는 완료 조건은 여전히 열린 상태다. 이는 코드 결함 판정이 아니라 merge 검증 게이트 미충족이다. 후속 유료 실험 범위를 별도로 정하거나, 담당자가 해당 완료 조건의 수용 기준을 명시적으로 정해야 한다. 이번 작업에서 임의로 호출 수나 입력을 바꾸지 않았다.

### P3 — “계약 검증이 문장까지 실측을 강제한다”는 해석은 과장

위치: [lib/interaction.js](../../../lib/interaction.js) 102–103·113행, [lib/output-generation.js](../../../lib/output-generation.js) 45–54·73행.

note는 비어 있지 않은 200자 이하 문자열인지, evidence는 특정 kind/ref가 존재하는지만 검사한다. 위의 “99자리” 문장과 “99/99” 근거가 공유 validator를 통과했다. 또한 omission 생략도 허용된다. 해당 validator는 브라우저 응답 검증에도 사용된다.

다만 **현행 정상 서버 경로에서는 잘못된 문장이 전송되지 않았다.** 서버가 실제 slots의 숫자로 템플릿을 다시 만들기 때문이다. 따라서 현재 P2(추론 금지) 충족의 근거는 숫자/키 검증과 서버의 결정적 생성 로직을 합친 것이며, validator 하나가 모든 문장 의미를 보장하는 것은 아니다. 검증 보장을 더 강하게 요구한다면 원본 모델 검증과 최종 envelope 검증을 구분하고, 최종 note/evidence의 값도 확인하는 방안을 검토할 수 있다. 이번 PR의 필수 수정으로 단정하지 않는다.

### P3 — 프롬프트 불변·분포 불변 표현은 증거보다 강함

위치: [report.md](report.md) 7절, [prompts/output/omit_reason.md](../../../prompts/output/omit_reason.md) 13행.

기존 보고서에는 “모델에게 주는 지시 문장은 한 글자도 바뀌지 않았다”라고 적혀 있지만, 실제 모델 system prompt에 “개수를 맞추려고 비우거나 채우지 않는다” 등의 한 줄이 추가됐다. 최소 1개를 강제하는 변경은 아니며 기존 판단 조건도 그대로다. 다만 모델 입력이 바뀐 이상 분포 불변까지 diff만으로 증명할 수는 없다. 정확한 표현은 “강제 비움·채움이나 후처리 개수 변경을 추가하지 않았다”다.

P0/P1 지적 없음. 현재 서버 경로에서 잘못된 omission 숫자나 모델 생성 note가 그대로 반환되는 결함도 발견하지 않았다.

## 4. 요구사항 판단

- **한국어 문안:** “이번에는 15자리 모두 문장을 두는 편이 낫다고 봤어요.”는 의미가 자연스럽게 전달되며 선택/판단으로 읽힌다. “자리 모두에 문장을…” 또는 “모든 사진에 문장을…”이 조사상 조금 더 매끄러울 수 있지만 취향 수준이고 수정 필수는 아니다. 이는 리뷰어 언어 판단이며 사용자 이해도 실험은 아니다.
- **note의 출처:** 모델 structured output schema에는 omission이 없다. 서버가 최종 output.slots를 세어 고정 템플릿에 숫자를 넣는다. note가 추론으로 생성되지 않는다는 요구는 현재 구현에서 충족한다. 다만 “낫다고 봤어요”는 출력 선택의 제품적 요약이지, 모델 내부 사고를 별도로 관측했다는 증거는 아니다.
- **개수 조작:** 새 diff는 discloseOmission 계산과 응답 envelope 추가다. stabilizeOmission은 base부터 존재하며 본 PR이 추가·변경하지 않았다. 이번 4회는 그 규칙에 의해 output이 바뀌지 않았다. “저장소 전체에 비움 후처리가 전혀 없다”는 뜻으로 확대하면 안 된다.
- **프롬프트:** 추가 문장은 개수 강제를 금지하고 omission을 모델이 직접 쓰지 못하게 설명한다. 새 최소 비움 수, 목표 quota, temperature 변경 없음.
- **키 값:** 실제 계약은 `none`/`some` 축약형이 아니라 `omission.none`/`omission.some`이다.
- **프론트:** 화면 구현 제외는 명시된 범위이므로 미표시를 이번 PR 버그로 분류하지 않았다. 다만 `src/types/contracts.ts:163`의 GenerateResponse에 omission 타입이 없어, 후속 화면 연결 때 타입과 데이터 보존도 함께 반영해야 한다.

## 5. 요청한 검사 재현

| 명령 | 결과 | 증거/범위 |
|---|---|---|
| npm test | PASS | tests 201 / pass 201 / fail 0 / skipped 0 |
| npm run eval | PASS | quiet/detail 불변식 및 의도된 broken 입력 실패; 주입 모델 variant 0/1 통과 |
| npm run check | PASS | 65 JS/JSON files checked; four schema examples match fixtures |
| npm run lint | PASS | Checked 40 files; No fixes applied |
| npm run typecheck | PASS | next typegen 성공; tsc --noEmit 종료 성공 |

모든 요청 명령을 새로 실행했다. eval이 직접 밝히듯 E4/E5/E7은 manual spot-check only이고 real demo review pending이다. eval의 injected model variant 성공을 실모델 품질 증거로 사용하지 않았다. 배포·브라우저 화면·Node 24 검사 및 테스트 범위 밖의 전면 보안 검사는 수행하지 않았다.

완료 직전 코디네이터가 PR #92 릴리스 및 Production 갱신을 통지했다. 통지에 따르면 D4/D5의 Production 503은 API key/workspace 환경변수 누락이며, 이를 이번 PR의 코드 결함으로 집계하지 않았다. 이 배포 상태는 코디네이터 제공 정보로 독립 재검증하지 않았다. 본 보고서는 위 고정 SHA의 PR #90 리뷰이고, 공개 배포 D6 재감사는 별도 범위이므로 수행하지 않았다.

## 6. 증거 독립성과 보고서 점검

mandela 관점에서 기존 반복 실험은 **Tautology** 위험이 있다. 재생할 개수를 먼저 정하고 그 개수가 다시 출력된 사실은 계수 구현 검증에는 유효하지만 실제 모델 분포 검증에는 독립 근거가 아니다. 이번에는 실제 provider 응답, request ID, 슬롯 전체, 서버 결과와의 동등성을 보존했고, 0개가 나오지 않은 사실도 그대로 남겼다. 검사자가 실험 설계도 했으므로 블라인드 사용자 품질 평가라고 주장하지 않는다.

보고서 sip 점검은 실측 로그 대조, mandela의 검증 범위 구분, ssotize 읽기 전용 문서 대조, re0 문장 정리로 제한했다. 원본 report/spec은 이 보고서와 실측 범위가 다르므로 덮어쓰지 않았다. shower의 별도 하위 리뷰 실행은 dispatched worker의 재위임 제한과 role 지정 native 도구 부재로 생략했으며 독립 재검토가 완료됐다고 주장하지 않는다. 외부 사실·휴대성 주장이 없는 실행 기록이므로 외부 factchk 검색과 detool은 생략했다.

## 부록 A. 실제 모델 출력과 서버 omission

각 회차의 provider 모델·usage·request ID와 JSON 원본을 남긴다. `raw_model_output` 전체는 서버 반환 `output`과 동일했으며, `returned_omission`만 서버가 추가했다. 인증 헤더·키·workspace ID는 포함하지 않았다.

### 1회차

```json
{
  "round": 1,
  "startedAt": "2026-09-18T03:38:09.992Z",
  "elapsedMs": 9040,
  "provider": {
    "status": 200,
    "requestId": "req_011CfAD1CLgGsRbZccLdHxUR",
    "model": "claude-haiku-4-5-20251001",
    "usage": {
      "input_tokens": 7812,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 0,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 0
      },
      "output_tokens": 1807,
      "service_tier": "standard",
      "inference_geo": "not_available"
    },
    "stop_reason": "end_turn"
  },
  "raw_model_output": {
    "output": {
      "title": "단색 카드 시리즈",
      "slots": [
        {
          "position": 1,
          "photo_id": "ph_01",
          "caption_state": "filled",
          "text": "단색 카드.",
          "omit_reason": null,
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_01",
              "note": "단색 카드"
            }
          ]
        },
        {
          "position": 2,
          "photo_id": "ph_04",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_04",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 3,
          "photo_id": "ph_05",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_05",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 4,
          "photo_id": "ph_06",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_06",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 5,
          "photo_id": "ph_07",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_07",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 6,
          "photo_id": "ph_08",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_08",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 7,
          "photo_id": "ph_09",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_09",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 8,
          "photo_id": "ph_10",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_10",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 9,
          "photo_id": "ph_11",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_11",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 10,
          "photo_id": "ph_03",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_03",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 11,
          "photo_id": "ph_12",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_12",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 12,
          "photo_id": "ph_13",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_13",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 13,
          "photo_id": "ph_14",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_14",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 14,
          "photo_id": "ph_15",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_15",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        },
        {
          "position": 15,
          "photo_id": "ph_02",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 겹치는 구성이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_02",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 간 높은 유사도"
            }
          ]
        }
      ]
    }
  },
  "returned_omission": {
    "omitted": 14,
    "total": 15,
    "note_key": "omission.some",
    "note": "15자리 중 14자리는 사진만 두는 편이 낫다고 봤어요.",
    "evidence": [
      {
        "kind": "rule",
        "ref": "gyeol.omit.disclosure",
        "note": "생성 결과의 omitted 슬롯을 세어 14/15로 적었다"
      }
    ]
  },
  "actual_omitted": 14,
  "raw_output_equals_returned_output": true
}
```

### 2회차

```json
{
  "round": 2,
  "startedAt": "2026-09-18T03:38:19.037Z",
  "elapsedMs": 10365,
  "provider": {
    "status": 200,
    "requestId": "req_011CfAD1r5ZNVBGuJYhfKHFj",
    "model": "claude-haiku-4-5-20251001",
    "usage": {
      "input_tokens": 7812,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 0,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 0
      },
      "output_tokens": 2117,
      "service_tier": "standard",
      "inference_geo": "not_available"
    },
    "stop_reason": "end_turn"
  },
  "raw_model_output": {
    "output": {
      "title": "단색 카드 배열",
      "slots": [
        {
          "position": 1,
          "photo_id": "ph_01",
          "caption_state": "filled",
          "text": "밝은 베이지 카드.",
          "omit_reason": null,
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_01",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            }
          ]
        },
        {
          "position": 2,
          "photo_id": "ph_04",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 색상이라 사진만 두어도 좋아요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_04",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 색상 반복"
            }
          ]
        },
        {
          "position": 3,
          "photo_id": "ph_05",
          "caption_state": "filled",
          "text": "초록빛 회색 카드.",
          "omit_reason": null,
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_05",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            }
          ]
        },
        {
          "position": 4,
          "photo_id": "ph_06",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 다른 색상이지만, 같은 구성이 반복되어 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_06",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "누적된 구성 반복"
            }
          ]
        },
        {
          "position": 5,
          "photo_id": "ph_07",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 색상이라 사진만 두어도 좋아요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_07",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 색상 반복"
            }
          ]
        },
        {
          "position": 6,
          "photo_id": "ph_08",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 다른 색상이지만, 같은 구성이 반복되어 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_08",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "누적된 구성 반복"
            }
          ]
        },
        {
          "position": 7,
          "photo_id": "ph_09",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 다른 색상이지만, 같은 구성이 반복되어 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_09",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "누적된 구성 반복"
            }
          ]
        },
        {
          "position": 8,
          "photo_id": "ph_10",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 색상이라 사진만 두어도 좋아요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_10",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 색상 반복"
            }
          ]
        },
        {
          "position": 9,
          "photo_id": "ph_11",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 다른 색상이지만, 같은 구성이 반복되어 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_11",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "누적된 구성 반복"
            }
          ]
        },
        {
          "position": 10,
          "photo_id": "ph_03",
          "caption_state": "filled",
          "text": "갈색 카드.",
          "omit_reason": null,
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_03",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            }
          ]
        },
        {
          "position": 11,
          "photo_id": "ph_12",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 색상이라 사진만 두어도 좋아요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_12",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 슬롯 색상 반복"
            }
          ]
        },
        {
          "position": 12,
          "photo_id": "ph_13",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 다른 색상이지만, 같은 구성이 반복되어 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_13",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "누적된 구성 반복"
            }
          ]
        },
        {
          "position": 13,
          "photo_id": "ph_14",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 다른 색상이지만, 같은 구성이 반복되어 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_14",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "누적된 구성 반복"
            }
          ]
        },
        {
          "position": 14,
          "photo_id": "ph_15",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 다른 색상이지만, 같은 구성이 반복되어 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_15",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "누적된 구성 반복"
            }
          ]
        },
        {
          "position": 15,
          "photo_id": "ph_02",
          "caption_state": "filled",
          "text": "초록빛 회색 카드.",
          "omit_reason": null,
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_02",
              "note": "단색 카드, 밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            }
          ]
        }
      ]
    }
  },
  "returned_omission": {
    "omitted": 11,
    "total": 15,
    "note_key": "omission.some",
    "note": "15자리 중 11자리는 사진만 두는 편이 낫다고 봤어요.",
    "evidence": [
      {
        "kind": "rule",
        "ref": "gyeol.omit.disclosure",
        "note": "생성 결과의 omitted 슬롯을 세어 11/15로 적었다"
      }
    ]
  },
  "actual_omitted": 11,
  "raw_output_equals_returned_output": true
}
```

### 3회차

```json
{
  "round": 3,
  "startedAt": "2026-09-18T03:38:29.404Z",
  "elapsedMs": 10479,
  "provider": {
    "status": 200,
    "requestId": "req_011CfAD2cSYPU91iYrLAEBkf",
    "model": "claude-haiku-4-5-20251001",
    "usage": {
      "input_tokens": 7812,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 0,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 0
      },
      "output_tokens": 2355,
      "service_tier": "standard",
      "inference_geo": "not_available"
    },
    "stop_reason": "end_turn"
  },
  "raw_model_output": {
    "output": {
      "title": "단색 카드 연작",
      "slots": [
        {
          "position": 1,
          "photo_id": "ph_01",
          "caption_state": "filled",
          "text": "밝은 베이지 톤의 단색 카드.",
          "omit_reason": null,
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_01",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            }
          ]
        },
        {
          "position": 2,
          "photo_id": "ph_04",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_04",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 3,
          "photo_id": "ph_05",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_05",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 4,
          "photo_id": "ph_06",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_06",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 5,
          "photo_id": "ph_07",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_07",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 6,
          "photo_id": "ph_08",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_08",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 7,
          "photo_id": "ph_09",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_09",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 8,
          "photo_id": "ph_10",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_10",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 9,
          "photo_id": "ph_11",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_11",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 10,
          "photo_id": "ph_03",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_03",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 11,
          "photo_id": "ph_12",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_12",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 12,
          "photo_id": "ph_13",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_13",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #e8dfd2"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 13,
          "photo_id": "ph_14",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_14",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 14,
          "photo_id": "ph_15",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 카드 형식과 색상이 반복되어, 이 자리는 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_15",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #d4a891"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접한 슬롯과의 설명 겹침"
            }
          ]
        },
        {
          "position": 15,
          "photo_id": "ph_02",
          "caption_state": "filled",
          "text": "초록빛 톤의 단색 카드.",
          "omit_reason": null,
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_02",
              "note": "밝기 0.7 · 채도 0.3 · 주요 색 #8f9b86"
            }
          ]
        }
      ]
    }
  },
  "returned_omission": {
    "omitted": 13,
    "total": 15,
    "note_key": "omission.some",
    "note": "15자리 중 13자리는 사진만 두는 편이 낫다고 봤어요.",
    "evidence": [
      {
        "kind": "rule",
        "ref": "gyeol.omit.disclosure",
        "note": "생성 결과의 omitted 슬롯을 세어 13/15로 적었다"
      }
    ]
  },
  "actual_omitted": 13,
  "raw_output_equals_returned_output": true
}
```

### 4회차

```json
{
  "round": 4,
  "startedAt": "2026-09-18T03:38:39.884Z",
  "elapsedMs": 8113,
  "provider": {
    "status": 200,
    "requestId": "req_011CfAD3PD67A8GEohfWFHKq",
    "model": "claude-haiku-4-5-20251001",
    "usage": {
      "input_tokens": 7812,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 0,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 0
      },
      "output_tokens": 1749,
      "service_tier": "standard",
      "inference_geo": "not_available"
    },
    "stop_reason": "end_turn"
  },
  "raw_model_output": {
    "output": {
      "title": "단색 카드의 순서",
      "slots": [
        {
          "position": 1,
          "photo_id": "ph_01",
          "caption_state": "filled",
          "text": "단색 카드",
          "omit_reason": null,
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_01",
              "note": "단색 카드"
            }
          ]
        },
        {
          "position": 2,
          "photo_id": "ph_04",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_04",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 3,
          "photo_id": "ph_05",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_05",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 4,
          "photo_id": "ph_06",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_06",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 5,
          "photo_id": "ph_07",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_07",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 6,
          "photo_id": "ph_08",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_08",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 7,
          "photo_id": "ph_09",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_09",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 8,
          "photo_id": "ph_10",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_10",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 9,
          "photo_id": "ph_11",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_11",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 10,
          "photo_id": "ph_03",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_03",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 11,
          "photo_id": "ph_12",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_12",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 12,
          "photo_id": "ph_13",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_13",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 13,
          "photo_id": "ph_14",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_14",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 14,
          "photo_id": "ph_15",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_15",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        },
        {
          "position": 15,
          "photo_id": "ph_02",
          "caption_state": "omitted",
          "text": null,
          "omit_reason": "앞 사진과 같은 내용이라 사진만 두는 편을 제안해요.",
          "evidence": [
            {
              "kind": "uploaded_photo",
              "ref": "ph_02",
              "note": "단색 카드"
            },
            {
              "kind": "rule",
              "ref": "gyeol.omit.overlap",
              "note": "인접 사진과의 높은 겹침"
            }
          ]
        }
      ]
    }
  },
  "returned_omission": {
    "omitted": 14,
    "total": 15,
    "note_key": "omission.some",
    "note": "15자리 중 14자리는 사진만 두는 편이 낫다고 봤어요.",
    "evidence": [
      {
        "kind": "rule",
        "ref": "gyeol.omit.disclosure",
        "note": "생성 결과의 omitted 슬롯을 세어 14/15로 적었다"
      }
    ]
  },
  "actual_omitted": 14,
  "raw_output_equals_returned_output": true
}
```

## 부록 B. 결함 주입 실제 출력

```json
[
  {
    "label": "wrongCount",
    "patch": {
      "omitted": 4
    },
    "direct": "ContractError: omission.omitted: must count the returned slots",
    "httpStatus": 502,
    "error": {
      "code": "MODEL_CONTRACT",
      "message": "문장을 만들지 못했어요. 입력을 확인하거나 나중에 다시 시도해 주세요.",
      "retryable": true
    }
  },
  {
    "label": "wrongTotal",
    "patch": {
      "total": 99
    },
    "direct": "ContractError: omission.total: must count the returned slots",
    "httpStatus": 502,
    "error": {
      "code": "MODEL_CONTRACT",
      "message": "문장을 만들지 못했어요. 입력을 확인하거나 나중에 다시 시도해 주세요.",
      "retryable": true
    }
  },
  {
    "label": "wrongKey",
    "patch": {
      "note_key": "omission.none"
    },
    "direct": "ContractError: omission.note_key: disagrees with the counted omissions",
    "httpStatus": 502,
    "error": {
      "code": "MODEL_CONTRACT",
      "message": "문장을 만들지 못했어요. 입력을 확인하거나 나중에 다시 시도해 주세요.",
      "retryable": true
    }
  },
  {
    "label": "falseNote",
    "patch": {
      "note": "이번에는 99자리 모두 문장을 두는 편이 낫다고 봤어요."
    },
    "direct": "accepted",
    "httpStatus": 200,
    "returnedOmission": {
      "omitted": 3,
      "total": 3,
      "note_key": "omission.some",
      "note": "3자리 중 3자리는 사진만 두는 편이 낫다고 봤어요.",
      "evidence": [
        {
          "kind": "rule",
          "ref": "gyeol.omit.disclosure",
          "note": "생성 결과의 omitted 슬롯을 세어 3/3로 적었다"
        }
      ]
    }
  },
  {
    "label": "falseEvidence",
    "patch": {
      "evidence": [
        {
          "kind": "rule",
          "ref": "gyeol.omit.disclosure",
          "note": "생성 결과는 99/99이다"
        }
      ]
    },
    "direct": "accepted",
    "httpStatus": 200,
    "returnedOmission": {
      "omitted": 3,
      "total": 3,
      "note_key": "omission.some",
      "note": "3자리 중 3자리는 사진만 두는 편이 낫다고 봤어요.",
      "evidence": [
        {
          "kind": "rule",
          "ref": "gyeol.omit.disclosure",
          "note": "생성 결과의 omitted 슬롯을 세어 3/3로 적었다"
        }
      ]
    }
  },
  {
    "label": "missingOmission",
    "direct": "accepted"
  }
]
```
