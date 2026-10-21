import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  generatedCodeLints,
  lintCountLine,
  lintSeverityCounts,
  packedDecimalFields,
  type GeneratedCodeLintFinding,
  type LintId,
} from '../lib/generated-code-lints';
import { codeChecksLines } from '../lib/delivery-package';

/**
 * 3.0.12, part B — deterministic checks over the generated package's code.
 *
 * The CO, PP and SD reviews of packages built by 3.0.10 (12.10.2026) found the same
 * classes of error in what the model wrote. Each check has a small hand-written
 * positive and negative fixture here, and three fixtures modelled on the
 * reviewed packages' patterns. All fixtures are written for this spec; none of
 * the reviewed packages' code is in this repository.
 *
 * Server-free: no browser, no emulator, no dev server.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const one = (content: string, file = 'srv/service.ts') => [{ path: file, content }];
const ids = (f: GeneratedCodeLintFinding[]) => f.map((x) => x.id);
const of = (f: GeneratedCodeLintFinding[], id: LintId) => f.filter((x) => x.id === id);

/* ------------------------------------------------------ 1. number parsing */

test.describe('1. lenient number parsing of request input (P0)', () => {
  test('parseInt, parseFloat, Number() and unary + on request input without a check are flagged', () => {
    const src = [
      "import express from 'express';",
      'const app = express();',
      "app.get('/a', (req, res) => {",
      '  const year = parseInt(String(req.query.year), 10);',
      '  const rate = parseFloat(req.body.rate);',
      '  const limit = Number(req.query.limit);',
      '  const depth = +req.query.depth;',
      '  res.json({ year, rate, limit, depth });',
      '});',
    ].join('\n');
    const f = of(generatedCodeLints(one(src)), 'lenient-number-parsing');
    expect(f.map((x) => x.line)).toEqual([4, 5, 6, 7]);
    expect(f.every((x) => x.severity === 'P0')).toBe(true);
    expect(f[0].message).toContain('"year"');
    expect(f[0].message).toContain('"2026x" parses as 2026');
  });

  test('a value reached through a selection function called with req.query is request input too', () => {
    const src = [
      'export function readSelection(source: Record<string, unknown>) {',
      '  const threshold = Number(source.threshold);',
      '  if (isNaN(threshold)) return { threshold: 0 };',
      '  return { threshold };',
      '}',
      "app.get('/x', (req, res) => res.json(readSelection(req.query)));",
    ].join('\n');
    // isNaN alone lets Infinity and "" (→ 0) through: still flagged.
    expect(of(generatedCodeLints(one(src)), 'lenient-number-parsing').map((x) => x.line)).toEqual([2]);
  });

  test('a finiteness or format check, or input that is not from the request, is not flagged', () => {
    const src = [
      "app.get('/a', (req, res) => {",
      '  const year = parseInt(String(req.query.year), 10);',
      '  if (!Number.isInteger(year) || !/^\\d{4}$/.test(String(req.query.year))) return res.status(400).end();',
      '  const rate = Number(req.body.rate);',
      '  if (!Number.isFinite(rate)) return res.status(400).end();',
      "  const d = parseInt('20261012'.slice(0, 4), 10);",
      '  res.json({ year, rate, d });',
      '});',
      "// parseInt(req.query.x) in a comment is not code",
      "const msg = 'Number(req.query.limit)';",
    ].join('\n');
    expect(of(generatedCodeLints(one(src)), 'lenient-number-parsing')).toEqual([]);
  });
});

/* ------------------------------------------ 2. global mutable "latest result" */

test.describe('2. global mutable "latest result" (P0)', () => {
  test('a module-level let written by one handler and read by another is flagged', () => {
    const src = [
      "import express from 'express';",
      'const app = express();',
      'let latestResult: { total: number } | null = null;',
      "app.post('/simulate', (req, res) => { latestResult = { total: 1 }; res.json(latestResult); });",
      "app.get('/export', (_req, res) => res.json(latestResult));",
    ].join('\n');
    const f = of(generatedCodeLints(one(src)), 'global-mutable-result');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ line: 3, severity: 'P0' });
    expect(f[0].message).toContain('"latestResult"');
  });

  test('state local to a handler, or a constant read by many, is not flagged', () => {
    const src = [
      "import express from 'express';",
      'const app = express();',
      'const RATES = [1, 2, 3];',
      'let started = Date.UTC(2026, 0, 1);',
      "app.post('/simulate', (req, res) => { let latest = { total: RATES[0] }; latest = { total: 2 }; res.json(latest); });",
      "app.get('/rates', (_req, res) => res.json({ RATES, started }));",
    ].join('\n');
    expect(of(generatedCodeLints(one(src)), 'global-mutable-result')).toEqual([]);
  });
});

/* ---------------------------------------------------------------- 3. run ids */

test.describe('3. run ids from the clock or Math.random, and runs overwritten (P0)', () => {
  test('Date.now(), new Date().getTime() and Math.random() alone as an id are flagged; Map.set without has is flagged', () => {
    const src = [
      'export const runs = new Map<string, object>();',
      'export function start() {',
      '  const runId = `RUN-${Date.now()}`;',
      '  const jobId = new Date().getTime();',
      '  const key = Math.random().toString(36);',
      '  runs.set(runId, { jobId, key });',
      '}',
    ].join('\n');
    const f = generatedCodeLints(one(src));
    expect(of(f, 'weak-run-id').map((x) => x.line)).toEqual([3, 4, 5]);
    expect(of(f, 'run-overwrite').map((x) => x.line)).toEqual([6]);
  });

  test('a UUID, a timestamp field that is not an id, and a guarded set are not flagged', () => {
    const src = [
      "import { randomUUID } from 'node:crypto';",
      'export const runs = new Map<string, object>();',
      'export function start() {',
      '  const runId = randomUUID();',
      '  const startedAt = Date.now();',
      "  if (runs.has(runId)) throw new Error('run id taken');",
      '  runs.set(runId, { startedAt });',
      '}',
    ].join('\n');
    const f = generatedCodeLints(one(src));
    expect(of(f, 'weak-run-id')).toEqual([]);
    expect(of(f, 'run-overwrite')).toEqual([]);
  });
});

/* ------------------------------------------- 4. floating point on decimals */

test.describe('4. binary floating point on packed quantities and amounts (P1)', () => {
  test('+ - * / and toFixed on quantity and amount names are flagged', () => {
    const src = [
      'export function net(item: { quantity: number; netwr: number }, withdrawn: number) {',
      '  const open = item.quantity - withdrawn;',
      '  const value = item.netwr * 0.05;',
      '  return value.toFixed(2) + item.netwr.toFixed(2);',
      '}',
    ].join('\n');
    const f = of(generatedCodeLints(one(src)), 'float-decimal-arithmetic');
    expect(f.map((x) => x.line)).toEqual([2, 3, 4]);
    expect(f.every((x) => x.severity === 'P1')).toBe(true);
  });

  test('names declared as packed decimals in the original are checked too', () => {
    const src = 'export const share = (ratio: number, base: number) => ratio * base;\n';
    expect(of(generatedCodeLints(one(src)), 'float-decimal-arithmetic')).toEqual([]);
    const decimalFields = packedDecimalFields('DATA lv_ratio TYPE p LENGTH 8 DECIMALS 6.\nDATA lv_text TYPE string.');
    expect(decimalFields).toEqual(['lv_ratio']);
    expect(of(generatedCodeLints(one(src), { decimalFields }), 'float-decimal-arithmetic').map((x) => x.line)).toEqual([1]);
  });

  test('comparisons, string concatenation, declarations and a decimal library are not flagged', () => {
    const src = [
      "import Decimal from 'decimal.js';",
      'export interface Line { quantity: number; amount: number }',
      'export function check(l: Line) {',
      '  if (l.quantity > 10 && l.amount <= 0) return false;',
      "  const label = 'Quantity: ' + l.quantity;",
      '  const exact = new Decimal(l.amount).times(l.quantity);',
      '  return { label, exact };',
      '}',
    ].join('\n');
    expect(of(generatedCodeLints(one(src)), 'float-decimal-arithmetic')).toEqual([]);
  });

  test('packedDecimalFields reads TYPE p and DDIC quantity/amount fields, not comments', () => {
    const abap = [
      'DATA: gv_total TYPE p DECIMALS 2,',
      '      lv_qty TYPE menge_d,',
      '      ls_name TYPE kna1-name1.',
      'TYPES: BEGIN OF ty_item,',
      '         zmeng TYPE vbap-zmeng,',
      '         netwr TYPE vbap-netwr,',
      '       END OF ty_item.',
      '* lv_comment TYPE p',
    ].join('\n');
    expect(packedDecimalFields(abap)).toEqual(['gv_total', 'lv_qty', 'netwr', 'zmeng']);
    expect(packedDecimalFields(null)).toEqual([]);
  });
});

/* -------------------------------------------------------------------- 5. CSV */

test.describe('5. CSV without escaping or formula guard (P1)', () => {
  test("a row joined with ',' or ';', or a quoted template row, is flagged", () => {
    const src = [
      'export function toCsv(rows: Array<{ a: string; b: string }>): string {',
      "  const out = rows.map((r) => [r.a, r.b].join(','));",
      '  for (const r of rows) out.push(`"${r.a}";"${r.b}"`);',
      "  return out.join('\\n');",
      '}',
    ].join('\n');
    const f = of(generatedCodeLints(one(src)), 'csv-unescaped');
    expect(f.map((x) => x.line)).toEqual([2, 3]);
    expect(f[0].message).toContain('quotes inside a value are not doubled');
    expect(f[0].message).toContain('values starting with =, +, - or @ are not neutralised');
  });

  test('quote doubling plus a formula guard is not flagged; a join outside CSV code is not flagged', () => {
    const src = [
      'const cell = (v: string) => {',
      "  const safe = /^[=+\\-@]/.test(v) ? `'${v}` : v;",
      '  return `"${safe.replace(/"/g, \'""\')}"`;',
      '};',
      'export function toCsv(rows: string[][]): string {',
      "  return rows.map((r) => r.map(cell).join(',')).join('\\n');",
      '}',
    ].join('\n');
    expect(of(generatedCodeLints(one(src)), 'csv-unescaped')).toEqual([]);
    const other = "export const label = (parts: string[]) => parts.join(',');\n";
    expect(of(generatedCodeLints(one(other)), 'csv-unescaped')).toEqual([]);
  });
});

/* ----------------------------------------------------- 6. start on import */

test.describe('6. a server started on import (P1)', () => {
  test('listen at module level in a module that exports, also behind a NODE_ENV guard, is flagged', () => {
    const plain = [
      "import express from 'express';",
      'export const app = express();',
      'app.listen(8080);',
    ].join('\n');
    expect(of(generatedCodeLints(one(plain)), 'start-on-import').map((x) => x.line)).toEqual([3]);
    const envGuard = [
      "import { createServer } from 'node:http';",
      'export function handler() {}',
      "if (process.env.NODE_ENV !== 'test') {",
      '  createServer(handler).listen(8080);',
      '}',
    ].join('\n');
    const f = of(generatedCodeLints(one(envGuard)), 'start-on-import');
    expect(f.map((x) => x.line)).toEqual([4]);
    expect(f[0].message).toContain("process.env.NODE_ENV !== 'test'");
  });

  test('require.main guard, listen inside a function, or a start file that exports nothing is not flagged', () => {
    const guarded = [
      "import express from 'express';",
      'export const app = express();',
      'export function start(port: number) { return app.listen(port); }',
      'if (require.main === module) {',
      '  app.listen(8080);',
      '}',
    ].join('\n');
    expect(of(generatedCodeLints(one(guarded)), 'start-on-import')).toEqual([]);
    const startFile = "import { app } from './app';\napp.listen(Number(process.env.PORT) || 8080);\n";
    expect(of(generatedCodeLints(one(startFile, 'srv/server.ts')), 'start-on-import')).toEqual([]);
  });
});

/* ------------------------------------------------ 7. claimed integration */

test.describe('7. claimed SAP integration without a call, and events in SAP\'s namespace', () => {
  test('a class named after S/4HANA and an "updated via OData PATCH" message without any HTTP call are P0', () => {
    const src = [
      'export class S4HanaBillingAdapter {',
      '  private rows: Array<{ id: string; value: number }> = [];',
      '  async update(id: string, value: number) {',
      '    const row = this.rows.find((r) => r.id === id);',
      "    if (!row) return { ok: false, message: 'not found' };",
      '    row.value = value;',
      "    return { ok: true, message: 'Successfully updated billing document via OData PATCH API_BILLING_DOCUMENT_SRV' };",
      '  }',
      '}',
    ].join('\n');
    const f = of(generatedCodeLints(one(src)), 'claimed-integration');
    expect(f.map((x) => [x.line, x.severity])).toEqual([[1, 'P0'], [7, 'P0']]);
  });

  test('the same names with a real HTTP call, or OData only as the exposed path, are not flagged', () => {
    const withCall = [
      "import { executeHttpRequest } from '@sap-cloud-sdk/http-client';",
      'export class S4HanaBillingAdapter {',
      '  async update(id: string) {',
      "    await executeHttpRequest({ destinationName: 'S4' }, { method: 'patch', url: `/sap/opu/odata/sap/API_BILLING_DOCUMENT_SRV/A_BillingDocument('${id}')` });",
      "    return 'Successfully updated via OData PATCH';",
      '  }',
      '}',
    ].join('\n');
    expect(of(generatedCodeLints(one(withCall)), 'claimed-integration')).toEqual([]);
    const exposed = [
      "app.get('/odata/v4/billing/Documents', (_req, res) => res.json({ '@odata.context': '$metadata#Documents', value: [] }));",
      '// In-memory stand-in for API_BILLING_DOCUMENT_SRV — a comment, not a claim.',
      'export class InMemoryBillingStore {}',
    ].join('\n');
    expect(of(generatedCodeLints(one(exposed)), 'claimed-integration')).toEqual([]);
  });

  test("an event published in sap.s4.* is P1 — in TypeScript and in an ABAP publisher; subscribing is not", () => {
    const ts = [
      "export function publish(bus: { emit(n: string, p: object): void }) { bus.emit('sap.s4.beh.billingdocument.v1.BillingDocument.Changed.v1', {}); }",
      "export function listen(bus: { on(n: string, f: () => void): void }) { bus.on('sap.s4.beh.salesorder.v1.SalesOrder.Created.v1', () => {}); }",
    ].join('\n');
    expect(of(generatedCodeLints(one(ts)), 'sap-event-namespace').map((x) => [x.line, x.severity])).toEqual([[1, 'P1']]);
    const abap = [
      'CLASS zcl_publisher IMPLEMENTATION.',
      '* ls_payload-event_type = \'sap.s4.beh.commented.v1\'.',
      "    ls_payload-event_type = 'sap.s4.beh.billingdocument.v1.BillingDocument.Changed.v1'.",
      "    ls_payload-event_type = 'z.custom.billing.changed.v1'.",
      'ENDCLASS.',
    ].join('\n');
    expect(of(generatedCodeLints(one(abap, 'erp-triggers/zcl_publisher.clas.abap')), 'sap-event-namespace').map((x) => x.line)).toEqual([3]);
  });
});

/* --------------------------------------------------------- 8. dependencies */

test.describe('8. declared but unused dependencies (P2)', () => {
  test('a dependency nothing imports is flagged at its package.json line; imports, strings, scripts and tooling count as used', () => {
    const pkg = JSON.stringify(
      {
        name: 'x',
        scripts: { start: 'node --import tsx srv/service.ts', lint: 'eslint .' },
        dependencies: { express: '^4', pino: '^9', 'pino-pretty': '^11', passport: '^0.7', '@sap/xssec': '^3', '@sap-cloud-sdk/http-client': '^3', tsx: '^4' },
        devDependencies: { typescript: '^5', '@types/node': '^22', eslint: '^9' },
      },
      null,
      2,
    );
    const service = [
      "import express from 'express';",
      "import pino from 'pino';",
      "const log = pino({ transport: { target: 'pino-pretty' } });",
      'export const app = express();',
      'log.info("ready");',
    ].join('\n');
    const f = of(generatedCodeLints([{ path: 'package.json', content: pkg }, { path: 'srv/service.ts', content: service }]), 'unused-dependency');
    expect(f.map((x) => x.message.match(/^"([^"]+)"/)?.[1])).toEqual(['passport', '@sap/xssec', '@sap-cloud-sdk/http-client']);
    const lines = pkg.split('\n');
    expect(f[0].line).toBe(lines.findIndex((l) => l.includes('"passport"')) + 1);
    expect(f.every((x) => x.file === 'package.json' && x.severity === 'P2')).toBe(true);
  });

  test('a dependency only the test suite imports is used', () => {
    const pkg = JSON.stringify({ dependencies: { supertest: '^7' } });
    const files = [
      { path: 'package.json', content: pkg },
      { path: 'test.ts', content: "import request from 'supertest';\n" },
    ];
    expect(of(generatedCodeLints(files), 'unused-dependency')).toEqual([]);
  });

  test('SEC-2026-894: an import in a comment or a string is no use; one in code and the types directive are', () => {
    const pkg = JSON.stringify({ dependencies: { passport: '^0.7', express: '^4', '@sap/xssec': '^4', '@cap-js/cds-types': '^0.6' } });
    const service = [
      '/// <reference types="@cap-js/cds-types" />',
      "// import passport from 'passport';",
      "/* const x = require('@sap/xssec');",
      '/// <reference types="@sap/xssec" />',
      '*/',
      "const note = \"import passport from 'passport'\";",
      "import express from 'express';",
      'export const app = express();',
      'void note;',
    ].join('\n');
    const f = of(generatedCodeLints([{ path: 'package.json', content: pkg }, { path: 'srv/service.ts', content: service }]), 'unused-dependency');
    expect(f.map((x) => x.message.match(/^"([^"]+)"/)?.[1])).toEqual(['passport', '@sap/xssec']);
  });
});

/* ------------------------------------------------------ 9. ignored option */

test.describe('9. a parsed request option never read (P1)', () => {
  test('an option parsed and passed on but never read is flagged; one that is read is not', () => {
    const src = [
      'export interface Options { plant: string; filterOrder?: string[] }',
      'export function simulate(o: Options) { return { plant: o.plant }; }',
      "app.post('/simulate', (req, res) => {",
      "  const plant = String(req.body?.plant ?? '1000');",
      '  const filterOrder = req.body?.filterOrder ? [req.body.filterOrder] : undefined;',
      '  const options = { plant, filterOrder };',
      '  res.json(simulate(options));',
      '});',
    ].join('\n');
    const f = of(generatedCodeLints(one(src)), 'ignored-option');
    expect(f.map((x) => [x.line, x.severity])).toEqual([[5, 'P1']]);
    expect(f[0].message).toContain('"filterOrder"');
  });

  test('an option parsed and never used at all is flagged; an option applied is not', () => {
    const src = [
      "app.get('/list', (req, res) => {",
      '  const status = req.query.status;',
      '  const customer = req.query.customer;',
      '  res.json(rows.filter((r) => r.customer === customer));',
      '});',
    ].join('\n');
    expect(of(generatedCodeLints(one(src)), 'ignored-option').map((x) => x.line)).toEqual([2]);
  });
});

/* ------------------------------------- fixtures modelled on reviewed packages */

/**
 * The SD pattern: an in-memory adapter named after S/4HANA answering
 * "Successfully updated … via OData PATCH", discount arithmetic on net values,
 * a semicolon CSV, a NODE_ENV-guarded listen, and SAP-sounding dependencies
 * nothing imports.
 */
const SD_LIKE = [
  "import express from 'express';",
  'export interface OrderItem { vbeln: string; posnr: string; netwr: number; discount: number }',
  'export class S4HanaOrderAdapter {',
  '  constructor(private items: OrderItem[] = []) {}',
  '  async patchNetValue(vbeln: string, posnr: string, netwr: number) {',
  '    const item = this.items.find((i) => i.vbeln === vbeln && i.posnr === posnr);',
  "    if (!item) return { success: false, message: 'not found' };",
  '    item.netwr = netwr;',
  "    return { success: true, message: 'Successfully updated item via standard OData PATCH API_SALES_ORDER_SRV' };",
  '  }',
  '}',
  'export function discountOf(netwr: number, pct: number) { return Math.round(netwr * pct) / 100; }',
  'export function orderCsv(items: OrderItem[]) {',
  "  return items.map((i) => [i.vbeln, i.posnr, i.netwr.toFixed(2)].join(';')).join('\\n');",
  '}',
  'export const app = express();',
  "if (process.env.NODE_ENV !== 'test') app.listen(8080);",
].join('\n');

const SD_PACKAGE_JSON = JSON.stringify(
  { name: 'sd', dependencies: { express: '^4', '@sap-cloud-sdk/http-client': '^3', typeorm: '^0.3', tsx: '^4' } },
  null,
  2,
);

/** The PP pattern: parseInt on options, a Date.now() run id, a Map store overwritten, a filter parsed and dropped, listen on import. */
const PP_LIKE = [
  "import express from 'express';",
  'export interface Options { plant: string; horizonDays: number; filterOrders?: string[] }',
  'export const runStore = new Map<string, { runId: string; plant: string; gapQty: number }>();',
  'export function simulate(o: Options) {',
  '  const runId = `RUN-${Date.now()}`;',
  '  const requiredQty = 0.3;',
  '  const availableQty = 0.1 + 0.2;',
  '  return { runId, plant: o.plant, horizon: o.horizonDays, gapQty: requiredQty - availableQty };',
  '}',
  'export function createApp() {',
  '  const app = express();',
  "  app.post('/simulate', (req, res) => {",
  "    const plant = String(req.body?.plant ?? '1000');",
  '    const horizonDays = parseInt(String(req.body?.horizonDays ?? 14), 10);',
  '    const filterOrders = req.body?.filterOrders ? [req.body.filterOrders] : undefined;',
  '    const result = simulate({ plant, horizonDays, filterOrders });',
  '    runStore.set(result.runId, result);',
  '    res.status(201).json(result);',
  '  });',
  "  app.get('/runs/:id', (req, res) => res.json(runStore.get(req.params.id) ?? null));",
  '  return app;',
  '}',
  'createApp().listen(8080);',
].join('\n');

/** The CO pattern: one module-level "latest result" the export endpoint reads, and a lenient threshold. */
const CO_LIKE = [
  "import express from 'express';",
  'export interface Allocation { receiver: string; amount: number }',
  'let latestAllocation: Allocation[] = [];',
  'export const app = express();',
  "app.post('/allocate', (req, res) => {",
  '  const threshold = Number(req.body.threshold);',
  '  latestAllocation = [{ receiver: String(req.body.receiver), amount: threshold }];',
  '  res.json(latestAllocation);',
  '});',
  "app.get('/export', (_req, res) => res.json(latestAllocation));",
].join('\n');

test.describe('fixtures modelled on the reviewed SD, PP and CO packages', () => {
  test('SD: claimed integration (P0), decimals and CSV (P1), start on import (P1), unused SAP dependencies (P2)', () => {
    const f = generatedCodeLints([
      { path: 'package.json', content: SD_PACKAGE_JSON },
      { path: 'srv/service.ts', content: SD_LIKE },
    ]);
    expect(of(f, 'claimed-integration').map((x) => x.line)).toEqual([3, 9]);
    expect(of(f, 'float-decimal-arithmetic').map((x) => x.line)).toEqual([12, 14]);
    expect(of(f, 'csv-unescaped').map((x) => x.line)).toEqual([14]);
    expect(of(f, 'start-on-import').map((x) => x.line)).toEqual([17]);
    expect(of(f, 'unused-dependency').map((x) => x.message.match(/^"([^"]+)"/)?.[1])).toEqual(['@sap-cloud-sdk/http-client', 'typeorm']);
    expect(lintSeverityCounts(f)).toEqual({ P0: 2, P1: 4, P2: 2 });
    // Ordered by severity first.
    expect(f.map((x) => x.severity)).toEqual([...f.map((x) => x.severity)].sort());
  });

  test('PP: parseInt, a Date.now() run id, a store overwritten and shared, a dropped filter, listen on import', () => {
    const f = generatedCodeLints(one(PP_LIKE));
    expect(new Set(ids(f))).toEqual(
      new Set<LintId>(['lenient-number-parsing', 'weak-run-id', 'run-overwrite', 'global-mutable-result', 'float-decimal-arithmetic', 'ignored-option', 'start-on-import']),
    );
    expect(of(f, 'lenient-number-parsing').map((x) => x.line)).toEqual([14]);
    expect(of(f, 'weak-run-id').map((x) => x.line)).toEqual([5]);
    expect(of(f, 'run-overwrite').map((x) => x.line)).toEqual([17]);
    expect(of(f, 'global-mutable-result').map((x) => x.line)).toEqual([3]);
    expect(of(f, 'ignored-option').map((x) => x.line)).toEqual([15]);
    expect(of(f, 'start-on-import').map((x) => x.line)).toEqual([23]);
    expect(of(f, 'float-decimal-arithmetic').map((x) => x.line)).toEqual([8]);
  });

  test('CO: a global "latest result" and a lenient threshold', () => {
    const f = generatedCodeLints(one(CO_LIKE));
    expect(of(f, 'global-mutable-result').map((x) => [x.line, x.severity])).toEqual([[3, 'P0']]);
    expect(of(f, 'lenient-number-parsing').map((x) => x.line)).toEqual([6]);
  });

  test('a clean package gets no finding', () => {
    const clean = [
      "import express from 'express';",
      "import { randomUUID } from 'node:crypto';",
      'export interface Run { runId: string; totalCents: number }',
      'const YEAR = /^\\d{4}$/;',
      'export function createApp(store: Map<string, Run>) {',
      '  const app = express();',
      "  app.post('/runs', (req, res) => {",
      '    const raw = String(req.body?.year ?? \'\');',
      '    if (!YEAR.test(raw)) return res.status(400).json({ error: \'year\' });',
      '    const run: Run = { runId: randomUUID(), totalCents: Number.parseInt(raw, 10) };',
      '    if (store.has(run.runId)) return res.status(409).end();',
      '    store.set(run.runId, run);',
      '    return res.status(201).json(run);',
      '  });',
      "  app.get('/runs/:id', (req, res) => res.json(store.get(req.params.id) ?? null));",
      '  return app;',
      '}',
      'if (require.main === module) createApp(new Map()).listen(8080);',
    ].join('\n');
    const pkg = JSON.stringify({ dependencies: { express: '^4', tsx: '^4' }, devDependencies: { typescript: '^5', '@types/express': '^4' } });
    const f = generatedCodeLints([{ path: 'package.json', content: pkg }, { path: 'srv/service.ts', content: clean }]);
    expect(f).toEqual([]);
    expect(lintCountLine(f)).toBe('none');
  });

  test('the stored package (a JSON array) is read as files; test files are read for imports only', () => {
    const stored = JSON.stringify([
      { path: 'srv/service.ts', content: CO_LIKE },
      { path: 'test.ts', content: 'let latest = 0;\napp.listen(1);\nexport {};\n' },
    ]);
    const f = generatedCodeLints(stored);
    expect(f.every((x) => x.file === 'srv/service.ts')).toBe(true);
    expect(f.length).toBeGreaterThan(0);
    expect(generatedCodeLints(null)).toEqual([]);
  });
});

/* -------------------------------------------------------------- the wiring */

test.describe('the findings reach STATUS.md and the Transformation stage', () => {
  test('the STATUS.md section lists counts by severity and every finding with file:line and its roadmap source', () => {
    const f = generatedCodeLints(one(CO_LIKE));
    const lines = codeChecksLines(f).join('\n');
    expect(lines).toContain('## Code checks');
    expect(lines).toContain(`${f.length} findings (${lintCountLine(f)})`);
    for (const x of f) {
      expect(lines).toContain(`\`${x.file}:${x.line}\``);
      expect(lines).toContain(x.source);
    }
    expect(f.every((x) => x.source.startsWith('Roadmap 3.0.12'))).toBe(true);
    expect(codeChecksLines([]).join('\n')).toContain('no finding.');
  });

  test('the Transformation page shows them where the hard-coded-literal warning is, and the delivery page passes the declared decimals', () => {
    const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
    expect(page).toContain('generatedCodeLints(files, { decimalFields: packedDecimalFields(legacySource) })');
    expect(page).toContain('data-code-checks={codeLintFindings.length}');
    expect(page.indexOf('data-code-checks=')).toBeGreaterThan(page.indexOf('data-hard-coded-literals='));
    const delivery = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(delivery).toContain('decimalFields: packedDecimalFields(');
    const pkg = read('lib/delivery-package.ts');
    expect(pkg).toContain('generatedCodeLints(entries, { decimalFields: input.decimalFields })');
  });
});
