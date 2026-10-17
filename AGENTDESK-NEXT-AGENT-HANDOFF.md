# AgentDesk handoff for the next AI agent

## Latest deployment-readiness work — 2026-10-17

- Fixed the public widget's duplicate `form` declaration; it previously prevented JavaScript parsing. A parse regression check now covers `public/widget.js`.
- Removed global `Access-Control-Allow-Origin: *` plus `Access-Control-Allow-Credentials: true`; per-business origin checks remain. Added escalation OPTIONS preflight and safe response headers.
- Runtime/tooling now declares Node `>=20.9 <25`, uses direct ESLint CLI and runs tests with the already installed `tsx` loader.
- Generation default now uses documented stable `gemini-3.8-flash`; embeddings use `gemini-embedding-2` at 768 dimensions. Model IDs are public-doc verified only; no API probe or call was made, and account access is unknown.
- Latest code checks: 35/35 tests, typecheck, lint and production build passed. `npm audit` is still unknown due registry DNS `ENOTFOUND`. Offline RAG is a lexical proxy only.
- `.env.local` targets loopback Supabase; do not deploy it or expose its contents. AI and paid fallback are disabled. No production host/database or deployment exists.
- Full remaining launch conditions are in `AGENTDESK-DEPLOYMENT-READINESS.md`.

Updated 2026-10-17. This file is included in the project delivery ZIP. Read it with `AUTONOMOUS-RESUME.md`, `AUTONOMOUS-TODO.md`, `AUTONOMOUS-PROGRESS.md`, and `AGENTDESK-STATUS.md` before changing anything.

## User's immediate request

Deliver one ZIP containing the complete project and this handoff note. Do not include separate report files alongside the ZIP. Do not expose or package local credentials.

## Project and safety

- The application is in this `backend/` directory. Install from `package-lock.json` using `npm ci`.
- `.env.local` and `.local-test-accounts.env` are private, gitignored local files. They are intentionally omitted from this archive. Never print their contents or copy them into a delivery.
- AI must remain disabled (`AI_ENABLED=false`), free-tier mode on, paid fallback off, and do not call Gemini or accept unpaid-provider data terms without explicit user approval. No live Gemini evaluation or model training is claimed.
- Do not set the evaluator acknowledgement or bypass evaluator, region, provider-terms, budget, owner, or tenant-isolation safety checks.

## Local staging checkpoint

- An official Supabase CLI v2.119 native runtime was installed in the user's npm cache; it is not a project dependency. A local-only Supabase stack was started successfully on loopback in the prior session. Its API endpoint was `http://127.0.0.1:29604`; Studio was `http://127.0.0.1:26125`. Never expose local generated keys or database passwords.
- `supabase/config.toml` is included to support that local setup; it is ignored by git but contains local config, not user credentials. The canonical source schema plus migrations through `20261017_chat_idempotency.sql` were applied to the local database and the local migration ledger/catalog/RLS were checked in the prior session.
- Two synthetic local signup credentials were generated and saved privately in `.local-test-accounts.env`, but the signup flow had not yet been completed/verified at the last checkpoint. Use the real app signup flow if continuing this local test; do not disclose the credentials. Verify owner/workspace separation in the local database after signup.
- These local setup facts are not evidence that the remote hosted staging project is configured or that the live evaluator is ready. Existing staging documents may refer to an earlier hosted staging checkpoint; reconcile against the actual target before making claims.

## AI / live evaluation status

- Offline RAG evaluation uses a synthetic 102-question dataset (64 train, 38 held-out) and a lexical retrieval proxy. It is not real answer accuracy.
- No Gemini API request or model-weight training has been performed. Model account access, current quota/billing association, and permission to process prompts under unpaid terms are not verified.
- The live evaluator must not run until real staging credentials, two distinct real staging workspace UUIDs with separate owners, verified trusted region-header behavior, provider data-term approval, explicit staging acknowledgement, and remaining request budget are all verified.
- The live evaluator has previously been flagged for service-role fixture writes that bypass owner RLS. Inspect and redesign that path before any live run.
- Keep the global evaluator/request cap bounded; never increase or bypass it to force a run.

## Latest offline evidence on record

Recorded in project reports: unit/regression tests, TypeScript typecheck, lint, production build, and the 102-case lexical proxy passed on the integrated code. Exact current numbers and limitations are in `AGENTDESK-TEST-RESULTS.md` and `AGENTDESK-AI-EVALUATION.md`. `npm audit` was previously blocked by registry DNS and is not a clean audit result. Do not present old results as a fresh run without rerunning them.

## Recommended next actions

1. Confirm the ZIP contents exclude `.env*` local files, `.local-test-accounts.env`, secrets, `node_modules`, `.next`, `.git`, caches, and build metadata; retain source, tests, lockfile, migrations and docs.
2. Continue local synthetic signup and verify two independent owners/workspaces via the real UI and local database, keeping all generated credentials private.
3. Refresh the progress/TODO/resume reports with the actual signup outcome and current local stack status.
4. Run offline checks serially (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run eval:rag`). Label the last command a lexical proxy.
5. Leave live AI evaluation blocked until every required external credential, authorization, region, terms, owner, and budget prerequisite is genuinely satisfied.
6. If the user again requests delivery, create one verified ZIP at the requested Downloads path when filesystem permissions permit; otherwise report the real workspace artifact path and the exact copy command.

## Important file map

- Setup and environment names: `AGENTDESK-SETUP.md`, `.env.example`
- Current blockers: `AUTONOMOUS-TODO.md`, `AUTONOMOUS-RESUME.md`
- Work history: `AUTONOMOUS-PROGRESS.md`
- Status and offline results: `AGENTDESK-STATUS.md`, `AGENTDESK-TEST-RESULTS.md`, `AGENTDESK-AI-EVALUATION.md`
- Live safety and staging notes: `AGENTDESK-STAGING-SETUP.md`, `AGENTDESK-LIVE-TEST-RESULTS.md`, `scripts/evaluate-rag-live.ts`
- Local Supabase config, schema and migrations: `supabase/`
