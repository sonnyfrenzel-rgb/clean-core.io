/**
 * Shadow proof of Phase 0 "parse once": `parseSource` (lib/engine4) against the
 * shipping readers it is meant to stand in for.
 *
 *   npx tsx scripts/engine4/shadow-parsed.ts            # summary
 *   npx tsx scripts/engine4/shadow-parsed.ts --samples  # plus the first differences
 *
 * Corpus: the starter examples and the benchmark learn halves
 * (`shadowCorpus()`, never the holdout). For every file, field by field:
 *
 *   - `compat` against `readStatements` — the whole `AbapStatement[]`, deep-equal;
 *   - `maskedText(i)` against `maskLiterals(readStatements(...)[i].text)`;
 *   - `maskNonCode()` / `maskComments()` against the shipping functions;
 *   - `containers` against `readBlocks(...).containers` (order included) and
 *     `containerAt(line)` against the shipping `containerAt` for every line.
 *
 * A reader of `lib/abap/` is a pure function of the statements (and the
 * source). On a file where all of these are identical, moving that reader onto
 * `ParsedSource` cannot change its output. Nothing here is wired into the product.
 */
import { readStatementsShipping as readStatements, maskLiterals, maskNonCode, maskComments, type AbapStatement } from '../../lib/abap/statement-reader';
import { readBlocks, containerAtScan as containerAt } from '../../lib/abap/block-structure';
import { parseSource, type ParsedSource } from '../../lib/engine4/parsed-source';
import { macroNames, statements } from '../../lib/engine4/statements';
import { lex } from '../../lib/engine4/lexer';
import { shadowCorpus, type CorpusFile } from './shadow';
import { damages } from './shadow-damage';

export interface ParsedShadowReport {
  files: number;
  lines: number;
  statements: number;
  /** Files whose compat list is deep-equal to `readStatements`. */
  statementsIdentical: number;
  statementsDiffer: number;
  /** Statements (over identical-length files) whose token-derived mask equals `maskLiterals(text)`. */
  masksIdentical: number;
  masksCompared: number;
  maskNonCodeIdentical: number;
  maskCommentsIdentical: number;
  containersIdentical: number;
  containerAtIdentical: number;
  /** Sources L2 had to recover (`ParsedSource.recovered`), and among the others the ones whose containers are identical. */
  recovered: number;
  containersIdenticalUnrecovered: number;
  /** First difference per file, by check. */
  samples: Array<{ file: string; check: string; old: string; new: string }>;
}

const FIELDS: Array<keyof AbapStatement> = ['text', 'keyword', 'lineStart', 'lineEnd', 'fromChain', 'chainHeadLine', 'nativeSql', 'index'];

function firstStatementDiff(old: AbapStatement[], now: ParsedSource['compat']): { i: number; field: string } | null {
  const n = Math.max(old.length, now.length);
  for (let i = 0; i < n; i++) {
    const a = old[i];
    const b = now[i];
    if (!a || !b) return { i, field: 'length' };
    for (const f of FIELDS) if (a[f] !== b[f]) return { i, field: f };
    // Same keys present, so a spread copy compares equal as a whole too.
    if (Object.keys(a).filter((k) => a[k as keyof AbapStatement] !== undefined).length !== Object.keys(b).filter((k) => b[k as keyof typeof b] !== undefined).length) return { i, field: 'keys' };
  }
  return null;
}

/** Macro names per upload, as L3 will pass them: every file of one case knows the others' macros. */
function macrosByGroup(corpus: CorpusFile[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of corpus) {
    const names = macroNames(statements(lex(f.source).tokens));
    out.set(f.group, [...(out.get(f.group) ?? []), ...names]);
  }
  return out;
}

export function compareFile(r: ParsedShadowReport, name: string, source: string, macros: string[] = []): void {
  const parsed = parseSource(source, { macros });
  const old = readStatements(source);
  const sample = (check: string, o: string, n: string) => { if (r.samples.length < 200) r.samples.push({ file: name, check, old: o, new: n }); };
  r.files += 1;
  r.lines += source.split('\n').length;
  r.statements += old.length;

  const diff = firstStatementDiff(old, parsed.compat);
  if (diff) {
    r.statementsDiffer += 1;
    const a = old[diff.i];
    const b = parsed.compat[diff.i];
    sample(`statements:${diff.field}`, a ? JSON.stringify(a) : '(none)', b ? JSON.stringify(b) : '(none)');
  } else r.statementsIdentical += 1;

  // Masks, statement by statement, where the lists line up.
  if (old.length === parsed.compat.length) {
    let reported = false;
    for (let i = 0; i < old.length; i++) {
      r.masksCompared += 1;
      const want = maskLiterals(old[i].text);
      if (parsed.maskedText(i) === want) r.masksIdentical += 1;
      else if (!reported) { reported = true; sample('maskLiterals', want, parsed.maskedText(i)); }
    }
  }
  if (parsed.maskNonCode() === maskNonCode(source)) r.maskNonCodeIdentical += 1;
  else sample('maskNonCode', firstLineDiff(maskNonCode(source), parsed.maskNonCode()), firstLineDiff(parsed.maskNonCode(), maskNonCode(source)));
  if (parsed.maskComments() === maskComments(source)) r.maskCommentsIdentical += 1;
  else sample('maskComments', firstLineDiff(maskComments(source), parsed.maskComments()), firstLineDiff(parsed.maskComments(), maskComments(source)));

  const oldContainers = readBlocks(old).containers;
  const sameContainers = JSON.stringify(oldContainers) === JSON.stringify(parsed.containers);
  if (parsed.recovered) r.recovered += 1;
  else if (sameContainers) r.containersIdenticalUnrecovered += 1;
  if (sameContainers) r.containersIdentical += 1;
  else sample('containers', JSON.stringify(oldContainers), JSON.stringify(parsed.containers));
  const lineCount = source.split(/\r?\n/).length;
  let atSame = true;
  for (let line = 1; line <= lineCount + 1 && atSame; line++) {
    if (JSON.stringify(containerAt(oldContainers, line)) !== JSON.stringify(parsed.containerAt(line))) {
      atSame = false;
      sample('containerAt', `${line}: ${JSON.stringify(containerAt(oldContainers, line))}`, JSON.stringify(parsed.containerAt(line)));
    }
  }
  if (atSame) r.containerAtIdentical += 1;
}

function firstLineDiff(a: string, b: string): string {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return `${i + 1}: ${JSON.stringify(x[i])}`;
  return '(same lines)';
}

export function emptyReport(): ParsedShadowReport {
  return {
    files: 0, lines: 0, statements: 0, statementsIdentical: 0, statementsDiffer: 0, masksIdentical: 0, masksCompared: 0,
    maskNonCodeIdentical: 0, maskCommentsIdentical: 0, containersIdentical: 0, containerAtIdentical: 0, recovered: 0, containersIdenticalUnrecovered: 0, samples: [],
  };
}

export function runParsedShadow(): ParsedShadowReport {
  const corpus = shadowCorpus();
  const macros = macrosByGroup(corpus);
  const r = emptyReport();
  for (const f of corpus) compareFile(r, f.name, f.source, macros.get(f.group));
  return r;
}

/**
 * The same checks on the damage corpus of `shadow-damage.ts` (one closer line
 * deleted at three places per file). Statements and masks do not depend on
 * blocks; the container index does, and there L2 recovers differently from
 * `readBlocks` by design (docs/design/engine4.md, "Shadow on damaged code").
 */
export function runParsedDamageShadow(): ParsedShadowReport {
  const corpus = shadowCorpus();
  const macros = macrosByGroup(corpus);
  const r = emptyReport();
  for (const f of corpus) {
    for (const d of damages(f, macros.get(f.group) ?? [])) compareFile(r, `${f.name}#-${d.line}`, d.source, macros.get(f.group));
  }
  return r;
}

/**
 * Hand-written edge cases outside the corpus, each a reading the two engines
 * are known or suspected to read differently. Reported, not hidden: a check
 * that differs here is a move that is neutral on the corpus but not on every
 * input, and needs a gate or a compat rule before it is wired.
 */
export const EDGE_CASES: Record<string, string> = {
  'template-expression-across-lines': "DATA(t) = |a{ to_upper(\n  lv ) }b|.\nWRITE t.",
  'unterminated-literal': "WRITE 'abc.\nWRITE 'x'.",
  'escaped-template-bar': 'DATA(t) = |Use \\| here. Done|.\nWRITE t.',
  'doubled-quote': "WRITE 'it''s'.\nWRITE `a``b`.",
  'pragma-in-chain': 'DATA: a TYPE i ##NEEDED, ##NEEDED b TYPE c.',
  'empty-chain-head': ': a, b.',
  'colon-twice': 'WRITE: / a: b, c.',
  'decimal': 'IF lv_rate > 0.5.\n  lv = 12.50.\nENDIF.',
  'exec-sql': "EXEC SQL.\n  SELECT COUNT(*) INTO :lv FROM vbak WHERE a = 'x.y'\nENDEXEC.\nWRITE lv.",
  'exec-sql-periods': 'EXEC SQL.\n  SELECT k.kunrg, p.netwr INTO :a, :b FROM t k\nENDEXEC.',
  'amdp': "CLASS c IMPLEMENTATION.\n  METHOD m BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT USING vbak.\n    lt = SELECT * FROM \"VBAK\";\n* note\n  ENDMETHOD.\nENDCLASS.",
  'indented-asterisk': 'lv = ( a - b )\n     * 100 / c.\n  * a comment\nWRITE lv.',
  'class-local-friends': 'CLASS a DEFINITION LOCAL FRIENDS b.\nFORM f.\nENDFORM.',
  'interface-load': 'INTERFACE i LOAD.\nFORM f.\nENDFORM.',
  'method-without-class': 'METHOD m.\n  WRITE 1.\nENDMETHOD.',
  'function-module': "FUNCTION z_f.\n  WRITE 1.\nENDFUNCTION.",
  'crlf-comment-apostrophe': "WRITE 1. \"it's\r\nWRITE 2.\r\n",
};

export function runParsedEdgeShadow(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, source] of Object.entries(EDGE_CASES)) {
    const r = emptyReport();
    compareFile(r, name, source);
    out[name] = r.samples.map((s) => s.check);
  }
  return out;
}

if (require.main === module) {
  const r = runParsedShadow();
  console.log(`files ${r.files}, lines ${r.lines}, statements ${r.statements}`);
  console.log(`statements identical (deep-equal AbapStatement[]): ${r.statementsIdentical} / ${r.files} files`);
  console.log(`maskLiterals identical: ${r.masksIdentical} / ${r.masksCompared} statements`);
  console.log(`maskNonCode identical: ${r.maskNonCodeIdentical} / ${r.files}; maskComments identical: ${r.maskCommentsIdentical} / ${r.files}`);
  console.log(`containers identical: ${r.containersIdentical} / ${r.files}; containerAt identical on every line: ${r.containerAtIdentical} / ${r.files}`);
  if (process.argv.includes('--samples')) for (const s of r.samples.slice(0, 40)) console.log(JSON.stringify(s));
  const d = runParsedDamageShadow();
  console.log(`damaged: ${d.files} sources; statements identical ${d.statementsIdentical}; masks ${d.masksIdentical} / ${d.masksCompared}; maskNonCode ${d.maskNonCodeIdentical}; containers ${d.containersIdentical}; containerAt ${d.containerAtIdentical}; recovered ${d.recovered}, containers identical where not recovered ${d.containersIdenticalUnrecovered} / ${d.files - d.recovered}`);
  if (process.argv.includes('--samples')) for (const s of d.samples.slice(0, 20)) console.log(JSON.stringify(s));
  for (const [name, checks] of Object.entries(runParsedEdgeShadow())) console.log(`edge ${name}: ${checks.length ? checks.join(', ') : 'identical'}`);
}
