# AgentDesk training and optimization report

Updated 2026-10-15.

## Model-weight training

No model-weight fine-tuning or training job was performed. No training data was uploaded, no paid job was submitted, and no model weights changed. The available project contains no approved real customer transcript corpus or account permissions for a tuning job. The default Gemini integration remains opt-in and disabled by default.

## Work completed

- Built a versioned, 102-case synthetic evaluation dataset across three fictional support businesses, with explicit reference answers/criteria, expected behavior, support-source IDs, a training split, and a separate held-out split (64 train, 38 held-out).
- Reworked the offline evaluator to select lexical-proxy settings on training cases only, report held-out results separately, and label proxy metrics and limitations accurately.
- Added a gated live evaluation command for an operator-confirmed staging Supabase project. It uses the existing embedding, vector retrieval, generation, source citation and chat persistence paths with synthetic content, records individual outputs for review, checks escalation persistence, and cleans tagged staging data on completion.
- Hardened stable chat retries so one client message ID cannot be reused with different text. Made the escalation note idempotent and changed the acknowledgement to describe a persisted request without claiming an external notification.
- Added a fail-closed citation gate and same-origin checks on source-management mutations; the widget now survives storage denial using page-session memory.
- Changed the optional live evaluator launcher to Node's `--import tsx`; it starts successfully and stops at its explicit isolated-staging gate when configuration is missing.
- Preserved the production chunk and cosine-threshold settings because the proxy candidate's held-out recall regressed and no real Gemini/pgvector comparison was available.

## What is not established

On the expanded split, the lexical candidate has 94.4% held-out source recall versus the proxy baseline's 97.2%; held-out criterion retrieval is 94.1% for both. While the candidate's source precision and no-evidence filtering improve in this proxy, it is not a validated production configuration. These results do not show actual answer correctness, semantic relevance, safe refusal, citation precision, or model quality.

The live evaluator did not start: credentials, isolated staging workspace IDs, and operator acknowledgements were absent, and TSX could not create its local IPC pipe in this sandbox (`listen EPERM`). Human review of model outputs, semantic judging, live vector metrics, live API latency/failure rates, two-workspace integration, and full external widget/browser testing remain outstanding.

## Decision

The best justified optimization in this handoff is better regression coverage plus targeted reliability and safety fixes; no model fine-tuning is warranted or claimed. Use the held-out synthetic set with the gated staging evaluator and independent human review before changing chunking or vector thresholds. If that evidence identifies a problem prompting/RAG cannot solve, first obtain an approved, permissioned dataset, confirm model/account/region fine-tuning support and terms, measure cost, and define a rollback plan.
