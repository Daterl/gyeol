# 비움 판단

공통 규칙: [style_guard](../shared/style_guard.md). 응답 envelope와 슬롯 필드는 [caption](caption.md)을 따른다.

사진의 설명이 반복되거나 글보다 사진을 그대로 두는 편이 나은 자리는 omitted로 제안할 수 있다. caption_inputs.adjacent_overlap과 is_visual_peak는 제안 재료이며 개인의 취향을 확정하는 점수는 아니다. describable_facts가 비어 있을 때는 관측하지 않은 내용을 만들지 않는다.

adjacent_overlap은 피드 생성 경로에 따라 측정 색 유사도 또는 사실 교집합 비율이다. 설명 중복 확률이나 사용자 취향의 절대 비율처럼 설명하지 않는다.

omitted 슬롯은 `caption_state:"omitted", text:null, omit_reason:"구체적인 이유", evidence:[...]`를 반환한다. 이유는 “앞 사진과의 겹침 신호가 높아, 이 자리는 사진만 두어도 좋아요.”처럼 판단 근거를 말한다. describable_facts의 실제 반복 없이 설명이 겹친다고 단정하지 않는다. 관측 사실이 부족한 경우는 “확인한 사실이 적어, 사진만 두는 편을 제안해요.”라고 그 한계를 밝힐 수 있다.

- uploaded_photo evidence는 해당 사진 ID를 가리킨다. 필요하면 rule evidence로 `gyeol.omit.overlap`, `gyeol.omit.visual_peak`, `gyeol.omit.insufficient_facts` 중 실제 판단에 쓴 규칙을 추가한다.
- “미완성”, “채워 주세요”, “몇 개만 더”처럼 비움을 결함으로 표현하지 않는다.
- 모두 비워도 성공 결과다. mode=all에서는 중립적인 타이틀 한 줄과 N개 omitted 슬롯을 유지한다. 빈 slots 배열로 대신하지 않는다.
- 단일 슬롯 채우기 요청이라도 관측 사실은 늘어나지 않는다. filled로 쓸 근거가 있으면 쓰고, 없으면 비움 이유를 유지한다. 임의로 새로운 사물·장소를 만들지 않는다.

서버는 mode=all 결과가 모두 filled이고, 적용 언어가 있으며, 실제 target/current 프로필에 관측된 `empty_caption_ratio`와 슬롯 수를 곱한 기대 비움 수가 1 이상일 때만 제한적인 안정화 규칙을 적용할 수 있다. 어느 축이든 비움 비율 0을 관측했거나 상세 캡션 의도이면 적용하지 않는다. 이 조건을 만족한 뒤 context.photos에서 다시 계산한 값과 feed 값이 일치하는 2번 이후 슬롯 중 가장 높은 adjacent_overlap이 0.9 이상일 때만 그 한 자리를 omitted로 바꾼다. photo plan, mode=slot, 이미 omitted가 있는 결과에는 적용하지 않는다. 이 기준값은 사용자 취향이나 모델 관측이 아니라 제품 규칙이며 gyeol.omit.overlap 근거로 드러낸다.
