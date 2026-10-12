/**
 * Measurement for the engine-led transformation (docs/design/engine-led-transformation.md §10):
 * the unit plan and scaffold of one or more ABAP sources, reproducible.
 *
 *   npx tsx scripts/transformation/measure.ts <source.abap>... [--write <dir>] [--documentation] [--json]
 *
 *   (default)          per source: lines, rules, guards, decimals, inputs, routines (all / reachable /
 *                      unreachable), folded helpers, fixtures (demo data), fill units, units over the soft
 *                      budget, guards in units / at program level, slice sizes, an estimate of the fill
 *                      prompt per unit (slice + rules + guards + 3,000 context + 900 stub), fill calls at
 *                      4 units per call, the Node and RAP scaffold sizes, engine time
 *   --write <dir>      also write the Node scaffold of each source to <dir>/<name>-node/ and the RAP
 *                      scaffold to <dir>/<name>-rap/ (stubs only, with traceability.json and TRACE.md)
 *   --documentation    also the process-documentation numbers of §10 (steps all / listed / top-level,
 *                      step anchor spans) — builds the BPMN map, so it is slow; the scaffold never does
 *   --json             one JSON object per source instead of the table
 *
 * Replaces the scratch scripts `scratch/measure-elt.ts` and `scratch/measure-elt-units.ts` the design
 * was measured with (12.10.2026). The source files are only read. No network, no model.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildNodeScaffold, buildRapScaffold, planUnits, readEngineFacts, sliceFor, withTrace } from '../../lib/transformation';
import type { UnitPlan } from '../../lib/transformation';

const CONTEXT_CHARS = 3_000;
const STUB_CHARS = 900;
const RULE_CHARS = 260;
const GUARD_CHARS = 120;

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};

async function documentation(source: string, name: string): Promise<Record<string, unknown>> {
  const { buildBpmnExportFromSource } = await import('../../lib/bpmn/export');
  const { applyNaming, namingContextOf } = await import('../../lib/process-naming');
  const { buildProcessMapModel } = await import('../../lib/process-map');
  const { buildProcessDocumentation } = await import('../../lib/process-documentation-build');
  const { isListedStep } = await import('../../lib/process-documentation-path');
  const t0 = Date.now();
  const bpmn = buildBpmnExportFromSource(source, { processName: name, sourceFileName: name });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: name });
  const doc = buildProcessDocumentation({ source, map });
  const listed = doc.steps.filter(isListedStep);
  const top = listed.filter((s) => s.level === null);
  const spans = top.filter((s) => s.anchor).map((s) => s.anchor!.lineEnd - s.anchor!.lineStart + 1);
  return { ms: Date.now() - t0, steps: doc.steps.length, listed: listed.length, topLevel: top.length, anchorSpanP50: pct(spans, 0.5), anchorSpanP90: pct(spans, 0.9) };
}

function measure(file: string, plan: UnitPlan, facts: ReturnType<typeof readEngineFacts>, ms: number) {
  const routineUnits = plan.units.filter((u) => u.kind === 'routine' || u.kind === 'method');
  const promptChars = routineUnits.map((u) => {
    const slice = sliceFor(u, plan, facts);
    return Math.min(slice.chars, 6_000) + u.rules.length * RULE_CHARS + u.guards.length * GUARD_CHARS + CONTEXT_CHARS + STUB_CHARS;
  });
  const node = buildNodeScaffold(plan, facts);
  const rap = buildRapScaffold(plan, facts);
  const size = (files: ReadonlyArray<{ content: string }>) => files.reduce((n, f) => n + f.content.length, 0);
  return {
    file: path.basename(file),
    program: plan.program,
    lines: facts.lines.length,
    chars: facts.source.length,
    rules: { material: plan.rules.length, ...plan.stats.rules },
    guards: plan.stats.guards,
    decimals: plan.decimals.length,
    inputs: plan.inputs.length,
    routines: { all: plan.stats.routines, reachable: plan.stats.reachable, unreachable: plan.stats.unreachable },
    folded: plan.stats.folded,
    fixtures: plan.stats.fixtures,
    fillUnits: plan.stats.routineUnits,
    unitsWithOrchestrator: plan.stats.units,
    overSoftBudget: plan.stats.overSoftBudget,
    split: plan.stats.split,
    sliceChars: { p50: pct(routineUnits.map((u) => u.budget.chars), 0.5), p90: pct(routineUnits.map((u) => u.budget.chars), 0.9), max: Math.max(0, ...routineUnits.map((u) => u.budget.chars)) },
    fillPromptEstimate: { p50: pct(promptChars, 0.5), p90: pct(promptChars, 0.9), max: Math.max(0, ...promptChars) },
    fillCalls: Math.ceil(plan.stats.units / plan.stats.unitsPerCall),
    node: { files: node.files.length, chars: size(node.files), regions: node.regions.length, digest: node.digest.slice(0, 12) },
    rap: { files: rap.files.length, chars: size(rap.files), regions: rap.regions.length, digest: rap.digest.slice(0, 12) },
    engineMs: ms,
    scaffolds: { node, rap },
  };
}

async function main() {
  const args = process.argv.slice(2);
  let writeDir: string | null = null;
  let docs = false;
  let json = false;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--write') writeDir = args[++i];
    else if (args[i] === '--documentation') docs = true;
    else if (args[i] === '--json') json = true;
    else files.push(args[i]);
  }
  if (files.length === 0) {
    process.stderr.write('usage: npx tsx scripts/transformation/measure.ts <source.abap>... [--write <dir>] [--documentation] [--json]\n');
    process.exit(2);
  }
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const t0 = Date.now();
    const facts = readEngineFacts(source);
    const plan = planUnits(source, {}, facts);
    const m = measure(file, plan, facts, Date.now() - t0);
    const { scaffolds, ...row } = m;
    const extra = docs ? { documentation: await documentation(facts.source, path.basename(file)) } : {};
    if (json) process.stdout.write(`${JSON.stringify({ ...row, ...extra })}\n`);
    else {
      process.stdout.write(
        `${row.file}: ${row.lines} lines · routines ${row.routines.all}/${row.routines.reachable}/${row.routines.unreachable} · folded ${row.folded} · fixtures ${row.fixtures} · ` +
          `fill units ${row.fillUnits} (+1 orchestrator) · over soft budget ${row.overSoftBudget.join(', ') || 'none'} · guards ${row.guards.inUnits} in units / ${row.guards.programLevel} program level / ${row.guards.notCarried} not carried · ` +
          `prompt est. p50 ${row.fillPromptEstimate.p50} p90 ${row.fillPromptEstimate.p90} max ${row.fillPromptEstimate.max} · fill calls ${row.fillCalls} · ` +
          `Node ${row.node.files} files / ${row.node.chars} chars / ${row.node.regions} regions · RAP ${row.rap.files} files / ${row.rap.chars} chars / ${row.rap.regions} regions · ${row.engineMs} ms\n`,
      );
      if (docs) process.stdout.write(`  documentation: ${JSON.stringify(extra.documentation)}\n`);
    }
    if (writeDir) {
      const name = path.basename(file).replace(/\.[^.]+$/, '');
      for (const [track, scaffold] of Object.entries(scaffolds)) {
        const dir = path.join(writeDir, `${name}-${track}`);
        fs.rmSync(dir, { recursive: true, force: true });
        const { files: out } = withTrace(plan, scaffold, scaffold.files, []);
        for (const f of out) {
          const target = path.join(dir, f.path);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, f.content);
        }
      }
    }
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
