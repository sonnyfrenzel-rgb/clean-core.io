import { test, expect } from '@playwright/test';
import { skipWithoutReference } from './helpers/reference-sources';
import fs from 'node:fs';
import path from 'node:path';
import { typeCheckCandidate, type TypeCheckResult } from '../lib/test-sandbox/type-check';
import { abapCheck } from '../lib/transformation/abap-check';
import { cdsCompileCandidate } from '../lib/transformation/cds-compile';
import { candidateFiles, guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards } from '../lib/transformation/markers';
import { bundleFills, fillInstructionHeader } from '../lib/transformation/fill-prompt';
import { geminiTestStubFillText } from '../lib/gemini-test-stub';
import { SCAFFOLD_VERSION } from '../lib/transformation/types';
import { loadPrograms, loadSource } from '../scripts/acceptance/suite';
import { poDemo } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.13 — the contract gaps of the second real acceptance run (14.10.2026, real model with gate feedback:
 * RAP 5 of 7 activatable, Node 2 of 7 type-clean). The remaining errors were in the scaffold and the prompt, not
 * in the model's bodies. Each pattern is reproduced here by a faithful body that has to compile — and did not
 * under scaffold version 6:
 *
 *   RAP 1  `INCLUDE STRUCTURE bdcdata` inside `DATA: BEGIN OF … END OF`: the structure had no components.
 *   RAP 2  `SELECT … FROM zmm_vend_block`: a customer table the package does not ship.
 *   Node 3 `GuardValue` / `Scaled` / `unknown` handed to `dec.*` (TS2345 ×71).
 *   Node 4 `values` read where the predicate had no such parameter (TS2304).
 *   Node 5 `Range` without option/low/high — the DOM's `Range`, the package's never imported (TS2339).
 *   Node 6 a check called with (sel, st, record, values) where it took 2–3 arguments (TS2554).
 *
 * Server-free: abaplint and the TypeScript compiler run in-process, as the routes run them.
 */

function prep(source: string, track: 'node' | 'rap'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const typeErrors = (r: TypeCheckResult) => (r.ran ? r.findings.map((f) => `${f.path}:${f.line} ${f.code} ${f.message}`) : [`not run: ${r.reason}`]);

/* ------------------------------------------------------------------ RAP 1 */

const BDC_SHAPE = `REPORT zcc_bdc_shape.
DATA: BEGIN OF gt_bdcdata OCCURS 0.
INCLUDE STRUCTURE bdcdata.
DATA: END OF gt_bdcdata.
DATA: BEGIN OF gt_messtab OCCURS 0.
INCLUDE STRUCTURE bdcmsgcoll.
DATA: END OF gt_messtab.
PARAMETERS p_vbeln TYPE c LENGTH 10.

START-OF-SELECTION.
  PERFORM fill_bdc.

FORM fill_bdc.
  REFRESH gt_bdcdata.
  gt_bdcdata-program  = 'SAPMV45A'.
  gt_bdcdata-dynpro   = '0102'.
  gt_bdcdata-dynbegin = 'X'.
  APPEND gt_bdcdata.
  gt_bdcdata-fnam = 'VBAK-VBELN'.
  gt_bdcdata-fval = p_vbeln.
  APPEND gt_bdcdata.
ENDFORM.
`;

test.describe('RAP 1 — a batch input the original builds stays a typed structure', () => {
  test('INCLUDE STRUCTURE bdcdata / bdcmsgcoll: the class declares their components, and a faithful body activates', () => {
    const p = prep(BDC_SHAPE, 'rap');
    const logic = p.scaffold.files.find((f) => f.path.endsWith('_logic.clas.abap'))!.content;
    const bdc = logic.slice(logic.indexOf('TYPES BEGIN OF ty_bdcdata.'), logic.indexOf('TYPES END OF ty_bdcdata.'));
    for (const c of ['program TYPE c LENGTH 40', 'dynpro TYPE n LENGTH 4', 'dynbegin TYPE c LENGTH 1', 'fnam TYPE c LENGTH 132', 'fval TYPE c LENGTH 132']) expect(bdc).toContain(`TYPES ${c}.`);
    expect(logic.slice(logic.indexOf('TYPES BEGIN OF ty_messtab.'), logic.indexOf('TYPES END OF ty_messtab.'))).toContain('TYPES msgtyp TYPE c LENGTH 1.');
    const scaffold = abapCheck(p.scaffold.files);
    expect(scaffold.ran && scaffold.activation.activatable, JSON.stringify(scaffold.ran && scaffold.findings.filter((f) => f.kind === 'syntax'))).toBe(true);

    // FILL_BDC is called once: folded into the main path, whose body writes its lines in place.
    const unit = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    const body = ["CLEAR gt_bdcdata.", "APPEND VALUE #( program = 'SAPMV45A' dynpro = '0102' dynbegin = 'X' ) TO gt_bdcdata.", "APPEND VALUE #( fnam = 'VBAK-VBELN' fval = p_vbeln ) TO gt_bdcdata."].join('\n');
    expect(bodyGuards(body, guardContextOf(p, unit.id))).toEqual([]);
    const r = abapCheck(candidateFiles(p, new Map([[unit.id, body]])));
    expect(r.ran && r.activation.activatable, JSON.stringify(r.ran && r.findings.filter((f) => f.kind === 'syntax'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ RAP 2 */

test.describe('RAP 2 — a customer table the original reads is read through the access layer', () => {
  test('the PO demo: read_zmm_vend_block in the interface; a SELECT on it is refused naming that method; the method call is not', () => {
    const p = prep(poDemo(), 'rap');
    const intf = p.scaffold.files.find((f) => /zif_\w+_access\.intf\.abap$/.test(f.path))!.content;
    expect(intf).toMatch(/"! Reads ZMM_VEND_BLOCK \(a customer table of the original system, not in this package\) where the original does, L\d+/);
    expect(intf).toContain('METHODS read_zmm_vend_block');
    const impl = p.scaffold.files.find((f) => /zcl_\w+_access\.clas\.abap$/.test(f.path))!.content;
    expect(impl).toContain('the original reads ZMM_VEND_BLOCK, a customer table this package does not ship');
    const check = abapCheck(p.scaffold.files);
    expect(check.ran && check.activation.activatable).toBe(true);

    // The function the original reads the table in (SELECT SINGLE lifnr FROM zmm_vend_block), else the main path it was folded into.
    const line = poDemo().split('\n').findIndex((l) => /FROM zmm_vend_block/i.test(l)) + 1;
    const regions = new Set(p.scaffold.regions.map((r) => r.regionId));
    const unit =
      p.plan.units.find((u) => regions.has(u.id) && u.kind !== 'orchestrator' && u.abap.some((r) => line >= r.lineStart && line <= r.lineEnd)) ??
      p.plan.units.find((u) => u.kind === 'orchestrator')!;
    const ctx = guardContextOf(p, unit.id);
    const selected = bodyGuards('DATA lv_lifnr TYPE c LENGTH 10.\nSELECT SINGLE lifnr FROM zmm_vend_block INTO @lv_lifnr WHERE lifnr = @lv_lifnr.', ctx);
    const refusal = selected.find((r) => r.code === 'customer-select');
    expect(refusal?.message).toContain('ZMM_VEND_BLOCK (read it with mo_access->read_zmm_vend_block( ))');
    const through = bodyGuards('DATA lt_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.\nmo_access->read_zmm_vend_block( CHANGING ct_rows = lt_rows ).', ctx);
    expect(through.map((r) => r.code)).not.toContain('customer-select');
    expect(through.map((r) => r.code)).not.toContain('unknown-name');
    // The prompt says it.
    expect(fillInstructionHeader('rap')).toContain('A customer table (Z…, Y…) the original reads is not in this package: read it through its access method');
  });
});

/* ------------------------------------------------------------- Node 3 to 6 */

const NODE_SHAPE = `REPORT zcc_contract_gaps.

TYPES: BEGIN OF ty_claim,
         cid    TYPE c LENGTH 10,
         amount TYPE p LENGTH 8 DECIMALS 2,
       END OF ty_claim.

DATA: gt_claims TYPE STANDARD TABLE OF ty_claim WITH DEFAULT KEY,
      gv_cid    TYPE c LENGTH 10,
      gv_total  TYPE p LENGTH 10 DECIMALS 2,
      gv_count  TYPE i.

SELECT-OPTIONS s_cid FOR gv_cid.
PARAMETERS p_limit TYPE p LENGTH 8 DECIMALS 2 DEFAULT '100.00'.

START-OF-SELECTION.
  PERFORM sum_claims.

FORM sum_claims.
  DATA: lv_sum   TYPE p LENGTH 10 DECIMALS 2,
        ls_claim TYPE ty_claim.
  LOOP AT gt_claims INTO ls_claim.
    IF ls_claim-cid NOT IN s_cid.
      CONTINUE.
    ENDIF.
    lv_sum = lv_sum + ls_claim-amount.
    gv_count = gv_count + 1.
  ENDLOOP.
  IF lv_sum > p_limit.
    MESSAGE 'The claims exceed the limit' TYPE 'E'.
  ENDIF.
  PERFORM add_amount USING lv_sum CHANGING gv_total.
ENDFORM.

FORM add_amount USING iv_amount TYPE p CHANGING cv_total TYPE p.
  IF iv_amount IS INITIAL.
    RETURN.
  ENDIF.
  cv_total = cv_total + iv_amount.
ENDFORM.
`;

test.describe('Node 3–6 — faithful bodies compile against the package they land in', () => {
  const p = prep(NODE_SHAPE, 'node');
  const region = (fn: string) => p.plan.units.find((u) => u.fn === fn)!.id;
  const guardRegion = (line: number) => p.plan.guards.find((g) => g.line === line)!.regionId!;
  const check = (bodies: Array<[string, string]>) => typeErrors(typeCheckCandidate(candidateFiles(p, new Map(bodies))));

  test('the scaffold alone type-checks', () => {
    expect(check([])).toEqual([]);
  });

  test('3 — values, records, locals and arguments are decimal text; dec.* takes them, and what dec.parse returns', () => {
    const guards = p.scaffold.files.find((f) => f.path === 'srv/lib/guards.ts')!.content;
    // Each value typed as the original declares it, never GuardValue where the declaration is known.
    expect(guards).toMatch(/export interface G0029Values \{\n {2}\/\*\* lv_sum \*\/\n {2}lvSum: string;\n\}/);
    expect(guards).toMatch(/export interface G0023Values \{\n {2}\/\*\* ls_claim-cid \*\/\n {2}lsClaimCid: string;\n\}/);
    const step = p.scaffold.files.find((f) => f.path.includes('add-amount'))!.content;
    expect(step).toContain('ivAmount: string;');
    expect(step).toContain('cvTotal: { value: string };');
    const sumClaims = [
      "let lvSum = '0.00';",
      'for (const lsClaim of st.local.gtClaims) {',
      '  if (skip_G0023(sel, st, null, { lsClaimCid: lsClaim.cid })) continue;',
      '  lvSum = dec.add(lvSum, lsClaim.amount, 2);',
      // GV_COUNT TYPE i: a whole number is a number since 3.0.14 (item 1), counted as one.
      '  st.local.gvCount = st.local.gvCount + 1;',
      '}',
      'const parsed = dec.parse(lvSum);',
      'if (parsed) lvSum = dec.round(parsed, 2);',
      'lvSum = dec.format(lvSum, 2);',
      'const r = guard_G0029(sel, st, null, { lvSum });',
      'if (r) return r;',
      'const total = { value: st.local.gvTotal };',
      'addAmount(sel, st, { ivAmount: lvSum, cvTotal: total });',
      'st.local.gvTotal = total.value;',
    ].join('\n');
    const predicate = "return sel.limit !== null && dec.compare(values.lvSum, sel.limit) > 0;";
    const addAmount = 'args.cvTotal.value = dec.add(args.cvTotal.value, args.ivAmount, 2);';
    expect(check([[region('sumClaims'), sumClaims], [guardRegion(29), predicate], [region('addAmount'), addAmount]])).toEqual([]);
  });

  test("4 — every predicate has values; a check on a routine's parameter gets it handed in at the entry", () => {
    const step = p.scaffold.files.find((f) => f.path.includes('add-amount'))!.content;
    expect(step).toContain('if (checked(st, () => stop_G0036(sel, st, null, { ivAmount: args.ivAmount }))) return;');
    expect(check([[guardRegion(36), 'return dec.isZero(values.ivAmount);']])).toEqual([]);
    // The prompt no longer says values is left out; it says {} and where an input-only check reads from.
    const header = fillInstructionHeader('node');
    expect(header).toContain('every helper and predicate takes (sel, st, record, values)');
    expect(header).not.toContain('left out when none');
    // The request names the keys the package declares, the routine's parameter included.
    const u = p.fillUnits.find((x) => x.unitId === region('addAmount'))!;
    expect(u.guards?.find((g) => g.id === 'G-0036')?.values).toEqual(['ivAmount']);
  });

  test('5 — Range is the package\'s select-option row (sign, option, low, high), imported where a body may name it', () => {
    const predicate = [
      'const hit = sel.cid.some((r: Range) => (r.option === "BT" ? values.lsClaimCid >= r.low && values.lsClaimCid <= (r.high ?? r.low) : r.low === values.lsClaimCid) === (r.sign === "I"));',
      'return sel.cid.length > 0 && !hit;',
    ].join('\n');
    expect(check([[guardRegion(23), predicate]])).toEqual([]);
    // A body naming the original's structure finds it too.
    expect(check([[region('sumClaims'), 'const first: TyClaim | undefined = st.local.gtClaims[0];\nif (first) st.local.gvCid = first.cid;']])).toEqual([]);
    expect(p.scaffold.files.find((f) => f.path === 'tsconfig.json')!.content).toContain('"lib": [\n      "ES2022"\n    ]');
  });

  test('6 — a check is called with four arguments everywhere', () => {
    expect(check([[region('addAmount'), 'if (stop_G0036(sel, st, null, { ivAmount: args.ivAmount })) return;\nargs.cvTotal.value = dec.add(args.cvTotal.value, args.ivAmount, 2);']])).toEqual([]);
  });

  test('the helper signatures the prompt states are the ones decimal.ts and csv.ts declare', () => {
    const header = fillInstructionHeader('node');
    const decimal = p.scaffold.files.find((f) => f.path === 'srv/lib/decimal.ts')!.content;
    const csv = p.scaffold.files.find((f) => f.path === 'srv/lib/csv.ts')!.content;
    // Each helper: the words the prompt uses for it, and the number of parameters decimal.ts declares.
    const stated: Record<string, [string, number]> = {
      add: ['dec.add/sub/mul/div(a, b, places)', 3],
      sub: ['dec.add/sub/mul/div(a, b, places)', 3],
      mul: ['dec.add/sub/mul/div(a, b, places)', 3],
      div: ['dec.add/sub/mul/div(a, b, places)', 3],
      round: ['dec.round/format/neg/abs(a, places)', 2],
      format: ['dec.round/format/neg/abs(a, places)', 2],
      neg: ['dec.round/format/neg/abs(a, places)', 2],
      abs: ['dec.round/format/neg/abs(a, places)', 2],
      percentOf: ['dec.percentOf(amount, rate, places)', 3],
      compare: ['dec.compare(a, b)', 2],
      max: ['dec.max/min(a, b)', 2],
      min: ['dec.max/min(a, b)', 2],
      fits: ['dec.fits(a, bound)', 2],
      isZero: ['dec.isZero(a)', 1],
      parse: ['dec.parse/must(a)', 1],
      must: ['dec.parse/must(a)', 1],
    };
    for (const [name, [words, n]] of Object.entries(stated)) {
      const decl = new RegExp(`export (?:function ${name}\\(|const ${name} = \\()([^)]*)\\)`).exec(decimal);
      expect(decl, name).not.toBeNull();
      expect(decl![1].split(',').filter((s) => s.trim()).length, name).toBe(n);
      expect(header, name).toContain(words);
    }
    expect(csv).toContain("export function row(values: readonly unknown[], delimiter: string = ','): string {");
    expect(csv).toContain("export function table(columns: readonly string[], rows: ReadonlyArray<Record<string, unknown>>, delimiter: string = ','): string {");
    expect(header).toContain('csv.row(values, delim?), csv.table(columns, rows, delim?)');
  });
});

/* ------------------------------------------------- the seven acceptance programs */

test.describe('the seven acceptance programs: every scaffold is gate-clean before any fill', () => {
  const sources = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'OneDrive', 'Desktop');
  for (const program of loadPrograms()) {
    test(`${program.id}: RAP activatable, Node type-clean, CAP shell compiles (scaffold version ${SCAFFOLD_VERSION})`, async () => {
      skipWithoutReference(!program.source.repo && !fs.existsSync(path.join(sources, program.source.file ?? '')), `${program.source.file} is not on this machine`);
      const source = await loadSource(program, sources);
      const rap = abapCheck(prep(source, 'rap').scaffold.files);
      expect(rap.ran && rap.activation.activatable, JSON.stringify(rap.ran && rap.findings.filter((f) => f.kind === 'syntax' || f.kind === 'parser').slice(0, 5))).toBe(true);
      const node = prep(source, 'node').scaffold.files;
      expect(typeErrors(typeCheckCandidate(node))).toEqual([]);
      // The CAP shell around the Node core (scaffold version 7, merged with these gaps into 8): cds compile, 0 errors.
      const cds = cdsCompileCandidate(node);
      expect(cds.ran, cds.ran ? '' : cds.reason).toBe(true);
      if (cds.ran) expect(cds.findings.filter((f) => f.severity === 'Error'), JSON.stringify(cds.findings.slice(0, 5))).toEqual([]);
    });
  }
});

/* ---------------------------------------------- the dry run's stub passes the Node gate */

test.describe("a dry run's stub calls each check with the scaffold's signature", () => {
  const sources = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'OneDrive', 'Desktop');
  for (const program of loadPrograms()) {
    test(`${program.id}: the stub's fills type-check on Node`, async () => {
      skipWithoutReference(!program.source.repo && !fs.existsSync(path.join(sources, program.source.file ?? '')), `${program.source.file} is not on this machine`);
      const p = prep(await loadSource(program, sources), 'node');
      const regionOfGuard = new Map(p.plan.guards.filter((g) => g.regionId).map((g) => [g.id, g.regionId!]));
      const bodies = new Map<string, string>();
      let calls = 0;
      for (const b of bundleFills(p.fillUnits, { track: 'node', program: p.plan.program, context: '' })) {
        const answer = JSON.parse(geminiTestStubFillText(b.prompt)) as { units: Array<{ unitId: string; body: string; guards?: Array<{ id: string; body: string }> }> };
        for (const u of answer.units) {
          bodies.set(u.unitId, u.body);
          calls += (u.body.match(/\(sel, st, null, \{/g) ?? []).length;
          for (const g of u.guards ?? []) if (regionOfGuard.has(g.id)) bodies.set(regionOfGuard.get(g.id)!, g.body);
        }
      }
      expect(bodies.size).toBeGreaterThan(0);
      // Before: `stop_G0761()` — no arguments — and every dry run failed the type gate on its own stub.
      expect(typeErrors(typeCheckCandidate(candidateFiles(p, bodies)))).toEqual([]);
      if (program.id === 'sd-return-credit-recon') expect(calls).toBeGreaterThan(0);
    });
  }
});
