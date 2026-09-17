# 검증 보고

기준 SHA: e4901582b9e99586f975155ab8f853ab3689c34e. 최초 Node 22 테스트 후 Node v24.21.0으로 필수 검증을 재실행했다.

## 결과
키 없는 기반 구현 PASS. 실제 AI 품질·왕복 시간·15장 시간·금액·서버 실행시간 상한 PENDING.
사진 클라이언트·계약 실패 전파·캐시 분리·경로 고지·순차 실측 실행기를 추가했다.
기존 target/current 집계 및 order/feed 휴리스틱을 보존했고 스키마·화면·배포 설정·의존성은 변경하지 않았다.

## DoD 확인
- ✅ lib/model.js의 키 부재는 missing_api_key로 노출하고 직접 모델 호출은 MODEL_KEY_MISSING으로 실패한다.
- ✅ 잘못된 enum·빈 문자열·범위 밖 색·identity 주입·중복 판정·누락 필드를 실제 주입하여 MODEL_CONTRACT 오류를 확인했다.
- ✅ 실패 후 캐시 크기 0 및 다음 정상 응답 재호출을 테스트했다. 키/모델 전환과 반환값 오염도 검사했다.
- ✅ spec.md에 자동 불변식과 수동 사진 대조 항목을 구분했다.
- ✅ 키만 설정한 기본 클라이언트가 프롬프트 파일을 읽고 Models/Messages 요청을 보내는 것을 가짜 fetch로 확인했다. 실제 계정 호출은 PENDING이다.
- ✅ npm test / npm run eval / npm run check 실제 출력은 아래에 있다.
- ✅ 실측 실행기는 키 없이 PENDING을 출력한다. 추정 시간·비용은 기록하지 않았다.

## 검증 해석
mandela 감사: Shared hallucination/Tautology 위험은 E11의 원 PhotoAnalysis를 외부 정답으로 오인하는 지점에 있다.
가짜 모델 응답·골든 파일은 배선/계약만 검증한다. 독립 정답은 원본 사진을 사람이 대조한 기록이어야 하며 현재 PENDING이다.
변형된 두 응답의 문자열은 비교하지 않고 E1/E2/E3/E8/E9/E10/E11을 검사한다. E6은 기존 F3 골든 경로에서 검사하며 사진 모델 경로에서 제목 생성을 주장하지 않는다.
ssotize 읽기 전용 감사: 모델 기본값은 config/models.json 단일 원천이다. 이전 사진 명세의 폴백 정책과 달라진 부분은 새 spec의 대체 범위를 명시했고 과거 보고서는 수정하지 않았다.

## 미완료·인계
- 실제 API 키 없음: 계정 접근, 모델 품질, 지연·토큰·청구 비용, 서버 A1 확인 PENDING.
- Next.js `/api/analyze` 어댑터·화면 통합은 이 변경에 포함하지 않는다. 기존 Node 서버/API 및 라이브러리 경로를 제공한다.
- target/current 프롬프트는 기존처럼 미배선이고 숫자 집계를 모델에게 맡기지 않는다.
- 두 모델의 최종 동일 diff 재현 리뷰·사람 리뷰·merge·배포 검증 PENDING.
- 칸반 조회: read:project 스코프 부족으로 생략, 이슈 댓글로 시작 상태를 기록했다.

## 추가 검사

npm ci --ignore-scripts 후 lint·typecheck PASS. package/lock 변경 없음.
필수 명령은 `npm exec --yes --package=node@24 -- npm test` 형식으로 Node 24 PATH를 사용했다.

## npm test (Node 24)

```text

> gyeol@0.1.0 test
> node --test test/*.test.js

✔ GET mock returns 15 slots and all four resources (25.877625ms)
✔ live is explicit error, invalid query and method are controlled (0.312125ms)
✔ mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts (210.979709ms)
✔ four sample types and independent golden input files satisfy contracts (68.4155ms)
✔ E1: valid input passes and stored broken fixture fails (5.275042ms)
✔ E2: valid input passes and stored broken fixture fails (6.995709ms)
✔ E3: valid input passes and stored broken fixture fails (3.102166ms)
✔ E6: valid input passes and stored broken fixture fails (9.521042ms)
✔ E8: valid input passes and stored broken fixture fails (5.258125ms)
✔ E9: valid input passes and stored broken fixture fails (4.353ms)
✔ E10: valid input passes and stored broken fixture fails (1.93025ms)
✔ E11: valid input passes and stored broken fixture fails (3.633291ms)
✔ 3 photo boundary passes (0.87175ms)
✔ 20 photo boundary passes (0.864208ms)
✔ 2 input photos rejected (0.196834ms)
✔ 21 input photos rejected (0.041459ms)
✔ reject duplicate output ID despite true flag (0.7255ms)
✔ reject missing slot despite declared output count (0.08675ms)
✔ reject foreign replacement ID with same count (0.062834ms)
✔ reject lying counts (0.392209ms)
✔ reject count string (0.1525ms)
✔ reject unique flag string (0.060583ms)
✔ reject position string (0.065916ms)
✔ reject duplicate position (0.144791ms)
✔ reject zero position (0.27375ms)
✔ reject fractional position (0.085291ms)
✔ reject missing rationale Claim (0.157625ms)
✔ reject evidence missing (0.136917ms)
✔ reject evidence wrong type (0.089917ms)
✔ reject invalid confidence (0.229ms)
✔ reject empty evidence reference (0.155708ms)
✔ reject overlap string (0.090042ms)
✔ reject invented current input (0.072041ms)
✔ reject false corrected claim (0.061667ms)
✔ reject unknown delta (0.099042ms)
✔ duplicate/malformed actual input rejected (0.065291ms)
✔ E2 does not trust output input_count/unique flags as expected input IDs (0.345667ms)
✔ E8 uses actual absent input even if response invents consistent correction (1.504625ms)
✔ validateFeed rejects missing current context with target-only disclosure (0.176375ms)
✔ E8 rejects missing current context with target-only disclosure (0.62775ms)
✔ validateFeed rejects undefined current context with target-only disclosure (0.039875ms)
✔ E8 rejects undefined current context with target-only disclosure (0.382375ms)
✔ validateFeed rejects missing current context with invented correction (0.034583ms)
✔ E8 rejects missing current context with invented correction (0.826917ms)
✔ validateFeed rejects undefined current context with invented correction (0.048416ms)
✔ E8 rejects undefined current context with invented correction (0.365416ms)
✔ profile absence/types/rule-only claims are checked (0.297167ms)
✔ photo field types are checked (0.103708ms)
✔ reject title null (0.302459ms)
✔ reject title [] (0.029709ms)
✔ reject title ["one","two"] (0.035125ms)
✔ reject title "" (0.020792ms)
✔ reject title " " (0.018375ms)
✔ reject title "one\ntwo" (0.138417ms)
✔ reject title "one\rtwo" (0.164709ms)
✔ reject title 3 (0.365708ms)
✔ reject title "one two" (0.177583ms)
✔ F3 export retains stable identity at every position, including after reorder (0.805333ms)
✔ E4/E5/E7 are intentionally not automated quality checks (0.167666ms)
✔ user caption rejects photo-only evidence (0.084834ms)
✔ user caption accepts valid user_text evidence with additional photo evidence (0.638625ms)
✔ present current can be honestly corrected with the single supported delta (0.348125ms)
✔ absent account and extra title fields cannot smuggle contradictory states (0.27775ms)
✔ validateFeed rejects an invented target profile ID (0.858541ms)
✔ validateFeed and validateExport reject evidence that resolves to no input photo (2.881125ms)
✔ validateFeed rejects describable_facts copied from another real photo (1.594916ms)
✔ golden bundle carries its own PhotoAnalysis matching the input manifest (9.13825ms)
✔ 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다 (8.532792ms)
✔ 부재 프로필은 target_only 공개와 정합하다 (E8) (0.704167ms)
✔ 스냅샷 재생 경로가 source:"cached" 프로필을 만든다 (3.205959ms)
✔ 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다 (4.241917ms)
✔ 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다 (123.680625ms)
✔ empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다 (2.164334ms)
✔ 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다 (0.596042ms)
✔ 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다 (0.190417ms)
✔ opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다 (3.718917ms)
✔ opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다 (3.760833ms)
✔ 어떤 경로에서도 문자열 '불명' 이 나오지 않는다 (1.550042ms)
✔ 직접 업로드 경로가 사진 분석에서 visual 을 집계한다 (0.195167ms)
✔ hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다 (0.15825ms)
✔ 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2) (2.07575ms)
✔ 입력을 섞거나 형식이 어긋나면 거부한다 (0.765708ms)
✔ 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다 (0.064916ms)
✔ 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다 (0.321458ms)
✔ A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1) (5.702917ms)
✔ opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2) (0.43025ms)
✔ subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2) (0.477083ms)
✔ ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2) (0.220291ms)
✔ 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2) (0.372542ms)
✔ missing key reports heuristic route and direct model calls fail without network (4.9065ms)
✔ wire format carries exactly one image and returns observed usage/model/time (32.678084ms)
✔ 429/529 retry once; auth errors never retry or expose provider body (308.299416ms)
✔ deadline bounds discovery and stalled response parsing; no network retry (22.295208ms)
✔ refusal, truncation, malformed JSON and non-object responses fail explicitly (0.9755ms)
✔ key alone activates production client and loaded prompt; invalid response is not cached (2.977333ms)
✔ HTTP exposes model contract failure instead of returning heuristic success (1.202792ms)
✔ measured fixture itself satisfies the PhotoAnalysis contract (0.738334ms)
✔ 3 photos produce 3 slots covering positions 1..3 exactly once (17.419375ms)
✔ 15 photos produce 15 slots covering positions 1..15 exactly once (2.724209ms)
✔ 20 photos produce 20 slots covering positions 1..20 exactly once (5.855958ms)
✔ every eval invariant except the F3 export one passes on a generated feed (2.824459ms)
✔ no slot is justified by rules alone, and every photo evidence resolves to its own slot (1.198541ms)
✔ rationales never speak of scale, absent faces or "여백" (2.74175ms)
✔ two target profiles order the same photos differently (3.821083ms)
✔ the same input produces byte-identical output (3.574458ms)
✔ an absent current profile ends normally as target_only (1.095333ms)
✔ a present current profile is reported but not yet used to correct (0.497334ms)
✔ caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot (0.952417ms)
✔ carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap (10.341542ms)
✔ a bonus that flipped the opener is named as the reason, not hidden behind the measurement (3.561375ms)
✔ photo-only input is rejected here; the photo-only DoD belongs to the wiring layer (1.654584ms)
✔ rejects inputs the contract cannot accept instead of guessing (1.143416ms)
✔ heuristic output satisfies the PhotoAnalysis contract and is deterministic (4.0755ms)
✔ heuristic never reports a subject, place, time or mood — only measured values (3.637708ms)
✔ selected model failure is explicit and never cached (1.806208ms)
✔ model observations are accepted but measured color overrides the model estimate (0.379458ms)
✔ contract violations fail before correction and never enter cache (0.87225ms)
✔ key/model namespaces separate heuristic and model cache; callers cannot poison cached facts (0.299458ms)
✔ same bytes twice: zero extra model calls, identity re-stamped, duplicate reported (0.173333ms)
✔ cache is bounded and holds no more than CACHE_LIMIT entries (3.628ms)
✔ unobservable bytes fail honestly instead of inventing color (0.493708ms)
✔ jpeg DC reader returns a real block grid and rejects what it cannot read (0.207208ms)
✔ baseline JPEG is measured, not mis-read: solid colours are exact (2.634209ms)
✔ baseline and progressive encodings of the same pixels agree (3.091459ms)
✔ SVG is measured only as the flat-colour card it claims to support (0.3555ms)
✔ SVG text is reported only when a viewer could see it, and unescaped (1.587875ms)
✔ composition is a documented constant, not a reading of the colour histogram (4.730416ms)
✔ POST one photo returns one PhotoAnalysis (0.516125ms)
✔ there is no many-photos-per-request path (0.171625ms)
✔ request validation is explicit at the trust boundary (79.205875ms)
✔ data URL prefixes are accepted, not silently mangled (0.358958ms)
✔ the heuristic path makes zero outbound attempts with the network disabled (50.360875ms)
✔ both input paths produce the same TargetProfile schema with their own source (1.41525ms)
✔ what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence (0.838709ms)
✔ E1: every Claim in both profiles and the photo plan carries at least one evidence (0.195459ms)
✔ no profile item is made of rule evidence alone (0.130125ms)
✔ a free text mapping cites the matched phrase and the mapping row separately (0.163083ms)
✔ an aggregate value can be traced back to the posts it was read from (0.073375ms)
✔ free text never invents an empty caption ratio and never rounds up to a default (0.182542ms)
✔ free text is the floor that always succeeds, but blank input is not natural language (0.199042ms)
✔ an unprepared URL fails and names the fallbacks instead of borrowing another account (0.175583ms)
✔ the photo only path returns a plan, never a TargetProfile with an undefined absent state (0.469042ms)
✔ the photo only path claims no preference and no sentence (0.552292ms)
✔ the photo plan aggregates only what a photo can show, and the mixes stay exact (0.105583ms)
✔ boundary: an all blank snapshot yields no language and a carousel free one yields no opener (0.1445ms)
✔ the two golden profiles differ in a way a reader can see (5.292916ms)
✔ H1: a negated or contrasted wish is left empty, never flipped into a positive one (0.588291ms)
✔ H1 control: a plainly positive wish still fills the same fields it always did (0.504583ms)
✔ H2: editing a returned profile never changes what the next call returns (3.41275ms)
✔ H3: profile evidence must resolve to the actual input, not merely exist (0.576583ms)
ℹ tests 150
ℹ suites 0
ℹ pass 150
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 835.067
```

## npm run eval (Node 24)

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

## npm run check (Node 24)

```text

> gyeol@0.1.0 check
> node scripts/check.js

PASS: 49 JS/JSON files checked; four schema examples match fixtures. Foundation JS syntax/JSON parsing; TypeScript is checked separately by npm run typecheck.
```

## 키 없는 실측 실행기

```text
.env not found. Continuing without it.
{
  "status": "PENDING",
  "reason": "missing_api_key",
  "source": "heuristic",
  "single_photo_latency_ms": "PENDING",
  "fifteen_photo_total_ms": "PENDING",
  "cost": "PENDING"
}
```

## npm run lint

```text

> gyeol@0.1.0 lint
> biome check .

Checked 18 files in 17ms. No fixes applied.
```

## npm run typecheck

```text

> gyeol@0.1.0 typecheck
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
```

## 실제 로컬 HTTP smoke

키를 비운 Node 서버를 임의 포트에 띄우고 JPEG 한 장을 POST했다. 외부 모델 요청은 없다.

```text
{
  "status": 200,
  "source_header": "heuristic",
  "reason_header": "missing_api_key",
  "analysis_source": "heuristic",
  "photo_id": "smoke"
}
```
