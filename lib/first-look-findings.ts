import { readStatements, type AbapStatement } from '@/lib/abap/statement-reader';
import { readBlocks } from '@/lib/abap/block-structure';
import { readConstantGates } from '@/lib/abap/constant-gates';
import { readCallGraphFrom, type CallGraphReport } from '@/lib/abap/call-graph';
import { readInputUseFrom, type InputIssue } from '@/lib/abap/input-use';
import { readDataScopeFrom } from '@/lib/abap/data-scope';
import { readDemoSwitches, type DemoSwitches } from '@/lib/abap/demo-switches';
import { assessAuthorityFrom } from '@/lib/abap/authority-assessment';
import { isCustomerObject, isNamespacedObject } from '@/lib/abap/abcd-classification';
import { engineReadsApply } from '@/lib/abap/engine-reads-gate';
import { TABLE_TERMS_EN } from '@/lib/abap/plain-glossary';
import { humaniseField, plainContext, type PlainContext } from '@/lib/abap/plain-language';
import type { ProcessSkeleton } from '@/lib/abap/process-skeleton';
import { programSummaryFactsOf } from '@/lib/program-summary-facts';
import { authorClaimOf, type AuthorClaim } from '@/lib/program-summary-check';
import type { ProgramSummaryFacts } from '@/lib/program-summary-text';
import type { ProcessStory } from '@/lib/process-story';
import {
  GIVES_AWAY_SIGNS,
  givesAuthorityDisplayOnly,
  givesAuthorityLowOnly,
  givesAuthorityNone,
  givesDialogAnswerIgnored,
  givesDialogWrongList,
  givesFixedScope,
  givesHeaderContradiction,
  givesSapTableWrite,
  givesSelectionUnused,
  givesTestSwitch,
  givesUnreachableBySwitch,
  givesUnreachableUncalled,
  type HeaderContradiction,
} from '@/lib/messages/first-look-findings';

/**
 * "What the code gives away" — the First-insights block of roadmap 3.0.21
 * (owner decisions 22.10.2026): at most three things a business reader would
 * not expect of the program, each one plain sentence with its line anchor and
 * who to ask.
 *
 * Built only from deterministic engine readings that exist already; this
 * module gathers, orders and words them, and reads nothing new. Seven signs,
 * in a fixed order and never weighed by a model:
 *
 *   1. `unreachable-code` — code no run reaches: a constant gate
 *      (`constant-gates.ts`), else routines nothing in the program calls
 *      (`call-graph.ts`). Only where reachability is certain (no
 *      `PERFORM (name)`), the source is a program with an entry of its own, no
 *      `INCLUDE` is missing (the open question "add the includes"), and the
 *      engine reads gates as 3.0.18 does (`ENGINE_READS_FROM`). An include not
 *      uploaded may call a routine or redeclare a constant.
 *   2. `ignored-input` — a start-screen entry nothing reads, a pop-up answer
 *      never used (`input-use.ts`). That reader goes by source order, so the
 *      sentence says "in the code". A radio button whose group is read is no
 *      ignored input: the group is one choice.
 *   3. `test-switch` — the program's own demo cases (`demo-switches.ts`, with
 *      the story's `testData` when the page has it). It may be intended; the
 *      sentence asks.
 *   4. `fixed-scope` — a read of many rows restricted by a value written in
 *      the code (`data-scope.ts`): a literal or a constant that is not blank,
 *      not a flag, and not the system's date, language or client. A single-row
 *      lookup by a fixed key reads a setting, not a scope, and is left out.
 *   5. `header-contradiction` — the header comment says what the code does not
 *      (`program-summary-check.ts`, `authorClaimOf`). A header not quoted only
 *      for its language or its length is no contradiction.
 *   6. `sap-table-write` — a direct database write to a table outside the
 *      customer namespaces (`call-graph.ts`, which reads writes through
 *      `open-sql-discrimination.ts`). Not the Level A–D grade.
 *   7. `authority` — the authorization check (`authority-assessment.ts`). It
 *      may stand in a calling program, so the sentence is a question for IT; a
 *      program whose only changes are batch input is left out, because the
 *      transaction checks for itself.
 *
 * One finding per sign, the first by line. With nothing found the block says
 * "none of the seven signs found" (`checked`), never that the code is clean.
 *
 * Pure: the engine's readers and the message catalogue; no React, no DOM, no
 * network, no model.
 */

export type FindingReader =
  | 'unreachable-code'
  | 'ignored-input'
  | 'test-switch'
  | 'fixed-scope'
  | 'header-contradiction'
  | 'sap-table-write'
  | 'authority';

export const FINDING_ORDER: readonly FindingReader[] = Object.freeze([
  'unreachable-code',
  'ignored-input',
  'test-switch',
  'fixed-scope',
  'header-contradiction',
  'sap-table-write',
  'authority',
]);

export type AskWho = 'it' | 'users' | 'business';

export interface CodeFinding {
  reader: FindingReader;
  /** One plain business sentence ending in a question. */
  text: string;
  /** Line anchor `L88` or `L88-90` — mandatory; a reading without a line is not a finding. */
  anchor: string;
  ask: AskWho;
}

export interface CodeGivesAway {
  /** At most three, in `FINDING_ORDER`. */
  findings: CodeFinding[];
  /** Further findings beyond the three. */
  more: number;
  /** The number of signs looked for (7). */
  checked: number;
  /** The one line that replaces the old test-data box; null when the program has no demo switch. */
  testSwitch: { anchor: string | null; sentence: string } | null;
}

export interface CodeGivesAwayInput {
  source: string;
  /** The engine the page reads for (`engineVersionOfProject`); the readers' own gates take it. */
  engineVersion: string | null;
  /** The page's skeleton (`readProcess(source).skeleton`) — its include notes count as missing includes. */
  skeleton?: ProcessSkeleton | null;
  /** The page's summary facts (`programSummaryFactsOf`); computed when absent and the header is needed. */
  facts?: ProgramSummaryFacts | null;
  /** The page's `authorClaimOf(facts)`; read from `facts` when absent. */
  authorClaim?: AuthorClaim | null;
  /** The story's test data (`processStory(...).testData`) — its anchor and case count, when the page has it. */
  testData?: ProcessStory['testData'];
  /** A call graph the caller already read. */
  calls?: CallGraphReport;
}

/** The most findings the block shows. */
export const GIVES_AWAY_SHOWN = 3;

const anchorOf = (lineStart: number, lineEnd?: number): string =>
  typeof lineEnd === 'number' && lineEnd > lineStart ? `L${lineStart}-${lineEnd}` : `L${lineStart}`;

/** `L88–90` / `L88-90` / `L88` as the block prints it, or null. */
function normaliseAnchor(anchor: string | null | undefined): string | null {
  const m = /^L(\d+)(?:\s*[-–]\s*L?(\d+))?$/.exec(String(anchor ?? '').trim());
  if (!m) return null;
  return m[2] && Number(m[2]) > Number(m[1]) ? `L${m[1]}-${m[2]}` : `L${m[1]}`;
}

/** A plain word is one a reader can read: no underscore, no code of the customer namespace. */
function plainWord(word: string | null | undefined, raw: string): string | null {
  const w = String(word ?? '').trim();
  if (w.length < 3 || /_/.test(w) || /\b[ZY][A-Z0-9]{2,}\b/.test(w) || /^(?:zz|yy)\b/i.test(w)) return null;
  if (w.toUpperCase() === raw.toUpperCase().replace(/^[PS]_/, '')) return null;
  return w;
}

function fieldWord(name: string, ctx: PlainContext): string | null {
  try {
    const word = humaniseField(name, ctx);
    const plain = plainWord(word, name);
    return plain ? (/^[A-Z][a-z]/.test(plain) ? plain.charAt(0).toLowerCase() + plain.slice(1) : plain) : null;
  } catch {
    return null;
  }
}

function tableWord(table: string): string | null {
  const term = TABLE_TERMS_EN[table.toLowerCase()];
  if (!term) return null;
  const word = term.plural;
  return /^[A-Z][a-z]/.test(word) ? word.charAt(0).toLowerCase() + word.slice(1) : word;
}

/** A line of code: not blank, not a comment. */
function codeLines(lines: readonly string[], from: number, to: number): number {
  let n = 0;
  for (let i = from; i <= to && i <= lines.length; i++) {
    const raw = lines[i - 1] ?? '';
    if (!raw.trim() || /^\*/.test(raw) || /^\s*"/.test(raw)) continue;
    n++;
  }
  return n;
}

/** The includes the source names and does not hold — the open question "add the includes". */
function includeMissing(statements: readonly AbapStatement[], skeleton: ProcessSkeleton | null | undefined): boolean {
  if (skeleton?.notes.some((n) => n.reason === 'include-not-read')) return true;
  return statements.some((s) => s.keyword === 'INCLUDE' && !/^INCLUDE\s+(?:STRUCTURE|TYPE)\b/i.test(s.text));
}

/* ------------------------------------------------------------- the readers */

function unreachableFinding(
  source: string,
  lines: readonly string[],
  statements: readonly AbapStatement[],
  graph: CallGraphReport,
  input: CodeGivesAwayInput,
): CodeFinding | null {
  if (!engineReadsApply(input.engineVersion)) return null;
  if (!graph.reachabilityCertain || includeMissing(statements, input.skeleton)) return null;
  const gates = readConstantGates(source, { engineReads: true });
  if (gates.unreachable.length) {
    const count = gates.unreachable.reduce((n, r) => n + codeLines(lines, r.lineStart, r.lineEnd), 0);
    const gate = gates.gates[gates.unreachable[0].gate];
    if (count > 0 && gate) {
      return { reader: 'unreachable-code', text: givesUnreachableBySwitch(count), anchor: anchorOf(gate.lineStart, gate.lineEnd), ask: 'it' };
    }
  }
  // A routine nothing calls is dead only in a program with an entry of its own;
  // a subroutine pool or an include is called from outside.
  const hasEntry = statements.some((s) => /^(?:REPORT|PROGRAM)\b/i.test(s.text));
  if (!hasEntry || graph.unreachable.length === 0) return null;
  const dead = graph.forms.filter((f) => graph.unreachable.includes(f.name)).sort((a, b) => a.lineStart - b.lineStart);
  if (!dead.length) return null;
  const count = dead.reduce((n, f) => n + codeLines(lines, f.lineStart, f.lineEnd), 0);
  return {
    reader: 'unreachable-code',
    text: givesUnreachableUncalled(dead.length, count),
    anchor: anchorOf(dead[0].lineStart, dead[0].lineEnd),
    ask: 'it',
  };
}

/** A radio button whose group another member of which is read is one choice, not an ignored input. */
function radioGroupRead(statements: readonly AbapStatement[], issue: InputIssue, issues: readonly InputIssue[]): boolean {
  const groupOf = (name: string): string | null => {
    for (const s of statements) {
      const m = new RegExp(`^PARAMETERS\\s*:?\\s*${name.replace(/[/]/g, '\\/')}\\b[\\s\\S]*\\bRADIOBUTTON\\s+GROUP\\s+([\\w/]+)`, 'i').exec(s.text);
      if (m) return m[1].toUpperCase();
    }
    return null;
  };
  const group = groupOf(issue.name);
  if (!group) return false;
  const unread = new Set(issues.filter((i) => i.kind === 'selection-never-read').map((i) => i.name.toUpperCase()));
  return statements.some((s) => {
    const m = /^PARAMETERS\s*:?\s*([\w/]+)\b[\s\S]*\bRADIOBUTTON\s+GROUP\s+([\w/]+)/i.exec(s.text);
    return !!m && m[2].toUpperCase() === group && !unread.has(m[1].toUpperCase());
  });
}

function ignoredInputFinding(statements: AbapStatement[], ctx: PlainContext, missing: boolean): CodeFinding | null {
  const issues = readInputUseFrom(statements);
  // A missing include may read what this source does not: only the wrong list stands on its own.
  if (missing) {
    const wrong = issues.find((i) => i.kind === 'dialog-parameter-type');
    return wrong ? { reader: 'ignored-input', text: givesDialogWrongList(), anchor: anchorOf(wrong.line), ask: 'it' } : null;
  }
  const unused = issues.filter((i) => i.kind === 'selection-never-read' && !radioGroupRead(statements, i, issues));
  const dialog = issues.filter((i) => i.kind === 'dialog-output-ignored');
  const wrongList = issues.filter((i) => i.kind === 'dialog-parameter-type');
  const candidates: CodeFinding[] = [];
  if (dialog.length) {
    const first = dialog[0];
    candidates.push({ reader: 'ignored-input', text: givesDialogAnswerIgnored(), anchor: anchorOf(first.line), ask: 'users' });
  }
  if (unused.length) {
    const first = unused[0];
    candidates.push({ reader: 'ignored-input', text: givesSelectionUnused(fieldWord(first.name, ctx), unused.length - 1), anchor: anchorOf(first.line), ask: 'users' });
  }
  if (wrongList.length) {
    candidates.push({ reader: 'ignored-input', text: givesDialogWrongList(), anchor: anchorOf(wrongList[0].line), ask: 'it' });
  }
  // A pop-up answer thrown away is the stronger sign; then an unused entry; then the wrong list.
  return candidates[0] ?? null;
}

function testSwitchOf(
  demo: DemoSwitches | null,
  testData: ProcessStory['testData'],
): { anchor: string | null; sentence: string } | null {
  if (testData) {
    return { anchor: normaliseAnchor(testData.anchor), sentence: givesTestSwitch(testData.cases) };
  }
  if (!demo) return null;
  const cases = demo.cases.reduce((n, c) => n + c.arms, 0);
  const first = demo.cases[0];
  return { anchor: first ? anchorOf(first.lineStart, first.lineEnd) : anchorOf(demo.flag.line), sentence: givesTestSwitch(cases) };
}

/** `SELECT COUNT( * )`, `SELECT MAX( d )` … with no grouping: one figure, not a set of rows. */
const AGGREGATE_ONLY = /^SELECT\s+(?:SINGLE\s+)?(?:COUNT|MAX|MIN|SUM|AVG)\s*\((?![\s\S]*\bGROUP\s+BY\b)/i;

/** Values that say nothing about scope: blank, a flag, initial. */
const NOT_A_SCOPE = /^(?:space|abap_true|abap_false|''|' '|'X'|``|0)$/i;

function fixedScopeFinding(statements: AbapStatement[], ctx: PlainContext): CodeFinding | null {
  const constants = new Map<string, string>();
  for (const s of statements) {
    const m = /^CONSTANTS\s*:?\s*([\w/]+)\b[\s\S]*?\bVALUE\s+('(?:[^']|'')*'|`[^`]*`|-?\d+|space|abap_true|abap_false)/i.exec(s.text);
    if (m) constants.set(m[1].toUpperCase(), m[2]);
  }
  const { reads } = readDataScopeFrom(statements);
  const textAt = new Map(statements.filter((st) => st.keyword === 'SELECT').map((st) => [st.lineStart, st.text]));
  for (const read of reads) {
    // A single row, or one figure counted or totalled over the rows, is a lookup or a check — not a scope of data.
    if (read.single || AGGREGATE_ONLY.test(textAt.get(read.line) ?? '')) continue;
    for (const f of read.filters) {
      if (f.origin !== 'fixed' || (f.operator !== '=' && f.operator !== 'EQ')) continue;
      const operand = f.operand.trim().replace(/^@/, '');
      if (/^sy-/i.test(operand)) continue;
      const written = constants.get(operand.toUpperCase()) ?? operand;
      if (NOT_A_SCOPE.test(written.trim())) continue;
      const literal = /^'((?:[^']|'')*)'$|^`([^`]*)`$|^(-?\d+)$/.exec(written.trim());
      if (!literal) continue;
      const raw = (literal[1] ?? literal[2] ?? literal[3] ?? '').replace(/''/g, "'").trim();
      if (!raw) continue;
      const value = /\b[ZY][A-Z0-9_]{2,}\b|_/.test(raw) ? null : raw;
      const field = fieldWord(f.field.replace(/^[\w/]+~/, ''), ctx);
      const data = tableWord(read.tables[0]);
      return { reader: 'fixed-scope', text: givesFixedScope(data, field, value), anchor: anchorOf(read.line), ask: 'business' };
    }
  }
  return null;
}

const CONTRADICTIONS: Array<{ kind: HeaderContradiction; test: RegExp }> = [
  { kind: 'claims-change', test: /^claims a posting or a data change/ },
  { kind: 'denies-change', test: /^says it does not post or change data/ },
  { kind: 'claims-mail', test: /^claims correspondence/ },
  { kind: 'claims-approval', test: /^claims an approval/ },
  { kind: 'names-other-data', test: /^names .*(?:which the code does not read|the code does not write)/ },
];

function headerFinding(claim: AuthorClaim | null): CodeFinding | null {
  if (!claim || claim.state !== 'contradicted') return null;
  // Not quoted for its language or its length is not a contradiction.
  for (const { kind, test } of CONTRADICTIONS) {
    if (claim.problems.some((p) => test.test(p))) {
      return { reader: 'header-contradiction', text: givesHeaderContradiction(kind), anchor: anchorOf(claim.lineStart, claim.lineEnd), ask: 'it' };
    }
  }
  return null;
}

/**
 * `MODIFY ENTITIES OF …` is the RAP business object's own interface (EML), not a
 * table write — the call graph reads it as a write to a table `ENTITIES`. The
 * framework runs the object's checks and authorization for it, so neither the
 * SAP-table sign nor the authority sign counts it.
 */
const EML_TARGET = 'ENTITIES';

function sapWriteFinding(graph: CallGraphReport): CodeFinding | null {
  const writes = graph.databaseWrites
    .filter((w) => w.table && w.table !== EML_TARGET && !isCustomerObject(w.table) && !isNamespacedObject(w.table) && /^[A-Z][A-Z0-9_]*$/.test(w.table))
    .sort((a, b) => a.lineStart - b.lineStart);
  if (!writes.length) return null;
  const tables = [...new Set(writes.map((w) => w.table))];
  const first = writes[0];
  return {
    reader: 'sap-table-write',
    text: givesSapTableWrite(tableWord(first.table), tables.length - 1),
    anchor: anchorOf(first.lineStart, first.lineEnd),
    ask: 'it',
  };
}

/**
 * A program's own log or trace table: writing one records what the program
 * did, it changes no business data — a display check beside it is no gap.
 * Read off the customer table's name, the only place it is said.
 */
const OWN_LOG_TABLE = /LOG|PROT|TRACE|AUDIT|JOURNAL|FEHL|ERROR/;

function authorityFinding(statements: AbapStatement[], missing: boolean): CodeFinding | null {
  const assessment = assessAuthorityFrom(statements);
  const changes = assessment.writes.filter((w) => !(w.via === 'database-write' && w.target === EML_TARGET) && !(w.via === 'database-write' && isCustomerObject(w.target) && OWN_LOG_TABLE.test(w.target.toUpperCase())));
  for (const issue of assessment.issues) {
    if (issue.kind === 'low-value-only') return { reader: 'authority', text: givesAuthorityLowOnly(), anchor: anchorOf(issue.line), ask: 'it' };
    if (issue.kind === 'display-activity-while-writing' && changes.length) {
      return { reader: 'authority', text: givesAuthorityDisplayOnly(), anchor: anchorOf(issue.line), ask: 'it' };
    }
    // A missing include may hold the check.
    if (issue.kind === 'write-without-check' && !missing) {
      // A batch input runs a transaction that checks for itself; only a direct write counts.
      const direct = changes.find((w) => w.via === 'database-write');
      if (direct) return { reader: 'authority', text: givesAuthorityNone(), anchor: anchorOf(direct.line), ask: 'it' };
    }
  }
  return null;
}

/* ------------------------------------------------------------- the block */

/** What the code gives away: at most three findings in the fixed order, the rest counted. */
export function codeGivesAway(input: CodeGivesAwayInput): CodeGivesAway {
  const { findings, testSwitch } = allCodeFindings({ ...input, engineVersion: input.engineVersion });
  return {
    findings: findings.slice(0, GIVES_AWAY_SHOWN),
    more: Math.max(0, findings.length - GIVES_AWAY_SHOWN),
    checked: GIVES_AWAY_SIGNS,
    testSwitch,
  };
}

/** Every finding, one per sign, in the fixed order — what "+ N more" stands for. */
export function allCodeFindings(input: CodeGivesAwayInput): Pick<CodeGivesAway, 'findings' | 'testSwitch'> {
  const none = { findings: [], testSwitch: null };
  const source = String(input.source ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!source.trim()) return none;
  let statements: AbapStatement[];
  try {
    statements = readStatements(source);
  } catch {
    return none;
  }
  if (!statements.length) return none;
  const lines = source.split('\n');
  const ctx = plainContext(source);
  const safely = <T>(read: () => T): T | null => {
    try {
      return read();
    } catch {
      return null;
    }
  };
  const missing = includeMissing(statements, input.skeleton);
  const graph = input.calls ?? safely(() => readCallGraphFrom(statements, readBlocks(statements)));
  const demo = safely(() => readDemoSwitches(source, input.engineVersion));
  const testSwitch = testSwitchOf(demo, input.testData);

  const claim = input.authorClaim !== undefined
    ? input.authorClaim
    : safely(() => authorClaimOf(input.facts !== undefined ? input.facts : programSummaryFactsOf(source, {
      ...(input.skeleton ? { skeleton: input.skeleton } : {}),
      engineVersion: input.engineVersion,
    })));

  const found: Array<CodeFinding | null> = [
    graph ? safely(() => unreachableFinding(source, lines, statements, graph, input)) : null,
    safely(() => ignoredInputFinding(statements, ctx, missing)),
    testSwitch?.anchor ? { reader: 'test-switch', text: testSwitch.sentence, anchor: testSwitch.anchor, ask: 'it' } : null,
    safely(() => fixedScopeFinding(statements, ctx)),
    headerFinding(claim ?? null),
    graph ? safely(() => sapWriteFinding(graph)) : null,
    safely(() => authorityFinding(statements, missing)),
  ];
  const all = found
    .filter((f): f is CodeFinding => !!f && /^L\d+(?:-\d+)?$/.test(f.anchor))
    .sort((a, b) => FINDING_ORDER.indexOf(a.reader) - FINDING_ORDER.indexOf(b.reader) || lineOf(a) - lineOf(b));
  return { findings: all, testSwitch };
}

const lineOf = (f: CodeFinding): number => Number(/^L(\d+)/.exec(f.anchor)?.[1] ?? 0);
