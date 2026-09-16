import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildAbapEvidence, type AbapEvidenceReport, type EvidenceKind } from '../lib/abap/evidence-model';
import { extractDataCoupling, computeComplexityScore } from '../lib/abap/code-assessment';
import { routeExtensibility, type ExtensibilityRouteReport } from '../lib/abap/extensibility-router';
import { buildProcessFacts, type ProcessFacts } from '../lib/abap/process-facts';
import type { DataCouplingEntry } from '../lib/types';
import * as T from './helpers/abap-transforms';

/**
 * Metamorphic properties of the deterministic ABAP engine.
 *
 * Every other test of this engine says "this input gives that answer", and every
 * one of those answers was written by whoever wrote the detector. A property
 * here says something a reference corpus cannot: a **relation between two runs**
 * that must hold whatever the input is and whoever is right about it. Nobody
 * decides the expected result, so nobody can decide it wrong; and one property
 * covers a class of defect rather than a case.
 *
 * The five, as they are finally stated — each wording is narrower than the
 * slogan above it, and the narrowing is written down where it happens:
 *
 *   1. **Renaming is invisible.** Rename every `l…_`/`g…_` data object of a
 *      program, consistently, keeping its convention prefix: nothing in any
 *      answer changes but the text that quotes the name.
 *   2. **Formatting moves anchors and nothing else.** Five rewrites that change
 *      only where the characters sit: the findings are the same findings, and
 *      every line anchor lands exactly where the rewrite put that line.
 *   3. **A comment changes nothing.** Inline comments add no line, so nothing
 *      may move at all; full-line comments in column 1 put original line `n` on
 *      line `2n`, and that is the whole of what may change.
 *   4. **Concatenation is union.** Two programs read separately and then read as
 *      one file: the second program's answers, shifted by the first program's
 *      line count, with nothing added, lost or changed.
 *   5. **Every anchor points at its construct** — and every construct in the
 *      source is claimed by exactly one anchor.
 *
 * The transformations are mechanical (`tests/helpers/abap-transforms.ts`) and
 * run over all eight programs this product ships. A hand-written second version
 * of one file would prove one case; a rewrite applied to every file proves the
 * property.
 */

const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const FILES = readdirSync(EXAMPLES).sort();
const source = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');

/**
 * The inputs for the properties that are about where a statement ends.
 *
 * The eight programs, and the eight with their numeric character literals
 * written as bare decimals (`'0.19'` → `0.19`). The second family is not a
 * rewrite of the first — it is a second set of inputs, because none of the eight
 * ever writes a period between two digits outside a literal, and that is the one
 * place where a statement reader that cuts at every period gets a *plausible*
 * wrong answer rather than a visibly broken one: `IF lv_rate > 0.5.` handed on
 * as `IF lv_rate > 0`. A corpus that never contains the construct cannot say
 * anything about it, however many properties are asserted over it.
 */
const BOUNDARY_INPUTS: Array<{ label: string; code: string }> = FILES.flatMap((file) => {
  const code = source(file);
  const unquoted = T.unquoteNumbers(code);
  return unquoted === code
    ? [{ label: file, code }]
    : [{ label: file, code }, { label: `${file} (decimals unquoted)`, code: unquoted }];
});

/* ------------------------------------------------------------ one reading */

interface Reading {
  evidence: AbapEvidenceReport;
  coupling: DataCouplingEntry[];
  complexity: number;
  route: ExtensibilityRouteReport;
  facts: ProcessFacts;
}

function readEverything(code: string, fileName: string): Reading {
  const evidence = buildAbapEvidence(code, fileName);
  return {
    evidence,
    coupling: extractDataCoupling(code),
    complexity: computeComplexityScore(code),
    route: routeExtensibility(evidence, 'private'),
    facts: buildProcessFacts(code),
  };
}

/** How a line of the first reading should read in the second. */
interface Move {
  start(n: number): number;
  end(n: number): number;
}
const STILL: Move = { start: (n) => n, end: (n) => n };
const moved = (t: T.Transformed): Move => ({ start: t.mapStart, end: t.mapEnd });
const shifted = (offset: number): Move => ({ start: (n) => n + offset, end: (n) => n + offset });

/*
 * Every answer is projected to a list of strings before it is compared. A list
 * of lines is what makes a failure readable — Playwright prints the first row
 * that differs, which names the finding and the line, instead of a diff of two
 * 40 KB JSON blobs.
 */

const at = (m: Move, s: number, e?: number) => (e === undefined ? `L${m.start(s)}` : `L${m.start(s)}-${m.end(e)}`);

const findingRows = (r: Reading, m: Move): string[] =>
  r.evidence.findings.map((f) =>
    [
      at(m, f.lineStart, f.lineEnd),
      f.kind,
      f.severity,
      f.confidence,
      f.source,
      f.objectType ?? '-',
      f.objectName ?? '-',
      f.title,
      f.targetOptions.join('+'),
      f.needsBusinessDecision ? 'needs-decision' : '-',
      f.sapReplacement
        ? `${f.sapReplacement.objectName}/${f.sapReplacement.objectType}/${f.sapReplacement.confidence}`
        : '-',
    ].join(' | '),
  );

/**
 * A quotation of the source, compared as words rather than as bytes.
 *
 * Two reasons, and neither is about what the engine concluded. A re-wrap turns a
 * run of spaces into a line break, and the engine's two statement readers
 * normalise that differently — `readStatements` collapses every run of
 * whitespace (`sliceText`), `tokenize` keeps the runs inside a line and only
 * joins lines with one space. And `coverage.ts` and `control-flow.ts` elide a
 * quotation at 160 characters so it fits a table cell, so renaming a variable —
 * which changes the length of what stands before the cut — elides at a different
 * word. The first 120 words'-worth is before every cut either way.
 */
const quote = (text: string): string => text.replace(/\s+/g, ' ').trim().replace(/\.\.\.$/, '').slice(0, 120);

/**
 * A quotation is truncated *after* a caller's own normalisation, not before.
 * P1 reads the first run's answers through the rename before comparing them, and
 * a rename changes the length of what stands in front of the cut — truncating
 * first would compare two different halves of the same sentence.
 */
type Quoter = (text: string) => string;

const snippetRows = (r: Reading, q: Quoter = quote): string[] => r.evidence.findings.map((f) => q(f.snippet));



const coverageRows = (r: Reading, m: Move, q: Quoter = quote): string[] =>
  r.evidence.coverage.unassessed.map((u) => `${at(m, u.line)} | ${u.gap} | ${q(u.snippet)}`);

/**
 * `DataCouplingEntry` marks its counts and lines optional — the type is also the
 * shape a stored project is read back in. `extractDataCoupling` always fills
 * them, so a missing one would itself be news; the comparison says so by reading
 * an absent count as the string `absent` rather than by defaulting it to zero.
 */
const counted = (n: number | undefined) => (n === undefined ? 'absent' : String(n));
const linesOf = (e: DataCouplingEntry) => e.lineNumbers ?? [];

const couplingRows = (r: Reading, m: Move): string[] =>
  r.coupling.map((e) =>
    [
      e.tableName,
      e.accessType,
      e.isCustom ? 'custom' : 'standard',
      e.riskLevel,
      e.recommendation,
      `${counted(e.occurrences)}/${counted(e.readCount)}r/${counted(e.writeCount)}w`,
      e.replacementConfidence,
      linesOf(e).map((n) => m.start(n)).join(','),
    ].join(' | '),
  );

/** The route, with the line numbers it quotes moved to where they now belong. */
const routeText = (r: Reading, m: Move): string =>
  JSON.stringify(r.route, null, 1).replace(/from line (\d+)/g, (_x, n: string) => `from line ${m.start(Number(n))}`);

const statementRows = (r: Reading, m: Move): string[] =>
  r.facts.statements.map((s) => `${at(m, s.lineStart, s.lineEnd)} | ${s.keyword || '(none)'}${s.nativeSql ? ' | native-sql' : ''} | ${s.text}`);

const blockRows = (r: Reading, m: Move): string[] =>
  r.facts.structure.blocks.map((b) => `${at(m, b.lineStart, b.lineEnd)} | ${b.kind} | ${b.terminated ? 'closed' : 'unterminated'}`);

/**
 * Named regions, in line order rather than in the order they were collected.
 *
 * `readBlocks` returns every event block first and then every subroutine,
 * method, module and class, which for one program reads as source order and for
 * two appended programs does not. Nothing depends on that order — `containerAt`
 * searches the whole list — so the comparison is taken on the set, and the line
 * of each region is asserted exactly.
 */
const containerRows = (r: Reading, m: Move): string[] =>
  [...r.facts.structure.containers]
    .sort((a, b) => a.lineStart - b.lineStart || a.lineEnd - b.lineEnd || a.name.localeCompare(b.name))
    .map((c) => `${at(m, c.lineStart, c.lineEnd)} | ${c.kind} | ${c.name}`);

const branchRows = (r: Reading, m: Move): string[] =>
  r.facts.control.branches.map((b) =>
    [
      b.id,
      at(m, b.lineStart, b.lineEnd),
      b.kind,
      b.terminated ? 'closed' : 'unterminated',
      b.container ?? '(program)',
      b.parentId ?? '-',
      b.selector ?? '-',
      b.enclosing.map((e) => `${e.kind}@${m.start(e.lineStart)}`).join('>') || '-',
      // An arm's own `lineEnd` is a region boundary, not a line anchor: it runs
      // to the line before the next arm, so it absorbs whatever stands between
      // them — a blank line, a comment a rewrite inserted. Its law is an
      // inequality and is asserted in P5, where the anchors are checked.
      b.arms
        .map((a) => `{${a.kind} hdr ${at(m, a.header.lineStart, a.header.lineEnd)} ${a.condition}}`)
        .join(''),
    ].join(' | '),
  );

const notHandledRows = (r: Reading, m: Move, q: Quoter = quote): string[] =>
  r.facts.control.notHandled.map((n) => `${at(m, n.lineStart, n.lineEnd)} | ${n.reason} | ${q(n.snippet)}`);

/*
 * The per-statement half of the call graph, one list per kind of statement.
 *
 * Kept apart rather than flattened because `readCallGraphFrom` fills seven
 * arrays, not one ordered list: appending a second program appends to each of
 * them, so the union holds per kind and not for a flattening that puts every
 * FORM before every PERFORM.
 */
const formRows = (r: Reading, m: Move): string[] =>
  r.facts.calls.forms.map((f) => `FORM ${f.name}(${f.parameters.map((p) => `${p.direction}:${p.name}`).join(',')}) ${at(m, f.lineStart, f.lineEnd)} ${f.terminated ? 'closed' : 'unterminated'}`);

const performRows = (r: Reading, m: Move): string[] =>
  r.facts.calls.performs.map((p) => `PERFORM ${p.target ?? '(computed)'} prog=${p.program ?? '-'} ${at(m, p.lineStart, p.lineEnd)} in ${p.caller ?? '(program)'}/${p.callerKind} dyn=${p.dynamic} unresolved=${p.unresolved}`);

const functionModuleRows = (r: Reading, m: Move): string[] =>
  r.facts.calls.functionModules.map((f) => `CALL FUNCTION ${f.name ?? '(computed)'} ${at(m, f.lineStart, f.lineEnd)} in ${f.caller ?? '(program)'} bapi=${f.bapi} dest=${f.destination ?? '-'} upd=${f.inUpdateTask} bg=${f.inBackgroundTask} new=${f.startingNewTask}`);

const transactionRows = (r: Reading, m: Move): string[] =>
  r.facts.calls.transactions.map((t) => `CALL TRANSACTION ${t.code ?? '(computed)'} <${t.codeExpression}> ${at(m, t.lineStart, t.lineEnd)} in ${t.caller ?? '(program)'} from=${t.resolvedFrom ?? '-'} batch=${t.batchInput}`);

const submitRows = (r: Reading, m: Move): string[] =>
  r.facts.calls.submits.map((s) => `SUBMIT ${s.program ?? '(computed)'} <${s.programExpression}> ${at(m, s.lineStart, s.lineEnd)} in ${s.caller ?? '(program)'} from=${s.resolvedFrom ?? '-'} return=${s.andReturn} job=${s.viaJob}`);

const authorityRows = (r: Reading, m: Move): string[] =>
  r.facts.calls.authorityChecks.map((a) => `AUTHORITY-CHECK ${a.object ?? '(computed)'} ${at(m, a.lineStart, a.lineEnd)} in ${a.caller ?? '(program)'} fields=${a.fields.map((f) => `${f.id}=${f.dummy ? 'DUMMY' : f.value}`).join(',')}`);

const writeRows = (r: Reading, m: Move): string[] =>
  r.facts.calls.databaseWrites.map((w) => `${w.keyword} ${w.table} ${at(m, w.lineStart, w.lineEnd)} in ${w.caller ?? '(program)'}`);

/** The whole-file half: what the call graph concludes about the program. */
const graphRows = (r: Reading, m: Move): string[] => {
  const c = r.facts.calls;
  return [
    ...c.edges.map((e) => `EDGE ${e.from ?? '(program)'}/${e.fromKind} -> ${e.to} ${at(m, e.lineStart, e.lineEnd)}`),
    `unresolved: ${c.unresolvedTargets.join(',')}`,
    `neverPerformed: ${c.neverPerformed.join(',')}`,
    // `unreachableLines` is deliberately not here. It is a count of physical
    // lines — "the size of the dead region" — so a program wrapped over more
    // lines has a larger one, correctly. It is asserted where a line count
    // belongs, next to the complexity score.
    `unreachable: ${c.unreachable.join(',')}`,
    `reachabilityCertain: ${c.reachabilityCertain}`,
    `recursion: ${c.recursion.map((cy) => cy.join('>')).join(' ; ')}`,
  ];
};

/**
 * The two answers that are counts of physical lines rather than statements about
 * the program: the complexity score, which deducts from LOC
 * (`code-assessment.ts:313`), and `unreachableLines`, "the size of the dead
 * region". A rewrite that adds a line makes both larger, correctly for the
 * second and arguably for the first. They are asserted apart from the rest, so
 * that a rewrite which adds no line still pins them exactly.
 */
const lineCounts = (r: Reading) => ({ complexity: r.complexity, deadLines: r.facts.calls.unreachableLines });

/**
 * Everything the engine says, in one list, for a comparison that cannot forget
 * a surface. Split into named sections so a failure says which one moved.
 */
const SECTIONS: Array<{ name: string; rows: (r: Reading, m: Move, q?: Quoter) => string[] }> = [
  { name: 'findings', rows: findingRows },
  { name: 'coverage', rows: coverageRows },
  { name: 'data coupling', rows: couplingRows },
  { name: 'statements', rows: statementRows },
  { name: 'blocks', rows: blockRows },
  { name: 'containers', rows: containerRows },
  { name: 'branches', rows: branchRows },
  { name: 'not handled', rows: notHandledRows },
  { name: 'subroutines', rows: formRows },
  { name: 'performs', rows: performRows },
  { name: 'function modules', rows: functionModuleRows },
  { name: 'transactions', rows: transactionRows },
  { name: 'submits', rows: submitRows },
  { name: 'authority checks', rows: authorityRows },
  { name: 'database writes', rows: writeRows },
  { name: 'call graph', rows: graphRows },
];

/* ============================================================ property 1 */

/**
 * **Renaming is invisible.**
 *
 * `lv_price` → `lv_zz0001`, everywhere at once, for every `l…_` and `g…_` data
 * object in the program. Not one line of any answer may change except the text
 * that quotes the name — a finding's snippet, a gateway's condition, a call's
 * statement text — and those are compared through the same substitution.
 *
 * Two narrowings, both deliberate:
 *
 *   - **The convention prefix is kept.** `evidence-model.ts` reads it on purpose
 *     (`LOCAL_NAME_PREFIX`): a name that looks local and that neither SAP
 *     artifact knows is treated as a variable whose declaration this upload does
 *     not contain. `lv_price` → `gv_price` may therefore change the answer
 *     legitimately. What carries no rule is everything after the prefix.
 *   - **`CS_`, `CT_`, `RS_`, `ES_`, `IT_` are left alone**, although the engine
 *     lists them too: SAP ships real dictionary objects under them
 *     (`CS_BOM_EXPL_MAT_V2`), and renaming a table is a finding that disappears
 *     for a reason that is not a defect.
 *
 * Names inside literals are never touched. `WRITE 'lv_price'.` is prose about a
 * variable, not a use of one, and an engine that treated the two alike would be
 * right to disagree.
 */
test.describe('P1 — renaming is invisible', () => {
  for (const file of FILES) {
    test(`${file}: every local renamed, nothing but the quotations move`, () => {
      const code = source(file);
      const t = T.renameLocals(code);
      expect(t.code, 'the rewrite has to actually rename something').not.toBe(T.identity(code).code);

      const before = readEverything(code, file);
      const after = readEverything(t.code, file);

      // The first run's answers are read through the rename before they are
      // compared — including inside a quotation, before it is truncated.
      const renamedQuote: Quoter = (s) => quote(t.rename(s));
      for (const section of SECTIONS) {
        expect(section.rows(before, STILL, renamedQuote).map(t.rename), `${file}: ${section.name} changed under renaming`)
          .toEqual(section.rows(after, STILL));
      }
      expect(snippetRows(before, renamedQuote), `${file}: snippets`).toEqual(snippetRows(after));
      expect(t.rename(routeText(before, STILL)), `${file}: extensibility route`).toBe(routeText(after, STILL));
      expect(lineCounts(after), `${file}: the line counts`).toEqual(lineCounts(before));
    });
  }
});

/* ============================================================ property 2 */

/**
 * **Formatting moves anchors and nothing else.**
 *
 * Five rewrites, none of which changes a token — only where the tokens sit:
 *
 *   - `indentDeeper` — two more spaces on every line. Adds no line, so **nothing
 *     at all** may change, anchors included.
 *   - `wrapAfterFirstWord` — `IF lv_x > 5.` becomes `IF` / `lv_x > 5.`. Every
 *     statement now spans two lines where it spanned one.
 *   - `wrapBeforeOperator` — `a = b * c.` becomes `a = b` / `* c.`, so the
 *     continuation line opens with an indented asterisk. This is the shape the
 *     engine got wrong once: `Z_MM_PO_APPROVAL.abap:408-409` is written that
 *     way, an earlier reader took the asterisk for a comment, the statement
 *     never found its period and swallowed the `IF` below it — a price-tolerance
 *     check gone from the evidence of a shipped example. One line in one file is
 *     an anecdote; the same shape produced from every program is a rule.
 *   - `expandChainsInline` — `DATA: a, b.` becomes `DATA a. DATA b.` on the same
 *     line. Adds no line either, so again nothing may move; and it puts two
 *     statements on one line on purpose, which `statement-reader.ts` records as
 *     having gone wrong before (QA review of 5e598828093c).
 *   - `expandChainsPerLine` — the same, one statement per line.
 *
 * **The anchors may move, and where they move is asserted, not waived.** Each
 * rewrite reports where it put every line, and every range in every answer is
 * compared against that map — exactly, for the four rewrites where one original
 * line stays one place. `expandChainsPerLine` is the exception and says so
 * below: one line becomes several, so a part's anchor is asserted to land
 * *inside* the block of lines that line became, in order.
 *
 * What this property found, and does not assert away:
 *
 *   - **P2-F1** `computeComplexityScore` counts comment and continuation lines
 *     as lines of code, so wrapping a program over more lines raises its
 *     complexity — the same program, more complex. Left as a limit rather than
 *     fixed: `lib/abap/code-assessment.ts:313` deducts from LOC on purpose, and
 *     changing what counts as a line changes a number the product stores. The
 *     property asserts what is true regardless — the score may not *fall* — and
 *     asserts equality for the two rewrites that add no line.
 *   - **P2-F2** the engine has two statement readers and they disagree about
 *     chains. `readStatements` expands `WRITE: a, b.` into two statements;
 *     `tokenize` (`declaration-parser.ts:26`) does not, and `assessCoverage` and
 *     `buildAbapEvidence` read through `tokenize`. So `Z_MATERIAL_STOCK_CALC`
 *     reports "3 × classic list output" where writing the chains out gives 10 —
 *     an undercount of everything the coverage surface promises to have looked
 *     at. Not fixed here: `tokenize` also feeds the class parser, which splits
 *     chains itself downstream, and expanding them twice is a second defect.
 *     Under the chain rewrites the property therefore asserts the weaker true
 *     thing — same gaps, same findings, count never falls — and this note names
 *     the rest.
 */
const EXACT_FORMATTING: Array<{ name: string; apply: (c: string) => T.Transformed; addsLines: boolean }> = [
  { name: 'indentDeeper', apply: T.indentDeeper, addsLines: false },
  { name: 'wrapAfterFirstWord', apply: T.wrapAfterFirstWord, addsLines: true },
  { name: 'wrapBeforeOperator', apply: T.wrapBeforeOperator, addsLines: true },
];

test.describe('P2 — formatting moves anchors and nothing else', () => {
  for (const { label: file, code } of BOUNDARY_INPUTS) {
    test(`${file}: re-wrapped and re-indented, the same findings at moved anchors`, () => {
      const before = readEverything(code, file);

      for (const rewrite of EXACT_FORMATTING) {
        const t = rewrite.apply(code);
        // A rewrite has nothing to do in a program that has nothing of its
        // shape: `wrapBeforeOperator` needs a binary operator to wrap before.
        // The comparison is against `identity`, not against the file, because
        // the shipped files are checked out CRLF and every rewrite emits LF —
        // comparing against the file made "the rewrite did something" true for
        // a line ending.
        if (t.code === T.identity(code).code) continue;
        const m = moved(t);
        const after = readEverything(t.code, file);

        for (const section of SECTIONS) {
          expect(section.rows(before, m), `${file}/${rewrite.name}: ${section.name}`).toEqual(section.rows(after, STILL));
        }
        expect(snippetRows(before), `${file}/${rewrite.name}: snippets`).toEqual(snippetRows(after));
        expect(routeText(before, m), `${file}/${rewrite.name}: extensibility route`).toBe(routeText(after, STILL));

        // P2-F1: a LOC-based score is not wrap-invariant. What is true either way.
        if (rewrite.addsLines) {
          expect(after.complexity, `${file}/${rewrite.name}: complexity fell`).toBeGreaterThanOrEqual(before.complexity);
          expect(after.facts.calls.unreachableLines, `${file}/${rewrite.name}: the dead region shrank`)
            .toBeGreaterThanOrEqual(before.facts.calls.unreachableLines);
        } else {
          expect(lineCounts(after), `${file}/${rewrite.name}: the line counts`).toEqual(lineCounts(before));
        }
      }
    });

    test(`${file}: a chain written out on one line is the same program`, () => {
      const t = T.expandChainsInline(code);
      test.skip(t.code === T.identity(code).code, 'this program writes no chain that starts and ends on one line');

      const before = readEverything(code, file);
      const after = readEverything(t.code, file);
      expect(t.lineCount, 'writing a chain out inline adds no line').toBe(code.split(/\r?\n/).length);

      // Chain expansion is exactly what `readStatements` already does, so the
      // statements must come back identical — same texts, same order, same
      // anchors. Only `fromChain` may differ, and it is not in the row.
      for (const section of SECTIONS) {
        if (section.name === 'coverage') continue; // P2-F2, asserted below
        expect(section.rows(before, STILL), `${file}: ${section.name} under inline chain expansion`)
          .toEqual(section.rows(after, STILL));
      }
      // P2-F2: `tokenize` does not expand chains, so the coverage count grows.
      const gapsBefore = before.evidence.coverage.gaps.map((g) => g.gap).sort();
      const gapsAfter = after.evidence.coverage.gaps.map((g) => g.gap).sort();
      expect(gapsAfter, `${file}: which constructs went unassessed`).toEqual(gapsBefore);
      expect(after.evidence.coverage.unassessed.length, `${file}: unassessed count fell`)
        .toBeGreaterThanOrEqual(before.evidence.coverage.unassessed.length);
    });

    test(`${file}: a chain written out one per line keeps its parts in place`, () => {
      const t = T.expandChainsPerLine(code);
      test.skip(t.code === T.identity(code).code, 'this program writes no chain that starts and ends on one line');

      const before = readEverything(code, file);
      const after = readEverything(t.code, file);
      const m = moved(t);

      // One original line became several, so a part's anchor is asserted to land
      // inside the lines that line became rather than on one of them.
      expect(after.facts.statements.map((s) => s.text), `${file}: statement texts`)
        .toEqual(before.facts.statements.map((s) => s.text));
      for (let i = 0; i < before.facts.statements.length; i++) {
        const was = before.facts.statements[i];
        const now = after.facts.statements[i];
        expect(now.lineStart, `${file}: statement ${i} "${was.text.slice(0, 50)}" starts before its line`)
          .toBeGreaterThanOrEqual(m.start(was.lineStart));
        expect(now.lineEnd, `${file}: statement ${i} "${was.text.slice(0, 50)}" ends after its line`)
          .toBeLessThanOrEqual(m.end(was.lineEnd));
        if (i > 0) {
          expect(now.lineStart, `${file}: statement ${i} moved before statement ${i - 1}`)
            .toBeGreaterThanOrEqual(after.facts.statements[i - 1].lineStart);
        }
      }
      expect(findingRows(after, STILL).length, `${file}: findings appeared or vanished`)
        .toBe(findingRows(before, STILL).length);
      for (let i = 0; i < before.evidence.findings.length; i++) {
        const was = before.evidence.findings[i];
        const now = after.evidence.findings[i];
        expect(now.kind, `${file}: finding ${i} changed kind`).toBe(was.kind);
        expect(now.lineStart, `${file}: finding ${i} (${was.kind}) left its lines`).toBeGreaterThanOrEqual(m.start(was.lineStart));
        expect(now.lineStart, `${file}: finding ${i} (${was.kind}) left its lines`).toBeLessThanOrEqual(m.end(was.lineStart));
      }
    });
  }

  /**
   * A rewrite that no longer rewrites anything makes every property above it
   * pass for nothing. Each one has something to do in at least half the corpus,
   * and the lines it moves are counted so that a rewrite quietly narrowing to a
   * single line shows up as a number, not as a green tick.
   */
  test('none of the rewrites is silently doing nothing', () => {
    const work: Record<string, { files: number; lines: number }> = {};
    const rewrites: Array<[string, (c: string) => T.Transformed]> = [
      ['indentDeeper', T.indentDeeper],
      ['wrapAfterFirstWord', T.wrapAfterFirstWord],
      ['wrapBeforeOperator', T.wrapBeforeOperator],
      ['expandChainsInline', T.expandChainsInline],
      ['expandChainsPerLine', T.expandChainsPerLine],
      ['renameLocals', T.renameLocals],
      ['appendInlineComments', T.appendInlineComments],
      ['insertCommentLines', T.insertCommentLines],
    ];
    for (const [name, apply] of rewrites) {
      work[name] = { files: 0, lines: 0 };
      for (const file of FILES) {
        const code = source(file);
        const flat = T.identity(code).code;
        const out = apply(code);
        if (out.code === flat) continue;
        work[name].files += 1;
        const was = flat.split('\n');
        const now = out.code.split('\n');
        work[name].lines += was.reduce((n, line, i) => n + (line === now[i] ? 0 : 1), 0)
          + Math.abs(now.length - was.length);
      }
      expect(work[name].files, `${name} rewrites nothing in most of the corpus`).toBeGreaterThanOrEqual(4);
      expect(work[name].lines, `${name} touches too few lines to prove anything`).toBeGreaterThan(20);
    }
  });
});

/* ============================================================ property 3 */

/**
 * **A comment changes nothing.**
 *
 * Two insertions, and the second is the one with a line map:
 *
 *   - an inline `" …` on every statement line. **No line is added**, so nothing
 *     in any answer may move — not a finding, not an anchor, not a score.
 *   - a full-line `* …` in column 1 before every line. Original line `n` then
 *     stands on line `2n`, and that is the entire permitted change.
 *
 * **Why column 1 and nowhere else.** An indented asterisk is not always a
 * comment — `statement-reader.ts` gives the rule and the two shipped lines that
 * disagree: `Z_MM_PO_APPROVAL.abap:408-409` continues an arithmetic expression
 * with one, `Z_SALES_ORDER_CREATOR.txt:70` is a comment a developer indented.
 * The reader resolves it by whether a statement is open. Inserting an indented
 * asterisk inside an open statement would therefore not be inserting a comment
 * at all, it would be writing a multiplication, and a property that did it would
 * be false for a reason that is ABAP's rather than the engine's. The other half
 * of that rule — an operator that lands in continuation position — is exercised
 * by `wrapBeforeOperator` in property 2, where it belongs, because it is a
 * formatting change.
 *
 * What this property found:
 *
 *   - **P3-F1** (fixed) `computeComplexityScore` increments its nesting counter
 *     on any line beginning with `IF`/`LOOP`/`DO`/`CASE`/`TRY`/`WHILE`, but
 *     decremented it only on a line that is *exactly* `ENDIF.` — so `ENDIF. "
 *     done`, ordinary ABAP, left the counter raised for the rest of the program.
 *     Measured on the shipped corpus with an inline comment on every line, the
 *     deepest nesting of `ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC` read 99
 *     instead of 3, and its complexity score 10 instead of 9.
 *     `lib/abap/code-assessment.ts:299`.
 */
test.describe('P3 — a comment changes nothing', () => {
  for (const file of FILES) {
    test(`${file}: an inline comment on every line moves nothing`, () => {
      const code = source(file);
      const t = T.appendInlineComments(code);
      expect(t.code, 'the rewrite has to actually add a comment').not.toBe(T.identity(code).code);
      expect(t.lineCount, 'an inline comment adds no line').toBe(code.split(/\r?\n/).length);

      const before = readEverything(code, file);
      const after = readEverything(t.code, file);
      for (const section of SECTIONS) {
        expect(section.rows(before, STILL), `${file}: ${section.name} changed under an inline comment`)
          .toEqual(section.rows(after, STILL));
      }
      expect(snippetRows(before), `${file}: snippets`).toEqual(snippetRows(after));
      expect(routeText(before, STILL), `${file}: extensibility route`).toBe(routeText(after, STILL));
      expect(lineCounts(after), `${file}: the line counts`).toEqual(lineCounts(before));
    });

    test(`${file}: a comment line before every line moves only the anchors`, () => {
      const code = source(file);
      const t = T.insertCommentLines(code);
      const m = moved(t);
      expect(t.lineCount, 'one comment per line doubles the file').toBe(2 * code.split(/\r?\n/).length);
      expect(m.start(1), 'original line 1 now stands on line 2').toBe(2);

      const before = readEverything(code, file);
      const after = readEverything(t.code, file);
      for (const section of SECTIONS) {
        expect(section.rows(before, m), `${file}: ${section.name} under full-line comments`)
          .toEqual(section.rows(after, STILL));
      }
      expect(snippetRows(before), `${file}: snippets`).toEqual(snippetRows(after));
      expect(routeText(before, m), `${file}: extensibility route`).toBe(routeText(after, STILL));
      // P2-F1 again: the score counts lines, and a comment is a line.
      expect(after.complexity, `${file}: complexity fell`).toBeGreaterThanOrEqual(before.complexity);
      expect(after.facts.calls.unreachableLines, `${file}: the dead region shrank`)
        .toBeGreaterThanOrEqual(before.facts.calls.unreachableLines);
    });
  }
});

/* ============================================================ property 4 */

/**
 * **Concatenation is union.**
 *
 * Two programs read separately, then appended one after the other and read as
 * one file: every answer about the second must be the answer it gave alone, with
 * its anchors shifted by the first program's line count, and nothing may be
 * added, lost or changed. This is the sharpest of the five, because it fails on
 * anything the engine remembers between statements and on a scanner that loses
 * its place — a literal left open, a block stack that does not unwind, a
 * detector with a memo.
 *
 * All 64 ordered pairs of the eight shipped programs, self-pairings included:
 * `A + A` is the case that catches a detector which reports each table once.
 *
 * **Where the union genuinely does not hold, and why it is not asserted.**
 * Concatenating two programs makes one program, and three questions are about
 * the file rather than about a statement:
 *
 *   - the **call graph's conclusions** — `edges`, `neverPerformed`,
 *     `unreachable`, `recursion`, `reachabilityCertain`. If the first program
 *     defines `FORM check_credit` and the second performs it, the edge is real
 *     and the routine is no longer unreachable. Asserting a union there would be
 *     asserting that the engine must *not* see a call it can see.
 *   - **`coverage.gaps[].firstLine`** — the first line of a gap in the whole
 *     file is the earlier of the two, not both.
 *   - **the whole-file symbol tables** — `collectLocalDataObjects` and
 *     `resolveConstants` read every declaration in the file, so a name declared
 *     in the first program is in scope for the second. Two programs that share a
 *     variable name with a table name would answer differently together than
 *     apart. On these eight programs that never happens, and the property is
 *     asserted at full strength; the exposure is recorded here rather than in a
 *     weakened assertion, because it is a real one and a ninth file could meet
 *     it.
 *
 * The per-statement half of the call graph — every `PERFORM`, `CALL FUNCTION`,
 * `CALL TRANSACTION`, `SUBMIT`, `AUTHORITY-CHECK` and database write, each with
 * its caller and its range — is asserted as a union, because each of those is
 * read from one statement.
 */
const UNION_SECTIONS = SECTIONS.filter(
  (s) => s.name !== 'call graph' && s.name !== 'coverage' && s.name !== 'data coupling',
);

test.describe('P4 — concatenation is union', () => {
  for (const first of FILES) {
    test(`${first} followed by each of the eight: the parts, unchanged`, () => {
      const codeA = source(first);
      const readA = readEverything(codeA, 'pair.abap');

      for (const second of FILES) {
        const codeB = source(second);
        const readB = readEverything(codeB, 'pair.abap');
        const { code, offset } = T.concatPrograms(codeA, codeB);
        const both = readEverything(code, 'pair.abap');
        const shift = shifted(offset);
        const label = `${first} + ${second}`;

        // `BR-001` is "in source order, stable for one reading of one source"
        // (`control-flow.ts`), so in the joined file the second program's
        // branches carry on from the first's. That renumbering is the identifier
        // doing what it says; the row is read through it rather than excused.
        const carriedOn = (rows: string[]) =>
          rows.map((row) =>
            row.replace(/BR-(\d+)/g, (_x, n: string) =>
              `BR-${String(Number(n) + readA.facts.control.branches.length).padStart(3, '0')}`,
            ),
          );

        for (const section of UNION_SECTIONS) {
          const parts = [
            ...section.rows(readA, STILL),
            ...(section.name === 'branches' ? carriedOn(section.rows(readB, shift)) : section.rows(readB, shift)),
          ];
          expect(parts, `${label}: ${section.name} is not the union of the parts`)
            .toEqual(section.rows(both, STILL));
        }
        expect(
          [...snippetRows(readA), ...snippetRows(readB)],
          `${label}: snippets`,
        ).toEqual(snippetRows(both));
        // Coverage: every unassessed construct of both parts, in order, at its
        // own line. Only the per-gap `firstLine` summary is a whole-file answer.
        expect(
          [...coverageRows(readA, STILL), ...coverageRows(readB, shift)],
          `${label}: unassessed constructs`,
        ).toEqual(coverageRows(both, STILL));

        // Data coupling is an aggregate per table, so its union is a merge
        // rather than a concatenation: the reads and the writes of a table
        // touched by both programs add up, and its lines are both sets of
        // lines. The grade that follows — Read vs Read/Write, the risk level —
        // is a function of the merged counts, and changing when the counts
        // change is the engine being right, not a union being broken.
        const merged = new Map<string, { reads: number; writes: number; lines: number[] }>();
        for (const e of readA.coupling) {
          merged.set(e.tableName, { reads: e.readCount ?? 0, writes: e.writeCount ?? 0, lines: [...linesOf(e)] });
        }
        for (const e of readB.coupling) {
          const seen = merged.get(e.tableName);
          const lines = linesOf(e).map((n) => n + offset);
          if (seen) {
            seen.reads += e.readCount ?? 0;
            seen.writes += e.writeCount ?? 0;
            seen.lines.push(...lines);
          } else {
            merged.set(e.tableName, { reads: e.readCount ?? 0, writes: e.writeCount ?? 0, lines });
          }
        }
        expect(
          both.coupling.map((e) => `${e.tableName} | ${counted(e.readCount)}r/${counted(e.writeCount)}w | ${linesOf(e).join(',')}`).sort(),
          `${label}: data coupling is not the merge of the parts`,
        ).toEqual(
          [...merged]
            .map(([table, v]) => `${table} | ${v.reads}r/${v.writes}w | ${v.lines.join(',')}`)
            .sort(),
        );
      }
    });
  }
});

/* ============================================================ property 5 */

/**
 * **Every anchor points at its construct — and every construct is claimed.**
 *
 * The first half: for every finding, branch, arm, call, write and unassessed
 * construct the engine reports with a line range, the source lines in that range
 * must carry the thing it claims. An anchor on a blank line, on a comment, or on
 * the statement before the one that matched is a defect no per-case expectation
 * would catch, because the expectation was written from the same reading.
 *
 * The second half is the same assertion turned around, and it is the one with
 * teeth: **every block closer in the source is the end of exactly one block the
 * engine reports.** An `ENDIF` in the file that no `IF` claims means the reader
 * lost an `IF` somewhere above it — which is exactly what happens when a
 * statement swallows the one after it.
 *
 * The source is re-read here by this spec, with its own scanner
 * (`tests/helpers/abap-transforms.ts`), never through the engine: a check that
 * asked the engine where the statements are could only confirm that the engine
 * agrees with itself.
 *
 * The lenient step, stated rather than hidden: a claimed range is widened to
 * whole lines, so on a line holding two statements the check sees both. Taking
 * the range character-exact would need this spec to decide where statements end,
 * which is the question under test.
 */
const SIGNATURE: Partial<Record<EvidenceKind, RegExp>> = {
  'table-access': /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bMODIFY\b|\bDELETE\b/i,
  'custom-table-write': /\b(?:INSERT|UPDATE|MODIFY|DELETE)\b/i,
  'standard-table-read': /\bSELECT\b/i,
  'standard-table-write': /\b(?:INSERT|UPDATE|MODIFY|DELETE)\b/i,
  'rfc-call': /\bCALL\s+FUNCTION\b/i,
  bdc: /\bCALL\s+TRANSACTION\b/i,
  dynpro: /\bCALL\s+SCREEN\b|\bMODULE\s+[\w/]+\s+(?:OUTPUT|INPUT)\b/i,
  'classic-alv': /REUSE_ALV_(?:GRID|LIST)_DISPLAY/i,
  'gui-download': /GUI_DOWNLOAD|GUI_UPLOAD|CL_GUI_FRONTEND_SERVICES/i,
  'native-sql': /\bEXEC\s+SQL\b/i,
  'update-task': /\bIN\s+UPDATE\s+TASK\b/i,
  'commit-work': /\bCOMMIT\s+WORK\b/i,
  submit: /\bSUBMIT\b/i,
  'authority-check': /\bAUTHORITY-CHECK\b/i,
  'hardcoded-value': /['"](?:C:\\|PRD|CLNT|SYS|HTTP:\/\/|HTTPS:\/\/)/i,
  'legacy-mail': /SO_NEW_DOCUMENT_SEND_API1/i,
  'credit-management': /\bCALL\s+FUNCTION\b/i,
  enhancement: /\bENHANCEMENT\b|\bBADI\b|CL_EXITHANDLER/i,
  modification: /^\s*[*"]\{\s*(?:INSERT|REPLACE|DELETE)\b/i,
};

const GAP_SIGNATURE: Record<string, RegExp> = {
  'file-io': /\b(?:OPEN|READ|CLOSE|DELETE)\s+DATASET\b|\bTRANSFER\b/i,
  'local-function-call': /\bCALL\s+FUNCTION\b/i,
  'dynamic-invocation': /\bCALL\s+(?:FUNCTION|METHOD)\b|\bCREATE\s+OBJECT\b|\bPERFORM\b|\bASSIGN\b/i,
  'classic-list-output': /\bWRITE\b/i,
  macro: /\bDEFINE\b/i,
  'generated-code': /\bINSERT\s+REPORT\b|\bGENERATE\s+SUBROUTINE\s+POOL\b/i,
};

const CLOSERS: Record<string, string> = {
  ENDIF: 'if', ENDCASE: 'case', ENDLOOP: 'loop', ENDDO: 'do', ENDWHILE: 'while',
  ENDTRY: 'try', ENDSELECT: 'select', ENDAT: 'at', ENDPROVIDE: 'provide',
  ENDFORM: 'form', ENDMETHOD: 'method', ENDMODULE: 'module', ENDCLASS: 'class',
  ENDINTERFACE: 'interface', 'END-OF-DEFINITION': 'define',
};

/** The code on one source line: nothing at all when the line is a column-1 comment. */
const codeOn = (line: string): string => (line.startsWith('*') ? '' : T.withoutComment(line).trim());

/**
 * The source text a claim at line `from` may be read against: from that line
 * through the line that ends the statement starting there, whole lines.
 *
 * Built once per file. Done per claim it is quadratic, and on the 1000-line
 * example that was 27 seconds of a 22-second suite.
 */
function windowReader(lines: string[]): (from: number, to?: number) => string {
  const bare = lines.map((l) => (l.startsWith('*') ? '' : T.withoutComment(l)));
  const endsAt: number[] = new Array(lines.length);
  let next = lines.length - 1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (T.terminatorOffsets(lines[i]).length > 0) next = i;
    endsAt[i] = Math.max(i, next);
  }
  return (from, to) => {
    const last = Math.max(endsAt[from - 1] ?? from - 1, (to ?? from) - 1);
    return bare.slice(from - 1, last + 1).join(' ');
  };
}

test.describe('P5 — every anchor points at its construct', () => {
  for (const { label: file, code } of BOUNDARY_INPUTS) {
    test(`${file}: every range the engine reports carries what it claims`, () => {
      const lines = code.split(/\r?\n/);
      const window = windowReader(lines);
      const r = readEverything(code, file);
      const inFile = (n: number, what: string) => {
        expect(n, `${what}: line ${n} is outside a file of ${lines.length} lines`).toBeGreaterThan(0);
        expect(n, `${what}: line ${n} is outside a file of ${lines.length} lines`).toBeLessThanOrEqual(lines.length);
      };

      for (const f of r.evidence.findings) {
        const what = `${f.id} ${f.kind} at L${f.lineStart}`;
        inFile(f.lineStart, what);
        if (f.lineEnd !== undefined) {
          inFile(f.lineEnd, what);
          expect(f.lineEnd, `${what} ends before it starts`).toBeGreaterThanOrEqual(f.lineStart);
        }
        if (f.kind !== 'modification') {
          expect(codeOn(lines[f.lineStart - 1]), `${what} anchors on a line with no code`).not.toBe('');
        }
        const signature = SIGNATURE[f.kind];
        if (signature) {
          const text = f.kind === 'modification' ? lines[f.lineStart - 1] : window(f.lineStart, f.lineEnd);
          expect(text, `${what} claims a ${f.kind}; line ${f.lineStart} does not carry one`).toMatch(signature);
        }
        if (f.objectName && /^[A-Z][\w/]{2,}$/.test(f.objectName) && f.kind !== 'modification') {
          expect(
            window(f.lineStart, f.lineEnd).toUpperCase(),
            `${what} names ${f.objectName}, which is not on the line`,
          ).toContain(f.objectName);
        }
      }

      for (const u of r.evidence.coverage.unassessed) {
        inFile(u.line, `unassessed ${u.gap}`);
        expect(codeOn(lines[u.line - 1]), `unassessed ${u.gap} at L${u.line} anchors on a line with no code`).not.toBe('');
        expect(window(u.line), `unassessed ${u.gap} at L${u.line}`).toMatch(GAP_SIGNATURE[u.gap]);
      }

      for (const e of r.coupling) {
        for (const n of linesOf(e)) {
          inFile(n, `coupling ${e.tableName}`);
          expect(window(n).toUpperCase(), `${e.tableName} is not on L${n}`).toContain(e.tableName);
        }
      }

      for (const s of r.facts.statements) {
        const what = `statement ${s.index} "${s.text.slice(0, 50)}"`;
        inFile(s.lineStart, what);
        inFile(s.lineEnd, what);
        expect(s.lineEnd, `${what} ends before it starts`).toBeGreaterThanOrEqual(s.lineStart);
        expect(codeOn(lines[s.lineStart - 1]), `${what} starts on a line with no code`).not.toBe('');
        // A statement that is nothing but a number is not a statement — it is a
        // decimal point read as a full stop.
        expect(s.text, `${what} is a bare number, not a statement`).not.toMatch(/^[\d.]+$/);
        if (s.keyword) {
          // A chain part borrows the keyword written before the colon, which may
          // stand lines above it. `chainHeadLine` is where the engine says that
          // word is, and it has to be there.
          const from = s.fromChain && s.chainHeadLine !== undefined ? s.chainHeadLine : s.lineStart;
          if (s.fromChain && s.chainHeadLine !== undefined) {
            inFile(s.chainHeadLine, `${what} chain head`);
            expect(s.chainHeadLine, `${what}: its chain head stands after it`).toBeLessThanOrEqual(s.lineStart);
          }
          expect(window(from, s.lineEnd).toUpperCase(), `${what}: its keyword is not in its range`)
            .toContain(s.keyword);
        }
      }

      for (const b of r.facts.control.branches) {
        const what = `${b.id} (${b.kind}) L${b.lineStart}-${b.lineEnd}`;
        inFile(b.lineStart, what);
        inFile(b.lineEnd, what);
        expect(codeOn(lines[b.lineStart - 1]).toUpperCase(), `${what} does not open with ${b.kind.toUpperCase()}`)
          .toMatch(b.kind === 'if' ? /^IF\b/ : /^CASE\b/);
        if (b.terminated) {
          expect(codeOn(lines[b.lineEnd - 1]).toUpperCase(), `${what} does not end on its closer`)
            .toMatch(b.kind === 'if' ? /^ENDIF\b/ : /^ENDCASE\b/);
        }
        for (const [index, arm] of b.arms.entries()) {
          const armWhat = `${what} arm ${arm.kind} L${arm.header.lineStart}`;
          inFile(arm.header.lineStart, armWhat);
          expect(arm.lineStart, `${armWhat} does not begin at its header`).toBe(arm.header.lineStart);
          const next = b.arms[index + 1];
          if (next) {
            expect(arm.lineEnd, `${armWhat} runs into the arm after it`).toBeLessThan(next.lineStart);
          }
          expect(codeOn(lines[arm.header.lineStart - 1]).toUpperCase(), `${armWhat} is not where its keyword is`)
            .toMatch(arm.kind === 'if' ? /^IF\b/ : arm.kind === 'elseif' ? /^ELSEIF\b/ : arm.kind === 'else' ? /^ELSE\b/ : /^WHEN\b/);
          expect(arm.lineEnd, `${armWhat} ends before its header does`).toBeGreaterThanOrEqual(arm.header.lineEnd);
          expect(arm.lineEnd, `${armWhat} outlives its branch`).toBeLessThanOrEqual(b.lineEnd);
          if (arm.condition) {
            expect(
              window(arm.header.lineStart, arm.header.lineEnd).replace(/\s+/g, ' '),
              `${armWhat}: its condition is not in its header`,
            ).toContain(arm.condition);
          }
        }
      }

      const claims: Array<{ from: number; to: number; text: RegExp; what: string }> = [
        ...r.facts.calls.forms.map((f) => ({ from: f.lineStart, to: f.lineStart, text: new RegExp(`^FORM\\s+${f.name}\\b`, 'i'), what: `FORM ${f.name}` })),
        ...r.facts.calls.performs.map((p) => ({ from: p.lineStart, to: p.lineEnd, text: /\bPERFORM\b/i, what: `PERFORM ${p.target ?? '(computed)'} L${p.lineStart}` })),
        ...r.facts.calls.functionModules.map((f) => ({ from: f.lineStart, to: f.lineEnd, text: /\bCALL\s+FUNCTION\b/i, what: `CALL FUNCTION L${f.lineStart}` })),
        ...r.facts.calls.transactions.map((t) => ({ from: t.lineStart, to: t.lineEnd, text: /\bCALL\s+TRANSACTION\b/i, what: `CALL TRANSACTION L${t.lineStart}` })),
        ...r.facts.calls.submits.map((s) => ({ from: s.lineStart, to: s.lineEnd, text: /\bSUBMIT\b/i, what: `SUBMIT L${s.lineStart}` })),
        ...r.facts.calls.authorityChecks.map((a) => ({ from: a.lineStart, to: a.lineEnd, text: /\bAUTHORITY-CHECK\b/i, what: `AUTHORITY-CHECK L${a.lineStart}` })),
        ...r.facts.calls.databaseWrites.map((w) => ({ from: w.lineStart, to: w.lineEnd, text: new RegExp(`\\b${w.keyword}\\b[\\s\\S]*\\b${w.table}\\b|\\b${w.table}\\b[\\s\\S]*\\b${w.keyword}\\b`, 'i'), what: `${w.keyword} ${w.table} L${w.lineStart}` })),
      ];
      for (const claim of claims) {
        inFile(claim.from, claim.what);
        inFile(claim.to, claim.what);
        expect(window(claim.from, claim.to), `${claim.what}: its range does not carry it`).toMatch(claim.text);
      }

      for (const form of r.facts.calls.forms) {
        if (!form.terminated) continue;
        expect(codeOn(lines[form.lineEnd - 1]).toUpperCase(), `FORM ${form.name} does not end on ENDFORM`).toMatch(/^ENDFORM\b/);
      }
    });

    test(`${file}: every block closer in the source is claimed by exactly one block`, () => {
      const lines = code.split(/\r?\n/);
      const native = T.nativeSqlLines(lines);
      const r = readEverything(code, file);

      const claimed = new Map<number, string[]>();
      for (const b of r.facts.structure.blocks) {
        if (!b.terminated) continue;
        claimed.set(b.lineEnd, [...(claimed.get(b.lineEnd) ?? []), b.kind]);
      }

      const orphans: string[] = [];
      let closers = 0;
      for (let i = 0; i < lines.length; i++) {
        if (native.has(i)) continue;
        const first = /^([A-Za-z][\w-]*)\b/.exec(codeOn(lines[i]));
        const kind = first ? CLOSERS[first[1].toUpperCase()] : undefined;
        if (!kind) continue;
        closers += 1;
        const here = claimed.get(i + 1) ?? [];
        const seat = here.indexOf(kind);
        if (seat === -1) orphans.push(`L${i + 1} ${first?.[1]} — no ${kind} block ends here (ends here: ${here.join(', ') || 'nothing'})`);
        else here.splice(seat, 1);
      }

      expect(orphans, `${file}: a closer in the source that no block claims means an opener was lost above it`).toEqual([]);
      // Nothing claims to end where no closer stands, either.
      const unbacked: string[] = [];
      for (const [line, left] of claimed) for (const kind of left) unbacked.push(`L${line} a ${kind} block ends here, but no closer does`);
      expect(unbacked, `${file}: a block that ends where nothing closes it`).toEqual([]);
      expect(closers, `${file} has no block closer at all — the check would be vacuous`).toBeGreaterThan(0);
    });
  }
});
