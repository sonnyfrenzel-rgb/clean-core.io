/**
 * Traceability of a generated package (design §12.1): every function → the
 * ABAP lines and rule ids it stands for, and who wrote its body — the engine,
 * the model, the model after a repair round, or nobody (a stub).
 *
 * `traceability.json` and `TRACE.md` are written after the fills
 * (`withTrace`) and are not part of the scaffold's digest: they change when a
 * fill lands, the engine-written code does not.
 *
 * Pure and deterministic. No network, no model.
 */

import { rangeWords } from './unit-plan';
import { ENGINE_CODE_NOTE, checkPhrase, orderedChecks } from './check-words';
import { GOLDEN_MASTER_TEST_CLASS } from './golden-master';
import { goldenMasterInInclude } from '../testing-abap-unit';
import { SCAFFOLD_VERSION, type FillOutcome, type FilledBy, type Scaffold, type ScaffoldFile, type Trace, type UnitPlan } from './types';

export interface TraceOptions {
  contextDigest?: string | null;
  runId?: string | null;
}

const FUNCTION = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm;
const RAP_METHOD = /^\s*METHOD\s+([\w~]+)\s*\./gim;

function filledByOf(regionIds: readonly string[], outcomes: ReadonlyMap<string, FillOutcome['state']>): FilledBy {
  const states = regionIds.map((id) => outcomes.get(id));
  if (states.length === 0) return 'engine';
  if (states.some((s) => s === undefined || s === 'refused' || s === 'unusable' || s === 'not-sent')) return 'not-filled';
  if (states.includes('model-repair-2')) return 'model-repair-2';
  if (states.includes('model-repair-1')) return 'model-repair-1';
  return 'model';
}

/** The golden master the engine wrote into a test include (golden-master.ts), or null. */
function goldenMasterOf(files: readonly ScaffoldFile[]): { cases: number; rowsPassed: boolean } | null {
  for (const f of files) {
    if (!/\.clas\.testclasses\.abap$/i.test(f.path)) continue;
    const g = goldenMasterInInclude(f.content);
    if (g && g.cases > 0) return g;
  }
  return null;
}

/** The trace of a scaffold with the fills' outcomes (none: every fill region is `not-filled`). */
export function traceOf(plan: UnitPlan, scaffold: Pick<Scaffold, 'files' | 'regions' | 'digest' | 'track'>, outcomes: readonly FillOutcome[], options: TraceOptions = {}): Trace {
  const byRegion = new Map(outcomes.map((o) => [o.regionId, o.state]));
  const goldenMaster = goldenMasterOf(scaffold.files);
  const ruleDecision = new Map(plan.rules.map((r) => [r.id, r]));
  const guardByName = new Map<string, (typeof plan.guards)[number]>();
  for (const g of plan.guards) {
    if (!g.carried) continue;
    guardByName.set(g.helper, g);
    guardByName.set(`when_${g.id.replace('-', '')}`, g);
  }
  const functions: Trace['functions'] = [];
  for (const f of scaffold.files) {
    const isCode = f.path.endsWith('.ts') || f.path.endsWith('.abap');
    if (!isCode) continue;
    const re = f.path.endsWith('.abap') ? RAP_METHOD : FUNCTION;
    re.lastIndex = 0;
    for (let m = re.exec(f.content); m !== null; m = re.exec(f.content)) {
      const name = m[1];
      const unit = f.path.endsWith('.abap')
        ? // A unit is always a plain method of the logic class; `if~method` implements an
          // interface (access layer, application job) and is the engine's, whatever its name.
          name.includes('~') ? null : plan.units.find((u) => u.rapName.toLowerCase() === name.toLowerCase()) ?? null
        : plan.units.find((u) => u.file === f.path && u.fn === name) ?? null;
      const guard = guardByName.get(name) ?? (f.path.endsWith('.abap') ? plan.guards.find((g) => g.carried && name.toLowerCase().endsWith(g.id.replace('-', '').toLowerCase())) : undefined);
      // A guard's predicate is the model's; its wrapper (and a RAP validation) is the engine's.
      const isPredicate = /^when_/i.test(name);
      const hasRegion = scaffold.regions.some((r) => r.file === f.path && (unit ? r.regionId === unit.id : guard && isPredicate ? r.regionId === guard.regionId : false));
      functions.push({
        name,
        file: f.path,
        owner: hasRegion ? 'fill' : 'engine',
        unitId: unit?.id ?? guard?.unitId ?? null,
        abap: unit ? unit.abap.map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd })) : guard ? [{ lineStart: guard.line, lineEnd: guard.endingLine }] : [],
        rules: unit ? [...unit.rules] : guard?.rule ? [guard.rule] : [],
      });
    }
  }
  // Where each unit lives in this package (3.0.13): on the ABAP route the method of the class that holds it —
  // never the Node module the plan names for the other route (`srv/steps/*.ts`).
  const abapHome = (u: (typeof plan.units)[number]): { fn: string; file: string } | null => {
    if (scaffold.track !== 'rap') return null;
    const region = scaffold.regions.find((r) => r.unitId === u.id && r.regionId === u.id);
    const fn = functions.find((f) => f.file.endsWith('.abap') && f.name.toLowerCase() === u.rapName.toLowerCase() && (!region || f.file === region.file));
    const file = fn?.file ?? region?.file ?? scaffold.files.find((f) => /_logic\.clas\.abap$/i.test(f.path))?.path;
    return file ? { fn: u.rapName, file } : null;
  };
  const units: Trace['units'] = plan.units.map((u) => {
    const regions = scaffold.regions.filter((r) => r.unitId === u.id).map((r) => r.regionId);
    const home = abapHome(u);
    return {
      unitId: u.id,
      fn: home?.fn ?? u.fn,
      file: home?.file ?? u.file,
      title: u.title,
      kind: u.kind,
      abap: u.abap,
      rules: u.rules.map((id) => {
        const r = ruleDecision.get(id);
        return r?.decision === 'change' && r.proposal ? { id, decision: r.decision, proposal: r.proposal } : { id, decision: r?.decision ?? 'open' };
      }),
      guards: u.guards,
      filledBy: filledByOf(regions, byRegion),
      checks: { lint: null, cases: null, probes: null },
    };
  });
  return {
    format: 'clean-core.traceability/1',
    program: plan.program,
    sourceSha256: plan.sourceSha256,
    contextDigest: options.contextDigest ?? null,
    scaffoldVersion: SCAFFOLD_VERSION,
    planDigest: plan.digest,
    scaffoldDigest: scaffold.digest,
    runId: options.runId ?? null,
    functions,
    units,
    notCarried: plan.notCarried,
    openRules: plan.rules.filter((r) => r.decision === 'open').map((r) => r.id),
    droppedRules: plan.rules.filter((r) => r.decision === 'drop').map((r) => r.id),
    ...(goldenMaster ? { goldenMaster } : {}),
  };
}

export function traceJson(trace: Trace): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}

const FILLED_WORD: Record<FilledBy, string> = {
  engine: 'engine',
  model: 'model proposal',
  'model-repair-1': 'model proposal (repair round 1)',
  'model-repair-2': 'model proposal (repair round 2)',
  'not-filled': 'not written — stub',
};

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** TRACE.md — the "How this code was built" table STATUS.md links to (§12.1). */
export function traceMarkdown(trace: Trace): string {
  const lines: string[] = [];
  const written = trace.units.filter((u) => u.filledBy !== 'not-filled' && u.filledBy !== 'engine').length;
  const stubs = trace.units.filter((u) => u.filledBy === 'not-filled').length;
  const abap = trace.units.some((u) => u.file.endsWith('.abap'));
  lines.push(`# How this code was built — ${trace.program ?? 'the program'}`);
  lines.push('');
  lines.push(
    abap
      ? 'Clean-Core.io wrote the frame of every method from the original (the classes, types, input checks, guards and the access layer); a model wrote the business logic between the fill markers. A model-written body is a proposal, never proven.'
      : 'Clean-Core.io wrote the frame of every function from the original (types, input checks, guards, run store, CSV, call contract); a model wrote the business logic between the fill markers. A model-written body is a proposal, never proven.',
  );
  lines.push('');
  lines.push(`- Functions anchored to ABAP lines: ${trace.units.length} (${written} written by the model, ${stubs} left as stubs).`);
  lines.push(`- Open rules (kept as the original until decided): ${trace.openRules.length ? trace.openRules.join(', ') : 'none'}.`);
  lines.push(`- Rules dropped by the owner (not carried over): ${trace.droppedRules.length ? trace.droppedRules.join(', ') : 'none'}.`);
  const fixtures = trace.notCarried.filter((n) => n.reason === 'fixture');
  const unreachable = trace.notCarried.filter((n) => n.reason === 'unreachable');
  if (unreachable.length) lines.push(`- Not carried over — never reached in the original: ${unreachable.map((n) => `${n.routine} (L${n.lineStart}–L${n.lineEnd})`).join(', ')}.`);
  const fixtureWords = fixtures.map((n) => `${n.routine} (L${n.lineStart}–L${n.lineEnd})`).join(', ');
  const gm = trace.goldenMaster;
  if (gm && gm.cases > 0) {
    // 3.0.13 (6): the golden master wrote the original's demo cases as ABAP Unit test data (golden-master.ts).
    lines.push(
      `- Demo cases of the original, carried as ABAP Unit test data: ${gm.cases} case${gm.cases === 1 ? '' : 's'} in the test class ${GOLDEN_MASTER_TEST_CLASS}${fixtures.length ? `, read from ${fixtureWords}` : ''}` +
        (gm.rowsPassed ? '.' : ' — their input rows are not yet passed to the logic, so each case runs the logic without its data.'),
    );
  } else if (fixtures.length) lines.push(`- Demo data of the original, not carried over in this version: ${fixtureWords}.`);
  lines.push(`- Source sha256 ${trace.sourceSha256}; scaffold v${trace.scaffoldVersion}, digest ${trace.scaffoldDigest.slice(0, 16)}…${trace.runId ? `; built from run ${trace.runId}` : ''}.`);
  const g = trace.generation;
  if (g) {
    const state = g.status === 'not-activatable' ? 'generated — not activatable (abaplint finds parser or syntax errors; see STATUS.md)' : g.status === 'complete' ? 'complete' : 'partial';
    lines.push(`- Generation: ${state} — ${g.written} of ${g.units} functions written, ${g.repaired} after a repair round; ${g.callsUsed} model calls, ${g.rounds} repair round${g.rounds === 1 ? '' : 's'}.`);
    for (const c of orderedChecks(g.checks)) lines.push(`- Check before saving — ${checkPhrase(c)}.`);
    if (g.checks.some((c) => c.scope === 'engine-code')) lines.push(`- ${ENGINE_CODE_NOTE}`);
    for (const n of g.notRun) lines.push(`- Not run (${n.kind}): ${n.reason}`);
    for (const n of g.notWritten) lines.push(`- Not written: ${n.unitId} — ${n.reason}`);
    for (const f of g.scaffoldFindings) lines.push(`- Finding in engine-written code (Clean-Core.io's, not the model's): ${f}`);
  }
  lines.push('');
  lines.push('| Unit | Function | ABAP lines | Rules | Guards | Body written by |');
  lines.push('|---|---|---|---|---|---|');
  for (const u of trace.units) {
    const rules = u.rules.map((r) => `${r.id} (${r.decision})`).join(', ') || '—';
    lines.push(`| ${u.unitId} | \`${cell(u.fn)}\` (${cell(u.file)}) | ${rangeWords(u.abap) || '—'} | ${cell(rules)} | ${u.guards.join(', ') || '—'} | ${FILLED_WORD[u.filledBy]}${u.note ? ` — ${cell(u.note)}` : ''} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** The package files after the fills: the spliced files plus traceability.json and TRACE.md. */
export function withTrace(plan: UnitPlan, scaffold: Scaffold, files: readonly ScaffoldFile[], outcomes: readonly FillOutcome[], options: TraceOptions = {}): { files: ScaffoldFile[]; trace: Trace } {
  const trace = traceOf(plan, { ...scaffold, files: [...files] }, outcomes, options);
  return {
    trace,
    files: [
      ...files.filter((f) => f.path !== 'traceability.json' && f.path !== 'TRACE.md'),
      { path: 'traceability.json', content: traceJson(trace), owner: 'engine' },
      { path: 'TRACE.md', content: traceMarkdown(trace), owner: 'engine' },
    ],
  };
}
