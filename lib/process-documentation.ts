import type { ProvenanceValue } from '@/lib/provenance';

/**
 * The process documentation of stage 4 — roadmap 3.0.5, Weg C (Sonny, 24.09.2026).
 *
 * `project.documentation` used to be a language model's JSON: a prompt built
 * from the first 1,000 characters of the generated code, the design and the
 * analysis, answered with an L1 domain, an owner, a strategic goal, KPIs, roles
 * on every step and an estimated duration per task. None of that was read from
 * the program, and a rule written after character 1,000 could not reach it
 * (known limit L-04, QA24-A10).
 *
 * What is stored now is what the engine reads out of the **whole** source the
 * signed run analysed — the process skeleton as BPMN elements, the business
 * sentences of 17.7, the update-task states of 2.12, the lanes the code proves,
 * and the names and lanes of the naming stage where one was saved. Every
 * statement carries its line range, or says *Not determined* and why. What the
 * engine cannot give — an owner, roles, KPIs, a duration, a strategic goal — is
 * not filled in: it stands in `notDetermined`, with the reason.
 *
 * This file is the **format**: types, the reader for a stored value, the shape
 * check and the Markdown rendering. It imports no engine module on purpose —
 * `lib/workflow-steps.ts`, the dashboard and the delivery page read it, and none
 * of them should pull the ABAP reader into its bundle. The builder is
 * `lib/process-documentation-build.ts`.
 *
 * Provenance words come from `lib/provenance.ts` and from nowhere else.
 */

/** The tag a stored engine document carries. A legacy blueprint has none. */
export const PROCESS_DOCUMENTATION_FORMAT = 'engine-process-documentation';

/** Bumped when the stored shape changes. */
export const PROCESS_DOCUMENTATION_FORMAT_VERSION = 1;

/** The label of `not-determined` in `lib/provenance.ts`, used for every gap. */
export const NOT_DETERMINED_LABEL = 'Not determined';

/** What this document is. Printed at the top of every rendering. */
export const PROCESS_DOCUMENTATION_DISCLAIMER =
  'Read by the engine out of the whole source the signed run analysed. No language model wrote any of it. '
  + 'Every statement names the lines it was read from, or says that it is not determined and why. '
  + 'Business names and lanes from the naming stage are model proposals and are marked as such.';

/**
 * What a document written before 3.0.5 is, in one sentence. It is shown, never
 * migrated and never deleted: the reader decides whether to replace it.
 */
export const LEGACY_BLUEPRINT_NOTICE =
  'Earlier form: this blueprint was written by a language model from the first 1,000 characters of the generated code, '
  + 'the design and the analysis. Its domain, owner, roles, KPIs and durations were not read from the source. '
  + 'Generating the documentation again replaces it with one read from the code.';

export interface DocAnchor {
  lineStart: number;
  lineEnd: number;
}

export interface DocUndetermined {
  label: typeof NOT_DETERMINED_LABEL;
  reason: string;
}

/** One sentence of 17.7, as the engine wrote it. */
export interface DocStatement {
  id: string;
  text: string;
  /** Never empty — `lib/abap/business-statement.ts` guarantees it. */
  anchors: DocAnchor[];
  grain: 'statement' | 'group';
  provenance: Extract<ProvenanceValue, 'reconstructed'>;
}

export interface DocFlow {
  to: string;
  /** The condition as the code writes it. Empty for an unconditional flow. */
  condition: string;
}

/** One BPMN element of the reconstructed process. */
export interface DocStep {
  /** The BPMN element id — the same id the `.bpmn` export and the map use. */
  id: string;
  /** "Decision", "Service step" — `kindWord` of the map. */
  kind: string;
  /** The token the skeleton read out of the source. Always there. */
  technicalName: string;
  /** The naming stage's name, beside the technical one. Null when none was saved. */
  businessName: string | null;
  /** The naming stage's lane for this element. Null when none was saved. */
  lane: string | null;
  /** `proposed` exactly when a business name or a lane stands on this step. */
  namingProvenance: Extract<ProvenanceValue, 'proposed'> | null;
  /** Straight from the file's trace — `reconstructed` unless the file proves more. */
  provenance: ProvenanceValue;
  anchor: DocAnchor | null;
  /** Set exactly when `anchor` is null. */
  undetermined: DocUndetermined | null;
  /** The sub-process this element is drawn in; null for the top level. */
  level: string | null;
  next: DocFlow[];
  /** The id of the 17.7 sentence standing at this element, or null. */
  statementId: string | null;
}

/** A lane the code proves — 2.16. A token, never a job title. */
export interface DocLane {
  name: string;
  kind: 'program' | 'authority' | 'human' | 'system';
  /** What the lane was read from: `AUTHORITY-CHECK`, `CALL SCREEN`, … */
  basis: string[];
  anchor: DocAnchor;
  provenance: Extract<ProvenanceValue, 'reconstructed'>;
}

/** A lane the naming stage proposed — only when a naming is saved. */
export interface DocProposedLane {
  name: string;
  /** The authorization object behind it, or null for a lane from naming alone. */
  authorityObject: string | null;
  anchor: DocAnchor | null;
  undetermined: DocUndetermined | null;
  provenance: Extract<ProvenanceValue, 'proposed'>;
  statement: string;
}

/** `CALL FUNCTION … IN UPDATE TASK`, and what happens to it — 2.12. */
export interface DocUpdateRegistration {
  module: string | null;
  anchor: DocAnchor;
  outcomes: Array<{ state: 'dispatched' | 'discarded'; anchor: DocAnchor; conditional: boolean }>;
  unresolved: { state: 'orphaned' | 'not-determined'; reason: string } | null;
  updateMode: { value: 'local' | 'not-determined'; reason: string };
  updateKind: { value: 'not-determined'; reason: string };
}

export interface DocLuwEvent {
  kind: 'commit' | 'rollback';
  token: string;
  anchor: DocAnchor;
  andWait: boolean | null;
  subrcCarriesUpdateResult: boolean;
}

/** Something the old blueprint asserted and the engine cannot. */
export interface DocGap {
  subject: string;
  label: typeof NOT_DETERMINED_LABEL;
  reason: string;
}

export interface ProcessDocumentation {
  format: typeof PROCESS_DOCUMENTATION_FORMAT;
  formatVersion: number;
  processName: string;
  fileName: string;
  /** SHA-256 of the source this was read from — the one the signed run names. */
  sourceSha256: string;
  lineCount: number;
  /** *"Process with 14 steps and 5 decisions."* — the map's own sentence. */
  overview: string;
  traceability: {
    flowNodes: number;
    anchored: number;
    unanchored: number;
    percent: number | null;
    sentence: string;
  };
  naming: { state: 'named' | 'not-named' | 'stale'; notice: string | null; named: number };
  steps: DocStep[];
  statements: DocStatement[];
  effects: { registrations: DocUpdateRegistration[]; events: DocLuwEvent[] };
  lanes: DocLane[];
  proposedLanes: DocProposedLane[];
  notDetermined: DocGap[];
  disclaimer: string;
}

/* ------------------------------------------------------------ the reader */

export type StoredDocumentation =
  | { kind: 'none' }
  | { kind: 'engine'; doc: ProcessDocumentation }
  /** Tagged as an engine document, but not in a shape this build can show. */
  | { kind: 'engine-invalid'; problems: string[] }
  /** Anything else — a blueprint written before 3.0.5, or text nobody can read. */
  | { kind: 'other'; raw: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAnchor = (value: unknown): boolean =>
  isObject(value) && Number.isInteger(value.lineStart) && Number.isInteger(value.lineEnd);

/**
 * Does this parsed value have the shape the stage renders?
 *
 * Types only, as `blueprint-schema.ts` did for the old form: every list the
 * page maps is a list, every leaf it prints is text, every anchor is two
 * integers. It judges nothing about the content.
 */
export function checkProcessDocumentationShape(parsed: unknown): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!isObject(parsed)) return { ok: false, problems: ['The documentation is not a JSON object.'] };
  if (parsed.format !== PROCESS_DOCUMENTATION_FORMAT) problems.push('The documentation carries no engine format tag.');
  for (const field of ['processName', 'fileName', 'sourceSha256', 'overview', 'disclaimer'] as const) {
    if (typeof parsed[field] !== 'string') problems.push(`\`${field}\` is not text.`);
  }
  if (!isObject(parsed.traceability) || typeof parsed.traceability.sentence !== 'string') {
    problems.push('`traceability` is not an object with a sentence.');
  }
  for (const field of ['steps', 'statements', 'lanes', 'proposedLanes', 'notDetermined'] as const) {
    if (!Array.isArray(parsed[field])) problems.push(`\`${field}\` is not a list.`);
  }
  if (!isObject(parsed.effects) || !Array.isArray(parsed.effects.registrations) || !Array.isArray(parsed.effects.events)) {
    problems.push('`effects` does not hold two lists.');
  }
  if (problems.length > 0) return { ok: false, problems };

  (parsed.steps as unknown[]).forEach((step, i) => {
    if (!isObject(step) || typeof step.id !== 'string' || typeof step.kind !== 'string' || typeof step.technicalName !== 'string') {
      problems.push(`Step ${i + 1} has no id, kind or technical name.`);
      return;
    }
    if (step.anchor !== null && !isAnchor(step.anchor)) problems.push(`Step ${i + 1} has an anchor that is not a line range.`);
    if (step.anchor === null && !isObject(step.undetermined)) problems.push(`Step ${i + 1} has neither lines nor a reason.`);
    if (!Array.isArray(step.next)) problems.push(`The successors of step ${i + 1} are not a list.`);
  });
  (parsed.statements as unknown[]).forEach((statement, i) => {
    if (!isObject(statement) || typeof statement.text !== 'string' || !Array.isArray(statement.anchors)
      || statement.anchors.length === 0 || !statement.anchors.every(isAnchor)) {
      problems.push(`Business statement ${i + 1} has no text or no line range.`);
    }
  });
  (parsed.notDetermined as unknown[]).forEach((gap, i) => {
    if (!isObject(gap) || typeof gap.subject !== 'string' || typeof gap.reason !== 'string') {
      problems.push(`Gap ${i + 1} has no subject or no reason.`);
    }
  });
  return { ok: problems.length === 0, problems };
}

/** What is stored in `project.documentation`, sorted into the three cases a reader handles. */
export function readStoredDocumentation(raw: unknown): StoredDocumentation {
  if (typeof raw !== 'string' || raw.trim() === '') return { kind: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'other', raw };
  }
  if (!isObject(parsed) || parsed.format !== PROCESS_DOCUMENTATION_FORMAT) return { kind: 'other', raw };
  const shape = checkProcessDocumentationShape(parsed);
  if (!shape.ok) return { kind: 'engine-invalid', problems: shape.problems };
  return { kind: 'engine', doc: parsed as unknown as ProcessDocumentation };
}

/** True when the stored value is an engine document. Cheap enough for the phase contract. */
export function isEngineDocumentation(raw: unknown): boolean {
  return readStoredDocumentation(raw).kind === 'engine';
}

/* ---------------------------------------------------------- the words */

/** `line 8` / `lines 224 to 232` — the wording of the brief and the target model. */
export function rangeWords(anchor: DocAnchor): string {
  return anchor.lineEnd === anchor.lineStart
    ? `line ${anchor.lineStart}`
    : `lines ${anchor.lineStart} to ${anchor.lineEnd}`;
}

export function anchorsWords(anchors: DocAnchor[]): string {
  if (anchors.length === 0) return NOT_DETERMINED_LABEL;
  const shown = anchors.slice(0, 4).map(rangeWords).join(', ');
  return anchors.length > 4 ? `${shown} and ${anchors.length - 4} more` : shown;
}

/** A step's evidence: its lines, or `Not determined — <reason>`. Never empty. */
export function stepEvidence(step: Pick<DocStep, 'anchor' | 'undetermined'>): string {
  if (step.anchor) return rangeWords(step.anchor);
  return `${NOT_DETERMINED_LABEL} — ${step.undetermined?.reason ?? 'the reconstruction drew this element without a line range of its own.'}`;
}

/** Table cells in Markdown: one line, no pipe that would open a column. */
const cell = (text: string): string => text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();

/**
 * The Markdown the workspace file `docs/process-blueprint.md`, the delivery
 * bundle and the dashboard export carry. Same content as the stage shows, same
 * order, nothing added.
 */
export function processDocumentationToMarkdown(doc: ProcessDocumentation): string {
  const out: string[] = [];
  out.push(`# Process documentation — ${doc.processName}`, '');
  out.push(`> ${doc.disclaimer}`, '');
  out.push(`- **Source:** \`${doc.fileName}\`, ${doc.lineCount} lines, SHA-256 \`${doc.sourceSha256}\``);
  out.push(`- **Process:** ${doc.overview}`);
  out.push(`- **Traceability:** ${doc.traceability.sentence}`);
  if (doc.naming.notice) out.push(`- **Business names:** ${doc.naming.notice}`);
  out.push('');

  out.push('## The process, element by element', '');
  out.push('Provenance: Reconstructed, unless a column says otherwise. Business names and lanes are a Model proposal.', '');
  out.push('| Element | Kind | Name | Lane | Evidence | Next |');
  out.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
  const statementById = new Map(doc.statements.map((s) => [s.id, s]));
  for (const step of doc.steps) {
    const name = step.businessName
      ? `${step.businessName} (${step.technicalName}) — Model proposal`
      : step.technicalName;
    const lane = step.lane ? `${step.lane} — Model proposal` : '';
    const next = step.next
      .map((flow) => (flow.condition ? `${flow.to} [${flow.condition}]` : flow.to))
      .join(', ');
    out.push(`| ${cell(step.id)} | ${cell(step.kind)} | ${cell(name)} | ${cell(lane)} | ${cell(stepEvidence(step))} | ${cell(next)} |`);
  }
  out.push('');

  const withSentence = doc.steps.filter((step) => step.statementId && statementById.has(step.statementId));
  if (withSentence.length > 0) {
    out.push('### What the elements do', '');
    for (const step of withSentence) {
      const sentence = statementById.get(step.statementId as string)!;
      out.push(`- **${step.businessName ?? step.technicalName}** (${step.id}): ${sentence.text} — ${anchorsWords(sentence.anchors)}`);
    }
    out.push('');
  }

  out.push('## Business statements, across the whole program', '');
  if (doc.statements.length === 0) {
    out.push('The engine formed no business statement from this source.', '');
  } else {
    out.push(`${doc.statements.length} statements, in the order of the program. Provenance: Reconstructed.`, '');
    for (const statement of doc.statements) {
      out.push(`- ${statement.text} — ${anchorsWords(statement.anchors)}`);
    }
    out.push('');
  }

  out.push('## Update task and commit', '');
  if (doc.effects.registrations.length === 0 && doc.effects.events.length === 0) {
    out.push('The source registers no update module and issues no COMMIT WORK or ROLLBACK WORK.', '');
  } else {
    for (const registration of doc.effects.registrations) {
      const moduleName = registration.module ?? 'a module named at runtime';
      out.push(`- **${moduleName}** is registered for the update task — ${rangeWords(registration.anchor)}.`);
      for (const outcome of registration.outcomes) {
        const verb = outcome.state === 'dispatched' ? 'dispatched' : 'discarded';
        out.push(`  - ${verb} at ${rangeWords(outcome.anchor)}${outcome.conditional ? ' (on some paths)' : ''}`);
      }
      if (registration.unresolved) {
        const word = registration.unresolved.state === 'orphaned' ? 'Orphaned' : NOT_DETERMINED_LABEL;
        out.push(`  - ${word} — ${registration.unresolved.reason}`);
      }
      out.push(`  - Update mode: ${registration.updateMode.value === 'local' ? 'local' : NOT_DETERMINED_LABEL} — ${registration.updateMode.reason}`);
      out.push(`  - V1/V2: ${NOT_DETERMINED_LABEL} — ${registration.updateKind.reason}`);
    }
    for (const event of doc.effects.events) {
      const wait = event.kind === 'commit' ? (event.andWait ? ', waits for the update' : ', does not wait') : '';
      out.push(`- \`${event.token}\`${wait} — ${rangeWords(event.anchor)}`);
    }
    out.push('');
  }

  out.push('## Lanes', '');
  out.push('Read from the code (Reconstructed). A lane is the token the source writes, never a job title.', '');
  for (const lane of doc.lanes) {
    out.push(`- ${lane.name || '(program)'} — ${lane.kind}${lane.basis.length ? `, from ${lane.basis.join(', ')}` : ''} — ${rangeWords(lane.anchor)}`);
  }
  if (doc.proposedLanes.length > 0) {
    out.push('', 'Proposed by the naming stage (Model proposal):', '');
    for (const lane of doc.proposedLanes) {
      const evidence = lane.anchor ? rangeWords(lane.anchor) : `${NOT_DETERMINED_LABEL} — ${lane.undetermined?.reason ?? ''}`;
      out.push(`- ${lane.name}${lane.authorityObject ? ` (${lane.authorityObject})` : ''} — ${evidence}`);
    }
  }
  out.push('');

  out.push('## Not determined', '');
  for (const gap of doc.notDetermined) {
    out.push(`- **${gap.subject}:** ${NOT_DETERMINED_LABEL} — ${gap.reason}`);
  }
  out.push('');
  return out.join('\n');
}
