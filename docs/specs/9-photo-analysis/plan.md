# plan.md — #9 구현 순서

`CLAUDE.md` 3절 생략표에서 M 크기는 plan 이 생략 대상이지만, 이 세션은 새 파일 5개를 만들고 그중 2개가 공유 영역(`api/`·`scripts/`)이므로 **건드리는 파일을 먼저 공개하는 쪽**을 택한다.

## 건드리는 파일

| 파일 | 상태 | 소유·리뷰 | 무엇 |
|---|---|---|---|
| `prompts/input/photo_analysis.md` | 신규 | 원재 소유 | 비전 프롬프트. 실행 시점에 읽는 파일 |
| `lib/jpeg_dc.js` | 신규 | 원재 리뷰 | JPEG → 8×8 블록 평균색 격자. 한 가지 일만 한다 |
| `lib/photo_analysis.js` | 신규 | 원재 리뷰 | 해시 캐시 + 모델 호출 + 휴리스틱 + 계약 검증 |
| `api/analyze.js` | 신규 | 원재 리뷰 | 사진 1장 = 요청 1건 핸들러 |
| `scripts/run_pipeline.js` | 신규 | 원재 소유 | 폴더 → PhotoAnalysis N개 + 호출 카운터 |
| `test/photo_analysis.test.js` | 신규 | 원재 | 아래 판정용 |
| `scripts/server.js` | **수정** | 원재 소유 | `/api/analyze` 라우트 1줄 추가 |

**안 건드리는 것:** `schemas/` 4종 · `lib/contracts.js` · `fixtures/` · `eval/` · `api/feed.js` · `package.json`(의존성 0개 유지) · `docs/intent.md` · 배포 설정 · 디에고 소유 전부.

## 순서

| # | 무엇 | 무엇으로 확인하는가 |
|---|---|---|
| 1 | `lib/jpeg_dc.js` — 마커 파싱 · 허프만 · DC 추출 | 실제 인스타 JPEG(프로그레시브 1080×1350)에서 블록 격자가 나오고, 블록 수가 `ceil(w/8)×ceil(h/8)` 와 맞는다 |
| 2 | `lib/photo_analysis.js` 휴리스틱 부분 | 같은 사진에 두 번 돌려 **같은 숫자**가 나온다(결정적). `validatePhoto` 통과 |
| 3 | 해시 캐시 + 호출 카운터 | 같은 바이트 2회 → 호출 0회, 그리고 두 번째 결과의 `photo_id` 가 **새 값**이다 (W7) |
| 4 | `prompts/input/photo_analysis.md` + 모델 경로 | 주입한 가짜 클라이언트로 성공/실패/계약위반 3케이스. 실패 시 `analysis_source:"heuristic"` 이고 throw 하지 않는다 |
| 5 | `api/analyze.js` + `scripts/server.js` 라우트 | `curl` 로 200/400/405/413/415 확인. `photos: [...]` 배열 입력이 400 (W6) |
| 6 | `scripts/run_pipeline.js` | 실제 사진 15장 폴더 → JSON 15개 + 호출 카운터 + 측정값 요약표 |
| 7 | `npm test` · `npm run eval` · `npm run check` | 기존 것까지 전부 통과 |
| 8 | 전수 대조 | 15장을 눈으로 보고 `describable_facts` 를 한 줄씩 대조 |
| 9 | `report.md` | 위 7·8 의 **실제 출력**을 붙인다. 못 한 것은 PENDING 으로 적는다 |

## 검증 데이터 두 벌 — 왜 둘인가

- **실제 사진 15장**: `pivot/apify-check/fixtures/images/` (읽기 전용). 전수 대조가 의미를 가지는 유일한 데이터다. 단 이 폴더는 레포 밖이라 리뷰어가 재현 못 할 수 있다.
- **레포 안 15장**: `eval/golden/case_01/photos/` (합성 SVG 카드). 리뷰어가 레포만 클론해도 `run_pipeline` 을 돌릴 수 있다. 합성 카드이므로 품질 증거는 아니다.

둘 다 돌리고 둘 다 `report.md` 에 적는다. 하나로 다른 하나를 대신하지 않는다.

## 막힐 것을 미리 아는 지점

1. **API 키 없음** → 실모델 왕복 시간·실토큰 비용을 이 세션에서 측정 못 한다. 우회 구현으로 숫자를 만들지 않고 PENDING 으로 남긴다.
2. **프로그레시브 JPEG** → 첫 스캔이 DC 스캔이 아닌 파일이 있으면 DC 를 못 읽는다. 그 경우 `ANALYSIS_UNAVAILABLE` 로 정직하게 실패하고, 몇 장이 그랬는지 `report.md` 에 센다.
3. **`scale`·`has_face`** → 스키마에 "미관측" 값이 없다. spec 8절 대로 스키마를 안 바꾸고 PR 에 적는다.
