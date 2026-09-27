// Node module-resolution hooks: point `failproofai` at the local stub and the
// kit's policykit at the mockable wrapper. Nothing inside the kit repo changes.
// (These hooks run on Node's loader thread, so they share no globals with the harness.)

const STUB = new URL("./failproofai.mjs", import.meta.url).href;
const WRAP = new URL("./policykit-mock.mjs", import.meta.url).href;
const REAL_POLICYKIT = new URL("../../jev-buildathon/policykit/index.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "failproofai") return { url: STUB, shortCircuit: true };
  if (specifier === "__REAL_POLICYKIT__") return { url: REAL_POLICYKIT, shortCircuit: true };
  const r = await next(specifier, context);
  if (r.url === REAL_POLICYKIT && context.parentURL !== WRAP) return { url: WRAP, shortCircuit: true };
  return r;
}
