import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PLAN_VERSION, SCAFFOLD_VERSION } from '../lib/transformation';
import { candidateFiles } from '../lib/transformation/engine-led';
import { FILL_PROBES, databaseWrites, fillProbeConfigs, unitsReaching } from '../lib/transformation/fill-probes';
import { selfUpdateOf } from '../lib/transformation/unit-plan';
import { ENGINE_CODE_PROBES, markerSpans, mapProbeFailures, probeScope } from '../lib/transformation/verify';
import { prepared, referenceBodies, runChecks, stubBodies, type ChecksRun } from '../scripts/transformation/reach';
import { FIXTURES, fixture, nodePackage, planOf, poDemo, typecheck } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.13, item 4: probes that reach the written functions — the display
 * filter, the additive recalculation and the negative write. Until 3.0.13 the
 * scaffold's adapter declared all three not applicable ("written by the model
 * fills, not by the engine"), so every probe that ran judged engine-written
 * code. Now the engine reads from the original where each pattern stands
 * (`lib/transformation/fill-probes.ts`) and the probe runs the whole process —
 * the written functions — in the same confined probe pass (SES, the runner's
 * protocol unchanged). A failure is attributed to the unit the probe reaches;
 * a run that reaches a stub is Not run, never a pass and never a fail.
 *
 * Server-free: the probe pass runs locally exactly as the verify route runs it
 * (`scripts/transformation/reach.ts` → `executeSandboxRun`).
 */

test.describe.configure({ timeout: 300_000 });

// CRLF in a Windows checkout; the replacements below match on a bare line feed.
const SOURCE = fs.readFileSync(path.join(FIXTURES, 'probe-shape.abap'), 'utf8').replace(/\r\n/g, '\n');
const REFERENCE = path.join(FIXTURES, 'reference-fills', 'probe-shape.json');
const FILL_IDS = FILL_PROBES.map((p) => `PRB_${p}`);

const verdicts = (run: ChecksRun) => Object.fromEntries(run.probes.filter((p) => FILL_IDS.includes(p.id)).map((p) => [p.id.slice(4), p]));

test.describe('reading the patterns from the original', () => {
  test('a component recalculated from its own value is input (plan 2): it comes with the record and starts at zero', () => {
    expect(PLAN_VERSION).toBe(2);
    expect(SCAFFOLD_VERSION).toBe(23); // 23: a split part on Node takes its parent routine's args, and a large method of a local class is split like a FORM (tests/transformation-split-3021.spec.ts); 22: the slice review of 22.10.2026 (tests/qa-3020-transformation.spec.ts); 21: a split part gets the parent locals its lines read or write (tests/transformation-split-locals-3020.spec.ts); 20: a split program builds its code parts only — no unit for the lines a key user configures (tests/key-user-3019-c.spec.ts); 19: the original's ALV display is the run's rows (tests/transformation-display-rows-3018.spec.ts), the CAP package's scopes (tests/transformation-cap-auth-3018.spec.ts), the RAP implementation type and the plain no-input statement (tests/transformation-rap-save-3018.spec.ts); 18: SEC-c41f149-01, srv/lib/authority.ts (tests/transformation-node-authority.spec.ts); 17: the starter examples' engine defects E1-E4, E10 (tests/transformation-examples-3018.spec.ts), an application server file is an access method and a global work area's columns are every component the program reads (tests/examples-3018-engine.spec.ts); 16: an input list a SELECT of a step fills gets its rows there (tests/transformation-3017-trial-defects.spec.ts); 15: "sample" alone is not demo data (tests/transformation-unit-plan.spec.ts); 14: the CAP deploy of 16.10.2026 (tests/transformation-cap-deploy-3015.spec.ts); 13: engine-written counterparts of simple SAP function modules (tests/transformation-released-counterparts.spec.ts); 12: the engine cases run in ABAP (tests/transformation-engine-cases-abap.spec.ts) and whole numbers are numbers on Node (tests/transformation-3014-generation.spec.ts); 11: the first SAP activation (tests/transformation-first-activation.spec.ts); 10: Dictionary-reserved field names (tests/transformation-scaffold-rap.spec.ts); 7: one input list per source structure (tests/transformation-cap-shell.spec.ts); 8: contract gaps (tests/transformation-contract-gaps.spec.ts); 9: acceptance run 4 (tests/transformation-run4-defects.spec.ts)
    for (const [text, want] of [
      ['<ls_item>-menge = <ls_item>-menge + p_add.', { component: 'menge', sign: '+', operand: 'p_add' }],
      ['ls-menge = p_add + ls-menge', { component: 'menge', sign: '+', operand: 'p_add' }],
      ['ls-menge += 1', { component: 'menge', sign: '+', operand: '1' }],
      ['ADD ls-delta TO <ls>-menge', { component: 'menge', sign: '+', operand: 'ls-delta' }],
      ['SUBTRACT 2 FROM ls-menge', { component: 'menge', sign: '-', operand: '2' }],
    ] as const) {
      expect(selfUpdateOf(text), text).toMatchObject(want);
    }
    // Not a recalculation of the component's own value: another component, or more than one operand.
    expect(selfUpdateOf('ls-menge = ls-other + 1')).toBeNull();
    expect(selfUpdateOf('ls-menge = ls-menge + a * b')).toBeNull();
    expect(selfUpdateOf('lv_total = lv_total + 1')).toBeNull();

    const prep = prepared(SOURCE);
    const menge = prep.plan.fields.find((f) => f.original === 'MENGE')!;
    expect(menge).toMatchObject({ where: 'record', path: 'records[].menge', kind: 'packed', base: { value: '2.00', source: 'demo' } });
    // Without demo data the field starts at zero, as a packed number does in ABAP — never "missing".
    const noDemo = prepared(SOURCE.replace(" menge = '2.00'", '').replace(" menge = '1.50'", ''));
    expect(noDemo.plan.fields.find((f) => f.original === 'MENGE')!.base).toEqual({ value: '0.00', source: 'kind' });
    expect(noDemo.plan.missingBaseValues).toEqual([]);
    // A component also computed another way stays a result.
    const computed = prepared(SOURCE.replace('    WRITE: / ls_out-vbeln', '    ls_out-menge = ls_out-netwr * 2.\n    WRITE: / ls_out-vbeln'));
    expect(computed.plan.fields.find((f) => f.original === 'MENGE')!.where).toBe('internal');
  });

  test('the probe fixture: all three probes mapped, each naming the unit it reaches', () => {
    const prep = prepared(SOURCE);
    const probes = prep.scaffold.adapter!.probes as Record<string, Record<string, unknown>>;
    // read_items and recalc_quantities fold into the orchestrator U00; check_amounts (the guard) is U01.
    expect(probes['display-filter']).toMatchObject({ call: { module: 'shims', export: 'listOf' }, items: 'rows', match: { field: 'matnr', value: 'PRB-A' }, units: ['U00'] });
    expect(probes['display-filter'].reaches).toBe('S_MATNR on MATNR, applied at L36');
    expect(probes['recalc-additive']).toMatchObject({ call: { module: 'shims', export: 'recalcOf' }, existing: 125, increment: 10, units: ['U00'] });
    expect((probes['recalc-additive'].args as unknown[])[1]).toBe('menge');
    expect(probes['negative-write']).toMatchObject({ call: { module: 'shims', export: 'writeOf' }, value: -1, validValue: 100, units: ['U01'] });
    expect(probes['negative-write'].reaches).toBe('G-0049 (ls_item-netwr < 0) before the write at L57');
    for (const p of FILL_PROBES) expect(probeScope(`PRB_${p}`)).toBe('fills');
    for (const p of FILL_PROBES) expect(ENGINE_CODE_PROBES.has(p)).toBe(false);
  });

  test('where the original shows no pattern, the probe stays not applicable and says why', () => {
    const co = prepared(fixture('co-shape')).scaffold.adapter!.probes as Record<string, { notApplicable?: string }>;
    expect(co['display-filter'].notApplicable).toBe('the original applies no selection range to a field of its input records');
    expect(co['recalc-additive'].notApplicable).toBe('the original recalculates no input field from its own value');
    expect(co['negative-write'].notApplicable).toBe('the original writes no database table');
    // SD shape: no valid value for NETWR and P_VKORG, so no request can be built for any of them.
    const sd = prepared(fixture('sd-shape')).scaffold.adapter!.probes as Record<string, { notApplicable?: string }>;
    for (const p of FILL_PROBES) expect(sd[p].notApplicable).toBe('the original gives no valid value for NETWR, P_VKORG, so no request can be built');
    // A database write, and a check of what it writes — but not a refusal of a negative value.
    const upperBound = prepared(SOURCE.replace('IF ls_item-netwr < 0.', 'IF ls_item-netwr > 999.')).scaffold.adapter!.probes as Record<string, { notApplicable?: string }>;
    expect(upperBound['negative-write'].notApplicable).toBe('the original refuses no negative value of a field it writes to the database');
  });

  test('a routine the main block performs under a condition: the orchestrator is named beside its unit', () => {
    // The guard moved into a routine of its own, performed only when P_DEMO is off.
    const source = SOURCE.replace('  PERFORM check_amounts.\n', '  IF p_demo = space.\n    PERFORM check_amounts.\n  ENDIF.\n');
    const { plan, facts } = planOf(source);
    const g = plan.guards.find((x) => x.condition === 'ls_item-netwr < 0')!;
    expect(unitsReaching(plan, facts.statements, g.line)).toEqual([g.unitId, 'U00']);
    expect((prepared(source).scaffold.adapter!.probes as Record<string, { units?: string[] }>)['negative-write'].units).toEqual([g.unitId, 'U00']);
    expect(databaseWrites(plan, facts.statements).map((s) => s.lineStart)).toEqual([facts.statements.find((s) => /^UPDATE vbap/i.test(s.text))!.lineStart]);
  });

  test('the emitted package with the probe entry points type-checks', () => {
    const { dir } = nodePackage(SOURCE);
    try {
      const r = typecheck(dir);
      expect(r.ok, r.output).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('the probes in the confined probe pass', () => {
  test('reference fills: the display filter, the recalculation and the negative write all pass', async () => {
    const prep = prepared(SOURCE);
    const run = await runChecks(prep, SOURCE, referenceBodies(REFERENCE, prep));
    expect(run.probesNotRun).toBeNull();
    const v = verdicts(run);
    for (const p of FILL_PROBES) expect(v[p]?.status, `${p}: ${v[p]?.message}`).toBe('Passed');
    // The probes of engine-written code are unchanged by the written functions.
    expect(run.probes.filter((p) => p.status === 'Failed')).toEqual([]);
  });

  test('the scaffold alone: the three probes reach a stub and read Not run with the reason — never a pass, never a fail', async () => {
    const prep = prepared(SOURCE);
    const alone = verdicts(await runChecks(prep, SOURCE, new Map()));
    for (const p of FILL_PROBES) {
      expect(alone[p]?.status, p).toBe('Skipped');
      expect(alone[p]?.message, p).toMatch(/^not runnable: /);
    }
  });

  test("the Gemini test stub's fills, which write no business logic: the recalculation fails on them", async () => {
    // The test stub answers every region with a body that runs and adds nothing — the existing value is kept,
    // the increment lost. That is FP-MEAN-05, and the probe says so on the unit that holds the recalculation.
    const prep = prepared(SOURCE);
    const v = verdicts(await runChecks(prep, SOURCE, stubBodies(prep)));
    expect(v['recalc-additive']?.status).toBe('Failed');
    expect(v['recalc-additive']?.message).toMatch(/existing 125 \+ 10 should give 135; the recalculation gave 125/);
  });

  test('a written function that breaks the pattern fails its probe, attributed to the unit the probe reaches', async () => {
    const prep = prepared(SOURCE);
    const reference = referenceBodies(REFERENCE, prep);
    const adapter = prep.scaffold.adapter;
    const variants: Array<{ probe: string; unit: string; change: (b: Map<string, string>) => void; evidence: RegExp }> = [
      {
        probe: 'display-filter',
        unit: 'U00',
        // The range read, then not applied: the list shows every record.
        change: (b) => b.set('U00', b.get('U00')!.replace('st.local.gtItem = st.local.gtItem.filter((r) => {', 'void st.local.gtItem.filter((r) => {')),
        evidence: /the filtered list still shows 1 non-matching of 2 items/,
      },
      {
        probe: 'recalc-additive',
        unit: 'U00',
        // Recomputed instead of added: the existing quantity is lost.
        change: (b) => b.set('U00', b.get('U00')!.replace("dec.add(r.menge, sel.add ?? '0', 2)", "dec.round(sel.add ?? '0', 2)")),
        evidence: /existing 125 \+ 10 should give 135; the recalculation gave 10/,
      },
      {
        probe: 'negative-write',
        unit: 'U01',
        // The check of a negative amount, never holding: the write goes through.
        change: (b) => b.set('U01.G0049', 'return false;'),
        evidence: /a write of -1 was accepted/,
      },
    ];
    for (const v of variants) {
      const bodies = new Map(reference);
      v.change(bodies);
      const run = await runChecks(prep, SOURCE, bodies);
      const got = verdicts(run);
      expect(got[v.probe]?.status, `${v.probe}: ${got[v.probe]?.message}`).toBe('Failed');
      expect(got[v.probe]?.message).toMatch(v.evidence);
      for (const other of FILL_PROBES.filter((p) => p !== v.probe)) expect(got[other]?.status, `${v.probe} → ${other}`).toBe('Passed');
      const failures = mapProbeFailures(
        run.probes.map((p) => ({ id: p.id, status: p.status, message: p.message ?? undefined })),
        adapter,
        markerSpans(candidateFiles(prep, bodies)),
      );
      expect(failures.map((f) => [f.unitId, f.check]), v.probe).toEqual([[v.unit, 'probes']]);
      expect(failures[0].failure).toContain(`probe ${v.probe} failed`);
    }
  });
});

test('the PO demo: none of the three patterns, and each probe says why', () => {
  const { plan, facts } = planOf(poDemo());
  const configs = fillProbeConfigs(plan, facts);
  for (const p of FILL_PROBES) expect(typeof configs[p].notApplicable, p).toBe('string');
});
