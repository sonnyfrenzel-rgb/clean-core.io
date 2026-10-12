// Hand-written fixture: the same CO-shaped allocation with the defects the
// external reviews found — parseFloat, Math.round, no bound, no sender check,
// an empty request answered as success, run ids from the clock and one global
// "latest result". Never generated.
let latest = null;

export const CONTRACT = {
  version: 1,
  baseRequest: {
    controllingArea: '1000',
    fiscalYear: '2026',
    sender: 'C100',
    amount: '1000.00',
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

export function validate(request) {
  const r = request ?? {};
  const normalized = {
    controllingArea: r.controllingArea,
    fiscalYear: parseInt(r.fiscalYear, 10),
    sender: r.sender,
    amount: Math.round(parseFloat(r.amount ?? 0) * 100) / 100,
    receivers: (r.receivers ?? []).map((x) => ({ kostl: x.kostl, quota: parseFloat(x.quota), amount: Math.round(parseFloat(x.amount) * 100) / 100 })),
  };
  return { ok: true, errors: [], normalized };
}

export function simulate(request) {
  const req = validate(request).normalized;
  const sum = req.receivers.reduce((s, x) => s + x.quota, 0);
  if (sum > 100) return { ok: false, errors: [{ message: 'quota over 100' }] };
  const lines = req.receivers.map((x) => ({ kostl: x.kostl, amount: (req.amount * x.quota) / 100 }));
  latest = { runId: `RUN-${Date.now()}`, lines };
  return { ok: true, runId: latest.runId, records: lines.length };
}

export function getRun() {
  return latest;
}

export function compute(field, a, op, b) {
  const x = parseFloat(a);
  const y = parseFloat(b);
  const r = op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : x / y;
  return String(r);
}
