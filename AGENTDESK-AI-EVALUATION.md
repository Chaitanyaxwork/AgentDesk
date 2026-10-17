# AgentDesk AI evaluation

Updated 2026-10-17. This report distinguishes deterministic retrieval measurements from model quality.

## Dataset

- Dataset version: 2.
- Three synthetic businesses: Sample AgentDesk Demo, Lumen Garden Supply, and Northstar Bicycle Co.; 13 business-owned support documents plus a private cross-tenant fixture.
- 102 question cases: 64 training and 38 held-out. The added cases are distinct phrasings tied to existing synthetic source facts; they do not add invented customer data. Reference criteria and expected behavior are written from the synthetic source text, independent of model output. Cases carry expected supporting source IDs.
- Coverage includes direct facts, paraphrases, French and Spanish, multi-source questions, follow-up context, pricing, delivery/returns, ambiguity, missing information, conflicting/archived policy, malicious source text, hidden-prompt requests, cross-business data, and policy-sensitive claims.
- The test checks that each expected source belongs to the case's business. Training cases select parameters; held-out cases are evaluated after selection.
- Dataset: `tests/fixtures/agentdesk-rag-eval.json`.

## Method

`npm run eval:rag` uses a deterministic token/IDF lexical retrieval proxy. It sweeps 120/220/350 word chunks, 3/5 top-K, and normalized lexical cutoffs using training cases only. The cutoff is a lexical score, not a pgvector cosine threshold. It records source recall/precision, reciprocal rank, exact reference-criterion retrieval, empty retrieval for no-evidence cases, clarification context retrieval, structural fixture tenant filtering, failures, and local harness time.

The offline harness does not call Gemini, create embeddings, query Supabase, generate answers, or validate model citations. Its exact phrase checks are not semantic answer evaluation. Tenant isolation is structural because the proxy filters documents using the fixture business ID; this does not prove database RLS or the production RPC. It cannot measure answer correctness, actual citation precision, unsupported claims, injection resistance, API latency, or real service failure rates.

## Baseline and candidate

This comparison is the lexical proxy only. Baseline uses the current 220-word/30-word-overlap chunk size, top-K 5, and no lexical cutoff. The training-selected proxy candidate uses 120 words, top-K 3, and lexical cutoff 0.1. Production remains at 220/30, top-K 5, cosine threshold 0.45 because the candidate's held-out recall regressed and lexical thresholds do not transfer to vector similarity.

| Metric | Baseline train (64) | Baseline held-out (38) | Candidate train (64) | Candidate held-out (38) |
| --- | ---: | ---: | ---: | ---: |
| Relevant source recall@K | 98.4% | 97.2% | 96.8% | 94.4% |
| Source precision@K | 39.2% | 35.7% | 69.6% | 66.7% |
| Exact reference-criterion retrieval | 95.0% | 94.1% | 93.3% | 94.1% |
| Empty retrieval for expected no-evidence cases | 0% | 0% | 50% | 100% |
| Clarification-case context retrieved | 100% | 100% | 100% | 100% |
| Fixture tenant filter check | 100% | 100% | 100% | 100% |
| Harness failures | 0 | 0 | 0 | 0 |

The candidate improves source precision and no-evidence filtering, while losing 2.8 percentage points of held-out source recall and 1.7 points of training reference-criterion retrieval. It is not promoted to production. The cosine similarity threshold has not been tuned from this proxy.

## Individual offline misses

- Baseline training: `q17` missed the wording “not guaranteed”; `q05` retrieved the correct website source but not the chunk containing the Spanish-hours criterion; `x011` missed its reference criterion. `q36` and `q37` did not produce empty retrieval at the baseline lexical cutoff.
- Baseline held-out: `q40` missed the renewal passage for the short history-dependent follow-up; `n11` missed the assembled-bicycle return rule's exact reference wording. No-evidence cases retrieved unrelated chunks at the zero lexical cutoff, so abstention was not supported by the proxy.
- Candidate held-out: `q40` and `n11` remain retrieval misses. Candidate retrieval abstained for the tested held-out no-evidence questions. These are retrieval observations, not measured Gemini answers.

## Live evaluator

`npm run eval:rag:live` is an opt-in, bounded command. After explicit staging and data-term acknowledgements, it writes synthetic source documents to two different staging workspaces through the production embedding-storage helper, verifies stored 768-dimensional vectors, exercises the production workspace-filtered vector RPC and chat Route Handler on a bounded set of held-out/adversarial cases, checks citations and conversation persistence, tests a follow-up turn and escalation persistence, then removes its tagged sources/conversations. It records each answer for human review. It never enables paid AI or overrides the AI kill switch. Its launcher uses Node's `--import tsx`. Staging SQL has now been applied, but no application credentials, evaluator acknowledgement, owner-created test users or workspace IDs are configured, so the evaluator has not made calls. Its current fixture seeding uses service-role writes, which bypass owner RLS; redesign that path before authorizing a live evaluation.

The RAG response path now also fails closed when generation returns no valid URL-backed citation that passes the lightweight lexical-overlap check. This reduces unsourced answer leakage but is not semantic fact verification and is covered by offline format/overlap regression tests only.

Live evaluation remains **not run**: the staging database is prepared, but application/Gemini credentials, owner-created workspaces and acknowledgements are absent. No API request occurred. Therefore answer correctness, citation precision, unsupported-claim rate, prompt-injection resistance, vector quality, live API failure rate/latency, RLS and cross-tenant behavior remain unverified. The evaluator invokes the Next.js Route Handler in-process; it does not exercise a deployed HTTP server or browser CORS. A future interrupted run may leave records carrying `[AgentDesk synthetic live eval ...]` in staging for manual cleanup.

## Model and provider checks

At the 2026-10-17 deployment-readiness check, the source default was updated from deprecated `gemini-3.5-flash-lite` to Gemini 3.8 Flash (`gemini-3.8-flash`), which Google’s current model guide lists as stable. `gemini-embedding-2` is stable and supports 768-dimensional output. Account-specific model access, quota, billing and unpaid-tier approval remain unverified. No provider call was made. Sources: [Gemini model list](https://ai.google.dev/gemini-api/docs/models), [deprecations](https://ai.google.dev/gemini-api/docs/deprecations), [embedding guide](https://ai.google.dev/gemini-api/docs/embeddings), [Gemini API terms](https://ai.google.dev/gemini-api/terms).

Google's unpaid-service terms say prompts and outputs may be used to improve Google products and may be reviewed by people. AgentDesk keeps AI disabled by default and does not include credentials in this release. Do not send sensitive, confidential, or personal information to the unpaid service. Confirm the account's current terms, region and quota before any staging run.
