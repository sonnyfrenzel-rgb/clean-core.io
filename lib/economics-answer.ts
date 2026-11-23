/**
 * Economics answers first (ADR-128 (1), mock-up `docs/roadmap/economics-next-mockup.html`): what keeping costs, the
 * cheapest change that keeps what the program does, the lowest overall, each with its condition — and *How firm is
 * the answer?* in plain words. Everything here is read from the one money model (`lib/cost-assumptions.ts`); nothing
 * is priced here that the comparison does not price, and no cheapest option is named where it refuses one.
 *
 * Words for a business reader: plain sentences, amounts rounded outward to two significant figures where the eye lands
 * (`formatMoneyRangeOutward`, ADR-128 (4)); whole units stay in the table.
 *
 * Pure: no React, no Firestore.
 */
import {
  COMPARISON_KIND,
  KEEPS_FUNCTION_KINDS,
  cheapestAmong,
  type AmountRange,
  type CostAssumptions,
  type CostComparison,
  type CostOption,
  type OptionCost,
  type OptionKind,
  type TippingField,
  type TippingPoint,
} from './cost-assumptions';
import { formatMoney, formatMoneyRangeOutward, formatNumber, roundSignificant } from './format';

/** Where the page stands: nothing stated yet, figures still missing, or every option priced. */
export type EconomicsAnswerState = 'first-visit' | 'needs-figures' | 'priced';

/** What an option means, and the condition it rests on — one wording for the answer, the chart and the table. */
export const OPTION_CONDITION: Readonly<Partial<Record<OptionKind, string>>> = Object.freeze({
  standard: 'if the standard covers it, which is not measured',
  retire: 'if nobody still needs it',
});

/** "Rebuilding it", "Moving it to SAP standard" — the subject of an answer sentence. */
const DOING: Readonly<Record<OptionKind, string>> = Object.freeze({
  'do-nothing': 'Keeping it',
  keep: 'Keeping it',
  rebuild: 'Rebuilding it',
  standard: 'Moving it to SAP standard',
  retire: 'Retiring it',
  keyuser: 'Rebuilding it with key-user tools',
});

export interface EconomicsAnswer {
  state: EconomicsAnswerState;
  /** The shared figures still missing, in words: "the currency", "a developer day rate". */
  missing: string[];
  /** Options a proposal from the code size waits on — "your go on the proposed effort". */
  pending: number;
  /** The comparison over every option — "lowest overall". */
  all: CostComparison;
  /** The comparison over the options that keep what the program does (ADR-128 (1), mock-up E3). */
  keeps: CostComparison;
  /** Keep's cost — the reference every other option is read against. */
  keep: OptionCost | null;
  currency: string;
  years: number | null;
}

/**
 * The shared figures still missing, in words. A cadence nobody confirmed counts as missing (ADR-035: "only when
 * confirmed").
 */
export function sharedMissing(a: CostAssumptions): string[] {
  const out: string[] = [];
  if (!a.currency) out.push('the currency');
  if (a.devDayRate === null || !Number.isFinite(a.devDayRate)) out.push('a developer day rate');
  if (a.testDayRate === null || !Number.isFinite(a.testDayRate)) out.push('a key-user day rate');
  if (a.horizonYears === null || !Number.isFinite(a.horizonYears)) out.push('the years to compare over');
  if (!a.releaseCadence) out.push('your release cadence');
  else if (!a.releaseCadence.confirmed) out.push('a confirmed release cadence');
  return out;
}

/** The answer of the page, from the comparison it already made and the proposals still waiting. */
export function economicsAnswer(a: CostAssumptions, all: CostComparison, pending: number): EconomicsAnswer {
  const missing = sharedMissing(a);
  const keeps = cheapestAmong(a, KEEPS_FUNCTION_KINDS);
  const keepOption = (a.options || []).find((o) => o.kind === COMPARISON_KIND) ?? null;
  const keep = keepOption ? all.costs.find((c) => c.optionId === keepOption.id) ?? null : null;
  const priced = all.costs.length > 0 && all.costs.every((c) => c.total !== null);
  const state: EconomicsAnswerState = priced
    ? 'priced'
    : missing.length >= 5 && !(a.options || []).some((o) => o.oneOff || o.perRelease)
      ? 'first-visit'
      : 'needs-figures';
  return { state, missing, pending, all, keeps, keep, currency: a.currency, years: a.horizonYears };
}

/** "5 years", "1 year", or "your period". */
export function yearsWords(years: number | null | undefined): string {
  if (typeof years !== 'number' || !Number.isFinite(years)) return 'your period';
  return `${formatNumber(years, { maximumFractionDigits: 1 })} year${years === 1 ? '' : 's'}`;
}

/** "a, b or c". */
function orWords(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** "a, b and c". */
export function listWords(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const costOf = (c: CostComparison, id: string | null | undefined) => (id ? c.costs.find((x) => x.optionId === id) ?? null : null);
const kindOf = (c: CostComparison, id: string | null | undefined): OptionKind | null => costOf(c, id)?.kind ?? null;

/** The two lowest options of a comparison that refused for an overlap, cheapest first. */
export function lowestTwo(c: CostComparison): [OptionCost, OptionCost] | null {
  const priced = c.costs.filter((x) => x.total !== null).sort((x, y) => (x.total as AmountRange).low - (y.total as AmountRange).low);
  return priced.length >= 2 ? [priced[0], priced[1]] : null;
}

/** "Rebuild (EUR 4,700–6,600) and Move to SAP standard (EUR 5,000–9,000) overlap". */
export function overlapWords(c: CostComparison, currency: string): string {
  const two = lowestTwo(c);
  if (!two) return 'not every option is priced';
  const [x, y] = two;
  return `${x.label} (${formatMoneyRangeOutward(x.total, currency)}) and ${y.label} (${formatMoneyRangeOutward(y.total, currency)}) overlap`;
}

/** The answer in one or two sentences — only for a priced page. */
export function answerSentence(ans: EconomicsAnswer): string {
  const cur = ans.currency;
  const years = yearsWords(ans.years);
  const parts: string[] = [];
  if (ans.keep?.total) parts.push(`Keeping it costs ${formatMoneyRangeOutward(ans.keep.total, cur)} over ${years}.`);
  const kw = ans.keeps.winner;
  const kwKind = kindOf(ans.keeps, kw);
  if (kw && kwKind) {
    if (kwKind === COMPARISON_KIND || kwKind === 'keep') parts.push('No change that keeps what it does costs less.');
    else {
      const c = costOf(ans.keeps, kw)!;
      const cond = OPTION_CONDITION[kwKind];
      parts.push(`${DOING[kwKind]} would cost ${formatMoneyRangeOutward(c.total, cur)}${cond ? `, ${cond}` : ''}.`);
    }
  } else if (ans.keeps.refusal?.code === 'ranges-overlap') {
    parts.push(`Of the changes that keep what it does, none is clearly cheaper: ${overlapWords(ans.keeps, cur)}.`);
  }
  const aw = ans.all.winner;
  const awKind = kindOf(ans.all, aw);
  if (aw && awKind === 'retire') {
    parts.push(`Retiring it costs least, ${formatMoneyRangeOutward(costOf(ans.all, aw)!.total, cur)}, ${OPTION_CONDITION.retire}.`);
  } else if (!aw && ans.all.refusal?.code === 'ranges-overlap') {
    const two = lowestTwo(ans.all);
    const retire = two?.find((x) => x.kind === 'retire');
    if (retire) {
      parts.push(
        `Retiring it, ${OPTION_CONDITION.retire}, may cost less or more than that: ${formatMoneyRangeOutward(retire.total, cur)}, the two ranges overlap.`,
      );
    }
  }
  return parts.join(' ');
}

/** The sentence for a page that is not priced yet. */
export function notPricedSentence(ans: EconomicsAnswer, lines: number | null): string {
  if (ans.state === 'first-visit') {
    return 'Not determined yet. The costs need five figures (the currency, two day rates, a period and your SAP release cadence) and the effort per option.';
  }
  const from = lines !== null ? ` proposed from the ${formatNumber(lines) ?? lines} lines` : '';
  const needs: string[] = [];
  if (ans.missing.length > 0) needs.push(`${listWords(ans.missing)} from you`);
  if (ans.pending > 0) needs.push(`your go on the effort${from}`);
  const incomplete = ans.all.costs.filter((c) => c.total === null).length;
  if (needs.length === 0 && incomplete > 0) needs.push(`the effort of ${incomplete === 1 ? 'one option' : `${incomplete} options`} under "Effort in days"`);
  return `Not determined yet. The costs need ${listWords(needs)}.`;
}

/* ---------------------------------------------------------------- the difference to keeping */

/**
 * An option's difference to keeping, as a range: `less` when it costs less than keeping wherever both ranges land,
 * `more` when it costs more, `about` when the ranges overlap. Amounts are positive.
 */
export interface DifferenceToKeeping {
  kind: 'less' | 'more' | 'about';
  low: number;
  high: number;
}

export function differenceToKeeping(keep: AmountRange, option: AmountRange): DifferenceToKeeping {
  const least = keep.low - option.high; // the smallest saving
  const most = keep.high - option.low; // the largest saving
  if (most <= 0) return { kind: 'more', low: -most, high: -least };
  if (least < 0) return { kind: 'about', low: least, high: most };
  return { kind: 'less', low: least, high: most };
}

/** Rounded outward, for the chart and the facets: "EUR 2,300–5,700 less than keeping". */
export function differenceWords(d: DifferenceToKeeping, currency: string): string {
  if (d.kind === 'about') return 'about as much as keeping';
  const r = formatMoneyRangeOutward({ low: d.low, high: d.high }, currency) ?? '';
  return `${r.replace(/^about /, '')} ${d.kind} than keeping`;
}

/** Whole units, for the table: "EUR 2,345 – 5,678 less", "EUR -1,200 – 3,400". */
export function differenceExact(d: DifferenceToKeeping, currency: string): string {
  const w = (v: number) => formatMoney(Math.round(v), currency) ?? '';
  const n = (v: number) => (formatMoney(Math.round(v), currency) ?? '').replace(`${currency} `, '');
  if (d.kind === 'about') return `${w(d.low)} – ${n(d.high)}`;
  return d.low === d.high ? `${w(d.low)} ${d.kind}` : `${w(d.low)} – ${n(d.high)} ${d.kind}`;
}

/* ---------------------------------------------------------------- how firm is the answer */

const FIELD_NAMES: Readonly<Record<TippingField, string>> = Object.freeze({
  devDayRate: 'Developer day',
  testDayRate: 'Key-user day',
  releaseCadence: 'SAP releases',
  horizonYears: 'Period compared',
});

const FAR_WORDS: Readonly<Record<TippingField, string>> = Object.freeze({
  releaseCadence: 'far fewer SAP releases',
  horizonYears: 'a far shorter period',
  devDayRate: 'a very different developer day rate',
  testDayRate: 'a very different key-user day rate',
});

export interface FirmnessRow {
  field: TippingField;
  /** "Developer day". */
  name: string;
  /** Your figure now: "EUR 1,000 a day", "2 a year", "5 years". */
  now: string;
  /** Whether any change of it can change the order. */
  edge: boolean;
  /** In plain words what it would take: "Under 1 release a year, Rebuild could cost as little as Retire." */
  words: string[];
}

export interface Firmness {
  /** One sentence above the table; `null` while nothing is priced. */
  summary: string | null;
  /** `firm`: no figure changes the order; `edge`: an extreme change could; `none`: no option is ahead. */
  tone: 'firm' | 'edge' | 'none';
  rows: FirmnessRow[];
  /** Every tipping point as the comparison computed it, for the detail: the lowest overall first. */
  exact: Array<{ leader: string; point: TippingPoint }>;
}

function valueOf(a: CostAssumptions, field: TippingField): number | null {
  if (field === 'devDayRate') return a.devDayRate;
  if (field === 'testDayRate') return a.testDayRate;
  if (field === 'horizonYears') return a.horizonYears;
  return a.releaseCadence?.perYear ?? null;
}

function figureAt(field: TippingField, v: number, currency: string): string {
  if (field === 'horizonYears') {
    if (v < 2) {
      const months = Math.max(1, Math.floor(v * 12));
      return `${months} month${months === 1 ? '' : 's'}`;
    }
    return `${formatNumber(v, { maximumFractionDigits: 1 })} years`;
  }
  if (field === 'releaseCadence') {
    if (v < 1 && Math.round(1 / v) >= 2) return `one release in ${Math.round(1 / v)} years`;
    return `${formatNumber(v, { maximumFractionDigits: 1 })} a year`;
  }
  return formatMoney(roundSignificant(v, 0), currency) ?? '';
}

function nowWords(a: CostAssumptions, field: TippingField): string {
  const v = valueOf(a, field);
  if (v === null) return 'Not stated';
  if (field === 'devDayRate' || field === 'testDayRate') return `${formatMoney(v, a.currency) ?? ''} a day`;
  if (field === 'releaseCadence') return `${formatNumber(v, { maximumFractionDigits: 2 })} a year`;
  return yearsWords(v);
}

const labelOf = (c: CostComparison, id: string | null) => (id ? costOf(c, id)?.label ?? id : '');

/**
 * *How firm is the answer?* — which of the reader's figures could change the order of the options, and how wrong it
 * would have to be, in plain words; the exact distances stay in a detail (ADR-128 (3)). Read from the tipping points
 * the comparison already solved (roadmap 7.12): nothing is sampled here.
 */
export function howFirm(a: CostAssumptions, ans: EconomicsAnswer): Firmness {
  const fields: TippingField[] = ['devDayRate', 'testDayRate', 'releaseCadence', 'horizonYears'];
  if (ans.state !== 'priced') return { summary: null, tone: 'none', rows: [], exact: [] };
  const lists: Array<{ c: CostComparison; leader: string }> = [];
  if (ans.all.winner) lists.push({ c: ans.all, leader: ans.all.winner });
  if (ans.keeps.winner && ans.keeps.winner !== ans.all.winner) lists.push({ c: ans.keeps, leader: ans.keeps.winner });
  if (lists.length === 0) {
    return {
      summary: 'No option is clearly ahead, so there is nothing to tip. What decides it is where the one-off effort really lands.',
      tone: 'none',
      rows: [],
      exact: [],
    };
  }
  const exact = lists.flatMap(({ c, leader }) => c.tippingPoints.map((point) => ({ leader: labelOf(c, leader), point })));
  const rows: FirmnessRow[] = fields.map((field) => {
    const v = valueOf(a, field);
    const words: string[] = [];
    for (const { c, leader } of lists) {
      const p = c.tippingPoints.find((t) => t.field === field);
      if (!p || v === null) continue;
      if (p.fallsBy !== null && p.metOnFall) {
        words.push(`Under ${figureAt(field, v * (1 - p.fallsBy), a.currency)}, ${labelOf(c, p.metOnFall)} could cost as little as ${labelOf(c, leader)}.`);
      } else if (p.risesBy !== null && p.metOnRise) {
        words.push(`Over ${figureAt(field, v * (1 + p.risesBy), a.currency)}, ${labelOf(c, p.metOnRise)} could cost as little as ${labelOf(c, leader)}.`);
      }
    }
    return { field, name: FIELD_NAMES[field], now: nowWords(a, field), edge: words.length > 0, words };
  });
  const edge = rows.filter((r) => r.edge);
  const summary =
    edge.length === 0
      ? 'Firm at any value. None of your four figures changes the order, however far it moves. What can change it is the effort itself, under "Effort in days".'
      : `Firm. ${edge.some((r) => r.field === 'devDayRate' || r.field === 'testDayRate') ? '' : 'Neither day rate changes the order, however far it moves. '}Only ${orWords(edge.map((r) => FAR_WORDS[r.field]))} than yours would change it. What can change it is the effort itself, under "Effort in days".`;
  return { summary, tone: edge.length === 0 ? 'firm' : 'edge', rows, exact };
}

/* ---------------------------------------------------------------- options */

/** The option's kind as the decision names it, with Keep for the stored `do-nothing`. */
export function isKeep(option: Pick<CostOption, 'kind'>): boolean {
  return option.kind === COMPARISON_KIND || option.kind === 'keep';
}
