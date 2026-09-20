# #123 검증 기록

2026-09-18, 격리 체크아웃에서 Node 24.21.0으로 확인했다. 원본 vdev의 세 파일 미커밋 diff와 이 디렉터리의 명세만 이식했으며 원본은 수정하지 않았다.

- `node --test test/generate.test.js`: 44/44 통과.
- `npm test`: 300/300 통과.
- `npm run check`: JS/JSON 79개, 문서 예제 4개 일치.
- `npm run eval`: quiet/detail 및 주입 모델 계약 검사 통과. 의도적으로 주입한 foreign fact는 예상대로 실패했다.
- `npm run lint`: 42개 파일 통과. 설정상 lib/test JavaScript는 lint 대상이 아니며 check와 Node 테스트로 검증했다.
- `npm run test:ui`: 11개 파일, 42/42 통과.
- `npm run typecheck`, `npm run build`: 통과.
- 잘못된 사진 note 타입을 정규화가 숨기는 회귀는 이식 직후 실패하고 수정 뒤 통과했다.
- mocked 3장·15장 HTTP 생성은 200이며 사진 ID/순서와 자기 사진의 원문 근거를 보존했다. 실제 모델이나 실제 사진의 반복 성공 증거가 아니다.

`npm run test:smoke`는 기존 홈페이지 문구 `샘플 순서 살펴보기`를 기대하여 실패했다. 메모리에서 문구 검사만 현재 `GYEOL`로 맞춰 추가 확인했을 때 페이지와 네 fixture의 정확한 응답은 통과했으나, `POST /api/feed?mock=1`은 기존 기대 405 대신 현행 POST 처리 경로의 400을 반환했다. smoke 파일과 route는 이 PR에서 수정하지 않았다.

CodeRabbit 0.7.6의 무료 CLI 검토는 코드·프롬프트·테스트 세 파일을 검토하고 major 1건을 반환했다: 선택한 사실에 없는 단서를 관측 문장 전체로 대체하는 기존 패치의 동작이 짧은 단서 요구와 충돌한다. 독립 검토도 이에 동의하여 전체 문장 대체를 제거했다. 선택된 사실의 짧은 단서는 그대로 보존하고, 요약한 단서나 다른 사실을 선택한 번호는 거부하는 회귀를 추가했다. 수정 뒤 위 검증을 모두 다시 실행했다.

실모델 유료 호출, Preview/Production 검증, 배포는 수행하지 않았다. 현행 계약은 `omitted` 0개도 유효하며 최소 비움 개수를 강제하지 않는다.

PR: https://github.com/Daterl/gyeol/pull/148 (`develop` 대상). 첫 커밋 `eebb50c`의 Vercel 체크는 `Deployment rate limited — retry in 24 hours.`로 실패했으나, 수정 커밋 `72e7b38`의 Vercel 및 Vercel Preview Comments 체크는 모두 성공했다. Preview에서 실모델 요청을 실행한 것은 아니다.

수정 후 CodeRabbit 재검토는 무료 할당량 제한으로 실행되지 않았다 (`Rate limit exceeded`, 당시 재시도 안내 22분). 최종 diff는 코디네이터의 독립 검토 대상으로 전달했으며 무료 제한을 유료 호출로 우회하지 않았다.

## 2026-09-19 후속 계약 검증

`fact_index`와 함께 관측하지 않은 `uploaded_photo.note`를 보낸 응답이 canonical 원문으로 조용히 바뀌던 경로를 재현했다. 이제 함께 온 사진 근거는 선택된 원문과 정확히 같아야 하며, 다르면 `MODEL_CONTRACT`로 실패한다. 사진 근거를 생략한 정상 번호 선택은 서버가 원문 근거를 구성하는 기존 동작을 유지한다.

- Node 24.11.1 집중 회귀 1/1 및 `test/generate.test.js` 44/44 통과.
- 최신 `develop@25a6923` 기준 전체 Node 테스트 400/400, UI 테스트 110/110 통과.
- `check`, `eval`, Biome 82개 파일, `typecheck`, production `build` 통과.
- 실모델 유료 호출과 Preview/Production 검증은 수행하지 않았다.
