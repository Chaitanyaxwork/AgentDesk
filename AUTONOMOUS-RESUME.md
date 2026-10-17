# AgentDesk resume instructions

## Latest deployment-readiness checkpoint — 2026-10-17

Current source checks: 35/35 tests, typecheck, ESLint and production build pass. The widget parse error and conflicting global CORS policy are fixed. See `AGENTDESK-DEPLOYMENT-READINESS.md` for exact current results and external launch gates.

Do not deploy using `.env.local`: it targets loopback Supabase. AI and paid integrations are intentionally off. No production database, host/domain, end-to-end staging journey, external-origin test, live AI evaluation or payment test is complete. `npm audit` is unknown due registry DNS failure. Complete the documented gates without inferring approval or enabling provider/billing flags.

The latest state is recorded in `AUTONOMOUS-PROGRESS.md`, with pending work in `AUTONOMOUS-TODO.md`. The project is this `backend/` directory; archive it under the `backend/` root. The original project remains preserved, and a pre-change source backup exists at `/private/tmp/AgentDesk-pre-staging-checkpoint-2026-10-17.zip`.

## Staging

The isolated Supabase project `agentdesk-staging` is Healthy in the free-tier `AgentDesk FREE` organization, ref `usvhkvfnedpvmuazgbin`, Seoul region `ap-northeast-2`. `supabase/schema.sql` and migrations `20261014` through `20261017` were applied through SQL Editor in order. Catalog inspection confirmed 10 tables, 8 routines and RLS enabled on the 10 inspected tables. The Supabase CLI is unavailable; no CLI migration ledger was produced.

No `.env.local`, app service credentials, Gemini API key, usage hash, owner-created Auth users/workspaces or live-eval acknowledgement is configured. Do not run the live evaluator until every documented zero-spend, region-header, provider data-term, staging and distinct-owner gate is verified. The runner currently seeds using service-role writes that bypass owner RLS, so redesign that setup before authorizing live evaluation. Google documents `gemini-3.5-flash-lite` as deprecated; account access, billing association and quotas have not been verified. No Gemini calls or model training occurred.

## Verification and packaging

Most recent integrated verification passed: 29/29 tests, `npm run typecheck`, `npm run lint`, `npm run build`, and the 102-case offline lexical RAG evaluator. `npm audit` remains unknown because registry DNS previously failed; live HTTP smoke testing was blocked by sandbox `listen EPERM`. Read `AGENTDESK-TEST-RESULTS.md`, `AGENTDESK-STAGING-SETUP.md`, and `AGENTDESK-LIVE-TEST-RESULTS.md` for details.

The owner requested one ZIP at `/Users/chaitanya/Downloads/AgentDesk-Final.zip`, containing all project source and reports. It has been created and verified: required sources, migrations, lockfile, tests and docs are present; `.env.local`, dependency/build/git/cache files are absent; no known secret-pattern matches were found; ZIP integrity passed and SHA-256 matches the accessible source archive. The exact destination is in Downloads.

## Latest local staging configuration checkpoint — 2026-10-17

`.env.local` now has mode 0600 and remains gitignored. It contains the previously authorized Gemini key and a newly generated private 64-character `AI_USAGE_HASH_SECRET`; safe flags are `FREE_TIER_MODE=true`, `ALLOW_PAID_AI=false`, `AI_ENABLED=false`. The original local env was backed up with mode 0600 under `/private/tmp`. Never print secret values. Staging Supabase URL/keys and two workspace IDs are still missing; all approval flags/region confirmation and the explicit live-eval acknowledgement remain unset. No live call was made.

Offline verification on this checkpoint: 29/29 tests, lint, production build and typecheck passed. `npm run eval:rag` completed but is only the lexical retrieval proxy. The first typecheck overlapped with Next build generation and failed from missing transient `.next/types`; a clean rerun after build passed. Supabase CLI and access token are unavailable, so remote migration status was not rechecked during this continuation. See `AUTONOMOUS-PROGRESS.md` for exact blockers and current official Gemini docs assessment.

## 2026-10-17 latest readiness recheck

Readiness was rechecked after the prior checkpoint. The local env contains a Gemini key and usage hash only among provider/staging variables; it has no Supabase URL/keys or two workspace IDs. AI remains disabled, paid fallback disabled, the usage hash is valid-length, and live acknowledgement is blank. Supabase CLI/token and an authenticated dashboard session are unavailable, so workspace and remote migration verification could not be performed. Account-specific Gemini access/billing/quota and real host geo-header behavior are also unverified. The live evaluator now rejects absent workspace owners and workspaces owned by the same user. Offline checks after the code change: 30/30 tests, typecheck, lint, build passed; the 102-case lexical evaluator remains proxy-only. No live request was made. Continue with the outstanding owner-driven setup in `AUTONOMOUS-TODO.md`.

Do not claim ten hours, live evaluation, paid access, or fine-tuning without execution evidence.
