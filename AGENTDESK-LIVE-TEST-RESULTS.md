# AgentDesk live AI test results

Updated 2026-10-17.

## Status: NOT RUN — staging database prepared, app credentials and workspaces missing

No Gemini or end-to-end Supabase live test was run. The isolated `agentdesk-staging` project exists and is Healthy in the `AgentDesk FREE` organization: ref `usvhkvfnedpvmuazgbin`, URL `https://usvhkvfnedpvmuazgbin.supabase.co`, region Seoul (`ap-northeast-2`). The base schema and four migrations were applied in documented order; SQL Editor success and catalog checks confirmed 10 tables, 8 routines, and RLS on the 10 inspected tables. No CLI migration ledger was created.

`backend/.env.local` is absent. No Supabase application keys, Gemini API key, usage hash, workspace IDs, or staging acknowledgement are configured. No Auth users or business workspaces exist yet. No synthetic source, embedding, conversation, message, or Gemini provider call was created. No provider charges were initiated. The Supabase CLI is not installed. The evaluator also still seeds source/chunk fixtures with a service-role client, which violates the requested owner-authorized fixture-creation flow; it must be corrected before live use.

The evaluator's safety gate requires the exact acknowledgement `I_CONFIRM_ISOLATED_SYNTHETIC_STAGING`, AI enabled in free-tier mode, paid fallback disabled, both provider/data acknowledgements, verified supported region-header provider, valid private credentials/hash, distinct workspace UUIDs, and supported country. Passing these software gates alone would not prove account billing or project isolation. The global application request budget is capped at 100/day. The current evaluator is bounded to six sample-business evaluation questions plus a history turn and writes a separate synthetic isolation source to the other workspace; it does not provide the requested 12-question suite.

## Authorization issue discovered

The live evaluator creates synthetic source rows and chunks directly using the Supabase service-role client. That bypasses row-level authorization for test-data seeding. Since the request requires using the real workspace-owner authorization flow and prohibits bypassing authorization merely to insert rows, the evaluator must be changed before it can run under these requirements. It also queries workspace `id`, `name`, and `website` but does not verify distinct owners. Do not treat workspace isolation/ownership as proven by the current script.

## Offline results (not live AI evidence)

- `npm test`: 29 passed, 0 failed (latest integrated run).
- `npm run typecheck`: passed.
- `npm run lint`: passed with no ESLint warnings/errors; Next.js notes `next lint` is deprecated.
- `npm run build`: passed on the integrated source tree.
- `node scripts/evaluate-rag.mjs`: 102 synthetic cases (64 train, 38 held-out), lexical retrieval proxy only. Baseline held-out retrieval recall@5: 97.2%; source precision@5: 35.7%; one relevant-source miss (`q40`); criterion retrieval misses `q40` and `n11`. These figures do not measure Gemini answer correctness, semantic embedding retrieval, live citations, or database isolation.

## Exact next action

Configure the staging Supabase URL and keys privately in `backend/.env.local`, add `http://localhost:3000` to the staging Auth redirect allowlist, then create two test Auth identities through AgentDesk `/signup` with email addresses you control. Sign into each, verify the resulting business row and distinct owner/UUID values in this staging project, and set a synthetic public website for the primary business. Then review the Gemini AI Studio project billing/quota/terms and provide a private local `GEMINI_API_KEY` only if it is a verified free/no-billing project suitable for synthetic inputs. The live evaluator remains blocked until its owner-RLS fixture seed path is fixed, actual host-header behavior is verified, all private environment values and operator acknowledgements are configured, and the daily quota has headroom. Do not paste credentials into chat. No live result is claimed.
