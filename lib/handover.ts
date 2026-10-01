/**
 * The handover — mockup v2.8 screen 6, roadmap 8.5 — as a reader reads it.
 *
 * The Delivery stage shows three things, and this module is where all three are
 * worked out so that the page only draws them:
 *
 *   1. **The evidence chain of the whole project**: source → signed run →
 *      analysis → design and sign-off → transformation draft → documentation →
 *      tests → cost simulation → decision. Every link is always present, with
 *      what is on record, where it comes from (`lib/provenance.ts`), who or what
 *      stands behind it, and what is missing. A link with nothing behind it says
 *      so in words; it is never dropped.
 *   2. **The handover package**: what the signed audit pack carries, file by
 *      file, and which of those files its signature covers.
 *   3. **Who confirmed what**, and the dated timeline.
 *
 * **No new trust logic.** Every verdict here is read from a module that already
 * owns it: the phase contract (`lib/workflow-steps.ts`) for state and staleness,
 * `testEvidence`/`coveringTestRunReceipt` for test runs, `readStoredDecision`
 * for the decision record, `buildEvidenceChain` for what the pack's own
 * signature says about its chain. Nothing in this file is signed or decides
 * what is signed; it describes. The pack's file list below is checked against
 * `buildAuditPackContents` by `tests/delivery-handover.spec.ts`, so a file added
 * to the pack cannot be missing from the screen.
 *
 * Pure: no React, no Firestore.
 */

import type { Project } from './types';
import type { ProvenanceValue } from './provenance';
import type { PhaseKey, RailStep } from './workflow-steps';
import { testEvidence, staleness } from './workflow-steps';
import { coveringTestRunReceipt } from './test-receipt';
import { isEngineDocumentation } from './process-documentation';
import { readStoredDecision, ARCHITECTURE_OPTION, type StoredDecision } from './decision-draft';
import { buildEvidenceChain, type EvidenceChain } from './evidence-chain';
import { sha256Hex } from './artefact-digest';
import { toDate } from './format';

/* ------------------------------------------------------------------ links */

export const HANDOVER_LINKS = [
  'source',
  'run',
  'analysis',
  'design',
  'transformation',
  'documentation',
  'tests',
  'economics',
  'decision',
] as const;
export type HandoverLinkKey = (typeof HANDOVER_LINKS)[number];

export const HANDOVER_LINK_LABELS: Readonly<Record<HandoverLinkKey, string>> = Object.freeze({
  source: 'Source code',
  run: 'Signed analysis run',
  analysis: 'Analysis',
  design: 'Design and sign-off',
  transformation: 'Transformation draft',
  documentation: 'Documentation',
  tests: 'Tests',
  economics: 'Cost simulation',
  decision: 'Decision',
});

/** Where a link is made — the stage a reader opens to change it. */
const LINK_STAGE: Readonly<Record<HandoverLinkKey, PhaseKey | 'management'>> = Object.freeze({
  source: 'analyze',
  run: 'analyze',
  analysis: 'analyze',
  design: 'design',
  transformation: 'transformation',
  documentation: 'documentation',
  tests: 'testing',
  economics: 'tco',
  decision: 'management',
});

/** `on-record`: something is there. `open`: nothing is. `stale`: built for a previous source. */
export type HandoverLinkState = 'on-record' | 'open' | 'stale';

export interface HandoverLink {
  key: HandoverLinkKey;
  label: string;
  /** The stage that makes this link, or `management` for the decision (made in the workspace). */
  stage: PhaseKey | 'management';
  state: HandoverLinkState;
  provenance: ProvenanceValue;
  /** A few words after the chip — "source changed", "against mocks". */
  provenanceNote: string | null;
  /** What is on record, in plain words. `null` exactly when `state` is `open`. */
  value: string | null;
  /** Who or what stands behind it: an account, "the server", "the engine". */
  by: string | null;
  /** When, as it was recorded. */
  at: string | null;
  /** What is missing or what the record does not cover. Never a pleasantry; `null` only when nothing is. */
  missing: string | null;
}

/** A hydrated project as the delivery page holds it: the project with its active run spread over it. */
export type HandoverProject = Project & Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** A Firestore Timestamp, `{seconds}`, Date or ISO string, as ISO — or `null`. */
export function isoOf(value: unknown): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

/** The fingerprint of the source the active run signed — the run's own, else the project's mirror. */
function signedFingerprint(project: HandoverProject) {
  const own = project.inputFingerprint as { sha256?: string; fileName?: string; lineCount?: number } | undefined;
  return own?.sha256 ? own : project.auditMetadata?.inputFingerprint;
}

/**
 * The source the active run signed, and nothing else — the same comparison the
 * Documentation stage makes before it offers the BPMN export (roadmap 2.6): the
 * export's line anchors are only true while the source on the project still
 * hashes to the digest the run signed.
 */
export function signedSourceOf(project: HandoverProject | null): { source: string; fileName: string } | null {
  if (!project) return null;
  const source = typeof project.legacyCode === 'string' ? project.legacyCode : '';
  if (!str(project.activeRunId) || !source.trim()) return null;
  const signed = signedFingerprint(project);
  if (!signed?.sha256 || sha256Hex(source) !== signed.sha256) return null;
  return { source, fileName: signed.fileName || 'source.abap' };
}

/** The stored decision record, read back as `confirm-decision` reads it. `null` when there is none. */
export function storedDecisionOf(project: HandoverProject | null): StoredDecision | null {
  return project ? readStoredDecision(project.decision) : null;
}

/** The signed-off target in words, or `null` when nothing is signed off. */
export function signedOffTarget(project: HandoverProject | null): string | null {
  if (!project?.approvedByArchitect || !project.targetArchitecture) return null;
  return ARCHITECTURE_OPTION[project.targetArchitecture]?.label ?? project.targetArchitecture;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function link(
  key: HandoverLinkKey,
  facts: Omit<HandoverLink, 'key' | 'label' | 'stage' | 'state'> & { stale?: boolean },
): HandoverLink {
  const { stale, ...rest } = facts;
  return {
    key,
    label: HANDOVER_LINK_LABELS[key],
    stage: LINK_STAGE[key],
    state: stale ? 'stale' : rest.value === null ? 'open' : 'on-record',
    ...rest,
  };
}

/**
 * The nine links, in order, from what is on record. `phases` is
 * `workflowSteps(project)` — passed in, so the page and this chain read one
 * contract and cannot disagree about a phase.
 */
export function buildHandoverChain(project: HandoverProject, phases: RailStep[]): HandoverLink[] {
  const phase = (k: PhaseKey) => phases.find((p) => p.key === k)!;
  const s = staleness(project);
  const fp = signedFingerprint(project);
  const hasSource = !!str(project.legacyCode);
  const runId = str(project.activeRunId);
  const runAt = isoOf(project.createdAt);
  const engine = str(project.analyzerVersion) ?? project.auditMetadata?.modelCard?.engineVersion ?? null;

  const source = !hasSource
    ? link('source', {
        provenance: 'not-determined', provenanceNote: null, value: null, by: null, at: null,
        missing: 'No source is staged on this project.',
      })
    : link('source', {
        stale: s.sourceChanged,
        provenance: s.sourceChanged ? 'stale' : 'imported',
        provenanceNote: s.sourceChanged ? 'changed after the run' : null,
        value: fp?.fileName
          ? `${fp.fileName}${typeof fp.lineCount === 'number' ? ` · ${plural(fp.lineCount, 'line')}` : ''}`
          : 'Source staged',
        by: 'Uploaded to this project',
        at: isoOf(project.auditMetadata?.inputFingerprint?.uploadedAt),
        missing: s.sourceChanged
          ? 'The source on the project is not the one the signed run read. Run the analysis again.'
          : null,
      });

  const analyze = phase('analyze');
  const run = !runId
    ? link('run', {
        provenance: 'not-determined', provenanceNote: null, value: null, by: null, at: null,
        missing: 'No signed run is on record, and every later link stands on one.',
      })
    : project._runLoadFailed
      ? link('run', {
          provenance: 'not-determined', provenanceNote: null, value: null, by: null, at: null,
          missing: 'A signed run is on record and could not be read, so what it contains is not determined.',
        })
      : link('run', {
          stale: analyze.state === 'stale',
          provenance: analyze.state === 'stale' ? 'stale' : 'proven',
          provenanceNote: analyze.state === 'stale' ? 'inputs changed' : 'signed',
          value: `Run ${runId.slice(0, 12)}${engine ? ` · engine ${engine}` : ''}`,
          by: 'Signed by the server',
          at: runAt,
          missing: analyze.state === 'stale' ? analyze.detail : null,
        });

  const score = typeof project.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
  const worklist = Array.isArray(project.worklist) ? project.worklist.length : null;
  const narrative = project.auditMetadata?.modelCard?.modelParticipation;
  const analysis = !runId || project._runLoadFailed
    ? link('analysis', {
        provenance: 'not-determined', provenanceNote: null, value: null, by: null, at: null,
        missing: 'Without a readable signed run there are no findings to hand over.',
      })
    : link('analysis', {
        stale: analyze.state === 'stale',
        provenance: analyze.state === 'stale' ? 'stale' : 'proven',
        provenanceNote: null,
        value: [
          score !== null ? `Clean Core Score ${score}` : 'Score not recorded',
          worklist !== null ? plural(worklist, 'work item') : null,
        ].filter(Boolean).join(' · '),
        by: 'The deterministic engine',
        at: runAt,
        missing:
          narrative === 'none'
            ? 'No model took part. The score is a grade, not a compliance percentage.'
            : 'The narrative text is not signed. The score is a grade, not a compliance percentage.',
      });

  const designPhase = phase('design');
  const target = signedOffTarget(project);
  const decision = storedDecisionOf(project);
  const contract = decision?.bindings.find((b) => b.key === 'contract');
  const contractWords = contract?.revision
    ? `Contract ${contract.revision}.`
    : 'No architecture contract is bound yet; the decision binds it.';
  const design = designPhase.state === 'empty'
    ? link('design', {
        provenance: 'not-determined', provenanceNote: null, value: null, by: null, at: null,
        missing: 'No solution design yet, and no target architecture is confirmed.',
      })
    : link('design', {
        stale: designPhase.state === 'stale',
        provenance: designPhase.state === 'stale' ? 'stale' : target ? 'confirmed' : 'proposed',
        provenanceNote: target && designPhase.state !== 'stale' ? 'self-declaration' : null,
        value: target ? `Target: ${target}` : 'Design drafted — target not confirmed',
        by: target ? str(project.approvedBy) ?? 'The signed-in account' : 'Written by the language model',
        at: target ? isoOf(project.architectSignOffAt) : null,
        missing: designPhase.state === 'stale'
          ? designPhase.detail
          : target
            ? contractWords
            : `Nobody has confirmed the target architecture. ${contractWords}`,
      });

  const tf = phase('transformation');
  const transformation = tf.state === 'empty'
    ? link('transformation', {
        provenance: 'not-determined', provenanceNote: null, value: null, by: null, at: null,
        missing: 'No target code generated.',
      })
    : link('transformation', {
        stale: tf.state === 'stale',
        provenance: tf.state === 'stale' ? 'stale' : 'proposed',
        provenanceNote: null,
        value: 'Target code generated',
        by: 'Written by the language model',
        at: isoOf(project.auditMetadata?.modelCard?.transformationTimestamp),
        missing: tf.state === 'stale'
          ? tf.detail
          : 'Not compiled or tested here, not signed, and not part of the audit pack.',
      });

  const docPhase = phase('documentation');
  const fromCode = isEngineDocumentation(project.documentation);
  const documentation = docPhase.state === 'empty'
    ? link('documentation', {
        provenance: 'not-determined', provenanceNote: null, value: null, by: null, at: null,
        missing: 'No documentation yet.',
      })
    : link('documentation', {
        stale: docPhase.state === 'stale',
        provenance: docPhase.state === 'stale' ? 'stale' : fromCode ? 'reconstructed' : 'proposed',
        provenanceNote: null,
        value: fromCode ? 'Process documentation, read from the code' : 'Process blueprint, earlier form',
        by: fromCode ? 'The deterministic engine' : 'Written by the language model',
        at: null,
        missing: docPhase.state === 'stale'
          ? docPhase.detail
          : fromCode
            ? 'Owner, roles, KPIs and duration are not determined from code.'
            : 'Read it again from the code on the Documentation stage.',
      });

  const testPhase = phase('testing');
  const ev = testEvidence(project);
  const receipt = coveringTestRunReceipt(project as Parameters<typeof coveringTestRunReceipt>[0]);
  const tests = ev.total === 0
    ? link('tests', {
        provenance: 'not-determined', provenanceNote: null, value: null, by: null, at: null,
        missing: 'No test suite generated.',
      })
    : testPhase.state === 'stale'
      ? link('tests', {
          stale: true, provenance: 'stale', provenanceNote: null,
          value: `${plural(ev.total, 'test case')} written`,
          by: null, at: null, missing: testPhase.detail,
        })
      : receipt && ev.attestedPasses + ev.attestedFailures > 0
        ? link('tests', {
            // The only runner is the sandbox (`TestRunReceipt.environment` is
            // always `mock`): an execution is on record, against mocks.
            provenance: 'demonstrated-mock',
            provenanceNote: null,
            value: `${ev.attestedPasses} of ${ev.total} passed in a recorded run`,
            by: receipt.executedBy || 'The test sandbox',
            at: receipt.executedAt || null,
            missing: [
              ev.attestedFailures > 0 ? `${ev.attestedFailures} failed.` : null,
              'Run in the sandbox against mocks, not against an SAP system.',
            ].filter(Boolean).join(' '),
          })
        : link('tests', {
            provenance: ev.passed + ev.failed > 0 ? 'not-determined' : 'proposed',
            provenanceNote: null,
            value: `${plural(ev.total, 'test case')} generated`,
            by: 'Written by the language model',
            at: null,
            missing: testPhase.detail,
          });

  const economics = link('economics', {
    provenance: 'not-determined',
    provenanceNote: null,
    value: null,
    by: null,
    at: null,
    missing: runId
      ? 'Cost figures are entered on the Economics stage and not stored, so no simulation travels with the package.'
      : 'No signed run — the cost model starts from its score.',
  });

  const decisionLink = !decision || decision.status === 'withdrawn' || decision.status === 'superseded'
    ? link('decision', {
        provenance: 'not-determined', provenanceNote: null, value: null, by: null, at: null,
        missing: decision?.status === 'withdrawn'
          ? 'The decision was withdrawn. Confirm a new one in the Management view.'
          : 'No decision is recorded. It is confirmed in the Management view of the workspace.',
      })
    : (() => {
        const open = decision.conditions.filter((c) => c.status === 'open' || c.status === 'not-determined').length;
        const confirmed = decision.status === 'confirmed' && decision.confirmation;
        return link('decision', {
          provenance: confirmed ? 'confirmed' : 'reconstructed',
          provenanceNote: confirmed ? 'self-declaration' : 'draft',
          value: `${decision.decisionId} · revision ${decision.revision} — ${decision.summary}`,
          by: confirmed ? decision.confirmation!.account : 'Derived by rules, not confirmed',
          at: confirmed ? decision.confirmation!.at : null,
          missing: [
            confirmed ? null : 'Not confirmed yet.',
            open > 0 ? `${plural(open, 'condition')} still open.` : null,
          ].filter(Boolean).join(' ') || null,
        });
      })();

  return [source, run, analysis, design, transformation, documentation, tests, economics, decisionLink];
}

export interface ChainSummary {
  onRecord: number;
  proven: number;
  open: number;
  stale: number;
  of: number;
}

export function chainSummary(links: readonly HandoverLink[]): ChainSummary {
  return {
    onRecord: links.filter((l) => l.state === 'on-record').length,
    proven: links.filter((l) => l.state === 'on-record' && l.provenance === 'proven').length,
    open: links.filter((l) => l.state === 'open').length,
    stale: links.filter((l) => l.state === 'stale').length,
    of: links.length,
  };
}

/* ------------------------------------------------------- the package itself */

export type PackFileKind = 'signed' | 'attested' | 'manifest';

export interface PackFile {
  path: string;
  kind: PackFileKind;
  /** What the file is, for a reader who will not open it. */
  what: string;
}

/**
 * The files of the signed audit pack, in the order the archive lists them.
 * `tests/delivery-handover.spec.ts` compares this list with what
 * `buildAuditPackContents` actually produces.
 */
export const AUDIT_PACK_FILES: readonly PackFile[] = Object.freeze([
  { path: '00-executive-summary.md', kind: 'signed', what: 'Executive summary' },
  { path: '00-executive-summary.doc', kind: 'signed', what: 'Executive summary, as a Word document' },
  { path: '00-provenance.md', kind: 'signed', what: 'Where each statement in the pack comes from' },
  { path: '01-input-fingerprint.json', kind: 'signed', what: 'Fingerprint of the source the run read' },
  { path: '02-decision-record.json', kind: 'signed', what: 'The engine’s recommendation — not a decision' },
  { path: '03-findings.csv', kind: 'signed', what: 'The findings of the signed run' },
  { path: '04-model-card.md', kind: 'signed', what: 'Whether and how a language model took part' },
  { path: '05-known-limitations.md', kind: 'signed', what: 'What the engine cannot see' },
  { path: '06-architecture-decision-record.md', kind: 'signed', what: 'Architecture record of the engine’s recommendation' },
  { path: '08-input-manifest.json', kind: 'signed', what: 'What the run was computed from' },
  { path: '09-evidence-chain.json', kind: 'signed', what: 'The pack’s evidence chain and what each link does not cover' },
  { path: '07-user-attested.md', kind: 'attested', what: 'Your own statements: target choice and sign-off' },
  { path: 'manifest.json', kind: 'manifest', what: 'Digests of every file and the signature' },
]);

/** What the signed files carry, in a reader's words — one line per subject, not per file. */
export const SIGNED_COVERS: readonly string[] = Object.freeze([
  'The findings of the signed run',
  'The fingerprint of the source it read, and what else it was computed from',
  'The engine’s recommendation — not a decision',
  'Whether and how a language model took part',
  'What the engine cannot see',
  'The executive summary',
  'The pack’s own evidence chain',
]);

/** What the pack's signature does not stand behind — the honest other half of "signed". */
export const NOT_SIGNED: readonly string[] = Object.freeze([
  'Your sign-off and target choice — the file is sealed, its content is your word',
  'Narrative text written by a language model',
  'The clean-core level grade (A–D)',
  'Generated code, documentation, tests and slides',
  'Management, Business and IT views',
]);

/** The pack's own chain (roadmap 8.5), from the same signed fields the issuing route reads. */
export function packEvidenceChain(project: HandoverProject): EvidenceChain {
  return buildEvidenceChain({
    projectId: str(project.id) ?? '',
    runId: str(project.activeRunId) ?? '',
    inputManifest: project.inputManifest ?? project.auditMetadata?.inputManifest,
    sourceSha256: project.auditMetadata?.inputFingerprint?.sha256,
    modelParticipation: project.auditMetadata?.modelCard?.modelParticipation,
  });
}

/* ------------------------------------------------- who, when, and what next */

export interface Confirmation {
  what: string;
  account: string;
  at: string | null;
  /** `confirmed` is a self-declaration; `demonstrated-mock` a recorded sandbox run. */
  provenance: ProvenanceValue;
}

/** Every act of a person on record for this project, in the order they happened. */
export function confirmationsOf(project: HandoverProject): Confirmation[] {
  const out: Confirmation[] = [];
  const target = signedOffTarget(project);
  if (target) {
    out.push({
      what: `Confirmed the target architecture: ${target}`,
      account: str(project.approvedBy) ?? 'The signed-in account',
      at: isoOf(project.architectSignOffAt),
      provenance: 'confirmed',
    });
  }
  const receipt = coveringTestRunReceipt(project as Parameters<typeof coveringTestRunReceipt>[0]);
  if (receipt?.executedBy) {
    out.push({ what: 'Ran the test suite in the sandbox', account: receipt.executedBy, at: receipt.executedAt || null, provenance: 'demonstrated-mock' });
  }
  const decision = storedDecisionOf(project);
  for (const c of decision?.conditions ?? []) {
    if (c.attestation) {
      out.push({ what: `Set a condition to ${c.status}: ${c.text}`, account: c.attestation.account, at: c.attestation.at, provenance: 'confirmed' });
    }
  }
  if (decision?.status === 'confirmed' && decision.confirmation) {
    out.push({
      what: `Confirmed decision ${decision.decisionId}, revision ${decision.revision}`,
      account: decision.confirmation.account,
      at: decision.confirmation.at,
      provenance: 'confirmed',
    });
  }
  return out.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
}

export interface TimelineEntry {
  at: string;
  sentence: string;
  account: string | null;
}

/** The dated facts of this handover, oldest first. Undated facts are not guessed into it. */
export function handoverTimeline(project: HandoverProject): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const push = (at: string | null, sentence: string, account: string | null = null) => {
    if (at) out.push({ at, sentence, account });
  };
  push(isoOf(project.auditMetadata?.inputFingerprint?.uploadedAt), 'Source uploaded');
  push(str(project.activeRunId) ? isoOf(project.createdAt) : null, 'Analysis run signed by the server');
  const target = signedOffTarget(project);
  if (target) push(isoOf(project.architectSignOffAt), `Target architecture confirmed: ${target}`, str(project.approvedBy));
  const receipt = coveringTestRunReceipt(project as Parameters<typeof coveringTestRunReceipt>[0]);
  if (receipt) push(receipt.executedAt || null, 'Test suite ran in the sandbox', receipt.executedBy || null);
  const decision = storedDecisionOf(project);
  for (const e of decision?.timeline ?? []) {
    // The run's own entry is already above, from the run itself.
    if (e.kind !== 'run-signed') push(e.at, e.sentence, e.account);
  }
  push(isoOf(project.auditMetadata?.auditPackExportedAt), 'Audit pack sealed and downloaded');
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export type NextStep =
  | { kind: 'blocked'; headline: string; reason: string }
  | { kind: 'open'; headline: string; reason: string; href: string; action: string }
  | { kind: 'none'; headline: string; reason: string };

/**
 * The rule-based next step of the handover. Read off the same contract as the
 * stepper: what blocks, then the first phase whose own output is missing, then
 * a test run nobody recorded, then the decision.
 */
export function handoverNextStep(
  project: HandoverProject,
  phases: RailStep[],
  blockers: readonly string[],
  links: readonly HandoverLink[],
  projectId: string,
): NextStep {
  const openLinks = links.filter((l) => l.state === 'open').length;
  const travels = openLinks === 0
    ? 'Every link of the chain has a record.'
    : `${plural(openLinks, 'link')} of the chain ${openLinks === 1 ? 'stays' : 'stay'} not determined and ${openLinks === 1 ? 'travels' : 'travel'} with the package, named.`;
  if (blockers.length > 0) {
    return {
      kind: 'blocked',
      headline: 'Rebuild what was made for a previous source',
      reason: `${plural(blockers.length, 'artefact')} no longer match${blockers.length === 1 ? 'es' : ''} the source under analysis. Nothing leaves this page until ${blockers.length === 1 ? 'it is' : 'they are'} rebuilt.`,
    };
  }
  const phase = (k: PhaseKey) => phases.find((p) => p.key === k)!;
  const order: PhaseKey[] = ['design', 'transformation', 'documentation', 'testing'];
  const missing = order.map(phase).find((p) => !p.done);
  if (missing) {
    // What has to happen, in words; the button names where.
    const WHAT: Partial<Record<PhaseKey, string>> = {
      design: missing.state === 'empty' ? 'Draft the target design' : 'Confirm the target architecture',
      transformation: 'Generate the target code',
      documentation: 'Document the process',
      testing: missing.state === 'empty' ? 'Generate the test suite' : 'Run the test suite',
    };
    return {
      kind: 'open',
      headline: missing.state === 'stale' ? `Rebuild ${missing.label.toLowerCase()} for the current source` : WHAT[missing.key] ?? `Open ${missing.label}`,
      reason: `${missing.detail} ${travels}`,
      href: `/project/${projectId}/${missing.path}`,
      action: `Open ${missing.label}`,
    };
  }
  const testing = phase('testing');
  if (!testing.proven) {
    return {
      kind: 'open',
      headline: 'Run the test suite',
      reason: `${testing.detail} ${travels}`,
      href: `/project/${projectId}/testing`,
      action: 'Open Testing',
    };
  }
  const decision = storedDecisionOf(project);
  if (!decision || decision.status !== 'confirmed') {
    return {
      kind: 'open',
      headline: 'Confirm the decision',
      reason: `Code, documentation and a recorded test run are there; no confirmed decision is. ${travels}`,
      href: `/project/${projectId}?view=management`,
      action: 'Open the Management view',
    };
  }
  return {
    kind: 'none',
    headline: 'Nothing open — hand the package to operations',
    reason: travels,
  };
}
