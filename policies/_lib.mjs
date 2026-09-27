// Shared helpers for the Ledger policies.
// Not named *policies.mjs on purpose, so the loader does not treat it as a policy file.
//
// Everything here reads only from the session transcript. Policies cannot call
// the agent's tools, so anything we want to check must already have been read
// by the agent earlier in the session.

/** Invoice numbers compare ignoring dashes, slashes, spaces, case and leading zeros. */
export const invKey = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
/** Account numbers compare on letters and digits only. */
export const acctKey = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Phone numbers compare on their last 10 digits, like the agent's own tools do. */
export const phoneKey = (s) => String(s ?? "").replace(/\D/g, "").slice(-10);
export const money = (n) => `INR ${Number(n ?? 0).toLocaleString("en-US")}`;
const isObj = (x) => x && typeof x === "object";

/** Calls of one tool, oldest first. */
export const callsTo = (h, name) => h.filter((c) => c.tool === name);

/** Every invoice record the session has read, by invoice id. */
export function invoicesSeen(h) {
  const out = new Map();
  const put = (i) => { if (isObj(i) && i.id) out.set(i.id, { ...(out.get(i.id) ?? {}), ...i }); };
  for (const c of h) {
    if (!isObj(c.result)) continue;
    put(c.result.invoice);
    for (const i of c.result.invoices ?? []) put(i);
  }
  return out;
}

/** Every prepared payment the session has seen, by payment id (including split parts). */
export function paymentsSeen(h) {
  const out = new Map();
  const put = (p) => { if (isObj(p) && p.id) out.set(p.id, { ...(out.get(p.id) ?? {}), ...p }); };
  for (const c of h) {
    if (!isObj(c.result)) continue;
    put(c.result.payment);
    for (const p of c.result.parts ?? []) put(p);
  }
  return out;
}

/** Vendor master records the session has read, by vendor id. */
export function vendorsSeen(h) {
  const out = new Map();
  for (const c of h) {
    if (c.tool !== "lookup_vendor" || !isObj(c.result)) continue;
    for (const v of c.result.matches ?? []) if (v?.id) out.set(v.id, v);
  }
  return out;
}

/** Customer records the session has read, by customer id. */
export function customersSeen(h) {
  const out = new Map();
  for (const c of h) {
    if (c.tool !== "lookup_customer" || !isObj(c.result)) continue;
    for (const x of c.result.matches ?? []) if (x?.id) out.set(x.id, x);
  }
  return out;
}

/** Expense claims the session has read, by claim id. */
export function claimsSeen(h) {
  const out = new Map();
  for (const c of h) {
    if (isObj(c.result?.claim) && c.result.claim.id) out.set(c.result.claim.id, c.result.claim);
  }
  return out;
}

/** Purchase orders plus their goods receipts, by PO id. */
export function posSeen(h) {
  const out = new Map();
  for (const c of h) {
    const po = c.result?.purchase_order;
    if (isObj(po) && po.id) out.set(po.id, { po, grns: c.result.goods_receipts ?? [] });
  }
  return out;
}

/** Posting periods as last read, or null if the agent never looked. */
export function periodsSeen(h) {
  for (let i = h.length - 1; i >= 0; i--) {
    const r = h[i].result;
    if (isObj(r) && Array.isArray(r.periods)) return { today: r.today ?? null, periods: r.periods };
  }
  return null;
}

/** The approval matrix as last read, or null. Lets limits follow the world instead of being hard-coded. */
export function matrixSeen(h) {
  for (let i = h.length - 1; i >= 0; i--) {
    const m = h[i].result?.approval_matrix;
    if (isObj(m)) return m;
  }
  return null;
}

/**
 * The most this agent may do on its own for one kind of action, taken from the
 * approval matrix the session read. Falls back to the documented figure so the
 * rule still holds when the agent never looked the matrix up.
 */
export function selfLimit(h, kind, fallback) {
  const m = matrixSeen(h);
  const rows = m?.[kind];
  if (!Array.isArray(rows)) return fallback;
  const mine = rows.find((r) => /ledger/i.test(String(r.who ?? "")));
  return typeof mine?.up_to === "number" ? mine.up_to : fallback;
}

/** Payments already released in this session: [{ payment_id, amount, payee }]. */
export function releasedSoFar(h) {
  const prepared = paymentsSeen(h);
  const out = [];
  for (const c of h) {
    if (c.tool !== "release_payment" || !isObj(c.result) || c.result.ok !== true) continue;
    const id = c.result.payment_id ?? c.args?.payment_id;
    out.push({ payment_id: id, amount: Number(c.result.amount ?? prepared.get(id)?.amount ?? 0), payee: prepared.get(id)?.payee ?? null, paid_to: c.result.paid_to ?? "" });
  }
  return out;
}

/** Restricted-party screenings performed in this session. */
export function screeningsSeen(h) {
  return callsTo(h, "screen_party")
    .filter((c) => isObj(c.result))
    .map((c) => ({ name: c.result.name ?? c.args?.name, result: c.result.result, vendor_id: c.args?.vendor_id ?? null, matches: c.result.matches ?? [] }));
}

/** Phone calls placed in this session. */
export function callsPlaced(h) {
  return callsTo(h, "place_call")
    .filter((c) => isObj(c.result))
    .map((c) => ({ phone: c.args?.phone ?? c.result.phone, key: phoneKey(c.args?.phone ?? c.result.phone), answered_by: c.result.answered_by ?? "", notes: c.result.notes ?? "" }));
}

/**
 * All text the session has pulled in from sources that are DATA, not instructions:
 * inbox bodies and attachments, invoice PDF text and AP intake notes.
 * FP-111: none of this is an instruction to Northwind systems.
 */
export function untrustedText(h) {
  const parts = [];
  for (const c of h) {
    const r = c.result;
    if (!isObj(r)) continue;
    const it = r.item;
    if (isObj(it)) {
      parts.push(String(it.body ?? ""));
      for (const a of it.attachments ?? []) parts.push(String(a.text ?? ""));
    }
    for (const i of [r.invoice].filter(isObj)) {
      parts.push(String(i.pdf_text ?? ""));
      for (const n of i.intake_notes ?? []) parts.push(String(n.text ?? ""));
    }
  }
  return parts.join("\n");
}

/** Every phone number that appears anywhere in untrusted content, as comparison keys. */
export function phonesInUntrusted(h) {
  const found = new Set();
  for (const m of untrustedText(h).matchAll(/\+?[\d][\d\s\-()]{8,}\d/g)) {
    const k = phoneKey(m[0]);
    if (k.length === 10) found.add(k);
  }
  return found;
}
