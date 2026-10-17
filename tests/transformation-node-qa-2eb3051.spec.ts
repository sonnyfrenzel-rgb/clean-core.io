import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { typeCheckCandidate, type TypeCheckResult } from '../lib/test-sandbox/type-check';
import { guardBodyOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { fileUrl, runInPackage, writePackage } from './helpers/transformation-scaffold';

/**
 * QA review of 2eb3051fe128 — two confirmed HIGH findings on the Node package (roadmap 3.0.17 criterion 3).
 * Synthetic snippets, not any acceptance program. Server-free.
 *
 *   - 8394df76b027: `if (rc !== 0) {}` counted as a use of the AUTHORITY-CHECK's answer. Where the check stands at
 *     the top of its routine and its `IF sy-subrc <> 0.` follows, the frame now runs both; everywhere else the
 *     answer must reach a branch that is not empty and ends the path.
 *   - 95f6ea84e8af: the engine wrote a CHECK's predicate on a dictionary or unknown type as text — wrong for a
 *     dictionary date (initial '00000000'), an amount (0) or TYPE any. Only a resolved scalar is the engine's now.
 */

const typeErrors = (r: TypeCheckResult) => (r.ran ? r.findings.map((f) => `${f.path}:${f.line} ${f.code} ${f.message}`) : [`not run: ${r.reason}`]);

function prep(source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const authoritySource = (form: string[]) =>
  [
    'REPORT z_cc_authority_paths.',
    "PARAMETERS p_werks TYPE c LENGTH 4 OBLIGATORY DEFAULT '1000'.",
    'DATA gv_done TYPE c LENGTH 1.',
    'START-OF-SELECTION.',
    '  PERFORM check_plant.',
    "  gv_done = 'X'.",
    'FORM check_plant.',
    ...form,
    'ENDFORM.',
    '',
  ].join('\n');

const CHECK = "AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '03'.";

function authorityParts(p: EngineLedPrepared, source: string) {
  const line = source.split('\n').findIndex((l) => l.includes('AUTHORITY-CHECK')) + 1;
  const unit = p.plan.units.find((u) => u.routine === 'CHECK_PLANT')!;
  const guard = p.plan.guards.find((g) => g.carried && g.unitId === unit.id && /sy-subrc/i.test(g.condition))!;
  return { line, unit, guard, fn: `authority_L${line}` };
}

test.describe('8394df76b027: the answer of an AUTHORITY-CHECK decides the path', () => {
  test('a check first in its routine with its IF sy-subrc <> 0 right after: the frame runs both, the body writes neither', () => {
    test.setTimeout(180_000);
    for (const [ending, form] of [
      ['refuses', [`  ${CHECK}`, '  IF sy-subrc <> 0.', "    MESSAGE 'No authorization' TYPE 'E'.", '  ENDIF.', "  gv_done = 'Y'."]],
      ['stops', ['  DATA lv_x TYPE i.', `  ${CHECK}`, '  IF sy-subrc <> 0.', '    RETURN.', '  ENDIF.', "  gv_done = 'Y'."]],
    ] as const) {
      const source = authoritySource([...form]);
      const p = prep(source);
      const { line, unit, guard, fn } = authorityParts(p, source);
      expect(guard.outcome, ending).toBe(ending);
      const step = p.scaffold.files.find((f) => f.path === unit.file)!.content;
      const marker = step.indexOf(`@cc-fill BEGIN ${unit.id}`);
      const answer = `const sySubrc_L${line} = ${fn}();`;
      const call = `checked(st, () => ${guard.helper}(sel, st, null, { sySubrc: sySubrc_L${line} }))`;
      expect(step, ending).toContain(answer);
      expect(step, ending).toContain(ending === 'refuses' ? `= ${call};` : `if (${call}) return;`);
      expect(step.indexOf(answer)).toBeLessThan(marker);
      // The predicate on sy-subrc is the engine's too: no region for the model.
      expect(p.scaffold.regions.some((r) => r.regionId === guard.regionId)).toBe(false);
      const fill = p.fillUnits.find((u) => u.unitId === unit.id)!;
      expect(fill.authority).toEqual([expect.objectContaining({ wired: { guard: guard.id, helper: guard.helper } })]);
      // A body that writes only what follows is accepted: nothing about the check is left to it.
      expect(guardBodyOf(p)(unit.id, "st.local.gvDone = 'Y';", [])).toBeNull();
      expect(typeErrors(typeCheckCandidate(p.scaffold.files))).toEqual([]);

      const dir = writePackage(p.scaffold.files, 'cc-authority-wired-');
      try {
        const out = runInPackage<{ refused: boolean; notFilled: string[] }>(
          dir,
          [
            `const { ${unit.fn} } = await import(${JSON.stringify(fileUrl(dir, unit.file))});`,
            "const st = { selection: {}, records: [], rows: [], result: {}, issues: [], notFilled: [], local: { gvDone: '' } };",
            'let r;',
            `try { r = ${unit.fn}({ werks: '1000' }, st); } catch (e) { if (e && e.constructor && e.constructor.name === 'NotImplementedFill') r = 'stub'; else throw e; }`,
            "console.log(JSON.stringify({ refused: r !== undefined && r !== 'stub', notFilled: st.notFilled }));",
          ].join('\n'),
        );
        // Denied by the seam (fail closed): the frame refuses, or ends the step, before the body's stub is reached.
        expect(out, ending).toEqual({ refused: ending === 'refuses', notFilled: [] });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test('elsewhere the answer must reach a branch that is not empty and ends the path', () => {
    const source = authoritySource(['  IF p_werks IS NOT INITIAL.', `    ${CHECK}`, '    IF sy-subrc <> 0.', "      MESSAGE 'No authorization' TYPE 'E'.", '    ENDIF.', '  ENDIF.']);
    const p = prep(source);
    const { unit, guard, fn } = authorityParts(p, source);
    expect(p.fillUnits.find((u) => u.unitId === unit.id)!.authority).toEqual([expect.not.objectContaining({ wired: expect.anything() })]);
    const why = (body: string) => guardBodyOf(p)(unit.id, body, []);
    const after = `const r = ${guard.helper}(sel, st, null, { sySubrc: 0 });\nif (r) return r;`;
    const refusal = "new Refusal([{ field: null, rule: 'AUTH', message: 'denied' }])";
    for (const noEffect of [
      `const rc = ${fn}();\nif (rc !== 0) {}\n${after}`,
      `const rc = ${fn}();\nif (rc !== 0) { st.local.gvDone = 'N'; }\n${after}`,
      `const rc = ${fn}();\nif (rc !== 0) console.log('denied');\n${after}`,
      `const rc = ${fn}();\nconst denied = rc !== 0 ? 1 : 0;\n${after}`,
      `const rc = ${fn}();\nconst denied = rc !== 0;\nif (denied) {\n}\n${after}`,
      `const g = ${guard.helper}(sel, st, null, { sySubrc: ${fn}() });\nvoid g;\n${after}`,
      `if (${fn}() !== 0) { st.local.gvDone = 'N'; } else { st.local.gvDone = 'Y'; }\n${after}`,
    ]) {
      expect(why(noEffect), noEffect).toContain('ignores its answer');
    }
    for (const effective of [
      `const rc = ${fn}();\nif (rc !== 0) { st.local.gvDone = 'N'; return ${refusal}; }\n${after}`,
      `const rc = ${fn}();\nconst denied = rc !== 0;\nif (denied) return ${refusal};\n${after}`,
      `if (${fn}() === 0) { st.local.gvDone = 'Y'; } else { return ${refusal}; }\n${after}`,
      `const r2 = ${guard.helper}(sel, st, null, { sySubrc: ${fn}() });\nif (r2) return r2;\n${after}`,
      `const sySubrc = ${fn}();\nconst r2 = checked(st, () => ${guard.helper}(sel, st, null, { sySubrc }));\nif (r2) {\n  return r2;\n}\n${after}`,
    ]) {
      expect(why(effective), effective).toBeNull();
    }
  });
});

const TYPES_SOURCE = [
  'REPORT z_cc_check_types.',
  '',
  'TYPES: BEGIN OF ty_doc,',
  '         amount TYPE wrbtr,',
  '         budat  TYPE datum,',
  '         status TYPE char10,',
  '       END OF ty_doc.',
  '',
  'DATA gs_doc TYPE ty_doc.',
  'DATA gv_any TYPE i.',
  'DATA gv_seen TYPE i.',
  '',
  'START-OF-SELECTION.',
  '  PERFORM check_amount CHANGING gs_doc.',
  '  PERFORM check_date CHANGING gs_doc.',
  '  PERFORM check_status CHANGING gs_doc.',
  '  PERFORM check_any USING gv_any.',
  '',
  'FORM check_amount CHANGING cs_doc TYPE ty_doc.',
  '  CHECK cs_doc-amount IS INITIAL.',
  '  gv_seen = gv_seen + 1.',
  'ENDFORM.',
  '',
  'FORM check_date CHANGING cs_doc TYPE ty_doc.',
  '  CHECK cs_doc-budat IS INITIAL.',
  '  gv_seen = gv_seen + 2.',
  'ENDFORM.',
  '',
  'FORM check_status CHANGING cs_doc TYPE ty_doc.',
  '  CHECK cs_doc-status IS INITIAL.',
  '  gv_seen = gv_seen + 4.',
  'ENDFORM.',
  '',
  'FORM check_any USING iv_any TYPE any.',
  '  CHECK iv_any IS INITIAL.',
  '  gv_seen = gv_seen + 8.',
  'ENDFORM.',
  '',
].join('\n');

test.describe('95f6ea84e8af: the engine writes a CHECK only on a type it has resolved', () => {
  test('a dictionary amount and TYPE any stay the model\'s, with the type named; a fixed-domain date and CHAR10 are the engine\'s', () => {
    test.setTimeout(180_000);
    const p = prep(TYPES_SOURCE);
    const at = (needle: string) => p.plan.guards.find((g) => g.condition.startsWith(needle))!;
    const regions = new Set(p.scaffold.regions.map((r) => r.regionId));
    const amount = at('cs_doc-amount');
    const any = at('iv_any');
    const date = at('cs_doc-budat');
    const status = at('cs_doc-status');
    expect(regions.has(amount.regionId!), 'TYPE wrbtr: its domain is not in the source').toBe(true);
    expect(regions.has(any.regionId!), 'TYPE any').toBe(true);
    expect(regions.has(date.regionId!), 'TYPE datum: a date').toBe(false);
    expect(regions.has(status.regionId!), 'TYPE char10: CHAR 10').toBe(false);
    // The fill request names the type, so the model can write its initial value.
    const asked = p.fillUnits.flatMap((u) => u.guards).filter((g) => g.regionId && regions.has(g.regionId));
    expect(asked.find((g) => g.id === amount.id)?.declared).toEqual(['cs_doc-amount: TYPE wrbtr (dictionary type: its domain is not in the source)']);
    expect(asked.find((g) => g.id === any.id)?.declared).toEqual(['iv_any: TYPE any (generic: the type of what the caller hands in)']);

    const guards = p.scaffold.files.find((f) => f.path === 'srv/lib/guards.ts')!.content;
    expect(guards).toContain("on cs_doc-budat (dictionary type datum, domain D).");
    expect(guards).toContain('on cs_doc-status (dictionary type char10, domain C 10).');
    expect(typeErrors(typeCheckCandidate(p.scaffold.files))).toEqual([]);

    const dir = writePackage(p.scaffold.files, 'cc-check-types-');
    try {
      const id = (g: { id: string }) => g.id.replace('-', '');
      const out = runInPackage<Record<string, boolean>>(
        dir,
        [
          `const g = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/guards.ts'))});`,
          `const d = (s) => g.when_${id(date)}({}, {}, null, { csDocBudat: s });`,
          `const c = (s) => g.when_${id(status)}({}, {}, null, { csDocStatus: s });`,
          "console.log(JSON.stringify({ zeros: d('00000000'), empty: d(''), today: d('20261017'), blank: c('   '), set: c('OK') }));",
        ].join('\n'),
      );
      expect(out).toEqual({ zeros: true, empty: true, today: false, blank: true, set: false });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
