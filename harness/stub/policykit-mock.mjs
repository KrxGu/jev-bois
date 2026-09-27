// Wraps the kit's policykit. Everything passes through unchanged, except
// askJev when JEV_MOCK is set:
//   JEV_MOCK=0.9                      every question answers 0.9
//   JEV_MOCK='{"planted":0.93}'       per-question answers (others: 0)
//   JEV_MOCK=throw                    askJev throws, like Jev being unreachable
// Unset: the real askJev runs. Without `failproofai config` it throws
// ("Jev is not configured"), which exercises your fallback path.

export * from "__REAL_POLICYKIT__";
import { askJev as realAskJev } from "__REAL_POLICYKIT__";

export async function askJev(req) {
  const m = process.env.JEV_MOCK;
  if (m === undefined || m === "") return realAskJev(req);
  if (m === "throw") throw new Error("JEV_MOCK=throw: simulated Jev outage");
  let table = null;
  const n = Number(m);
  if (!Number.isFinite(n)) table = JSON.parse(m);
  const out = { _raw: { mocked: true }, _ms: 0 };
  for (const id of Object.keys(req?.questions ?? {})) out[id] = table ? table[id] ?? 0 : n;
  globalThis.__jevCalls?.push({ questions: Object.keys(req?.questions ?? {}), answers: { ...out } });
  return out;
}
