/**
 * "Use typical assumptions" (3.5.1, ADR-144) — one click that fills every figure Economics still misses with a
 * typical value, so a reader without figures at hand sees the four options priced at once (owner, 24.11.2026: "einen
 * Button, dass man das mit einem Klick mit sinnvollen Annahmen ausfüllen und skippen kann, sonst wird das zu
 * komplex").
 *
 * The rules, each of them pinned by `tests/economics-typical.spec.ts`:
 *
 *   1. **Only what is missing.** A figure the reader stated, or a proposal they already took over, is never
 *      overwritten; a half-entered effort is left as it is.
 *   2. **Marked, and marked until changed.** Every figure filled here is named in `CostAssumptions.typical` or
 *      `CostOption.typical`; the page, the print, the exports and the views that read the stored record say
 *      "typical assumption", never "your figure". Changing a figure in place drops its mark (`dropTypical`).
 *   3. **Round, and sourced.** Each shared value below says where it comes from. They are round on purpose: a typical
 *      value is an order of magnitude to start from, not a market figure, and printing 937 would claim a precision
 *      nobody measured. The effort per option is the existing size proposal (`proposeEffort`,
 *      `proposeMaintenanceBaseline`), its factors unchanged.
 *   4. **No model.** Deterministic, no call to any language model; ADR-128 (7)'s AI proposals stay a separate step.
 *
 * Key-user extensibility gets no typical days: Clean-Core.io proposes none for it (roadmap 3.0.19, owner decision
 * 19.10.2026), so that option stays the reader's to fill.
 *
 * Pure: no React, no Firestore.
 */
import {
  BASELINE_KINDS,
  COMPARISON_KIND,
  SHARED_FIGURES,
  effortProposalFor,
  type BaselineProposal,
  type CostAssumptions,
  type CostOption,
  type EffortProposal,
  type SharedFigure,
  type TypicalPart,
} from './cost-assumptions';
import { formatMoney, formatNumber } from './format';

/** One typical value and why it is typical. */
export interface TypicalValue<T> {
  value: T;
  /** One sentence a reader can check: where the value comes from. */
  why: string;
}

/**
 * The typical shared figures. Every value is taken from a place the product already states, never invented here:
 *
 *   - **EUR** — the currency of the accepted Economics mock-up (`docs/roadmap/economics-next-mockup.html`, ADR-128)
 *     and of the community the tool was built with (DSAG, German-speaking SAP customers).
 *   - **1,000 a day, developer** — the developer day rate of the mock-up's priced state, inside the 750–1,200 band
 *     the mock-up gives for an external ABAP developer in Germany. Round on purpose.
 *   - **700 a day, key user** — the key-user day rate of the same priced state, inside the mock-up's 450–800 band for
 *     a business key user at a full internal cost rate.
 *   - **5 years** — the period of the mock-up, a usual planning period for an S/4HANA programme, and the horizon of
 *     the five-year forecast Economics showed before ADR-128 (2).
 *   - **1 release a year** — classic custom ABAP runs on premise or in SAP Cloud ERP Private, whose release upgrades
 *     come less often than the Public Edition's two a year (`RATES_HELP.cadence`); one upgrade a year is the start
 *     value the former forecast assumed (`ECONOMICS_START_INPUTS.upgradesPerYear`). The per-release effort factors
 *     are per upgrade (`PROPOSED_DAYS_PER_1000_LINES`), so counting every feature pack as a release would overstate.
 */
export const TYPICAL_SHARED: Readonly<{
  currency: TypicalValue<string>;
  devDayRate: TypicalValue<number>;
  testDayRate: TypicalValue<number>;
  horizonYears: TypicalValue<number>;
  releasesPerYear: TypicalValue<number>;
}> = Object.freeze({
  currency: { value: 'EUR', why: 'The currency of most of the SAP customers Clean-Core.io was built with.' },
  devDayRate: { value: 1000, why: 'A round all-in day rate for an external ABAP developer in Germany (typically 750 to 1,200).' },
  testDayRate: { value: 700, why: 'A round internal cost rate for a business key user (typically 450 to 800).' },
  horizonYears: { value: 5, why: 'A usual planning period for an S/4HANA programme, long enough to see several upgrades.' },
  releasesPerYear: {
    value: 1,
    why: 'Custom ABAP runs on premise or in SAP Cloud ERP Private, where a release upgrade comes about once a year.',
  },
});

/** Why Keep's upgrade deferral is left not determined: nothing here knows it, and a typical value would invent it. */
export const TYPICAL_DEFERRAL_REASON = 'nothing here knows how far keeping it would push the next upgrade back';

/** The proposals the effort comes from — the page's own (`OptionProposals`). */
export interface TypicalProposals {
  effort: EffortProposal | null;
  baseline: BaselineProposal | null;
}

/** What one click would fill: the shared figures and, per option id, its parts. Empty lists: nothing to fill. */
export interface TypicalFill {
  shared: SharedFigure[];
  options: Record<string, TypicalPart[]>;
}

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** The shared figures nobody stated — the ones a typical value may fill. A cadence typed but not confirmed is the reader's. */
function missingShared(a: CostAssumptions): SharedFigure[] {
  const out: SharedFigure[] = [];
  if (!a.currency) out.push('currency');
  if (!finite(a.devDayRate)) out.push('devDayRate');
  if (!finite(a.testDayRate)) out.push('testDayRate');
  if (!finite(a.horizonYears)) out.push('horizonYears');
  if (!a.releaseCadence) out.push('releaseCadence');
  return out;
}

/** The parts of one option a typical value may fill: only parts with nothing entered in them. */
function missingParts(o: CostOption, proposals: TypicalProposals): TypicalPart[] {
  if (o.kind === 'keyuser') return [];
  const out: TypicalPart[] = [];
  if (o.oneOff === null && o.perRelease === null && effortProposalFor(proposals.effort, o.kind)) out.push('effort');
  if (BASELINE_KINDS.has(o.kind) && o.maintenanceBaselinePerYear == null && proposals.baseline) out.push('baseline');
  if (o.kind === COMPARISON_KIND && !o.upgradeDelay) out.push('deferral');
  return out;
}

/** What "Use typical assumptions" would fill now. */
export function typicalFill(a: CostAssumptions, proposals: TypicalProposals): TypicalFill {
  const options: Record<string, TypicalPart[]> = {};
  for (const o of a.options || []) {
    const parts = missingParts(o, proposals);
    if (parts.length > 0) options[o.id] = parts;
  }
  return { shared: missingShared(a), options };
}

/** Whether one click would fill anything. */
export function canUseTypical(a: CostAssumptions, proposals: TypicalProposals): boolean {
  const fill = typicalFill(a, proposals);
  return fill.shared.length > 0 || Object.keys(fill.options).length > 0;
}

const union = <T extends string>(a: readonly T[] | undefined, b: readonly T[]): T[] => Array.from(new Set([...(a ?? []), ...b]));

/**
 * The patch "Use typical assumptions" applies: every missing shared figure and every empty part of an option, each
 * marked. One patch for everything, so a caller that patches from the value it was handed (the demo) keeps it all.
 */
export function typicalPatch(a: CostAssumptions, proposals: TypicalProposals): Partial<CostAssumptions> {
  const fill = typicalFill(a, proposals);
  const patch: Partial<CostAssumptions> = {};
  const t = TYPICAL_SHARED;
  for (const f of fill.shared) {
    if (f === 'currency') patch.currency = t.currency.value;
    else if (f === 'devDayRate') patch.devDayRate = t.devDayRate.value;
    else if (f === 'testDayRate') patch.testDayRate = t.testDayRate.value;
    else if (f === 'horizonYears') patch.horizonYears = t.horizonYears.value;
    // Confirmed: the click is the reader's go on this cadence, as a typical one — the mark says which it is.
    else patch.releaseCadence = { perYear: t.releasesPerYear.value, confirmed: true };
  }
  if (fill.shared.length > 0) patch.typical = union(a.typical, fill.shared);
  if (Object.keys(fill.options).length > 0) {
    patch.options = a.options.map((o) => {
      const parts = fill.options[o.id];
      if (!parts) return o;
      const next: CostOption = { ...o };
      if (parts.includes('effort')) {
        const effort = effortProposalFor(proposals.effort, o.kind)!;
        next.oneOff = effort.oneOff;
        next.perRelease = effort.perRelease;
        next.effortSource = 'proposal-confirmed';
      }
      if (parts.includes('baseline') && proposals.baseline) {
        next.maintenanceBaselinePerYear = proposals.baseline.perYear;
        next.baselineSource = 'proposal-confirmed';
      }
      if (parts.includes('deferral')) next.upgradeDelay = { state: 'not-determined', reason: TYPICAL_DEFERRAL_REASON };
      next.typical = union(o.typical, parts);
      return next;
    });
  }
  return patch;
}

/** The shared fields a patch changes — what loses its typical mark when the reader changes it in place. */
const SHARED_KEYS: readonly SharedFigure[] = SHARED_FIGURES;

/**
 * A patch of the shared figures as the reader makes it: every field it touches is theirs from now on, so its typical
 * mark goes. Returns the patch with the remaining marks (or without the key when none remain).
 */
export function withReaderPatch(a: CostAssumptions, patch: Partial<CostAssumptions>): Partial<CostAssumptions> {
  if (!a.typical || a.typical.length === 0 || 'typical' in patch) return patch;
  const touched = SHARED_KEYS.filter((k) => k in patch);
  if (touched.length === 0) return patch;
  const rest = a.typical.filter((k) => !touched.includes(k));
  return { ...patch, typical: rest.length > 0 ? rest : undefined };
}

/** The option fields per part: an edit of any of them makes that part the reader's. */
const PART_KEYS: Readonly<Record<TypicalPart, ReadonlyArray<keyof CostOption>>> = {
  effort: ['oneOff', 'perRelease'],
  baseline: ['maintenanceBaselinePerYear'],
  deferral: ['upgradeDelay'],
};

/** The same for an option's patch: the parts it touches lose their mark. */
export function withReaderOptionPatch(o: CostOption | undefined, patch: Partial<CostOption>): Partial<CostOption> {
  if (!o || !o.typical || o.typical.length === 0 || 'typical' in patch) return patch;
  const rest = o.typical.filter((part) => !PART_KEYS[part].some((k) => k in patch));
  if (rest.length === o.typical.length) return patch;
  return { ...patch, typical: rest.length > 0 ? rest : undefined };
}

/** Whether anything in these assumptions is still a typical value. */
export function usesTypical(a: CostAssumptions | null | undefined): boolean {
  if (!a) return false;
  return (a.typical ?? []).length > 0 || (a.options || []).some((o) => (o.typical ?? []).length > 0);
}

/** "currency", "developer day rate" — the shared figures by name, for a sentence. */
export { SHARED_FIGURES };

export const SHARED_FIGURE_WORDS: Readonly<Record<SharedFigure, string>> = Object.freeze({
  currency: 'currency',
  devDayRate: 'developer day rate',
  testDayRate: 'key-user day rate',
  horizonYears: 'period',
  releaseCadence: 'releases a year',
});

/**
 * The typical values in use, in one line a reader can check and a print can carry: "currency EUR, developer day rate
 * EUR 1,000, …, and the effort of Keep, Rebuild and Retire". `null` when none is in use.
 */
export function typicalInWords(a: CostAssumptions): string | null {
  if (!usesTypical(a)) return null;
  const parts: string[] = [];
  const marked = new Set(a.typical ?? []);
  if (marked.has('currency')) parts.push(`currency ${a.currency}`);
  if (marked.has('devDayRate')) parts.push(`developer day rate ${formatMoney(a.devDayRate, a.currency) ?? a.devDayRate}`);
  if (marked.has('testDayRate')) parts.push(`key-user day rate ${formatMoney(a.testDayRate, a.currency) ?? a.testDayRate}`);
  if (marked.has('horizonYears') && finite(a.horizonYears)) parts.push(`${formatNumber(a.horizonYears)} years`);
  if (marked.has('releaseCadence') && a.releaseCadence) {
    const n = a.releaseCadence.perYear;
    parts.push(`${formatNumber(n, { maximumFractionDigits: 2 })} release${n === 1 ? '' : 's'} a year`);
  }
  const optionNames = (a.options || []).filter((o) => (o.typical ?? []).length > 0).map((o) => o.label || o.id);
  if (optionNames.length > 0) {
    const names = optionNames.length < 2 ? optionNames.join('') : `${optionNames.slice(0, -1).join(', ')} and ${optionNames[optionNames.length - 1]}`;
    parts.push(`the effort of ${names}`);
  }
  if (parts.length === 0) return null;
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Whose figures a stored scenario rests on, for the views that only name it: Management, the one-pager, the handover. */
export function figuresOwnerWords(a: CostAssumptions | null | undefined): string {
  return usesTypical(a) ? 'typical assumptions, not your own figures' : 'your own figures';
}
