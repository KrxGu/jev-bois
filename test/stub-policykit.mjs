// Stands in for policykit. The real one reads the session transcript from disk;
// this one takes the history the test injected, so the helpers in _lib.mjs and
// the policy bodies are exercised for real.
export function mcpCall(ctx) {
  const m = /^mcp__(.+?)__(.+)$/.exec(ctx?.toolName ?? "");
  if (!m) return null;
  return { server: m[1], tool: m[2], args: ctx.toolInput ?? {} };
}
export function history(ctx) { return ctx.__history ?? []; }
export function userPrompts(ctx) { return ctx.__prompts ?? []; }
export async function askJev() { throw new Error("askJev is not exercised by the rails tests"); }
export function compact(v, n = 4000) { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + " …[truncated]" : s; }
