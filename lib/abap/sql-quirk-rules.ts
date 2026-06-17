import type { SqlQuirkType } from './sql-model';

export const QUIRK_RULES: Record<SqlQuirkType, string> = {
  'implicit-client':
    'Keep the query client-aware (CDS views are client-dependent by default). Do not add a manual client filter on top.',
  'client-specified':
    'CLIENT SPECIFIED was used: replicate explicit/cross-client behaviour; do NOT silently apply the default client filter.',
  'for-all-entries':
    'Translate FOR ALL ENTRIES as a join/IN against the driver set, apply DISTINCT on the result. CRITICAL: if the driver set is EMPTY, return NO rows (NOT all rows). Flag the deviation from legacy "empty ⇒ all rows" for sign-off.',
  'into-corresponding':
    'Map fields by name; fields not present in the target stay at their type-initial value. Emit an explicit field map and flag any source field that has no target.',
  'outer-join-null':
    'For OUTER JOIN columns, convert DB NULL to the ABAP type-initial value (0 / "" / initial date) so result equivalence holds.',
  'buffering-bypass':
    'BYPASSING BUFFER affects read consistency, not the result set shape; no transformation change, note for the architect.',
  'aggregate-null':
    'Aggregates (SUM/MIN/MAX/AVG) over an empty set are NULL in SQL but initial in ABAP; coalesce to the type-initial value. COUNT returns 0.',
};

export function quirkRulesFor(types: SqlQuirkType[]): string {
  const uniq = Array.from(new Set(types));
  return uniq.map((t) => `- [${t}] ${QUIRK_RULES[t]}`).join('\n');
}
