# AgentDesk

AgentDesk is a Next.js support assistant prototype using Supabase for accounts, workspace data and pgvector retrieval, Google's Gemini Developer API for grounded replies and embeddings, and Razorpay Subscriptions for paid tiers.

## Integration inventory

| Provider | Purpose | State | Verification |
| --- | --- | --- | --- |
| Supabase Auth / Postgres / pgvector | Signup, login, workspaces, sources, messages and vectors | Isolated staging project created and schema/migrations applied; app credentials, test users and workspace IDs not configured | SQL catalog/RLS checks passed; end-to-end app flows still require owner configuration |
| Gemini Developer API | `gemini-3.8-flash` generation and `gemini-embedding-2` at 768 dimensions | Current documented stable model IDs; AI is off by default; account access/quota/billing remain unverified | No live generation, embeddings or RAG calls made; owner must verify account access before opt-in |
| Razorpay Subscriptions | Test/live plan mapping, subscription checkout, signed webhook state and user cancellation | Server/UI code present; disabled until keys, plan sync and account approval | Checkout signatures have local crypto tests; no Razorpay credentials, remote plan creation, test checkout or webhook were run |
| Hosting | Next.js runtime, trusted geo/IP headers and production deployment | No hosting provider/configuration found; no deployment performed | Local production build passes; platform headers, commercial terms, runtime limits and costs are unverified |

Google's current model guide lists Gemini 3.8 Flash as stable; Gemini Embedding 2 is stable and supports 768 dimensions. The previous generation default, Gemini 3.5 Flash-Lite, was deprecated, so the source/default config was updated. Public documentation does not verify this account's access, quotas or billing attachment. Free-tier provider terms allow content use for product improvement and human review; no data-term approval has been given and AI remains disabled. See Google's [model list](https://ai.google.dev/gemini-api/docs/models), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [deprecations](https://ai.google.dev/gemini-api/docs/deprecations), and [terms](https://ai.google.dev/gemini-api/terms).

## Local setup

1. Install Node.js 20.9 or newer and run `npm ci`.
2. Copy `.env.example` to `.env.local`. Keep `AI_ENABLED=false`, `RAZORPAY_ENABLED=false`, and `RAZORPAY_CHECKOUT_ENABLED=false` until setup is complete.
3. Create a Supabase project. Set its URL, anon key and server-only service-role key in `.env.local`. Do not put service-role or provider secret keys in client variables.
4. In Supabase SQL Editor, run `supabase/schema.sql` once, then migrations in order: `20261014_ai_usage_and_function_grants.sql`, `20261015_billing_and_tenant_hardening.sql`, `20261016_atomic_workspace_provisioning.sql`, and `20261017_chat_idempotency.sql`. The migration `20261013000000_agentdesk_initial_schema.sql` is an exact copy of `schema.sql`; do not execute both. The Supabase CLI migration path uses the ordered migration directory including that baseline.
5. Run `npm run dev` and visit `http://localhost:3000`.

The public widget requires a configured business website and matching browser Origin. Its source links come from retrieved source metadata. The page `public/widget.js` is the installable embed; there is no credential-free way to complete the live widget conversation journey.

## AI configuration

The app uses the official `@google/genai` SDK and separate server-only `GEMINI_GENERATION_MODEL` / `GEMINI_EMBEDDING_MODEL` variables. Generation calls have a 12-second default timeout, at most one retry, 256 output tokens, and the embedding dimension is fixed at 768 to match the vector column. Global AI usage is durably limited to at most 100 model requests per UTC day by default, combining ingestion and chat; workspace reply limits and source/member limits are also checked. No paid model fallback exists.

To enable AI, first confirm the Gemini project has no active Cloud billing account, review the current unpaid-service data terms, choose an allowed deployment region, configure and verify platform-injected country and client-IP headers, and deliberately set all required acknowledgements and `AI_ENABLED=true`. Environment variables are operator assertions; they do not prove billing status. Never use unpaid AI for sensitive, confidential, personal, or regulated content. Then log in as the workspace owner, enable `AI_DIAGNOSTICS_ENABLED=true` temporarily, and explicitly POST to `/api/diagnostics/ai`. It consumes a few capped requests and tests generation, 768-dimension embedding, and RAG against an indexed source. Turn the diagnostic flag off afterward.

## Razorpay test setup

1. Complete Razorpay account onboarding and any required KYC; obtain **test-mode** API credentials in the Razorpay dashboard. Do not put production secrets in chat or source control.
2. Set `RAZORPAY_MODE=test`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in `.env.local`.
3. After both SQL migrations are applied, run `npm run sync:razorpay:test-plans`. It reuses database mappings and matching provider plan notes, and reports unsupported currency/interval combinations. Only mapped combinations can check out.
4. Set `RAZORPAY_ENABLED=true` and `RAZORPAY_CHECKOUT_ENABLED=true`. Sign in, choose a paid tier and run a test checkout. Configure Razorpay's webhook URL as `/api/billing/webhook` with the same webhook secret. Test subscription activation, payment failure, cancellation, duplicate delivery and out-of-order delivery in the Razorpay test dashboard.
5. Paid entitlement comes only from verified server webhooks. A browser callback verifies payment evidence but does not activate a plan. The app does not create invoices or retain card data.

Live plan synchronization requires both `RAZORPAY_MODE=live`, `RAZORPAY_LIVE_MODE_APPROVED=true`, and `npm run sync:razorpay:test-plans -- --confirm-live-plan-sync`; live checkout additionally requires the normal enable switches and live credentials. Do not enable live mode until merchant approval, supported currency/methods and webhook behavior are confirmed. International subscription support depends on the merchant account.

Razorpay is not zero-cost: its official pricing currently advertises a subscription add-on per paid subscription payment plus the underlying payment gateway fee and applicable GST; promotions are eligibility-limited and can change. Check the dashboard contract and [official pricing](https://razorpay.com/pricing/), [subscription pricing](https://razorpay.com/subscriptions/), and [offer terms](https://razorpay.com/terms/subscription-plans/) before live payments. There are no real charge tests in this project.

## Pricing and entitlements

One typed configuration controls monthly prices, plan limits and the 20% annual calculation. The four selectable regions are INR, USD, GBP and EUR; Bulgaria maps to EUR. Regional detection uses browser locale, then an optional verified hosting-country header, with a user-visible selector. The checkout endpoint accepts only configured plan/region/interval keys and derives currency and amount on the server; it ignores any browser-supplied amount. Workspace plan changes occur only through verified webhooks. Plan limits in this code are settings, not provider quota guarantees; the global AI cap can be lower than any paid limit.

The free beta has 100 AI replies/month, one source, and one member. Starter/Growth/Scale limits are in `src/lib/pricing.ts`; source and member insert limits are additionally guarded by database triggers. Member invitation UI/API is not implemented yet, and plan change/proration is not available while a subscription is current; owners can request cancellation from Billing.

## Security and data limits

The service-role key is server-only. Billing and usage tables have RLS enabled with client roles revoked. Database migrations restrict vector search to the server role, harden the RLS helper search path, enforce plan limits under concurrency, and apply signed Razorpay events idempotently and in timestamp order. Website fetches reject private destinations, revalidate redirects and bound pages, response size and time. Common direct identifiers are redacted before Gemini calls; this heuristic is not complete PII detection. The widget requires visitor acknowledgement and does not persist the conversation transcript in browser local storage.

The schema and ordered migrations have been applied to the isolated `agentdesk-staging` Supabase project and catalog/RLS checks passed. Application credentials, test users and workspaces are not configured, so end-to-end signup, tenant isolation, ingestion and conversation persistence remain unverified. No rollback script is included; take a Supabase backup before applying migrations to a populated project.

## Checks

See [`AGENTDESK-DEPLOYMENT-READINESS.md`](./AGENTDESK-DEPLOYMENT-READINESS.md) for the current release gates and deployment sequence.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

Tests use local deterministic inputs and signatures; no live provider requests are mocked as successful. They do not prove a live database policy, webhook delivery, provider model access, account eligibility or checkout. The framework runs on Next.js 15.5.27 and the async cookie and route parameter APIs were migrated and build-verified. Dependency advisory status is unverified because registry DNS is unavailable here. Run `npm audit` from a network-enabled environment before a public launch.

## Outstanding operator actions

- Configure Supabase project credentials, run the SQL files in order, and verify RLS with two separate workspaces.
- Create a Gemini API key only after reviewing the unpaid data terms and confirming the project billing configuration; run the owner-only diagnostic on an indexed source.
- Complete Razorpay onboarding/KYC, configure test credentials and webhook, sync test plans, and run actual test-mode subscriptions. Enable live keys and approval only after account/currency/fee review.
- Select hosting, verify its commercial terms and costs, configure trusted geo/IP headers and environment secrets, and stage-test. No deployment has taken place.
- Run `npm audit` with registry access, review any findings, and rerun the complete suite before production.

## Quality evaluation and training status

`npm run eval:rag` evaluates a deterministic lexical retrieval proxy against 102 synthetic cases across three businesses, with a held-out split that is not used for parameter selection. It does not call embeddings, pgvector, or Gemini and is not proof of answer quality. The opt-in `npm run eval:rag:live` command exercises embedding storage, vector retrieval and the chat route against two explicitly confirmed staging workspaces; no live service configuration or provider credentials were available to run it here. See `AGENTDESK-AI-EVALUATION.md` and `AGENTDESK-TRAINING-REPORT.md`.
