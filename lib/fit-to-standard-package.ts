import type { ProcessSkeleton, SkeletonEdge, SkeletonNode } from './abap/process-skeleton';
import { buildBpmnExport } from './bpmn/export';
import {
  FIT_DESIGN_HEADER,
  FIT_DISPOSITION_LABELS,
  fitDesignLists,
  fitDesignSummary,
  type FitEntry,
} from './fit-to-standard-design';
import { fitConditions, type FitToStandardRevision } from './fit-to-standard-store';
import { DECISION_OPTION_MEANINGS } from './decision-options';
import { keyUserStepsMarkdown, type KeyUserStepList } from './key-user-steps';

/**
 * The package without code — roadmap 3.0.20, step F7
 * (`docs/design/fit-to-standard-concept.md` §4.6, §5.5).
 *
 * On the standard path Delivery hands over a decision, not a build. Beside
 * the README, STATUS.md and `docs/decision.md` the delivery package already
 * writes, these files travel:
 *
 *   | Path                                | What                                                                |
 *   |-------------------------------------|---------------------------------------------------------------------|
 *   | `docs/fit-to-standard.md`           | the three lists, each row with lines, reference, check word, level   |
 *   | `docs/gap-list.md`, `.csv`          | one row per business step — the delta list a workshop works through |
 *   | `docs/key-user-backlog.md`          | the key-user gaps, with the 3.0.19 key-user step list where it holds |
 *   | `docs/organisational-changes.md`    | the gaps resolved by a change in the process or a role               |
 *   | `docs/workshop-questions.md`        | one question per open step, for the fit-to-standard workshop         |
 *   | `docs/decommissioning.md`           | what is switched off once the standard runs                          |
 *   | `process/as-is.bpmn`                | the reconstructed process, BPMN 2.0 XML                              |
 *   | `process/fit-to-standard.bpmn`      | the to-be: given-up single steps removed and bridged, the rest named |
 *
 * No code and no test file is in it. Every sentence says where it comes from:
 * what is given up is the engine's reading with its lines; what the standard
 * does is a candidate or the account's confirmation after the workshop — never
 * "covered by SAP", never "verified", never a claim about a target tool.
 *
 * Server-side (the BPMN exporter reads the skeleton); pure otherwise.
 */

export const FIT_PACKAGE_PATHS = Object.freeze({
  design: 'docs/fit-to-standard.md',
  gapList: 'docs/gap-list.md',
  gapCsv: 'docs/gap-list.csv',
  keyUser: 'docs/key-user-backlog.md',
  organisational: 'docs/organisational-changes.md',
  workshop: 'docs/workshop-questions.md',
  decommissioning: 'docs/decommissioning.md',
  asIs: 'process/as-is.bpmn',
  toBe: 'process/fit-to-standard.bpmn',
});

export interface FitPackageInput {
  projectName: string;
  sourceFileName: string;
  source: string;
  skeleton: ProcessSkeleton;
  revision: FitToStandardRevision;
  /** The engine's key-user step list (3.0.19), when the signed run's engine reads one. */
  keyUserSteps: KeyUserStepList | null;
}

export interface FitPackageFile {
  path: string;
  content: string;
}

const lines = (a: FitEntry['anchor']) => (a ? (a.lineEnd > a.lineStart ? `L${a.lineStart}–L${a.lineEnd}` : `L${a.lineStart}`) : 'Unanchored');
const nameOf = (e: FitEntry) => e.plainLabel ?? e.label;
const CHECK = { verified: 'checked against SAP data', catalog: "from SAP's catalog — to verify", unverified: 'not checked — to verify', mismatch: 'does not match SAP data' } as const;
const refText = (e: FitEntry) => (e.standardRef ? `${e.standardRef.id}${e.standardRef.title ? ` (${e.standardRef.title})` : ''} — ${CHECK[e.standardRef.check]}` : '—');
const md = (t: string) => t.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const csv = (t: string) => (/[",\r\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
const provenanceWords = { reconstructed: 'Reconstructed from the code', 'model-proposal': 'Model proposal', confirmed: 'Confirmed by the account' } as const;

function table(rows: FitEntry[]): string[] {
  if (rows.length === 0) return ['None.', ''];
  const out = ['| Step | Lines | Reference | Level | Where it comes from |', '|---|---|---|---|---|'];
  for (const e of rows) out.push(`| ${md(nameOf(e))} | ${lines(e.anchor)} | ${md(refText(e))} | ${e.evidenceLevel} | ${provenanceWords[e.provenance]} |`);
  out.push('');
  return out;
}

function head(title: string, input: FitPackageInput): string[] {
  const r = input.revision;
  return [
    `# ${title} — ${input.projectName}`,
    '',
    `Fit-to-standard design revision ${r.revision}, ${r.kind === 'confirmation' ? `confirmed by ${r.createdBy.name} on ${r.createdAt.slice(0, 10)} — a self-declaration` : 'the engine\'s derivation, not confirmed'}. Target: ${r.edition === 'public' ? 'SAP S/4HANA Cloud Public Edition' : 'SAP S/4HANA Cloud Private Edition'}. Written by Clean-Core.io from the records of the project, without a model. Not signed.`,
    '',
    `> ${FIT_DESIGN_HEADER}`,
    '',
    ...(r.againstGate ? [`> **${r.againstGate.sentence}** The gate: ${r.againstGate.gateReason}`, ''] : []),
  ];
}

function designDoc(input: FitPackageInput): string {
  const lists = fitDesignLists(input.revision);
  return [
    ...head('Fit-to-standard design', input),
    `**${fitDesignSummary(input.revision.counts)}.**`,
    '',
    '## What you give up',
    '',
    'What the program does that the standard does not. Read from the code, with its lines.',
    '',
    ...table(lists.givenUp),
    '## What SAP standard may do instead',
    '',
    'Candidates to check in the workshop, or what you confirmed after it. The code cannot prove that the standard covers a step.',
    '',
    ...table(lists.standardDoes),
    '## What remains a gap',
    '',
    'Still needed. Each gap is a condition of the decision; an open one cannot be attested away.',
    '',
    ...table(lists.gaps),
  ].join('\n');
}

function gapRows(input: FitPackageInput): FitEntry[] {
  return input.revision.entries.filter((e) => e.comparability === 'business-comparable');
}

function gapListMd(input: FitPackageInput): string {
  const out = [...head('Gap list', input), '| Step | Lines | Disposition | Reference | Level | Note |', '|---|---|---|---|---|---|'];
  for (const e of gapRows(input)) {
    out.push(`| ${md(nameOf(e))} | ${lines(e.anchor)} | ${FIT_DISPOSITION_LABELS[e.disposition].label} | ${md(refText(e))} | ${e.evidenceLevel} | ${md(e.note ?? '')} |`);
  }
  out.push('');
  return out.join('\n');
}

function gapListCsv(input: FitPackageInput): string {
  const header = ['element_id', 'step', 'line_start', 'line_end', 'disposition', 'reference', 'check', 'evidence_level', 'provenance', 'note'];
  const rows = gapRows(input).map((e) => [
    e.elementId,
    nameOf(e),
    e.anchor ? String(e.anchor.lineStart) : '',
    e.anchor ? String(e.anchor.lineEnd) : '',
    e.disposition,
    e.standardRef?.id ?? '',
    e.standardRef?.check ?? '',
    e.evidenceLevel,
    e.provenance,
    e.note ?? '',
  ].map(csv).join(','));
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}

function keyUserDoc(input: FitPackageInput): string {
  const gaps = input.revision.entries.filter((e) => e.disposition === 'gap-key-user');
  const out = [...head('Key-user backlog', input)];
  if (gaps.length === 0) {
    out.push('No step of this design is resolved by a key-user extension.', '');
    return out.join('\n');
  }
  out.push('The steps that stay needed and that a key-user extension could keep:', '', ...table(gaps));
  if (input.keyUserSteps && input.keyUserSteps.steps.length > 0) {
    out.push('## The key-user step list', '', 'The engine\'s step list of roadmap 3.0.19, as it stands for this program — each step holds only once its limits are checked in the target system.', '');
    out.push(keyUserStepsMarkdown(input.keyUserSteps, input.projectName).replace(/^# /m, '### '));
  } else {
    out.push('The engine read no key-user step list for these steps; the key user works from the lines above.', '');
  }
  return out.join('\n');
}

function organisationalDoc(input: FitPackageInput): string {
  const gaps = input.revision.entries.filter((e) => e.disposition === 'gap-organisational');
  const out = [...head('Organisational changes', input)];
  if (gaps.length === 0) out.push('No step of this design is resolved by an organisational change.', '');
  else for (const e of gaps) out.push(`- **${md(nameOf(e))}** (${lines(e.anchor)}): ${e.note ?? 'what changes was not written down.'}`);
  out.push('');
  return out.join('\n');
}

function workshopDoc(input: FitPackageInput): string {
  const open = input.revision.entries.filter((e) => e.disposition === 'gap-open' || (e.disposition === 'covered' && e.provenance !== 'confirmed'));
  const out = [...head('Workshop questions', input)];
  if (open.length === 0) {
    out.push('No open step: every business step of this design has an answer.', '');
    return out.join('\n');
  }
  let n = 0;
  for (const e of open) {
    n += 1;
    out.push(
      e.disposition === 'gap-open'
        ? `${n}. **${md(nameOf(e))}** (${lines(e.anchor)}) — Does SAP standard do this step in your process, is it still needed, or does a key-user extension or a change in the process take it over?`
        : `${n}. **${md(nameOf(e))}** (${lines(e.anchor)}) — Does ${e.standardRef?.id ?? 'the named standard object'} really do this step in your process? (${CHECK[e.standardRef?.check ?? 'unverified']})`,
    );
  }
  out.push('');
  return out.join('\n');
}

function decommissioningDoc(input: FitPackageInput): string {
  const givenUp = input.revision.entries.filter((e) => e.disposition === 'given-up');
  return [
    ...head('Decommissioning', input),
    DECISION_OPTION_MEANINGS.standard,
    '',
    `Switched off with the program \`${input.sourceFileName}\` once the standard runs:`,
    '',
    ...(givenUp.length > 0 ? givenUp.map((e) => `- ${md(nameOf(e))} (${lines(e.anchor)}) — given up`) : ['- No business behaviour is marked as given up.']),
    `- ${input.revision.counts.goesWithProgram} technical step${input.revision.counts.goesWithProgram === 1 ? '' : 's'} that go with the program.`,
    '',
    'Before switching off: every open gap of `docs/gap-list.md` resolved or accepted, the key-user extensions of `docs/key-user-backlog.md` built and checked, and the organisational changes of `docs/organisational-changes.md` in place. Whether to switch off remains your decision.',
    '',
  ].join('\n');
}

/**
 * The to-be skeleton: a given-up step with exactly one flow in and one out is
 * removed and the flow bridged; every other given-up step stays drawn. The
 * names of what stays are set on the XML afterwards (`markToBe`).
 */
export function toBeSkeleton(skeleton: ProcessSkeleton, entries: readonly FitEntry[]): ProcessSkeleton {
  const givenUp = new Set(entries.filter((e) => e.disposition === 'given-up').map((e) => e.elementId));
  const protectedIds = new Set(skeleton.regions.flatMap((r) => [r.entryNodeId, r.endNodeId].filter((x): x is string => !!x)));
  let nodes: SkeletonNode[] = [...skeleton.nodes];
  let edges: SkeletonEdge[] = [...skeleton.edges];
  for (const id of givenUp) {
    const node = nodes.find((n) => n.id === id);
    if (!node || protectedIds.has(id) || node.expandsTo) continue;
    const ins = edges.filter((e) => e.to === id);
    const outs = edges.filter((e) => e.from === id);
    if (ins.length !== 1 || outs.length !== 1 || ins[0].from === id || outs[0].to === id) continue;
    nodes = nodes.filter((n) => n.id !== id);
    edges = [...edges.filter((e) => e !== ins[0] && e !== outs[0]), { ...ins[0], to: outs[0].to }];
  }
  return { ...skeleton, nodes, edges };
}

/** Names the kept given-up steps and the standard candidates in the XML, where a modeller shows them. */
function markToBe(xml: string, elementNode: Record<string, string>, entries: readonly FitEntry[]): string {
  const byNode = new Map(entries.map((e) => [e.elementId, e]));
  let out = xml;
  for (const [elementId, nodeId] of Object.entries(elementNode)) {
    const e = byNode.get(nodeId);
    if (!e) continue;
    const prefix = e.disposition === 'given-up'
      ? 'Given up — standard behaviour: '
      : e.disposition === 'covered' && e.standardRef
        ? `SAP standard candidate ${e.standardRef.id} (${e.standardRef.check === 'verified' ? 'checked' : 'to verify'}): `
        : null;
    if (!prefix) continue;
    const escaped = prefix.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    out = out.replace(new RegExp(`(id="${elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" name=")`), `$1${escaped}`);
  }
  return out;
}

export function buildFitPackage(input: FitPackageInput): FitPackageFile[] {
  const options = { processName: input.projectName, sourceFileName: input.sourceFileName, names: 'plain' as const, source: input.source };
  const asIs = buildBpmnExport(input.skeleton, options);
  const toBe = buildBpmnExport(toBeSkeleton(input.skeleton, input.revision.entries), {
    ...options,
    processName: `${input.projectName} — fit-to-standard design`,
  });
  return [
    { path: FIT_PACKAGE_PATHS.design, content: designDoc(input) },
    { path: FIT_PACKAGE_PATHS.gapList, content: gapListMd(input) },
    { path: FIT_PACKAGE_PATHS.gapCsv, content: gapListCsv(input) },
    { path: FIT_PACKAGE_PATHS.keyUser, content: keyUserDoc(input) },
    { path: FIT_PACKAGE_PATHS.organisational, content: organisationalDoc(input) },
    { path: FIT_PACKAGE_PATHS.workshop, content: workshopDoc(input) },
    { path: FIT_PACKAGE_PATHS.decommissioning, content: decommissioningDoc(input) },
    { path: FIT_PACKAGE_PATHS.asIs, content: asIs.xml },
    { path: FIT_PACKAGE_PATHS.toBe, content: markToBe(toBe.xml, toBe.elementNode, input.revision.entries) },
  ];
}

/** The conditions of the decision, for `docs/decision.md` (owner decision 7). */
export function fitConditionLines(revision: Pick<FitToStandardRevision, 'entries'>): string[] {
  return fitConditions(revision.entries).map((c) =>
    `- ${c.text} — ${c.basis === 'derived' ? 'derived from the design; it cannot be attested away' : 'stated by the account'}`);
}
