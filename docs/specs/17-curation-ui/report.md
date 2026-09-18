# Public-profile curation and recoverable editing

Refs #68, #17, #139. [ADR-0008](../../adr/0008-public-profile-curation-and-sharing.md) is the product contract. This acceptance pass is based on develop through `b4f5ff10e06f4a2a97b604225474a3a63e2e5865`, including G3 persistence, G6 storage, G7 public reading and the local G8 share lifecycle.

## Behavior

Public-profile connection uses same-origin sessions and in-memory CSRF, explicit collection consent, bounded polling and distinct private/missing/expired/provider-error states. The input retains PR154 normalization to 1440px WebP, failed-photo disclosure, 3–15 photos, optional prompt and a separate paid-start choice. Rejected file selections preserve an existing draft.

Regeneration requires a live connection matching both the loaded curation's account and `profile_snapshot_id`. Connecting B after creating A, or refreshing A to a different snapshot, preserves photos, edits and the prior confirmation but requires a new curation before regeneration. Reconnecting the same account/reference may resume. Reload restores a profile reference for convenience, never live authorization or paid consent; the user must reconnect.

The preview supports keyboard/button/drag order, exclusion/restoration, candidate rationale, editable or empty captions, crop centers and omission counts. At least three photos must remain included before confirmation; the store, button state and persisted-record validator enforce the same boundary. Profile sharing defaults off. Confirmation contains a detached, recursively frozen snapshot of included order, captions, crops and the sharing choice. It excludes internal evidence and public identity copies; later editing or generation leaves it unchanged until reconfirmed.

When profile sharing is on, the confirmation stores only the bounded, non-empty `profileSnapshotId` returned by the server-backed profile cache. It stores no username, display name, avatar URL, source URL or collection time. The client can check the current curation shape for UX integrity, but the local record is not a publication trust anchor. During publish, the share service verifies authorization, ETag and uploaded bytes before calling server-only `resolvePublicProfile(profileSnapshotId)` and deriving G6's exact profile DTO. Invalid, expired or unresolved references fail before immutable objects are written. The stored/public curation contains neither the reference nor provider raw data. Profile-off confirmations contain no reference. An earlier confirmation retains its own reference when a new curation loads, until explicit reconfirmation.

The application emits `viewport-fit=cover`. The home header, skip link and main content account for top, left, right and bottom safe-area insets while retaining the mobile-first three-column preview.

## G3 integration

[The G3 contract](../139-draft-persistence/spec.md) owns revisioned localStorage metadata and IndexedDB WebP blobs. No second persistence engine is introduced. `createEditorStore` accepts an optional metadata save/restore hook; the curation adapter uses the optional `DraftMetadata.curationState` extension:

- `curation`: internal response metadata for the loaded preview, including account/snapshot binding and exclusion recommendations.
- `excluded`, `crops`, `profileSharing`: current curation edits.
- `confirmed`: detached confirmation, frozen again on recovery; profile-on carries only `profileSnapshotId`.

The existing base metadata holds draft, title/captions, order, original responses, prompt and profile reference. Adapter data is validated in the existing storage transaction with a strict confirmation allowlist: profile sharing is true exactly when a valid reference is present, and extra profile/name/avatar/source fields are rejected. `DraftStorage.load` alone recognizes otherwise valid legacy curation states with a 1–2 photo confirmation, an old snake-case profile (including optional `collected_at`), or the preceding camel-case public profile plus `confirmedProfileSource`. It drops only that legacy confirmation and provenance, retaining the curation, edits, captions and matching IndexedDB WebP bytes. The next autosave writes the strict current shape on the same image revision. Other corruption still discards both stores. Web Locks, revision pairing and binary storage remain G3's implementation. Metadata edits reuse the saved image revision. Restore runs before subscriptions and input unlock; reset calls `clearDraft`. Late restore after reset is rejected. Removing below three photos queues deletion after any first binary save, so its late completion cannot resurrect removed photos. Transient storage read failures preserve valid saved data for retry; invalid save attempts leave the prior revision intact.

## Verification

Node 24.11.1; all browser API calls were intercepted, with no provider or paid calls.

| Check | Result |
| --- | --- |
| Editor-focused Vitest | 24 tests pass |
| Full UI suite | 102 tests / 25 files pass |
| Node suite | 392 tests pass |
| Production build and typecheck | Pass |
| Lint | 75 files pass |
| Static check | 99 JS/JSON files and four schema fixtures pass |
| Browser 360/390/430 | Pass in touch contexts; keyboard and buttons, 3-photo gate, profile reference on/off, immutable/reconfirmation, 44px targets, reduced motion and no horizontal overflow |
| Browser binding, reload and reset | Pass; four normalized IndexedDB blobs and full saved metadata compared across actual reload, then both stores cleared |

[The browser acceptance regression](browser.mjs) and [persistence regression](browser-persistence.mjs) use the existing Playwright installation through `PLAYWRIGHT_MODULE`, accept `PLAYWRIGHT_EXECUTABLE_PATH`, `UI_BASE_URL` and `UI_EVIDENCE_DIR`, and run against `next start`. They verify changed-account and fresh-snapshot blocking, same-reference resume, unverified/expired restoration, prompt/title/caption/order/exclusion/crop/sharing/confirmation recovery, normalized image blobs, profile on/off signed references without local identity copies, immutable confirmation followed by explicit reconfirmation, load-only migration of actual legacy localStorage paired with IndexedDB, reset of both stores, and recovery after a simulated transient IndexedDB read failure.

Durable evidence is checked in with this report:

- [360px screenshot](evidence/curation-360.png), [390px screenshot](evidence/curation-390.png), [430px screenshot](evidence/curation-430.png)
- [Expired-profile preservation at 390px](evidence/preserved-after-expiry-390.png), [reload recovery](evidence/restored.png) and [legacy migration recovery](evidence/migrated-legacy.png)
- [Responsive browser log](evidence/browser.log) and [persistence browser log](evidence/browser-persistence.log)

The responsive evidence is deterministic acceptance evidence for wiring and invariants. It does not establish model quality, live-provider behavior, physical-device safe areas or external-user acceptance.

## Remaining gates

Independent fixed-head review; G8 live Blob adapter and deployment acceptance; real HTTPS session/cookie checks; authorized live provider receipts; physical-device safe-area checks and external users. Browser evidence uses deterministic intercepted APIs, so it does not establish live provider quality or paid-call behavior.
