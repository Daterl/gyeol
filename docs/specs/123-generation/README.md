# #123 real-model generation acceptance

On 2026-09-19, five consecutive three-photo requests and five consecutive fifteen-photo requests returned 200 through the real `handleGenerate` POST handler. Every response preserved photo IDs and feed positions, a one-line title, canonical own-photo evidence, and a reason for each omitted slot. Existing public seed/omission responses remain editable by the client.

| Photos | Run | HTTP | Time (ms) | Model message calls | Omitted |
| --- | --- | --- | --- | --- | --- |
| 3 | 1 | 200 | 3999 | 1 | 1 |
| 3 | 2 | 200 | 3795 | 1 | 1 |
| 3 | 3 | 200 | 7080 | 2 | 2 |
| 3 | 4 | 200 | 7424 | 2 | 1 |
| 3 | 5 | 200 | 3624 | 1 | 1 |
| 15 | 1 | 200 | 18633 | 2 | 2 |
| 15 | 2 | 200 | 9235 | 1 | 4 |
| 15 | 3 | 200 | 8418 | 1 | 6 |
| 15 | 4 | 200 | 10011 | 1 | 4 |
| 15 | 5 | 200 | 8341 | 1 | 3 |

[Acceptance responses and provider bodies](acceptance.json) are the canonical measurements. [Baseline](baseline.json) records the original three-photo 502 on develop `a4110c1`; [diagnostics](diagnostics.json) retains unsuccessful intermediate attempts, including a fifteen-photo failure. Failed attempts were not counted toward the final consecutive five-run series.

## Reproduction

Use Node 24 and an environment file with `ANTHROPIC_API_KEY` and, if required for the account, `ANTHROPIC_WORKSPACE_ID`:

```sh
node --env-file=.env.local scripts/verify-generation.js /path/to/pivot/apify-check/fixtures/images /tmp/generation-acceptance.json
```

The runner selects the first 15 JPEG/PNG/WebP files in filename order. It analyzes them with the configured real vision model once, then builds a fresh photo-only feed and invokes the POST handler five times per size. A third argument may point to a previous report to reuse its observations; each source filename and SHA-256 must match. The successful run reused the baseline's observations. Configured models were `claude-opus-5` for vision and `claude-haiku-4-5-20251001` for generation. Provider bodies and token usage are recorded, but keys and request headers are not.

## Contract repair

- Model inputs label facts with explicit `{fact_index, text}` pairs, avoiding implicit array counting.
- Provider evidence permits only rules; the server constructs photo evidence from the selected original fact. Existing compatibility validation still rejects invented or contradictory photo notes immediately.
- The prompt asks for one contiguous phrase from one selected fact and defaults optional evidence to `[]`.
- A literal backslash-n before the fixed hint question becomes a newline, before all existing fact checks.
- A hint outside its selected fact is rejected. One fresh model attempt may select again within the same 45-second budget; the second response receives all checks. The correction asks for the full original fact, so recovery may produce a longer cue. Persistent violations still return `MODEL_CONTRACT`; no invalid phrase is accepted or silently rewritten into a fact.

## Verification and limits

Node 24.21.0: `npm test` **404/404**, generation suite **48/48**, `npm run test:ui` **110/110**, plus `eval`, `check`, `lint`, `typecheck`, and `build` passed. New regressions cover the provider schema, explicit fact numbering, newline repair without accepting an invented seed, one bounded retry, immediate invented-note rejection, and shared-deadline exhaustion.

Live calls ran on Node 22.22.3; all automated/build verification ran on the project's required Node 24. The test invoked the actual POST handler with real provider fetches, not a deployed HTTP server. Vision observations were reused rather than re-analyzed for every generation. These measurements establish contract acceptance on this reproduction set, not independent visual truth, general model accuracy, deployment latency, or guaranteed future success. Prompt examples include observed failure patterns, so this is a regression set rather than a held-out quality evaluation. Human visual/caption review remains separate.
