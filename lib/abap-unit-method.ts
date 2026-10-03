/**
 * Which ABAP Unit test method belongs to which test scenario — the one rule.
 *
 * The Testing stage finds a scenario's method in the generated test class with
 * it (`components/testing/scenario-detail.ts`), and the import of an ABAP Unit
 * result file from the reader's own SAP system (`lib/test-result-import.ts`)
 * gives a scenario its result with it, so the two cannot disagree about which
 * method is whose. Moved here from the component module on 03.10.2026 so that a
 * server route can read it; the component re-exports it.
 *
 * Pure, no imports.
 */

/** "TC_01" and "tc-01" compare equal; "tc_1" is not a prefix of "tc_10". */
function normalisedId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Does an ABAP method name refer to this scenario id? Exactly, or as a prefix followed by `_`. */
export function abapMethodMatches(methodName: string, id: string): boolean {
  const name = normalisedId(methodName);
  const key = normalisedId(id);
  if (!key) return false;
  if (name === key || name.startsWith(`${key}_`)) return true;
  // `tc01_create` for the id `TC_01`: the same characters without separators,
  // as long as the id is not the start of a longer number (`tc010`).
  const compactName = name.replace(/_/g, '');
  const compactKey = key.replace(/_/g, '');
  if (!compactName.startsWith(compactKey)) return false;
  const next = compactName.charAt(compactKey.length);
  return next === '' || (/[a-z]/.test(next) && /\d$/.test(compactKey));
}

/** The length of an id as the rule compares it — the longer of two matching ids is the more specific one. */
export function abapIdWeight(id: string): number {
  return normalisedId(id).length;
}
