# report — #11 CurrentProfile 추출

**Verdict: PASS** (아래 5절의 명시한 검증 범위에서만. merge·배포 완료가 아니다)
기준 SHA: `7d16ff870f1304de8ec86a5de4ac1b7fa8103a4c` · 브랜치 `feat/11-current-profile` · 2026-09-17

변경 파일
| 파일 | 상태 |
|---|---|
| `fixtures/ig_snapshot.json` | 신규 (공유 — #24 계약 확인 대상) |
| `lib/current_profile.js` | 신규 |
| `prompts/input/current_extract.md` | 신규 |
| `test/current_profile.test.js` | 신규 (17 케이스) |
| `docs/specs/11-current-profile/*` | 신규 (문서 + 실행 출력 4개) |

**안 건드린 것:** `schemas/` 4종 · `lib/contracts.js` · `api/` · `eval/` · `fixtures/*.sample.json` · `package.json` · `public/`.

---

## 1. 무엇이 됐나

세 입력 경로가 전부 `schemas/current_profile.md` 를 통과하는 `CurrentProfile` 을 만든다.

| 경로 | `source` | 결과 |
|---|---|---|
| 아무것도 안 올림 | `none` | `present:false`, **예외 없이 정상 종료** |
| 스냅샷 재생 (`fixtures/ig_snapshot.json`) | `cached` | 게시물 30건 · 캐러셀 26건 · 언어 습관 5종 |
| 기존 게시물 직접 업로드 | `photo_upload` | 사진 15장에서 visual 4종, 캡션은 줬을 때만 |

---

## 2. `fixtures/ig_snapshot.json` 은 어디서 왔나

실제 공개 계정(`29cm.official`) 의 **사전 수집 스냅샷 파생본**이다. 합성 데이터가 아니다.
원본은 `pivot/apify-check/fixtures/ig_feed_29cm_local.json` (Apify Run `66MzKDhQJ8yDhQ7Fp`, 30건, 48.8초, $0.081 — 출처 `pivot/apify-check/README.md`).
**이 이슈에서 새로 수집하지 않았다. 네트워크 호출 0회, 비용 0원.**

원본에서 CurrentProfile 추출에 필요한 필드만 남겼다 — 댓글·좋아요·이미지 바이트·**2026-09-22 만료되는 원격 URL**을 뺐다.
1.0MB → 36KB. 생성에 쓴 명령은 아래와 같고, 원본이 레포 밖(`pivot/`, 읽기 전용)이라 스크립트로 커밋하지 않았다.

```sh
node -e 'const d=JSON.parse(fs.readFileSync(SRC));
  posts = d.map(p => ({shortcode:p.shortCode, url:p.url, timestamp:p.timestamp, caption:p.caption??"",
                       child_count:Math.max(1, p.childPosts?.length ?? 1),
                       opener_image:p.childPosts?.[0]?.displayUrl ?? p.displayUrl}))
           .sort((a,b) => a.timestamp < b.timestamp ? 1 : -1)'
```

검증: 게시물 30건 · 캐러셀(`child_count>=2`) 26건 · 단일 4건 · 빈 캡션 0건 — 전부 원본과 일치.

---

## 3. ★ A2 판정 — 캐러셀 내부 순서

> ## 판정: **같다**

`docs/intent.md` 8절 A2("Apify 가 반환하는 캐러셀 내부 순서 = 원본 게시 순서") 를 여기서 닫는다.

| 게시물 | 계정 | 장수 | 불일치 |
|---|---|---:|---:|
| `DdVKdyACaC1` | 29cm.official | 10 | **0** |
| `DdJWXXTHCMv` | humansofny | 20 | **0** |

전체 출력은 `a2-carousel-order.txt`. 두 실행 모두 `exit=0`, 인덱스 단위로 전부 `OK`.

**방법과 그 한계를 정확히 적는다.** 이슈 DoD 의 문구는 "인스타 앱의 실제 게시물과 **눈으로** 대조"였다.
실제로 한 것은 **인스타그램 웹 게시물에서 캐러셀을 끝까지 넘기며 수집한 DOM 이미지 순서**와
Apify `childPosts` 배열 순서를 **파일명 단위로 기계 대조**한 것이다(`pivot/apify-check/verify_carousel_order.py`,
수집본 `browser_order_*.json`). 앱 화면을 사람이 넘겨본 것이 아니다.
기계 대조가 눈 대조보다 촘촘하지만(30장 전부, 착시 없음) **"앱"이 아니라 "웹"이라는 차이는 남는다.**
웹과 앱이 다른 순서로 렌더링할 가능성은 이 실행으로 배제되지 않았다 — 그대로 적어 둔다.

**따라서:** `opener_tendency` 를 순서 근거로 쓰는 것이 허용된다.
다만 **"순서를 믿어도 된다"가 "1번 사진을 안 보고 성향을 말해도 된다"는 아니므로**,
캐러셀 1번 사진의 분석이 실제로 들어왔을 때만 필드를 낸다(spec 4-2).

---

## 4. DoD 한 줄씩 대조

| 이슈 DoD | 판정 | 증거 |
|---|---|---|
| `ig_snapshot.json` 재생으로 `CurrentProfile` 이 나온다 (`source:"cached"`) | ✅ | `offline-replay.txt` — `source=cached id=cur_cached_29cm_official n=30` |
| **네트워크를 끊어도 같은 결과** | ✅ | `offline-replay.txt` — fetch/net/http/https/dns 전부 차단, **외부 호출 시도 0회**, 재생 2회 sha 동일 `true`. 테스트로도 고정(`test.txt`) |
| 아무것도 안 올리면 `present:false` 이고 **에러가 아니다** | ✅ | `offline-replay.txt` 부재 행 — `present=false source=none`, "에러 없이 정상 종료". E8 정합성도 테스트 |
| `empty_caption_ratio` 는 캡션 입력이 있을 때만 (없으면 필드를 뺀다) | ✅ | 캡션 없음 → `language=null` (필드 자체 없음) / 캡션 있음 → `empty_caption_ratio=0.33` |
| **A2 대조를 "같다/다르다/확인 불가" 중 하나로 이슈에 적었다** | ✅ | 3절 = **같다**. 이슈 코멘트로도 남긴다 |
| A2 가 다르거나 확인 불가면 opener 를 unknown 처리 | 해당없음 | A2 = 같다. 다만 3조건 게이트는 그대로 유지했다 |
| 비공개 계정 대체 경로(직접 업로드) 포함. 캡션 없으면 언어 습관을 만들지 않는다 | ✅ | `source=photo_upload`, 캡션 미관측 시 `language=null`·`completeness.language=0` |
| `opener_tendency` 를 문자열 '불명' 으로 억지로 넣지 않는다 | ✅ | `offline-replay.txt` — **'불명' 등장 0회**. 전 경로를 훑는 테스트 있음 |

---

## 5. 실행한 검증

전체 출력은 같은 폴더의 `test.txt` · `eval.txt` · `offline-replay.txt` · `a2-carousel-order.txt`.

### `npm test`

```
1..77
# tests 77
# suites 0
# pass 77
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 113.463292
```

기존 60 케이스 + 이번 17 케이스. **기존 테스트를 하나도 고치지 않았다.**

### `npm run eval`

```
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
...
└─────────┴──────────┴───────────┴────────┴────────┘
detail broken E1: EXPECTED FAIL — $.feed.slots.0.rationale.evidence: needs at least one evidence
detail broken E2: EXPECTED FAIL — E2: duplicate, missing or foreign photo ID
detail broken E3: EXPECTED FAIL — E3: positions must cover 1..N exactly once
detail broken E6: EXPECTED FAIL — E6.title: expected nonempty string
detail broken E8: EXPECTED FAIL — E8: absent current requires honest target-only disclosure
E4/E5/E7: manual spot-check only; real demo review pending.
```

E1·E2·E3·E6·E8 이 quiet·detail 두 케이스에서 전부 PASS 이고, 고의로 깨뜨린 fixture 5종은 전부 EXPECTED FAIL.
**이 이슈는 `eval/` 을 건드리지 않았다** — 회귀가 없다는 증거로 돌린 것이다.

### `npm run check`

```
PASS: 28 JS/JSON files checked; zero dependencies; four schema examples match fixtures.
```

의존성 0개 유지. 새 스냅샷 fixture 도 파싱 통과.

---

## 6. 실제 스냅샷에서 나온 값 (사람이 눈으로 볼 것)

```
carousel_count = 26        opener_tendency = (필드 없음 — 1번 사진 분석을 아직 안 받았다)
caption_len    = p50 289자, p90 888자
emoji_rate     = 5.5 / 건
ending_style   = 명사형 (confidence 0.7)
linebreak_habit= 문단
empty_caption_ratio = 0
```

**이 숫자를 제품 주장의 근거로 쓰기 전에 알아야 할 것:** 29cm.official 은 **브랜드 본계정**이고,
1차 타깃인 "부계를 운영하는 20대 일상 기록러"가 아니다(`docs/intent.md` 2절).
이모지 5.5개·캡션 289자·해시태그 뭉치는 브랜드 운영 계정의 습관이지 타깃 사용자의 습관이 아니다.
**추출기가 도는 증거로는 유효하고, 타깃 사용자의 언어 습관 증거로는 유효하지 않다.**

---

## 7. 아직 안 된 것 · 남은 게이트

| # | 무엇 | 왜 |
|---|---|---|
| 1 | `opener_tendency` 가 실제 스냅샷에서 값을 가진 적이 없다 | 캐러셀 1번 사진의 `PhotoAnalysis` 가 필요하고 그건 #12 소관이다. 경로와 3조건 게이트는 합성 분석으로 테스트했다 |
| 2 | `prompts/input/current_extract.md` 를 **런타임이 읽지 않는다** | 현재 추출은 결정적 계산이다. 모델을 붙이는 것은 이 이슈 범위 밖 |
| 3 | `api/` 응답에 안 붙었다 | 응답 모양 변경은 L 이고 #24 계약 소관 |
| 4 | 배포 환경 검증 (12단계 11번) | merge 전이라 배포 URL 이 없다. 순수 계산 모듈이라 환경변수 의존은 없다 |
| 5 | 다중 모델 리뷰 (M = 권장) | 미실행. 미실행을 0건으로 기록하지 않는다 |
| 6 | **칸반 보드 갱신 (https://github.com/orgs/Daterl/projects/2)** | \`gh\` 토큰에 \`read:project\` 스코프가 없어 칸 이름을 읽지 못했다 (\`error: your authentication token is missing required scopes [read:project]\`). 규약대로 보드를 건너뛰고 이슈 댓글로만 기록했다 |
| 7 | 사람 합의 | `fixtures/ig_snapshot.json` 은 공유 파일이다. #24 와 diego.yoon 확인 pending |

## 8. `schemas/` 에 대해 하고 싶었지만 안 한 말

**바꾸지 않았다.** 다만 다음 두 가지는 다음 스키마 라운드에서 다룰 후보다.

1. `sequence.opener_tendency` 의 enum 에 `"불명"` 이 들어 있다. 이 값은 **미관측을 판단처럼 보이게 만든다.**
   지금은 필드를 생략해서 피했지만, enum 에 남아 있는 한 다른 구현이 `"불명"` 을 채워 넣을 수 있다.
   빼는 방향(필드 생략만 허용)을 제안한다 — 스키마는 **줄이는 변경을 환영**한다(CLAUDE.md 4-2).
2. `completeness` 의 계산 규칙이 스키마에 없다. 이 이슈는 "채운 Claim 수 / 스키마가 정의한 선택 Claim 수"로 정했고
   (spec 4-4) 다른 구현이 다른 규칙을 쓰면 두 프로필의 `completeness` 를 비교할 수 없다. 규칙을 스키마에 적을 것을 제안한다.
