# 비움 판단

공통 규칙: [style_guard](../shared/style_guard.md). 응답 envelope와 슬롯 필드는 [caption](caption.md)을 따른다.

사진의 설명이 반복되거나 글보다 사진을 그대로 두는 편이 나은 자리는 omitted로 제안할 수 있다. describable_facts가 비어 있을 때는 관측하지 않은 내용을 만들지 않는다. 내부 정렬 수치나 규칙 이름은 입력으로 제공되지 않으며 이유로 만들지 않는다.

omitted 슬롯은 `caption_state:"omitted", text:null, omit_reason:"구체적인 이유", evidence:[...]`를 반환한다. 이유는 “앞 사진과의 겹침 신호가 높아, 이 자리는 사진만 두어도 좋아요.”처럼 판단 근거를 말한다. describable_facts의 실제 반복 없이 설명이 겹친다고 단정하지 않는다. 관측 사실이 부족한 경우는 “확인한 사실이 적어, 사진만 두는 편을 제안해요.”라고 그 한계를 밝힐 수 있다.

- uploaded_photo evidence는 해당 사진 ID를 가리킨다. 필요하면 rule evidence로 `gyeol.omit.overlap`, `gyeol.omit.visual_peak`, `gyeol.omit.insufficient_facts` 중 실제 판단에 쓴 규칙을 추가한다.
- “미완성”, “채워 주세요”, “몇 개만 더”처럼 비움을 결함으로 표현하지 않는다.
- 비움을 몇 개 할지는 여전히 근거에 따른 판단이다. 개수를 맞추려고 비우거나 채우지 않는다. 서버가 mode=all 응답의 omitted 슬롯 수를 세서 `omission` 에 적어 보내지만, 그건 결과를 그대로 전하는 것이지 목표치가 아니다. 응답에 이 필드를 직접 넣지 않는다(#80).
- 모두 비워도 성공 결과다. mode=all에서는 중립적인 타이틀 한 줄과 N개 omitted 슬롯을 유지한다. 빈 slots 배열로 대신하지 않는다.
- 단일 슬롯 채우기 요청이라도 관측 사실은 늘어나지 않는다. seed로 쓸 근거가 있으면 쓰고, 없으면 비움 이유를 유지한다. 임의로 새로운 사물·장소를 만들지 않는다.

모든 슬롯에 근거 있는 seed가 있어도 유효한 결과다. 서버는 비움 최소 개수나 비율을 맞추기 위해 seed를 바꾸지 않는다. caption_coverage는 제안의 맥락이며 비움 할당량이 아니다. 최종 캡션의 채움·편집·비움은 사용자가 선택한다.
