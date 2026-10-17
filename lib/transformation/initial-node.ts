/**
 * ABAP's IS INITIAL in the Node package (roadmap 3.0.17 criterion 3): the helper the engine writes into
 * srv/lib/guards.ts, and the assumption an IS INITIAL on a type the engine has not read makes — named in the
 * predicate, its JSDoc and TRACE.md. The model wrote `values.lvProfl !== ''` for `TYPE mara-profl`; an empty
 * CDS String arrives as null, and a material with no profile came out dangerous goods.
 *
 * Pure. No network, no model.
 */

/** What an IS INITIAL on a type the engine has not read assumes — in the predicate, its JSDoc and TRACE.md. */
export const INITIAL_ASSUMPTION = 'IS INITIAL on an unread dictionary type — initial taken as null, blank, 0, false, 00000000, 000000';
/** The JSDoc tag of a predicate that makes that assumption, read back by the trace (`initialAssumptionsIn`). */
export const INITIAL_ASSUMED_TAG = 'Assumed by the engine:';

/** The guards that assume an unread type's initial value (`G-0199 (L196, lv_profl)`), from srv/lib/guards.ts. */
export function initialAssumptionsIn(content: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`^ \\* ${INITIAL_ASSUMED_TAG} (G-\\d+ \\(L\\d+, [^)]*\\)):`, 'gm');
  for (let m = re.exec(content); m !== null; m = re.exec(content)) out.push(m[1]);
  return out;
}

/**
 * `isInitial` of srv/lib/guards.ts: ABAP's IS INITIAL on a value as the port holds it (3.0.17 criterion 3). A value
 * that arrives as null or undefined is initial on every kind — an empty CDS String reaches the service as null.
 */
export const INITIAL_HELPER: readonly string[] = [
  '',
  "/** The ABAP type behind a value IS INITIAL tests; 'unknown' where the engine has not read it. */",
  "export type InitialKind = 'text' | 'string' | 'numc' | 'number' | 'date' | 'time' | 'bool' | 'table' | 'unknown';",
  '',
  '/**',
  " * ABAP's IS INITIAL on a value as the port holds it. Written by Clean-Core.io (engine), not a model.",
  ' * null or undefined is initial on every kind (an empty CDS String arrives as null), and so is false: a flag the',
  ' * port holds as a boolean (a CDS Boolean) is abap_false. text and bool: blanks only;',
  " * string: empty; numc: zeros or blanks; number: 0, also as decimal text ('0.00'); date: '00000000' (or",
  " * '0000-00-00'); time: '000000'; table: no rows. unknown — a dictionary type whose domain the engine has not",
  " * read: blanks, the number 0, false, exactly '00000000' and exactly '000000' (the initial value of an unread date or",
  " * time), never a character such as '0' or '0000', which is a filled text field.",
  ' */',
  'export function isInitial(v: unknown, kind: InitialKind): boolean {',
  '  if (v === null || v === undefined) return true;',
  "  if (kind === 'table' || Array.isArray(v)) return Array.isArray(v) && v.length === 0;",
  "  if (typeof v === 'number') return v === 0;",
  "  if (typeof v === 'boolean') return !v;",
  "  if (typeof v !== 'string') return false;",
  '  const blank = /^ *$/.test(v);',
  '  switch (kind) {',
  "    case 'string':",
  "      return v === '';",
  "    case 'numc':",
  '      return /^[0 ]*$/.test(v);',
  "    case 'number': {",
  '      const p = dec.parse(v);',
  '      return blank || (p !== null && dec.isZero(p));',
  '    }',
  "    case 'date':",
  "      return blank || v === '00000000' || v === '0000-00-00';",
  "    case 'time':",
  "      return blank || v === '000000' || v === '00:00:00';",
  "    case 'unknown':",
  "      return blank || v === '00000000' || v === '000000';",
  '    default:',
  '      return blank;',
  '  }',
  '}',
];
