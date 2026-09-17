# 독립 실행 리뷰

GPT-6 구현/검토 + 실제 modelUsage claude-sonnet-5. basec9c398f의 동일 diff.

Not essential to the review — these are just log artifacts outside the diff scope, so I'll skip them.

## 리뷰 결과 (issue #37, 대상: companion.tsx / companion.test.ts / package.json / package-lock.json)

**대상 파일**
- `src/components/companion.tsx` (motion 애니메이션 도입)
- `src/components/companion.test.ts` (신규 테스트)
- `package.json`, `package-lock.json` (`motion@13.4.0` 의존성 추가)

**실행한 명령**
- `npm test` → 186 passed (단, 이 스크립트는 `test/*.test.js`만 실행 — `companion.tsx` 관련 로직은 커버 안 됨)
- `npm run eval` → 명시적 EXPECTED FAIL 케이스 포함 정상 통과, companion과 무관한 영역
- `npm run test:ui` (vitest) → 10 files / 31 tests passed, `companion.test.ts` 포함
- `npm run typecheck` → 타입 오류 없음

**발견 사항**

1. (정보/낮음) `companion.test.ts:12-16`에서 `react` 모듈 전체를 목킹해 `useEffect`를 큐에 쌓아두는 방식으로 테스트합니다. `motion/react`의 `useAnimate`/`MotionConfig`도 목이라 실제 framer-motion 통합 동작(스코프 ref 바인딩, reducedMotion="user" 처리 등)은 검증되지 않고 순수 effect 콜백 로직만 검증됩니다. 실제 DOM에 마운트해 애니메이션이 걸리는지 확인하는 통합 테스트는 없습니다.

2. (낮음) `companion.tsx:14-24` — `MotionConfig reducedMotion="user"`를 선언해두고, 동시에 `useReducedMotion()` 값을 수동으로 분기해 동일한 목적(모션 감소 대응)을 이중으로 처리하고 있습니다. 기능상 오류는 아니지만 중복 로직이라 둘 중 하나로 정리하는 편이 유지보수에 낫습니다.

3. (정보) `reduce === null`(preference 미확정 상태, 보통 SSR/최초 렌더)을 `reduce === true`와 동일하게 "정적" 취급합니다. 접근성 관점에서는 안전한 기본값이라 문제라기보다 의도된 설계로 보이나, PR 설명에 이 선택이 명시되어 있는지 확인 권장합니다.

4. (정보) `motion` 패키지(및 `framer-motion`) 의존성 추가는 `package.json`/`package-lock.json`에 일관되게 반영되어 있고 정식 npm registry 통합니다. 보안 이슈 없음.

**결론**: 치명적 정정/보안 이슈는 발견되지 않았습니다. 테스트·타입체크·eval 모두 로컬에서 통과했으나, `npm test`는 이 변경분을 검증하지 않으므로 실제 검증은 `test:ui`/`typecheck` 결과에 근거합니다. 유료 모델 수준 품질이나 DoD 전체 완료를 보증하는 것은 아닙니다.

대응: effect/cleanup 검사는 실제 Motion 통합 검사가 아니라고 명시하고 CUA 실화면 확인을 별도 수행. MotionConfig는 #37 계약이고 imperative useAnimate는 자체 reduced guard가 필요하며 opacity까지duration0으로 끄므로 둘 다 유지. preference unknown은 정적으로 처리함을 spec에 명시. motion이 내부 framer-motion을 의존하는 것은 패키지 자체 구성이며 직접 의존성 중복 설치는 없음.
