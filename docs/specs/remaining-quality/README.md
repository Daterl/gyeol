# Remaining quality: offline evidence boundary

This is a review worksheet and contract replay, **not human or real-model acceptance**. All seven issues (#41, #43, #69, #101, #109, #128, #129) retain their live or human gates. Run from the repository root with Node 24:

```sh
node scripts/remaining-quality.mjs
node --test test/remaining-quality.test.js
```

[offline-evidence.json](offline-evidence.json) records the full inputs, profiles, feed, validated fake generation, per-photo evidence, source digests and code revision. [human-review.md](human-review.md) renders all 36 rows across 3/15 photos × blank/written direction. Feed IDs and timestamps change on rerun; original observation identity and prompt-pair input digests remain fixed. The script overwrites these generated files; retain human annotations separately.

## Provenance and coverage

- Photo observations come unchanged from the first request in [#101 inputs](../101-caption-quality/inputs.json). Their original real-photo measurement history and known errors are documented in the [#101 report](../101-caption-quality/report.md). No image bytes are read or reanalyzed here. A fixture digest identifies the record, not the original image. `file_ref` identifies the originals for later review; there are no bundled thumbnails.
- Both current and blank-prompt target profiles derive from the same recorded `fixtures/ig_snapshot.json`. The offline adapter maps `shortcode` to `shortCode` and identifies the snapshot by its recorded Apify run. It adds no observations. Written direction is `짧게, 조용하게`.
- The current `composeFeed` and `generateOutput` implementations execute, using the fake transport pattern already present in `test/generate.test.js`. One omission is deliberately scripted in every case to expose both caption and omission evidence. Counts, title, seeds and omissions are **test choices**, not model behavior or quality measurements. Exclusion recommendations and rationale are actual deterministic results.
- Inspected develop `f4d44c7` and PR153 head `00254cb`. PR153 introduces `buildCuration` with verified profile resolution and included/exclusion state. This harness exercises the shared composition/generation layer, not that branch's resolver, receipts, HTTP boundary or browser. Develop's legacy `buildFeed` accepts different current/reference snapshot formats; direct composition avoids pretending those are the new single-profile boundary.
- Tests forbid global network fetch, preserve all fixture photo IDs and input values, reject missing/misattributed rows, and reject promotion of offline acceptance or empty human fields to PASS. No paid calls, new dependencies, Production changes or core edits are involved.

## Observed results and remaining gates

| Issue | Offline evidence | Still unmeasured |
|---|---|---|
| #41 / #69 | Same photos have different photo-ID orders for blank versus written direction in both sizes | General quality, two live-profile results and browser acceptance |
| #43 | Recorded vision observations replay without a new analysis call | Current real provider access, image transfer and quality |
| #101 | Current validator accepts scripted seed and omission cases; every source fact is visible | Real generation success rate and human publishability |
| #109 | Current rationale and exclusion evidence are fully exposed | Human suitability of visible text |
| #128 | 15 distinct rationale strings in each 15-photo case; synthetic same-observation control has 3 | Whether each explanation provides useful causal justification |
| #129 | Title, every caption, omission, exclusion and rationale have review space | Full human comparison with original images; unsupported place/person/time claim count remains null |

## #128: replace the ten-sentence gate with an evidence gate

The old ≥10 different sentences threshold is retained as a diagnostic, not acceptance. The real recorded fixture reaches 15/15, but this does not prove why those photos belong in those positions: current text explicitly says quoted observations did not determine ordering.

The repeatable `same_observation_probe` clones one recorded observation into 15 synthetic IDs with identical facts and color measurements. It produces only 3 sentences (opener/sustain/closer), and all 15 rows carry `order.placement_limit`. These are **not 15 new real photographs**. Requiring ten different reasons here would reward cosmetic rewriting or unsupported causal claims. Keeping the limitation visible is the correct abstention.

Proposed replacement for acceptance review: every content claim traces to the own/adjacent recorded facts; actual ordering calculations remain available in evidence; explanation explicitly distinguishes those calculations from descriptive quotes; insufficient observations produce a visible limitation rather than an invented relationship. Human usefulness must be scored separately after viewing original images. This document does not edit the issue's acceptance criteria or declare it closed.

## Review procedure

Preserve this offline artifact as an integrity baseline. After separately authorized live generation, produce a separate artifact with actual provider/model/time/input and prompt provenance; never relabel fake responses as real. For each original `file_ref`, a human checks title, caption, omission reason, exclusion reason and rationale, records source fact or “absent from observations,” and counts unsupported places, people and times. Record reviewer, date and per-field verdicts; blank verdicts and missing data remain PENDING, never zero errors. `validateArtifact` intentionally accepts only the unreviewed offline form, so a manually edited copy cannot accidentally become a certified pass.

## Review of the evaluation itself

The mandela check identifies tautology/shared-source risk: fake captions copy the same observations that the validator checks. This proves wiring and attribution only. Independent image review and independently collected real generation are the missing evidence; neither is simulated by the integrity tests. The sip consistency audit keeps the #101 report as the source for historic live results and this JSON as the source for this replay; prior reports are not rewritten. Fresh-agent review was skipped because this dispatch forbids recursive agents, and portability review is inapplicable to this repository-specific runbook.
