import { buildAbapEvidence, type AbapEvidenceReport, type EvidenceFinding } from '@/lib/abap/evidence-model';
import { gradeSapObjectUse, hasNoReleasedApiPath } from '@/lib/abap/catalog-service';
import { rfcCallTarget } from '@/lib/abap/extensibility-router';
import { classifyElements, type ComparabilityVerdict, type ComparableElement } from '@/lib/abap/element-comparability';
import { resolvePublicCloudFit, type PublicCloudFitFinding } from '@/lib/abap/public-cloud-fit-resolver';
import type { PublicCloudFitAssignment } from '@/lib/abap/public-cloud-fit';
import type { ProcessSkeleton } from '@/lib/abap/process-skeleton';
import { readSource, type SourceReading } from '@/lib/first-look';
import { findingsOf } from '@/lib/it-findings-build';
import { sapCallsOf } from '@/lib/standard-fit';
import { plainLabels } from '@/lib/abap/plain-language';
import { buildFitToStandardDesign, type FitKeyUserPart, type FitToStandardDesign } from '@/lib/fit-to-standard-design';
import {
  fitToStandardGate,
  type FitGateAnalyzeState,
  type FitGateElement,
  type FitGateFinding,
  type FitGateObject,
  type FitGateObjectPath,
  type FitGateSapObjects,
  type FitToStandardGate,
} from '@/lib/fit-to-standard-gate';

/**
 * The readings the fit-to-standard gate and design stand on, gathered from one
 * stored source — roadmap 3.0.20, F1/F2.
 *
 * **Server-only**: it reaches the merged SAP catalog through
 * `buildAbapEvidence`, `findingsOf` and `gradeSapObjectUse`, exactly as the IT
 * findings route does, and adds no judgement of its own — the judgement is
 * `fitToStandardGate` (pure) and `buildFitToStandardDesign` (pure).
 *
 * `engineVersion` is the engine of the signed run the reading stands for
 * (`engineVersionOfProject`) — the findings are the ones that run signed.
 */

export interface FitToStandardReadInput {
  source: string;
  fileName: string;
  edition: 'public' | 'private' | null;
  catalogSnapshot: string | undefined;
  engineVersion: string | null;
  mode: 'project' | 'demo';
  hasRun: boolean;
  analyzeState: FitGateAnalyzeState;
  signedSourceSha256: string | null;
  customizing?: ReadonlyArray<{ ruleId: string; lineStart: number; lineEnd?: number }>;
}

export interface FitToStandardReading {
  gate: FitToStandardGate;
  evidence: AbapEvidenceReport;
  reading: SourceReading;
  skeleton: ProcessSkeleton;
  verdicts: Map<string, ComparabilityVerdict>;
  objects: FitGateObject[];
  /** The successor SAP's catalog names, by object — the E1 candidates of the design. */
  successors: Map<string, string>;
  sourceSha256: string;
  edition: 'public' | 'private';
  findings: FitGateFinding[];
  customizing: ReadonlyArray<{ ruleId: string; lineStart: number; lineEnd?: number }>;
  source: string;
}

/** Whether a file finding reads a file (`in`) or writes one (`out`), from its statement. */
export function fileDirection(f: Pick<EvidenceFinding, 'kind' | 'snippet' | 'title' | 'objectName'>): 'in' | 'out' | null {
  // The gui-download title is the same for both directions ("Upload/Download"), so it is not read for that kind.
  const text = `${f.objectName ?? ''} ${f.kind === 'dataset-io' ? f.title ?? '' : ''} ${f.snippet ?? ''}`.toUpperCase();
  if (f.kind === 'gui-download') {
    if (/UPLOAD/.test(text) && !/DOWNLOAD/.test(text)) return 'in';
    if (/DOWNLOAD/.test(text)) return 'out';
    return null;
  }
  if (f.kind === 'dataset-io') {
    if (/\bTRANSFER\b|FOR\s+(OUTPUT|APPENDING)/.test(text)) return 'out';
    if (/FOR\s+INPUT|READ\s+DATASET/.test(text)) return 'in';
    return null;
  }
  return null;
}

/** The engine finding as the gate reads it. */
export function gateFindingOf(f: EvidenceFinding): FitGateFinding {
  return {
    kind: f.kind,
    lineStart: f.lineStart,
    ...(typeof f.lineEnd === 'number' ? { lineEnd: f.lineEnd } : {}),
    ...(f.objectName ? { objectName: f.objectName.toUpperCase() } : {}),
    ...(f.kind === 'rfc-call' ? { outbound: rfcCallTarget(f) === 'outbound' } : {}),
    ...(f.kind === 'gui-download' || f.kind === 'dataset-io' ? { direction: fileDirection(f) } : {}),
    ...(f.unreachable || f.uncalled ? { notReached: true } : {}),
  };
}

function pathOf(a: PublicCloudFitAssignment): FitGateObjectPath {
  switch (a.rule) {
    case 'keep-platform-level':
      return 'released';
    case 'rebuild-path':
      return 'successor';
    case 'no-catalogued-path-none-named':
    case 'no-catalogued-path-not-listed':
      return 'no-path';
    case 'rebuild-own-work':
      return 'own-work';
    case 'retire-drop':
    case 'retire-candidate-zero-usage':
      return 'retire';
    default:
      return 'not-sorted';
  }
}

const isSapObject = (a: PublicCloudFitAssignment) => a.levelProvenance === 'catalog' || a.levelProvenance === 'catalog-residual';

export function readFitToStandard(input: FitToStandardReadInput): FitToStandardReading {
  const edition = input.edition ?? 'public';
  const evidence = buildAbapEvidence(input.source, input.fileName, edition, input.catalogSnapshot, input.engineVersion);
  const it = findingsOf(input.source, input.fileName, edition, input.catalogSnapshot, input.engineVersion);
  const reading = readSource(input.source);
  const skeleton = reading.skeleton;
  // `parallel-gateway` (2.17) is not in the comparability table; the classifier reads a kind it does not name as unknown.
  const verdicts = classifyElements(skeleton.nodes as unknown as ComparableElement[], skeleton.edges);

  const calls = sapCallsOf(it);
  const fitFindings: PublicCloudFitFinding[] = it.rows.map((r) => ({ objectName: r.objectName ?? '', kind: r.kind as EvidenceFinding['kind'] }));
  const resolved = resolvePublicCloudFit(
    { findings: fitFindings, calls, usageReport: null, targetPlatform: edition, catalogBasis: null },
    {
      gradeObjectUse: (name, use) => gradeSapObjectUse(name, use, input.catalogSnapshot),
      hasNoPath: (name) => hasNoReleasedApiPath(name, input.catalogSnapshot),
    },
  );
  const sapAssignments = resolved.assignments.filter(isSapObject);
  const firstLine = new Map<string, number>();
  for (const r of it.rows) {
    const name = (r.objectName ?? '').toUpperCase();
    if (name && (!firstLine.has(name) || r.lineStart < firstLine.get(name)!)) firstLine.set(name, r.lineStart);
  }
  for (const u of it.uses ?? []) {
    if (!firstLine.has(u.object) && u.lines.length > 0) firstLine.set(u.object, u.lines[0]);
  }
  const calledSet = new Set(calls);
  const objects: FitGateObject[] = sapAssignments.map((a) => ({
    name: a.objectName.toUpperCase(),
    path: pathOf(a),
    called: calledSet.has(a.objectName.toUpperCase()) && !it.rows.some((r) => (r.objectName ?? '').toUpperCase() === a.objectName.toUpperCase() && r.kind !== 'classic-api'),
    line: firstLine.get(a.objectName.toUpperCase()) ?? null,
  }));
  const successors = new Map<string, string>();
  for (const r of it.rows) {
    const name = (r.objectName ?? '').toUpperCase();
    if (name && r.successor && !successors.has(name)) successors.set(name, r.successor);
  }

  const sapObjects: FitGateSapObjects = sapAssignments.length === 0
    ? { state: 'none-used' }
    : { state: 'ready', objects };

  const elements: FitGateElement[] = skeleton.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    comparability: verdicts.get(n.id)?.comparability ?? 'unknown',
    anchor: n.anchor ? { lineStart: n.anchor.lineStart, lineEnd: n.anchor.lineEnd } : null,
  }));

  const gate = fitToStandardGate({
    mode: input.mode,
    hasRun: input.hasRun,
    analyzeState: input.analyzeState,
    signedSourceSha256: input.signedSourceSha256,
    sourceSha256: it.sourceSha256,
    edition: input.edition,
    findings: evidence.findings.map(gateFindingOf),
    sapObjects,
    elements,
    customizing: input.customizing,
  });

  return {
    gate,
    evidence,
    reading,
    skeleton,
    verdicts,
    objects,
    successors,
    sourceSha256: it.sourceSha256,
    edition,
    findings: evidence.findings.map(gateFindingOf),
    customizing: input.customizing ?? [],
    source: input.source,
  };
}

/** The engine's design (revision 1) from a reading — `null` when the gate did not offer and nobody asked against it. */
export function designFromReading(r: FitToStandardReading, requestedAgainstGate: boolean): FitToStandardDesign | null {
  const plain = plainLabels(r.skeleton, r.source).nodes;
  const keyUser: FitKeyUserPart[] = (r.evidence.keyUser?.candidates ?? []).map((c) => ({
    id: c.id,
    app: c.app,
    replaced: c.anchors.filter((a) => a.role === 'replaced').map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd })),
  }));
  return buildFitToStandardDesign({
    gate: r.gate,
    requestedAgainstGate,
    edition: r.edition,
    elements: r.skeleton.nodes.map((n) => {
      const v = r.verdicts.get(n.id);
      return {
        id: n.id,
        kind: n.kind,
        label: n.label,
        anchor: n.anchor ? { lineStart: n.anchor.lineStart, lineEnd: n.anchor.lineEnd } : null,
        comparability: v?.comparability ?? 'unknown',
        mayCarryCandidate: v?.mayCarryStandardCandidate ?? false,
        routine: n.anchor?.secondary?.reason === 'routine-definition'
          ? { lineStart: n.anchor.secondary.lineStart, lineEnd: n.anchor.secondary.lineEnd }
          : null,
      };
    }),
    findings: r.findings,
    objects: r.objects,
    successors: r.successors,
    keyUser,
    customizing: r.customizing,
    plainLabels: plain,
  });
}
