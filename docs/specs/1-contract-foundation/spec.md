# #1 · #7 · #8 계약 기반 v1

상태: 로컬 구현 승인됨. 두 사람의 스키마 합의, 사람 merge, 배포 검증은 pending.
목적: intent 4-4 순번 1·2, D3·D4 및 7-3의 구조 검사 기반을 제공한다.

입력은 독립된 사진 ID 3~20개, TargetProfile, 선택적 CurrentProfile이다.
출력은 schema_version "1.0"의 OrderedFeed이며 F3 export는 별도 객체다.

완료 조건:
- schemas에 4개 markdown 계약 및 fixtures에 대응하는 4개 JSON 샘플을 제공한다.
- 샘플 프로필은 ref/freetext, current present/absent를 포함하고 feed는 15슬롯이다.
- absent current는 profile_id=null, source=none, sample_size=0, completeness 전부 0, visual/sequence 빈 객체, language=null이다.
- GET /api/feed?mock=1은 외부 AI 호출 없이 고정 OrderedFeed를 반환한다. mock이 없으면 501 LIVE_NOT_IMPLEMENTED, 다른 mock 값은 400, 다른 method는 405다.
- ?mock=1&resource=photo_analysis|target_profile|current_profile로 나머지 샘플도 받는다. 기본 resource=ordered_feed다.
- E1 근거, E2 실제 입력 ID의 일대일 보존, E3 1..N 위치, E6 정확히 한 줄인 단일 title, E8 absent current 고지를 검사한다.
- 각 불변식은 독립적으로 깨진 fixture 테스트와 eval 출력으로 실패 감지를 증명한다. 자기선언 invariants는 추가 일치 검사일 뿐 입력 원천이 아니다.
- F3 export는 photo_id와 omit_reason을 포함하고 원본 feed의 position별 photo_id와 일치해야 한다. omitted 이유와 evidence를 보존한다.
- 입력 3/20 경계 통과, 2/21 및 중복·누락·대체 ID·타입 오류는 거부한다.
- eval/golden/case_01은 손으로 정의한 합성 이미지 1벌 및 target 2벌로 bootstrap한다. 실사진 분석이나 개인화 품질 검증이 아니다.
- npm test / npm run eval / npm run check / npm start와 curl 증거를 기록한다.

범위 제외: live AI, F3 생성, UI, 배포 설정, E4/E5/E7 자동 판정, 원격 이슈 수정, 커밋·push.
E4/E5/E7은 수동 스팟체크 대상이며 실제 데모 사진 전수 대조는 pending이다.
