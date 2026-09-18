# #126 — 무엇을 만드는가

바뀌는 곳은 **클라이언트뿐이다.** `schemas/` 4종, `lib/` 서버 계약, `/api/analyze` 의 요청·응답 모양은 그대로다.
사진 한 장당 `POST /api/analyze` 한 번이라는 구조도 그대로다 — 바뀌는 것은 **호출을 겹치는 정도**뿐이다.

## 1. 입력/출력 계약

### `upload(photos, sessionId, collection, signal, mock)` (내부 함수)

| | 지금 | 바뀐 뒤 |
|---|---|---|
| 입력 | `SelectedPhoto[]` | 같음 |
| 실행 | 순차 1개 | 동시 최대 `ANALYZE_CONCURRENCY` 개 |
| 한 장 실패 | 즉시 전체 reject | 해당 장만 버리고 계속 |
| 출력 | `PhotoAnalysis[]` (길이 = 입력) | `{ analyses: PhotoAnalysis[], failed: string[] }` (길이 ≤ 입력) |

- `analyses` 는 **입력 순서를 유지한다.** 완료 순서가 아니다.
- `analyses[i].input_index` 는 **0..analyses.length-1 로 재색인한다.** `lib/interaction.js:26` 이
  `input_index === 배열 위치` 를 요구하기 때문이다. 재색인은 상대 순서를 바꾸지 않는다.
- `failed` 는 끝내 실패한 사진의 `file_ref` 목록이다. 사용자에게 무엇이 빠졌는지 말하기 위한 값이다.

### `submitPhotos(...)`

- 선택 사진 생존 수 < 3 → `ApiError('ANALYSIS_FAILED', ...)` 를 던진다. 3장 미만은 `/api/feed` 가 받지 않는다.
- 기존 게시물(`oldPhotos`) 을 넣었는데 생존 0 → `ApiError('ANALYSIS_FAILED', ...)`.
  `identity.current.kind==='posts'` 는 사진 1장 이상을 요구한다(`photoList(value.photos,1)`).
- 그 외에는 생존분으로 `orderPhotos` 를 호출한다.

## 2. 판단 규칙

### 동시 실행 상한 `ANALYZE_CONCURRENCY`
- 고정 상수. 실측으로 고른다. 환경변수·설정 파일로 빼지 않는다(값이 변하지 않으므로).
- 워커 풀: 워커 `min(상한, 사진 수)` 개가 공유 커서에서 다음 인덱스를 집어 처리한다.

### 재시도
`lib/model.js` 의 기존 규칙을 클라이언트에서 그대로 따른다.

| 상황 | 재시도 | 근거 |
|---|---|---|
| 429 / 5xx | O | `lib/model.js:71` `response.status === 429 \|\| response.status >= 500` |
| 타임아웃(`TIMEOUT`) · 네트워크(`NETWORK`) | O | `src/lib/api.ts` 가 `retryable = true` 로 표시 |
| 401 / 403 / `MODEL_KEY_MISSING` | **X** | 인증 문제는 다시 던져도 같은 답이 온다 |
| 400 / 413 / 415 / 422 (`INVALID_IMAGE` 등) | X | 사진 자체가 원인. 재시도가 바꾸지 않는다 |
| `CANCELLED` (사용자 취소) | X | 취소는 전체를 즉시 중단시킨다 |

- **시도 횟수는 최대 2회**(첫 시도 + 재시도 1회). 3회로 늘리지 않는 이유: 한 번의 재시도가 약 11초를 더한다.
  `MODEL_TIMEOUT_MS = 20_000` 이므로 최악은 20+20=40초 — 3회면 60초로 30초 목표를 스스로 깬다.
- 재시도 사이 대기 400ms 고정. `lib/model.js:76` 의 "고정된 짧은 지연" 을 따른다.

### 취소
- `signal.aborted` 면 워커는 다음 사진을 집지 않고 종료하고, `submitPhotos` 는 `CANCELLED` 를 던진다.
  진행 중인 요청은 `AbortSignal` 이 그대로 전달되므로 같이 끊긴다.

### 편집 상태(`src/features/editor/store.ts`)
- 지금은 `selected.length !== ids.length` 면 `'Selected photos differ'` 로 던진다.
  분석에 실패한 사진이 빠지면 이 검사가 정상 응답을 오류로 만든다.
- **부분집합 검사로 바꾼다:** 응답의 사진 ID 가 전부 선택 목록 안에 있고 1장 이상이면 통과.
  통과 후 `photos` 를 생존 ID 로 줄이고, 빠진 사진의 `URL.revokeObjectURL` 을 호출한다.
  (서버가 엉뚱한 사진을 돌려주는 경우는 여전히 잡힌다 — 그게 이 검사의 원래 목적이다.)

## 3. 무엇을 하면 틀린 것인가

- 여러 장을 한 번의 모델 호출로 묶는다 → **틀림.** 작업 규약 위반.
- 상한 없이 `Promise.all(photos.map(...))` → **틀림.** 429 를 부른다.
- 한 장 실패를 조용히 삼키고 사용자에게 아무 말도 안 한다 → **틀림.** 빠진 사진을 알린다.
- 실패한 사진의 자리를 빈 껍데기 `PhotoAnalysis` 로 채운다 → **틀림.** 관측하지 않은 것을 만들어내는 것이다(P2).
- 인증 오류(401/403)를 재시도한다 → **틀림.** 규칙 위반이자 낭비.
- 진행률 UI 를 만든다 → **틀림.** P3, 그리고 이슈 범위 밖.

## 4. 경계값

| 입력 | 기대 |
|---|---|
| 사진 3장, 전부 성공 | 3장, `input_index` 0,1,2 |
| 사진 15장, 1장 실패 | 14장, `input_index` 0..13, `/api/feed` 200 |
| 사진 3장, 1장 실패 | `ANALYSIS_FAILED` (생존 2 < 3) |
| 사진 20장 (상한 초과 개수) | 워커는 상한 개수만. 전부 처리 |
| 사진 수 < 상한 | 워커 수 = 사진 수. 유휴 워커 없음 |
| 시작 전 `signal` 이 이미 abort | 요청 0건 |
| `oldPhotos` 1장이 실패 | `ANALYSIS_FAILED` |
| `oldPhotos` 0장 | 요청 0건, `identity.current.kind === 'none'` |
