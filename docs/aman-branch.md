# Branch aman/itsm-harness

Aman's side of jev-bois: the Helix (ITSM) policies, plus test tooling that also works for Ledger.

| Path | What |
|---|---|
| `itsm/policies/` | Mirror of `agents/itsm-agent/.failproofai/policies/`. `itsm-policies.mjs` holds the rules. `trace.mjs` records every deny, instruct and Jev question for the live viewer. It never changes a decision. |
| `harness/` | Offline policy rig. It runs scripted tool calls through the policies with failproofai's semantics (priority order, first deny wins, a throw counts as allow). Allowed calls go to the agent's real MCP server. Jev can be faked (`JEV_MOCK`) or real. Scenarios live in `harness/scenarios/<agent>/`. See `harness/README.md`. |
| `harness/live/` | Live trace viewer at http://localhost:4777, in the style of Langfuse. It shows sessions, each tool call as it runs, policy denies and instructs inline, and every Jev question with its probability and latency. |
| `harness/hook-probe.mjs` | Pipes Claude-shaped payloads through the real `failproofai --hook PreToolUse`, against a synthetic transcript in /tmp that is never uploaded. |
| `container/` | An isolated Docker box (`jev-box`) with Claude Code, failproofai and its daemon. Only the buildathon folder is mounted, so only buildathon sessions are ever uploaded. Run `container/jev help`. The key is read from a file with `docker exec --env-file`, never from a command line. |
| `evals/` | Jev evaluation JSONs to paste into FailproofAI Cloud (Evaluations, New). |
| `docs/itsm-notes.md` | ITSM trap map, Jev measurements, scoring notes. |

## Layout the tools expect

The rig, viewer and container scripts look for the organisers' kit at `<repo root>/jev-buildathon`, and for the key file at `<repo root>/failproofai/.env` (or set `JEV_KEYFILE`). Both paths are gitignored.

## Team coordination

Every final-round session run with the team key counts and is averaged. Agree who runs the eight finals for each agent, once each, with the merged policies.
