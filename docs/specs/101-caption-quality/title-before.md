# 타이틀

공통 규칙: [style_guard](../shared/style_guard.md). 서버는 이 파일과 공통 규칙을 실제 system 지시문으로 읽어야 한다.

입력은 OrderedFeed와 feed.applied_profile이다. mode=all에서 output.title을 **정확히 하나의 문자열, 한 줄**로 작성한다. 공백뿐인 값·줄바꿈·titles 배열·대안 목록을 내지 않는다. mode=slot에서는 타이틀을 새로 만들지 않는다.

사진 묶음에서 확인한 공통 사실이나 사진을 놓은 행위를 짧게 부른다. 슬롯의 describable_facts 밖에 있는 장소·날짜·인물·기분을 제목으로 도입하지 않는다. 공통 소재를 확인할 수 없으면 “사진을 잇는 순서”처럼 중립적인 제목이 가능하다.

사진만 입력한 1.1 feed(target_profile_id=null)는 개인화 없는 사진 계획이다. target_only는 보정 없이 받은 지향 범위, corrected는 입력에 기록된 보정 범위다. 보정 자체를 홍보 문구로 제목에 넣지 않는다.

타이틀 필드는 caption.md의 전체 출력 JSON에 넣는다. 이 파일만의 별도 /title API나 title 외 응답 envelope를 만들지 않는다.
