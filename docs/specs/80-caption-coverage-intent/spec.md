# 캡션 커버리지 의도 계약

담당 enzo.cho, 출력 협업 diego.yoon. #80의 자유 텍스트 의도를 숫자 관측값으로 바꾸지 않는 계약 노드다.

## 계약

- target+freetext만 선택 `language.caption_coverage: Claim<"all"|"sparse">`를 가질 수 있다.
- `all`은 모든 사진에 문장을 쓰려는 현재 의도, `sparse`는 일부 사진을 비우려는 현재 의도다. `empty_caption_ratio`는 ref/current의 과거 관측값이며 freetext에 금지한다.
- claim은 매치한 원문 `user_text`와 어휘표 `rule` 근거를 함께 가진다. output 단계는 raw_freetext를 다시 해석하지 않는다.
- 서버 generate 경계는 같은 extractor로 raw_freetext를 재생해 context target의 claim을 대조한다. context와 applied를 함께 위조해도 통과하지 않으며, output 안정화는 검증된 claim만 읽는다.
- 부정된 cue는 반대로 읽지 않는다. all/sparse가 함께 나온 진짜 충돌, 전체 무캡션 요청, cue가 없는 모호한 표현은 claim을 만들지 않는다. 유한한 완전 요청 표현만 허용해 부분 단어와 사진 내용 설명을 제외한다. `하지만` 뒤에 실제 coverage cue가 있으면 뒤 절을 평가하고, 무관한 사진 순서·색감 절이면 앞 요청을 유지한다. 뒤 cue가 모두 부정됐으면 비운다.
- coverage 없는 freetext는 current ratio fallback을 쓰지 않는다. `all`은 서버 비움 보정을 막고, `sparse`는 canonical overlap 0.9 이상일 때 정확히 한 슬롯만 허용한다. sparse와 caption_len은 독립이다.

## 검증과 한계

`buildFeed → generateOutput`에서 원 재현 문구, all, sparse+detail, 부정·충돌·지원 불가, ref 숫자 비율 경로를 무료 fixture와 주입 transport로 검증한다. photo_id, position, 기존 omitted, 사용자 편집과 슬롯 근거 보존은 기존 계약을 유지한다.

실제 모델 반복 결과와 사람의 품질 평가는 PENDING이다. schema 1.0 선택 필드의 coordinated prototype 배포라 구버전 탭은 배포 뒤 새로고침해야 하며 capability 분기는 추가하지 않는다.
