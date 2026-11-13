/**
 * Changes waiting for the next version of the Terms of Service — not in force, not shown anywhere.
 *
 * A change to the Terms is a round under section 10 (notice six weeks ahead, acceptance), so a wording that needs no
 * change now but should be smoothed is collected here and taken into the next version that is made for another
 * reason. Each entry carries the wording to use, German (which governs for a German acceptance) and English, as the
 * legal review gave it. `tests/legal-names-wording.spec.ts` holds the entries, and that none of them is in the Terms
 * in force yet.
 */

export interface PendingTermsChange {
  /** The section it changes. */
  section: string;
  /** Why it waits, in one sentence. */
  reason: string;
  /** The new wording, as given — a half-sentence in place of the current one. */
  wording: { de: string; en: string };
  /** Where the wording comes from. */
  source: string;
}

export const PENDING_TERMS_CHANGES: readonly PendingTermsChange[] = [
  {
    section: '4.1 (b)',
    reason:
      'Section 4.1 (b) describes which results a model produces "where you use those functions"; section 5.4 is the more specific rule on which steps start without a click. They do not contradict each other, and no change is needed for 3.1.0; the next version should say both in one place.',
    wording: {
      de: '… soweit Sie diese Funktionen nutzen oder sie nach Ziffer 5.4 von selbst starten; …',
      en: '… where you use those functions or they start by themselves under section 5.4; …',
    },
    source: 'Legal review of document 19 (business names automatic again from 3.1.0), point B6, 13.11.2026',
  },
];
