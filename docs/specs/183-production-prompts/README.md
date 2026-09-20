# #183 production generation prompts

Verified 2026-09-19 on Node 24.21.0 and Next 16.3.5/Turbopack. Base: `7d5e5f602b79d4eee0057c1420a1bda49879484a`; tested implementation: `3cb4675e116cba56f10bbeee7948a67e0e668f04`.

`lib/output-generation.js` reads the shared guard, title, caption and omission instructions through four literal `readFile(new URL(...))` calls. Their order and content are unchanged: 6,050 characters / 12,253 UTF-8 bytes including separators. Each file is emitted independently in `.next/server/assets`. Direct literal filesystem calls also avoid the project-wide tracing warning produced by reading a URL from an array callback.

## Production regression

Run `npm run test:production`. This builds the application and launches a real `next start` child on a local ephemeral port. Only the provider transport is replaced by a test-process preload; application code has no mock switch. The independent oracle reads the four source files and requires the outbound system prompt to match their complete joined contents exactly.

- Original dynamic URL implementation: build succeeded but the first HTTP case failed with 502 because the provider oracle rejected the incomplete prompt ([red log](logs/production-red.txt)). This is a deterministic regression reproduction, not a live-provider failure measurement.
- Final implementation: 3/15 photos × empty/written prompts × all/slot modes, **8/8 HTTP 200**, valid response contracts and exact complete prompts ([build and regression log](logs/production-final.txt)). Final build has no tracing warning.
- Removing any one source section fails the oracle. Temporarily removing each of the four emitted bundle assets produces **500 INTERNAL_ERROR**, so generation cannot succeed with a partial prompt. Each asset is restored in `finally`. Run this command exclusively against its local build because this negative test temporarily renames emitted assets.

The Node generation test also compares the entire system prompt, replacing its former guard-only assertion. The independent test file lists are intentional: deriving expected assets from the production loader would let an omitted entry redefine the oracle.

## Real-model HTTP acceptance

An unmodified `next start` process read its credentials from an external, uncommitted env file. [HTTP log](logs/live-http.txt) and [responses with image hashes](live-http.json) record four actual provider-backed requests:

| Photos | Prompt | HTTP | Elapsed |
| --- | --- | --- | --- |
| 3 | Empty | 200 | 4,729 ms |
| 3 | Written | 200 | 3,835 ms |
| 15 | Empty | 200 | 8,841 ms |
| 15 | Written | 200 | 16,715 ms |

Every response passed `validateGenerateResponse`, slot count/order/identity checks, own-photo evidence checks and `no-store`. No harness retry was used; the existing server may retry one rejected hint selection. The runner reused the 15 vision analyses in `docs/specs/123-generation/acceptance.json` only after matching each original image's filename and SHA-256. Empty prompts use the photo-only target; written prompts use freetext. Feed construction occurs locally; `/api/generate` is exercised over real HTTP. This does not claim live profile collection, fresh photo analysis, independent visual truth, a held-out quality evaluation, or deployed-environment acceptance.

Reproduce against a separately started local production server:

```sh
npm run build
node --env-file=/absolute/path/to/private.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3183
# In another terminal, with the original image directory:
node scripts/verify-production-generation.mjs http://127.0.0.1:3183 /absolute/path/to/images /tmp/live-http.json
```

## Full verification

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | 424 passed, 0 failed | [log](logs/test.txt) |
| `npm run test:ui` | 112 passed | [log](logs/ui.txt) |
| `npm run eval` | Passed, negative controls rejected | [log](logs/eval.txt) |
| `npm run check` | 110 JS/JSON checks and schema fixture agreement | [log](logs/check.txt) |
| `npm run lint` | 82 files, no fixes | [log](logs/lint.txt) |
| `npm run typecheck` | Passed | [log](logs/typecheck.txt) |
| `npm run test:production` | Build, eight HTTP cases, four missing-asset cases passed | [log](logs/production-final.txt) |

The three added `.mjs` files also passed `node --check`; `git diff --check` passed. No dependencies or prompt text changed. No Production deployment was performed and no credentials or request headers were logged.
