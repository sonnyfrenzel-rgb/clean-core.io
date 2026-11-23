/**
 * Knowledge: SAP type groups whose types are named `<group>_<name>` (`slis_fieldcat_alv` is a type of SLIS, not a
 * dictionary structure). Hand-curated; the same sixteen names `lib/abap/table-dependencies.ts` keeps as
 * `KNOWN_TYPE_GROUPS` (a spec holds the two equal until the shipping list moves here, ADR-133 (2)).
 */
export const SAP_TYPE_GROUPS: readonly string[] = Object.freeze([
  'ABAP', 'CNTL', 'CXTAB', 'ICON', 'KKBLO', 'OLE2', 'RSDS', 'SDYDO', 'SLIS', 'SSCR',
  'STREE', 'SWFCO', 'SYDES', 'SZADR', 'TRWBO', 'VRM',
]);

const GROUPS = new Set(SAP_TYPE_GROUPS);

/** Is `name` an SAP type group (`TYPE-POOLS slis`)? */
export function isSapTypeGroup(name: string): boolean {
  return GROUPS.has((name || '').toUpperCase().trim());
}

/** The type group a type name belongs to (`SLIS_FIELDCAT_ALV` → `SLIS`), or null. */
export function typeGroupOf(typeName: string): string | null {
  const n = (typeName || '').toUpperCase().trim();
  for (const g of SAP_TYPE_GROUPS) if (n.startsWith(`${g}_`)) return g;
  return null;
}
