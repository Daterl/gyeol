# 리뷰 기록

검토 일시: 2026-09-17 UTC. 최초 코드 diff SHA256: `d5d59647476942569bc2895878abd37499248cf77b296dc7028413db537e0872`.
원문: review-claude.json, review-coderabbit.txt. Claude는 도구 없이 diff·명세만 읽었으며 재현 검증은 하지 않았다.
Claude 응답 모델: claude-opus-5[1m] (CLI modelUsage에 보조 haiku도 기록됨). CodeRabbit CLI 0.7.6은 모델 ID를 공개하지 않았고 최초 diff 지적 0건이었다.
최종 동일 diff를 서로 다른 두 모델이 실제 재현한 리뷰 게이트는 PENDING이다. 아래 수정 후 테스트는 구현 담당자가 재실행했다.

| 지적 | 처리 |
| --- | --- |
| H1 SVG가 모델 경로에서 502 | 반영: MODEL_MEDIA_UNSUPPORTED는 HTTP 415, 기본 클라이언트·네트워크 0회 회귀 검사 추가. 기존 API에서 새 검사가 실패하는 원문은 regression-before.txt |
| H2 config의 import 시점 fs 읽기 | 반영: 정적 JSON import로 번들러가 의존성을 추적하게 변경 |
| H3 parsed_output 및 다중 content 지원 | 미반영: raw fetch의 공식 Messages 응답은 content이며 parsed_output 필드는 없다. thinking/tool을 요청하지 않으므로 단일 JSON 텍스트를 요구한다. 미지 응답을 통과시키지 않고 실패시키는 정책 유지 |
| M1 capabilities가 존재하지 않는다는 주장 | 미반영: 확인한 공식 Models 문서에 capabilities.image_input/structured_outputs.supported가 있다. null은 허용되고 false일 때만 거부한다. 실제 접근은 여전히 PENDING |
| M2 E6 범위 / M3 usage 위치 | 반영: E6은 F3 출력에만 적용, usage는 execution 형제 필드라고 명세 수정 |
| M4 quality_flags enum 중복 | 반영: 요청 schema의 enum 재사용, 오류 문구 수정 |
| M5 캐시 지연 혼동 | 반영: HTTP Cache 헤더 추가, elapsed_ms는 원 관측 당시 시간이라고 명세에 명시 |
| M6 매 사진 Models GET | 유지: 계정 접근 확인을 호출마다 한다. 지연 최적화는 실측 후 판단. attempts는 POST만, elapsed_ms는 GET 포함이라는 의미 명시 |
| M7 취소되지 않는 retry 대기 | 반영: AbortSignal을 받는 timers/promises 대기로 변경 |
| L1 source 중복 / L7 eval 동적 import / L8 중복 초기화 | 미반영: source는 동일 값이고 eval의 assertion 실패는 exit 1로 전파된다. 서로 다른 관측 주입을 보장하는 초기화이며 동작 결함은 재현되지 않음 |
| L2 잘못된 실측기 인자 | 반영: try 안에서 검사해 JSON FAILED로 출력. 1/15개 제한은 이슈 측정 범위 |
| L3 실제 누락 필드 검사 | 기존 HTTP 테스트의 빈 객체 응답이 실제 누락 분기를 검증함. undefined 패치 검사는 별도의 타입 위반 검증으로 유지 |
| L4 거절/절단 공통 코드 | 유지: 둘 다 미완료 응답이며 MODEL_INCOMPLETE로 실패. 서로 다른 오류 코드 계약은 요구하지 않음 |
| L5 오류 헤더 부재 / L6 키 공백 | 유지: MODEL_* 오류 코드가 모델 경로를 명시한다. 공백이 든 키는 API에 그대로 전달되어 인증 오류로 실패하며 다른 키와 캐시를 공유하지 않음 |
| L9 effort/prompt caching 제거 | 명세 보강: 모델 지원·캐시 효과 미실측이므로 선택 최적화는 생략 |
| 부분 실패 처리 미정 | 명세 보강: 실패 사진을 성공 슬롯으로 바꾸지 않고 호출자가 오류 표시·재요청. UI/재개 구현은 범위 밖 |

추가 자체 수정: 사진 프롬프트의 "항상 실측 색상으로 덮어쓴다"를 실제 측정 가능할 때만으로 바로잡았다.
콜드 리드(shower) 판정: minor gaps. 사용 경로와 목적은 이해했고 HTTP/메타데이터의 불명확한 부분을 위와 같이 보강했다.
sip의 detool은 도구 중립 문서가 아니어서 생략했다. re0로 spec의 현재 동작을 정리했으며 과거 명세의 기록은 보존했다.

공식 근거: [Messages 응답](https://platform.claude.com/docs/en/api/messages/create), [Models capability](https://platform.claude.com/docs/en/api/models/list). 실계정 응답으로 확인했다는 뜻은 아니다.
