# jev-bois: Jev Buildathon

Team: Krish (KrxGu) and Aman. Failproof AI x Lossfunk, 27 September 2026.

**Our submission is the Ledger (finance) agent.** `submission-jev-bois.md` is what we upload. It is the four files in
`policies/`, packed with the kit's `buildathon pack`.

## The submission: Ledger

| Layer | File | What it does |
|---|---|---|
| Code rails | `policies/ledger-rails.policies.mjs` + `_lib.mjs` | Exact checks on the money tools: call-back to the number on file before a bank change, release limits and no splitting, duplicate invoices (numbers compared by digit core), PO and goods-receipt match, sanctions screening, refunds to the original destination, closed periods, self-approval. Fail closed on money. |
| Jev layer | `policies/ledger-jev.policies.mjs` | Typed Jev questions only where code can't settle it, with every state field labelled by source: was the new account really confirmed on the call-back, does the customer record back this revenue, is this email leaking bank details or going to a lookalike domain, is this write-off really a small difference. |
| Tracing | `policies/trace.mjs` | Records every deny and Jev question for the live viewer. |

Evidence: Krish's suite (`test/run.mjs`, `test/stress.mjs`, `test/crosstest.mjs`); our 34 finance scenarios with real
Jev (rails alone fail 14 checks, rails plus the Jev layer fail 3: `docs/comparison.md`); final-round outputs in
`finals/finance/`. Trap map: `docs/attack-map.md` (Krish) and `docs/finance-trapmap.md` (gaps and variants).

## Also here

| Path | What |
|---|---|
| `itsm/policies/` | Policies for Helix (ITSM): 12 domain rules plus honest-claims. Not submitted. |
| `harness/` | Offline policy rig with failproofai's semantics and the agents' real tool servers; 60 scenarios; per-policy precision and recall (`harness/prf.mjs`). |
| `harness/live/` | Live trace viewer at http://localhost:4777: tool calls, denies and Jev questions as they happen. |
| `container/` | Isolated Docker box with Claude Code, failproofai and its daemon. `container/jev finals <agent>` runs each final task once with Haiku 4.5 pinned. |
| `evals/` | 11 Jev evaluations per agent, including over-blocking and made-up facts. |
| `docs/` | Notes, trap maps, the comparison, and `aman-branch.md` for the tooling layout. |

`CLAUDE.md` is the working agreement for coding agents in this repo.
