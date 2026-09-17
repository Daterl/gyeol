# PR #28 교차 리뷰 — Codex

**Merge 판정: 아니오.** 자연어 의미 반전(H1)·호출 간 상태 오염(H2)을 수정하고, #24 사진만 입력 계약 합의(B1)를 완료해야 한다. 기존 H1/H2형 근거 검증 공백(H3)은 계약 책임자가 수정 범위 또는 명시적 수용을 기록해야 한다.

## 대상과 검증 범위

- 검토일: 2026-09-17, Node `v22.22.3`.
- 모델: Codex/GPT-6 계열, Claude 작성 코드에 대한 독립 검토. 정확한 배포 모델 ID는 이 세션에서 독립 확인하지 않았으므로 coordinator dispatch 기록으로 확인한다.
- [PR #28](https://github.com/Daterl/gyeol/pull/28): `feat/10-target-profile`, HEAD `fbf84fa38056b37afe4fe70879dc7f74d0d3ee71`, 구현 기준 `7d16ff8`.
- [이슈 #10](https://github.com/Daterl/gyeol/issues/10)의 완료 조건을 기준으로 intent/spec/plan/report, CLAUDE.md 전체와 마지막 자동 재시도 규칙, pivot 제품 정의 P2/P3, 스키마 및 변경 코드를 읽었다.
- 지정 워크트리에 `docs/specs/1-contract-foundation/review-claude.md`가 없어 GitHub Contents API에서 main의 동일 경로를 읽었다. 앞선 H1은 지향 프로필 ID 미대조, H2는 evidence 참조 미대조다. 다른 워크트리는 열거나 수정하지 않았다.
- 제품 코드·fixture·schema 수정, commit, PR 승인/거부·merge 없음. 저장소 산출물은 이 파일 하나다. 실험은 메모리 사본과 `/tmp`에서 실행했다.
- CodeRabbit 스킬의 설치·인증 확인은 수행했다(CLI 0.7.6). CodeRabbit 원격 리뷰는 실행하지 않았으며 아래 지적은 직접 읽기·실행에서 얻었다. 실제 모델 호출과 배포 검증은 범위 밖이다.

## 실행 명령과 실제 출력

```sh
gh pr view 28 --repo Daterl/gyeol --json title,headRefName,baseRefName,headRefOid,body
gh issue view 10 --repo Daterl/gyeol
gh issue view 24 --repo Daterl/gyeol --json state,body,comments
gh pr view 28 --repo Daterl/gyeol --json isDraft
git rev-parse HEAD
git diff 7d16ff8...HEAD -- schemas lib/contracts.js
npm test
npm run eval
npm run check
```

추가 실제 출력: `#24 state=OPEN, comments=[]`, PR #28 `{"isDraft":true}`. `schemas/` 및 `lib/contracts.js` diff는 빈 출력이다. **4종 스키마 변경으로 인한 BLOCKER는 없다.** `check`는 JS 구문/JSON 검사이며 별도 타입체커·린터 통과를 뜻하지 않는다.

`npm test` 실제 요약:

```text
1..74
# tests 74
# suites 0
# pass 74
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 331.239666
```

`npm run eval`, `npm run check` 실제 출력은 아래 부록 A에 보존했다. baseline은 `git archive 7d16ff8`를 임시 디렉토리에 풀어 그 디렉토리에서 `npm run eval`을 실행했다(exit 0). baseline과 HEAD 모두 정상 10 PASS / 의도적 실패 10 EXPECTED FAIL로 재현됐다. 원 워크트리 checkout은 변경하지 않았다.

## report.md 주장 대비 재현

| 주장 | 실제 관측 | 판정 |
|---|---|---|
| 74 test pass / 0 fail | 74 / 0 | 재현 |
| quiet/detail E1·E2·E3·E6·E8 PASS | 각 5 PASS | 재현 |
| 의도적 실패 10건 탐지 | 10 EXPECTED FAIL | 재현 |
| 골든 교체 전후 불변식 동일 | 기준 7d16ff8와 HEAD 양쪽 실행 동일 | 재현 |
| check 29파일·의존성 0·스키마 예시 4종 일치 | 동일 출력 | 재현 |
| ref visual 0 / language 1 | `{visual:0,language:1,sequence:0}` | 재현 |
| free visual .2 / language .6 | `{visual:0.2,language:0.6,sequence:0}` | 재현 |
| ref/free/plan Claim 5/4/4, 최소 근거 1/1/3 | 직접 재귀 순회로 동일 | 재현 |
| rule-only 0/0/0 | 직접 순회로 동일; rule-only 주입은 거부 | 재현 |
| quiet p50 15 / detail p50 292, p90 914 | 동일 | 재현하되 292는 UTF-16 단위(M3) |
| 해요 vs 명사형, 캐러셀 0 vs 26 | 동일 | 재현; 어미 사람 전수 검증은 아님 |
| 미지원 URL 3종 fallback 제공 | `REFERENCE_NOT_PREPARED ["29cm"] ["freetext","photo_only"]` 3회 | 기본 registry에서 재현 |
| DoD 5 PASS(계약 pending) | #24 OPEN·합의 댓글 없음, interaction schema 부재 | PASS 불가, PENDING |
| 순수 함수·자연어 항상 성공하는 바닥 | 반환값 수정 뒤 다음 정상 호출 오류 | 반례 재현(H2) |

## 심각도별 지적

### BLOCKER

**B1 — 사진만 입력의 합의 계약이 없어 DoD 5/8을 완료로 판정할 수 없다.**

위치: `docs/specs/10-target-profile/report.md:15`, spec 2-3, 이슈 #10 완료 조건 5·8. #24는 OPEN이고 댓글 0개이며 워크트리에 `schemas/interaction.md`가 없다. 작성자가 PhotoPlan을 제안으로 표시한 사실은 확인했지만, 그것이 “#24에서 합의한 계획”이라는 DoD를 충족하지는 않는다. report의 `PASS (계약 pending)`은 **PENDING**이어야 한다. Draft 유지 자체는 적절하다. 이 지적은 구현을 폐기하라는 요구가 아니라 사람의 계약 합의가 merge 전에 남아야 한다는 뜻이다.

### HIGH

**H1 — 부정한 지향을 긍정 지향으로 변환한다.**

위치: `lib/target_profile.js:163–176,192`. `raw.includes`와 어휘표 선착순은 부정·대조를 버리고, 두 어절 절단은 뒤의 부정어를 삭제한다. 실제 반환:

```text
"짧게 말고 길게 써줘" → caption_len {p50:15,p90:30}; tone ["짧게 말고"]
"이모지 많이 쓰지 마" → emoji_rate 1.5; tone ["이모지 많이"]
"해요체는 싫어요" → ending_style "해요"
"밝고 따뜻한 느낌은 싫어요" → tone_words ["밝고 따뜻한"], confidence 1
```

근거 문자열이 입력에 등장한다는 사실만으로 의미가 지지되지는 않는다(P2). 마지막 사례는 “그대로 옮겼다”면서 반대 의미를 confidence 1로 반환한다. 복잡한 NLP나 새 모델은 요구하지 않는다. 최소한 부정/충돌이 있는 항목은 비우고 completeness를 낮추며, 부정을 잘라낸 어구를 긍정적 tone으로 내지 않아야 한다(P3). 이 네 입력을 실패 방지 회귀 사례로 고정한다.

**H2 — 반환 객체가 전역 어휘표 객체를 공유하여 다음 요청을 오염시킨다.**

위치: `lib/target_profile.js:149–151,176,179` 및 ref의 `banned_words` 할당. `claim(entry.value,...)`는 객체를 복사하지 않고 넘긴다. 실제로:

```js
const a = extractFromFreetext('짧게');
a.language.caption_len.value.p50 = 25;
extractFromFreetext('짧게').language.caption_len.value.p50; // 25 (기본 15가 아님)
```

별도 프로세스에서 999로 변경하면 이후 정상 `extractFromFreetext('짧게')` 호출이 `ContractError ...p90: expected number 999..Infinity`로 실패한다. 이때 근거는 여전히 “p50 15자”다. 서버의 여러 사용자 요청이 같은 모듈 인스턴스를 쓰거나 호출자가 결과를 편집하는 경우 사용자 간 값 오염/정상 입력 실패로 이어진다. 실제 배포에서 편집 경로가 연결됐다고 주장하지는 않는다. 반환값 소유권을 분리하고 다음 호출 불변성을 검증하면 닫힌다. BANNED_WORDS 배열도 같은 공유 참조이므로 함께 확인할 대상이다.

**H3 — 앞선 H1/H2형 입력 대조 공백이 그대로이며 새 추출 테스트도 이를 차단하지 않는다. (기존 결함의 상속)**

위치: `lib/contracts.js:19–29,126–133`, `eval/invariants.js:4–21`, 신규 `test/target_profile.test.js:64–69`, `prompts/input/target_extract.md:27–30`.

아래 변형을 메모리에 직접 넣었다. 모두 ACCEPTED이며 feed 실험은 validateFeed/validateExport 및 eval 5개가 전부 통과했다.

- `applied_profile.target_profile_id = 'tgt_DOES_NOT_EXIST'`.
- rationale의 사진 근거 `ref = 'ph_NOT_AN_INPUT'`.
- quiet feed의 language를 detail TargetProfile의 language로 통째로 교체(ID는 quiet 유지).
- ref profile에 없는 `ig_post.ref = 'POST_NOT_IN_SNAPSHOT'` 또는 가짜 `user_text.ref = 'tgt_NOT_REAL:raw'` 주입.
- ref의 caption_len 값만 freetext 출력에서 복사하고 원래 ref 근거 유지.

반대로 **빈 evidence와 rule-only evidence는 실제 거부**했다. 따라서 “검증이 아무것도 안 막는다”는 결론은 틀리고, **형태/비어 있음은 막지만 입력과의 관계는 검증하지 않는다**가 정확하다. 새 test 66은 정상 출력 caption_len의 shortCode가 존재하는지만 확인하며 변조를 넣고 validator 거부를 확인하지 않는다.

현재 생성기는 결정적이며 정상 fixture에 가짜 ID를 생성했다는 증거는 없다. 모델 경로 역시 미배선이므로 모델이 현재 악용 중이라는 뜻이 아니다. 다만 prompt에서 `validateProfile` 통과를 근거 진위 보장처럼 사용하면 안 된다. 최소 조치는 실제 입력을 함께 가진 경계에서 ID/근거 소속과 target-only 거울 값을 대조하는 negative 검사이며, 공용 계약 변경은 #24 책임자와 연계한다. 미수정 시 P2 검증 범위 밖임을 인수 기록에 명시해야 한다.

### MEDIUM

**M1 — validatePhotoPlan은 본인이 금지한 취향 Claim과 잘못된 값을 허용한다.**

위치: `lib/target_profile.js:253–265`. 정상 계획 사본에 각각 `palette.value.hue_mean=999`, `visual.tone_words`를 가짜 user_text 근거로 추가, `visual={}`로 교체해 completeness.visual=.8을 유지해도 ACCEPTED. 없는 사진 ID도 통과한다(H3와 같은 유형). `validateClaim`만 부르므로 필드 허용 목록, 값 범위, 입력 근거 종류, 채움률 정합성을 검증하지 않는다. 정상 planFromPhotos가 취향을 스스로 만든 것은 아니지만, 공개 검증기의 거부 계약은 spec 6절과 맞지 않는다. #24 합의된 최소 구조에 맞춰 경계 검사를 추가하고 이 주입을 거부하는지 확인해야 한다.

**M2 — 주입 registry의 key와 snapshot.handle 불일치를 확인하지 않는다.**

위치: `lib/target_profile.js:39–43,78`. `registry={other: registry['29cm']}`로 `https://instagram.com/other/`를 호출하면 29cm 30건이 정상 반환된다. evidence aggregate는 `ig_snapshot_29cm_2026-09-17`이다. 기본 레지스트리는 안전하고 임의 URL이 저절로 이 상태를 만들지는 않는다. 하지만 registry를 받는 공개 경계에서 잘못된 계정 매핑을 그대로 신뢰하여 DoD 8의 금지 상황을 허용한다. key/요청 handle/snapshot.handle 일치 여부를 확인하는 최소 방어와 negative 검사로 충분하다.

**M3 — 한국어 캡션의 “자” 수가 UTF-16 코드 단위다.**

위치: `lib/target_profile.js:85,93,118–120`. `한글😀`는 3 grapheme/3 code point인데 `caption_len={p50:4,p90:4,unit:'자'}` 및 “캡션 4자” 근거를 반환했다. 실제 29cm 30건의 같은 최근접 순위 p50도 UTF-16=292, code point=289, grapheme=289로 다르다. 완성형 한글만 있을 때는 잘 세고 출력 문자열 자체가 깨지는 현상은 못 봤다. 단위를 명시하거나 사람에게 표시할 “자”를 일관된 grapheme 기준으로 세어야 한다. emoji_rate는 spec이 그림문자 코드포인트 개수로 명시하므로 별도 결함으로 세지 않았다.

### LOW

**L1 — 축약 fixture는 원본을 충실히 반영하지만 경계 분포는 덮지 않는다.** 실제 30건은 Sidecar 26, Video 4, 한글 30, 빈 캡션 0, Image 0, 자식 최대 16장이다. shortCode로 조인해 caption/type/timestamp/child_count 불일치가 0건임을 확인했다. 단일 사진·20장 캐러셀·빈 문자열 캡션은 원본에도 없다. 이번 수동 실행에서는 정상 처리됐으므로 실행 결함으로 올리지 않는다. 해당 세 형태와 mixed-empty .5 비율을 작은 회귀 사례로 유지하는 정도면 충분하다. 실제 데이터 추가 수집은 요구하지 않는다.

**L2 — 깨진 스냅샷 caption 타입은 제어된 ContractError 대신 TypeError다.** `caption:7` 주입 결과 `(p.caption ?? "").trim is not a function`. 성공으로 오인하지는 않지만 spec의 실패 형태와 다르다. 입력 타입 검사를 추가할 수 있다. 현재 준비된 fixture는 정상이다.

## 이슈 #10 DoD 항목별 판정

| # | 이슈 완료 조건 | 판정 | 실행 근거/남은 것 |
|---|---|---|---|
| 1 | 두 경로 같은 TargetProfile 스키마 | PASS(형태) | 양쪽 validateProfile 통과, target/present/source 정상. 의미 품질은 H1 별도 |
| 2 | 자연어 visual 낮음, ref language 채움, 비어야 할 것 비움 | 부분 FAIL | 정상 예시는 재현. 부정 입력에서 비워야 할 판단을 채움(H1) |
| 3 | 모든 Claim evidence≥1, E1 | PASS(명시된 길이 조건) | 5/4/4 Claims, 최소 1/1/3, 빈 evidence 실제 거부. 참조 진위는 H3 |
| 4 | rule-only 프로필 항목 0 | PASS | 정상 세 경로 0, rule-only 변조 실제 거부 |
| 5 | 지향 없으면 #24 합의 사진 계획, target present:false 금지 | PENDING | PhotoPlan 정상 반환·axis/present 없음. #24 합의 미완료(B1) |
| 6 | 골든 TargetProfile 2벌 | PASS | quiet/detail 실제 추출값, 15 vs 292, source 차이 및 eval 재현 |
| 7 | ADR 사진만 경로, #9 근거, 취향·습관 주장 금지 | 부분 PASS / 통합 PENDING | 정상 PhotoAnalysis fixture 15장 입력의 계획은 언어 null·취향 고지 정상. 실제 #9 출력 통합은 미확인; validator 금지 필드 우회는 M1 |
| 8 | 임의 URL 타계정 연결 금지, 미준비 대안, #24 source/기본값 | 부분 FAIL / PENDING | 기본 registry 3종 거부·대안 안내 PASS; 주입 registry 불일치는 허용(M2); #24 source 합의 PENDING |

사진 분석 0장은 거부, 1장·20장은 허용, 빈 photo_id는 거부했다. 동일 photo_id 두 개는 허용됐으나 이 함수 spec은 최소 1개의 분석을 받는 내부 집계기이고 #24가 아직 사진 집합 계약을 정하지 않았으므로 여기서 3~20 제한 신규 기능을 요구하지 않는다. 사진만 입력의 자동 분기/통합 API도 이 PR 밖이며 독립 함수 호출 이상의 통합 완료를 주장하지 않는다.

## 부록 A — eval/check 실제 출력

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
└─────────┴─────────┴───────────┴────────┴────────┘
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
┌─────────┬──────────┬───────────┬────────┬────────┐
│ (index) │ case     │ invariant │ result │ reason │
├─────────┼──────────┼───────────┼────────┼────────┤
│ 0       │ 'detail' │ 'E1'      │ 'PASS' │ ''     │
│ 1       │ 'detail' │ 'E2'      │ 'PASS' │ ''     │
│ 2       │ 'detail' │ 'E3'      │ 'PASS' │ ''     │
│ 3       │ 'detail' │ 'E6'      │ 'PASS' │ ''     │
│ 4       │ 'detail' │ 'E8'      │ 'PASS' │ ''     │
└─────────┴──────────┴───────────┴────────┴────────┘
detail broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
detail broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
detail broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
detail broken E6: EXPECTED FAIL — E6.title: expected nonempty string
detail broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
E4/E5/E7: manual spot-check only; real demo review pending.
```

```text
> gyeol@0.1.0 check
> node scripts/check.js

PASS: 29 JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.
```

## 부록 B — 재실행 가능한 직접 호출 실험

아래 코드를 `/tmp/gyeol10-probe.mjs`로 저장하고 지정 워크트리에서 `node /tmp/gyeol10-probe.mjs`를 실행했다. 마지막 실험은 의도적으로 해당 프로세스의 모듈 상수를 오염시키므로 마지막에 배치했다. 저장소 파일에는 쓰지 않는다.

```js
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const imp=p=>import(pathToFileURL(process.cwd()+'/'+p));
const {extractFromReference:R,extractFromFreetext:F,planFromPhotos:P,validatePhotoPlan:VP,loadDefaultRegistry}=await imp('lib/target_profile.js');
const {validateProfile:V,validateFeed:VF,validateExport:VE}=await imp('lib/contracts.js');
const {evaluate}=await imp('eval/invariants.js');
const read=p=>JSON.parse(fs.readFileSync(p)); const clone=structuredClone;
const photos=read('fixtures/photo_analysis.sample.json'),registry=await loadDefaultRegistry();
const probe=async(name,fn)=>{try{console.log(name,JSON.stringify(await fn()));}catch(e){console.log(name,'REJECT',e.name,e.message);}};
const opts={createdAt:'2026-09-17T00:00:00.000Z'};
const snap=posts=>({registry:{test:{snapshot_id:'test_snapshot',handle:'test',posts}},...opts});
const post=(caption,child_count=0)=>({shortCode:'test_post',caption,type:child_count?'Sidecar':'Image',child_count,timestamp:opts.createdAt});
await probe('normal ref',async()=>{const x=await R('https://instagram.com/29cm/',opts);return {id:x.profile_id,n:x.sample_size,completeness:x.completeness,p50:x.language.caption_len.value,ending:x.language.ending_style.value,carousel:x.sequence.carousel_count}});
await probe('normal free',()=>{const x=F('조용하고 짧게, 이모지 없이 해요체로',opts);return {id:x.profile_id,completeness:x.completeness,p50:x.language.caption_len.value}});
for(const t of ['',null,'   ','그냥 나답게','짧게 말고 길게 써줘','이모지 많이 쓰지 마','해요체는 싫어요','밝고 따뜻한 느낌은 싫어요']) await probe('free '+JSON.stringify(t),()=>{const x=F(t,opts);return {language:x.language,tone:x.visual.tone_words?.value}});
for(const [name,posts] of [['empty snapshot',[]],['blank',[post('')]],['single',[post('봄날 기록')]],['20 carousel',[post('봄날 기록',20)]],['mixed blank',[post(''),{...post('봄날 기록',20),shortCode:'test2'}]],['Korean emoji',[post('한글😀')]],['bad caption',[post(7)]]]) await probe(name,async()=>{const x=await R('https://instagram.com/test/',snap(posts));return {language:x.language,sequence:x.sequence}});
for(const [name,arr] of [['zero',[]],['one',photos.slice(0,1)],['20',Array.from({length:20},(_,i)=>({...photos[i%15],photo_id:'p'+i}))],['bad',[{...photos[0],photo_id:''}]],['duplicate',[photos[0],photos[0]]]]) await probe('photos '+name,()=>({sample:P(arr,opts).sample_size}));
await probe('wrong account registry',async()=>{const x=await R('https://instagram.com/other/',{registry:{other:registry['29cm']},...opts});return {sample:x.sample_size,evidence:x.language.caption_len.evidence[0]}});
for(const key of ['photo ref','bad palette','invented tone','empty visual']) await probe('plan mutation '+key,()=>{const x=clone(P(photos,opts));if(key==='photo ref') x.visual.palette.evidence[1].ref='ph_NOT_AN_INPUT';if(key==='bad palette') x.visual.palette.value.hue_mean=999;if(key==='invented tone') x.visual.tone_words={value:['행복한 취향'],confidence:1,evidence:[{kind:'user_text',ref:'not_in_input',note:'made up'}]};if(key==='empty visual')x.visual={};VP(x);return 'ACCEPTED'});
for(const key of ['ig ref','user ref','copy other value','empty evidence','rule only']) await probe('profile mutation '+key,async()=>{const x=clone(await R('https://instagram.com/29cm/',opts));if(key==='ig ref')x.language.caption_len.evidence[1].ref='POST_NOT_IN_SNAPSHOT';if(key==='user ref'){x.language.caption_len.evidence=[{kind:'user_text',ref:'tgt_NOT_REAL:raw',note:'invented'}]};if(key==='copy other value')x.language.caption_len.value=F('짧게',opts).language.caption_len.value;if(key==='empty evidence')x.language.caption_len.evidence=[];if(key==='rule only')x.language.caption_len.evidence=[{kind:'rule',ref:'r',note:'rule'}];V(x,'target');return 'ACCEPTED'});
const root='eval/golden/case_01/';
const bundle={feed:read(root+'ordered_quiet.json'),output:read(root+'export_quiet.json'),targetProfile:read(root+'target_quiet.json'),currentProfile:read(root+'current_profile.json'),inputPhotoIds:read(root+'input.json').photo_ids};
for(const key of ['profile id','photo ref','copy other profile']) await probe('feed mutation '+key,()=>{const b=clone(bundle);if(key==='profile id')b.feed.applied_profile.target_profile_id='tgt_DOES_NOT_EXIST';if(key==='photo ref')b.feed.slots[0].rationale.evidence=[{kind:'uploaded_photo',ref:'ph_NOT_AN_INPUT',note:'invented'}];if(key==='copy other profile')b.feed.applied_profile.language=read(root+'target_detail.json').language;VF(b.feed,b.inputPhotoIds,b.currentProfile);VE(b.output,b.feed);return {validators:'ACCEPTED',eval:evaluate(b)}});
await probe('shared result mutation',()=>{const a=F('짧게',opts);a.language.caption_len.value.p50=999;return F('짧게',opts).language.caption_len.value});
```

실제 stdout (예외는 probe가 포착하여 REJECT로 출력):

```text
normal ref {"id":"tgt_ig_5075f917","n":30,"completeness":{"visual":0,"language":1,"sequence":0},"p50":{"p50":292,"p90":914,"unit":"자"},"ending":"명사형","carousel":26}
normal free {"id":"tgt_ft_1b64cd24","completeness":{"visual":0.2,"language":0.6,"sequence":0},"p50":{"p50":15,"p90":30,"unit":"자"}}
free "" REJECT ContractError freetext: expected nonempty string
free null REJECT ContractError freetext: expected nonempty string
free "   " REJECT ContractError freetext: expected nonempty string
free "그냥 나답게" {"language":null,"tone":["그냥 나답게"]}
free "짧게 말고 길게 써줘" {"language":{"caption_len":{"value":{"p50":15,"p90":30,"unit":"자"},"confidence":0.6,"evidence":[{"kind":"user_text","ref":"tgt_ft_39221970:짧게","note":"입력 문장에서 \"짧게\" 를 찾았다"},{"kind":"rule","ref":"docs/specs/10-target-profile/spec.md#3","note":"짧게·간결·짤막·한 줄 → p50 15자 / p90 30자"}]},"banned_words":["이처럼","또한","이를 통해","이러한","마침내"]},"tone":["짧게 말고"]}
free "이모지 많이 쓰지 마" {"language":{"emoji_rate":{"value":1.5,"confidence":0.5,"evidence":[{"kind":"user_text","ref":"tgt_ft_e92286e7:이모지 많이","note":"입력 문장에서 \"이모지 많이\" 를 찾았다"},{"kind":"rule","ref":"docs/specs/10-target-profile/spec.md#3","note":"이모지 많이 → 1.5개"}]},"banned_words":["이처럼","또한","이를 통해","이러한","마침내"]},"tone":["이모지 많이"]}
free "해요체는 싫어요" {"language":{"ending_style":{"value":"해요","confidence":0.6,"evidence":[{"kind":"user_text","ref":"tgt_ft_ef82a7fc:해요","note":"입력 문장에서 \"해요\" 를 찾았다"},{"kind":"rule","ref":"docs/specs/10-target-profile/spec.md#3","note":"해요·존댓말 → 해요체"}]},"banned_words":["이처럼","또한","이를 통해","이러한","마침내"]},"tone":["해요체는 싫어요"]}
free "밝고 따뜻한 느낌은 싫어요" {"language":null,"tone":["밝고 따뜻한"]}
empty snapshot REJECT ContractError ref_snapshot.posts: snapshot has no posts
blank {"language":null,"sequence":{"carousel_count":0}}
single {"language":{"caption_len":{"value":{"p50":5,"p90":5,"unit":"자"},"confidence":0.9,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"비어 있지 않은 캡션 1건의 길이 분포"},{"kind":"ig_post","ref":"test_post","note":"캡션 5자"},{"kind":"ig_post","ref":"test_post","note":"캡션 5자"}]},"emoji_rate":{"value":0,"confidence":0.9,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"캡션 1건의 그림문자 코드포인트 평균"},{"kind":"ig_post","ref":"test_post","note":"그림문자 0개"}]},"ending_style":{"value":"명사형","confidence":1,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"분류된 캡션 1건 중 \"명사형\" 1건 (100%)"},{"kind":"ig_post","ref":"test_post","note":"마지막 문장 \"봄날 기록\""}]},"linebreak_habit":{"value":"없음","confidence":0.7,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"캡션당 평균 1줄, 줄당 평균 5자"},{"kind":"ig_post","ref":"test_post","note":"1줄"}]},"empty_caption_ratio":{"value":0,"confidence":0.95,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"게시물 1건 중 빈 캡션 0건"}]},"banned_words":["이처럼","또한","이를 통해","이러한","마침내"]},"sequence":{"carousel_count":0}}
20 carousel {"language":{"caption_len":{"value":{"p50":5,"p90":5,"unit":"자"},"confidence":0.9,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"비어 있지 않은 캡션 1건의 길이 분포"},{"kind":"ig_post","ref":"test_post","note":"캡션 5자"},{"kind":"ig_post","ref":"test_post","note":"캡션 5자"}]},"emoji_rate":{"value":0,"confidence":0.9,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"캡션 1건의 그림문자 코드포인트 평균"},{"kind":"ig_post","ref":"test_post","note":"그림문자 0개"}]},"ending_style":{"value":"명사형","confidence":1,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"분류된 캡션 1건 중 \"명사형\" 1건 (100%)"},{"kind":"ig_post","ref":"test_post","note":"마지막 문장 \"봄날 기록\""}]},"linebreak_habit":{"value":"없음","confidence":0.7,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"캡션당 평균 1줄, 줄당 평균 5자"},{"kind":"ig_post","ref":"test_post","note":"1줄"}]},"empty_caption_ratio":{"value":0,"confidence":0.95,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"게시물 1건 중 빈 캡션 0건"}]},"banned_words":["이처럼","또한","이를 통해","이러한","마침내"]},"sequence":{"carousel_count":1}}
mixed blank {"language":{"caption_len":{"value":{"p50":5,"p90":5,"unit":"자"},"confidence":0.9,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"비어 있지 않은 캡션 1건의 길이 분포"},{"kind":"ig_post","ref":"test2","note":"캡션 5자"},{"kind":"ig_post","ref":"test2","note":"캡션 5자"}]},"emoji_rate":{"value":0,"confidence":0.9,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"캡션 1건의 그림문자 코드포인트 평균"},{"kind":"ig_post","ref":"test2","note":"그림문자 0개"}]},"ending_style":{"value":"명사형","confidence":1,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"분류된 캡션 1건 중 \"명사형\" 1건 (100%)"},{"kind":"ig_post","ref":"test2","note":"마지막 문장 \"봄날 기록\""}]},"linebreak_habit":{"value":"없음","confidence":0.7,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"캡션당 평균 1줄, 줄당 평균 5자"},{"kind":"ig_post","ref":"test2","note":"1줄"}]},"empty_caption_ratio":{"value":0.5,"confidence":0.95,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"게시물 2건 중 빈 캡션 1건"}]},"banned_words":["이처럼","또한","이를 통해","이러한","마침내"]},"sequence":{"carousel_count":1}}
Korean emoji {"language":{"caption_len":{"value":{"p50":4,"p90":4,"unit":"자"},"confidence":0.9,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"비어 있지 않은 캡션 1건의 길이 분포"},{"kind":"ig_post","ref":"test_post","note":"캡션 4자"},{"kind":"ig_post","ref":"test_post","note":"캡션 4자"}]},"emoji_rate":{"value":1,"confidence":0.9,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"캡션 1건의 그림문자 코드포인트 평균"},{"kind":"ig_post","ref":"test_post","note":"그림문자 1개"}]},"linebreak_habit":{"value":"없음","confidence":0.7,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"캡션당 평균 1줄, 줄당 평균 4자"},{"kind":"ig_post","ref":"test_post","note":"1줄"}]},"empty_caption_ratio":{"value":0,"confidence":0.95,"evidence":[{"kind":"aggregate","ref":"test_snapshot","note":"게시물 1건 중 빈 캡션 0건"}]},"banned_words":["이처럼","또한","이를 통해","이러한","마침내"]},"sequence":{"carousel_count":0}}
bad caption REJECT TypeError (p.caption ?? "").trim is not a function
photos zero REJECT ContractError photo_analyses: expected at least one PhotoAnalysis
photos one {"sample":1}
photos 20 {"sample":20}
photos bad REJECT ContractError PhotoAnalysis.photo_id: expected nonempty string
photos duplicate {"sample":2}
wrong account registry {"sample":30,"evidence":{"kind":"aggregate","ref":"ig_snapshot_29cm_2026-09-17","note":"비어 있지 않은 캡션 30건의 길이 분포"}}
plan mutation photo ref "ACCEPTED"
plan mutation bad palette "ACCEPTED"
plan mutation invented tone "ACCEPTED"
plan mutation empty visual "ACCEPTED"
profile mutation ig ref "ACCEPTED"
profile mutation user ref "ACCEPTED"
profile mutation copy other value "ACCEPTED"
profile mutation empty evidence REJECT ContractError targetProfile.language.caption_len.evidence: needs at least one evidence
profile mutation rule only REJECT ContractError targetProfile.language.caption_len: rule-only profile claim is not personalization
feed mutation profile id {"validators":"ACCEPTED","eval":{"E1":{"pass":true},"E2":{"pass":true},"E3":{"pass":true},"E6":{"pass":true},"E8":{"pass":true}}}
feed mutation photo ref {"validators":"ACCEPTED","eval":{"E1":{"pass":true},"E2":{"pass":true},"E3":{"pass":true},"E6":{"pass":true},"E8":{"pass":true}}}
feed mutation copy other profile {"validators":"ACCEPTED","eval":{"E1":{"pass":true},"E2":{"pass":true},"E3":{"pass":true},"E6":{"pass":true},"E8":{"pass":true}}}
shared result mutation REJECT ContractError targetProfile.language.caption_len.value.p90: expected number 999..Infinity
```
