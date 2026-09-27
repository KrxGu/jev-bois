// Local stand-in for the `failproofai` package, so policy files load and run
// without installing failproofai. Same shapes as failproofai's own
// src/hooks/policy-helpers.ts and policy-types.ts.

const registry = [];

export const customPolicies = {
  add(p) {
    if (!p || typeof p.fn !== "function" || !p.name) throw new Error("customPolicies.add needs { name, fn }");
    registry.push({ priority: 0, match: {}, description: "", ...p });
  },
};

// Registered, never asked: failproofai only asks semantic policies that arrive through a published pack.
export const semanticPolicies = { add() {} };

export const allow = (reason) => (reason ? { decision: "allow", reason } : { decision: "allow" });
export const deny = (reason) => ({ decision: "deny", reason });
export const instruct = (reason) => ({ decision: "instruct", reason });

export function __registered() {
  return registry;
}
export function __reset() {
  registry.length = 0;
}
