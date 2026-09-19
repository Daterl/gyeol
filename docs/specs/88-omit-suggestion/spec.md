# 사진 빼기 권고 사양

## 관측 확인을 먼저 했다

[구현 전 관측](observations-before-code.json)은 구현 전 기존 `analyzePhoto`를 실제 JPEG 15장에 한 장씩 호출한 출력이다.
밝기·채도·색상은 실측이고, heuristic의 composition/scale/has_face는 기본값이다.
15장에는 quality_flags가 없었다. 첫 사진의 같은 바이트를 별도 ID로 다시 분석하자 `duplicate_of:ph_01`이 관측됐다.
동일 SHA-256도 확인했다. 따라서 이번 권고는 관측된 동일 바이트 중복에 한정한다.
색이 비슷한 사진, 어두운 사진, 흐려 보이는 사진을 새 임계값으로 판정하지 않는다.
`dark`는 측정 밝기에 설계 임계값을 적용한 값이고, 실제 흐림 관측은 이번 실행에서 확보하지 못했으므로 둘 다 권고 입력에서 제외한다.

## 입력과 출력

입력은 기존 3~20장의 PhotoAnalysis와 기존 프로필 계약이다. 사진 분석 호출은 한 장 단위를 유지한다.
기존 OrderedFeed 슬롯·순서·caption_inputs·rationale·schema_version 의미는 바꾸지 않는다.
각 슬롯에 추가하는 초안 필드는 `omit_suggestion: {recommended:boolean, reason:string|null, evidence:Evidence[]}`이다.
`recommended=false`면 reason=null, evidence=[]이다. 이는 품질 보증이나 사용 권장이 아니라 근거 있는 빼기 권고가 없다는 뜻이다.
`recommended=true`면 한 줄 reason과 두 입력 사진을 가리키는 uploaded_photo evidence가 있다.
상위 추가 필드는 `omit_summary: {recommended_count:number, message:string}`이다.
0개이며 duplicate_of 관측이 없으면 `관측된 중복 근거가 없어 빼기를 권하는 사진은 없습니다.`로 한다.
duplicate_of는 관측됐지만 권고 조건을 충족하지 못하면 `중복은 관측됐지만 이번 입력에서 비교 대상을 확정할 수 없어 빼기를 권하는 사진은 없습니다.`로 한다. 외부·자기·순환·모호한 참조를 포함하며 관측 자체를 부정하지 않는다.
1개 이상 메시지는 실제 권고 수와 모든 사진을 유지했다는 사실을 적는다.
기존 schemas/ 4종은 수정하지 않는다. 추가 필드는 이 문서에서만 초안으로 정의하며 소비자 합의는 PR의 미완료 게이트로 남긴다.
기존 fixture처럼 확장 전체가 없는 feed는 계속 유효하다. 확장이 있으면 모든 슬롯·요약을 실제 PhotoAnalysis로 재계산해 대조한다.

## 판단 규칙

사진의 quality_flags에 `duplicate_of:<id>`가 있고 그 id가 현재 입력에 실제로 존재해야 한다.
그 id는 자기 자신이 아니며, 참조 대상에 duplicate_of 플래그가 하나도 없어야 한다.
여러 중복 참조, 외부 참조, 자기 참조와 순환 참조는 권고하지 않는다. 연쇄 A→B→C라면 원본 C를 직접 가리키는 B만 권하고 A는 보류한다. 권고 대상의 원본까지 권고하는 모순을 피한다.
원본의 입력 순서나 밝기로 승자를 고르지 않는다. 관측이 지목한 원본을 유지한다.
권고 사진 evidence.note에는 실제 quality_flags 값을 쓰고, 원본 evidence.note에는 그 관계의 대상임을 쓴다.
동일 바이트 중복을 빼도 된다는 편집 제안이지 자동 제외나 의미상 비슷한 사진 탐지라고 주장하지 않는다.
캐시가 차갑거나 다른 인스턴스에서 분석하면 중복 플래그가 없을 수 있다. 이때 0개가 정상이며 미관측 중복을 추측하지 않는다.

## 틀린 결과와 경계값

입력 N장이 출력 N칸으로 보존되지 않으면 실패다. 최소 3장에서도 권고 후 슬롯을 줄이지 않는다.
권고 근거가 입력 밖 사진을 참조하거나 PhotoAnalysis에 없는 값을 주장하면 실패다.
기본값 composition/scale/has_face/subjects, dark/blurry 플래그, 측정 색·프로필·배치 순서를 바꿔 권고가 달라지면 실패다.
0개 메시지 누락, 권고를 최소 하나 강제, 모든 사진이 쓸 만하다는 과장도 실패다.
모델 호출·새 의존성·화면 구현·스키마 원문 수정·200장 선별은 추가하지 않는다.
