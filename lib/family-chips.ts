/**
 * The tools' family speaks one provenance vocabulary of six chips (UX review 22.11.2026, L2, accepted by the owner;
 * the family mock-ups of 15.11.2026, `.pv`). Today's pages show more than twenty different provenance badges across
 * the seven tools; the family shows these six and no other.
 *
 * It is a reduction of `lib/provenance.ts`, not a second list: the nine values there stay the one source of what a
 * statement *is* (the guard against freely worded badges still holds), and `familyChipOf` says which of the six words
 * a value is shown as. A page that already holds a `ProvenanceValue` hands it over; a page that is rebuilt in the
 * family may name the kind directly. Neither can write a label: the words live here.
 *
 *   kind             word              form     from
 *   signed           Signed            filled   proven
 *   engine           From the engine   outline  reconstructed, imported (note "imported")
 *   yours            Yours             filled   confirmed
 *   ai               AI-generated      dashed   proposed
 *   simulation       Simulation        dashed   simulation, demonstrated-mock (note "mocks")
 *   not-determined   Not determined    outline  not-determined
 *
 * `stale` is not a chip in the family: out of date is said by the tool bar's mark and by a strip that names what to
 * recompute, never by a badge beside a figure that still reads as a value.
 *
 * Pure: no React.
 */
import type { ProvenanceForm, ProvenanceValue, SemanticState } from '@/lib/provenance';

export type FamilyChipKind = 'signed' | 'engine' | 'yours' | 'ai' | 'simulation' | 'not-determined';

export interface FamilyChipEntry {
  kind: FamilyChipKind;
  /** The word on the chip — the only place it is written. */
  label: string;
  /** The tooltip: what the chip asserts. */
  meaning: string;
  state: SemanticState;
  form: ProvenanceForm;
  /** A lucide icon name, drawn by `components/family/FamilyChip.tsx`. */
  icon: 'shield-check' | 'cog' | 'user' | 'pen-line' | 'calculator' | 'circle-help';
}

const ENTRIES: readonly FamilyChipEntry[] = [
  {
    kind: 'signed',
    label: 'Signed',
    meaning: 'Signed by the server, unchanged since: the analysis run or the audit pack.',
    state: 'success',
    form: 'filled',
    icon: 'shield-check',
  },
  {
    kind: 'engine',
    label: 'From the engine',
    meaning: 'Read from the code by the engine, the same on every run. Nobody has confirmed it.',
    state: 'information',
    form: 'outline',
    icon: 'cog',
  },
  {
    kind: 'yours',
    label: 'Yours',
    meaning: 'Stated or confirmed by the signed-in account. A self-declaration, not a mandate.',
    state: 'information',
    form: 'filled',
    icon: 'user',
  },
  {
    kind: 'ai',
    label: 'AI-generated',
    meaning: 'Written by a language model, unchecked.',
    state: 'warning',
    form: 'dashed',
    icon: 'pen-line',
  },
  {
    kind: 'simulation',
    label: 'Simulation',
    meaning: 'Computed on assumptions or run against mocks. Not a measurement of your system.',
    state: 'warning',
    form: 'dashed',
    icon: 'calculator',
  },
  {
    kind: 'not-determined',
    label: 'Not determined',
    meaning: 'Could not be determined. The reason is given beside it.',
    state: 'neutral',
    form: 'outline',
    icon: 'circle-help',
  },
];

/** The six chips, in the order a legend lists them. */
export const FAMILY_CHIPS: Readonly<Record<FamilyChipKind, FamilyChipEntry>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((e) => [e.kind, Object.freeze({ ...e })])) as Record<FamilyChipKind, FamilyChipEntry>,
);

export const FAMILY_CHIP_KINDS: readonly FamilyChipKind[] = Object.freeze(ENTRIES.map((e) => e.kind));

/** The most chips the family may show (L2). A spec holds the list to it. */
export const FAMILY_CHIP_MAX = 6;

export function familyChip(kind: FamilyChipKind): FamilyChipEntry {
  const entry = FAMILY_CHIPS[kind];
  if (!entry) throw new Error(`Unknown family chip: ${String(kind)}`);
  return entry;
}

export function isFamilyChipKind(value: unknown): value is FamilyChipKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FAMILY_CHIPS, value);
}

/**
 * Whether a chip is drawn on a tool (release 3.5.4, Q5): only where it departs from the normal case. On a tool the
 * engine is the normal case — the head says "From the engine" once for the page — so an engine chip in a block is
 * kept only when it departs: `imported` (from your system, not read from the code), or kept on purpose by its caller
 * (the head's own; a figure the engine proposes beside one the reader states). Every other chip is a departure.
 * The rule that leaves the rest undrawn is one line of `app/globals.css`, scoped to a page with a tool's frame.
 */
export function familyChipKept(chip: { kind: FamilyChipKind; value?: ProvenanceValue; keep?: boolean }): boolean {
  if (chip.kind !== 'engine') return true;
  return chip.value === 'imported' || chip.keep === true;
}

/** Notes the reduction adds where two values share one chip, so the difference is still said. */
const FROM_VALUE: Readonly<Record<ProvenanceValue, { kind: FamilyChipKind; note?: string } | null>> = Object.freeze({
  proven: { kind: 'signed' },
  confirmed: { kind: 'yours' },
  reconstructed: { kind: 'engine' },
  imported: { kind: 'engine', note: 'imported' },
  proposed: { kind: 'ai' },
  simulation: { kind: 'simulation' },
  'demonstrated-mock': { kind: 'simulation', note: 'mocks' },
  stale: null,
  'not-determined': { kind: 'not-determined' },
});

/**
 * The family chip a provenance value is shown as, with the note that keeps two merged values apart, or `null` for
 * `stale` (said by a strip and the tool bar's mark, never a chip).
 */
export function familyChipOf(value: ProvenanceValue): { kind: FamilyChipKind; note?: string } | null {
  return FROM_VALUE[value] ?? null;
}
