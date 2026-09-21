# #97 실행 계획

## 건드리는 파일과 이유

| 파일 | 왜 | AI 실행 담당 | 사람 리뷰 책임자 |
|---|---|---|---|
| `lib/photo_signature.js` (신규) | 구조 서명 계산과 거리. 두 곳에서 쓰므로 한 곳에 둔다 | AI | 원재 |
| `lib/photo_analysis.js` | 이미 디코드한 DC 블록에서 서명을 잰다. 새 디코딩·새 호출 없음 | AI | 원재 |
| `lib/photo-receipt.js` | 서명을 영수증에 묶는다. 안 묶으면 호출자가 서명을 바꿔 권고를 조작할 수 있다 | AI | 원재 |
| `lib/omit-suggestion.js` | 유사 판정과 문장 | AI | 원재 |
| `lib/contracts.js` | 선택 필드 검증. 길이·값이 어긋난 서명은 관측이 아니다 | AI | 원재 |
| `schemas/photo_analysis.md` · `schemas/ordered_feed.md` | ★ 공동 계약. **로컬 초안이며 합의는 pending** | AI 초안 | 원재 + 디에고 |
| `src/types/contracts.ts` | FE 타입에 선택 필드 반영 | AI | 디에고 |
| `docs/deployment.md` | 영수증 비밀값이 없으면 유사 권고도 0개라는 사실 | AI | 디에고 |
| `test/similar-omission.test.js` (신규) | 규칙·경계·위조·영수증 결합 검사 | AI | 원재 |
| `scripts/verify-similar-omission.js` (신규) | 실사진 발화율·변조 실험 재현 | AI | 원재 |

## 하지 않는 것

- `OrderedFeed` 에 새 필드를 더하지 않는다. 기존 `omit_suggestion` 안에서 끝낸다.
- B·C·D 를 구현하지 않는다. 근거는 spec.md 1절.
- 화면·FE 상태를 건드리지 않는다. 타입 한 줄 외에는 `src/` 를 바꾸지 않는다.
- `scripts/verify-omit-suggestion.js`(#88)는 손대지 않는다. 다만 그 스크립트가 현재 `handleFeed` 의 큐레이션 계약과 어긋나 실행되지 않는 상태임을 report.md 6절에 남긴다.

## 순서와 검증

1. 실사진 291장 측정 → 기존 관측값으로 A 가 가능한지 판정 → **검증: 눈으로 대조한 오탐·미탐 사례**
2. 구조 서명 후보 측정 → **검증: 40,726 쌍의 다른 게시물 최솟값과 임계값 사이의 여유**
3. 구현 → **검증: 규칙을 빼면 실패하고 넣으면 통과하는 검사**
4. 실사진 실행 → **검증: 발화율 수치와 변조 실험 0건**
5. 전체 게이트 → **검증: 6개 명령의 실제 출력**
