/**
 * The handover chain of an audit pack — *Requirement → Decision → Receipt →
 * Delivery artefact* — and what the pack's signature does and does not cover.
 *
 * Roadmap 8.5: *„Nachweiskette und Übergabepaket: Anforderung → Entscheidung →
 * Receipt → Lieferartefakt; das Signaturmanifest nennt `covers[]`; der
 * vorhandene Offline-Verifier prüft es."*
 *
 * Two things this module refuses to do, and they are the whole point.
 *
 * **It does not let `covers[]` mean "everything".** A manifest that lists every
 * file under one heading reads as though the signature stood behind all of it —
 * behind the model's prose and behind the account holder's own sign-off as much
 * as behind the engine's findings. The boundary `lib/audit-pack-build.ts` drew
 * in roadmap 0.12 (signed files from named run fields; the owner's statements in
 * `07-user-attested.md`, name bound, contents not vouched for) therefore travels
 * into `covers[]` as its own field: each link says `signed`, `attested` or
 * `not-determined`, and a link whose record is the owner's statement can never
 * claim the first.
 *
 * **It does not report a missing link as an empty list.** Roadmap 0.5 put
 * `binding` on an input so that no run could claim to have read five megabytes
 * of catalog it only looked an entry up in; the same honesty is owed here. Every
 * one of the four links is always present, and a link with nothing behind it
 * carries `not-determined` **with a reason in words** — never a dropped row, and
 * never a zero dressed as a result.
 *
 * **What is determined today, measured on the run document as
 * `/api/runs/create` writes it (23.09.2026):**
 *
 * | Link | Verdict today | Why |
 * |---|---|---|
 * | Requirement | *not determined* | No business requirement is recorded in a signed run at all. The rules `lib/it-findings.ts` shows are derived when the IT view is opened, and roadmap 8.1 measured 0 of 42 findings whose line a derived rule covers. What the run *does* bind is the source artefact, by digest — which is the thing the requirement would be about, not the requirement. |
 * | Decision | *attested* | The chosen target architecture and the sign-off are written by the account holder and live in `07-user-attested.md`. The signed files carry the engine's recommendation, which is not a decision. |
 * | Receipt | *signed*, when the run's `modelParticipation` is `narrative-attested` | The model receipt is issued by the server's proxy over the account, the response digest and the time — something outside the account checked it, so `proven`. Its scope is the narrative's origin and nothing else, and the link says so rather than letting one receipt stand in for the delivery. |
 * | Delivery artefact | *not determined* | The generated code sits on the project document and is writable from the browser (`firestore.rules`), so it is not in the signed half of any pack and this pack carries no copy of it. Roadmap 8.7 makes a repair draft server-side and immutable; until then there is nothing to bind. |
 *
 * So a pack sealed today says, in the string its signature covers, that one of
 * four links is carried by the signature, one by a self-declaration and two by
 * nothing. That is the state of the product, and a chain that read better would
 * be reading about a different one.
 *
 * Pure: no imports beyond the provenance vocabulary and the input-manifest
 * types. It is read by the issuing route, by both verifiers and by the tests,
 * and the producer and the reader must not be able to decide differently.
 */

import type { ProvenanceValue } from './provenance';
import { INPUT_IDS, type InputManifest } from './input-manifest';

/** The four links of the handover chain, in order. Never a subset. */
export const CHAIN_STEPS = ['requirement', 'decision', 'receipt', 'delivery'] as const;
export type ChainStepId = (typeof CHAIN_STEPS)[number];

export const CHAIN_STEP_LABELS: Readonly<Record<ChainStepId, string>> = Object.freeze({
  requirement: 'Requirement',
  decision: 'Decision',
  receipt: 'Receipt',
  delivery: 'Delivery artefact',
});

/**
 * What the pack's signature does for a link.
 *
 * - `signed` — the link's record is a server-generated file listed under
 *   `files`, and the signature covers its bytes.
 * - `attested` — the record is the account holder's own statement in a file
 *   listed under `attested`. From manifest format 3 the bytes are bound too, so
 *   a reader can tell the statement was not rewritten after sealing; nobody
 *   vouches for what it says.
 * - `not-determined` — the pack carries no record of this link. The reason is
 *   in `09-evidence-chain.json`, which *is* signed.
 */
export const COVERAGE_KINDS = ['signed', 'attested', 'not-determined'] as const;
export type CoverageKind = (typeof COVERAGE_KINDS)[number];

/** One row of the manifest's `covers[]`. Bound into the canonical string from format 4. */
export interface CoverEntry {
  step: ChainStepId;
  coverage: CoverageKind;
  /** The pack path carrying the record, or `''` for `not-determined`. */
  ref: string;
}

export interface ChainStep {
  id: ChainStepId;
  label: string;
  /** What the pack can say about this link. `not-determined` always has `reason`. */
  provenance: ProvenanceValue;
  coverage: CoverageKind;
  /** The pack file carrying the record, or `''`. Mirrors `CoverEntry.ref`. */
  ref: string;
  /** What is on record, as a reader reads it. `null` exactly when the link is not determined. */
  value: string | null;
  /** Set exactly when `value` is null. Why this link could not be followed. */
  reason: string | null;
  /** What the link does **not** cover, even where it is determined. Never empty. */
  scope: string;
}

export interface EvidenceChain {
  chainVersion: 1;
  steps: ChainStep[];
  /** Every link has a value. False is the ordinary case today, and it is said out loud. */
  complete: boolean;
  /** The first link with no value, or `null`. */
  endsAt: ChainStepId | null;
  determined: number;
  of: number;
}

/** The pack files this chain may point at. Named here so a ref cannot be invented. */
export const CHAIN_REF_FILES = {
  inputManifest: '08-input-manifest.json',
  modelCard: '04-model-card.md',
  userAttested: '07-user-attested.md',
} as const;

/** What the chain reads. Every field is server-written and inside the signed half of a pack. */
export interface EvidenceChainSource {
  projectId: string;
  runId: string;
  /** The run's input manifest (roadmap 0.5), as the signed generator input carries it. */
  inputManifest?: InputManifest;
  /** `auditMetadata.inputFingerprint.sha256` — the source the run read. */
  sourceSha256?: string;
  /** `auditMetadata.modelCard.modelParticipation`, mirroring the signed run (roadmap 1.2). */
  modelParticipation?: 'narrative' | 'narrative-attested' | 'none';
}

const SOURCE_BOUND_BY_VALUE = (m: InputManifest | undefined): boolean =>
  !!m?.inputs?.some((i) => i.id === INPUT_IDS.source && i.binding === 'value');

function requirementStep(src: EvidenceChainSource): ChainStep {
  const boundSource = SOURCE_BOUND_BY_VALUE(src.inputManifest)
    ? `the source artefact is bound by value in ${CHAIN_REF_FILES.inputManifest}`
    : src.sourceSha256
      ? 'the source artefact is bound by its digest on the run'
      : 'not even the source artefact is bound on this run';
  return {
    id: 'requirement',
    label: CHAIN_STEP_LABELS.requirement,
    provenance: 'not-determined',
    coverage: 'not-determined',
    ref: '',
    value: null,
    reason:
      'No business requirement is recorded in a signed run. The business rules the IT view shows are derived ' +
      'when that view is opened and are not part of the run, and roadmap 8.1 measured that no derived rule ' +
      `covers the line of any finding on the product's own example (0 of 42, 23.09.2026). What is bound instead: ${boundSource} — ` +
      'which is the artefact a requirement would be about, not the requirement.',
    scope:
      'A requirement here would be a stated obligation the custom code exists to meet. A source digest is not one, ' +
      'and this pack does not treat it as one.',
  };
}

function decisionStep(): ChainStep {
  return {
    id: 'decision',
    label: CHAIN_STEP_LABELS.decision,
    provenance: 'not-determined',
    coverage: 'attested',
    ref: CHAIN_REF_FILES.userAttested,
    value: null,
    reason:
      `Whatever decision this project carries is recorded only in ${CHAIN_REF_FILES.userAttested} — the account holder's ` +
      'own statement, written from their session. The signature binds that file\'s name and, from manifest format 3, the ' +
      'bytes that were sealed; it does not make the statement true, and the signed half of this pack is not allowed to ' +
      'read it. The signed files carry the engine\'s recommendation, which is not a decision.',
    scope:
      'The signature says which self-declaration was in the archive when it was sealed. It says nothing about who ' +
      'decided, whether they were entitled to, or whether the decision was carried out.',
  };
}

function receiptStep(src: EvidenceChainSource): ChainStep {
  if (src.modelParticipation === 'narrative-attested') {
    return {
      id: 'receipt',
      label: CHAIN_STEP_LABELS.receipt,
      // Issued by the server's model proxy over the account, the digest of the
      // text the provider returned and the time — checked outside the account,
      // which is the whole of what makes a receipt `proven`.
      provenance: 'proven',
      coverage: 'signed',
      ref: CHAIN_REF_FILES.modelCard,
      value: 'A model receipt established the narrative\'s origin; the run records it as `narrative-attested`.',
      reason: null,
      scope:
        'The receipt covers where the narrative text came from. It does not cover the decision, the delivery ' +
        'artefact, or any claim the narrative makes — no test run and no system outside this platform confirmed anything.',
    };
  }
  const why =
    src.modelParticipation === 'none'
      ? 'No model took part in this run, so there is no model receipt to carry. This is not a gap in the evidence: ' +
        'the engine computed the findings.'
      : src.modelParticipation === 'narrative'
        ? 'A narrative was recorded and no receipt established where it came from, so nothing outside the account ' +
          'vouches for its origin.'
        : 'This run predates the model-participation record (roadmap 1.2), so it cannot be said whether a receipt existed.';
  return {
    id: 'receipt',
    label: CHAIN_STEP_LABELS.receipt,
    provenance: 'not-determined',
    coverage: 'not-determined',
    ref: '',
    value: null,
    reason:
      `${why} A test-run receipt would be the other candidate, and it sits on the project document where the browser ` +
      'can write it, so it is outside the signed half of every pack until the isolated runner of roadmap 8.9 issues one.',
    scope:
      'A receipt is `proven` only where something outside the account checked it. Nothing in this pack claims that here.',
  };
}

function deliveryStep(): ChainStep {
  return {
    id: 'delivery',
    label: CHAIN_STEP_LABELS.delivery,
    provenance: 'not-determined',
    coverage: 'not-determined',
    ref: '',
    value: null,
    reason:
      'This pack carries no delivery artefact. The generated code and the transformation output live on the project ' +
      'document, which the owner writes from the browser, so they are not in the signed half of any pack and are not ' +
      'copied into one. Roadmap 8.7 records a repair draft server-side with a parent revision and a code hash; a ' +
      'delivery artefact can be bound to this chain once it exists.',
    scope:
      'Nothing here says an artefact was produced, ran, or matches the decision. The link is open, and naming it open ' +
      'is the only claim being made.',
  };
}

/**
 * The chain of one pack, built from the signed half and nothing else.
 *
 * Every input is server-written. That is not a detail: if a client-writable
 * field could move a link, the owner could change a signed file by editing a
 * form, which is the defect roadmap 0.12 closed and
 * `tests/audit-pack-signed-input.spec.ts` holds shut.
 */
export function buildEvidenceChain(src: EvidenceChainSource): EvidenceChain {
  const steps = [requirementStep(src), decisionStep(), receiptStep(src), deliveryStep()];
  const open = steps.find((s) => s.value === null) ?? null;
  return {
    chainVersion: 1,
    steps,
    complete: open === null,
    endsAt: open?.id ?? null,
    determined: steps.filter((s) => s.value !== null).length,
    of: steps.length,
  };
}

/** The manifest's `covers[]` — one row per link, in the order of `CHAIN_STEPS`. */
export function coversOf(chain: EvidenceChain): CoverEntry[] {
  return chain.steps.map((s) => ({ step: s.id, coverage: s.coverage, ref: s.ref }));
}
