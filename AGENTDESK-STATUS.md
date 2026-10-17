# AgentDesk implementation status

## Latest deployment-readiness recheck — 2026-10-17

This section supersedes older status statements below where they differ. Local `.env.local` points to a loopback Supabase URL; it is not for production and must not be copied to a hosting provider. AI and paid fallback remain off. No secret values were displayed.

- Fixed global CORS headers that combined wildcard origin with credentials; retained route-level business website origin checks and added OPTIONS handling to widget escalation.
- Fixed a duplicate `form` declaration that prevented browsers from parsing `public/widget.js`. Added a syntax regression test, and ESLint now scans the public widget.
- Declared Node `>=20.9 <25`, switched to the existing `tsx` test loader, and replaced deprecated `next lint` with direct ESLint CLI.
- Updated the generation default from deprecated Gemini 3.5 Flash-Lite to documented stable Gemini 3.8 Flash; added a config regression test. Embeddings remain Gemini Embedding 2 at 768 dimensions. This verifies public docs only; account access is unknown and no API request was made.
- Current checks: 35/35 tests, typecheck, lint and production build passed. The 102-case lexical RAG proxy passed (64 train, 38 held-out); held-out recall@5 0.9722, source precision@5 0.3575, reference evidence retrieval 0.9412, fixture isolation 1.0 and no harness failures. These values are not answer accuracy or production tenant-isolation evidence.
- `npm audit --audit-level=moderate` could not resolve `registry.npmjs.org` (`ENOTFOUND`); security advisory status is unknown. The local app HTTP smoke check found no server listening on `127.0.0.1:3000`.
- No hosting provider/domain, production Supabase project, live AI result, payment test, full service journey, external-origin browser test or deployment is configured or verified. See `AGENTDESK-DEPLOYMENT-READINESS.md` for the remaining gates.

Updated 2026-10-17. The archive contains the product source, migrations, tests and reports. Local checks passed; external-service and full customer-journey verification still require staging configuration.

## Implemented

- Next.js dashboard and API, Supabase schema/migrations, embeddable support widget, pricing, and disabled-by-default Razorpay integration.
- Idempotent first-workspace provisioning, bounded server-side queries, global/workspace/IP AI accounting, and workspace-filtered vector lookup.
- Safe public-URL validation and redirect checking, bounded crawling, sitemap discovery, chunk metadata and deduplication.
- Source re-indexing stages embeddings and atomically publishes a replacement so the prior index remains available if preparation fails.
- Widget configuration validation and text-only rendering for configured values; message retries preserve stable client IDs and reject an ID reused for different text.
- AI responses now fail closed to an honest contact-the-business reply if the model provides no valid URL-backed citation that passes the existing overlap guard; this is a conservative format/evidence check, not semantic proof.
- Dashboard source creation, deletion and re-index routes reject foreign-origin mutations. The widget now falls back to in-memory state if browser storage is blocked and scopes visitor identifiers by business.
- Persisted human-escalation status and deduplicated system note. The UI confirms the request was recorded for the business to review in AgentDesk; it does not claim that email or another notification was sent.
- UTC/sample-aware analytics with manual-resolution wording and no fabricated customer satisfaction score.
- 102 synthetic evaluation cases over three fictional businesses, 64 training and 38 held-out; offline lexical proxy plus an explicitly gated live staging evaluator.
- Razorpay remains disabled until test credentials, plan sync, webhook, merchant eligibility and operator switches are configured.

## Staging and live AI status

An isolated `agentdesk-staging` project is Healthy in the `AgentDesk FREE` organization (ref `usvhkvfnedpvmuazgbin`, URL `https://usvhkvfnedpvmuazgbin.supabase.co`, Seoul `ap-northeast-2`). Base schema plus migrations `20261014`–`20261017` were applied through SQL Editor in documented order; each returned success. Catalog verification found 10 expected tables, 8 expected routines, and RLS enabled on the 10 inspected tables. The Supabase CLI is not installed; no migration ledger was generated. `backend/.env.local` is absent, no Auth users or workspaces have been created, and no Gemini calls were made. The live evaluator seeds fixtures with service-role writes that bypass owner RLS, and must be redesigned before the requested owner-authorized run. See `AGENTDESK-STAGING-SETUP.md` and `AGENTDESK-LIVE-TEST-RESULTS.md`.

## Local verification

- Integrated primary-agent verification: `npm test` 29/29, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run eval:rag` all passed after integration. The offline evaluator is a lexical proxy, not real AI quality. Node emits non-fatal ESM package notices in tests; Next.js marks `next lint` deprecated.
- `npm run typecheck`: passed after Supabase key-helper changes.
- `npm run lint`: passed without warnings/errors. Next.js reports that `next lint` is deprecated.
- `npm run build`: passed on the current source tree after the Supabase key-helper changes.
- `npm run eval:rag`: passed; see `AGENTDESK-AI-EVALUATION.md` for train/held-out results and individual misses. This is a lexical proxy, not model quality evidence.
- `npm audit --audit-level=moderate`: current attempt failed with `ENOTFOUND registry.npmjs.org`; advisory status is unverified.
- The local HTTP server could not bind because the sandbox returned `listen EPERM`.

- Supabase integration now prefers current publishable/secret key variables while preserving legacy key fallbacks; helper selection has regression coverage. See `AGENTDESK-STAGING-CHECKLIST.md` for the complete private setup and verification checklist.

## Live and production status

No app/Gemini credentials, owner-created test workspaces or explicit acknowledgements are configured, so live embeddings, vector retrieval, RAG answers, citations, persisted conversation behavior and runtime tenant isolation were not exercised. The live evaluator stops at its explicit safety gate before provider/database calls. Its service-role fixture seeding still bypasses owner RLS and needs an owner-authenticated setup redesign before running. The in-process handler harness does not validate deployed HTTP/CORS or browser behavior. No provider calls, payments, customer-data transfer, deployment, or production billing were performed. Staging SQL itself was applied and catalog/RLS checked as described above.

## Before accepting paying customers

Create two owner-controlled staging test users/businesses, configure private app credentials, verify the Gemini account/model/terms and region-header path, replace evaluator service-role fixture seeding with owner-authorized setup, then run and manually review the bounded live evaluation. Verify two-workspace RLS, widget installation on a separate origin, analytics, signup and conversation flows; run `npm audit` with registry access; and complete Razorpay test-mode checkout/webhook checks. No fine-tuned model is included or claimed.
