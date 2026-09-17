# #17 실행 증거

담당 diego.yoon / 협업 enzo.cho. 기준 8b7a3a7. Node184/UI34/eval/check/lint/typecheck/build PASS.

실제 localhost:8356/?mock=1 Chrome 파일 선택 JPEG3장 → 결과 → 제목과 문장 제안. 제안됨/비움(권장)·근거·그래도 채우기 확인. 첫 슬롯 직접 작성 후 두 번째 비움 채우기 → 첫 사용자 문장 그대로, 둘째만 채워짐. 제목 수정 → 세 슬롯 모두 말 없이 두기 → JSON/텍스트 다운로드. 실제 Downloads 파일을 읽어 title/3개 photo_id/null text/사진 근거/사용자 비움 근거 보존 검증. downloaded-all-omitted.json/txt는 직접 다운로드한 합성 QA 사진 결과 복사본.

스크린샷 all-omitted.png, omission-cards.png. 테스트는 재정렬/전체 비움 export 및 임의 응답 검증 실패 시 기존 draft 보존, mock 실행의 fetch 0회까지 확인한다. 제품 유료 모델 호출 없음.

팀 밖 2명 반응·실모델 품질·배포 결과 편집은 미실행. #17을 완료로 닫지 않고 #19 샘플/#27 통합 QA에 연결한다.

독립 Sonnet5 medium 수정: 캡션 실패가 사진 업로드 다시 시도 라벨을 오염시키는 회귀 테스트 수정 전 FAIL→수정 후 PASS. 공통 request error에 operation을 보존하고 입력/캡션의 loading/error 메시지를 분리했다. 다운로드 앵커는 body append→click→remove로 보완했다. 최종 Node184/UI35/eval/check/lint/typecheck/build 및 교차 리뷰 PASS, blocking0.

낮은 지적 처리: 실제 다운로드는 위 Chrome 산출물로 검증했다. 주입 실행 결과 검증은 잘못된 mock/custom 결과가 초안을 덮지 못하도록 유지한다. mock은 명시적으로 API가 아닌 화면 QA이며 #26 실제 API 검증을 대신하지 않는다. 직접 비움은 사용자 행동 표시이며 별도 i18n 체계는 추가하지 않는다.
