# #14 한 화면 사진 입력

담당 diego.yoon, 협업 enzo.cho. develop c52f892의 #25 상태 모듈 부분 인수. UI UX Pro Max/Next App Router/Tailwind 지침을 적용하되 사용자 확정 Next/Route Handler 계약이 React Native·Server Action 추천보다 우선한다. 기존 종이색/초록 토큰과 A 방향, 사진 우선 작업대 구성을 사용한다. 새 캐릭터/모션은 #35/#36/#37에서 연결한다.

사진 3~20장 파일/드롭 선택 → 썸네일·삭제 → 선택 아이덴티티(내 URL 또는 기존 사진·캡션, 레퍼런스 URL 또는 원하는 느낌) → 순서 요청. 상호 배타 입력은 하나를 선택하도록 안내한다. 빈 아이덴티티 허용. 파일 이름·형식·3MB 한도 오류는 입력 곁에 표시한다. 사진은 서버 분석에 전송됨을 고지한다.

Client Component useState initializer에 editor store를 만들고 필요한 selector만 구독한다. 선택 변경은 기존 요청을 취소하며 삭제 후 다음 버튼/파일 선택으로 포커스를 이동한다. 실제 root hydration/키보드/390·320·1440 검증을 남긴다. 결과는 #15/#17로 인계하는 간단한 수신 요약이다.

#18 API adapter 부분 인수가 필요하다. ?mock=1은 사용자 사진에 15장 샘플 분석을 붙이는 대신 실제 업로드 픽셀의 heuristic 경로를 요청하며 모델 호출을 하지 않는다. 고정 15장 샘플 버튼은 별도 경로로 유지한다. 선택 사진과 샘플을 혼합하지 않는다.
