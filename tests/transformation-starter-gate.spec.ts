import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { typeCheckCandidate, type TypeCheckResult } from '../lib/test-sandbox/type-check';
import { abapCheck } from '../lib/transformation/abap-check';
import { cdsCompileCandidate } from '../lib/transformation/cds-compile';
import { prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { NO_ENTRY_POINT } from '../lib/transformation/types';
import { STARTER_EXAMPLES } from '../lib/starter-examples';

/**
 * Acceptance criterion (13) of roadmap 3.0.17 (owner 16.10.2026): the checks of A run in CI on the cases the
 * repository holds. The seven acceptance programs of `scripts/acceptance/programs.json` are read from the owner's
 * machine, so on CI `tests/transformation-contract-gaps.spec.ts` checks only the PO demo and skips the rest; this
 * spec runs the same gate on every shipped starter example, on both routes, before any model fill:
 *   - the engine prepares the package (no refusal),
 *   - RAP: the scaffold is activatable for abaplint (no syntax or parser finding),
 *   - Node: `tsc` ran and found nothing — "not run" fails, as in criterion (2),
 *   - CAP: the shell compiles with no error,
 *   - criterion (4), the part the engine owns: every unit the model fills is anchored to lines of the original.
 * Server-free.
 */

const ROOT = path.resolve(__dirname, '..');

function prep(source: string, track: 'node' | 'rap'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(`${track}: ${p.reason}`);
  return p;
}


type Plan = EngineLedPrepared['plan'];

/**
 * Criterion (4), the rules: the ones not carried. A rule the owner did not drop is carried when its unitId names a
 * unit that lists it, or it stands in a routine the package leaves out for a stated reason (demo data, unreachable),
 * or in a selection-screen event on a check the engine places on the selection screen (QA reviews of a311929b1195
 * and eef734b48fc9).
 */
function uncarriedRules(plan: Pick<Plan, 'rules' | 'units' | 'notCarried' | 'guards'>): Plan['rules'] {
  const left = new Set(plan.notCarried.map((n) => n.routine));
  const unitById = new Map(plan.units.map((u) => [u.id, u]));
  const onSelectionCheck = (r: Plan['rules'][number]) =>
    plan.guards.some((g) => g.place === 'selection-screen' && r.ranges.some((x) => g.line >= x.lineStart && g.line <= x.lineEnd));
  return plan.rules.filter((r) => {
    if (r.decision === 'drop') return false;
    if (r.unitId) return !unitById.get(r.unitId)?.rules.includes(r.id);
    if (r.routine && left.has(r.routine)) return false;
    return !(/^AT SELECTION-SCREEN/.test(r.routine ?? '') && onSelectionCheck(r));
  });
}

const typeErrors = (r: TypeCheckResult) => (r.ran ? r.findings.map((f) => `${f.path}:${f.line} ${f.code} ${f.message}`) : [`not run: ${r.reason}`]);

test.describe('every shipped starter example: the package is gate-clean before any fill', () => {
  test('the list is the registry — six examples since 18.10.2026 (three retired), each file present', () => {
    expect(STARTER_EXAMPLES.length).toBeGreaterThanOrEqual(6);
    for (const e of STARTER_EXAMPLES) expect(fs.existsSync(path.join(ROOT, 'public', 'starter-examples', e.file)), e.file).toBe(true);
  });

  for (const example of STARTER_EXAMPLES) {
    test(`${example.file}: RAP activatable, Node type-clean, CAP shell compiles, every unit anchored`, () => {
      test.setTimeout(120_000);
      const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', example.file), 'utf8');
      const lineCount = source.split(/\r?\n/).length;

      const rap = prep(source, 'rap');
      const abap = abapCheck(rap.scaffold.files);
      expect(abap.ran, abap.ran ? '' : abap.reason).toBe(true);
      if (abap.ran) {
        expect(abap.activation.activatable, JSON.stringify(abap.findings.filter((f) => f.kind === 'syntax' || f.kind === 'parser').slice(0, 5))).toBe(true);
      }

      const node = prep(source, 'node');
      expect(typeErrors(typeCheckCandidate(node.scaffold.files))).toEqual([]);
      const cds = cdsCompileCandidate(node.scaffold.files);
      expect(cds.ran, cds.ran ? '' : cds.reason).toBe(true);
      if (cds.ran) expect(cds.findings.filter((f) => f.severity === 'Error'), JSON.stringify(cds.findings.slice(0, 5))).toEqual([]);

      // Criterion (4), the rules: every rule of the analysis the owner did not drop is carried by a unit, or stands in
      // a routine the package leaves out for a stated reason (demo data, unreachable), or in a selection-screen event,
      // whose checks the engine writes into the input contract.
      // A unitId has to name a unit that lists the rule, and a selection-screen rule has to stand on a check the engine
      // places on the selection screen (QA review of a311929b1195).
      const orphans = uncarriedRules(rap.plan);
      expect(orphans.map((r) => `${r.id} ${r.routine ?? 'program level'} L${r.ranges[0]?.lineStart} → ${r.unitId ?? 'no unit'}`)).toEqual([]);

      // No exception: a source with no entry point (Z_ORDER_INTEGRITY_CHECK) has its orchestrator written by the
      // engine, so no model-filled unit is without lines of the original (roadmap 3.0.17 item 6, scaffold 15).
      for (const p of [rap, node]) {
        for (const u of p.fillUnits) {
          const ranges = u.abap.ranges;
          expect(ranges.length, `${u.unitId} has no line of the original`).toBeGreaterThan(0);
          for (const r of ranges) {
            expect(r.lineStart >= 1 && r.lineEnd >= r.lineStart && r.lineEnd <= lineCount, `${u.unitId} L${r.lineStart}-${r.lineEnd} of ${lineCount}`).toBe(true);
          }
        }
      }
    });
  }

  test('a source with no entry point: the engine writes the process body and says why, the model is not asked', () => {
    const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', 'Z_ORDER_INTEGRITY_CHECK.txt'), 'utf8');
    for (const track of ['rap', 'node'] as const) {
      const p = prep(source, track);
      expect(p.fillUnits.map((u) => u.unitId), track).not.toContain('U00');
      expect(p.scaffold.regions.map((r) => r.regionId), track).not.toContain('U00');
      const body = p.scaffold.files.map((f) => f.content).join('\n');
      expect(body, track).toContain(NO_ENTRY_POINT[0]);
    }
  });
});

test.describe('the rule check of criterion (4) itself', () => {
  // Against a real plan, broken on purpose: a check that only ever meets valid plans proves nothing.
  const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8');
  const plan = prep(source, 'rap').plan;
  const carried = plan.rules.find((r) => r.unitId)!;

  test('a valid plan has no uncarried rule', () => {
    expect(carried, 'the PO demo carries rules').toBeTruthy();
    expect(uncarriedRules(plan)).toEqual([]);
  });

  test('a unitId that names no unit is caught', () => {
    const rules = plan.rules.map((r) => (r.id === carried.id ? { ...r, unitId: 'U99' } : r));
    expect(uncarriedRules({ ...plan, rules }).map((r) => r.id)).toEqual([carried.id]);
  });

  test('a unit that does not list the rule is caught', () => {
    const units = plan.units.map((u) => (u.id === carried.unitId ? { ...u, rules: u.rules.filter((id) => id !== carried.id) } : u));
    expect(uncarriedRules({ ...plan, units }).map((r) => r.id)).toEqual([carried.id]);
  });

  test('a rule with no unit, outside every stated reason, is caught', () => {
    const rules = plan.rules.map((r) => (r.id === carried.id ? { ...r, unitId: null, routine: 'SOMEWHERE_ELSE' } : r));
    expect(uncarriedRules({ ...plan, rules }).map((r) => r.id)).toEqual([carried.id]);
  });
});
