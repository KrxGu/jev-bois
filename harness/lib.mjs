// Shared plumbing: load an agent's policies through the stub, evaluate one
// tool call the way failproofai does, and write Claude-Code-shaped transcripts
// so policykit's history() / userPrompts() read them exactly as in a real hook.

import { register } from "node:module";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

register("./stub/hooks.mjs", import.meta.url);

export const KIT = new URL("../jev-buildathon/", import.meta.url).pathname;
export const agentDir = (agent) => join(KIT, "agents", `${agent}-agent`);

export const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

/** Import every *policies.mjs in the agent's .failproofai/policies/. Returns the registered policies. */
export async function loadPolicies(agent) {
  const stub = await import("failproofai");
  stub.__reset();
  const dir = process.env.POLICIES_DIR || join(agentDir(agent), ".failproofai", "policies");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith("policies.mjs")).sort() : [];
  for (const f of files) {
    // cache-bust so a re-run in the same process sees your edits
    await import(pathToFileURL(join(dir, f)).href + `?t=${Date.now()}`);
  }
  return { files, policies: [...stub.__registered()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)) };
}

/**
 * failproofai's order (src/hooks/policy-evaluator.ts, no two-tier):
 * policies in priority order; the first deny wins; otherwise every instruct,
 * joined; otherwise allow. A policy that throws counts as allow.
 */
export async function evaluate(policies, ctx) {
  const notes = [];
  const errors = [];
  for (const p of policies) {
    const events = p.match?.events;
    if (events && !events.includes(ctx.eventType)) continue;
    const names = p.match?.toolNames;
    if (names && !names.includes(ctx.toolName)) continue;
    let r;
    try {
      r = await p.fn(ctx);
    } catch (e) {
      errors.push({ policy: p.name, error: String(e?.message ?? e) });
      continue; // counts as allow
    }
    if (r?.decision === "deny") return { decision: "deny", policy: p.name, reason: r.reason ?? "", errors };
    if (r?.decision === "instruct") notes.push({ policy: p.name, reason: r.reason ?? "" });
  }
  if (notes.length) return { decision: "instruct", policy: notes.map((n) => n.policy).join(", "), reason: notes.map((n) => n.reason).join("\n"), errors };
  return { decision: "allow", errors };
}

/** Transcript rows in Claude Code's JSONL shape. */
export const rows = {
  prompt: (text) => ({ type: "user", message: { role: "user", content: text } }),
  toolUse: (id, name, input) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] } }),
  toolResult: (id, text, isError = false) => ({
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }], is_error: isError }] },
  }),
};

const scratch = mkdtempSync(join(tmpdir(), "jev-harness-"));
let n = 0;
export function writeTranscript(list) {
  const p = join(scratch, `t${n++}.jsonl`);
  writeFileSync(p, list.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return p;
}

/** The ctx a PreToolUse hook would hand your policy. */
export function makeCtx({ agent, toolName, toolInput, transcriptPath, prompt }) {
  return {
    eventType: "PreToolUse",
    cli: "claude",
    toolName,
    toolInput,
    session: { transcriptPath, cwd: agentDir(agent), cli: "claude" },
    payload: { hook_event_name: "PreToolUse", tool_name: toolName, tool_input: toolInput, transcript_path: transcriptPath, ...(prompt ? { prompt } : {}) },
  };
}

export function show(verdict, tool, args) {
  const a = JSON.stringify(args);
  const argText = c.dim(a.length > 140 ? a.slice(0, 137) + "..." : a);
  if (verdict.decision === "deny") return `  ${c.red("⊘")} ${c.bold(tool)} ${argText}\n      ${c.red("deny")} ${c.dim(`[${verdict.policy}]`)} ${verdict.reason}`;
  if (verdict.decision === "instruct") return `  ${c.yellow("✎")} ${c.bold(tool)} ${argText}\n      ${c.yellow("note")} ${c.dim(`[${verdict.policy}]`)} ${verdict.reason}`;
  return `  ${c.green("•")} ${c.bold(tool)} ${argText}`;
}

export function showErrors(verdict) {
  return (verdict.errors ?? []).map((e) => `      ${c.yellow("! policy threw, counted as allow")} ${c.dim(`[${e.policy}]`)} ${e.error}`).join("\n");
}
