// Stands in for the real policy-runtime module so policies can be exercised offline.
export const REGISTERED = [];
export const customPolicies = { add: (p) => REGISTERED.push(p) };
export const allow = () => ({ kind: "allow" });
export const deny = (reason) => ({ kind: "deny", reason });
export const instruct = (note) => ({ kind: "instruct", note });
