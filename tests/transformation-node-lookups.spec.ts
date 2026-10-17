import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { typeCheckCandidate, type TypeCheckResult } from '../lib/test-sandbox/type-check';
import { candidateFiles, guardBodyOf, guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { spliceBodies } from '../lib/transformation/markers';
import { LOOKUPS_FILE } from '../lib/transformation/lookups-node';
import { cdsCompileCandidate } from '../lib/transformation/cds-compile';
import { fillPrompt } from '../lib/transformation/fill-prompt';
import { withTrace } from '../lib/transformation/trace';
import { fileUrl, runInPackage, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.17 criterion (3): every defect a run shows becomes a fix with a test that fails without it.
 *
 * The defect (three real generations of the side-by-side starter example, 17.10.2026, Node/CAP): the package took
 * as input only the original's main read (`SELECT … INTO TABLE gt_…`). A step's own read — `SELECT SINGLE land1 FROM
 * kna1 … WHERE kunnr = is_delivery-kunnr`, `SELECT matnr FROM lips INTO TABLE lt_matnr WHERE …` — had no input and
 * no lookup, so the model searched lists that do not exist (`st.records` for a `land1`, `(st.local as any).rates`)
 * or declined the unit. The engine now writes one lookup list per SAP table in the request and the action, and
 * `srv/lib/lookups.ts` with one function per read (`lib/transformation/lookups-node.ts`).
 *
 * A synthetic snippet, not any acceptance program. Server-free.
 */

const SOURCE = [
  'REPORT z_cc_lookup_reads.',
  '',
  'TYPES: BEGIN OF ty_order,',
  '         vbeln TYPE c LENGTH 10,',
  '         kunnr TYPE c LENGTH 10,',
  '       END OF ty_order.',
  '',
  'DATA: gt_orders  TYPE STANDARD TABLE OF ty_order WITH DEFAULT KEY,',
  '      gv_country TYPE c LENGTH 3,',
  '      gv_items   TYPE i.',
  '',
  "PARAMETERS p_vkorg TYPE c LENGTH 4 OBLIGATORY DEFAULT '1000'.",
  '',
  'START-OF-SELECTION.',
  '  PERFORM read_orders.',
  '  PERFORM check_orders.',
  '',
  'FORM read_orders.',
  '  SELECT vbeln kunnr FROM vbak INTO TABLE gt_orders WHERE vkorg = p_vkorg.',
  'ENDFORM.',
  '',
  'FORM check_orders.',
  '  DATA ls_order TYPE ty_order.',
  '  LOOP AT gt_orders INTO ls_order.',
  '    PERFORM read_country USING ls_order.',
  '    PERFORM count_items USING ls_order.',
  '  ENDLOOP.',
  'ENDFORM.',
  '',
  'FORM read_country USING is_order TYPE ty_order.',
  '  DATA lv_land1 TYPE c LENGTH 3.',
  '  DATA ls_rate TYPE zrate.',
  '  SELECT SINGLE land1 FROM kna1 INTO lv_land1',
  '    WHERE kunnr = is_order-kunnr.',
  '  IF sy-subrc = 0.',
  '    gv_country = lv_land1.',
  '  ENDIF.',
  '  SELECT SINGLE * FROM zrate INTO ls_rate',
  '    WHERE land1 = lv_land1',
  '      AND valid_from <= sy-datum.',
  '  IF ls_rate-rate IS INITIAL.',
  "    gv_country = 'NO'.",
  '  ENDIF.',
  'ENDFORM.',
  '',
  'FORM count_items USING is_order TYPE ty_order.',
  '  DATA lt_posnr TYPE STANDARD TABLE OF vbap-posnr WITH DEFAULT KEY.',
  '  DATA lv_count TYPE i.',
  '  "Every item of the order counts once,',
  '  "whatever its category or its quantity:',
  '  "the carrier charges per item.',
  '  SELECT posnr FROM vbap INTO TABLE lt_posnr',
  '    WHERE vbeln = is_order-vbeln.',
  '  lv_count = sy-dbcnt.',
  '  "Add them to the total of the run,',
  '  "one order after the other.',
  '  gv_items = gv_items + lv_count.',
  'ENDFORM.',
  '',
].join('\n');

const lineOf = (needle: string) => SOURCE.split('\n').findIndex((l) => l.includes(needle)) + 1;
const KNA1_LINE = lineOf('FROM kna1');
const ZRATE_LINE = lineOf('FROM zrate');
const VBAP_LINE = lineOf('FROM vbap');

function prep(): EngineLedPrepared {
  const p = prepareEngineLed({ source: SOURCE, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const typeErrors = (r: TypeCheckResult) => (r.ran ? r.findings.map((f) => `${f.path}:${f.line} ${f.code} ${f.message}`) : [`not run: ${r.reason}`]);

function unitOf(p: EngineLedPrepared, line: number) {
  const u = p.plan.units.find((x) => x.kind !== 'orchestrator' && x.abap.some((r) => line >= r.lineStart && line <= r.lineEnd));
  if (!u) throw new Error(`no unit holds L${line}`);
  return u;
}

test.describe('the Node package takes the original lookup reads as input lists (3.0.17 criterion 3)', () => {
  test('one lookup list per SAP table in the request and the action; the main read stays the input list', () => {
    const p = prep();
    const types = p.scaffold.files.find((f) => f.path === 'srv/lib/types.ts')!.content;
    // The main read is the input list it was; the reads inside the steps are lookup lists of their own.
    expect(types).toMatch(/\n {2}orders: TyOrder\[\];/);
    expect(types).toMatch(/\n {2}kna1: Kna1Row\[\];/);
    expect(types).toMatch(/\n {2}vbap: VbapRow\[\];/);
    expect(types).toMatch(/\n {2}zrate: ZrateRow\[\];/);
    expect(types).not.toMatch(/\n {2}vbak: /);
    // Typed from the fields the original reads and its WHERE keys; SELECT * by the components the routine reads.
    const rowOf = (name: string) => /\{([^}]*)\}/.exec(types.slice(types.indexOf(`export interface ${name} {`)))?.[1] ?? '';
    for (const c of ['kunnr', 'land1']) expect(rowOf('Kna1Row')).toContain(`${c}: string | null;`);
    for (const c of ['land1', 'validFrom', 'rate']) expect(rowOf('ZrateRow')).toContain(`${c}: string | null;`);
    for (const c of ['vbeln', 'posnr']) expect(rowOf('VbapRow')).toContain(`${c}: string | null;`);
    expect(types).toMatch(/dbKna1: Kna1Row\[\];/);

    const contract = p.scaffold.files.find((f) => f.path === 'srv/lib/input-contract.ts')!.content;
    expect(contract).toContain('key: "kna1", original: "KNA1", table: "KNA1", global: "dbKna1", required: false,');
    // A lookup list is no input table of the original: not in LIST_GLOBALS, not counted as input rows.
    expect(contract).toContain('export const LIST_GLOBALS: Readonly<Record<string, string>> = {"GT_ORDERS":"gtOrders"};');

    const service = p.scaffold.files.find((f) => f.path === 'srv/service.cds')!.content;
    expect(service).toMatch(/\bkna1 : many db\.Kna1\b/);
    expect(service).toMatch(/\bvbap : many db\.Vbap\b/);
    // The model and the service compile with the lookup lists (where the CDS compiler is installed, as here).
    const cds = cdsCompileCandidate(p.scaffold.files);
    if (cds.ran) expect(cds.findings).toEqual([]);

    const lookups = p.scaffold.files.find((f) => f.path === LOOKUPS_FILE);
    expect(lookups, 'srv/lib/lookups.ts is written').toBeTruthy();
    expect(lookups!.owner).toBe('engine');
    expect(lookups!.content).not.toContain('@cc-fill');
    expect(lookups!.content).toContain(`export function select_kna1_L${KNA1_LINE}(st: RunState, where: { kunnr: unknown }): SelectSingle<Kna1Row> {`);
    expect(lookups!.content).toContain(`export function select_vbap_L${VBAP_LINE}(st: RunState, where: { vbeln: unknown }): SelectTable<VbapRow> {`);
    // sy-datum is a date: compared by value; a key against a key stays text (QA finding cbe1c1d82c46).
    expect(lookups!.content).toContain("cmp(row.validFrom, where.validFrom, 'date') <= 0");
    expect(lookups!.content).toContain('eq(row.kunnr, where.kunnr))');
  });

  test('the frame names the lookup, or the request names the exact call with what is open', () => {
    const p = prep();
    const country = unitOf(p, KNA1_LINE);
    const items = unitOf(p, VBAP_LINE);
    const step = p.scaffold.files.find((f) => f.path === country.file)!.content;
    const frame = `const lookup_L${KNA1_LINE} = (): SelectSingle<Kna1Row> => select_kna1_L${KNA1_LINE}(st, { kunnr: args.isOrder.kunnr });`;
    expect(step).toContain(frame);
    expect(step.indexOf(frame)).toBeLessThan(step.indexOf(`@cc-fill BEGIN ${country.id}`));
    // A WHERE value only the routine knows (lv_land1): no frame function; the request names the exact call.
    expect(step).not.toContain(`const lookup_L${ZRATE_LINE}`);
    const fill = p.fillUnits.find((u) => u.unitId === country.id)!;
    expect(fill.lookups).toEqual([
      expect.objectContaining({ line: KNA1_LINE, table: 'KNA1', list: 'kna1', fn: `lookup_L${KNA1_LINE}` }),
      expect.objectContaining({ line: ZRATE_LINE, table: 'ZRATE', list: 'zrate', fn: null, call: `select_zrate_L${ZRATE_LINE}(st, { land1: <lv_land1>, validFrom: syDatum() })`, open: ['lv_land1'] }),
    ]);
    expect(fill.available.helpers).toEqual(expect.arrayContaining([`lookup_L${KNA1_LINE}`, `select_zrate_L${ZRATE_LINE}`, 'syDatum']));
    expect(p.fillUnits.find((u) => u.unitId === items.id)!.lookups).toEqual([expect.objectContaining({ line: VBAP_LINE, fn: `lookup_L${VBAP_LINE}`, returns: 'SelectTable<VbapRow>' })]);
    const prompt = fillPrompt({ schema: 'cc.fill.v1', track: 'node', program: null, context: '', rules: '', units: [fill], repair: null });
    expect(prompt).toContain('SELECT in a step ("lookups"): where the original reads, call its "fn"');
  });

  test('a trivial body using the lookups type-checks with the package tsconfig and answers the right rows when run', () => {
    test.setTimeout(180_000);
    const p = prep();
    const country = unitOf(p, KNA1_LINE);
    const items = unitOf(p, VBAP_LINE);
    // READ_ORDERS and CHECK_ORDERS are small: they fold into the main path, which loops over the orders.
    const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    const bodies = new Map<string, string>();
    bodies.set(
      country.id,
      [
        `const found = lookup_L${KNA1_LINE}();`,
        "if (found.sySubrc === 0) st.local.gvCountry = found.row?.land1 ?? '';",
        `const rate = select_zrate_L${ZRATE_LINE}(st, { land1: st.local.gvCountry, validFrom: syDatum() });`,
        "if (!rate.row?.rate) st.local.gvCountry = 'NO';",
      ].join('\n'),
    );
    bodies.set(items.id, `const r = lookup_L${VBAP_LINE}();\nst.local.gvItems = st.local.gvItems + r.dbcnt;`);
    bodies.set(orchestrator.id, `for (const o of st.local.gtOrders) {\n  ${country.fn}(sel, st, { isOrder: o });\n  ${items.fn}(sel, st, { isOrder: o });\n}`);
    const files = candidateFiles(p, bodies);
    expect(files.find((f) => f.path === country.file)!.content).toContain(`const found = lookup_L${KNA1_LINE}();`);
    expect(typeErrors(typeCheckCandidate(files))).toEqual([]);
    expect(typeErrors(typeCheckCandidate(p.scaffold.files))).toEqual([]);

    const { files: traced } = withTrace(p.plan, p.scaffold, files, []);
    const trace = traced.find((f) => f.path === 'TRACE.md')!.content;
    expect(trace).toContain(`kna1 ← KNA1 (L${KNA1_LINE})`);
    expect(trace).toContain(`vbap ← VBAP (L${VBAP_LINE})`);
    expect(trace).toContain('wiring a list to a remote read is a developer step');

    const dir = writePackage(traced, 'cc-lookups-');
    try {
      type Answer = { ok: boolean; errors: unknown[]; country: string; items: number };
      const run = (request: unknown) =>
        runInPackage<Answer>(
          dir,
          [
            `const { validateRequest, splitRequest, seedOf } = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/input-contract.ts'))});`,
            `const { runProcess } = await import(${JSON.stringify(fileUrl(dir, 'srv/process.ts'))});`,
            `const v = validateRequest(${JSON.stringify(request)});`,
            'if (!v.ok) { console.log(JSON.stringify({ ok: false, errors: v.errors, country: null, items: null })); } else {',
            '  const { selection, records, inputs } = splitRequest(v.normalized);',
            '  const o = runProcess(selection, records, seedOf(inputs));',
            '  console.log(JSON.stringify({ ok: o.refusal === null && o.complete, errors: o.notFilled, country: o.state.local.gvCountry, items: o.state.local.gvItems }));',
            '}',
          ].join('\n'),
        );
      const base = {
        vkorg: '1000',
        orders: [{ vbeln: '0080000001', kunnr: '0000001000' }],
        kna1: [
          { kunnr: '0000000999', land1: 'FR' },
          { kunnr: '0000001000', land1: 'DE' },
        ],
        vbap: [
          { vbeln: '0080000001', posnr: '000010' },
          { vbeln: '0080000001', posnr: '000020' },
          { vbeln: '0080000002', posnr: '000010' },
        ],
        zrate: [{ land1: 'DE', validFrom: '20200101', rate: '1.25' }],
      };
      // SELECT SINGLE: the matching row (not the first of the list); SELECT INTO TABLE: the matching rows (sy-dbcnt 2).
      expect(run(base)).toEqual({ ok: true, errors: [], country: 'DE', items: 2 });
      // A rate valid only from the future: no row for sy-datum (valid_from <= sy-datum).
      expect(run({ ...base, zrate: [{ land1: 'DE', validFrom: '29991231', rate: '1.25' }] }).country).toBe('NO');
      // No customer row: sy-subrc 4, nothing assigned — and no rate for an empty country either.
      expect(run({ ...base, kna1: [] }).country).toBe('NO');
      // The lists are checked by the one input contract: a column the reads do not name is refused.
      const refused = run({ ...base, kna1: [{ kunnr: '1', land1: 'DE', name1: 'x' }] });
      expect(refused.ok).toBe(false);
      expect(JSON.stringify(refused.errors)).toContain('name1: not a component of KNA1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a program without reads inside its steps keeps the package it had', () => {
    const source = SOURCE.replace(/ {2}SELECT SINGLE land1[\s\S]*?ENDFORM\.\n\nFORM count_items[\s\S]*?ENDFORM\.\n/, 'ENDFORM.\n');
    const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
    if (!p.ok) throw new Error(p.reason);
    expect(p.scaffold.files.some((f) => f.path === LOOKUPS_FILE)).toBe(false);
    expect(p.scaffold.lookups).toBeUndefined();
    expect(p.fillUnits.some((u) => u.lookups)).toBe(false);
  });
});

/*
 * QA finding ef6865e7ade4 (high, 7fb2b11d9af0): the original's AUTHORITY-CHECK was enforced only if the model wrote
 * the call to the frame's authority function and used its answer; a body that omitted it, or ignored the answer,
 * still type-checked. The body checks now refuse both (`markers.ts` authorityRefusals), so the unit goes to repair
 * and, failing that, stays a stub with the reason.
 */
const AUTH_SOURCE = [
  'REPORT z_cc_authority_force.',
  "PARAMETERS p_werks TYPE c LENGTH 4 OBLIGATORY DEFAULT '1000'.",
  'DATA gv_done TYPE c LENGTH 1.',
  'START-OF-SELECTION.',
  '  PERFORM check_plant.',
  "  gv_done = 'X'.",
  'FORM check_plant.',
  // A statement before the check: the frame cannot run it at the entry, the body keeps it (QA 8394df76b027).
  '  CLEAR gv_done.',
  "  AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '03'.",
  '  IF sy-subrc <> 0.',
  "    MESSAGE 'No authorization' TYPE 'E'.",
  '  ENDIF.',
  'ENDFORM.',
  '',
].join('\n');

test.describe('the original authority check is called and its answer used (QA finding ef6865e7ade4)', () => {
  test('a body that omits the call, or ignores its answer, is refused; a correct one passes', () => {
    const p = prepareEngineLed({ source: AUTH_SOURCE, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
    if (!p.ok) throw new Error(p.reason);
    const line = AUTH_SOURCE.split('\n').findIndex((l) => l.includes('AUTHORITY-CHECK')) + 1;
    const unit = p.plan.units.find((u) => u.kind !== 'orchestrator' && u.abap.some((r) => line >= r.lineStart && line <= r.lineEnd))!;
    const guard = p.plan.guards.find((g) => g.carried && g.unitId === unit.id && /sy-subrc/i.test(g.condition))!;
    const fn = `authority_L${line}`;
    const why = (body: string) => guardBodyOf(p)(unit.id, body, []);

    const correct = `const sySubrc = ${fn}();\nconst r = ${guard.helper}(sel, st, null, { sySubrc });\nif (r) return r;`;
    expect(why(correct)).toBeNull();
    // Also used: handed in directly, or compared.
    expect(why(`const r = ${guard.helper}(sel, st, null, { sySubrc: ${fn}() });\nif (r) return r;`)).toBeNull();

    // Omitted: the check is decided by the model (here: not at all).
    const omitted = `const r = ${guard.helper}(sel, st, null, { sySubrc: 0 });\nif (r) return r;`;
    expect(why(omitted)).toContain(`the body does not call ${fn}()`);
    // Named only in a comment or a string: still omitted.
    expect(why(`// ${fn}();\nconst s = '${fn}()';\nconst r = ${guard.helper}(sel, st, null, { sySubrc: s.length - s.length });\nif (r) return r;`)).toContain(`the body does not call ${fn}()`);
    // Called and ignored: as a bare statement, assigned and never read, behind void, or after a condition.
    for (const ignored of [
      `${fn}();\nconst r = ${guard.helper}(sel, st, null, { sySubrc: 0 });\nif (r) return r;`,
      `const sySubrc = ${fn}();\nconst r = ${guard.helper}(sel, st, null, { sySubrc: 0 });\nif (r) return r;`,
      `void ${fn}();\nconst r = ${guard.helper}(sel, st, null, { sySubrc: 0 });\nif (r) return r;`,
      `if (sel.werks) ${fn}();\nconst r = ${guard.helper}(sel, st, null, { sySubrc: 0 });\nif (r) return r;`,
    ]) {
      expect(why(ignored), ignored).toContain(`ignores its answer`);
    }

    // The final splice applies the same check from the scaffold, whatever context the caller passes.
    const { authority: dropped, ...withoutAuthority } = guardContextOf(p, unit.id);
    expect(dropped).toBeTruthy();
    const splice = spliceBodies(p.scaffold, [{ regionId: unit.id, body: omitted }], () => withoutAuthority);
    expect(splice.refused.map((r) => r.reasons.map((x) => x.code))).toEqual([['authority-missing']]);
    expect(splice.applied).toEqual([]);
  });
});
