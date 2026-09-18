# #100 CurrentProfile 언어 집계 근거

## 결정

- 현재의 rule 기반 추출로는 한국어 종결형과 명사·브랜드·메타데이터를 신뢰성 있게 구분할 수 없다. `buildCurrentProfile`은 `ending_style`을 만들지 않는다.
- 정상 문장도 포함해 `해요`·`다`·`명사형`을 표면 suffix로 추정하지 않는다. `가요`·`고요`·`수요`·`필요`, `혼다`·`아젠다`·`판다`, 날짜·가격·인원, 불릿 이벤트 안내가 반복돼도 항상 생략한다.
- `caption_len`은 전수 집계 근거와 실제 p50·p90 게시물을 같이 남긴다.
- `empty_caption_ratio`·`emoji_rate`·`linebreak_habit`은 일부 게시물로 전수 값을 대표시키지 않고 `kind:"aggregate"`로 집계 모집단·합계·분모를 명시한다.
- `aggregate.ref`는 source ID에 canonical JSON `[[shortcode,caption], ...]`의 SHA-256을 `caption_population:<digest>`로 붙인다. 같은 snapshot/run ID라도 모집단이 다르면 ref가 달라지고, 캡션 안의 제어문자도 행 경계와 섞이지 않는다.
- Apify 정규화 스냅샷은 위 모집단 ref를 `provenance.evidence_refs`에 등록해 집계 Claim에서 원본 실행까지 역추적할 수 있게 한다.

## 계약 경계

`CurrentProfile` 계약에는 `ending_style`이 선택 필드로 남아 있지만 이 추출기는 항상 생략한다. 형태소 분석이나 검증된 구조화 입력처럼 명사·브랜드·메타데이터와 실제 종결형을 구분할 수 있는 근거가 생기기 전에는 이 필드를 채우지 않는다. 지원 suffix 목록이나 예외 목록을 늘려 신뢰도를 가장하지 않는다.

`language` 완전성은 계약상 가능한 5개 항목을 분모로 유지한다. 캡션이 있으면 측정 가능한 `empty_caption_ratio`·`caption_len`·`emoji_rate`·`linebreak_habit`만 채우므로 최대값은 0.8이다. 이는 `ending_style`을 의도적으로 미관측 처리한 결과다.

## 29cm.official 30건 오프라인 재생

- `ending_style`: 생략
- `caption_len`: `p50=289` (`DdVDlTviVrG`), `p90=888` (`DdFvaJRiXnx`)
- 같은 길이가 여러 건이면 JavaScript의 안정 정렬로 입력 순서를 유지한 뒤 nearest-rank 위치의 게시물을 인용한다.
- `empty_caption_ratio`·`caption_len`·`emoji_rate`·`linebreak_habit`은 동일한 SHA-256 caption population ref를 사용한다.

30건의 캡션 자체만으로는 한국어 말끝의 품사·문맥을 검증할 수 없으므로 종결 어절 덤프와 분류 수치는 제품 근거로 사용하지 않는다.
