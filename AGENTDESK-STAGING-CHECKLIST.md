# AgentDesk staging and live RAG checklist

Updated 2026-10-15. This is for a **new, empty, non-production Supabase project** and synthetic data only. Do not copy production users, conversations, source text, vectors, keys, or backups into staging. Do not send secret values in chat or put them in screenshots.

## 1. Create and migrate an isolated Supabase project

1. Sign in at [Supabase Dashboard](https://supabase.com/dashboard), select the intended organization, then choose **New project**. Name it `agentdesk-staging`; choose a region that meets your data-residency requirements and is compatible with the Gemini terms/region checks. Select a plan only after confirming its cost. Do not enable paid resources without approval.
2. Use a new, unique database password and store it in your password manager. This app does not need the database password in `.env.local`.
3. In the new project's **SQL Editor**, run each file in a separate query, in this exact order. Do not run them in a production project. Do not also execute `20261013000000_agentdesk_initial_schema.sql`; it duplicates `schema.sql` byte-for-byte and is intended as the CLI baseline migration:
   1. `supabase/schema.sql` (creates `uuid-ossp` and `vector` extensions and the base tables/RLS)
   2. `supabase/migrations/20261014_ai_usage_and_function_grants.sql`
   3. `supabase/migrations/20261015_billing_and_tenant_hardening.sql`
   4. `supabase/migrations/20261016_atomic_workspace_provisioning.sql`
   5. `supabase/migrations/20261017_chat_idempotency.sql`
4. Wait for a success result for every file before proceeding. In the SQL Editor, verify extensions, tables and core routines:

   ```sql
   select extname from pg_extension where extname in ('uuid-ossp', 'vector');
   select to_regclass('public.businesses') as businesses,
          to_regclass('public.sources') as sources,
          to_regclass('public.chunks') as chunks,
          to_regclass('public.conversations') as conversations,
          to_regclass('public.messages') as messages;
   select proname from pg_proc
   where proname in ('match_chunks', 'get_or_create_business', 'commit_source_ingestion')
   order by proname;
   ```

   Expect both extensions, all five tables, and all three functions. The schema enables RLS; this does not substitute for later integration testing.

5. In **Authentication** settings, enable the intended sign-in method and set local callback/redirect URLs for your local app. Do not invite real customers into this project.
6. In the project's **Connect** dialog / **Settings → API Keys**, obtain the project URL, a publishable key, and a server secret key. Use the current `sb_publishable_...` and `sb_secret_...` keys where available. Keep the secret key server-only; it bypasses RLS. This code also retains `anon` / `service_role` fallback support while existing deployments migrate. Supabase says it is moving away from the legacy key names by the end of 2026. See its [API key guide](https://supabase.com/docs/guides/getting-started/api-keys).

## 2. Create two synthetic business workspaces and record their IDs

1. Copy the project `.env.example` to `.env.local`; fill in the staging Supabase URL and keys. Start the app with `npm run dev` and open `/signup`.
2. Create two separate test accounts using addresses you control. Complete any email confirmation yourself. Sign into each account and visit the dashboard so the atomic first-login provisioning path creates its `businesses` row. Use synthetic company names and no customer data.
3. In the **staging project's** SQL Editor, retrieve only staging businesses:

   ```sql
   select id, name, website, user_id, created_at
   from public.businesses
   order by created_at desc;
   ```

   Match the two rows to the test users you just created. Copy each `id` UUID. Set a public HTTPS website on the primary test business in its AgentDesk settings; the evaluator uses that website's origin for its in-process chat request. Keep the second UUID different. Do not query or copy production UUIDs.

## 3. Configure Gemini without enabling paid use

1. Open [Google AI Studio API keys](https://aistudio.google.com/apikey) and choose/create a key only for a project whose billing state you have checked. The key's project controls quota/billing.
2. In AI Studio's **Projects** view, verify the selected project is explicitly on the **Free** plan, has no active billing account linked, and shows usable per-model quotas for both configured model IDs. Do not click **Set up billing**, attach a card, prepay, or switch to a paid project. Free-tier limits are account/project-specific and may change; the API's [billing](https://ai.google.dev/gemini-api/docs/billing) and [rate-limit](https://ai.google.dev/gemini-api/docs/rate-limits) guides direct you to AI Studio for the active limits.
3. Google lists `gemini-3.8-flash`, but records it deprecated on July 21, 2026, with no shutdown date announced; `gemini-embedding-2` is documented as stable. Gemini Embedding 2 supports 768-dimensional output, which matches this project's pgvector column. These are **documented model IDs**, not proof that this particular API key/account can call them. Verify the account's project/plan/quotas in AI Studio; no API request has been made from this workspace. See [model list](https://ai.google.dev/gemini-api/docs/models), [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [embeddings](https://ai.google.dev/gemini-api/docs/embeddings), and [deprecations](https://ai.google.dev/gemini-api/docs/deprecations).
4. Review the [Gemini API terms](https://ai.google.dev/gemini-api/terms) yourself before opting in. For unpaid services, Google says submitted content and outputs may be used to improve products and may be reviewed by people; do not submit sensitive, confidential or personal data. The live evaluator uploads only its synthetic fixture, but the API key still controls your account and quota. `GEMINI_BILLING_DISABLED=true` is an app-side acknowledgement; it cannot inspect or disable Google billing.
5. Google documents that new AI Studio API keys are auth keys by default from May 28, 2026 and that unrestricted standard keys are rejected; check the current key type/restrictions on the [API key documentation](https://ai.google.dev/gemini-api/docs/api-key). Never paste `GEMINI_API_KEY` into chat, source code, a browser variable, or a screenshot.

## 4. Environment-variable checklist

Set these in the private project-local `.env.local`. The ZIP contains only `.env.example` placeholders. All key values and `.env.local` must remain private; **do not send the values to me**.

| Variable | Required for live evaluator? | Where to get/set it | How to verify / privacy |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Staging Supabase **Connect** dialog / project URL | Must use the new staging project's `https://<project-ref>.supabase.co`; nonsecret identifier, but keep the project staging-only. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (preferred) | Staging Supabase **Settings → API Keys** / Connect | Current public `sb_publishable_...` key. Public by design; still rely on RLS. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No (legacy fallback) | Same API Keys page, only if the project still uses legacy keys | Use only if the publishable key variable is blank. Public/low-privilege key; keep fallback support temporary. |
| `SUPABASE_SECRET_KEY` | Yes (preferred server key) | Staging Supabase **Settings → API Keys** | Current `sb_secret_...` key. Private; server only; elevated access bypasses RLS. Never use a `NEXT_PUBLIC_` prefix. |
| `SUPABASE_SERVICE_ROLE_KEY` | No (legacy fallback) | Same API Keys page, only if using legacy project keys | Private, elevated, server-only. Use only when `SUPABASE_SECRET_KEY` is blank. |
| `GEMINI_API_KEY` | Yes | Google AI Studio **API keys** for the verified Free project | Private. Confirm the project shows Free/no linked billing and has quota for both models. Do not share it. |
| `GEMINI_GENERATION_MODEL` | Optional; defaults to `gemini-3.8-flash` | `.env.local` | Use the exact documented model ID. Check account access in AI Studio; no live API probe was run. |
| `GEMINI_EMBEDDING_MODEL` | Optional; defaults to `gemini-embedding-2` | `.env.local` | Use the exact documented model ID and confirm its account quota. |
| `GEMINI_EMBEDDING_DIMENSIONS` | Optional; app fixes it at `768` | `.env.local` | Must remain `768` to match the schema and evaluator's vector check. |
| `NEXT_PUBLIC_SUPABASE_SECRET_KEY` | **Never set** | — | A server secret must never be public. This variable is intentionally unsupported. |
| `AI_ENABLED` | Yes, exact `true` | `.env.local`, only after every condition below is met | Enables AI; keep `false` until the operator has reviewed terms, Free plan, region and staging IDs. |
| `FREE_TIER_MODE` | Yes, exact `true` | `.env.local` | Required software gate for the zero-spend path. |
| `ALLOW_PAID_AI` | Must be absent or `false` | `.env.local` | Keep explicitly `false`; `true` makes the evaluator refuse to run. No paid fallback exists. |
| `GEMINI_BILLING_DISABLED` | Yes, exact `true` | `.env.local`, only after checking Google project billing | Operator attestation, not an API-enforced billing lock. Do not claim billing is disabled based on this flag alone. |
| `GEMINI_UNPAID_DATA_APPROVED` | Yes, exact `true` | `.env.local`, only after personally reviewing provider terms | Records your approval of synthetic data processing under those terms. Do not set it for convenience or without review. |
| `AI_USAGE_HASH_SECRET` | Yes | Generate locally, e.g. `openssl rand -hex 32` | Private random secret, at least 32 characters; never share or reuse a public value. |
| `AI_GEO_PROVIDER` | Yes: `vercel` or `cloudflare` | Choose the actual host that injects country/IP headers | Must match the host and headers your deployment actually overwrites. Do not choose based only on the value accepted by the script. |
| `AI_TRUSTED_GEO_HEADER_CONFIRMED` | Yes, exact `true` | `.env.local`, only after checking host configuration | Operator attestation that the chosen platform supplies/overwrites trusted country/IP headers. The evaluator's internal request uses synthetic headers and does not test a deployed proxy. |
| `AGENTDESK_LIVE_EVAL_STAGING_ACK` | Yes, exact `I_CONFIRM_ISOLATED_SYNTHETIC_STAGING` | Set immediately before the run | Explicit acknowledgement that the configured Supabase project is isolated staging and contains no production data. Leave blank until verified. |
| `AGENTDESK_LIVE_EVAL_BUSINESS_ID` | Yes | SQL query above, primary synthetic workspace `businesses.id` | Valid UUID from this staging project; nonsecret, but ensure it belongs to the test workspace. Primary business must have a website set. |
| `AGENTDESK_LIVE_EVAL_OTHER_BUSINESS_ID` | Yes | SQL query above, second synthetic workspace `businesses.id` | Valid UUID from the same staging project and distinct from the primary ID. Never use a production ID. |
| `AGENTDESK_LIVE_EVAL_COUNTRY` | Optional; defaults to `US` | Choose a supported two-letter country code | Must match the approved test execution region; evaluator rejects GB, CH and EEA country codes. Do not spoof a country to bypass policy. |
| `AI_GLOBAL_DAILY_MAX_REQUESTS` | Optional; defaults to `100`, hard-capped at `100` | `.env.local` | Shared app-level daily reservation cap across ingestion/chat. The bounded run is estimated at 27 reservations; make sure at least that much headroom remains and keep extra headroom for SDK retry attempts. |
| `AI_IP_MAX_REQUESTS_PER_MINUTE` | Optional; default `10` | `.env.local` | Chat throttle; evaluator waits 6.1 seconds between test turns. Do not raise to work around failures. |
| `AI_INGEST_IP_MAX_REQUESTS_PER_MINUTE` | Optional; default `60` | `.env.local` | Ingestion embedding throttle. Do not raise to work around quota errors. |

`GEMINI_REQUEST_TIMEOUT_MS` is optional (default 12,000 ms). `AI_WORKSPACE_MONTHLY_MAX_REPLIES` is optional (default 10,000 but constrained by plan). `MAX_AI_REPLY_TOKENS` is optional (default and hard cap 256). Do not enable or configure Razorpay for this evaluation; its variables are unrelated.

## 5. Verify readiness without revealing secrets

From `backend/`, make sure `.env.local` has mode `600` where supported (`chmod 600 .env.local`) and remains covered by `.gitignore`. Check only whether required keys are set; do not print their contents:

```sh
node --input-type=module -e "import nextEnv from '@next/env'; nextEnv.loadEnvConfig(process.cwd()); const keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','GEMINI_API_KEY','AI_USAGE_HASH_SECRET','AGENTDESK_LIVE_EVAL_BUSINESS_ID','AGENTDESK_LIVE_EVAL_OTHER_BUSINESS_ID','AGENTDESK_LIVE_EVAL_STAGING_ACK']; for (const key of keys) console.log(key+': '+(process.env[key] ? 'set' : 'missing'));"
```

This checks presence only; it does **not** validate the Supabase key, Gemini account access, billing tier or project isolation. Check Gemini access and Free plan in AI Studio and Supabase URL/key/project/workspaces in the respective dashboards. Do not use a live API probe while billing status is unknown.

## 6. Exact run conditions and expected usage

Run only when all the following are true:

- The Supabase URL, publishable key and server secret are confirmed to be from a newly created, empty staging project; migrations above all succeeded.
- The two workspace UUIDs are confirmed from that same staging project; the primary one has a website configured; IDs differ.
- Gemini AI Studio shows the API key's project on the Free plan, no active billing association, usable generation and embedding quota, and no paid fallback is possible. This is an account/dashboard check; the app cannot query this billing state.
- You have read and accepted the provider terms for synthetic prompts/outputs and verified the appropriate region/data handling.
- The deployed host is known (`vercel` or `cloudflare`); you confirmed it overwrites the selected country/IP headers. The country is supported and is not being spoofed.
- `AI_ENABLED=true`, `FREE_TIER_MODE=true`, `ALLOW_PAID_AI=false`, `GEMINI_BILLING_DISABLED=true`, `GEMINI_UNPAID_DATA_APPROVED=true`, `AI_TRUSTED_GEO_HEADER_CONFIRMED=true`, and all required private/public credentials above are configured locally.
- There is capacity under the global 100/day app cap. A fixture calculation gives 13 embedding reservations for 8 documents plus 14 reservations for six chat cases and one history turn: approximately 27 app reservations. Other staging traffic shares that cap; leave room for provider SDK retries and never raise the cap above 100.
- Only at this point set `AGENTDESK_LIVE_EVAL_STAGING_ACK=I_CONFIRM_ISOLATED_SYNTHETIC_STAGING` and run once: `npm run eval:rag:live`.

The runner's in-process chat request uses synthetic Vercel/Cloudflare headers and an operator-selected country. It exercises route logic, not actual proxy-header injection, browser CORS, or a deployed external website. Validate those separately in an authorized staging deployment. The live evaluator records each case and cleans tagged data in `finally`; after a crash/interruption, inspect staging and delete only records titled `[AgentDesk synthetic live eval ...]`.

Current staging project: `agentdesk-staging`, ref `usvhkvfnedpvmuazgbin`, URL `https://usvhkvfnedpvmuazgbin.supabase.co`, Seoul (`ap-northeast-2`), Healthy in the `AgentDesk FREE` organization. The base schema and migrations `20261014` through `20261017` were applied in this project through SQL Editor; all returned success and catalog checks confirmed the expected tables/functions/RLS. The Supabase CLI is not installed. `.env.local` remains absent, and no test identities/workspaces, Gemini key, usage hash, or staging acknowledgement exist. No live requests were made.

Next, configure this project's keys locally without sharing them, add the localhost Auth redirect, create two owner-controlled test accounts via `/signup`, verify distinct business IDs/owners, and review Gemini account billing, quotas and terms. Before live use, the current evaluator's service-role fixture seeding must be changed to the owner-authorized flow and the actual host's trusted region-header behavior must be verified. Keep the acknowledgement blank until all gates are satisfied.
