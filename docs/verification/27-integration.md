# #27 통합 검증 · 2026-09-17

담당 **diego.yoon**, 협업 **enzo.cho**. 기준 develop `05b2af5` (PR #62). 제품 코드 변경 없음.
판정: **검증한 로컬·인증 Preview 경로 PASS / 전체 인수 PENDING**. 사용자 승인 범위는 [ADR-0005](../adr/0005-delegated-development.md)를 따른다.

## 실행 환경과 증거

macOS Chrome 네이티브 파일 선택과 CUA 확장 브라우저. 320/390/1440px는 같은 데스크톱의 viewport이며 실물 모바일이 아니다. 로컬 업로드는 합성 QA JPEG, 샘플은 합성 이미지와 사전 작성 결과다. 제품 유료 모델 호출은 하지 않았다. 보호된 Vercel Preview 확인을 익명 공개 배포로 바꾸어 적지 않는다.

| 경로 | 실제 확인 | 근거 |
|---|---|---|
| 사진 입력 | 실제 파일 선택 3장·20장 업로드 성공, 2장 차단, 21장 선택 시20장 보존·초과 안내, 삭제/초기화 포커스 | [#14 기록](../specs/14-photo-input/verification.md) |
| 대표 결과 | 실제15장 업로드→15슬롯, 근거 펼침, 이동 후 원제안/사진/근거 유지 | [#15 기록](../specs/15-result-screen/verification.md) |
| 이동·편집 | 실제 마우스 드래그, 버튼, ArrowDown. 캡션 직접 수정 후 재정렬·다른 슬롯 채우기에도 보존 | [#19 기록](../specs/19-sample-result/verification.md) |
| 내보내기 | 실제 브라우저에서 전체 비움 JSON/텍스트 다운로드 후 파일 내용 대조. 제목·사진ID·null 캡션·근거 보존 | [#17 기록과 다운로드 파일](../specs/17-caption-export/verification.md) |
| 오류 복구 | 미지원 URL 오류→사진 유지→URL 비움→재시도 성공. 접힌 선택 입력의 잘못된 URL은 자동 펼침·포커스 | [#14](../specs/14-photo-input/verification.md), [#36](../specs/36-photo-workbench/verification.md) |
| 시각·접근성 | 320/390/1440px 넘침0, 390px 버튼44px 이상, 실제200% 확대, 키보드, 이미지404에도96px공간/CTA 유지 | [#36 기록](../specs/36-photo-workbench/verification.md) |
| 모션 | 일반·실제 reduced-motion 에뮬레이션, 샘플 재진입 포커스, cleanup. JS gzip 빌드 합계 +19,359B | [#37 기록](../specs/37-companion-motion/verification.md) |
| 최종 Preview | PR #62 head `c3f5df581bb7dc1d7f4aafc05a017f609a4e7b2b` Vercel SUCCESS. 이미지4개 로드, 샘플결과·제목·비움, 캡션 수정→이동 보존 | [PR 검증 코멘트](https://github.com/Daterl/gyeol/pull/62#issuecomment-5713977745) |

## 느린 요청 취소·재시도 추가 실행

PR #62 제품을 localhost:8362에서 실행하고, 테스트 전용 HTTP 프록시 localhost:8363에서 각 POST 응답을8초 지연했다. `?mock=1` 사진분석과 feed 요청이며 실제 모델 timeout 측정이 아니다.

1. qa-01/02/03.jpg 선택→시작. 실제 로딩 문구·취소 버튼·working 이미지 표시.
2. 취소→시작/삭제 버튼 복구. 지연 응답 이후에도 입력3장만 남고 결과가 생기지 않음. [취소 후 앱 AX](27-cancel-after-delay.txt).
3. 같은 입력으로 재시도→분석3회와 feed 응답 후3슬롯 표시, 결과 제목 포커스, complete 이미지 GET. [재시도 앱 AX](27-retry-after-delay.txt).

프록시 관측 시각(KST): 첫 실행 analyze 응답20:53:43/51 뒤 추가 feed 없음. 재시도 analyze20:58:38/46/54, feed20:59:02, complete.webp20:59:02. 브라우저 취소가 이미 시작한 서버 계산을 중단했다는 주장은 하지 않는다. 응답이 편집 세션을 덮지 않는 사용자 동작을 확인했다.

## 이슈 완료 조건 판정

| #27 조건 | 판정·남은 것 |
|---|---|
| 다른 기기30초 + 사진 경계 | 부분 PASS. 같은 장비0.320초(이미지 포함),3/20/2/21 확인. 다른 실제 기기 미실행 |
| 모바일·키보드 사용자 경로 | 부분 PASS. viewport·키보드·버튼·마우스 드래그 확인. 실제 모바일 터치 및 배포된 파일 업로드 미실행 |
| 실패·timeout·연속 제출 복구 | 로컬 오류·지연 취소 PASS. HTTP/JSON/계약/timeout/늦은 응답은 실행된 API/store 테스트. 실모델 timeout·배포 네트워크 실패는 미실행 |
| 근거·편집·전체 비움 내보내기 | PASS. 실제 다운로드 및 이동 보존 기록 |
| 출처 고지·resolved·진행률 금지 | 렌더/회귀 검사 PASS. 실제 모델의 근거 품질 인수는 별도 |
| 프로필2벌·D1~D6 | PENDING. 실제 모델 결과2벌/사람 전수대조/외부2명 응답 없음. 제출 설명에 개인화 품질을 주장하지 않음 |

## 완료 가능한 leaf 정리

- **#25**: 세션별 store/원본·draft 분리, photo_id 보존, request취소·늦은 응답, URL 수명, 오류 계약은 [spec 및 실행 로그](../specs/25-editor-state/)와 #14/#17/#19 실화면, 위 지연취소로 인수한다. 서버 전역 store/persist 없음. 전체 조건 PASS.
- **#15**: 15슬롯, 근거·출처·resolved는 #15 렌더/실화면;3/20 매핑은 #14와 회귀 검사; 드래그·모바일·배포 결과 편집 잔여는 #19/#36/#37 증거로 보완. 전체 결과 UI 조건 PASS. 배포 업로드 실경로는 #14/#27에서 추적한다.
- #14/#17/#18/#19/#26/#27/#36/#37은 각 미실행 게이트를 유지한다. merge는 전체 제품 인수와 다르다.

최신 앱 검사(Node186/UI31/eval/check/lint/typecheck/build)와 독립 claude-sonnet-5 리뷰는 #37 기록을 재사용한다. 이 문서 전용 변경에는 관련 없는 앱 검사를 반복하지 않는다.
