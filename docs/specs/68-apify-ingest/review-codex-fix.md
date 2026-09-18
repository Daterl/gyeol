# PR #84 수정 검증 — Codex

대상은 `develop` 기준 PR #84의 수정 커밋 `0af51fa`이며, 원 리뷰와 `fix-report.md`를 읽고 수정된 동작만 검증했다. 검증일은 2026-09-18, 환경은 Node v22.22.3이다. 제품 코드·테스트·다른 워크트리는 변경하지 않았고, `pivot/`은 기존 fixture를 읽는 데만 사용했다. **신규 Apify 수집 0회, 실제 Apify 요청 0회**다. 네트워크 실험은 로그인 없는 Instagram 프로필 GET 두 번만 수행했고, 제공자 요청은 모두 가짜 응답으로 차단했다.

> **머지 보류: 실제 비공개 차단과 작성자 귀속 수정은 재현됐지만, 대상 계정과 연결되지 않은 공개 마커로 유료 시작이 허용되는 HIGH 1건을 먼저 닫아야 한다.**

## 1. 재현 결과

| 수정 주장 | 독립 재현 | 판정 |
|---|---|---|
| `hauny_bee`를 유료 호출 전에 차단 | 실제 HTML HTTP 200, 1,109,990 bytes, `private`; `PRIVATE_ACCOUNT`, 제공자 요청 0회, **1.280초** | 재현. 기존 1.62초와 동일 동작이며 시간은 새 실측값 |
| 공개 계정은 시작 가능 | 실제 `29cm.official` HTML HTTP 200, `public`; **0.719초**, 모의 제공자 POST 1회, `RUNNING` | 판별→시작 분기 재현. 실제 수집은 하지 않음 |
| 판별 실패 시 차단 | 마커 소멸·계정 불일치·복수 마커·공백으로 포맷 변경·HTTP 403·네트워크 예외·TimeoutError 모두 `ACCOUNT_UNCONFIRMED`, 제공자 0회 | 해당 실패 유형은 재현. 모든 구조 변경에 대한 보장은 아님 (§2) |
| 공동작성자 소유 인정 제거 | 실제 공개 fixture 30→26; current/target `sample_size` 모두 26 | 재현 |
| 제외 후 0건이면 실패 | 공개 fixture의 타인 글 4건만 입력하면 `ACCOUNT_UNCONFIRMED`, 제외 4건; 실제 비공개 fixture 1건도 같은 코드로 실패 | 재현 |
| 제외한 글은 evidence에 없음 | 제외 글 4건의 URL·shortcode·계정 접두 ref가 `evidence_refs`에 없음; 두 프로필의 근거 28개 전부 해소, 제외 글을 가리키는 근거 0개 | 재현 |
| `not_found` 및 설명 보존 | 실제 응답 fixture 분류 및 `inspect()` 경유 `provider_message` 보존 테스트 통과 | 재현 |
| 222개 테스트 및 5종 게이트 | 아래 §6 | 전부 재현 |

위 실패 주입은 기본 `readVisibility` 경로의 `fetchImpl`에 응답·예외를 넣었다. `checkPublic`을 단순히 `null`로 바꿔서 통과시킨 검사가 아니다. TimeoutError는 주입했으며 실제 10초 타이머 만료를 따로 기다리지는 않았다.

## 2. HIGH — 계정명과 공개 마커가 서로 다른 객체여도 공개로 판정한다

위치: [`lib/apify_ingest.js:44`](../../../lib/apify_ingest.js#L44), 특히 46–49행. 계정명이 HTML 어딘가에 존재하는지와, 공백 없는 `is_private`가 하나 있는지만 각각 검사한다. 그 마커가 **입력 계정의 것인지 연결하지 않는다**. 따라서 “HTML 구조가 바뀌면 막는 쪽”이라는 주장은 일반적으로 성립하지 않는다.

아래는 실제 Instagram 응답이라고 주장하는 데이터가 아니라, 구조 변경을 주입한 최소 반례다. 대상 계정의 비공개 값에는 JSON에서 허용하는 공백 하나가 있고, 다른 계정의 공개 값에는 없다.

```json
{"profile":{"username":"hauny_bee","is_private": true},"recommended":{"username":"other","is_private":false}}
```

현재 결과:

```text
privacyFromHtml(html, 'hauny_bee') => public
client.start(...)               => RUNNING
모의 유료 POST                  => 1회
```

실제 `hauny_bee` 페이지가 지금 이 구조라는 증거는 없다. 실제 현재 페이지는 §1처럼 정상 차단됐다. 그러나 요청받은 **구조 변경 시 보수적 차단** 검증에서는 재현 가능한 실패다. 대상의 마커가 사라지고 다른 계정의 마커 하나만 남는 경우에도 같은 결과가 나왔다. 테스트 222개는 이 계정 귀속 반례를 검사하지 않는다.

**머지 전 필요한 수정:** 알려진 프로필 데이터 구조에서 대상 username/ID와 privacy 값의 연결을 검증하고, 그 연결을 확인하지 못하면 `ACCOUNT_UNCONFIRMED`로 막는다. 공백 허용 정규식만으로는 서로 다른 계정의 값이 결합되는 문제를 해결하지 못한다. 위 반례 및 대상 마커 소멸+타 계정 마커 잔존을 회귀 검사에 추가하고, 기본 `start()` 경유 제공자 POST 0회를 검증해야 한다. 이 리뷰에서는 코드를 수정하지 않았다.

비용이 이미 발생하는 시점의 잘못된 허용이므로, 사후 소유자 제외만으로 이 문제는 닫히지 않는다.

## 3. 판별과 수집 사이의 시간차

위치: [`lib/apify_ingest.js:154`](../../../lib/apify_ingest.js#L154)의 HTML 판별 후 POST, 같은 파일 167행 이후 `inspect()`.

HTML이 공개라고 응답한 직후 상태가 비공개로 바뀌었다고 모의하고 실행했다. 프로필 GET은 1회뿐이며, 변경 후에도 모의 POST 1회가 실행됐다. 이후 제공자가 기존 실제 비공개 fixture의 공동작성 글만 반환하면 `ACCOUNT_UNCONFIRMED`로 실패한다. **이 경우 잘못된 프로필 생성은 막지만 이미 시작한 유료 실행을 되돌리지는 못한다.**

제공자가 전환 직전의 본인 게시물을 반환하는 상황을 별도로 합성하면 `inspect()`는 재판별 없이 `SUCCEEDED`를 반환한다. 이것은 코드가 허용하는 경로의 증명이며, 제공자가 실제로 비공개 콘텐츠나 캐시를 반환했다는 관측은 아니다.

**판정:** 비원자적 외부 조회 두 번 사이의 시간차는 존재한다. 이것 자체를 이번 머지의 추가 차단 사유로 삼지는 않되, 보장은 “사전 판별 시점에 공개로 확인됨”으로 한정해야 한다. 결과 반환 전 재확인은 상태가 바뀐 계정의 분석 노출을 줄일 수 있지만 이미 시작된 과금까지 0으로 보장하지는 못한다. 판별 시각·판별 근거를 남기고, 상태 변경 시 결과 처리 정책을 후속으로 명시하는 것이 필요하다.

## 4. 공동작성자 제외 판단과 P2

**배치 전량 실패 대신 타인 소유 게시물 제외는 타당하다.** 기존 원본 fixture를 읽어 다음을 독립 확인했다.

| 원본 (`pivot/apify-check/fixtures/`, 읽기 전용) | 원본 | 본인 글 | 제외 | 제외 행 중 입력 계정을 공동작성자로 명시 |
|---|---:|---:|---:|---:|
| `ig_feed_29cm.json` | 30 | 26 | 4 | 4 |
| `ig_feed_humansofny.json` | 100 | 97 | 3 | 3 |

각각 현재 정규화 함수로 26/97건이 남았다. 공동작성자 글을 그 계정의 관찰로 채택하는 것도 아니고, 정상 본인 글까지 폐기할 이유도 없다. 다만 두 계정의 결과로 `fix-report.md`의 “모든 공개 계정이 실패한다”까지 일반화할 근거는 없다.

`coauthored_excluded`는 29cm의 제외 4건 및 소유자 `kkyeongeun_`, `ko_ng__e`, `mapogu_won`, `yeoreum829`를 기록했다. 정규화가 제외 후 `posts`에서만 `evidence_refs`를 구성하므로 실제 두 프로필 근거에 타인의 글은 남지 않았다. **이번 P2 결함은 해소됐다.**

비차단 한계: 제외 기록은 건수와 중복 제거된 소유자뿐이며 제외 게시물별 ID/URL은 보존하지 않는다. 따라서 스냅샷 하나만으로 “어느 게시물을 제외했는가”를 완전히 복원할 수는 없고 원본 dataset에 의존한다. 이는 남은 관찰의 근거가 틀린 사람을 가리키던 기존 P2 결함과는 다르다. 또한 코드는 공동작성 여부와 무관한 모든 소유자 불일치를 제외하므로, `coauthored_excluded`라는 이름만으로 공동작성 관계가 검증됐다고 해석해서는 안 된다.

## 5. 기존 HIGH 2건 및 누적 비용

**HIGH-1 해소:** `responseError()`는 `not_found`를 `ACCOUNT_NOT_FOUND`로 분류하고, 미지 코드는 `ACCOUNT_UNCONFIRMED`로 둔다. `provider_error`와 `errorDescription`의 `provider_message` 매핑이 존재하며 `inspect()`가 context를 합칠 때 유지된다. 없는 계정의 사전 HTML 판별은 여전히 `ACCOUNT_UNCONFIRMED`일 수 있으며, 수집 후 오류 분류 개선과 구별해야 한다.

**HIGH-2 해소:** 커밋된 실제 응답 fixture에는 비공개 계정의 무오류 타인 게시물과 부재 계정의 `not_found`/`Post does not exist`가 들어 있다. 기존 합성 실패 분류에만 의존하던 검사는 실제 응답 형태를 사용하도록 바뀌었다. 공개·비공개 HTML은 전체 문서가 아닌 발췌라 구조 귀속 검증의 근거로는 부족하다. 이 리뷰는 fixture 안의 run/dataset 출처를 읽었으며, 역사적 Apify 원격 dataset을 재조회해 원문 진위를 다시 인증하지는 않았다.

**MEDIUM-2는 현재 머지 차단 사유가 아니다.** 누적 상한은 없고 `start()`마다 실행당 `$0.10`만 요청한다. 다만 화면 경로를 직접 추적했을 때:

- `src/lib/api.ts:127,148,195`의 호출 대상은 `/api/analyze`, `/api/feed`, `/api/generate`다.
- `src/features/input/input.ts`는 위 API 함수들을 사용하며 `/api/ingest`나 `confirmLive` 호출이 없다.
- `/api/feed` → `lib/pipeline.js:51` → `extractFromReference()` → `lib/target_profile.js:36`의 기본 registry는 저장된 `ref_snapshot.sample.json`을 읽는다. 화면에서 간접적으로 유료 수집을 부르는 경로도 발견하지 못했다.
- `src/`에서 ingest 연결은 서버 route 한 곳뿐이다. `lib/ingest_api.js:7–10,31`에서 서버 Bearer 키와 `confirmLive: true`가 필요하다.

따라서 화면 미연결이라는 완화 조건은 이 HEAD에서 확인된다. **화면 연결 전 계정/세션 요청·누적 비용 및 일 예산 상한은 선행 조건으로 유지해야 한다.** 이것은 코드 경로 검증이며 배포 환경의 키 설정·접근 로그까지 확인했다는 뜻은 아니다.

## 6. 게이트와 되돌림 검사

| 명령 | 새 실행 결과 |
|---|---|
| `npm test` | 222 pass / 0 fail, 1.470초 |
| `npm run eval` | E1/E2/E3/E6/E8/E9/E10/E11 PASS, 오류 주입은 EXPECTED FAIL; E4/E5/E7 수동 검증 미포함 |
| `npm run check` | 72 JS/JSON 파일 PASS |
| `npm run lint` | 41파일, 수정 없음, exit 0 |
| `npm run typecheck` | route typegen + tsc 통과, exit 0 |

되돌림은 원본 코드를 건드리지 않고 임시 디렉터리 복사본에서 수행했다. 32개의 ingest 검사를 각 변형에 실행했다.

| 독립 변형 | pass / fail | 검출 내용 |
|---|---|---|
| 현재 코드 | 32 / 0 | 기준선 |
| 사전 공개 판별 및 차단 제거 | 30 / 2 | 비공개 사전 차단, 익명 판별 요청 검사 |
| 공동작성자를 다시 소유자로 허용 | 29 / 3 | 공동작성자 귀속 거부, 실제 비공개 fixture, 실제 공개 30→26 검사 |
| `not_found`를 이전 `account_not_found`로 복원 | 30 / 2 | 실제 오류 분류, inspect 경유 오류 분류 |
| inspect에서 provider details를 context로 덮어쓰기 | 31 / 1 | 설명 보존 검사 |

수정 보고의 공동작성자 되돌림 `fail 2`와 이 리뷰의 `fail 3`은 변형 범위가 달라 직접 같은 수치로 보지 않는다. 이 변형은 공개 fixture 공동작성자도 다시 수용하므로 30→26 검사까지 실패했다. 회귀 검사가 실제 동작 변화에 반응한다는 것은 확인됐지만 §2 반례와 상태 전환 검사는 기존 suite에 없다.

Node 24 재검증은 하지 않았으므로 `engines: 24.x` 배포 환경 보증은 남는다. CodeRabbit는 설치·인증 상태만 확인했으며, 이번 요청의 Codex 독립 검증 범위를 유지하여 원격 리뷰는 실행하지 않았다.

## 7. 남긴 실행 근거와 종료 상태

이 문서의 표·반례가 지속 가능한 검증 기록이다. 같은 로컬 세션에서 상세 출력은 `/tmp/gyeol68-codex-test.log`, `/tmp/gyeol68-codex-probe.log`, `/tmp/gyeol68-codex-{baseline,remove-precheck,accept-coauthors,old-error-code,discard-provider-details}.log`에 있다. 재현 보조 스크립트는 `/tmp/gyeol68-codex-probe.mjs`, `/tmp/gyeol68-codex-mutations.py`이며 저장소 산출물에 포함하지 않았다.

제품 코드 수정·merge·배포는 하지 않았다. **머지 전 남은 작업은 §2의 대상 계정과 privacy 신호 연결 및 해당 회귀 검사다.**
