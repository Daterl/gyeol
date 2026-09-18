# #144 public-profile curation contract

## Implemented

POST `/api/profile` connects and inspects #143 cache state behind the existing `APIFY_INGEST_ACCESS_KEY` bearer guard. Connect requires `confirmLive: true`; status cannot start a provider job. Only public success returns the signed `snapshotId`; private/unconfirmed/error states remain distinct. Strict request/response validation and bounded JSON prevent client receipts/snapshots or raw storage/provider details from leaking through. The access key remains server-side; browser credential/UI integration and deployment request limits are external gates.

Production POST `/api/feed` accepts only the ADR-0008 request documented in [the interaction contract](../../../schemas/interaction.md#큐레이션--post-apifeed): a profile URL, signed snapshot reference, 3–15 photo analyses, and an optional prompt. Unknown fields, including caller-supplied profile/snapshot/identity objects, are rejected before resolution.

`lib/curation.js` uses #143's configured server resolver. The default reads Private Blob using `BLOB_READ_WRITE_TOKEN` and `PROFILE_CACHE_SECRET`; it does not start ingestion or require an Apify token for cached reads. It checks canonical account, snapshot provenance and timestamps, handles numeric storage expiry, and emits ISO expiry. Missing configuration/storage failure returns 503; unverifiable references return 422. It never falls back to a fixture.

Existing compose/order modules produce the feed. Empty prompts use the verified reference's available language observations; written prompts use the existing freetext extraction and retain the connected current profile separately. Unsupported prompt semantics are not newly implemented. `feed` and `context` remain valid inputs to the existing caption generator; this change neither calls a paid model nor manufactures captions.

All photo IDs survive with `curation.slots[].included: true`. Exclusion candidates remain separate, and only authenticated duplicate-byte observations can recommend an exclusion. The response preserves profile source/collection/expiry/evidence references, original trimmed prompt, and user-text provenance. `ownership_verified: false` is explicit.

`buildFeed`, `validateOrderRequest`, and the renamed `handleLegacyFeed` preserve tested 3–20 photo/optional-identity behavior as internal compatibility surfaces. The production handler has no fallback to them. **Merge/deploy compatibility gate:** `src/lib/api.ts` → `orderPhotos` still submits `identity`/`OrderRequest`; this production handler deliberately rejects that retired shape. Diego must migrate the frontend to profile connection and `CurationRequest` before this branch can be merged/deployed as the user flow. This backend work does not establish a working end-to-end UI.

#145's placement module is integrated into `preserveOrder`: tied measurements retain the original order and rule evidence while attaching grounded own/neighbor observations. Observations explicitly do not claim to be ordering evidence. No voice implementation was copied or rewritten.

## Validation scope

Regression tests were written and observed failing before the production boundary and tied-placement caller changes. The offline [G5 fixture](../../../fixtures/curation.sample.json) checks independently specified photo membership, inclusion default, profile/prompt provenance, and caption-request compatibility; repeated runs compare semantic curation/slot data, excluding existing random feed IDs and timestamps.

The real #143 `createProfileCache` is exercised through an injected CAS storage fixture and fake ingestion. It issues a signed reference that G4 accepts for 3/15 photos, rejects tampering/wrong accounts/expiry, and performs no additional ingest starts. A separate default-resolver test uses the configured production handler with intercepted private-storage fetch, no Apify token, and a genuine signed reference. This tests wiring and verification, not live Blob consistency or provider behavior.

Validated code commit: `6cefdab4b8d3cb32a2ebc0029eea27057682ce5a`. Node `v24.21.0`; no application dependency changes. Each script below ran as `npm exec --yes --package=node@24 -- npm run <script>` and exited 0.

| Command | Result |
| --- | --- |
| `test` | 343 passed, 0 failed |
| `test:ui` | 44 passed across 12 files |
| `eval` | Automated contract checks and expected negative cases passed; E4/E5/E7 remain manual |
| `check` | 89 JS/JSON files, schema fixtures passed |
| `lint` | 45 files, no fixes required |
| `build` | Next production build passed, including `/api/profile` and cache cleanup routes |
| `typecheck` | Route type generation and `tsc --noEmit` passed |
| `git diff --check` | Passed |

Initial boundary regression: 3 failing tests before implementation. Initial tied-placement integration regression: failed before the caller change. Final focused HTTP/curation tests: 13 passed, included in the full suite above.

## Delivery and ownership

Draft [PR #153](https://github.com/Daterl/gyeol/pull/153) targets `develop`. It contains dependency merges from [#152](https://github.com/Daterl/gyeol/pull/152) (`a54dc6b`, #143 cache) and [#150](https://github.com/Daterl/gyeol/pull/150) (`2c55824`, #145 placement correction). These were merged as branch dependencies, not copied or rewritten. No merge to develop was performed.

Own changed files:

```text
lib/curation.js
lib/interaction.js
lib/pipeline.js
lib/profile-connection.js
src/types/contracts.ts
src/app/api/profile/route.ts
src/app/api/profile/route.test.ts
src/app/api/feed/route.test.ts
src/app/api/analyze/route.test.ts
test/curation.test.js
test/profile-connection.test.js
test/pipeline.test.js
test/omit-suggestion.test.js
fixtures/curation.sample.json
schemas/interaction.md
docs/specs/144-curation-contract/plan.md
docs/specs/144-curation-contract/report.md
```

## Review and remaining work

The code-review skill requires independent code-reviewer and architect lanes. This dispatch prohibits further agents, so the coordinator owns those lanes; the coordinator launched both lanes against `6cefdab4b8d3cb32a2ebc0029eea27057682ce5a` and their verdicts are pending; no merge-ready approval is claimed. The PR remains a draft until the coordinator supplies that evidence.

The sip consistency audit found the old optional-profile UI/client request shape; it is intentionally retained outside this backend ownership. The interaction schema is updated and the canonical new shape is `validateCurationRequest` plus `CurationRequest`/`CurationResponse`. No unrelated consolidation was performed. The shower cold-reader step is deferred under the no-further-agents instruction; the coordinator's independent review is the required replacement evidence, not author self-review.

The mandela audit identifies verifier/designer overlap in authored fixtures. Their claim is limited to repeatable contract and wiring regression; neither fixture agreement nor repository eval is evidence of AI quality, live public-account access, Blob concurrency, or human acceptance. Those require separate external validation. No paid calls, deployment, fabricated signoff, or shared-link/UI implementation occurred.
