/**
 * The cost revision a decision was priced on, and when a later cost change
 * makes a confirmed decision out of date — ADR-092 (owner, 11.10.2026).
 *
 * **What is recorded.** `confirm-decision` writes, beside the confirmation and
 * outside the fingerprint, the Economics revision the project stood on at that
 * moment: its key, its number and the day it was saved, and which option the
 * comparison named the cheapest on it — or why it named none
 * (`costBasisOf`). Read by the commands route from
 * `projects/{id}/cost_assumptions/current` inside the confirming transaction,
 * never sent by a browser. A decision confirmed before 3.0.10 has no such
 * record, and is said to have none — never given one after the fact.
 *
 * **When it goes out of date by cost.** Only when the comparison now names a
 * *different* option the cheapest than it did on the recorded revision — the
 * same `costComparison` the Economics stage shows, ranges and refusals
 * included. When either side names no cheapest option (incomplete, too few,
 * overlapping ranges, no figures), the costs cannot have overturned the
 * decision, so it stays confirmed and the change is shown. Any other change of
 * the figures is a note: "priced on revision N, costs changed since (revision M)".
 *
 * Out of date by cost and out of date by evidence (the fingerprint moved,
 * ADR-085) are one state with its reasons (`outdatedReasons`), and one way back:
 * withdraw, and confirm again on what the project stands on now.
 *
 * Pure and client-safe. No amount is ever said here (ADR-022).
 */

import { costAssumptionsFingerprint, costComparison, type OptionKind, type WinnerRefusalCode, WINNER_REFUSAL_CODES } from './cost-assumptions';
import { restoreAssumptions, type EconomicsRecord } from './economics-record';
import { formatTextDate } from './format';

/** Format of the recorded cost basis. Bumped only when its shape changes. */
export const DECISION_COST_BASIS_FORMAT = 1;

/** Why a comparison names no cheapest option: 7.4's four refusals, or no figures stored at all. */
export type NoCheapestCode = WinnerRefusalCode | 'no-figures';

export interface DecisionCostBasis {
  format: typeof DECISION_COST_BASIS_FORMAT;
  /** The cost assumptions' revision key, or `null` when Economics held no figures. Never printed for a reader. */
  revision: string | null;
  /**
   * The full SHA-256 fingerprint of those assumptions (`costAssumptionsFingerprint`, 64 hex), or `null` when
   * Economics held no figures or the basis was recorded before 3.0.20. The revision key carries only twelve
   * characters of it; two revisions are the same revision only when the full fingerprints match. Never printed.
   */
  fingerprint?: string | null;
  /** The revision's number (`EconomicsRecord.sequence`); `null` for figures saved before 3.0.10. */
  sequence: number | null;
  /** When that revision was saved (ISO); `null` when unknown. */
  at: string | null;
  /** The option the comparison named the cheapest on it, or `null`. */
  cheapest: { optionId: string; label: string; kind: OptionKind } | null;
  /** Why it named none — `null` exactly when `cheapest` is set. */
  noCheapest: NoCheapestCode | null;
}

/** The cost basis Economics gives right now — what a confirmation records. */
export function costBasisOf(record: EconomicsRecord | null): DecisionCostBasis {
  if (!record) {
    return { format: DECISION_COST_BASIS_FORMAT, revision: null, fingerprint: null, sequence: null, at: null, cheapest: null, noCheapest: 'no-figures' };
  }
  const assumptions = restoreAssumptions(record.assumptions);
  const comparison = costComparison(assumptions);
  const winner = comparison.winner ? assumptions.options.find((o) => o.id === comparison.winner) ?? null : null;
  return {
    format: DECISION_COST_BASIS_FORMAT,
    revision: record.revision,
    fingerprint: costAssumptionsFingerprint(assumptions),
    sequence: typeof record.sequence === 'number' ? record.sequence : null,
    at: record.revisionAt || record.savedAt || null,
    cheapest: winner ? { optionId: winner.id, label: winner.label || winner.id, kind: winner.kind } : null,
    noCheapest: winner ? null : (comparison.refusal?.code ?? 'assumptions-incomplete'),
  };
}

const NO_CHEAPEST_CODES: readonly string[] = [...WINNER_REFUSAL_CODES, 'no-figures'];
const FINGERPRINT = /^[0-9a-f]{64}$/;

/**
 * Whether two cost bases stand on the same figures: by the full fingerprint where both carry one, by the revision
 * key where either was recorded before 3.0.20 (its twelve characters are all that was kept).
 */
export function sameCostRevision(
  a: Pick<DecisionCostBasis, 'revision' | 'fingerprint'>,
  b: Pick<DecisionCostBasis, 'revision' | 'fingerprint'>,
): boolean {
  if (a.revision === null || b.revision === null) return a.revision === b.revision;
  if (a.fingerprint && b.fingerprint) return a.fingerprint === b.fingerprint;
  return a.revision === b.revision;
}
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/** A recorded cost basis read back off the stored decision — `null` for anything this format does not describe. */
export function readCostBasis(raw: unknown): DecisionCostBasis | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (v.format !== DECISION_COST_BASIS_FORMAT) return null;
  const revision = v.revision === null ? null : str(v.revision);
  if (revision === null && v.revision !== null) return null;
  // Recorded before 3.0.20: no fingerprint, and the revision key is what the comparison falls back on.
  const fingerprint = typeof v.fingerprint === 'string' && FINGERPRINT.test(v.fingerprint) && revision !== null ? v.fingerprint : null;
  const sequence = typeof v.sequence === 'number' && Number.isInteger(v.sequence) && v.sequence >= 1 ? v.sequence : null;
  const at = str(v.at, 40);
  let cheapest: DecisionCostBasis['cheapest'] = null;
  if (typeof v.cheapest === 'object' && v.cheapest !== null) {
    const c = v.cheapest as Record<string, unknown>;
    const optionId = str(c.optionId);
    const label = str(c.label) ?? optionId;
    const kind = str(c.kind, 40);
    if (!optionId || !label || !kind) return null;
    cheapest = { optionId, label, kind: kind as OptionKind };
  }
  const noCheapest = typeof v.noCheapest === 'string' && NO_CHEAPEST_CODES.includes(v.noCheapest) ? (v.noCheapest as NoCheapestCode) : null;
  if ((cheapest === null) === (noCheapest === null)) return null;
  return { format: DECISION_COST_BASIS_FORMAT, revision, fingerprint, sequence, at, cheapest, noCheapest };
}

/**
 * The recorded revision against today's, for a confirmed decision.
 *
 *   - `not-recorded` — confirmed before 3.0.10; nothing is guessed.
 *   - `no-figures` — no figures were stored when it was confirmed, and none or the same none now.
 *   - `same` — the figures are the revision it was priced on.
 *   - `changed` — the figures changed, and the cheapest option did not (or one side names none).
 *   - `outdated` — a different option is the cheapest now than on the recorded revision.
 */
export type DecisionCostCheck =
  | { state: 'not-recorded'; current: DecisionCostBasis }
  | { state: 'same' | 'changed' | 'outdated'; recorded: DecisionCostBasis; current: DecisionCostBasis };

/** ADR-092, the rule. `recorded` is `null` for a decision confirmed before 3.0.10. */
export function decisionCostCheck(recorded: DecisionCostBasis | null, current: DecisionCostBasis): DecisionCostCheck {
  if (!recorded) return { state: 'not-recorded', current };
  if (sameCostRevision(recorded, current)) return { state: 'same', recorded, current };
  if (recorded.cheapest && current.cheapest && recorded.cheapest.optionId !== current.cheapest.optionId) {
    return { state: 'outdated', recorded, current };
  }
  return { state: 'changed', recorded, current };
}

/** "revision 3 (10 Oct 2026)" — the number and the day, never the key; what is not known is left out. */
export function costRevisionWords(basis: DecisionCostBasis): string {
  const day = formatTextDate(basis.at);
  if (basis.sequence !== null) return `revision ${basis.sequence}${day ? ` (${day})` : ''}`;
  return day ? `the revision saved ${day}` : 'an unnumbered revision';
}

const cheapestWords = (b: DecisionCostBasis): string =>
  b.cheapest ? `"${b.cheapest.label}" is the cheapest` : b.revision === null ? 'no figures are stored' : 'no option is the cheapest';

/**
 * The Costs row of a confirmed decision, in one or two sentences (ADR-092).
 */
export function decisionCostLine(check: DecisionCostCheck): string {
  if (check.state === 'not-recorded') return 'Cost revision not recorded (decision taken before 3.0.10).';
  const { recorded, current } = check;
  if (recorded.revision === null) {
    return current.revision === null
      ? 'No cost figures were stored when this decision was confirmed.'
      : `No cost figures were stored when this decision was confirmed; Economics holds ${costRevisionWords(current)} since.`;
  }
  const on = `Priced on ${costRevisionWords(recorded)}`;
  if (check.state === 'same') {
    return recorded.cheapest ? `${on}, on which "${recorded.cheapest.label}" is the cheapest option.` : `${on}; it names no cheapest option.`;
  }
  const since = current.revision === null ? 'the figures were removed since' : `costs changed since (${costRevisionWords(current)})`;
  if (check.state === 'outdated') {
    return `${on}, when "${recorded.cheapest?.label}" was the cheapest; ${since}, and now "${current.cheapest?.label}" is.`;
  }
  // Changed, the decision stays confirmed: say why the change does not overturn it.
  const why =
    recorded.cheapest && current.cheapest
      ? `"${current.cheapest.label}" is still the cheapest.`
      : `Then ${cheapestWords(recorded)}, now ${cheapestWords(current)} — so the change does not overturn the decision.`;
  return `${on}, ${since}. ${why}`;
}

/** Why a confirmed decision is out of date: its evidence moved (ADR-085), or a different option is now the cheapest (ADR-092). */
export type OutdatedReason = 'evidence' | 'cost';

/** The one outdated state with its reasons — empty when the decision is not confirmed or nothing overturned it. */
export function outdatedReasons(input: {
  confirmed: boolean;
  /** The fingerprint of today's derivation equals the stored record's. */
  unchanged: boolean;
  cost: DecisionCostCheck | null;
}): OutdatedReason[] {
  if (!input.confirmed) return [];
  const reasons: OutdatedReason[] = [];
  if (!input.unchanged) reasons.push('evidence');
  if (input.cost?.state === 'outdated') reasons.push('cost');
  return reasons;
}

/**
 * The reasons as a reader of the decision route reads them: the route's own
 * `outdated` list when it sent one, else — an answer from before 3.0.10 — the
 * fingerprint rule alone.
 */
export function outdatedReasonsOfAnswer(answer: {
  stored?: { status?: string } | null;
  unchanged?: boolean;
  outdated?: readonly OutdatedReason[] | null;
}): OutdatedReason[] {
  const confirmed = answer.stored?.status === 'confirmed';
  if (!confirmed) return [];
  if (Array.isArray(answer.outdated)) return answer.outdated.filter((r): r is OutdatedReason => r === 'evidence' || r === 'cost');
  return answer.unchanged === false ? ['evidence'] : [];
}
