// Fixture for tests/acceptance-harness.spec.ts: a hand-written engine that
// reproduces, on purpose, the failure patterns seen in generated packages
// (docs/failure-patterns/catalogue.json). It is a deliberately flawed test
// fixture, not product code: the harness spec expects every probe to fail on it.

/** FP-PREC-02: binary float and Math.round instead of decimal rounding. */
export function discountFor(amount, ratePercent) {
  return { discount: Math.round(amount * ratePercent) / 100 };
}

/** FP-PREC-01: packed quantities as binary floats, compared strictly. */
export function coverage({ required, withdrawn, available }) {
  const open = required - withdrawn;
  return { status: available >= open ? 'COVERED' : 'SHORTAGE', open };
}

/** FP-RUN-02: ids from the millisecond clock; a second run replaces the first. */
export class RunStore {
  runs = new Map();

  simulate(input) {
    const runId = `RUN-${Date.now()}`;
    const result = { input, total: (input.amounts ?? []).reduce((s, a) => s + a, 0) };
    this.runs.set(runId, result);
    return { runId, result };
  }

  get(runId) {
    return this.runs.get(runId);
  }
}

const ITEMS = [
  { order: '4711', customer: 'C1', amount: 100 },
  { order: '4712', customer: 'C2', amount: 250 },
  { order: '4713', customer: 'C1', amount: 40 },
];

/** FP-GUARD-04: no selection reads everything and reports success. */
export function select(selection) {
  const orgs = selection?.orgs ?? [];
  return { status: 'OK', items: orgs.length ? ITEMS.slice() : ITEMS.slice() };
}

/** FP-GUARD-03: parseInt accepts '2026x' and truncates '1.9'. */
export function parseYear(value) {
  const year = parseInt(value, 10);
  if (Number.isNaN(year)) return { ok: false, error: 'not a number' };
  return { ok: true, year };
}

/** FP-CSV-01: fields wrapped in quotes, embedded quotes not doubled, no formula guard. */
export function toCsv(rows) {
  const header = ['order', 'material', 'text', 'note'];
  return [header.join(';'), ...rows.map((r) => header.map((h) => `"${r[h] ?? ''}"`).join(';'))].join('\n');
}

/** FP-SCOPE-01: the list honours the customer filter, totals and export do not. */
export function listItems({ customer } = {}) {
  const items = customer ? ITEMS.filter((i) => i.customer === customer) : ITEMS.slice();
  return { items, total: ITEMS.reduce((s, i) => s + i.amount, 0) };
}

export function exportItems() {
  return toCsv(ITEMS.map((i) => ({ order: i.order, material: i.customer, text: '', note: String(i.amount) })));
}

/** FP-MEAN-05: recomputes from a default rate instead of adding to the existing value. */
export function recalculate(rows, surcharge = 10, rate = 5) {
  return rows.map((r) => ({ ...r, discount: Math.round(r.amount * rate) / 100 + surcharge }));
}

/** FP-GUARD-05 and FP-CLAIM-01: any value accepted, and an API call claimed that never happens. */
export class S4HanaSalesOrderAdapter {
  orders = new Map([['4711', { status: 'P', netValue: 100 }]]);

  setNetValue(order, value) {
    const o = this.orders.get(order) ?? { status: 'N', netValue: 0 };
    o.netValue = value;
    this.orders.set(order, o);
    return { success: true, message: 'Successfully updated item via standard OData PATCH API_SALES_ORDER_SRV' };
  }
}
