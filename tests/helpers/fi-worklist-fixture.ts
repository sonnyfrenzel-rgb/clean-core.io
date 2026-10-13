/**
 * A generated service shaped like the reviewed package of the FI case
 * (external review 11.10.2026, F-01/F-02) — compact, with the same numbers:
 * 15 open items worth 7,135 EUR, of which customer 0000100001 holds 9 worth
 * 4,780 EUR; and the same two defects:
 *
 *   - F-01: the credit reference is looked up as a fixed demo document,
 *     `filteredItems.find(i => i.belnr === '1900000001')`;
 *   - F-02: `WorklistItems` reads the customer filter `kunnr`,
 *     `CustomerAgingTotals` and `ExportWorklistFile` do not.
 *
 * `FIXED_SERVICE` is the same service with one validated selection shared by
 * all three endpoints and the reference looked up per item with its full key
 * and customer. Source text only: it runs in the sandbox, never in the spec's
 * own process, so it is a string here and not a module the type check reads.
 */

const ITEMS = `
const ITEMS: Item[] = [
  { bukrs: '1000', kunnr: '0000100001', belnr: '1900000001', gjahr: '2026', buzei: '001', amount_lc: 1000, amount_dc: 1000, zfbdt: '2026-08-01', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100001', belnr: '1900000002', gjahr: '2026', buzei: '001', amount_lc: 500, amount_dc: 500, zfbdt: '2026-08-15', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100001', belnr: '1900000003', gjahr: '2026', buzei: '001', amount_lc: 750, amount_dc: 750, zfbdt: '2026-10-20', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100001', belnr: '1900000004', gjahr: '2026', buzei: '001', amount_lc: 300, amount_dc: 300, zfbdt: '2026-06-01', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100001', belnr: '1900000005', gjahr: '2026', buzei: '001', amount_lc: 1200, amount_dc: 1200, zfbdt: '2026-07-01', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100001', belnr: '1900000006', gjahr: '2026', buzei: '001', amount_lc: 400, amount_dc: 400, zfbdt: '2026-05-01', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100001', belnr: '1900000007', gjahr: '2026', buzei: '001', amount_lc: 250, amount_dc: 250, zfbdt: '', zbd3t: 0, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100001', belnr: '1900000008', gjahr: '2026', buzei: '001', amount_lc: 180, amount_dc: 180, zfbdt: '2026-09-20', zbd3t: 14, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100001', belnr: '1900000009', gjahr: '2026', buzei: '001', amount_lc: 200, amount_dc: 200, zfbdt: '2026-09-01', zbd3t: 10, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100002', belnr: '1900000010', gjahr: '2026', buzei: '001', amount_lc: 900, amount_dc: 900, zfbdt: '2026-08-20', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100002', belnr: '1900000011', gjahr: '2026', buzei: '001', amount_lc: 600, amount_dc: 600, zfbdt: '2026-09-25', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100003', belnr: '1900000012', gjahr: '2026', buzei: '001', amount_lc: 500, amount_dc: 500, zfbdt: '2026-07-15', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100003', belnr: '1900000013', gjahr: '2026', buzei: '001', amount_lc: 300, amount_dc: 300, zfbdt: '2026-04-01', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100003', belnr: '1900000014', gjahr: '2026', buzei: '001', amount_lc: 80, amount_dc: 80, zfbdt: '2026-09-28', zbd3t: 30, rebzg: '' },
  { bukrs: '1000', kunnr: '0000100003', belnr: '1900000018', gjahr: '2026', buzei: '001', amount_lc: -25, amount_dc: -25, zfbdt: '', zbd3t: 0, rebzg: '1999999999', rebzj: '2026', rebzz: '001' },
];
`;

const ENGINE = `
export interface Item {
  bukrs: string; kunnr: string; belnr: string; gjahr: string; buzei: string;
  amount_lc: number; amount_dc: number; zfbdt: string; zbd3t: number;
  rebzg: string; rebzj?: string; rebzz?: string;
  netdt?: string | null; bucket?: string; days_late?: number;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function bucketOf(netdt: string | null, keyDate: string): { bucket: string; daysLate: number } {
  if (!netdt) return { bucket: 'UNKNOWN', daysLate: 0 };
  const late = Math.floor((Date.parse(keyDate) - Date.parse(netdt)) / 86400000);
  if (late <= 0) return { bucket: 'NOT_DUE', daysLate: late };
  if (late <= 30) return { bucket: '01-30', daysLate: late };
  if (late <= 60) return { bucket: '31-60', daysLate: late };
  if (late <= 90) return { bucket: '61-90', daysLate: late };
  return { bucket: '91+', daysLate: late };
}
`;

const REVIEWED_LOGIC = `
export function dueDate(item: Item, reference?: Item): string | null {
  if (item.amount_lc < 0 && item.rebzg && item.rebzg !== 'V' && reference) {
    return reference.zfbdt ? addDays(reference.zfbdt, reference.zbd3t) : null;
  }
  return item.zfbdt ? addDays(item.zfbdt, item.zbd3t) : null;
}

export interface Selection { companyCode: string; keyDate: string; customers?: string[] }

export function worklist(sel: Selection): Item[] {
  const out: Item[] = [];
  for (const item of ITEMS) {
    if (item.bukrs !== sel.companyCode) continue;
    if (sel.customers && sel.customers.length > 0 && !sel.customers.includes(item.kunnr)) continue;
    out.push({ ...item });
  }
  const referenceItem01 = out.find(i => i.belnr === '1900000001');
  for (const item of out) {
    item.netdt = dueDate(item, referenceItem01);
    const b = bucketOf(item.netdt, sel.keyDate);
    item.bucket = b.bucket;
    item.days_late = b.daysLate;
  }
  return out;
}

export function totals(items: Item[]) {
  const byCustomer = new Map<string, { kunnr: string; items: number; net_lc: number }>();
  let total = 0;
  for (const i of items) {
    const row = byCustomer.get(i.kunnr) ?? { kunnr: i.kunnr, items: 0, net_lc: 0 };
    row.items += 1;
    row.net_lc = Math.round((row.net_lc + i.amount_lc) * 100) / 100;
    byCustomer.set(i.kunnr, row);
    total = Math.round((total + i.amount_lc) * 100) / 100;
  }
  return { value: [...byCustomer.values()], totalSignedAmount: total };
}

export function csv(items: Item[]): string {
  const lines = ['Company;Customer;Document;SignedLocalAmount;Bucket'];
  for (const i of items) lines.push([i.bukrs, i.kunnr, i.belnr, i.amount_lc.toFixed(2), i.bucket].join(';'));
  return lines.join('\\n');
}
`;

const REVIEWED_ROUTES = `
export function createCollectionsApp() {
  const app = express();
  app.use(express.json());

  app.get('/odata/v4/collections/WorklistItems', (req: Request, res: Response) => {
    const companyCode = (req.query.companyCode as string) || '1000';
    const keyDate = (req.query.keyDate as string) || '2026-10-11';
    const customers = req.query.kunnr ? (req.query.kunnr as string).split(',') : undefined;
    const items = worklist({ companyCode, keyDate, customers });
    res.json({ value: items, '@odata.count': items.length });
  });

  app.get('/odata/v4/collections/CustomerAgingTotals', (req: Request, res: Response) => {
    const companyCode = (req.query.companyCode as string) || '1000';
    const keyDate = (req.query.keyDate as string) || '2026-10-11';
    res.json(totals(worklist({ companyCode, keyDate })));
  });

  app.post('/odata/v4/collections/ExportWorklistFile', (req: Request, res: Response) => {
    const { companyCode = '1000', keyDate = '2026-10-11' } = req.body;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(200).send(csv(worklist({ companyCode, keyDate })));
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createCollectionsApp().listen(8080);
}
`;

const FIXED_LOGIC = REVIEWED_LOGIC
  .replace(
    `  if (item.amount_lc < 0 && item.rebzg && item.rebzg !== 'V' && reference) {`,
    `  if (item.amount_lc < 0 && item.rebzg && item.rebzg !== 'V' && reference && reference.kunnr === item.kunnr) {`,
  )
  .replace(
    `  const referenceItem01 = out.find(i => i.belnr === '1900000001');
  for (const item of out) {
    item.netdt = dueDate(item, referenceItem01);`,
    `  for (const item of out) {
    const reference = ITEMS.find(r => r.bukrs === item.bukrs && r.belnr === item.rebzg && r.gjahr === item.rebzj && r.buzei === item.rebzz && r.kunnr === item.kunnr);
    item.netdt = dueDate(item, reference);`,
  );

const FIXED_ROUTES = `
/** One validated selection for every endpoint that answers for it. */
export function selectionFrom(source: Record<string, unknown>): Selection {
  const companyCode = typeof source.companyCode === 'string' && source.companyCode ? source.companyCode : '1000';
  const keyDate = typeof source.keyDate === 'string' && source.keyDate ? source.keyDate : '2026-10-11';
  const raw = typeof source.kunnr === 'string' ? source.kunnr : '';
  const customers = raw ? raw.split(',') : undefined;
  return { companyCode, keyDate, customers };
}

export function createCollectionsApp() {
  const app = express();
  app.use(express.json());

  app.get('/odata/v4/collections/WorklistItems', (req: Request, res: Response) => {
    const items = worklist(selectionFrom(req.query as Record<string, unknown>));
    res.json({ value: items, '@odata.count': items.length });
  });

  app.get('/odata/v4/collections/CustomerAgingTotals', (req: Request, res: Response) => {
    res.json(totals(worklist(selectionFrom(req.query as Record<string, unknown>))));
  });

  app.post('/odata/v4/collections/ExportWorklistFile', (req: Request, res: Response) => {
    const sel = selectionFrom(req.body as Record<string, unknown>);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(200).send(csv(worklist(sel)));
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createCollectionsApp().listen(8080);
}
`;

const HEADER = `import express, { Request, Response } from 'express';
`;

export const REVIEWED_SERVICE = HEADER + ENGINE + ITEMS + REVIEWED_LOGIC + REVIEWED_ROUTES;
export const FIXED_SERVICE = HEADER + ENGINE + ITEMS + FIXED_LOGIC + FIXED_ROUTES;

/** The package as `generatedCode` stores it. */
export function packageOf(service: string): string {
  return JSON.stringify([
    { path: 'srv/service.ts', content: service },
    { path: 'package.json', content: '{ "name": "fi-case", "dependencies": { "express": "^4.19.2" } }' },
  ]);
}

/**
 * A suite like the ten the reviewed package shipped: it checks the code
 * against itself (the buckets add up to the total), never against the
 * original — and it passes on the reviewed service.
 */
export const SELF_CONSISTENT_SUITE = `import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { worklist, totals, bucketOf, addDays } from './srv/service';

test('TC_01: totals add up to the sum of the items', () => {
  const items = worklist({ companyCode: '1000', keyDate: '2026-10-11' });
  const t = totals(items);
  assert.equal(t.totalSignedAmount, items.reduce((s, i) => s + i.amount_lc, 0));
});

test('TC_02: every item gets a bucket', () => {
  const items = worklist({ companyCode: '1000', keyDate: '2026-10-11' });
  assert.ok(items.every((i) => typeof i.bucket === 'string'));
});

test('TC_03: a date without a due date is UNKNOWN', () => {
  assert.equal(bucketOf(null, '2026-10-11').bucket, 'UNKNOWN');
});

test('TC_04: adding days', () => {
  assert.equal(addDays('2026-01-30', 2), '2026-02-01');
});
`;

/**
 * A rule-traced case of the kind 3.0.10 asks for, written from the original:
 * BR-009 — a credit whose reference is not an item of the same customer keeps
 * its own posted terms, and without a baseline date its due date stays
 * unknown (document 1900000018, customer 0000100003).
 */
export const RULE_TRACED_SUITE = SELF_CONSISTENT_SUITE + `
test('TC_05: BR-009 credit 1900000018 with a foreign reference stays UNKNOWN', () => {
  const items = worklist({ companyCode: '1000', keyDate: '2026-10-11' });
  const credit = items.find((i) => i.belnr === '1900000018')!;
  assert.equal(credit.netdt, null);
  assert.equal(credit.bucket, 'UNKNOWN');
});
`;
