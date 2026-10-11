import { test, expect } from '@playwright/test';
import { executeSandboxRun } from '../lib/test-sandbox/core';
import { sandboxFilesFromStoredCode } from '../lib/test-sandbox/files';
import { parseTapOutput } from '../lib/test-verdicts';
import { INVARIANT_CASE_ID, INVARIANT_RUNTIME_JS, detectEndpoints, invariantPlan, invariantSentence, withInvariants } from '../lib/testing-invariants';
import { FIXED_SERVICE, REVIEWED_SERVICE, SELF_CONSISTENT_SUITE, packageOf } from './helpers/fi-worklist-fixture';

/**
 * 3.0.10 (owner 11.10.2026, external review F-02): one selection, one
 * population. The product reads list, totals and export endpoints from the
 * generated routes — no model — and adds TC_INV_01, which sends the same
 * selection to all three and compares row counts and sums.
 *
 * The acceptance the review states: customer 0000100001 → 9 items / 4,780 EUR
 * everywhere. On the reviewed service the totals said 7,135 EUR and the CSV
 * 15 rows; the invariant has to fail there and pass on the fixed service.
 * Executed for real, in the sandbox core the runner uses.
 */

test.describe.configure({ timeout: 120_000 });

test.describe('the plan, read from the generated routes', () => {
  test('the reviewed service: list, totals and export found, and the missing customer filter read from the code', () => {
    const plan = invariantPlan(packageOf(REVIEWED_SERVICE));
    expect(plan.applicable).toBe(true);
    if (!plan.applicable) return;
    expect(plan.module).toBe('./srv/service');
    expect(plan.app).toEqual({ kind: 'call', name: 'createCollectionsApp' });
    expect(plan.endpoints.map((e) => [e.role, e.method, e.path, e.send])).toEqual([
      ['list', 'GET', '/odata/v4/collections/WorklistItems', 'query'],
      ['totals', 'GET', '/odata/v4/collections/CustomerAgingTotals', 'query'],
      ['export', 'POST', '/odata/v4/collections/ExportWorklistFile', 'body'],
    ]);
    expect(plan.endpoints[0].reads).toEqual(['companyCode', 'keyDate', 'kunnr']);
    expect(plan.gaps).toEqual([
      { role: 'totals', path: '/odata/v4/collections/CustomerAgingTotals', missing: ['kunnr'] },
      { role: 'export', path: '/odata/v4/collections/ExportWorklistFile', missing: ['kunnr'] },
    ]);
    expect(invariantSentence(plan)).toContain('the totals endpoint does not read kunnr; the export endpoint does not read kunnr, which the list reads');
  });

  test('the fixed service reads its selection through one shared function, and the plan follows it there', () => {
    const plan = invariantPlan(packageOf(FIXED_SERVICE));
    expect(plan.applicable).toBe(true);
    if (!plan.applicable) return;
    expect(plan.endpoints.map((e) => e.reads)).toEqual([
      ['companyCode', 'keyDate', 'kunnr'],
      ['companyCode', 'keyDate', 'kunnr'],
      ['companyCode', 'keyDate', 'kunnr'],
    ]);
    expect(plan.gaps).toEqual([]);
  });

  test('not applicable — and says why — when the pattern is not there', () => {
    expect(invariantPlan('')).toMatchObject({ applicable: false, reason: 'There is no generated code to read.' });
    const pure = JSON.stringify([{ path: 'srv/service.ts', content: 'export function f() { return 1; }' }]);
    expect(invariantPlan(pure)).toMatchObject({ applicable: false });
    expect((invariantPlan(pure) as { reason: string }).reason).toContain('registers no HTTP route');
    const onlyList = JSON.stringify([
      { path: 'srv/service.ts', content: "import express from 'express';\nexport function make() { const app = express(); app.get('/Items', (req, res) => res.json(req.query.kunnr)); return app; }" },
    ]);
    const p = invariantPlan(onlyList);
    expect(p.applicable).toBe(false);
    expect(invariantSentence(p)).toBe(
      'Shared-selection invariant: not applicable — The invariant needs a list endpoint and a totals or an export endpoint that share a selection; the generated routes give list.',
    );
  });

  test('a route in a comment or a string is not a route', () => {
    const src = "// app.get('/Totals', (req, res) => {})\nconst s = \"app.post('/Export', h)\";\napp.get('/Items', (req, res) => res.json(req.query.a));";
    expect(detectEndpoints([{ path: 'srv/a.ts', content: src }]).map((e) => e.path)).toEqual(['/Items']);
  });

  test('the block is added once, written by the product, and the case is marked as the invariant', () => {
    const first = withInvariants(SELF_CONSISTENT_SUITE, [{ id: 'TC_01' }], packageOf(REVIEWED_SERVICE));
    const again = withInvariants(first.suiteCode, first.cases, packageOf(REVIEWED_SERVICE));
    expect(again.suiteCode).toBe(first.suiteCode);
    expect(again.cases.map((c) => c.id)).toEqual(['TC_01', INVARIANT_CASE_ID]);
    expect(first.suiteCode).toContain(`written by Clean-Core.io, not by the model`);
    expect(first.cases[1]).toMatchObject({ id: INVARIANT_CASE_ID, category: 'Invariant', invariant: true });
    // Not applicable: the suite and the cases stay as they were.
    const none = withInvariants(SELF_CONSISTENT_SUITE, [{ id: 'TC_01' }], JSON.stringify([{ path: 'a.ts', content: 'export const x = 1;' }]));
    expect(none.suiteCode).toBe(SELF_CONSISTENT_SUITE);
    expect(none.cases).toEqual([{ id: 'TC_01' }]);
  });
});

test.describe('QA review of 35b97d90c6e1', () => {
  const listAndExport = JSON.stringify([
    {
      path: 'srv/service.ts',
      content:
        "import express from 'express';\nexport function make() {\n  const app = express();\n  app.get('/Items', (req, res) => res.json(req.query.kunnr));\n  app.get('/ExportFile', (req, res) => res.send(req.query.kunnr));\n  return app;\n}\n",
    },
  ]);

  test('a list and an export without totals: the case names, steps and expects only the list and the export', () => {
    const { cases, suiteCode, plan } = withInvariants(SELF_CONSISTENT_SUITE, [], listAndExport);
    expect(plan.applicable).toBe(true);
    const tc = cases.find((c) => c.id === INVARIANT_CASE_ID)!;
    expect(JSON.stringify([tc.name, tc.description, tc.steps, tc.expectedResult])).not.toMatch(/totals/i);
    expect(tc.name).toBe('One selection gives the same population and the same sums in list and export');
    expect(tc.expectedResult).toBe('The same number of rows and the same sums in the list and the export.');
    expect(tc.steps).toContain('Find which export column sums to a list field.');
    expect(suiteCode).toContain(`${INVARIANT_CASE_ID}: one selection gives the same population and the same sums in list and export'`);
    // All three roles: the full case keeps its wording.
    const full = withInvariants(SELF_CONSISTENT_SUITE, [], packageOf(REVIEWED_SERVICE)).cases.find((c) => c.id === INVARIANT_CASE_ID)!;
    expect(full.name).toBe('One selection gives the same population and the same sums in list, totals and export');
    expect(full.expectedResult).toBe('The same number of rows and the same sums in the list, the totals and the export.');
  });

  test('the export CSV is read as RFC 4180 records: a line break inside a quoted field is no new row', async () => {
    const run = new Function(`${INVARIANT_RUNTIME_JS}\nreturn __ccSharedSelectionInvariant;`)() as (
      h: unknown,
      app: unknown,
      spec: unknown,
    ) => Promise<{ problems?: string[]; skip?: string }>;
    const rows = [
      { kunnr: 'A', amount: 10 },
      { kunnr: 'A', amount: 5 },
      { kunnr: 'B', amount: 7 },
    ];
    const csv = (sel: Array<{ kunnr: string; amount: number }>) =>
      'kunnr;amount;note\r\n' + sel.map((r, i) => `${r.kunnr};${r.amount};"line one\r\nline two; says ""hi"" ${i}"`).join('\r\n') + '\r\n';
    const h = {
      invoke: async (_app: unknown, _method: string, path: string, opts: { query?: Record<string, string>; body?: Record<string, string> }) => {
        const sel = opts.query ?? opts.body ?? {};
        const picked = sel.kunnr ? rows.filter((r) => r.kunnr === sel.kunnr) : rows;
        return path === '/Items' ? { status: 200, json: picked } : { status: 200, text: csv(picked) };
      },
    };
    const spec = {
      endpoints: [
        { role: 'list', method: 'GET', path: '/Items', send: 'query' },
        { role: 'export', method: 'GET', path: '/ExportFile', send: 'query' },
      ],
      selection: ['kunnr'],
    };
    const result = await run(h, {}, spec);
    expect(result.skip).toBeUndefined();
    expect(result.problems).toEqual([]);
  });

  test('the delimiter is counted outside quotes: a quoted header with commas does not make the file comma-separated', async () => {
    // QA review of 19a460385054 (a79b2915077b).
    const run = new Function(`${INVARIANT_RUNTIME_JS}\nreturn __ccSharedSelectionInvariant;`)() as (
      h: unknown,
      app: unknown,
      spec: unknown,
    ) => Promise<{ problems?: string[]; skip?: string }>;
    const rows = [
      { kunnr: 'A', amount: 10 },
      { kunnr: 'A', amount: 5 },
      { kunnr: 'B', amount: 7 },
    ];
    const csv = (sel: Array<{ kunnr: string; amount: number }>) =>
      '"Customer, account, number";amount\r\n' + sel.map((r) => `${r.kunnr};${r.amount}`).join('\r\n') + '\r\n';
    // Same rows, wrong amounts under a selection: only a sum can show it, and only
    // when the amount column is read. With the wrong delimiter the export has no
    // comparable column and the check finds nothing; read right, it must say so.
    const h = {
      invoke: async (_app: unknown, _method: string, path: string, opts: { query?: Record<string, string>; body?: Record<string, string> }) => {
        const sel = opts.query ?? opts.body ?? {};
        const picked = sel.kunnr ? rows.filter((r) => r.kunnr === sel.kunnr) : rows;
        if (path === '/Items') return { status: 200, json: picked };
        return { status: 200, text: csv(sel.kunnr ? picked.map((r) => ({ ...r, amount: r.amount + 1 })) : picked) };
      },
    };
    const spec = {
      endpoints: [
        { role: 'list', method: 'GET', path: '/Items', send: 'query' },
        { role: 'export', method: 'GET', path: '/ExportFile', send: 'query' },
      ],
      selection: ['kunnr'],
    };
    const result = await run(h, {}, spec);
    expect(result.skip).toBeUndefined();
    expect(result.problems?.length ?? 0).toBeGreaterThan(0);
  });
});

async function runSuite(service: string) {
  const code = packageOf(service);
  const suite = withInvariants(SELF_CONSISTENT_SUITE, [], code).suiteCode;
  const outcome = await executeSandboxRun({ files: sandboxFilesFromStoredCode(code), suiteCode: suite, patterns: [], allowUnsandboxed: true });
  expect(outcome.kind).toBe('ran');
  if (outcome.kind !== 'ran') throw new Error('not run');
  return { outcome, verdicts: parseTapOutput(outcome.stdout) };
}

test.describe('executed in the sandbox core', () => {
  test('the reviewed service: the four self-consistency tests pass, and TC_INV_01 fails with 9 rows / 4,780 EUR against 15 rows / 7,135 EUR', async () => {
    const { outcome, verdicts } = await runSuite(REVIEWED_SERVICE);
    expect(outcome.exitCode).toBe(1);
    expect(verdicts.filter((v) => v.id !== INVARIANT_CASE_ID).every((v) => v.status === 'Passed')).toBe(true);
    const inv = verdicts.find((v) => v.id === INVARIANT_CASE_ID)!;
    expect(inv.status).toBe('Failed');
    expect(outcome.stdout).toContain(
      'With kunnr = 0000100001 the list /odata/v4/collections/WorklistItems holds a sum of amount_lc of 4780, but the totals endpoint /odata/v4/collections/CustomerAgingTotals reports totalSignedAmount = 7135.',
    );
    expect(outcome.stdout).toContain(
      'With kunnr = 0000100001 the list /odata/v4/collections/WorklistItems holds 9 rows, but the totals endpoint /odata/v4/collections/CustomerAgingTotals reports rows[].items = 15.',
    );
    expect(outcome.stdout).toContain('With kunnr = 0000100001 the export /odata/v4/collections/ExportWorklistFile holds 15 data rows, the list 9.');
    // express was replaced, and the run says so.
    expect(outcome.stubbedPackages).toContain('express');
  });

  test('the fixed service: TC_INV_01 passes', async () => {
    const { outcome, verdicts } = await runSuite(FIXED_SERVICE);
    expect(verdicts.find((v) => v.id === INVARIANT_CASE_ID)?.status).toBe('Passed');
    expect(outcome.exitCode).toBe(0);
  });
});
