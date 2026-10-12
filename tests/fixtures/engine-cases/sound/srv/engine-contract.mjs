// Hand-written fixture: a CO-shaped allocation that keeps the original's
// contract — strict input, packed decimals in BigInt, commercial rounding,
// the checks with their rule ids, collision-free run ids. Never generated.
import { randomUUID } from 'node:crypto';

const runs = new Map();

export const CONTRACT = {
  version: 1,
  baseRequest: {
    controllingArea: '1000',
    fiscalYear: '2026',
    sender: 'C100',
    amount: '1000.00',
    // valid on its own, and still valid with a copy of its first record appended (quota 0)
    receivers: [
      { kostl: 'C200', quota: '0.000000', amount: '0.00' },
      { kostl: 'C300', quota: '100.000000', amount: '0.00' },
    ],
  },
  fields: {
    P_KOKRS: 'controllingArea',
    P_GJAHR: 'fiscalYear',
    P_SENDER: 'sender',
    P_AMOUNT: 'amount',
    GT_RECEIVERS: 'receivers',
    KOSTL: 'receivers[].kostl',
    QUOTA: 'receivers[].quota',
    AMOUNT: 'receivers[].amount',
    GV_TOTAL: null,
    GV_QUOTA_SUM: null,
    GV_COUNT: null,
  },
};

const pow10 = (n) => 10n ** BigInt(n);

function roundTo(text, places) {
  const m = /^([-+]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return null;
  const frac = m[3] ?? '';
  let v = BigInt(m[2] + frac);
  if (frac.length > places) {
    const div = pow10(frac.length - places);
    let q = v / div;
    if ((v % div) * 2n >= div) q += 1n;
    v = q;
  } else v *= pow10(places - frac.length);
  return m[1] === '-' ? -v : v;
}

function format(v, places) {
  const neg = v < 0n;
  const s = (neg ? -v : v).toString().padStart(places + 1, '0');
  const out = places ? `${s.slice(0, -places)}.${s.slice(-places)}` : s;
  return neg && v !== 0n ? `-${out}` : out;
}

/** A packed field: a decimal string (or absent), at its places, within its digits. */
function packed(value, field, digits, places, errors) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    errors.push({ field, message: `${field} is not a decimal string` });
    return undefined;
  }
  const v = roundTo(value.trim(), places);
  if (v === null) {
    errors.push({ field, message: `${field} is not a number: ${value}` });
    return undefined;
  }
  if ((v < 0n ? -v : v) > pow10(digits) - 1n) {
    errors.push({ field, message: `${field} is too large for P(${digits},${places})` });
    return undefined;
  }
  return format(v, places);
}

export function validate(request) {
  const errors = [];
  const r = request ?? {};
  if (typeof r.controllingArea !== 'string' || !r.controllingArea) errors.push({ field: 'controllingArea', message: 'controlling area is required' });
  if (r.fiscalYear !== undefined && r.fiscalYear !== null && !(typeof r.fiscalYear === 'string' && /^\d{4}$/.test(r.fiscalYear))) {
    errors.push({ field: 'fiscalYear', message: 'fiscal year must be four digits' });
  }
  const amount = packed(r.amount, 'amount', 15, 2, errors);
  const receivers = [];
  if (r.receivers !== undefined && !Array.isArray(r.receivers)) errors.push({ field: 'receivers', message: 'receivers must be a list' });
  for (const [i, rec] of (Array.isArray(r.receivers) ? r.receivers : []).entries()) {
    receivers.push({
      kostl: typeof rec?.kostl === 'string' ? rec.kostl : '',
      quota: packed(rec?.quota, `receivers[${i}].quota`, 13, 6, errors),
      amount: packed(rec?.amount, `receivers[${i}].amount`, 15, 2, errors),
    });
  }
  const normalized = { controllingArea: r.controllingArea, fiscalYear: r.fiscalYear ?? null, sender: r.sender ?? null, amount, receivers };
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], normalized };
}

export function simulate(request) {
  const checked = validate(request);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const req = checked.normalized;
  if (req.receivers.length === 0) return { ok: false, errors: [{ rule: 'L18', field: 'receivers', message: 'no receivers' }] };
  const quotaSum = req.receivers.reduce((s, x) => s + roundTo(x.quota ?? '0', 6), 0n);
  if (quotaSum > roundTo('100', 6)) return { ok: false, errors: [{ rule: 'BR-001', field: 'quota', message: 'quota over 100 %' }] };
  const lines = [];
  for (const rec of req.receivers) {
    if (rec.kostl === req.sender) continue; // L30: the sender is not its own receiver
    const value = roundTo(req.amount ?? '0', 2) * roundTo(rec.quota ?? '0', 6);
    // amount (2 places) × quota (6 places) / 100 → back to 2 places, commercially
    const scaled = value; // 8 places
    const div = pow10(6) * 100n;
    let q = (scaled < 0n ? -scaled : scaled) / div;
    if (((scaled < 0n ? -scaled : scaled) % div) * 2n >= div) q += 1n;
    lines.push({ kostl: rec.kostl, amount: format(scaled < 0n ? -q : q, 2) });
  }
  const runId = randomUUID();
  const run = Object.freeze({ runId, selection: structuredClone(request), lines });
  runs.set(runId, run);
  return { ok: true, runId, records: lines.length, result: run };
}

export function getRun(runId) {
  return runs.get(runId) ?? null;
}
