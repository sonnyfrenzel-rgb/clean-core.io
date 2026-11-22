/**
 * Shadow of the L4 reference table (`lib/engine4/references.ts`) against what
 * the shipping engine reports today (docs/design/engine4.md, "L4: references").
 *
 *   npx tsx scripts/engine4/shadow-references.ts            # starter examples + learn halves
 *   npx tsx scripts/engine4/shadow-references.ts --corpus <MANIFEST.json> [--group <g>]
 *   … --samples                                              # plus unreported C/D references
 *
 * For every reference the source does not define itself:
 *
 *   - **catalog:** what SAP's files say about the name (`gradeSapObject`,
 *     `lib/abap/catalog-service.ts` — read by this script only, never by
 *     `lib/engine4/`): level A–D, or not listed;
 *   - **reported:** whether `buildAbapEvidence` (today's engine) names the
 *     object in a finding: on the reference's line, or anywhere in the program.
 *
 * The gap the external review named — classes, interfaces and exception
 * classes that SAP lists as C or D and today's evidence never names — is the
 * `unreported C/D` column. Never reads the holdout.
 */
import { buildAbapEvidence } from '../../lib/abap/evidence-model';
import { gradeSapObject } from '../../lib/abap/catalog-service';
// Aliased: engine 4's reader takes no engine version, and `readSource` is the name of a versioned reader
// `tests/engine-version-callers.spec.ts` checks.
import { readSource as readEngine4Source } from '../../lib/engine4/index';
import { references, type Reference, type ReferenceKind } from '../../lib/engine4/references';
import { corpusFromArgs, type CorpusFile } from './shadow';
import { APP_VERSION } from '../../lib/version';

interface Row {
  total: number;
  defined: number;
  dynamicResolved: number;
  dynamicOpen: number;
  listed: number;
  grades: Record<string, number>;
  reportedAtLine: number;
  reportedAnywhere: number;
  unreportedCD: number;
}

export interface ReferenceShadow {
  files: number;
  failures: number;
  /** Objects a finding of today names that the reference table does not hold, by finding kind. */
  missed: Record<string, number>;
  missedSamples: Array<{ file: string; line: number; finding: string; name: string }>;
  byKind: Record<string, Row>;
  samples: Array<{ file: string; row: number; kind: ReferenceKind; name: string; use: string; grade: string }>;
}

const DYNAMIC = new Set(['constant', 'value', 'assigned', 'onlyValue']);

function rowOf(r: ReferenceShadow, kind: string): Row {
  return (r.byKind[kind] ??= { total: 0, defined: 0, dynamicResolved: 0, dynamicOpen: 0, listed: 0, grades: {}, reportedAtLine: 0, reportedAnywhere: 0, unreportedCD: 0 });
}

export function shadowFile(r: ReferenceShadow, file: CorpusFile): void {
  r.files += 1;
  const read = readEngine4Source(file.source);
  const table = references(read.statements, read.tree);
  let named: Array<{ name: string; from: number; to: number; kind: string }> = [];
  try {
    const evidence = buildAbapEvidence(file.source, file.name.split('/').pop() ?? 'z.abap', 'private', undefined, APP_VERSION);
    named = evidence.findings
      .filter((f) => f.objectName)
      .map((f) => ({ name: f.objectName!.toUpperCase(), from: f.lineStart, to: f.lineEnd ?? f.lineStart, kind: f.kind }));
  } catch {
    r.failures += 1;
  }
  const held = new Set(table.references.map((x) => x.name));
  for (const n of named) {
    if (held.has(n.name)) continue;
    r.missed[n.kind] = (r.missed[n.kind] ?? 0) + 1;
    if (r.missedSamples.length < 200) r.missedSamples.push({ file: file.name, line: n.from, finding: n.kind, name: n.name });
  }
  for (const ref of table.references) {
    const row = rowOf(r, ref.kind);
    row.total += 1;
    if (ref.defined) { row.defined += 1; continue; }
    if (ref.resolution === 'dynamic') { row.dynamicOpen += 1; continue; }
    if (DYNAMIC.has(ref.resolution)) row.dynamicResolved += 1;
    tally(r, row, ref, named, file.name);
  }
}

function tally(r: ReferenceShadow, row: Row, ref: Reference, named: ReadonlyArray<{ name: string; from: number; to: number }>, file: string): void {
  const name = ref.name!;
  const graded = gradeSapObject(name);
  const grade = graded.provenance === 'catalog' || graded.provenance === 'catalog-residual' ? graded.grade : 'unlisted';
  row.grades[grade] = (row.grades[grade] ?? 0) + 1;
  if (grade !== 'unlisted') row.listed += 1;
  const atLine = named.some((n) => n.name === name && n.from <= ref.row && ref.row <= n.to);
  const anywhere = named.some((n) => n.name === name);
  if (atLine) row.reportedAtLine += 1;
  if (anywhere) row.reportedAnywhere += 1;
  if (!anywhere && (grade === 'C' || grade === 'D')) {
    row.unreportedCD += 1;
    if (r.samples.length < 400) r.samples.push({ file, row: ref.row, kind: ref.kind, name, use: ref.use, grade });
  }
}

export function runReferenceShadow(corpus: CorpusFile[]): ReferenceShadow {
  const r: ReferenceShadow = { files: 0, failures: 0, missed: {}, missedSamples: [], byKind: {}, samples: [] };
  for (const file of corpus) shadowFile(r, file);
  return r;
}

export function formatReferenceShadow(r: ReferenceShadow, samples = false): string {
  const out = [`files ${r.files}, evidence failures ${r.failures}`];
  out.push('kind | refs | defined in source | dynamic resolved | dynamic open | SAP-listed | A/B/C/D | named by today at line / anywhere | unreported C/D');
  const sum: Row = { total: 0, defined: 0, dynamicResolved: 0, dynamicOpen: 0, listed: 0, grades: {}, reportedAtLine: 0, reportedAnywhere: 0, unreportedCD: 0 };
  for (const [kind, x] of Object.entries(r.byKind).sort((a, b) => b[1].total - a[1].total)) {
    const g = (k: string) => x.grades[k] ?? 0;
    out.push(`${kind} | ${x.total} | ${x.defined} | ${x.dynamicResolved} | ${x.dynamicOpen} | ${x.listed} | ${g('A')}/${g('B')}/${g('C')}/${g('D')} | ${x.reportedAtLine} / ${x.reportedAnywhere} | ${x.unreportedCD}`);
    for (const k of ['total', 'defined', 'dynamicResolved', 'dynamicOpen', 'listed', 'reportedAtLine', 'reportedAnywhere', 'unreportedCD'] as const) sum[k] += x[k];
  }
  out.push(`all | ${sum.total} | ${sum.defined} | ${sum.dynamicResolved} | ${sum.dynamicOpen} | ${sum.listed} | - | ${sum.reportedAtLine} / ${sum.reportedAnywhere} | ${sum.unreportedCD}`);
  out.push(`named by today, not in the table: ${JSON.stringify(r.missed)}`);
  if (samples) for (const s of [...r.missedSamples, ...r.samples]) out.push(JSON.stringify(s));
  return out.join('\n');
}

if (require.main === module) {
  console.log(formatReferenceShadow(runReferenceShadow(corpusFromArgs()), process.argv.includes('--samples')));
}
