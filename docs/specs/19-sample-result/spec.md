# #19 원클릭 샘플 결과

담당 diego.yoon, 협업 enzo.cho. 기준 develop 0e27ac1, #17/#15 store·결과 편집 부분 인수. 별도 Client store에서 fixtures/sample_result.json을 로컬 재생한다. 사용자 사진/store를 대체하거나 초기화하지 않는다. 첫 화면 샘플로 바로 보기 1회로 이미지·근거·비움·제목/캡션 편집·내보내기가 열린다. API/모델/Apify 호출 없음. Next Image는 공개 로컬 에셋을 최적화한다.

합성 이미지 3장은 imagegen으로 독립 생성했다. 이미지 검토 후 커피잔/초록 잎/주황 부표를 직접 확인해 사전 작성한 관찰·순서·문장을 사용한다. 색·크기 등 픽셀 값은 기존 analyzePhoto(apiKey='')로 로컬 측정. model 문자열에 manual sample annotation을 명시하고 provenance 및 화면에서 실모델 출력이 아니라고 설명한다. 기존 15슬롯 추상 JSON에 새 사진을 거짓으로 붙이지 않는다. 15장 실제 매핑은 #15 증거가 있다.

Owned sample/*·public/samples/*·sample_result fixture. Shared ResultScreen에 샘플 이미지 매핑/고유 heading id를 연결하며 입력 전 샘플 버튼을 배치한다. 기존 feed mock API는 보존한다. 팀 밖 다른 기기30초 측정, 익명 Production 접근은 미실행이면 PENDING으로 유지한다. main 릴리스/보호설정 변경은 하지 않는다.
