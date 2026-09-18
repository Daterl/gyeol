# #124: protected Preview redirect diagnosis

The verifier now reports the observed Vercel SSO challenge as **BLOCKED**, exit
2, rather than a response-contract FAIL. It requires all of these response
signals: HTTP 302, `server: Vercel`, an absolute HTTPS `vercel.com/sso-api`
destination without credentials/fragment/nondefault port, exactly one nonempty
nonce parameter, exactly one return URL matching the requested URL, and a
nonempty `_vercel_sso_nonce` cookie. This is diagnostic evidence of an
authentication challenge, not proof of user authentication or application success.

Redirects remain manual. No cookies or credentials are replayed and no bypass is
added. Raw bodies, redirect URLs, nonce and cookie values stay out of the report.
Other redirects remain FAIL even when their JSON body contains a recognized
authentication error code. FAIL retains priority in mixed FAIL/BLOCKED reports.

## Evidence

On 2026-09-18, two unauthenticated manual GETs to the Preview recorded in
[the existing deployment report](../verify-d1-d6/report.md) observed:

- HTTP 302, `server: Vercel`, destination origin `https://vercel.com`, path `/sso-api`.
- Query names `url` and `nonce`; the return URL exactly matched the requested URL.
- A nonempty nonce query and an `_vercel_sso_nonce` response cookie.
- The cookie value and query nonce were different; equality is deliberately not required.

Only sanitized structure/booleans were printed; values were never persisted.
These GETs did not follow redirects, send authenticated requests, or invoke a
model/profile API. They establish the observed challenge shape only, not deployed
application acceptance. No Production requests or paid provider calls were made.

Using Node 24, the initial verifier/smoke baseline passed 33/33. With the new
regressions but before the fix, the verifier suite passed 30 and failed 23.
After the fix and additional generation/mixed-status cases, the combined verifier,
smoke and core suite passed **387/387**:

```sh
node --test scripts/verify-deployed.test.mjs scripts/smoke-next.test.mjs test/*.test.js
node --check scripts/verify-deployed.mjs
node --check scripts/verify-deployed.test.mjs
node scripts/check.js
npm run lint
npm run typecheck
npm run build
```

Syntax checks, the 84-file foundation check, lint (44 configured files) and
typecheck and the Next build passed. Biome excludes these scripts; Node syntax checks and the
regression tests cover the changed script files directly.

## Remaining gates

The [current verifier contract](../146-current-verifier/README.md) remains the
source for mock/live/PENDING semantics. Fixtures test classification only;
real-model execution, actual vision analysis, human quality, physical mobile and
Production acceptance remain PENDING. This change does not complete issue #124.
A separately authorized trusted-input Preview matrix and independent execution
provenance remain necessary; no protection settings were changed.

Review limitation: the same author wrote implementation and tests. Adversarial
mutations and externally observed header structure reduce circular validation;
independent coordinator review remains a merge gate. No child reviewer was
launched because this dispatch prohibits recursive agents. A read-only
consistency audit found stale default-Production/SKIP-success instructions in
`CLAUDE.md`; they predate the current verifier contract and were left untouched
outside this worker's ownership.
