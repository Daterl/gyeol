# 비움 판단

공통 규칙: [style_guard](../shared/style_guard.md). 응답 envelope와 슬롯 필드는 [caption](caption.md)을 따른다.

사진의 설명이 반복되거나 글보다 사진을 그대로 두는 편이 나은 자리는 omitted로 제안할 수 있다. 입력의 '앞_사진과_겹침'과 '피드_안에서_색이_가장_진함'은 제안 재료이며 개인의 취향을 확정하지 않는다. 관측한 사실이 비어 있을 때는 관측하지 않은 내용을 만들지 않는다.

겹침 신호는 우리가 자리를 정할 때 쓴 내부 계산이다. **그 입력 이름도 세기도 문장·비움 이유·근거 note에 옮기지 않는다** — note에는 그 사진에서 확인한 사실을 적는다. 설명 중복 확률이나 사용자 취향의 절대 비율처럼 설명하지도 않는다.

omitted 슬롯은 `caption_state:"omitted", text:null, omit_reason:"구체적인 이유", evidence:[...]`를 반환한다. 이유는 “앞 사진과의 겹침 신호가 높아, 이 자리는 사진만 두어도 좋아요.”처럼 판단 근거를 말한다. describable_facts의 실제 반복 없이 설명이 겹친다고 단정하지 않는다. 관측 사실이 부족한 경우는 “확인한 사실이 적어, 사진만 두는 편을 제안해요.”라고 그 한계를 밝힐 수 있다.

- uploaded_photo evidence는 해당 사진 ID를 가리킨다. 필요하면 rule evidence로 `gyeol.omit.overlap`, `gyeol.omit.visual_peak`, `gyeol.omit.insufficient_facts` 중 실제 판단에 쓴 규칙을 추가한다.
- “미완성”, “채워 주세요”, “몇 개만 더”처럼 비움을 결함으로 표현하지 않는다.
- 비움을 몇 개 할지는 여전히 근거에 따른 판단이다. 개수를 맞추려고 비우거나 채우지 않는다. 서버가 mode=all 응답의 omitted 슬롯 수를 세서 `omission` 에 적어 보내지만, 그건 결과를 그대로 전하는 것이지 목표치가 아니다. 응답에 이 필드를 직접 넣지 않는다(#80).
- 모두 비워도 성공 결과다. mode=all에서는 중립적인 타이틀 한 줄과 N개 omitted 슬롯을 유지한다. 빈 slots 배열로 대신하지 않는다.
- 단일 슬롯 채우기 요청이라도 관측 사실은 늘어나지 않는다. filled로 쓸 근거가 있으면 쓰고, 없으면 비움 이유를 유지한다. 임의로 새로운 사물·장소를 만들지 않는다.

caption_coverage가 `all`이면 서버가 새 omitted를 만들지 않는다. `sparse`이면 캡션 길이와 독립된 현재 의도로 보고, 서버가 입력 사진에서 다시 확인한 겹침 신호가 피드 값과 일치하는 2번 이후 슬롯 중, 가장 높은 한 자리가 제품 규칙 기준을 넘길 때만 그 한 자리를 omitted로 안정화한다.

caption_coverage가 없는 freetext는 모호하거나 부정·충돌·지원 불가인 요청일 수 있으므로 current의 과거 비움 비율로 덮지 않는다. ig_reference에는 기존 관측 규칙을 유지한다. 실제 target/current의 `empty_caption_ratio`와 슬롯 수를 곱한 기대 비움 수가 1 이상이어야 하고, 어느 축이든 0이거나 상세 캡션 의도이면 적용하지 않는다. photo plan, mode=slot, 이미 omitted가 있는 결과에는 적용하지 않는다. 그 기준은 사용자 취향이나 모델 관측이 아니라 제품 규칙이며 `gyeol.omit.overlap` 근거로 드러낸다.
