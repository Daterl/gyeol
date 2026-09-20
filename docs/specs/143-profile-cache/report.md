# #143 public profile cache implementation report

PR: [#152](https://github.com/Daterl/gyeol/pull/152), targeting `develop`. Parent: [#68](https://github.com/Daterl/gyeol/issues/68). Contract: [ADR-0008](../../adr/0008-public-profile-curation-and-sharing.md), with ingestion privacy/error boundaries from [ADR-0006](../../adr/0006-apify-public-instagram.md). Implementation commit: `081ab4b5636023a7f45f0d39a130de79303ca3d3` on `onejaejae/issue-143-profile-cache`.

## Delivered

- [Cache and resolver](../../../lib/profile-cache.js): canonical lowercase username SHA-256 paths, durable reservation before ingestion, 24-hour request suppression, explicit refresh after expiry, signed snapshot references and read-only trusted resolution.
- [Private Blob adapter](../../../lib/profile-cache-storage.js): platform `fetch`, private storage only, fixed paths, conditional creation/ETag replacement, authenticated origin reads and paginated listing. No dependency added.
- [Cleanup handler](../../../lib/profile-cache-cleanup.js), [Next route](../../../src/app/api/profile-cache/cleanup/route.ts) and [daily schedule](../../../vercel.json): authenticated `GET /api/profile-cache/cleanup`, `0 0 * * *` UTC, no-store responses, no provider calls. Unauthorized requests do not initialize storage.
- [Offline tests and fixtures](../../../test/profile-cache.test.js): independent instances sharing storage, URL variants, expiry, concurrent refresh, stale writers, cleanup races, provider failure categories, lost write acknowledgments, real ingestion normalization, signed references and REST requests.

Existing ingestion, UI, pipeline, output generation and G6 sharing are unchanged. The cache uses `createInstagramIngest().start/inspect`, including its public visibility precheck and account-owned-post filtering. Errors never become a private verdict unless ingestion explicitly reports `PRIVATE_ACCOUNT`.

## Integration contract for #144 / #146

```js
import { createProfileCache, resolveSnapshot } from './lib/profile-cache.js';

const cache = createProfileCache();
const state = await cache.connect({ url, refresh: false });
// If pending, poll the existing run; inspect never starts a new run.
const updated = await cache.inspect({ url });

// Request contains references only, never caller-provided profile content.
const verified = await resolveSnapshot({
  url: body.profile_url,
  snapshotId: body.profile_snapshot_id,
});
```

`connect`/`inspect` return `status`, `refresh_required`, optional `expires_at` and `error_code`. Only `public` returns `snapshotId`. Statuses are `missing`, `pending`, `public`, `private`, `not_found`, `provider_error`, `timeout`, `cost_limit`, `unconfirmed`, `expired`. `knownPrivate: true` blocks connection even if a public snapshot exists. `refresh: true` cannot bypass an unexpired record, including a failed or orphaned reservation.

`resolveSnapshot({url,snapshotId})` canonical-matches the URL; `resolvePublicProfile(snapshotId)` omits that additional caller-URL check. Both exist as factory methods and standalone exports. They return `{snapshot_id, snapshot, currentProfile, targetProfile, source_url, collected_at, expires_at}`. **`expires_at` is epoch milliseconds; `collected_at` is ISO text.** `snapshot_id` is the capability; `snapshot.snapshot_id` remains the underlying Apify provenance ID. The capability is HMAC-SHA256 authenticated and binds pathname, generation and expiry. It is a bearer reference, not proof of Instagram account ownership; do not log it or accept a username hash in its place.

Resolver errors are `ProfileCacheError` with `.code`: `INVALID_SNAPSHOT_REFERENCE`, `PROFILE_NOT_READY`, `STORAGE_ERROR`, `NOT_CONFIGURED`. Invalid URL input can also raise the existing ingestion `INVALID_URL`. Routes must validate input, authenticate/rate-limit collection, and translate those errors without exposing provider credentials or storage details. Cached reads need no configured Apify credentials and make no provider request. The HTTP route integration remains owned by #144/#146.

Factory injection: `createProfileCache({storage, ingest, now, secret})`. Storage implements `read(key) -> {value,etag}|null`, `write(key,value,{ifMatch}?) -> {value,etag}|null`, `list({cursor}) -> {keys,cursor}`. An omitted `ifMatch` means create-if-absent; a supplied ETag means conditional replacement. `null` from `write` means a definite conflict. Network/unknown outcomes must throw, never grant reservation ownership. Inject only server-trusted adapters and ingestion; see the test file for fixtures and the actual ingestion-to-resolver regression.

## Retention and failure policy

One generation expires 24 hours after reservation, so cached success, failure and in-progress work all suppress repeat starts for the same period. Failure details and credentials are not copied into failure records. Provider receipts stay server-side only while running. Unknown start outcomes and lost receipt writes are not retried automatically; an orphan stays pending until expiry.

At expiry, reads refuse the result immediately. Daily cleanup conditionally replaces expired snapshots, failures and reservations with `{version,status:'expired',generation,expires_at}`. It removes their snapshot, receipt, URL, errors and provenance. This deliberately retains a minimal marker at the hashed path: deleting the entire key would make the next ordinary connect look like a first connection and spend automatically. The marker has no profile payload but is pseudonymous, not anonymous, and persists indefinitely. Physical payload removal happens on cleanup, not precisely at the TTL boundary. Marker growth and cleanup duration must be monitored; deleting markers changes the no-automatic-refresh contract.

All writers use the ETag they read. Cleanup cannot erase a newer refresh, and late completion cannot replace a newer generation. This is duplicate suppression using storage preconditions, not a claim of transactional exactly-once execution across Blob and Apify. Operators must check ambiguous provider starts before manual intervention; never manually delete a reservation to retry it.

## Official storage evidence

Reviewed 2026-09-18. [Vercel Blob SDK documentation](https://vercel.com/docs/vercel-blob/using-blob-sdk) documents overwrite rejection by default and ETag conditional writes. [Vercel's concurrency documentation](https://vercel.com/docs/vercel-blob#conditional-writes) specifies optimistic concurrency and a precondition failure on stale ETags. These are the storage guarantees the implementation requires; a mock cannot establish them in production.

REST wire details were checked against the official `vercel/storage` source at **`31245dc9024517cbed0764c5ef07104afa47c875`**:

- [put-helpers.ts](https://github.com/vercel/storage/blob/31245dc9024517cbed0764c5ef07104afa47c875/packages/blob/src/put-helpers.ts): `x-vercel-blob-access`, `x-add-random-suffix`, `x-allow-overwrite`, `x-if-match`; comments explicitly describe backend `If-Match` / `If-None-Match` semantics. Creates use overwrite `0`; replacements use overwrite `1` plus ETag. The access header was corrected during [#68 live verification](../68-live-profile/report.md); the original adapter and fixture incorrectly used `x-access`.
- [put.ts](https://github.com/vercel/storage/blob/31245dc9024517cbed0764c5ef07104afa47c875/packages/blob/src/put.ts), [helpers.ts](https://github.com/vercel/storage/blob/31245dc9024517cbed0764c5ef07104afa47c875/packages/blob/src/helpers.ts) and [api.ts](https://github.com/vercel/storage/blob/31245dc9024517cbed0764c5ef07104afa47c875/packages/blob/src/api.ts): API base `https://vercel.com/api/blob`, PUT pathname query, version `12`, Bearer token, store header, response ETag and `precondition_failed` error code. Other errors fail closed without a provider call.
- [get.ts](https://github.com/vercel/storage/blob/31245dc9024517cbed0764c5ef07104afa47c875/packages/blob/src/get.ts): authenticated private-host reads with `cache=0` bypass the CDN. Fetch `cache: 'no-store'` alone is insufficient. Reads request identity encoding to preserve strong ETags.
- [list.ts](https://github.com/vercel/storage/blob/31245dc9024517cbed0764c5ef07104afa47c875/packages/blob/src/list.ts): prefix, cursor, limit and `hasMore` pagination.

The REST adapter follows this pinned SDK wire protocol; it is not a newly claimed stable public REST contract. Future provider protocol changes require rechecking these sources and fixtures. No Blob write, paid Apify call or production deployment was performed.

## Configuration and operational checks

Server-only environment:

| Name | Required for |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | A **private** Blob store; cache reads/writes/cleanup |
| `PROFILE_CACHE_SECRET` | Random independent secret, at least 32 characters; reference signatures |
| `APIFY_TOKEN`, `APIFY_INGEST_RECEIPT_SECRET` | Collection/inspection only, using existing ingestion requirements |
| `CRON_SECRET` | Random independent secret, at least 32 characters; cleanup authorization |

Never expose these via `NEXT_PUBLIC_*`. [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs) sends `Authorization: Bearer <CRON_SECRET>`. [Cron jobs target production deployments](https://vercel.com/docs/cron-jobs), so the committed schedule does not prove activation. Deployment and environment setup are outside this task.

Before marking live verification complete, authorize a non-production private store and run two independent processes against the same fresh key: exactly one conditional create must succeed, stale ETag replacement must fail, origin reads must see the winner, and cleanup must preserve a racing refresh. Check expired payload removal and authenticated scheduled invocation separately. Record actual request outcomes without secrets in #68/#27; mock PASS must remain separate.

## Validation and review

| Check | Result |
| --- | --- |
| `node --test test/profile-cache.test.js` | PASS, 22 tests |
| `npm test` | PASS, 322 tests on Node 22 and Node 24 |
| `npm run eval` | PASS; existing E4/E5/E7 human/AI quality review remains pending |
| `npm run check` | PASS, 83 JS/JSON files and four schema fixture comparisons |
| `npm run lint` | PASS, 43 configured files; repository Biome scope excludes `lib/` and `test/` |
| `npm run typecheck` | PASS, Next route generation and TypeScript |
| `npm run test:ui` | PASS, 42 tests across 11 files |
| `npm run build` | PASS on Node 24, including `/api/profile-cache/cleanup` |
| `git diff --cached --check` | PASS |
| Live Blob atomicity, paid ingestion, deployed cron | **PENDING**, not authorized/run |
| Independent code-review + architect lanes | **PENDING**, coordinator-owned |

Initial local commands used Node `22.22.3`; the project specifies Node `24.x`. `npm ci --ignore-scripts` installed the existing lockfile with an engine warning and no dependency changes. Final focused tests (22), full tests (322) and production build passed using Node `24.21.0` at `/Users/chowonjae/.npm/_npx/387698761821791d/node_modules/node/bin/node`; npm runs used that binary's directory first on `PATH`. Build confirmation includes the dynamic cleanup route; it is a local build, not deployment evidence.

The code-review skill was read and invoked, but requires independent reviewer/architect lanes and forbids author-lane substitution. This task explicitly forbids spawning: **independent review unavailable in this worker; no approval or merge-ready verdict is claimed**. The coordinator owns those lanes and the merge.

`sip` evidence pass: `factchk` verified storage and cron claims against official sources above. `mandela` found the fixture/implementation share a designer, so production concurrency remains pending instead of being inferred from mock atomicity. `ssotize` stayed read-only: ADR-0008 owns the product contract, the code constant owns TTL, and this report records the minimal-marker retention refinement. No cross-document consolidation was performed. `re0` kept this report as one current contract. `shower` was skipped because it requires a prohibited subagent; `detool` was skipped because this is a concrete provider runbook, not a portability claim.
