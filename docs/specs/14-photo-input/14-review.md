Model: claude-haiku-4-5-20251001, claude-sonnet-5

## 검토 결과 (base `887177c` → 워킹트리)

**대상 파일**: `src/app/page.tsx`, `src/features/input/{input.ts,input.test.ts,photo-input.tsx,photo-picker.tsx}`, `src/features/sample/sample-preview.tsx`
**실행한 명령**: `npm test`(184 pass) · `npm run eval`(전부 PASS/EXPECTED FAIL 의도대로) · `npm run test:ui`(vitest, 30 pass) · `npm run typecheck`(에러 없음)

### 발견 사항 (모두 낮은 심각도, blocking 이슈 없음)

1. **[낮음/코드 품질] `identityInput` 중복 호출** — `src/features/input/input.ts:118-129`
   `submitPhotos`에서 업로드 전 `identityInput(fields, [])`를 호출해 결과값을 버리고, 업로드 후 다시 `identityInput(fields, previous)`를 호출합니다. 첫 호출은 `oldPhotos.length`가 항상 `0`이라 "현재 URL + 기존 게시물 사진 동시 입력" 충돌을 절대 못 잡기 때문에, 바로 위(`line 111-115`)에서 같은 검사를 수동으로 한 번 더 중복 작성했습니다. 동작은 맞지만 같은 규칙이 두 곳에 있어 한쪽만 수정될 경우 검증 누락 위험이 있습니다. 리팩터링 권장(정확성 버그는 아님).

2. **[낮음] `oldPhotos` 개수 상한이 업로드 이후에만 검사됨** — `src/features/input/input.ts:106-129`
   `submitPhotos`는 `photos.length`(3~20)만 사전 검사하고 `oldPhotos.length` 상한은 검사하지 않습니다. UI(`addFiles`, `photo-picker.tsx`)는 20장 제한을 강제하므로 정상 경로에서는 발생하지 않지만, `submitPhotos`를 직접 호출하는 코드(예: 향후 다른 진입점)가 20장 넘는 `oldPhotos`를 넘기면 전량 업로드 후에야 서버 계약 검증(`validateIdentity`)에서 실패해 불필요한 네트워크 낭비가 생깁니다.

3. **[정보성] `?mock=1`로 홈페이지에서 무모델 경로 노출** — `src/app/page.tsx:6-8,44`
   `searchParams.mock==='1'`이면 `PhotoInput`이 `/api/analyze?mock=1`을 호출합니다. 이 자체는 기존에 이미 공개돼 있던 `/api/analyze?mock=1` 경로를 UI에서 연결한 것뿐이라 새로운 공격 표면은 아니지만, 홈페이지에 배너까지 노출("모델 없이 확인하는 모드")되므로 실제 배포 시 일반 사용자가 우연히 목업 결과를 실제 결과로 오인할 여지가 있습니다. 의도된 QA/데모 기능인지 확인 권장.

### 특이사항 없음
- 파일명(`file.name`)을 그대로 alt/aria-label/에러 메시지에 사용하지만 React가 텍스트로 이스케이프하므로 XSS 위험 없음.
- base64 인코딩(8192바이트 청크)·시퀀셜 업로드·취소(AbortSignal) 로직은 정상 동작 확인.
- `identityInput`/`validateIdentity`의 URL 검증(https + instagram.com만 허용)은 기존 `lib/interaction.js`(diff 범위 아님) 로직 재사용, 문제 없음.

### 완료 상태 고지
DoD 전체 충족 여부나 실제 모델 품질에 대한 판단은 하지 않았습니다(요청받은 4개 명령의 로컬 통과만 확인). 코드 수정, 커밋, 푸시는 수행하지 않았습니다.
