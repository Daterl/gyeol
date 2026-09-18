# #147: caption choice and omission metadata

Contract: [ADR-0008](../../adr/0008-public-profile-curation-and-sharing.md), parent #26. All photos remain in generation output. Caption omission has no minimum count or ratio; users retain caption editing and empty-caption choices.

## Implementation

- Removed `stabilizeOmission`, its overlap threshold and unused overlap calculation. Validated model seeds are never rewritten to meet a quota, including sparse intent, repeated facts and high color overlap.
- Kept PR148 fact-index canonicalization, hint grounding, canonical free-text coverage checks, valid model omissions, no-facts limitations, all photo IDs/positions and single-slot behavior.
- Removed quota-oriented instructions from caption/omission prompts. Genuine omissions still require reasons and photo evidence; missing facts do not become invented hints.
- Moved counted disclosure construction into `lib/interaction.js` so emission and validation share one canonical representation. Counts, note key, prose and counting evidence must match the returned slots exactly. Models cannot supply this server-owned metadata.
- The coordinator transferred exclusive ownership of the bounded omission validator from the exited #144 worker. No other profile, pipeline or shared-contract behavior changed.

## #80 compatibility findings

Previously the numeric counts and note key were checked, but arbitrary nonempty prose and malformed/additional counting evidence could pass. Regressions now reject forged notes, evidence, counts and stale counts after a slot changes.

Missing `omission` remains accepted for legacy responses; absence is not interpreted as zero. New all-mode server responses always include counted metadata, and slot-mode responses never do. Existing canonical historical disclosures remain valid. A model response containing even correctly counted metadata is rejected because its schema does not own that field.

The current editor validates the response before applying edits, keeps only `result.output`, and does not retain or render generation disclosure metadata (`src/features/editor/store.ts`, `src/lib/api.ts`). Thus these counts describe the generation snapshot, not a later edited draft. The optional TypeScript field already matches compatibility behavior. Cached old browser code cannot gain stricter validation until refreshed; this patch makes no claim about unknown historical client bundles and changes no UI.

## Validation

Node 24.21.0, fake transport and local fixtures only:

- New all-seeded and forged-model-metadata regressions failed before implementation; forged disclosure prose also failed its separate pre-fix regression.
- `node --test test/generate.test.js`: 44 pass, including 3/15-photo all-seeded and mixed omission outputs, exact IDs/positions/counts, indexed omission evidence, missing metadata and forged/stale disclosure rejection.
- `npm test`: 300 pass; inherited PR148 evidence/no-facts tests retained.
- `npm run check`: 79 JS/JSON files and four schema examples pass.
- `npm run eval`: synthetic invariant checks pass, deliberately broken fixtures fail as expected; this is not AI-quality evidence.
- `npm run test:ui`: 42 tests across 11 files pass, including user edits and deliberate omissions surviving regeneration.
- `npm run lint`: 42 configured files pass; foundation JavaScript is covered by syntax checks and tests.
- `npm run typecheck`, `npm run build` and `git diff --check`: pass.

Local diff review preserved the evidence boundary and removed obsolete forced-omission expectations. The sip consistency audit found historical #80/#131 specifications; their entry points are marked superseded rather than rewriting old measurements. Recursive review agents and paid review/model calls were excluded by the dispatch constraints. No deployed preview, live model quality, real-device UI or Production verification was performed.

The pre-existing `package-lock.json` metadata churn is excluded from the commit. No dependencies, UI, cache, curation voice, or verifier code changed.
