# 모델 배선 명세

## 범위와 계약
기존 analyzePhoto와 api/analyze.js의 사진 한 장 경로를 lib/model.js로 연결한다.
lib/target_profile.js·current_profile.js의 집계와 order·feed의 휴리스틱은 보존한다.
숫자 집계를 모델로 대체하거나 새로운 프로필 API를 추가하지 않는다. target/current 프롬프트는 계속 미배선이며 그 사실을 숨기지 않는다.
PhotoAnalysis와 나머지 schemas/ 4종은 바꾸지 않는다. 모델 출처는 기존 analysis_source/model/analyzed_at에 남는다.
라이브러리 반환값 execution은 경로·사유·캐시 여부·실측 지연·토큰 사용량을 담는다. HTTP는 기존 JSON 계약을 유지하고 X-Gyeol-Analysis-Source/Reason 헤더로 경로를 노출한다.

## 선택과 실패
ANTHROPIC_API_KEY가 비어 있으면 호출 0회, heuristic + missing_api_key다.
키가 있으면 공식 문서에 있는 기본 모델을 Models API로 계정 접근 확인한 뒤 Messages API를 부른다.
선택적 GYEOL_VISION_MODEL로 바꿀 수 있으나 기본 실행에 추가 환경변수는 필요 없다.
사진은 JPEG/PNG/WebP/GIF 한 장만 전달한다. SVG는 모델 미지원 오류이며 키 없는 fixture 경로는 유지한다.
전체 모델 작업 제한은 20초다. 429/5xx만 최대 한 번 재시도하고 네트워크·시간초과·인증·JSON·계약 오류는 재시도하지 않는다.
모델 실패 시 휴리스틱으로 전환하지 않고 MODEL_* 오류를 반환한다. 공급자 본문이나 키는 오류에 포함하지 않는다.
모델 JSON은 모든 필수 필드·타입·범위·알려진 키를 검사한 후에만 실측 색상으로 덮어쓴다.
실패한 결과는 캐시하지 않는다. 캐시는 이미지 해시·매체형·모델·키 해시·프롬프트 해시와 경로를 구분한다.
캐시 반환 객체는 복사하여 호출자가 다음 결과를 오염시킬 수 없게 한다.

## 정확성 기준과 불변식
| 검사 | 막는 오류 | 한계 |
| --- | --- | --- |
| PhotoAnalysis 필수 필드·enum·범위 | 형식 오류를 성공으로 취급 | 사진 의미는 증명하지 못함 |
| 요청 identity 재부여, 모델 identity 키 거부 | 다른 사진으로 바꿔치기 | 원본 바이트 신뢰 필요 |
| E1 근거 Claim + 프로필 실제 ref 검사 | 근거 없는 판단·존재하지 않는 입력 인용 | ref가 진짜여도 해석이 틀릴 수 있음 |
| E2 사진 수·ID 보존, E3 위치 1..N | 누락·중복·외부 사진 | 모델마다 순서가 달라도 통과 가능 |
| E6 제목 1개, E8 현재축 고지, E9 목표축 일치 | 출력·축 계약 위반 | 개인화 품질은 별도 |
| E10 ref가 실제 입력에 닿음 | 가짜 사진 근거 | 근거의 의미 일치 별도 |
| E11 슬롯 사실이 그 사진 분석에서 옴 | 사진 간 사실 이동 | 원 분석의 환각은 검출 못함 |
| 오류 후 캐시 0, 키/모델 전환 분리 | 실패 고착·휴리스틱을 AI로 오인 | 프로세스 로컬 캐시 |

E1/E2/E3/E6/E8/E9/E10/E11은 문자열·순서 정답 비교 없이 모델 출력에도 적용한다.
E4/E5/E7 및 사진에 없는 장소·인물·시간·감정 여부는 원본 사진과 사람이 대조해야 한다(PENDING).
검사기가 모델이 생성한 describable_facts를 외부 정답으로 취급하면 순환 검증이다. 자동 검사 통과를 실제 AI 품질로 보고하지 않는다.
빈 facts/subjects는 허용한다(P3). 불확실한 관측을 채우도록 강제하지 않는다.

## 실행 방법

1. `.env.example`을 `.env`로 복사하고 `ANTHROPIC_API_KEY`를 넣는다. `.env`는 gitignore 대상이다.
2. `node --env-file-if-exists=.env scripts/measure-model.js fixtures/jpeg/solid_white_baseline.jpg`로 한 장을 호출한다. 15장 측정은 파일 경로 15개를 인자로 준다.
3. 기존 HTTP 진입점은 `node --env-file-if-exists=.env scripts/server.js`의 `/api/analyze`다. POST 입력은 `photo_id`, `input_index`, `file_ref`, `image_base64`, 선택 `media_type`이다.
4. 현재 Next.js 앱에는 `/api/analyze` 어댑터가 없다. 이번 변경은 기존 라이브러리·Node HTTP 진입점 배선이며 Next.js/UI 통합 완료를 뜻하지 않는다.

이 명세의 모델 실패 전파·재시도 정책은 이전 사진 분석 명세의 자동 폴백 정책을 대체한다. 이전 이슈 보고서는 당시 검증 기록으로 보존한다.

## 검증·실측
실제 HTTP 대신 주입 fetch로 정상·HTTP 오류·타임아웃·거절·잘린 응답·깨진 JSON을 재현한다.
서로 다른 유효 모델 응답을 기존 프로필/순서 경로로 보내 불변식만 대조한다.
실호출 실행기는 키가 없으면 PENDING과 사유를 출력하고 네트워크를 호출하지 않는다.
키 설정 뒤 사진 파일을 1개 또는 15개 순차 실행하며 실제 elapsed_ms와 usage만 기록한다. 금액은 실제 청구 증거 없이는 PENDING이다.

공식 계약 확인: 2026-09-17, [Messages](https://platform.claude.com/docs/en/api/messages/create), [Models](https://platform.claude.com/docs/en/api/models/list).
계정 접근·실제 응답·지연·비용은 키 부재로 PENDING이다.
