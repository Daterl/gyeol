# 화면·서버 연결 계약 1.0

결정자 diego.yoon / 협업 enzo.cho. #24, ADR-0005 위임에 따른 기술 계약. 기존 TargetProfile/CurrentProfile/PhotoAnalysis 1.0을 유지하며 **PhotoPlan을 사용하는 OrderedFeed만 1.1**이다. 기존 1.0 mock을 실사진 결과로 바꿔 표시하지 않는다.

실행 가능한 예시는 `fixtures/interaction.sample.json`, 검사는 `test/interaction.test.js`다. 이 문서의 API 소비 구현은 #14/#18/#26에서 이어진다. 계약 검증이 통과했다는 사실은 아직 해당 API가 배포됐다는 뜻이 아니다.

## 업로드 — POST /api/analyze

요청: `{schema_version:"1.0",photo_id,input_index,file_ref,media_type,image_base64}`.

- 세션 시작 시 `crypto.randomUUID()`로 사진별 photo_id를 발급한다. 삭제/재정렬/재시도 동안 같은 파일의 ID를 유지하고 교체된 파일은 새 ID다. 파일명·배열 위치로 사진을 식별하지 않는다.
- 한 번에 사진 1장. 올릴 사진 집합은 3~20장. input_index는 현재 선택 배열의 0..N-1이며 결과의 position과 별개다.
- file_ref는 최대 512자의 표시용 원본 파일명이다. 파일 경로로 열거나 URL로 fetch하지 않는다. photo_id는 영문/숫자/underscore/hyphen 1~96자다.
- JPEG/PNG/WebP 정지 사진, **3,000,000 bytes/장**, 긴 변 **8192px**, 전체 **40,000,000 pixels** 이하다. GIF/SVG/애니메이션은 사용자 업로드에서 받지 않는다. 기존 SVG는 합성 fixture 내부 전용이다.
- image_base64는 data URL 접두어·공백 없이 표준 canonical base64다. JSON 전체 요청은 4,100,000 bytes 이하. 클라이언트에서 원본 파일 크기를 먼저 검사하고 서버는 실제 bytes와 헤더의 형식·해상도를 검사한다.
- `sharp@0.35.4` metadata를 재사용한다. 이미 Next가 설치하는 버전을 직접 의존성으로 선언했다. 압축 데이터를 전부 디코딩했다거나 모델이 사진을 읽었다는 의미는 아니다.
- 성공은 `PhotoAnalysis` 한 객체다. 응답 photo_id/input_index/file_ref는 요청과 대조한다. 헤더 `X-Gyeol-Analysis-Source/Reason/Cache`는 #43을 유지한다.
- 클라이언트는 25초에 요청을 취소한다. 모델 내부 제한은 20초다. 자동 재제출은 하지 않고 사용자가 실패한 사진을 다시 시도한다. 서버 안 429/5xx 재시도 1회는 같은 20초 예산이다.

배포 근거: [Vercel Functions 4.5MB 한도](https://vercel.com/docs/functions/limitations), [sharp metadata](https://sharp.pixelplumbing.com/api-input/), 2026-09-17 확인. 플랫폼 자체 413은 JSON이 아닐 수 있어 클라이언트는 status를 먼저 처리한다. 큰 파일을 숨겨서 보내거나 전용 스토리지를 추가하지 않는다.

## 순서 — POST /api/feed

`{schema_version:"1.0",session_id,photos:PhotoAnalysis[3..20],identity:{target,current}}`

- target: `{kind:"none"}` / `{kind:"text",text:string(1..2000)}` / `{kind:"reference",url}`.
- current: `{kind:"none"}` / `{kind:"reference",url}` / `{kind:"posts",photos:PhotoAnalysis[1..20],captions?:string[]}`.
- captions가 있으면 기존 사진과 같은 순서·같은 길이이고, 캡션이 원래 없었던 게시물은 `""`이다. captions 자체가 없으면 언어를 관측하지 않은 것이다. 문자열은 각각 5000자 이하.
- 기존 게시물 사진은 올릴 사진과 별도 ID다. reference는 HTTPS Instagram 계정 URL이며 준비된 registry에서만 정확히 조회한다. 외부 URL fetch/라이브 스크래핑은 하지 않는다. 준비되지 않은 계정은 `REFERENCE_NOT_PREPARED`로 실패하고 텍스트/사진만 경로를 안내한다. 다른 계정의 스냅샷으로 바꾸지 않는다.
- target이 none이면 기존 `planFromPhotos`의 PhotoPlan을 쓴다. target_profile_id는 null, photo_plan_id는 plan_id이며 OrderedFeed는 1.1이다. language=null, corrected=false, deltas=[]다. 취향이나 문체를 알아냈다고 표시하지 않는다.
- current가 none이면 기존 `present:false/source:none/current_profile_id:null/disclosure:target_only`다. 현재 게시물만 제공돼도 사진 계획에 가짜 지향을 추가하지 않는다.

성공: `{feed:OrderedFeed,context:{photos,current:CurrentProfile,target:TargetProfile|PhotoPlan,current_photos:PhotoAnalysis[]}}`.

context는 다음 생성 단계의 검증 재료다. 현재 출처가 photo_upload일 때만 current_photos가 있고, 그 근거는 실제 기존 사진 ID로 대조한다. 본문 최대 250,000 bytes. context의 검증은 형태·참조 정합성 검증이며 클라이언트가 보낸 관측의 진위를 암호학적으로 인증하는 기능은 아니다.

기존 `GET /api/feed?mock=1`은 15장 합성 샘플을 그대로 반환한다. 샘플 모드에서는 **샘플 사진만** ph_01..ph_15에 연결한다. 사용자 사진 3~20장에 샘플 ID/결과를 덮어 붙이지 않는다.

## 출력 — POST /api/generate

요청은 위 feed/context를 보존한 `{schema_version:"1.0",mode:"all"|"slot",feed,context,photo_id?}`.

- all: photo_id를 보내지 않는다. 성공 `{output:F3Export}`. 타이틀 한 줄, 슬롯 N개가 원본 사진과 원본 position을 그대로 사용한다.
- slot: feed에 있는 photo_id 한 개를 보낸다. 성공 `{slot:CaptionSlot}`. 요청한 ID/원래 position만 반환한다. 전체 output을 새로 생성해 다른 편집을 덮어쓰지 않는다.
- 서버 결과에는 filled/omitted만 있다. user 상태는 클라이언트 편집에서만 만든다. 충분한 사실이 없으면 억지 캡션 대신 `NO_FACTS` 실패 또는 근거 있는 omitted다.
- 오류·timeout은 `{error:{code,message,retryable:boolean}}`. 성공을 빈 배열/빈 output으로 대체하지 않는다.
- `/api/title`, `/api/caption`은 별도 API로 만들지 않는다. 출력 프롬프트만 역할별 파일로 유지한다.
- 키가 없으면 `GENERATION_UNAVAILABLE`(503)다. 고정 샘플은 샘플임을 표시한 별도 경로다. 유료 모델 검증과 fake-provider 검증을 구분한다.

## 사용자 편집과 내보내기

- 서버 원본 feed와 output은 보존하고 draft를 별도 복사한다. 원본 근거는 photo_id로 찾아 연결한다. 재정렬 뒤 원래 자리에서 받은 근거를 새 자리의 AI 판단이라고 표시하지 않는다.
- `validateExport`: **서버 원본 생성 결과**의 position→photo_id 대응을 고정한다.
- `validateEditedExport`: **사용자 draft**의 동일 photo_id 집합·1..N position을 확인하되 재정렬을 허용한다. 외부/중복/누락 ID는 거부한다.
- F3Export는 `{title,slots:[{position,photo_id,caption_state,text,omit_reason,evidence}]}`.
- filled: nonempty text / omit_reason=null. omitted: text=null / nonempty omit_reason / evidence 유지. user: nonempty text / omit_reason=null / user_text evidence 포함.
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
