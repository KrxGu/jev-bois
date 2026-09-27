# Policies: the Ledger (finance) submission

This folder is the exact contents of `agents/finance-agent/.failproofai/policies/` in the buildathon repo, the only
place inside `agents/` we may write. `submission-jev-bois.md` at the repo root is these four files, packed.

| File | Who | What |
|---|---|---|
| `_lib.mjs` | Krish | Helpers that read the session transcript. Not named `*policies.mjs`, so the loader doesn't treat it as a policy. |
| `ledger-rails.policies.mjs` | Krish | 9 code rails on the money tools. No network, no latency, fail closed on money. |
| `ledger-jev.policies.mjs` | Aman | 4 Jev checks for what code can't settle: a bank change the call-back didn't really confirm, revenue the customer record doesn't back, reworded bank-detail leaks and lookalike domains in outbound email, goodwill write-offs presented as small differences. Every state field is labelled by source. On a Jev error it denies bank-detail changes and allows the rest. Each check steps aside wherever a rail would deny, so the agent always gets the rails' message. |
| `trace.mjs` | Aman | Records denies and Jev questions for the live trace viewer (`harness/live/`). Never changes a decision. |

## Evidence

- Krish's suite: `node test/run.mjs` (21 cases), `node test/stress.mjs`, and `node test/crosstest.mjs` (rails alone vs rails plus the Jev layer).
- Our 34 scenarios with real Jev (`harness/scenarios/finance/`): rails alone fail 14 checks, rails plus the Jev layer fail 3. See `docs/comparison.md`.
- Final round: FIN-F1 to F8 ran once each on Haiku 4.5 with these files; outputs in `finals/finance/`.

## Installing into the buildathon repo

From an ordinary terminal (a hooked agent session can't write to the policy folder):

```
cp policies/_lib.mjs policies/ledger-rails.policies.mjs policies/ledger-jev.policies.mjs policies/trace.mjs \
   ../jev-buildathon/agents/finance-agent/.$(echo failproofai)/policies/
```
