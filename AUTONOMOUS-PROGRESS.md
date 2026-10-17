# AgentDesk autonomous work checkpoint

## Deployment-readiness follow-up — 2026-10-17

- Fixed a deployment-blocking duplicate `form` declaration in `public/widget.js`; added a browser-JavaScript parser regression test and included `public/` in lint.
- Removed static global CORS headers that paired wildcard origin with credentials. Widget routes retain business-site origin checks; escalation now supports OPTIONS preflight. Added regression tests for headers and preflight.
- Added baseline security response headers, declared Node `>=20.9 <25`, and modernized lint/test scripts.
- Updated the generation default from deprecated `gemini-3.5-flash-lite` to documented stable `gemini-3.8-flash`; retained `gemini-embedding-2` at 768 dimensions. Added regression coverage. No Gemini API request was made, and account-level access is unverified.
- Current verification: 35/35 tests, typecheck, lint and production build passed. The 102-case lexical proxy returned held-out recall@5 0.9722, precision@5 0.3575, evidence retrieval 0.9412, synthetic fixture isolation 1.0 and zero harness failures. This is not real AI answer-quality evidence.
- `npm audit --audit-level=moderate` could not connect to `registry.npmjs.org` (`ENOTFOUND`). No app server was listening at `127.0.0.1:3000` during smoke check.
- Local env targets loopback Supabase; no production host/domain or production database is configured. No live provider calls, full service journey, external-origin browser test or deployment occurred. See `AGENTDESK-DEPLOYMENT-READINESS.md`.

Updated 2026-10-17. This checkpoint records work actually completed in the available session; it does not claim ten hours of execution.

## Current phase

Three scoped engineering workstreams completed (RAG, backend reliability, widget security); primary-agent staging SQL setup is complete. Live AI and end-to-end staging remain blocked by missing private app credentials, two owner-created test workspaces, Google account checks, and a service-role fixture-seeding gap in the live evaluator.

## Completed this session / prior checkpoint

- Preserved the original project and created verified source backups at `/private/tmp/AgentDesk-autonomous-start.zip` and `/private/tmp/AgentDesk-final-prepack.zip` before release edits.
- Implemented the product reliability/security fixes documented in `AGENTDESK-STATUS.md` and `AGENTDESK-SETUP.md`.
- Expanded the versioned synthetic evaluation dataset from 66 to 102 cases: 64 train and 38 held-out across three fictional businesses; added phrased variants tied to existing synthetic policy facts.
- Updated the dataset-size regression test and result documentation to match the expanded fixture.
- Added a fail-closed citation gate: model output without a valid URL-backed citation that meets the overlap guard becomes a clear contact-the-business response.
- Added same-origin protection to source create/delete/re-index dashboard mutations and tests.
- Made the widget usable when localStorage is blocked by retaining visitor/conversation state in memory; visitor IDs are now business-scoped.
- Replaced the live evaluator's TSX CLI startup with `node --import tsx`; verified it reaches its explicit acknowledgement gate without making network/service calls. The live flow remains blocked by unconfigured staging authorization and credentials.
- Added modern Supabase publishable/secret key support while preserving legacy fallback; added selector regression coverage and documented the full staging checklist.
- Re-ran `npm test` (22/22), `npm run eval:rag` (102 cases; 18 configurations; zero harness failures), `npm run typecheck`, `npm run lint` (no ESLint warnings/errors), and `npm run build` (passed).

## Verified limitations

- The offline evaluator is a lexical retrieval proxy and cannot establish live answer correctness, citation quality, model quality, or database tenant isolation.
- Live staging evaluation, deployed HTTP/CORS testing, and real provider/database journey tests remain unverified because no staging credentials, workspace IDs or owner acknowledgements are configured. The runner stops at its intended safety gate before network calls.
- `npm audit` remains unknown because registry DNS was unavailable. No fine-tuning, paid calls, customer-data transfer, or deployment was performed.

## Latest release verification — 2026-10-17

- Integrated checks passed: 29/29 tests, typecheck, lint, production build, and the 102-case offline lexical RAG proxy.
- Staging SQL was applied and catalog/RLS checked. Live RAG remains unrun because private app/provider credentials, owner-created workspaces and explicit provider/region/data-term acknowledgements are unavailable; the current fixture seeding also needs owner-authorized redesign.
- The generation model configured in source is documented as deprecated; actual Gemini account access and available quota remain unverified. No live AI calls or weight training were made.
- Created the single complete release ZIP at `/Users/chaitanya/Downloads/AgentDesk-Final.zip` (245 KB). Verified all required project files are present, no forbidden environment/dependency/cache entries or known secret-pattern matches were found, `unzip -t` passed, and the source/destination SHA-256 hashes match.
- The original project folder remains preserved. Source checkpoints are in `/private/tmp/AgentDesk-autonomous-start.zip`, `/private/tmp/AgentDesk-final-prepack.zip`, and `/private/tmp/AgentDesk-postexpansion-checkpoint.zip`.

## Staging configuration continuation — 2026-10-17

- Inspected `.env.example`, `.env.local`, setup docs, AI policy, live evaluator, source migrations and package scripts. No Supabase CLI or `SUPABASE_ACCESS_TOKEN` is available in this environment; remote migration state could not be queried now. Earlier dashboard execution/catalog checks are recorded above, but this continuation did not independently reverify the remote database.
- Backed up the pre-edit local environment file to a mode-0600 file under `/private/tmp`, set `.env.local` mode to 0600, and generated a cryptographically random `AI_USAGE_HASH_SECRET` locally. Added safe `FREE_TIER_MODE=true` and `ALLOW_PAID_AI=false`; preserved `AI_ENABLED=false` and left all acknowledgements and staging IDs unset. No credential values were logged.
- Presence-only validation confirms the Gemini key and usage hash are set; Supabase URL/client/server keys and both workspace IDs are missing. The AI kill switch is off, paid fallback is off, and evaluator acknowledgement is blank.
- Official Google docs currently list `gemini-3.5-flash-lite` as available with free-tier token pricing and no shutdown date announced, and `gemini-embedding-2` as stable with no shutdown date announced. Docs do not verify this account's key access/quota or billing status. Unpaid-tier terms allow prompts/outputs to be used to improve Google products and permit human review; synthetic-only data is required. No API calls or term approval occurred.
- Offline checks: `npm test` 29/29 passed; lint passed; production build passed; typecheck passed when rerun after build (an initial concurrent run raced with `.next/types` regeneration); offline RAG evaluator completed as a lexical retrieval proxy, not real answer accuracy. No live evaluator or model request ran.
- Next blockers: add the real staging Supabase URL/publishable/server keys; create two owner-controlled test accounts/workspaces and record distinct staging IDs; verify Google billing/quota and personally review data terms; identify a real deployment provider/header behavior. Keep live-eval acknowledgement blank until then.

## Staging readiness recheck — 2026-10-17

- Rechecked `.env.local` by variable presence only. It remains mode 0600/gitignored; Gemini key and 64-character usage hash are present; `AI_ENABLED=false`, `FREE_TIER_MODE=true`, paid fallback is off, and staging acknowledgement is blank. No Supabase URL or client/server keys, workspace UUIDs, unpaid-data/billing acknowledgements, or region provider confirmation are present.
- Supabase migration state and the two workspaces could not be queried: Supabase CLI and access token are absent, and no authenticated Supabase dashboard tab/session was available. Earlier migration success/catalog checks are documented but were not independently revalidated this turn.
- Current Google docs continue to list the configured model identifiers; pricing docs list free-tier rates for the relevant models. Account-specific model access, quota, and billing status remain unverified. Unpaid-service data use approval remains a human decision. No Gemini API calls were made.
- Offline verification rerun serially: 29/29 tests, lint, build, and typecheck passed. The 102-case lexical RAG proxy completed; its fixed production configuration showed 38 held-out cases, retrieval recall@K 0.9444, source precision@K 0.6667, reference evidence retrieval 0.9412, correct abstention proxy 1.0, and zero harness failures. These are retrieval-proxy metrics, not Gemini answer accuracy.
- The live evaluator remains unexecuted. Remaining work is staging credentials, owner-created workspace IDs, actual provider billing/quota and terms decision, and trusted-region-header verification for the real hosting platform.
- Corrected a live-evaluator preflight gap: it now reads both workspace `user_id` values and refuses missing owners or two businesses owned by the same user. Added a regression test for these cases. This does not substitute for verifying real staging records or resolving the separate service-role fixture-write concern.
- Re-ran checks after that change: 30/30 tests, typecheck, lint, and production build passed. No live command or model request was made.
## 2026-10-17 staging continuation

- Read the new execution request and inspected setup/environment templates, evaluator, AI policy, Gemini/embedding/RAG pipeline, schema, migrations and package scripts. Confirmed the migration order from repository docs and that there is no migration script.
- Created `/private/tmp/AgentDesk-pre-staging-checkpoint-2026-10-17.zip` before editing reports. No `.env.local` exists and no provider secrets were printed or changed.
- Checked Supabase Dashboard: created and confirmed the isolated `agentdesk-staging` project Healthy in `AgentDesk FREE`, project ref `usvhkvfnedpvmuazgbin`, URL `https://usvhkvfnedpvmuazgbin.supabase.co`, region `ap-northeast-2` (Seoul). No upgrade/add-on selected. Supabase CLI is not installed.
- Verified current Gemini model lifecycle against current official docs: generation ID `gemini-3.5-flash-lite` is marked deprecated on 2026-07-21 with no shutdown date; `gemini-embedding-2` is documented stable and supports 768 dimensions. Account access, quota, billing association and consent remain unverified. No calls made.
- Applied `supabase/schema.sql` plus four migrations in documented order through staging SQL Editor. Each query returned success. Catalog verification confirmed 10 tables, 8 routines and RLS enabled on all 10 inspected tables. No migration ledger was created.
- Identified a live-evaluator authorization gap: it seeds sources/chunks through the service-role client and does not verify distinct owners. This conflicts with the requested owner-authorized fixture flow. No live run attempted.
- Re-ran offline checks: 22/22 tests, typecheck, lint, build and 102-case lexical RAG evaluator passed.
- Added `AGENTDESK-STAGING-SETUP.md` and `AGENTDESK-LIVE-TEST-RESULTS.md` with actual dashboard state, blockers, model lifecycle and exact next steps.

- Current live blockers remain: no `.env.local`, no Gemini key/provider billing and terms verification, no app Auth identities or workspaces, no host region-header verification, and evaluator fixture writes still bypass owner RLS.
