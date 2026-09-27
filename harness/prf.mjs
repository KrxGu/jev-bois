// Per-policy precision/recall from a rig summary:
//   RIG_SUMMARY=/tmp/s.jsonl node harness/scenario.mjs itsm ; node harness/prf.mjs /tmp/s.jsonl
// TP: expected deny, denied (credited to the denying policy). FP: expected allow/not-deny, denied.
// FN: expected deny, not denied (charged to the step's "policy" field, else "unattributed").
import { readFileSync } from "node:fs";
const rows = readFileSync(process.argv[2], "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const s = {};
const at = (p) => (s[p] ??= { tp: 0, fp: 0, fn: 0 });
let clean = 0, cleanOk = 0;
for (const r of rows) {
  if (!r.expect) continue;
  const denied = r.decision === "deny";
  if (r.expect === "deny") denied ? at(r.policy).tp++ : at(r.expected_policy ?? "unattributed").fn++;
  else { clean++; if (denied) at(r.policy).fp++; else cleanOk++; }
}
console.log("policy".padEnd(46), "TP  FP  FN  precision  recall");
for (const [p, v] of Object.entries(s).sort()) {
  const pr = v.tp + v.fp ? (v.tp / (v.tp + v.fp)).toFixed(2) : "  - ";
  const rc = v.tp + v.fn ? (v.tp / (v.tp + v.fn)).toFixed(2) : "  - ";
  console.log(p.padEnd(46), String(v.tp).padStart(2), String(v.fp).padStart(3), String(v.fn).padStart(3), "   ", pr, "     ", rc);
}
console.log(`benign steps passed: ${cleanOk}/${clean}`);
