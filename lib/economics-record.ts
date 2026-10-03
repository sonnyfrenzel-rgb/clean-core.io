/**
 * The Economics figures as a stored record — what the reader entered on the
 * Economics stage, kept with the project so that leaving the stage, or the
 * page, does not throw it away (owner report 03.10.2026: "4 of 4 done, but no
 * green check; and if you go to another tool and back to Economics, the
 * values are gone").
 *
 * Three things live here, and nothing else:
 *
 *   1. **The payload and its strict check.** `validateEconomicsPayload` is the
 *      one gate a figure passes before it is stored — the route runs it on the
 *      server, the page runs it before it sends, so a figure the server would
 *      refuse is said to be refused without a round trip. Types, bounds, the
 *      currency's form, no NaN or Infinity, no unknown key, a bounded size.
 *   2. **The wire form.** The page keeps a half-entered effort pair as NaN
 *      (`components/tco/OptionComparison.tsx`); JSON has no NaN, so an absent
 *      half travels and is stored as `null` and comes back as NaN
 *      (`restoreAssumptions`). Coverage, canonical form and fingerprint treat
 *      both the same, so the revision of a restored record is the revision
 *      that was stored.
 *   3. **How far the four steps are** (`economicsProgress`) — the stage's own
 *      step logic, moved here so that the stage, the phase contract
 *      (`lib/workflow-steps.ts`) and the tool's check cannot disagree about
 *      whether "4 of 4" is done.
 *
 * What it is not: evidence. A scenario on the reader's own figures is never
 * part of a signed run, a signature or an audit pack (ADR-022, ADR-035). The
 * route stores it at `projects/{id}/cost_assumptions/current` through the
 * Admin SDK; `firestore.rules` has no match for that path, so no client reads
 * or writes it directly.
 *
 * Pure: no React, no Firestore, no `node:crypto`.
 */

import {
  COST_ASSUMPTIONS_VERSION,
  EFFORT_SOURCES,
  OPTION_KINDS,
  costAssumptionsRevision,
  optionCost,
  type CostAssumptions,
  type CostOption,
  type EffortDays,
  type EffortRange,
  type ReleaseCadence,
  type Stated,
} from './cost-assumptions';
import { comparisonChecklist, forecastChecklist, type ChecklistRow } from './economics-checklist';
import { tcoForecast, TCO_TARGET_SCORE, type TcoForecast } from './tco-model';

/** Format of the stored record. Bumped only when its shape changes. */
export const ECONOMICS_RECORD_FORMAT = 1;

/** Where the route stores it, under `projects/{projectId}`. */
export const ECONOMICS_COLLECTION = 'cost_assumptions';
export const ECONOMICS_DOC = 'current';

/**
 * The bounds a stored figure must keep. Generous on purpose — a figure the
 * reader means is never refused for being large — and finite on purpose: a
 * figure beyond these is a typing accident, and storing it would put it into
 * every view that reads the record.
 */
export const ECONOMICS_LIMITS = Object.freeze({
  /** The whole request body, in characters. */
  maxBodyChars: 32_000,
  maxOptions: 10,
  maxLabel: 80,
  maxReason: 500,
  /** A day rate, in the reader's currency. */
  maxRate: 10_000_000,
  /** Days of effort in one field. */
  maxDays: 1_000_000,
  maxHorizonYears: 100,
  maxReleasesPerYear: 365,
  maxReleasesDeferred: 1_000,
  /** The one-time modernisation budget. */
  maxBudget: 1_000_000_000_000,
  /** "Model a different size", in lines. */
  maxLoc: 10_000_000,
  /** The two forecast cadences, as the stage's sliders offer them. */
  maxUpgradesPerYear: 3,
  maxFeaturePacksPerYear: 4,
});

/** The forecast's own inputs — the ones the option comparison does not ask for. */
export interface EconomicsInputs {
  /** "Model a different size": `null` while it is the line count of the source. */
  loc: number | null;
  upgradesPerYear: number;
  /** Whether the reader moved it off its assumed start value. */
  upgradesStated: boolean;
  featurePacksPerYear: number;
  featurePacksStated: boolean;
  /** The one-time modernisation budget, or `null` when nobody entered one. */
  oneTimeBudget: number | null;
}

/** The start values the stage shows before anything is entered — assumed, and said to be. */
export const ECONOMICS_START_INPUTS: Readonly<EconomicsInputs> = Object.freeze({
  loc: null,
  upgradesPerYear: 1,
  upgradesStated: false,
  featurePacksPerYear: 2,
  featurePacksStated: false,
  oneTimeBudget: null,
});

export interface EconomicsPayload {
  assumptions: CostAssumptions;
  inputs: EconomicsInputs;
}

/** What the route stores and answers with. */
export interface EconomicsRecord extends EconomicsPayload {
  formatVersion: typeof ECONOMICS_RECORD_FORMAT;
  /** `costAssumptionsRevision()` of the stored assumptions, computed by the server. */
  revision: string;
  /**
   * The signed run the figures were stored against, read by the server from
   * the project — never sent by the browser. When the run's score moves away
   * from `score`, the figures were priced for another reading of the code and
   * the phase says so (`lib/workflow-steps.ts`).
   */
  basis: { runId: string | null; score: number | null };
  /** ISO time of the last save. */
  savedAt: string;
}

/* ------------------------------------------------------------ validation */

export type EconomicsValidation =
  | { ok: true; value: EconomicsPayload }
  | { ok: false; field: string; error: string };

class Refusal extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function only(v: unknown, field: string, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!isObject(v)) throw new Refusal(field, `${field} is not an object.`);
  for (const k of Object.keys(v)) {
    if (!keys.includes(k) && !optional.includes(k)) throw new Refusal(`${field}.${k}`, `${field} has a field it does not know: ${k}.`);
  }
  for (const k of keys) {
    if (!(k in v)) throw new Refusal(`${field}.${k}`, `${field}.${k} is missing.`);
  }
  return v;
}

/** The words a refusal uses for a field, so the stage can show it as it comes. */
const FIELD_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/^devDayRate$/, 'the developer day rate'],
  [/^testDayRate$/, 'the key-user day rate'],
  [/^horizonYears$/, 'the time horizon'],
  [/^releaseCadence/, 'releases per year'],
  [/^inputs\.oneTimeBudget$/, 'the one-time modernisation budget'],
  [/^inputs\.loc$/, 'the lines of custom code'],
  [/^inputs\.upgradesPerYear$/, 'release upgrades per year'],
  [/^inputs\.featurePacksPerYear$/, 'feature pack updates per year'],
  [/upgradeDelay/, 'the upgrade deferral'],
  [/^options\[\d+\]\.oneOff/, 'a one-off effort'],
  [/^options\[\d+\]\.perRelease/, 'an effort per release'],
  [/^options\[\d+\]\.maintenanceBaselinePerYear/, 'a maintenance baseline'],
];

export function fieldWords(field: string): string {
  return FIELD_WORDS.find(([re]) => re.test(field))?.[1] ?? field;
}

const plainNumber = (v: number) => v.toLocaleString('en-GB');

/** A finite figure inside its bounds, or `null` where `nullable`. NaN and Infinity never pass. */
function figure(v: unknown, field: string, max: number, opts: { nullable?: boolean; integer?: boolean; min?: number } = {}): number | null {
  if (v === null && opts.nullable) return null;
  const name = fieldWords(field);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Refusal(field, `${name} is not a finite figure.`);
  const min = opts.min ?? 0;
  if (v < min || v > max) {
    throw new Refusal(field, `${name} must lie between ${plainNumber(min)} and ${plainNumber(max)}.`);
  }
  if (opts.integer && !Number.isInteger(v)) throw new Refusal(field, `${name} must be a whole number.`);
  return v;
}

const CONTROL = /[\u0000-\u001f\u007f]/;

function text(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string') throw new Refusal(field, `${field} is not text.`);
  if (v.length > max) throw new Refusal(field, `${field} is longer than ${max} characters.`);
  if (CONTROL.test(v)) throw new Refusal(field, `${field} contains a control character.`);
  return v;
}

/**
 * A currency as the reader wrote it: empty (nobody stated one — there is no
 * default), or up to eight letters and currency signs, "EUR", "CHF", "€".
 */
export const CURRENCY_FORM = /^[\p{L}\p{Sc}.]{1,8}$/u;

function currency(v: unknown): string {
  const c = text(v, 'currency', 8);
  if (c !== '' && !CURRENCY_FORM.test(c)) throw new Refusal('currency', 'currency is not a currency code or sign.');
  return c;
}

function days(v: unknown, field: string): EffortDays | null {
  if (v === null) return null;
  const o = only(v, field, ['devDays', 'testDays']);
  const devDays = figure(o.devDays, `${field}.devDays`, ECONOMICS_LIMITS.maxDays, { nullable: true });
  const testDays = figure(o.testDays, `${field}.testDays`, ECONOMICS_LIMITS.maxDays, { nullable: true });
  // An absent half is stored as null; both absent is no figure at all.
  if (devDays === null && testDays === null) return null;
  return { devDays, testDays } as unknown as EffortDays;
}

function range(v: unknown, field: string): EffortRange | null {
  if (v === null) return null;
  const o = only(v, field, ['low', 'high']);
  const half = (x: unknown, f: string) =>
    x === null ? ({ devDays: null, testDays: null } as unknown as EffortDays) : days(x, f) ?? ({ devDays: null, testDays: null } as unknown as EffortDays);
  const low = half(o.low, `${field}.low`);
  const high = half(o.high, `${field}.high`);
  const all = [low.devDays, low.testDays, high.devDays, high.testDays] as unknown[];
  if (all.every((d) => d === null)) return null;
  return { low, high };
}

function upgradeDelay(v: unknown, field: string): Stated<{ releasesDeferred: number }> | null {
  if (v === null) return null;
  if (!isObject(v)) throw new Refusal(field, `${field} is not an object.`);
  if (v.state === 'stated') {
    const o = only(v, field, ['state', 'value']);
    const value = only(o.value, `${field}.value`, ['releasesDeferred']);
    return {
      state: 'stated',
      value: { releasesDeferred: figure(value.releasesDeferred, `${field}.value.releasesDeferred`, ECONOMICS_LIMITS.maxReleasesDeferred) as number },
    };
  }
  if (v.state === 'not-determined') {
    const o = only(v, field, ['state', 'reason']);
    return { state: 'not-determined', reason: text(o.reason, `${field}.reason`, ECONOMICS_LIMITS.maxReason) };
  }
  throw new Refusal(`${field}.state`, `${field}.state is neither "stated" nor "not-determined".`);
}

const OPTION_ID = /^[a-z0-9-]{1,40}$/;

function option(v: unknown, i: number): CostOption {
  const field = `options[${i}]`;
  const o = only(
    v,
    field,
    ['id', 'kind', 'label', 'oneOff', 'perRelease', 'maintenanceBaselinePerYear', 'upgradeDelay', 'effortSource'],
    ['baselineSource'],
  );
  if (typeof o.id !== 'string' || !OPTION_ID.test(o.id)) throw new Refusal(`${field}.id`, `${field}.id is not an option id.`);
  if (!(OPTION_KINDS as readonly unknown[]).includes(o.kind)) throw new Refusal(`${field}.kind`, `${field}.kind is not an option kind.`);
  if (!(EFFORT_SOURCES as readonly unknown[]).includes(o.effortSource)) {
    throw new Refusal(`${field}.effortSource`, `${field}.effortSource is not an effort source.`);
  }
  const out: CostOption = {
    id: o.id,
    kind: o.kind as CostOption['kind'],
    label: text(o.label, `${field}.label`, ECONOMICS_LIMITS.maxLabel),
    oneOff: range(o.oneOff, `${field}.oneOff`),
    perRelease: days(o.perRelease, `${field}.perRelease`),
    maintenanceBaselinePerYear: days(o.maintenanceBaselinePerYear, `${field}.maintenanceBaselinePerYear`),
    upgradeDelay: upgradeDelay(o.upgradeDelay, `${field}.upgradeDelay`),
    effortSource: o.effortSource as CostOption['effortSource'],
  };
  if ('baselineSource' in o && o.baselineSource !== undefined) {
    if (o.baselineSource !== 'stated' && o.baselineSource !== 'proposal-confirmed') {
      throw new Refusal(`${field}.baselineSource`, `${field}.baselineSource is not a baseline source.`);
    }
    out.baselineSource = o.baselineSource;
  }
  return out;
}

function cadence(v: unknown): ReleaseCadence | null {
  if (v === null) return null;
  const o = only(v, 'releaseCadence', ['perYear', 'confirmed']);
  if (typeof o.confirmed !== 'boolean') throw new Refusal('releaseCadence.confirmed', 'releaseCadence.confirmed is not true or false.');
  return { perYear: figure(o.perYear, 'releaseCadence.perYear', ECONOMICS_LIMITS.maxReleasesPerYear) as number, confirmed: o.confirmed };
}

function assumptions(v: unknown): CostAssumptions {
  const o = only(v, 'assumptions', ['version', 'currency', 'devDayRate', 'testDayRate', 'horizonYears', 'releaseCadence', 'options']);
  if (o.version !== COST_ASSUMPTIONS_VERSION) throw new Refusal('assumptions.version', 'assumptions.version is not the current format.');
  if (!Array.isArray(o.options)) throw new Refusal('options', 'options is not a list.');
  if (o.options.length > ECONOMICS_LIMITS.maxOptions) throw new Refusal('options', `more than ${ECONOMICS_LIMITS.maxOptions} options.`);
  const options = o.options.map(option);
  if (new Set(options.map((x) => x.id)).size !== options.length) throw new Refusal('options', 'two options share an id.');
  return {
    version: COST_ASSUMPTIONS_VERSION,
    currency: currency(o.currency),
    devDayRate: figure(o.devDayRate, 'devDayRate', ECONOMICS_LIMITS.maxRate, { nullable: true }),
    testDayRate: figure(o.testDayRate, 'testDayRate', ECONOMICS_LIMITS.maxRate, { nullable: true }),
    horizonYears: figure(o.horizonYears, 'horizonYears', ECONOMICS_LIMITS.maxHorizonYears, { nullable: true }),
    releaseCadence: cadence(o.releaseCadence),
    options,
  };
}

function inputs(v: unknown): EconomicsInputs {
  const o = only(v, 'inputs', ['loc', 'upgradesPerYear', 'upgradesStated', 'featurePacksPerYear', 'featurePacksStated', 'oneTimeBudget']);
  if (typeof o.upgradesStated !== 'boolean') throw new Refusal('inputs.upgradesStated', 'inputs.upgradesStated is not true or false.');
  if (typeof o.featurePacksStated !== 'boolean') {
    throw new Refusal('inputs.featurePacksStated', 'inputs.featurePacksStated is not true or false.');
  }
  return {
    loc: figure(o.loc, 'inputs.loc', ECONOMICS_LIMITS.maxLoc, { nullable: true, integer: true, min: 1 }),
    upgradesPerYear: figure(o.upgradesPerYear, 'inputs.upgradesPerYear', ECONOMICS_LIMITS.maxUpgradesPerYear, { integer: true }) as number,
    upgradesStated: o.upgradesStated,
    featurePacksPerYear: figure(o.featurePacksPerYear, 'inputs.featurePacksPerYear', ECONOMICS_LIMITS.maxFeaturePacksPerYear, {
      integer: true,
    }) as number,
    featurePacksStated: o.featurePacksStated,
    oneTimeBudget: figure(o.oneTimeBudget, 'inputs.oneTimeBudget', ECONOMICS_LIMITS.maxBudget, { nullable: true }),
  };
}

/**
 * The one check every stored figure passes. Returns the payload as it will be
 * stored — an absent effort half as `null`, a pair with both halves absent as
 * no figure — or the first field it refuses, with a sentence.
 */
export function validateEconomicsPayload(body: unknown): EconomicsValidation {
  try {
    const o = only(body, 'body', ['assumptions', 'inputs']);
    return { ok: true, value: { assumptions: assumptions(o.assumptions), inputs: inputs(o.inputs) } };
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, field: err.field, error: err.message };
    throw err;
  }
}

/* ------------------------------------------------------------- wire form */

/**
 * The payload as it is sent and compared: JSON, with an absent effort half as
 * `null` (JSON has no NaN). Two payloads with the same figures serialise the
 * same, which is what the page compares to decide whether there is anything
 * to save.
 */
export function serializeEconomics(payload: EconomicsPayload): string {
  return JSON.stringify(payload, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v));
}

const back = (d: unknown): number => (typeof d === 'number' && Number.isFinite(d) ? d : NaN);
const backDays = (e: EffortDays | null): EffortDays | null => (e ? { devDays: back(e.devDays), testDays: back(e.testDays) } : null);

/** The stored assumptions as the page holds them: an absent effort half is NaN again. */
export function restoreAssumptions(a: CostAssumptions): CostAssumptions {
  return {
    ...a,
    options: a.options.map((o) => ({
      ...o,
      oneOff: o.oneOff ? { low: backDays(o.oneOff.low)!, high: backDays(o.oneOff.high)! } : null,
      perRelease: backDays(o.perRelease),
      maintenanceBaselinePerYear: backDays(o.maintenanceBaselinePerYear),
    })),
  };
}

/** A record as the route answers it, checked — `null` for anything else. */
export function readEconomicsRecord(v: unknown): EconomicsRecord | null {
  if (!isObject(v) || v.formatVersion !== ECONOMICS_RECORD_FORMAT) return null;
  const checked = validateEconomicsPayload({ assumptions: v.assumptions, inputs: v.inputs });
  if (!checked.ok) return null;
  const basis = isObject(v.basis) ? v.basis : {};
  return {
    formatVersion: ECONOMICS_RECORD_FORMAT,
    ...checked.value,
    revision: typeof v.revision === 'string' ? v.revision : costAssumptionsRevision(checked.value.assumptions),
    basis: {
      runId: typeof basis.runId === 'string' ? basis.runId : null,
      score: typeof basis.score === 'number' && Number.isFinite(basis.score) ? basis.score : null,
    },
    savedAt: typeof v.savedAt === 'string' ? v.savedAt : '',
  };
}

/* ---------------------------------------------------------- the four steps */

export interface EconomicsProgressInput {
  /** The comparison's assumptions, the shared figures folded in. */
  assumptions: CostAssumptions;
  /** The lines the forecast models. */
  loc: number;
  /** The lines of the source on the project, or `null` when there is none. */
  sourceLoc: number | null;
  upgradesPerYear: number;
  upgradesStated: boolean;
  featurePacksPerYear: number;
  featurePacksStated: boolean;
  oneTimeBudget: number | null;
  /** The Clean Core Score of the signed run, or `null`. */
  score: number | null;
  /** The source changed after the signed run. */
  sourceChanged: boolean;
}

export interface EconomicsProgress {
  /** Step 1 — the lines and score of the signed run are there. */
  codebase: boolean;
  /** Step 2 — currency, both day rates, the horizon and a confirmed cadence. */
  rates: boolean;
  /** Step 3 — every option has its effort, its baseline and, for Do nothing, its deferral. */
  effort: boolean;
  /** Steps 2 and 3: every option is priced from the reader's figures. */
  compared: boolean;
  /** Whether a savings forecast can be made for this code at all. */
  forecastPossible: boolean;
  /** Whether the forecast is shown — possible, and every input it needs is there. */
  forecastShown: boolean;
  /** Step 4 — compared, and the forecast shown wherever one is possible. */
  result: boolean;
  /** How many of the four steps are done. */
  doneCount: number;
  /** All four. */
  complete: boolean;
  comparisonRows: ChecklistRow[];
  forecastRows: ChecklistRow[];
  calculations: TcoForecast | null;
}

/** Whether every listed row is done; a row the checklist does not carry does not hold a step back. */
function rowsDone(rows: ReadonlyArray<ChecklistRow>, keys: ReadonlyArray<ChecklistRow['key']>): boolean {
  return keys.every((k) => {
    const r = rows.find((x) => x.key === k);
    return !r || r.status === 'done';
  });
}

export const RATE_ROWS: ReadonlyArray<ChecklistRow['key']> = ['currency', 'dev-rate', 'test-rate', 'horizon', 'cadence'];
export const EFFORT_ROWS: ReadonlyArray<ChecklistRow['key']> = ['one-off', 'per-release', 'baseline', 'upgrade-delay'];

/**
 * The stage's four steps, decided once. The Economics page draws them, the
 * phase contract reads them from the stored record, and so "4 of 4" on the
 * stage and *done* on the tool are one statement.
 */
export function economicsProgress(input: EconomicsProgressInput): EconomicsProgress {
  const a = input.assumptions;
  const forecastPossible = !(input.score === null || input.score >= TCO_TARGET_SCORE || input.sourceChanged);
  const calculations = tcoForecast({
    loc: input.loc,
    devRate: a.devDayRate,
    userRate: a.testDayRate,
    upgradeFreq: input.upgradesPerYear,
    fpFreq: input.featurePacksPerYear,
    oneTimeCost: input.oneTimeBudget,
    scoreBefore: input.score,
  });
  const comparisonRows = comparisonChecklist(a);
  const forecastRows = forecastPossible
    ? forecastChecklist({
        loc: input.loc,
        sourceLoc: input.sourceLoc,
        oneTimeCost: input.oneTimeBudget,
        upgradesStated: input.upgradesStated,
        featurePacksStated: input.featurePacksStated,
      })
    : [];
  const all = [...comparisonRows, ...forecastRows];
  const codebase = input.sourceLoc !== null;
  const rates = rowsDone(all, RATE_ROWS);
  const effort = rowsDone(all, EFFORT_ROWS);
  const compared = rates && effort;
  const forecastShown = forecastPossible && calculations !== null && Boolean(a.currency);
  const result = compared && !(forecastPossible && !forecastShown);
  const steps = [codebase, rates, effort, result];
  const doneCount = steps.filter(Boolean).length;
  return {
    codebase,
    rates,
    effort,
    compared,
    forecastPossible,
    forecastShown,
    result,
    doneCount,
    complete: doneCount === steps.length,
    comparisonRows,
    forecastRows,
    calculations,
  };
}

/** The progress of a stored record, for a project whose source has `sourceLoc` lines. */
export function recordProgress(
  record: EconomicsRecord,
  context: { sourceLoc: number | null; score: number | null; sourceChanged: boolean },
): EconomicsProgress {
  const loc = record.inputs.loc ?? context.sourceLoc ?? 0;
  return economicsProgress({
    assumptions: restoreAssumptions(record.assumptions),
    loc,
    sourceLoc: context.sourceLoc,
    upgradesPerYear: record.inputs.upgradesPerYear,
    upgradesStated: record.inputs.upgradesStated,
    featurePacksPerYear: record.inputs.featurePacksPerYear,
    featurePacksStated: record.inputs.featurePacksStated,
    oneTimeBudget: record.inputs.oneTimeBudget,
    score: context.score,
    sourceChanged: context.sourceChanged,
  });
}

/** How many options a stored record prices, and of how many — for the views that may not show an amount. */
export function pricedOptions(record: EconomicsRecord): { priced: number; total: number } {
  const a = restoreAssumptions(record.assumptions);
  return { priced: a.options.filter((o) => optionCost(a, o).total !== null).length, total: a.options.length };
}
