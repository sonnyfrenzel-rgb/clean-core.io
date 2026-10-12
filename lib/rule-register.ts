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

import { deriveBusinessRules } from './abap/business-rule-set';
import { ruleAnchor } from './rule-anchor';
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
   * Whether the delivered code implements the decision. No record ties the
   * generated code to a rule, so this is always null today and the register
   * says so — never inferred from the code's text.
   */
  implementation: string | null;
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
    }
  | { state: 'not-detected'; reason: string }
  | { state: 'not-read'; reason: string };

/** What the register needs to know about the tests: the cases, and the covering run's verdicts when there is one. */
export interface RuleTestInput {
  cases: ReadonlyArray<Record<string, unknown>>;
  /** Verdict by case id from a covering run receipt, or null when no run covers the current code and cases. */
  verdicts: Readonly<Record<string, string>> | null;
}

const NO_TESTS: RuleTestInput = { cases: [], verdicts: null };

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function testsByRule(input: RuleTestInput): Map<string, RuleTestCase[]> {
  const out = new Map<string, RuleTestCase[]>();
  for (const tc of input.cases) {
    const trace = ruleTraceOf(tc);
    if (!trace) continue;
    const id = String(tc.id ?? '');
    if (!id) continue;
    const list = out.get(trace.ruleId) ?? [];
    list.push({ id, verdict: input.verdicts ? input.verdicts[id] ?? null : null });
    out.set(trace.ruleId, list);
  }
  return out;
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
): RuleRegister {
  if (!view) return { state: 'not-read', reason };
  const { rules } = subjectIdsOf(view.subjects);
  if (rules.length === 0) return { state: 'not-detected', reason: NO_RULES };
  const read = readProcessStates(view.entries, { elements: [], rules });
  return { state: 'read', basis: 'confirmations', rows: rowsOf(view.subjects, read.bySubject, tests), counts: read.counts };
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
  if (set.rules.length === 0) return { state: 'not-detected', reason: NO_RULES };
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
  const implementation = row.implementation ?? 'Not traced — no record ties the delivered code to this rule.';
  const test = row.tests.length
    ? `${row.tests.map((t) => `${t.id} (${t.verdict ? t.verdict.toLowerCase() : 'no covering run'})`).join(', ')} — expected result model-stated from the original, not an independent test.`
    : 'None — no test case traces this rule.';
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
  lines.push(
    '| Rule | State | Current meaning | Proposal | Decision | Implementation | Test | Evidence | Revision |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const row of register.rows) {
    const w = ruleRowWords(row);
    lines.push(
      `| ${row.id} \`${row.label.replace(/`/g, "'")}\` | ${RULE_STATE_WORDS[row.state]} | ${cell(row.meaning)} | ${cell(w.proposal)} | ${cell(w.decision)} | ${cell(w.implementation)} | ${cell(w.test)} | ${cell(w.evidence)} | ${w.revision} |`,
    );
  }
  return lines;
}
