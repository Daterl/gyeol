# plan — #11 CurrentProfile 추출

크기 M 이라 `plan.md` 는 생략 가능(CLAUDE.md 3절)이지만, **새 fixture 하나가 공유 파일**이라 건드리는 파일을
미리 적어 둔다. 실행 담당은 enzo.cho(AI 로컬 실행), 사람 리뷰 책임자는 enzo.cho, 공유 fixture 는 diego.yoon 확인 대상이다.

## 건드리는 파일

| 파일 | 상태 | 소유 | 왜 |
|---|---|---|---|
| `fixtures/ig_snapshot.json` | 신규 | **공유** (#11 실행 · #24 계약 확인) | 스냅샷 재생 경로의 입력. 실수집 스냅샷의 파생본 |
| `lib/current_profile.js` | 신규 | 원재 Owned | 추출 본체 |
| `prompts/input/current_extract.md` | 신규 | 원재 Owned | 추출 계약의 프롬프트 형태. **아직 런타임이 읽지 않는다** |
| `test/current_profile.test.js` | 신규 | 원재 | 5단계 게이트 |
| `docs/specs/11-current-profile/*` | 신규 | 원재 | 1~3단계 산출물 |

**안 건드리는 파일:** `schemas/*` · `lib/contracts.js` · `api/*` · `eval/*` · `fixtures/*.sample.json` · `package.json` · `public/*`.

## 순서 — 각 단계를 무엇으로 확인하는가

| # | 무엇 | 확인 |
|---|---|---|
| 1 | **A2 판정 먼저** — `pivot/apify-check/verify_carousel_order.py` 를 읽기 전용으로 2건 실행 | 둘 다 exit 0 이고 불일치 0건. 여기가 "다르다"면 4-2 규칙 자체를 다시 쓴다 |
| 2 | `fixtures/ig_snapshot.json` 생성 — 실수집 로컬 스냅샷에서 필요한 필드만 투영 | `node -e` 로 파싱 + posts 30건·carousel 26건·빈 캡션 0건이 원본과 일치 |
| 3 | `lib/current_profile.js` — **부재 경로 먼저** | `validateProfile(buildCurrentProfile(), 'current')` 가 통과 |
| 4 | 스냅샷 경로 (language + sequence) | 같은 fixture 로 2회 호출 시 `created_at` 제외 deep-equal |
| 5 | 업로드 경로 (visual + 선택 language) | `fixtures/photo_analysis.sample.json` 15장을 넣어 `validateProfile` 통과 |
| 6 | `opener_tendency` 3조건 게이트 | openers 없으면 필드 부재, 동률이면 부재, `"불명"` 문자열이 **어떤 경로에서도** 안 나옴 |
| 7 | `prompts/input/current_extract.md` | 파일 존재 + 4절 규칙과 문장이 어긋나지 않음(사람 대조) |
| 8 | `test/current_profile.test.js` | `npm test` 통과 |
| 9 | 네트워크 차단 재생 | `api/feed.js` 테스트와 같은 방식으로 fetch/net/http/dns 를 막은 자식 프로세스에서 동일 결과 + 시도 0회 |
| 10 | 회귀 | `npm run check` · `npm test` · `npm run eval` 전부 통과 (기존 산출물을 안 깼는지) |

## 막히면

같은 실패 3회까지만 고친다(CLAUDE.md 8절). 3회 뒤에도 안 되면 이슈에 원인·시도·증거를 적고 멈춘다.
우회 구현으로 겉만 통과시키지 않는다.
