# ADR-0008 verifier (#146 / #124)

`verify-deployed.mjs` checks the connected-profile HTTP contract agreed with
#144. It has no default deployment, never collects a profile or uploads images,
and makes **no network requests without `--live`**. Production execution is
blocked. `--live` can incur caption-model calls and is for a separately authorized
local/Preview acceptance run, not the offline implementation checks below.

## Offline and local checks

Use Node 24:

```sh
node --test scripts/verify-deployed.test.mjs scripts/smoke-next.test.mjs
npm run build
npm run start -- --hostname 127.0.0.1 --port 3146
# In another terminal:
npm run test:smoke -- http://127.0.0.1:3146
```

The test transport is explicitly `execution: 'fixture'`, injected in process;
it cannot default to network fetch. Synthetic profile references and fixture
observations test the verifier only. The fixture builder uses the existing
compose/profile utilities, not the new HTTP handler; mutation tests challenge
photo IDs, observations, own-photo evidence, inclusion and provenance separately.
This is not an independent test of model quality or #144's real resolver.

Smoke checks the current page's brand and main landmark, four exact explicitly
mocked GET resources, error statuses, method handling and `no-store`. Empty
`POST /api/feed?mock=1` reaches input validation and must return 400
`INVALID_REQUEST`; it is not a mock generation request. Smoke never posts valid
input or calls profile collection, analysis or generation.

## Future authorized local/Preview contract run

Keep an input JSON outside git containing existing results from that environment:

- `session_id`: original photo-analysis session ID.
- `profile_url`: connected public Instagram URL.
- `profile_snapshot_id`: opaque server-issued signed snapshot reference; do not
  put a browser-supplied snapshot object in the request.
- `photos`: exactly 15 unique existing PhotoAnalysis records in selection order,
  including any original analysis receipts. Do not synthesize accepted photos.

The server remains responsible for authenticating the reference. Local presence
checks cannot establish trust. Missing input is BLOCKED, never a fixture fallback.
The script does not print profile URLs, snapshot references, photo content, raw
response bodies or server exception messages.

```sh
# Safe preflight: reports PENDING and performs no requests.
node scripts/verify-deployed.mjs https://your-preview.example --environment preview

# Only after authorization for up to eight generation HTTP requests:
# Provider retries can increase provider call counts and costs.
node scripts/verify-deployed.mjs https://your-preview.example \
  --environment preview --input /private/path/input.json \
  --metadata /private/path/run-metadata.json --live
```

Optional metadata fields are `sha`, `model_id`, `tokens`, `cost`, `input_source`
and `cache`. Supply non-sensitive evidence labels/values only. They are recorded
as **operator-supplied, not execution proof**; unknown values remain null. Each
report records its start time and per-request elapsed time. HTTP contract success
cannot independently establish the deployed SHA, actual vision/model execution,
token/cost accounting or cache provenance, so live execution provenance remains
PENDING until separately reviewed evidence is attached.

## Matrix and verdicts

The verifier checks missing connection, 2/16-photo rejection and unverified
reference rejection, followed by 3/15 photos crossed with blank/written prompts.
The 16-photo negative case adds one synthetic rejection-only record; this never
enters an accepted model or quality input. Each successful feed case gets both
`mode: all` (no `photo_id`) and `mode: slot` (exact requested `photo_id`).

Feed checks preserve photo IDs and observations, own-photo rationale evidence,
positions, default `curation.slots[].included: true`, and exclusion-candidate
separation. Server-authenticated `duplicate_of:` quality flags may change; other
photo observations must remain intact. Curation must retain the submitted signed
reference, underlying snapshot/source/times/evidence, `ownership_verified: false`,
a current snapshot (`collected_at <= now < expires_at`, at most 24 hours),
and blank versus written prompt provenance. Generation uses the shared response
validators plus own-photo evidence for every returned slot. Editable caption
states/reasons must be valid; zero omissions and all omissions are legal. This
checks editable response data, not browser editing interactions.

- **PASS** means only the named HTTP or fixture assertion passed.
- **FAIL**, exit 1: wrong response shape, unsupported old contract, lost provenance,
  incorrect boundary acceptance, invalid caption/slot, or malformed success.
- **BLOCKED**, exit 2: missing trusted input, network failure, authentication,
  rate limit, unavailable model/resolver, expired/unverified positive reference.
  Known error codes and HTTP status are preserved without raw payloads.
- **PENDING**, exit 2: live not requested or execution evidence missing. A successful
  live HTTP matrix still exits 2 while execution provenance is unverified.
- An offline fixture matrix may exit 0 within its explicitly mock scope. Its
  actual vision, real-model, human-quality, physical-mobile and Production
  acceptance fields remain PENDING. Smoke exit 0 also covers only HTTP/fixtures.

## Verification limits

This branch's base (`3449609`) predates #144. Offline mock responses implement the
coordinator-confirmed wire contract; local smoke exercises the existing routes.
Missing `curation` on an older deployment is a failure, never silently accepted.
Integration against #144/#143, trusted Preview inputs, model-quality review and
physical mobile acceptance remain separate work. No paid calls, ingest calls,
Production requests or deployment operations were used for implementation.

The same author built the tests and verifier. This is a Mandela audit limitation
(verifier = designer), addressed here with negative mutations and an explicit
fixture-only claim; independent coordinator review and a real trusted-input
integration run remain necessary before product acceptance.
