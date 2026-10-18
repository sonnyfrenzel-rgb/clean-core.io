import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { abapCheck } from '../lib/transformation/abap-check';
import { contractModel } from '../lib/transformation/call-contract';
import { candidateFiles, guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards } from '../lib/transformation/markers';
import { methodParameters } from '../lib/transformation/rap-contract';
import { NO_ENTRY_POINT, SCAFFOLD_VERSION } from '../lib/transformation/types';
import { generatedCodeLints } from '../lib/generated-code-lints';
import { readSource } from '../lib/first-look';
import { fileUrl, nodePackage, planOf, runInPackage } from './helpers/transformation-scaffold';

/**
 * Engine defects E1–E4 and E10 of the end-to-end check of every starter example (18.10.2026, release 3.0.18), on
 * the examples themselves — Z_ORDER_INTEGRITY_CHECK is retired from the site and kept as the fixture of a source
 * with local classes and no entry point; Z_SALES_ORDER_CREATOR calls a BAPI. Scaffold version 17. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8');
const ORDER_INTEGRITY = 'Z_ORDER_INTEGRITY_CHECK.txt';
const SALES_ORDER = 'Z_SALES_ORDER_CREATOR.txt';

function prep(source: string, track: 'node' | 'rap'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(`${track}: ${p.reason}`);
  return p;
}

const logicOf = (p: EngineLedPrepared) => p.scaffold.files.find((f) => f.path.endsWith('_logic.clas.abap'))!.content;
/** The METHODS statement of one method of the logic class, up to its period. */
const declarationOf = (logic: string, method: string) => {
  const at = logic.indexOf(`    METHODS ${method}\n`);
  return at < 0 ? '' : logic.slice(at, logic.indexOf('.', at) + 1);
};

test('scaffold version 17', () => {
  expect(SCAFFOLD_VERSION).toBe(17);
});

test.describe('E1 — methods of different local classes are units by their class', () => {
  test('the order-integrity example: six method implementations, six method units, none dropped unlisted', () => {
    const { plan, facts } = planOf(read(ORDER_INTEGRITY));
    const methods = facts.blocks.containers.filter((c) => c.kind === 'method');
    expect(methods).toHaveLength(6);
    const units = plan.units.filter((u) => u.kind === 'method');
    // Before: three units (the last CONSTRUCTOR, CALCULATE_TAX and GET_DETAILS of their names), three lost unlisted.
    expect(units.map((u) => `${u.owner}=>${u.routine} L${u.abap[0].lineStart}`)).toEqual([
      'LCL_INVOICE_DOCUMENT=>CONSTRUCTOR L26',
      'LCL_INVOICE_DOCUMENT=>CALCULATE_TAX L30',
      'LCL_INVOICE_DOCUMENT=>GET_DETAILS L34',
      'LCL_CREDIT_NOTE_DOCUMENT=>CALCULATE_TAX L46',
      'LCL_CREDIT_NOTE_DOCUMENT=>GET_DETAILS L54',
      'LCL_BILLING_DOCUMENT=>CONSTRUCTOR L60',
    ]);
    // Every method is a unit or listed as not carried: nothing disappears.
    for (const m of methods) {
      const carried = plan.units.some((u) => u.abap.some((r) => r.lineStart === m.lineStart));
      const listed = plan.notCarried.some((n) => n.lineStart === m.lineStart);
      expect(carried || listed, `${m.name} L${m.lineStart}`).toBe(true);
    }
    // Distinct names on both tracks, and the credit note's rule on the credit note's unit.
    expect(new Set(units.map((u) => u.fn)).size).toBe(units.length);
    expect(new Set(units.map((u) => u.rapName)).size).toBe(units.length);
    const creditTax = units.find((u) => u.owner === 'LCL_CREDIT_NOTE_DOCUMENT' && u.routine === 'CALCULATE_TAX')!;
    const br = plan.rules.find((r) => r.ranges.some((x) => x.lineStart >= 46 && x.lineStart <= 53));
    if (br) expect(br.unitId).toBe(creditTax.id);
    const guard = plan.guards.find((g) => g.line === 48);
    if (guard) expect(guard.unitId).toBe(creditTax.id);
  });
});

test.describe('E2 — a local-class method keeps its declared signature, and the classes\' attributes are declared', () => {
  test('METHODS declarations are read: IMPORTING, EXPORTING, CHANGING, RETURNING, OPTIONAL and DEFAULT dropped', () => {
    expect(methodParameters('constructor IMPORTING iv_vbeln TYPE vbak-vbeln iv_netwr TYPE vbak-netwr OPTIONAL')).toMatchObject([
      { name: 'iv_vbeln', section: 'importing', phrase: 'TYPE vbak-vbeln' },
      { name: 'iv_netwr', section: 'importing', phrase: 'TYPE vbak-netwr' },
    ]);
    expect(methodParameters('calculate_tax ABSTRACT RETURNING VALUE(rv_tax) TYPE vbak-netwr')).toMatchObject([{ name: 'rv_tax', section: 'returning', phrase: 'TYPE vbak-netwr' }]);
    expect(methodParameters("m EXPORTING ev_x TYPE i CHANGING ct_t TYPE string_table iv_d TYPE c DEFAULT 'X' RAISING cx_static_check")).toMatchObject([
      { name: 'ev_x', section: 'exporting' },
      { name: 'ct_t', section: 'changing' },
      { name: 'iv_d', section: 'changing', phrase: 'TYPE c' },
    ]);
    expect(methodParameters('calculate_tax REDEFINITION')).toEqual([]);
  });

  test('the order-integrity RAP class: parameters and RETURNING from the definition (an ancestor\'s for a REDEFINITION), the attributes declared, faithful bodies accepted and activatable', () => {
    test.setTimeout(120_000);
    const p = prep(read(ORDER_INTEGRITY), 'rap');
    const logic = logicOf(p);
    const unit = (owner: string, routine: string) => p.plan.units.find((u) => u.owner === owner && u.routine === routine)!;
    const invoiceCtor = unit('LCL_INVOICE_DOCUMENT', 'CONSTRUCTOR');
    const invoiceTax = unit('LCL_INVOICE_DOCUMENT', 'CALCULATE_TAX');
    const creditTax = unit('LCL_CREDIT_NOTE_DOCUMENT', 'CALCULATE_TAX');
    const creditDetails = unit('LCL_CREDIT_NOTE_DOCUMENT', 'GET_DETAILS');
    const methodName = (u: typeof invoiceCtor) => /METHOD (\w+)\.\n\s+" @cc-fill BEGIN (\w+)/.exec(logic.slice(logic.indexOf(`@cc-fill BEGIN ${u.id} `) - 80))?.[1] ?? '';
    // Before: `METHODS constructor_unit RAISING …` — no parameter, no RETURNING.
    const ctor = declarationOf(logic, methodName(invoiceCtor));
    for (const p0 of ['iv_vbeln', 'iv_netwr', 'iv_fkart']) expect(ctor).toMatch(new RegExp(`IMPORTING[\\s\\S]*\\b${p0} TYPE`));
    // REDEFINITION: the signature is the abstract declaration of LCL_BILLING_DOCUMENT.
    expect(declarationOf(logic, methodName(invoiceTax))).toMatch(/RETURNING VALUE\(rv_tax\) TYPE \w+/);
    expect(declarationOf(logic, methodName(creditTax))).toMatch(/RETURNING VALUE\(rv_tax\) TYPE \w+/);
    expect(declarationOf(logic, methodName(creditDetails))).toMatch(/RETURNING VALUE\(rv_desc\) TYPE string/);
    // The attributes of the local classes, once each, on the logic class.
    for (const a of ['mv_vbeln', 'mv_netwr', 'mv_fkart']) expect(logic.match(new RegExp(`\\n    DATA ${a} `, 'g')) ?? [], a).toHaveLength(1);

    // The bodies the model wrote in the suite run (refused then: iv_vbeln, iv_netwr, rv_tax, rv_desc not declared).
    const bodies = new Map<string, string>([
      [invoiceCtor.id, 'mv_vbeln = iv_vbeln.\nmv_netwr = iv_netwr.\nmv_fkart = iv_fkart.'],
      [invoiceTax.id, "rv_tax = mv_netwr * '0.19'."],
      [creditTax.id, "IF mv_netwr > 1000.\n  rv_tax = mv_netwr * '0.19'.\nELSE.\n  rv_tax = 0.\nENDIF."],
      [creditDetails.id, "CONCATENATE 'Credit Note document' mv_vbeln INTO rv_desc SEPARATED BY space."],
    ]);
    for (const [id, body] of bodies) {
      expect(bodyGuards(body, guardContextOf(p, id)).map((r) => `${r.code}: ${r.message}`), id).toEqual([]);
    }
    const r = abapCheck(candidateFiles(p, bodies));
    expect(r.ran && r.activation.activatable, JSON.stringify(r.ran && r.findings.filter((f) => f.kind === 'syntax' || f.kind === 'parser').slice(0, 5))).toBe(true);
  });
});

test.describe('E3 — no entry point: the process map and the transformation say the same', () => {
  test('the FORM the process map begins at is carried, and both bodies name it beside the missing entry point', () => {
    const source = read(ORDER_INTEGRITY);
    const skeleton = readSource(source.replace(/\r\n/g, '\n')).skeleton;
    const drawnFrom = skeleton.entries.map((e) => /^entry:([\w/]+)@/i.exec(e)?.[1]?.toUpperCase()).filter(Boolean);
    expect(drawnFrom).toEqual(['PERFORM_SALES_AUDIT']);
    const { plan } = planOf(source);
    // Before: PERFORM_SALES_AUDIT was "unreachable" and in no package, while the map drew the process from it.
    expect(plan.notCarried.map((n) => n.routine)).not.toContain('PERFORM_SALES_AUDIT');
    expect(plan.calledFromOutside?.map((e) => e.routine)).toEqual(drawnFrom);
    const audit = plan.units.find((u) => u.routine === 'PERFORM_SALES_AUDIT')!;
    expect(audit).toBeTruthy();
    expect(plan.calledFromOutside![0].unitId).toBe(audit.id);
    for (const track of ['rap', 'node'] as const) {
      const p = prep(source, track);
      const all = p.scaffold.files.map((f) => f.content).join('\n');
      expect(all, track).toContain(NO_ENTRY_POINT[0]);
      expect(all, track).toMatch(/The process map begins where the original is called from outside: FORM PERFORM_SALES_AUDIT \(L85\)/);
      expect(p.fillUnits.map((u) => u.unitId), track).toContain(audit.id);
      expect(p.fillUnits.map((u) => u.unitId), track).not.toContain('U00');
    }
  });

  test('a program with an entry point is unchanged: its never-performed FORMs stay not carried, nothing is called from outside', () => {
    const source = read('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
    const { plan } = planOf(source);
    expect(plan.calledFromOutside).toBeUndefined();
    expect(plan.notCarried.filter((n) => n.reason === 'unreachable').length).toBeGreaterThan(0);
  });
});

test.describe('E4 — the base request of a package with lists and no base value', () => {
  test('a list, empty — `run: true` only where there is no field and no list', () => {
    expect(contractModel({ fields: [] }).baseRequest).toEqual({ run: true });
    expect(contractModel({ fields: [] }, ['salesData', 'dbVbak']).baseRequest).toEqual({ salesData: [] });
  });

  test('the order-integrity Node package: its input check accepts the base request every engine case starts from', () => {
    test.setTimeout(120_000);
    const { dir } = nodePackage(read(ORDER_INTEGRITY));
    try {
      const r = runInPackage<{ base: Record<string, unknown>; ok: boolean; errors: unknown[] }>(
        dir,
        `const c = await import(${JSON.stringify(fileUrl(dir, 'srv/engine-contract.ts'))});
         const v = c.validate(c.CONTRACT.baseRequest);
         console.log(JSON.stringify({ base: c.CONTRACT.baseRequest, ok: v.ok, errors: v.errors }));`,
      );
      // Before: { run: true }, refused — "run: the original offers no such option".
      expect(r.base).not.toHaveProperty('run');
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('E10 — the engine-written code passes its own claimed-integration lint', () => {
  test('the sales-order Node package: no P0 in srv/access.ts or the step frame named after EXECUTE_BAPI_CREATION', () => {
    const p = prep(read(SALES_ORDER), 'node');
    // Before: four P0 — the refusing accessor's name and its two messages, and the step's engine-written name.
    expect(generatedCodeLints(p.scaffold.files).filter((f) => f.id === 'claimed-integration').map((f) => `${f.file}:${f.line}`)).toEqual([]);
  });

  test('a claim is still a claim: a model-written SAP client, a success message, a BAPI said to be called, a name inside a fill region', () => {
    const lints = (content: string) => generatedCodeLints([{ path: 'srv/x.ts', content }]).filter((f) => f.id === 'claimed-integration');
    expect(lints("export class SapApiClient { update() { return 'Successfully updated via OData PATCH'; } }")).toHaveLength(2);
    expect(lints("export function post() { return { message: 'BAPI_SALESORDER_CREATEFROMDAT2 executed' }; }")).toHaveLength(1);
    // A function that only refuses, and a thrown message, claim nothing.
    expect(lints("export function callBapiX(): never { throw new Error('BAPI_X: not mapped to a released API'); }")).toHaveLength(0);
    // In an engine-written file the frame's name is the engine's; a name inside the fill region is the model's.
    const framed = [
      'export function executeBapiCreation(): void {',
      '  // @cc-fill BEGIN U02 0000',
      '  class BapiClient { send() { return 1; } }',
      '  // @cc-fill END U02',
      '}',
    ].join('\n');
    expect(lints(framed).map((f) => f.line)).toEqual([3]);
  });
});
