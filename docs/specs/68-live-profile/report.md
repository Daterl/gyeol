# #68 live profile integration

Base: `develop@a4110c1`. The merged ingestion, durable cache, browser gateway, request limits and daily cleanup are reused. This change corrects the Private Blob request header and supplies a repeatable operator verification command. It does not close #68 without live deployment evidence.

## Corrected boundary

The adapter sent `x-access: private`. Vercel's pinned [putOptionHeaderMap](https://github.com/vercel/storage/blob/31245dc9024517cbed0764c5ef07104afa47c875/packages/blob/src/put-helpers.ts#L96-L103) requires `x-vercel-blob-access: private`. The original fixture repeated the implementation error. The corrected assertion failed against the old adapter (21 pass, 1 fail) and passes with the fix. Both profile cache and request-limit writes use this adapter. No dependency was added.

The retention contract stays in [the cache report](../143-profile-cache/report.md#retention-and-failure-policy): 24 hours from reservation, refusal exactly at expiry, explicit refresh only, daily conditional replacement with a minimal expired marker. Payload removal occurs at cleanup, not at the exact access-expiry instant. Profile hashes remain pseudonymous.

## Runbook

Use Node 24 and a non-production **private** Blob store. Supply server-only values from [.env.example](../../../.env.example) through the environment; the command does not read environment files automatically. With a local ignored `.env.local`, Node can load it explicitly:

```sh
node --env-file=.env.local scripts/verify-profile-live.js --check
node --env-file=.env.local scripts/verify-profile-live.js --blob
# Paid: use one approved public profile URL. Maximum run charge is governed by LIMITS.
node --env-file=.env.local scripts/verify-profile-live.js --collect https://www.instagram.com/29cm.official/
```

`npm run verify:profile -- --check` is the equivalent when variables are already exported. Preflight checks presence, secret lengths/separation, token shape and HTTPS origin. It makes no network requests and does not prove credential validity. Missing/invalid configuration exits 1 and emits names only, never values.

`--blob` uses two independent adapter instances against one random synthetic hashed pathname. It checks concurrent create and replacement, stale ETag rejection, fresh authenticated reads, denied anonymous reads on both Blob hosts, the exact TTL boundary using an injected clock, and cleanup limited to that probe key. It leaves one payload-free expired marker; it never collects Instagram data. It does not claim a multi-process or deployed cron test. A failed probe may leave a synthetic reservation for daily cleanup.

`--collect <URL>` first requires the Blob probe to pass, then uses the existing public precheck, Apify adapter and durable cache. It starts at most one run, polls at five-second intervals with a 150-second deadline, and verifies a second cache instance reuses a URL spelling variant. It never sets `refresh`, deletes a reservation, or retries a paid start. Private/unknown/expired/orphaned results remain blocked. A pending result at the deadline may still represent a paid run; inspect that reservation/run before any manual intervention.

The collection report contains run/build IDs, actual duration and cost, observation time, count and expiry. After a provisional completion it re-inspects the same receipt once after 11 seconds. Missing/provisional cost or build data yields `INCOMPLETE_METRICS`, not PASS. An already-cached success can verify reuse but cannot recover a discarded receipt's live metrics, so it also reports incomplete metrics. Reports omit snapshots, captions, tokens, cookies and receipts. Errors print a fixed code, not provider error details.

## Live blocker, 2026-09-19

The dispatched workspace has only `.env.example`, no local `.env`/`.env.local` or linked `.vercel/project.json`. Runtime presence checks and the executable preflight both report these eight settings missing:

- `BLOB_READ_WRITE_TOKEN`
- `APIFY_TOKEN`
- `PROFILE_CACHE_SECRET`
- `APIFY_INGEST_ACCESS_KEY`
- `APIFY_INGEST_RECEIPT_SECRET`
- `CRON_SECRET`
- `GYEOL_BROWSER_SESSION_SECRET`
- `GYEOL_APP_ORIGIN`

See [sanitized preflight evidence](./preflight.json). No live Blob, Instagram, Apify or production call was made; paid cost is zero for this task. Existing historical Apify runs are not evidence for this revision. After non-production credentials are configured, run the commands above and retain their sanitized reports. Deployment origin/Secure cookie behavior, two-browser/multi-process reservation behavior and authenticated daily cron still require deployed acceptance; local fixtures do not establish them.

## Validation

Node `24.21.0`: focused cache/live tests **27/27**, full server tests **405/405**, UI tests **110/110**, lint (82 configured files), typecheck, static check (104 JS/JSON files), eval and production build all PASS. `npm ci --ignore-scripts` succeeds with the existing lockfile. Repository Biome scope excludes `lib/`, `scripts/` and `test/`; those files have syntax and executable test coverage. Eval's existing E4/E5/E7 human-quality gates remain pending and are unrelated to live storage proof.

The `sip` review used `factchk` to correct the wire contract against the pinned provider source and `mandela` to identify the old fixture's shared implementation assumption. The new fixtures remain local simulations; the live runner is the separate external check and is explicitly blocked. `ssotize` stayed read-only: TTL remains owned by `PROFILE_CACHE_TTL_MS`, and this report links the retention contract rather than redefining it. `re0` removed stale configuration wording that conflated `/api/ingest` with the browser cache gateway. No portability claim requires `detool`. A `shower` subagent was unavailable because this session's native spawn interface has no required OMX `agent_type` selector; independent review is not claimed.

The pre-existing lockfile change was preserved before integrating develop in stash commit `d5e99415e4d7f389f1cdeac83ac35fd2f6ba1921`, separate from this PR.
