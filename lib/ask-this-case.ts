/**
 * The one question that is already answered — `DESIGN.md` §5.3, §6.2, roadmap 2.7.
 *
 *   > *"One question is already answered."* "Ask this case" shows, when first
 *   > opened, an asked question with answer and anchors — **derived from the
 *   > branches of the code** (chip *Reconstructed*), without a model call and
 *   > without touching the user's quota.
 *
 * So there is no prompt in this file, no model stage, no network and no quota:
 * the question and its answer are read off the process skeleton (roadmap 2.1 /
 * 2.3) and the business rules (roadmap 3.4), both of which are already on the
 * screen. If the source has no branch there is **no** pre-answered question, and
 * the card says that rather than inventing one — a fabricated question is a
 * fabricated answer with a question mark in front of it.
 *
 * **Which branch.** Deterministic, and in this order, because the order is the
 * answer to "which decision would a reader ask about first":
 *
 *   1. a gateway one of whose branches ends the flow — a rejection is the thing
 *      people want to know about, and `SkeletonEdgeReason` marks it;
 *   2. otherwise the gateway a business rule stands on, because that is a
 *      decision with a value behind it;
 *   3. otherwise the first gateway in source order.
 *
 * Every tie is broken by source order, so the same source always produces the
 * same question. Nothing here ranks by "interestingness".
 *
 * **What the question may say.** The condition as the source writes it, and
 * nothing else. `Z_LIMIT > 5000` becomes *"What happens when `Z_LIMIT > 5000`?"*
 * and never *"What happens when the order exceeds the limit?"* — the second
 * sentence is a translation, and translating is the model's job (roadmap 2.4),
 * not this file's.
 *
 * **And for the business reader** (owner, 03.10.2026: "Nobody understands
 * this. What is it supposed to be for someone who can't read code?"): handed
 * the source, the same answer also carries the question and every branch in
 * the plain words the map already shows for that decision point and its
 * targets (`plainLabels`, deterministic, no model) — "What happens at the
 * decision point “Deviation percent above 5?”", "Yes: it continues with “Hold
 * for buyer”." — and the decision point is chosen for that reader: one a
 * business rule with a plain name stands on before a technical `sy-subrc`
 * check. Nothing is invented: a label the wording cannot put plainly is left
 * out of the plain answer, and the code's own question and branches stay for
 * the IT reader, one fold down.
 */

import { rulesForElement, type BusinessRule, type BusinessRuleSet } from './abap/business-rule-set';
import type { ProcessSkeleton, SkeletonEdge, SkeletonNode } from './abap/process-skeleton';
import { plainLabels } from './abap/plain-language';
import { plainWordingFor } from './business-card';
import { anchorLabel } from './first-look';

/** A branch of the chosen decision: where it goes, and under which condition. */
export interface AnsweredBranch {
  /** The condition as written, or null for the default branch. */
  condition: string | null;
  /** The node the branch reaches — its label out of the source. */
  target: string;
  /** Why the flow leaves, when the skeleton recorded a reason. */
  reason?: string;
  /** True when this branch ends the process — a rejection, an abort, a message. */
  endsFlow: boolean;
  /**
   * Roadmap 3.0.7: the branch leaves its block early and the run goes on with
   * this reporting event — `STOP` → `END-OF-SELECTION`, `RETURN` in `AT
   * SELECTION-SCREEN` → the next block. The event as the source writes it.
   */
  continuesWith?: string;
  anchor: string | null;
  /**
   * The branch for a business reader — "Yes: the run stops with the message
   * “not authorized (E002)”." — in the map's plain words. Absent when the
   * source was not handed in; null when the wording has no plain word for it.
   */
  plain?: string | null;
}

export interface AnsweredQuestion {
  kind: 'answered';
  /** The gateway the question is about. */
  nodeId: string;
  question: string;
  /** The gateway's own line range. */
  anchor: string | null;
  branches: AnsweredBranch[];
  /** Rules that stand on this decision — each with its places. */
  rules: Array<{ id: string; label: string; anchors: string[]; sentence?: string | null }>;
  /**
   * The question for a business reader (owner, 03.10.2026: "What is it
   * supposed to be for someone who can't read code?") — built from the
   * decision point's plain label, the one the map shows, never from the ABAP
   * condition. Absent without the source; null when the wording has nothing
   * but a neutral label.
   */
  plainQuestion?: string | null;
}

export interface NoQuestion {
  kind: 'none';
  /** Why there is none. Shown; never swapped for a generic invitation. */
  reason: string;
}

export type PreAnswered = AnsweredQuestion | NoQuestion;

const ENDS_FLOW = new Set(['end', 'end-error']);

/**
 * Roadmap 3.0.7 — where the run goes on after this end, when it does: the
 * start of the next reporting event block the skeleton chains it to
 * (`reason: 'runtime-order'`), or `END-OF-SELECTION` after a `STOP`
 * (`reason: 'stop'`). `STOP` in `START-OF-SELECTION` skips the rest of the
 * block, not the rest of the run, and `RETURN` in `AT SELECTION-SCREEN` leaves
 * the check and the run goes on — neither is "the run ends here". Null: the
 * run ends at this node.
 */
function goesOnAt(skeleton: ProcessSkeleton, node: SkeletonNode | undefined): SkeletonNode | null {
  if (!node || !ENDS_FLOW.has(node.kind)) return null;
  const on = skeleton.edges.find((e) => e.from === node.id && (e.reason === 'runtime-order' || e.reason === 'stop'));
  return on ? skeleton.nodes.find((n) => n.id === on.to) ?? null : null;
}

function endsFlow(skeleton: ProcessSkeleton, edge: SkeletonEdge): boolean {
  const target = skeleton.nodes.find((n) => n.id === edge.to);
  if (goesOnAt(skeleton, target)) return false;
  if (edge.reason === 'stop' || edge.reason === 'abort' || edge.reason === 'no-return') return true;
  return target ? ENDS_FLOW.has(target.kind) : false;
}

function outgoing(skeleton: ProcessSkeleton, node: SkeletonNode): SkeletonEdge[] {
  return skeleton.edges.filter((e) => e.from === node.id);
}

function ruleAnchors(rule: BusinessRule): string[] {
  return [
    ...new Set(
      rule.sentences.flatMap((s) => s.anchors.map((a) => anchorLabel(a.lineStart, a.lineEnd))),
    ),
  ];
}

/**
 * The question this case answers before it is asked, or the reason there is none.
 *
 * Pure, deterministic, and given the same two artefacts the screen already
 * holds — no second parse of the source, no model, no quota.
 */
export function preAnsweredQuestion(
  skeleton: ProcessSkeleton,
  ruleSet: BusinessRuleSet,
  /**
   * The source the skeleton was read from. With it, the decision point is
   * chosen for a business reader and the question and every branch are also
   * worded for one (`plainQuestion`, `plain`); the code's own question stays
   * in `question`, for the IT reader. Without it, choice and wording are the
   * code's alone, as before.
   */
  source?: string,
): PreAnswered {
  const gateways = skeleton.nodes.filter((n) => n.kind === 'gateway');

  if (gateways.length === 0) {
    return {
      kind: 'none',
      reason:
        'This source has no branch — no IF, no CASE, no CHECK on business data. There is therefore no decision point to answer in advance, and nothing here is a question the code did not ask.',
    };
  }

  const labels = source !== undefined ? plainLabels(skeleton, source) : null;
  const wording = source !== undefined ? plainWordingFor(source, skeleton) : null;
  const endsSomewhere = (g: SkeletonNode) => outgoing(skeleton, g).some((e) => endsFlow(skeleton, e));

  const chosen =
    (labels ? businessChoice(ruleSet, gateways, endsSomewhere, wording, labels) : null) ??
    gateways.find(endsSomewhere) ??
    gateways.find((g) => rulesForElement(ruleSet, g.id).length > 0) ??
    gateways[0];

  const edges = outgoing(skeleton, chosen);
  const branches: AnsweredBranch[] = edges.map((edge) => {
    const target = skeleton.nodes.find((n) => n.id === edge.to);
    const ends = endsFlow(skeleton, edge);
    // Only an early exit "goes on with" a block; a block's normal end reads as the step being done.
    const next = target?.detail?.early === true ? goesOnAt(skeleton, target) : null;
    return {
      condition: edge.condition.length > 0 ? edge.condition : null,
      target: target?.label ?? edge.to,
      ...(edge.reason ? { reason: edge.reason } : {}),
      endsFlow: ends,
      ...(next ? { continuesWith: next.label } : {}),
      anchor: target?.anchor ? anchorLabel(target.anchor.lineStart, target.anchor.lineEnd) : null,
      ...(labels
        ? {
            plain: plainBranch(labels.flow(edge), target ? (labels.nodes.get(target.id) ?? null) : null, target, ends, edge,
              next ? (labels.nodes.get(next.id) ?? null) : undefined),
          }
        : {}),
    };
  });

  return {
    kind: 'answered',
    nodeId: chosen.id,
    question: `What happens when ${chosen.label}?`,
    anchor: chosen.anchor ? anchorLabel(chosen.anchor.lineStart, chosen.anchor.lineEnd) : null,
    branches,
    rules: rulesForElement(ruleSet, chosen.id).map((rule) => ({
      id: rule.id,
      label: rule.label,
      anchors: ruleAnchors(rule),
      ...(wording ? { sentence: wording.ruleSentence(rule) } : {}),
    })),
    ...(labels ? { plainQuestion: plainQuestionOf(labels.nodes.get(chosen.id) ?? null) } : {}),
  };
}

/** A label that says nothing — the wording's fallback. */
const NEUTRAL = /^(condition met|which case applies)\??$/i;
/** Words of the code a business reader cannot follow. */
const TECHNICAL = /sy-subrc|abap_(true|false)|<>|\b[a-z]{2}_[a-z0-9_]+\b/i;
const STOP_PREFIX = /^(stop|stopped|rejected)\s*:\s*/i;

const isPlain = (text: string): boolean => text.length > 0 && !NEUTRAL.test(text) && !TECHNICAL.test(text);

/**
 * Which decision point a business reader asks about first (owner, 03.10.2026:
 * the plant-1000 rule or the 5 % price tolerance, over a technical sy-subrc
 * check): one whose plain label says something, a business rule with a plain
 * name standing on it first, a control rule — the code ends the flow on it —
 * before the others, then one that ends the flow. Null when no decision point
 * has a plain label; then the code's own order decides. Ties go to source order.
 */
function businessChoice(
  ruleSet: BusinessRuleSet,
  gateways: SkeletonNode[],
  endsSomewhere: (g: SkeletonNode) => boolean,
  wording: ReturnType<typeof plainWordingFor> | null,
  labels: ReturnType<typeof plainLabels>,
): SkeletonNode | null {
  let best: SkeletonNode | null = null;
  let bestScore = -1;
  for (const g of gateways) {
    if (!isPlain(labels.nodes.get(g.id)?.trim() ?? '')) continue;
    const rules = rulesForElement(ruleSet, g.id);
    const score =
      (rules.some((r) => wording?.rulePhrase(r)) ? 8 : 0) +
      (rules.some((r) => r.type === 'control') ? 4 : 0) +
      (rules.length > 0 ? 2 : 0) +
      (endsSomewhere(g) ? 1 : 0);
    if (score > bestScore) {
      best = g;
      bestScore = score;
    }
  }
  return best;
}

/** "What happens at the decision point “Plant 1000?”" — or null when the label says nothing plain. */
function plainQuestionOf(label: string | null): string | null {
  const text = label?.trim() ?? '';
  if (!isPlain(text)) return null;
  return `What happens at the decision point “${text.endsWith('?') ? text : `${text}?`}”`;
}

/** One branch in plain words: where it leads, and whether the run ends there. */
function plainBranch(
  arm: string,
  targetLabel: string | null,
  target: SkeletonNode | undefined,
  ends: boolean,
  edge: SkeletonEdge,
  /**
   * Set when the branch leaves its block early and the run goes on (roadmap
   * 3.0.7): the plain name of the block it goes on with, or null when the
   * wording has none.
   */
  goesOnWith?: string | null,
): string | null {
  const when = arm.trim() || (edge.condition.length > 0 ? 'If so' : 'Otherwise');
  const where = targetLabel?.trim() ?? '';
  if (TECHNICAL.test(when)) return null;
  if (goesOnWith !== undefined) {
    const next = goesOnWith?.trim() ?? '';
    return next && !TECHNICAL.test(next)
      ? `${when}: the rest of this block is skipped, and the run goes on with “${next}”.`
      : `${when}: the rest of this block is skipped, and the run goes on.`;
  }
  if (TECHNICAL.test(where)) return null;
  if (target?.kind === 'end' && target.detail?.early !== true && !ends) {
    // The normal end of a reporting event block the run goes on from.
    return `${when}: this step is done, and the process goes on.`;
  }
  if (target?.kind === 'end-error') {
    return where
      ? `${when}: the run stops with the message “${where.replace(STOP_PREFIX, '')}”.`
      : `${when}: the run stops with an error message.`;
  }
  if (ends && target?.kind === 'end' && target.detail?.early !== true) {
    // The normal end of a routine is not the end of the run: the step is done
    // and the process goes on after it.
    return `${when}: this step is done, and the process goes on.`;
  }
  if (ends) {
    const why = where.replace(STOP_PREFIX, '');
    return why && !/^done$/i.test(why)
      ? `${when}: the run ends here — ${why.charAt(0).toLowerCase()}${why.slice(1)}.`
      : `${when}: the run ends here.`;
  }
  return where ? `${when}: it continues with “${where}”.` : null;
}
