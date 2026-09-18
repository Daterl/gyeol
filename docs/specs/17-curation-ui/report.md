# Public-profile input and G5 editor

Refs #68, #17, #139. ADR-0008 is the product contract. The change is stacked on PR153; no server or G3 store file is edited.

## Implemented

The browser obtains an in-memory CSRF token from `/api/profile/session`, sends same-origin credentials to `/api/profile`, and never receives an ingest credential. Connect requires explicit paid-collection confirmation. Status polling is bounded at ten requests, stops on terminal status/error/cancel, and honors rate-limit waiting. Session expiry permits one bootstrap retry; private, missing, provider-failure and expired states remain distinct. Connection loss invalidates generation access while preserving photos, captions and confirmation.

The input requires a public profile, retains PR154's 1440px WebP normalization and explicit failed-photo handling, and accepts 3–15 photos with an optional prompt. A second explicit paid-start choice precedes analyze → curation feed → caption generation. The strict legacy editor receives only `{feed, context}`; curation metadata stays in the new adapter. Individual and whole-caption regeneration also require paid-call confirmation.

The 480px editor uses a three-column square preview, draggable and keyboard/button movement, explicit exclusion/restoration, candidate rationale, caption editing/emptying, percentage crop centers and actual omitted-caption counts. All photos start included. Confirmation clones and deeply freezes the current included order, captions, crop centers and profile choice; subsequent edits or regenerated feeds leave the previous confirmation intact. Empty selection cannot be confirmed. Profile sharing defaults off; opting in includes only the available source URL. Internal source evidence, signed references and cache metadata are absent from the confirmation DTO.

## G3 adapter contract

`src/features/editor/curation-store.ts` wraps the existing store without editing it. `CurationEdits` adds:

- `curation`: internal response metadata for the current preview; never serialize directly as public sharing data.
- `excluded`: photo IDs; order remains the base store's `order`.
- `crops`: photo ID → `{x,y}` in 0–100 percent; missing value means `{x:50,y:50}`.
- `profileSharing`: boolean, initially false.
- `confirmed`: detached frozen output containing title, ordered captions without internal evidence, crops, excluded IDs, sharing choice and optional `{source_url}`.

Actions are `loadCuration` (returns true only for an accepted, uncancelled feed), `setIncluded`, `setCrop`, `setProfileSharing`, `confirmCuration`; base actions continue to own order/title/caption/file changes. G3 must persist both these fields and the base draft/order plus profile reference/prompt and normalized IndexedDB blobs, reconstruct the adapter, and freeze recovered confirmations. `src/features/editor/store.ts` and Diego's draft-storage files were intentionally not changed. Reload acceptance is not implemented by this PR.

## Verification

Node 24; base `16d9222b28d311f102357d8f40df9da5edd189ae` (PR153).

| Command | Result |
| --- | --- |
| `npm run test:ui` | 58 tests / 17 files pass |
| `npm test` | 363 tests pass |
| `npm run build` | Production build passes, including profile/session route |
| `npm run typecheck` | Route generation and TypeScript pass |
| `npm run lint` | 56 files, no fixes needed |
| `npm run eval` | Synthetic invariants and expected-negative cases pass; manual quality gates remain pending |
| `npm run check` | 95 JS/JSON files and four schema fixtures pass |
| `git diff --check` | Pass |
| Browser bundle identifier scan | No APIFY ingest-key or browser-session-secret identifier in `.next/static` JS |

## Verification scope

The executable `browser.mjs` uses an existing Playwright installation specified by `PLAYWRIGHT_MODULE`, not a new project dependency. It intercepts every API request. Chromium checks cover 360/390/430 widths, mandatory profile, private recovery, explicit paid confirmations, feed→generate, keyboard movement, exclusion/restoration, empty caption count, crop keyboard input, profile on/off, immutable confirmation, 44px buttons and horizontal overflow. A 390px clock-advanced expiry and provider-failure retry verifies preservation and disabled generation. Focused tests cover 2/16 rejection, 3/15 acceptance with blank/written prompt, and two authenticated equal digests among three photos yielding one recommendation versus zero for distinct digests.

These are offline wiring and regression checks. They do not establish live model quality, real Apify access, real browser HTTPS Secure-cookie operation, private Blob sharing, physical-device behavior, external-user acceptance or G3 persistence. The author reviewed screenshots using visual-verdict; independent code/design review belongs to the coordinator. The sip/ssotize audit found the old photo-only APIs retained for compatibility/tests and the G3-owned base store's legacy selection contract; the new product path uses ADR-0008 bounds. The mandela audit flags designer/verifier overlap: reproducible fixture checks support behavior only, not independent product quality. A fresh shower subagent is deferred because this dispatch prohibits recursive agents.

## Remaining gates

G3 reload/recovery integration; G6/G7 actual shared-link publication and management; backend profile avatar/display-name availability (current contract provides neither); independent review; deployed HTTPS cookie/origin checks; authorized live provider receipt and real-device/external-user evidence. No paid call, merge to develop/main, Production change or issue closure is performed by this worker.
