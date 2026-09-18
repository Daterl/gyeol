# 실행 계획

1. fixtures/interaction.sample.json을 먼저 작성한다.
2. 기존 contracts.js를 재사용해 PhotoPlan 참조 및 편집 export 검사를 추가한다. PhotoPlan validator는 contracts로 옮겨 중복을 피한다.
3. lib/interaction.js에 요청/응답 경계, lib/upload.js에 실제 이미지 header/byte 검사를 둔다. 서버/브라우저 소비 코드는 후속 leaf가 사용한다.
4. test/interaction.test.js에서 정상/부정 fixture와 ID·버전·해상도·오류/재정렬 경계를 확인한다.
5. schemas/interaction.md·ordered_feed.md를 동기화하고 실제 검증/동일 diff 리뷰 후 develop PR로 인수한다.

Shared: lib/contracts.js, lib/target_profile.js, schemas 및 fixtures. order.js와 현재 진행 중인 #41 파일은 수정하지 않는다. 기존 네 개 1.0 sample을 바꾸지 않는 additive 1.1 확장이다.
