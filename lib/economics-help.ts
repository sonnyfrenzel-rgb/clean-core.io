/**
 * The help the Economics tool gives while a reader states their figures
 * (owner, 11.10.2026): "Give more help here … and show clearly when something
 * was saved", "proposal values need explanations as well", and on the Keep
 * card: "you don't understand at all what exactly is meant".
 *
 * Three things, all pure so they are tested without a page:
 *
 *   1. What a figure field accepts, and what it says when it does not — the
 *      bounds are the stored record's own (`ECONOMICS_LIMITS`), so a figure the
 *      field accepts is one the save accepts.
 *   2. Where a proposed figure comes from — written from the same factors and
 *      the same rounding `proposeEffort` and `proposeMaintenanceBaseline` use,
 *      with this project's line count in it. Nothing here proposes a figure of
 *      its own, and nothing fills a field: help is words, never a value
 *      (ADR-035, "nothing has a default").
 *   3. Whether a part of the page is saved: per section, from what was last
 *      stored against what is on screen.
 */

import {
  PROPOSED_DAYS_PER_1000_LINES,
  PROPOSED_MAINTENANCE_PER_1000_LINES,
  formatUplift,
  type BaselineProposal,
  type CostGap,
  type EffortProposal,
} from './cost-assumptions';
import { ECONOMICS_LIMITS, type EconomicsPayload } from './economics-record';
import { formatDateTime, formatDays, formatLines, formatNumber } from './format';

/* ------------------------------------------------------------ 1. figures */

export type FigureKind = 'rate' | 'horizon' | 'cadence' | 'days' | 'deferral' | 'budget';

interface FigureRule {
  /** `true`: 0 is not a usable figure (a horizon of 0 years compares nothing). */
  positive: boolean;
  max: number;
  /** What the figure is, for the message: "a day rate". */
  noun: string;
}

/** The bounds of `lib/economics-record.ts` and the coverage rules of `lib/cost-assumptions.ts`. */
export const FIGURE_RULES: Readonly<Record<FigureKind, FigureRule>> = Object.freeze({
  rate: { positive: false, max: ECONOMICS_LIMITS.maxRate, noun: 'a day rate' },
  horizon: { positive: true, max: ECONOMICS_LIMITS.maxHorizonYears, noun: 'a time horizon' },
  cadence: { positive: true, max: ECONOMICS_LIMITS.maxReleasesPerYear, noun: 'releases per year' },
  days: { positive: false, max: ECONOMICS_LIMITS.maxDays, noun: 'days of effort' },
  deferral: { positive: false, max: ECONOMICS_LIMITS.maxReleasesDeferred, noun: 'releases deferred' },
  budget: { positive: false, max: ECONOMICS_LIMITS.maxBudget, noun: 'a budget' },
});

export interface FigureReading {
  /** The figure the page takes, or `null` — nothing typed, or nothing usable. */
  value: number | null;
  /** What is wrong and what is allowed, or `null`. */
  problem: string | null;
}

/**
 * What a figure field holds. Parsed as the fields always parsed it —
 * `Number(raw)`, finite — so a stored figure keeps its form. `badInput` is the
 * browser's own verdict on a number field whose text is not a number: its
 * value then reads as empty, and the reader must hear why, not "no figure".
 *
 * A figure outside its bounds is not taken: the page holds no figure for it
 * and the message says what the field accepts.
 */
export function readFigure(raw: string, kind: FigureKind, badInput = false): FigureReading {
  const rule = FIGURE_RULES[kind];
  const text = raw.trim();
  if (text === '') {
    return badInput
      ? { value: null, problem: 'Not a figure. Use digits, with a decimal point where you need one — for example 850 or 2.5.' }
      : { value: null, problem: null };
  }
  const v = Number(text);
  if (!Number.isFinite(v)) {
    return { value: null, problem: 'Not a figure. Use digits, with a decimal point where you need one — for example 850 or 2.5.' };
  }
  if (v < 0) return { value: null, problem: `Not below 0 — ${rule.noun} cannot be negative.` };
  if (rule.positive && v === 0) return { value: null, problem: `More than 0 — ${rule.noun} of 0 prices nothing.` };
  if (v > rule.max) {
    return {
      value: null,
      problem: `At most ${formatNumber(rule.max)}. A larger figure is taken for a typing slip and is not stored.`,
    };
  }
  return { value: v, problem: null };
}

/**
 * What each field of step 2 is for, in a sentence or two — orientation, never a
 * figure to copy: rates differ too much by country and contract for any number
 * here to be anything but a default in disguise.
 */
export const RATES_HELP = Object.freeze({
  currency:
    'The currency your day rates and budget are in; every amount on this page uses it. Type a code, a currency or a country — “EU”, “dollar”, “India” — and pick it from the list.',
  devRate:
    'What one day of SAP ABAP or SAP BTP development costs you, internal or external. Rates vary widely by country and contract — use what you actually pay. Every developer day on this page is priced at it.',
  testRate:
    'What one day of a key user testing a change by hand costs you — usually an internal rate. Every test day on this page is priced at it.',
  horizon:
    'How many years to compare over. One-off effort is paid once, recurring effort at every release in this period — the longer it is, the more running costs weigh. Often the period of your budget planning or the remaining life of the system.',
  cadence:
    'How often the recurring effort falls due: the SAP releases and feature packs you actually apply in a year. SAP S/4HANA Cloud Public Edition upgrades twice a year; on-premise and Private Cloud releases come less often.',
  confirm:
    'Tick it once the figure is yours. Until then it counts as a proposal, and no option is priced on it.',
});

/** What each effort field of an option means — the range, the halves, what multiplies it. */
export const EFFORT_HELP = Object.freeze({
  oneOff:
    'What the option costs once — to rebuild, move or retire the code. Low and High are the ends of the range you expect: an option is only called cheapest when its High is below every other option’s Low.',
  devDays: 'Developer days, priced at your developer day rate.',
  testDays: 'Test days — key users testing by hand — priced at your key-user day rate.',
  perRelease:
    'What the option costs again at every SAP release: adapting and retesting the code. Counted once per release in your time horizon.',
  baseline:
    'The yearly upkeep of keeping the code as it is — small fixes, support tickets, retests — on top of the effort per release. Counted once per year of your time horizon.',
  deferral:
    'How many SAP releases keeping this code as it is would push your next upgrade back — because the custom code has to be reworked or retested first. It is not priced: nothing here knows what a later upgrade costs you. But Keep is only priced once you state it, or say it is not determined.',
});

/** "2 releases a year × 5 years = 10 releases", or what is still missing for it. */
export function releasesInHorizonText(perYear: number | null | undefined, years: number | null | undefined): string {
  const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (ok(perYear) && ok(years)) {
    const n = (v: number) => formatNumber(v, { maximumFractionDigits: 2 }) ?? String(v);
    return `With your figures: ${n(perYear)} release${perYear === 1 ? '' : 's'} a year × ${n(years)} year${years === 1 ? '' : 's'} = ${n(perYear * years)} releases.`;
  }
  return 'How many releases that is follows from releases per year × time horizon in step 2.';
}

/* ------------------------------------------------------------ 2. proposals */

export interface DerivationLine {
  key: string;
  /** What the figure is: "One-off, developer days". */
  label: string;
  /** How it is computed, with this project's numbers: "668 lines ÷ 1,000 × 2–5 days". */
  formula: string;
  /** The proposed figure, as the card shows it: "1.3–3.3 days". */
  result: string;
}

const d = (v: number) => formatDays(v) ?? String(v);
const factor = (v: number) => formatNumber(v, { maximumFractionDigits: 2 }) ?? String(v);

/**
 * How the effort proposal for an option is computed, line by line, with the
 * figures `proposeEffort(loc)` returned — so the explanation and the button
 * can never disagree.
 */
export function effortDerivation(loc: number, proposal: EffortProposal): DerivationLine[] {
  const f = PROPOSED_DAYS_PER_1000_LINES;
  const lines = `${formatLines(loc)} lines ÷ 1,000`;
  return [
    {
      key: 'one-off-dev',
      label: 'One-off, developer days',
      formula: `${lines} × ${factor(f.oneOffDevLow)}–${factor(f.oneOffDevHigh)} days`,
      result: `${d(proposal.oneOff.low.devDays)}–${d(proposal.oneOff.high.devDays)} days`,
    },
    {
      key: 'one-off-test',
      label: 'One-off, test days',
      formula: `${lines} × ${factor(f.oneOffTestLow)}–${factor(f.oneOffTestHigh)} days`,
      result: `${d(proposal.oneOff.low.testDays)}–${d(proposal.oneOff.high.testDays)} days`,
    },
    {
      key: 'release-dev',
      label: 'Per release, developer days',
      formula: `${lines} × ${factor(f.perReleaseDev)} days`,
      result: `${d(proposal.perRelease.devDays)} days`,
    },
    {
      key: 'release-test',
      label: 'Per release, test days',
      formula: `${lines} × ${factor(f.perReleaseTest)} days`,
      result: `${d(proposal.perRelease.testDays)} days`,
    },
  ];
}

/** How the maintenance-baseline proposal is computed, with the uplift for the score where there is one. */
export function baselineDerivation(loc: number, proposal: BaselineProposal): DerivationLine[] {
  const m = PROPOSED_MAINTENANCE_PER_1000_LINES;
  const uplift =
    proposal.score === null ? '' : ` × ${formatUplift(proposal.uplift).slice(1)} (Clean Core Score ${proposal.score})`;
  const lines = `${formatLines(loc)} lines ÷ 1,000`;
  return [
    {
      key: 'baseline-dev',
      label: 'Per year, developer days',
      formula: `${lines} × ${factor(m.devPerYear)} days${uplift}`,
      result: `${d(proposal.perYear.devDays)} days`,
    },
    {
      key: 'baseline-test',
      label: 'Per year, test days',
      formula: `${lines} × ${factor(m.testPerYear)} days${uplift}`,
      result: `${d(proposal.perYear.testDays)} days`,
    },
  ];
}

/** Where the line count of a proposal comes from, in a few words. */
export function linesBasis(loc: number, sourceLoc: number | null): string {
  return sourceLoc !== null && loc === sourceLoc
    ? `${formatLines(loc)} lines — the lines of your source (step 1)`
    : `${formatLines(loc)} lines — the size you set in step 1`;
}

/** The closing sentence of every derivation: a proposal, and whose figure it becomes. */
export const PROPOSAL_STANDING =
  'Fixed factors per 1,000 lines — nothing measured them. A proposal only: it counts once you take it over as your figure, and you can replace it with your own at any time.';

/** The uplift sentence for the baseline, or why there is none. */
export function baselineUpliftText(proposal: BaselineProposal): string {
  return proposal.score === null
    ? 'There is no Clean Core Score from the signed run for this source, so no uplift is applied.'
    : `Raised by ${formatUplift(proposal.uplift)} — 1 + (100 − ${proposal.score}) ÷ 100 for the Clean Core Score of the signed run: code further from clean core costs more to keep running.`;
}

/* ------------------------------------------------- why a cost is not determined */

export interface CostBlocker {
  /** A gap of the shared figures, or of this option itself. */
  scope: 'shared' | 'own';
  /** In a few words: "your currency", "the upgrade deferral". */
  label: string;
  /**
   * The `data-cost-field` of the field that fixes it, for a shared figure —
   * the page scrolls to it and puts the cursor in it.
   */
  field: string | null;
}

const SHARED_BLOCKERS: Partial<Record<CostGap['code'], { label: string; field: string }>> = {
  'currency-missing': { label: 'your currency', field: 'currency' },
  'dev-rate-missing': { label: 'the developer day rate', field: 'dev-day-rate' },
  'test-rate-missing': { label: 'the key-user day rate', field: 'test-day-rate' },
  'horizon-missing': { label: 'the time horizon', field: 'horizon-years' },
  'cadence-missing': { label: 'releases per year', field: 'release-cadence' },
  'cadence-unconfirmed': { label: 'your confirmation of the release cadence', field: 'release-cadence-confirmed' },
};

const SHARED_INVALID: ReadonlyArray<[string, { label: string; field: string }]> = [
  ['The development day rate', { label: 'a usable developer day rate', field: 'dev-day-rate' }],
  ['The test / key-user day rate', { label: 'a usable key-user day rate', field: 'test-day-rate' }],
  ['The observation period', { label: 'a usable time horizon', field: 'horizon-years' }],
  ['The release cadence', { label: 'usable releases per year', field: 'release-cadence' }],
];

const OWN_BLOCKERS: Partial<Record<CostGap['code'], string>> = {
  'option-one-off-missing': 'the one-off effort range',
  'option-range-inverted': 'a one-off range whose Low is not above its High',
  'option-per-release-missing': 'the effort per release',
  'option-baseline-missing': 'the maintenance baseline per year',
  'option-baseline-unexpected': 'no maintenance baseline (this option carries none)',
  'option-effort-unconfirmed': 'your confirmation of the proposed effort',
  'upgrade-delay-unstated': 'the upgrade deferral',
};

/**
 * Why an option has no cost yet, from the comparison's own gaps for it — the
 * figures of step 2 it waits for (with the field to go to), and what the
 * option itself still lacks. Only the gaps that keep it from a price count.
 */
export function costBlockers(gaps: readonly CostGap[]): CostBlocker[] {
  const out: CostBlocker[] = [];
  const seen = new Set<string>();
  const push = (b: CostBlocker) => {
    if (seen.has(b.label)) return;
    seen.add(b.label);
    out.push(b);
  };
  for (const g of gaps) {
    if (g.severity !== 'rejects') continue;
    const shared = SHARED_BLOCKERS[g.code];
    if (shared) {
      push({ scope: 'shared', ...shared });
      continue;
    }
    if (g.code === 'amount-invalid') {
      const hit = SHARED_INVALID.find(([subject]) => g.subject === subject);
      if (hit) push({ scope: 'shared', ...hit[1] });
      else push({ scope: 'own', label: `${(g.subject ?? 'a figure').replace(/^The /, 'a usable ').replace(/ of ".*"$/, '')}`, field: null });
      continue;
    }
    const own = OWN_BLOCKERS[g.code];
    if (own) push({ scope: 'own', label: own, field: null });
  }
  // The shared figures first: they hold every option back, not only this one.
  return [...out.filter((b) => b.scope === 'shared'), ...out.filter((b) => b.scope === 'own')];
}

/* ------------------------------------------------------------ 3. saved or not */

/**
 * The parts of the page that say for themselves whether they are saved: the
 * rates of step 2, and each option card of step 3. Each key is a fingerprint
 * of what the part holds, read from the serialized payload — the same text
 * the save sends — so "changed since the last save" means exactly that.
 */
export function sectionKeys(payload: EconomicsPayload): Record<string, string> {
  const a = payload.assumptions;
  const keys: Record<string, string> = {
    rates: JSON.stringify([a.currency, a.devDayRate, a.testDayRate, a.horizonYears, a.releaseCadence]),
  };
  for (const o of a.options) keys[`option:${o.id}`] = JSON.stringify(o);
  return keys;
}

/**
 * The sections that hold any figure — the ones a loaded record can call saved.
 * A card nobody typed into is not "saved", it is empty.
 */
export function sectionsWithFigures(serialized: string | null): string[] {
  if (!serialized) return [];
  let payload: EconomicsPayload;
  try {
    payload = JSON.parse(serialized) as EconomicsPayload;
  } catch {
    return [];
  }
  const a = payload.assumptions;
  const out: string[] = [];
  const rates = [a.devDayRate, a.testDayRate, a.horizonYears].some((v) => v !== null && v !== undefined);
  if (a.currency || rates || a.releaseCadence) out.push('rates');
  for (const o of a.options) {
    if (o.oneOff || o.perRelease || o.maintenanceBaselinePerYear || o.upgradeDelay) out.push(`option:${o.id}`);
  }
  return out;
}

/** `sectionKeys` of a serialized payload, or none when it is not one. */
export function sectionKeysOf(serialized: string | null): Record<string, string> {
  if (!serialized) return {};
  try {
    return sectionKeys(JSON.parse(serialized) as EconomicsPayload);
  } catch {
    return {};
  }
}

/** Where the page's save stands — the page's own state, reduced to what a section needs. */
export type PageSave =
  | { state: 'idle' | 'saving' | 'saved' | 'read-only' | 'unread' }
  | { state: 'failed'; message: string };

export type SectionSave =
  | { state: 'none' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  | { state: 'failed'; message: string };

/**
 * One section's state. A section that differs from what was last stored is
 * being saved — or, after a failed save, is not saved, and says why. A
 * section that matches the store shows when it was saved; one that was never
 * saved (nothing typed yet) shows nothing.
 */
export function sectionSave(input: { dirty: boolean; savedAt: string | null; save: PageSave }): SectionSave {
  const { dirty, savedAt, save } = input;
  if (save.state === 'read-only') return { state: 'none' };
  if (dirty) {
    if (save.state === 'failed') return { state: 'failed', message: save.message };
    if (save.state === 'unread') {
      return { state: 'failed', message: 'your stored figures could not be read, so nothing is saved until you reload the page' };
    }
    return { state: 'saving' };
  }
  return savedAt ? { state: 'saved', at: savedAt } : { state: 'none' };
}

/**
 * The time of a save as a reader reads it: "14:05 GMT+2" in their own zone,
 * "14:05 UTC" without one — never a time without its zone (DESIGN.md §3).
 */
export function savedTimeText(iso: string, timeZone?: string): string | null {
  const full = formatDateTime(iso, timeZone ? { timeZone } : {});
  if (!full) return null;
  const at = full.lastIndexOf(', ');
  return at === -1 ? full : full.slice(at + 2);
}

/**
 * Several sections as one — step 3 is four cards. A failed one wins, then one
 * being saved; otherwise the latest save among them, or nothing.
 */
export function combineSaves(list: readonly SectionSave[]): SectionSave {
  const failed = list.find((s) => s.state === 'failed');
  if (failed) return failed;
  if (list.some((s) => s.state === 'saving')) return { state: 'saving' };
  const at = list
    .map((s) => (s.state === 'saved' ? s.at : null))
    .filter((v): v is string => v !== null)
    .sort()
    .pop();
  return at ? { state: 'saved', at } : { state: 'none' };
}

/** What a complete step is while its figures are not stored yet: being saved, not saved, or done. */
export function savedStepState(complete: boolean, save: SectionSave): 'done' | 'saving' | 'unsaved' | null {
  if (!complete) return null;
  if (save.state === 'saving') return 'saving';
  if (save.state === 'failed') return 'unsaved';
  return 'done';
}
