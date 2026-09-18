# #100 검증 기록

## 관측 결과

- `fixtures/ig_snapshot.json` 30건: `ending_style` 생략
- `caption_len`: p50 289자 → `29cm.official:DdVDlTviVrG`
- `caption_len`: p90 888자 → `29cm.official:DdFvaJRiXnx`
- `empty_caption_ratio`·`caption_len`·`emoji_rate`·`linebreak_habit`: `apify_run:66MzKDhQJ8yDhQ7Fp:caption_population:0a9920b1161abc7946ef046fe81de8a7412712870b0ca40451a916b0fd5ab4b2`를 집계 근거로 사용
- 캡션이 있는 프로필의 language 완전성 최대값: 0.8 (`ending_style` 의도적 미관측)

## 회귀

- fixture 30건과 직접 업로드 경로에서 `ending_style`을 만들지 않는다.
- 정상 해요체·다체·명사형 문장도 신뢰 가능한 구분 근거가 없으므로 생략한다.
- `가요`·`고요`·`수요`·`필요`, `혼다`·`아젠다`·`판다`, 날짜·인원·가격·브랜드 조각은 반복돼도 생략한다.
- `참여 방법`·`참여 조건` 아래 `-`·`•` 불릿, `게시물(에) 좋아요`, `당첨 인원`·`당첨자`도 생략한다.
- 동일 길이 p50·p90은 안정 정렬의 nearest-rank 게시물을 인용한다.
- 같은 source ID의 캡션을 바꾸거나 제어문자가 행 경계와 겹쳐도 SHA-256 `caption_population` digest가 모집단을 구분하는지 검증한다.
- 줄바꿈 note는 `빈 줄이 있는 캡션 N건`으로 계산 단위를 명시한다.
- p50·p90 근거 ref와 글자 수를 골든 픽스처에서 직접 대조한다.

## 무료 게이트

| 명령 | 결과 |
|---|---|
| `node --test test/current_profile.test.js test/apify_ingest.test.js` | 61 PASS |
| `npm test` | 254 PASS |
| `npm run test:ui` | 31 PASS |
| `npm run eval` | PASS; 고의로 깨진 E1·E2·E3·E6·E8·E9·E10·E11은 EXPECTED FAIL |
| `npm run check` | PASS, 75 JS/JSON |
| `npm run lint` | PASS, 41 files |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |

외부 네트워크·모델·Apify 호출은 실행하지 않았다.
