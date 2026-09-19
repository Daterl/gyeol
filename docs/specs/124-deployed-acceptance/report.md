# #124 실제 시각 분석 fixture · 배포 검증 인수 상태

실행일 2026-09-19 KST. 기준 커밋 `a4110c19ec71c6c40a4385cf17879d89bec53e4f` (origin/develop).
실행 Node `v22.22.3`(레포 `engines`는 24.x — **로컬 실행 한계**로 기록한다. Node 24 재확인은 미실행).
이 문서는 통과한 것과 자격증명이 없어 **막힌 것**을 구분해 적는다. 막힌 항목을 통과로 쓰지 않는다.

## 1. 완료 조건별 판정

| # | 이슈 완료 조건 | 판정 | 근거 |
|---|---|---|---|
| 1 | `analysis_source: vision_model` 인 15장 이상 PhotoAnalysis fixture 가 레포에 있다 | **PASS** | `docs/specs/101-caption-quality/inputs.json` 의 `photos_only` 케이스 = 실사진 15장, 전부 `analysis_source: "vision_model"`, `model: "claude-opus-5"`, `photo_id` 15개 모두 고유. 동일 실행의 원본 측정은 `audit-analyses.json`(14건)·`recovered-analysis.json`(1건)에 남아 있다 |
| 2 | 배포 검증이 그 fixture 를 쓰고 15장 기준으로 판정한다 | **PASS** | `scripts/verify-deployed.mjs` 의 `MATRIX` 가 3장·15장 × 빈/작성 프롬프트 4조합이며 `makeRequest` 가 **15장 고유 분석**을 강제한다(위반 시 BLOCKED). 오프라인 계약 테스트가 위 15장 vision fixture 를 입력으로 쓴다 — `node --test scripts/verify-deployed.test.mjs` **55/55 통과** |
| 3 | 그 fixture 로 `POST /api/feed` → `POST /api/generate` 가 200 | **BLOCKED** | 2절. 로컬·Preview 어느 쪽도 자격증명 없이 도달할 수 없다 |
| 4 | D5 `채움 > 0 && 비움 > 0` | **해당없음 + BLOCKED** | ADR-0008 전환으로 이 이슈는 **강제 비움 D5를 판정하지 않는다**(이슈 본문). 검증기도 0건 비움과 전건 비움을 모두 적법으로 본다. 실제 생성 결과 관찰은 3번이 풀려야 가능하다 |
| 5 | heuristic fixture 를 쓰는 테스트는 의도적임을 밝힌다 | **PASS(이번 변경)** | `fixtures/README.md` 에 `analysis_source: "heuristic"` 임과 그 의도를 명시했다. 개별 소비처 주석은 `test/order.test.js:1-4`, `test/pipeline.test.js:71-72` 에 이미 있다 |

## 2. 3번이 막힌 지점 — 추측이 아니라 측정

### 2-1. 로컬: 프로필 스냅샷 해석기 부재

`npm run build` 후 `npm run start -- --hostname 127.0.0.1 --port 3146` 로 띄우고,
위 vision 15장을 그대로 `POST /api/feed` 에 보냈다.

```
feed15 status 503
{"error":{"code":"PROFILE_RESOLVER_UNAVAILABLE","message":"프로필 연결을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.","retryable":true}}
```

`lib/profile-cache.js` 는 `PROFILE_CACHE_SECRET`(32자 이상)과 비공개 Blob 저장소가 없으면
`NOT_CONFIGURED` 로 실패한다. 공개 프로필 스냅샷은 Apify 유료 수집으로만 `public` 이 된다.
**서명된 스냅샷을 로컬에서 만들어 끼우는 것은 인증 우회이므로 하지 않았다.**

### 2-2. Preview: Vercel SSO 로 앱에 닿지 못함

대상 `https://gyeol-photos-155o7c7ie-jangwons-projects-c001fb62.vercel.app`
(develop 헤드 `a4110c1` 의 Preview, 배포 상태 success).

```
$ node scripts/verify-deployed.mjs <preview> --environment preview --input <입력> --live
exit=2
PUBLIC_PAGE          BLOCKED  HTTP 302; authentication=VERCEL_SSO_REQUIRED (redirect withheld; not followed)
UNCONNECTED          BLOCKED  HTTP 401
TWO_PHOTOS           BLOCKED  HTTP 401
SIXTEEN_PHOTOS       BLOCKED  HTTP 401
UNVERIFIED_SNAPSHOT  BLOCKED  HTTP 401
3_blank_FEED         BLOCKED  HTTP 401
...                  PENDING  Feed contract unavailable
```

FAIL 0 · BLOCKED · 종료 코드 2. #155 의 SSO 분류가 **실제 배포 응답에서** 의도대로 동작함을
이 실행이 확인한다. 리다이렉트를 따라가지 않았고 쿠키·nonce 를 재생하지 않았다.

이 실행의 입력은 **SSO 분류 확인용 probe** 이며 인수 증거가 아니다. 저장소 밖에 두었고,
401 이전에 앱에 도달하지 않았으므로 모델 호출·프로필 수집은 0회다.

### 2-3. Production

검증기가 Production 행렬을 설계상 차단한다(`LIVE BLOCKED`). 공개 페이지 `GET /` 는
`https://project-7klb1.vercel.app/` 에서 200 이다. 그 이상은 별도 승인 경로다.

### 2-4. 사람이 풀어야 하는 것

| 막힌 것 | 필요한 것 | 주인 |
|---|---|---|
| Preview 접근 | Vercel Preview 보호 해제 또는 인증된 접근 경로 | 디에고 (배포) |
| 프로필 스냅샷 | `PROFILE_CACHE_SECRET` + Blob 저장소 + 공개 계정 Apify 수집(유료) | 원재 (비용 결정) |
| `/api/generate` 200 | 배포 환경 `ANTHROPIC_API_KEY`(유료 호출) | 원재 (비용 결정) |

셋 중 하나라도 없으면 3번은 판정할 수 없다. 이 이슈는 열어 둔다.

## 3. 이번 실행에서 통과한 것 (자격증명 불필요)

```
npm test              400/400 pass, 0 fail
npm run eval          불변식 5+3 통과, 의도적 실패 케이스 전부 EXPECTED FAIL
npm run check         PASS: 102 JS/JSON files checked
npm run lint          biome check . — 82 files, no fixes applied
npm run typecheck     next typegen + tsc --noEmit 통과
npm run test:ui       28 files / 110 tests pass
npm run build         성공
npm run test:smoke    PASS: HTTP page, explicit mock fixtures, rejection/methods and no-store
node --test scripts/verify-deployed.test.mjs   55/55 pass
```

`npm test` 는 처음에 `@vercel/blob` 미설치로 2건 실패했다. `npm install` 로 해소됐고
제품 결함이 아니다. `package-lock.json` 은 되돌려 커밋하지 않았다.

## 4. 한계

- Node 24 가 이 머신에 없어 전부 Node 22 에서 실행했다. Node 24 재실행은 미수행이다.
- HTTP 계약 통과는 모델 ID·실제 시각 분석·토큰/비용·캐시 출처를 증명하지 않는다
  (검증기도 `EXECUTION_PROVENANCE` 를 PENDING 으로 남긴다).
- 캡션 문장 품질과 실제 사진 적합성은 사람 검토 영역이며 이 문서가 판정하지 않는다.
