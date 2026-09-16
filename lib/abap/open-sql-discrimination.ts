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
 * The statement with its text literals blanked, keeping every offset.
 *
 * The clause test below runs over the whole statement, so a literal containing
 * one of those words — `DELETE FROM zlog WHERE reason = 'assigning'` — would
 * offer it to the test as if it were syntax. No input actually reaches a wrong
 * answer through that today, because each branch decides on its own structure
 * and not on the flag alone; sixteen adversarial statements were measured
 * before this was written (QA review of cf0f2244eda4). It is closed anyway:
 * the next branch that leans on the flag would inherit the hole, and
 * `lib/abap/select-parser.ts` already established that a keyword inside a
 * literal is not a keyword.
 */
function withoutLiterals(text: string): string {
  let out = '';
  let quote: string | null = null;
  for (const ch of text) {
    if (quote) {
      out += ch === quote ? ch : ' ';
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

export function databaseWriteIn(text: string): SqlWrite | null {
  const isInternalTableOp = INTERNAL_TABLE_CLAUSE.test(withoutLiterals(text));

  // INSERT — the database form is `INSERT tab FROM …` or `INSERT INTO tab VALUES …`.
  // `INSERT <wa> INTO <itab>` is the internal form and carries none of the
  // clauses above, so the discriminator is where INTO sits: after a name it is
  // internal, immediately after INSERT it is Open SQL.
  const insertIntoItab = /^INSERT\s+[\w/]+(?:-[\w]+)*\s+INTO\b/i.test(text);
  const insert = text.match(/^INSERT\s+(?:INTO\s+)?([\w/]+)/i);
  if (insert && !isInternalTableOp && !insertIntoItab && !NOT_A_TABLE.has(insert[1].toUpperCase())) {
    return { table: insert[1], keyword: 'INSERT' };
  }

  // UPDATE — no internal-table form, so no guard is needed.
  const update = text.match(/^UPDATE\s+([\w/]+)/i);
  if (update && !NOT_A_TABLE.has(update[1].toUpperCase())) {
    return { table: update[1], keyword: 'UPDATE' };
  }

  // MODIFY — `MODIFY TABLE itab`, `MODIFY itab … INDEX n` and TRANSPORTING are internal.
  const modify = text.match(/^MODIFY\s+([\w/]+)/i);
  if (modify && !isInternalTableOp && !NOT_A_TABLE.has(modify[1].toUpperCase())) {
    return { table: modify[1], keyword: 'MODIFY' };
  }

  // DELETE — the database form is `DELETE FROM tab WHERE …` or `DELETE tab FROM …`;
  // `DELETE itab WHERE …` without FROM exists only for internal tables.
  const del = text.match(/^DELETE\s+(?:FROM\s+)?([\w/]+)/i);
  const isDbDelete = /^DELETE\s+FROM\b/i.test(text) || /^DELETE\s+[\w/]+\s+FROM\b/i.test(text);
  const isInternalDelete = !isDbDelete && /^DELETE\s+[\w/]+\s+WHERE\b/i.test(text);
  if (del && !isInternalDelete && (isDbDelete || !isInternalTableOp) && !NOT_A_TABLE.has(del[1].toUpperCase())) {
    return { table: del[1], keyword: 'DELETE' };
  }

  return null;
}

/** True when the statement is an internal-table operation wearing a database keyword. */
export function isInternalTableOperation(text: string): boolean {
  return INTERNAL_TABLE_CLAUSE.test(text) || /^INSERT\s+[\w/]+(?:-[\w]+)*\s+INTO\b/i.test(text);
}
