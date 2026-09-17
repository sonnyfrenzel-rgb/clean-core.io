/**
 * The one question that is already answered — `DESIGN.md` §5.3, §6.2, roadmap 2.7.
 *
 *   > *"Eine Frage ist schon beantwortet."* „Ask this case" zeigt beim ersten
 *   > Öffnen eine gestellte Frage mit Antwort und Ankern — **abgeleitet aus den
 *   > Verzweigungen des Codes** (Chip *Reconstructed*), ohne Modellaufruf und
 *   > ohne das Kontingent des Nutzers anzutasten.
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
 */

import { rulesForElement, type BusinessRule, type BusinessRuleSet } from './abap/business-rule-set';
import type { ProcessSkeleton, SkeletonEdge, SkeletonNode } from './abap/process-skeleton';
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
  anchor: string | null;
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
  rules: Array<{ id: string; label: string; anchors: string[] }>;
}

export interface NoQuestion {
  kind: 'none';
  /** Why there is none. Shown; never swapped for a generic invitation. */
  reason: string;
}

export type PreAnswered = AnsweredQuestion | NoQuestion;

const ENDS_FLOW = new Set(['end', 'end-error']);

function endsFlow(skeleton: ProcessSkeleton, edge: SkeletonEdge): boolean {
  if (edge.reason === 'stop' || edge.reason === 'abort' || edge.reason === 'no-return') return true;
  const target = skeleton.nodes.find((n) => n.id === edge.to);
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
): PreAnswered {
  const gateways = skeleton.nodes.filter((n) => n.kind === 'gateway');

  if (gateways.length === 0) {
    return {
      kind: 'none',
      reason:
        'This source has no branch — no IF, no CASE, no CHECK on business data. There is therefore no decision to answer in advance, and nothing here is a question the code did not ask.',
    };
  }

  const chosen =
    gateways.find((g) => outgoing(skeleton, g).some((e) => endsFlow(skeleton, e))) ??
    gateways.find((g) => rulesForElement(ruleSet, g.id).length > 0) ??
    gateways[0];

  const edges = outgoing(skeleton, chosen);
  const branches: AnsweredBranch[] = edges.map((edge) => {
    const target = skeleton.nodes.find((n) => n.id === edge.to);
    return {
      condition: edge.condition.length > 0 ? edge.condition : null,
      target: target?.label ?? edge.to,
      ...(edge.reason ? { reason: edge.reason } : {}),
      endsFlow: endsFlow(skeleton, edge),
      anchor: target?.anchor ? anchorLabel(target.anchor.lineStart, target.anchor.lineEnd) : null,
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
    })),
  };
}
