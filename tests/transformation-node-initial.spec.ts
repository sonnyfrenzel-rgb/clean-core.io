import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { typeCheckCandidate, type TypeCheckResult } from '../lib/test-sandbox/type-check';
import { candidateFiles, guardBodyOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { withTrace } from '../lib/transformation/trace';
import { fileUrl, runInPackage, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.17 criterion (3): every defect a run shows becomes a fix with a test that fails without it.
 *
 * The defect (a real generation of the freight starter example on the SAP BTP trial, 17.10.2026, Node/CAP): FORM
 * CHECK_DANGEROUS_GOODS reads `SELECT SINGLE profl FROM mara INTO lv_profl` and checks `IF lv_profl IS NOT
 * INITIAL`, with `lv_profl TYPE mara-profl` — a dictionary field the engine does not read. Since QA finding
 * 95f6ea84e8af the engine wrote such a predicate only on a resolved type, so the model wrote it:
 * `return values.lvProfl !== '';` — true for null (an empty CDS String in the lookup list arrives as null) and for
 * blanks, and a material with no profile came out dangerous goods (+45.00). A single IS [NOT] INITIAL is now the
 * engine's on every type, through `isInitial` of srv/lib/guards.ts; an unread type as 'unknown'.
 *
 * A synthetic snippet, not any acceptance program. Server-free.
 */

const SOURCE = [
  'REPORT z_cc_initial_unread.',
  '',
  'TYPES: BEGIN OF ty_item,',
  '         vbeln TYPE c LENGTH 10,',
  '         matnr TYPE c LENGTH 18,',
  '       END OF ty_item.',
  '',
  'DATA: gt_items     TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY,',
  '      gv_dangerous TYPE c LENGTH 1.',
  '',
  "PARAMETERS p_vbeln TYPE c LENGTH 10 OBLIGATORY DEFAULT '0080000001'.",
  '',
  'START-OF-SELECTION.',
  '  SELECT vbeln matnr FROM lips INTO TABLE gt_items WHERE vbeln = p_vbeln.',
  '  PERFORM check_goods.',
  '',
  'FORM check_goods.',
  '  DATA ls_item TYPE ty_item.',
  '  DATA lv_x TYPE mara-profl.',
  '  LOOP AT gt_items INTO ls_item.',
  '    SELECT SINGLE profl FROM mara INTO lv_x WHERE matnr = ls_item-matnr.',
  '    IF lv_x IS NOT INITIAL.',
  "      gv_dangerous = 'X'.",
  '      EXIT.',
  '    ENDIF.',
  '  ENDLOOP.',
  'ENDFORM.',
  '',
].join('\n');

const CHECK_LINE = SOURCE.split('\n').findIndex((l) => l.includes('IF lv_x IS NOT INITIAL')) + 1;
const MARA_LINE = SOURCE.split('\n').findIndex((l) => l.includes('FROM mara')) + 1;
const typeErrors = (r: TypeCheckResult) => (r.ran ? r.findings.map((f) => `${f.path}:${f.line} ${f.code} ${f.message}`) : [`not run: ${r.reason}`]);

function prep(source = SOURCE): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

test.describe('IS [NOT] INITIAL is the engine\'s on every type (3.0.17 criterion 3)', () => {
  test('an IF on a dictionary field the engine has not read: the engine writes the predicate, names its assumption, asks nothing', () => {
    const p = prep();
    const g = p.plan.guards.find((x) => x.carried && x.line === CHECK_LINE)!;
    expect(g.condition).toBe('lv_x IS NOT INITIAL');
    const regions = new Set(p.scaffold.regions.map((r) => r.regionId));
    expect(regions.has(g.regionId!), 'no fill region for the predicate').toBe(false);
    const guards = p.scaffold.files.find((f) => f.path === 'srv/lib/guards.ts')!.content;
    expect(guards).toContain("return !isInitial(values.lvX, 'unknown');");
    expect(guards).toContain('export function isInitial(v: unknown, kind: InitialKind): boolean {');
    expect(guards).toContain(` * Assumed by the engine: ${g.id} (L${CHECK_LINE}, lv_x): IS INITIAL on an unread dictionary type — initial taken as null, blank, 0, false, 00000000, 000000.`);
    // The fill request does not ask the model for it.
    const asked = p.fillUnits.flatMap((u) => u.guards).find((x) => x.id === g.id);
    expect(asked?.regionId ?? null).toBeNull();
    // TRACE.md names the assumption where a developer reads how the code was built.
    const trace = withTrace(p.plan, p.scaffold, p.scaffold.files, []).files.find((f) => f.path === 'TRACE.md')!.content;
    expect(trace).toContain(`- Assumed by the engine — IS INITIAL on an unread dictionary type — initial taken as null, blank, 0, false, 00000000, 000000: ${g.id} (L${CHECK_LINE}, lv_x).`);
    expect(typeErrors(typeCheckCandidate(p.scaffold.files))).toEqual([]);
  });

  test('run: a material whose profile is empty, blank, missing or null is no dangerous good; a filled one is', () => {
    test.setTimeout(180_000);
    const p = prep();
    const g = p.plan.guards.find((x) => x.carried && x.line === CHECK_LINE)!;
    const unit = p.plan.units.find((u) => u.routine === 'CHECK_GOODS')!;
    const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    const bodies = new Map<string, string>();
    bodies.set(
      unit.id,
      [
        "let lvX: unknown = '';",
        'for (const lsItem of st.local.gtItems) {',
        `  const r = select_mara_L${MARA_LINE}(st, { matnr: lsItem.matnr });`,
        '  if (r.sySubrc === 0) lvX = r.row?.profl;',
        `  if (${g.helper}(sel, st, null, { lvX })) {`,
        "    st.local.gvDangerous = 'X';",
        '    break;',
        '  }',
        '}',
      ].join('\n'),
    );
    bodies.set(orchestrator.id, `const r = ${unit.fn}(sel, st);\nif (r) return r;`);
    for (const [id, body] of bodies) expect(guardBodyOf(p)(id, body, []), id).toBeNull();
    const files = candidateFiles(p, bodies);
    expect(files.find((f) => f.path === unit.file)!.content).toContain(`if (${g.helper}(sel, st, null, { lvX })) {`);
    expect(typeErrors(typeCheckCandidate(files))).toEqual([]);

    const dir = writePackage(files, 'cc-initial-unread-');
    try {
      const run = (mara: unknown[]) =>
        runInPackage<{ ok: boolean; errors: unknown; dangerous: string | null }>(
          dir,
          [
            `const { validateRequest, splitRequest, seedOf } = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/input-contract.ts'))});`,
            `const { runProcess } = await import(${JSON.stringify(fileUrl(dir, 'srv/process.ts'))});`,
            `const v = validateRequest(${JSON.stringify({ vbeln: '0080000001', items: [{ vbeln: '0080000001', matnr: 'M-1' }], mara })});`,
            'if (!v.ok) { console.log(JSON.stringify({ ok: false, errors: v.errors, dangerous: null })); } else {',
            '  const { selection, records, inputs } = splitRequest(v.normalized);',
            '  const o = runProcess(selection, records, seedOf(inputs));',
            '  console.log(JSON.stringify({ ok: o.refusal === null && o.complete, errors: o.notFilled, dangerous: o.state.local.gvDangerous }));',
            '}',
          ].join('\n'),
        );
      expect(run([{ matnr: 'M-1', profl: 'A1' }])).toEqual({ ok: true, errors: [], dangerous: 'X' });
      for (const [what, rows] of [
        ['empty', [{ matnr: 'M-1', profl: '' }]],
        ['blank', [{ matnr: 'M-1', profl: ' ' }]],
        ['null', [{ matnr: 'M-1', profl: null }]],
        ['missing column', [{ matnr: 'M-1' }]],
        ['no row', []],
      ] as const) {
        expect(run([...rows]), what).toEqual({ ok: true, errors: [], dangerous: '' });
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('isInitial: ABAP semantics per kind, a character \'0\' is never initial, an unread date or time is', () => {
    test.setTimeout(180_000);
    const p = prep();
    const dir = writePackage(p.scaffold.files, 'cc-initial-kinds-');
    try {
      const cases: Array<[unknown, string, boolean]> = [
        // text and bool: blanks only; '0' is a filled character field (QA finding 95f6ea84e8af)
        [null, 'text', true],
        ['', 'text', true],
        ['   ', 'text', true],
        ['0', 'text', false],
        ['A', 'text', false],
        ['', 'bool', true],
        ['X', 'bool', false],
        // string: empty only
        ['', 'string', true],
        [' ', 'string', false],
        // numc: zeros or blanks
        ['0000', 'numc', true],
        ['', 'numc', true],
        ['0010', 'numc', false],
        // number: 0, also as decimal text, never Number()
        [0, 'number', true],
        ['0.00', 'number', true],
        ['-0.000', 'number', true],
        ['', 'number', true],
        [null, 'number', true],
        [3, 'number', false],
        ['0.01', 'number', false],
        ['abc', 'number', false],
        // date and time
        ['00000000', 'date', true],
        ['0000-00-00', 'date', true],
        ['', 'date', true],
        ['20261017', 'date', false],
        ['000000', 'time', true],
        ['120000', 'time', false],
        // table: no rows
        [[], 'table', true],
        [null, 'table', true],
        [[{}], 'table', false],
        // unknown: null, blank, the number 0, false (abap_false held as a boolean), exactly '00000000' and exactly '000000'
        [false, 'unknown', true],
        [true, 'unknown', false],
        [undefined, 'unknown', true],
        [null, 'unknown', true],
        ['', 'unknown', true],
        ['  ', 'unknown', true],
        [0, 'unknown', true],
        ['00000000', 'unknown', true],
        ['000000', 'unknown', true],
        ['0', 'unknown', false],
        ['0000', 'unknown', false],
        ['0.00', 'unknown', false],
        ['A1', 'unknown', false],
        [5, 'unknown', false],
      ];
      const out = runInPackage<boolean[]>(
        dir,
        [
          `const g = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/guards.ts'))});`,
          `const cases = ${JSON.stringify(cases.map(([v, k]) => [v === undefined ? '__undefined__' : v, k]))};`,
          "console.log(JSON.stringify(cases.map(([v, k]) => g.isInitial(v === '__undefined__' ? undefined : v, k))));",
        ].join('\n'),
      );
      expect(cases.map(([v, k], i) => `${JSON.stringify(v)} ${k}: ${out[i]}`)).toEqual(cases.map(([v, k, want]) => `${JSON.stringify(v)} ${k}: ${want}`));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a comparison on a dictionary field the engine has not read stays the model\'s, with its type named', () => {
    const source = SOURCE.replace('IF lv_x IS NOT INITIAL.', "IF lv_x = 'A1'.");
    const p = prep(source);
    const g = p.plan.guards.find((x) => x.carried && x.line === CHECK_LINE)!;
    expect(g.condition).toBe("lv_x = 'A1'");
    const regions = new Set(p.scaffold.regions.map((r) => r.regionId));
    expect(regions.has(g.regionId!)).toBe(true);
    const guards = p.scaffold.files.find((f) => f.path === 'srv/lib/guards.ts')!.content;
    expect(guards).not.toContain('Assumed by the engine:');
    expect(p.fillUnits.flatMap((u) => u.guards).find((x) => x.id === g.id)?.declared).toEqual(['lv_x: type not declared in the source']);
  });
});
