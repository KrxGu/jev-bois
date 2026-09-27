// Token usage of Claude Code sessions, summed per model from their transcripts.
// Prints totals only, never message content.
//
//   node harness/usage.mjs [dir-or-file ...]      (default: ~/.claude/projects)
//
// Inside jev-box that is every buildathon agent run. Streamed messages repeat their usage on
// several lines, so each message id is counted once.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const files = [];
const walk = (p) => {
  const s = statSync(p);
  if (s.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (p.endsWith(".jsonl")) files.push(p);
};
const roots = process.argv.slice(2);
for (const r of roots.length ? roots : [join(homedir(), ".claude", "projects")]) {
  try {
    walk(r);
  } catch {}
}

const seen = new Set();
const sessions = new Set();
const byModel = {};
for (const f of files) {
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.includes('"usage"')) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const m = rec.message;
    if (!m?.usage) continue;
    const id = m.id ?? rec.requestId ?? rec.uuid;
    if (seen.has(id)) continue;
    seen.add(id);
    if (rec.sessionId) sessions.add(rec.sessionId);
    const t = (byModel[m.model ?? "?"] ??= { requests: 0, input: 0, cache_read: 0, cache_write: 0, output: 0 });
    t.requests++;
    t.input += m.usage.input_tokens ?? 0;
    t.cache_read += m.usage.cache_read_input_tokens ?? 0;
    t.cache_write += m.usage.cache_creation_input_tokens ?? 0;
    t.output += m.usage.output_tokens ?? 0;
  }
}

const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
console.log(`${files.length} transcript files, ${sessions.size} sessions`);
for (const [model, t] of Object.entries(byModel)) {
  console.log(`${model.padEnd(28)} requests ${String(t.requests).padStart(5)}  input ${k(t.input).padStart(7)}  cache-read ${k(t.cache_read).padStart(7)}  cache-write ${k(t.cache_write).padStart(7)}  output ${k(t.output).padStart(7)}`);
}
