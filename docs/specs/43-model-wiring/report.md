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
- 칸반: 시작 시 read:project 스코프 부족으로 댓글로 기록했다. Draft 생성 후 재조회에서 권한이 사용 가능해져 실제 칸 `검토·인수 대기`로 갱신하고 확인했다.

## Draft PR과 리뷰

[Draft PR 45](https://github.com/Daterl/gyeol/pull/45), base=dev. merge·배포·이슈 자동 종료 없음.
최초 diff의 CodeRabbit 지적 0건, 별도 Claude Opus 5의 콜드 리드 지적 및 처리 내역은 [review.md](review.md)에 있다.
SVG HTTP 상태 수정은 이전 코드에서 실패하고 수정 뒤 통과하는 회귀 검사로 확인했다.
최종 결과: Node 24 테스트 151개 PASS, eval PASS, check PASS. 실모델·최종 두 모델 재현 리뷰는 PENDING.

## 추가 검사

npm ci --ignore-scripts 후 lint·typecheck PASS. package/lock 변경 없음.
필수 명령은 `npm exec --yes --package=node@24 -- npm test` 형식으로 Node 24 PATH를 사용했다.

## npm test (Node 24)

```text

> gyeol@0.1.0 test
> node --test test/*.test.js

✔ GET mock returns 15 slots and all four resources (6.551084ms)
✔ live is explicit error, invalid query and method are controlled (0.234042ms)
✔ mock works with fetch/HTTP/HTTPS/socket/DNS disabled; zero outbound attempts (234.528167ms)
✔ four sample types and independent golden input files satisfy contracts (25.563084ms)
✔ E1: valid input passes and stored broken fixture fails (2.998375ms)
✔ E2: valid input passes and stored broken fixture fails (2.101584ms)
✔ E3: valid input passes and stored broken fixture fails (1.136041ms)
✔ E6: valid input passes and stored broken fixture fails (1.32125ms)
✔ E8: valid input passes and stored broken fixture fails (1.127041ms)
✔ E9: valid input passes and stored broken fixture fails (1.071708ms)
✔ E10: valid input passes and stored broken fixture fails (1.222833ms)
✔ E11: valid input passes and stored broken fixture fails (1.241792ms)
✔ 3 photo boundary passes (0.349042ms)
✔ 20 photo boundary passes (0.301333ms)
✔ 2 input photos rejected (0.17525ms)
✔ 21 input photos rejected (0.0465ms)
✔ reject duplicate output ID despite true flag (0.119625ms)
✔ reject missing slot despite declared output count (0.065708ms)
✔ reject foreign replacement ID with same count (0.056875ms)
✔ reject lying counts (0.220209ms)
✔ reject count string (0.07525ms)
✔ reject unique flag string (0.059917ms)
✔ reject position string (0.062333ms)
✔ reject duplicate position (0.056916ms)
✔ reject zero position (0.063208ms)
✔ reject fractional position (0.058042ms)
✔ reject missing rationale Claim (0.089541ms)
✔ reject evidence missing (0.083ms)
✔ reject evidence wrong type (0.070208ms)
✔ reject invalid confidence (0.068042ms)
✔ reject empty evidence reference (0.070125ms)
✔ reject overlap string (0.082458ms)
✔ reject invented current input (0.062917ms)
✔ reject false corrected claim (0.058417ms)
✔ reject unknown delta (0.056417ms)
✔ duplicate/malformed actual input rejected (0.069417ms)
✔ E2 does not trust output input_count/unique flags as expected input IDs (0.238917ms)
✔ E8 uses actual absent input even if response invents consistent correction (0.393667ms)
✔ validateFeed rejects missing current context with target-only disclosure (0.131541ms)
✔ E8 rejects missing current context with target-only disclosure (0.188209ms)
✔ validateFeed rejects undefined current context with target-only disclosure (0.023583ms)
✔ E8 rejects undefined current context with target-only disclosure (0.122334ms)
✔ validateFeed rejects missing current context with invented correction (0.027625ms)
✔ E8 rejects missing current context with invented correction (0.141208ms)
✔ validateFeed rejects undefined current context with invented correction (0.021667ms)
✔ E8 rejects undefined current context with invented correction (0.316042ms)
✔ profile absence/types/rule-only claims are checked (0.203875ms)
✔ photo field types are checked (0.081584ms)
✔ reject title null (0.0325ms)
✔ reject title [] (0.01775ms)
✔ reject title ["one","two"] (0.017791ms)
✔ reject title "" (0.016833ms)
✔ reject title " " (0.018333ms)
✔ reject title "one\ntwo" (0.061458ms)
✔ reject title "one\rtwo" (0.025333ms)
✔ reject title 3 (0.020917ms)
✔ reject title "one two" (0.020667ms)
✔ F3 export retains stable identity at every position, including after reorder (0.277208ms)
✔ E4/E5/E7 are intentionally not automated quality checks (0.14725ms)
✔ user caption rejects photo-only evidence (0.072791ms)
✔ user caption accepts valid user_text evidence with additional photo evidence (0.110666ms)
✔ present current can be honestly corrected with the single supported delta (0.289375ms)
✔ absent account and extra title fields cannot smuggle contradictory states (0.051084ms)
✔ validateFeed rejects an invented target profile ID (0.366709ms)
✔ validateFeed and validateExport reject evidence that resolves to no input photo (0.513792ms)
✔ validateFeed rejects describable_facts copied from another real photo (0.592417ms)
✔ golden bundle carries its own PhotoAnalysis matching the input manifest (5.464875ms)
✔ 아무것도 안 올리면 present:false 로 정상 종료한다 — 에러가 아니다 (3.502125ms)
✔ 부재 프로필은 target_only 공개와 정합하다 (E8) (1.141834ms)
✔ 스냅샷 재생 경로가 source:"cached" 프로필을 만든다 (1.073583ms)
✔ 같은 스냅샷을 두 번 재생하면 완전히 같은 결과가 나온다 (1.400458ms)
✔ 네트워크를 끊어도 스냅샷 재생 결과가 같고 외부 호출 시도가 0회다 (57.992875ms)
✔ empty_caption_ratio 는 캡션 입력이 있을 때만 존재한다 (0.932583ms)
✔ 캡션이 전부 비어 있으면 비율만 남고 나머지 언어 습관은 생략된다 (0.210583ms)
✔ 캡션 1건이면 p50 === p90 이고 스키마의 p90 >= p50 이 유지된다 (0.13675ms)
✔ opener_tendency 는 캐러셀 1번 분석이 실제로 들어왔을 때만 나온다 (1.682958ms)
✔ opener 분류가 동률이거나 스냅샷과 무관하면 opener_tendency 를 생략한다 (1.098292ms)
✔ 어떤 경로에서도 문자열 '불명' 이 나오지 않는다 (1.899167ms)
✔ 직접 업로드 경로가 사진 분석에서 visual 을 집계한다 (1.38275ms)
✔ hue 평균은 원형 평균이라 359도와 1도를 180도로 만들지 않는다 (0.121542ms)
✔ 모든 프로필 Claim 은 근거를 갖고 rule 만으로 이루어지지 않는다 (E1 · P2) (1.481291ms)
✔ 입력을 섞거나 형식이 어긋나면 거부한다 (1.139625ms)
✔ 스냅샷 fixture 가 A2 판정을 근거와 함께 기록하고 있다 (0.068ms)
✔ 같은 사진이라도 캡션 관측 여부가 다르면 다른 프로필 ID 다 (1.175333ms)
✔ A2 판정이 "같다" 가 아닌 스냅샷에서는 opener_tendency 를 내지 않는다 (H1) (4.027ms)
✔ opener_tendency 의 근거는 그 성향으로 분류된 캐러셀만 가리킨다 (H2) (0.411417ms)
✔ subjects 의 근거는 그 피사체가 실제로 찍힌 사진만 가리킨다 (H2) (0.246459ms)
✔ ending_style 의 근거는 그 끝맺음으로 분류된 캡션만 가리킨다 (H2) (0.116042ms)
✔ 집계 Claim 의 근거 note 는 어떤 관측 집합에서 계산했는지 밝힌다 (H2) (0.402708ms)
✔ missing key reports heuristic route and direct model calls fail without network (0.877ms)
✔ wire format carries exactly one image and returns observed usage/model/time (14.613084ms)
✔ 429/529 retry once; auth errors never retry or expose provider body (304.793292ms)
✔ deadline bounds discovery and stalled response parsing; no network retry (22.108167ms)
✔ refusal, truncation, malformed JSON and non-object responses fail explicitly (0.886708ms)
✔ key alone activates production client and loaded prompt; invalid response is not cached (2.672791ms)
✔ HTTP exposes model contract failure instead of returning heuristic success (1.05825ms)
✔ key-present SVG is an explicit 415 from the production HTTP client, with no network (0.966417ms)
✔ measured fixture itself satisfies the PhotoAnalysis contract (0.740458ms)
✔ 3 photos produce 3 slots covering positions 1..3 exactly once (1.991708ms)
✔ 15 photos produce 15 slots covering positions 1..15 exactly once (2.099875ms)
✔ 20 photos produce 20 slots covering positions 1..20 exactly once (1.744917ms)
✔ every eval invariant except the F3 export one passes on a generated feed (3.409625ms)
✔ no slot is justified by rules alone, and every photo evidence resolves to its own slot (0.599042ms)
✔ rationales never speak of scale, absent faces or "여백" (1.117333ms)
✔ two target profiles order the same photos differently (2.41925ms)
✔ the same input produces byte-identical output (2.08425ms)
✔ an absent current profile ends normally as target_only (0.638125ms)
✔ a present current profile is reported but not yet used to correct (0.534791ms)
✔ caption inputs carry only that photo own facts, one visual peak and no overlap at the first slot (0.477292ms)
✔ carousel opener tendency only nudges when it was actually observed, and cannot outrank a large measured gap (2.774459ms)
✔ a bonus that flipped the opener is named as the reason, not hidden behind the measurement (1.310083ms)
✔ photo-only input is rejected here; the photo-only DoD belongs to the wiring layer (0.889ms)
✔ rejects inputs the contract cannot accept instead of guessing (0.279541ms)
✔ heuristic output satisfies the PhotoAnalysis contract and is deterministic (5.556792ms)
✔ heuristic never reports a subject, place, time or mood — only measured values (3.747917ms)
✔ selected model failure is explicit and never cached (2.686834ms)
✔ model observations are accepted but measured color overrides the model estimate (0.75975ms)
✔ contract violations fail before correction and never enter cache (0.928458ms)
✔ key/model namespaces separate heuristic and model cache; callers cannot poison cached facts (0.298ms)
✔ same bytes twice: zero extra model calls, identity re-stamped, duplicate reported (0.177166ms)
✔ cache is bounded and holds no more than CACHE_LIMIT entries (3.036583ms)
✔ unobservable bytes fail honestly instead of inventing color (0.332291ms)
✔ jpeg DC reader returns a real block grid and rejects what it cannot read (0.233833ms)
✔ baseline JPEG is measured, not mis-read: solid colours are exact (2.998125ms)
✔ baseline and progressive encodings of the same pixels agree (4.1005ms)
✔ SVG is measured only as the flat-colour card it claims to support (0.564917ms)
✔ SVG text is reported only when a viewer could see it, and unescaped (0.385167ms)
✔ composition is a documented constant, not a reading of the colour histogram (1.5305ms)
✔ POST one photo returns one PhotoAnalysis (0.712541ms)
✔ there is no many-photos-per-request path (0.163541ms)
✔ request validation is explicit at the trust boundary (32.195333ms)
✔ data URL prefixes are accepted, not silently mangled (0.25825ms)
✔ the heuristic path makes zero outbound attempts with the network disabled (70.008ms)
✔ both input paths produce the same TargetProfile schema with their own source (0.563791ms)
✔ what should be empty is empty: free text sees no photo, a reference snapshot sees no user sentence (0.342042ms)
✔ E1: every Claim in both profiles and the photo plan carries at least one evidence (0.153125ms)
✔ no profile item is made of rule evidence alone (0.124166ms)
✔ a free text mapping cites the matched phrase and the mapping row separately (0.133083ms)
✔ an aggregate value can be traced back to the posts it was read from (0.063959ms)
✔ free text never invents an empty caption ratio and never rounds up to a default (0.157375ms)
✔ free text is the floor that always succeeds, but blank input is not natural language (0.165334ms)
✔ an unprepared URL fails and names the fallbacks instead of borrowing another account (0.150666ms)
✔ the photo only path returns a plan, never a TargetProfile with an undefined absent state (0.12725ms)
✔ the photo only path claims no preference and no sentence (0.865334ms)
✔ the photo plan aggregates only what a photo can show, and the mixes stay exact (0.100125ms)
✔ boundary: an all blank snapshot yields no language and a carousel free one yields no opener (0.12825ms)
✔ the two golden profiles differ in a way a reader can see (6.150917ms)
✔ H1: a negated or contrasted wish is left empty, never flipped into a positive one (0.757458ms)
✔ H1 control: a plainly positive wish still fills the same fields it always did (0.415333ms)
✔ H2: editing a returned profile never changes what the next call returns (3.354ms)
✔ H3: profile evidence must resolve to the actual input, not merely exist (0.534833ms)
ℹ tests 151
ℹ suites 0
ℹ pass 151
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 855.6365
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

## 실제 로컬 HTTP smoke (키 없음)

```text
{
  "status": 200,
  "source_header": "heuristic",
  "reason_header": "missing_api_key",
  "analysis_source": "heuristic",
  "photo_id": "smoke"
}
```

## SVG 수정 전 회귀 검사 (의도한 실패)

```text
기존 API에서 새 SVG 계약 회귀 검사: 기대 exit 1
TAP version 13
# Subtest: key-present SVG is an explicit 415 from the production HTTP client, with no network
not ok 1 - key-present SVG is an explicit 415 from the production HTTP client, with no network
  ---
  duration_ms: 4.204625
  type: 'test'
  location: '/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-43/test/model.test.js:127:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    502 !== 415
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 415
  actual: 502
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///Users/chowonjae/Desktop/projects/wanted/.work/gyeol-43/test/model.test.js:139:12)
    async Test.run (node:internal/test_runner/test:1054:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 301.616208
```
