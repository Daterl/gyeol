# #69 공개 프로필 순서 인수 — 2026-09-19

## 결정

[ADR-0008 순서 근거 계약](../../adr/0008-public-profile-curation-and-sharing.md#순서에-쓰는-공개-프로필-근거-69)에 따라 AC5를 사용 가능한 공개 프로필 신호의 전달·근거 해소와 미관측 palette 고지로 판정한다. 코디네이터가 이 범위를 승인했다. 참조 이미지를 새로 수집하거나 캡션·업로드 사진에서 프로필 색을 만들지 않는다.

`lib/order.js`는 palette가 없는 지향의 첫 자리 설명과 규칙 근거에 제한을 고지한다. 캡션이 전혀 없는 경우를 “두 기준값 사이”라고 설명하던 문장도 고쳤다. 점수·사진 ID·선택적 실측 palette 동점 규칙은 유지한다. 공유 프로필 기본 꺼짐과 서버의 공개 스냅샷 확인 경계는 변경하지 않았다.

## 재현과 범위

- 기준 SHA: `a4110c1` (`origin/develop`). 실행 환경: macOS, Node `v22.22.3`; Node 24 실행은 주장하지 않는다.
- `node --test test/curation-order-evidence.test.js`: 실제 loopback HTTP 서버에 `POST /api/feed`를 보낸다. Next POST와 동일한 `handleFeed → buildCuration → composeFeed → orderFeed`를 사용하며 resolver만 오프라인 대체한다. Next 서버·배포 URL 검증은 아니다.
- 사진: `test/order.real20.json` 앞 15장의 저장된 heuristic 측정값. 프로필: `fixtures/curation.sample.json` 형태의 합성 resolver 레코드에 짧은/긴/빈 캡션 모집단을 넣는다. 실계정 관측이나 실시간 Apify·모델 호출 증거가 아니다.
- profile snapshot의 캡션에서 `extractFromReference`가 만든 실제 추출 결과를 HTTP 응답까지 검사한다. 합성 입력이라는 한계와 실제 추출 함수 실행을 구분한다.

## 결과

| 기준 | 검증 |
| --- | --- |
| AC1 | 15장 HTTP 응답은 입력 순서와 다르며 모든 ID를 보존. 기존 pipeline 회귀는 heuristic·모델 관측·혼합·legacy PhotoPlan을 유지. 제품 사진만 입력은 기존 curation 거부 회귀 대상. |
| AC2 | 프롬프트 없이 짧은/긴 캡션 프로필의 position 정렬 photo_id가 14/15자리에서 다름. 기존 두 프롬프트 대조도 통과. feed 응답에는 캡션이 없어 생성 캡션 비교는 이 테스트 범위 아님. |
| AC3 | 동일 입력 재요청 slots 동일. 같은 명시적 프롬프트에서는 연결 프로필 캡션이 달라도 slots 동일. 빈 캡션은 기본 규칙임을 정확히 고지. |
| AC4 | 모든 슬롯의 uploaded_photo는 입력 사진, ig_post는 해당 snapshot의 shortCode, aggregate는 해당 snapshot ID로 해소. |
| AC5 | 추출 caption_len이 applied_profile과 R1 근거로 전달. palette 부재·completeness.visual=0 및 사용자 설명/규칙 근거 확인. 실측 palette 모듈 회귀에서는 부재 고지가 나오지 않음. |
| AC6 | Node test 401/401, eval 전체 PASS/파손 변형 EXPECTED FAIL, check 103파일, lint 82파일, typecheck 통과. 최종 추가 단언 targeted 19/19. |

```text
입력 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15
짧음 11 02 09 01 03 06 13 14 04 07 08 15 12 10 05
길음 07 11 02 09 01 03 06 13 14 04 15 12 10 08 05
```

위 숫자는 `ph_` 접미사이며 position 배열 자체가 아니다. 점수 로직을 바꾸지 않아 전후 순서는 같다. 변경 전 새 회귀는 첫 자리 palette 제한 고지 부재로 실패했고 변경 후 통과했다.

첫 전체 테스트 시 작업 폴더에 최신 의존성 `@vercel/blob`이 없어 2개 파일이 실패했다. `npm ci`로 잠금 파일 그대로 설치한 뒤 전체 검사를 통과했다. 작업 시작 전 있던 lockfile 변경은 별도 stash `preserve pre-existing worker lockfile change`에 보존했고 PR에는 넣지 않았다.

## 남은 확인

이 PR은 develop 인수용이다. 실시간 수집·실모델 재호출·Production 배포·Node 24 검증을 수행하지 않았다. 해당 환경 인수는 #124와 릴리스 담당 범위이며 이 결과로 배포 완료를 주장하지 않는다.
