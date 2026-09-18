# 쓸 거리 단서 — 검증 보고서

Draft PR: https://github.com/Daterl/gyeol/pull/115 (base develop). 시작 때 진행 중, Draft 생성 직후 검토·인수 대기로 갱신했으며 품질 실패에 따라 최종 막힘으로 기록한다.

**Verdict: BLOCKED.** 세 번 수정해 각각 12회, 총 36회의 실모델 응답을 받았다. 설명문은 소재 조각과 질문으로 바뀌었지만 최종 S4 위반 1슬롯·보류 2슬롯, P2 원문 불일치 7건, 자연어 비움 회귀가 남아 완료 조건을 통과하지 못했다. 사람의 1분 내 작성 가능 판정은 **pending**이다.

## 변경과 범위

- prompts/output/caption.md: 기존 text에 `쓸 거리: 소재 · 소재`와 `이 중 기억에 남은 건?`을 제안한다. 마지막 버전은 사실 하나에서 소재 1~2개를 고른다.
- lib/output-generation.js: 비움이 0개일 때 안내의 “문장”을 “쓸 거리”로 맞췄다. 기존 개수 계산·오류 처리·생성 계약은 유지한다.
- test/generate.test.js: 해당 안내 기대값을 갱신했다. 기존 생성·비움 계약 검사를 그대로 실행했다.
- title.md, shared guard, schemas 4종, UI, 사진 분석 코드, 배포 설정은 변경하지 않았다. 새 의존성·후처리·모델 교체로 실패를 숨기지 않았다.

## 측정 입력과 한계

기준 SHA는 `558e21dc3e937d7f787b2c583deec976dea0d1eb`, 브랜치는 `feat/101-caption-seed`, PR 대상은 `develop`이다. 기존 caption-quality의 inputs.json을 바이트 그대로 복사해 4가지 지향(reference/freetext/photos_only/corrected)을 고정했다. 분석 캐시는 이전 실사진 1장 단위 관측을 재사용했으며 이번 실행에서 사진 분석 모델은 다시 호출하지 않았다. 출력 모델만 실제 호출했다.

15개 실사진 파일·15슬롯이지만 [photos.json](photos.json)의 SHA-256상 cq_01과 cq_13은 같아 **독립 이미지 14장**이다. 이전 시도와 동일한 입력 비교를 위해 교체하지 않았다. 15장 독립 표본으로 주장하지 않으며 이 표본에 대한 반복 튜닝은 일반화 증거가 아니다. 원본은 [photos/](photos/)에 보정 없이 복사했다.

모델은 `claude-haiku-4-5-20251001`이며 각 원문에 실제 응답 모델·사용량·시각·입력 및 프롬프트 SHA-256을 기록했다. 호출 시간 제한은 기존 45초, 출력 필터나 응답 재작성은 없다. 키는 프로젝트 루트 .env를 --env-file로 읽었고 파일을 복사하거나 기록하지 않았다.

## 세 번의 실측

|버전|성공/실행|filled / omitted|uploaded_photo note 원문 불일치|자연어 회차 비움(2·6·10·12회차)|판정|
|---|---|---|---|---|---|
|1|12/12|122 / 58|15/410|11 · 7 · 10 · 13|미통과|
|2|12/12|148 / 32|4/357|1 · 5 · 3 · 0|미통과|
|3|12/12|138 / 42|7/180|7 · 6 · 8 · 0|미통과|

1차는 색 수식어 이동으로 은색 버클→은색 벨트, 흰 화분→초록 화분, 검은 리본→녹색 리본 등의 오류가 있었다. 2차에서 원문 발췌와 복사 규칙을 강화했지만 P2 불일치와 비움 회귀가 남았다. 3차에서 사실 하나·소재 1~2개와 여백 지향의 반복 소재 비움을 지시했으나 마지막에도 실패했다. 더 이상 모델 호출이나 튜닝을 하지 않는다.

## 최종 S4와 P2

[S4 전수표](s4-audit.md)와 [기계 판독용 180슬롯](s4-audit.json)에 원본 사진 링크·소재·판정·관측 근거가 있다. 8회차 cq_14의 `검은 스티커`는 원본의 흰 바탕·검은 선 캐릭터를 잘못 축약했다. 7회차 cq_09/cq_12의 `반려견`은 보이는 개에서 관계까지 확장한 표현이라 보류했다. **명확한 위반 1건과 보류 2건으로 0건 게이트 실패**다.

[최종 metrics](run-3-metrics.json)의 note_mismatches에 7건의 원문 불일치를 전부 남겼다. 원문 일치 검사는 P2의 필요 검사이며 그 자체가 소재의 사진 사실성을 증명하지 않는다. `nonliteral_seeds`와 `missing_seed_evidence`는 문자 포함 검사라 의미상 지지 여부와 다르다. 특히 사실 하나 제한 때문에 다른 사실의 소재를 함께 꺼내는 문제가 있어 아래 비교표를 남긴다.

|회차|사진|원문과 달라진 note|
|---|---|---|
|3|cq_15|아래쪽 인물은 크림색 케이블 니트를 입은 사람의 상체가 보인다|
|5|cq_15|위쪽 인물은 연한 녹색 민소매 상의를 겹쳐 입고 있다|
|6|cq_15|아래쪽 인물은 크림색 케이블 니트를 입은 사람의 상체가 보인다|
|7|cq_04|나무 테이블 위에 여러 가지 음식이 놓여 있다|
|7|cq_09|흰 털의 개 한 마리가 분홍색 니트 옷을 입고 있다|
|7|cq_12|흰색과 갈색 털의 개 한 마리가 분홍색 줄무늬 침구 위에 앞다리를 뻗고 엎드려 있다|
|10|cq_15|아래쪽 인물은 크림색 케이블 니트를 입은 사람의 상체가 보인다|

## 최종 12회 출력과 사람 판정표

아래는 최종 12회·180슬롯의 실제 응답이다. 체크칸은 전부 미판정이며 사람이 빈 칸 조건과 비교해 1분 내 실제 작성 여부·문장·시간을 기록해야 한다. 타이틀은 원문을 함께 보여 주되 수정·품질 통과를 주장하지 않는다.

[별도 판정표](run-3-human-review.md) · [실모델 최종 JSON](run-3.json) · [1차 JSON](run-1.json) · [2차 JSON](run-2.json) · [최종 프롬프트 스냅샷](run-3-prompts.json)

# 사람 판정표 — pending

1분 안에 자기 캡션을 쓸 수 있는지는 사람이 판단한다. 에이전트는 체크하지 않았다. 사진만 보고 쓰는 빈 칸 조건과 단서를 보는 조건을 서로 다른 참가자에게 배정하고, 사진 및 조건 순서는 바꾼다. 같은 사람이 같은 사진을 두 번 보고 답하면 학습 효과가 섞이므로 비교 증거로 쓰지 않는다.

각 슬롯의 O/X와 실제 작성 문장·소요 시간을 사람이 기록한다. 비움은 작성 요청이 아니므로 해당 슬롯의 1분 문항은 N/A이며 비움을 유지할지만 별도 판단한다.

## 1회차 — reference

타이틀(수정 대상 아님): 음식과 옷, 일상의 순간들

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 튀김 · 떡<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 올리브색 재킷 · 흰색 스카프<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 흰색 유선 이어폰 · 개<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 파란색과 노란색 줄무늬 모자 · 황록색 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 검은색 핸드백 · 진주 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 연한 녹색 민소매 상의 · 검은 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 크림색 노트 · 검은 글씨 라벨<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 상의 · 반지<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|쓸 거리: 분홍색 니트 옷 · 개<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 갈색 스웨이드 재킷 · 하늘색 주름 치마<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_05](photos/cq_05.jpg)|비움: 비슷한 소재(음식)를 앞자리에서 다뤘어서, 사진만 두는 편을 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 파란색 체크무늬 셔츠 · 진한 청색 청바지<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|쓸 거리: 봉제 인형 · 파란 하트 무늬 바지<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 아이보리색 니트 카디건 · 흰색 자수<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_01](photos/cq_01.jpg)|비움: 앞자리와 같은 소재(모자, 황록색 가방)를 반복해서, 사진만 두는 편을 제안해요.|N/A (비움 유지 ☐)|pending|pending|

## 2회차 — freetext

타이틀(수정 대상 아님): 차분한 색감으로 잇는 열다섯 장

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 노트 · 크림색<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 줄무늬 모자 · 황록색 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 개 · 분홍색 줄무늬 침구<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 갈색 스웨이드 재킷 · 하늘색 주름 치마<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 소파 · 진주 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_15](photos/cq_15.jpg)|비움: 같은 종류의 소재가 여러 사진에 반복되어, 대표 사진에만 단서를 두었습니다.|N/A (비움 유지 ☐)|pending|pending|
|![cq_09](photos/cq_09.jpg)|비움: 앞 사진과의 겹침 신호가 높아, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_07](photos/cq_07.jpg)|비움: 같은 종류의 소재가 여러 사진에 반복되어, 대표 사진에만 단서를 두었습니다.|N/A (비움 유지 ☐)|pending|pending|
|![cq_05](photos/cq_05.jpg)|비움: 앞 사진과의 겹침 신호가 높아, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 줄무늬 종이컵 · 초록 접시<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 파란색 체크무늬 셔츠 · 흰색 천 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|비움: 앞 사진과의 겹침 신호가 높아, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 상의 · 은색 체인 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_02](photos/cq_02.jpg)|비움: 앞 사진과의 겹침 신호가 높아, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_01](photos/cq_01.jpg)|비움: 앞 사진과의 겹침 신호가 높아, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|

## 3회차 — photos_only

타이틀(수정 대상 아님): 옷과 소품, 일상의 순간들

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_01](photos/cq_01.jpg)|쓸 거리: 니트 모자 · 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 카디건 · 자수<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 갈색 재킷 · 숄더백<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_04](photos/cq_04.jpg)|비움: 음식 사진의 세부 요소가 여러 슬롯에 반복되어, 대표 자리 외에는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_05](photos/cq_05.jpg)|비움: 음식 사진의 세부 요소가 여러 슬롯에 반복되어, 대표 자리 외에는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 핸드백 · 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 올리브색 재킷 · 스카프<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 체크무늬 셔츠 · 천 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|비움: 반려동물 사진이 여러 자리에 나타나, 대표 슬롯 외에는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 · 반지<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|비움: 앞선 슬롯들의 의류와 소품이 유사한 맥락으로 반복되어, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_12](photos/cq_12.jpg)|비움: 반려동물 사진이 여러 자리에 나타나, 대표 슬롯 외에는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_13](photos/cq_13.jpg)|비움: 이전에 유사한 구성의 의류와 소품이 제시되었으므로, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_14](photos/cq_14.jpg)|비움: 확인한 관측 사실이 물건의 시각 정보 중심이라 구체적인 쓸 거리를 제안하기 어려워요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 케이블 니트 · 검은 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|

## 4회차 — corrected

타이틀(수정 대상 아님): 음식과 옷, 일상의 소재들

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 튀김 · 떡<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 올리브색 재킷 · 흰색 스카프<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 개 · 노란색 파우치<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 파란색과 노란색 줄무늬 모자 · 황록색 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 검은색 핸드백 · 진주 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 연한 녹색 민소매 상의 · 크림색 케이블 니트<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 크림색 노트 · 분홍색 라벨<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 · 은색 체인 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|비움: 반려동물 소재가 이미 앞에서 다뤄져 새로운 글감을 주지 않아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 갈색 스웨이드 재킷 · 하늘색 주름 치마<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_05](photos/cq_05.jpg)|비움: 음식 소재가 첫 번째 사진에서 이미 제시되어 반복되는 느낌이 있어요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 파란색 체크무늬 셔츠 · 진한 청색 청바지<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|비움: 의류 겹층과 악세서리 조합이 이전 슬롯들과 유사하게 관측되어 새로운 단서를 제공하기 어려워요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 아이보리색 니트 카디건 · 흰색 자수<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_01](photos/cq_01.jpg)|쓸 거리: 회색 니트 모자 · 스마트폰<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|

## 5회차 — reference

타이틀(수정 대상 아님): 음식과 패션, 일상 물건을 담은 열다섯 장

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 초록색 접시 · 튀김<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 올리브색 재킷 · 흰색 스카프<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 개 · 이어폰<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 회색 니트 모자 · 황록색 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 검은색 핸드백 · 진주 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 연한 녹색 민소매 상의 · 초록색 잎<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 노트 · 크림색<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 상의 · 은색 체인 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|쓸 거리: 개 · 분홍색 니트 옷<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 갈색 스웨이드 재킷 · 하늘색 주름 치마<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_05](photos/cq_05.jpg)|쓸 거리: 투명한 유리 접시 · 갈색 과자<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 파란색 체크무늬 셔츠 · 진한 청색 청바지<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|쓸 거리: 봉제 인형 · 하늘색 베개<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 아이보리색 니트 카디건 · 흰색 꽃 자수<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_01](photos/cq_01.jpg)|쓸 거리: 회색 니트 모자 · 스마트폰<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|

## 6회차 — freetext

타이틀(수정 대상 아님): 차분한 톤으로 연결한 일상과 감정

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 노트 · 크림색<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 모자 · 황록색 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 개 · 이어폰<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|비움: 앞 사진들과 비슷한 옷 소재가 반복되어, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_06](photos/cq_06.jpg)|비움: 소파 위 인물 사진이 이전에 제안된 것과 유사해, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 케이블 니트 · 초록 잎<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|비움: 반려동물을 소재로 한 장면이 이미 제시되어, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 흰색 스카프 · 검은 벨트<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_05](photos/cq_05.jpg)|비움: 음식 소재가 이미 나타났으므로, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 튀김 · 종이컵<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 파란색 체크 셔츠 · 흰색 천 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|비움: 인물의 옷과 배경이 이전 슬롯과 유사해, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 은색 체인 목걸이 · 반지<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 니트 카디건 · 꽃 자수<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_01](photos/cq_01.jpg)|비움: 처음 사진과 동일한 구도와 의류로 반복되어, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|

## 7회차 — photos_only

타이틀(수정 대상 아님): 선택한 사진들의 순서

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_01](photos/cq_01.jpg)|쓸 거리: 니트 모자 · 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 카디건 · 자수<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 스웨이드 재킷 · 숄더백<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 음식 · 튀김<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_05](photos/cq_05.jpg)|쓸 거리: 과자 · 초록 잎 식물<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 크림색 소파 · 핸드백<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 올리브색 재킷 · 흰색 스카프<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 체크무늬 셔츠 · 천 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|쓸 거리: 분홍색 니트 옷 · 반려견<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 상의 · 반지<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|쓸 거리: 하늘색 상의 · 봉제 인형<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 분홍색 줄무늬 침구 · 반려견<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 니트 모자 · 조끼형 상의<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 노트 · 스티커<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 초록색 잎 · 케이블 니트<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|

## 8회차 — corrected

타이틀(수정 대상 아님): 음식과 옷, 소품을 담은 15장

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 초록색 접시 · 튀김<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 올리브색 재킷 · 흰색 스카프<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 흰색과 갈색 털의 개 · 노란색 파우치<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 파란색과 노란색 줄무늬 모자 · 황록색 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 검은색 핸드백 · 진주 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_15](photos/cq_15.jpg)|비움: 같은 종류의 인물 사진이 이미 단서에 포함되어 있어, 이 자리는 사진만 두는 편을 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 노트 · 검은 스티커<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 · 은색 체인 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|쓸 거리: 흰 털의 개 · 분홍색 니트 옷<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 갈색 스웨이드 재킷 · 하늘색 주름 치마<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_05](photos/cq_05.jpg)|비움: 음식 소재가 이미 앞 슬롯에서 다루어져 반복을 피하기 위해 이 자리는 사진만 두는 편을 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_08](photos/cq_08.jpg)|비움: 의류 조합이 이미 제시된 슬롯과 유사하여 이 자리는 사진만 두는 편을 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_11](photos/cq_11.jpg)|비움: 인물 실내 촬영이 이미 여러 슬롯에서 제시되어 이 자리는 사진만 두는 편을 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 아이보리색 카디건 · 흰색 꽃 자수<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_01](photos/cq_01.jpg)|비움: 위치 구성과 의류가 4번 슬롯과 같아 이 자리는 사진만 두는 편을 제안해요.|N/A (비움 유지 ☐)|pending|pending|

## 9회차 — reference

타이틀(수정 대상 아님): 음식과 일상의 순간

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 초록색 접시 · 종이컵<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 올리브색 재킷 · 흰색 스카프<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 흰색 유선 이어폰 · 노란색 파우치 포장<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 회색 니트 모자 · 황록색 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 검은색 핸드백 · 진주 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 연한 녹색 민소매 상의 · 크림색 케이블 니트<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 분홍색 배경 라벨 · 책 모양 캐릭터 스티커<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 상의 · 은색 체인 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|쓸 거리: 분홍색 니트 옷 · 남색 라벨 병<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 갈색 스웨이드 재킷 · 하늘색 주름 치마<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_05](photos/cq_05.jpg)|쓸 거리: 투명한 유리 접시 · 흰 화분<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 파란색 체크무늬 셔츠 · 흰색 천 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|쓸 거리: 검은색과 흰색 털 재질 겉옷 · 큰 봉제 인형<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 아이보리색 니트 카디건 · 파란색 체크 하의<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_01](photos/cq_01.jpg)|쓸 거리: 회색 니트 모자 · 남색 조끼형 상의<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|

## 10회차 — freetext

타이틀(수정 대상 아님): 차분한 여백 속 소재들

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 노트 · 라벨<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 모자 · 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 개 · 이어폰<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|비움: 이전 슬롯과 옷·소품 소재가 겹쳐 단서를 반복하게 되어 사진만 두기를 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_06](photos/cq_06.jpg)|비움: 이전 슬롯과 옷·소품 소재가 겹쳐 단서를 반복하게 되어 사진만 두기를 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 니트 · 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|비움: 이전 슬롯과 옷·소품 소재가 겹쳐 단서를 반복하게 되어 사진만 두기를 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_07](photos/cq_07.jpg)|비움: 이전 슬롯과 옷·소품 소재가 겹쳐 단서를 반복하게 되어 사진만 두기를 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_05](photos/cq_05.jpg)|쓸 거리: 과자 · 식물<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 음식 · 튀김<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_08](photos/cq_08.jpg)|비움: 이전 슬롯과 옷·소품 소재가 겹쳐 단서를 반복하게 되어 사진만 두기를 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_11](photos/cq_11.jpg)|쓸 거리: 봉제 인형 · 침구<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_10](photos/cq_10.jpg)|비움: 이전 슬롯과 옷·소품 소재가 겹쳐 단서를 반복하게 되어 사진만 두기를 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_02](photos/cq_02.jpg)|비움: 이전 슬롯과 옷·소품 소재가 겹쳐 단서를 반복하게 되어 사진만 두기를 제안해요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_01](photos/cq_01.jpg)|비움: 앞 사진과 거의 같은 장면·소재로 구성되어 사진만 두기를 제안해요.|N/A (비움 유지 ☐)|pending|pending|

## 11회차 — reference

타이틀(수정 대상 아님): 음식과 옷, 일상의 소품들

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 튀김 · 떡<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 올리브색 재킷 · 흰색 스카프<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 개 · 이어폰<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 회색 니트 모자 · 황록색 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 검은색 핸드백 · 진주 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 연한 녹색 민소매 상의 · 크림색 케이블 니트<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_14](photos/cq_14.jpg)|비움: 앞 사진들에서 반복된 옷과 가방 종류를 주제로, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 상의 · 은색 체인 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|비움: 앞 슬롯에서 다룬 개의 주제와 유사한 내용이라, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 갈색 스웨이드 재킷 · 하늘색 주름 치마<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_05](photos/cq_05.jpg)|비움: 앞 사진들에서 여러 번 다룬 음식 소재를 반복하지 않기 위해 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 파란색 체크무늬 셔츠 · 흰색 천 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|비움: 앞 사진들에서 여러 번 다룬 옷 색상과 소품 종류가 겹치므로, 이 자리는 사진만 두어도 좋아요.|N/A (비움 유지 ☐)|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 아이보리색 니트 카디건 · 파란색 체크 무늬 하의<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_01](photos/cq_01.jpg)|쓸 거리: 회색 니트 모자 · 황록색 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|

## 12회차 — freetext

타이틀(수정 대상 아님): 차분한 일상 속 색감 변주

|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|
|---|---|---|---|---|
|![cq_14](photos/cq_14.jpg)|쓸 거리: 노트 · 라벨<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_13](photos/cq_13.jpg)|쓸 거리: 모자 · 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_12](photos/cq_12.jpg)|쓸 거리: 개 · 이어폰<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_03](photos/cq_03.jpg)|쓸 거리: 스웨이드 재킷 · 숄더백<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_06](photos/cq_06.jpg)|쓸 거리: 핸드백 · 목걸이<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_15](photos/cq_15.jpg)|쓸 거리: 케이블 니트 · 민소매 상의<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_09](photos/cq_09.jpg)|쓸 거리: 분홍색 니트 옷 · 병<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_07](photos/cq_07.jpg)|쓸 거리: 올리브색 재킷 · 스카프<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_05](photos/cq_05.jpg)|쓸 거리: 유리 접시 · 과자<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_04](photos/cq_04.jpg)|쓸 거리: 초록색 접시 · 튀김<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_08](photos/cq_08.jpg)|쓸 거리: 파란색 체크무늬 셔츠 · 천 가방<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_11](photos/cq_11.jpg)|쓸 거리: 봉제 인형 · 베개<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_10](photos/cq_10.jpg)|쓸 거리: 하늘색 니트 상의 · 반지<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_02](photos/cq_02.jpg)|쓸 거리: 아이보리색 카디건 · 체크 하의<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|
|![cq_01](photos/cq_01.jpg)|쓸 거리: 니트 모자 · 울타리<br>이 중 기억에 남은 건?|☐ O ☐ X — pending|pending|pending|


## 다섯 검증 명령

npm ci를 먼저 실행했다(464 packages, audit 취약점 0). 환경 Node v22.22.3/npm 10.9.8이며 package.json의 Node 24.x 요구와 다른 경고가 있었다. Node 24 환경 및 배포 검증은 하지 않았다.

|명령|종료 코드|원문|
|---|---|---|
|npm test|0|[test.log](test.log)|
|npm run eval|0|[eval.log](eval.log)|
|npm run check|0|[check.log](check.log)|
|npm run typecheck|0|[typecheck.log](typecheck.log)|
|npm run lint|0|[lint.log](lint.log)|

### npm test

```text
1..254
# tests 254
# suites 0
# pass 254
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1916.859917
```

### npm run eval

```text
> gyeol@0.1.0 eval
> node eval/run.js

Synthetic manual bootstrap only; no AI quality or human agreement claim.
┌─────────┬─────────┬───────────┬────────┬────────┐
│ (index) │ case    │ invariant │ result │ reason │
├─────────┼─────────┼───────────┼────────┼────────┤
│ 0       │ 'quiet' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'quiet' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'quiet' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'quiet' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'quiet' │ 'E8'      │ 'PASS' │ ''     │
│ 5       │ 'quiet' │ 'E9'      │ 'PASS' │ ''     │
│ 6       │ 'quiet' │ 'E10'     │ 'PASS' │ ''     │
│ 7       │ 'quiet' │ 'E11'     │ 'PASS' │ ''     │
└─────────┴─────────┴───────────┴────────┴────────┘
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
quiet broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
quiet broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
quiet broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_01
┌─────────┬──────────┬───────────┬────────┬────────┐
│ (index) │ case     │ invariant │ result │ reason │
├─────────┼──────────┼───────────┼────────┼────────┤
│ 0       │ 'detail' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'detail' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'detail' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'detail' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'detail' │ 'E8'      │ 'PASS' │ ''     │
│ 5       │ 'detail' │ 'E9'      │ 'PASS' │ ''     │
│ 6       │ 'detail' │ 'E10'     │ 'PASS' │ ''     │
│ 7       │ 'detail' │ 'E11'     │ 'PASS' │ ''     │
└─────────┴──────────┴───────────┴────────┴────────┘
detail broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
detail broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
detail broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
detail broken E6: EXPECTED FAIL — E6.title: expected nonempty string
detail broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
detail broken E9: EXPECTED FAIL — E9: target profile ID differs from actual input
detail broken E10: EXPECTED FAIL — E10: feed.slots.0.rationale.evidence.0.ref does not resolve to an actual input photo
detail broken E11: EXPECTED FAIL — E11: describable fact is not a fact of ph_15
E4/E5/E7: manual spot-check only; real demo review pending.
Injected model variant 0: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).
Injected model variant 1: E1/E2/E3/E8/E9/E10/E11 PASS; foreign fact E11 EXPECTED FAIL (not AI quality).
```

### npm run check

```text
> gyeol@0.1.0 check
> node scripts/check.js

PASS: 75 JS/JSON files checked; four schema examples match fixtures. Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```

### npm run typecheck

```text
> gyeol@0.1.0 typecheck
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
```

### npm run lint

```text
> gyeol@0.1.0 lint
> biome check .

Checked 41 files in 70ms. No fixes applied.
```

## 인계와 남은 일

Draft PR로 실패 증거를 남기며 ready/merge/배포하지 않는다. 최종 칸반은 막힘이다. 사람 판정표는 pending이고, 현재 구현을 S4/P2/P3 통과로 인수해서는 안 된다. 단순 프롬프트 반복을 넘어 소재-원문 근거를 구조적으로 선택·검증하는 접근은 다음 설계 판단이 필요하며 여기서 우회 구현하지 않았다. filled 상태가 그대로여서 화면/내보내기에서 단서를 완성 캡션과 구분하는 인수도 필요하다.

[검증 독립성·범위 검토](verification-review.md)에서 구현 에이전트 자체 검사와 사람 판정, 독립 holdout·교차 리뷰 미실행을 구분했다.
