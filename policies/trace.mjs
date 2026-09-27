// Decision tracing for the live viewer (harness/live -> http://localhost:4777).
// Not a policy file (the name doesn't end in policies.mjs), so failproofai never loads it on its own.
//
// Usage in a *policies.mjs file:
//   import { traced, askJev } from "./trace.mjs";      // askJev here = policykit's askJev, recorded
//   customPolicies.add(traced({ name: "...", match: {...}, fn: async (ctx) => { ... } }));
//
// Each traced policy appends one line to <agent>/.runs/decisions.jsonl when it denies,
// instructs, throws, or asked Jev. Plain allows without Jev are not logged.
// Tracing never changes a decision: logging errors are swallowed, and a policy that
// throws is recorded and then re-thrown, so failproofai still treats it as allow.

import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { askJev as policykitAskJev, mcpCall } from "../../../../policykit/index.mjs";

const als = new AsyncLocalStorage();
const clip = (v, n = 600) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + "…" : s;
};

function write(ctx, rec) {
  try {
    const cwd = ctx?.session?.cwd || process.cwd();
    if (!/\/agents\/[^/]+-agent\/?$/.test(cwd)) return;
    const dir = join(cwd, ".runs");
    mkdirSync(dir, { recursive: true });
    const t = ctx?.session?.transcriptPath ?? ctx?.payload?.transcript_path ?? "";
    const session = process.env.JEV_TRACE_SESSION || basename(String(t)).replace(/\.jsonl$/, "") || "unknown";
    const call = mcpCall(ctx);
    appendFileSync(
      join(dir, "decisions.jsonl"),
      JSON.stringify({
        ts: new Date().toISOString(),
        source: process.env.JEV_TRACE_SOURCE || "hook",
        agent: basename(cwd).replace(/-agent$/, ""),
        session,
        tool: call?.tool ?? ctx?.toolName ?? null,
        args: clip(call?.args ?? ctx?.toolInput ?? {}, 400),
        ...rec,
      }) + "\n",
    );
  } catch {
    // never let tracing affect a decision
  }
}

/** Wrap a policy definition so its decisions (and any Jev calls) are recorded. */
export function traced(def) {
  const fn = def.fn;
  return {
    ...def,
    fn: async (ctx) => {
      const store = { jev: [] };
      const t0 = Date.now();
      try {
        const r = await als.run(store, () => fn(ctx));
        const decision = r?.decision ?? "allow";
        if (decision !== "allow" || store.jev.length) {
          write(ctx, { policy: def.name, decision, reason: r?.reason ?? null, ms: Date.now() - t0, jev: store.jev });
        }
        return r;
      } catch (e) {
        write(ctx, { policy: def.name, decision: "error", reason: String(e?.message ?? e), ms: Date.now() - t0, jev: store.jev });
        throw e;
      }
    },
  };
}

/** policykit's askJev, plus a record of the questions, answers and latency. Same signature and return. */
export async function askJev(req) {
  const store = als.getStore();
  const t0 = Date.now();
  const questions = Object.fromEntries(
    Object.entries(req?.questions ?? {}).map(([id, q]) => [id, { type: q?.type, instructions: clip(q?.instructions, 300) }]),
  );
  try {
    const a = await policykitAskJev(req);
    const answers = Object.fromEntries(Object.keys(questions).map((id) => [id, a[id]]));
    store?.jev.push({ questions, answers, ms: a._ms ?? Date.now() - t0 });
    return a;
  } catch (e) {
    store?.jev.push({ questions, error: String(e?.message ?? e).slice(0, 300), ms: Date.now() - t0 });
    throw e;
  }
}
