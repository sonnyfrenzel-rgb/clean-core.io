/**
 * The decision draft of one project, as the workspace card reads it — roadmap
 * 8.4, the second half.
 *
 * `lib/project-decision-build.ts` derives a draft from its inputs; this file
 * decides *which* inputs a project has and *which revision* the draft is. Pure,
 * so that the revision rule below can be tested without a server, and kept out
 * of the client bundle all the same: it reaches the architecture contract, and
 * `GET /api/projects/{id}/decision` is the only caller.
 *
 * ## The revision rule
 *
 * The mockup's sentence is *"A later change is a new revision, not an edit."*
 * So the draft is derived twice when a decision is already on record: once
 * under the stored revision number and drafting time, and compared by
 * fingerprint. Equal means nothing moved and the stored record *is* the
 * current decision. Different means the evidence, the contract, the need or
 * the option moved since — and the draft becomes the next revision, drafted
 * now. A withdrawn decision is never re-confirmed under its old number either:
 * a confirmation after a withdrawal is a new act and gets a new revision.
 *
 * ## What the workspace binds, and what it leaves *not determined*
 *
 *   - **option** — the target architecture as `approve-architecture` signed it
 *     off (roadmap 0.7, bound to its run since 8.8). Nothing else in the
 *     product records a chosen option; a recommendation nobody signed off is
 *     not one, so it is not read.
 *   - **cost** — never bound here. The option comparison of 7.4 is held in the
 *     Economics page's own state and not stored, so there is no revision to
 *     name; the binding says so with 7.4's own sentence rather than inventing
 *     one.
 *   - **need** — the newest confirmed need revision (roadmap 3.5), counted
 *     against the subjects of the reconstructed process by the route.
 */

import type { ArchitectureContract } from './architecture-contract';
import type { OptionKind } from './cost-assumptions';
import { buildProjectDecision } from './project-decision-build';
import {
  normaliseProjectDecision,
  type DecisionConfirmation,
  type DecisionStatus,
  type ProjectDecision,
} from './project-decision';

/** The architecture codes `approve-architecture` accepts, with the words a reader sees. */
export const ARCHITECTURE_OPTION: Readonly<Record<string, { label: string; kind: OptionKind }>> = Object.freeze({
  rap: { label: 'In-App ABAP Cloud (RAP)', kind: 'rebuild' },
  cap: { label: 'Side-by-Side BTP (CAP)', kind: 'rebuild' },
  integration: { label: 'SAP Integration Suite', kind: 'rebuild' },
  event: { label: 'SAP Event Mesh', kind: 'rebuild' },
  retire: { label: 'Retire / Decommission', kind: 'retire' },
});

export interface DecisionDraftFacts {
  /** The project's active run and `evidenceDigest()` of it; `null` when there is none or it cannot be read. */
  runId: string | null;
  evidenceDigest: string | null;
  runSignedAt: string | null;
  contract: ArchitectureContract | null;
  /** `targetArchitecture` — only when `approvedByArchitect` is true. */
  signedOffArchitecture: string | null;
  need: { revision: number | null; confirmedDrops: number; undecided: number | null };
  /** An audit pack has been exported for this project (roadmap 8.5). */
  handedOver: boolean;
  /** The decision record on the project, raw — normalised here, never trusted. */
  stored: unknown;
  /** Server clock, ISO 8601. */
  now: string;
}

/** A stored decision as the card reads it: the normalised record plus the server's status and confirmation. */
export type StoredDecision = ProjectDecision & { status: DecisionStatus; confirmation: DecisionConfirmation | null };

export interface DecisionDraftAnswer {
  /** The decision the evidence gives today — what a confirmation would bind. */
  draft: ProjectDecision;
  /** The record on the project, or `null` when there is none or it cannot be read back. */
  stored: StoredDecision | null;
  /** True when the stored record is exactly the draft: nothing moved since it was written. */
  unchanged: boolean;
}

const STATUSES: readonly DecisionStatus[] = ['draft', 'confirmed', 'withdrawn', 'superseded'];

function readConfirmation(value: unknown): DecisionConfirmation | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.account !== 'string' || typeof v.at !== 'string' || typeof v.selfDeclaration !== 'string') return null;
  return { account: v.account, at: v.at, selfDeclaration: v.selfDeclaration };
}

/**
 * The stored record, read back the way `confirm-decision` reads it: normalised,
 * fingerprint recomputed. `status` and `confirmation` are the two fields the
 * normaliser drops on purpose (they are the server's), so they are re-attached
 * here from the document — which only the commands route writes.
 */
export function readStoredDecision(raw: unknown): StoredDecision | null {
  if (raw === undefined || raw === null) return null;
  const read = normaliseProjectDecision(raw);
  if (!read.ok) return null;
  const doc = raw as Record<string, unknown>;
  const status = STATUSES.includes(doc.status as DecisionStatus) ? (doc.status as DecisionStatus) : 'draft';
  return { ...read.decision, status, confirmation: readConfirmation(doc.confirmation) };
}

/** The one sentence a decision without a hand-written summary carries. Derived, like everything else in it. */
export function decisionSummary(signedOffArchitecture: string | null): string {
  const option = signedOffArchitecture ? ARCHITECTURE_OPTION[signedOffArchitecture] : undefined;
  if (!option) {
    return 'No target architecture is signed off yet, so this decision picks nothing.';
  }
  return option.kind === 'retire'
    ? 'Retire this object, as the signed-off target architecture says.'
    : `Build this object as ${option.label}, as the signed-off target architecture says.`;
}

function draftAt(facts: DecisionDraftFacts, revision: number, draftedAt: string): ProjectDecision {
  const option = facts.signedOffArchitecture ? ARCHITECTURE_OPTION[facts.signedOffArchitecture] : undefined;
  return buildProjectDecision({
    decisionId: 'DEC-1',
    revision,
    summary: decisionSummary(facts.signedOffArchitecture),
    runId: facts.runId,
    evidenceDigest: facts.evidenceDigest,
    contract: facts.contract,
    // 7.4's comparison is not stored anywhere a server could read it, so no
    // cost revision is bound — see the header.
    assumptions: null,
    comparison: null,
    chosenOptionId: option ? `${facts.signedOffArchitecture} · ${option.label}` : null,
    chosenOptionKind: option ? option.kind : null,
    need: facts.need,
    handedOver: facts.handedOver,
    timeline: {
      runSignedAt: facts.runSignedAt,
      draftedAt,
    },
  });
}

/** The draft of this project and the record it would replace — see "The revision rule" in the header. */
export function deriveDecisionDraft(facts: DecisionDraftFacts): DecisionDraftAnswer {
  const stored = readStoredDecision(facts.stored);
  if (!stored) return { draft: draftAt(facts, 1, facts.now), stored: null, unchanged: false };

  const draftedAt = stored.timeline.find((e) => e.kind === 'decision-drafted')?.at ?? facts.now;
  const same = draftAt(facts, stored.revision, draftedAt);
  if (same.fingerprint === stored.fingerprint && stored.status !== 'withdrawn') {
    return { draft: same, stored, unchanged: true };
  }
  return { draft: draftAt(facts, stored.revision + 1, facts.now), stored, unchanged: false };
}
