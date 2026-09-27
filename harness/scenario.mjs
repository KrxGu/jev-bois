// Scripted "what if the agent did this" runs. No LLM, no failproofai, no Cloud.
//
//   node harness/scenario.mjs itsm                    every scenario in harness/scenarios/itsm/
//   node harness/scenario.mjs itsm itsm-02            one scenario (file name without .json)
//   JEV_MOCK=0.9 node harness/scenario.mjs itsm       pretend Jev answers 0.9 to everything
//
// Each step is one tool call. Your policies decide it exactly as the PreToolUse hook would.
// An allowed call goes to the agent's REAL MCP server (so history() sees real results);
// a denied call never runs, and the agent would read your reason as the tool result.
// Steps carry an "expect" ("allow" | "deny" | "instruct" | "not-deny"); mismatches FAIL.

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentDir, c, evaluate, loadPolicies, makeCtx, rows, show, showErrors, writeTranscript } from "./lib.mjs";

const [agent, only] = process.argv.slice(2);
if (!agent) {
  console.error("usage: node harness/scenario.mjs <itsm|legal|health|finance> [scenario]");
  process.exit(2);
}

function startServer() {
  const p = spawn(process.execPath, ["server.mjs"], {
    cwd: agentDir(agent),
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, BUILDATHON_RUN_ID: "scenario" },
  });
  let buf = "";
  const waiting = new Map();
  p.stdout.setEncoding("utf8");
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      waiting.get(msg.id)?.(msg);
      waiting.delete(msg.id);
    }
  });
  let id = 0;
  const rpc = (method, params) =>
    new Promise((res) => {
      const my = ++id;
      waiting.set(my, res);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: my, method, params }) + "\n");
    });
  return { rpc, stop: () => p.stdin.end() };
}

// Full trace of rig runs for the live viewer (harness/live): prompt, calls, results.
function rigEmit(rec) {
  try {
    const dir = join(agentDir(agent), ".runs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "rig-events.jsonl"), JSON.stringify({ ts: new Date().toISOString(), session: process.env.JEV_TRACE_SESSION, agent, ...rec }) + "\n");
  } catch {}
}

function matches(expect, decision) {
  if (!expect) return true;
  if (expect === "not-deny") return decision !== "deny";
  return expect === decision;
}

async function runScenario(file, policies) {
  const sc = JSON.parse(readFileSync(file, "utf8"));
  // tag traced decisions so the live viewer groups this scenario as one "rig" session
  process.env.JEV_TRACE_SOURCE = "rig";
  process.env.JEV_TRACE_SESSION = `rig-${sc.id ?? "scenario"}-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;
  const server = startServer();
  await server.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "harness", version: "0" } });
  const prompt = sc.prompt ?? "";
  const transcript = [rows.prompt(prompt)];
  let fails = 0;
  rigEmit({ kind: "prompt", text: `${prompt}  (scenario ${sc.id}: ${sc.title ?? ""})` });
  console.log(`\n${c.bold(sc.id ?? file)} ${c.dim(sc.title ?? "")}`);
  if (sc.note) console.log(c.dim(`  ${sc.note}`));
  for (const [i, step] of sc.steps.entries()) {
    const toolName = `mcp__${agent}__${step.tool}`;
    const useId = `toolu_${i}`;
    transcript.push(rows.toolUse(useId, toolName, step.args ?? {}));
    rigEmit({ kind: "call", id: useId, tool: step.tool, args: step.args ?? {}, expect: step.expect ?? null });
    const ctx = makeCtx({ agent, toolName, toolInput: step.args ?? {}, transcriptPath: writeTranscript(transcript), prompt });
    const v = await evaluate(policies, ctx);
    let line = show(v, step.tool, step.args ?? {});
    const ok = matches(step.expect, v.decision);
    if (step.expect) line += "  " + (ok ? c.green(`✓ expect ${step.expect}`) : c.red(`✗ FAIL: expected ${step.expect}, got ${v.decision}`));
    if (step.why) line += `\n      ${c.dim(step.why)}`;
    console.log(line);
    const errs = showErrors(v);
    if (errs) console.log(errs);
    if (!ok) fails++;
    if (v.decision === "deny") {
      transcript.push(rows.toolResult(useId, `Blocked by failproofai hook because: ${v.reason}`, true));
      rigEmit({ kind: "result", id: useId, text: `Blocked by failproofai hook because: ${v.reason}`, isError: true, blocked: true, ok });
      continue;
    }
    const res = await server.rpc("tools/call", { name: step.tool, arguments: step.args ?? {} });
    const text = res.result?.content?.[0]?.text ?? JSON.stringify(res.error ?? res);
    transcript.push(rows.toolResult(useId, text, !!res.result?.isError));
    rigEmit({ kind: "result", id: useId, text: text.slice(0, 4000), isError: !!(res.result?.isError || res.error), blocked: false, ok, note: v.decision === "instruct" ? v.reason : null });
    if (res.result?.isError || res.error) console.log(`      ${c.yellow("✗ tool error")} ${c.dim(text.replace(/\s+/g, " ").slice(0, 200))}`);
    else if (step.showResult) console.log(c.dim("      → " + text.replace(/\s+/g, " ").slice(0, 400)));
  }
  server.stop();
  return fails;
}

const dir = join(new URL(".", import.meta.url).pathname, "scenarios", agent);
if (!existsSync(dir)) {
  console.error(`No scenarios folder: ${dir}`);
  process.exit(2);
}
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".json") && (!only || f === `${only}.json`))
  .sort()
  .map((f) => join(dir, f));
if (!files.length) {
  console.error(`No scenario matched${only ? ` "${only}"` : ""} in ${dir}`);
  process.exit(2);
}

const { files: pf, policies } = await loadPolicies(agent);
console.log(c.dim(`policies: ${pf.length ? pf.join(", ") : "(none yet)"} · ${policies.length} registered · JEV_MOCK=${process.env.JEV_MOCK ?? "(unset: real askJev)"}`));
let total = 0;
for (const f of files) total += await runScenario(f, policies);
console.log(total ? c.red(`\n${total} expectation(s) failed`) : c.green("\nall expectations met"));
process.exit(total ? 1 : 0);
