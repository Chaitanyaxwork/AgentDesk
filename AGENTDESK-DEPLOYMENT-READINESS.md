# AgentDesk deployment readiness

Updated 2026-10-17. This is an engineering readiness record, not a claim that AgentDesk has been deployed or approved for production use.

## Verified in this checkout

- `npm test`: 35 tests passed, including model-default, CORS/header and public-widget syntax regression checks.
- `npm run typecheck`, `npm run lint`, and `npm run build`: passed on the current source tree.
- `npm run eval:rag`: completed on 102 synthetic cases (64 tuning, 38 held-out). It uses lexical token overlap, not Gemini, embeddings or Supabase. The held-out proxy recorded recall@5 0.9722, source precision@5 0.3575, reference evidence retrieval 0.9412, cross-business fixture isolation 1.0, and no harness failures. These are not answer-accuracy or production-isolation results.
- Widget CORS is enforced at the app route based on the business's registered website. Global Next.js headers no longer add wildcard CORS with credentials. Escalation now responds to OPTIONS preflight.
- The public widget script previously had a duplicate `form` declaration that caused a browser syntax error. It is fixed and guarded by a parse test.
- `.env.local` currently points to a loopback Supabase host, not production; AI and paid fallback are off. No staging or production API request was made in this verification.
- The source default was updated from deprecated Gemini 3.5 Flash-Lite to currently documented stable Gemini 3.8 Flash. Gemini Embedding 2 remains the embedding default at 768 dimensions. This change was based on public Google docs; no account access or API call was tested.

## Do not treat as production ready yet

- No hosting provider/domain has been selected or deployed. The local app server did not respond on `127.0.0.1:3000` during this check, and hosted HTTP/CORS behavior is unverified.
- No production Supabase project credentials are configured. Do not deploy the local `.env.local` values. Create a separate production Supabase project, review and apply the schema/migrations there, enable email/auth redirects for the final domain, and test RLS with separate owners.
- Gemini is deliberately disabled. Account quota/billing, current model access, unpaid-provider data terms and a trusted host-injected region header have not been verified or approved. Do not enable AI or set acknowledgements by inference.
- Razorpay is off. Before taking payments, verify merchant eligibility, test-mode credentials, plans, webhook delivery, retries and idempotency. Do not enable live payments until the operator has completed those steps.
- `npm audit --audit-level=moderate` could not connect to `registry.npmjs.org` (`ENOTFOUND`). Dependency advisory status is unknown, not clean.
- No end-to-end signup → indexing → AI answer/citation → persisted conversation flow was run against configured services. No live AI quality evaluation, production database isolation test, external-origin widget test, load test, backup restore, monitoring/alerting validation, privacy/legal review or fine-tuning has been completed.

## Deployment preparation

1. Select and review a host that supports the Next.js production runtime, server-side environment secrets, HTTPS, request body limits, and the needed timeout/concurrency behavior. Confirm its region, pricing, logs, backup/retention controls, and trusted geo/IP header injection before enabling any geo-dependent AI behavior.
2. Create a dedicated production Supabase project. Do not reuse the local loopback URL or staging data. Keep the database in a supported region and record the project/backup plan.
3. On a new empty project, choose one migration path: (a) use the Supabase CLI and the ordered files in `supabase/migrations/`, including `20261013000000_agentdesk_initial_schema.sql`; or (b) in SQL Editor run `supabase/schema.sql` once, then migrations `20261014` through `20261017`. The `20261013000000` file is an exact copy of `schema.sql`, so never apply both. Verify tables, functions, vector extension, indexes, policies and RLS. The existing staging project was applied manually and has no CLI migration ledger; do not blindly push/reset it.
4. Set host environment values from `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SECRET_KEY`, and a cryptographically random `AI_USAGE_HASH_SECRET` of at least 32 characters. Configure the final HTTPS URL in Supabase Auth site URL and redirect allowlist. Never expose `SUPABASE_SECRET_KEY` or provider secrets to `NEXT_PUBLIC_*`.
5. Keep `AI_ENABLED=false`, `ALLOW_PAID_AI=false`, `RAZORPAY_ENABLED=false`, and `RAZORPAY_CHECKOUT_ENABLED=false` for the initial deployment. A deploy can serve the application while these paid/provider integrations are disabled, but the AI-support and checkout journeys are intentionally unavailable.
6. If AI is later considered, first verify provider account/billing/model access and the exact current data terms; get explicit operator approval for any unpaid-tier processing, synthetic-only staging data, a host-overwritten country/IP header, strict request budget, and the application's separate acknowledgements. Run only the bounded synthetic staging evaluator after all checks, then manually review every answer and citation. Never use production workspace IDs as fixtures.
7. Run the full end-to-end flow and isolation checks on staging from a browser on a different origin. Test signup, workspace provisioning, indexing, generated answer/citation (only after AI approval), persisted chat, escalation, and cross-tenant rejection. Test Razorpay separately in test mode if payment launch is in scope.
8. Run `npm audit --audit-level=moderate` in a network-enabled environment, resolve or explicitly disposition advisories, rerun checks, and record the result.
9. Configure production monitoring, error alerts, database backups and a restore drill, rate/usage alerts, incident owner, retention/deletion process and rollback/redeploy procedure before inviting customers.

## Build contract

- Node.js: `>=20.9 <25` (declared in `package.json`).
- Install: `npm ci`.
- Check: `npm test && npm run typecheck && npm run lint && npm run build`.
- Runtime: Next.js production server (`npm run start`) or a compatible managed Next.js host.
- The static embed asset is served at `/widget.js`; its host URL must match the host shown in the dashboard embed snippet.

The production deployment decision remains with the project owner after the external prerequisites and approvals above are complete.
