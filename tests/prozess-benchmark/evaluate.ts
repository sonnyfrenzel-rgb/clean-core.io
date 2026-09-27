/**
 * Prozess-Benchmark: die Engine über 100 konstruierte ABAP-Fälle.
 *
 * Aufruf (aus dem Repo-Wurzelverzeichnis):
 *   KORPUS_ROOT=tests/prozess-benchmark npx tsx tests/prozess-benchmark/evaluate.ts [--out <datei.json>]
 *
 * Mit KORPUS_ROOT=tests/korpus läuft dieselbe Messung über den Referenzkorpus —
 * so entstehen die beiden Vergleichszahlen im Bericht.
 *
 * Kein Spec und kein CI-Teil: eine Messung, keine Ratsche. Die Vergleiche je
 * Aussageklasse kommen unverändert aus `tests/helpers/korpus-comparison.ts`;
 * hier kommen nur feinere Zähler dazu (je Knotenart, Lokalisierung ohne
 * Brücke, Zusatzknoten der Engine), die der Vergleicher nur als Prosa führt.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  KORPUS_ROOT,
  SKELETON_BRIDGES,
  compareCase,
  readCases,
  readWithEngine,
  type ClassResult,
  type KorpusCase,
} from '../helpers/korpus-comparison';
import type { SkeletonEdgeKind } from '../../lib/abap/process-skeleton';

const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? process.argv[outArg + 1] : join(KORPUS_ROOT, 'results.json');

// Der Benchmark bekommt sein Manifest bei jedem Lauf aus seinen Ordnern; der
// Referenzkorpus behält sein eigenes (dort sind keine BM-Ordner).
const manifestPath = join(KORPUS_ROOT, 'manifest.json');
// Ein Ordner ohne expected.json ist ein Fall, der noch geschrieben wird — nicht messen.
const benchmarkIds = readdirSync(join(KORPUS_ROOT, 'cases'))
  .filter((name) => /^BM-\d{3}$/.test(name) && existsSync(join(KORPUS_ROOT, 'cases', name, 'expected.json')))
  .sort();
const ONLY = process.env.BM_RANGE?.split('-').map(Number);
const ids = ONLY ? benchmarkIds.filter((id) => Number(id.slice(3)) >= ONLY[0] && Number(id.slice(3)) <= ONLY[1]) : benchmarkIds;
if (ids.length > 0) {
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        book: { path: 'tests/prozess-benchmark', sha256: 'n/a', caseCount: ids.length },
        cases: ids.map((id) => ({
          id,
          files: readdirSync(join(KORPUS_ROOT, 'cases', id))
            .filter((name) => name.endsWith('.abap'))
            .map((name) => ({ name, sha256: 'n/a' })),
        })),
      },
      null,
      2,
    ),
  );
}

const EDGE_WORDS: Array<{ re: RegExp; kinds: SkeletonEdgeKind[] }> = [
  { re: /^(always|normal return|call returns.*|.*returns normally)$/i, kinds: ['sequence', 'default'] },
  { re: /^next iteration$/i, kinds: ['loop-back'] },
  { re: /^(next row|for each .*)$/i, kinds: ['sequence', 'conditional'] },
  { re: /^(no more rows|exhausted)$/i, kinds: ['sequence', 'default'] },
  { re: /^(sonst|other command|else)$/i, kinds: ['default', 'conditional'] },
];
const edgeKinds = (condition: string | null): SkeletonEdgeKind[] =>
  EDGE_WORDS.find((entry) => entry.re.test((condition ?? '').trim()))?.kinds ?? ['conditional', 'default', 'boundary'];

interface NodeOutcome {
  id: string;
  type: string;
  file: string;
  line: number | null;
  /** hit | wrong-kind | missed | no-bridge | no-anchor */
  outcome: string;
  /** Liegt irgendein Engine-Knoten an dieser Anweisung (unabhängig von der Art)? */
  located: boolean;
  engineKinds: string[];
  statement: string;
}

interface CaseOutcome {
  id: string;
  meta: Record<string, unknown>;
  loc: number;
  files: number;
  classes: Record<string, { state: string; verdict: string | null; scope: { compared: number; total: number }; aspects: ClassResult['aspects'] }>;
  nodes: NodeOutcome[];
  edges: { total: number; comparable: number; hit: number; missing: number; wrongKind: number };
  engine: { nodes: number; edges: number; extraNodes: number; kinds: Record<string, number>; notes: string[] };
  produced: Array<{ text: string; anchors: string }>;
  expectedStatements: number;
  crashed?: string;
}

function evaluate(korpusCase: KorpusCase): CaseOutcome {
  const dir = join(KORPUS_ROOT, 'cases', korpusCase.id);
  const metaPath = join(dir, 'meta.json');
  const meta = existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>) : {};
  const loc = korpusCase.sources.reduce((sum, source) => sum + source.lineCount, 0);
  const base: CaseOutcome = {
    id: korpusCase.id,
    meta,
    loc,
    files: korpusCase.sources.length,
    classes: {},
    nodes: [],
    edges: { total: korpusCase.expected.skeleton?.edges?.length ?? 0, comparable: 0, hit: 0, missing: 0, wrongKind: 0 },
    engine: { nodes: 0, edges: 0, extraNodes: 0, kinds: {}, notes: [] },
    produced: [],
    expectedStatements: korpusCase.expected.businessStatements?.length ?? 0,
  };
  let reading;
  try {
    reading = readWithEngine(korpusCase);
  } catch (error) {
    return { ...base, crashed: String((error as Error)?.stack ?? error).slice(0, 800) };
  }
  for (const result of compareCase(korpusCase, reading)) {
    base.classes[result.class] = { state: result.state, verdict: result.verdict, scope: result.scope, aspects: result.aspects };
  }
  const byFile = new Map(reading.perFile.map((entry) => [entry.file, entry]));
  const defaultFile = korpusCase.sources[0]?.name ?? '';
  const resolved = new Map<string, string>();
  const claimedStatements = new Set<string>();

  for (const node of korpusCase.expected.skeleton.nodes) {
    const file = node.anchor?.file ?? defaultFile;
    const entry = byFile.get(file);
    const line = node.anchor?.line ?? null;
    const outcome: NodeOutcome = { id: node.id, type: node.type ?? '?', file, line, outcome: 'no-anchor', located: false, engineKinds: [], statement: '' };
    if (!entry || line == null) {
      base.nodes.push(outcome);
      continue;
    }
    const statement = entry.statements.find((candidate) => candidate.lineStart <= line && candidate.lineEnd >= line);
    const from = statement?.lineStart ?? line;
    const to = statement?.lineEnd ?? line;
    claimedStatements.add(`${file}:${from}`);
    outcome.statement = (statement?.text ?? '').slice(0, 90);
    const atAnchor = entry.skeleton.nodes.filter(
      (candidate) => candidate.anchor != null && candidate.anchor.lineStart >= from && candidate.anchor.lineStart <= to,
    );
    outcome.located = atAnchor.length > 0;
    outcome.engineKinds = [...new Set(atAnchor.map((candidate) => candidate.kind))];
    const bridges = SKELETON_BRIDGES.filter((bridge) => bridge.type === node.type && bridge.construct.test(statement?.text ?? ''));
    if (bridges.length === 0) {
      outcome.outcome = 'no-bridge';
    } else if (atAnchor.length === 0) {
      outcome.outcome = 'missed';
    } else {
      const allowed = new Set<string>(bridges.flatMap((bridge) => bridge.kinds));
      const match = atAnchor.find((candidate) => allowed.has(candidate.kind));
      if (match) {
        outcome.outcome = 'hit';
        resolved.set(node.id, match.id);
      } else outcome.outcome = 'wrong-kind';
    }
    base.nodes.push(outcome);
  }

  const engineEdges = reading.perFile.flatMap((entry) => entry.skeleton.edges);
  for (const edge of korpusCase.expected.skeleton.edges) {
    const fromId = resolved.get(edge.from);
    const toId = resolved.get(edge.to);
    if (!fromId || !toId) continue;
    base.edges.comparable += 1;
    const candidates = engineEdges.filter((candidate) => candidate.from === fromId && candidate.to === toId);
    if (candidates.length === 0) base.edges.missing += 1;
    else if (candidates.some((candidate) => edgeKinds(edge.condition).includes(candidate.kind))) base.edges.hit += 1;
    else base.edges.wrongKind += 1;
  }

  for (const entry of reading.perFile) {
    base.engine.nodes += entry.skeleton.nodes.length;
    base.engine.edges += entry.skeleton.edges.length;
    for (const node of entry.skeleton.nodes) {
      base.engine.kinds[node.kind] = (base.engine.kinds[node.kind] ?? 0) + 1;
      if (!node.anchor || node.kind === 'start' || node.kind === 'end') continue;
      const statement = entry.statements.find((candidate) => candidate.lineStart <= node.anchor!.lineStart && candidate.lineEnd >= node.anchor!.lineStart);
      if (!claimedStatements.has(`${entry.file}:${statement?.lineStart ?? node.anchor.lineStart}`)) base.engine.extraNodes += 1;
    }
    for (const note of entry.skeleton.notes ?? []) base.engine.notes.push(`${entry.file}:${note.reason}`);
  }
  base.produced = reading.businessStatements.map((statement) => ({
    text: statement.text,
    anchors: statement.anchors.map((anchor) => `${anchor.file ?? ''}:${anchor.line ?? ''}`).join(','),
  }));
  return base;
}

/**
 * BM_CONCAT=1: jeder Mehrdateifall wird zu **einer** Quelle zusammengefügt —
 * so, wie ein Nutzer ein Programm mit Includes ins Produkt einfügt (die
 * Analyse-Seite nimmt genau eine Quelle an). Die Datei mit REPORT/PROGRAM/
 * FUNCTION-POOL steht vorn, der Rest in Byte-Reihenfolge der Namen (nicht
 * `localeCompare`: das sortiert `_` je nach Gebietsschema anders als jedes
 * andere Werkzeug, und die Zeilennummern liefen auseinander); jeder Sollanker
 * wird auf die Zeile in der zusammengefügten Quelle umgerechnet.
 */
function concatenate(korpusCase: KorpusCase): KorpusCase {
  if (korpusCase.sources.length < 2) return korpusCase;
  const head = (code: string) => /^\s*(REPORT|PROGRAM|FUNCTION-POOL)\b/im.test(code);
  const ordered = [...korpusCase.sources].sort((a, b) => Number(head(b.code)) - Number(head(a.code)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const offset = new Map<string, number>();
  let lines: string[] = [];
  for (const source of ordered) {
    offset.set(source.name, lines.length);
    const own = source.code.split('\n');
    if (own[own.length - 1] === '') own.pop();
    lines = lines.concat(own);
  }
  const name = 'combined.abap';
  const remap = <T extends { file: string | null; line: number | null; raw?: string } | null>(anchor: T): T => {
    if (!anchor || anchor.line == null) return anchor;
    const line = anchor.line + (offset.get(anchor.file ?? ordered[0].name) ?? 0);
    return { ...anchor, file: name, line, raw: `${name}:${line}` };
  };
  const expected = JSON.parse(JSON.stringify(korpusCase.expected)) as KorpusCase['expected'];
  for (const node of expected.skeleton.nodes) node.anchor = remap(node.anchor);
  for (const statement of expected.businessStatements) statement.anchors = statement.anchors.map((anchor) => remap(anchor)!);
  for (const object of expected.objects) object.anchor = remap(object.anchor);
  const code = lines.join('\n') + '\n';
  return { ...korpusCase, expected, sources: [{ name, code, lineCount: lines.length }] };
}

const cases = process.env.BM_CONCAT === '1' ? readCases().map(concatenate) : readCases();
const outcomes = cases.map(evaluate);
writeFileSync(OUT, JSON.stringify({ root: KORPUS_ROOT, written: new Date().toISOString(), outcomes }, null, 2));

// --- Kurzbericht auf die Konsole --------------------------------------------
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const pct = (a: number, b: number) => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)} %`);
const all = outcomes.flatMap((o) => o.nodes);
const count = (outcome: string) => all.filter((node) => node.outcome === outcome).length;
const comparable = count('hit') + count('missed') + count('wrong-kind');
console.log(`Fälle: ${outcomes.length}, abgestürzt: ${outcomes.filter((o) => o.crashed).length}`);
console.log(`Sollknoten: ${all.length}; vergleichbar ${comparable} (${pct(comparable, all.length)})`);
console.log(`  getroffen ${count('hit')} (${pct(count('hit'), comparable)} der vergleichbaren), andere Art ${count('wrong-kind')}, ohne Knoten ${count('missed')}, ohne Brücke ${count('no-bridge')}, ohne Anker ${count('no-anchor')}`);
console.log(`  lokalisiert (irgendein Engine-Knoten an der Anweisung): ${all.filter((n) => n.located).length} (${pct(all.filter((n) => n.located).length, all.length)})`);
const edges = outcomes.map((o) => o.edges);
console.log(`Sollkanten: ${sum(edges.map((e) => e.total))}; vergleichbar ${sum(edges.map((e) => e.comparable))}; getroffen ${sum(edges.map((e) => e.hit))} (${pct(sum(edges.map((e) => e.hit)), sum(edges.map((e) => e.comparable)))}), fehlend ${sum(edges.map((e) => e.missing))}, andere Art ${sum(edges.map((e) => e.wrongKind))}`);
for (const cls of ['befunde', 'level', 'objekte', 'skelett', 'fachsaetze']) {
  const states = outcomes.map((o) => o.classes[cls]).filter(Boolean);
  const verdicts: Record<string, number> = {};
  for (const state of states) verdicts[state.verdict ?? 'agree'] = (verdicts[state.verdict ?? 'agree'] ?? 0) + 1;
  console.log(`Klasse ${cls}: ${JSON.stringify(verdicts)}`);
}
console.log(`Ergebnis: ${OUT}`);
