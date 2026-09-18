# #36 적용 검증

담당 diego.yoon / 협업 enzo.cho. Node186/UI30/eval/check/lint/typecheck/build PASS. 기존 API/store 계약과 유료 호출 경로 변경 없음. GPT-6 구현/검토 + claude-sonnet-5 독립 실행 리뷰 blocking0. 제품 API 유료 호출0.

- ✅ 입력: 작은 제목+사진3장 샘플 미리보기, 장식 캐릭터1개. 기본/대기/완료/오류는 기존 request/original로만 선택. 실제 lifecycle→cancel→late response→ready→caption failure→reset 회귀 테스트 통과.
- ✅ 결과: 사진 아래 편집을 바로 배치하고 모바일104px(320px88px) 사진과 문장을 함께 표시. 순서/근거/원본보기/전체비움/사용자편집 계약 유지.
- ✅ 320/390/1440px 가로 넘침0, 표시되는 버튼높이44px 이상. 캐릭터390px64px /320px0px. 모바일 직접 문장→다른 슬롯 채우기→ArrowDown 후 사용자 문장/photo_id 보존.
- ✅ 실제 네이티브 Chrome에서 qa-14/15/16.jpg3장 선택→unsupported URL 실패→자동 details 열림→URL 지우고 retry 성공3슬롯. 사진 보존/heading focus 확인. native malformed URL을 입력하고 details를 닫아 제출해도 브라우저 validation이 입력을 다시 펼치고 해당URL에 focus.
- ✅ Chrome 실제 확대 메뉴200% 확인, 결과 안내/버튼 겹침 없이 문장 예시 생성·비움/JSON/텍스트 버튼 표시. 확인 후100%로 복원. zoom200.jpg.
- ✅ 캐릭터 HTTP404 장애 주입 로컬 프록시(8361→8360, /images/gyeol-character만404): naturalWidth0인데96px공간 유지, H1/샘플/편집/JSON 활성 유지. CSS/SVG/Canvas 캐릭터 없음.
- ✅ 기본 이미지 응답 body30094B, 이미지 하나만 렌더. 실패와 정상 모두96×96 예약으로 이미지 유무에 따른 슬롯 크기 변화0. 이는 전체 페이지 CLS 계측 수치가 아니며 사용자 버튼으로 샘플이 펼쳐지는 높이 변화와 구분한다.
- ✅ 로컬 전후 이미지: 이전 docs/specs/19-sample-result/desktop-final.png·mobile390.png, 이후 input-1440.jpg/result-390.jpg/upload-success.jpg.
- ⏳ 실제 모바일 기기 터치/느린 네트워크 취소는 #27에서 통합 확인. lifecycle 취소/late response는 자동 검사 범위. Preview는 PR에서 별도 확인한다.

시안과 서비스 반영을 구분한다. #37 Motion은 이 정적 버전을 기준으로 이미지 요소에만 더한다.
