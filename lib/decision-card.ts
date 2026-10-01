/**
 * What the "Open decision" card says — roadmap 8.4, mockup screen 5.
 *
 * Pure and client-safe: it reads a decision record (`lib/project-decision.ts`)
 * and returns sentences. The component adds none of its own, for the reason
 * `lib/it-findings.ts` gives: the two things a card like this is most tempted to
 * invent — a binding that looks bound because the missing one was left out,
 * and a "reversible" with no boundary — it cannot, because the record hands it
 * `null` and the reason instead.
 */

import {
  DECISION_BINDINGS,
  SELF_DECLARATION,
  decisionCoverage,
  type ConditionStatus,
  type DecisionBindingKey,
  type DecisionCondition,
  type DecisionState,
  type DecisionStatus,
  type ProjectDecision,
} from './project-decision';
import type { ProvenanceValue } from './provenance';
import { ALTERNATIVE_LABELS } from './architecture-contract';

/** The four bindings the "Binds" line names, in the mockup's order. The run has its own line. */
export const CARD_BINDINGS: readonly DecisionBindingKey[] = DECISION_BINDINGS.filter((k) => k !== 'run');

export interface CardBinding {
  key: DecisionBindingKey;
  /** "need revision", "option", "cost revision", "contract", "analysis run". */
  label: string;
  /** What is bound, or `null` — then `reason` says why nothing is. The revision key, for a tooltip. */
  value: string | null;
  /** `value` as a reader is told it: what the revision key means, without the key. */
  shown: string | null;
  reason: string | null;
  /** What qualifies a binding that did hold. */
  note: string | null;
  provenance: ProvenanceValue;
}

const SHORT_LABEL: Readonly<Record<DecisionBindingKey, string>> = Object.freeze({
  need: 'need revision',
  option: 'option',
  cost: 'cost revision',
  contract: 'contract',
  run: 'analysis run',
});

export const CONDITION_STATUS_LABEL: Readonly<Record<ConditionStatus, string>> = Object.freeze({
  open: 'open',
  met: 'met',
  waived: 'waived',
  'not-determined': 'not determined',
});

export interface DecisionCardView {
  /** "DEC-1 · revision 3". */
  identity: string;
  status: DecisionStatus;
  summary: string;
  bindings: CardBinding[];
  run: CardBinding;
  /** "Yes, inside …" / "No — …" / "Not determined". */
  reversible: { answer: string; detail: string };
  /** "1 open · 2 met", or the sentence that there are none. */
  conditionsSummary: string;
  conditions: DecisionCondition[];
  openConditions: number;
  coverage: { state: DecisionState; sentence: string };
  /** False while the decision is blocked: nothing may be confirmed then, and the button says why. */
  confirmable: boolean;
  /** The consequences, one line each, for the confirmation dialog. */
  dialogLines: string[];
  selfDeclaration: string;
}

function binding(decision: ProjectDecision, key: DecisionBindingKey): CardBinding {
  const b = decision.bindings.find((x) => x.key === key);
  if (!b) {
    return {
      key,
      label: SHORT_LABEL[key],
      value: null,
      shown: null,
      reason: 'This record carries no such binding.',
      note: null,
      provenance: 'not-determined',
    };
  }
  return {
    key,
    label: SHORT_LABEL[key],
    value: b.revision,
    shown: b.revision === null ? null : bindingShown(key, b.revision),
    reason: b.notDeterminedReason,
    note: b.note,
    provenance: b.provenance,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * A bound revision as a sentence fragment a reader can use.
 *
 * The revision keys are exact and stable, which is what a manifest needs and a
 * person cannot read: `blocked:qualified:AC-1/side-by-side-cap+592e7a6c667f`,
 * `unconfirmed:EUR@5y/4/y?#3opt+7bb12ca381e8`, `need/r2`. Each is taken apart
 * here into what it says — which contract on which route and in what state, which
 * currency over how many years — and the key itself stays in the tooltip. A key
 * of a shape this does not know is shown as it is rather than guessed at.
 */
export function bindingShown(key: DecisionBindingKey, revision: string): string {
  if (key === 'need') {
    const need = /^need\/r(\d+)$/.exec(revision);
    return need ? `revision ${need[1]}` : revision;
  }
  if (key === 'contract') {
    const c = /^(blocked:)?(qualified:)?([^/]+)\/([a-z-]+?)(\+deviation)?\+[0-9a-f]+$/.exec(revision);
    if (!c) return revision;
    const [, blocked, qualified, id, route, deviation] = c;
    const routeLabel = (ALTERNATIVE_LABELS as Record<string, string>)[route] ?? route.replace(/-/g, ' ');
    const state = blocked ? 'blocked by a limit' : qualified ? 'draft with open limits' : 'complete';
    return `${id}, ${routeLabel}${deviation ? ', deviating from the route the engine named' : ''} — ${state}`;
  }
  if (key === 'cost') {
    const c = /^(unconfirmed:)?([^@]+)@([^/]+)\/(.+)#(\d+)opt\+[0-9a-f]+$/.exec(revision);
    if (!c) return revision;
    const [, unconfirmed, currency, horizon, cadence, options] = c;
    const years = /^(\d+)y$/.exec(horizon);
    const perYear = /^(\d+)\/y(\?)?$/.exec(cadence);
    const parts = [
      currency === 'no-currency' ? 'no currency' : currency,
      years ? `over ${plural(Number(years[1]), 'year', 'years')}` : 'no time horizon',
      perYear
        ? `${plural(Number(perYear[1]), 'release', 'releases')} a year${perYear[2] ? ' (not confirmed)' : ''}`
        : 'no release cadence',
      plural(Number(options), 'option', 'options'),
    ];
    return `${parts.join(', ')}${unconfirmed ? ' — not all assumptions confirmed' : ''}`;
  }
  return revision;
}

/** "1 open · 2 met" — never a count for a status nobody holds, and never a zero standing for "none". */
export function conditionsSummary(conditions: readonly DecisionCondition[]): string {
  if (conditions.length === 0) {
    return 'None — no condition was derived from the contract, the costs or the need.';
  }
  const counts = new Map<ConditionStatus, number>();
  for (const c of conditions) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  const order: ConditionStatus[] = ['open', 'not-determined', 'met', 'waived'];
  return order
    .filter((s) => (counts.get(s) ?? 0) > 0)
    .map((s) => `${counts.get(s)} ${CONDITION_STATUS_LABEL[s]}`)
    .join(' · ');
}

export function decisionCardView(decision: ProjectDecision): DecisionCardView {
  const coverage = decisionCoverage(decision);
  const bindings = CARD_BINDINGS.map((key) => binding(decision, key));
  const run = binding(decision, 'run');

  const r = decision.reversibility;
  const reversible =
    r.answer === 'reversible'
      ? { answer: `Yes, inside ${r.boundary ?? 'this product'}`, detail: r.reason }
      : r.answer === 'irreversible'
        ? { answer: 'No', detail: r.reason }
        : { answer: 'Not determined', detail: r.reason };

  const openConditions = decision.conditions.filter(
    (c) => c.status === 'open' || c.status === 'not-determined',
  ).length;

  const bound = bindings.filter((b) => b.value !== null);
  const unbound = bindings.filter((b) => b.value === null);
  const dialogLines: string[] = [];
  dialogLines.push(
    bound.length > 0
      ? `Binds ${bound.map((b) => `${b.label} ${b.value}`).join(', ')}.`
      : 'Binds nothing but the analysis run.',
  );
  if (unbound.length > 0) {
    dialogLines.push(`Not determined, and confirmed as such: ${unbound.map((b) => b.label).join(', ')}.`);
  }
  dialogLines.push(
    openConditions === 0
      ? 'No condition stays open.'
      : `${openConditions} condition${openConditions === 1 ? '' : 's'} stay${openConditions === 1 ? 's' : ''} open and ${openConditions === 1 ? 'is' : 'are'} shown with the decision.`,
  );
  dialogLines.push('A later change is a new revision, not an edit.');

  return {
    identity: `${decision.decisionId} · revision ${decision.revision}`,
    status: decision.status,
    summary: decision.summary,
    bindings,
    run,
    reversible,
    conditionsSummary: conditionsSummary(decision.conditions),
    conditions: decision.conditions,
    openConditions,
    coverage: { state: coverage.state, sentence: coverage.sentence },
    confirmable: coverage.state !== 'blocked' && decision.status === 'draft',
    dialogLines,
    selfDeclaration: SELF_DECLARATION,
  };
}
