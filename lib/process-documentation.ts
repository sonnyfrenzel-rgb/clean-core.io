import type { ProvenanceValue } from '@/lib/provenance';
import { screenProgramDocument } from '@/lib/sensitive-text';
import { readCapabilityFacts, type CapabilityFacts } from '@/lib/documentation-capabilities';
import { authorClaimOf } from '@/lib/program-summary-check';
import { abapWords, programSummary, readProgramSummaryFacts, type ProgramSummaryFacts } from '@/lib/program-summary-text';
import { BUSINESS_PAGE, buildBusinessPage, businessPageLineText, type BusinessPageTarget } from '@/lib/documentation-business-page';
import { businessStatementView, statementKind, type StatementGroup } from '@/lib/abap/business-statement-kind';
import { readingPath, type PathItem } from '@/lib/process-documentation-path';

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

/**
 * How a commit's waiting reads. `andWait` is null when the code decides it at
 * run time (`WAIT = lv_wait`); that is not "does not wait" (QA slice review of
 * 81810c8026e0, b99ee9f51490).
 */
export function commitWaitWords(andWait: boolean | null): string {
  if (andWait === null) return `, waiting: ${NOT_DETERMINED_LABEL.toLowerCase()}`;
  return andWait ? ', waits for the update' : ', does not wait';
}

/** What this document is. Printed at the top of every rendering. */
export const PROCESS_DOCUMENTATION_DISCLAIMER =
  'Read by the engine out of the whole source the signed run analysed. No language model wrote its process structure '
  + 'or its statements. Every statement names the lines it was read from, or says that it is not determined and why. '
  + 'The one exception is marked where it appears: business names and lanes from the naming stage are model proposals.';

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
  /**
   * The engine's plain name — what the step does for the business ("Show the
   * result list"), the map's label without a naming stage. Absent in a
   * documentation read before 3.0.10.
   */
  plainName?: string | null;
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
  /**
   * What the program can do, read from the whole source (`lib/documentation-facts.ts`):
   * the tables it reads and changes, its commits, calls and authorization
   * checks. The business page says from it what the program does **not** do,
   * and the SOP check holds a model's sentence against it (owner 11.10.2026).
   * Absent in a documentation read before 3.0.10 — then *Not determined*.
   */
  facts?: CapabilityFacts;
  /**
   * What the program is for, as engine facts (`lib/program-summary-facts.ts`):
   * the business objects, the selection screen's own texts, fixed lists, the
   * outputs and whether it changes data. The business page opens with the
   * summary written from them — the same one the Business view, Analyze and
   * Management say (owner, 12.10.2026). Absent before 3.0.11: the page then
   * keeps its older lines.
   */
  summary?: ProgramSummaryFacts;
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
  // A document stored before 3.0.20 was not screened when it was built: the program's personal data and secrets are
  // masked here, so the screen and every export read the masked text (`lib/sensitive-text.ts`).
  return { kind: 'engine', doc: screenProgramDocument(parsed as unknown as ProcessDocumentation) };
}

/** True when the stored value is an engine document. Cheap enough for the phase contract: it does not screen. */
export function isEngineDocumentation(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.trim() === '') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  return isObject(parsed) && parsed.format === PROCESS_DOCUMENTATION_FORMAT && checkProcessDocumentationShape(parsed).ok;
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

/** A routine's token in words when no plain name was stored: `BUILD_WORKLIST` → "Build worklist". */
function humaniseToken(token: string): string {
  if (!/^[A-Z0-9_/]+$/.test(token) || !/_/.test(token)) return token;
  const words = token.replace(/^\/\w+\//, '').split('_').filter(Boolean).map((w) => w.toLowerCase());
  return words.length ? `${words[0].charAt(0).toUpperCase()}${words[0].slice(1)} ${words.slice(1).join(' ')}`.trim() : token;
}

/** The name a business reader sees for a step: the naming stage's, else the engine's plain name, else the token in words. */
export function docStepName(step: Pick<DocStep, 'businessName' | 'technicalName'> & { plainName?: string | null }): string {
  const plain = step.plainName?.trim();
  return step.businessName ?? (plain || humaniseToken(step.technicalName));
}

/** The anchors of the package Markdown — stable, so a link from one file into another keeps working. */
export const PROCESS_DOCUMENTATION_ANCHORS = {
  inShort: 'in-short',
  process: 'process',
  rules: 'rules',
  exceptions: 'exceptions',
  changes: 'changes',
  data: 'systems-and-data',
  evidence: 'evidence',
  appendix: 'appendix',
  elements: 'a1-elements',
  statements: 'a3-statements',
} as const;

const TARGET_ANCHOR: Record<BusinessPageTarget, string> = {
  data: PROCESS_DOCUMENTATION_ANCHORS.data,
  rules: PROCESS_DOCUMENTATION_ANCHORS.rules,
  exceptions: PROCESS_DOCUMENTATION_ANCHORS.exceptions,
  changes: PROCESS_DOCUMENTATION_ANCHORS.changes,
  questions: PROCESS_DOCUMENTATION_ANCHORS.evidence,
};

/** The section titles of the package Markdown, in reading order (owner 11.10.2026, external review §8). */
export const PROCESS_DOCUMENTATION_SECTIONS = [
  { anchor: PROCESS_DOCUMENTATION_ANCHORS.inShort, title: BUSINESS_PAGE.title },
  { anchor: PROCESS_DOCUMENTATION_ANCHORS.process, title: '1. How the process works' },
  { anchor: PROCESS_DOCUMENTATION_ANCHORS.rules, title: '2. Rules and exceptions' },
  { anchor: PROCESS_DOCUMENTATION_ANCHORS.changes, title: '3. What it changes — options and changes' },
  { anchor: PROCESS_DOCUMENTATION_ANCHORS.data, title: '4. Systems and data' },
  { anchor: PROCESS_DOCUMENTATION_ANCHORS.evidence, title: '5. Evidence and open decisions' },
  { anchor: PROCESS_DOCUMENTATION_ANCHORS.appendix, title: 'Appendix: technical reconstruction' },
] as const;

/** `L42`, `L95–114`, four at most — the short line label of the business part. */
function shortLines(anchors: readonly DocAnchor[]): string {
  const words = [...new Set(anchors.map((a) => (a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`)))];
  return words.length > 4 ? `${words.slice(0, 4).join(', ')} and ${words.length - 4} more` : words.join(', ');
}

/** One entry of the business list, with how many sentences it stands for. */
function groupLine(g: StatementGroup): string {
  const similar = g.count > 1 ? ` — stands for ${g.count} near-identical sentences` : '';
  return `${g.text} (Reconstructed, ${shortLines(g.anchors)}${similar})`;
}

const heading = (level: 2 | 3, anchor: string, title: string): string[] => [`<a id="${anchor}"></a>`, '', `${'#'.repeat(level)} ${title}`, ''];

/**
 * The Markdown the workspace file `docs/process-documentation.md`, the
 * delivery bundle (`process-documentation.md`) and the dashboard export carry.
 *
 * Owner 11.10.2026 (external review of the FI case,
 * F-07 and §8): readable first. It opens with the business page — what the
 * program does, what it does not do, the limits of the reading, owner and
 * approval, and the questions a reader asks, each a link into the document —
 * then the process, the rules and exceptions, what it changes, systems and
 * data, the evidence and open decisions, and the technical reconstruction last
 * as the appendix. The business list holds business statements only:
 * structure definitions, field assignments, label texts and bare calls stand
 * in the appendix, which keeps every sentence the engine read, and
 * near-identical sentences are one entry with their count
 * (`lib/abap/business-statement-kind.ts`). Every statement carries its lines
 * and its provenance; nothing the engine read is dropped.
 */
export function processDocumentationToMarkdown(doc: ProcessDocumentation): string {
  const A = PROCESS_DOCUMENTATION_ANCHORS;
  const facts = readCapabilityFacts(doc.facts);
  const view = businessStatementView(doc.statements);
  const byKind = (kind: StatementGroup['kind']) => view.groups.filter((g) => g.kind === kind);
  const rules = byKind('rule');
  const exceptions = byKind('exception');
  const dataStatements = byKind('data');
  const controls = byKind('control');
  // Owner 12.10.2026: a sentence built on ABAP words ("bound to the field
  // symbol", "the subroutines … are called") is not a business statement; the
  // appendix keeps it with every other sentence the engine read.
  const along = byKind('step').filter((g) => abapWords(g.text).length === 0);
  const isGate = (s: DocStep) => /decision/i.test(s.kind);
  const isEvent = (s: DocStep) => /^(?:start|end)\b/i.test(s.kind);
  const topSteps = doc.steps.filter((s) => s.level === null && !isEvent(s) && !isGate(s));
  const summaryFacts = readProgramSummaryFacts(doc.summary);
  const page = buildBusinessPage({
    program: doc.processName,
    facts,
    // Owner 12.10.2026: the file opens with the same summary as the stage, not with its own counts.
    ...(summaryFacts ? { inShort: programSummary(summaryFacts), authorClaim: authorClaimOf(summaryFacts) } : {}),
    counts: {
      steps: doc.steps.filter((s) => !isEvent(s) && !isGate(s)).length,
      decisions: doc.steps.filter(isGate).length,
      rules: rules.length,
      exceptions: exceptions.length,
    },
  });
  const statementById = new Map(doc.statements.map((s) => [s.id, s]));
  const out: string[] = [];

  out.push(`# Process documentation — ${doc.processName}`, '');
  out.push(`*\`${doc.fileName}\` · ${doc.lineCount} lines · SHA-256 \`${doc.sourceSha256.slice(0, 16)}…\` · Reconstructed from the code — to be confirmed by the business*`, '');
  out.push(`> ${doc.disclaimer}`, '');
  out.push(`**Contents:** ${PROCESS_DOCUMENTATION_SECTIONS.map((s) => `[${s.title}](#${s.anchor})`).join(' · ')}`, '');

  /* ------------------------------------------------------ the business page */
  out.push(...heading(2, A.inShort, BUSINESS_PAGE.title));
  out.push(`**${BUSINESS_PAGE.does}**`, '');
  for (const line of page.does) out.push(`- ${businessPageLineText(line)}`);
  out.push('', `**${BUSINESS_PAGE.doesNot}**`, '');
  for (const line of page.doesNot) out.push(`- ${businessPageLineText(line)}`);
  out.push('', `**${BUSINESS_PAGE.limits}**`, '');
  for (const line of page.limits) out.push(`- ${businessPageLineText(line)}`);
  out.push('', `**${BUSINESS_PAGE.owner}**`, '');
  out.push(`- ${businessPageLineText(page.owner)}`, `- ${businessPageLineText(page.approval)}`);
  out.push('', `**${BUSINESS_PAGE.questions}**`, '');
  for (const q of page.questions) out.push(`- [${q.question}](#${TARGET_ANCHOR[q.target]}) — ${q.answer}`);
  out.push('');

  /* ---------------------------------------------------------- 1. the process */
  out.push(...heading(2, A.process, PROCESS_DOCUMENTATION_SECTIONS[1].title));
  out.push(`${doc.overview} The main path, in the order a run takes it: alternative paths stand side by side, a step that runs only under a condition is marked optional; every step with its lines. Provenance: Reconstructed. Business names from the naming stage are a Model proposal.`, '');
  // A step says what it does only with a sentence of its own — a rule stands under the rules, and a sentence is said once.
  const said = new Set<string>();
  const stepLine = (step: DocStep, note = ''): string => {
    const sentence = step.statementId ? statementById.get(step.statementId) : undefined;
    const kind = sentence ? statementKind(sentence.text) : null;
    const own = !!sentence && (kind === 'step' || kind === 'data') && !said.has(sentence.id);
    if (own) said.add(sentence.id);
    const does = own ? ` — ${sentence.text}` : '';
    const proposal = step.businessName ? ' (name: Model proposal)' : '';
    return `**${docStepName(step)}**${proposal}${note}${lockedNote(step)}${does} (${step.anchor ? shortLines([step.anchor]) : NOT_DETERMINED_LABEL})`;
  };
  // Roadmap 3.0.13 (SD review CR-A1): a routine a constant gate always stops is
  // said to be locked wherever the main path lists it.
  const gate = summaryFacts?.locked?.gate ?? null;
  const lockedNote = (step: DocStep): string =>
    gate && gate.routine && gate.stopLine && step.technicalName.toUpperCase() === gate.routine
      ? ` — locked: the constant ${gate.constant} is ${/^space$/i.test(gate.value) ? 'blank (space)' : gate.value}, so the check at L${gate.line} always stops it with an error at L${gate.stopLine}; nothing after that runs`
      : '';
  // The order a run takes, not the order the map stores its elements in: that
  // order draws one branch of a decision to the end before the other, and the
  // CO case read as if the authorization check and the live read
  // ran after the result was shown (CO review F02, 12.10.2026).
  const when = (condition: string) => (condition ? `, only when \`${condition}\`` : '');
  const at = (split: DocStep) => (isGate(split) && split.anchor ? `, decided at ${shortLines([split.anchor])}` : '');
  const optionalChoice = (item: PathItem): Extract<PathItem, { kind: 'choice' }> | null => (item.kind === 'optional'
    && item.items.length === 1 && item.items[0].kind === 'choice' && item.items[0].split === item.split ? item.items[0] : null);
  const renderPath = (items: PathItem[], indent: string): void => {
    items.forEach((item, i) => {
      const marker = `${i + 1}. `;
      const inner = `${indent}${' '.repeat(marker.length)}`;
      const lone = 'items' in item && item.items.length === 1 && item.items[0].kind === 'step' ? item.items[0].step : null;
      if (item.kind === 'step') {
        out.push(`${indent}${marker}${stepLine(item.step)}`);
      } else if (item.kind === 'choice' || optionalChoice(item)) {
        // An optional that holds only a choice of the same decision is one
        // statement — "one of these, or none of them" — not an optional with
        // a choice nested in it (SD review, 12.10.2026).
        const choice = item.kind === 'choice' ? item : (optionalChoice(item) as Extract<PathItem, { kind: 'choice' }>);
        const noneOfThem = item.kind === 'optional';
        const head = choice.parallel
          ? `These ${choice.arms.length} paths run side by side${at(choice.split)}:`
          : `One of ${choice.arms.length} alternative paths${noneOfThem ? ', or none of them' : ''}${at(choice.split)}:`;
        out.push(`${indent}${marker}${head}`);
        for (const arm of choice.arms) {
          const label = choice.parallel ? (arm.when ? `When \`${arm.when}\`` : 'Always') : arm.when ? `When \`${arm.when}\`` : 'Otherwise';
          out.push(`${inner}- **${label}:**${arm.items.length ? '' : ' no step on this path.'}`);
          renderPath(arm.items, `${inner}  `);
        }
      } else if (lone && item.kind === 'optional') {
        out.push(`${indent}${marker}${stepLine(lone, ` — optional${when(item.when)}`)}`);
      } else if (lone && item.kind === 'exit') {
        out.push(`${indent}${marker}${stepLine(lone, ` — ${item.when ? `only when \`${item.when}\`` : 'otherwise'}, and then the run ends`)}`);
      } else {
        const head = item.kind === 'optional'
          ? `Optional${when(item.when)}${at(item.split)}:`
          : item.kind === 'exit'
            ? `${item.when ? `Only when \`${item.when}\`` : 'Otherwise'}${at(item.split)}, and then the run ends:`
            : item.when
              ? `Repeated while \`${item.when}\`${at(item.split)}:`
              : `Repeated for each pass of \`${item.split.technicalName}\`${item.split.anchor ? ` (${shortLines([item.split.anchor])})` : ''}:`;
        out.push(`${indent}${marker}${head}`);
        renderPath(item.items, inner);
      }
    });
  };
  const path = readingPath(doc.steps);
  renderPath(path, '');
  if (topSteps.length === 0) out.push('No step stands on the top level of the process.');
  out.push('');
  if (along.length) {
    out.push('**What it does along the way**', '');
    for (const g of along) out.push(`- ${groupLine(g)}`);
    out.push('');
  }
  out.push(`Every element of the map, with its id, kind and successors: [Appendix A.1](#${A.elements}).`, '');

  /* -------------------------------------------------- 2. rules and exceptions */
  out.push(...heading(2, A.rules, PROCESS_DOCUMENTATION_SECTIONS[2].title));
  const t = view.technical;
  out.push(
    `${view.groups.length} business statements from the ${view.total} sentences the engine read; ${view.folded} near-identical ones are folded into them. `
    + `Not business statements, kept complete in [Appendix A.3](#${A.statements}): ${t.structure} structure definitions, ${t.assignment} field assignments, ${t.label} label texts and ${t.call} bare calls.`,
    '',
  );
  // One story with "In short" (SD review, 12.10.2026): "In short" counts the
  // rule register (`deriveBusinessRules` — 17 for the SD case), this list
  // groups the sentences in which the code states its conditions (11 there).
  // Both are right and they count different things; the heading says which
  // this list is, and the line under it names the register's count and where
  // its rows stand, so a reader does not meet two rule counts unexplained.
  out.push('### Rules as the code states them', '');
  if (typeof summaryFacts?.rules === 'number' && (summaryFacts.rules > 0 || rules.length > 0)) {
    const n = summaryFacts.rules;
    out.push(n > 0
      ? `The rule register holds ${n === 1 ? '1 business rule' : `${n} business rules`} — the number "In short" gives — one row each, with its state and test (in the delivery package: \`docs/rule-register.md\`). `
        + `The ${rules.length === 1 ? 'entry' : `${rules.length} entries`} below ${rules.length === 1 ? 'is' : 'are'} the sentences in which the code states its conditions: one sentence can carry several rules, and near-identical sentences are folded into one.`
      : 'The rule register holds no business rule; the entries below are conditions the code states, not rules a decision works on.', '');
  }
  if (rules.length) for (const g of rules) out.push(`- ${groupLine(g)}`);
  else out.push('No condition in the code decides a value or a path.');
  out.push('', ...heading(3, A.exceptions, 'Exceptions'));
  if (exceptions.length) for (const g of exceptions) out.push(`- ${groupLine(g)}`);
  else out.push('No message stops or warns the user.');
  out.push('');

  /* ------------------------------------------------------------ 3. changes */
  out.push(...heading(2, A.changes, PROCESS_DOCUMENTATION_SECTIONS[3].title));
  if (facts) {
    out.push(facts.writes.length
      ? `- Tables it changes: ${facts.writes.map((w) => `${w.name} (L${w.line})`).join(', ')}. (Reconstructed)`
      : '- It changes no table in SAP. (Reconstructed, read across the whole source)');
  } else {
    out.push(`- Tables it changes: ${NOT_DETERMINED_LABEL} — this documentation was read before that reading was recorded with it.`);
  }
  if (doc.effects.registrations.length === 0 && doc.effects.events.length === 0) {
    out.push('- It registers no update module and issues no COMMIT WORK or ROLLBACK WORK.');
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
      const wait = event.kind === 'commit' ? commitWaitWords(event.andWait) : '';
      out.push(`- \`${event.token}\`${wait} — ${rangeWords(event.anchor)}`);
    }
  }
  out.push(`- What changes with SAP S/4HANA — the target, the option and the program decision — is decided in Design and in the Management view; this file records what the program does today. The open points stand in [Evidence and open decisions](#${A.evidence}).`, '');

  /* -------------------------------------------------------- 4. systems and data */
  out.push(...heading(2, A.data, PROCESS_DOCUMENTATION_SECTIONS[4].title));
  out.push('### Data it reads', '');
  if (facts) out.push(facts.reads.length ? `Tables: ${facts.reads.map((r) => `${r.name} (L${r.line})`).join(', ')}.` : 'It reads no table by name.', '');
  if (dataStatements.length) {
    out.push('Which rows each read takes:', '');
    for (const g of dataStatements) out.push(`- ${groupLine(g)}`);
    out.push('');
  }
  if (facts?.calls.length) {
    out.push('### Calls', '');
    out.push(`${facts.calls.map((c) => `${c.name} (${c.kind}${c.destination ? `, destination ${c.destination}` : ''}, L${c.line})`).join(', ')}.`, '');
  }
  out.push('### Controls', '');
  if (controls.length) for (const g of controls) out.push(`- ${groupLine(g)}`);
  else out.push('No authorization check in the code.');
  out.push('', '### Who acts', '');
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

  /* ------------------------------------------------ 5. evidence and open decisions */
  out.push(...heading(2, A.evidence, PROCESS_DOCUMENTATION_SECTIONS[5].title));
  out.push(`- **Source:** \`${doc.fileName}\`, ${doc.lineCount} lines, SHA-256 \`${doc.sourceSha256}\``);
  out.push(`- **Process:** ${doc.overview}`);
  out.push(`- **Traceability:** ${doc.traceability.sentence} A line anchor proves where a shape comes from, not that it is right for the business.`);
  if (doc.naming.notice) out.push(`- **Business names:** ${doc.naming.notice}`);
  out.push('', '**Not determined**', '');
  for (const gap of doc.notDetermined) {
    out.push(`- **${gap.subject}:** ${NOT_DETERMINED_LABEL} — ${gap.reason}`);
  }
  out.push('', '---', '');

  /* ------------------------------------------------------------- the appendix */
  out.push(...heading(2, A.appendix, PROCESS_DOCUMENTATION_SECTIONS[6].title));
  out.push('*The complete reading, as the engine wrote it: every element of the map and every sentence, with its lines. The sections above are built from it.*', '');
  out.push(...heading(3, A.elements, 'A.1 The process, element by element'));
  out.push('Provenance: Reconstructed, unless a column says otherwise. Business names and lanes are a Model proposal.', '');
  out.push('| Element | Kind | Name | Lane | Evidence | Next |');
  out.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
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
    out.push('### A.2 What the elements do', '');
    for (const step of withSentence) {
      const sentence = statementById.get(step.statementId as string)!;
      out.push(`- **${step.businessName ?? step.technicalName}** (${step.id}): ${sentence.text} — ${anchorsWords(sentence.anchors)}`);
    }
    out.push('');
  }

  out.push(...heading(3, A.statements, 'A.3 Every statement as read'));
  if (doc.statements.length === 0) {
    out.push('The engine formed no statement from this source.', '');
  } else {
    out.push(`${doc.statements.length} statements, in the order of the program. Provenance: Reconstructed.`, '');
    for (const statement of doc.statements) {
      out.push(`- ${statement.text} — ${anchorsWords(statement.anchors)}`);
    }
    out.push('');
  }
  return out.join('\n');
}

