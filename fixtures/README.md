# 합성 샘플

모든 값·근거·프로필·사진 분석은 사람이 정한 **합성 fixture**다. 실제 Instagram 데이터, 실제 사진 분석, 실제 사용자 취향이나 AI 출력이 아니다.
4종 JSON 중 Profile/PhotoAnalysis는 배열, OrderedFeed는 단일 객체다. PhotoAnalysis는 독립 입력 ID 대조가 가능하도록 전체 15장이다.
현재 프로필 배열은 present와 absent를 모두 포함한다. 기본 feed는 absent를 사용한다.
높은 adjacent_overlap와 empty_caption_ratio는 비움 후보의 재료이며 F2가 caption_state를 결정하지 않는다.
