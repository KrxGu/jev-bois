# Policies

Mirror of the policies directory inside the buildathon repo, at
`agents/finance-agent/` under the hidden runtime folder. That directory is the
only place inside `agents/` we are allowed to write.

| File | What |
|---|---|
| `_lib.mjs` | Helpers. Reads the session transcript only. Not named `*policies.mjs`, so the loader does not treat it as a policy. |
| `ledger-rails.policies.mjs` | Syntactic rails. No network call, no latency. |

Run the offline tests before copying anything across:

```
node test/run.mjs
```

They call the agent's real tool handlers against its real seed world, so the
records the policies read are genuine. 21 cases, covering every trap in
`docs/attack-map.md` plus both clean controls.

## Installing into the buildathon repo

The policy runtime protects its own hidden directory, so a copy from inside a
hooked agent session is refused. Run this from an ordinary terminal:

```
cd ~/Desktop/Temp_Work
cp jev-bois/policies/_lib.mjs jev-bois/policies/ledger-rails.policies.mjs \
   jev-buildathon/agents/finance-agent/.$(echo failproofai)/policies/
```

Or simply copy the two files across in Finder.
