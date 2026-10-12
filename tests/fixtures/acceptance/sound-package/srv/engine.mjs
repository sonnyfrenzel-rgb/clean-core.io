// Fixture for tests/acceptance-harness.spec.ts: a hand-written engine that
// avoids every failure pattern the harness probes. Not product code.
import crypto from 'node:crypto';

const CENT = 100n;

function toUnits(value, places) {
  const s = typeof value === 'number' ? value.toFixed(places + 3) : String(value);
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`not a decimal: ${value}`);
  const neg = s.startsWith('-');
  const [int, frac = ''] = s.replace('-', '').split('.');
  const scaled = BigInt(int + frac.padEnd(places + 3, '0').slice(0, places + 3));
  return { scaled: neg ? -scaled : scaled, scale: 10n ** BigInt(places + 3) };
}

function roundHalfAway(num, den) {
  const neg = (num < 0n) !== (den < 0n);
  const a = num < 0n ? -num : num;
  const b = den < 0n ? -den : den;
  const q = (2n * a + b) / (2n * b);
  return neg ? -q : q;
}

/** Discount = amount x rate %, packed decimal with two places, half away from zero. */
export function discountFor(amount, ratePercent) {
  const a = toUnits(amount, 2);
  const r = toUnits(ratePercent, 2);
  const cents = roundHalfAway(a.scaled * r.scaled * CENT, a.scale * r.scale * 100n);
  return { discount: Number(cents) / 100 };
}

/** Quantities in thousandths, as the original's packed fields with three places. */
export function coverage({ required, withdrawn, available }) {
  const milli = (q) => {
    const u = toUnits(q, 3);
    return roundHalfAway(u.scaled * 1000n, u.scale);
  };
  const open = milli(required) - milli(withdrawn);
  return { status: milli(available) >= open ? 'COVERED' : 'SHORTAGE', openMilli: Number(open) };
}

export class RunStore {
  #runs = new Map();

  simulate(input) {
    const runId = crypto.randomUUID();
    const result = { input: structuredClone(input), total: (input.amounts ?? []).reduce((s, a) => s + a, 0) };
    if (this.#runs.has(runId)) throw new Error('run id exists');
    this.#runs.set(runId, Object.freeze(result));
    return { runId, result };
  }

  get(runId) {
    if (!this.#runs.has(runId)) throw new Error(`unknown run ${runId}`);
    return this.#runs.get(runId);
  }
}

const ITEMS = [
  { order: '4711', customer: 'C1', amount: 100 },
  { order: '4712', customer: 'C2', amount: 250 },
  { order: '4713', customer: 'C1', amount: 40 },
];

export function select(selection) {
  if (!selection || !Array.isArray(selection.orgs) || selection.orgs.length === 0) {
    return { status: 'EMPTY_SELECTION', items: [] };
  }
  return { status: 'OK', items: ITEMS.slice() };
}

export function parseYear(value) {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) return { ok: false, error: 'year must be four digits' };
  return { ok: true, year: Number(value) };
}

function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  const header = ['order', 'material', 'text', 'note'];
  return [header.join(';'), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(';'))].join('\r\n');
}

export function listItems({ customer } = {}) {
  const items = customer ? ITEMS.filter((i) => i.customer === customer) : ITEMS.slice();
  return { items, total: items.reduce((s, i) => s + i.amount, 0) };
}

export function exportItems({ customer } = {}) {
  return toCsv(listItems({ customer }).items.map((i) => ({ order: i.order, material: i.customer, text: '', note: String(i.amount) })));
}

/** The original adds the surcharge to the discount already on the row. */
export function recalculate(rows, surcharge = 10) {
  const cents = (v) => {
    const u = toUnits(v, 2);
    return roundHalfAway(u.scaled * CENT, u.scale);
  };
  return rows.map((r) => ({ ...r, discount: Number(cents(r.discount) + cents(surcharge)) / 100 }));
}

export class InMemorySalesOrders {
  #orders = new Map([['4711', { status: 'P', netValue: 100 }]]);

  setNetValue(order, value) {
    const o = this.#orders.get(order);
    if (!o) throw new Error('unknown order');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('net value must be a finite non-negative amount');
    if (o.status !== 'P') throw new Error('only orders in status P may change');
    o.netValue = value;
    return { success: true, message: 'net value changed in the in-memory mock' };
  }
}
