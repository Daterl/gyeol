# 두 축 합성 계약

기준 SHA: e4901582b9e99586f975155ab8f853ab3689c34e. 기존 지향·현재 추출과 순서 구현을 재사용한다. schemas 4종이 실행 계약이며 수정하지 않는다.

## 입력과 출력
- composeProfile({targetProfile, currentProfile})은 검증된 두 프로필을 받아 OrderedFeed.applied_profile 형태를 반환한다. 현재 부재도 명시적 present:false 객체로 전달한다.
- composeFeed(options)는 기존 orderFeed와 같은 입력을 받아 순서를 생성하고 합성 결과를 넣은 뒤 원래 입력으로 validateFeed를 실행한다.
- visual, sequence, caption_len 외 language는 지향을 복사한다. 현재의 다른 관측값을 섞지 않는다. 입력·반환 객체 간 가변 참조를 공유하지 않는다.
- HTTP는 아직 목업 전용이다. 새 요청 계약을 임의로 만들지 않고 composeFeed를 후속 서버 연결의 진입점으로 제공한다.

## 판단 규칙
두 축 모두 caption_len Claim이 있고 p50 값이 다를 때만 보정한다. rule=log_midpoint는 round(expm1((log1p(target)+log1p(current))/2))로 정의한다. +1은 0자를 처리하기 위한 설계 선택이며 관측값이 아니다. 결과는 양 끝값 사이로 제한한다.
보정된 p50에 맞춰 p90은 max(기존 지향 p90, resolved)로 유지한다. 이는 재측정한 분위수가 아니라 p90>=p50 계약을 위한 상한 보존이다. Claim 근거에 양쪽 원근거와 이 규칙을 남기고 confidence는 두 입력의 최솟값이다.
한 건의 delta는 field=language.caption_len.p50, target/current/resolved, rule=log_midpoint, note_key=caption_len_gap 및 양쪽 원근거·규칙 근거를 갖는다.
입력 p50이 다르지만 정수 반올림 결과가 지향과 같으면 실제 변경이 없으므로 delta를 비운다.
나머지는 corrected=false, disclosure=target_only, deltas=[]이다. present:true여도 측정값 누락/동일/변경 없음이면 보정했다고 고지하지 않는다.
current_profile_id는 present이면 입력 ID, 부재면 null이다.

## 정확성·경계
- 120/18은 47로 보정한다. 0/120도 유한한 정수로 처리한다. 음수·비정수·근거 없는 입력은 기존 validator로 거부한다.
- p50만 재료다. 빈 캡션 비율이나 사진마다 설명을 달았다는 사실을 추론하지 않는다. UI 문장 필드는 만들지 않는다.
- 순서는 지향 프로필로 결정한다. 현재 길이만 바꿔 순서가 달라졌다고 주장하지 않는다.
- target_only는 UI에서 “보정 없이 지향만 반영함”으로 표시해야 한다. 이 작업의 화면 구현·확인은 범위 밖이며 인계 항목이다.

## 완료 확인
1. 120/18 고정 입력은 delta 1개와 corrected, 네 가지 수치·규칙 값을 낸다.
2. 동일·측정 누락·현재 부재는 delta 0개와 target_only이며 부재 파이프라인 E8이 통과한다.
3. 같은 실측 사진과 다른 지향 프로필 두 벌의 position 정렬 photo_id 배열이 다르고 JSON 두 벌을 이슈에 남긴다.
4. 원근거 보존·입력 불변·계약 검증과 npm test/eval/check 실제 출력을 남긴다.
