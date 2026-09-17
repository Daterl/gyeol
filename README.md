# 결 GYEOL

**올리고 싶은 사진 여러 장을 넣으면, 어떤 순서로 / 뭐라고 열고 / 어디에 말을 붙일지를 근거와 함께 제안합니다.**

사진을 보정하지 않습니다. **고릅니다.** 그리고 굳이 말할 필요 없는 자리는 **비운 채로** 돌려줍니다.

원티드 AI 챔피언십 2026 출품작.

---

## 돌리기

> ⚠️ **현재 이 레포에는 문서 4개뿐이고 코드가 없다.** 아래는 `CLAUDE.md` 7절에서 확정한 스택 기준의 **약속된 명령**이며, `docs/intent.md` 4-4절 순번 0~2 에서 실제로 만든다.

```sh
npm install
cp .env.example .env     # ANTHROPIC_API_KEY 를 채운다
npm run dev              # 로컬 서버
```

AI 호출 없이 화면만 보려면 `?mock=1` 을 붙인다 — `fixtures/` 의 고정 샘플로 응답한다.

```sh
npm test                 # 단위 테스트 (Node 내장 test runner)
npm run eval             # 출력 불변식 판정 (CLAUDE.md 6-2절)
```

배포는 **`main` 에 merge 되면 Vercel 이 자동으로** 한다. 별도 명령이 없다.

## 스택

빌드 없는 단일 HTML + 바닐라 JS (`public/`) · Vercel Serverless Functions (`api/`, Node 22) · Anthropic API (`claude-opus-5`).
DB 없음, 로그인 없음, CI 없음. **고른 이유는 `CLAUDE.md` 7절에 한 줄씩 적혀 있다.**

## 구조

```
public/        화면 (디에고 소유)
api/           서버리스 함수 (원재 소유)
lib/           입력 이해 로직 (원재 소유)
prompts/       input/ 원재 · output/ 디에고 · shared/ 공동
schemas/       ★ 경계 계약. 바꾸려면 양쪽 승인
fixtures/      mock 데이터
docs/intent.md ★ 무엇을 왜 만드는가. 모든 이슈가 여기를 가리킨다
CLAUDE.md      ★ 작업 규약. 코드 만지기 전에 읽는다
```

## 팀

| 사람 | 역할 | 소유 |
|---|---|---|
| **원재** (`@onejaejae`) | 백엔드 + AI — **입력 이해** | 사진 분석 · 두 축 프로필 · 순서 제안 |
| **디에고** (`@jangwonyoon`) | 프론트엔드 + AI — **출력 생성** | 화면 전체 · 타이틀 · 캡션 · 비움 판단 |

경계선은 딱 하나, `OrderedFeed` JSON 이다. 자세한 경계는 `CLAUDE.md` 4절.

## 일정

| 시각 | 무엇 |
|---|---|
| 2026-09-19 | 참가 신청 마감 |
| **2026-09-21 00:00 KST** | **제출 마감** |
| 09-21 ~ 10-06 | 예선 — **온라인 투표** (상위 50팀) |
| 10-07 ~ 10-16 | 본선 (상위 20팀) |
| 10-17 | 데모데이 |

**실질 개발 기간은 9/20 자정까지 약 3.5일이다.** 무엇을 자르기로 했는지는 `docs/intent.md` 4절에 근거와 함께 있다.
