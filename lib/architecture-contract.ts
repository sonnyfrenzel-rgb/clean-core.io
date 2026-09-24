/**
 * The architecture contract — what is built, against which target, on which
 * inputs, **and which alternatives were rejected on what.**
 *
 * Roadmap 8.2 (`docs/ROADMAP.md` §Phase 8): *"Architekturvertrag als Dokument:
 * Zielkontext, Laufzeit, Persistenz, APIs, gebundene Eingaben — und warum die
 * Alternativen verworfen wurden."* Mockup screen 4, card "Architecture contract
 * AC-1" (`docs/roadmap/clean-core-mockups-v2_8.html:1244`): a draft with seven
 * fields, one headline sentence, and "Until confirmed, generation follows the
 * recommended route."
 *
 * Why a module and not a rendered card: 8.3 generates *against* this document
 * and 8.4's decision *binds* it, so it has to be comparable — one canonical
 * form, one fingerprint, one seam into the signed input manifest — while still
 * reading as a document. Prose alone cannot be bound; a hash alone cannot be
 * read.
 *
 * ## What it is derived from, and what it may therefore say
 *
 * Every sentence in a contract comes from one of three places and says which:
 *
 *   - **`evidence`** — a finding of this run, cited by finding id and line.
 *     `lib/abap/extensibility-router.ts` already decides the route from exactly
 *     six constructs; `routeDrivers()` there is that rule, exported, so the
 *     reason the other track was rejected is the same rule that chose this one
 *     and not a second copy of it.
 *   - **`bound-input`** — an entry of the run's signed input manifest
 *     (`lib/input-manifest.ts`). A contract that names a target context the run
 *     never bound is the defect that module was written against, so the target
 *     context is *read out of* the manifest rather than passed in beside it.
 *   - **`stipulation`** — a rule of this platform, not a measurement. The map
 *     from route to runtime is one; the router's own `assumptions` are others.
 *     Saying so is the point: an unmarked stipulation reads as a finding.
 *
 * And a fourth outcome that is not a source: **`not-determined`**, with a
 * reason. Never an empty string, never a zero, never an omitted field
 * (`tests/no-fabricated-figures.spec.ts`, `tests/unearned-verdicts-guard.spec.ts`).
 *
 * ## What this contract must not pretend
 *
 * `lib/abap/catalog-service.ts` contains neither the word `deployment` nor
 * `edition` — zero occurrences, measured 2026-09-23 — and the only release
 * artifact it imports is `cloudification-repo.latest.json`
 * (`lib/abap/catalog-service.ts:37`), the **Public** Cloud release list. So a
 * Private Edition target is a *bound input* and nothing more: no catalog for
 * that edition answered anything. `LIMIT_SENTENCES['catalog-not-edition-specific']`
 * says that on the target-context field of every contract, in both deployment
 * models, because in the public model the snapshot is right by coincidence of
 * it being the only one.
 *
 * ## Does it inherit the revision pattern of 7.10 / 7.4?
 *
 * Yes, in the three places where that pattern carries weight, and it does not
 * invent a fourth:
 *
 *   1. **Canonical form and fingerprint** — same construction as
 *      `canonicalInputManifest` and `canonicalAssessmentProfile`: a line format
 *      that has to agree about a separator, not a JSON canonicaliser that has
 *      to agree about key order across two runtimes.
 *   2. **Three states, and a throw at the seam** —
 *      `clear | qualified | blocked`, exactly the severities and the semantics
 *      of `ProfileCoverage` (`covered | unconfirmed | rejected`), and
 *      `contractManifestInput()` throws on the blocking one for the reason
 *      `profileManifestInput()` does: a refusal that can still be signed is not
 *      a refusal. The words differ only because "rejected" is already taken in
 *      this file by a rejected *alternative*, and one word for two ideas in one
 *      document is how a reader ends up reading the wrong one.
 *   3. **The qualified state is part of the revision string** — `qualified:` in
 *      front, as `unconfirmed:` is in `profileRevision()` and `unattested` is in
 *      `analysisRunInputs()`.
 *
 * ## What is signed, and what is not
 *
 * The contract is **not** part of the run's signed payload. A run signs what it
 * read (`app/api/runs/create/route.ts:461`, `Omit<AnalysisRun, 'runHash' |
 * 'signature' | 'analysis'>`); the contract is written afterwards, may carry a
 * declared deviation, and changes when a person changes it. Folding it into the
 * run's hash would make a signature over past facts depend on a future
 * document.
 *
 * Instead the contract is bound the way every other input is: it names the run
 * and that run's `inputManifest.hash`, it has a fingerprint of its own, and
 * `contractManifestInput()` turns it into a `source-artefact` entry for the
 * manifest of the *next* thing derived from it — the generation of 8.3, the
 * decision of 8.4. `source-artefact` rather than `derivation` for the reason
 * `profileManifestInput()` gives: generated code is computed *against* the
 * contract, so a contract that moved makes the code a statement about something
 * else, and `invalidatingInputs()` must keep it.
 *
 * Inside the fingerprint: every field, every citation, every limit, the route
 * and the deviation. Outside it: `status` alone. The run excludes `runHash` and
 * `signature` for the same shape of reason — they are the outputs of the hash,
 * and a document whose fingerprint changed the moment it was confirmed could
 * never be bound by the confirmation. Nothing here is model prose, so nothing
 * here needs the exemption `analysis` gets.
 *
 * Pure data: no React, no Firestore, no `node:crypto`. Producer and reader must
 * not be able to hash differently.
 */

import { sha256Hex } from './artefact-digest';
import { referenceDigest, type InputManifest, type ManifestInput, INPUT_IDS } from './input-manifest';
import type { ProvenanceValue } from './provenance';
import type { AbapEvidenceReport, EvidenceFinding } from './abap/evidence-model';
import { routeDrivers, type ExtensibilityRouteReport, type RouteDriver } from './abap/extensibility-router';

/** Format of the contract record. Bumped only when the canonical form changes. */
export const CONTRACT_VERSION = 1;

/** The two targets this platform routes to. The router's labels, as machine values. */
export type TargetRoute = 'in-app-rap' | 'side-by-side-cap';

export function targetRouteOf(report: Pick<ExtensibilityRouteReport, 'recommendedRoute'>): TargetRoute {
  return report.recommendedRoute === 'Side-by-Side (SAP BTP)' ? 'side-by-side-cap' : 'in-app-rap';
}

/** The seven fields of the document, in the order it reads (mockup: "Details (7 fields)"). */
export const CONTRACT_FIELDS = [
  'target-context',
  'runtime',
  'persistence',
  'apis',
  'preconditions',
  'bound-inputs',
  'rejected-alternatives',
] as const;
export type ContractFieldKey = (typeof CONTRACT_FIELDS)[number];

export const CONTRACT_FIELD_LABELS: Readonly<Record<ContractFieldKey, string>> = Object.freeze({
  'target-context': 'Target context',
  runtime: 'Runtime',
  persistence: 'Persistence',
  apis: 'APIs',
  preconditions: 'Preconditions',
  'bound-inputs': 'Bound inputs',
  'rejected-alternatives': 'Rejected alternatives',
});

/**
 * Where a sentence of this contract comes from. See the file header — the point
 * of the value is that `stipulation` is visible beside `evidence`.
 */
export type ContractBasis = 'evidence' | 'bound-input' | 'stipulation' | 'not-determined';

export interface ContractCitation {
  /** What is being cited. */
  kind: 'finding' | 'input' | 'router';
  /** Finding id, manifest input id, or the router field, e.g. `assumptions[1]`. */
  ref: string;
  /** The line in the analysed source, where the citation is a finding. */
  line?: number;
}

/**
 * What a contract cannot show, by code — the `ProfileGap` shape of
 * `lib/assessment-profile.ts`, for the same reason it has one: a free-text
 * caveat is not comparable between two contracts, and a caveat nobody can
 * compare is a caveat nobody notices twice.
 */
export const CONTRACT_LIMIT_CODES = [
  /** No `target:s4-deployment` entry in the run's manifest — the target is unknown. */
  'target-not-bound',
  /** The run bound no input manifest at all. */
  'inputs-not-bound',
  /** Only the Public Cloud release list ships; no edition-specific catalog answered. */
  'catalog-not-edition-specific',
  /** Core modifications are present; no target is reachable until they are reset. */
  'modification-unreset',
  /** The engine did not assess part of the source. */
  'coverage-incomplete',
  /** A finding needs a successor API and the catalog names none. */
  'no-successor-published',
  /** A named successor is a candidate, not a catalog match. */
  'successor-unverified',
  /** Whether SAP standard already covers the requirement was not assessed here. */
  'standard-fit-not-assessed',
] as const;
export type ContractLimitCode = (typeof CONTRACT_LIMIT_CODES)[number];

/**
 * Two severities, and they are not two shades of one thing:
 *
 *   - `blocks` — the contract may not be bound. `contractManifestInput()` throws.
 *   - `qualifies` — it may be bound, and it is carried as qualified everywhere,
 *     including in the revision string a manifest records.
 */
export type ContractLimitSeverity = 'blocks' | 'qualifies';

export interface ContractLimit {
  code: ContractLimitCode;
  severity: ContractLimitSeverity;
  /** The object or value the limit is about, where it is about one. */
  subject: string | null;
  /** Plain sentence — what cannot be shown, and what follows from it. */
  sentence: string;
}

const LIMIT_SENTENCES: Record<ContractLimitCode, (subject: string | null) => string> = {
  'target-not-bound': () =>
    `The run bound no target deployment (\`${INPUT_IDS.deployment}\` is not in its input manifest), so this contract cannot name a target context. Nothing is generated against an unknown target.`,
  'inputs-not-bound': () =>
    'The run recorded no input manifest, so this contract cannot say what it was derived from. A contract that names inputs the run never had is the defect the manifest exists to prevent.',
  'catalog-not-edition-specific': (s) =>
    `The catalog that answered is the Public Cloud release list; this build ships no edition-specific snapshot, and the lookup takes no edition (\`lib/abap/catalog-service.ts\` names neither \`deployment\` nor \`edition\`). The ${s} target context is bound as an input, not corroborated by a catalog for that edition.`,
  'modification-unreset': (s) =>
    `${s} core modification(s) sit inside SAP standard code. No target context applies until they are reset to standard via SPAU, so this contract describes where the requirement goes afterwards, not what can be built now.`,
  'coverage-incomplete': (s) =>
    `The engine did not assess ${s}. Every statement below describes the part that was read, not the whole object.`,
  'no-successor-published': (s) =>
    `No released successor is published for ${s}. The gap is SAP's publication, not an omission of this analysis; it is carried, not filled in.`,
  'successor-unverified': (s) =>
    `The successor named for ${s} is a candidate, not a catalog match. It is not treated as an established replacement.`,
  'standard-fit-not-assessed': () =>
    'Whether SAP standard already covers the requirement is not assessed by the router; it is a question about the business capability, answered by the standard-coverage analysis with its own evidence. Covering the requirement without building anything therefore stays open here rather than being rejected.',
};

function limit(
  code: ContractLimitCode,
  severity: ContractLimitSeverity,
  subject: string | null,
): ContractLimit {
  return { code, severity, subject, sentence: LIMIT_SENTENCES[code](subject) };
}

export interface ContractField {
  key: ContractFieldKey;
  label: string;
  /** What the contract states. `null` exactly when `basis` is `not-determined`. */
  statement: string | null;
  /** Why it could not be determined. Non-empty exactly when `statement` is `null`. */
  notDeterminedReason: string | null;
  basis: ContractBasis;
  /** One of the nine values of `lib/provenance.ts`. Nothing else is provenance. */
  provenance: ProvenanceValue;
  citations: ContractCitation[];
  limits: ContractLimit[];
}

/** The four things that could have been done instead. All four are named, always. */
export const ALTERNATIVES = ['standard', 'key-user', 'in-app-rap', 'side-by-side-cap'] as const;
export type AlternativeId = (typeof ALTERNATIVES)[number];

export const ALTERNATIVE_LABELS: Readonly<Record<AlternativeId, string>> = Object.freeze({
  standard: 'Cover the requirement with SAP standard — build nothing',
  'key-user': 'Key user extensibility (tier 3)',
  'in-app-rap': 'In-app developer extensibility — ABAP Cloud / RAP on the stack',
  'side-by-side-cap': 'Side-by-side on SAP BTP — CAP',
});

export interface ContractAlternative {
  id: AlternativeId;
  label: string;
  /**
   * `not-determined` is a verdict of its own and the most common honest one:
   * nothing in the evidence rejected it and nothing chose it.
   */
  verdict: 'chosen' | 'rejected' | 'not-determined';
  /** One sentence. Never empty — a rejection without a reason is an assertion. */
  reason: string;
  basis: ContractBasis;
  citations: ContractCitation[];
}

/** A route that differs from the router's recommendation, and why (roadmap 8.3). */
export interface ContractDeviation {
  chosen: TargetRoute;
  /** Recorded, not optional: "eine Abweichung wird festgehalten und angewendet". */
  reason: string;
}

/** The document's lifecycle. Outside the fingerprint — see the file header. */
export type ContractStatus = 'draft' | 'confirmed' | 'superseded';

export interface ArchitectureContract {
  contractVersion: typeof CONTRACT_VERSION;
  /** `AC-1`, `AC-2` … the document's name inside the project. */
  contractId: string;
  /** The run this contract was derived from. */
  boundRunId: string;
  /** The hash of that run's signed input manifest — what the derivation stands on. */
  boundInputManifestHash: string;
  status: ContractStatus;
  /** The headline of the card: what is built, and what was rejected. */
  summary: string;
  /** In `CONTRACT_FIELDS` order. All seven, always. */
  fields: ContractField[];
  /** In `ALTERNATIVES` order. All four, always. */
  alternatives: ContractAlternative[];
  route: {
    recommended: TargetRoute;
    /** What generation follows (8.3). Equal to `recommended` unless a deviation was declared. */
    chosen: TargetRoute;
    deviation: ContractDeviation | null;
  };
  /** SHA-256 over `canonicalArchitectureContract` — the one value a reader compares. */
  fingerprint: string;
}

/* ---------- clear, qualified, blocked ---------- */

export type ContractState = 'clear' | 'qualified' | 'blocked';

export interface ContractCoverage {
  state: ContractState;
  /** Sorted by code, then subject — same contract, same list, same order. */
  limits: ContractLimit[];
  /** One sentence for the reader. Empty string when the contract is clear. */
  sentence: string;
}

/**
 * Roadmap 8.2, in one function: **a contract that cannot show what it stands on
 * is never treated like one that can.**
 *
 * The arrangement is the one of `profileCoverage()`: it does not ask whether
 * anything positively proves the contract unusable and, finding nothing, call it
 * clear. It collects every limit the fields recorded and lets the severities
 * decide.
 */
export function contractCoverage(contract: ArchitectureContract | null | undefined): ContractCoverage {
  if (!contract) {
    const only = limit('inputs-not-bound', 'blocks', null);
    return { state: 'blocked', limits: [only], sentence: only.sentence };
  }
  const limits = contract.fields
    .flatMap((f) => f.limits)
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code) || (a.subject || '').localeCompare(b.subject || ''));

  const state: ContractState = limits.some((l) => l.severity === 'blocks')
    ? 'blocked'
    : limits.length > 0
      ? 'qualified'
      : 'clear';

  const relevant = state === 'blocked' ? limits.filter((l) => l.severity === 'blocks') : limits;
  return { state, limits, sentence: relevant.map((l) => l.sentence).join(' ') };
}

/**
 * Whether anything may be generated or decided against this contract at all.
 *
 * A function rather than a string comparison at each call site, so that
 * "blocked" cannot be softened into a badge by whoever renders it —
 * `assessmentAllowed()` exists for the same reason.
 */
export function contractBindable(contract: ArchitectureContract | null | undefined): boolean {
  return contractCoverage(contract).state !== 'blocked';
}

/* ---------- canonical form and fingerprint ---------- */

/**
 * Canonical form: one line per part, fixed order, no whitespace beyond the line
 * break.
 *
 * The prose of a field enters as `sha256` of its text rather than as the text.
 * Not to hide it — the field carries it in full — but because a sentence may
 * contain any separator this format could pick, and a canonicaliser that can be
 * broken by a semicolon in a table name is not one. `lib/input-manifest.ts`
 * settles the same question the same way for a reference it cannot read.
 *
 * `status` is deliberately absent. See the file header: a fingerprint that
 * changed on confirmation could not be bound by the confirmation.
 */
export function canonicalArchitectureContract(contract: ArchitectureContract): string {
  const lines: string[] = [
    `v${contract.contractVersion}`,
    `contract=${contract.contractId}`,
    `run=${contract.boundRunId}`,
    `inputs=${contract.boundInputManifestHash}`,
    `summary=${sha256Hex(contract.summary)}`,
    `route=${contract.route.recommended}>${contract.route.chosen}`,
    `deviation=${
      contract.route.deviation
        ? `${contract.route.deviation.chosen}@${sha256Hex(contract.route.deviation.reason)}`
        : 'none'
    }`,
  ];
  for (const key of CONTRACT_FIELDS) {
    const field = contract.fields.find((f) => f.key === key);
    if (!field) {
      lines.push(`field=${key};absent`);
      continue;
    }
    const cites = field.citations
      .map((c) => `${c.kind}:${c.ref}${typeof c.line === 'number' ? `@${c.line}` : ''}`)
      .join(',');
    const lims = field.limits.map((l) => `${l.code}:${l.subject || ''}`).join(',');
    lines.push(
      `field=${key};basis=${field.basis};prov=${field.provenance};text=${sha256Hex(
        field.statement ?? `not-determined:${field.notDeterminedReason ?? ''}`,
      )};cites=${cites};limits=${lims}`,
    );
  }
  for (const id of ALTERNATIVES) {
    const alt = contract.alternatives.find((a) => a.id === id);
    if (!alt) {
      lines.push(`alt=${id};absent`);
      continue;
    }
    const cites = alt.citations
      .map((c) => `${c.kind}:${c.ref}${typeof c.line === 'number' ? `@${c.line}` : ''}`)
      .join(',');
    lines.push(`alt=${id};verdict=${alt.verdict};basis=${alt.basis};reason=${sha256Hex(alt.reason)};cites=${cites}`);
  }
  return lines.join('\n');
}

/** SHA-256 over the canonical form, lowercase hex. Same content, same value. */
export function contractFingerprint(contract: ArchitectureContract): string {
  return sha256Hex(canonicalArchitectureContract(contract));
}

/* ---------- the seam into the signed input manifest ---------- */

/** The input id a contract occupies in a downstream run's manifest. */
export const CONTRACT_INPUT_ID = 'contract:architecture';

/**
 * The revision string a manifest records for this contract.
 *
 * A qualified contract says so in its own revision, exactly as
 * `profileRevision()` prefixes `unconfirmed:` — the manifest sits inside a
 * signature, and a contract we could not fully substantiate must not be signed
 * as though we had.
 */
export function contractRevision(contract: ArchitectureContract): string {
  const fp = contractFingerprint(contract).slice(0, 12);
  const core = `${contract.contractId}/${contract.route.chosen}${
    contract.route.deviation ? '+deviation' : ''
  }+${fp}`;
  return contractCoverage(contract).state === 'clear' ? core : `qualified:${core}`;
}

/**
 * The contract as an entry of the signed input manifest of whatever is derived
 * from it — the generated code of 8.3, the decision of 8.4.
 *
 * `dataClass: 'source-artefact'`, because generation is computed *against* the
 * contract: a contract that moved makes the generated code a statement about a
 * different target, and `invalidatingInputs()` keeps source-artefact
 * divergences and drops derivations.
 *
 * `binding: 'reference'`, because the holder holds the contract by name and
 * revision. The digest says which contract was bound, never that the document
 * was read byte for byte.
 *
 * Throws on a blocked contract, for the reason `profileManifestInput()` throws
 * on a rejected profile: a refusal that can still be signed is not a refusal.
 */
export function contractManifestInput(contract: ArchitectureContract): ManifestInput {
  const coverage = contractCoverage(contract);
  if (coverage.state === 'blocked') {
    throw new Error(
      `An architecture contract that cannot be bound must not become a signed input: ${coverage.sentence}`,
    );
  }
  const revision = contractRevision(contract);
  return {
    id: CONTRACT_INPUT_ID,
    dataClass: 'source-artefact',
    revision,
    binding: 'reference',
    sha256: referenceDigest(CONTRACT_INPUT_ID, revision),
  };
}

/* ---------- building the document ---------- */

const ROUTE_LABELS: Readonly<Record<TargetRoute, string>> = Object.freeze({
  'in-app-rap': 'On-stack ABAP Cloud with RAP',
  'side-by-side-cap': 'Side-by-side on SAP BTP with CAP',
});

const RUNTIME_SENTENCES: Readonly<Record<TargetRoute, string>> = Object.freeze({
  'in-app-rap':
    'ABAP Cloud on the S/4HANA application server: RAP behaviour and service definitions in the customer namespace, released APIs only.',
  'side-by-side-cap':
    'A decoupled runtime on SAP BTP: a CAP service (Node.js or Java) with its own lifecycle, reaching S/4HANA through released APIs and events.',
});

/**
 * The artifact of each route, in the router's own words
 * (`lib/abap/extensibility-router.ts`, `targetArtifact`). The router names the
 * artifact of the route *it* recommends; a declared deviation needs the one of
 * the route that was chosen instead.
 */
const TARGET_ARTIFACTS: Readonly<Record<TargetRoute, string>> = Object.freeze({
  'in-app-rap': 'RAP Business Object',
  'side-by-side-cap': 'CAP Node.js / Java Application',
});

const EDITION_NAMES: Readonly<Record<string, string>> = Object.freeze({
  public: 'S/4HANA Cloud, Public Edition',
  private: 'S/4HANA Cloud, Private Edition',
});

function citeFinding(f: EvidenceFinding): ContractCitation {
  return { kind: 'finding', ref: f.id, line: f.lineStart };
}

function describe(findings: EvidenceFinding[], max = 3): string {
  return findings
    .slice(0, max)
    .map((f) => `${f.objectName || f.title} (line ${f.lineStart})`)
    .join(', ');
}

function unassessedSummary(evidence: AbapEvidenceReport): string {
  const gaps = evidence.coverage?.gaps || [];
  return gaps.map((g) => `${g.count} × ${g.label.toLowerCase()} (from line ${g.firstLine})`).join(', ');
}

function driverSentence(drivers: RouteDriver[]): string {
  return drivers
    .map((d) => `${d.count} × ${d.label} (first at line ${d.firstLine})`)
    .join(', ');
}

function driverCitations(drivers: RouteDriver[]): ContractCitation[] {
  return drivers.flatMap((d) => d.findingIds.slice(0, 3).map((id, i) => ({
    kind: 'finding' as const,
    ref: id,
    line: i === 0 ? d.firstLine : undefined,
  })));
}

/**
 * Build the contract of one run.
 *
 * `deploymentModel` is **not** a parameter. It is read out of the run's input
 * manifest, because a contract whose target context came from somewhere else
 * than the signed record could name a target the run never analysed against —
 * and that is the whole reason `lib/input-manifest.ts` exists. Where the
 * manifest has no such entry, the target context is *not determined* and the
 * contract is blocked.
 */
export function buildArchitectureContract(args: {
  contractId: string;
  runId: string;
  inputManifest: InputManifest | null | undefined;
  evidence: AbapEvidenceReport;
  route: ExtensibilityRouteReport;
  /** A route other than the recommended one, with its reason (roadmap 8.3). */
  deviation?: ContractDeviation | null;
  status?: ContractStatus;
}): ArchitectureContract {
  const { contractId, runId, evidence, route } = args;
  const manifest = args.inputManifest || null;
  const inputs = manifest?.inputs || [];
  const deploymentEntry = inputs.find((i) => i.id === INPUT_IDS.deployment) || null;
  const deployment = deploymentEntry?.revision || null;
  const catalogEntry = inputs.find((i) => i.id === INPUT_IDS.catalog) || null;

  const recommended = targetRouteOf(route);
  const deviation = args.deviation || null;
  if (deviation && !deviation.reason.trim()) {
    // 8.3: a deviation is *recorded* and applied. An unexplained one is applied
    // and not recorded, which is the state the step exists to end.
    throw new Error('A deviation from the recommended route must carry a reason.');
  }
  const chosen: TargetRoute = deviation ? deviation.chosen : recommended;

  const findings = evidence.findings || [];
  const byKind = (kind: string) => findings.filter((f) => f.kind === kind);
  const modifications = byKind('modification');
  const customWrites = byKind('custom-table-write');
  const standardWrites = byKind('standard-table-write');
  const coverageIncomplete = evidence.coverage ? !evidence.coverage.complete : false;
  // The same rule that chose the route, not a second copy of it. `deployment`
  // decides two of the six triggers, so an unbound target cannot produce
  // drivers at all — which is why this asks the manifest and not a parameter.
  const drivers: RouteDriver[] =
    deployment === 'public' || deployment === 'private'
      ? routeDrivers(evidence, deployment)
      : [];

  const fields: ContractField[] = [];

  /* 1. Target context — bound, never inferred. */
  {
    const limits: ContractLimit[] = [];
    if (!manifest) limits.push(limit('inputs-not-bound', 'blocks', null));
    if (!deployment) {
      if (manifest) limits.push(limit('target-not-bound', 'blocks', null));
      fields.push({
        key: 'target-context',
        label: CONTRACT_FIELD_LABELS['target-context'],
        statement: null,
        notDeterminedReason:
          'The run bound no target deployment, so there is no target context to state. It is not defaulted to the public edition, which would be the most permissive answer and therefore the wrong one to guess.',
        basis: 'not-determined',
        provenance: 'not-determined',
        citations: manifest ? [] : [],
        limits,
      });
    } else {
      limits.push(limit('catalog-not-edition-specific', 'qualifies', EDITION_NAMES[deployment] || deployment));
      if (modifications.length > 0) limits.push(limit('modification-unreset', 'qualifies', String(modifications.length)));
      const citations: ContractCitation[] = [{ kind: 'input', ref: INPUT_IDS.deployment }];
      if (catalogEntry) citations.push({ kind: 'input', ref: INPUT_IDS.catalog });
      fields.push({
        key: 'target-context',
        label: CONTRACT_FIELD_LABELS['target-context'],
        statement: `${EDITION_NAMES[deployment] || deployment}, bound by the run as \`${
          INPUT_IDS.deployment
        }\` at revision \`${deploymentEntry?.revision}\`.`,
        notDeterminedReason: null,
        // A self-declaration by the signed-in account, which is what the
        // deployment selection is — `provenance.ts`: "Confirmed by the
        // signed-in account — a self-declaration, not a mandate." Not `proven`:
        // no system was contacted to establish it.
        basis: 'bound-input',
        provenance: 'confirmed',
        citations,
        limits,
      });
    }
  }

  /* 2. Runtime — a rule of this platform, said to be one. */
  // The router's artifact belongs to the recommended route. Under a deviation it
  // would describe the route that was *not* chosen, so the chosen route's own
  // artifact is named instead, and the router is not cited for it.
  const followsRouter = chosen === recommended;
  fields.push({
    key: 'runtime',
    label: CONTRACT_FIELD_LABELS.runtime,
    statement: `${RUNTIME_SENTENCES[chosen]} Target artifact: ${
      followsRouter ? route.targetArtifact : TARGET_ARTIFACTS[chosen]
    }.`,
    notDeterminedReason: null,
    basis: 'stipulation',
    provenance: 'reconstructed',
    citations: followsRouter ? [{ kind: 'router', ref: 'targetArtifact' }] : [],
    limits: [],
  });

  /* 3. Persistence — counted, or not determined. Never "none" from silence. */
  {
    const writes = [...standardWrites, ...customWrites];
    const limits: ContractLimit[] = [];
    if (coverageIncomplete) limits.push(limit('coverage-incomplete', 'qualifies', unassessedSummary(evidence) || 'part of the code'));
    if (writes.length > 0) {
      const parts: string[] = [];
      if (customWrites.length) parts.push(`${customWrites.length} write(s) to custom persistence — ${describe(customWrites)}`);
      if (standardWrites.length) parts.push(`${standardWrites.length} write(s) to SAP standard tables — ${describe(standardWrites)}`);
      fields.push({
        key: 'persistence',
        label: CONTRACT_FIELD_LABELS.persistence,
        statement: `${parts.join('; ')}.`,
        notDeterminedReason: null,
        basis: 'evidence',
        provenance: 'proven',
        citations: writes.slice(0, 6).map(citeFinding),
        limits,
      });
    } else if (coverageIncomplete) {
      fields.push({
        key: 'persistence',
        label: CONTRACT_FIELD_LABELS.persistence,
        statement: null,
        notDeterminedReason: `No database write was found, and the engine did not assess ${
          unassessedSummary(evidence) || 'part of the code'
        }. A construct no detector claims cannot count towards "no persistence".`,
        basis: 'not-determined',
        provenance: 'not-determined',
        citations: [],
        limits,
      });
    } else {
      fields.push({
        key: 'persistence',
        label: CONTRACT_FIELD_LABELS.persistence,
        statement: 'No database write in the assessed source. The target needs no persistence of its own.',
        notDeterminedReason: null,
        basis: 'evidence',
        provenance: 'proven',
        citations: [],
        limits,
      });
    }
  }

  /* 4. APIs — what the catalog named, and what it did not. */
  {
    const named = findings.filter((f) => f.sapReplacement && f.sapReplacement.objectName);
    const matched = named.filter(
      (f) => f.sapReplacement!.confidence === 'Catalog Match' || f.sapReplacement!.confidence === 'Verified',
    );
    const unverified = named.filter((f) => !matched.includes(f));
    const needSuccessor = findings.filter(
      (f) => !f.sapReplacement && (f.kind === 'unreleased-api' || f.kind === 'standard-table-write' || f.kind === 'bdc' || f.kind === 'rfc-call'),
    );
    const limits: ContractLimit[] = [];
    for (const f of unverified.slice(0, 5)) {
      limits.push(limit('successor-unverified', 'qualifies', f.objectName || f.title));
    }
    for (const f of needSuccessor.slice(0, 5)) {
      limits.push(limit('no-successor-published', 'qualifies', f.objectName || f.title));
    }
    if (matched.length > 0) {
      fields.push({
        key: 'apis',
        label: CONTRACT_FIELD_LABELS.apis,
        statement: `${matched.length} released successor(s) named by the catalog: ${matched
          .slice(0, 5)
          .map((f) => `${f.objectName || f.title} → ${f.sapReplacement!.objectName} (${f.sapReplacement!.objectType})`)
          .join(', ')}.`,
        notDeterminedReason: null,
        basis: 'evidence',
        provenance: 'imported',
        citations: [
          ...matched.slice(0, 5).map(citeFinding),
          ...(catalogEntry ? [{ kind: 'input' as const, ref: INPUT_IDS.catalog }] : []),
        ],
        limits,
      });
    } else {
      fields.push({
        key: 'apis',
        label: CONTRACT_FIELD_LABELS.apis,
        statement: null,
        notDeterminedReason:
          needSuccessor.length > 0 || unverified.length > 0
            ? 'The catalog named no released successor that is a match for any finding of this run. The named candidates are carried as candidates; the gaps are carried as gaps.'
            : 'No finding of this run asks for a released successor, so there is no API set to state. This is an absence of the question, not a cleared answer.',
        basis: 'not-determined',
        provenance: 'not-determined',
        citations: unverified.slice(0, 5).map(citeFinding),
        limits,
      });
    }
  }

  /* 5. Preconditions — the router's assumptions, marked as assumptions. */
  {
    const limits: ContractLimit[] = [];
    if (modifications.length > 0) {
      // Blocking, and this is the one place in the document that says so. The
      // router already states it in `assumptions`; a sentence in a list nobody
      // has to act on is not a gate.
      limits.push(limit('modification-unreset', 'blocks', String(modifications.length)));
    }
    const assumptions = route.assumptions || [];
    fields.push({
      key: 'preconditions',
      label: CONTRACT_FIELD_LABELS.preconditions,
      statement: assumptions.length > 0 ? assumptions.join(' ') : null,
      notDeterminedReason:
        assumptions.length > 0
          ? null
          : 'The router recorded no assumption for this run. Nothing is inferred in its place.',
      basis: assumptions.length > 0 ? 'stipulation' : 'not-determined',
      provenance: assumptions.length > 0 ? 'proposed' : 'not-determined',
      citations: assumptions.map((_, i) => ({ kind: 'router' as const, ref: `assumptions[${i}]` })),
      limits,
    });
  }

  /* 6. Bound inputs — the manifest, or nothing. */
  {
    if (!manifest || inputs.length === 0) {
      fields.push({
        key: 'bound-inputs',
        label: CONTRACT_FIELD_LABELS['bound-inputs'],
        statement: null,
        notDeterminedReason:
          'The run recorded no input manifest, so this contract cannot name what it was derived from.',
        basis: 'not-determined',
        provenance: 'not-determined',
        citations: [],
        limits: manifest ? [limit('inputs-not-bound', 'blocks', null)] : [],
      });
    } else {
      fields.push({
        key: 'bound-inputs',
        label: CONTRACT_FIELD_LABELS['bound-inputs'],
        statement: `${inputs.length} input(s), manifest revision ${manifest.revision}, hash ${manifest.hash.slice(
          0,
          12,
        )}: ${inputs.map((i) => `${i.id}@${i.revision} (${i.binding})`).join(', ')}.`,
        notDeterminedReason: null,
        basis: 'bound-input',
        // Inside the run's signature — this is the one field of the document
        // that a signature already covers.
        provenance: 'proven',
        citations: inputs.map((i) => ({ kind: 'input' as const, ref: i.id })),
        limits: [],
      });
    }
  }

  /* --- the alternatives, before the field that summarises them --- */
  const alternatives: ContractAlternative[] = [];

  alternatives.push({
    id: 'standard',
    label: ALTERNATIVE_LABELS.standard,
    verdict: 'not-determined',
    reason:
      'Not assessed here. The router can see the code, not the business capability; whether SAP standard already covers the requirement is answered by the standard-coverage analysis against scope items, with its own evidence levels.',
    basis: 'not-determined',
    citations: [{ kind: 'router', ref: 'checkpoints[0]' }],
  });

  alternatives.push(
    findings.length > 0
      ? {
          id: 'key-user',
          label: ALTERNATIVE_LABELS['key-user'],
          verdict: 'rejected',
          reason: `Rejected on the evidence: ${findings.length} finding(s) exceed what key-user tooling can express, among them ${describe(
            findings,
          )}.`,
          basis: 'evidence',
          citations: findings.slice(0, 3).map(citeFinding),
        }
      : {
          id: 'key-user',
          label: ALTERNATIVE_LABELS['key-user'],
          verdict: 'not-determined',
          reason: coverageIncomplete
            ? `No pattern was found, and ${
                unassessedSummary(evidence) || 'part of the code'
              } was not assessed by any detector. Feasibility cannot be judged from what was not read.`
            : 'No pattern was found that exceeds key-user tooling, and nothing in the code says whether the requirement can be expressed in it. Neither chosen nor rejected here.',
          basis: 'not-determined',
          citations: [{ kind: 'router', ref: 'checkpoints[1]' }],
        },
  );

  for (const id of ['in-app-rap', 'side-by-side-cap'] as const) {
    if (id === chosen) {
      alternatives.push({
        id,
        label: ALTERNATIVE_LABELS[id],
        verdict: 'chosen',
        reason: deviation
          ? `Chosen against the recommendation: ${deviation.reason}`
          : route.rationale,
        basis: deviation ? 'stipulation' : drivers.length > 0 ? 'evidence' : 'stipulation',
        citations: deviation ? [] : driverCitations(drivers),
      });
      continue;
    }
    if (id === 'side-by-side-cap') {
      // Nothing in the evidence rejects BTP — it is feasible for anything the
      // stack can do. What rejects it is a judgement about overhead, and a
      // judgement presented as a finding is the failure this contract exists to
      // prevent. So: stipulation, and it says so.
      alternatives.push({
        id,
        label: ALTERNATIVE_LABELS[id],
        verdict: 'rejected',
        reason:
          'Rejected as a setting, not on evidence: no construct of this run requires a decoupled runtime, and a separate BTP runtime adds a lifecycle, a network hop and a licence for work the stack already carries. Nothing in the code rules it out.',
        basis: 'stipulation',
        citations: [{ kind: 'router', ref: 'comparativeAnalysis.sideBySideBTP.fitDetails' }],
      });
      continue;
    }
    // In-app rejected: the drivers are the reason, with lines.
    alternatives.push({
      id,
      label: ALTERNATIVE_LABELS[id],
      verdict: drivers.length > 0 ? 'rejected' : 'not-determined',
      reason:
        drivers.length > 0
          ? `Rejected on the evidence: ${driverSentence(
              drivers,
            )} cannot run unchanged on the strict ABAP Cloud stack and would have to be replaced or decoupled first.`
          : 'A route other than the recommended one was chosen and no construct of this run drives it off the stack, so the on-stack option is not rejected on evidence. See the declared deviation.',
      basis: drivers.length > 0 ? 'evidence' : 'not-determined',
      citations: driverCitations(drivers),
    });
  }

  /* 7. The rejected-alternatives field — reads the array, does not restate it. */
  {
    const rejected = alternatives.filter((a) => a.verdict === 'rejected');
    const open = alternatives.filter((a) => a.verdict === 'not-determined');
    const limits: ContractLimit[] = [limit('standard-fit-not-assessed', 'qualifies', null)];
    fields.push({
      key: 'rejected-alternatives',
      label: CONTRACT_FIELD_LABELS['rejected-alternatives'],
      statement:
        rejected.length > 0
          ? `${rejected.map((a) => a.label).join('; ')} — rejected. ${open.length} alternative(s) remain open: ${open
              .map((a) => a.label)
              .join('; ')}.`
          : null,
      notDeterminedReason:
        rejected.length > 0
          ? null
          : 'No alternative was rejected on the evidence of this run. Every other option stays open with its reason.',
      basis: rejected.length > 0 ? (rejected.some((a) => a.basis === 'evidence') ? 'evidence' : 'stipulation') : 'not-determined',
      provenance: rejected.length > 0 ? 'reconstructed' : 'not-determined',
      citations: rejected.flatMap((a) => a.citations).slice(0, 8),
      limits,
    });
  }

  // The other route's verdict is read from the alternatives, not assumed: under
  // a deviation with no driver the on-stack route stays not determined, and the
  // headline must not say more than the record it summarises.
  const otherRoute = chosen === 'in-app-rap' ? 'side-by-side-cap' : 'in-app-rap';
  const otherVerdict = alternatives.find((a) => a.id === otherRoute)?.verdict;
  const targetName = deployment ? EDITION_NAMES[deployment] || deployment : 'a target that was not bound';
  const summary = `${ROUTE_LABELS[chosen]} on ${targetName}. ${ROUTE_LABELS[otherRoute]} ${
    otherVerdict === 'rejected' ? 'rejected' : 'not determined'
  }.${
    deviation ? ' Declared deviation from the recommended route.' : ''
  }`;

  const contract: ArchitectureContract = {
    contractVersion: CONTRACT_VERSION,
    contractId,
    boundRunId: runId,
    boundInputManifestHash: manifest?.hash || '',
    status: args.status || 'draft',
    summary,
    fields: CONTRACT_FIELDS.map((k) => fields.find((f) => f.key === k)!).filter(Boolean),
    alternatives: ALTERNATIVES.map((id) => alternatives.find((a) => a.id === id)!).filter(Boolean),
    route: { recommended, chosen, deviation },
    fingerprint: '',
  };
  contract.fingerprint = contractFingerprint(contract);
  return contract;
}
