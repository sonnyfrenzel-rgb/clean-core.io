/**
 * ATC Import Privacy Layer (roadmap 7.1)
 *
 * ATC worklist exports carry columns SAP names after a person by construction
 * — author, reviewer, last changed by, exemption approver. None of those
 * identify anything a risk comparison needs: the join in `atc-join.ts` works
 * from the object name and the check result alone. This module strips
 * anything else BEFORE persistence, the same discipline
 * `lib/abap/usage-privacy.ts` set for usage exports (v1.22) — and reuses its
 * `isPiiColumn` rather than keeping a second, driftable list of the same
 * patterns.
 */

import type { AtcFinding } from './atc-model';

export { isPiiColumn } from './usage-privacy';

/**
 * Sanitize ATC findings by keeping only the fields a check result needs.
 *
 * A whitelist, like `sanitizeUsageRecords`: naming what is kept is safer than
 * naming what to drop, because a column the parser did not anticipate is then
 * dropped by default rather than passed through by default.
 */
export function sanitizeAtcFindings(findings: AtcFinding[]): AtcFinding[] {
  return findings.map((f) => ({
    objectName: f.objectName,
    objectType: f.objectType,
    checkId: f.checkId,
    checkTitle: f.checkTitle,
    message: f.message,
    priority: f.priority,
    line: f.line,
    exempted: f.exempted,
  }));
}

/** Privacy notice text shown to the user during upload. */
export const ATC_PRIVACY_NOTICE =
  'Author, reviewer, approver and last-changed-by fields are stripped on import; only the check finding ' +
  'itself — object, check and message — is stored. No user names are persisted.';
