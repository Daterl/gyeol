# 출력 프롬프트 인수

담당 diego.yoon / 협업 enzo.cho. D4 한 줄 타이틀, D5 근거 안의 filled/omitted.

세 출력 파일과 공통 style_guard는 서버가 파일로 읽는 system 지시문이다. 기존 CLAUDE 금지어·과장 금지를 공통 파일에 모으며 완화하지 않는다. mode all/slot과 user 상태는 #24 계약 초안을 따른다.

manual-examples.json은 수동 작성한 합성 사진 예시다. 사진만/target_only/corrected/슬롯 하나 채우기를 포함한다. 문장은 실제 슬롯 사실을 그대로 선택했으며 사진에 없는 장소·시간·감정을 추가하지 않는다. 이는 생성 모델 품질 증거가 아니다.

검증: 기존 validateExport·슬롯 ID 및 사실 대조, 공통 문서 참조, 금지어/최상급 0건. 실제 모델 출력은 #26/#6에 남긴다. endpoint나 모델 호출 코드는 이 노드에 넣지 않는다.
