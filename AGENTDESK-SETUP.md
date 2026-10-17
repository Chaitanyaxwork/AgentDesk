# AgentDesk setup

## 1. Extract and install

Extract the AgentDesk release ZIP, open a terminal in the `backend` directory, install Node.js 20.9 or newer, then run:

```sh
npm ci
cp .env.example .env.local
```

Keep AI and Razorpay disabled while configuring. Never commit `.env.local` or share secret values.

## 2. Configure Supabase

Create a new, empty Supabase staging project with the `vector` extension available. Copy the project URL and current publishable/secret keys into `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public/low-privilege; RLS still applies)
- `SUPABASE_SECRET_KEY` (server-only elevated access; never use a `NEXT_PUBLIC_` name for it)

`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` remain supported as legacy fallbacks. Supabase is moving away from those names by the end of 2026; prefer current publishable/secret keys. See [Supabase API key docs](https://supabase.com/docs/guides/getting-started/api-keys). Never use production keys or data in staging.

In the Supabase SQL Editor, apply these files in order:

1. `supabase/schema.sql`
2. `supabase/migrations/20261014_ai_usage_and_function_grants.sql`
3. `supabase/migrations/20261015_billing_and_tenant_hardening.sql`
4. `supabase/migrations/20261016_atomic_workspace_provisioning.sql`
5. `supabase/migrations/20261017_chat_idempotency.sql`

For a fresh database using the SQL Editor, run `supabase/schema.sql` once, then only migrations `20261014` through `20261017` in the order above. `20261013000000_agentdesk_initial_schema.sql` is an exact copy of `schema.sql` for CLI migration history; do not run both. Alternatively, let the Supabase CLI apply the ordered migration directory, including that initial baseline, to an empty project. Do not `db push` an existing manually initialized staging project without first reconciling its migration history.

Use a new empty staging project. There is no tested rollback migration. Configure Supabase Auth email/password and allowed redirect URLs for local development. Test with two separate accounts/workspaces before production. See `AGENTDESK-STAGING-CHECKLIST.md` for verification SQL and test-workspace UUID steps.

## 3. Configure Gemini safely (optional)

Keep these defaults until you have reviewed the current Gemini unpaid-service terms and confirmed your account's billing state and permitted data region:

```dotenv
AI_ENABLED=false
FREE_TIER_MODE=true
ALLOW_PAID_AI=false
GEMINI_BILLING_DISABLED=false
GEMINI_UNPAID_DATA_APPROVED=false
```

Add `GEMINI_API_KEY` only to the local server environment. Keep the model identifiers and `GEMINI_EMBEDDING_DIMENSIONS=768` aligned with the database vector column. Generate a random `AI_USAGE_HASH_SECRET` of at least 32 characters. Defaults cap aggregate AI calls at 100/day, chat at 10,000 replies/workspace/month (the global cap is lower), chat at 10 requests/IP/minute, indexing at 60 embedding requests/IP/minute, replies at 256 tokens, messages at 2,000 characters, source pages at 5, and chunks per source at 30. Indexing has its own per-IP minute bucket and shares the global daily cap. Configure `AI_GEO_PROVIDER` and `AI_TRUSTED_GEO_HEADER_CONFIRMED=true` only after confirming the hosting platform overwrites the country header. Set all required operator acknowledgements and `AI_ENABLED=true` only when the account, region and data handling are approved.

The current generation default is Gemini 3.8 Flash (`gemini-3.8-flash`); Gemini 3.5 Flash-Lite was deprecated and replaced in the default configuration. Gemini Embedding 2 (`gemini-embedding-2`) is stable and supports 768-dimensional output. Public documentation does not verify this account’s access, quotas or billing. Google’s unpaid Gemini terms allow submitted content and outputs to be used to improve products and reviewed by people; do not use unpaid service for sensitive, confidential, or personal data. Review the [current model list](https://ai.google.dev/gemini-api/docs/models), [embedding guidance](https://ai.google.dev/gemini-api/docs/embeddings), and [Gemini API terms](https://ai.google.dev/gemini-api/terms) before opting in. No API call was made to check this account.

For a one-time owner diagnostic only, temporarily set `AI_DIAGNOSTICS_ENABLED=true`, sign in as the workspace owner, and POST to `/api/diagnostics/ai`. It uses real capped AI calls and requires at least one indexed source. Turn the flag off afterward. Live model calls and provider terms are not verified by the local test suite.

## 4. Run and exercise locally

```sh
npm run dev
```

Open <http://localhost:3000>. Create an account at `/signup`, confirm the Supabase user, sign in, and verify the workspace in Supabase. Add a public website from Knowledge and check the source status and created chunks. AI must be safely configured before indexing that needs embeddings. Run the owner AI diagnostic against an indexed source, then test a chat and verify its conversation and messages are scoped to the correct workspace. Test with a second workspace to check that its sources and conversations are not visible to the first.

The app cannot complete signup, ingestion, RAG, or conversation persistence without valid Supabase configuration and applied migrations. These live flows have not yet been verified against an account.

## 4a. Optional live RAG evaluation (staging only)

The offline `npm run eval:rag` command is a deterministic lexical retrieval proxy; it does not assess Gemini answers. For a real run, prepare two isolated staging businesses with websites configured and apply every migration above. The evaluator temporarily writes synthetic fixture sources and conversations to those workspaces and removes them on completion. It runs at most six evaluation cases plus one history turn, uses the normal embedding-storage helper, the production chat route handler, and the workspace-filtered Supabase vector function. An interrupted run may leave records titled `[AgentDesk synthetic live eval ...]`; inspect and remove only those tagged staging records manually.

Review `AGENTDESK-STAGING-CHECKLIST.md` for the exact variables, how to obtain and verify each one without exposing secrets, and the steps to apply migrations and create two test businesses. The live evaluator requires verified free-tier model access, approved provider terms, verified region-header configuration, private staging keys, two real test workspace UUIDs, and sufficient room under the shared 100-request/day cap. `GEMINI_BILLING_DISABLED=true` is only an app-side assertion; verify independently that no billing is attached to the Gemini project. The evaluator makes real provider calls and consumes quota. It writes only synthetic fixtures to staging and must never target production. It invokes the Next.js chat route in-process, so it does not test deployed proxy headers, browser CORS or an external website.

## 5. Razorpay test mode (later)

Complete Razorpay onboarding/KYC and obtain test-mode credentials in its dashboard. Set `RAZORPAY_MODE=test`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. After migrations, run:

```sh
npm run sync:razorpay:test-plans
```

Review any unsupported plan/currency combinations. Then set `RAZORPAY_ENABLED=true` and `RAZORPAY_CHECKOUT_ENABLED=true`, configure the dashboard webhook to `https://<your-host>/api/billing/webhook` with the same secret, and test checkout, activation, failure, cancellation, duplicate and out-of-order webhook delivery using test credentials only. Entitlements are granted by verified webhooks. Do not enable live mode until merchant approval, fees, currency support and live webhook behavior are confirmed.

## 6. Check and deploy when ready

Run the local checks:

```sh
npm run typecheck
npm test
npm run lint
npm run build
npm audit
```

No hosting provider is configured. Before deployment, resolve the remaining npm advisories, stage-test the migrations and tenant isolation, configure secret environment variables and trusted proxy headers, and verify the hosting provider's costs and runtime behavior. No deployment or GitHub push has been performed.
