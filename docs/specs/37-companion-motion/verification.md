# #37 검증

담당 diego.yoon / 협업 enzo.cho. Node186/UI31/eval/check/lint/typecheck/build PASS. 실제 claude-sonnet-5 독립 실행 리뷰 blocking0.

- 일반180ms opacity0.8→1, 이동2px(working4px)→0. 반복/페이지 효과/타이머/CTA대기 없음. 같은상태 재렌더는 effect 의존성이 바뀌지 않음.
- reduced=true 또는null은 opacity1/y0/duration0. SSR이미지는 숨기지 않음. effect cleanup stop3회 회귀 검사. 이 검사는 hook호출 인자/cleanup 검증이며 DOM Motion 통합 테스트가 아님.
- CUA Chrome 일반 화면에서 캐릭터 naturalWidth512, 최종 opacity1/transformnone/96px 예약. 390px샘플→키보드 이동→닫기→재진입 headingfocus와 이미지/편집 유지, 가로넘침0. 이미지와 작업안내는 모션에 의존하지 않는다.
- 네이티브 Chrome DevTools Rendering에서 실제 prefers-reduced-motion:reduce 설정 확인(reduced-motion.txt), 샘플 원클릭 결과·제목·JSON버튼 즉시 표시 확인. 검증 후 에뮬레이션 없음으로 복원하고 검증용 DevTools종료. 동작의 프레임별 시간 계측은 수행하지 않았다.
- 정적/모션 production .next/static/chunks/*.js 합계:710110→764155B, gzip220635→239994B(+19359B), 각각7파일. 브라우저 실제 최초 전송량/INP 수치가 아닌 빌드 산출물 비교. 별도 LazyMotion/전역타임라인은 추가하지 않았다.
- 이미지파일/예약공간/주요조작영역은 정적#36과 동일. API/출력/업로드/상태관리 변경 없음. 느린 네트워크/실기기 터치 품질은 #27, 실제모델/Production은 위임 범위 밖.

Vercel Preview 확인은 PR 코멘트에 최종head와 함께 기록한다.
