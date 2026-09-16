/**
 * Where a statement comes from — the one list, and the only one.
 *
 * `DESIGN.md` §4: a provenance badge can say exactly nine things. Before this
 * file the product wrote them freehand — "AI Generated", "Signed off",
 * "Simulated", "Catalog Match", "Stale-Notice", "not computed" — nine concepts
 * spread over about twenty spellings, each with its own colour decision. The
 * reader had to learn that "Simulated" and "Model estimate" were the same claim
 * and that "Signed off" was a person's word rather than a proof.
 *
 * So: one list, one label per value, and a guard (`tests/cc-provenance-guard.spec.ts`)
 * that fails when a badge carries text this file does not know.
 *
 * Two things travel with every value and neither is decoration:
 *
 *   - the **state** maps the value onto the five Fiori categories of §1.1, and
 *     green is reserved: only `proven` is `success`. *Confirmed* is a
 *     self-declaration by the signed-in account, so it is `information` — a
 *     claim is not a proof. *Stale* is `warning`, never `error`: out of date
 *     means recompute, not wrong.
 *   - the **form** is the second cue (ADR-017). Blue carries three values and
 *     yellow four, so colour alone cannot separate "derived" from "assumed".
 *     Filled = settled, outline = derived or imported, dashed = provisional.
 *     It survives print and `forced-colors`, where the fill is gone.
 *
 * This module is pure data: no React, no imports. Server routes, exports, mails
 * and client components all read the same nine rows, and the icon travels as a
 * name that `components/cc/ProvenanceChip.tsx` maps to a lucide component.
 */

/** The five semantic states of `DESIGN.md` §1.1. */
export type SemanticState = 'success' | 'warning' | 'error' | 'information' | 'neutral';

/** The second cue of `DESIGN.md` §4 — how settled a statement is. */
export type ProvenanceForm = 'filled' | 'outline' | 'dashed';

/** The nine values. Nothing else is provenance. */
export type ProvenanceValue =
  | 'proven'
  | 'confirmed'
  | 'reconstructed'
  | 'imported'
  | 'proposed'
  | 'simulation'
  | 'demonstrated-mock'
  | 'stale'
  | 'not-determined';

export interface ProvenanceEntry {
  /** The machine value. Stored, filtered and tested on this, never on the label. */
  value: ProvenanceValue;
  /**
   * Message key (`DESIGN.md` §3). The German interface after 3.0 translates the
   * key, not the English label, so a label change is not a data migration.
   */
  key: string;
  /** What the chip reads, in English (ADR-009). */
  label: string;
  state: SemanticState;
  form: ProvenanceForm;
  /** lucide-react icon, by name. Word *and* icon — §4 — so the chip reads without colour. */
  icon: string;
  /** What the value asserts. Shown in the "Why?" popover, §2.10. */
  meaning: string;
}

const ENTRIES: ProvenanceEntry[] = [
  {
    value: 'proven',
    key: 'provenance.proven',
    label: 'Proven',
    state: 'success',
    form: 'filled',
    icon: 'shield-check',
    meaning: 'Backed by the engine, a signature or a real run.',
  },
  {
    value: 'confirmed',
    key: 'provenance.confirmed',
    label: 'Confirmed',
    state: 'information',
    form: 'filled',
    icon: 'user',
    meaning: 'Confirmed by the signed-in account — a self-declaration, not a mandate.',
  },
  {
    value: 'reconstructed',
    key: 'provenance.reconstructed',
    label: 'Reconstructed',
    state: 'information',
    form: 'outline',
    icon: 'cog',
    meaning: 'Derived from the code, not confirmed by anyone.',
  },
  {
    value: 'imported',
    key: 'provenance.imported',
    label: 'Imported',
    state: 'information',
    form: 'outline',
    icon: 'file-down',
    meaning: 'Taken from a file — ATC, BPMN, usage, an SAP catalogue.',
  },
  {
    value: 'proposed',
    key: 'provenance.proposed',
    label: 'Model proposal',
    state: 'warning',
    form: 'dashed',
    icon: 'pen-line',
    meaning: 'Proposed by the language model, unchecked.',
  },
  {
    value: 'simulation',
    key: 'provenance.simulation',
    label: 'Simulation',
    state: 'warning',
    form: 'dashed',
    icon: 'calculator',
    meaning: 'Computed on assumptions you entered.',
  },
  {
    value: 'demonstrated-mock',
    key: 'provenance.demonstratedMock',
    label: 'Demonstrated · mock',
    state: 'warning',
    form: 'dashed',
    icon: 'test-tube',
    meaning: 'Shown against mocks, not against a real system.',
  },
  {
    value: 'stale',
    key: 'provenance.stale',
    label: 'Stale',
    state: 'warning',
    form: 'filled',
    icon: 'clock',
    meaning: 'No longer current — recompute.',
  },
  {
    value: 'not-determined',
    key: 'provenance.notDetermined',
    label: 'Not determined',
    state: 'neutral',
    form: 'outline',
    icon: 'circle-help',
    meaning: 'Could not be determined — the reason is given.',
  },
];

/** The nine rows, keyed by value. */
export const PROVENANCE: Readonly<Record<ProvenanceValue, ProvenanceEntry>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((e) => [e.value, Object.freeze(e)])) as Record<
    ProvenanceValue,
    ProvenanceEntry
  >,
);

/** In the order of `DESIGN.md` §4 — settled first, provisional last. */
export const PROVENANCE_VALUES: readonly ProvenanceValue[] = Object.freeze(
  ENTRIES.map((e) => e.value),
);

/** Every label a provenance badge may carry. The guard compares against this. */
export const PROVENANCE_LABELS: readonly string[] = Object.freeze(ENTRIES.map((e) => e.label));

/** Every message key. */
export const PROVENANCE_KEYS: readonly string[] = Object.freeze(ENTRIES.map((e) => e.key));

export function provenance(value: ProvenanceValue): ProvenanceEntry {
  const entry = PROVENANCE[value];
  if (!entry) throw new Error(`Unknown provenance value: ${String(value)}`);
  return entry;
}

export function isProvenanceValue(value: unknown): value is ProvenanceValue {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVENANCE, value);
}

/**
 * Is this exactly one of the nine labels?
 *
 * Trimmed and case-folded, because "Model Proposal" is the same mistake as
 * "model proposal" — a second spelling of a fixed value. Everything else,
 * including near misses like "AI Generated" or "Signed off", is false.
 */
export function isProvenanceLabel(text: string): boolean {
  const needle = text.trim().toLowerCase();
  return PROVENANCE_LABELS.some((label) => label.toLowerCase() === needle);
}

/**
 * The wordings this list replaced, and what each of them is now.
 *
 * Kept in the code rather than in a commit message: a guard that says "this
 * badge is not allowed" is only half an answer, and the other half is which of
 * the nine values the author meant. `DESIGN.md` §4 column "Heute zum Beispiel".
 */
export const RETIRED_PROVENANCE_WORDINGS: Readonly<Record<string, ProvenanceValue>> = Object.freeze({
  'signed run': 'proven',
  passed: 'proven',
  'signed off': 'confirmed',
  'ai generated': 'proposed',
  'model estimate': 'simulation',
  simulated: 'demonstrated-mock',
  'catalog match': 'imported',
  'usage import': 'imported',
  'not computed': 'not-determined',
  'no verdict': 'not-determined',
});
