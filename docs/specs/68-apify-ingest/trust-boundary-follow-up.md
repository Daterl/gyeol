# #68 신뢰 경계 후속 검증

`develop@558e21d`에서 시작해 `develop@b00aa1e`로 rebase했다. #84 공개 URL 수집과 #89·#95, #105, #110 target_only 중립화 기능을 그대로 포함한다. #100의 SHA-256 캡션 모집단 참조와 Apify `evidence_refs` 연결도 보존한다. 실제 Apify·모델·Production 호출은 하지 않았다.

## 남아 있던 반례와 수정

| 경계 | 수정 전 재현 | 수정 |
|---|---|---|
| 유료 start 재시도 | 같은 요청 3회가 서로 다른 run 3개를 시작 | durable ledger를 필수 주입 계약으로 만들고, 없는 기본 Vercel route는 유료 start를 503으로 차단 |
| 누적 비용 | 실행마다 USD 0.10만 제한 | ledger가 호출자별 누적 예약 비용을 제한하고 모호한 POST claim을 유지하도록 계약화 |
| secret 역할 | access key와 receipt secret이 같아도 동작 | provider/access/receipt 값을 pairwise-distinct로 검사하고 receipt payload schema도 검증 |
| provider permalink | 외부 host·javascript URL·shortcode 불일치를 증거로 채택 | HTTPS Instagram permalink와 path shortcode 일치를 검증 |
| cancel 경쟁 | abort 503이 뒤이어 확인한 TIMED-OUT/FAILED를 가림 | follow-up terminal 상태를 먼저 분류하고 nonterminal일 때만 abort 오류 반환 |
| 실행 상한 | RUNNING/SUCCEEDED의 31행·999초·USD 0.25·무제한 options를 허용 | active 초과는 즉시 abort 시도 후 오류, 성공은 실제 행 수·runtime·cost·run options를 재대조 |
| Next method | 실제 GET·PUT·DELETE가 framework 기본 405 | 세 method를 공통 handler로 export해 JSON·Allow·no-store 계약 고정 |

## 계약 한계

프로젝트는 로그인과 DB를 두지 않는 MVP라 현재 배포에 durable ledger가 없다. process-local reference ledger를 Vercel 기본값으로 쓰면 cold start/다중 isolate에서 중복 과금되므로 실제 route에 기본 주입하지 않는다. 따라서 HTTP 유료 start는 503으로 fail closed하고, 브라우저 직접 연결 전에 durable ledger를 같은 인터페이스로 주입해야 한다. 기존 로컬 CLI는 한 출력 폴더의 receipt 예약 파일로 중복 시작을 막는 명시적 운영자 경로다.

## 무료 검증

| 명령 | 결과 |
|---|---|
| `node --test test/apify_ingest.test.js test/current_profile.test.js` | 68 PASS |
| `npm test` | 261 PASS |
| `npm run test:ui` | 35 PASS (11 files) |
| `npm run eval` | PASS; 고의로 깨진 E1·E2·E3·E6·E8·E9·E10·E11은 EXPECTED FAIL |
| `npm run check` | PASS, 75 JS/JSON |
| `npm run lint` | PASS, 42 files |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| 빌드 후 `next start` 인증 GET·PUT·DELETE `/api/ingest` | 각 405, JSON `METHOD_NOT_ALLOWED`, `Allow: POST`, `Cache-Control: no-store` |
| 빌드 후 `next start` 인증 POST start, durable ledger 없음 | 503, JSON `NOT_CONFIGURED`; 제공자 호출 전 차단 |
