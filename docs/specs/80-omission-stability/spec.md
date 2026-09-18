# 비움 안정화 명세

담당 enzo.cho, 출력 협업 diego.yoon. #80은 #26의 출력 생성 경계와 #16의 비움 근거 계약을 재사용한다.

## 동작

- `mode=all` 모델 결과에 omitted가 하나라도 있으면 그대로 반환한다.
- 모든 슬롯이 filled이고 적용 언어가 있을 때만 position 2 이후의 `adjacent_overlap` 최댓값을 본다. target `caption_coverage=all`은 보정을 차단하고, `sparse`는 과거 current 비율보다 우선한다.
- coverage 없는 freetext는 부정·충돌·지원 불가 문구와 무의도를 구분할 별도 상태가 없으므로 보정하지 않는다. ig_reference는 기존 관측 경로를 유지해 실제 target/current의 `empty_caption_ratio`와 슬롯 수를 곱한 기대 비움 수가 1 이상일 때만 허용하며, 어느 축이든 0이면 보정하지 않는다.
- client가 보낸 feed 값을 그대로 믿지 않는다. context.photos를 feed position 순서로 매핑해 순서 생성과 같은 측정 색 overlap을 다시 계산하며, 두 값이 일치하는 후보만 사용한다.
- 최댓값이 0.9 이상일 때 그 한 슬롯만 omitted로 바꾸고 `gyeol.omit.overlap` 규칙 근거를 추가한다.
- 동률은 position 오름차순으로 결정한다. 모든 피드에 생길 수 있는 `is_visual_peak`는 안정화 판단에 사용하지 않는다.
- 관측 비율 경로에서 `empty_caption_ratio=0`이나 상세 캡션 의도(`caption_len.p50>=90`)가 있으면 보정하지 않는다. 명시 sparse는 길이와 독립된 커버리지 의도다. 자연어에서 비움 비율을 새로 추정하지 않으며, 언어가 없는 자연어와 photo plan도 보정하지 않는다.
- `mode=slot`은 보정하지 않는다. photo_id, position, 제목, 나머지 슬롯, 기존 evidence는 보존한다.

`adjacent_overlap`은 순서 생성에서는 측정 색 유사도, photo plan에서는 사실 교집합 비율이다. 안정화가 photo plan을 제외하더라도 이유 문장은 이 값을 특정 측정 의미나 설명 중복 확률로 과장하지 않는다. 0.9는 사용자 취향이 아닌 보수적인 제품 규칙이다.

## 검증

`buildFeed` 실경로와 주입한 모델 응답으로 원 재현 문구의 sparse 보존, all 보존, 부정·충돌·지원 불가 문구 차단, sparse+detail 독립성, ig_reference 숫자 비율 무회귀, current 비움 없음 관측, 기대 비움 1 미만, photo plan의 사실 교집합, feed overlap 조작, 낮은 신호, 기존 omitted, 단일 슬롯 보존을 검사한다. 유료 모델과 Apify 호출은 하지 않는다. 실제 모델 반복 결과와 사람의 비움 품질 평가는 PENDING이며 #80 후속 검증으로 남긴다.

## 남은 범위

실제 모델 반복 결과와 사람이 판단한 비움 품질은 PENDING이다. schema 1.0에 선택 필드를 추가하는 coordinated prototype 배포이므로 구버전 탭은 배포 뒤 새로고침해야 하며 capability 분기는 두지 않는다. 이 변경만으로 #80을 닫지 않는다.
