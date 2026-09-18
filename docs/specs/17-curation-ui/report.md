# Public-profile curation and recoverable editing

Refs #68, #17, #139. [ADR-0008](../../adr/0008-public-profile-curation-and-sharing.md) is the product contract. PR158 remains a draft stacked on PR153. Develop is merged through `99842bf360f2a20f05e42e182d6157c736709037`, including Diego's G3 persistence and G6 storage boundary; their history and implementations are retained.

## Behavior

Public-profile connection uses same-origin sessions and in-memory CSRF, explicit collection consent, bounded polling and distinct private/missing/expired/provider-error states. The input retains PR154 normalization to 1440px WebP, failed-photo disclosure, 3–15 photos, optional prompt and a separate paid-start choice. Rejected file selections preserve an existing draft.

Regeneration requires a live connection matching both the loaded curation's account and `profile_snapshot_id`. Connecting B after creating A, or refreshing A to a different snapshot, preserves photos, edits and the prior confirmation but requires a new curation before regeneration. Reconnecting the same account/reference may resume. Reload restores a profile reference for convenience, never live authorization or paid consent; the user must reconnect.

The preview supports keyboard/button/drag order, exclusion/restoration, candidate rationale, editable or empty captions, crop centers and omission counts. Profile sharing defaults off. Confirmation contains a detached, recursively frozen snapshot of included order, captions, crops and the sharing choice. It excludes internal evidence and signed references; later editing or generation leaves it unchanged until reconfirmed. The public profile DTO carries `source_url` and `username`, plus `display_name` only when an owner name was retained and sharing is opted in (#160, integrated on this branch). Internal provenance such as `name_source` stays out of the DTO.

## G3 integration

[The G3 contract](../139-draft-persistence/spec.md) owns revisioned localStorage metadata and IndexedDB WebP blobs. No second persistence engine is introduced. `createEditorStore` accepts an optional metadata save/restore hook; the curation adapter uses the optional `DraftMetadata.curationState` extension:

- `curation`: internal response metadata for the loaded preview, including account/snapshot binding and exclusion recommendations.
- `excluded`, `crops`, `profileSharing`: current curation edits.
- `confirmed`: detached confirmation, frozen again on recovery.

The existing base metadata holds draft, title/captions, order, original responses, prompt and profile reference. Adapter data is validated in the existing storage transaction, including optional display field types/provenance and a strict public confirmation allowlist; legacy records without the extension remain readable. Web Locks, revision pairing and binary storage remain G3's implementation. Metadata edits reuse the saved image revision. Restore runs before subscriptions and input unlock; reset calls `clearDraft`. Late restore after reset is rejected. Removing below three photos queues deletion after any first binary save, so its late completion cannot resurrect removed photos. Transient storage read failures preserve valid saved data for retry; invalid save attempts leave the prior revision intact.

## Verification

Node 24.21.0; all browser API calls intercepted, with no provider or paid calls.

| Check | Result |
| --- | --- |
| Editor-focused Vitest | 29 tests pass |
| Full UI suite | 78 tests / 20 files pass |
| Node suite | 375 tests pass |
| Production build and typecheck | Pass |
| Lint | 65 files pass |
| Static check | 99 JS/JSON files and four schema fixtures pass |
| Browser binding, reload and reset | Pass; normalized IndexedDB blobs and full saved metadata compared across actual reload |

[The browser persistence regression](browser-persistence.mjs) uses the existing Playwright installation through `PLAYWRIGHT_MODULE`, accepts `UI_BASE_URL`, and writes screenshots to `UI_EVIDENCE_DIR`. It verifies changed-account and fresh-snapshot blocking, same-reference resume, unverified/expired restoration, prompt/title/caption/order/exclusion/crop/sharing/confirmation recovery, normalized image blobs, and reset of both stores, and recovery after a simulated transient IndexedDB read failure. Tests also verify restored recursive freezing, failed reads/saves preserving valid data, and late-restore rejection.

The original independent A→B reproduction at `cce95c86588941b01673a7f9010c30e02247814e` was rerun before the fix. Its captured requests prove that B formerly authorized an identical generation from A's context. Original author and independent-review evidence remain under `.orca-specs/remaining-20260918/ui-evidence/` and `ui-review-evidence/`; new logs are in `ui-integration-evidence/`. The coordinator report `ui-integration-fix.md` records the exact final tested SHA.

The sip pass used mandela to limit these fixture-driven results to deterministic wiring and invariants, ssotize in read-only mode to identify stale G3 statements, and re0 to refresh this report and its plan. The restored 390px screenshot passes visual-verdict against the reviewed layout. A fresh shower review is deferred to the coordinator because this dispatch prohibits recursive agents. These checks do not establish independent model quality or external-user acceptance.

## Remaining gates

Independent fixed-head review; avatar availability; G6/G7 shared-link UI integration and deployment acceptance; real HTTPS session/cookie checks; authorized live provider receipts; physical devices and external users. G6's merged storage boundary alone does not demonstrate a working publication UI. This worker neither merges PR158 nor changes main, deploys, closes issues, or makes paid calls; the coordinator owns the atomic PR153/develop integration.
