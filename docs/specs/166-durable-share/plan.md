# #166 실행 계획

크기: **L** — storage/API/UI 경계를 함께 연결한다.

| 단계 | 실행 담당 | 파일 | 검증 |
| --- | --- | --- | --- |
| durable store·limit | Codex `/root` | `lib/share-blob-storage.js`, `lib/share-runtime.js`, G6 service | Node storage/API tests |
| token route·cron·route 주입 | Codex `/root` | `lib/share-api.js`, `src/app/api/**`, `vercel.json` | token/path/auth tests, build |
| 게시 화면 | subagent `/root/g6_share_ui`, 통합 `/root` | `src/features/share/**`, `curation-preview.tsx` | Vitest, mobile browser |
| 문서·이슈·PR | Codex `/root` | 이 폴더, #166 | 완료 조건별 evidence |

사람 리뷰 책임자는 diego.yoon(`@jangwonyoon`)이며 enzo.cho 영역의 기존 profile resolver 계약은 수정하지 않는다. `develop` 대상 코드 PR은 승인된 셀프 머지 범위다. Production/main 배포와 live provider 호출은 diego.yoon이 별도로 수행한다.
