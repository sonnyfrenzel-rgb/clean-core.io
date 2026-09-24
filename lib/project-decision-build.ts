/**
 * The decision draft, derived — roadmap 8.4, and the seam roadmap 7.4 left open.
 *
 * Its own module for the reason `lib/it-findings-build.ts` is one: the record
 * in `lib/project-decision.ts` is read by the browser (it renders the card) and
 * by `lib/project-commands.ts` (it normalises what arrives), while *deriving*
 * one needs the architecture contract of 8.2 and the cost assumptions of 7.4.
 * Keeping the derivation here means the validator a client bundle pulls in does
 * not drag the contract, the router and the cost engine along behind it.
 *
 * Nothing here writes; nothing here decides. It turns evidence that already
 * exists — a contract's limits, a comparison's refusal, a need's undecided
 * elements — into a draft whose every condition was derived rather than
 * remembered. That is the point: a decision whose conditions were typed by hand
 * carries the conditions somebody thought of, and the blocking ones are exactly
 * the ones nobody thinks of.
 */

import type { ManifestInput } from './input-manifest';
import type { ProvenanceValue } from './provenance';
import {
  contractCoverage,
  contractFingerprint,
  contractManifestInput,
  contractRevision,
  type ArchitectureContract,
  type ContractLimit,
} from './architecture-contract';
import {
  costAssumptionsCoverage,
  costAssumptionsManifestInput,
  costAssumptionsRevision,
  type CostAssumptions,
  type CostComparison,
} from './cost-assumptions';
import {
  DECISION_BINDING_LABELS,
  DECISION_VERSION,
  SELF_DECLARATION,
  TIMELINE_KINDS,
  decisionFingerprint,
  decisionManifestInput,
  decisionReversibility,
  type ConditionStatus,
  type DecisionBinding,
  type DecisionBindingKey,
  type DecisionCondition,
  type DecisionTimelineEntry,
  type DecisionTimelineFacts,
  type ProjectDecision,
  type TimelineKind,
} from './project-decision';

/**
 * The three inputs a signed option decision stands on — **this is the seam
 * roadmap 7.4 left for 8.4.**
 *
 * 7.4 built `costAssumptionsManifestInput()` and did not wire it, because the
 * analysis run it would have been wired into never read a day rate: *"Die Naht
 * gehört zu dem Schritt, der eine Optionsrechnung signiert (8.4)."* A decision
 * *is* that step — it binds a cost revision by name — so the assumptions become
 * a signed input here and nowhere earlier.
 *
 * Where the seam stays shut, and why that is the same decision rather than an
 * exception: assumptions whose coverage is `rejected` must not be signed, and
 * `costAssumptionsManifestInput()` throws on them on purpose. This function
 * does not catch that by inventing an entry; it omits the input, and the
 * decision's own `cost` binding already reads *not determined* with the
 * coverage sentence as its reason. A manifest that lists assumptions the
 * product refused to stand behind would be worse than one that lists none.
 */
export function decisionManifestInputs(
  decision: ProjectDecision,
  sources: { contract?: ArchitectureContract | null; assumptions?: CostAssumptions | null },
): ManifestInput[] {
  const inputs: ManifestInput[] = [decisionManifestInput(decision)];
  if (sources.contract && contractCoverage(sources.contract).state !== 'blocked') {
    inputs.push(contractManifestInput(sources.contract));
  }
  if (sources.assumptions && costAssumptionsCoverage(sources.assumptions).state !== 'rejected') {
    inputs.push(costAssumptionsManifestInput(sources.assumptions));
  }
  return inputs;
}



/** An account's word on one condition, carried from one revision into the next. */
export interface ConditionAttestation {
  conditionId: string;
  status: ConditionStatus;
  account: string;
  at: string;
  note: string;
}

export interface BuildDecisionArgs {
  decisionId?: string;
  revision?: number;
  summary: string;
  runId: string | null;
  evidenceDigest: string | null;
  contract: ArchitectureContract | null;
  assumptions: CostAssumptions | null;
  comparison: CostComparison | null;
  /** The option the reader picked, by id. `null` while none is picked. */
  chosenOptionId: string | null;
  /** The confirmed need (roadmap 3.5): its revision, and what it decided. */
  need: { revision: number | null; confirmedDrops: number; undecided: number };
  /** Has a handover package for this project left the product (roadmap 8.5)? */
  handedOver: boolean;
  attestations?: readonly ConditionAttestation[];
  timeline: DecisionTimelineFacts;
}

const notDetermined = (key: DecisionBindingKey, reason: string): DecisionBinding => ({
  key,
  label: DECISION_BINDING_LABELS[key],
  revision: null,
  notDeterminedReason: reason,
  note: null,
  provenance: 'not-determined',
});

const bound = (
  key: DecisionBindingKey,
  revision: string,
  provenance: ProvenanceValue,
  note: string | null = null,
): DecisionBinding => ({
  key,
  label: DECISION_BINDING_LABELS[key],
  revision,
  notDeterminedReason: null,
  note,
  provenance,
});

/** A contract limit becomes a condition: the limit says what is missing, the condition says it has to stop being missing. */
function conditionFromLimit(limit: ContractLimit): DecisionCondition {
  return {
    id: `contract:${limit.code}${limit.subject ? `:${limit.subject}` : ''}`,
    text: limit.sentence,
    source: 'contract-limit',
    // Derived, always: the limit is recomputed from the contract every time,
    // so the status is the evidence's answer and the account cannot move it.
    // `blocks` never resolves to anything but open — that is what blocking is.
    status: 'open',
    statusBasis: 'derived',
    evidence: `${limit.code}${limit.subject ? `:${limit.subject}` : ''}`,
    provenance: 'reconstructed',
    attestation: null,
  };
}

/**
 * The draft, derived — never authored.
 *
 * Every sentence in it comes from the contract, the comparison, the need or the
 * reversibility rules above, and the only free text is the summary the reader
 * writes. That is deliberate: a decision whose conditions were typed by hand
 * would carry exactly the conditions somebody remembered, and the blocking ones
 * are the ones nobody remembers.
 */
export function buildProjectDecision(args: BuildDecisionArgs): ProjectDecision {
  const bindings: DecisionBinding[] = [];

  bindings.push(
    args.need.revision === null
      ? notDetermined(
          'need',
          `No confirmed need revision: ${args.need.undecided} element(s) of the process carry no state yet (roadmap 3.5). The decision is made without one and says so.`,
        )
      : bound('need', `need/r${args.need.revision}`, 'confirmed'),
  );

  const option = args.chosenOptionId
    ? (args.comparison?.costs.find((c) => c.optionId === args.chosenOptionId) ?? null)
    : null;
  bindings.push(
    args.chosenOptionId === null
      ? notDetermined('option', 'No option is chosen, so this decision picks nothing.')
      : bound('option', option ? `${option.optionId} · ${option.label}` : args.chosenOptionId, 'confirmed'),
  );

  const costCoverage = args.assumptions ? costAssumptionsCoverage(args.assumptions) : null;
  if (!args.assumptions || !costCoverage || costCoverage.state === 'rejected') {
    bindings.push(
      notDetermined(
        'cost',
        costCoverage
          ? costCoverage.sentence
          : 'No cost assumptions were stated, so no option comparison was priced (roadmap 7.4).',
      ),
    );
  } else {
    // Bound — and the provenance says what kind of answer it is. A comparison
    // that named no cheapest option is bound as `not-determined`, never as a
    // simulation that quietly implies one; 7.4's four refusals survive the
    // binding intact.
    const refusal = args.comparison?.refusal ?? null;
    bindings.push(
      bound(
        'cost',
        costAssumptionsRevision(args.assumptions),
        refusal ? 'not-determined' : 'simulation',
        refusal ? refusal.sentence : null,
      ),
    );
  }

  if (!args.contract) {
    bindings.push(notDetermined('contract', 'No architecture contract has been derived for this run (roadmap 8.2).'));
  } else {
    const coverage = contractCoverage(args.contract);
    const revision =
      coverage.state === 'blocked' ? `blocked:${contractRevision(args.contract)}` : contractRevision(args.contract);
    bindings.push(
      bound(
        'contract',
        revision,
        args.contract.status === 'confirmed' ? 'confirmed' : 'reconstructed',
        coverage.state === 'clear' ? null : coverage.sentence,
      ),
    );
  }

  bindings.push(
    args.runId && args.evidenceDigest
      ? bound('run', args.runId, 'proven')
      : notDetermined('run', 'This decision names no signed analysis run, so it binds no evidence.'),
  );

  /* ---- conditions: derived first, then what the account said about its own ---- */

  const conditions: DecisionCondition[] = [];
  if (args.contract) {
    for (const limit of contractCoverage(args.contract).limits) conditions.push(conditionFromLimit(limit));
  }
  if (costCoverage) {
    for (const g of costCoverage.gaps) {
      if (g.severity !== 'rejects') continue;
      conditions.push({
        id: `cost:${g.code}${g.subject ? `:${g.subject}` : ''}`,
        text: g.sentence,
        source: 'cost-gap',
        status: 'open',
        statusBasis: 'derived',
        evidence: `${g.code}${g.subject ? `:${g.subject}` : ''}`,
        provenance: 'reconstructed',
        attestation: null,
      });
    }
  }
  if (args.need.undecided > 0) {
    conditions.push({
      id: 'need:undecided',
      text: `${args.need.undecided} element(s) of the process carry no confirmed state. The decision is taken while the need is incomplete, and that stays visible with it.`,
      source: 'need-open',
      status: 'open',
      statusBasis: 'derived',
      evidence: `undecided:${args.need.undecided}`,
      provenance: 'reconstructed',
      attestation: null,
    });
  }

  // The account's own conditions. A derived condition is never overwritten by
  // one — `conditionAttestable()` says why — so an attestation naming a derived
  // id is carried as the account's separate condition rather than silently
  // dropped or silently applied.
  for (const attestation of args.attestations ?? []) {
    const clash = conditions.find((c) => c.id === attestation.conditionId);
    conditions.push({
      id: clash ? `account:${attestation.conditionId}` : attestation.conditionId,
      text: clash
        ? `The account states this condition is ${attestation.status}: ${attestation.note} The derived condition it names stays as the evidence reports it.`
        : attestation.note,
      source: 'account',
      status: attestation.status,
      statusBasis: 'attested',
      evidence: null,
      provenance: 'confirmed',
      attestation: { account: attestation.account, at: attestation.at, note: attestation.note },
    });
  }
  conditions.sort((a, b) => a.id.localeCompare(b.id));

  /* ---------------------------------------------------------- the timeline */

  const timeline: DecisionTimelineEntry[] = [];
  const add = (at: string | null | undefined, kind: TimelineKind, sentence: string, account: string | null) => {
    if (typeof at === 'string' && at.length > 0) timeline.push({ at, kind, sentence, account });
  };
  add(args.timeline.runSignedAt, 'run-signed', `Analysis run ${args.runId ?? ''} was signed.`.trim(), null);
  add(args.timeline.costStatedAt, 'cost-stated', 'Cost assumptions were stated.', null);
  add(args.timeline.contractDraftedAt, 'contract-drafted', `Architecture contract ${args.contract?.contractId ?? ''} was derived.`.trim(), null);
  add(args.timeline.draftedAt, 'decision-drafted', `Decision ${args.decisionId ?? 'DEC-1'} was drafted.`, null);
  for (const attestation of args.attestations ?? []) {
    add(
      attestation.at,
      'condition-attested',
      `Condition ${attestation.conditionId} was stated ${attestation.status} by the account.`,
      attestation.account,
    );
  }
  add(
    args.timeline.confirmedAt,
    'decision-confirmed',
    `Decision confirmed. ${SELF_DECLARATION}`,
    args.timeline.confirmedBy ?? null,
  );
  add(args.timeline.withdrawnAt, 'decision-withdrawn', 'Decision withdrawn.', args.timeline.confirmedBy ?? null);
  const order = new Map(TIMELINE_KINDS.map((k, i) => [k, i]));
  timeline.sort((a, b) => a.at.localeCompare(b.at) || (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0));

  const decision: ProjectDecision = {
    decisionVersion: DECISION_VERSION,
    decisionId: args.decisionId ?? 'DEC-1',
    revision: args.revision ?? 1,
    status: 'draft',
    summary: args.summary,
    boundRunId: args.runId ?? '',
    boundEvidenceDigest: args.evidenceDigest ?? '',
    bindings,
    conditions,
    reversibility: decisionReversibility({
      optionKind: option?.kind ?? null,
      handedOver: args.handedOver,
      confirmedDrops: args.need.confirmedDrops,
    }),
    timeline,
    confirmation: null,
    fingerprint: '',
  };
  decision.fingerprint = decisionFingerprint(decision);
  return decision;
}

/**
 * The bound contract's fingerprint, as a decision would name it.
 *
 * Exported so that a caller checking "is the contract this decision binds still
 * the contract we hold?" asks one function rather than re-deriving the revision
 * string, and so that the answer cannot drift from `buildProjectDecision()`.
 */
export function boundContractFingerprint(contract: ArchitectureContract | null | undefined): string | null {
  return contract ? contractFingerprint(contract) : null;
}
