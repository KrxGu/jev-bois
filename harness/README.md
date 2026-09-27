# Offline policy rig

Build and test buildathon policies with no failproofai, no Cloud and no LLM.

The rig loads your `agents/<x>-agent/.failproofai/policies/*policies.mjs` through a local stand-in for the
`failproofai` package. It decides each call the way failproofai does (from `src/hooks/policy-evaluator.ts`):
policies run in priority order, the first deny wins, otherwise every instruct note is joined, otherwise the call
is allowed. A policy that throws counts as allow.

Allowed calls go to the agent's **real** MCP server, so `history(ctx)` sees real results.

Run from `~/Desktop/code/buildathon`:

```bash
node harness/scenario.mjs itsm                   # every ITSM scenario
node harness/scenario.mjs itsm itsm-07-soc-hold  # one scenario
JEV_MOCK=0.9 node harness/scenario.mjs itsm      # pretend Jev says 0.9 to every question
JEV_MOCK='{"planted":0.93}' node harness/scenario.mjs itsm itsm-04-bot-comment
JEV_MOCK=throw node harness/scenario.mjs itsm    # simulate Jev being down: what does your fallback do?
node harness/replay.mjs itsm latest              # replay a real `buildathon run` through your policies
```

If `node` loops in your shell (the nvm lazy loader), use `/opt/homebrew/opt/node@24/bin/node`.

Output: `•` allowed · `⊘` denied (with reason) · `✎` instruct (with note) · `✓/✗` against the step's `expect`.
With no policies, every `deny` expectation fails. That's the starting red state. Get it to green while
`itsm-11` and `itsm-12` (the clean controls) stay green.

## Scenario files
`harness/scenarios/<agent>/*.json` holds `{ id, title, prompt, steps: [{ tool, args, expect, why, showResult }] }`.
- `expect` is one of `allow`, `deny`, `instruct` or `not-deny`.
- Add your own, especially variants that a practice-id-keyed rule would miss: new users, other hosts, other domains.

## What this does not tell you
- **How the agent adapts after a deny.** Only a real run shows that: `container/jev run itsm ITSM-02` (policies enforced by the
  real hook in the container), watched live at http://localhost:4777. Then `container/jev replay itsm` to re-check it against edited policies.
- **Whether real Jev agrees with your thresholds.** `JEV_MOCK` only exercises your branches.
- **Whether the real hook's transcript includes the current call as the last `history()` entry.** Here it does,
  with `result: null`. Write rules that scan for any earlier matching read, and they'll work either way.
- **Host runs are softer than the event.** On the Mac, the agent loads an org-managed CLAUDE.md. Inside `jev-box` it doesn't, so use the container.

## Live trace viewer: http://localhost:4777
A Langfuse-style live view. Sessions are on the left. On the right is each tool call as it happens, with your policies'
interjections (⊘ deny, ✎ instruct, "policy threw → allowed") and every Jev question inline: its probability bar, the question text, and latency.

- Start or restart it with `container/jev live`. It also starts on its own whenever `jev-box` boots, once `harness/live/server.mjs` exists.
- Sources: Claude sessions in the container (`~/.claude/projects`), `<agent>/.runs/decisions.jsonl` (your traced decisions),
  and `<agent>/.runs/rig-events.jsonl` (offline rig runs). Real runs, rig runs and `hook-probe` runs all appear.
- For your decisions to show up, wrap each policy in `traced(...)` and import `askJev` from `./trace.mjs`
  (it's policykit's askJev plus a record). Plain allows without a Jev call aren't logged.
  Tracing never changes a decision: log errors are swallowed, and a policy that throws is recorded, then re-thrown.
- `trace.mjs` lives in `agents/itsm-agent/.failproofai/policies/`. Copy it into another agent's folder to trace that agent.
  `pack` bundles it with your policies.

## hook-probe: the real hook without Claude
`docker exec -u node -w /work jev-box node harness/hook-probe.mjs` pipes Claude-shaped PreToolUse payloads into
`failproofai --hook PreToolUse`, from the agent folder, against a synthetic transcript in /tmp (so nothing is uploaded).
It tests failproofai's own loader, the daemon, real Jev and the exact deny/instruct text.
Measured: a deny from a code rule takes ~0.2 s. Allowed calls take ~1.4 s, most likely from failproofai's built-in Jev review running in shadow mode.
