# #96 출력 모델 신뢰 경계

담당: diego.yoon · 협업: enzo.cho

## 결정

출력 모델에는 문장 생성에 필요한 값만 보낸다.

- 슬롯: `position`, `photo_id`, `caption_inputs.describable_facts`
- 적용 프로필: `disclosure`와 근거·confidence를 제거한 언어 값

반환 feed의 프로필 ID, 순서 근거와 비움 제안은 추적·설명용으로 그대로 보존한다. 모델에는 `rationale`, `narrative_role`, 겹침·피크 수치, 프로필 ID·delta·시각·순서 근거를 보내지 않는다.

모델 응답과 서버 안정화 결과는 같은 공개 문구 검사기를 통과해야 한다. 제목, 캡션, 비움 이유, evidence note에 모델 입력의 필드명·순서 규칙 문구·정규화 측정값이 있으면 `MODEL_CONTRACT`로 실패한다. 일반적인 `밝기`·`채도` 표현은 해당 사진의 `describable_facts`에 실제로 있을 때만 허용한다.

## 회귀 기준

- all·slot 요청의 모델 슬롯과 적용 프로필 키가 화이트리스트와 정확히 일치한다.
- #99의 current 없음·2자·950자 모델 요청은 바이트 단위로 동일하다.
- title, text, omit_reason, evidence.note 유출을 all·slot에서 거부한다.
- 공개 가능한 밝기·채도 사실과 #95 비움 개수·안정화 계약은 유지한다.
