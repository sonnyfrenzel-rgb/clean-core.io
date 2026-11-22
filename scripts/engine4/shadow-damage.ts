/**
 * Damage shadow of engine 4.0's L2 against the shipping `readBlocks`.
 *
 *   npx tsx scripts/engine4/shadow-damage.ts            # summary and categories
 *   npx tsx scripts/engine4/shadow-damage.ts --samples  # plus samples per category
 *   npx tsx scripts/engine4/shadow-damage.ts --corpus <MANIFEST.json> [--group <g>]  # an external sample
 *
 * The clean corpus has no unclosed block, so the plain shadow (`shadow.ts`) can
 * only show that both engines agree on well-formed code. Recovery is where the
 * two layers differ, so this script damages the corpus on purpose: in every
 * file it deletes one closer line (ENDIF, ENDFORM, …; a line holding nothing
 * but that closer) at up to three fixed positions — a quarter, half and three
 * quarters through the file's closers — and reads the damaged file with both
 * engines. Same corpus as `shadow.ts`: the starter examples and the benchmark
 * learn halves, never the holdout.
 *
 * For each damage it measures, per engine:
 *
 *   - **victim flagged:** the block whose closer was deleted is reported as
 *     unterminated (a SELECT loop is exempt: without ENDSELECT it is no loop);
 *   - **collateral:** the other regions (blocks of the old kinds, routines,
 *     function modules, event blocks) whose first or last line moved against
 *     the reading of the undamaged file, or which vanished or appeared;
 *   - **false flags:** unterminated reports on any block but the victim that
 *     the engine does not already give on the undamaged file (those are counted
 *     apart: the clean corpus has none, a real-code sample can).
 *
 * Where the two engines differ, the difference is put into a named category.
 * Nothing here is wired into the product.
 */
import { readStatements } from '../../lib/abap/statement-reader';
import { readBlocks } from '../../lib/abap/block-structure';
import { lex } from '../../lib/engine4/lexer';
import { statements } from '../../lib/engine4/statements';
import { kindInfo } from '../../lib/engine4/statement-kinds';
import { blocks as newBlocks } from '../../lib/engine4/blocks';
import { corpusFromArgs, macrosByFile, shadowCorpus, type CorpusFile } from './shadow';

const REGION_KINDS = new Set([
  'if', 'case', 'loop', 'do', 'while', 'try', 'select', 'at', 'provide', 'form', 'method', 'module', 'class', 'interface', 'define', 'function', 'event',
]);

interface Reading {
  /** `kind@firstLine` → last line. */
  regions: Map<string, number>;
  /** First lines of the blocks reported unterminated. */
  unterminated: Set<number>;
}

function readOld(source: string): Reading {
  const s = readBlocks(readStatements(source));
  const regions = new Map<string, number>();
  for (const b of s.blocks) regions.set(`${b.kind}@${b.lineStart}`, b.lineEnd);
  for (const c of s.containers) regions.set(`${c.kind}@${c.lineStart}`, c.lineEnd);
  return { regions, unterminated: new Set(s.unterminated.map((u) => u.lineStart)) };
}

function readNew(source: string, macros: string[]): Reading {
  const tree = newBlocks(statements(lex(source).tokens, { macros }));
  const regions = new Map<string, number>();
  for (const b of tree.blocks) if (REGION_KINDS.has(b.kind)) regions.set(`${b.kind}@${b.start.row}`, b.end.row);
  return { regions, unterminated: new Set(tree.blocks.filter((b) => b.termination === 'unclosed').map((b) => b.start.row)) };
}

interface Damage {
  file: CorpusFile;
  /** 1-based line deleted. */
  line: number;
  closer: string;
  /** Kind and first line of the block the closer closed, in the undamaged file (new reading). */
  victim: { kind: string; line: number };
  source: string;
  /** Last line of the damaged source. */
  lastLine: number;
}

/** Up to three closer lines per file, at fixed positions. */
export function damages(file: CorpusFile, macros: string[]): Damage[] {
  const list = statements(lex(file.source).tokens, { macros });
  const tree = newBlocks(list);
  const lines = file.source.split('\n');
  const closers = tree.blocks.filter((b) => {
    if (b.closer === null || !REGION_KINDS.has(b.kind)) return false;
    const st = list[b.closer];
    const text = lines[st.start.row - 1].replace(/".*$/, '').trim();
    return st.start.row === st.end.row && /^[A-Za-z-]+\s*\.$/.test(text) && list.every((s) => s === st || s.start.row !== st.start.row);
  });
  closers.sort((a, b) => (a.closer as number) - (b.closer as number));
  const picks = new Set<number>();
  for (const q of [1, 2, 3]) if (closers.length) picks.add(Math.floor((q * closers.length) / 4) % closers.length);
  return [...picks].map((k) => {
    const b = closers[k];
    const st = list[b.closer as number];
    const kept = lines.slice();
    kept.splice(st.start.row - 1, 1);
    return {
      file,
      line: st.start.row,
      closer: kindInfo(st.kind).keyword ?? st.kind,
      victim: { kind: b.kind, line: b.start.row },
      source: kept.join('\n'),
      lastLine: kept.length,
    };
  });
}

interface Outcome {
  victimFlagged: boolean;
  collateral: string[];
  /** Unterminated reports on other blocks that the undamaged file does not have. */
  falseFlags: number[];
  /** Unterminated reports the engine already gives on the undamaged file (shifted): not caused by the damage. */
  preexisting: number[];
}

/** Compare the damaged reading with the clean one, lines behind the deleted one shifted up by one. */
function outcome(clean: Reading, damaged: Reading, d: Damage): Outcome {
  const shift = (line: number) => (line > d.line ? line - 1 : line);
  const victimKey = `${d.victim.kind}@${d.victim.line}`;
  const collateral: string[] = [];
  const expected = new Map<string, number>();
  for (const [key, last] of clean.regions) {
    if (key === victimKey) continue;
    const [kind, line] = key.split('@');
    expected.set(`${kind}@${shift(Number(line))}`, shift(last));
  }
  const victimNow = `${d.victim.kind}@${shift(d.victim.line)}`;
  for (const [key, last] of expected) {
    const now = damaged.regions.get(key);
    if (now === undefined) collateral.push(`${key} vanished`);
    else if (now !== last) collateral.push(`${key} ends ${now} not ${last}`);
  }
  for (const key of damaged.regions.keys()) if (key !== victimNow && !expected.has(key)) collateral.push(`${key} appeared`);
  const victimLine = shift(d.victim.line);
  const before = new Set([...clean.unterminated].map(shift));
  return {
    victimFlagged: d.victim.kind === 'select' || damaged.unterminated.has(victimLine),
    collateral,
    falseFlags: [...damaged.unterminated].filter((l) => l !== victimLine && !before.has(l)),
    preexisting: [...damaged.unterminated].filter((l) => l !== victimLine && before.has(l)),
  };
}

export interface DamageReport {
  damages: number;
  old: { victimFlagged: number; withCollateral: number; collateral: number; falseFlags: number; preexisting: number };
  new: { victimFlagged: number; withCollateral: number; collateral: number; falseFlags: number; preexisting: number };
  categories: Record<string, number>;
  samples: Record<string, string[]>;
}

/**
 * Why the engines recover differently from one damage. The first rule that fits
 * wins; `unexplained` collects the rest.
 */
export function categorizeDamage(d: Damage, o: Outcome, n: Outcome): string {
  const better = n.collateral.length <= o.collateral.length && n.falseFlags.length <= o.falseFlags.length && (n.victimFlagged || !o.victimFlagged);
  if (d.victim.kind === 'function' && !o.victimFlagged && n.victimFlagged) return 'function-module-is-a-block';
  const sameButPreexisting = o.victimFlagged === n.victimFlagged && o.collateral.join('|') === n.collateral.join('|') && o.falseFlags.join('|') === n.falseFlags.join('|');
  if (sameButPreexisting) return 'flags-the-engine-already-gives-on-the-undamaged-file';
  if (d.victim.kind === 'define' && !better) return 'unclosed-macro-body-reads-on-as-macro';
  if (better && !o.victimFlagged && n.victimFlagged) return 'indentation-picks-the-block-that-lost-its-closer';
  if (better && o.collateral.length > 0 && o.collateral.every((c) => c.startsWith('module@'))) return 'flow-logic-module-is-a-call';
  const toEnd = (c: string[]) => c.filter((x) => x.includes(` ends ${d.lastLine} not `)).length;
  if (better && toEnd(o.collateral) > toEnd(n.collateral)) return 'open-block-ends-with-its-routine-not-at-end-of-source';
  if (better && ['form', 'method', 'module', 'class', 'interface', 'function', 'event'].includes(d.victim.kind)) return 'routine-ends-at-next-routine';
  return 'unexplained';
}

export function runDamageShadow(corpus: CorpusFile[] = shadowCorpus()): DamageReport {
  const r: DamageReport = {
    damages: 0,
    old: { victimFlagged: 0, withCollateral: 0, collateral: 0, falseFlags: 0, preexisting: 0 },
    new: { victimFlagged: 0, withCollateral: 0, collateral: 0, falseFlags: 0, preexisting: 0 },
    categories: {},
    samples: {},
  };
  const macrosByName = macrosByFile(corpus);
  for (const file of corpus) {
    const macros = macrosByName.get(file.name) ?? [];
    const cleanOld = readOld(file.source);
    const cleanNew = readNew(file.source, macros);
    for (const d of damages(file, macros)) {
      r.damages += 1;
      const o = outcome(cleanOld, readOld(d.source), d);
      const n = outcome(cleanNew, readNew(d.source, macros), d);
      for (const [side, out] of [['old', o], ['new', n]] as const) {
        const t = r[side];
        if (out.victimFlagged) t.victimFlagged += 1;
        if (out.collateral.length) t.withCollateral += 1;
        t.collateral += out.collateral.length;
        t.falseFlags += out.falseFlags.length;
        t.preexisting += out.preexisting.length;
      }
      const same = o.victimFlagged === n.victimFlagged && o.collateral.join('|') === n.collateral.join('|') && o.falseFlags.join('|') === n.falseFlags.join('|') &&
        o.preexisting.length === n.preexisting.length;
      if (same) continue;
      const category = categorizeDamage(d, o, n);
      r.categories[category] = (r.categories[category] ?? 0) + 1;
      const list = (r.samples[category] ??= []);
      if (list.length < 50) {
        list.push(
          `${file.name}: ${d.closer} on line ${d.line} deleted (closed ${d.victim.kind}@${d.victim.line})\n` +
          `    old: flagged ${o.victimFlagged}, collateral ${o.collateral.length} ${o.collateral.slice(0, 4).join('; ')}, false flags ${o.falseFlags.join(',') || '-'}, already on the undamaged file ${o.preexisting.length}\n` +
          `    new: flagged ${n.victimFlagged}, collateral ${n.collateral.length} ${n.collateral.slice(0, 4).join('; ')}, false flags ${n.falseFlags.join(',') || '-'}, already on the undamaged file ${n.preexisting.length}`,
        );
      }
    }
  }
  return r;
}

export function formatDamage(r: DamageReport, withSamples: boolean): string {
  const side = (name: string, t: DamageReport['old']) =>
    `${name}: victim flagged ${t.victimFlagged}/${r.damages}, damages with collateral ${t.withCollateral}, collateral regions ${t.collateral}, false unterminated ${t.falseFlags} (plus ${t.preexisting} already reported on the undamaged file)`;
  const lines = [
    `damages ${r.damages}`,
    side('old', r.old),
    side('new', r.new),
    'categories of different outcomes:',
    ...Object.entries(r.categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
  ];
  if (withSamples) for (const [k, list] of Object.entries(r.samples)) lines.push(`--- ${k}`, ...list.map((s) => `  ${s}`));
  return lines.join('\n');
}

if (require.main === module) {
  console.log(formatDamage(runDamageShadow(corpusFromArgs()), process.argv.includes('--samples')));
}
