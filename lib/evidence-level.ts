/**
 * How strongly a standard candidate is backed — E0 to E4, `DESIGN.md` §4.1
 * (roadmap 7.2 fills them with content).
 *
 * An evidence level is a *ripeness*, not a state, so every level is neutral: E4
 * is not green and E0 is not red. Green here would say "proven", and the only
 * thing that says proven is `lib/provenance.ts`.
 *
 * Its form is the identifier — a 4px rectangle with the code in monospace and
 * the word behind it — which is the form the clean-core level uses too
 * (`lib/clean-core-level.ts`) and nothing else does.
 */

export type EvidenceLevelValue = 'E0' | 'E1' | 'E2' | 'E3' | 'E4';

export interface EvidenceLevelEntry {
  value: EvidenceLevelValue;
  key: string;
  /** The word behind the code. */
  label: string;
  meaning: string;
}

const ENTRIES: EvidenceLevelEntry[] = [
  {
    value: 'E0',
    key: 'evidenceLevel.e0',
    label: 'none',
    meaning: 'No evidence for a standard candidate.',
  },
  {
    value: 'E1',
    key: 'evidenceLevel.e1',
    label: 'catalog reference',
    meaning: 'A catalogue names a successor or scope item.',
  },
  {
    value: 'E2',
    key: 'evidenceLevel.e2',
    label: 'documented',
    meaning: 'SAP documentation describes the capability.',
  },
  {
    value: 'E3',
    key: 'evidenceLevel.e3',
    label: 'demonstrated',
    meaning: 'Shown to work, against mocks or a sandbox.',
  },
  {
    value: 'E4',
    key: 'evidenceLevel.e4',
    label: 'accepted in the target system',
    meaning: 'Accepted in the target system by the account.',
  },
];

export const EVIDENCE_LEVEL: Readonly<Record<EvidenceLevelValue, EvidenceLevelEntry>> =
  Object.freeze(
    Object.fromEntries(ENTRIES.map((e) => [e.value, Object.freeze(e)])) as Record<
      EvidenceLevelValue,
      EvidenceLevelEntry
    >,
  );

export const EVIDENCE_LEVEL_VALUES: readonly EvidenceLevelValue[] = Object.freeze(
  ENTRIES.map((e) => e.value),
);

export function evidenceLevel(value: EvidenceLevelValue): EvidenceLevelEntry {
  const entry = EVIDENCE_LEVEL[value];
  if (!entry) throw new Error(`Unknown evidence level: ${String(value)}`);
  return entry;
}

export function isEvidenceLevelValue(value: unknown): value is EvidenceLevelValue {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EVIDENCE_LEVEL, value);
}
