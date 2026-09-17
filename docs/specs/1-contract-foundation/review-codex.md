# PR #21 독립 Codex 실행 리뷰

**Merge 판정: 조건부.** 아래 M1의 사실 복사 검증 빈틈을 해소하거나 계약 책임자가 명시적으로 수용하고, 양쪽 사람의 스키마 합의 및 **최종 동일 diff의 서로 다른 두 모델 리뷰**를 기록한 뒤 상대 사람이 merge할 수 있다. 현재는 해당 게이트가 남아 있으므로 Draft를 유지한다.

## 기준과 리뷰 신원

- 대상: https://github.com/Daterl/gyeol/pull/21
- 실행: 2026-09-17 15:11~15:17 KST, macOS, Node `v22.22.3`.
- HEAD: `7d16ff870f1304de8ec86a5de4ac1b7fa8103a4c`; base: `92cbb4d35e5a5d34185d616bafa290b490b87de8`.
- `gh pr diff 21 --repo Daterl/gyeol` 전체 diff를 받아 코드·문서·샘플·검증 산출물을 검토했다. 59파일, +5207/-52, diff 5,747줄; SHA256 `c2ab80380b56abc6d9ad96fedbae5d33e9395a9baf319ce92caddf58d3dbde68`.
- 리뷰 모델: **`gpt-6-astra`**. `orca orchestration worker-show --dispatch ctx_752331e08f57 --json`의 `projection.provider.model`로 확인했다.
- **이 세션은 기존 review.md에 기록된 Codex와 같은 모델이다.** 독립 실행 리뷰는 맞지만 “서로 다른 두 모델” 중 두 번째 모델로 계산할 수 없다. 기존 리뷰의 기준도 `7ed8d4c`여서 최종 동일 diff 조건까지 자동 충족하지 않는다. 이 사실을 코디네이터에 전달했다.
- 제품 코드·fixture·Git 상태·원격 PR을 수정하지 않았다. 기존 미추적 `docs/issue-review.md`를 보존했고 이 보고서만 추가했다. 변형 실험은 메모리 또는 `/tmp` 복사본에서 수행했다.
- CodeRabbit 지침을 읽고 설치 `0.7.6` 및 인증 상태만 확인했다. 이번 산출물은 위 Codex 모델의 직접 리뷰이며 기존 CodeRabbit 0건 결과를 독립 모델 증거로 재사용하지 않았다.

## PR 본문 주장 대비 재현

| 본문 주장 | 실제 실행 결과 | 판정 |
|---|---|---|
| Node 22, 테스트 60/60 | Node 22.22.3, tests 60 / pass 60 / fail 0 | 재현 |
| 정상 불변식 10건 | quiet/detail 각각 E1/E2/E3/E6/E8 모두 PASS | 재현 |
| broken 예상 실패 10건 | 10건 모두 EXPECTED FAIL; 추가로 각 변형이 지정 불변식 하나만 실패함을 확인 | 재현 |
| 문법·JSON·스키마 예시 일치 | JS/JSON 25파일, 4개 예시 deep equality, 의존성 0 | 재현; 별도 lint/typecheck 아님 |
| 실제 HTTP mock 200 / live 501 | 실제 Node 서버 + HTTP 요청에서 200 / LIVE_NOT_IMPLEMENTED 501 | 재현 |
| 외부 호출 없는 mock | outbound Node API를 차단한 서버에서 4종 HTTP 응답 성공, 종료 시 attempts 0 | 재현; OS 방화벽 격리 실험은 아님 |
| 스키마 4종·샘플·응답 일치 | HTTP JSON == fixture == 문서 JSON, 각 runtime validator 통과 | 재현 |
| 사진 ID·슬롯·근거·타이틀·고지·캡션 연결 검사 | 기존 60건과 독립 변형 검사 통과 | 재현; M1 및 L1의 검증 범위 한계 별도 |
| 두 사람 합의 pending | 본문/문서 모두 pending이며 이 리뷰는 사람 합의를 대신하지 않음 | pending 유지 |
| 최종 동일 diff의 서로 다른 두 모델 리뷰 pending | 현재 리뷰도 기존과 동일한 gpt-6-astra | **미충족** |
| 실제 AI·UI·배포 pending | 실행하지 않음; foundation 범위 밖 | pending 유지, 기능 추가 요구 아님 |

## 심각도별 지적

### BLOCKER — merge 게이트, 코드 장애 아님

**B1. 이번 dispatch로 서로 다른 두 모델 게이트가 닫히지 않는다.** 현재 런타임과 `docs/specs/1-contract-foundation/review.md:5` 모두 `gpt-6-astra`다. `CLAUDE.md` 1-1/3/5-3 및 `docs/automation-plan.md`는 L의 최종 동일 diff를 서로 다른 모델 둘이 검토하고 양쪽 사람이 계약에 합의해야 Ready로 올릴 수 있다고 규정한다. 테스트 성공이나 독립 세션이라는 사실로 이 조건을 대체할 수 없다. 코디네이터가 실제 다른 모델의 리뷰를 동일 HEAD에 확보하고 사람 합의 증거를 남겨야 한다.

### HIGH

확인된 HIGH 코드 결함 없음. 테스트 수 미재현, mock의 숨은 live 호출, live의 조용한 mock fallback, 커밋된 실제 시크릿은 발견하지 못했다.

### MEDIUM

**M1. 사진 분석에서 복사해야 하는 사실의 변조를 전체 eval도 탐지하지 못한다.**

- 위치: `lib/contracts.js:132`, `eval/run.js:11` / `eval/run.js:12`; 계약 근거: `schemas/ordered_feed.md:35`의 “사진 목록에서 caption_inputs.describable_facts를 복사한다”.
- 현재 15슬롯의 실제 HTTP 값은 해당 PhotoAnalysis와 모두 일치한다. 현재 샘플이 이미 잘못됐다는 지적은 아니다.
- 그러나 `ordered_quiet.json` 첫 슬롯의 `caption_inputs.describable_facts`만 `['Invented fact absent from photo analysis']`로 바꿔도 `validateFeed`, `validateExport`, E1/E2/E3/E6/E8이 모두 통과한다. **분리된 `/tmp` 복사본에서 실제 `npm run eval`도 exit 0, 정상 10건 PASS / broken 10건 EXPECTED FAIL**이었다.
- 원인: validator는 해당 값을 문자열 배열로만 검사하고, eval은 사진 분석 내용 자체를 읽거나 photo_id별 사실을 대조하지 않는다. 따라서 후속 F3가 신뢰할 근거 재료가 바뀌어도 이 검증 기반은 성공을 보고한다.
- 최소 조치: 이미 존재하는 사진 분석 입력을 photo_id로 연결해 golden/mock의 `describable_facts` 복사를 비교하고, 다른 사진의 사실로 교체한 negative case를 추가한다. 의미 분석·AI 호출·E4 한국어 고유명사 추출 구현을 요구하는 것이 아니다. 검증을 의도적으로 하지 않는다면 이 복사 규칙이 자동 검증 범위 밖임을 계약/보고서에 명시하고 사람이 수용 여부를 기록한다.
- 확신: 높음. 현재 샘플의 일치와 변형의 통과를 각각 실행으로 확인했다.

### LOW

**L1. E1 단독 결과는 프로필 Claim의 형태 삭제를 탐지하지 못한다.** `lib/contracts.js:32` / `eval/invariants.js:6`: `targetProfile.visual.tone_words={}`로 바꾸면 `evaluate(...).E1`은 `{pass:true}`다. `value` 또는 `confidence` 키가 있는 객체만 Claim으로 탐색하고, 강제 Claim 검사는 슬롯 rationale에만 있기 때문이다. 다만 `validateProfile`은 같은 입력을 `missing value`로 거부하고 `eval/run.js:12`가 이를 먼저 호출하므로 **현재 npm eval 전체의 우회는 아니다**. E1을 단독 계약 판정으로 쓰지 않도록 호출 전제 또는 검증 순서를 문서화하면 된다.

**L2. 존재하지 않는 달력 날짜도 ISO timestamp로 통과한다.** `lib/contracts.js:14`: `generated_at='2026-02-30T00:00:00.000Z'`가 `validateFeed`를 통과한다. 현재 구현은 `Date.parse`의 유한값 여부만 검사하므로 날짜 정규화를 유효한 입력으로 받아들인다. 계약의 ISO timestamp를 실제 날짜까지 엄격히 보장하려면 달력 유효성 검사를 추가하거나 허용 범위를 명시한다. 현재 mock timestamp는 유효하므로 즉시 실행 장애는 아니다. timezone 없는 timestamp도 통과했지만 문서가 timezone 필수라고 명시하지 않아 이를 별도 결함으로 올리지 않았다.

## 계약 필드 대조

HTTP 네 응답 전체를 문서 JSON 및 fixture와 `assert.deepEqual`로 대조했고, 문서의 표/서술을 구현과 별도로 읽었다.

| 계약 | 확인한 필드·관계 | 결과/한계 |
|---|---|---|
| TargetProfile | schema_version, profile_id, axis/present, source, account_scope, sample_size, completeness 3축, visual Claim, language Claim/banned_words, sequence/carousel_count, raw_freetext, created_at | freetext·ig_reference 2건 모두 일치. target absent/photo_upload 거부. language=null ↔ completeness.language=0 강제 |
| CurrentProfile | 같은 공통 필드 + present/absent 분기 | present 1건/absent 1건 일치. absent는 null ID, none, n/a, 0표본, completeness 전부 0, 빈 visual/sequence, null language/text. 실제 current 입력 생략도 거부 |
| PhotoAnalysis | schema_version, photo_id/file_ref/input_index, color 범위·hex, composition/scale, subjects, has_face/text_in_image, describable_facts/quality_flags, analysis_source/model/analyzed_at | 15건 일치. 색/enum/타입 검증 정상. 합성 SVG 자료임을 명시 |
| OrderedFeed | schema_version, feed_id/session_id, applied_profile의 ID·고지·correction·delta·3축, 슬롯의 position/photo_id/narrative_role/rationale/caption_inputs, invariants, generated_at | 15슬롯, 실제 입력 ID 보존, position 1..15, target_only. 현재 facts 복사는 일치하나 향후 drift 탐지는 M1 |
| F3 export 부속 계약 | title, 슬롯 position/photo_id, caption_state/text/omit_reason/evidence 및 user_text | golden 2벌 full validator 통과. 위치 기준 identity를 비교하며 배열 저장 순서를 표시 순서로 오해하지 않음 |

`applied_profile.target_profile_id`는 문서상 nonempty 조건이고, delta 수식의 실제 계산 정확성은 이 PR의 실행 계약에 정의되지 않았다. 이 둘을 임의로 새로운 merge 차단 요구로 추가하지 않았다. 실제 근거 내용의 진위나 보정 품질 역시 구조 검사 성공으로 인증하지 않는다.

## 불변식의 실효성

- E1은 빈 evidence를 실제 거부한다. mandatory rationale 전체를 `{}`로 바꿔도 거부한다. 프로필의 형태를 전부 지우는 경우는 L1의 단독 평가 한계가 있다.
- E2는 출력 flags를 기대값으로 쓰지 않고 독립 input manifest의 ID와 길이·집합을 대조한다. 같은 개수의 외부 ID 교체도 실패한다.
- E3는 실제 position의 정수·범위·집합 크기를 검사한다. `[1..N]` 배열을 자기 자신과 비교하는 검사가 아니다.
- E6는 별도 export의 title 타입, 비어 있지 않음, 한 줄, 허용 최상위 키를 검사한다. feed에 title이 없다는 이유로 실패시키지 않는다.
- E8은 실제 CurrentProfile과 ID를 대조하고 absent일 때 target_only/false/빈 delta를 강제한다. 출력이 꾸며낸 current를 입력으로 신뢰하지 않는다.
- 저장된 broken 5종은 quiet/detail 양쪽에서 **각각 해당 불변식 하나만 실패**했다. 단순 “무언가 하나 실패”를 성공으로 세는 사례는 없었다.
- `docs/automation-plan.md`는 D6에서 position으로 정렬한 photo_id 배열을 비교하라고 명시한다. 현재 수동 두 순서가 다르다는 사실을 AI 개인화 품질로 계산하지 않는다. 두 export의 캡션 문구가 같아도 foundation은 D6 통과를 주장하지 않으므로 범위 밖 기능 요구로 지적하지 않는다.

## HTTP·입력 오류·네트워크

실제 서버를 `PORT=43218 node --import /tmp/gyeol-deny-network.mjs scripts/server.js`로 실행했다. preload는 fetch, HTTP/HTTPS, socket connect, TLS, UDP, DNS API를 실패 함수로 교체하고 ESM export도 동기화했다. 서버 bind에 필요한 `127.0.0.1` lookup만 네트워크 없이 직접 반환했다. 요청 클라이언트는 별도 Python/curl 프로세스였다.

첫 preload 시도에서는 서버 bind의 로컬 주소 lookup까지 막아 서버 시작에 실패했다. 외부 호출을 발견한 것이 아니며, loopback lookup 처리만 허용한 뒤 다시 실행했다. 성공 실험의 종료 로그는 `outbound attempts: 0`이었다. 이 검사는 Node API 차단이며 OS 전체 네트워크 namespace/방화벽 격리나 패킷 캡처는 아니다.

- GET mock 4종 200; live GET 501; mock=0 400.
- POST로 사진 0장·21장·깨진 JSON을 실제 전송하면 모두 405 METHOD_NOT_ALLOWED. 이 API는 GET fixture 조회 전용이므로 업로드 validation 400을 기대하면 안 된다.
- 깨진 JSON을 GET body로 보내면 body를 읽지 않고 고정 fixture 200. 이는 문서화된 GET fixture API 범위에서 일관된 동작이다.
- 실제 `validateInputIds` 호출에서는 0장·21장 모두 ContractError로 거부했다.
- 원본 파일을 건드리지 않고 복사본 fixture를 0장, 21장, 깨진 JSON으로 각각 바꾼 별도 서버에서는 모두 500 INVALID_FIXTURE를 반환했고 예외/파일 내용은 노출하지 않았다.
- 두 검증 서버 모두 종료했다. live AI·배포·UI는 실행하지 않았다.

## CLAUDE.md 변경 검토

76추가/52삭제는 단순 문장 정리가 아니라 실행·승인 정책 변경이다. 디렉터리 소유를 사람의 리뷰 책임과 AI의 배정된 실행 범위로 구분하고, 출력 서버 예외를 추가했다. Draft 조기 생성/Refs 사용을 허용하되 Ready·계약 합의·사람 merge 게이트는 유지한다. 4시간 무응답 셀프 merge 및 마감 직전 PR/테스트 생략을 제거하고, 배포 실패 시 즉시 revert 대신 사람 책임자의 판단을 남겼다. 지적 0건 리뷰를 유효하게 인정하되 모델 ID·동일 diff·실제 실행 증거를 요구한다. 초기 eval 예외와 합성 골든의 한계, 확인한 모델 ID 사용, Lore commit을 추가했다.

변경된 단계 표·크기 표·분기 규칙·위기 표와 `docs/automation-plan.md`의 사람 merge 규칙 사이에 실행을 뒤집는 모순은 발견하지 못했다. “별도 서버 프로세스 없음”/SDK 하나라는 기술 스택 설명은 배포 목표에 대한 기존 설명이고, 새 scripts/server.js는 로컬 smoke용이며 foundation은 의존성 0이라고 별도 명시한다. 이를 배포 서버 추가 요구로 해석하지 않았다. 정책 변경 자체에 대한 양쪽 사람의 동의가 완료됐다고 이 리뷰가 인증하지 않는다.

## 보안

전체 PR diff의 토큰 패턴(OpenAI형, GitHub형, AWS형), private-key header 및 이메일 패턴을 확인했다. 토큰/키 패턴은 0건이고 이메일 일치는 삭제된 `noreply@anthropic.com` 예시 1건이었다. 합성 데이터 이외의 사용자 사진·계정 데이터·개인정보를 diff에서 발견하지 못했다. 정규식 검사는 모든 비밀을 탐지한다는 보장이 아니다.

`git check-ignore .env .env.local .env.production config/credentials-test.json`에서 네 경로가 모두 ignore됨을 확인했다. `git ls-files '.env*' '*.pem' '*.key'` 결과는 비어 있었다. `.env.*`를 차단하고 `.env.example`만 예외다. API의 resource는 4개 allowlist로 제한되어 사용자 경로로 파일을 읽지 않는다. 외부 secret-scan 서비스에는 diff를 보내지 않았다.

## 실행 명령과 실제 출력

```sh
gh pr diff 21 --repo Daterl/gyeol > /tmp/gyeol-pr21.diff
gh pr view 21 --repo Daterl/gyeol --json body,headRefOid,baseRefOid
node --version
npm test
npm run eval
node scripts/check.js
```

`npm test` 실제 마지막 출력(전체 60건 실행, 요약 부분만 인용):

```text
1..60
# tests 60
# suites 0
# pass 60
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 386.616167
```

`npm run eval` 실제 출력:

```text

> gyeol@0.1.0 eval
> node eval/run.js

Synthetic manual bootstrap only; no AI quality or human agreement claim.
┌─────────┬─────────┬───────────┬────────┬────────┐
│ (index) │ case    │ invariant │ result │ reason │
├─────────┼─────────┼───────────┼────────┼────────┤
│ 0       │ 'quiet' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'quiet' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'quiet' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'quiet' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'quiet' │ 'E8'      │ 'PASS' │ ''     │
└─────────┴─────────┴───────────┴────────┴────────┘
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
┌─────────┬──────────┬───────────┬────────┬────────┐
│ (index) │ case     │ invariant │ result │ reason │
├─────────┼──────────┼───────────┼────────┼────────┤
│ 0       │ 'detail' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'detail' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'detail' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'detail' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'detail' │ 'E8'      │ 'PASS' │ ''     │
└─────────┴──────────┴───────────┴────────┴────────┘
detail broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
detail broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
detail broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
detail broken E6: EXPECTED FAIL — E6.title: expected nonempty string
detail broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
E4/E5/E7: manual spot-check only; real demo review pending.
```

`node scripts/check.js` 실제 출력:

```text
PASS: 25 JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.
```

HTTP 클라이언트의 실제 결과(urllib.request로 메서드/본문을 지정, live는 curl -i로도 확인):

```text
GET http://127.0.0.1:43218/api/feed?mock=1&resource=ordered_feed: 200; bytes=6991
GET http://127.0.0.1:43218/api/feed?mock=1&resource=target_profile: 200; bytes=2026
GET http://127.0.0.1:43218/api/feed?mock=1&resource=current_profile: 200; bytes=1277
GET http://127.0.0.1:43218/api/feed?mock=1&resource=photo_analysis: 200; bytes=7698
GET /api/feed body=None: 501; {"error":{"code":"LIVE_NOT_IMPLEMENTED","message":"Live generation is not implemented; use ?mock=1 for synthetic fixtures."}}
GET /api/feed?mock=0 body=None: 400; {"error":{"code":"INVALID_MOCK"}}
POST /api/feed?mock=1 body={"photos":[]}: 405; {"error":{"code":"METHOD_NOT_ALLOWED"}}
POST /api/feed?mock=1 body={"photos": ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12", "p13", "p14", "p15", "p16", "p17", "p18", "p19", "p20"]}: 405; {"error":{"code":"METHOD_NOT_ALLOWED"}}
POST /api/feed?mock=1 body={broken: 405; {"error":{"code":"METHOD_NOT_ALLOWED"}}
GET /api/feed?mock=1 body={broken: 200; fixed fixture, 15 slots
```

독립 대조·변형 검사 실제 출력 (`node /tmp/gyeol-review-probes.mjs`):

```text
ordered_feed: HTTP body == schema JSON == fixture (deep field equality)
photo_analysis: HTTP body == schema JSON == fixture (deep field equality)
target_profile: HTTP body == schema JSON == fixture (deep field equality)
current_profile: HTTP body == schema JSON == fixture (deep field equality)
HTTP resources: all validators PASS; photo-to-feed copied facts PASS
0 photos: ContractError inputPhotoIds: requires 3..20 photos
21 photos: ContractError inputPhotoIds: requires 3..20 photos
quiet broken E1: failed checks=E1
quiet broken E2: failed checks=E2
quiet broken E3: failed checks=E3
quiet broken E6: failed checks=E6
quiet broken E8: failed checks=E8
Invented copied fact: validateFeed PASS; validateExport PASS; evaluate={"E1":{"pass":true},"E2":{"pass":true},"E3":{"pass":true},"E6":{"pass":true},"E8":{"pass":true}}
Empty profile Claim: evaluate.E1={"pass":true}
Empty profile Claim: validateProfile REJECT targetProfile.visual.tone_words: missing value
detail broken E1: failed checks=E1
detail broken E2: failed checks=E2
detail broken E3: failed checks=E3
detail broken E6: failed checks=E6
detail broken E8: failed checks=E8
timestamp 2026-02-30T00:00:00.000Z: ACCEPTED
timestamp 2026-09-17T15:00:00: ACCEPTED
```

복사본 실험 실제 출력(반복 eval 표는 위와 동일하므로 첫 줄 및 HTTP 결과만 인용):

```text
isolated copy: mutate ordered_quiet.slots[0].caption_inputs.describable_facts; npm run eval exit=0
GYEOL mock server http://127.0.0.1:43219
zero photo fixture: HTTP 500 {"error":{"code":"INVALID_FIXTURE","message":"Mock fixture failed contract validation."}}
21 photo fixture: HTTP 500 {"error":{"code":"INVALID_FIXTURE","message":"Mock fixture failed contract validation."}}
broken JSON fixture: HTTP 500 {"error":{"code":"INVALID_FIXTURE","message":"Mock fixture failed contract validation."}}
```

M1 최소 재현은 저장소 루트에서 다음과 같다. 원본 파일은 바꾸지 않는다.

```sh
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises';
import { validateFeed, validateExport } from './lib/contracts.js';
import { evaluate } from './eval/invariants.js';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const feed=await read('eval/golden/case_01/ordered_quiet.json');
const bundle={feed,output:await read('eval/golden/case_01/export_quiet.json'),
  inputPhotoIds:(await read('eval/golden/case_01/input.json')).photo_ids,
  targetProfile:await read('eval/golden/case_01/target_quiet.json'),
  currentProfile:await read('eval/golden/case_01/current_profile.json')};
feed.slots[0].caption_inputs.describable_facts=['Invented fact absent from photo analysis'];
validateFeed(feed,bundle.inputPhotoIds,bundle.currentProfile);
validateExport(bundle.output,feed);
console.log(evaluate(bundle));
NODE
```

実行済みの5件PASSと同じ結果を返す。コピー元の写真分析はこの値を含まない。

## 引き継ぎ

元のHEADはレビュー終盤でも同じ値だった。製品コードの差分は0、追加物はこの報告書のみ。新しいAI/UI/生成機能、CI、依存ライブラリ、デプロイの追加は要求しない。M1の扱い、別モデルの同一diffレビュー、両者の契約合意が次の判断事項である。
