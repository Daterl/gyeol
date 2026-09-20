# 합성 샘플

모든 값·근거·프로필·사진 분석은 사람이 정한 **합성 fixture**다. 실제 Instagram 데이터, 실제 사진 분석, 실제 사용자 취향이나 AI 출력이 아니다.
4종 JSON 중 Profile/PhotoAnalysis는 배열, OrderedFeed는 단일 객체다. PhotoAnalysis는 독립 입력 ID 대조가 가능하도록 전체 15장이다.
현재 프로필 배열은 present와 absent를 모두 포함한다. 기본 feed는 absent를 사용한다.
높은 adjacent_overlap와 empty_caption_ratio는 비움 후보의 재료이며 F2가 caption_state를 결정하지 않는다.

## 사진 분석의 출처 — heuristic 은 의도다 (#124)

`photo_analysis.sample.json`·`interaction.sample.json`·`test/order.real20.json` 의 PhotoAnalysis 는
전부 `analysis_source: "heuristic"` 이다. 시각 모델을 거치지 않은 **측정값**이며, 이 테스트들이
검사하는 것은 캡션 품질이 아니라 계약·경계·순서 규칙이라 의도적으로 heuristic 을 쓴다.
시각 모델을 거친 실사진 15장(`analysis_source: "vision_model"`)은
`docs/specs/101-caption-quality/inputs.json` 의 `photos_only` 케이스에 있고,
배포 검증기의 오프라인 계약 테스트가 그것을 입력으로 쓴다.
