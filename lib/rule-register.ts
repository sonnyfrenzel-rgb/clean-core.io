/**
 * The business rule register (CO review F16, 12.10.2026; roadmap 3.0.11 "In
 * short": "a rule register a decision can work on: current meaning → proposal
 * → decision → implementation → independent test, open rules visibly open").
 *
 * The delivery package used to know two words for the rules, "read" and "not
 * read", and wrote "Not read — the process has not been reconstructed" into a
 * ZIP that carried the engine's reconstruction of the same process. Nobody had
 * answered a rule yet; that was folded into "we could not look". The register
 * keeps the five facts apart (`RuleState`) and gives every rule one row with
 * the chain a decision works along, plus where it stands and which revision
 * set it.
 *
 * Pure: no React, no network, no model. The delivery package writes it into
 * `docs/rule-register.md`; any other reader (the business "In short" texts)
 * takes the same rows from `ruleRegisterFromView` / `ruleRegisterFromSource`.
 */

import { deriveBusinessRules, type BusinessRuleSet } from './abap/business-rule-set';
import { HEADER_RULE_LABEL, type HeaderRuleCandidate } from './abap/header-rules';
import { ruleAnchor } from './rule-anchor';
import { csvCell } from './csv-formula';
import { readProcessStates, subjectIdsOf, type ProcessStateView, type StateEntry, type StateSubject } from './process-states';
import { ruleTraceOf } from './testing-rule-trace';
import { formatTextDate } from './format';

/* ------------------------------------------------------------------ states */

/**
 *   - `not-detected` — the source was read and holds no business rule;
 *   - `not-read` — the rules could not be read (no source, too large, the
 *     source moved, the route unreachable): nothing is known;
 *   - `open` — the rule is there and nobody has kept, changed or dropped it
 *     (a Clarify is a question, and a question is still open);
 *   - `approved` — kept: the need stays as the code has it;
 *   - `changed-on-purpose` — changed deliberately or dropped, with the reason
 *     on record. Never a change nobody looked at.
 *
 * The first two describe the whole set; the last three describe one rule.
 * Every answer is a self-declaration of the signed-in account that gave it —
 * never part of the signed run.
 */
export type RuleState = 'not-detected' | 'not-read' | 'open' | 'approved' | 'changed-on-purpose';

/** The states one rule can be in. */
export type RuleRowState = Extract<RuleState, 'open' | 'approved' | 'changed-on-purpose'>;

export const RULE_STATE_WORDS: Readonly<Record<RuleState, string>> = Object.freeze({
  'not-detected': 'Not detected',
  'not-read': 'Not read',
  open: 'Open',
  approved: 'Approved',
  'changed-on-purpose': 'Changed on purpose',
});

export const RULE_STATE_MEANINGS: Readonly<Record<RuleState, string>> = Object.freeze({
  'not-detected': 'The engine read the source and found no business rule in it.',
  'not-read': 'The rules could not be read; nothing is known about them here.',
  open: 'The rule is there and nobody has kept, changed or dropped it. Its current meaning is the working assumption, not an approval.',
  approved: 'Kept: the need stays as the code has it.',
  'changed-on-purpose': 'Changed deliberately or dropped, with the reason on record.',
});

/** The answer an account gave a rule, in the Business view's words. */
export type RuleAnswer = StateEntry['state'];

export const RULE_ANSWER_WORDS: Readonly<Record<RuleAnswer, string>> = Object.freeze({
  keep: 'Keep',
  change: 'Change deliberately',
  drop: 'Drop',
  clarify: 'Clarify (a question — still open)',
});

/** Keep approves, Change and Drop change the need on purpose, Clarify and no answer leave it open. */
export function ruleRowStateOf(answer: RuleAnswer | null): RuleRowState {
  if (answer === 'keep') return 'approved';
  if (answer === 'change' || answer === 'drop') return 'changed-on-purpose';
  return 'open';
}

/* -------------------------------------------------------------------- rows */

/** A test case that says it checks the rule, and what its run gave. */
export interface RuleTestCase {
  id: string;
  /** The covering run's verdict for this case, or null when no covering run is on record. */
  verdict: string | null;
  /** An engine case (`origin: 'engine'`, its trace names the rule) — derived from the original, not model-stated. */
  engine?: boolean;
}

/** A unit of the generated package that `traceability.json` binds to the rule. */
export interface RuleUnitBinding {
  unitId: string;
  fn: string;
  file: string;
}

/** One row: current meaning → proposal → decision → implementation → test, with evidence and revision. */
export interface RuleRow {
  /** `BR-001`. */
  id: string;
  /** The first condition as written — code, not a business name. */
  label: string;
  state: RuleRowState;
  /** What the rule does today, read from the source by the engine. */
  meaning: string;
  /** What the account wrote with its answer: the new rule text, the reason to drop, the question. */
  proposal: string | null;
  /** The answer on record, or null when nobody answered. */
  answer: RuleAnswer | null;
  by: string | null;
  at: string | null;
  /**
   * Roadmap 3.0.18 item 13 (QM-09): the units of the generated package the
   * package's `traceability.json` binds to this rule — a static mapping (where
   * the rule is carried), never a proof that the code implements the decision.
   * Null when no traceability record is at hand; an empty list when there is
   * one and no unit carries the rule. Never inferred from the code's text.
   */
  implementation: RuleUnitBinding[] | null;
  /** Test cases whose trace names this rule (`lib/testing-rule-trace.ts`). */
  tests: RuleTestCase[];
  /** Where it stands in the source ("line 5 · lines 9 to 12"), or null. */
  evidence: string | null;
  /** The confirmation revision that set the answer, or null when none did. */
  revision: number | null;
}

export type RuleRegister =
  | {
      state: 'read';
      /**
       * `confirmations`: read from the confirmation record (revision 1 of the
       * process exists). `source`: the process has no stored revision yet, so
       * the rules were read from the source and nobody has answered any.
       */
      basis: 'confirmations' | 'source';
      rows: RuleRow[];
      counts: { keep: number; change: number; drop: number; clarify: number; undecided: number };
      apart?: RuleRegisterApart;
    }
  | { state: 'not-detected'; reason: string; apart?: RuleRegisterApart }
  | { state: 'not-read'; reason: string };

/**
 * Roadmap 3.0.13 (SD review CR-A2/CR-A3): what the register lists apart from
 * its rows — the demo-case switches (test data, not rules) and the rules the
 * header comment states (candidates, not read from code). Present only when
 * there is one of either.
 */
export interface RuleRegisterApart {
  demoFlag: string | null;
  demoCases: Array<{ id: string; label: string; routine: string | null; evidence: string }>;
  headerRules: HeaderRuleCandidate[];
}

function apartOf(set: Pick<BusinessRuleSet, 'demoCases' | 'headerRules'>): RuleRegisterApart | null {
  const demo = set.demoCases?.rules ?? [];
  const header = set.headerRules ?? [];
  if (!demo.length && !header.length) return null;
  return {
    demoFlag: set.demoCases?.flag ?? null,
    demoCases: demo.map((d) => ({ id: d.id, label: d.label, routine: d.routine, evidence: lineWords(d.anchor.lineStart, d.anchor.lineEnd) })),
    headerRules: header,
  };
}

const lineWords = (from: number, to: number) => (to > from ? `lines ${from} to ${to}` : `line ${from}`);

/** The rule set of a source the register may read, or null (too large, unreadable). */
function ruleSetOf(source: string | null | undefined): BusinessRuleSet | null {
  if (!source || !source.trim() || new TextEncoder().encode(source).length > MAX_RULE_READ_BYTES) return null;
  try {
    return deriveBusinessRules(source);
  } catch {
    return null;
  }
}

/** What the register needs to know about the tests: the cases, and the covering run's verdicts when there is one. */
export interface RuleTestInput {
  cases: ReadonlyArray<Record<string, unknown>>;
  /** Verdict by case id from a covering run receipt, or null when no run covers the current code and cases. */
  verdicts: Readonly<Record<string, string>> | null;
}

const NO_TESTS: RuleTestInput = { cases: [], verdicts: null };

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The rule an engine case breaks or keeps (`engineCase.trace.ruleId`), or null. */
function engineCaseRule(tc: Record<string, unknown>): string | null {
  if (tc.origin !== 'engine') return null;
  const data = tc.engineCase as { trace?: { ruleId?: unknown } } | undefined;
  return typeof data?.trace?.ruleId === 'string' && data.trace.ruleId ? data.trace.ruleId : null;
}

function testsByRule(input: RuleTestInput): Map<string, RuleTestCase[]> {
  const out = new Map<string, RuleTestCase[]>();
  for (const tc of input.cases) {
    const engineRule = engineCaseRule(tc);
    const ruleId = engineRule ?? ruleTraceOf(tc)?.ruleId ?? null;
    if (!ruleId) continue;
    const id = String(tc.id ?? '');
    if (!id) continue;
    const list = out.get(ruleId) ?? [];
    list.push({ id, verdict: input.verdicts ? input.verdicts[id] ?? null : null, ...(engineRule ? { engine: true } : {}) });
    out.set(ruleId, list);
  }
  return out;
}

/**
 * Behaviour-tested (3.0.18 item 13, QM-09): an engine case on the rule passed in
 * the run that covers the current code and cases. A model-stated case, a case
 * without a covering run, or a failed one is not.
 */
export function behaviourTested(row: Pick<RuleRow, 'tests'>): boolean {
  return row.tests.some((t) => t.engine === true && t.verdict === 'Passed');
}

/** Statically mapped (3.0.18 item 13, QM-09): `traceability.json` binds at least one unit to the rule. */
export const staticallyMapped = (row: Pick<RuleRow, 'implementation'>): boolean => (row.implementation?.length ?? 0) > 0;

/** Decided: an account kept, changed or dropped it. A Clarify is a question, not a decision. */
export const decided = (row: Pick<RuleRow, 'answer'>): boolean => row.answer !== null && row.answer !== 'clarify';

/** The trace of a generated package, as far as the register reads it: which unit carries which rule. */
export interface RuleTraceRecord {
  units: ReadonlyArray<{ unitId: string; fn: string; file: string; rules: ReadonlyArray<{ id: string }> }>;
}

/** The trace in a package's `traceability.json`, or null when there is none or it cannot be read. */
export function ruleTraceRecordOf(content: string | null | undefined): RuleTraceRecord | null {
  if (typeof content !== 'string' || !content.trim()) return null;
  try {
    const parsed = JSON.parse(content) as { format?: unknown; units?: unknown };
    if (typeof parsed.format !== 'string' || !parsed.format.startsWith('clean-core.traceability/') || !Array.isArray(parsed.units)) return null;
    const units = parsed.units
      .filter((u): u is { unitId: string; fn: string; file: string; rules: unknown } => !!u && typeof u === 'object'
        && typeof (u as { unitId?: unknown }).unitId === 'string' && typeof (u as { fn?: unknown }).fn === 'string' && typeof (u as { file?: unknown }).file === 'string')
      .map((u) => ({
        unitId: u.unitId,
        fn: u.fn,
        file: u.file,
        rules: Array.isArray(u.rules) ? u.rules.filter((r): r is { id: string } => !!r && typeof (r as { id?: unknown }).id === 'string') : [],
      }));
    return { units };
  } catch {
    return null;
  }
}

/** The register with every row's static mapping read from the package's trace (3.0.18 item 13, QM-09). */
export function withImplementationTrace(register: RuleRegister, trace: RuleTraceRecord | null): RuleRegister {
  if (register.state !== 'read' || !trace) return register;
  const rows = register.rows.map((row) => ({
    ...row,
    implementation: trace.units
      .filter((u) => u.rules.some((r) => r.id === row.id))
      .map((u) => ({ unitId: u.unitId, fn: u.fn, file: u.file })),
  }));
  return { ...register, rows };
}

function rowsOf(subjects: readonly StateSubject[], bySubject: Readonly<Record<string, StateEntry>>, tests: RuleTestInput): RuleRow[] {
  const traced = testsByRule(tests);
  return subjects
    .filter((s) => s.kind === 'rule')
    .map((s) => {
      const e = bySubject[s.subject] ?? null;
      return {
        id: s.subject,
        label: str(s.label) ?? s.subject,
        state: ruleRowStateOf(e?.state ?? null),
        meaning: str(s.detail) ?? 'not recorded',
        proposal: str(e?.note),
        answer: e?.state ?? null,
        by: e ? e.account.name : null,
        at: e ? e.confirmedAt : null,
        implementation: null,
        tests: traced.get(s.subject) ?? [],
        evidence: str(s.anchor),
        revision: e ? e.revision : null,
      };
    });
}

const NO_RULES = 'the engine read the source and found no business rule in it.';

/** The register from what the process-states route answered; `reason` when it could not be read. */
export function ruleRegisterFromView(
  view: ProcessStateView | null,
  reason = 'the confirmed process states could not be read.',
  tests: RuleTestInput = NO_TESTS,
  /** The signed source, when the caller holds it — for what the register lists apart (3.0.13). */
  source?: string | null,
): RuleRegister {
  if (!view) return { state: 'not-read', reason };
  const set = source ? ruleSetOf(source) : null;
  const apart = set ? apartOf(set) : null;
  // A stored record may still name a rule the engine now counts as a demo switch.
  const demoIds = new Set((apart?.demoCases ?? []).map((d) => d.id));
  const subjects = demoIds.size ? view.subjects.filter((s) => !(s.kind === 'rule' && demoIds.has(s.subject))) : view.subjects;
  const { rules } = subjectIdsOf(subjects);
  if (rules.length === 0) return { state: 'not-detected', reason: NO_RULES, ...(apart ? { apart } : {}) };
  const read = readProcessStates(view.entries.filter((e) => !demoIds.has(e.subject)), { elements: [], rules });
  return { state: 'read', basis: 'confirmations', rows: rowsOf(subjects, read.bySubject, tests), counts: read.counts, ...(apart ? { apart } : {}) };
}

/** The process-states route's limit: `deriveBusinessRules` is quadratic in the source, and this may run in the browser. */
export const MAX_RULE_READ_BYTES = 256 * 1024;

/**
 * The register of a project whose process has no stored revision yet (the
 * process-states route answers `no-baseline`). Revision 1 is written the first
 * time somebody opens the process in the Business view; its absence means
 * nobody has answered a rule, not that the rules are unknown. So they are read
 * from the source the way the route reads them — same derivation, same
 * anchors — and every one is open. Nothing is written.
 */
export function ruleRegisterFromSource(source: string, tests: RuleTestInput = NO_TESTS): RuleRegister {
  if (!source.trim()) return { state: 'not-read', reason: 'the project holds no source.' };
  if (new TextEncoder().encode(source).length > MAX_RULE_READ_BYTES) {
    return { state: 'not-read', reason: 'the source is too large for the rule reader.' };
  }
  let set: ReturnType<typeof deriveBusinessRules>;
  try {
    set = deriveBusinessRules(source);
  } catch {
    return { state: 'not-read', reason: 'the rule reader could not walk the source.' };
  }
  const apart = apartOf(set);
  if (set.rules.length === 0) return { state: 'not-detected', reason: NO_RULES, ...(apart ? { apart } : {}) };
  const subjects: StateSubject[] = set.rules.map((rule) => ({
    subject: rule.id,
    kind: 'rule',
    label: rule.label,
    detail: rule.text,
    anchor: ruleAnchor(rule),
  }));
  return {
    state: 'read',
    basis: 'source',
    rows: rowsOf(subjects, {}, tests),
    counts: { keep: 0, change: 0, drop: 0, clarify: 0, undecided: subjects.length },
    ...(apart ? { apart } : {}),
  };
}

/** The three facts of QM-09, counted; `mapped` is null when no row carries a trace (no traceability record). */
export function ruleEvidenceCounts(rows: readonly RuleRow[]): { mapped: number | null; decided: number; tested: number } {
  return {
    mapped: rows.length && rows.every((r) => r.implementation === null) ? null : rows.filter(staticallyMapped).length,
    decided: rows.filter(decided).length,
    tested: rows.filter(behaviourTested).length,
  };
}

/** The three per-rule states, counted. */
export function ruleStateCounts(rows: readonly RuleRow[]): Record<RuleRowState, number> {
  return {
    open: rows.filter((x) => x.state === 'open').length,
    approved: rows.filter((x) => x.state === 'approved').length,
    'changed-on-purpose': rows.filter((x) => x.state === 'changed-on-purpose').length,
  };
}

/* ------------------------------------------------------------------- words */

const day = (iso: string | null) => (iso ? formatTextDate(iso) ?? iso.slice(0, 10) : null);

/** The words of one row, cell by cell — shared by the Markdown table and any other reader. */
export function ruleRowWords(row: RuleRow): {
  proposal: string;
  decision: string;
  implementation: string;
  test: string;
  evidence: string;
  revision: string;
} {
  const proposal =
    row.proposal ?? (row.answer === null || row.answer === 'clarify' ? 'None — the current meaning is the working assumption.' : 'None on record.');
  const who = [row.by ? `by ${row.by}` : null, row.at ? `on ${day(row.at)}` : null].filter(Boolean).join(' ');
  const decision = row.answer ? `${RULE_ANSWER_WORDS[row.answer]}${who ? ` — ${who}` : ''}` : 'None on record — open.';
  // 3.0.18 item 13 (QM-09): three facts kept apart — mapped statically (this column), decided (Decision), behaviour-tested (Test).
  const implementation = row.implementation === null
    ? 'Not traced — no record ties the delivered code to this rule.'
    : row.implementation.length
      ? `Statically mapped to ${row.implementation.map((u) => `${u.unitId} \`${u.fn}\` (${u.file})`).join(', ')} — traceability.json; where the rule is carried, not a proof that the code implements the decision.`
      : 'Not mapped — traceability.json binds no unit of the package to this rule.';
  const passed = row.tests.filter((t) => t.engine && t.verdict === 'Passed');
  const cases = row.tests.map((t) => `${t.id}${t.engine ? ', engine case' : ''} (${t.verdict ? t.verdict.toLowerCase() : 'no covering run'})`).join(', ');
  const modelOnly = row.tests.length > 0 && row.tests.every((t) => !t.engine);
  const test = !row.tests.length
    ? 'None — no test case traces this rule.'
    : passed.length
      ? `Behaviour-tested: ${passed.map((t) => t.id).join(', ')} passed in the covering run. All cases: ${cases}.`
      : modelOnly
        ? `${cases} — expected result model-stated from the original, not an independent test.`
        : `Not behaviour-tested — no engine case on this rule passed in a covering run. Cases: ${cases}.`;
  const evidence = row.evidence ? `Source, ${row.evidence}` : 'Not anchored';
  const revision = row.revision !== null ? `Confirmation revision ${row.revision}` : '—';
  return { proposal, decision, implementation, test, evidence, revision };
}

/** A table cell: one line, pipes escaped. */
const cell = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');

/** The register as Markdown sections (states legend, then the table), without a document title. */
export function ruleRegisterMarkdown(register: RuleRegister): string[] {
  const lines: string[] = [];
  lines.push('## States', '');
  for (const st of Object.keys(RULE_STATE_WORDS) as RuleState[]) lines.push(`- **${RULE_STATE_WORDS[st]}** — ${RULE_STATE_MEANINGS[st]}`);
  lines.push('', '## Rules', '');
  if (register.state !== 'read') {
    lines.push(`**${RULE_STATE_WORDS[register.state]}** — ${register.reason}`);
    if (register.state === 'not-detected' && register.apart) lines.push(...apartMarkdown(register.apart));
    return lines;
  }
  lines.push(
    register.basis === 'source'
      ? 'Read from the source by the engine. The process has no stored revision yet, so nobody has answered a rule: every rule is open.'
      : 'Read from the confirmation record of the process, against revision 1 — the process as reconstructed from the signed source.',
    '',
  );
  const c = ruleStateCounts(register.rows);
  lines.push(`${RULE_STATE_WORDS.open}: ${c.open} · ${RULE_STATE_WORDS.approved}: ${c.approved} · ${RULE_STATE_WORDS['changed-on-purpose']}: ${c['changed-on-purpose']}`, '');
  // 3.0.18 item 13 (QM-09): three facts, three numbers — none stands in for another.
  const f = ruleEvidenceCounts(register.rows);
  lines.push(
    `Three facts, kept apart: statically mapped to a unit of the package (traceability.json): ${f.mapped === null ? 'not traced — no traceability record' : `${f.mapped} of ${register.rows.length}`} · `
    + `decided by an account: ${f.decided} of ${register.rows.length} · behaviour-tested (an engine case on it passed in the covering run): ${f.tested} of ${register.rows.length}.`,
    '',
  );
  lines.push(`| ${RULE_REGISTER_COLUMNS.join(' | ')} |`, `|${RULE_REGISTER_COLUMNS.map(() => '---').join('|')}|`);
  for (const row of register.rows) {
    const w = ruleRowWords(row);
    lines.push(
      `| ${row.id} \`${row.label.replace(/`/g, "'")}\` | ${RULE_STATE_WORDS[row.state]} | ${cell(row.meaning)} | ${cell(w.proposal)} | ${cell(w.decision)} | ${cell(w.implementation)} | ${cell(w.test)} | ${cell(w.evidence)} | ${w.revision} |`,
    );
  }
  if (register.apart) lines.push(...apartMarkdown(register.apart));
  return lines;
}

/**
 * What the register lists apart (roadmap 3.0.13): the rules the header states,
 * as candidates a reader checks against the code, and the demo-case switches,
 * counted so that none of them goes missing — neither is a row of the table.
 */
function apartMarkdown(apart: RuleRegisterApart): string[] {
  const lines: string[] = [];
  if (apart.headerRules.length) {
    lines.push(
      '',
      '## Rules stated in the header comment — candidates',
      '',
      `${HEADER_RULE_LABEL}. The program's author wrote these in its header comment; the engine did not read them from a condition in the code, so each is a candidate until a reader finds it in the code and confirms it. ${apart.headerRules.length} in all.`,
      '',
      '| Candidate | Stated in the header | Evidence |',
      '|---|---|---|',
    );
    for (const c of apart.headerRules) lines.push(`| ${c.id} | ${cell(c.text)} | Header comment, ${lineWords(c.lineStart, c.lineEnd)} |`);
  }
  if (apart.demoCases.length) {
    lines.push(
      '',
      '## Demo-case switches — counted apart',
      '',
      `${apart.demoCases.length} ${apart.demoCases.length === 1 ? 'entry selects' : 'entries select'} the program's own demo data${apart.demoFlag ? ` (demo switch ${apart.demoFlag})` : ''}: an arm of the switch on the demo case, a check on the demo parameters, or a constant naming demo data. They are test data, not business rules, and are not rows of the table above; their numbers stay free, so every rule keeps the number a decision is stored against.`,
      '',
      '| Entry | Condition | Routine | Evidence |',
      '|---|---|---|---|',
    );
    for (const d of apart.demoCases) lines.push(`| ${d.id} | \`${d.label.replace(/`/g, "'").replace(/\|/g, '\\|')}\` | ${d.routine ?? '—'} | Source, ${d.evidence} |`);
  }
  return lines;
}

/* --------------------------------------------------------------------- CSV */

/** The columns of the register, in order — the Markdown table and the CSV share them. */
export const RULE_REGISTER_COLUMNS = Object.freeze([
  'Rule',
  'State',
  'Current meaning',
  'Proposal',
  'Decision',
  'Implementation',
  'Test',
  'Evidence',
  'Revision',
] as const);

/**
 * One CSV field (RFC 4180): always quoted, inner quotes doubled, so a comma,
 * a semicolon (the delimiter a German spreadsheet assumes), a quote or a line
 * break inside a rule's meaning or an account's note can never split or shift
 * a row (owner, 12.10.2026: the package has had CSV-delimiter findings
 * before). A value a spreadsheet would evaluate (=, +, -, @ — also after
 * leading spaces — or a leading tab or CR) is prefixed with a single quote: the
 * same guard as the audit pack's `03-findings.csv` (`lib/csv-formula.ts`), since
 * notes are typed by accounts and meanings quote ABAP.
 */
export function ruleCsvField(value: string): string {
  return csvCell(value);
}

/**
 * The register as CSV (CO review F16; owner, 12.10.2026): the same rows and
 * columns as the Markdown table, UTF-8, CRLF between records as RFC 4180
 * says. Line breaks inside a field are kept, inside its quotes. A register
 * with no rows (not read, not detected) is the header alone — the reason is
 * in the Markdown file and in STATUS.md.
 */
export function ruleRegisterCsv(register: RuleRegister): string {
  const records: string[][] = [[...RULE_REGISTER_COLUMNS]];
  if (register.state === 'read') {
    for (const row of register.rows) {
      const w = ruleRowWords(row);
      records.push([
        `${row.id} ${row.label}`,
        RULE_STATE_WORDS[row.state],
        row.meaning,
        w.proposal,
        w.decision,
        w.implementation,
        w.test,
        w.evidence,
        w.revision,
      ]);
    }
  }
  return `${records.map((r) => r.map(ruleCsvField).join(',')).join('\r\n')}\r\n`;
}
