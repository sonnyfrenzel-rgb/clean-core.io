/**
 * Is this statement Open SQL, or is it the internal-table form of the same word?
 *
 * ABAP spells both with the same keywords. `INSERT ls_item INTO TABLE lt_items`
 * touches no database at all, and read as Open SQL it names the *work area* as
 * the table: a Critical "direct write to SAP standard table LS_ITEM" on
 * ordinary code, which inflates the Critical count, depresses the Clean Core
 * score and can flip the routing decision to side-by-side.
 *
 * The evidence engine learned this; `code-assessment.ts` had its own copy of
 * the detectors without it, so the same statements came back as data coupling
 * on the architecture surfaces (QA review of 33471220d6e9, eac6118f1eac).
 * One module now, read by both.
 *
 * Approximate by design, and deliberately in the direction of over-reporting:
 * an unknown name is still treated as a table, so a real database write is
 * never missed. What this removes is the noise.
 */

import { maskLiterals } from './statement-reader';

/**
 * Clauses that only ever appear on the internal-table form.
 *
 * `FROM TABLE` is deliberately not among them: `MODIFY dbtab FROM TABLE itab`
 * and `INSERT dbtab FROM TABLE itab` are the mass forms of a real database
 * write, and treating them as internal would hide exactly the statement that
 * matters most.
 */
// Every alternative closes with a word boundary. `ASSIGNING` and `TRANSPORTING`
// did not, so they also matched inside `assigning_clerk` and
// `transporting_flag` — ordinary column names. No statement reached a wrong
// answer through it, because each branch decides on its own structure, but a
// clause test that fires on half an identifier is one refactor away from doing
// so (QA review of cf0f2244eda4).
const INTERNAL_TABLE_CLAUSE = /\b(?:INTO\s+TABLE\b|LINES\s+OF\b|INITIAL\s+LINE\b|ADJACENT\s+DUPLICATES\b|ASSIGNING\b|REFERENCE\s+INTO\b|TRANSPORTING\b|INDEX\b)/i;

/** Words that are never a table name in these positions. */
const NOT_A_TABLE = new Set(['SCREEN', 'LINE', 'TABLE', 'FROM', 'ADJACENT']);

export interface SqlWrite {
  /** The table the statement writes to. */
  table: string;
  /** INSERT, UPDATE, MODIFY or DELETE. */
  keyword: 'INSERT' | 'UPDATE' | 'MODIFY' | 'DELETE';
}

/**
 * The database write in this statement, or `null` when it is an internal-table
 * operation, a screen statement, or nothing of the sort.
 */
/**
 * The clause test and the shapes below run over the whole statement, so a
 * literal containing one of those words — `DELETE FROM zlog WHERE reason =
 * 'assigning'` — would offer it to the test as if it were syntax. Sixteen
 * adversarial statements were measured before the masking was added (QA review
 * of cf0f2244eda4), and none of them reached a wrong answer, because each
 * branch decides on its own structure and not on the flag alone.
 *
 * A private copy of the rule was written here, and it knew `'…'` and `` `…` ``
 * and not the string template. That is the hole the full review of a19945ef01dc
 * found: `INSERT zlog FROM @( VALUE zlog( message = |INDEX| ) )` handed `INDEX`
 * to the clause test as syntax, the helper answered "internal table", and a real
 * write to a custom table produced no finding on any surface. So the rule is not
 * restated here any more; `maskLiterals` in `statement-reader.ts` is asked, the
 * same pre-stage every other detector runs.
 */

export function databaseWriteIn(text: string): SqlWrite | null {
  // Every test below reads the masked form, so a keyword inside a literal is
  // never syntax — the name a branch captures is an identifier and therefore
  // stands unchanged in both.
  const bare = maskLiterals(text);
  const isInternalTableOp = INTERNAL_TABLE_CLAUSE.test(bare);

  // INSERT — the database form is `INSERT tab FROM …` or `INSERT INTO tab VALUES …`.
  // `INSERT <wa> INTO <itab>` is the internal form and carries none of the
  // clauses above, so the discriminator is where INTO sits: after a name it is
  // internal, immediately after INSERT it is Open SQL.
  const insertIntoItab = /^INSERT\s+[\w/]+(?:-[\w]+)*\s+INTO\b/i.test(bare);
  const insert = bare.match(/^INSERT\s+(?:INTO\s+)?([\w/]+)/i);
  if (insert && !isInternalTableOp && !insertIntoItab && !NOT_A_TABLE.has(insert[1].toUpperCase())) {
    return { table: insert[1], keyword: 'INSERT' };
  }

  // UPDATE — no internal-table form, so no guard is needed.
  const update = bare.match(/^UPDATE\s+([\w/]+)/i);
  if (update && !NOT_A_TABLE.has(update[1].toUpperCase())) {
    return { table: update[1], keyword: 'UPDATE' };
  }

  // MODIFY — `MODIFY TABLE itab`, `MODIFY itab … INDEX n` and TRANSPORTING are internal.
  const modify = bare.match(/^MODIFY\s+([\w/]+)/i);
  if (modify && !isInternalTableOp && !NOT_A_TABLE.has(modify[1].toUpperCase())) {
    return { table: modify[1], keyword: 'MODIFY' };
  }

  // DELETE — the database form is `DELETE FROM tab WHERE …` or `DELETE tab FROM …`;
  // `DELETE itab WHERE …` without FROM exists only for internal tables.
  const del = bare.match(/^DELETE\s+(?:FROM\s+)?([\w/]+)/i);
  const isDbDelete = /^DELETE\s+FROM\b/i.test(bare) || /^DELETE\s+[\w/]+\s+FROM\b/i.test(bare);
  const isInternalDelete = !isDbDelete && /^DELETE\s+[\w/]+\s+WHERE\b/i.test(bare);
  if (del && !isInternalDelete && (isDbDelete || !isInternalTableOp) && !NOT_A_TABLE.has(del[1].toUpperCase())) {
    return { table: del[1], keyword: 'DELETE' };
  }

  return null;
}

/** True when the statement is an internal-table operation wearing a database keyword. */
export function isInternalTableOperation(text: string): boolean {
  const bare = maskLiterals(text);
  return INTERNAL_TABLE_CLAUSE.test(bare) || /^INSERT\s+[\w/]+(?:-[\w]+)*\s+INTO\b/i.test(bare);
}
