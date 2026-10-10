import { readStatements, type AbapStatement } from './statement-reader';
import { readCallGraphFrom, type AuthorityCheck } from './call-graph';
import { readBatchInputFrom } from './batch-input';
import { readBlocks } from './block-structure';

/**
 * The authorization check assessed — roadmap 3.0.7, from the
 * ZMM_BESTELLUEBERSICHT review.
 *
 * Until now an `AUTHORITY-CHECK` was a fact with an object and its fields
 * (`call-graph.ts`) and an Info finding saying "retain it". The review showed
 * three ways the check that is there does not hold what a reader assumes it
 * holds, each read off the statements and nothing else:
 *
 *   1. **Only the LOW value of a range is checked** — `ID 'BUKRS' FIELD
 *      s_bukrs-low` on a `SELECT-OPTIONS`. An interval (`BT 1000 2000`), an
 *      exclusion or a pattern selects values the check never saw: whoever may
 *      display 1000 reads 2000 as well.
 *   2. **A display-only activity while the program writes** — `ID 'ACTVT'
 *      FIELD '03'` and a database write or a batch input in the same program.
 *      The check asks whether the user may *display*; the program then changes.
 *   3. **Writes without any check** — the program changes data and holds no
 *      `AUTHORITY-CHECK` (nor an `AUTHORITY_CHECK*` function module) at all.
 *
 * What it does not say: whether the called transaction, BAPI or update
 * function checks on its own. A transaction run by batch input checks the
 * user's authorizations for itself; the sentence names that rather than
 * claiming a hole. Each issue is a question for the people who own the
 * authorization concept, anchored at its line, never a verdict on the
 * system's security.
 *
 * Pure: statements in, issues out; no catalogue, no model.
 */

export type AuthorityIssueKind = 'low-value-only' | 'display-activity-while-writing' | 'write-without-check';

export interface AuthorityIssue {
  kind: AuthorityIssueKind;
  /** The line of the check — or, for `write-without-check`, of the first write. */
  line: number;
  /** The authorization object, where the issue is about one check. */
  object?: string;
  /** The field as written: `s_bukrs-low`, `'03'`. */
  field?: string;
  /** One sentence a reader can check against the cited lines. */
  detail: string;
}

/** A change the program makes: a database write or a batch input. */
export interface AuthorityRelevantWrite {
  line: number;
  /** `ZMM_BEST_STAT`, or the transaction a batch input drives: `ME22`. */
  target: string;
  via: 'database-write' | 'batch-input';
}

export interface AuthorityAssessment {
  checks: AuthorityCheck[];
  writes: AuthorityRelevantWrite[];
  issues: AuthorityIssue[];
}

/** The display activity of the `ACTVT` field: 03. */
const DISPLAY_ACTIVITY = '03';

export function assessAuthority(source: string): AuthorityAssessment {
  return assessAuthorityFrom(readStatements(source));
}

export function assessAuthorityFrom(statements: AbapStatement[]): AuthorityAssessment {
  const graph = readCallGraphFrom(statements, readBlocks(statements));

  // Ranges: SELECT-OPTIONS and RANGES, and the constants a FIELD may name.
  const ranges = new Set<string>();
  const constants = new Map<string, string>();
  for (const statement of statements) {
    const range = /^(?:SELECT-OPTIONS|RANGES)\s*:?\s*([\w/]+)/i.exec(statement.text);
    if (range) ranges.add(range[1].toUpperCase());
    const constant = /^CONSTANTS\s*:?\s*([\w/]+)\b[\s\S]*?\bVALUE\s+'((?:[^']|'')*)'/i.exec(statement.text);
    if (constant) constants.set(constant[1].toUpperCase(), constant[2]);
  }
  const valueOf = (operand: string | undefined): string | null => {
    if (!operand) return null;
    const literal = /^'((?:[^']|'')*)'$/.exec(operand.trim());
    if (literal) return literal[1];
    // `call-graph.ts` hands a literal FIELD back without its quotes.
    if (/^\d+$/.test(operand.trim())) return operand.trim();
    return constants.get(operand.trim().toUpperCase()) ?? null;
  };

  const writes: AuthorityRelevantWrite[] = [
    ...graph.databaseWrites.map((w) => ({ line: w.lineStart, target: w.table, via: 'database-write' as const })),
    ...readBatchInputFrom(statements).map((c) => ({ line: c.line, target: c.transaction ?? 'CALL TRANSACTION', via: 'batch-input' as const })),
  ].sort((a, b) => a.line - b.line);

  const issues: AuthorityIssue[] = [];
  for (const check of graph.authorityChecks) {
    const object = check.object ?? check.objectExpression;
    for (const field of check.fields) {
      if (!field.value) continue;
      const low = /^([\w/]+)-LOW$/i.exec(field.value.trim());
      if (low && ranges.has(low[1].toUpperCase())) {
        issues.push({
          kind: 'low-value-only',
          line: check.lineStart,
          object,
          field: field.value,
          detail: `${object} checks ${field.id} against ${field.value} only: the HIGH value, an exclusion or a pattern of the selection ${low[1]} is never checked, so an interval selects values nobody checked.`,
        });
      }
      if (field.id === 'ACTVT' && valueOf(field.value) === DISPLAY_ACTIVITY && writes.length > 0) {
        const first = writes[0];
        issues.push({
          kind: 'display-activity-while-writing',
          line: check.lineStart,
          object,
          field: field.value,
          detail: `${object} checks activity 03 (display) only, and the program changes data — ${describe(first)} at line ${first.line}${writes.length > 1 ? ` and ${writes.length - 1} more` : ''}. No check for a change activity is written.`,
        });
      }
    }
  }

  const checksAnywhere = graph.authorityChecks.length > 0
    || graph.functionModules.some((call) => /^AUTHORITY_CHECK/i.test(call.name ?? ''));
  if (!checksAnywhere && writes.length > 0) {
    const first = writes[0];
    issues.push({
      kind: 'write-without-check',
      line: first.line,
      detail: `The program changes data — ${describe(first)}${writes.length > 1 ? ` and ${writes.length - 1} more` : ''} — and holds no AUTHORITY-CHECK at all.${writes.some((w) => w.via === 'batch-input') ? ' A transaction run by batch input checks the user\'s authorizations for itself; the direct writes do not.' : ''}`,
    });
  }
  return { checks: graph.authorityChecks, writes, issues };
}

function describe(write: AuthorityRelevantWrite): string {
  return write.via === 'batch-input' ? `a batch input to ${write.target}` : `a write to ${write.target}`;
}
