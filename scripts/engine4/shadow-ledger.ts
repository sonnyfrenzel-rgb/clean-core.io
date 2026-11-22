/**
 * Shadow of the statement ledger (`lib/engine4/ledger.ts`) against what today's engine reads
 * (docs/design/engine4.md, "Statement ledger").
 *
 *   npx tsx scripts/engine4/shadow-ledger.ts [--corpus <MANIFEST.json> --group <g>] [--kinds]
 *
 * For every L1 statement of the corpus: its effect class, and whether today's engine **judges** it — a finding
 * whose lines cover it, a coverage gap on its line, or a node of the process skeleton anchored on it — or
 * passes it **silently**. A file today calls `coverage.complete` that holds silent statements of an effect
 * class (not `declaration`/`structure`) is a silent gap: the claim "complete" rests on nothing for them.
 * Never reads the holdout.
 */
import { buildAbapEvidence } from '../../lib/abap/evidence-model';
import { buildProcessSkeleton } from '../../lib/abap/process-skeleton';
import { readSource } from '../../lib/engine4/index';
import { references } from '../../lib/engine4/references';
import { effectOf, ENGINE4_CONSUMERS, ledger, NEUTRAL_CLASSES, referencesByStatement, type EffectClass } from '../../lib/engine4/ledger';
import { corpusFromArgs, type CorpusFile } from './shadow';

export interface LedgerShadow {
  files: number;
  statements: number;
  /** Per effect class: statements, judged by today, silent. */
  byClass: Record<string, { total: number; judged: number; silent: number }>;
  /** Per kind: statements, judged, silent, effect. */
  byKind: Record<string, { effect: EffectClass; total: number; judged: number; silent: number }>;
  /** Files today calls complete. */
  completeToday: number;
  /** …of them with silent statements of an effect class. */
  silentGapFiles: number;
  /** Silent effect statements in files today calls complete. */
  silentGapStatements: number;
  /** Engine 4's own ledger (ENGINE4_CONSUMERS): complete files and unclaimed statements. */
  engine4Complete: number;
  engine4Unclaimed: number;
  failures: string[];
}

export function runLedgerShadow(corpus: CorpusFile[]): LedgerShadow {
  const r: LedgerShadow = {
    files: 0, statements: 0, byClass: {}, byKind: {}, completeToday: 0, silentGapFiles: 0, silentGapStatements: 0,
    engine4Complete: 0, engine4Unclaimed: 0, failures: [],
  };
  for (const file of corpus) {
    r.files += 1;
    const { statements: list, tree } = readSource(file.source);
    const table = references(list, tree);
    const refs = referencesByStatement(table);
    const judged = new Uint8Array(file.source.split('\n').length + 2);
    let complete = false;
    try {
      const ev = buildAbapEvidence(file.source, `${file.name.replace(/[^\w.]/g, '_')}`, 'private');
      complete = ev.coverage.complete;
      for (const f of ev.findings) for (let l = f.lineStart; l <= (f.lineEnd ?? f.lineStart); l++) if (l < judged.length) judged[l] = 1;
      for (const u of ev.coverage.unassessed) if (u.line < judged.length) judged[u.line] = 1;
      const sk = buildProcessSkeleton(file.source);
      for (const n of sk.nodes) {
        const a = n.anchor as { lineStart?: number; lineEnd?: number } | null;
        if (a?.lineStart) for (let l = a.lineStart; l <= (a.lineEnd ?? a.lineStart); l++) if (l < judged.length) judged[l] = 1;
      }
    } catch (e) {
      r.failures.push(`${file.name}: ${(e as Error).message}`);
      continue;
    }
    if (complete) r.completeToday += 1;
    let silentHere = 0;
    for (const s of list) {
      r.statements += 1;
      const effect = effectOf(s, refs);
      let hit = false;
      for (let l = s.start.row; l <= s.end.row && !hit; l++) hit = judged[l] === 1;
      const c = (r.byClass[effect] ??= { total: 0, judged: 0, silent: 0 });
      const k = (r.byKind[s.kind] ??= { effect, total: 0, judged: 0, silent: 0 });
      c.total += 1;
      k.total += 1;
      if (hit) { c.judged += 1; k.judged += 1; } else { c.silent += 1; k.silent += 1; }
      if (!hit && !NEUTRAL_CLASSES.has(effect) && complete) silentHere += 1;
    }
    if (silentHere) { r.silentGapFiles += 1; r.silentGapStatements += silentHere; }
    const own = ledger(list, ENGINE4_CONSUMERS, { references: table });
    if (own.complete) r.engine4Complete += 1;
    r.engine4Unclaimed += own.unclaimedKinds.reduce((a, b) => a + b.count, 0);
  }
  return r;
}

if (require.main === module) {
  const r = runLedgerShadow(corpusFromArgs());
  console.log(`files ${r.files}, statements ${r.statements}; failures ${r.failures.length}`);
  console.log(`today: complete ${r.completeToday} files; of them with silent effect statements ${r.silentGapFiles} (${r.silentGapStatements} statements)`);
  console.log(`engine 4 ledger (L4 only): complete ${r.engine4Complete} files, unclaimed statements ${r.engine4Unclaimed}`);
  console.log('by effect class: total / judged today / silent');
  for (const [k, v] of Object.entries(r.byClass).sort((a, b) => b[1].total - a[1].total)) console.log(`  ${k}: ${v.total} / ${v.judged} / ${v.silent}`);
  const never = Object.entries(r.byKind).filter(([, v]) => v.judged === 0 && !NEUTRAL_CLASSES.has(v.effect));
  console.log(`kinds of an effect class today never judges: ${never.length}`);
  if (process.argv.includes('--kinds')) for (const [k, v] of never.sort((a, b) => b[1].total - a[1].total)) console.log(`  ${k} (${v.effect}): ${v.total}`);
  for (const f of r.failures.slice(0, 5)) console.log(`  failure ${f}`);
}
