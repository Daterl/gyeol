# Issue 163: receipt and revocation boundaries

## Core contract

Receipts have exactly two nonempty, unpadded canonical base64url segments. Decoding and re-encoding each segment must reproduce its exact bytes; extra separators, ignored characters, padding and nonzero pad bits are invalid before signature validation. The original receipt string remains the durable marker identity. Concurrent first openings and service restarts return the same session and token while the authorization remains valid.

An initial version-1 receipt may open and upload before any manifest exists. Once a manifest exists, upload authorization requires active status, the current management-key hash and exactly the next version. Thus published/superseded receipts are no longer upload authorizations, rotation invalidates outstanding old-key receipts, and tombstones reject both initial and update receipts. An update receipt cannot operate without its prerequisite manifest. Publish retains its existing manifest CAS checks and immutable attempt paths.

Session opening checks manifest state before and after marker creation. Core upload checks before storage and after the awaited immutable write. If revoke, rotation or publication invalidates that authorization during the write, the call rejects and deletes only that photo's exact temporary path. It never deletes an entire share/attempt or a published version. The tombstone persists and denies public reads before revoke begins deletion. There is no process-local mutex.

## Concurrency and provider limits

These checks use the existing durable store contract: manifest reads must observe committed changes, conditional puts must arbitrate atomically, and a fulfilled put must represent a completed write visible to subsequent reads/deletes. A write completed after revoke's deletion is removed by the upload's post-write check. This is compensation at operation completion, not atomic cancellation or a promise that bytes never transiently exist after the tombstone. If revocation follows a successful post-write check, revoke's own cleanup sees the completed write.

A failed delete leaves private residue for the next cleanup invocation; tombstoned temporary objects have no age grace period, while other abandoned temporary objects retain the existing 24-hour rule. A process crash or store read outage between write and recheck likewise requires cleanup. None of these failures restores public access.

G8 must independently prove actual provider consistency/CAS semantics, revocation of issued direct-upload credentials, handling of already-running provider uploads, and cleanup retry/scheduling. Direct provider writes bypassing `uploadPhoto` do not receive its post-write compensation. Memory-store tests are core evidence only, not live-provider acceptance. G8 remains tracked through #27.

## Verification

The independent G6 adversarial script reproduced aliases, post-revoke reopening and the deterministic write-after-deletion race on develop `99842bf360f2a20f05e42e182d6157c736709037`. Before the fix, the first eight new regression tests produced seven failures and one replay-control pass; the nine existing storage tests passed. The final storage suite includes malformed encoding, restart/concurrent replay, original/update receipt revocation, a marker/revoke race, upload races against revoke/rotation/publish, a distinct CAS winner, deletion-failure recovery and a missing prerequisite manifest.

Photo count 3–15, title behavior, profile schema, public-page G7 files and integration decisions in #27 are unchanged. No provider calls or deployment are required for these checks.
