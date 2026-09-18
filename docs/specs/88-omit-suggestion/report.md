# 실행 보고서

판정: 서버 구현·로컬 DoD PASS. 소비자 합의·독립 교차 모델 리뷰·배포 검증은 PENDING이며 Draft로 전달한다.
기준 SHA: `fc79110`, 브랜치: `feat/88-omit-suggestion`, PR 대상: `develop`.

## 변경과 범위

관측된 `duplicate_of`가 현재 입력의 명확한 원본을 가리킬 때만 `slots[].omit_suggestion`을 낸다. 순서와 슬롯 수는 유지한다. 0개일 때도 `omit_summary`로 명시한다. 기존 스키마 4종·src/·배포 설정·분석기는 변경하지 않았다.

서버 연결은 `orderFeed → composeFeed → buildFeed`와 사진만 입력하는 `preserveOrder → buildFeed` 양쪽이다. 검증기는 기존 확장 없는 feed를 유지하면서 확장이 있으면 실제 PhotoAnalysis와 대조한다. 이번 범위는 **동일 바이트 중복 권고**이며 어두움·흐림·색상 유사성·사진의 미적 품질을 판단하지 않는다.

## 개발 전 관측

[구현 전 원문](observations-before-code.json)에 기존 분석기로 실사진 15장을 분석한 결과를 남겼다. 15장은 모두 heuristic이며 quality_flags가 비어 있었다. 첫 사진 바이트를 별도 ID로 재분석하자 `duplicate_of:ph_01`이 생겼고 SHA-256이 같았다. 휴리스틱의 composition/scale/has_face 기본값은 권고에 쓰지 않는다.

## 실사진 15장 실행

```sh
node scripts/verify-omit-suggestion.js /Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/images
# exit 0
```

[전체 분석 입력·SHA-256·서버 출력 원문](real15-output.json). `analyze?mock=1`은 모델 호출을 끄고 실제 JPEG 바이트를 측정한다. 한 요청에는 사진 한 장만 보냈다. 이 검증은 HTTP Request/Response 핸들러를 로컬에서 실행한 것이며 배포 네트워크 검증이 아니다.

### 서로 다른 실사진 15장

| 사진 ID | 실사진 파일 | 밝기 관측 | quality_flags |
|---|---|---|---|
| ph_01 | c29_Dc-2OOrFBnb_00.jpg | 0.375 | [] |
| ph_02 | c29_Dc-auqBCVXI_09.jpg | 0.346 | [] |
| ph_03 | c29_Dc94ZfOD1-q_07.jpg | 0.589 | [] |
| ph_04 | c29_DdEAAeHm6u0_01.jpg | 0.441 | [] |
| ph_05 | c29_DdILtQ0CRl8_01.jpg | 0.328 | [] |
| ph_06 | c29_DdKwYzyFJUS_09.jpg | 0.429 | [] |
| ph_07 | c29_DdOTLpSIBNf_07.jpg | 0.512 | [] |
| ph_08 | c29_DdTPMgpiZWR_05.jpg | 0.452 | [] |
| ph_09 | c29_DdVDlTviVrG_08.jpg | 0.612 | [] |
| ph_10 | c29_DdWHSQGlMt4_00.jpg | 0.456 | [] |
| ph_11 | hony_DdJWXXTHCMv_13.jpg | 0.808 | [] |
| ph_12 | kr29cm_Dc-auqBCVXI_02.jpg | 0.472 | [] |
| ph_13 | kr29cm_Dc94ZfOD1-q_00.jpg | 0.501 | [] |
| ph_14 | kr29cm_DdDCDKgFCLE_09.jpg | 0.555 | [] |
| ph_15 | kr29cm_DdGkodnCOAZ_03.jpg | 0.524 | [] |

서버 출력 ({"kind": "none"}):

```json
{"slots": [
  {"position": 1, "photo_id": "ph_01", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 2, "photo_id": "ph_02", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 3, "photo_id": "ph_03", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 4, "photo_id": "ph_04", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 5, "photo_id": "ph_05", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 6, "photo_id": "ph_06", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 7, "photo_id": "ph_07", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 8, "photo_id": "ph_08", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 9, "photo_id": "ph_09", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 10, "photo_id": "ph_10", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 11, "photo_id": "ph_11", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 12, "photo_id": "ph_12", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 13, "photo_id": "ph_13", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 14, "photo_id": "ph_14", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 15, "photo_id": "ph_15", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}}
], "omit_summary": {"recommended_count": 0, "message": "관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다."}}
```

PASS: 15 photos = 15 slots; PASS: all uploaded_photo refs resolve.


서버 출력 ({"kind": "text", "text": "짧게, 조용하게"}):

```json
{"slots": [
  {"position": 1, "photo_id": "ph_11", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 2, "photo_id": "ph_02", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 3, "photo_id": "ph_09", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 4, "photo_id": "ph_01", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 5, "photo_id": "ph_03", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 6, "photo_id": "ph_06", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 7, "photo_id": "ph_13", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 8, "photo_id": "ph_14", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 9, "photo_id": "ph_04", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 10, "photo_id": "ph_07", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 11, "photo_id": "ph_08", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 12, "photo_id": "ph_15", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 13, "photo_id": "ph_12", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 14, "photo_id": "ph_10", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 15, "photo_id": "ph_05", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}}
], "omit_summary": {"recommended_count": 0, "message": "관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다."}}
```

PASS: 15 photos = 15 slots; PASS: all uploaded_photo refs resolve.

실제 분석 카운터: `{"modelCalls": 0, "modelFailures": 0, "cacheHits": 0, "cacheMisses": 15, "cacheSize": 15}`.

### 실사진 14종 + 첫 사진 동일 바이트 재입력 = 15장

| 사진 ID | 실사진 파일 | 밝기 관측 | quality_flags |
|---|---|---|---|
| ph_01 | c29_Dc-2OOrFBnb_00.jpg | 0.375 | [] |
| ph_02 | c29_Dc-auqBCVXI_09.jpg | 0.346 | [] |
| ph_03 | c29_Dc94ZfOD1-q_07.jpg | 0.589 | [] |
| ph_04 | c29_DdEAAeHm6u0_01.jpg | 0.441 | [] |
| ph_05 | c29_DdILtQ0CRl8_01.jpg | 0.328 | [] |
| ph_06 | c29_DdKwYzyFJUS_09.jpg | 0.429 | [] |
| ph_07 | c29_DdOTLpSIBNf_07.jpg | 0.512 | [] |
| ph_08 | c29_DdTPMgpiZWR_05.jpg | 0.452 | [] |
| ph_09 | c29_DdVDlTviVrG_08.jpg | 0.612 | [] |
| ph_10 | c29_DdWHSQGlMt4_00.jpg | 0.456 | [] |
| ph_11 | hony_DdJWXXTHCMv_13.jpg | 0.808 | [] |
| ph_12 | kr29cm_Dc-auqBCVXI_02.jpg | 0.472 | [] |
| ph_13 | kr29cm_Dc94ZfOD1-q_00.jpg | 0.501 | [] |
| ph_14 | kr29cm_DdDCDKgFCLE_09.jpg | 0.555 | [] |
| ph_15 | c29_Dc-2OOrFBnb_00.jpg | 0.375 | ["duplicate_of:ph_01"] |

서버 출력 ({"kind": "none"}):

```json
{"slots": [
  {"position": 1, "photo_id": "ph_01", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 2, "photo_id": "ph_02", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 3, "photo_id": "ph_03", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 4, "photo_id": "ph_04", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 5, "photo_id": "ph_05", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 6, "photo_id": "ph_06", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 7, "photo_id": "ph_07", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 8, "photo_id": "ph_08", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 9, "photo_id": "ph_09", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 10, "photo_id": "ph_10", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 11, "photo_id": "ph_11", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 12, "photo_id": "ph_12", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 13, "photo_id": "ph_13", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 14, "photo_id": "ph_14", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 15, "photo_id": "ph_15", "omit_suggestion": {"recommended": true, "reason": "ph_01와 동일 바이트 중복으로 관측되어 이 사진은 빼는 것을 권합니다.", "evidence": [{"kind": "uploaded_photo", "ref": "ph_15", "note": "PhotoAnalysis.quality_flags의 관측값: duplicate_of:ph_01"}, {"kind": "uploaded_photo", "ref": "ph_01", "note": "ph_15의 duplicate_of가 가리키는 현재 입력 사진입니다."}]}}
], "omit_summary": {"recommended_count": 1, "message": "동일 바이트 중복이 관측된 1장의 빼기를 권합니다. 사진은 모두 유지했으며 제외 여부는 직접 결정해 주세요."}}
```

PASS: 15 photos = 15 slots; PASS: all uploaded_photo refs resolve.


서버 출력 ({"kind": "text", "text": "짧게, 조용하게"}):

```json
{"slots": [
  {"position": 1, "photo_id": "ph_11", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 2, "photo_id": "ph_02", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 3, "photo_id": "ph_09", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 4, "photo_id": "ph_01", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 5, "photo_id": "ph_03", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 6, "photo_id": "ph_06", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 7, "photo_id": "ph_13", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 8, "photo_id": "ph_15", "omit_suggestion": {"recommended": true, "reason": "ph_01와 동일 바이트 중복으로 관측되어 이 사진은 빼는 것을 권합니다.", "evidence": [{"kind": "uploaded_photo", "ref": "ph_15", "note": "PhotoAnalysis.quality_flags의 관측값: duplicate_of:ph_01"}, {"kind": "uploaded_photo", "ref": "ph_01", "note": "ph_15의 duplicate_of가 가리키는 현재 입력 사진입니다."}]}},
  {"position": 9, "photo_id": "ph_14", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 10, "photo_id": "ph_07", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 11, "photo_id": "ph_08", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 12, "photo_id": "ph_04", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 13, "photo_id": "ph_10", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 14, "photo_id": "ph_12", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}},
  {"position": 15, "photo_id": "ph_05", "omit_suggestion": {"recommended": false, "reason": null, "evidence": []}}
], "omit_summary": {"recommended_count": 1, "message": "동일 바이트 중복이 관측된 1장의 빼기를 권합니다. 사진은 모두 유지했으며 제외 여부는 직접 결정해 주세요."}}
```

PASS: 15 photos = 15 slots; PASS: all uploaded_photo refs resolve.

실제 분석 카운터: `{"modelCalls": 0, "modelFailures": 0, "cacheHits": 1, "cacheMisses": 14, "cacheSize": 14}`.

## 미관측 값이 권고를 바꾸는 경우

실제 분석 결과를 복제한 변조 입력에서 composition·scale·has_face·subjects·text_in_image·dark·blurry를 한 필드씩 바꿨다. 15장 × 7종 × 입력 2벌 × 서버 경로 2종을 비교했으며, **420회 중 권고 변경 0건**이다. 변조 입력은 실제 관측처럼 취급한 사진 데이터가 아니라 기본값 의존을 검출하는 반례다.

```json
{
  "fields": [
    "composition",
    "scale",
    "has_face",
    "subjects",
    "text_in_image",
    "dark",
    "blurry"
  ],
  "comparisons": 420,
  "changedDecisions": 0
}
```

## 필수 다섯 명령

실행 환경은 Node v22.22.3 / npm 10.9.8이다. `npm ci`는 성공했지만 저장소 engines의 Node 24와 다른 경고가 있었다. Node 24 재검증은 하지 않았다.

### `npm test` — exit 0

[전체 출력](test.txt)

```text
1..204
# tests 204
# suites 0
# pass 204
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2350.332709
```

### `npm run eval` — exit 0

[전체 출력](eval.txt)

```text
> gyeol@0.1.0 eval
> node eval/run.js

Synthetic manual bootstrap only; no AI quality or human agreement claim.
┌─────────┬─────────┬───────────┬────────┬────────┐
│ (index) │ case    │ invariant │ result │ reason │
├─────────┼─────────┼───────────┼────────┼────────┤
│ 0       │ 'quiet' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'quiet' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'quiet' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'quiet' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'quiet' │ 'E8'      │ 'PASS' │ ''     │
│ 5       │ 'quiet' │ 'E9'      │ 'PASS' │ ''     │
│ 6       │ 'quiet' │ 'E10'     │ 'PASS' │ ''     │
│ 7       │ 'quiet' │ 'E11'     │ 'PASS' │ ''     │
└─────────┴─────────┴───────────┴────────┴────────┘
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
quiet broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
quiet broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
quiet broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_01
┌─────────┬──────────┬───────────┬────────┬────────┐
│ (index) │ case     │ invariant │ result │ reason │
├─────────┼──────────┼───────────┼────────┼────────┤
│ 0       │ 'detail' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'detail' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'detail' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'detail' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'detail' │ 'E8'      │ 'PASS' │ ''     │
│ 5       │ 'detail' │ 'E9'      │ 'PASS' │ ''     │
│ 6       │ 'detail' │ 'E10'     │ 'PASS' │ ''     │
│ 7       │ 'detail' │ 'E11'     │ 'PASS' │ ''     │
└─────────┴──────────┴───────────┴────────┴────────┘
detail broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
detail broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
detail broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
detail broken E6: EXPECTED FAIL — E6.title: expected nonempty string
detail broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
detail broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
detail broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
detail broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_15
E4/E5/E7: manual spot-check only; real demo review pending.
Injected model variant 0: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).
Injected model variant 1: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).
```

### `npm run check` — exit 0

[전체 출력](check.txt)

```text
> gyeol@0.1.0 check
> node scripts/check.js

PASS: 68 JS/JSON files checked; four schema examples match fixtures. Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```

### `npm run lint` — exit 0

[전체 출력](lint.txt)

```text
> gyeol@0.1.0 lint
> biome check .

Checked 40 files in 102ms. No fixes applied.
```

### `npm run typecheck` — exit 0

[전체 출력](typecheck.txt)

```text
> gyeol@0.1.0 typecheck
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
```

추가 검사: [권고 테스트 5개](targeted.txt), [UI 테스트 31개](test-ui.txt), [Next 로컬 빌드](build.txt) 모두 PASS. lint는 설정상 src/와 설정 파일 40개를 검사하고, 변경한 서버 JS는 check의 구문 검사와 Node 테스트로 확인했다.

## DoD별 판정

이슈의 “입력 N장=출력 N칸(E1)” 표기를 그대로 대응했다. 저장소 eval에서는 이 보존 검사가 E2이고 E1은 Claim 근거 검사다. 둘 다 통과했다.

| 이슈 완료 조건 | 판정 | 실행 증거 |
|---|---|---|
| OrderedFeed 슬롯에 권고 여부와 근거 | PASS | 두 경로 모두 15개 omit_suggestion; 중복 입력 ph_15만 true |
| evidence.ref가 실제 입력 사진 (E10) | PASS | ph_15와 ph_01; 외부 ref 변조를 검증기가 거부 |
| 관측 안 된 값이 권고를 바꾸는 경우 0건 | PASS | 실사진 분석 기반 420회 개별 변조, 변경 0건 |
| 권고 0개가 결과에 드러남 | PASS | 실사진 15종에서 recommended_count=0 및 명시 메시지 |
| 입력 N장=출력 N칸 (E1) | PASS | 두 입력 벌·두 경로 모두 15슬롯, 단위 테스트 3/20장 보존 |
| 실사진 15장 실제 실행 출력 | PASS | 위 전체 슬롯 출력 및 real15-output.json |
| test/eval/check/lint/typecheck | PASS | 각 명령 exit 0, test 204/204 |

## 검증 중 수정 및 리뷰

실사진 검증 스크립트의 첫 시도는 multipart로 보내 400을 받았다. 기존 JSON/base64 업로드 계약을 읽고 그 형식으로 수정했으며 재실행은 성공했다. 제품 API 계약은 바꾸지 않았다.

자체 점검에서 공유 contracts가 브라우저에서도 import됨을 확인해 Node 전용 deep equality 의존성을 제거했다. 필드별 기존 검증 패턴을 사용한 뒤 다섯 명령·실사진 검사·로컬 빌드·UI 테스트를 통과했다.

CodeRabbit CLI 0.7.6: [첫 실행](review-coderabbit-initial.txt)은 기존 추적 파일 3개만 검토해 신규 파일 검증으로 세지 않았다. 신규 파일을 staging한 [최종 실행](review-coderabbit.txt)은 서버·검증 파일 6개를 모두 검토했고 findings=0, exit 0이다. 동일 코드 diff SHA-256: `b3f500192b758e9c7cf582ab0de142ec5397c05efe2967e677d310bebac2ec36`. 완료 시각: 2026-09-18T03:28:50.055625+00:00. 문서는 자체 점검 범위이며 별도 모델 리뷰가 아니다.

sip 검토: mandela 관점에서 실행 검증기의 재계산만으로 정답을 주장하면 순환 검증이 된다. 그래서 별도 SHA-256 비교와 명시적 ph_15→ph_01 기대값, 실제 15개 ID 집합, 필드별 변조 전후 대조를 함께 검사했다. 사진 미적 적합성의 정답을 증명했다는 주장은 하지 않는다.

ssotize는 읽기 전용으로 필드명 검색과 한글 권고 문구 검색을 대조했다. 권고 규칙의 구현 원천은 lib/omit-suggestion.js, 초안 소비 계약은 spec.md이며 schemas/의 기존 필드와 의미를 덮어쓰지 않는다. re0로 연쇄 중복 문구를 실제 규칙(A→B→C에서 B만 권고)에 맞췄다. 외부 사실·휴대성 주장이 없어 factchk 웹 조회와 detool은 생략했다. shower의 독립 냉독은 이 worker에서 재귀 위임하지 않고 코디네이터의 독립 리뷰로 남긴다.

## 남은 것과 한계

- 같은 바이트라도 분석이 다른 프로세스/캐시 초기화 뒤 실행되면 duplicate_of가 없을 수 있다. 이 경우 근거 없는 권고를 만들지 않아 0개다.
- 원본이 현재 입력에서 빠졌거나 중복 관계가 모호하면 권고하지 않는다. client 제공 PhotoAnalysis의 바이트 진위를 새로 인증하지 않는다.
- OrderedFeed 추가 필드는 초안이다. schemas/ 4종은 그대로이며 **원재·디에고가 소비 계약을 합의할 것**이 남았다. 기존 필드를 다른 의미로 사용하거나 스키마가 합의됐다고 주장하지 않는다.
- 서로 다른 모델 식별자를 확인한 동일 diff 교차 리뷰, UI 표시 구현, 배포 네트워크 검증은 미실행이다. CodeRabbit의 모델 식별자는 공개되지 않아 교차 모델 게이트 통과로 세지 않는다.
- merge·배포하지 않았다. 보드는 Draft PR 작성 뒤 실제 칸 이름인 검토·인수 대기로 갱신한다.
