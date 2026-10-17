# AgentDesk remaining work

## Release packaging

- [x] Re-run lint and production build on the final tree.
- [x] Refresh release manifest and verify all required source, migrations, lockfile, tests and reports are present.
- [x] Scan final archive for local environment files, credentials, private keys, customer data, caches and dependency directories; no known secret patterns or forbidden files found.
- [x] Verify ZIP integrity, required source/migrations/lockfile/tests/docs, nonzero size, and matching SHA-256 in Downloads.

## Offline work completed in the current continuation

- [x] Remove global wildcard-plus-credentials CORS headers; keep business website origin checks and handle widget escalation OPTIONS preflight.
- [x] Fix public widget JavaScript parse failure; add browser syntax regression test and lint the published asset.
- [x] Declare supported Node range, use direct ESLint CLI and the existing `tsx` test loader.
- [x] Pass current test, typecheck, lint and production build checks.

- [x] Add a fail-closed citation gate for absent/invalid/unrelated/unsafe source citations.
- [x] Protect source create/delete/re-index dashboard writes against foreign origins.
- [x] Keep the widget operational when browser local storage throws; scope identifiers per business.
- [x] Use a Node `--import tsx` live-evaluator launcher that bypasses the blocked TSX CLI IPC startup; validate its safety gate before any external call.

## Current external blocker / code gate

- [x] Create isolated free-tier Asia-Pacific `agentdesk-staging` project and apply schema/migrations in order; verify catalog and RLS state.
- [ ] Create two synthetic authenticated owners through the app and verify distinct owner UUIDs.
- [ ] Review Google AI Studio project billing, model quotas and unpaid data terms; configure private `.env.local` and explicit acknowledgements only after review.
- [ ] Redesign live evaluator fixture seeding to use an owner-authorized application flow and verify the two workspaces have distinct actual owners before running.
- [x] Generate a private `AI_USAGE_HASH_SECRET` locally; keep `.env.local` mode 0600, AI disabled, paid fallback disabled, and staging acknowledgement blank.
- [ ] Add the real staging Supabase URL, publishable key and server secret to `.env.local`; verify migration state from the authenticated project once credentials/tool access exist.
- [ ] Verify Gemini account-specific model access, free quotas and billing state in AI Studio; review and decide on unpaid data terms.
- [ ] Identify the actual deployment host and verify its trusted country/IP header injection before setting region confirmation.

## External integration / production readiness

- [ ] Complete staging app credentials, owner-created identities and approved Gemini credentials/terms/acknowledgements; then run the gated live evaluator and independently review model responses.
- [ ] Test RLS, concurrent workspace provisioning, vector replacement, persisted chat, escalation, and cross-tenant isolation using the two staging workspaces.
- [ ] Exercise the embed widget on an independently hosted origin and test deployed CORS/HTTP behavior.
- [ ] Run `npm audit` with registry connectivity; assess findings before production.
- [ ] Verify Razorpay test checkout and webhooks with eligible test configuration before enabling billing.
- [ ] Complete launch review, backups, monitoring, privacy/data retention review and deployment configuration.
- [ ] Select hosting platform/domain; configure production-only Supabase project credentials and Auth redirect allowlist; deploy to staging.
- [ ] Verify host-specific HTTPS, HTTP/CORS, externally hosted widget, and trusted geo/IP-header behavior.
- [ ] Run `npm audit --audit-level=moderate` when registry DNS works; current advisory status is unknown due `ENOTFOUND`.

## AI tuning

- [ ] Use the live held-out suite before promoting any RAG configuration. Keep current chunking and vector threshold until real evidence supports a change.
- [ ] No model-weight fine-tuning is currently performed or claimed. Reassess only if account eligibility, data terms, approved data and zero-spend authorization are established.
