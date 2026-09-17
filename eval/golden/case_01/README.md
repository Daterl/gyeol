# 수동 bootstrap 골든 1케이스

합성 SVG 카드 15개로 된 입력 1벌 × 수동 TargetProfile 2벌이다. 실제 사진이 아니며 카드 파일·분석·순서·export 모두 합성 예시다.
photo_analysis.json은 이 번들의 사진 사실 원천이며 E11(사진→재료 복사) 대조에 쓴다. fixtures/photo_analysis.sample.json과 같은 15장이지만 골든 번들만으로 대조가 되도록 여기에도 둔다.
input.json의 photo_ids는 출력과 별도로 유지하는 입력 원천이다. 출력의 invariants나 slots에서 기대 ID를 재생성하지 않는다.
두 순서는 수동으로 다르게 정했다. 이 차이는 모델 개인화 품질이나 D6 완료 증거가 아니다.
TargetProfile 2벌은 **#10 에서 추출 결과로 교체됐다.** `node scripts/make_golden_targets.js` 로 재생성하며 손으로 고치지 않는다.
- `target_quiet.json` = 자연어 "조용하고 짧게, 이모지 없이 해요체로" (`source: freetext`)
- `target_detail.json` = 사전 수집 스냅샷 `fixtures/ref_snapshot.sample.json` 30건 집계 (`source: ig_reference`, 실제 공개 계정 29cm)
`ordered_*.json` 의 `applied_profile` 은 같은 스크립트가 거울로 다시 쓴다. 교체 전후 불변식 결과는 동일했다(`docs/specs/10-target-profile/report.md`).
E9(지향축 ID 대조)·E10(evidence ref 해소)·E11(사진→재료 복사)도 정상 통과 1벌 + eval/broken 의도적 실패 1벌씩 갖는다.
사진(SVG 카드 15장)·순서·export 는 여전히 합성이다. 실제 데모 사진으로 교체·사람 전수 대조는 pending.
E4/E5/E7은 자동 판정하지 않는다. 수동 스팟체크로 대체하며 실제 데모 검증은 pending이다.
