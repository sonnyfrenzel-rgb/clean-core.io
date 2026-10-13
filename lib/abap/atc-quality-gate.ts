/**
 * The quality gate over an imported ATC worklist (DSAG guideline review B10,
 * owner 13.10.2026).
 *
 * The rule, from the guideline's quality gates: findings that existed before a
 * quality process started may go into a baseline, so new findings stand out
 * from the legacy ones — but a security finding is never baselined. Each one
 * stays open until it is fixed or excluded as a false positive with a reason
 * (zero tolerance for security findings in customer code).
 * DSAG ABAP guideline: application-lifecycle-management/ensuring-quality.md § Quality Gates im Release-Prozess
 *
 * What this module does with an import, and what it does not:
 *   - Every finding of the import is legacy as far as this product can tell —
 *     an import is a snapshot, so all of it was there before. Each finding is
 *     put in exactly one of two groups: `baseline` (may be baselined) or
 *     `security` (never baselined).
 *   - Whether a finding is a security finding is OUR READING of ATC's check
 *     identifier, check title and message — ATC exports carry no "security"
 *     column. The reading is named as one wherever it is shown.
 *   - An exemption ATC records (`exempted`) is the customer's decision in ATC
 *     and is kept: an exempted security finding is not open, but it is not in
 *     the baseline either — it is listed apart, so the reader can check that a
 *     reason stands behind it.
 *   - Nothing here is a verdict on the code, and nothing is merged with the
 *     engine's findings (`atc-model.ts`, honesty rules 1–3). An import without
 *     security findings is not "secure": most exports carry only what failed a
 *     check, and only the checks that ran.
 *
 * Pure: no imports beyond the ATC types.
 */

import type { AtcFinding, AtcReport } from './atc-model';

/**
 * Words in a check id, check title or message that make a finding a security
 * finding in our reading: the security checks of SAP's Code Vulnerability
 * Analyzer and the usual names of the weaknesses it reports.
 */
const SECURITY_WORDS = new RegExp(
  [
    'secur', // security, Sicherheit is below
    'sicherheit',
    'vulnerab',
    'injection',
    'traversal',
    'cross[- ]?site',
    '\\bxss\\b',
    'authori[sz]ation check',
    'authority[- ]check',
    'berechtigung',
    'hard[- ]?coded (?:user|password|credential|sy-uname)',
    'backdoor',
    'code vulnerability analyzer',
    '\\bcva\\b',
    'slin_sec',
    'generic (?:table|module) (?:access|call)',
    'dynamic (?:open )?sql',
    'client[- ]specified',
    'cross[- ]client',
    'mandantenübergreifend',
    'os command',
    'kernel call',
  ].join('|'),
  'i',
);

/** Whether this finding reads as a security finding (our reading, see above). */
export function isSecurityFinding(f: Pick<AtcFinding, 'checkId' | 'checkTitle' | 'message'>): boolean {
  return SECURITY_WORDS.test([f.checkId ?? '', f.checkTitle ?? '', f.message].join('   '));
}

export interface AtcQualityGate {
  /** Not security findings: may be baselined as legacy, so new ones stand out. */
  baseline: AtcFinding[];
  /** Security findings without an ATC exemption: open, never baselined. */
  securityOpen: AtcFinding[];
  /** Security findings ATC records as exempted: not open, not baselined either — listed apart. */
  securityExempted: AtcFinding[];
  /**
   * `holds` while a security finding is open — the gate does not let the
   * release pass; `no-open-security` when the import names none. Never "passed":
   * the import says only what failed the checks that ran.
   */
  state: 'holds' | 'no-open-security';
}

export function atcQualityGate(atc: Pick<AtcReport, 'findings'>): AtcQualityGate {
  const baseline: AtcFinding[] = [];
  const securityOpen: AtcFinding[] = [];
  const securityExempted: AtcFinding[] = [];
  for (const f of atc.findings) {
    if (!isSecurityFinding(f)) baseline.push(f);
    else if (f.exempted === true) securityExempted.push(f);
    else securityOpen.push(f);
  }
  return {
    baseline,
    securityOpen,
    securityExempted,
    state: securityOpen.length > 0 ? 'holds' : 'no-open-security',
  };
}
