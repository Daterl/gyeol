# #37 이미지 Motion

담당 diego.yoon / 협업 enzo.cho. 기준 c9c398f. Companion 이미지 표시 경계만 수정, motion13.4.0 고정(React18/19 peer). 새로운 페이지 상태/타이머/무한 반복/스크롤 잠금 없음. 상태 이미지 src는 즉시 바뀌고 animation180ms가 CTA나 데이터 완료를 지연하지 않음. reduced 또는 아직 알 수 없는 preference는duration0, 정적 HTML은 항상 이미지 표시. effect cleanup에서 이전animation stop.

공식 근거(2026-09-17 확인): https://motion.dev/docs/react-installation / https://motion.dev/docs/react-motion-config / https://motion.dev/docs/react-use-reduced-motion / https://motion.dev/docs/react-use-animate . MotionConfig user와 imperative useAnimate에는useReducedMotion guard를 함께 적용한다.

검증: 일반/reduced/초기unknown+cleanup regression, 실제 UI 상태/재진입/320·390/정적 번들 대비. 의미 없는 CSS character나 전역 Motion 추가 금지.
