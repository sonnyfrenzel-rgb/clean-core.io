/**
 * The decision — what was decided, on what it stands, what is still open, and
 * whether it can be taken back.
 *
 * Roadmap 8.4 (`docs/ROADMAP.md` §Phase 8): *"Entscheidung: bindet Bedarf,
 * Option, Kostenrevision und Vertrag; Bedingungen mit Status; Zeitleiste;
 * umkehrbar ja/nein. Bestätigt vom Konto — „Selbstauskunft, kein
 * organisatorisches Mandat"."* Mockup screen 5, card "Open decision"
 * (`docs/roadmap/clean-core-mockups-v2_8.html:1349`).
 *
 * ## Why a record and not a flag
 *
 * The product already had a decision: `approvedByArchitect` plus a target
 * architecture, written by `approve-architecture` (roadmap 0.7, bound to the
 * run it was read from by 8.8). That is a sign-off on an architecture; it is
 * not a decision, because it cannot say what it stands on. A decision that
 * cannot name the need it serves, the option it picks, the cost revision it was
 * compared under and the architecture contract it follows is a preference with
 * a timestamp — and the four are exactly what `docs/ROADMAP.md` §16 G3 asks a
 * decision to bind.
 *
 * ## The four rules this file exists to keep
 *
 * 1. **It binds what the reader read.** `boundRunId` and `boundEvidenceDigest`
 *    come from `lib/run-evidence-digest.ts`, and the server compares both
 *    inside the transaction that writes the confirmation — the same path 8.8
 *    built for `approve-architecture`, for the same finding (CR-11). A decision
 *    bound to a run its author never saw is that defect wearing a new name.
 *
 * 2. **`status` and `confirmation` stay outside the fingerprint.** 8.2 settled
 *    this for the architecture contract and the reason carries over unchanged:
 *    a fingerprint that moved the moment the decision was confirmed could not
 *    be bound *by* the confirmation. Everything else — every binding, every
 *    condition with its status, the reversibility, the timeline — is inside,
 *    which is what makes the mockup's sentence true: *"A later change is a new
 *    revision, not an edit."*
 *
 * 3. **A condition without a status is a note.** So every condition carries
 *    one, and — the part that actually decides something — it also carries
 *    *who may set it*. A `derived` status hangs off evidence (a contract limit,
 *    a cost gap, an undecided need) and the account cannot touch it; an
 *    `attested` status is the account's own word, recorded as one. The account
 *    may never attest away a condition that rests on a blocking contract limit:
 *    a self-declaration that clears a blocker is the whole failure mode this
 *    product is built against.
 *
 * 4. **Provenance comes from `lib/provenance.ts` and nowhere else**, and *not
 *    determined* is a statement with a reason rather than an absent value —
 *    `lib/assessment-profile.ts` and `lib/architecture-contract.ts` arrange
 *    their coverage the same way, and so does this one.
 *
 * ## The seam into the cost assumptions (roadmap 7.4)
 *
 * 7.4 built `costAssumptionsManifestInput()` and deliberately left it unwired,
 * with the note that *"die Naht gehört zu dem Schritt, der eine Optionsrechnung
 * signiert (8.4)"*. This is that step, and the seam is live here:
 * `decisionManifestInputs()` in `lib/project-decision-build.ts` returns the
 * decision, the architecture contract and the cost assumptions as three entries
 * of one signed input manifest. It is
 * live only where it can be honest — assumptions whose coverage is `rejected`
 * must not be signed (`costAssumptionsManifestInput()` throws, on purpose), so
 * the decision binds *no* cost revision there and says why. What it never does
 * is invent a winner: 7.4 knows four reasons not to name one, and a decision
 * may quote the refusal but not overrule it.
 *
 * Pure data: no React, no Firestore, no `node:crypto` — producer and reader
 * must not be able to hash differently (`lib/architecture-contract.ts` says the
 * same, for the same reason).
 */

import { sha256Hex } from './artefact-digest';
import { referenceDigest, type ManifestInput } from './input-manifest';
import { PROVENANCE, type ProvenanceValue } from './provenance';
import type { OptionKind } from './cost-assumptions';

/** Format of the decision record. Bumped only when the canonical form changes. */
export const DECISION_VERSION = 1;

/**
 * The one sentence this whole step is about, and it is not written here.
 *
 * `lib/provenance.ts` already owns it as the meaning of *Confirmed*, and the
 * product may not carry two spellings of the claim that accountability is the
 * signed-in account. It is exported from here so that the record, the
 * confirmation dialog and the audit trail all read the same string rather than
 * three copies that drift (`CLAUDE.md`: *"Accountability is the signed-in
 * account (a self-declaration, not an organisational mandate)"*).
 */
export const SELF_DECLARATION = PROVENANCE.confirmed.meaning;

/* ---------------------------------------------------------------- bindings */

/** What a decision binds, in the order the card reads them (mockup: "Binds"). */
export const DECISION_BINDINGS = ['need', 'option', 'cost', 'contract', 'run'] as const;
export type DecisionBindingKey = (typeof DECISION_BINDINGS)[number];

export const DECISION_BINDING_LABELS: Readonly<Record<DecisionBindingKey, string>> = Object.freeze({
  need: 'Need revision',
  option: 'Option',
  cost: 'Cost revision',
  contract: 'Architecture contract',
  run: 'Analysis run',
});

export interface DecisionBinding {
  key: DecisionBindingKey;
  label: string;
  /**
   * The revision, id or fingerprint the decision stands on. `null` exactly
   * when `notDeterminedReason` is set — never an empty string standing in for
   * a missing binding.
   */
  revision: string | null;
  /** Why this could not be bound. Non-empty exactly when `revision` is `null`. */
  notDeterminedReason: string | null;
  /**
   * What qualifies a binding that *did* hold — a contract that is still a
   * draft, a comparison that named no cheapest option.
   *
   * A separate field rather than a second use of `notDeterminedReason`, and the
   * first cut of this file got that wrong: a binding that carried both read as
   * bound *and* not determined, and a reader would have been entitled to
   * believe either. `readBinding()` refuses that shape, so the distinction is
   * enforced and not merely intended.
   */
  note: string | null;
  /** One of the nine values of `lib/provenance.ts`. Nothing else is provenance. */
  provenance: ProvenanceValue;
}

/* -------------------------------------------------------------- conditions */

/**
 * Where a condition came from — and therefore who may move its status.
 *
 * The first four are derived from evidence and the account cannot set them;
 * `account` is the reader's own condition and only the account sets it. The
 * distinction is not cosmetic: a product whose blockers can be clicked away is
 * a product whose blockers mean nothing.
 */
export const CONDITION_SOURCES = ['contract-limit', 'cost-gap', 'need-open', 'account'] as const;
export type ConditionSource = (typeof CONDITION_SOURCES)[number];

export const CONDITION_STATUSES = ['open', 'met', 'waived', 'not-determined'] as const;
export type ConditionStatus = (typeof CONDITION_STATUSES)[number];

/** Who the status belongs to. `derived` is the evidence's, `attested` the account's. */
export type ConditionStatusBasis = 'derived' | 'attested';

export interface DecisionCondition {
  /** Stable within one decision, and stable across revisions of it. */
  id: string;
  /** What has to hold. One sentence, never empty. */
  text: string;
  source: ConditionSource;
  status: ConditionStatus;
  statusBasis: ConditionStatusBasis;
  /**
   * What a derived status hangs off — the contract limit code, the cost gap
   * code, the subject. `null` for an account's own condition, which hangs off
   * nothing but the account.
   */
  evidence: string | null;
  /** The account's word and when it gave it. Non-null exactly when `statusBasis` is `attested`. */
  attestation: { account: string; at: string; note: string } | null;
  provenance: ProvenanceValue;
}

/**
 * Whether the account may set this condition's status at all.
 *
 * Two refusals, and they are different refusals:
 *
 *   - a **derived** condition's status is the evidence's answer. Attesting it
 *     would overwrite a measurement with an opinion, and the measurement would
 *     still be true.
 *   - a condition resting on a **blocking** contract limit may not be attested
 *     even as an account condition: `contractCoverage()` calls those `blocks`
 *     precisely because nothing may be bound against them, and a self
 *     declaration is not a substitute for the target context the run never
 *     bound.
 */
export function conditionAttestable(condition: DecisionCondition): boolean {
  if (condition.statusBasis === 'derived') return false;
  return true;
}

/* ---------------------------------------------------------------- timeline */

export const TIMELINE_KINDS = [
  'run-signed',
  'cost-stated',
  'contract-drafted',
  'decision-drafted',
  'condition-attested',
  'decision-confirmed',
  'decision-withdrawn',
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export interface DecisionTimelineEntry {
  /** ISO 8601, from a server clock. A timeline of browser times is a guess. */
  at: string;
  kind: TimelineKind;
  sentence: string;
  /** The account, where the entry is somebody's act; `null` where it is the engine's. */
  account: string | null;
}

/** The dated facts a decision's timeline is built from. Every one may be absent. */
export interface DecisionTimelineFacts {
  runSignedAt?: string | null;
  costStatedAt?: string | null;
  contractDraftedAt?: string | null;
  draftedAt: string;
  confirmedAt?: string | null;
  withdrawnAt?: string | null;
  confirmedBy?: string | null;
}

/* ----------------------------------------------------------- reversibility */

/**
 * The answer to *"umkehrbar ja/nein"*, and the boundary it is true inside.
 *
 * The boundary is not a hedge, it is the honest half of the answer. This
 * product sees its own record; it does not see the customer's SAP system, and
 * it has no transport, no landscape and no connection to one. So "reversible"
 * can only ever mean *reversible here*, and the record says so rather than
 * implying a reach it does not have.
 */
export type ReversibilityAnswer = 'reversible' | 'irreversible' | 'not-determined';

export interface Reversibility {
  answer: ReversibilityAnswer;
  /** What the answer is true inside. `null` only when there is no answer. */
  boundary: string | null;
  /** Never empty — a bare "no" is as useless as a bare "not determined". */
  reason: string;
}

/**
 * Three answers from two observable facts, and a documented refusal to guess.
 *
 * What is observable: which kind of option was chosen, whether anything of this
 * decision has left the product as a handover, and whether the need behind it
 * carries a confirmed *drop*. What is not observable: everything that happens
 * after the handover — a transport, a rollback, a decommissioning. The rules:
 *
 *   1. **No option chosen** → not determined. Nothing has been decided, so
 *      there is nothing to reverse. (`boundary` is `null` here and only here.)
 *   2. **Nothing handed over** → reversible. Withdrawing the decision is a new
 *      revision of a record this product holds in full; no artefact of it has
 *      been delivered anywhere.
 *   3. **Handed over, and the option retires behaviour that a confirmed need
 *      drop gives up** → irreversible. Not because the target system cannot be
 *      restored — this product cannot know that — but because what the decision
 *      gives up can only come back as a new build. Undoing it is not an undo.
 *   4. **Handed over, anything else** → not determined, naming the handover as
 *      the reason: the package has left this product and what the target system
 *      did with it is not observable here.
 *
 * Rule 3 is the only path to "no", and it is deliberately narrow: a `retire`
 * option whose need was never confirmed as a drop falls to rule 4, because the
 * giving-up is then this product's inference rather than the reader's decision.
 */
export function decisionReversibility(args: {
  optionKind: OptionKind | null;
  handedOver: boolean;
  /** How many elements of the need carry a confirmed `drop` (roadmap 3.5). */
  confirmedDrops: number;
}): Reversibility {
  const boundary = 'this product — it holds the record, not the target system';
  if (args.optionKind === null) {
    return {
      answer: 'not-determined',
      boundary: null,
      reason:
        'No option is chosen yet, so there is nothing to reverse. Reversibility is a property of a decision, not of a draft that has not made one.',
    };
  }
  if (!args.handedOver) {
    return {
      answer: 'reversible',
      boundary,
      reason:
        'Nothing of this decision has left the product: no handover package has been produced. Withdrawing it is a new revision of a record held here in full, and no artefact has been delivered to a target system.',
    };
  }
  if (args.optionKind === 'retire' && args.confirmedDrops > 0) {
    return {
      answer: 'irreversible',
      boundary,
      reason: `This decision retires behaviour that ${args.confirmedDrops} confirmed need decision(s) give up, and a handover package for it has left this product. Reversing it is not an undo: what was given up can only come back as a new build, decided again.`,
    };
  }
  return {
    answer: 'not-determined',
    boundary,
    reason:
      'A handover package for this decision has left this product. What the target system did with it — transported, rolled back, or nothing — is not observable here, and this record will not guess at it.',
  };
}

/* ------------------------------------------------------------ the document */

/** The decision's lifecycle. Outside the fingerprint — see rule 2 in the header. */
export type DecisionStatus = 'draft' | 'confirmed' | 'withdrawn' | 'superseded';

export interface DecisionConfirmation {
  /** The address on the verified ID token. The server's answer to "who", never the browser's. */
  account: string;
  /** Server clock, ISO 8601. */
  at: string;
  /** Always `SELF_DECLARATION`. Carried in the record so an export cannot drop it. */
  selfDeclaration: string;
}

export interface ProjectDecision {
  decisionVersion: typeof DECISION_VERSION;
  /** `DEC-1`, `DEC-2` … the decision's name inside the project. */
  decisionId: string;
  /** The mockup's "revision 3". A change is a new revision, never an edit. */
  revision: number;
  status: DecisionStatus;
  /** The headline of the card: what is decided, in one sentence. */
  summary: string;
  /** The run this decision was read from (roadmap 8.8). */
  boundRunId: string;
  /** `evidenceDigest()` of that run, as the reader saw it. */
  boundEvidenceDigest: string;
  /** In `DECISION_BINDINGS` order. All five, always. */
  bindings: DecisionBinding[];
  /** Sorted by id. May be empty — and an empty list is a statement, not a gap. */
  conditions: DecisionCondition[];
  reversibility: Reversibility;
  /** Sorted by `at`, then by the order of `TIMELINE_KINDS`. */
  timeline: DecisionTimelineEntry[];
  /** Written by the server on confirmation and by nothing else. Outside the fingerprint. */
  confirmation: DecisionConfirmation | null;
  /** SHA-256 over `canonicalProjectDecision` — the one value a reader compares. */
  fingerprint: string;
}

/* -------------------------------------------------- clear, qualified, blocked */

export const DECISION_GAP_CODES = [
  /** No run is bound, so the decision stands on nothing readable. */
  'run-not-bound',
  /** No architecture contract is bound. */
  'contract-not-bound',
  /** The bound contract is blocked — `contractBindable()` is false. */
  'contract-blocked',
  /** No option is chosen. A decision that picks nothing decides nothing. */
  'option-not-chosen',
  /** The bound contract is still a draft. */
  'contract-draft',
  /** No confirmed need revision (roadmap 3.5) stands behind the decision. */
  'need-not-confirmed',
  /** No cost revision at all: nothing was priced. */
  'cost-not-bound',
  /** A cost revision whose coverage is `unconfirmed`. */
  'cost-unconfirmed',
  /** The comparison names no cheapest option, for one of 7.4's four reasons. */
  'cost-no-winner',
  /** A condition is still open. */
  'condition-open',
  /** Reversibility could not be determined. */
  'reversibility-not-determined',
] as const;
export type DecisionGapCode = (typeof DECISION_GAP_CODES)[number];

/**
 * Two severities, the pair `lib/architecture-contract.ts` and
 * `lib/assessment-profile.ts` both use:
 *
 *   - `blocks` — the decision may not be confirmed and may not become a signed
 *     input. `decisionManifestInput()` throws.
 *   - `qualifies` — it may be confirmed, and it is carried as qualified
 *     everywhere, including in the revision string a manifest records.
 */
export type DecisionGapSeverity = 'blocks' | 'qualifies';

export interface DecisionGap {
  code: DecisionGapCode;
  severity: DecisionGapSeverity;
  subject: string | null;
  sentence: string;
}

const GAP_SENTENCES: Record<DecisionGapCode, (subject: string | null) => string> = {
  'run-not-bound': () =>
    'This decision names no analysis run. There is nothing for it to be a decision about, and nothing a confirmation could be bound to.',
  'contract-not-bound': () =>
    'No architecture contract is bound. What is built, against which target and on which inputs would then be decided by whoever generates next, not here.',
  'contract-blocked': (s) =>
    `The architecture contract cannot be bound: ${s ?? 'it carries a blocking limit.'} A decision that binds it anyway would sign a contract the contract itself refuses.`,
  'option-not-chosen': () =>
    'No option is chosen. A decision that picks nothing is a note, and this record will not present one as a decision.',
  'contract-draft': (s) =>
    `The architecture contract ${s ?? ''} is still a draft. The decision binds it as it stands and says so; it does not promote it.`.replace(
      '  ',
      ' ',
    ),
  'need-not-confirmed': () =>
    'No confirmed need revision stands behind this decision (roadmap 3.5). It decides what to build without a record of what has to hold, so it is carried as qualified rather than as substantiated.',
  'cost-not-bound': (s) =>
    `No cost revision is bound: ${s ?? 'the assumptions carry no amount.'} The decision is made without a priced comparison, and says so instead of implying one.`,
  'cost-unconfirmed': (s) =>
    `The cost revision is unconfirmed: ${s ?? 'part of the assumptions was never confirmed.'} Every amount it carries is a simulation on unconfirmed input.`,
  'cost-no-winner': (s) =>
    `The comparison names no cheapest option: ${s ?? ''} The decision may still be made — it just may not be presented as the cheapest one.`.replace(
      '  ',
      ' ',
    ),
  'condition-open': (s) => `Condition ${s} is open and is carried with the decision rather than resolved by it.`,
  'reversibility-not-determined': (s) =>
    `Whether this decision can be reversed is not determined: ${s ?? 'the reason is recorded with the answer.'}`,
};

function gap(code: DecisionGapCode, severity: DecisionGapSeverity, subject: string | null): DecisionGap {
  return { code, severity, subject, sentence: GAP_SENTENCES[code](subject) };
}

export type DecisionState = 'clear' | 'qualified' | 'blocked';

export interface DecisionCoverage {
  state: DecisionState;
  /** Sorted by code, then subject — same decision, same list, same order. */
  gaps: DecisionGap[];
  /** One sentence for the reader. Empty string when the decision is clear. */
  sentence: string;
}

const bindingOf = (decision: ProjectDecision, key: DecisionBindingKey): DecisionBinding | undefined =>
  decision.bindings.find((b) => b.key === key);

/**
 * Roadmap 8.4, in one function: **a decision that cannot show what it stands on
 * is never treated like one that can.**
 *
 * Built like `contractCoverage()` — it does not look for proof that the
 * decision is unusable and, finding none, call it clear. It collects what every
 * binding and every condition already recorded and lets the severities decide.
 *
 * The one judgement call worth naming, because it is the difference between a
 * usable product and a locked one: a missing **cost** revision *qualifies*, it
 * does not block. 7.4 knows four reasons why a comparison may name no cheapest
 * option, and `docs/ROADMAP.md` line 498 requires that none of them be turned
 * into a winner. A decision without a priced comparison is a legitimate
 * decision badly supported — so it is carried, visibly, as qualified. A missing
 * **contract** or a missing **option** does block, because neither leaves
 * anything for the decision to be about.
 */
export function decisionCoverage(decision: ProjectDecision | null | undefined): DecisionCoverage {
  if (!decision) {
    const only = gap('contract-not-bound', 'blocks', null);
    return { state: 'blocked', gaps: [only], sentence: only.sentence };
  }
  const gaps: DecisionGap[] = [];

  if (!decision.boundRunId || !decision.boundEvidenceDigest) gaps.push(gap('run-not-bound', 'blocks', null));

  const contract = bindingOf(decision, 'contract');
  if (!contract || contract.revision === null) {
    gaps.push(gap('contract-not-bound', 'blocks', contract?.notDeterminedReason ?? null));
  } else if (contract.revision.startsWith('blocked:')) {
    gaps.push(gap('contract-blocked', 'blocks', contract.revision));
  } else if (contract.revision.startsWith('qualified:') || contract.provenance === 'proposed') {
    gaps.push(gap('contract-draft', 'qualifies', contract.revision));
  }

  const option = bindingOf(decision, 'option');
  if (!option || option.revision === null) {
    gaps.push(gap('option-not-chosen', 'blocks', option?.notDeterminedReason ?? null));
  }

  const need = bindingOf(decision, 'need');
  if (!need || need.revision === null) gaps.push(gap('need-not-confirmed', 'qualifies', null));

  const cost = bindingOf(decision, 'cost');
  if (!cost || cost.revision === null) {
    gaps.push(gap('cost-not-bound', 'qualifies', cost?.notDeterminedReason ?? null));
  } else if (cost.revision.startsWith('unconfirmed:')) {
    gaps.push(gap('cost-unconfirmed', 'qualifies', cost.revision));
  }
  if (cost && cost.revision !== null && cost.provenance === 'not-determined') {
    gaps.push(gap('cost-no-winner', 'qualifies', cost.note));
  }

  for (const condition of decision.conditions) {
    if (condition.status === 'open' || condition.status === 'not-determined') {
      gaps.push(gap('condition-open', 'qualifies', condition.id));
    }
  }

  if (decision.reversibility.answer === 'not-determined') {
    gaps.push(gap('reversibility-not-determined', 'qualifies', decision.reversibility.reason));
  }

  gaps.sort((a, b) => a.code.localeCompare(b.code) || (a.subject || '').localeCompare(b.subject || ''));
  const state: DecisionState = gaps.some((g) => g.severity === 'blocks')
    ? 'blocked'
    : gaps.length > 0
      ? 'qualified'
      : 'clear';
  const relevant = state === 'blocked' ? gaps.filter((g) => g.severity === 'blocks') : gaps;
  return { state, gaps, sentence: relevant.map((g) => g.sentence).join(' ') };
}

/**
 * Whether this decision may be confirmed and signed at all.
 *
 * A function rather than a string comparison at each call site, so that
 * "blocked" cannot be softened into a badge by whoever renders it —
 * `contractBindable()` and `assessmentAllowed()` exist for the same reason.
 */
export function decisionConfirmable(decision: ProjectDecision | null | undefined): boolean {
  return decisionCoverage(decision).state !== 'blocked';
}

/* ------------------------------------------- canonical form and fingerprint */

/**
 * Canonical form: one line per part, fixed order, no whitespace beyond the line
 * break.
 *
 * Prose enters as `sha256` of its text rather than as the text, for the reason
 * `canonicalArchitectureContract()` gives: a sentence may contain any separator
 * this format could pick, and a canonicaliser a semicolon can break is not one.
 *
 * `status` and `confirmation` are deliberately absent. See rule 2 in the file
 * header — a fingerprint that changed on confirmation could not be bound by the
 * confirmation. Everything else is present, condition statuses included, which
 * is what makes a later change a new revision rather than an edit.
 */
export function canonicalProjectDecision(decision: ProjectDecision): string {
  // One JSON array per line. Every value the record carries verbatim — ids, an
  // account, a timestamp, an evidence ref — is a JSON string, so no separator
  // and no line break inside a value can move a boundary. The form this
  // replaces joined raw values with `@`, `#` and `;`: an attestation by `a@b`
  // at `c` and one by `a` at `b@c` had the same canonical line, and so the same
  // fingerprint (QA review of 4b4586aff273).
  const line = (tag: string, ...values: unknown[]) => `${tag}=${JSON.stringify(values)}`;
  const lines: string[] = [
    line('v', decision.decisionVersion),
    line('decision', decision.decisionId),
    line('revision', decision.revision),
    line('summary', sha256Hex(decision.summary)),
    line('run', decision.boundRunId),
    line('evidence', sha256Hex(decision.boundEvidenceDigest)),
    line(
      'reversible',
      decision.reversibility.answer,
      sha256Hex(decision.reversibility.boundary ?? ''),
      sha256Hex(decision.reversibility.reason),
    ),
  ];
  for (const key of DECISION_BINDINGS) {
    const binding = decision.bindings.find((b) => b.key === key);
    if (!binding) {
      lines.push(line('bind', key, 'absent'));
      continue;
    }
    lines.push(
      line(
        'bind',
        key,
        binding.revision === null ? null : sha256Hex(binding.revision),
        binding.revision === null ? sha256Hex(binding.notDeterminedReason ?? '') : null,
        sha256Hex(binding.note ?? ''),
        binding.provenance,
      ),
    );
  }
  for (const condition of decision.conditions) {
    lines.push(
      line(
        'cond',
        condition.id,
        condition.source,
        condition.status,
        condition.statusBasis,
        condition.evidence,
        sha256Hex(condition.text),
        condition.attestation
          ? [condition.attestation.account, condition.attestation.at, sha256Hex(condition.attestation.note)]
          : null,
        condition.provenance,
      ),
    );
  }
  for (const entry of decision.timeline) {
    lines.push(line('event', entry.at, entry.kind, entry.account, sha256Hex(entry.sentence)));
  }
  return lines.join('\n');
}

/**
 * The canonical form before the QA review of 4b4586aff273, kept for one purpose
 * only: a record stored under it still carries its old fingerprint, and
 * `normaliseProjectDecision()` accepts that value as "the fingerprint of this
 * record" so a decision on record does not become unreadable with the format
 * change. What it returns is always the fingerprint of the current form.
 */
function legacyCanonicalProjectDecision(decision: ProjectDecision): string {
  const lines: string[] = [
    `v${decision.decisionVersion}`,
    `decision=${decision.decisionId}`,
    `revision=${decision.revision}`,
    `summary=${sha256Hex(decision.summary)}`,
    `run=${decision.boundRunId}`,
    `evidence=${sha256Hex(decision.boundEvidenceDigest)}`,
    `reversible=${decision.reversibility.answer};boundary=${sha256Hex(
      decision.reversibility.boundary ?? '',
    )};why=${sha256Hex(decision.reversibility.reason)}`,
  ];
  for (const key of DECISION_BINDINGS) {
    const binding = decision.bindings.find((b) => b.key === key);
    if (!binding) {
      lines.push(`bind=${key};absent`);
      continue;
    }
    lines.push(
      `bind=${key};rev=${sha256Hex(
        binding.revision ?? `not-determined:${binding.notDeterminedReason ?? ''}`,
      )};note=${sha256Hex(binding.note ?? '')};prov=${binding.provenance}`,
    );
  }
  for (const condition of decision.conditions) {
    lines.push(
      `cond=${condition.id};src=${condition.source};status=${condition.status};basis=${
        condition.statusBasis
      };ev=${condition.evidence ?? ''};text=${sha256Hex(condition.text)};att=${
        condition.attestation
          ? `${condition.attestation.account}@${condition.attestation.at}#${sha256Hex(condition.attestation.note)}`
          : 'none'
      };prov=${condition.provenance}`,
    );
  }
  for (const entry of decision.timeline) {
    lines.push(`event=${entry.at};${entry.kind};${entry.account ?? ''};${sha256Hex(entry.sentence)}`);
  }
  return lines.join('\n');
}

/** SHA-256 over the canonical form, lowercase hex. Same content, same value. */
export function decisionFingerprint(decision: ProjectDecision): string {
  return sha256Hex(canonicalProjectDecision(decision));
}

/* ----------------------------------- the seam into the signed input manifest */

/** The input id a decision occupies in a downstream run's manifest. */
export const DECISION_INPUT_ID = 'decision:architecture';

/**
 * The revision string a manifest records for this decision.
 *
 * Same construction as `contractRevision()`: the facts a reader would compare,
 * twelve characters of the fingerprint, and `qualified:` in front when the
 * coverage is not clear. The manifest sits inside a signature, and a decision
 * we could not fully substantiate must not be signed as though we had.
 */
export function decisionRevision(decision: ProjectDecision): string {
  const fp = decisionFingerprint(decision).slice(0, 12);
  const core = `${decision.decisionId}/r${decision.revision}@${decision.boundRunId}+${fp}`;
  return decisionCoverage(decision).state === 'clear' ? core : `qualified:${core}`;
}

/**
 * The decision as an entry of a signed input manifest.
 *
 * `dataClass: 'source-artefact'`, because the handover package of 8.5 is
 * assembled *against* the decision: a decision that moved makes the package a
 * statement about a different one, and `invalidatingInputs()` keeps
 * source-artefact divergences.
 *
 * `binding: 'reference'`, because the holder holds the decision by name and
 * revision — and the revision already carries the fingerprint, so a changed
 * decision is a changed reference.
 *
 * Throws on a blocked decision, for the reason `contractManifestInput()` and
 * `profileManifestInput()` throw: a refusal that can still be signed is not a
 * refusal.
 */
export function decisionManifestInput(decision: ProjectDecision): ManifestInput {
  const coverage = decisionCoverage(decision);
  if (coverage.state === 'blocked') {
    throw new Error(`A decision that cannot be confirmed must not become a signed input: ${coverage.sentence}`);
  }
  const revision = decisionRevision(decision);
  return {
    id: DECISION_INPUT_ID,
    dataClass: 'source-artefact',
    revision,
    binding: 'reference',
    sha256: referenceDigest(DECISION_INPUT_ID, revision),
  };
}

/**
 * A decision bound to nothing — every binding *not determined*, with the reason
 * that nothing has been decided yet.
 *
 * `emptyCostAssumptions()` exists for the same purpose: a starting point that
 * is honest rather than empty. It is `blocked` by `decisionCoverage()`, which
 * is the correct answer and the reason it is safe to hand around — nothing can
 * confirm or sign one.
 */
export function emptyProjectDecision(): ProjectDecision {
  const decision: ProjectDecision = {
    decisionVersion: DECISION_VERSION,
    decisionId: 'DEC-1',
    revision: 1,
    status: 'draft',
    summary: 'Nothing has been decided yet.',
    boundRunId: '',
    boundEvidenceDigest: '',
    bindings: DECISION_BINDINGS.map((key) => ({
      key,
      label: DECISION_BINDING_LABELS[key],
      revision: null,
      notDeterminedReason: 'Nothing has been decided yet, so this decision binds nothing.',
      note: null,
      provenance: 'not-determined' as ProvenanceValue,
    })),
    conditions: [],
    reversibility: decisionReversibility({ optionKind: null, handedOver: false, confirmedDrops: 0 }),
    timeline: [],
    confirmation: null,
    fingerprint: '',
  };
  decision.fingerprint = decisionFingerprint(decision);
  return decision;
}

/* ------------------------------------------------- reading one back safely */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Ceilings the rules could never express, the shape `lib/project-commands.ts` uses for its imports. */
export const DECISION_MAX_CONDITIONS = 500;
export const DECISION_MAX_TIMELINE = 500;
export const DECISION_MAX_TEXT = 4000;

const str = (v: unknown, max = DECISION_MAX_TEXT): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

/** `2026-09-23T11:00:00.000Z` — UTC, as `Date.prototype.toISOString()` writes it, and a real date. */
function isIsoInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  // `Date.parse` rolls `2026-02-31` over into March instead of refusing it; the
  // date and time the string names have to be the ones it parses to.
  return new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function readBinding(value: unknown): DecisionBinding | null {
  if (!isPlainObject(value)) return null;
  const key = value.key;
  if (typeof key !== 'string' || !(DECISION_BINDINGS as readonly string[]).includes(key)) return null;
  const revision = typeof value.revision === 'string' ? str(value.revision) : null;
  const reason = typeof value.notDeterminedReason === 'string' ? str(value.notDeterminedReason) : null;
  // The invariant the type states, enforced rather than assumed: exactly one of
  // the two is present. A binding with both would read as bound *and* not
  // determined, and a reader would be entitled to believe either.
  if ((revision === null) === (reason === null)) return null;
  const provenance = value.provenance;
  if (typeof provenance !== 'string' || !(provenance in PROVENANCE)) return null;
  return {
    key: key as DecisionBindingKey,
    label: DECISION_BINDING_LABELS[key as DecisionBindingKey],
    revision,
    notDeterminedReason: reason,
    note: typeof value.note === 'string' ? str(value.note) : null,
    provenance: provenance as ProvenanceValue,
  };
}

function readCondition(value: unknown): DecisionCondition | null {
  if (!isPlainObject(value)) return null;
  const id = str(value.id, 300);
  const text = str(value.text);
  const source = value.source;
  const status = value.status;
  const basis = value.statusBasis;
  if (!id || !text) return null;
  if (typeof source !== 'string' || !(CONDITION_SOURCES as readonly string[]).includes(source)) return null;
  if (typeof status !== 'string' || !(CONDITION_STATUSES as readonly string[]).includes(status)) return null;
  if (basis !== 'derived' && basis !== 'attested') return null;
  const provenance = value.provenance;
  if (typeof provenance !== 'string' || !(provenance in PROVENANCE)) return null;

  let attestation: DecisionCondition['attestation'] = null;
  if (isPlainObject(value.attestation)) {
    const account = str(value.attestation.account, 320);
    const at = str(value.attestation.at, 40);
    const note = str(value.attestation.note);
    if (!account || !at || !note) return null;
    // When the account said it is a point in time, not free text.
    if (!isIsoInstant(at)) return null;
    attestation = { account, at, note };
  }
  // `statusBasis` and `attestation` say the same thing twice, so they have to
  // agree: an attested condition without an attestation is an account's word
  // with nobody's name on it, and a derived one carrying an attestation is a
  // measurement with somebody's name on it. Both are refused rather than
  // repaired — repairing would pick which half to believe.
  if ((basis === 'attested') !== (attestation !== null)) return null;
  // And the rule of rule 3 in the header, enforced where a record enters the
  // product rather than only where the UI builds one.
  if (basis === 'derived' && status !== 'open' && status !== 'met') return null;

  return {
    id,
    text,
    source: source as ConditionSource,
    status: status as ConditionStatus,
    statusBasis: basis,
    evidence: typeof value.evidence === 'string' ? str(value.evidence, 300) : null,
    attestation,
    provenance: provenance as ProvenanceValue,
  };
}

function readTimelineEntry(value: unknown): DecisionTimelineEntry | null {
  if (!isPlainObject(value)) return null;
  const at = str(value.at, 40);
  const sentence = str(value.sentence);
  const kind = value.kind;
  if (!at || !sentence) return null;
  if (typeof kind !== 'string' || !(TIMELINE_KINDS as readonly string[]).includes(kind)) return null;
  return {
    at,
    kind: kind as TimelineKind,
    sentence,
    account: typeof value.account === 'string' ? str(value.account, 320) : null,
  };
}

/**
 * A decision record from outside, reduced to what the model declares — and its
 * fingerprint **recomputed**, never believed.
 *
 * The same shallow contract `normaliseUsageReport()` and `normaliseAtcReport()`
 * keep, with the one addition this record needs: the browser sends a
 * fingerprint, and a fingerprint a browser chose is a fingerprint a browser can
 * make agree with anything. So the value on the wire is compared with the value
 * this file computes from the normalised record, and a mismatch is a refusal
 * rather than a correction — correcting it would store a decision nobody read.
 *
 * `status` and `confirmation` are dropped on the way in. They are the server's
 * answer (`lib/project-commands.ts`), and a record that could arrive
 * pre-confirmed would make the confirmation command decorative.
 */
export function normaliseProjectDecision(
  value: unknown,
): { ok: true; decision: ProjectDecision } | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: 'decision must be an object.' };
  if (value.decisionVersion !== DECISION_VERSION) {
    return { ok: false, error: `decision.decisionVersion must be ${DECISION_VERSION}.` };
  }
  const decisionId = str(value.decisionId, 100);
  if (!decisionId) return { ok: false, error: 'decision.decisionId is missing.' };
  const revision = value.revision;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1 || revision > 10_000) {
    return { ok: false, error: 'decision.revision must be a whole number of at least 1.' };
  }
  const summary = str(value.summary);
  if (!summary) return { ok: false, error: 'decision.summary is missing or too long.' };
  if (typeof value.boundRunId !== 'string' || typeof value.boundEvidenceDigest !== 'string') {
    return { ok: false, error: 'decision.boundRunId and decision.boundEvidenceDigest must be strings.' };
  }

  if (!Array.isArray(value.bindings)) return { ok: false, error: 'decision.bindings must be a list.' };
  const bindings: DecisionBinding[] = [];
  for (const key of DECISION_BINDINGS) {
    const raw = (value.bindings as unknown[]).find((b) => isPlainObject(b) && b.key === key);
    const binding = readBinding(raw);
    if (!binding) return { ok: false, error: `decision.bindings is missing a readable "${key}" binding.` };
    bindings.push(binding);
  }

  if (!Array.isArray(value.conditions)) return { ok: false, error: 'decision.conditions must be a list.' };
  if (value.conditions.length > DECISION_MAX_CONDITIONS) {
    return { ok: false, error: `decision.conditions exceeds ${DECISION_MAX_CONDITIONS} rows.` };
  }
  const conditions: DecisionCondition[] = [];
  for (const row of value.conditions) {
    const condition = readCondition(row);
    if (!condition) return { ok: false, error: 'decision.conditions holds a row this server cannot read.' };
    conditions.push(condition);
  }

  if (!Array.isArray(value.timeline)) return { ok: false, error: 'decision.timeline must be a list.' };
  if (value.timeline.length > DECISION_MAX_TIMELINE) {
    return { ok: false, error: `decision.timeline exceeds ${DECISION_MAX_TIMELINE} rows.` };
  }
  const timeline: DecisionTimelineEntry[] = [];
  for (const row of value.timeline) {
    const entry = readTimelineEntry(row);
    if (!entry) return { ok: false, error: 'decision.timeline holds a row this server cannot read.' };
    timeline.push(entry);
  }

  const rev = isPlainObject(value.reversibility) ? value.reversibility : null;
  const answer = rev?.answer;
  const reason = rev ? str(rev.reason) : null;
  if (
    typeof answer !== 'string' ||
    !['reversible', 'irreversible', 'not-determined'].includes(answer) ||
    !reason
  ) {
    return { ok: false, error: 'decision.reversibility must carry an answer and a reason.' };
  }

  const decision: ProjectDecision = {
    decisionVersion: DECISION_VERSION,
    decisionId,
    revision,
    status: 'draft',
    summary,
    boundRunId: value.boundRunId,
    boundEvidenceDigest: value.boundEvidenceDigest,
    bindings,
    conditions,
    reversibility: {
      answer: answer as ReversibilityAnswer,
      boundary: rev && typeof rev.boundary === 'string' ? str(rev.boundary) : null,
      reason,
    },
    timeline,
    confirmation: null,
    fingerprint: '',
  };
  decision.fingerprint = decisionFingerprint(decision);

  if (
    typeof value.fingerprint === 'string' &&
    value.fingerprint !== decision.fingerprint &&
    value.fingerprint !== sha256Hex(legacyCanonicalProjectDecision(decision))
  ) {
    return {
      ok: false,
      error:
        'decision.fingerprint does not match the record it is on. The decision this server read is not the decision that was sent.',
    };
  }
  return { ok: true, decision };
}
