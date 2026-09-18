/**
 * What the tables this code touches may mean for a compliance review — roadmap
 * 7.7.
 *
 * **Hints, not a classification. That distinction is the whole step.** A
 * product that says *"this table contains personal data"* has classified the
 * reader's data, is wrong whenever the rows happen to be test data, a company
 * rather than a person, or an empty shell — and is wrong with legal weight. A
 * product that says *"this code reads LFA1 and PA0002; SAP files employee
 * master data and supplier master data in tables of those names, and tables of
 * that kind often carry personal data — check it"* has said something true
 * about SAP's dictionary and handed the judgement to the person who can
 * actually make it. Everything below is written the second way, and
 * `tests/compliance-review-hints-guard.spec.ts` fails the build on the first.
 *
 * **What this is not.** It is not `lib/personal-data-hints.ts`, which has a
 * different subject: that module reads the uploaded *source text* for shapes
 * that look like somebody's address or personnel number, in the browser, before
 * the text is sent. This one never looks at the text at all. It reads the list
 * of tables the evidence engine already found (`lib/abap/table-dependencies.ts`
 * via `buildAbapEvidence`, persisted as `Project.dataCoupling`) and says what
 * SAP keeps in tables of those names. One asks *"is there a person in this
 * file?"*, the other asks *"what kind of system data does this program reach
 * into?"*. Neither answers the other's question.
 *
 * **Why a hand-written list of families and not the catalog.** The natural
 * instinct is to reuse the Cloudification Repository artifact — it is SAP's own
 * data, it carries an `applicationComponent` per object, and reusing it would
 * beat writing a list by hand. It does not work for this question. Measured
 * against the 2026-09-15 sync (`lib/abap/generated/cloudification-repo.latest.json`,
 * 25,467 entries): KNA1, LFA1, BSEG and BKPF are in it — and PA0002, PA0008,
 * ADRC, ADR6, USR02, BSET and HRP1000 are not, because SAP lists objects it has
 * *released or replaced*, not objects that hold people. The tables this hint
 * exists for are exactly the ones the catalog is silent about. So the families
 * below are written out, from SAP's own dictionary naming conventions, and the
 * module says out loud how few of them it knows.
 *
 * **Deterministic, offline, no model.** No import that reaches a network, no
 * `fetch`, no `/api/gemini`. The same table list always produces the same
 * hints, in the same order. The two imports are `import type` and are erased at
 * compile time, so nothing of `lib/types.ts` or the engine reaches a browser
 * bundle through this file — it is safe for a client component, the way
 * `lib/abap/abcd-classification.ts` is and `lib/abap/catalog-service.ts`
 * deliberately is not.
 *
 * **No completeness claim, ever.** A table whose name matches nothing is
 * reported as unrecognised rather than passed over, because "we found no hint"
 * and "there is nothing here" are different statements and only the first one
 * is true. Every Z table falls in that bucket by construction: a name of the
 * customer's own says nothing about its content, and this module will not
 * pretend otherwise.
 */

import type { DataCouplingEntry } from './types';
import type { TableDependency } from './abap/table-dependencies';

/* ----------------------------------------------------------------- concerns */

/**
 * The three things roadmap 7.7 names: *"personenbezogene, steuer- oder
 * revisionsrelevante Daten"*.
 */
export type ComplianceConcern = 'personal-data' | 'tax-relevant' | 'audit-relevant';

/** Declaration order, and the order hints come back in. */
export const COMPLIANCE_CONCERNS: readonly ComplianceConcern[] = [
  'personal-data',
  'tax-relevant',
  'audit-relevant',
] as const;

export interface ConcernCopy {
  /**
   * An instruction, never a category.
   *
   * A chip reading "Personal data" next to PA0002 is a classification however
   * carefully the paragraph under it is worded — the eye takes the chip and
   * leaves the paragraph. "Check for personal data" cannot be read as a
   * finding, because it is an imperative addressed to the reader.
   */
  label: string;
  /**
   * What tables of this kind *often* carry. Completes the sentence "Tables of
   * this kind often carry …", so it is a noun phrase and never a verdict.
   */
  carries: string;
  /**
   * What a raised concern normally means for how deeply the change is reviewed
   * and tested — roadmap 7.7's *"sie bestimmen Prüftiefe und Testpflicht"*.
   *
   * Hedged on purpose, and every sentence hands the decision away. Clean-Core.io
   * is not in a position to tell anybody what their retention rules, their
   * auditor or their data protection officer require; it can say what usually
   * follows and who decides.
   */
  depth: string;
}

export const CONCERN_COPY: Record<ComplianceConcern, ConcernCopy> = {
  'personal-data': {
    label: 'Check for personal data',
    carries: 'data about identified people',
    depth:
      'Where rows about identified people are in play, that normally decides how closely a change is ' +
      'reviewed and who has to look at it, and a test usually needs data of its own rather than a copy ' +
      'taken from production. Whether it applies here is for whoever answers for data protection in your ' +
      'organisation to say.',
  },
  'tax-relevant': {
    label: 'Check for tax-relevant records',
    carries: 'records that matter for tax',
    depth:
      'Where a change can move what was posted or how it was taxed, it is normally expected to stay ' +
      'reproducible afterwards, which usually decides what a test has to record and keep. What your ' +
      'retention rules actually require is for your organisation to say, not for this product.',
  },
  'audit-relevant': {
    label: 'Check for audit-relevant records',
    carries: 'records an auditor relies on being complete',
    depth:
      'Where an auditor relies on these rows being complete, code that writes, filters or deletes them is ' +
      'usually tested harder than code that only reads them — and a read that feeds a report is often ' +
      'treated the same way. Your audit function sets that bar.',
  },
};

/* ----------------------------------------------------------------- families */

export type ComplianceFamilyId =
  | 'hr-infotype'
  | 'address'
  | 'user-master'
  | 'business-partner'
  | 'financial-document'
  | 'billing-document'
  | 'tax-configuration'
  | 'change-log';

interface TableFamily {
  id: ComplianceFamilyId;
  concerns: readonly ComplianceConcern[];
  /** Two or three words for the section heading. */
  title: string;
  /**
   * What SAP keeps in tables of these names.
   *
   * This is the one sentence in the module that states a fact, and it is a fact
   * about **SAP's data dictionary**, not about the reader's rows: what the
   * tables are for, as SAP ships them. It is checkable against SAP's own
   * documentation, which is exactly what makes it safe to print.
   */
  sapKeeps: string;
  /** Exact names, upper case. */
  names?: readonly string[];
  /** SAP's own numbering conventions, where a list would be endless. */
  pattern?: RegExp;
}

/**
 * The families, in the order hints are reported.
 *
 * Deliberately short. Eight families is not a map of everything that can carry
 * regulated data in an SAP system and does not try to be — a long list written
 * from memory would be a long list of guesses. These are table families whose
 * purpose is fixed by SAP's dictionary and whose names cannot mean anything
 * else, which is the only kind of entry that earns its place here. What is
 * missing is reported as missing (`unrecognised`), not smoothed over.
 */
const FAMILIES: readonly TableFamily[] = [
  {
    id: 'hr-infotype',
    concerns: ['personal-data'],
    title: 'HR infotypes',
    sapKeeps:
      'SAP files human-resources master data in infotype tables: PAnnnn for employees and PBnnnn for ' +
      'applicants, both keyed by a personnel number, HRPnnnn for Organisational Management objects, and ' +
      'the PCL clusters for payroll and time results.',
    pattern: /^(?:PA|PB)\d{4}$|^HRP\d{4}$|^PCL[1-4]$/,
  },
  {
    id: 'address',
    concerns: ['personal-data'],
    title: 'Central addresses',
    sapKeeps:
      'These are SAP Business Address Services, where every address in the system is kept once: ADRC the ' +
      'postal address, ADRP the person a private address belongs to, ADR2 telephone numbers, ADR6 e-mail ' +
      'addresses.',
    pattern: /^ADR(?:C|CT|P|T|V|\d{1,2})$/,
  },
  {
    id: 'user-master',
    concerns: ['personal-data', 'audit-relevant'],
    title: 'User master and authorisations',
    sapKeeps:
      'The accounts people sign in with and what they may do: USR02 is the logon record of each user, ' +
      'USR21 ties it to an address, UST04 and AGR_USERS record which roles somebody holds.',
    names: ['USR21', 'USRBF2', 'USREFUS', 'UST04', 'UST10C', 'UST12', 'AGR_USERS'],
    pattern: /^USR\d{2}$/,
  },
  {
    id: 'business-partner',
    concerns: ['personal-data'],
    title: 'Customer, supplier and business partner',
    sapKeeps:
      'Master data of the parties the business deals with. A business partner is not always a company: ' +
      'KNA1 and LFA1 name one whether it is an organisation or a person, KNVK holds the contact people of ' +
      'a customer, and BUT0BK the bank details attached to a partner.',
    names: [
      'KNA1', 'KNB1', 'KNVK', 'KNVP', 'KNVV',
      'LFA1', 'LFB1', 'LFM1',
      'BUT000', 'BUT020', 'BUT021', 'BUT100', 'BUT0BK',
    ],
  },
  {
    id: 'financial-document',
    concerns: ['tax-relevant', 'audit-relevant'],
    title: 'Accounting documents',
    sapKeeps:
      'The journal itself: BKPF and BSEG are the accounting document header and its line items, ACDOCA is ' +
      'the S/4HANA universal journal that replaced them, and BSET carries the tax lines belonging to a ' +
      'document.',
    names: [
      'BKPF', 'BSEG', 'BSET', 'ACDOCA', 'RFBLG',
      'FAGLFLEXA', 'FAGLFLEXT',
      'BSID', 'BSAD', 'BSIK', 'BSAK', 'BSIS', 'BSAS',
    ],
  },
  {
    id: 'billing-document',
    concerns: ['tax-relevant'],
    title: 'Invoices',
    sapKeeps:
      'The invoices themselves, with the tax they carry: VBRK and VBRP are billing documents sent out, ' +
      'RBKP and RSEG the supplier invoices received.',
    names: ['VBRK', 'VBRP', 'RBKP', 'RSEG'],
  },
  {
    id: 'tax-configuration',
    concerns: ['tax-relevant'],
    title: 'Tax configuration',
    sapKeeps:
      'Not documents but the rules they are posted under: which tax codes exist in a country, what rate ' +
      'each one stands for, and which account it posts to.',
    names: ['T007A', 'T007B', 'T007S', 'T007V', 'T030K', 'T059P'],
  },
  {
    id: 'change-log',
    concerns: ['audit-relevant', 'personal-data'],
    title: 'Change history',
    sapKeeps:
      'SAP’s own record of what changed: CDHDR and CDPOS hold which field of which business object was ' +
      'changed and when, DBTABLOG the same for table changes — each entry carrying the user name that ' +
      'made it.',
    names: ['CDHDR', 'CDPOS', 'DBTABLOG'],
  },
];

/* -------------------------------------------------------------------- input */

/** How the code touches a table, in the four states the engine distinguishes. */
export type TableTouch = 'read' | 'write' | 'read-write' | 'reference';

/**
 * How each touch is put into words on screen.
 *
 * A `reference` is a `TABLES:` statement or a `TYPE kna1` — the program depends
 * on the table's definition without reading a row (`table-dependencies.ts`,
 * R29). Printing "reads PA0002" for one of those would be a false sentence in a
 * panel whose entire point is not making false sentences, so the four are kept
 * apart all the way to the screen.
 */
export const TOUCH_LABEL: Record<TableTouch, string> = {
  read: 'reads',
  write: 'writes to',
  'read-write': 'reads and writes',
  reference: 'depends on the definition of',
};

export interface ExaminedTable {
  /** Upper case. */
  table: string;
  touch: TableTouch;
  /** Ascending, de-duplicated. Empty where the source did not record a line. */
  lines: number[];
}

/* ------------------------------------------------------------------ helpers */

function normaliseName(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase();
}

function touchOfAccess(access: string | null | undefined): TableTouch {
  switch ((access || '').trim().toLowerCase()) {
    case 'write':
      return 'write';
    case 'read/write':
    case 'read-write':
      return 'read-write';
    case 'reference':
      return 'reference';
    default:
      return 'read';
  }
}

/**
 * Two touches of the same table, merged into the one that says the most.
 *
 * A read and a write of KNA1 is a read/write; a reference beside either of them
 * disappears, because depending on a table's definition adds nothing once the
 * program is known to read its rows. Never the other way round: a merge must
 * not be able to downgrade a write it has already seen.
 */
function mergeTouch(a: TableTouch, b: TableTouch): TableTouch {
  if (a === b) return a;
  if (a === 'reference') return b;
  if (b === 'reference') return a;
  return 'read-write';
}

function collect(rows: readonly { table: string; touch: TableTouch; line?: number | null }[]): ExaminedTable[] {
  const byName = new Map<string, { touch: TableTouch; lines: Set<number> }>();
  for (const row of rows) {
    const table = normaliseName(row.table);
    if (!table) continue;
    const found = byName.get(table);
    const entry = found ?? { touch: row.touch, lines: new Set<number>() };
    if (found) entry.touch = mergeTouch(entry.touch, row.touch);
    if (typeof row.line === 'number' && Number.isFinite(row.line) && row.line > 0) {
      entry.lines.add(row.line);
    }
    byName.set(table, entry);
  }
  return [...byName]
    .map(([table, e]) => ({ table, touch: e.touch, lines: [...e.lines].sort((x, y) => x - y) }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/**
 * The tables out of a stored analysis (`Project.dataCoupling`) — the shape every
 * screen already has in hand, so no second pass over the source is needed to
 * ask this question.
 */
export function examinedTablesFromCoupling(
  entries: readonly DataCouplingEntry[] | null | undefined,
): ExaminedTable[] {
  const rows: { table: string; touch: TableTouch; line?: number | null }[] = [];
  for (const entry of entries ?? []) {
    const touch = touchOfAccess(entry?.accessType);
    const lines = entry?.lineNumbers?.length ? entry.lineNumbers : [null];
    for (const line of lines) rows.push({ table: entry?.tableName, touch, line });
  }
  return collect(rows);
}

/**
 * The same question asked of the engine's own reading
 * (`readTableDependencies`), for a caller that has the report in hand and no
 * stored analysis yet.
 */
export function examinedTablesFromDependencies(
  dependencies: readonly TableDependency[] | null | undefined,
): ExaminedTable[] {
  return collect(
    (dependencies ?? []).map((d) => ({
      table: d?.table,
      touch: d?.access === 'write' ? 'write' : d?.access === 'reference' ? 'reference' : 'read',
      line: d?.line,
    })),
  );
}

/* ------------------------------------------------------------------- output */

export interface ComplianceReviewHint {
  family: ComplianceFamilyId;
  title: string;
  concerns: ComplianceConcern[];
  /** What SAP keeps in tables of these names — see `TableFamily.sapKeeps`. */
  sapKeeps: string;
  /** The tables of this family the code touches, alphabetical. */
  tables: ExaminedTable[];
}

export interface ComplianceReviewReport {
  hints: ComplianceReviewHint[];
  /**
   * Tables whose name matched no family, alphabetical — every table of the
   * customer's own among them.
   *
   * Reported rather than dropped. A panel that lists two hints and stops has
   * told the reader that the other nineteen tables are fine, which is a claim
   * this module is in no position to make.
   */
  unrecognised: string[];
  /** How many distinct tables were looked at at all. */
  examined: number;
}

function matches(family: TableFamily, table: string): boolean {
  if (family.names?.includes(table)) return true;
  return family.pattern ? family.pattern.test(table) : false;
}

/**
 * The hints for one program's table list.
 *
 * Pure: same input, same output, no clock, no network, no model. The order is
 * the declaration order of `FAMILIES`, and within a family the tables are
 * alphabetical, so two runs of the same analysis are comparable line by line.
 */
export function complianceReviewHints(
  tables: readonly ExaminedTable[] | null | undefined,
): ComplianceReviewReport {
  const examined = tables ?? [];
  const hints: ComplianceReviewHint[] = [];
  const recognised = new Set<string>();

  for (const family of FAMILIES) {
    const hit = examined.filter((t) => matches(family, t.table));
    if (hit.length === 0) continue;
    for (const t of hit) recognised.add(t.table);
    hints.push({
      family: family.id,
      title: family.title,
      concerns: COMPLIANCE_CONCERNS.filter((c) => family.concerns.includes(c)),
      sapKeeps: family.sapKeeps,
      tables: [...hit].sort((a, b) => a.table.localeCompare(b.table)),
    });
  }

  return {
    hints,
    unrecognised: examined
      .map((t) => t.table)
      .filter((name) => !recognised.has(name))
      .sort((a, b) => a.localeCompare(b)),
    examined: examined.length,
  };
}

/**
 * Every concern raised by a report, in declaration order — what a summary line
 * counts, without a second pass over the families.
 */
export function concernsRaised(report: ComplianceReviewReport): ComplianceConcern[] {
  return COMPLIANCE_CONCERNS.filter((concern) =>
    report.hints.some((hint) => hint.concerns.includes(concern)),
  );
}
