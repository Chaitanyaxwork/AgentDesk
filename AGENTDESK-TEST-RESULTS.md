# AgentDesk test results

## Latest deployment-readiness verification — 2026-10-17

- `npm test`: 35 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed using ESLint CLI, including the public widget asset.
- `npm run build`: passed on the current source tree.
- `npm run eval:rag`: passed on 102 synthetic cases (64 train, 38 held-out) using lexical token overlap only. Held-out recall@5 0.9722, source precision@5 0.3575, reciprocal rank 0.8640, reference evidence retrieval 0.9412, cross-business fixture isolation 1.0 and zero harness failures. This is not live Gemini/embedding answer accuracy, citation correctness or database isolation proof.
- `npm audit --audit-level=moderate`: not completed; registry DNS returned `ENOTFOUND registry.npmjs.org`.
- Local HTTP smoke test: no server responded at `127.0.0.1:3000`; no hosted HTTP/CORS test was made.
- Live AI, production database, signup/index/chat/citation/persistence journey, payments and deployment were not tested. AI and paid fallback remain off.

Integrated release checks run on 2026-10-17 from `backend/` after the RAG, backend reliability, and widget security changes were integrated.

| Command | Result | Detail |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` passed on the integrated source tree. |
| `npm test` | PASS | 29 passed, 0 failed, 0 skipped. Node emits non-fatal `MODULE_TYPELESS_PACKAGE_JSON` notices for ESM tests. |
| `npm run lint` | PASS | No ESLint warnings or errors. Next.js reports that `next lint` is deprecated. |
| `npm run build` | PASS | Fresh optimized Next.js 15.5.27 production build, including static page generation and route traces. |
| `npm run eval:rag` | PASS (lexical proxy only) | 102 synthetic cases, 3 fictional businesses, 64 train / 38 held-out, 18 configurations. No embeddings, Gemini, or Supabase calls. Not an answer-quality test. |
| `npm run eval:rag:live` | NOT RUN | Staging SQL is applied, but app credentials, Gemini key/account verification, owner-created test users and workspace IDs, acknowledgements, and owner-authorized fixture setup are still incomplete. No provider calls made. |
| `npm audit --audit-level=moderate` | BLOCKED / UNVERIFIED | Previous run failed because registry DNS returned `ENOTFOUND registry.npmjs.org`; no advisory count is available. |
| Local HTTP smoke test | BLOCKED | Sandbox denied binding `0.0.0.0:3000` (`listen EPERM`). |

## Offline RAG proxy findings

The fixed lexical baseline held-out relevant-source recall@K was 97.2%, source precision@K 35.7%, and reference-evidence retrieval 94.1%; no-evidence abstention proxy was 0%. The training-selected candidate raises held-out precision and empty retrieval but regresses source recall, so it was not promoted. The two held-out reference-evidence misses are `q40` and `n11`. These are retrieval-proxy metrics, not Gemini response accuracy, semantic citation precision, or proof of production tenant isolation. See `AGENTDESK-AI-EVALUATION.md` for the full comparison and training/held-out separation.

## Unit and regression coverage

- SSRF URL/address validation, widget origin/config safety, and section-aware chunking.
- RAG citation allow-listing/fail-closed behavior and retrieval history bounds.
- Workspace resolution fail-closed behavior on database errors and ambiguous memberships.
- Same-origin dashboard source mutation guards.
- Widget storage-denial fallback and business-scoped visitor IDs.
- Message retry idempotency and human follow-up state behavior.
- Dataset integrity, business-owned source references, held-out split and evaluator output separation.
- Region policy, AI disabled defaults, personal-data heuristic, pricing, and Razorpay signature/disabled-switch behavior.

## Staging state and unverified flows

The isolated Supabase staging project was provisioned and `supabase/schema.sql` plus migrations `20261014` through `20261017` were applied in order through its SQL Editor. Catalog checks verified 10 expected tables, 8 routines, and RLS enabled on the 10 inspected tables. The Supabase CLI is unavailable, so no CLI migration ledger was generated. The app's signup, ingestion, Gemini embedding/generation, pgvector RPC, live answers/citations, persisted conversation flow, database tenant isolation, browser CORS, and Razorpay test payments/webhooks remain unverified. No live API or payment result is claimed.
