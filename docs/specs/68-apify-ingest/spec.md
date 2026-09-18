# 공개 URL 수집 계약

## 입력과 범위

Actor는 [ADR-0006](../../adr/0006-apify-public-instagram.md)의 `apify/instagram-scraper`, `resultsType=posts`로 고정한다. HTTPS의 instagram.com/www.instagram.com 계정 경로 하나만 허용한다. 기본 3건·최대 30건, 실행 시간 120초, 실행 청구 상한 USD 0.10을 요청한다. 0.10은 이 기능의 예산 정책이며 예상 가격이 아니다. `maxItems`는 pay-per-result 과금 항목 수를 제한하고 `maxTotalChargeUsd`는 전체 과금 모델의 실행 청구를 제한한다. 반환 수는 resultsLimit와 조회 limit로 제한한다.

로그인·쿠키·다른 제공자·댓글 수집은 없다. `knownPrivate=true`로 전달된 확인된 비공개는 외부 호출 전 거부한다. 제공자의 `isPrivate:true`, `private:true`, `error:private_account`도 비공개로 처리한다. 나머지 오류에서 비공개를 추정하지 않는다. 실패 분류 응답은 fixture로 검증하며 실제 비공개 수집은 하지 않는다.

서버 토큰 `APIFY_TOKEN`은 제공자 Authorization 헤더에만 쓴다. 서버 간 진입 키 `APIFY_INGEST_ACCESS_KEY`는 32자 이상으로 별도 생성하고 브라우저에 보내지 않는다. `APIFY_INGEST_RECEIPT_SECRET`은 별도의 서버 전용 32자 이상 서명 키다. 수집 호출자에게도 주지 않는다. 키가 없으면 기능이 비활성이다. 키 비교는 timing-safe다. 이 경로는 인증된 서버 호출자에게만 열며, 사용자별 세션 인증·분산 요청량 제한은 후속 화면 통합의 선행 조건이다. 현재 제한은 실행당 상한이며 여러 실행의 월간 예산을 보장하지 않는다.

## 서버 호출

`POST /api/ingest`, `Authorization: Bearer <서버 간 키>`, JSON 본문 최대 8KiB.

| action | 입력 | 출력 |
|---|---|---|
| start | url, confirmLive:true, 선택 limit/knownPrivate/accountScope(main·sub·n/a) | 202, RUNNING + receipt + run_id + notice |
| status | receipt | 202 RUNNING 또는 200 SUCCEEDED/CANCELLED |
| cancel | receipt | 취소 후 조회 결과. 완료가 먼저 도착하면 SUCCEEDED 보존 |

호출자는 시작 전에 비용과 샘플보다 긴 대기를 고지하고 confirmLive를 명시한다. 폴링은 호출자가 5초 이상의 간격으로 같은 receipt를 조회한다. 서버 내부 대기 루프는 없다. 각 제공자 요청은 5초 제한이며 GET만 네트워크 장애 또는 5xx에 최대 1회 재시도한다. 429는 재시도 없이 한도로 반환한다. 시작 POST는 재시도하지 않고 제공자의 실행 timeout을 120초로 지정한다. 호출자는 150초 후에도 RUNNING이면 같은 receipt를 보존하고 취소/상태 확인으로 전환한다. HTTP start 자체에 중복 키는 없으므로 호출자도 자동 재시작하지 않는다.

receipt는 `{runId,url,limit,accountScope}`의 base64url JSON과 HMAC-SHA256 서명이다. 서명 키는 APIFY_INGEST_RECEIPT_SECRET이다. 별도 TTL은 없고 키 교체 시 기존 receipt는 무효화된다. 재조회 결과의 run ID·수집 시각을 보존하므로 이전 실행을 새 라이브 성공으로 표시하지 않는다. receipt가 없거나 변조되면 제공자를 호출하지 않는다. 시작 응답 유실은 START_UNCONFIRMED로 반환하며 제공자 콘솔에서 기존 실행을 확인해야 한다.

## 완료 결과와 출처

완료 출력은 `snapshot`, `currentProfile`, `targetProfile`, `metrics`, `receipt`다. snapshot은 HTTP 응답 전용이고 호출자가 저장한다. CLI는 출력 폴더에 receipt.json을 먼저 저장하고 조회 결과를 result.json에 저장한다. `storage/` 기본 폴더는 Git 제외다. 같은 폴더로 유료 start를 재실행하면 거부한다. 확정적인 설정·인증·입력 오류에서는 예약 파일을 제거한다. 시작 여부 미확인 파일은 유지하고 제공자 콘솔 확인 전 재시작하지 않는다.

동일 스냅샷을 현재 계정으로 해석할 때는 `buildCurrentProfile`, 참고 계정으로 해석할 때는 `extractFromReference`를 사용한다. 결과 두 벌은 선택 가능한 추출 결과이지 두 계정을 혼합한 프로필이 아니다. 기존 schemas 4종을 변경하지 않는다. 현재 프로필의 `source=cached`는 기존 스냅샷 추출 enum이며 실제 방법은 provenance.method=apify로 표시한다. 공식 Instagram API라고 주장하지 않는다.

- snapshot: snapshot_id, handle, posts, provenance(account, account_scope, collected_at, method, actor, run_id, dataset_id, source_url, evidence_refs, carousel_order_check).
- posts: 게시물 id, shortCode와 shortcode(두 기존 추출기 호환), caption, child_count, index, url, published_at, type, owner_id/owner_username, coauthors, photo_tags, mentions, hashtags, location, music, children. 자식 id/index/type/display_url/video_url과 배열 순서를 보존한다.
- 본문과 댓글을 섞지 않는다. 게시일은 published_at이고 사건일 event_at은 null이다. 공동 작성자·사진 태그·본문 멘션을 분리하며 누락값은 null이다. 소유 또는 공동 작성 계정이 요청 계정과 일치해야 하며 inputUrl이 있으면 이 또한 일치해야 한다. inputUrl만 같은 다른 계정 결과는 거부한다.
- evidence_refs는 snapshot ID, shortCode, account:shortcode를 실제 원본 URL에 연결한다. 새 실행에 브라우저 대조 증거를 만들지 않으며 사진 모델은 호출하지 않는다.
- metrics: run_id, build_id, started_at, finished_at, duration_seconds(제공자 stats.runTimeSecs), usage_total_usd(인증된 run.usageTotalUsd). 누락은 null이며 가격으로 환산하지 않는다. observed_at은 조회 시각, provisional은 종료 시각부터 10초가 지나지 않았거나 종료 시각이 없다는 뜻이다. 첫 완료의 비용·통계는 잠정값일 수 있으므로 같은 receipt를 완료 10초 뒤 다시 조회해 provisional=false인 관측을 사용한다.

## 실패 계약

오류 응답은 `{error:{code,message,details}}`다. 유효 receipt로 조회·취소 중 실패하면 details.receipt를 보존하고, Actor의 실패·시간초과 등 실행 상태 판정 오류에는 details.metrics를 함께 준다. 제공자 요청 자체의 실패에는 receipt만 있을 수 있다. 요청 자체의 시간초과와 Actor 시간초과는 모두 PROVIDER_TIMEOUT이며 details 유무로 관측 범위를 구분한다.

요청 limit은 최대 표본 수이므로 1~limit건은 성공이며 계정 전체 수집을 뜻하지 않는다.

빈 결과·하나라도 누락된 캡션·캐러셀 구조 누락·중복 게시물·출처 불일치·부분 오류는 **실행 전체 실패**다. 부분 결과를 성공으로 내보내거나 다른 계정/과거 캐시로 대체하지 않는다. 빈 문자열 캡션은 정상 관측이다.

| 오류 코드 | HTTP | 의미 |
|---|---|---|
| METHOD_NOT_ALLOWED | 405 | POST 외 메서드 |
| INVALID_URL / INVALID_INPUT / INVALID_RECEIPT | 400 | 입력·확인 정보 거부 |
| UNAUTHORIZED | 401 | 서버 진입 또는 제공자 인증 거부 |
| NOT_CONFIGURED | 503 | 서버 키·토큰 미설정 |
| PRIVATE_ACCOUNT | 422 | 명시적 비공개 증거 |
| ACCOUNT_NOT_FOUND | 422 | 명시적 account_not_found 응답 |
| ACCESS_UNAVAILABLE | 422 | access_denied/login_required 응답 |
| ACCOUNT_UNCONFIRMED | 422 | 빈 결과 또는 분류할 수 없는 제공자 항목 오류 |
| COST_LIMIT | 429 | 제공자 402/429 또는 실패 실행의 명시적 비용 한도 메시지 |
| PROVIDER_TIMEOUT | 504 | 요청 또는 실행 시간초과 |
| PROVIDER_ERROR / INVALID_DATA | 502 / 400 | 제공자 실패 또는 필수 관측·출처 오류 |
| START_UNCONFIRMED | 502 | 유료 실행 생성 여부 미확인, 자동 재시작 금지 |

## 인계와 확인 기준

기존 `/api/feed`와 사전 스냅샷 데모는 변경하지 않는다. 후속 입력 통합 담당은 사용자별 권한/요청량 제한과 폴링 UI를 붙이고 완료 프로필을 feed 입력으로 연결해야 한다. 지금 서버 경로가 존재한다는 사실을 현재 화면의 URL 입력이 라이브로 동작한다는 뜻으로 보고하지 않는다.

[Actor 입력](https://apify.com/apify/instagram-scraper/input-schema), [실행 시작·상한](https://docs.apify.com/api/v2/actors-runs-post), [실행 조회·실제 청구액](https://docs.apify.com/api/v2/actor-run-get)을 2026-09-18 확인했다. 실행 증거와 항목별 판정은 [report.md](report.md)에 둔다.
