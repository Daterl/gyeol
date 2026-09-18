# Public profile and curation UI

Refs #68, #17, #139; ADR-0008 supersedes optional-profile entry.

- Preserve PR154 normalization and per-photo failure disclosure.
- Own browser API, input components, separate curation editor adapter and preview; leave G3 editor/store.ts and persistence untouched.
- Require explicit paid-start confirmation, bounded status polling, recovery, then 3–15 normalized photos and optional prompt to feed→generate.
- Keep all photos initially included; support move, exclusion/restoration, editable/empty captions, crop centers, actual omission count and profile-sharing default off.
- Confirm a detached frozen snapshot; later edits leave it intact. G3 persistence integration requires the coordinator's contract.
- Validate transport and state boundaries with offline tests, typecheck, lint, build, and browser evidence at 360/390/430 where available. No paid calls or Production.
