import { ABCD_META } from './abap/abcd-classification';
import { GLOSSARY_ITEMS } from './glossary';
import type { CleanCoreLevelValue } from './clean-core-level';

/**
 * What a clean core level *means*, in the words the product already uses —
 * for the explanation behind a level chip (`components/cc/LevelExplained.tsx`,
 * owner 06.10.2026: "explain the level in the IT view, on hover and on a tap").
 *
 * Nothing is written here. The name and the meaning are `ABCD_META` in
 * `lib/abap/abcd-classification.ts` (aligned to SAP's clean core level concept,
 * ABAP extensibility guide), the ATC severity is that file's `atcReading` —
 * our reading, said as such — and the caveat is the glossary's own sentence
 * on "Clean core levels". A second definition would drift from the first the
 * day one of them is edited; `tests/level-explained.spec.ts` holds the three
 * together.
 */
export interface CleanCoreLevelExplanation {
  /** "Level C: Internal SAP APIs — conditional", or "Level not determined: Insufficient evidence". */
  title: string;
  /** ABCD_META's description of the level. */
  meaning: string;
  /** "ATC (our reading): Priority 2 · warning" — absent for a level that was not determined. */
  atc: string | null;
  /** The glossary's caveat: a reading of SAP's published data, never part of a signed audit pack. */
  caveat: string;
  /** Whose scheme the letter belongs to — the reference `ABCD_META` is aligned to. */
  source: string;
}

/** The reference named beside `ABCD_META` ("aligned to SAP's official clean core level concept"). */
export const CLEAN_CORE_LEVEL_SOURCE = 'Scheme: SAP’s clean core level concept (ABAP extensibility guide)';

const GLOSSARY_ENTRY = GLOSSARY_ITEMS['Clean core levels'];

export function cleanCoreLevelExplanation(value: CleanCoreLevelValue): CleanCoreLevelExplanation {
  const meta = ABCD_META[value] ?? ABCD_META.Unknown;
  const known = meta.grade !== 'Unknown';
  return {
    title: known ? `Level ${meta.grade}: ${meta.label}` : `Level not determined: ${meta.label}`,
    meaning: meta.description,
    atc: known ? `ATC (our reading): ${meta.atcReading}` : null,
    caveat: GLOSSARY_ENTRY?.cleanCoreImplication ?? '',
    source: CLEAN_CORE_LEVEL_SOURCE,
  };
}
