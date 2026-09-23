/**
 * Options with costs, and only ever out of one revision of stated assumptions.
 *
 * Roadmap 7.4 (`docs/ROADMAP.md` §Phase 7): *"**Optionen mit Kosten** nur aus
 * einer Annahmenrevision; **„Nichts tun" als Vergleichsoption**
 * (Regressionstest je Release, Upgrade-Verzug) und die Empfindlichkeit der
 * Annahmen; kein Kostensieger, solange eine Option unvollständig ist."*
 *
 * The mandatory fields are ADR-035 (`docs/design/decisions.md:44`, decision
 * Sonny 15.09.2026), verbatim: currency **with no default** · **two day rates**
 * (development, test/key user) · observation period **with no default** ·
 * release cadence **only when confirmed** · per option a one-off effort **as a
 * range** and a running effort per release · a maintenance baseline for *Keep*
 * and *Do nothing*. No model fills a field; the fixed effort factors per 1,000
 * lines are a proposal that has to be confirmed. No cost winner while any
 * option is missing a mandatory field.
 *
 * What this is not: `lib/tco-model.ts`. That is the demonstration forecast of
 * the Economics stage — one estate, one modernisation, coefficients nothing
 * measured, a fixed target score of 95. It prices *an improvement*. This prices
 * *options against each other*, including the option of doing nothing, and it
 * refuses to name a cheapest one until every option is complete. They share the
 * stage and nothing else; neither reads the other.
 *
 * ── Why this is its own module, and not three other things ──
 *
 * 1. Not a field on `AssessmentProfile` (`lib/assessment-profile.ts`, step
 *    7.10). That profile is the *technical* target — edition, release,
 *    component levels, catalog snapshot, rule version — and it is folded into
 *    `assessmentSubjectHash()`, so every fact in it invalidates the technical
 *    verdict and every approval derived from it. A day rate moves no verdict
 *    about ABAP. Putting one there would mean that typing a rate invalidates
 *    the analysis, the architecture sign-off and the audit pack. That is not a
 *    stricter guarantee, it is a wrong one.
 *
 * 2. Not a fourth revision mechanism either. The shape here is deliberately the
 *    one 7.10 established: a canonical form, a SHA-256 fingerprint over it,
 *    three coverage states (`covered` · `unconfirmed` · `rejected`), a
 *    `…Revision()` string that carries `unconfirmed:` in front when it is not
 *    fully covered, and a `…ManifestInput()` that throws rather than let a
 *    refusal be signed. A reader who has understood `profileRevision()` has
 *    understood this.
 *
 * 3. It does reach `lib/input-manifest.ts` (step 0.5) — through
 *    `costAssumptionsManifestInput()`, `dataClass: 'source-artefact'`,
 *    `binding: 'value'`, because the reader typed the figures and the run holds
 *    them, not a reference to something elsewhere. It is deliberately **not**
 *    added to `analysisRunInputs()`: the analysis run did not read a day rate,
 *    and a manifest that names an input the run never had is exactly the defect
 *    that module was written against. The seam belongs to whatever signs an
 *    option comparison (step 8.4), and that step is not this one.
 *
 * No React, no Firestore, no `node:crypto` — like `assessment-profile.ts` and
 * for the same reason: the page computes this in the browser and a server route
 * will one day compute it too, and the two must not be able to hash
 * differently.
 */

import { sha256Hex } from './artefact-digest';
import { referenceDigest, type ManifestInput } from './input-manifest';

/** Format of the assumption record. Bumped only when the canonical form changes. */
export const COST_ASSUMPTIONS_VERSION = 1;

/**
 * Effort split the way the two day rates split it (ADR-035: *"bitte 2
 * Tagessätze"*). One number for both would make the second rate decoration.
 */
export interface EffortDays {
  devDays: number;
  testDays: number;
}

/** A one-off effort is stated as a range, never as a point (ADR-035). */
export interface EffortRange {
  low: EffortDays;
  high: EffortDays;
}

/**
 * A value the reader either states or declares undetermined, with a reason.
 *
 * *"Not determined" is a statement of its own, with a reason — never a zero.*
 * A zero here would price an upgrade deferral at nothing and put that nothing
 * into a comparison as if it had been established.
 */
export type Stated<T> =
  | { state: 'stated'; value: T }
  | { state: 'not-determined'; reason: string };

export const OPTION_KINDS = ['do-nothing', 'keep', 'standard', 'rebuild', 'retire'] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

/**
 * The kinds that carry a separate yearly maintenance baseline (ADR-035:
 * *"Wartungs-Baseline für Keep und Do nothing"*). For every other kind the
 * baseline has to be absent rather than zero — see `option-baseline-unexpected`.
 */
export const BASELINE_KINDS: ReadonlySet<OptionKind> = new Set<OptionKind>(['do-nothing', 'keep']);

/** The comparison option 7.4 names explicitly. Without it there is nothing to compare against. */
export const COMPARISON_KIND: OptionKind = 'do-nothing';

/**
 * Where an option's effort figures come from.
 *
 * `proposal-unconfirmed` is not a field. The roadmap allows the fixed factors
 * per 1,000 lines *"nur als bestätigungspflichtiger Vorschlag"* — a proposal
 * nobody confirmed is a suggestion on screen, and an option resting on one is
 * incomplete, not merely unconfirmed.
 */
export const EFFORT_SOURCES = ['stated', 'proposal-confirmed', 'proposal-unconfirmed'] as const;
export type EffortSource = (typeof EFFORT_SOURCES)[number];

export interface CostOption {
  /** Stable id within one comparison. */
  id: string;
  kind: OptionKind;
  /** What the reader calls it. Never priced, never compared — shown. */
  label: string;
  /** Mandatory: one-off effort as a range. */
  oneOff: EffortRange | null;
  /** Mandatory: running effort per release. */
  perRelease: EffortDays | null;
  /** Mandatory for `do-nothing` and `keep`; absent for every other kind. */
  maintenanceBaselinePerYear: EffortDays | null;
  /**
   * `do-nothing` only: by how many releases the upgrade is deferred. Not priced
   * — nothing here knows what a deferred upgrade costs — but stated, because
   * the roadmap names it as part of what *Do nothing* actually is, and an
   * unnamed consequence reads as no consequence.
   */
  upgradeDelay: Stated<{ releasesDeferred: number }> | null;
  effortSource: EffortSource;
}

export interface ReleaseCadence {
  perYear: number;
  /** ADR-035: *"Release-Takt (Vorschlag nur bestätigt)"*. */
  confirmed: boolean;
}

export interface CostAssumptions {
  version: number;
  /** ISO code or symbol as the reader wrote it. `''` means nobody stated one — there is no default. */
  currency: string;
  devDayRate: number | null;
  testDayRate: number | null;
  /** Observation period in whole years. No default (ADR-035). */
  horizonYears: number | null;
  releaseCadence: ReleaseCadence | null;
  options: CostOption[];
}

/** An empty set of assumptions: every mandatory field absent, and no option. */
export function emptyCostAssumptions(): CostAssumptions {
  return {
    version: COST_ASSUMPTIONS_VERSION,
    currency: '',
    devDayRate: null,
    testDayRate: null,
    horizonYears: null,
    releaseCadence: null,
    options: [],
  };
}

/* ---------- the proposal, and it stays a proposal ---------- */

/**
 * The fixed effort factors per 1,000 lines, offered as a proposal.
 *
 * Same order of magnitude as the demonstration forecast in `lib/tco-model.ts`
 * (2.5 / 0.8 development days and 1.8 / 0.6 test days per upgrade / feature
 * pack), and deliberately a separate declaration: there they are a stated
 * assumption of a model that calls itself a demonstration, here they are a
 * suggestion the reader has to accept before it becomes a field. Nothing
 * measured either of them.
 */
export const PROPOSED_DAYS_PER_1000_LINES = {
  oneOffDevLow: 2.0,
  oneOffDevHigh: 5.0,
  oneOffTestLow: 1.0,
  oneOffTestHigh: 2.5,
  perReleaseDev: 2.5,
  perReleaseTest: 1.8,
} as const;

export interface EffortProposal {
  oneOff: EffortRange;
  perRelease: EffortDays;
  /** The sentence the reader confirms or rejects. Never applied silently. */
  sentence: string;
}

/**
 * A proposal for an option of `loc` lines, or `null` when there is no line
 * count to propose from. It returns figures and a sentence; it does not return
 * an option, and it sets nothing.
 */
export function proposeEffort(loc: number | null | undefined): EffortProposal | null {
  if (typeof loc !== 'number' || !Number.isFinite(loc) || loc <= 0) return null;
  const k = loc / 1000;
  const f = PROPOSED_DAYS_PER_1000_LINES;
  return {
    oneOff: {
      low: { devDays: k * f.oneOffDevLow, testDays: k * f.oneOffTestLow },
      high: { devDays: k * f.oneOffDevHigh, testDays: k * f.oneOffTestHigh },
    },
    perRelease: { devDays: k * f.perReleaseDev, testDays: k * f.perReleaseTest },
    sentence:
      `A proposal from ${Math.round(loc).toLocaleString('en-GB')} lines and fixed factors per 1,000 lines ` +
      `(${f.oneOffDevLow}–${f.oneOffDevHigh} development and ${f.oneOffTestLow}–${f.oneOffTestHigh} test days once, ` +
      `${f.perReleaseDev} development and ${f.perReleaseTest} test days per release). ` +
      'Nothing measured these factors. They count as an assumption of yours only once you confirm them.',
  };
}

/* ---------- canonical form, fingerprint, revision ---------- */

const n = (v: number | null | undefined): string =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : 'none';

const effort = (e: EffortDays | null | undefined): string =>
  e ? `${n(e.devDays)}/${n(e.testDays)}` : 'none';

const range = (r: EffortRange | null | undefined): string =>
  r ? `${effort(r.low)}~${effort(r.high)}` : 'none';

const stated = (s: Stated<{ releasesDeferred: number }> | null | undefined): string =>
  !s ? 'none' : s.state === 'stated' ? `d${n(s.value.releasesDeferred)}` : 'not-determined';

/**
 * Canonical form: one segment per fact, fixed order, options sorted by id, no
 * whitespace. Field order is irrelevant, option order is irrelevant, every
 * value is not.
 *
 *   v<n>|currency=<c>|dev=<r>|test=<r>|horizon=<y>|cadence=<n>:<confirmed>
 *   |options=<id>:<kind>:<oneOff>:<perRelease>:<baseline>:<delay>:<source>,…
 */
export function canonicalCostAssumptions(a: CostAssumptions): string {
  const options = [...(a.options || [])]
    .map((o) =>
      [
        o.id,
        o.kind,
        range(o.oneOff),
        effort(o.perRelease),
        effort(o.maintenanceBaselinePerYear),
        stated(o.upgradeDelay),
        o.effortSource,
      ].join(':'),
    )
    .sort()
    .join(',');
  return [
    `v${a.version}`,
    `currency=${a.currency || 'none'}`,
    `dev=${n(a.devDayRate)}`,
    `test=${n(a.testDayRate)}`,
    `horizon=${n(a.horizonYears)}`,
    `cadence=${n(a.releaseCadence?.perYear)}:${a.releaseCadence?.confirmed ? 'confirmed' : 'unconfirmed'}`,
    `options=${options}`,
  ].join('|');
}

/** SHA-256 over the canonical form, lowercase hex. Same facts, same value, any order. */
export function costAssumptionsFingerprint(a: CostAssumptions): string {
  return sha256Hex(canonicalCostAssumptions(a));
}

/* ---------- covered, unconfirmed, rejected ---------- */

export const COST_GAP_CODES = [
  /** No currency. There is no default one, on purpose. */
  'currency-missing',
  /** No developer day rate. */
  'dev-rate-missing',
  /** No test / key-user day rate. */
  'test-rate-missing',
  /** No observation period. One-off and running effort cannot be compared without one. */
  'horizon-missing',
  /** No release cadence at all. */
  'cadence-missing',
  /** A release cadence nobody confirmed. ADR-035 counts it only once confirmed. */
  'cadence-unconfirmed',
  /** A figure that cannot be an amount or an effort: negative, or not a number (CR-16). */
  'amount-invalid',
  /** The comparison has no *Do nothing* option. */
  'comparison-option-missing',
  /** An option without its one-off effort range. */
  'option-one-off-missing',
  /** A one-off range whose lower bound is above its upper bound. */
  'option-range-inverted',
  /** An option without its running effort per release. */
  'option-per-release-missing',
  /** *Do nothing* or *Keep* without a maintenance baseline. */
  'option-baseline-missing',
  /** A maintenance baseline on an option that has none — it would be counted twice. */
  'option-baseline-unexpected',
  /** An option resting on the per-1,000-lines proposal that nobody confirmed. */
  'option-effort-unconfirmed',
  /** *Do nothing* whose upgrade deferral was neither stated nor declared undetermined. */
  'upgrade-delay-unstated',
  /** *Do nothing* whose upgrade deferral is explicitly not determined, with a reason. */
  'upgrade-delay-not-determined',
] as const;
export type CostGapCode = (typeof COST_GAP_CODES)[number];

/**
 * What a gap does — the two severities of `lib/assessment-profile.ts`, and they
 * mean the same thing here:
 *
 *   - `rejects` — no cost may be shown for this option, and no comparison may
 *     name a winner. The assumptions cannot become a signed input
 *     (`costAssumptionsManifestInput` throws).
 *   - `unconfirms` — costs may be shown, and the revision says `unconfirmed:`.
 */
export type CostGapSeverity = 'rejects' | 'unconfirms';

export interface CostGap {
  code: CostGapCode;
  severity: CostGapSeverity;
  /** The option id or the field the gap is about, where it is about one. */
  subject: string | null;
  sentence: string;
}

export type CostCoverageState = 'covered' | 'unconfirmed' | 'rejected';

export interface CostCoverage {
  state: CostCoverageState;
  /** Sorted by code, then subject — same assumptions, same list, same order. */
  gaps: CostGap[];
  /** One sentence for the reader. Empty when everything is covered. */
  sentence: string;
}

const SENTENCES: Record<CostGapCode, (subject: string | null) => string> = {
  'currency-missing': () =>
    'No currency is stated. There is no default one here, so no amount is shown.',
  'dev-rate-missing': () => 'No development day rate is stated, so no effort can be priced.',
  'test-rate-missing': () =>
    'No test / key-user day rate is stated, so the test effort of every option is unpriced.',
  'horizon-missing': () =>
    'No observation period is stated. A one-off effort and a running effort per release cannot be compared without one.',
  'cadence-missing': () =>
    'No release cadence is stated, so nothing says how often the running effort falls due.',
  'cadence-unconfirmed': (s) =>
    `The release cadence of ${s} per year is a proposal nobody confirmed. It counts only once confirmed, so no amount is shown.`,
  'amount-invalid': (s) => `${s} is not a figure this can price. No amount is shown.`,
  'comparison-option-missing': () =>
    'The comparison has no "Do nothing" option. Without it the other options are priced against nothing.',
  'option-one-off-missing': (s) => `${s} has no one-off effort range, which is a mandatory field.`,
  'option-range-inverted': (s) =>
    `${s} has a one-off range whose lower bound is above its upper bound.`,
  'option-per-release-missing': (s) =>
    `${s} has no running effort per release, which is a mandatory field.`,
  'option-baseline-missing': (s) =>
    `${s} has no maintenance baseline. "Do nothing" and "Keep" carry one, and without it the option looks cheaper than it is.`,
  'option-baseline-unexpected': (s) =>
    `${s} carries a maintenance baseline, and its kind has none. Its running effort per release already covers it, so counting both would double it.`,
  'option-effort-unconfirmed': (s) =>
    `${s} rests on the proposed effort factors per 1,000 lines, and nobody confirmed them. A proposal is not a figure of yours, so no amount is shown.`,
  'upgrade-delay-unstated': (s) =>
    `${s} says nothing about the upgrade deferral it causes. State it, or state that it is not determined and why.`,
  'upgrade-delay-not-determined': (s) => `${s} Costs are shown as unconfirmed.`,
};

function gap(code: CostGapCode, severity: CostGapSeverity, subject: string | null): CostGap {
  return { code, severity, subject, sentence: SENTENCES[code](subject) };
}

/** A figure that may be priced: finite and not negative (CR-16). */
function badAmount(value: number | null | undefined): boolean {
  return typeof value !== 'number' || !Number.isFinite(value) || value < 0;
}

function badEffort(e: EffortDays | null | undefined): boolean {
  return !e || badAmount(e.devDays) || badAmount(e.testDays);
}

function optionName(o: CostOption): string {
  return `"${o.label || o.id}"`;
}

/** The gaps of one option, in the order they are found. */
function optionGaps(o: CostOption): CostGap[] {
  const gaps: CostGap[] = [];
  const name = optionName(o);

  if (o.effortSource === 'proposal-unconfirmed') {
    gaps.push(gap('option-effort-unconfirmed', 'rejects', name));
  }

  if (!o.oneOff) {
    gaps.push(gap('option-one-off-missing', 'rejects', name));
  } else if (badEffort(o.oneOff.low) || badEffort(o.oneOff.high)) {
    gaps.push(gap('amount-invalid', 'rejects', `The one-off effort of ${name}`));
  } else if (o.oneOff.low.devDays > o.oneOff.high.devDays || o.oneOff.low.testDays > o.oneOff.high.testDays) {
    gaps.push(gap('option-range-inverted', 'rejects', name));
  }

  if (!o.perRelease) gaps.push(gap('option-per-release-missing', 'rejects', name));
  else if (badEffort(o.perRelease)) {
    gaps.push(gap('amount-invalid', 'rejects', `The effort per release of ${name}`));
  }

  const needsBaseline = BASELINE_KINDS.has(o.kind);
  if (needsBaseline && !o.maintenanceBaselinePerYear) {
    gaps.push(gap('option-baseline-missing', 'rejects', name));
  } else if (!needsBaseline && o.maintenanceBaselinePerYear) {
    gaps.push(gap('option-baseline-unexpected', 'rejects', name));
  } else if (o.maintenanceBaselinePerYear && badEffort(o.maintenanceBaselinePerYear)) {
    gaps.push(gap('amount-invalid', 'rejects', `The maintenance baseline of ${name}`));
  }

  if (o.kind === COMPARISON_KIND) {
    if (!o.upgradeDelay) {
      gaps.push(gap('upgrade-delay-unstated', 'rejects', name));
    } else if (o.upgradeDelay.state === 'not-determined') {
      gaps.push(
        gap(
          'upgrade-delay-not-determined',
          'unconfirms',
          `The upgrade deferral of ${name} is not determined: ${o.upgradeDelay.reason || 'no reason given'}.`,
        ),
      );
    } else if (badAmount(o.upgradeDelay.value.releasesDeferred)) {
      gaps.push(gap('amount-invalid', 'rejects', `The upgrade deferral of ${name}`));
    }
  }

  return gaps;
}

function sortGaps(gaps: CostGap[]): CostGap[] {
  return [...gaps].sort(
    (a, b) => a.code.localeCompare(b.code) || (a.subject || '').localeCompare(b.subject || ''),
  );
}

function stateOf(gaps: ReadonlyArray<CostGap>): CostCoverageState {
  return gaps.some((g) => g.severity === 'rejects')
    ? 'rejected'
    : gaps.length > 0
      ? 'unconfirmed'
      : 'covered';
}

function coverageOf(gaps: CostGap[]): CostCoverage {
  const sorted = sortGaps(gaps);
  const state = stateOf(sorted);
  const relevant = state === 'rejected' ? sorted.filter((g) => g.severity === 'rejects') : sorted;
  return { state, gaps: sorted, sentence: relevant.map((g) => g.sentence).join(' ') };
}

/** The gaps of the shared assumptions, without any option. */
function sharedGaps(a: CostAssumptions): CostGap[] {
  const gaps: CostGap[] = [];
  if (!a.currency) gaps.push(gap('currency-missing', 'rejects', null));
  if (a.devDayRate === null || a.devDayRate === undefined) {
    gaps.push(gap('dev-rate-missing', 'rejects', null));
  } else if (badAmount(a.devDayRate)) {
    gaps.push(gap('amount-invalid', 'rejects', 'The development day rate'));
  }
  if (a.testDayRate === null || a.testDayRate === undefined) {
    gaps.push(gap('test-rate-missing', 'rejects', null));
  } else if (badAmount(a.testDayRate)) {
    gaps.push(gap('amount-invalid', 'rejects', 'The test / key-user day rate'));
  }
  if (a.horizonYears === null || a.horizonYears === undefined) {
    gaps.push(gap('horizon-missing', 'rejects', null));
  } else if (badAmount(a.horizonYears) || a.horizonYears <= 0) {
    gaps.push(gap('amount-invalid', 'rejects', 'The observation period'));
  }
  if (!a.releaseCadence) {
    gaps.push(gap('cadence-missing', 'rejects', null));
  } else if (badAmount(a.releaseCadence.perYear) || a.releaseCadence.perYear <= 0) {
    gaps.push(gap('amount-invalid', 'rejects', 'The release cadence'));
  } else if (!a.releaseCadence.confirmed) {
    gaps.push(gap('cadence-unconfirmed', 'rejects', String(a.releaseCadence.perYear)));
  }
  return gaps;
}

/** Whether one option is complete enough to be priced, under these assumptions. */
export function optionCoverage(a: CostAssumptions, option: CostOption): CostCoverage {
  return coverageOf([...sharedGaps(a), ...optionGaps(option)]);
}

/**
 * Roadmap 7.4, in one function: **no amount without a revision of assumptions
 * that carries it.**
 *
 * Like `profileCoverage()`, it does not ask whether anything positively proves
 * the assumptions unusable. It names every field a cost depends on and requires
 * each one to be there, to be a figure, and — for the release cadence — to have
 * been confirmed.
 */
export function costAssumptionsCoverage(a: CostAssumptions | null | undefined): CostCoverage {
  if (!a) {
    const only = gap('currency-missing', 'rejects', null);
    return { state: 'rejected', gaps: [only], sentence: only.sentence };
  }
  const gaps = sharedGaps(a);
  const options = a.options || [];
  if (!options.some((o) => o.kind === COMPARISON_KIND)) {
    gaps.push(gap('comparison-option-missing', 'rejects', null));
  }
  for (const o of options) gaps.push(...optionGaps(o));
  return coverageOf(gaps);
}

/**
 * The revision string an option comparison records for these assumptions.
 *
 * Same construction as `profileRevision()`: the facts a reader would compare,
 * then twelve characters of the fingerprint, and `unconfirmed:` in front when
 * the coverage is not complete.
 */
export function costAssumptionsRevision(a: CostAssumptions): string {
  const fp = costAssumptionsFingerprint(a).slice(0, 12);
  const cadence = a.releaseCadence
    ? `${a.releaseCadence.perYear}/y${a.releaseCadence.confirmed ? '' : '?'}`
    : 'no-cadence';
  const core = `${a.currency || 'no-currency'}@${a.horizonYears ?? 'no-horizon'}y/${cadence}#${(a.options || []).length}opt+${fp}`;
  return costAssumptionsCoverage(a).state === 'covered' ? core : `unconfirmed:${core}`;
}

/** The input id the cost assumptions occupy in `lib/input-manifest.ts`'s manifest. */
export const COST_ASSUMPTIONS_INPUT_ID = 'assumptions:cost';

/**
 * The assumptions as an entry of a signed input manifest.
 *
 * `dataClass: 'source-artefact'` — the comparison was computed *against* them,
 * so a change invalidates it, which is what `invalidatingInputs()` already
 * does. `binding: 'value'`: unlike a catalog or a profile, these are figures
 * the reader typed and the record holds; the fingerprint covers all of them.
 *
 * Throws on rejected coverage, for the reason `profileManifestInput()` throws:
 * a refusal that can still be signed is not a refusal.
 */
export function costAssumptionsManifestInput(a: CostAssumptions): ManifestInput {
  const coverage = costAssumptionsCoverage(a);
  if (coverage.state === 'rejected') {
    throw new Error(
      `Cost assumptions that do not carry an amount must not become a signed input: ${coverage.sentence}`,
    );
  }
  const revision = costAssumptionsRevision(a);
  return {
    id: COST_ASSUMPTIONS_INPUT_ID,
    dataClass: 'source-artefact',
    revision,
    binding: 'value',
    sha256: referenceDigest(COST_ASSUMPTIONS_INPUT_ID, revision),
  };
}

/* ---------- what an option costs ---------- */

export interface AmountRange {
  low: number;
  high: number;
}

export interface OptionCost {
  optionId: string;
  label: string;
  kind: OptionKind;
  coverage: CostCoverage;
  /** `null` whenever the coverage rejects — never a zero standing in for a refusal. */
  oneOff: AmountRange | null;
  runningTotal: number | null;
  baselineTotal: number | null;
  total: AmountRange | null;
  /** Releases inside the observation period, or `null` when either is missing. */
  releasesInHorizon: number | null;
}

function price(e: EffortDays, devRate: number, testRate: number): number {
  return e.devDays * devRate + e.testDays * testRate;
}

/**
 * One option's cost over the observation period, or a refusal.
 *
 * Nothing is rounded here. ADR/CR-16: *"Rundung erst bei der Darstellung"* —
 * rounding inside the model is how the demonstration forecast once turned a
 * small project's modernised side into zero days and its overhead reduction
 * into 100 %.
 */
export function optionCost(a: CostAssumptions, option: CostOption): OptionCost {
  const coverage = optionCoverage(a, option);
  const base: OptionCost = {
    optionId: option.id,
    label: option.label,
    kind: option.kind,
    coverage,
    oneOff: null,
    runningTotal: null,
    baselineTotal: null,
    total: null,
    releasesInHorizon: null,
  };
  if (coverage.state === 'rejected') return base;

  // Non-null by the coverage gate above; narrowed for the type checker.
  const devRate = a.devDayRate as number;
  const testRate = a.testDayRate as number;
  const years = a.horizonYears as number;
  const perYear = (a.releaseCadence as ReleaseCadence).perYear;
  const oneOffRange = option.oneOff as EffortRange;
  const perRelease = option.perRelease as EffortDays;

  const releases = perYear * years;
  const oneOff: AmountRange = {
    low: price(oneOffRange.low, devRate, testRate),
    high: price(oneOffRange.high, devRate, testRate),
  };
  const runningTotal = price(perRelease, devRate, testRate) * releases;
  const baselineTotal = option.maintenanceBaselinePerYear
    ? price(option.maintenanceBaselinePerYear, devRate, testRate) * years
    : 0;
  const total: AmountRange = {
    low: oneOff.low + runningTotal + baselineTotal,
    high: oneOff.high + runningTotal + baselineTotal,
  };

  // The backstop `lib/tco-model.ts` learned the hard way: a chart is the one
  // place a non-finite number renders without complaining.
  if (![oneOff.low, oneOff.high, runningTotal, baselineTotal, total.low, total.high].every(Number.isFinite)) {
    return base;
  }

  return { ...base, oneOff, runningTotal, baselineTotal, total, releasesInHorizon: releases };
}

/* ---------- the comparison, and when it refuses to name a winner ---------- */

export const WINNER_REFUSAL_CODES = [
  /** The shared assumptions do not carry an amount at all. */
  'assumptions-incomplete',
  /** At least one option is missing a mandatory field. */
  'option-incomplete',
  /** Fewer than two options carry a cost. */
  'too-few-options',
  /** The cheapest option's upper bound is not below the next option's lower bound. */
  'ranges-overlap',
] as const;
export type WinnerRefusalCode = (typeof WINNER_REFUSAL_CODES)[number];

export interface WinnerRefusal {
  code: WinnerRefusalCode;
  sentence: string;
}

export interface SensitivityProbe {
  /** The assumption that was varied. */
  field: 'devDayRate' | 'testDayRate' | 'releaseCadence' | 'horizonYears';
  label: string;
  /** The factor applied downwards and upwards. */
  factor: number;
  /** The cheapest option at the lower and the upper variation, or `null` where there is none. */
  cheapestLow: string | null;
  cheapestHigh: string | null;
  /** True when varying this one assumption alone moves the cheapest option. */
  changesWinner: boolean;
  sentence: string;
}

export interface CostComparison {
  /** The one revision every amount below comes from. */
  revision: string;
  coverage: CostCoverage;
  currency: string;
  costs: OptionCost[];
  /** The option id, or `null` — and then `refusal` says why. */
  winner: string | null;
  refusal: WinnerRefusal | null;
  /** Empty whenever there is no winner to be sensitive about. */
  sensitivity: SensitivityProbe[];
  /** Why the sensitivity list is empty, or `''` when it is not. */
  sensitivitySentence: string;
}

const REFUSAL_SENTENCES: Record<WinnerRefusalCode, (detail: string) => string> = {
  'assumptions-incomplete': (d) => `No option is priced, so none can be cheapest. ${d}`,
  'option-incomplete': (d) =>
    `No cheapest option while one is incomplete: ${d} A comparison that leaves an option out compares what is left, and reads as though it compared everything.`,
  'too-few-options': () =>
    'One option on its own is not a comparison. There is nothing for it to be cheaper than.',
  'ranges-overlap': (d) =>
    `The two lowest options overlap: ${d} The difference is inside the range of the one-off effort, so which is cheaper is not established.`,
};

/** The cheapest option id under one set of assumptions, or `null` when none is established. */
function cheapest(a: CostAssumptions): string | null {
  const priced = (a.options || []).map((o) => optionCost(a, o)).filter((c) => c.total !== null);
  if (priced.length < 2) return null;
  const sorted = [...priced].sort((x, y) => (x.total as AmountRange).low - (y.total as AmountRange).low);
  const first = sorted[0].total as AmountRange;
  const second = sorted[1].total as AmountRange;
  return first.high < second.low ? sorted[0].optionId : null;
}

const money = (v: number, currency: string): string =>
  `${currency} ${Math.round(v).toLocaleString('en-GB')}`;

const PROBES: ReadonlyArray<{
  field: SensitivityProbe['field'];
  label: string;
  apply: (a: CostAssumptions, factor: number) => CostAssumptions;
}> = [
  {
    field: 'devDayRate',
    label: 'development day rate',
    apply: (a, f) => ({ ...a, devDayRate: (a.devDayRate as number) * f }),
  },
  {
    field: 'testDayRate',
    label: 'test / key-user day rate',
    apply: (a, f) => ({ ...a, testDayRate: (a.testDayRate as number) * f }),
  },
  {
    field: 'releaseCadence',
    label: 'release cadence',
    apply: (a, f) => ({
      ...a,
      releaseCadence: { ...(a.releaseCadence as ReleaseCadence), perYear: (a.releaseCadence as ReleaseCadence).perYear * f },
    }),
  },
  {
    field: 'horizonYears',
    label: 'observation period',
    apply: (a, f) => ({ ...a, horizonYears: (a.horizonYears as number) * f }),
  },
];

/** How far each assumption is varied when asking whether it decides the answer. */
export const SENSITIVITY_FACTOR = 0.25;

/**
 * Which assumption decides the comparison.
 *
 * One assumption at a time, down and up by `SENSITIVITY_FACTOR`, asking only
 * whether the cheapest option is still the same one. Not a confidence interval
 * and not a probability — there is no distribution behind any of these figures
 * to draw one from. It answers a question a reader can act on: *if this rate
 * were a quarter off, would the answer change?*
 */
export function assumptionSensitivity(a: CostAssumptions, baseWinner: string | null): SensitivityProbe[] {
  if (!baseWinner) return [];
  const f = SENSITIVITY_FACTOR;
  return PROBES.map((probe) => {
    const low = cheapest(probe.apply(a, 1 - f));
    const high = cheapest(probe.apply(a, 1 + f));
    const changes = low !== baseWinner || high !== baseWinner;
    const pct = Math.round(f * 100);
    const name = (id: string | null) =>
      id === null
        ? 'no established cheapest option'
        : `"${(a.options.find((o) => o.id === id)?.label) || id}"`;
    return {
      field: probe.field,
      label: probe.label,
      factor: f,
      cheapestLow: low,
      cheapestHigh: high,
      changesWinner: changes,
      sentence: changes
        ? `A ${pct} % change in the ${probe.label} decides the comparison: down it is ${name(low)}, up it is ${name(high)}.`
        : `A ${pct} % change in the ${probe.label} either way leaves the same option cheapest.`,
    };
  });
}

/**
 * The comparison: every option's cost out of one revision of the assumptions,
 * and a cheapest option only when there is one to name.
 */
export function costComparison(a: CostAssumptions): CostComparison {
  const coverage = costAssumptionsCoverage(a);
  const costs = (a.options || []).map((o) => optionCost(a, o));
  const revision = costAssumptionsRevision(a);
  const currency = a.currency || '';

  const shell = (winner: string | null, refusal: WinnerRefusal | null, sensitivity: SensitivityProbe[], why: string): CostComparison => ({
    revision,
    coverage,
    currency,
    costs,
    winner,
    refusal,
    sensitivity,
    sensitivitySentence: why,
  });

  const NO_WINNER_NO_SENSITIVITY = 'The assumptions are only varied once there is an answer to vary. There is none.';

  if (coverage.state === 'rejected') {
    const incomplete = costs.filter((c) => c.coverage.state === 'rejected');
    if (incomplete.length > 0) {
      return shell(
        null,
        {
          code: 'option-incomplete',
          sentence: REFUSAL_SENTENCES['option-incomplete'](
            incomplete.map((c) => c.coverage.sentence).join(' '),
          ),
        },
        [],
        NO_WINNER_NO_SENSITIVITY,
      );
    }
    return shell(
      null,
      { code: 'assumptions-incomplete', sentence: REFUSAL_SENTENCES['assumptions-incomplete'](coverage.sentence) },
      [],
      NO_WINNER_NO_SENSITIVITY,
    );
  }

  const priced = costs.filter((c) => c.total !== null);
  if (priced.length < 2) {
    return shell(null, { code: 'too-few-options', sentence: REFUSAL_SENTENCES['too-few-options']('') }, [], NO_WINNER_NO_SENSITIVITY);
  }

  const sorted = [...priced].sort((x, y) => (x.total as AmountRange).low - (y.total as AmountRange).low);
  const first = sorted[0];
  const second = sorted[1];
  const fr = first.total as AmountRange;
  const sr = second.total as AmountRange;
  if (!(fr.high < sr.low)) {
    return shell(
      null,
      {
        code: 'ranges-overlap',
        sentence: REFUSAL_SENTENCES['ranges-overlap'](
          `"${first.label}" costs ${money(fr.low, currency)}–${money(fr.high, currency)}, "${second.label}" ${money(sr.low, currency)}–${money(sr.high, currency)}.`,
        ),
      },
      [],
      'A comparison with no established cheapest option has no assumption to test for it.',
    );
  }

  const winner = first.optionId;
  return shell(winner, null, assumptionSensitivity(a, winner), '');
}

/* ---------- display ---------- */

/**
 * An amount, rounded here and nowhere earlier (CR-16), or the statement that
 * there is none. Never a zero standing in for an absent figure.
 */
export function formatAmount(value: number | null | undefined, currency: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not determined';
  if (!currency) return 'Not determined';
  return money(value, currency);
}

/** A cost range, or the statement that there is none. */
export function formatAmountRange(range: AmountRange | null | undefined, currency: string): string {
  if (!range || !currency) return 'Not determined';
  return `${formatAmount(range.low, currency)} – ${formatAmount(range.high, currency)}`;
}
