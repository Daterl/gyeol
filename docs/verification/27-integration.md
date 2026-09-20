# #27 G8 통합 인수 · 2026-09-19

**Verdict: 로컬 계약·브라우저 확인 PASS / live 통합 인수 BLOCKED. 이슈를 닫지 않는다.**

담당 enzo.cho. 제품 기준 SHA `a4110c19ec71c6c40a4385cf17879d89bec53e4f` (`develop`, PR #172), Node `24.21.0`. 이 변경은 회귀 테스트와 인수 기록만 추가하며 제품·배포 설정은 바꾸지 않는다. 결과 커밋과 PR은 [#27 종료 기록](https://github.com/Daterl/gyeol/issues/27)에 기록한다. 2026-09-17의 이전 3~20장 계약·보호 Preview 기록은 [당시 문서](https://github.com/Daterl/gyeol/blob/a4110c19ec71c6c40a4385cf17879d89bec53e4f/docs/verification/27-integration.md)에 보존돼 있으며 현재 ADR-0008 인수와 구분한다.

## 완료 조건별 증거

| #27 조건 | 이번 실행과 판정 | 남은 게이트 |
|---|---|---|
| 필수 공개 프로필, 소유권 인증 아님 | 로컬 production build에서 프로필 미연결 시 사진 선택·생성 disabled, OAuth/소유권 인증 아님 안내 확인 | 실제 공개 계정 연결 |
| 3장·15장, 빈·작성 프롬프트 | 3/15장 주입 큐레이션→편집→확정→공유 계약 회귀 PASS | live 프로필·모델로 3/15 × 빈/작성 프롬프트 4경로 완주; 이번 테스트는 프롬프트 품질 인수가 아님 |
| 필수 큐레이션 뒤 편집·확정 | store 계약에서 순서·문장 수정, immutable 확정본, 미확정 편집/확정만으로 기존 공유본이 바뀌지 않음 확인 | 실제 프로필→큐레이션 UI 경로 |
| 분할 업로드·다른 브라우저 공유 | 3/15회 개별 uploader 호출, 확정 순서 보존, 관리 키 없는 별도 client 조회 PASS | 실제 Blob client upload/token exchange, 새 브라우저에서 같은 링크 조회 |
| 같은 링크 재확정·동시 충돌 | version 2 문장·이미지 조회, stale ETag 거부, 재조회한 ETag 유지 PASS | live provider CAS·consistent read; 실제 동시 브라우저 충돌 |
| 관리 키·회전 | 키 없는 rotate/revoke 401, 회전 직후 이전 키 revoke 거부 PASS | Preview 관리 화면·provider 실경로 |
| 비활성화·미디어 삭제 | share/image 410, 두 버전 이미지·JSON 삭제 후 PII 없는 tombstone만 남음 PASS | 실제 Blob 삭제·origin 응답 확인 |
| 프로필 on/off·민감정보 | off identity 누락, on 서버 resolver 결과만 공개, 참조·관리 키가 public DTO에 없음; 저장 객체에 키 원문 없음 PASS | live 네트워크·provider/배포 로그의 원본·키 비노출. 테스트 입력은 합성이고 실제 로그 검사는 미실행 |
| 모바일·접근성·Preview·SHA | 로컬 360/390/430/1280px, keyboard skip link, 편집→이동→JSON 다운로드 PASS | 실제 iOS/Android 파일 선택·터치·키보드·다운로드, Preview 기능 인수 |

주요 회귀: [share-client.test.ts](../../src/features/share/share-client.test.ts)의 `3/15 photos survive confirmation, isolated reader, reconfirmation and revocation`. 실제 store·client·route handler·G6 service를 통과하지만 **MemoryBlobStore, 주입 resolver, 합성 메타데이터와 WebP 헤더**를 사용한다. 서로 다른 client 객체는 서로 다른 브라우저가 아니며 live Apify·모델·Blob 증거로 승격하지 않는다. 공급자 토큰 교환은 별도 기존 모의 계약 검사다.

## 실행 기록

- `npm test`: **400/400 PASS**.
- `npm run test:ui`: **112/112 PASS**, 28 files. 이번 변경 전 110개에 3/15장 통합 회귀 2개 추가.
- `npm run check`, `npm run eval`, `npm run lint`, `npm run typecheck`, `npm run build`: **PASS**. eval은 주입 모델 계약 검사이며 실제 생성 품질 증거가 아니다. 제품 빌드 후 테스트만 변경했고 최종 UI/lint/typecheck를 다시 통과했다.
- Node 실행: `npx --yes --package=node@24 --call 'npm test'`처럼 Node 24 환경에서 위 명령 실행. `git diff --check` PASS.
- 로컬 `npm start -- --port 3127`, Chromium `151.0.7922.34` headless: 각 viewport에서 프로필 gating과 Tab 첫 포커스 `본문으로 건너뛰기` 확인. 합성 샘플 첫 캡션 편집→뒤로 이동→JSON 다운로드 내용을 파싱해 편집 문장 position 2 유지 확인. 가로 overflow 모두 0. 실물 모바일·스크린리더 전수 인수는 아님.
- 설정 없는 실제 Next HTTP route 5개(`/api/share-upload`, share, image, manage, `/api/share-blob-upload`)가 모두 **503 `NOT_CONFIGURED`, `Cache-Control: no-store`**. 성공 공유로 fallback하지 않음.
- [브라우저·HTTP 결과 JSON](27-browser-20260919.json). 샘플의 기존 편집/내보내기는 확인했지만 샘플을 live 프로필·확정·공유 UI로 기록하지 않는다.

## Preview와 정확한 blocker

[기준 Preview](https://gyeol-photos-155o7c7ie-jangwons-projects-c001fb62.vercel.app)는 GitHub deployment `6528239460`, 기준 제품 SHA와 연결되고 deployment status는 `success`다. 2026-09-19 익명 GET은 **302 → `https://vercel.com/sso-api`**다. 배포 성공은 기능 PASS가 아니며 이 결과는 기준 SHA의 접근 검사다. 이 PR head의 Preview 기능은 미검증이다.

1. **Preview 인증 접근 없음.** 인증 우회는 시도하지 않았다. 연결된 브라우저 도구도 `Navigating frame was detached`로 실패해 로컬은 독립 headless Chromium으로 확인했다.
2. **live Blob/profile 설정 없음.** 제공된 로컬 credential 파일은 Anthropic key/workspace만 포함한다. `BLOB_READ_WRITE_TOKEN`, `SHARE_STORAGE_SECRET`, `PROFILE_CACHE_SECRET`, `CRON_SECRET` 및 공개 프로필 연결에 필요한 Apify/브라우저 세션 설정은 제공되지 않았다. 이것은 로컬 가용성 확인이며, 인증할 수 없는 Preview의 환경변수 구성을 추정하지 않는다. 비밀값·원본 사진·관리 키는 기록하지 않았다.
3. **실기기·외부 사용자 증거 없음.** coordinator가 제공 가능한 증거 없음을 확인했다. viewport를 실제 모바일로, 자동화 client를 외부 사용자로 간주하지 않는다.
4. **Production 별도.** main 릴리스·Production 배포·실호출 비용 발생은 수행하지 않았다. [ADR-0005](../adr/0005-delegated-development.md)의 경계를 유지한다.

다음 행동: 인증 가능한 동일 SHA Preview와 live 저장소·프로필 설정을 준비한 담당자가 위 4경로를 실행하고 새 브라우저 조회, CAS 충돌, on/off, 키 회전, revoke 후 실제 미디어 삭제와 로그를 대조한다. 실제 모바일·외부 사용자 기록, #43의 15장 반복/축소 전후 관측 대조, Production 인수를 별도 게이트로 남긴다.

## 보존 정책 정합성

coordinator 지시에 따라 [ADR-0008](../adr/0008-public-profile-curation-and-sharing.md)을 [G6 spec](../specs/140-share-storage/spec.md)의 명시된 동시 읽기 정책과 일치시켰다. 재확정 시 manifest만 원자적으로 교체하고 이전 불변 객체는 업로드 시각으로부터 24시간이 지난 뒤 일일 cleanup에서 삭제한다. 새 공개 요청은 최신 manifest만 사용하며 revoke는 모든 버전의 미디어를 즉시 삭제한다. 이번 회귀는 재확정 후 두 버전 보관, 최신 이미지 조회, revoke 후 tombstone만 잔존함을 확인한다. 24시간 만료·cleanup은 기존 `test/share-storage.test.js` 검사를 통과했다. 삭제 실패 시 후속 cleanup 재시도 정책은 유지하며 live provider 삭제 인수는 여전히 미실행이다.
