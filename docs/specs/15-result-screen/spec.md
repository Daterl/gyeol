# #15 결과 작업대

담당 diego.yoon, 협업 enzo.cho. 기준 develop 5adce3c. #14 입력과 #25 store의 부분 인수. 입력 photos/blob URL·original feed/context·order를 구독한다. 새 계약/의존성을 만들지 않는다.

한 화면 결과에는 현재 번호와 원래 제안 번호, 사진 원본 링크, 한 줄 근거·펼침 근거를 표시한다. 버튼/키보드/네이티브 드래그는 기존 movePhoto로 같은 photo_id를 이동하며 original을 변경하지 않는다. 위치 이동 후 원래 근거임을 명시한다. 사진만/target_only/corrected를 구분하고 delta note_key 한국어 템플릿에 current/target/resolved를 반올림 없이 노출한다.

Owned src/features/result/*, src/copy/deltas.ko.json. 연결만 src/features/input/photo-input.tsx 수정. #17 캡션 편집·export는 후속이다. 3/15/20 슬롯 ID·근거 보존과 보정 문구는 현재 테스트 도구로 검증한다. 모바일/키보드 화면과 Preview 확인을 기록한다. 네이티브 드래그의 모바일 대체는 44px 이동 버튼이다.
