// Replay a REAL agent run through your current policies: which of the calls the
// agent actually made would have been blocked?
//
//   node harness/replay.mjs itsm <transcript.jsonl>
//   node harness/replay.mjs itsm latest          newest file in agents/itsm-agent/.runs/transcripts/
//
// Works on `buildathon run` output (stream-json) and on Claude Code session files.
// It's a counterfactual: after the first ⊘ the real agent would have read your reason
// and changed course, so the calls after it are what it did WITHOUT your policy.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { agentDir, c, evaluate, loadPolicies, makeCtx, show, showErrors, writeTranscript } from "./lib.mjs";

const [agent, which] = process.argv.slice(2);
if (!agent || !which) {
  console.error("usage: node harness/replay.mjs <agent> <transcript.jsonl | latest>");
  process.exit(2);
}

let file = which;
if (which === "latest") {
  const d = join(agentDir(agent), ".runs", "transcripts");
  const all = existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".jsonl")).map((f) => join(d, f)) : [];
  if (!all.length) {
    console.error(`No transcripts in ${d}. Run one first: node bin/buildathon.mjs run ${agent} <TASK>`);
    process.exit(2);
  }
  file = all.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

const lines = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => {
  try {
    return JSON.parse(l);
  } catch {
    return null;
  }
}).filter(Boolean);

// The task prompt: from a session file's first user row, or the run's file name ([ITSM-02] …)
const firstUser = lines.find((r) => r.type === "user" && typeof r.message?.content === "string");
const prompt = firstUser?.message?.content ?? "";

process.env.JEV_TRACE_SOURCE = "replay";
process.env.JEV_TRACE_SESSION = `replay-${file.split("/").pop().replace(/\.jsonl$/, "")}`;
const { files: pf, policies } = await loadPolicies(agent);
console.log(c.dim(`policies: ${pf.length ? pf.join(", ") : "(none yet)"} · ${policies.length} registered · JEV_MOCK=${process.env.JEV_MOCK ?? "(unset: real askJev)"}`));
console.log(c.bold(`replay ${file.split("/").pop()}`));

const upTo = [];
let blocked = 0;
let calls = 0;
for (const r of lines) {
  const content = r?.message?.content;
  if (Array.isArray(content)) {
    for (const b of content) {
      if (b.type !== "tool_use" || !/^mcp__/.test(b.name ?? "")) continue;
      calls++;
      // transcript as it stood when this call was proposed (includes the call itself, no result yet)
      const prefix = [...upTo, { ...r, message: { ...r.message, content: content.slice(0, content.indexOf(b) + 1) } }];
      const ctx = makeCtx({ agent, toolName: b.name, toolInput: b.input ?? {}, transcriptPath: writeTranscript(prefix), prompt });
      const v = await evaluate(policies, ctx);
      console.log(show(v, b.name.replace(/^mcp__.+?__/, ""), b.input ?? {}));
      const errs = showErrors(v);
      if (errs) console.log(errs);
      if (v.decision === "deny") blocked++;
    }
  }
  upTo.push(r);
}
const result = [...lines].reverse().find((r) => r.type === "result");
if (result?.result) console.log(`\n${c.bold("Agent said:")} ${String(result.result).slice(0, 600)}`);
console.log(c.dim(`\n${calls} tool calls · ${blocked} would be blocked`));
