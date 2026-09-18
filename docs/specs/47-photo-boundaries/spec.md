# 사진 관측 경계 보강

D3: 근거는 실제 관측에 닿아야 한다. 담당 diego.yoon, 협업 enzo.cho. #47.

- root가 숨겨진 SVG fixture는 측정하지 않는다. 잘못된 XML numeric entity는 예외나 허위 문자열 대신 분석 불가로 처리한다.
- JPEG는 헤더 길이·색 성분·sampling·최대 40,000,000픽셀을 검사한 뒤 메모리를 할당한다. 제한 초과는 측정 불가(null)이며 업로드 전송 정책은 #24가 별도로 정한다.
- 캐시 반환값 변경이 다음 요청에 영향을 주지 않는지 #45 인수 후 검사한다.
- lib/photo_analysis.js, lib/jpeg_dc.js, test/photo-boundaries.test.js만 제품 변경한다. order.js는 #41에 인계해 중복 수정하지 않는다.
- 기존 재현 실패 → 수정 후 통과, 전체 test/eval/check. paid product calls 0.
