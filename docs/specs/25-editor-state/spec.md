# #25 편집 세션 상태·API 경계

담당 diego.yoon, 협업 enzo.cho. 기준 develop 8e1e1fe, #24 최종 인수 후 계약 코드를 병합한다.

- createEditorStore를 Client Component의 useState initializer에서 세션마다 생성한다. 모듈 전역 인스턴스·persist는 없다. 컴포넌트가 필요한 selector만 구독한다(#14 인계).
- 서버 원본/출력과 사용자 draft·표시 순서를 분리한다. photo_id를 변경하지 않고 재정렬·편집한다. 원본 근거는 보존한다.
- 네트워크 요청은 하나씩 취소 가능한 상태로 실행한다. 새 요청·선택 변경·reset이 이전 응답을 무효화한다. 채우기 중 바뀐 사용자 문장을 응답으로 덮지 않는다.
- 사진 object URL은 삭제/교체/reset에서 해제한다. DOM 포커스는 store가 건드리지 않으며 #14의 ID 기반 UI가 담당한다.
- API는 #24 런타임 validator를 재사용한다. HTTP(비 JSON 413 포함), JSON, 계약, 네트워크, 25초 timeout을 명시적 실패로 반환한다. 자동 재요청 없음.
- 공유 클라이언트 편집 상태만 Zustand vanilla에 둔다. 서버 캐시가 없는 세션 작업이므로 TanStack Query/immer를 새로 설치하지 않는다. immutable update와 기존 Zustand로 충분하다. 사진·문장을 devtools에 보내지 않는다.

검증: Vitest의 deferred promise로 연속 제출/reset/수정 중 응답을 재현하고 원본 보존·ID 재정렬·object URL 수명을 확인한다. API mocked fetch로 JSON/HTTP/계약/timeout을 검사한다. typecheck/build 및 기존 Node/eval 유지. 실제 제품 모델 호출 0회.
