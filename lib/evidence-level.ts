/**
 * How strongly a standard candidate is backed — E0 to E4, `DESIGN.md` §4.1.
 * Roadmap 7.2 fills them with content, and this is that content.
 *
 * An evidence level is a *ripeness*, not a state, so every level is neutral: E4
 * is not green and E0 is not red. Green here would say "proven", and the only
 * thing that says proven is `lib/provenance.ts`.
 *
 * Its form is the identifier — a 4px rectangle with the code in monospace and
 * the word behind it — which is the form the clean-core level uses too
 * (`lib/clean-core-level.ts`) and nothing else does.
 *
 * ## The ladder, and the three sentences it exists to keep
 *
 * Roadmap 7.2, verbatim: *ein Kataloglink ergibt höchstens E1, ein Scope Item
 * ist eine zu prüfende ID, ein fehlender Katalogtreffer beweist nichts.* Those
 * are not remarks about wording; they are the arithmetic below.
 *
 *   1. **A catalogue link is worth at most E1.** That an object stands in SAP's
 *      cloudification catalogue with a successor named beside it says a
 *      successor exists for *the object*. It says nothing about whether the
 *      successor covers the rule the custom code implements. `EVIDENCE_CEILING`
 *      therefore caps `catalog-successor` at E1, and `levelFromEvidence` takes a
 *      maximum over ceilings rather than counting: forty catalogue hits are
 *      forty pointers, and forty pointers are still E1.
 *   2. **A scope item is an ID to check.** It arrives with `SCOPE_ITEM_NOTE`
 *      attached wherever it is written, and it carries the same E1 ceiling. A
 *      scope item is where to look, never what was found.
 *   3. **A missing catalogue hit proves nothing.** E0 is the *absence of
 *      evidence*, so it maps to no object status at all — `fitOfLevel` returns
 *      `status: null` with the `not-determined` provenance and a reason. There
 *      is deliberately no level, no status and no wording in this file for "not
 *      supported": the catalogue is a list of what SAP has published, not a list
 *      of what exists, and reading a gap in it as a verdict is the defect
 *      `tests/unearned-verdicts-guard.spec.ts` was written about.
 *
 * E1 and E0 both come out as *Not determined* with different reasons, which is
 * the honest shape: a pointer that nobody followed and no pointer at all are
 * both "we do not know yet", and they are not the same "do not know".
 *
 * **Nothing here reaches green.** `fitOfLevel` never returns `done` — the one
 * object status in the `success` state — not even at E4. E4 is *accepted in the
 * target system by the account*, which is a self-declaration, so it wears
 * `confirmed` (information), the same rule `lib/workspace-model.ts` keeps for
 * the architecture sign-off.
 *
 * **Pure, and it stays that way.** `components/cc/Identifier.tsx` is a client
 * component and imports this file, so nothing here may pull in a catalogue, the
 * ABAP engine or Firestore. The types below are imported for their shape only.
 */

import type { ObjectStatusValue } from './object-status';
import type { ProvenanceValue } from './provenance';

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

/* ------------------------------------------------------- the ladder, 7.2 */

/**
 * The kinds of evidence a standard candidate can rest on.
 *
 * Five, because each one is a different question answered by a different party:
 * the catalogue, SAP's process content, SAP's documentation, a counter-check run
 * (roadmap 7.3) and the target system. The list is closed, like the nine
 * provenance values and the ten object statuses, for the same reason: an open
 * list is a place to add "looks right to me" later.
 */
export type StandardEvidenceKind =
  /** SAP's catalogue names a released successor for an object the capability's code touches. */
  | 'catalog-successor'
  /** An SAP Best Practices scope item ID. An address to check, never a confirmation. */
  | 'scope-item'
  /** SAP documentation that describes the capability, named by the account. */
  | 'documentation'
  /** A counter-check scenario that ran — against mocks or a sandbox (roadmap 7.3). */
  | 'demonstration'
  /** Accepted in the target system by the signed-in account. */
  | 'target-acceptance';

export const STANDARD_EVIDENCE_KINDS: readonly StandardEvidenceKind[] = Object.freeze([
  'catalog-successor',
  'scope-item',
  'documentation',
  'demonstration',
  'target-acceptance',
]);

/**
 * The highest level each kind of evidence can reach **on its own and together
 * with any number of its own kind**.
 *
 * This is the whole of sentence 1 and sentence 2 of roadmap 7.2, written as
 * data. A catalogue hit and a scope item stop at E1; nothing about how many of
 * them there are changes that.
 */
export const EVIDENCE_CEILING: Readonly<Record<StandardEvidenceKind, EvidenceLevelValue>> =
  Object.freeze({
    'catalog-successor': 'E1',
    'scope-item': 'E1',
    documentation: 'E2',
    demonstration: 'E3',
    'target-acceptance': 'E4',
  });

export function evidenceCeiling(kind: StandardEvidenceKind): EvidenceLevelValue {
  const ceiling = EVIDENCE_CEILING[kind];
  if (!ceiling) throw new Error(`Unknown standard evidence kind: ${String(kind)}`);
  return ceiling;
}

/** One piece of evidence. Never a sentence on its own — always what, from where. */
export interface StandardEvidence {
  kind: StandardEvidenceKind;
  /** What the evidence names: an object, a scope item ID, a document, a receipt. */
  reference: string;
  /** Where it came from, in the reader's words. Never empty. */
  source: string;
  /** The line it stands on, `L61`, when the evidence is read out of the source. */
  anchor?: string;
}

/** E0 … E4 as 0 … 4, so two levels can be compared without parsing the string. */
export function evidenceLevelRank(value: EvidenceLevelValue): number {
  return EVIDENCE_LEVEL_VALUES.indexOf(evidenceLevel(value).value);
}

/** True when `value` is no higher than `ceiling` — the shape 7.2's rules are stated in. */
export function isEvidenceLevelAtMost(
  value: EvidenceLevelValue,
  ceiling: EvidenceLevelValue,
): boolean {
  return evidenceLevelRank(value) <= evidenceLevelRank(ceiling);
}

/**
 * The level a set of evidence reaches: the **highest ceiling among its kinds**,
 * and E0 for no evidence at all.
 *
 * A maximum, not a sum. Counting would let a screen full of catalogue pointers
 * add up to something that reads as a proof, which is the arithmetic
 * `tests/no-fabricated-figures.spec.ts` exists to prevent one step further
 * downstream. It is also not a minimum: documentation does not get weaker
 * because the catalogue happens to be silent (sentence 3).
 */
export function levelFromEvidence(items: readonly StandardEvidence[]): EvidenceLevelValue {
  let level: EvidenceLevelValue = 'E0';
  for (const item of items) {
    const ceiling = evidenceCeiling(item.kind);
    if (evidenceLevelRank(ceiling) > evidenceLevelRank(level)) level = ceiling;
  }
  return level;
}

/**
 * What every scope item is written with, everywhere, without exception.
 *
 * Sentence 2 of 7.2 is a rendering rule as much as a ceiling: an ID on its own
 * reads as an answer. `18J — to verify` reads as an address.
 */
export const SCOPE_ITEM_NOTE = 'to verify';

/** `18J — to verify`. The only spelling a scope item is written in. */
export function scopeItemLabel(id: string): string {
  return `${id.trim()} — ${SCOPE_ITEM_NOTE}`;
}

/**
 * Why a level is as high as it is — the sentence beside the identifier.
 *
 * E0 and E1 are the two that matter, and both of them say what the reader must
 * *not* conclude. The other three say what was done and, just as plainly, what
 * was not.
 */
export const LEVEL_REASON: Readonly<Record<EvidenceLevelValue, string>> = Object.freeze({
  E0: 'Nothing names a standard candidate for this capability. A missing catalogue hit proves nothing either way — the catalogue lists what SAP has published, not what exists.',
  E1: 'A catalogue entry or a scope item points somewhere. A pointer is where to look, not what was found.',
  E2: 'SAP documentation describes the capability. Nothing has been run against it.',
  E3: 'A counter-check scenario ran against mocks or a sandbox, never against the target system.',
  E4: 'Accepted in the target system by the signed-in account — a self-declaration, not a proof.',
});

/**
 * How far the fit is established, read off the level — and the one bridge from
 * the evidence ladder to the object statuses of `DESIGN.md` §4.1.
 *
 * The same shape `statusOfPhase` has in `lib/workspace-model.ts`, and for the
 * same reason: one bridge, so there is no second ladder to drift from this one.
 *
 * Two properties this function is here to keep:
 *
 *   - **E0 and E1 have no object status.** `status` is `null` and the
 *     `not-determined` provenance stands in its place, with `reason` saying
 *     which of the two "do not know"s it is. A pointer nobody followed is not
 *     `partial`: partial means some of it is established, and none of it is.
 *   - **No level is ever green.** `done` is the only object status in the
 *     `success` state and it is not reachable from here, at any level.
 */
export function fitOfLevel(level: EvidenceLevelValue): {
  status: ObjectStatusValue | null;
  provenance: ProvenanceValue;
  reason: string;
} {
  switch (evidenceLevel(level).value) {
    case 'E0':
      return { status: null, provenance: 'not-determined', reason: LEVEL_REASON.E0 };
    case 'E1':
      return { status: null, provenance: 'not-determined', reason: LEVEL_REASON.E1 };
    case 'E2':
      return { status: 'partial', provenance: 'imported', reason: LEVEL_REASON.E2 };
    case 'E3':
      return { status: 'mock-only', provenance: 'demonstrated-mock', reason: LEVEL_REASON.E3 };
    case 'E4':
      return { status: 'confirmed', provenance: 'confirmed', reason: LEVEL_REASON.E4 };
  }
}
