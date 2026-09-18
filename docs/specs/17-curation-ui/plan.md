# Public-profile curation UI integration

Refs #68, #17, #139; [ADR-0008](../../adr/0008-public-profile-curation-and-sharing.md) governs the profile-first flow.

- Reproduce the independent A→B regeneration failure before editing; bind regeneration to both the loaded account and snapshot without clearing edits or confirmation.
- Merge develop while preserving G3 Web Locks, revisions, IndexedDB storage and author history, plus the current profile-first UI and PR154 normalization.
- Extend existing G3 metadata for curation, exclusions, crops, profile-sharing choice and frozen confirmation; persist prompt/profile reference and normalized photos through the existing store.
- Restore saved references as unverified. Require reconnection and a new curation when the account or snapshot changes; same-reference reconnection may resume.
- Verify focused regressions, full tests, build/typecheck/lint/check, actual browser reload/reset and storage-failure/late-result preservation. Retain baseline and author evidence.
- Consume the merged #160 owner-name contract without extending provider fields. Emit the G6 public profile DTO only after explicit opt-in, keep absent display/avatar values nullable, enforce three included photos, and record responsive production-browser evidence. No paid calls, new dependencies, merge to main/develop or deployment.
