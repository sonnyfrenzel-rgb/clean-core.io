/**
 * The four options side by side — what the evidence says for each, what each
 * costs in days and (as a simulation) in money, and which one was chosen, by
 * whom and when (ADR-079, owner 06.10.2026: "Management must know how far the
 * Z transaction is from the standard … what the rebuild costs … very clear and
 * simple language").
 *
 * **Nothing new is measured.** Every reading below is one another model already
 * made: fit to standard on the target and on the other edition
 * (`lib/standard-fit.ts`, ADR-069), the decision record's contract and
 * conditions (`lib/project-decision.ts`), the engine's route
 * (`recommendedArchitecture`), the usage import (`lib/abap/usage-model.ts`) and
 * the Economics figures the account entered (`lib/cost-assumptions.ts`). This
 * module picks, words and places them.
 *
 * **The rules, one per option, and they are the whole of it:**
 *
 *   Keep      *against* when objects stand in the way of the standard on the
 *             target edition (they stay in the way when the program stays);
 *             *for* when the code uses no SAP object, or none stands in the way.
 *   Rebuild   *against* when the architecture contract is blocked (core
 *             modifications not reset); *for* when SAP names a path for at least
 *             one object that stands in the way, or the contract is complete;
 *             otherwise not determined.
 *   Standard  always *not determined* here: whether SAP standard covers what the
 *             program does is a question about the business capability, which
 *             the code cannot answer (the contract says the same).
 *   Retire    *for* only on a measured zero: the usage import names the program
 *             with zero executions over a declared window of at least 13 months;
 *             *against* when it names executions; otherwise not determined —
 *             never "unused" for "not measured" (§5.6).
 *
 * **The proposal** is the one option with *for* when exactly one has it, and
 * nothing otherwise — "the evidence does not decide" is said as such. It is a
 * reading of evidence (`proposed`, never green), not a recommendation of a model
 * and never a mandate.
 *
 * **Effort and money.** Days come only from the Economics options the account
 * entered or took over (provenance *Confirmed* — the account's own figures; a
 * size proposal nobody took over is *Not determined*). An amount comes only
 * from `optionCost()` under the stored assumptions revision, as a *Simulation*
 * with that revision (ADR-022: originated in Economics, shown here as a
 * takeover). No option without a figure gets one: it is *Not determined* with
 * its reason.
 *
 * A view: derived when shown, never stored, hashed or signed. Pure.
 */

import {
  formatAmountRange,
  optionCost,
  type CostAssumptions,
  type CostOption,
} from './cost-assumptions';
import { economicsInWords, restoreAssumptions, type EconomicsRecord } from './economics-record';
import {
  DECISION_OPTIONS,
  DECISION_OPTION_LABELS,
  DECISION_OPTION_MEANINGS,
  decisionQuestion,
  optionOfArchitecture,
  optionOfCostKind,
  type DecisionOption,
} from './decision-options';
import { contractParts } from './decision-card';
import { noContractBasis, type DecisionStatus, type ProjectDecision } from './project-decision';
import { RETIREMENT_WINDOW_DAYS, type UsageReport } from './abap/usage-model';
import type { StandardFit } from './standard-fit';
import type { ProvenanceValue } from './provenance';
import { formatDays } from './format';
import { measuredCount } from './usage-count';

export type OptionSignal = 'for' | 'against' | 'not-determined';

export const OPTION_SIGNAL_WORDS: Readonly<Record<OptionSignal, string>> = Object.freeze({
  for: 'Speaks for it',
  against: 'Speaks against it',
  'not-determined': 'Not determined',
});

/** Where a reader goes to change what a line rests on. */
export type OptionPlace = 'design' | 'tco' | 'analyze' | 'business' | 'it' | 'fit';

export interface OptionFigure {
  /** The figure as a reader sees it, or `null` — then `reason` says why there is none. */
  value: string | null;
  reason: string | null;
  provenance: ProvenanceValue;
  /** One short qualifier: "your own figures", "Simulation · assumptions …". */
  note: string | null;
}

export interface OptionCard {
  option: DecisionOption;
  label: string;
  meaning: string;
  signal: OptionSignal;
  /** One plain sentence: why this signal. */
  reason: string;
  provenance: ProvenanceValue;
  /** Where the reason can be checked or changed. */
  place: OptionPlace;
  /** The one option the evidence proposes, when exactly one has *for*. */
  proposed: boolean;
  chosen: boolean;
  /** Effort in days, from the account's own Economics figures. */
  effort: OptionFigure;
  /** Cost over the observation period, a simulation from Economics. */
  cost: OptionFigure;
  /** How it is chosen: directly here, or through the Design sign-off. */
  choice: 'direct' | 'design';
}

export type DecisionStage = 'not-decided' | 'chosen' | 'confirmed' | 'outdated';

export interface DecisionOptionsView {
  question: string;
  /** Where the decision stands, in one sentence that names the option. */
  answer: string;
  stage: DecisionStage;
  /** "Chosen by a@b on 2026-10-04" / "Confirmed by a@b on 2026-10-05", or `null`. */
  who: string | null;
  /** The proposal in one sentence — or that the evidence does not decide, and between which. */
  proposal: string;
  proposed: DecisionOption | null;
  cards: OptionCard[];
  /** The Economics revision every amount comes from, or `null` when none is stored. */
  costRevision: string | null;
}

export interface DecisionOptionsSource {
  subject: string;
  /** `demo` never chooses and never has a record. */
  mode: 'project' | 'demo';
  hasRun: boolean;
  fit: StandardFit;
  /** The decision as the card shows it: the confirmed record, else the draft; `null` while unread. */
  decision: ProjectDecision | null;
  status: DecisionStatus | null;
  /** The stored record is confirmed but the evidence moved since. */
  outdated?: boolean;
  confirmation: { account: string; at: string } | null;
  /** The sign-off on the project — who chose the option, and when. */
  signOff: { code: string | null; by: string | null; at: string | null } | null;
  /** The engine's route for Rebuild, already as an architecture code (`recommendedArchitecture`). */
  engineRoute: string | null;
  usage: UsageReport | null;
  economics: EconomicsRecord | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const date = (iso: string | null | undefined) => (typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : null);

const ROUTE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  rap: 'on the SAP system with ABAP Cloud (RAP)',
  cap: 'side by side on SAP BTP (CAP)',
  integration: 'on SAP Integration Suite',
  event: 'on SAP Event Mesh',
});

/* ------------------------------------------------------------ evidence */

function modificationsOf(decision: ProjectDecision | null): number | null {
  const c = decision?.conditions.find((x) => x.evidence?.startsWith('modification-unreset'));
  if (!c) return null;
  const n = Number((c.evidence ?? '').split(':')[1]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function keepSignal(fit: StandardFit): Pick<OptionCard, 'signal' | 'reason' | 'provenance' | 'place'> {
  if (fit.state === 'none-used') {
    return {
      signal: 'for',
      reason: 'The code uses no SAP object, so nothing in it stands in the way of the standard.',
      provenance: 'reconstructed',
      place: 'fit',
    };
  }
  if (fit.state === 'not-determined') {
    return { signal: 'not-determined', reason: fit.reason, provenance: 'not-determined', place: fit.why === 'no-target' ? 'analyze' : 'fit' };
  }
  if (fit.blocking > 0) {
    return {
      signal: 'against',
      reason: `${plural(fit.blocking, 'SAP object stands', 'SAP objects stand')} in the way of the standard on ${fit.platformLabel} — kept as it is, the program keeps ${fit.blocking === 1 ? 'it' : 'them'} in the way.`,
      provenance: 'reconstructed',
      place: 'fit',
    };
  }
  return {
    signal: 'for',
    reason: `Nothing found stands in the way of the standard on ${fit.platformLabel}: all ${fit.counted} SAP objects have a path to SAP standard.`,
    provenance: 'reconstructed',
    place: 'fit',
  };
}

function rebuildSignal(
  fit: StandardFit,
  decision: ProjectDecision | null,
  engineRoute: string | null,
): Pick<OptionCard, 'signal' | 'reason' | 'provenance' | 'place'> {
  const mods = modificationsOf(decision);
  const contractRev = decision?.bindings.find((b) => b.key === 'contract')?.revision ?? null;
  const contract = contractRev && !noContractBasis(contractRev) ? contractParts(contractRev) : null;
  const route = engineRoute ? ROUTE_WORDS[engineRoute] ?? null : null;
  if (contract?.state === 'blocked' || mods !== null) {
    return {
      signal: 'against',
      reason:
        mods !== null
          ? `${plural(mods, 'change to SAP’s own code has', 'changes to SAP’s own code have')} to be reset first — no rebuild is reachable before that.`
          : 'A limit of the architecture contract blocks the rebuild as it stands.',
      provenance: 'reconstructed',
      place: 'it',
    };
  }
  const withPath = fit.state === 'ready' ? fit.successor : 0;
  if (withPath > 0 || contract?.state === 'complete') {
    return {
      signal: 'for',
      reason:
        (route ? `The engine names a route: rebuild ${route}. ` : '') +
        (withPath > 0
          ? `SAP names a released successor for ${plural(withPath, 'object', 'objects')} the program uses.`
          : 'The architecture contract for the route is complete.'),
      provenance: 'reconstructed',
      place: 'design',
    };
  }
  return {
    signal: 'not-determined',
    reason: route
      ? `The engine names a route — rebuild ${route} — but no released successor is named for what the program uses yet.`
      : 'No route could be read from the evidence yet.',
    provenance: route ? 'reconstructed' : 'not-determined',
    place: 'design',
  };
}

function standardSignal(): Pick<OptionCard, 'signal' | 'reason' | 'provenance' | 'place'> {
  return {
    signal: 'not-determined',
    reason:
      'Whether SAP standard does what this program does is a business question the code cannot answer. Check it against the standard in the Business view.',
    provenance: 'not-determined',
    place: 'business',
  };
}

function retireSignal(subject: string, usage: UsageReport | null): Pick<OptionCard, 'signal' | 'reason' | 'provenance' | 'place'> {
  if (!usage) {
    return {
      signal: 'not-determined',
      reason: 'No usage data is imported, so nothing says whether the program still runs — retiring it is a business decision.',
      provenance: 'not-determined',
      place: 'it',
    };
  }
  // A stored usage report can be older or hand-edited: entries without a name,
  // `null` rows, a count that is not a number (legacy form "malformed-lists").
  const records: unknown[] = Array.isArray(usage.records) ? usage.records : [];
  const record =
    (records.find(
      (r): r is UsageReport['records'][number] =>
        !!r && typeof (r as { objectName?: unknown }).objectName === 'string' &&
        (r as { objectName: string }).objectName.toUpperCase() === subject.toUpperCase(),
    ) as UsageReport['records'][number] | undefined) ?? null;
  // A count counts only when finite and not negative (roadmap 3.0.6): `NaN`
  // or `-3` from a hand-edited report is no measurement, never "zero executions".
  const calls = record ? measuredCount(record.callCount) : null;
  if (!record || calls === null) {
    return {
      signal: 'not-determined',
      reason: `The usage import does not count executions of ${subject}, so it says nothing about retiring it.`,
      provenance: 'not-determined',
      place: 'it',
    };
  }
  if (calls > 0) {
    return {
      signal: 'against',
      reason: `The usage import counts ${plural(calls, 'execution', 'executions')} of ${subject} — it still runs.`,
      provenance: 'imported',
      place: 'it',
    };
  }
  const days = measuredCount(usage.window?.days);
  if (days === null || days < RETIREMENT_WINDOW_DAYS) {
    return {
      signal: 'not-determined',
      reason:
        days === null
          ? `Zero executions of ${subject}, but the import declares no monitoring window — too short to say it is unused.`
          : `Zero executions of ${subject} over ${days} days — needs at least 13 months to cover period-end runs.`,
      provenance: 'imported',
      place: 'it',
    };
  }
  return {
    signal: 'for',
    reason: `Zero executions of ${subject} from ${usage.window!.from} to ${usage.window!.to} (${days} days).`,
    provenance: 'imported',
    place: 'it',
  };
}

/* ------------------------------------------------------- effort, money */

function sumDays(d: { devDays: number; testDays: number } | null | undefined): number | null {
  if (!d) return null;
  const v = d.devDays + d.testDays;
  return Number.isFinite(v) ? v : null;
}

function costOptionFor(a: CostAssumptions, option: DecisionOption): CostOption | null {
  const matching = a.options.filter((o) => optionOfCostKind(o.kind) === option);
  if (matching.length === 0) return null;
  // Keep: a record from before ADR-079 may hold both "Do nothing" and "Keep and
  // maintain"; the comparison option is the one Keep stands for.
  return matching.find((o) => o.kind === 'do-nothing') ?? matching[0];
}

const NO_ECONOMICS = 'No figures entered in Economics yet.';

function effortOf(o: CostOption | null, economics: EconomicsRecord | null): OptionFigure {
  if (!economics) return { value: null, reason: NO_ECONOMICS, provenance: 'not-determined', note: null };
  if (!o) return { value: null, reason: 'Not among the options priced in Economics.', provenance: 'not-determined', note: null };
  const low = sumDays(o.oneOff?.low);
  const high = sumDays(o.oneOff?.high);
  const perRelease = sumDays(o.perRelease);
  const baseline = sumDays(o.maintenanceBaselinePerYear);
  const parts: string[] = [];
  if (low !== null && high !== null) {
    parts.push(low === high ? `${formatDays(low)} days once` : `${formatDays(low)}–${formatDays(high)} days once`);
  }
  if (perRelease !== null) parts.push(`${formatDays(perRelease)} per release`);
  if (baseline !== null) parts.push(`${formatDays(baseline)} a year to maintain`);
  if (parts.length === 0) {
    return { value: null, reason: 'No effort entered for it in Economics yet.', provenance: 'not-determined', note: null };
  }
  if (o.effortSource === 'proposal-unconfirmed') {
    // A proposal nobody took over is not a figure of the account (ADR-035).
    return {
      value: null,
      reason: 'Only a size proposal nobody confirmed yet — take it over or enter your own in Economics.',
      provenance: 'not-determined',
      note: null,
    };
  }
  return {
    value: parts.join(' · '),
    reason: null,
    provenance: 'confirmed',
    note: o.effortSource === 'proposal-confirmed' ? 'the size proposal, taken over by your account' : 'your own figures',
  };
}

function costOf(o: CostOption | null, a: CostAssumptions | null, economics: EconomicsRecord | null): OptionFigure {
  if (!economics || !a) return { value: null, reason: NO_ECONOMICS, provenance: 'not-determined', note: null };
  if (!o) return { value: null, reason: 'Not among the options priced in Economics.', provenance: 'not-determined', note: null };
  const cost = optionCost(a, o);
  if (!cost.total) {
    return {
      value: null,
      reason: 'Not priced yet — a figure it needs is still open in Economics.',
      provenance: 'not-determined',
      note: null,
    };
  }
  const years = a.horizonYears;
  return {
    value: `${formatAmountRange(cost.total, a.currency)}${years ? ` over ${plural(years, 'year', 'years')}` : ''}`,
    reason: null,
    provenance: 'simulation',
    // In words, never the revision key (owner, 10.10.2026) — the key stays in Economics' technical details.
    note: `Simulation on your own assumptions from Economics (${economicsInWords(economics)}) — not a quote.`,
  };
}

/* ----------------------------------------------------------------- build */

export function decisionOptionsView(src: DecisionOptionsSource): DecisionOptionsView {
  const optionRev = src.decision?.bindings.find((b) => b.key === 'option')?.revision ?? null;
  const chosenCode = optionRev === null ? null : optionRev.split(' · ')[0];
  const chosen = optionOfArchitecture(chosenCode);

  const signals: Record<DecisionOption, Pick<OptionCard, 'signal' | 'reason' | 'provenance' | 'place'>> = {
    keep: keepSignal(src.fit),
    rebuild: rebuildSignal(src.fit, src.decision, src.engineRoute),
    standard: standardSignal(),
    retire: retireSignal(src.subject, src.usage),
  };
  if (!src.hasRun) {
    for (const o of DECISION_OPTIONS) {
      signals[o] = {
        signal: 'not-determined',
        reason:
          src.mode === 'demo'
            ? 'A demo is never signed, so no option can be read from evidence here.'
            : 'No signed run yet — every reading here comes from one.',
        provenance: 'not-determined',
        place: 'analyze',
      };
    }
  }
  const fors = DECISION_OPTIONS.filter((o) => signals[o].signal === 'for');
  const proposed = fors.length === 1 ? fors[0] : null;

  const assumptions = src.economics ? restoreAssumptions(src.economics.assumptions) : null;
  const cards: OptionCard[] = DECISION_OPTIONS.map((option) => {
    const costOption = assumptions ? costOptionFor(assumptions, option) : null;
    return {
      option,
      label: DECISION_OPTION_LABELS[option],
      meaning: DECISION_OPTION_MEANINGS[option],
      ...signals[option],
      proposed: proposed === option,
      chosen: chosen === option,
      effort: effortOf(costOption, src.economics),
      cost: costOf(costOption, assumptions, src.economics),
      choice: option === 'rebuild' ? 'design' : 'direct',
    };
  });

  const proposal = !src.hasRun
    ? 'No proposal without a signed run.'
    : proposed
      ? `The evidence points to ${DECISION_OPTION_LABELS[proposed]} — a reading of the evidence, not a decision.`
      : fors.length > 1
        ? `The evidence does not decide between ${fors.map((o) => DECISION_OPTION_LABELS[o]).join(' and ')} — that is your call.`
        : 'The evidence does not point to one option yet — that is your call.';

  const signOffBy = src.signOff?.by || null;
  const signOffAt = date(src.signOff?.at);
  let stage: DecisionStage = 'not-decided';
  let answer: string;
  let who: string | null = null;
  if (!chosen) {
    answer = src.hasRun ? 'Not decided yet — no option is chosen.' : 'Not decided yet — the decision needs a signed run first.';
  } else if (src.status === 'confirmed') {
    stage = src.outdated ? 'outdated' : 'confirmed';
    answer = src.outdated
      ? `Decided: ${DECISION_OPTION_LABELS[chosen]} — but the evidence changed since it was confirmed.`
      : `Decided: ${DECISION_OPTION_LABELS[chosen]}.`;
    who = src.confirmation
      ? `Confirmed by ${src.confirmation.account} on ${date(src.confirmation.at) ?? 'an unreadable date'} — a self-declaration, not a mandate.`
      : null;
  } else {
    stage = 'chosen';
    answer = `${DECISION_OPTION_LABELS[chosen]} is chosen, not confirmed yet.`;
    who = signOffBy ? `Chosen by ${signOffBy}${signOffAt ? ` on ${signOffAt}` : ''}.` : null;
  }

  return {
    question: decisionQuestion(src.subject),
    answer,
    stage,
    who,
    proposal,
    proposed,
    cards,
    costRevision: src.economics?.revision ?? null,
  };
}
