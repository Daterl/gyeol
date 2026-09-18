# #144 implementation plan

Keep `buildFeed`, the identity validator, compose/order, and the legacy HTTP helper as compatibility surfaces. Replace the production `handleFeed` boundary with a strict request containing only a server-resolved profile snapshot ID, 3–15 photos, and an optional prompt. The Next route already imports that handler.

1. Add regression tests for missing/unverified/expired snapshots, forbidden client snapshots, 2/16 versus 3/15 photos, and ID preservation before changing the production handler.
2. Resolve the snapshot through #143's trusted server interface, build existing current/reference or freetext profiles, and reuse compose/order. Preserve the profile and prompt provenance separately; never describe public visibility as ownership verification.
3. Return all photo IDs with `included: true`; retain exclusion suggestions as suggestions only. Keep existing feed/context compatible with the caption API.
4. Add a deterministic offline G5 fixture, document the HTTP and resolver boundaries, run targeted and repository checks, and hand off independent review to the coordinator (this worker may not spawn agents).

No edits to generation, voice, cache/ingest, or UI ownership. No paid calls, deployment, or claims of human acceptance.
