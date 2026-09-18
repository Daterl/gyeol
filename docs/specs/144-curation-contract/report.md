# #144 public-profile curation contract

Draft [PR #153](https://github.com/Daterl/gyeol/pull/153) targets `develop`. Latest develop, including PR154 photo normalization and the #149 seed/omission correction, is merged as `7b33b13`. No merge to develop, Production operation, paid provider call, or dependency addition was performed.

## Implemented boundaries

The canonical wire contract is [schemas/interaction.md](../../../schemas/interaction.md). Production `/api/feed` requires a signed public-profile snapshot reference, 3–15 photos and an optional prompt. It resolves #143's stored snapshot without starting ingestion, validates account/provenance/expiry, reuses current/reference/freetext extraction and compose/order, and retains all photo IDs with `included: true`. Exclusion candidates do not remove photos. User prompt and profile provenance stay separate; `ownership_verified: false` is explicit. Legacy identity requests do not fall back through the production handler.

`POST /api/profile/session` issues an anonymous 30-minute signed HttpOnly Secure Strict cookie and a separate session-bound CSRF token. Exact configured HTTPS origin, request URL origin and Fetch Metadata checks precede issuance and browser profile access. The server never derives trusted origin from arbitrary Host or forwarded headers. Invalid bearer never falls back to a cookie. Existing bearer automation remains available without browser-origin headers. Successful profile JSON is an explicit allowlist; stored snapshots, provider receipts, paths and secrets never pass through.

`lib/profile-request-limit.js` applies durable global hourly limits to bootstrap/connect/status and hashed session buckets to connect/status. The global budget survives process restart, cookie rotation and spoofed client IP. Counter updates require definite create/CAS acknowledgement; ambiguous writes, malformed records and exhausted retries fail closed before provider access. Global reservations consumed before a later failure are not refunded. A separate `profile-request-limit/v1/` namespace reuses at most 515 keys and resets elapsed counters with CAS. Buckets can conservatively throttle unrelated sessions; fixed windows allow adjacent-window bursts. This is a bounded anonymous-provider budget, not identity authentication, a bot defense or a storage-request cost ceiling.

The browser path requires server-only `GYEOL_BROWSER_SESSION_SECRET` and exact `GYEOL_APP_ORIGIN`, plus the existing ingest/cache configuration. Plain HTTP has no permissive fallback. Preview setup and UI integration remain coordinator-owned.

## G4 → generation → G5

[The canonical fixture](../../../fixtures/curation-handoff.sample.json) covers 3/15 photos × blank/written prompt with fixed fake-provider responses. [Its test](../../../test/curation-handoff.test.js) runs the production feed and generation handlers, validates all and slot generation for both seed and omitted captions, and preserves ID/position/profile/prompt provenance into `{feed,context,curation,output,omission}`. Wrong IDs, duplicate positions, foreign photo evidence and invented fact notes fail closed. Existing #149 behavior remains: a written all-caption preference does not forcibly rewrite valid seed/omitted results.

Facts are explicitly synthetic and provider responses are checked-in fixtures. Determinism applies to semantic slots and curation metadata; runtime feed IDs/timestamps are excluded. This is repeatable wiring/contract evidence, not a caption-quality score or proof of live model behavior.

## Verification

Node `24.21.0`, using the supplied Node binary directory first on PATH. Full command evidence and final SHA are recorded in the coordinator handoff report. Focused security tests cover origin/Fetch Metadata, expiry, tampering, duplicate cookies, CSRF, invalid bearer, storage ambiguity, namespace isolation, concurrent quota admission, hourly rollover and cookie churn. Existing cache tests retain conditional-write, stale-read, expiry and cleanup coverage.

| Command | Fresh result |
| --- | --- |
| `npm test` | 355 passed |
| `npm run test:ui` | 46 passed, 13 files |
| `node --test scripts/smoke-next.test.mjs scripts/verify-deployed.test.mjs` | 33 passed |
| `npm run check` | 94 JS/JSON files and schema fixtures passed |
| `npm run lint` | 48 files passed |
| `npm run build` | Passed, including profile/session route |
| `npm run typecheck` | Passed |
| `npm run eval` | Automated checks/negative cases passed; E4/E5/E7 pending |
| `npm run test:smoke -- http://localhost:3173` | Built HTTP mock/rejection smoke passed |
| Built profile/session POST without configuration | Both 503, no-store, safe error code |
| Static bundle scan | No ingest/session/Blob secret variable names or rate storage prefix |
| `git diff --check` | Passed |

#26 generation is exercised through its real handler with injected transport; #68 ingestion remains behind explicit consent and the existing protected server cache, with no paid access during validation.

Official [Blob SDK documentation](https://vercel.com/docs/vercel-blob/using-blob-sdk) describes conditional writes using `ifMatch` and rejects overwrite by default. [Vercel consistent private reads](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage) documents `cache=0`. The existing REST adapter protocol is reused, with only an explicit second namespace added. Live CAS/read-after-write verification on the actual Preview store remains pending; mock tests do not prove service behavior.

## Remaining gates and review scope

- UI/client integration and browser evidence on the combined branch; this worker does not edit `src/lib/api.ts` or input/editor/result UI.
- Exact Preview origin, server-only secrets and private Blob configuration; live storage CAS/race and rate-boundary checks, with provider calls kept disabled until explicitly authorized.
- Independent coordinator review on the final commit; no worker-spawned agents or author-issued merge approval.
- Real provider quality, E4/E5/E7 human review, mobile device checks and sharing storage/lifecycle integration retain their independent acceptance gates.

`sip` review: `factchk` checked the official storage sources above; `mandela` found verifier/designer overlap, so fixture results claim regression behavior only. `ssotize` audited the new schema, helpers and report and identified the old UI request as an integration gate; no unrelated consolidation was performed. `re0` refreshed this report instead of retaining stale delivery claims. `shower` is deferred because this dispatch prohibits subagents; `detool` does not apply to this provider-specific runbook.
