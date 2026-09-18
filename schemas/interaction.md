# 화면·서버 연결 계약 1.0 (ADR-0008 큐레이션)

결정자 diego.yoon / 협업 enzo.cho. #24, ADR-0005 위임에 따른 기술 계약. 기존 TargetProfile/CurrentProfile/PhotoAnalysis 1.0을 유지하며 **PhotoPlan을 사용하는 OrderedFeed만 1.1**이다. 기존 1.0 mock을 실사진 결과로 바꿔 표시하지 않는다.

실행 가능한 예시는 `fixtures/interaction.sample.json`, 검사는 `test/interaction.test.js`다. 이 문서의 API 소비 구현은 #14/#18/#26에서 이어진다. 계약 검증이 통과했다는 사실은 아직 해당 API가 배포됐다는 뜻이 아니다.

## 업로드 — POST /api/analyze

요청: `{schema_version:"1.0",session_id,collection:"selected"|"current",photo_id,input_index,file_ref,media_type,image_base64}`.

- 세션 시작 시 `crypto.randomUUID()`로 사진별 photo_id를 발급한다. 삭제/재정렬/재시도 동안 같은 파일의 ID를 유지하고 교체된 파일은 새 ID다. 파일명·배열 위치로 사진을 식별하지 않는다.
- 한 번에 사진 1장. 올릴 사진 집합은 3~15장. input_index는 현재 선택 배열의 0..N-1이며 결과의 position과 별개다.
- file_ref는 최대 512자의 표시용 원본 파일명이다. 파일 경로로 열거나 URL로 fetch하지 않는다. photo_id는 영문/숫자/underscore/hyphen 1~96자다.
- JPEG/PNG/WebP 정지 사진, **3,000,000 bytes/장**, 긴 변 **8192px**, 전체 **40,000,000 pixels** 이하다. GIF/SVG/애니메이션은 사용자 업로드에서 받지 않는다. 기존 SVG는 합성 fixture 내부 전용이다.
- image_base64는 data URL 접두어·공백 없이 표준 canonical base64다. JSON 전체 요청은 4,100,000 bytes 이하. 클라이언트에서 원본 파일 크기를 먼저 검사하고 서버는 실제 bytes와 헤더의 형식·해상도를 검사한다.
- `sharp@0.35.4` metadata를 재사용한다. 이미 Next가 설치하는 버전을 직접 의존성으로 선언했다. 압축 데이터를 전부 디코딩했다거나 모델이 사진을 읽었다는 의미는 아니다.
- 성공은 `PhotoAnalysis` 한 객체다. 응답 photo_id/input_index/file_ref는 요청과 대조한다. 서버 전용 `GYEOL_ANALYSIS_RECEIPT_SECRET`이 설정되면 `analysis_receipt`가 세션·사진 묶음·사진 ID·바이트 해시를 인증한다. 헤더 `X-Gyeol-Analysis-Source/Reason/Cache`는 #43을 유지한다.
- 클라이언트는 25초에 요청을 취소한다. 모델 내부 제한은 20초다. 자동 재제출은 하지 않고 사용자가 실패한 사진을 다시 시도한다. 서버 안 429/5xx 재시도 1회는 같은 20초 예산이다.

배포 근거: [Vercel Functions 4.5MB 한도](https://vercel.com/docs/functions/limitations), [sharp metadata](https://sharp.pixelplumbing.com/api-input/), 2026-09-17 확인. 플랫폼 자체 413은 JSON이 아닐 수 있어 클라이언트는 status를 먼저 처리한다. 큰 파일을 숨겨서 보내거나 전용 스토리지를 추가하지 않는다.

## 공개 프로필 연결 — POST /api/profile

브라우저는 먼저 `POST /api/profile/session`에 JSON `{}`와 `credentials: same-origin`을 보낸다. 서버는 `{csrfToken,expires_at}`(epoch milliseconds)과 30분 `__Host-gyeol-profile` 쿠키(`HttpOnly; Secure; SameSite=Strict; Path=/`)를 발급한다. 이후 `/api/profile` 요청마다 같은 쿠키와 `X-Gyeol-CSRF: <csrfToken>`을 보낸다. 두 경로 모두 요청 URL과 `Origin`이 서버의 정확한 HTTPS `GYEOL_APP_ORIGIN`과 같고 `Sec-Fetch-Site: same-origin`이어야 한다. 와일드카드·Host 유추·HTTP fallback은 없다. CSRF 토큰은 메모리에 유지하고 401이면 한 번 bootstrap한 뒤 사용자 요청을 재시도한다.

세션은 **익명 브라우저 연속성**이며 로그인·계정 소유권 증명이 아니다. 비브라우저는 Origin을 흉내낼 수 있으므로 전역 durable 예산을 함께 적용한다. 운영 자동화는 기존 `Authorization: Bearer <APIFY_INGEST_ACCESS_KEY>`를 유지하되 `Origin`/`Sec-Fetch-Site` 헤더를 보내지 않는다. 잘못된 bearer를 쿠키로 우회하지 않는다. 운영 키·서명 비밀은 브라우저 번들·JSON·공개 설정에 넣지 않는다.

- 연결: `{schema_version:"1.0",action:"connect",profile_url,confirmLive:true,refresh?:boolean}`. 수집을 시작할 수 있으므로 `confirmLive:true`를 명시해야 한다. `refresh` 기본값은 false이며, 24시간 제한과 reservation은 #143 캐시가 적용한다. 이 요청의 동의는 프로필 소유권 확인이나 공유 PII 선택이 아니다.
- 상태: `{schema_version:"1.0",action:"status",profile_url}`. 저장한 진행 상태를 조회하고 실행 중인 제공자 작업의 결과를 확인한다. 새로운 작업을 시작하지 않는다. 서버의 provider receipt를 요청으로 받지 않는다.
- 성공: `{status,refresh_required,expires_at?,snapshotId?,error_code?}`. pending은 202, 그 외 확인된 상태는 200이다. `expires_at`은 #143 연결 결과와 동일한 epoch milliseconds다. `snapshotId`는 public일 때만 반환되며 큐레이션 요청의 `profile_snapshot_id`로 전달한다. private/unconfirmed/timeout/not_found/expired 등은 서로 구분하고 공개 성공으로 바꾸지 않는다.
- 405 METHOD_NOT_ALLOWED, 401 UNAUTHORIZED, 403 FORBIDDEN, 429 RATE_LIMITED (`Retry-After` seconds), 400 INVALID_REQUEST, 413 REQUEST_TOO_LARGE, 503 PROFILE_CONNECTION_UNAVAILABLE, 502 PROFILE_CONNECTION_FAILED. 본문은 8192 bytes 이하, 응답은 no-store다. 스냅샷·provider receipt·비밀 키·저장소 경로·원본 오류 상세는 응답에 넣지 않는다.

배포 전 서버 설정은 `APIFY_INGEST_ACCESS_KEY`, `PROFILE_CACHE_SECRET`, `BLOB_READ_WRITE_TOKEN`이며, 브라우저 경로는 독립된 32자 이상 `GYEOL_BROWSER_SESSION_SECRET`과 정확한 Preview HTTPS origin인 `GYEOL_APP_ORIGIN`이 추가로 필요하다. 실제 수집에는 `APIFY_TOKEN`과 `APIFY_INGEST_RECEIPT_SECRET`도 필요하다. 누락·저장소 불확실성은 503으로 닫고 제공자를 호출하지 않는다.

`lib/profile-request-limit.js`는 Blob의 조건부 생성/ETag 갱신으로 UTC 고정 1시간 창마다 bootstrap 120회, connect 20회, status 600회의 전역 상한을 적용한다. connect/status는 추가로 세션 해시 256개 버킷마다 각각 3회/60회 상한을 적용한다. 버킷 충돌은 더 엄격하게 제한할 수 있다. 세션 변경·IP 위조도 전역 상한을 늘리지 못한다. 부분 소모는 환불하지 않으며 CAS 재시도는 최대 8회다. 최대 515개 키를 `profile-request-limit/v1/`에서 재사용하고 새 창의 첫 요청이 CAS로 이전 count를 교체한다. 프로필 캐시 정리와 prefix가 분리되며 세션별 무한 객체나 PII를 저장하지 않는다. 고정 창 경계의 연속 요청은 두 창 예산을 소비할 수 있다.

Preview 환경·Blob 원자성·실제 제공자·브라우저 통합 검증은 별도 게이트다. 배포·유료 호출은 실행하지 않았다.

## 큐레이션 — POST /api/feed

[ADR-0008](../docs/adr/0008-public-profile-curation-and-sharing.md)의 공개 프로필 필수 계약이다. 요청은 `{schema_version:"1.0",session_id,profile_url,profile_snapshot_id,photos:PhotoAnalysis[3..15],prompt?:string}`다.

- `profile_url`은 공개 Instagram 계정 URL, `profile_snapshot_id`는 #143 연결 API가 발급한 불투명 서명 참조다. URL 자체는 공개 여부나 소유권의 증명이 아니다. 서버 기본 경로는 `lib/profile-cache.js`의 `resolveSnapshot({url,snapshotId})`로 신선한 공개 스냅샷을 읽는다. `BLOB_READ_WRITE_TOKEN`과 `PROFILE_CACHE_SECRET`이 필요하며 캐시 읽기는 Apify 토큰을 요구하지 않는다. 저장소의 `expires_at`은 epoch milliseconds이고 HTTP 응답에서는 ISO 문자열이다. 이 읽기는 수집을 시작하거나 새로고침하지 않는다.
- 미연결·비공개·미확인·서명 위조·계정 불일치는 진행하지 못한다. `snapshot`, `profile`, `identity` 같은 추가 필드는 거절한다. 요청의 스냅샷 객체를 프로필 근거로 쓰지 않는다.
- 사진은 3~15장이고 ID는 누락·중복 없이 유지된다. `input_index`는 선택 배열의 0..N-1이다. 본문 최대 250,000 bytes. `duplicate_of`는 같은 세션·묶음·바이트 해시를 가진 서명된 분석 영수증으로만 복원한다. 나머지 분석 필드의 형태·참조 정합성을 검사하며 진위를 인증하지는 않는다.
- `prompt`는 생략하거나 빈 문자열로 보낼 수 있고 최대 2000자다. 빈 입력은 연결 스냅샷의 수집 가능한 언어 근거를 기존 reference 추출기로 읽는다. 작성한 입력은 기존 freetext 추출기로 순서·캡션 방향에 반영하며, 연결 프로필 관측과 사용자의 방향을 별도 출처로 유지한다. 지원하지 않는 자유 문장의 의미를 이해했다고 주장하지 않는다.

성공은 `{feed:OrderedFeed,context:{photos,current,target,current_photos:[]},curation}`다. `feed`와 `context`만 다음 생성 요청으로 전달한다. `curation`을 `/api/generate` 요청에 그대로 펼치지 않는다.

```json
{
  "schema_version": "1.0",
  "profile_snapshot_id": "signed-reference-from-profile-connect",
  "profile": {
    "snapshot_id": "apify:run:dataset",
    "source_url": "https://www.instagram.com/account/",
    "collected_at": "2026-09-18T09:00:00.000Z",
    "expires_at": "2026-09-19T09:00:00.000Z",
    "ownership_verified": false,
    "evidence_refs": {}
  },
  "prompt": {"text": null, "evidence": []},
  "slots": [{
    "photo_id": "ph_01", "position": 1, "included": true,
    "exclusion_candidate": {"recommended": false, "reason": null, "evidence": []}
  }]
}
```

위 예시는 `curation` 객체의 필드 설명이며 실제 성공에는 모든 입력 사진이 들어간다. 모든 `curation.slots[].included`는 최초 제안에서 `true`다. `exclusion_candidate`는 `feed.slots[].omit_suggestion`의 근거 있는 제안이며, `recommended:true`여도 사진을 제외하지 않는다. 제외·복원·재정렬·캡션 편집 및 공유 확정은 후속 프리뷰 계약이다. 캡션 초안은 기존 `/api/generate`에서 생성한다.

작성한 프롬프트는 `curation.prompt.text`와 `context.target.raw_freetext`에 trim한 원문을 남기며 `prompt.evidence`는 `[{kind:"user_text",ref:context.target.profile_id,note:"사용자가 입력한 큐레이션 방향"}]`다. 프로필 provenance에는 서버 저장소에서 확인한 수집 시각·출처와 근거 URL만 넣는다. 공개 프로필 연결은 계정 소유권 인증이 아니다. 이 작성 중 응답은 공유 manifest가 아니며 프로필 PII 공유는 별도 명시적 선택이 필요하다.

오류: 형식·사진 수·추가 필드는 `400 INVALID_REQUEST`, 확인할 수 없는 연결은 `422 PROFILE_NOT_VERIFIED`, 명확히 확인된 만료는 `422 PROFILE_SNAPSHOT_EXPIRED`, 저장소 장애·설정 누락은 `503 PROFILE_RESOLVER_UNAVAILABLE`다. 응답은 `no-store`다.

### 하위 모듈 호환성

기존 `buildFeed`, `handleLegacyFeed`, `validateOrderRequest` 및 `OrderRequest`는 3~20장과 선택 `identity` 경로의 회귀·로컬 사용을 위해 유지한다. 프로덕션 POST는 이 경로를 호출하지 않는다. `GET /api/feed?mock=1`은 15장 합성 샘플 전용이며 사용자 결과나 공개 프로필 연결 증거로 사용하지 않는다.

실행 가능한 결정적 경계 fixture는 [curation.sample.json](../fixtures/curation.sample.json), 검사는 [curation.test.js](../test/curation.test.js)다. 제공자·저장소·실모델·사람 검증 완료의 증거는 아니다.

## 출력 — POST /api/generate

요청은 위 feed/context를 보존한 `{schema_version:"1.0",mode:"all"|"slot",feed,context,photo_id?}`.

- all: photo_id를 보내지 않는다. 성공 `{output:F3Export}`. 타이틀 한 줄, 슬롯 N개가 원본 사진과 원본 position을 그대로 사용한다.
- slot: feed에 있는 photo_id 한 개를 보낸다. 성공 `{slot:CaptionSlot}`. 요청한 ID/원래 position만 반환한다. 전체 output을 새로 생성해 다른 편집을 덮어쓰지 않는다.
- all 성공에는 `omission:{omitted,total,note_key,note,evidence}`가 함께 온다. 이 값은 **서버가 그 응답의 slots를 센 것**이며 비움 개수를 바꾸지 않는다. `note_key`는 `omission.none`(omitted=0) / `omission.some`이고, 개수·note_key가 실제 slots와 어긋나거나 `gyeol.omit.disclosure` rule 근거가 없으면 응답을 거부한다. 비움 0개도 판단의 결과이므로 미완성으로 표시하지 않는다. `caption_coverage`가 `all`이라 비움이 0개인 회차에도 같은 규칙으로 센다 — 고지는 요청 의도가 아니라 실제 결과를 말한다. slot 성공에는 붙이지 않는다 — 한 슬롯으로 피드 전체의 비움을 관측할 수 없다(#80).
- 서버 결과에는 seed/omitted만 있다. user 상태는 클라이언트 편집에서만 만든다. 충분한 사실이 없으면 억지 캡션 대신 `NO_FACTS` 실패 또는 근거 있는 omitted다.
- 오류·timeout은 `{error:{code,message,retryable:boolean}}`. 성공을 빈 배열/빈 output으로 대체하지 않는다.
- `/api/title`, `/api/caption`은 별도 API로 만들지 않는다. 출력 프롬프트만 역할별 파일로 유지한다.
- 키가 없으면 `GENERATION_UNAVAILABLE`(503)다. 고정 샘플은 샘플임을 표시한 별도 경로다. 유료 모델 검증과 fake-provider 검증을 구분한다.

## 사용자 편집과 내보내기

- 서버 원본 feed와 output은 보존하고 draft를 별도 복사한다. 원본 근거는 photo_id로 찾아 연결한다. 재정렬 뒤 원래 자리에서 받은 근거를 새 자리의 AI 판단이라고 표시하지 않는다.
- `validateExport`: **서버 원본 생성 결과**의 position→photo_id 대응을 고정한다.
- `validateEditedExport`: **사용자 draft**의 동일 photo_id 집합·1..N position을 확인하되 재정렬을 허용한다. 외부/중복/누락 ID는 거부한다.
- F3Export는 `{title,slots:[{position,photo_id,caption_state,text,omit_reason,evidence}]}`.
- seed: 두 줄 쓸 거리 / omit_reason=null. omitted: text=null / nonempty omit_reason / evidence 유지. user: nonempty text / omit_reason=null / user_text evidence 포함.
- 전체 omitted도 유효하다. 내보내기는 JSON과 사람이 읽을 텍스트를 제공한다. 사용자 직접 비움도 근거를 보존한다. 저장소·DB·인스타 자동 게시를 추가하지 않는다.
- 비동기 응답은 세션/요청 식별자를 대조해 늦은 응답이 새 세션·사용자 수정을 덮지 못하게 한다(#25).

## 오류와 복구

| HTTP | code 예시 | 재시도 |
|---|---|---|
| 400 | INVALID_REQUEST | 입력 수정 |
| 413 | IMAGE_TOO_LARGE / REQUEST_TOO_LARGE | 작은 파일 선택 |
| 415 | UNSUPPORTED_MEDIA_TYPE / MODEL_MEDIA_UNSUPPORTED | 지원 형식 선택 |
| 422 | INVALID_IMAGE / IMAGE_DIMENSIONS / REFERENCE_NOT_PREPARED / NO_FACTS | 파일·아이덴티티 수정 |
| 502 | MODEL_HTTP / MODEL_JSON / MODEL_CONTRACT / MODEL_FAILURE / MODEL_NETWORK | 응답 retryable 값에 따름 |
| 503 | GENERATION_UNAVAILABLE / MODEL_UNAVAILABLE | 사용 가능 상태가 된 뒤 |
| 504 | MODEL_TIMEOUT | 사용자 재시도 |
| 500 | INTERNAL_ERROR | 사용자 재시도, 상세 내부 오류는 노출하지 않음 |

Abort/초기화는 클라이언트 취소이며 서버 성공/실패 완료를 기다려 화면을 잠그지 않는다. raw provider 본문·키·헤더는 사용자 오류나 저장 증거에 넣지 않는다.

## G4 → generate → G5 재현 fixture

`fixtures/curation-handoff.sample.json`과 `test/curation-handoff.test.js`가 3/15장 × 빈/작성 프롬프트 네 경우를 고정 fake-provider로 검증한다. G5는 `{feed,context,curation,output,omission}`을 소비하며 생성 요청에는 `{schema_version:"1.0",mode:"all",feed,context}`만 보낸다. `curation`의 공개 프로필 출처·시각·소유권 미확인과 prompt 근거는 모델 생성 전후에 보존하고, 모든 슬롯은 `photo_id`로 결합한다. omitted는 캡션 상태이며 사진 제외를 뜻하지 않는다. 전체 캡션 요청도 유효한 seed/omitted 응답을 강제 변환하지 않는다. fixture는 합성 관측 사실을 사용한 회귀 계약이며 사진 분석·AI 품질·실제 제공자 검증 근거가 아니다.
