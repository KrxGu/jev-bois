// Live trace viewer: follows agent sessions as they happen and streams them to
// the browser (Server-Sent Events). Zero dependencies.
//
//   node harness/live/server.mjs        (inside jev-box; published on the host at http://localhost:4777)
//
// Sources, tailed every 400 ms:
//   ~/.claude/projects/*agents-*-agent*/*.jsonl   real Claude Code sessions (prompt, agent text, tool calls, results)
//   <kit>/agents/*-agent/.runs/decisions.jsonl    your traced policy decisions + Jev questions/answers (trace.mjs)
//   <kit>/agents/*-agent/.runs/rig-events.jsonl   offline rig runs (harness/scenario.mjs)

import { createServer } from "node:http";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const PORT = Number(process.env.LIVE_PORT || 4777);
const ROOT = new URL("../../", import.meta.url).pathname;
const KIT = join(ROOT, "jev-buildathon");
const PROJECTS = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
const INDEX = new URL("./index.html", import.meta.url).pathname;
const MAX_EVENTS = 50000;

const events = [];
const clients = new Set();
let seq = 0;

function emit(ev) {
  ev.seq = ++seq;
  events.push(ev);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(line);
}

// ---- tailing ---------------------------------------------------------------
const tails = new Map(); // path -> { offset, partial }
function tail(path, onLine) {
  let st;
  try {
    st = statSync(path);
  } catch {
    return;
  }
  const t = tails.get(path) ?? { offset: 0, partial: "" };
  if (st.size < t.offset) Object.assign(t, { offset: 0, partial: "" }); // truncated / replaced
  if (st.size === t.offset) return tails.set(path, t);
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(st.size - t.offset);
    readSync(fd, buf, 0, buf.length, t.offset);
    t.offset = st.size;
    const text = t.partial + buf.toString("utf8");
    const lines = text.split("\n");
    t.partial = lines.pop();
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        onLine(JSON.parse(l));
      } catch {
        // skip a malformed line
      }
    }
  } finally {
    closeSync(fd);
    tails.set(path, t);
  }
}

const ls = (d) => {
  try {
    return readdirSync(d);
  } catch {
    return [];
  }
};

// Same clipping as trace.mjs, so a decision's args can be matched to its call.
const argsKey = (args) => {
  const s = JSON.stringify(args ?? {});
  return s.length > 400 ? s.slice(0, 400) + "…" : s;
};
const textOf = (c) =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n") : c ? JSON.stringify(c) : "";
const isBlock = (t) => !/"_env":/.test(t) && /failproofai|hook/i.test(t);
const blockReason = (t) => /because: ([\s\S]*?)(?:, as per the policy configured by the user)?$/.exec(t.trim())?.[1] ?? t.trim();
const shortTool = (n) => String(n ?? "").replace(/^mcp__.+?__/, "");

// ---- sources ---------------------------------------------------------------
const known = new Set();
function session(id, agent, source, extra = {}) {
  if (known.has(id)) return;
  known.add(id);
  emit({ type: "session", session: id, agent, source, ...extra });
}

function claudeLine(file, r) {
  const id = r.sessionId || basename(file, ".jsonl");
  const agent = /agents\/([^/]+)-agent/.exec(r.cwd ?? "")?.[1] ?? /agents-([a-z]+)-agent/.exec(file)?.[1] ?? "?";
  const ts = r.timestamp ?? new Date().toISOString();
  const content = r.message?.content;
  if (r.type === "user") {
    session(id, agent, "claude", { ts });
    if (typeof content === "string") {
      if (!content.trimStart().startsWith("<")) emit({ type: "prompt", session: id, ts, text: content });
      return;
    }
    for (const b of Array.isArray(content) ? content : []) {
      if (b.type === "tool_result") {
        const text = textOf(b.content);
        const blocked = isBlock(text);
        emit({ type: "result", session: id, ts, id: b.tool_use_id, isError: !!b.is_error, blocked, text: (blocked ? blockReason(text) : text).slice(0, 6000) });
      } else if (b.type === "text" && b.text && !b.text.trimStart().startsWith("<")) {
        emit({ type: "prompt", session: id, ts, text: b.text });
      }
    }
  } else if (r.type === "assistant") {
    session(id, agent, "claude", { ts });
    for (const b of Array.isArray(content) ? content : []) {
      if (b.type === "text" && b.text?.trim()) emit({ type: "text", session: id, ts, text: b.text });
      if (b.type === "tool_use") emit({ type: "call", session: id, ts, id: b.id, tool: shortTool(b.name), args: b.input ?? {}, key: argsKey(b.input) });
    }
  }
}

function decisionLine(r) {
  if (!r.session) return;
  session(r.session, r.agent ?? "?", r.source ?? "hook", { ts: r.ts });
  emit({ type: "decision", ...r, key: r.args });
}

function rigLine(r) {
  if (!r.session) return;
  session(r.session, r.agent ?? "?", "rig", { ts: r.ts });
  if (r.kind === "prompt") emit({ type: "prompt", session: r.session, ts: r.ts, text: r.text });
  if (r.kind === "call") emit({ type: "call", session: r.session, ts: r.ts, id: `${r.session}:${r.id}`, tool: r.tool, args: r.args, key: argsKey(r.args), expect: r.expect });
  if (r.kind === "result")
    emit({ type: "result", session: r.session, ts: r.ts, id: `${r.session}:${r.id}`, isError: !!r.isError, blocked: !!r.blocked, text: r.blocked ? blockReason(r.text ?? "") : r.text ?? "", ok: r.ok, note: r.note });
}

function scan() {
  for (const d of ls(PROJECTS)) {
    if (!/agents-[a-z]+-agent/.test(d)) continue; // only buildathon agent sessions
    for (const f of ls(join(PROJECTS, d))) if (f.endsWith(".jsonl")) tail(join(PROJECTS, d, f), (r) => claudeLine(f, r));
  }
  for (const a of ls(join(KIT, "agents"))) {
    const runs = join(KIT, "agents", a, ".runs");
    if (existsSync(join(runs, "decisions.jsonl"))) tail(join(runs, "decisions.jsonl"), decisionLine);
    if (existsSync(join(runs, "rig-events.jsonl"))) tail(join(runs, "rig-events.jsonl"), rigLine);
  }
}

// Old sessions are loaded too (sorted by time on the client), so history survives a restart.
scan();
setInterval(scan, 400);

// ---- http ------------------------------------------------------------------
createServer((req, res) => {
  if (req.url === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${JSON.stringify({ type: "reset", seq: 0 })}\n\n`);
    for (const ev of events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(readFileSync(INDEX));
  }
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, events: events.length, sessions: known.size, clients: clients.size }));
  }
  res.writeHead(404).end();
}).listen(PORT, "0.0.0.0", () => console.log(`live traces on :${PORT} (projects: ${PROJECTS})`));
