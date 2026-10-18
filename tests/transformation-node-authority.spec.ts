import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { typeCheckCandidate, type TypeCheckResult } from '../lib/test-sandbox/type-check';
import { candidateFiles, guardBodyOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { AUTHORITY_DEMO_ENV, AUTHORITY_FILE } from '../lib/transformation/authority-node';
import { fillPrompt } from '../lib/transformation/fill-prompt';
import { withTrace } from '../lib/transformation/trace';
import { fileUrl, runInPackage, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.17 criterion (3): every defect a run shows becomes a fix with a test that fails without it.
 *
 * The defect (three real generations of the side-by-side starter example, 17.10.2026): a step holding
 * `AUTHORITY-CHECK OBJECT … IF sy-subrc <> 0. MESSAGE … TYPE 'E'.` got a frame and a derived check that reads
 * sy-subrc, but nothing to compute sy-subrc from — the model invented it (`checked(sel, st) ? 0 : 4`, a string)
 * and the type check failed every time. The engine now carries the check (`lib/transformation/authority-node.ts`):
 * `srv/lib/authority.ts` fails closed, and the step's frame holds a function per check that the body calls.
 *
 * A synthetic snippet, not any acceptance program. Server-free.
 */

const SOURCE = [
  'REPORT z_cc_authority_seam.',
  '',
  "CONSTANTS c_display TYPE c LENGTH 2 VALUE '03'.",
  "PARAMETERS p_werks TYPE c LENGTH 4 OBLIGATORY DEFAULT '1000'.",
  'DATA gv_done TYPE c LENGTH 1.',
  '',
  'START-OF-SELECTION.',
  '  PERFORM check_plant_authority.',
  "  gv_done = 'X'.",
  '',
  'FORM check_plant_authority.',
  "  AUTHORITY-CHECK OBJECT 'M_MATE_WRK'",
  '    ID ' + "'WERKS' FIELD p_werks",
  "    ID 'ACTVT' FIELD c_display.",
  '  IF sy-subrc <> 0.',
  "    MESSAGE 'No authorization for this plant' TYPE 'E'.",
  '  ENDIF.',
  // A statement of its own after the check, so the body is the model's (a routine the frame runs whole is the
  // engine's since 18.10.2026 — tests/transformation-guard-after-perform.spec.ts).
  "  gv_done = 'P'.",
  'ENDFORM.',
  '',
].join('\n');

const CHECK_LINE = SOURCE.split('\n').findIndex((l) => l.includes('AUTHORITY-CHECK')) + 1;

function prep(): EngineLedPrepared {
  const p = prepareEngineLed({ source: SOURCE, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const typeErrors = (r: TypeCheckResult) => (r.ran ? r.findings.map((f) => `${f.path}:${f.line} ${f.code} ${f.message}`) : [`not run: ${r.reason}`]);

/** The unit whose lines hold the check, and its guard on sy-subrc. */
function authorityUnit(p: EngineLedPrepared) {
  const unit = p.plan.units.find((u) => u.kind !== 'orchestrator' && u.abap.some((r) => CHECK_LINE >= r.lineStart && CHECK_LINE <= r.lineEnd));
  if (!unit) throw new Error('no unit holds the AUTHORITY-CHECK');
  const guard = p.plan.guards.find((g) => g.carried && g.unitId === unit.id && /sy-subrc/i.test(g.condition));
  if (!guard) throw new Error('no carried check on sy-subrc in the unit');
  return { unit, guard };
}

test.describe('the Node package carries the original authority check (3.0.17 criterion 3)', () => {
  test('the seam fails closed and names the original check; the frame writes the check, the request names it', () => {
    const p = prep();
    const { unit } = authorityUnit(p);
    const seam = p.scaffold.files.find((f) => f.path === AUTHORITY_FILE);
    expect(seam, 'srv/lib/authority.ts is written').toBeTruthy();
    expect(seam!.owner).toBe('engine');
    expect(seam!.content).toContain(`@cc-open AUTH L${CHECK_LINE} M_MATE_WRK (WERKS, ACTVT)`);
    expect(seam!.content).toMatch(/FAILS CLOSED/);
    expect(seam!.content).toContain('return AUTHORITY_DENIED;');
    // No fill region in the seam: the model never writes an authorization.
    expect(seam!.content).not.toContain('@cc-fill');

    const step = p.scaffold.files.find((f) => f.path === unit.file)!;
    const frame = `const authority_L${CHECK_LINE} = (): number => authority_check(st, 'M_MATE_WRK', { 'WERKS': sel.`;
    expect(step.content).toContain(frame);
    expect(step.content).toContain(`'ACTVT': '03' }, ${CHECK_LINE});`);
    // The engine-written function stands before the fill region, in the frame.
    expect(step.content.indexOf(frame)).toBeLessThan(step.content.indexOf(`@cc-fill BEGIN ${unit.id}`));

    // The check stands first in its FORM and its IF sy-subrc <> 0 follows: the frame runs both (QA 8394df76b027).
    const { guard } = authorityUnit(p);
    const wired = `const sySubrc_L${CHECK_LINE} = authority_L${CHECK_LINE}();`;
    expect(step.content).toContain(wired);
    expect(step.content).toContain(`checked(st, () => ${guard.helper}(sel, st, null, { sySubrc: sySubrc_L${CHECK_LINE} }))`);
    expect(step.content.indexOf(wired)).toBeLessThan(step.content.indexOf(`@cc-fill BEGIN ${unit.id}`));
    const fill = p.fillUnits.find((u) => u.unitId === unit.id)!;
    expect(fill.authority).toEqual([expect.objectContaining({ line: CHECK_LINE, fn: `authority_L${CHECK_LINE}`, wired: { guard: guard.id, helper: guard.helper } })]);
    expect(fill.guards.find((g) => g.id === guard.id)?.placement).toBe('entry');
    // Nothing for the body to call: the function is not offered, and the guard is not required of it.
    expect(fill.available.helpers).not.toContain(`authority_L${CHECK_LINE}`);
    expect(p.scaffold.required[unit.id] ?? []).toEqual([]);
    const prompt = fillPrompt({ schema: 'cc.fill.v1', track: 'node', program: null, context: '', rules: '', units: [fill], repair: null });
    expect(prompt).toContain('AUTHORITY-CHECK ("authority"): where the original checks, call its "fn"');
  });

  test('a trivial body compiles with the package tsconfig; the run is denied by default and granted only on purpose', () => {
    test.setTimeout(180_000);
    const p = prep();
    const { unit, guard } = authorityUnit(p);
    const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    const bodies = new Map<string, string>();
    // The frame runs the check and its sy-subrc check (QA 8394df76b027): the body has nothing left of it to write.
    bodies.set(unit.id, 'return;');
    expect(guardBodyOf(p)(unit.id, 'return;', [])).toBeNull();
    if (p.scaffold.regions.some((r) => r.regionId === guard.regionId)) bodies.set(guard.regionId!, 'return values.sySubrc !== 0;');
    bodies.set(orchestrator.id, `const r = ${unit.fn}(sel, st);\nif (r) return r;\nst.local.gvDone = 'X';`);
    const files = candidateFiles(p, bodies);
    expect(files.find((f) => f.path === unit.file)!.content).toContain(`const sySubrc_L${CHECK_LINE} = authority_L${CHECK_LINE}();`);
    expect(typeErrors(typeCheckCandidate(files))).toEqual([]);
    // The scaffold alone (every body a stub) is type-clean too.
    expect(typeErrors(typeCheckCandidate(p.scaffold.files))).toEqual([]);

    const { files: traced } = withTrace(p.plan, p.scaffold, files, []);
    const trace = traced.find((f) => f.path === 'TRACE.md')!.content;
    expect(trace).toContain(`Open decision — authorization: the original checks L${CHECK_LINE} M_MATE_WRK (WERKS, ACTVT)`);
    expect(trace).toContain(`${AUTHORITY_DEMO_ENV}=grant`);

    const dir = writePackage(traced, 'cc-authority-');
    try {
      type Outcome = { refused: boolean; issues: Array<{ severity: string; rule?: string; message: string }>; done: string };
      const run = (env: string) =>
        runInPackage<Outcome>(
          dir,
          [
            env,
            `const { runProcess } = await import(${JSON.stringify(fileUrl(dir, 'srv/process.ts'))});`,
            "const o = runProcess({ werks: '1000' }, []);",
            'console.log(JSON.stringify({ refused: o.refusal !== null, issues: o.state.issues, done: o.state.local.gvDone }));',
          ].join('\n'),
        );
      const denied = run(`delete process.env.${AUTHORITY_DEMO_ENV};`);
      expect(denied.refused, 'fail closed: nobody is authorized until a developer writes the check').toBe(true);
      expect(denied.done).toBe('');
      expect(denied.issues).toEqual([expect.objectContaining({ severity: 'error', rule: 'AUTH', message: expect.stringContaining('denied') })]);

      const granted = run(`process.env.${AUTHORITY_DEMO_ENV} = 'grant';`);
      expect(granted.refused).toBe(false);
      expect(granted.done).toBe('X');
      // Never silent: the run says the check was granted by the demo switch.
      expect(granted.issues).toEqual([expect.objectContaining({ severity: 'warning', rule: 'AUTH', message: expect.stringContaining(`granted by ${AUTHORITY_DEMO_ENV}=grant`) })]);

      // Anything else in the variable grants nothing.
      expect(run(`process.env.${AUTHORITY_DEMO_ENV} = 'yes';`).refused).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a check whose value only the routine knows: no function is written, the request names the exact call', () => {
    const source = SOURCE.replace("    ID 'WERKS' FIELD p_werks", "    ID 'WERKS' FIELD lv_werks").replace(
      'FORM check_plant_authority.',
      'FORM check_plant_authority.\n  DATA lv_werks TYPE c LENGTH 4.\n  lv_werks = p_werks.',
    );
    const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
    if (!p.ok) throw new Error(p.reason);
    const line = source.split('\n').findIndex((l) => l.includes('AUTHORITY-CHECK')) + 1;
    const fill = p.fillUnits.find((u) => u.authority?.length)!;
    expect(fill.authority).toEqual([{ line, fn: null, call: `authority_check(st, 'M_MATE_WRK', { 'WERKS': <lv_werks>, 'ACTVT': '03' }, ${line})` }]);
    expect(fill.available.helpers).toContain('authority_check');
    expect(p.scaffold.files.find((f) => f.path === fill.function.file)!.content).not.toContain(`const authority_L${line}`);
    expect(typeErrors(typeCheckCandidate(p.scaffold.files))).toEqual([]);
  });

  test('a program without AUTHORITY-CHECK gets no seam', () => {
    const source = SOURCE.replace(/ {2}AUTHORITY-CHECK[\s\S]*?FIELD c_display\.\n/, '');
    const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
    if (!p.ok) throw new Error(p.reason);
    expect(p.scaffold.files.some((f) => f.path === AUTHORITY_FILE)).toBe(false);
    expect(p.scaffold.authority).toBeUndefined();
    expect(p.fillUnits.some((u) => u.authority)).toBe(false);
  });
});
