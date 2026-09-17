# PR #29 교차 리뷰: CurrentProfile

**Merge 판정: 아니오.** A2 실패·미확인 입력 차단(H1)과 판단에 맞는 근거 선택(H2)을 수정하고 회귀 검증해야 한다. 앱 눈 대조 DoD는 아직 PENDING이며, 웹 DOM 대조로 대체하려면 요구사항 책임자의 명시적 결정이 필요하다.

- 리뷰: Codex, 2026-09-17. 대상: `feat/11-current-profile`, HEAD `77c77ca23c36677b51aabe8bbd6ba7a3080f4ed4` (GitHub PR head와 일치).
- #11 인수 기준 SHA: `7d16ff870f1304de8ec86a5de4ac1b7fa8103a4c`. 이 SHA 이후 diff를 신규 결함 판정 범위로 삼았다.
- 읽은 기준: GitHub #11 본문·댓글, 이 디렉터리 intent/spec/plan/report, CLAUDE.md 전체(말미 8절 포함), schemas 4종의 계약, pivot 제품정의 P2·P3, 실제 29cm JSON.
- 코드·fixture·스키마·다른 워크트리·pivot는 수정하지 않았다. 이 리뷰 문서만 추가했다. GitHub 승인/거부/댓글/merge는 하지 않았다.
- 지정한 `docs/specs/1-contract-foundation/review-claude.md`는 이 워크트리와 `git show main:...` 모두에 없었다. coordinator에 원문 요청을 보냈다. 대신 존재하는 `review.md`와 요청에 명시된 근거 위조·검증 무력화 유형을 직접 검사했다. **앞선 Claude 리뷰 H1/H2의 원문을 읽었다고 주장하지 않는다. 아래 H 번호는 이 리뷰의 번호다.**
- CodeRabbit 스킬의 CLI 사전 확인은 0.7.6/인증됨까지 수행했다. 이 산출물은 요청된 Codex의 직접 실행 교차 리뷰이며 CodeRabbit 원격 리뷰는 실행하지 않았다.

## 1. report.md 주장 재현

| 주장 | 실제 결과 | 판정 |
|---|---|---|
| npm test 77/77, 실패 0 | 77/77, 실패 0 | 재현 |
| eval quiet/detail E1·E2·E3·E6·E8 PASS | 정상 10 PASS, 파손 10 EXPECTED FAIL | 재현 |
| check 28개 파일, 의존성 0, 스키마 예시 일치 | 같은 결과. 출력은 JS 문법/JSON 파싱이며 별도 typechecker/linter가 없다고 명시 | 재현 |
| cached 표본 30, 캐러셀 26 | 30/26, source=cached | 재현 |
| caption p50=289, p90=888, emoji=5.5, ending=명사형/0.7 | 정확히 같은 값 | 재현. 의미적 정확성은 별도 |
| 오프라인 재생 결과 동일 | 네트워크 차단 자식 프로세스 테스트 통과, 고정 now로 동일 결과 | 재현. 실제 OS 네트워크 단절 실험은 아님 |
| 원본 JSON과 캡션·장수 일치 | 30건 대조, 불일치 0 | 재현 |
| A2 10장·20장 모두 일치 | 저장된 웹 DOM 목록과 비교 명령 각각 성공 | 재현. 앱 눈 대조는 미실행 |
| A2 DoD 완료 | 이슈 댓글은 있음. 그 댓글도 앱 눈 대조 미실행을 인정 | PENDING |
| 모든 Claim이 근거를 가져 P2 충족 | 근거 배열의 형태는 맞지만 결론을 지지하지 않는 사진만 인용하는 반례 있음 | **FAIL, H2** |
| schemas를 안 바꿈 | 인수 SHA→HEAD의 schemas diff 없음 | 재현 (아래 범위 구분) |

PR의 base는 main이고 PR 전체에는 foundation에서 상속한 schemas 4종 **추가**가 포함된다. 따라서 “PR 전체에서 schemas diff가 없다”는 주장은 틀리다. 다만 `git diff 7d16ff8 HEAD -- schemas`는 비어 있으므로 **#11 작업이 인수한 스키마를 변경했다는 BLOCKER는 발견하지 못했다.** Foundation/#24 계약 합의 pending을 이 리뷰가 해제하지 않는다.

## 2. 심각도별 지적

### BLOCKER

신규 #11 변경에서 스키마 변경 또는 필수 명령 재현 실패는 발견하지 못했다. 아래 HIGH 때문에 merge 판정은 여전히 아니오다.

### HIGH H1 — A2가 다르거나 확인 불가여도 opener를 생성한다

위치: `lib/current_profile.js:104`, `:119`; `prompts/input/current_extract.md`의 A2 설명.

스냅샷의 `provenance.carousel_order_check.verdict`를 각각 `다르다`, `확인 불가`로 바꾸거나 그 기록을 지우고, file_ref가 일치하는 fullshot 분석 1개를 넣었다. **네 경우 모두 `opener_tendency=풀샷, confidence=1`이고 validateProfile도 통과**했다. 함수는 A2 메타데이터를 읽지 않는다.

#11 DoD는 A2가 다르거나 확인 불가면 필드를 생략하고 순서 근거에서 제외하라고 한다. 현재 fixture가 “같다”라는 이유로 이 분기를 “해당없음” 처리하면 요구한 실패 복구가 구현되지 않는다. 프롬프트도 특정 2건의 대조를 모든 입력에 대한 허용으로 서술한다.

최소 조치: 해당 입력에서 A2를 신뢰할 수 있을 때만 opener를 만들고, 실패·미확인·누락 입력은 생략한다. 세 부정 입력에 대한 회귀 테스트가 필요하다. 기존 스키마의 optional로 충분하며 계약 확장은 필요 없다.

추가 DoD 한계: 저장된 웹 이미지 순서 대조 10/20장은 재현했지만, 앱에서 눈으로 대조했다는 증거는 없다. 두 방식이 동등하다는 판단을 이 리뷰가 대신하지 않는다.

### HIGH H2 — 출력 근거가 판단을 뒷받침하지 않는 입력만 가리킬 수 있다

위치: `lib/current_profile.js:85`, `:99`, `:117`, `:131`.

두 독립 반례가 모두 validateProfile을 통과했다.

1. opener 5개를 `midshot, midshot, midshot, closeup, closeup`으로 준다. 결과는 `클로즈업/confidence=1`인데 근거 3개는 **분류에서 제외한 앞의 midshot 게시물뿐**이다.
2. 사진 5개의 subjects를 `[unique_0], [unique_1], [unique_2], [고양이], [고양이]`로 준다. 결과는 `subjects=[고양이]`인데 근거는 **고양이가 없는 ph_01~03뿐**이다.

이는 추상적인 “검증기가 의미를 모른다” 문제를 넘어, 추출기가 정상 형태 입력에서 잘못된 근거를 직접 만든 사례다. P2의 실제 필드·파일로 역추적 조건을 충족하지 못한다. 단순히 앞의 3개를 고르는 것을 “대표 근거”라고 불러도 실제 지지 근거가 하나도 없는 결과는 정당화되지 않는다.

최소 조치: subjects/opener에서 선택한 판단을 실제로 지지한 입력을 근거로 고른다. 집계 전체가 필요한 필드는 어떤 관측 집합에서 계산했는지 추적 가능하게 하되, 새 기능·새 스키마 요구로 넓히지 않는다. 위 두 반례를 실패 테스트로 고정한다.

### MEDIUM M1 — 중복 분석이 새로운 관측으로 집계되어 없는 습관을 만든다

위치: `lib/current_profile.js:95`, `:128`.

fullshot A와 closeup B를 한 번씩 넣으면 동률로 opener가 생략된다. B 객체를 그대로 한 번 더 넣으면 `클로즈업/0.67`이 된다. 같은 photo_id의 업로드 분석을 두 번 넣어도 sample_size=2, subjects “두 장 이상에서 반복”/confidence=1이 생성된다. 실제 고유 사진은 한 장이다.

최소 조치: 사진 ID/캐러셀 관측의 중복을 거부하거나 같은 관측으로 처리한다. 동일 ID를 서로 다른 분석 값으로 넣는 경우도 분리해서 실패시켜야 한다. 파일 바이트 중복 탐지 같은 범위 밖 기능은 요구하지 않는다.

### MEDIUM M2 — 서로 다른 cached 관측을 같은 profile_id로 만들어 E8 식별을 무력화한다

위치: `lib/current_profile.js:121` (비교: 업로드 ID 관련 `:136` 주석).

원본 30건(빈 캡션 비율 0)과 같은 계정의 1건 빈 캡션 스냅샷(비율 1)이 모두 `cur_cached_29cm_official`이다. 앞 프로필의 ID를 applied_profile에 남긴 채 뒤 프로필을 실제 입력으로 주어도 validateDisclosure/E8이 통과했다.

업로드 쪽 주석은 “다른 프로필인데 ID가 같으면 E8 대조가 구별하지 못한다”는 이유로 캡션까지 해시에 넣는다. 같은 원칙이 cached에는 적용되지 않는다. 캐시가 갱신되거나 관측 세트가 달라진 경우 이전 보정 결과와 현재 입력을 구별하지 못한다. **현재 API 통합이 아직 없어 실제 사용자 오염이 발생했다고 주장하지는 않는다.**

최소 조치: cached ID가 계정뿐 아니라 관측 버전/내용을 구별하게 하고, 서로 다른 관측을 교차 적용하는 음성 테스트를 둔다. 계정·세션 기능 추가 요구는 아니다.

### MEDIUM M3 — 혼합 어미 규칙이 구현되지 않았다

위치: `lib/current_profile.js:56`; `spec.md` 4-1.

spec은 최빈 비율 <0.6이면 `혼합`이라고 한다. `좋아요, 가요, 간다, 사진, hello`를 넣으면 분류 가능한 4건 중 2건인 `해요/0.5`가 나온다. 동률이면 혼합 대신 필드를 생략한다. 코드에는 혼합을 반환하는 경로가 없다.

spec 6-2의 “분류 실패가 분모에서 빠지고 그만큼 confidence가 내려간다”도 산식과 맞지 않는다. 분모에서 빼면 confidence가 반드시 내려가지는 않는다. 한글 분류 전략을 새로 설계하라는 요구가 아니라, 이미 명시한 혼합 규칙과 분모 설명을 구현·테스트와 맞춰야 한다.

### LOW L1 — 한국어/이모지 계산은 글자·이모지의 표시 단위가 아니다

위치: `lib/current_profile.js:7`, `:8`, `:50`, `:53`.

실행 결과: NFC `한글`=2자, NFD `한글`=6자이며 NFD는 ending_style도 생략된다. `🇰🇷`와 `1️⃣`의 emoji_rate는 0, `👨‍👩‍👧‍👦`는 4다. 사용자에게 “이모지 개수”라고 설명하는 값과 속성 코드포인트 수는 다르다. 실제 29cm 캡션에도 keycap 문자열이 있다.

일반 완성형 한글은 깨지지 않았고 289/888도 재현됐다. spec이 코드포인트/Extended_Pictographic 방식을 의도적으로 정의하므로 스키마 타입 위반으로 올리지 않는다. **정의·표시 한계를 명시하는 것을 제안하며, 형태소 분석기나 새 의존성 추가는 하지 말 것.**

### LOW L2 — 문서의 빈 스냅샷 사례와 실제 입력 오류 처리가 다르다

위치: `lib/current_profile.js:107`, `:116`; `spec.md` 6-1.

문서의 `{snapshot:{posts:[]}}`는 absent 기대인데 실제는 account 누락 ContractError다. account를 주면 정상 absent다. 또한 `openers:{}`는 ContractError 대신 TypeError가 난다. 무입력 정상 경로 자체는 통과하므로 DoD 전체를 실패로 확대하지 않는다. 최소한 문서의 빈 스냅샷 예제와 공개 인자의 배열 검사를 맞추는 수준이다.

### LOW L3 — 상속된 검증기는 근거 위조를 차단하지 않는다 (#24 인계, 이 PR에서 확장하지 말 것)

위치: `lib/contracts.js:19`, `:73`, `:128`; `eval/invariants.js:6`. 이 파일들은 #11에서 변경하지 않았다.

- 추출한 CurrentProfile의 evidence.ref를 입력에 없는 `NOT_IN_INPUT`으로 바꾸기 → validateProfile 통과.
- profile_id를 존재하지 않는 문자열로 바꾸기 → validateProfile 통과 (입력 문맥을 받지 않는 구조 검사).
- 다른 캡션 입력에서 나온 caption_len Claim 복사 → validateProfile 통과.
- 골든 feed의 rationale ref 또는 target_profile_id를 존재하지 않는 값으로 바꾸기 → validateFeed와 E1/E2/E3/E6/E8 **전부 통과**.
- 반대로 evidence=[]는 거부됐고, 실제 입력과 다른 applied current_profile_id는 E8에서 거부됐다.

따라서 “테스트가 전혀 검증하지 않는다”는 결론은 틀리다. **형태·일부 ID 정합성을 검증하지만 근거의 입력 소속/값 대응은 보장하지 않는다**가 정확하다. 이 부분의 광범위한 계약 확장은 #11 새 기능으로 요구하지 않는다. 다만 H2처럼 새 추출기가 직접 잘못 선택하는 근거는 #11 안에서 해결해야 한다.

## 3. 이슈 #11 DoD 항목별 판정

| # | 이슈 완료 조건 | 판정 | 근거/남은 일 |
|---|---|---|---|
| 1 | snapshot 재생, source=cached, 오프라인 동일 결과 | PASS | 30건 프로필 및 네트워크 차단 테스트 성공 |
| 2 | 무입력 present:false, 오류 없이 정상 종료 | PASS | undefined/null/{}/photos:[] 정상. 추출 모듈 및 E8 범위이며 API 통합 완료를 뜻하지 않음 |
| 3 | 캡션 입력이 있을 때만 empty_caption_ratio | PASS | 미관측 language=null; 빈 문자열 관측 ratio=1, 다른 언어 Claim 생략 |
| 4 | 캐러셀 1건을 앱 실제 게시물과 눈 대조, 같다/다르다/확인 불가를 이슈에 기록 | PENDING | 댓글 기록과 웹 저장 목록 대조는 있음. 앱 눈 대조 미실행을 report/댓글도 인정 |
| 5 | A2가 다르거나 확인 불가면 opener unknown/optional, 순서 근거 제외 | **FAIL** | H1: 두 판정 및 메타데이터 누락 모두 opener 생성 |
| 6 | 직접 업로드 대체 경로, 캡션 없으면 언어 습관 생성 금지 | PASS | photo_upload, language=null, completeness.language=0 |
| 7 | 없는 opener에 문자열 불명을 억지로 넣지 않음 | PASS | 미분석·무관한 file_ref·동률에서 생략. 실패 A2에서 필드가 생기는 별도 문제는 #5 |

P2: **FAIL(H2)**. P3: 미관측/전부 빈 캡션을 억지로 채우지 않는 추출 범위는 PASS. 캡션 슬롯 생성 UI/F3의 P3 준수는 이 이슈 범위 밖이므로 판정하지 않았다. 계약 형태: 실행한 정상·경계 출력은 validateProfile 통과, 스키마 변경 없음(인수 SHA 기준).

## 4. fixture 현실성

직접 읽은 `pivot/apify-check/fixtures/ig_feed_29cm.json`은 30건, 캐러셀 26건, 단일 4건, 한글 캡션 30건, 빈 캡션 0건, 20장 캐러셀 0건이다. 새 fixture는 이 원본의 캡션과 child_count를 30건 모두 보존한다. **합성 영문 단일 사진만으로 현실을 대체한 fixture는 아니다.**

다만 이 실제 세트에 없는 빈 캡션/20장은 별도 경계가 필요하다. 이번 리뷰에서 child_count=1 및 20에 caption=""를 넣어 각각 carousel_count=0/1, empty_caption_ratio=1, 나머지 언어 Claim 생략을 확인했다. 저장된 A2 두 번째 대조에는 다른 계정의 실제 20장 사례가 있다. 현재 17개 테스트는 음성 입력·동률·무관 file_ref도 검사하지만 A2 실패, 근거와 값 대응, 중복 관측, 혼합 어미는 놓친다. eval은 기존 수동 골든을 읽으며 buildCurrentProfile을 호출하지 않는다.

## 5. 실행 명령과 실제 출력

모든 Node/npm/git 명령 cwd: `/Users/chowonjae/Desktop/projects/wanted/.work/gyeol-11`. 아래 npm 출력은 실제 로그의 결과 부분을 발췌했고, 개별 테스트 시간은 생략했다.

```text
$ gh pr view 29 --repo Daterl/gyeol --json headRefName,headRefOid,baseRefName
{"baseRefName":"main","headRefName":"feat/11-current-profile","headRefOid":"77c77ca23c36677b51aabe8bbd6ba7a3080f4ed4"}
$ git diff 7d16ff8 HEAD -- schemas
(출력 없음)
$ npm test
> node --test test/*.test.js
1..77
# tests 77
# suites 0
# pass 77
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 170.789333

$ npm run eval
> node eval/run.js
Synthetic manual bootstrap only; no AI quality or human agreement claim.
quiet: E1 PASS, E2 PASS, E3 PASS, E6 PASS, E8 PASS
quiet broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
quiet broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
quiet broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
quiet broken E6: EXPECTED FAIL — E6.title: expected nonempty string
quiet broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
detail: E1 PASS, E2 PASS, E3 PASS, E6 PASS, E8 PASS
detail broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
detail broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
detail broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
detail broken E6: EXPECTED FAIL — E6.title: expected nonempty string
detail broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
E4/E5/E7: manual spot-check only; real demo review pending.

$ npm run check
> node scripts/check.js
PASS: 28 JS/JSON files checked; zero dependencies; four schema examples match fixtures. JS syntax/JSON parsing only, no separate typechecker or linter.
```

eval의 console.table 두 표만 한 줄씩 전사했다. 세 필수 명령 모두 완료됐으며 오류 출력은 없었다.

### 공격·경계 입력 재현 스크립트

아래를 워크트리에서 그대로 실행했다. 저장 파일을 만들지 않고 heredoc으로 호출했다.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import {buildCurrentProfile as build} from './lib/current_profile.js';
import {validateProfile,validateDisclosure,validateFeed} from './lib/contracts.js';
import {evaluate} from './eval/invariants.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')), clone=structuredClone;
const snap=read('fixtures/ig_snapshot.json'), photos=read('fixtures/photo_analysis.sample.json');
const now='2026-09-17T00:00:00.000Z';
const run=(label,f)=>{try{console.log(label+': '+JSON.stringify(f()))}catch(e){console.log(label+': '+e.name+': '+e.message)}};
const valid=p=>{validateProfile(p,'current');return 'ACCEPTED'};
const carousel=snap.posts.filter(p=>p.child_count>=2);
const opener=(i,scale='fullshot')=>({...clone(photos[0]),photo_id:'opener_'+i,file_ref:carousel[i].opener_image,has_face:false,scale});
run('normal cached',()=>{const p=build({snapshot:snap},now);return {validation:valid(p),n:p.sample_size,sequence:p.sequence,len:p.language.caption_len.value,emoji:p.language.emoji_rate.value,ending:p.language.ending_style}});
for(const [name,input] of [['undefined',undefined],['null',null],['empty object',{}],['empty photos',{photos:[]}],['empty snapshot',{snapshot:{provenance:{account:'a'},posts:[]}}],['empty snapshot without account',{snapshot:{posts:[]}}],['malformed photos',{photos:'bad'}],['malformed captions',{photos:[photos[0]],captions:[3]}],['malformed openers',{snapshot:snap,openers:{}}]]) run(name,()=>{const p=build(input,now);return {validation:valid(p),present:p.present}});
run('all blank captions',()=>{const p=build({photos:photos.slice(0,3),captions:['',' ','\n']},now);return {validation:valid(p),language:p.language}});
run('no captions',()=>build({photos:[photos[0]]},now).language);
for(const verdict of ['같다','다르다','확인 불가',null]) run('A2 '+verdict,()=>{const s=clone(snap);if(verdict===null)delete s.provenance.carousel_order_check;else s.provenance.carousel_order_check.verdict=verdict;const p=build({snapshot:s,openers:[opener(0)]},now);return {validation:valid(p),sequence:p.sequence}});
run('foreign file ref',()=>build({snapshot:snap,openers:[{...opener(0),file_ref:'foreign.jpg'}]},now).sequence);
run('duplicate opener breaks tie',()=>{const a=opener(0),b=opener(1,'closeup');return {unique:build({snapshot:snap,openers:[a,b]},now).sequence,duplicated:build({snapshot:snap,openers:[a,b,b]},now).sequence}});
run('evidence contradicts opener',()=>{const openers=[0,1,2].map(i=>opener(i,'midshot')).concat([3,4].map(i=>opener(i,'closeup')));const p=build({snapshot:snap,openers},now);return {validation:valid(p),claim:p.sequence.opener_tendency}});
run('subjects absent in cited photos',()=>{const ps=photos.slice(0,5).map((p,i)=>({...clone(p),subjects:i<3?['unique_'+i]:['고양이']}));const p=build({photos:ps},now);return {validation:valid(p),claim:p.visual.subjects,citedSubjects:ps.slice(0,3).map(p=>p.subjects)}});
run('duplicate photo invents repetition',()=>{const p=build({photos:[photos[0],photos[0]]},now);return {validation:valid(p),n:p.sample_size,subjects:p.visual.subjects}});
for(const mode of ['foreign-photo','foreign-profile','copied-value','empty-evidence'])run('mutation '+mode,()=>{const p=build({photos:photos.slice(0,3),captions:['가','가','가']},now);if(mode==='foreign-photo')p.visual.palette.evidence[0].ref='NOT_IN_INPUT';if(mode==='foreign-profile')p.profile_id='DOES_NOT_EXIST';if(mode==='copied-value')p.language.caption_len=build({photos:photos.slice(0,3),captions:['다른 입력에서 복사한 긴 문장','다른 입력에서 복사한 긴 문장','다른 입력에서 복사한 긴 문장']},now).language.caption_len;if(mode==='empty-evidence')p.visual.palette.evidence=[];return {validation:valid(p)}});
run('wrong applied current ID',()=>validateDisclosure({current_profile_id:'DOES_NOT_EXIST',disclosure:'target_only',corrected:false,deltas:[]},build({snapshot:snap},now)));
run('same cached ID different input E8',()=>{const a=build({snapshot:snap},now),s=clone(snap);s.posts=s.posts.slice(0,1);s.posts[0].caption='';const b=build({snapshot:s},now);validateDisclosure({current_profile_id:a.profile_id,disclosure:'corrected',corrected:true,deltas:[]},b);return {idA:a.profile_id,idB:b.profile_id,ratioA:a.language.empty_caption_ratio.value,ratioB:b.language.empty_caption_ratio.value,E8:'ACCEPTED'}});
for(const caption of ['한글','한글','🇰🇷','1️⃣','👨‍👩‍👧‍👦'])run('unicode '+caption,()=>{const p=build({photos:[photos[0]],captions:[caption]},now);return {len:p.language.caption_len.value,emoji:p.language.emoji_rate.value,ending:p.language.ending_style}});
run('mixed endings 2/5',()=>build({photos:photos.slice(0,5),captions:['좋아요','가요','간다','사진','hello']},now).language.ending_style);
const raw=read('/Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/ig_feed_29cm.json');
run('real fixture comparison',()=>({raw:raw.length,carousel:raw.filter(p=>p.childPosts?.length>=2).length,single:raw.filter(p=>!(p.childPosts?.length>=2)).length,twenty:raw.filter(p=>p.childPosts?.length===20).length,blank:raw.filter(p=>p.caption==='').length,hangul:raw.filter(p=>/[가-힣]/.test(p.caption)).length,mismatches:snap.posts.filter(p=>{const r=raw.find(r=>r.shortCode===p.shortcode);return !r||p.caption!==r.caption||p.child_count!==Math.max(1,r.childPosts?.length??1)}).map(p=>p.shortcode)}));
for(const count of [1,20])run('single/20 blank snapshot '+count,()=>{const s=clone(snap);s.posts=[{...s.posts[0],caption:'',child_count:count}];const p=build({snapshot:s},now);return {validation:valid(p),sequence:p.sequence,language:p.language}});

NODE
```

실제 출력:

```text
normal cached: {"validation":"ACCEPTED","n":30,"sequence":{"carousel_count":26},"len":{"p50":289,"p90":888,"unit":"자"},"emoji":5.5,"ending":{"value":"명사형","confidence":0.7,"evidence":[{"kind":"ig_post","ref":"29cm.official:DdXobUvgbJS","note":"캡션 끝맺음 표면형을 세어 가장 잦은 쪽을 골랐다"},{"kind":"ig_post","ref":"29cm.official:DdWHSQGlMt4","note":"캡션 끝맺음 표면형을 세어 가장 잦은 쪽을 골랐다"},{"kind":"ig_post","ref":"29cm.official:DdVKdyACaC1","note":"캡션 끝맺음 표면형을 세어 가장 잦은 쪽을 골랐다"}]}}
undefined: {"validation":"ACCEPTED","present":false}
null: {"validation":"ACCEPTED","present":false}
empty object: {"validation":"ACCEPTED","present":false}
empty photos: {"validation":"ACCEPTED","present":false}
empty snapshot: {"validation":"ACCEPTED","present":false}
empty snapshot without account: ContractError: snapshot.provenance.account: expected nonempty string
malformed photos: ContractError: CurrentProfile.input.photos: expected array
malformed captions: ContractError: CurrentProfile.input.captions: expected strings
malformed openers: TypeError: openers?.forEach is not a function
all blank captions: {"validation":"ACCEPTED","language":{"banned_words":["이처럼","또한","이를 통해","이러한","마침내"],"empty_caption_ratio":{"value":1,"confidence":1,"evidence":[{"kind":"uploaded_photo","ref":"ph_01","note":"캡션이 비어 있던 게시물 수를 관측한 전체 게시물 수로 나눈 값이다"},{"kind":"uploaded_photo","ref":"ph_02","note":"캡션이 비어 있던 게시물 수를 관측한 전체 게시물 수로 나눈 값이다"},{"kind":"uploaded_photo","ref":"ph_03","note":"캡션이 비어 있던 게시물 수를 관측한 전체 게시물 수로 나눈 값이다"}]}}}
no captions: null
A2 같다: {"validation":"ACCEPTED","sequence":{"carousel_count":26,"opener_tendency":{"value":"풀샷","confidence":1,"evidence":[{"kind":"ig_post","ref":"29cm.official:DdXobUvgbJS","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"}]}}}
A2 다르다: {"validation":"ACCEPTED","sequence":{"carousel_count":26,"opener_tendency":{"value":"풀샷","confidence":1,"evidence":[{"kind":"ig_post","ref":"29cm.official:DdXobUvgbJS","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"}]}}}
A2 확인 불가: {"validation":"ACCEPTED","sequence":{"carousel_count":26,"opener_tendency":{"value":"풀샷","confidence":1,"evidence":[{"kind":"ig_post","ref":"29cm.official:DdXobUvgbJS","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"}]}}}
A2 null: {"validation":"ACCEPTED","sequence":{"carousel_count":26,"opener_tendency":{"value":"풀샷","confidence":1,"evidence":[{"kind":"ig_post","ref":"29cm.official:DdXobUvgbJS","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"}]}}}
foreign file ref: {"carousel_count":26}
duplicate opener breaks tie: {"unique":{"carousel_count":26},"duplicated":{"carousel_count":26,"opener_tendency":{"value":"클로즈업","confidence":0.67,"evidence":[{"kind":"ig_post","ref":"29cm.official:DdXobUvgbJS","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"},{"kind":"ig_post","ref":"29cm.official:DdWHSQGlMt4","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"},{"kind":"ig_post","ref":"29cm.official:DdWHSQGlMt4","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"}]}}}
evidence contradicts opener: {"validation":"ACCEPTED","claim":{"value":"클로즈업","confidence":1,"evidence":[{"kind":"ig_post","ref":"29cm.official:DdXobUvgbJS","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"},{"kind":"ig_post","ref":"29cm.official:DdWHSQGlMt4","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"},{"kind":"ig_post","ref":"29cm.official:DdVKdyACaC1","note":"이 캐러셀의 1번 사진을 분석한 결과에서 나온 성향이다"}]}}
subjects absent in cited photos: {"validation":"ACCEPTED","claim":{"value":["고양이"],"confidence":0.4,"evidence":[{"kind":"uploaded_photo","ref":"ph_01","note":"두 장 이상에서 반복해 나온 피사체다"},{"kind":"uploaded_photo","ref":"ph_02","note":"두 장 이상에서 반복해 나온 피사체다"},{"kind":"uploaded_photo","ref":"ph_03","note":"두 장 이상에서 반복해 나온 피사체다"}]},"citedSubjects":[["unique_0"],["unique_1"],["unique_2"]]}
duplicate photo invents repetition: {"validation":"ACCEPTED","n":2,"subjects":{"value":["합성 색상 카드"],"confidence":1,"evidence":[{"kind":"uploaded_photo","ref":"ph_01","note":"두 장 이상에서 반복해 나온 피사체다"},{"kind":"uploaded_photo","ref":"ph_01","note":"두 장 이상에서 반복해 나온 피사체다"}]}}
mutation foreign-photo: {"validation":"ACCEPTED"}
mutation foreign-profile: {"validation":"ACCEPTED"}
mutation copied-value: {"validation":"ACCEPTED"}
mutation empty-evidence: ContractError: currentProfile.visual.palette.evidence: needs at least one evidence
wrong applied current ID: ContractError: E8: current profile ID differs from actual input
same cached ID different input E8: {"idA":"cur_cached_29cm_official","idB":"cur_cached_29cm_official","ratioA":0,"ratioB":1,"E8":"ACCEPTED"}
unicode 한글: {"len":{"p50":2,"p90":2,"unit":"자"},"emoji":0,"ending":{"value":"명사형","confidence":1,"evidence":[{"kind":"uploaded_photo","ref":"ph_01","note":"캡션 끝맺음 표면형을 세어 가장 잦은 쪽을 골랐다"}]}}
unicode 한글: {"len":{"p50":6,"p90":6,"unit":"자"},"emoji":0}
unicode 🇰🇷: {"len":{"p50":2,"p90":2,"unit":"자"},"emoji":0}
unicode 1️⃣: {"len":{"p50":3,"p90":3,"unit":"자"},"emoji":0}
unicode 👨‍👩‍👧‍👦: {"len":{"p50":7,"p90":7,"unit":"자"},"emoji":4}
mixed endings 2/5: {"value":"해요","confidence":0.5,"evidence":[{"kind":"uploaded_photo","ref":"ph_01","note":"캡션 끝맺음 표면형을 세어 가장 잦은 쪽을 골랐다"},{"kind":"uploaded_photo","ref":"ph_02","note":"캡션 끝맺음 표면형을 세어 가장 잦은 쪽을 골랐다"},{"kind":"uploaded_photo","ref":"ph_03","note":"캡션 끝맺음 표면형을 세어 가장 잦은 쪽을 골랐다"}]}
real fixture comparison: {"raw":30,"carousel":26,"single":4,"twenty":0,"blank":0,"hangul":30,"mismatches":[]}
single/20 blank snapshot 1: {"validation":"ACCEPTED","sequence":{"carousel_count":0},"language":{"banned_words":["이처럼","또한","이를 통해","이러한","마침내"],"empty_caption_ratio":{"value":1,"confidence":1,"evidence":[{"kind":"ig_post","ref":"29cm.official:DdXobUvgbJS","note":"캡션이 비어 있던 게시물 수를 관측한 전체 게시물 수로 나눈 값이다"}]}}}
single/20 blank snapshot 20: {"validation":"ACCEPTED","sequence":{"carousel_count":1},"language":{"banned_words":["이처럼","또한","이를 통해","이러한","마침내"],"empty_caption_ratio":{"value":1,"confidence":1,"evidence":[{"kind":"ig_post","ref":"29cm.official:DdXobUvgbJS","note":"캡션이 비어 있던 게시물 수를 관측한 전체 게시물 수로 나눈 값이다"}]}}}

```

### 기존 검증기 공격

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs'; import {evaluate} from './eval/invariants.js'; import {validateFeed} from './lib/contracts.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const base='eval/golden/case_01/';
const b={inputPhotoIds:read(base+'input.json').photo_ids,currentProfile:read(base+'current_profile.json'),targetProfile:read(base+'target_quiet.json'),feed:read(base+'ordered_quiet.json'),output:read(base+'export_quiet.json')};
for(const mutation of ['foreign evidence','foreign target ID']){const x=structuredClone(b);if(mutation==='foreign evidence')x.feed.slots[0].rationale.evidence[0].ref='photo_does_not_exist';else x.feed.applied_profile.target_profile_id='profile_does_not_exist';try{validateFeed(x.feed,x.inputPhotoIds,x.currentProfile);console.log(mutation+': validateFeed ACCEPTED; eval='+JSON.stringify(evaluate(x)));}catch(e){console.log(e.message)}}

NODE
```

```text
foreign evidence: validateFeed ACCEPTED; eval={"E1":{"pass":true},"E2":{"pass":true},"E3":{"pass":true},"E6":{"pass":true},"E8":{"pass":true}}
foreign target ID: validateFeed ACCEPTED; eval={"E1":{"pass":true},"E2":{"pass":true},"E3":{"pass":true},"E6":{"pass":true},"E8":{"pass":true}}
```

### 저장된 A2 증거 재검사

```sh
python3 /Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/verify_carousel_order.py /Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/ig_feed_29cm.json DdVKdyACaC1 /Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/browser_order_DdVKdyACaC1.json
python3 /Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/verify_carousel_order.py /Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/ig_feed_humansofny.json DdJWXXTHCMv /Users/chowonjae/Desktop/projects/wanted/pivot/apify-check/fixtures/browser_order_DdJWXXTHCMv.json
```

실제 출력 마지막 행(각각 인덱스 0~9/0~19 모두 OK):

```text
apify n=10 web n=10 순서 일치: True
apify n=20 web n=20 순서 일치: True
```

이는 저장된 데이터 간 비교다. 이번 리뷰에서 인스타 앱/웹을 직접 열어 캐러셀을 넘긴 것은 아니다.

