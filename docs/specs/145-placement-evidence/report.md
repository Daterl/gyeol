# #145 placement evidence

The same-color fallback now quotes the current and adjacent photos' model observations verbatim with uploaded-photo references. Openers receive the next photo; other roles use the previous photo. Distinguishing observations explain the placed contents, explicitly not why the scoring rules chose the order. Missing/shared observations disclose the limit; heuristic facts remain measurement-only.

## Validation

- Initial focused baseline: 27/27 pass; five new regressions failed before implementation and passed afterward.
- Node 24.14.0: npm test 306/306; npm run eval, check, typecheck pass. npm run lint passes (42 files; repository lint excludes lib/test, covered by syntax checks and tests).
- Node binary: /Users/chowonjae/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node. Existing shared dependencies were reused; no dependencies added.
- Same-color synthetic 3/15 fixtures check own/adjacent verbatim references, unchanged selection decisions, photo IDs, caption facts and source metadata. Shared/missing/heuristic observations check honest limits. Repetition follows repeated observations, never random or index-based phrase variation.
- Archived model replay: 3/15 photos through buildFeed with a text target; no model/network calls. Sources: ../101-caption-quality/audit-analyses.json and recovered-analysis.json. The recovered p05 file used another session's ph_15 ID; only its fixture ID is restored to ph_05 after filename matching. Observations/source/model metadata remain unchanged.
- Independent baseline comparison against git bcc541a: all 15 archived slots and feed fields excluding rationale are identical; original R1–R4 selection/decision evidence is identical.
- CodeRabbit initial uncommitted review: zero findings across four implementation/test files; free CLI allowance, no usage credits. Final patch review tracked separately below.

## Limits and integration

- No fresh vision model acceptance or human photo-accuracy judgment. The tests establish verbatim provenance from stored observations, not that the original model saw correctly. No quality claim based on unique sentence count.
- Stable export: placementVoice(photo, previous, role, next) returns {value,evidence}; existing three-argument calls work, but opener adjacency requires next. Source must be vision_model before prose facts are quoted.
- pipeline.js preserveOrder bypasses placementVoice for same-color photo-only inputs. Its owner/coordinator has the integration requirement: preserve input order/no_measured_difference and add this voice/evidence, passing next for opener. This PR does not modify that worker's files.
- No UI/cache/deployment edits, new dependencies, paid model calls, production deployment or merge.
- sip audit: observations remain sourced from PhotoAnalysis; order.js retains selection decisions. Pipeline bypass is the identified integration boundary. Fixture acceptance is bounded to provenance, not model quality (mandela audit). Fresh subagent cold-read skipped under the no-recursive-delegation constraint; CodeRabbit and coordinator own independent review. No portability claims or external factual claims require additional skill checks.

## Archived 15-photo placement text

| Position | Photo | Role | Text |
|---|---|---|---|
| 1 | ph_14 | opener | 다음 사진 관측: “사람 한 명이 측면을 향해 서 있다”. 이 사진 관측: “검은 스프링으로 제본된 노트의 윗부분이 화면 대부분을 차지한다”. 이 사진으로 묶음을 열어요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 2 | ph_13 | sustain | 앞 사진 관측: “검은 스프링으로 제본된 노트의 윗부분이 화면 대부분을 차지한다”. 이 사진 관측: “사람 한 명이 측면을 향해 서 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 3 | ph_12 | sustain | 앞 사진 관측: “사람 한 명이 측면을 향해 서 있다”. 이 사진 관측: “흰색과 갈색 털의 개 한 마리가 분홍색 줄무늬 침구 위에 앞다리를 뻗고 엎드려 정면을 보고 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 4 | ph_03 | sustain | 앞 사진 관측: “흰색과 갈색 털의 개 한 마리가 분홍색 줄무늬 침구 위에 앞다리를 뻗고 엎드려 정면을 보고 있다”. 이 사진 관측: “사람 한 명이 거울 앞에서 휴대폰을 들고 서 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 5 | ph_06 | sustain | 앞 사진 관측: “사람 한 명이 거울 앞에서 휴대폰을 들고 서 있다”. 이 사진 관측: “사람 한 명이 크림색 소파에 앉아 정면을 보고 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 6 | ph_15 | sustain | 앞 사진 관측: “사람 한 명이 크림색 소파에 앉아 정면을 보고 있다”. 이 사진 관측: “위아래 두 장의 사진이 하나의 이미지로 세로로 붙어 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 7 | ph_09 | sustain | 앞 사진 관측: “위아래 두 장의 사진이 하나의 이미지로 세로로 붙어 있다”. 이 사진 관측: “흰 털의 개 한 마리가 정면을 향해 앉아 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 8 | ph_07 | sustain | 앞 사진 관측: “흰 털의 개 한 마리가 정면을 향해 앉아 있다”. 이 사진 관측: “사람 한 명의 상반신이 화면을 채우고 있고 얼굴은 화면 위쪽에서 잘려 보이지 않는다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 9 | ph_05 | sustain | 앞 사진 관측: “사람 한 명의 상반신이 화면을 채우고 있고 얼굴은 화면 위쪽에서 잘려 보이지 않는다”. 이 사진 관측: “투명한 유리 접시 위에 갈색 계열 과자 여러 개가 원형으로 둘러 놓여 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 10 | ph_04 | turn | 앞 사진 관측: “투명한 유리 접시 위에 갈색 계열 과자 여러 개가 원형으로 둘러 놓여 있다”. 이 사진 관측: “위아래 두 장의 사진이 하나의 이미지로 붙어 있다”. 이 사진을 전환 자리에 두어요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 11 | ph_08 | sustain | 앞 사진 관측: “위아래 두 장의 사진이 하나의 이미지로 붙어 있다”. 이 사진 관측: “사람 한 명의 목 아래부터 허벅지까지가 화면을 채우고 있고 얼굴은 보이지 않는다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 12 | ph_11 | sustain | 앞 사진 관측: “사람 한 명의 목 아래부터 허벅지까지가 화면을 채우고 있고 얼굴은 보이지 않는다”. 이 사진 관측: “사람 한 명이 화면 오른쪽에 앉아 손으로 턱을 괴고 정면을 보고 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 13 | ph_10 | sustain | 앞 사진 관측: “사람 한 명이 화면 오른쪽에 앉아 손으로 턱을 괴고 정면을 보고 있다”. 이 사진 관측: “사람 한 명이 화면 상단을 차지하며 정면을 향해 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 14 | ph_02 | sustain | 앞 사진 관측: “사람 한 명이 화면 상단을 차지하며 정면을 향해 있다”. 이 사진 관측: “사람 한 명이 앉아 있고 얼굴 위쪽은 화면 밖으로 잘려 있다”. 이 사진으로 흐름을 이어가요. 관측 내용은 순서를 정한 근거는 아니에요. |
| 15 | ph_01 | closer | 앞 사진 관측: “사람 한 명이 앉아 있고 얼굴 위쪽은 화면 밖으로 잘려 있다”. 이 사진 관측: “사람 한 명이 측면을 향해 서 있다”. 이 사진으로 묶음을 마무리해요. 관측 내용은 순서를 정한 근거는 아니에요. |
