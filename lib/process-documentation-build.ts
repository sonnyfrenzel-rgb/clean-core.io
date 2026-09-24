import { buildProcessSkeleton, type ProcessSkeleton } from '@/lib/abap/process-skeleton';
import { attachTo, buildBusinessStatements } from '@/lib/abap/business-statement';
import { sha256Hex } from '@/lib/artefact-digest';
import type { ProcessMapModel } from '@/lib/process-map';
import {
  NOT_DETERMINED_LABEL,
  PROCESS_DOCUMENTATION_DISCLAIMER,
  PROCESS_DOCUMENTATION_FORMAT,
  PROCESS_DOCUMENTATION_FORMAT_VERSION,
  type DocAnchor,
  type DocGap,
  type DocLane,
  type DocProposedLane,
  type DocStatement,
  type DocStep,
  type ProcessDocumentation,
} from '@/lib/process-documentation';
import { stripModelMarkdown } from '@/lib/model-text';

/**
 * The builder of the stage-4 document — roadmap 3.0.5, Weg C.
 *
 * Four engine readings of one source, and the naming stage's proposals where
 * one is saved. Nothing is asked of a model here and nothing is added:
 *
 *   - the **steps** are the elements of the process map — the same BPMN the
 *     map draws and the `.bpmn` export writes, so the document, the picture and
 *     the file are one reading (`buildProcessMapModel`, which already carries
 *     2.4's business names and lanes, applied only to the source they were made
 *     for);
 *   - the **business statements** are 17.7's sentences (`buildBusinessStatements`),
 *     all of them, across the whole program — this is where a rule written
 *     after character 1,000 arrives (QA24-A10) — and each step carries the one
 *     `attachTo` picks for its lines;
 *   - the **effects** are the update-task states of 2.12, from the skeleton;
 *   - the **lanes** are the ones the code proves (2.16), and the naming stage's
 *     proposed lanes beside them, marked as proposals.
 *
 * What the old blueprint asserted and none of these readings gives — an owner,
 * roles, KPIs, a duration, a strategic goal — is listed as not determined, with
 * the reason. It is not left out: a document that silently drops the owner
 * reads as if the question had not occurred to anyone.
 *
 * Pure: no React, no DOM, no network, no clock. The caller holds the map
 * (the page builds it anyway to draw it) and the source it was built from.
 */

export interface ProcessDocumentationInput {
  /** The source the active run signed — the whole of it. */
  source: string;
  /** `buildProcessMapModel(...)` of exactly that source. */
  map: ProcessMapModel;
  /** The skeleton of the same source, when the caller has it; read here otherwise. */
  skeleton?: ProcessSkeleton;
}

/** The five things the old blueprint invented, and why the engine has none of them. */
export const DOCUMENTATION_GAPS: readonly DocGap[] = Object.freeze([
  {
    subject: 'Process owner',
    label: NOT_DETERMINED_LABEL,
    reason: 'ABAP source names no organisational owner. Accountability in this product is the signed-in account, which is a self-declaration and not stored on the document.',
  },
  {
    subject: 'Roles',
    label: NOT_DETERMINED_LABEL,
    reason: 'The source proves authorization objects (AUTHORITY-CHECK) and screens, not who holds them. The lanes above are those tokens; no job title is derived from them.',
  },
  {
    subject: 'KPIs',
    label: NOT_DETERMINED_LABEL,
    reason: 'No key figure is measured in the source. A target would be an assumption, and none is entered here.',
  },
  {
    subject: 'Duration',
    label: NOT_DETERMINED_LABEL,
    reason: 'Run time and effort are not in the source. A usage import measures executions, not durations.',
  },
  {
    subject: 'Strategic goal',
    label: NOT_DETERMINED_LABEL,
    reason: 'Why the program exists is not written in its statements. The business statements say what it does.',
  },
]);

const anchorOf = (range: { lineStart: number; lineEnd: number }): DocAnchor => ({
  lineStart: range.lineStart,
  lineEnd: range.lineEnd,
});

/** A model-written name, stripped of Markdown and whitespace runs; null when nothing is left. */
function cleanName(name: string | null): string | null {
  if (!name) return null;
  const clean = stripModelMarkdown(name).replace(/\s+/g, ' ').trim();
  return clean || null;
}

export function buildProcessDocumentation(input: ProcessDocumentationInput): ProcessDocumentation {
  const { source, map } = input;
  const skeleton = input.skeleton ?? buildProcessSkeleton(source);

  const sentences = buildBusinessStatements(source);
  const statements: DocStatement[] = sentences.map((sentence) => ({
    id: sentence.id,
    text: sentence.text,
    anchors: sentence.anchors.map(anchorOf),
    grain: sentence.grain,
    provenance: 'reconstructed',
  }));

  const attached = attachTo(
    map.elements.map((element) => ({ id: element.id, anchor: element.anchor })),
    sentences,
  );

  const steps: DocStep[] = map.elements.map((element) => {
    const businessName = cleanName(element.businessName);
    const lane = cleanName(element.lane);
    return {
      id: element.id,
      kind: element.kind,
      technicalName: element.technicalName,
      businessName,
      lane,
      namingProvenance: businessName || lane ? 'proposed' : null,
      provenance: element.status,
      anchor: element.anchor ? anchorOf(element.anchor) : null,
      undetermined: element.anchor
        ? null
        : {
            label: NOT_DETERMINED_LABEL,
            reason: element.unanchoredReason ?? 'the reconstruction drew this element without a line range of its own.',
          },
      level: element.plane,
      next: element.branches.map((branch) => ({ to: branch.to, condition: branch.condition })),
      statementId: attached.get(element.id)?.id ?? null,
    };
  });

  const lanes: DocLane[] = skeleton.lanes.map((lane) => ({
    name: lane.name,
    kind: lane.kind,
    basis: [...new Set(lane.evidence.map((e) => e.statement))],
    anchor: anchorOf(lane.anchor),
    provenance: 'reconstructed',
  }));

  // 2.4's lanes, only as the map applied them — which is only when a naming was
  // saved for this very source. A lane rests on an AUTHORITY-CHECK or on nothing,
  // and the second kind says so instead of borrowing a neighbour's lines.
  const proposedLanes: DocProposedLane[] = map.lanes.map((lane) => ({
    name: cleanName(lane.name) ?? lane.name,
    authorityObject: lane.authorityObject,
    anchor: lane.anchor ? anchorOf(lane.anchor) : null,
    undetermined: lane.anchor
      ? null
      : { label: NOT_DETERMINED_LABEL, reason: 'the naming stage proposed this lane without an AUTHORITY-CHECK behind it.' },
    provenance: 'proposed',
    statement: lane.statement,
  }));

  return {
    format: PROCESS_DOCUMENTATION_FORMAT,
    formatVersion: PROCESS_DOCUMENTATION_FORMAT_VERSION,
    processName: map.processName,
    fileName: map.fileName,
    sourceSha256: sha256Hex(source),
    lineCount: source.split('\n').length,
    overview: map.overview,
    traceability: { ...map.traceability },
    naming: { ...map.naming },
    steps,
    statements,
    effects: {
      registrations: skeleton.luw.registrations.map((registration) => ({
        module: registration.module,
        anchor: anchorOf(registration),
        outcomes: registration.outcomes.map((outcome) => ({
          state: outcome.state,
          anchor: anchorOf(outcome),
          conditional: outcome.conditional,
        })),
        unresolved: registration.unresolved
          ? { state: registration.unresolved.state, reason: registration.unresolved.reason }
          : null,
        updateMode: { value: registration.updateMode.value, reason: registration.updateMode.reason },
        updateKind: { value: registration.updateKind.value, reason: registration.updateKind.reason },
      })),
      events: skeleton.luw.events.map((event) => ({
        kind: event.kind,
        token: event.token,
        anchor: anchorOf(event),
        andWait: event.andWait,
        subrcCarriesUpdateResult: event.subrcCarriesUpdateResult,
      })),
    },
    lanes,
    proposedLanes,
    notDetermined: DOCUMENTATION_GAPS.map((gap) => ({ ...gap })),
    disclaimer: PROCESS_DOCUMENTATION_DISCLAIMER,
  };
}
