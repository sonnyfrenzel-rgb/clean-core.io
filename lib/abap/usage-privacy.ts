/**
 * Usage Privacy Layer (v1.22, §6)
 *
 * Usage exports (SCMON/UPL/ST03N) may contain personally identifiable
 * information (usernames, terminals). This module strips/pseudonymizes
 * PII BEFORE any persistence — only object × frequency is stored.
 *
 * For the risk matrix, user identity is never needed.
 */

import type { UsageRecord } from './usage-model';

// Fields that may contain PII in SAP usage exports. Also the canonical list
// `atc-privacy.ts` reuses for ATC worklist exports (roadmap 7.1) rather than
// keeping a second copy — see the comment on `isPiiColumn` below and the one
// in `lib/personal-data-hints.ts` that reuses it for the same reason.
const PII_FIELD_PATTERNS = [
  /^user/i, /^bname/i, /^terminal/i, /^client_host/i,
  /^hostname/i, /^ip_addr/i, /^logon/i, /^account/i,
  /^benutzer/i, /^endgerät/i,
  // ATC worklist exports name the person who wrote or last touched a check
  // result rather than the person who ran it — "Autor, Prüfer, letzter
  // Änderer" (roadmap 7.1) — which is a different shape of column than any
  // usage export carries and was not covered above.
  /^author/i, /^responsible/i, /^reviewer/i, /^approver/i,
  /^created_?by/i, /^changed_?by/i, /^last_?changed_?by/i, /^modified_?by/i,
  /^ersteller/i, /^verantwortlich/i, /^pr(ü|ue)fer/i, /^ge(ä|ae)ndert_?von/i,
];

/**
 * Sanitize usage records by stripping any PII fields.
 * Only objectName, objectType, callCount, lastUsed, source, and observedSpanDays
 * are retained — everything else is dropped.
 *
 * This is a whitelist approach: we explicitly pick only the fields we need,
 * rather than trying to blacklist PII fields we might miss.
 */
export function sanitizeUsageRecords(records: UsageRecord[]): UsageRecord[] {
  return records.map(r => ({
    objectName: r.objectName,
    objectType: r.objectType,
    callCount: r.callCount,
    lastUsed: r.lastUsed,
    source: r.source,
    observedSpanDays: r.observedSpanDays,
  }));
}

/**
 * Check if a column header likely contains PII.
 * Used by the parser to warn about PII columns in the source data.
 */
export function isPiiColumn(header: string): boolean {
  return PII_FIELD_PATTERNS.some(pattern => pattern.test(header.trim()));
}

/**
 * Privacy notice text shown to the user during upload.
 */
export const PRIVACY_NOTICE =
  'User-identifiable fields are stripped on import; only object-level frequency data is stored. ' +
  'No usernames, terminals, or IP addresses are persisted.';
