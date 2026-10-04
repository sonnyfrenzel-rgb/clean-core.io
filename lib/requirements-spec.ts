import {
  PRIORITY_LABEL,
  anchorList,
  type FunctionalRequirement,
  type RequirementPriority,
  type RequirementSet,
} from '@/lib/functional-requirements';
import {
  NFR_MODEL_KEY,
  type NFRData,
  type NfrCategory,
  type NfrQuestion,
  type NfrSet,
  type NfrSignal,
  type NonFunctionalRequirement,
} from '@/lib/non-functional-requirements';
import { normalizeRich, RICH_TEXT_LIMIT } from '@/lib/rich-text';
import { isRequirementStatus, type RequirementStatus } from '@/lib/requirement-status';

/**
 * The requirements specification of a project — the document the Design
 * tool's requirements workspace writes (owner 04.10.2026, ADR-078).
 *
 * One document for an implementer who never saw the ABAP: title page,
 * purpose and scope, context, the functional and the non-functional
 * requirements, interfaces and data, constraints, the open decisions, the
 * traceability matrix and a glossary. The engine drafts it from what it read
 * in the signed source (ADR-070, ADR-074); the owner edits, decides and
 * accepts. What the engine read stays traceable: every requirement keeps its
 * lines, its business rule and its process step in `source`, written in
 * technical terms there and only there — the statement a reader acts on is
 * written without the program's variable names (`plainText`).
 *
 * The open questions of the engine — the targets the code cannot ground, the
 * functional questions for the business and the business rules a reader
 * marked *Clarify* or *Change* — become **decisions** with suggested answers,
 * a free value and "decide later". A suggested answer is a starting point the
 * product offers, never a reading of the code, and says so; a model's proposal
 * stays marked as one and is never taken over by itself.
 *
 * Pure: no model, no network, no clock — every date comes in from the caller.
 * Stored by `/api/projects/{id}/requirements-spec` (Admin SDK only), which
 * validates every field here (`validateSpecPayload`). Not evidence: nothing
 * of it reaches a run, a signature or an audit pack.
 */

export const SPEC_FORMAT_VERSION = 1 as const;
export const SPEC_COLLECTION = 'requirements_spec';
export const SPEC_DOC = 'current';

/* ------------------------------------------------------------------ lists */

export type SpecKind = 'functional' | 'non-functional';
export type SpecOrigin = 'engine' | 'person';

/** The non-functional categories of the specification, in the order an implementer reads them. */
export type SpecNfrCategory =
  | 'performance'
  | 'availability'
  | 'security'
  | 'audit'
  | 'retention'
  | 'operability'
  | 'usability'
  | 'integration'
  | 'transition';

export const SPEC_NFR_CATEGORIES: readonly SpecNfrCategory[] = Object.freeze([
  'performance',
  'availability',
  'security',
  'audit',
  'retention',
  'operability',
  'usability',
  'integration',
  'transition',
] as SpecNfrCategory[]);

export const SPEC_NFR_CATEGORY_LABEL: Readonly<Record<SpecNfrCategory, string>> = Object.freeze({
  performance: 'Performance',
  availability: 'Availability',
  security: 'Security & authorizations',
  audit: 'Auditability & compliance',
  retention: 'Data retention',
  operability: 'Operability & monitoring',
  usability: 'Usability',
  integration: 'Integration',
  transition: 'Migration & cutover',
});

/** Who answers a decision — a label, not a role system (owner 04.10.2026). */
export type DecisionOwner = 'business' | 'it' | 'decision-maker';
export const DECISION_OWNERS: readonly DecisionOwner[] = Object.freeze(['business', 'it', 'decision-maker'] as DecisionOwner[]);
export const DECISION_OWNER_LABEL: Readonly<Record<DecisionOwner, string>> = Object.freeze({
  business: 'Business',
  it: 'IT',
  'decision-maker': 'Decision maker',
});

export type DecisionOrigin = 'nfr-question' | 'fr-question' | 'rule-clarify' | 'rule-change' | 'person';
export const DECISION_ORIGINS: readonly DecisionOrigin[] = Object.freeze([
  'nfr-question',
  'fr-question',
  'rule-clarify',
  'rule-change',
  'person',
] as DecisionOrigin[]);
export const DECISION_ORIGIN_LABEL: Readonly<Record<DecisionOrigin, string>> = Object.freeze({
  'nfr-question': 'A target the code cannot set',
  'fr-question': 'A question the code cannot answer',
  'rule-clarify': 'Business rule marked Clarify',
  'rule-change': 'Business rule marked Change',
  person: 'Added in the workspace',
});

export type DecisionAnswerKind = 'option' | 'value' | 'later';

/** The document's own status on the title page — the owner's word, a self-declaration. */
export type SpecDocStatus = 'draft' | 'review' | 'agreed';
export const SPEC_DOC_STATUSES: readonly SpecDocStatus[] = Object.freeze(['draft', 'review', 'agreed'] as SpecDocStatus[]);
export const SPEC_DOC_STATUS_LABEL: Readonly<Record<SpecDocStatus, string>> = Object.freeze({
  draft: 'Draft',
  review: 'In review',
  agreed: 'Agreed by the author',
});

/* ------------------------------------------------------------------ shape */

export interface SpecLineRange {
  s: number;
  e: number;
}

export interface SpecSource {
  /** Line ranges in the signed source. Empty for a requirement a person wrote. */
  lines: SpecLineRange[];
  /** Business rules, `BR-004`. */
  rules: string[];
  /** Process steps by label, `3. Read requisition`. */
  steps: string[];
  /** The engine's id this was drafted from, `FR-003` / `NFR-05` / `TBD-04`; null for a person's. */
  engineRef: string | null;
  /** What the engine read, in technical terms — only ever shown in the source column. */
  evidence: string;
}

export interface SpecCriterion {
  given: string;
  when: string;
  then: string;
}

export interface SpecRequirement {
  /** `FR-001`, `NFR-05`; `FR-P01` for one a person added. */
  id: string;
  kind: SpecKind;
  /** Non-functional only. */
  category: SpecNfrCategory | null;
  title: string;
  /** "The system shall …" — the restricted text format (`lib/rich-text.ts`). */
  statement: string;
  rationale: string;
  acceptance: SpecCriterion[];
  priority: RequirementPriority;
  status: RequirementStatus;
  origin: SpecOrigin;
  /** Non-functional: the measurable target and how it is measured. */
  target: string;
  method: string;
  /** A note the owner keeps with it — why rejected, what to clarify. */
  note: string;
  source: SpecSource;
  /** Decisions this requirement waits on or was shaped by. */
  decisionIds: string[];
}

export interface SpecDecisionAnswer {
  kind: DecisionAnswerKind;
  /** The chosen option or the free value; empty for "decide later". */
  value: string;
  /** Who answered and when — written by the server, never by the browser. */
  by: string | null;
  at: string | null;
}

export interface SpecDecision {
  /** `D-TBD-04`, `D-TBC-02`, `D-BR-004`, `D-P01`. */
  id: string;
  origin: DecisionOrigin;
  owner: DecisionOwner;
  question: string;
  /** Why it is asked — what in the code prompts it. */
  context: string;
  /** Suggested answers; never read from the code. */
  options: string[];
  lines: SpecLineRange[];
  /** Requirements the answer shapes. */
  affects: string[];
  /** A model's proposal for the answer, kept apart and never taken over by itself. */
  proposal: string;
  answer: SpecDecisionAnswer | null;
}

export interface SpecInterface {
  name: string;
  kind: 'table' | 'function-module' | 'transaction' | 'report';
  /** read · write · call · reference, joined. */
  use: string;
  /** SAP's clean core level, a customer object, or not graded. */
  level: 'A' | 'B' | 'C' | 'D' | 'custom' | 'not-graded';
  lines: SpecLineRange[];
}

export interface SpecStakeholder {
  role: string;
  interest: string;
}

export interface SpecGlossaryEntry {
  term: string;
  meaning: string;
}

export interface RequirementsSpec {
  title: string;
  version: string;
  docStatus: SpecDocStatus;
  program: string;
  purpose: string;
  scope: string;
  context: string;
  stakeholders: SpecStakeholder[];
  requirements: SpecRequirement[];
  interfaces: SpecInterface[];
  interfacesNote: string;
  constraints: string;
  assumptions: string;
  decisions: SpecDecision[];
  glossary: SpecGlossaryEntry[];
}

export interface SpecHistoryEntry {
  revision: number;
  at: string;
  by: string;
  change: string;
}

/** What the route stores and hands out. */
export interface SpecRecord {
  formatVersion: typeof SPEC_FORMAT_VERSION;
  spec: RequirementsSpec;
  /** SHA-256 of the signed source the engine content was read from. */
  derivedFrom: string;
  revision: number;
  savedAt: string;
  savedBy: string;
  history: SpecHistoryEntry[];
}

/** What the route writes onto the project document — read by the Design card and Delivery. */
export interface SpecSummary {
  functional: number;
  nonFunctional: number;
  openDecisions: number;
  /** Requirements marked "Needs clarification". */
  clarify: number;
  accepted: number;
  revision: number;
  savedAt: string;
  derivedFrom: string;
}

/* ------------------------------------------------------------------ plain text */

/**
 * A statement an implementer can read: the program's variables, parameters
 * and system fields leave the sentence (they stay in the source column).
 * Table and object names stay — they are the data the implementer moves.
 */
const VARIABLE = /\b(?:lv|gv|gs|ls|lt|gt|lw|gw|wa|lo|go|lr|gr|lc|gc|ls|p|s|so|pa|r|c|l|g|i|e|t|ct|it|et)_[a-z0-9_]+(?:-[a-z0-9_]+)?\b/gi;
const SYSTEM_FIELD = /\bsy-[a-z]+\b/gi;

export function plainText(text: string): string {
  let out = String(text ?? '');
  // "(P_BANFN, required)" → "(required)"; "(GUI_DOWNLOAD)" → "".
  out = out.replace(/\s*\(\s*[A-Z][A-Z0-9]*_[A-Z0-9_]+\s*(?:,\s*([^)]+))?\)/g, (_m, rest: string | undefined) => (rest ? ` (${rest.trim()})` : ''));
  // "EKGRP from lv_ekgrp" → "EKGRP".
  out = out.replace(new RegExp(`\\s+(?:from|in|of|=)\\s+(?:${VARIABLE.source}|${SYSTEM_FIELD.source})`, 'gi'), '');
  out = out.replace(VARIABLE, 'the value').replace(SYSTEM_FIELD, 'the system value');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s*\)/g, '').trim();
}

/* ------------------------------------------------------------------ helpers */

const rangesOf = (anchors: ReadonlyArray<{ lineStart: number; lineEnd: number }>): SpecLineRange[] =>
  anchors.map((a) => ({ s: a.lineStart, e: Math.max(a.lineStart, a.lineEnd) }));

export function linesText(lines: readonly SpecLineRange[]): string {
  return lines.length ? anchorList(lines.map((l) => ({ lineStart: l.s, lineEnd: l.e }))) : '';
}

const stepLabelOf = (fr: RequirementSet, stepId: string | null): string | null => {
  if (!stepId) return null;
  const s = fr.steps.find((x) => x.id === stepId);
  return s ? `${s.number}. ${s.label}` : null;
};

function engineCategoryToSpec(category: NfrCategory, signal: NfrSignal | null, text: string): SpecNfrCategory {
  if (signal === 'bapi-return' || signal === 'remote-call' || signal === 'update-task' || signal === 'workflow-event') return 'integration';
  if (signal === 'select-star' || signal === 'select-in-loop' || signal === 'select-without-where') return 'performance';
  switch (category) {
    case 'migration':
    case 'cutover':
      return 'transition';
    case 'retention':
      return 'retention';
    case 'audit':
      return 'audit';
    case 'authorization':
      return 'security';
    case 'errors':
    case 'monitoring':
      return 'operability';
    case 'performance':
      return /availab/i.test(text) ? 'availability' : 'performance';
    default:
      return 'operability';
  }
}

/** The measurable target and the way to measure it, for a requirement the code grounds. */
const GROUNDED_TARGET: Readonly<Record<NfrSignal, { target: string; method: string }>> = {
  'authority-check': {
    target: 'Every operation listed is refused without the authorization — in 100 % of the tested cases.',
    method: 'Negative test per role: a user without the authorization is refused, a user with it passes.',
  },
  'change-document': {
    target: 'Every change listed leaves a change record with who, what and when.',
    method: 'Change a record in a test run and read its change history.',
  },
  'record-table': {
    target: 'One record per processed case, with the fields listed, as today.',
    method: 'Run a test case and compare the record with the expected fields.',
  },
  'stop-message': {
    target: 'In each listed case the run stops and shows the stated message.',
    method: 'Provoke each case in a test and check the message the user sees.',
  },
  'tolerated-failure': {
    target: 'In each listed case the run continues and shows the stated warning.',
    method: 'Provoke each failure in a test; the run completes and shows the warning.',
  },
  'bapi-return': {
    target: 'An error returned by the called function is treated as a failure, every time.',
    method: 'Integration test with a simulated error return.',
  },
  'unit-of-work': {
    target: 'The changes listed are saved together or not at all.',
    method: 'Abort a test run between the changes; no partial change remains.',
  },
  retry: {
    target: 'Retries as the code does today, until decided otherwise in section 7.',
    method: 'Make the call fail in a test and count the attempts.',
  },
  'customer-data-read': {
    target: 'All rows the process reads are available in the new solution at go-live.',
    method: 'Reconcile row counts and a sample of rows after the migration.',
  },
  'customer-data-write': {
    target: 'The existing rows agreed in section 7 are taken over completely.',
    method: 'Reconcile row counts and a sample of rows after the migration.',
  },
  deletion: {
    target: 'Data is deleted only in the cases listed.',
    method: 'Check the stored data after a test run against the retention decision.',
  },
  archiving: {
    target: 'Data is archived only in the cases listed.',
    method: 'Check the archive after a test run against the retention decision.',
  },
  'application-log': {
    target: 'Every run writes a log a support person can read.',
    method: 'Run a test case, open the log and check the messages listed.',
  },
  'background-job': {
    target: 'The process runs as a scheduled job, as today.',
    method: 'Schedule a test job; check that it runs and writes its log.',
  },
  messages: {
    target: 'Every message the user sees today has an equivalent.',
    method: 'Walk the listed messages in a user acceptance test.',
  },
  'select-star': {
    target: 'Not determined — set by the performance decision in section 7.',
    method: 'Load test with the agreed volume.',
  },
  'select-in-loop': {
    target: 'Not determined — set by the performance decision in section 7.',
    method: 'Load test with the agreed volume.',
  },
  'select-without-where': {
    target: 'Not determined — set by the performance decision in section 7.',
    method: 'Load test with the agreed volume.',
  },
  changes: {
    target: 'Every change listed happens as today, and nothing else changes.',
    method: 'Compare the changed data after a test run with the expected result.',
  },
  'remote-call': {
    target: 'The call reaches the agreed system; a failure is handled as stated.',
    method: 'Integration test against the target system or an agreed stub.',
  },
  'update-task': {
    target: 'The change is applied after the save, as today.',
    method: 'Integration test: save, then check that the change was applied.',
  },
  'workflow-event': {
    target: 'The event is raised in each listed case, as today.',
    method: 'Integration test: check that the event is received.',
  },
};

/** The requirement a category's open questions stand for, when the code grounds none of its own. */
const DECIDED_REQUIREMENT: Readonly<Record<SpecNfrCategory, { title: string; statement: string; method: string }>> = {
  performance: {
    title: 'Volume and processing time',
    statement: 'The new solution shall handle the agreed volume within the agreed time.',
    method: 'Load test with the agreed volume; measure the processing time.',
  },
  availability: {
    title: 'Service hours and response time',
    statement: 'The new solution shall be available in the agreed service hours and answer within the agreed response time.',
    method: 'Monitoring of the agreed service hours; response times measured over one month.',
  },
  security: {
    title: 'Who may use the process',
    statement: 'The new solution shall grant access only to the agreed business roles.',
    method: 'Role test with the agreed roles.',
  },
  audit: {
    title: 'Audit trail',
    statement: 'The new solution shall keep the agreed audit trail.',
    method: 'Audit review of a test run.',
  },
  retention: {
    title: 'Retention periods',
    statement: 'The new solution shall keep the data for the agreed period and remove it after that.',
    method: 'Check the stored data against the agreed periods.',
  },
  operability: {
    title: 'Failure handling and alerting',
    statement: 'The new solution shall make failures visible to operations and alert the agreed contact.',
    method: 'Failure drill: provoke a failure and check the alert.',
  },
  usability: {
    title: 'Usability',
    statement: 'The new solution shall let a trained user complete the process without help.',
    method: 'User acceptance test with the people who run the process today.',
  },
  integration: {
    title: 'Integration',
    statement: 'The new solution shall exchange data with the agreed systems in the agreed way.',
    method: 'Integration test against the agreed systems.',
  },
  transition: {
    title: 'Migration and cutover',
    statement: 'The new solution shall take over from the current program as agreed for migration and cutover.',
    method: 'Dress rehearsal of the migration and the cutover.',
  },
};

const NOT_DETERMINED_TARGET = 'Not determined — see the decision in section 7.';

/**
 * Suggested answers for a question — starting points the product offers,
 * never read from the code. Picked by what the question asks.
 */
export function suggestedOptions(question: string, category: SpecNfrCategory | 'functional', topic?: string): string[] {
  const q = question.toLowerCase();
  if (category === 'functional') {
    if (topic === 'currency') return ['The currency of the document', 'The company code currency'];
    if (topic === 'unreached-rule') return ['Yes — keep it as a requirement', 'No — it is not needed'];
    if (topic === 'unreached-code') return ['None of them is needed', 'Some are needed — named in the value'];
    return [];
  }
  if (category === 'operability' && /retr/.test(q)) return ['No retry — report the failure', 'Retry 3 times, 5 minutes apart'];
  if (category === 'transition' && /workflow items|open at the switch/.test(q)) return ['Finished in the old process', 'Moved to the new process'];
  // A yes-or-no question, unless it offers its own alternatives ("… or …").
  if (/^(must|shall|is|are|should|does)\b/.test(q) && !/\bor\b/.test(q)) return ['Yes', 'No'];
  switch (category) {
    case 'performance':
      return ['Up to 1,000 cases per run, finished within one hour', 'Up to 10,000 cases per run, finished overnight', 'Measure today’s volume first'];
    case 'availability':
      return ['Business hours; 95 % of cases answered within 2 s', 'Around the clock; 95 % of cases answered within 1 s', 'As today — measure first'];
    case 'security':
      return ['The roles that hold it today', 'A new role for this process only'];
    case 'retention':
      return ['1 year', '10 years', 'As long as the related business document'];
    case 'operability':
      if (/saved together|restart/.test(q)) return ['All changes of one run together; a restart repeats the run', 'Each case on its own; a restart continues with the failed cases'];
      return ['In the application log, with a mail to the process owner', 'In the operations monitoring, with an alert to the support team'];
    case 'transition':
      if (/rows|taken over/.test(q)) return ['All rows', 'Only rows from the last 2 years', 'None — start empty'];
      if (/maintain/.test(q)) return ['The business department that maintains it today', 'IT, on request of the business'];
      return ['A fixed date, no parallel run', 'A parallel run of four weeks; the old program makes the changes'];
    default:
      return [];
  }
}

/**
 * A business title for a functional requirement, from its plain statement:
 * "The system shall process only document type NB." reads "Process only
 * document type NB". The rule id and the step stay in the source column.
 */
export function businessTitle(statement: string, max = 70): string {
  let t = plainText(statement).replace(/^the (?:system|new solution) shall\s+/i, '').replace(/[.\s]+$/, '').trim();
  if (!t) return 'Requirement';
  t = t[0].toUpperCase() + t.slice(1);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:\s]+$/, '')} …`;
}

function frTitle(r: FunctionalRequirement): string {
  return businessTitle(r.statement);
}

function frRationale(fr: RequirementSet, r: FunctionalRequirement): string {
  const step = stepLabelOf(fr, r.stepId)?.replace(/^\d+\.\s*/, '');
  const first =
    r.basis.kind === 'rule'
      ? `The current program enforces this as a business rule that is hard-coded in it${r.basis.ref && /^BR-\d+$/.test(r.basis.ref) ? ` (${r.basis.ref})` : ''}.`
      : r.basis.kind === 'decision'
        ? `The current program decides this at a decision point${step ? ` in “${step}”` : ''}.`
        : r.basis.kind === 'exit'
          ? 'The current program ends the process early in this case.'
          : r.basis.kind === 'effect'
            ? `The current program does this as a step of the process${step ? ` (“${step}”)` : ''}.`
            : r.basis.kind === 'fixed-values'
              ? 'The current program works with these fixed values.'
              : 'The current program asks the user for these inputs before it runs.';
  return `${first} Priority ${PRIORITY_LABEL[r.priority]}: ${plainText(r.priorityReason.replace(/\s*\(L[\d, L-]+\)/g, ''))}`;
}

/* ------------------------------------------------------------------ draft */

export interface RuleStateInput {
  /** `BR-004`. */
  subject: string;
  state: 'keep' | 'change' | 'drop' | 'clarify';
  note: string | null;
  by: string;
  /** ISO 8601. */
  at: string;
  /** What the rule is called on screen. */
  label?: string | null;
}

export interface SpecDraftInput {
  projectName: string;
  fr: RequirementSet;
  nfr: NfrSet;
  /** The answers of the process review for business rules. */
  ruleStates?: readonly RuleStateInput[] | null;
  /** The design model's texts per NFR category — kept as proposals beside a decision. */
  proposals?: NFRData | null;
  /** The extensibility route in words, when the project has one. */
  route?: string | null;
}

const DEFAULT_STAKEHOLDERS: SpecStakeholder[] = [
  { role: 'Business process owner', interest: 'Answers the business questions and the business rules in section 7.' },
  { role: 'IT operations', interest: 'Runs and monitors the new solution; sets the service levels in section 7.' },
  { role: 'Decision maker', interest: 'Accepts the specification for implementation.' },
  { role: 'Implementation partner', interest: 'Builds and tests the new solution from this specification.' },
];

const DEFAULT_GLOSSARY: SpecGlossaryEntry[] = [
  { term: 'Must · Should · Could', meaning: 'The priority of a requirement. Must: the process does not work without it. Should: expected, can wait for a later release. Could: desirable.' },
  { term: 'Line anchor', meaning: 'A reference such as L120-124 to the lines of the current program a requirement was read from.' },
  { term: 'Business rule', meaning: 'A rule the current program applies, numbered BR-nnn. Hard-coded means it is written into the program, not configured.' },
  { term: 'Decision point', meaning: 'A place in the process where the program takes one path or another, depending on the data.' },
  { term: 'Reconstructed', meaning: 'Derived from the code of the current program by the Clean-Core.io engine, not confirmed by a person.' },
  { term: 'Model proposal', meaning: 'A sentence or a value a language model proposed. It is never taken over without a person accepting it.' },
  { term: 'Not determined', meaning: 'The code cannot answer this. It is a decision for the business or IT, recorded in section 7.' },
];

function interfacesOf(fr: RequirementSet): SpecInterface[] {
  const byName = new Map<string, SpecInterface & { uses: Set<string> }>();
  const all = [...fr.steps.flatMap((s) => s.objects), ...fr.requirements.flatMap((r) => r.objects)];
  for (const o of all) {
    const key = o.name;
    let entry = byName.get(key);
    if (!entry) {
      entry = { name: o.name, kind: o.kind, use: '', level: o.custom ? 'custom' : o.level ?? 'not-graded', lines: [], uses: new Set() };
      byName.set(key, entry);
    }
    entry.uses.add(o.use);
    if (entry.level === 'not-graded' && o.level) entry.level = o.level;
    if (!entry.lines.some((l) => l.s === o.line)) entry.lines.push({ s: o.line, e: o.line });
  }
  return [...byName.values()]
    .map(({ uses, ...rest }) => ({ ...rest, use: [...uses].sort().join(', '), lines: rest.lines.sort((a, b) => a.s - b.s).slice(0, 12) }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .slice(0, 300);
}

/** The specification as the engine drafts it from one signed source. */
export function buildSpecDraft(input: SpecDraftInput): RequirementsSpec {
  const { fr, nfr } = input;
  const program = fr.program ?? input.projectName;
  const requirements: SpecRequirement[] = [];
  const decisions: SpecDecision[] = [];

  /* functional */
  for (const r of fr.requirements) {
    const step = stepLabelOf(fr, r.stepId);
    requirements.push({
      id: r.id,
      kind: 'functional',
      category: null,
      title: frTitle(r),
      statement: normalizeRich(plainText(r.statement)),
      rationale: normalizeRich(frRationale(fr, r)),
      acceptance: r.acceptance.map((c) => ({ given: plainText(c.given), when: plainText(c.when), then: plainText(c.then) })),
      priority: r.priority,
      status: 'draft',
      origin: 'engine',
      target: '',
      method: '',
      note: '',
      source: {
        lines: rangesOf(r.anchors),
        rules: r.basis.kind === 'rule' && r.basis.ref && /^BR-\d+$/.test(r.basis.ref) ? [r.basis.ref] : [],
        steps: step ? [step] : [],
        engineRef: r.id,
        evidence: `${r.rationale} Objects: ${r.objects.map((o) => `${o.name} (${o.use})`).join(', ') || 'none named'}.`.slice(0, 1000),
      },
      decisionIds: [],
    });
  }

  /* non-functional, grounded in the code */
  const nfrSpecCategory = new Map<string, SpecNfrCategory>();
  for (const r of nfr.requirements) {
    const category = engineCategoryToSpec(r.category, r.signal, r.statement);
    nfrSpecCategory.set(r.id, category);
    const t = GROUNDED_TARGET[r.signal];
    requirements.push({
      id: r.id,
      kind: 'non-functional',
      category,
      title: `${SPEC_NFR_CATEGORY_LABEL[category]} · ${groundedTitle(r)}`,
      statement: normalizeRich(plainText(r.statement)),
      rationale: normalizeRich(`The current program does this today, so the new solution has to as well. Priority ${PRIORITY_LABEL[r.priority]}: ${plainText(r.priorityReason.replace(/\s*\(L[\d, L-]+\)/g, ''))}`),
      acceptance: r.acceptance.map((c) => ({ given: plainText(c.given), when: plainText(c.when), then: plainText(c.then) })),
      priority: r.priority,
      status: 'draft',
      origin: 'engine',
      target: t.target,
      method: t.method,
      note: '',
      source: {
        lines: rangesOf(r.anchors),
        rules: [],
        steps: [],
        engineRef: r.id,
        evidence: `${r.rationale} Objects: ${r.objects.join(', ') || 'none named'}.`.slice(0, 1000),
      },
      decisionIds: [],
    });
  }

  /* the questions of the non-functional reading → decisions, and per category one decided requirement */
  const decidedByCategory = new Map<SpecNfrCategory, SpecRequirement>();
  let nextNfr = nfr.requirements.length + 1;
  const proposalFor = (q: NfrQuestion): string => {
    const text = input.proposals?.[NFR_MODEL_KEY[q.category]];
    if (typeof text !== 'string' || !text.trim()) return '';
    // Only a proposal that names this question is kept beside it; a generic text is no answer to it.
    return text.includes(q.id) ? normalizeRich(text, 1_000) : '';
  };
  for (const q of nfr.questions) {
    const category = engineCategoryToSpec(q.category, null, q.question);
    const decisionId = `D-${q.id}`;
    // A grounded requirement of the same category that the question names by its object.
    const grounded = requirements.filter(
      (r) => r.kind === 'non-functional' && r.category === category && r.origin === 'engine' && nfrObjectsNamed(nfr, r.source.engineRef, q.question),
    );
    let affects: SpecRequirement[] = grounded;
    if (!affects.length) {
      let decided = decidedByCategory.get(category);
      if (!decided) {
        const d = DECIDED_REQUIREMENT[category];
        decided = {
          id: `NFR-${String(nextNfr++).padStart(2, '0')}`,
          kind: 'non-functional',
          category,
          title: `${SPEC_NFR_CATEGORY_LABEL[category]} · ${d.title}`,
          statement: d.statement,
          rationale: 'The code cannot set this target. It is decided by the business or IT in section 7, and the answer is the target.',
          acceptance: [],
          priority: 'should',
          status: 'clarify',
          origin: 'engine',
          target: NOT_DETERMINED_TARGET,
          method: d.method,
          note: '',
          source: { lines: [], rules: [], steps: [], engineRef: null, evidence: 'Not determined — the code is silent on this target; the decisions in section 7 name the lines that prompt the question.' },
          decisionIds: [],
        };
        decidedByCategory.set(category, decided);
        requirements.push(decided);
      }
      affects = [decided];
    }
    for (const r of affects) if (!r.decisionIds.includes(decisionId)) r.decisionIds.push(decisionId);
    decisions.push({
      id: decisionId,
      origin: 'nfr-question',
      owner: q.owner === 'it-operations' ? 'it' : 'business',
      question: plainText(q.question),
      context: `${SPEC_NFR_CATEGORY_LABEL[category]}. ${plainText(q.evidence)}`.slice(0, 2000),
      options: suggestedOptions(q.question, category),
      lines: rangesOf(q.anchors),
      affects: affects.map((r) => r.id),
      proposal: proposalFor(q),
      answer: null,
    });
    // An engine source line for the decided requirement: the lines the question names.
    for (const r of affects) {
      if (r.source.engineRef === null) {
        for (const l of rangesOf(q.anchors)) if (!r.source.lines.some((x) => x.s === l.s && x.e === l.e)) r.source.lines.push(l);
      }
    }
  }

  /* the functional questions the non-functional ones do not already ask */
  for (const o of fr.open) {
    if (o.topic === 'authorization' || o.topic === 'retention' || o.topic === 'volume') continue;
    decisions.push({
      id: `D-${o.id}`,
      origin: 'fr-question',
      owner: 'business',
      question: plainText(o.question),
      context: plainText(o.why).slice(0, 2000),
      options: suggestedOptions(o.question, 'functional', o.topic),
      lines: rangesOf(o.anchors),
      affects: [],
      proposal: '',
      answer: null,
    });
  }

  const spec: RequirementsSpec = {
    title: `Requirements specification — ${input.projectName || program}`.slice(0, 200),
    version: '0.1',
    docStatus: 'draft',
    program: program.slice(0, 120),
    purpose: normalizeRich(
      `This specification says what a new solution must do to replace the custom program ${program} (${fr.lineCount} lines of ABAP). ` +
        'It was drafted from the program’s code by the Clean-Core.io engine and is completed by the decisions in section 7. ' +
        'Read it without the program: every requirement says what the solution shall do, why, and how it is accepted; the line references in the source columns are for whoever wants to check against the current code.',
    ),
    scope: normalizeRich(scopeText(fr)),
    context: normalizeRich(contextText(fr, input.route ?? null)),
    stakeholders: DEFAULT_STAKEHOLDERS.map((s) => ({ ...s })),
    requirements,
    interfaces: interfacesOf(fr),
    interfacesNote: '',
    constraints: normalizeRich(
      [
        '- The new solution follows SAP’s clean core model: it uses released SAP interfaces and extension points and modifies no SAP object.',
        input.route ? `- Target: ${input.route}.` : '- The target platform is decided in the Design tool (architecture sign-off).',
        '- Hard-coded values of the current program are named in the requirements; whether they stay fixed or become configuration is decided per requirement.',
      ].join('\n'),
    ),
    assumptions: normalizeRich(
      [
        '- Where this document says nothing, the behaviour of the current program is the reference.',
        '- No value is assumed for a decision that is still open in section 7.',
      ].join('\n'),
    ),
    decisions,
    glossary: DEFAULT_GLOSSARY.map((g) => ({ ...g })),
  };
  return applyRuleStates(spec, input.ruleStates ?? []);
}

function groundedTitle(r: NonFunctionalRequirement): string {
  const object = r.objects[0];
  const kind: Record<NfrSignal, string> = {
    'authority-check': 'Authorization check',
    'change-document': 'Change history',
    'record-table': 'Processing record',
    'stop-message': 'Stop with a message',
    'tolerated-failure': 'Continue with a warning',
    'bapi-return': 'Error returned by a function',
    'unit-of-work': 'Save together',
    retry: 'Retry',
    'customer-data-read': 'Reference data to migrate',
    'customer-data-write': 'Data to take over',
    deletion: 'Deletion',
    archiving: 'Archiving',
    'application-log': 'Application log',
    'background-job': 'Background job',
    messages: 'Messages',
    'select-star': 'Read volume',
    'select-in-loop': 'Repeated reads',
    'select-without-where': 'Unrestricted read',
    changes: 'Data changes',
    'remote-call': 'Remote call',
    'update-task': 'Change after the save',
    'workflow-event': 'Workflow event',
  };
  return object ? `${kind[r.signal]} (${object})` : kind[r.signal];
}

function nfrObjectsNamed(nfr: NfrSet, engineRef: string | null, question: string): boolean {
  const r = nfr.requirements.find((x) => x.id === engineRef);
  return Boolean(r && r.objects.some((o) => o.length > 2 && question.includes(o)));
}

function scopeText(fr: RequirementSet): string {
  const steps = fr.steps.filter((s) => s.requirementIds.length).slice(0, 12);
  const unreached = fr.open.find((o) => o.topic === 'unreached-code');
  return [
    'In scope — the process steps of the current program that carry a requirement:',
    ...steps.map((s) => `- ${s.label}`),
    '',
    'Out of scope unless decided otherwise in section 7:',
    `- ${unreached ? 'Routines the current program never calls (see the open decision on unreached code).' : 'Functions the current program does not perform.'}`,
    '- Customizing and master data maintenance outside the program.',
  ].join('\n');
}

function contextText(fr: RequirementSet, route: string | null): string {
  const objects = fr.steps.flatMap((s) => s.objects);
  const read = [...new Set(objects.filter((o) => o.kind === 'table' && o.use === 'read').map((o) => o.name))].slice(0, 10);
  const written = [...new Set(objects.filter((o) => o.kind === 'table' && o.use === 'write').map((o) => o.name))].slice(0, 10);
  const calls = [...new Set(objects.filter((o) => o.kind !== 'table').map((o) => o.name))].slice(0, 10);
  const lines = [
    `Today the process runs as the custom ABAP program ${fr.program ?? 'under review'} in SAP, in ${fr.counts.steps} steps.`,
    '',
  ];
  if (read.length) lines.push(`- It reads ${read.join(', ')}.`);
  if (written.length) lines.push(`- It writes ${written.join(', ')}.`);
  if (calls.length) lines.push(`- It calls ${calls.join(', ')}.`);
  if (route) lines.push('', `The recommended target is ${route}.`);
  return lines.join('\n');
}

/**
 * The answers of the process review applied to the specification: a rule
 * answered *Keep* accepts its requirements, *Drop* rejects them, *Clarify*
 * and *Change* make them wait for a decision. A decision already in the
 * document is not asked again, and an answer given here is not overwritten.
 */
export function applyRuleStates(spec: RequirementsSpec, states: readonly RuleStateInput[]): RequirementsSpec {
  const requirements = spec.requirements.map((r) => ({ ...r, decisionIds: [...r.decisionIds] }));
  const decisions = [...spec.decisions];
  for (const st of states) {
    if (!/^BR-\d{1,4}$/.test(st.subject)) continue;
    const affected = requirements.filter((r) => r.source.rules.includes(st.subject));
    const who = `${st.by}, ${st.at.slice(0, 10)}`;
    const said = st.note ? ` Note: ${plainText(st.note)}` : '';
    if (st.state === 'keep' || st.state === 'drop') {
      for (const r of affected) {
        if (r.status !== 'draft') continue;
        r.status = st.state === 'keep' ? 'accepted' : 'rejected';
        r.note = normalizeRich(`${st.subject} was answered ${st.state === 'keep' ? 'Keep' : 'Drop'} in the process review (${who}).${said}`);
      }
      continue;
    }
    const id = `D-${st.subject}`;
    if (decisions.some((d) => d.id === id)) continue;
    const name = st.label ? `${st.subject} (${plainText(st.label)})` : st.subject;
    decisions.push({
      id,
      origin: st.state === 'clarify' ? 'rule-clarify' : 'rule-change',
      owner: 'business',
      question: st.state === 'clarify' ? `Does business rule ${name} still apply as the program has it?` : `How shall business rule ${name} change?`,
      context: `Marked ${st.state === 'clarify' ? 'Clarify' : 'Change'} in the process review (${who}).${said}`.slice(0, 2000),
      options: st.state === 'clarify' ? ['Keep it as the program has it', 'Change it — described in the value', 'Drop it'] : [],
      lines: affected.flatMap((r) => r.source.lines).slice(0, 10),
      affects: affected.map((r) => r.id),
      proposal: '',
      answer: null,
    });
    for (const r of affected) {
      if (!r.decisionIds.includes(id)) r.decisionIds.push(id);
      if (r.status === 'draft') r.status = 'clarify';
    }
  }
  return { ...spec, requirements, decisions };
}

/* ------------------------------------------------------------------ decisions */

/** Whether a decision still waits for an answer — "decide later" is not an answer. */
export function decisionOpen(d: SpecDecision): boolean {
  return !d.answer || d.answer.kind === 'later' || !d.answer.value.trim();
}

/**
 * Records an answer and carries it into the document: a target still *Not
 * determined* takes the answer, and a requirement that waited on this
 * decision alone leaves *Needs clarification* for *Draft* — accepting it stays
 * the owner's act. "Decide later" records the wish and changes nothing else.
 * Who and when are left empty here; the server writes them.
 */
export function answerDecision(
  spec: RequirementsSpec,
  decisionId: string,
  answer: { kind: DecisionAnswerKind; value: string },
  owner?: DecisionOwner,
): RequirementsSpec {
  const value = answer.kind === 'later' ? '' : normalizeRich(answer.value, 1_000);
  const decisions = spec.decisions.map((d) =>
    d.id === decisionId ? { ...d, owner: owner ?? d.owner, answer: { kind: answer.kind, value, by: null, at: null } } : d,
  );
  const decided = decisions.find((d) => d.id === decisionId);
  if (!decided || answer.kind === 'later' || !value) return { ...spec, decisions };
  const openIds = new Set(decisions.filter(decisionOpen).map((d) => d.id));
  const requirements = spec.requirements.map((r) => {
    if (!decided.affects.includes(r.id) && !r.decisionIds.includes(decisionId)) return r;
    const next = { ...r };
    if (next.kind === 'non-functional' && (!next.target.trim() || next.target === NOT_DETERMINED_TARGET || /^Not determined/.test(next.target))) {
      next.target = `${value} (decision ${decisionId})`.slice(0, 1_000);
    }
    if (next.status === 'clarify' && !next.decisionIds.some((id) => openIds.has(id))) next.status = 'draft';
    return next;
  });
  return { ...spec, requirements, decisions };
}

/* ------------------------------------------------------------------ counts */

export interface SpecCounts {
  functional: number;
  nonFunctional: number;
  total: number;
  byStatus: Record<RequirementStatus, number>;
  byPriority: Record<RequirementPriority, number>;
  byCategory: Record<SpecNfrCategory, number>;
  openDecisions: number;
  decided: number;
  decisions: number;
  /** Mutually exclusive, over the requirements not rejected. */
  coverage: { code: number; decision: number; person: number; open: number };
}

export function specCounts(spec: RequirementsSpec): SpecCounts {
  const byStatus: Record<RequirementStatus, number> = { draft: 0, accepted: 0, clarify: 0, rejected: 0 };
  const byPriority: Record<RequirementPriority, number> = { must: 0, should: 0, could: 0 };
  const byCategory = Object.fromEntries(SPEC_NFR_CATEGORIES.map((c) => [c, 0])) as Record<SpecNfrCategory, number>;
  const open = new Set(spec.decisions.filter(decisionOpen).map((d) => d.id));
  const answered = new Set(spec.decisions.filter((d) => !decisionOpen(d)).map((d) => d.id));
  const coverage = { code: 0, decision: 0, person: 0, open: 0 };
  for (const r of spec.requirements) {
    byStatus[r.status] += 1;
    if (r.status === 'rejected') continue;
    byPriority[r.priority] += 1;
    if (r.category) byCategory[r.category] += 1;
    if (r.status === 'clarify' || r.decisionIds.some((id) => open.has(id))) coverage.open += 1;
    else if (r.source.lines.length) coverage.code += 1;
    else if (r.decisionIds.some((id) => answered.has(id))) coverage.decision += 1;
    else coverage.person += 1;
  }
  const live = spec.requirements.filter((r) => r.status !== 'rejected');
  return {
    functional: live.filter((r) => r.kind === 'functional').length,
    nonFunctional: live.filter((r) => r.kind === 'non-functional').length,
    total: live.length,
    byStatus,
    byPriority,
    byCategory,
    openDecisions: open.size,
    decided: answered.size,
    decisions: spec.decisions.length,
    coverage,
  };
}

export type SpecState = 'not-started' | 'draft' | 'ready';

/** Not started · draft with open decisions · ready to export (nothing open, nothing to clarify). */
export function specState(record: Pick<SpecRecord, 'spec'> | null): SpecState {
  if (!record) return 'not-started';
  const c = specCounts(record.spec);
  return c.openDecisions === 0 && c.byStatus.clarify === 0 ? 'ready' : 'draft';
}

export function specSummaryOf(record: SpecRecord): SpecSummary {
  const c = specCounts(record.spec);
  return {
    functional: c.functional,
    nonFunctional: c.nonFunctional,
    openDecisions: c.openDecisions,
    clarify: c.byStatus.clarify,
    accepted: c.byStatus.accepted,
    revision: record.revision,
    savedAt: record.savedAt,
    derivedFrom: record.derivedFrom,
  };
}

/** The summary the route wrote onto the project, read defensively. */
export function readSpecSummary(value: unknown): SpecSummary | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null);
  const functional = n(v.functional);
  const nonFunctional = n(v.nonFunctional);
  const openDecisions = n(v.openDecisions);
  const accepted = n(v.accepted);
  const revision = n(v.revision);
  if (functional === null || nonFunctional === null || openDecisions === null || accepted === null || revision === null) return null;
  if (typeof v.savedAt !== 'string' || typeof v.derivedFrom !== 'string') return null;
  return { functional, nonFunctional, openDecisions, clarify: n(v.clarify) ?? 0, accepted, revision, savedAt: v.savedAt, derivedFrom: v.derivedFrom };
}

/** One line for the handover: what the specification holds, never more than it holds. */
export function specHandoverLine(summary: SpecSummary | null, signedSha256: string | null): string | null {
  if (!summary) return null;
  const n = summary.functional + summary.nonFunctional;
  const open = summary.openDecisions;
  const stale = signedSha256 !== null && summary.derivedFrom !== signedSha256;
  return `Requirements specification: ${n} requirement${n === 1 ? '' : 's'} (${summary.functional} functional, ${summary.nonFunctional} non-functional), ${open} open decision${open === 1 ? '' : 's'}${stale ? ' — written for an earlier source' : ''}.`;
}

/* ------------------------------------------------------------------ drift */

export interface SpecDrift {
  added: string[];
  gone: string[];
  changed: string[];
}

/** What the engine reads in the current source that the stored document does not have, and the reverse. */
export function specDrift(spec: RequirementsSpec, fresh: RequirementsSpec): SpecDrift {
  const stored = new Map(spec.requirements.filter((r) => r.source.engineRef).map((r) => [r.source.engineRef as string, r]));
  const now = new Map(fresh.requirements.filter((r) => r.source.engineRef).map((r) => [r.source.engineRef as string, r]));
  const added = [...now.keys()].filter((k) => !stored.has(k));
  const gone = [...stored.keys()].filter((k) => !now.has(k));
  const changed = [...now.keys()].filter((k) => stored.has(k) && stored.get(k)!.source.evidence !== now.get(k)!.source.evidence);
  return { added, gone, changed };
}

/**
 * Takes the current reading over: new engine requirements and decisions are
 * added, a requirement whose code is gone is rejected with the reason, and a
 * changed one gets its new lines and evidence — the owner's wording stays.
 */
export function mergeReading(spec: RequirementsSpec, fresh: RequirementsSpec): RequirementsSpec {
  const drift = specDrift(spec, fresh);
  const freshByRef = new Map(fresh.requirements.filter((r) => r.source.engineRef).map((r) => [r.source.engineRef as string, r]));
  const taken = new Set(spec.requirements.map((r) => r.id));
  const requirements = spec.requirements.map((r) => {
    const ref = r.source.engineRef;
    if (ref && drift.gone.includes(ref) && r.status !== 'rejected') {
      return { ...r, status: 'rejected' as RequirementStatus, note: normalizeRich(`${r.note ? `${r.note}\n\n` : ''}No longer in the code since the source changed.`) };
    }
    if (ref && drift.changed.includes(ref)) {
      const now = freshByRef.get(ref)!;
      return { ...r, source: { ...r.source, lines: now.source.lines, evidence: now.source.evidence } };
    }
    return r;
  });
  for (const ref of drift.added) {
    const r = freshByRef.get(ref)!;
    let id = r.id;
    for (let n = 1; taken.has(id); n++) id = `${r.id.replace(/-.*$/, '')}-N${String(n).padStart(2, '0')}`;
    taken.add(id);
    requirements.push({ ...r, id });
  }
  const decisionIds = new Set(spec.decisions.map((d) => d.id));
  const decisions = [...spec.decisions, ...fresh.decisions.filter((d) => !decisionIds.has(d.id))];
  return { ...spec, requirements, decisions, interfaces: fresh.interfaces };
}

/* ------------------------------------------------------------------ editing */

/** The next free id for a requirement a person adds: `FR-P01`, `NFR-P01`. */
export function nextPersonId(spec: RequirementsSpec, kind: SpecKind): string {
  const prefix = kind === 'functional' ? 'FR-P' : 'NFR-P';
  const used = new Set(spec.requirements.map((r) => r.id));
  for (let n = 1; n < 1000; n++) {
    const id = `${prefix}${String(n).padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
  return `${prefix}999`;
}

export function nextDecisionId(spec: RequirementsSpec): string {
  const used = new Set(spec.decisions.map((d) => d.id));
  for (let n = 1; n < 1000; n++) {
    const id = `D-P${String(n).padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
  return 'D-P999';
}

export function blankRequirement(spec: RequirementsSpec, kind: SpecKind, category: SpecNfrCategory | null = null): SpecRequirement {
  return {
    id: nextPersonId(spec, kind),
    kind,
    category: kind === 'non-functional' ? category ?? 'performance' : null,
    title: kind === 'functional' ? 'New functional requirement' : `${SPEC_NFR_CATEGORY_LABEL[category ?? 'performance']} · New requirement`,
    statement: kind === 'functional' ? 'The system shall ' : 'The new solution shall ',
    rationale: '',
    acceptance: [],
    priority: 'should',
    status: 'draft',
    origin: 'person',
    target: kind === 'non-functional' ? NOT_DETERMINED_TARGET : '',
    method: '',
    note: '',
    source: { lines: [], rules: [], steps: [], engineRef: null, evidence: '' },
    decisionIds: [],
  };
}

/** Moves a requirement one place up or down among those of its kind (and category). */
export function moveRequirement(spec: RequirementsSpec, id: string, direction: -1 | 1): RequirementsSpec {
  const list = [...spec.requirements];
  const at = list.findIndex((r) => r.id === id);
  if (at < 0) return spec;
  const me = list[at];
  const same = (r: SpecRequirement) => r.kind === me.kind && r.category === me.category;
  let to = at + direction;
  while (to >= 0 && to < list.length && !same(list[to])) to += direction;
  if (to < 0 || to >= list.length) return spec;
  [list[at], list[to]] = [list[to], list[at]];
  return { ...spec, requirements: list };
}

/**
 * What is sent while somebody is still typing: rows left half-empty (a
 * stakeholder without a role, a criterion without its *Then*) stay on screen
 * and are not sent, so a save is never refused for a field not finished yet.
 */
export function specForSave(spec: RequirementsSpec): RequirementsSpec {
  const filled = (t: string) => t.trim().length > 0;
  return {
    ...spec,
    title: filled(spec.title) ? spec.title : 'Requirements specification',
    version: filled(spec.version) ? spec.version : '0.1',
    stakeholders: spec.stakeholders.filter((s) => filled(s.role)),
    glossary: spec.glossary.filter((g) => filled(g.term)),
    requirements: spec.requirements.map((r) => ({
      ...r,
      title: filled(r.title) ? r.title : r.id,
      statement: filled(r.statement) ? r.statement : 'The system shall …',
      acceptance: r.acceptance.filter((c) => filled(c.given) && filled(c.when) && filled(c.then)),
    })),
  };
}

/* ------------------------------------------------------------------ trace */

export interface TraceRow {
  id: string;
  title: string;
  kind: SpecKind;
  status: RequirementStatus;
  lines: string;
  rules: string[];
  steps: string[];
  decisions: Array<{ id: string; open: boolean }>;
}

export function traceRows(spec: RequirementsSpec): TraceRow[] {
  const open = new Set(spec.decisions.filter(decisionOpen).map((d) => d.id));
  return spec.requirements.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    status: r.status,
    lines: linesText(r.source.lines),
    rules: r.source.rules,
    steps: r.source.steps,
    decisions: r.decisionIds.map((id) => ({ id, open: open.has(id) })),
  }));
}

/* ------------------------------------------------------------------ validation */

export const SPEC_LIMITS = {
  maxBodyChars: 900_000,
  requirements: 400,
  decisions: 300,
  interfaces: 300,
  stakeholders: 30,
  glossary: 80,
  acceptance: 8,
  lines: 40,
  refs: 30,
  options: 6,
  history: 100,
  title: 200,
  rich: RICH_TEXT_LIMIT,
  sectionRich: 20_000,
  short: 1_000,
  evidence: 1_000,
  question: 600,
  context: 2_000,
  change: 200,
} as const;

export type SpecValidation = { ok: true; value: RequirementsSpec } | { ok: false; field: string; error: string };

class Refusal extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function only(v: Record<string, unknown>, keys: readonly string[], field: string) {
  for (const k of Object.keys(v)) if (!keys.includes(k)) throw new Refusal(`${field}.${k}`, `Unknown field "${k}".`);
}

function str(v: unknown, field: string, max: number, opts: { rich?: boolean; allowEmpty?: boolean } = {}): string {
  if (typeof v !== 'string') throw new Refusal(field, 'Expected text.');
  if (v.length > max) throw new Refusal(field, `At most ${max} characters.`);
  const out = opts.rich ? normalizeRich(v, max) : v.replace(/\r\n?/g, '\n').trim();
  if (!opts.rich && /[\u0000-\u0008\u000B-\u001F\u007F]/.test(out)) throw new Refusal(field, 'Contains control characters.');
  if (!opts.allowEmpty && !out) throw new Refusal(field, 'Must not be empty.');
  return out;
}

function arr(v: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(v)) throw new Refusal(field, 'Expected a list.');
  if (v.length > max) throw new Refusal(field, `At most ${max} entries.`);
  return v;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], field: string): T {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) throw new Refusal(field, `One of: ${list.join(', ')}.`);
  return v as T;
}

const ID = /^[A-Z][A-Z0-9]{0,5}(?:-[A-Z0-9]{1,8}){1,3}$/;
const RULE_ID = /^BR-\d{1,4}$/;

function id(v: unknown, field: string): string {
  if (typeof v !== 'string' || !ID.test(v)) throw new Refusal(field, 'Not a valid id.');
  return v;
}

function lines(v: unknown, field: string): SpecLineRange[] {
  return arr(v, field, SPEC_LIMITS.lines).map((x, i) => {
    if (!isObj(x)) throw new Refusal(`${field}[${i}]`, 'Expected a line range.');
    only(x, ['s', 'e'], `${field}[${i}]`);
    const s = x.s;
    const e = x.e;
    if (!Number.isInteger(s) || !Number.isInteger(e) || (s as number) < 1 || (e as number) < (s as number) || (e as number) > 1_000_000) {
      throw new Refusal(`${field}[${i}]`, 'Not a valid line range.');
    }
    return { s: s as number, e: e as number };
  });
}

function strList(v: unknown, field: string, max: number, itemMax: number, pattern?: RegExp): string[] {
  return arr(v, field, max).map((x, i) => {
    const s = str(x, `${field}[${i}]`, itemMax);
    if (pattern && !pattern.test(s)) throw new Refusal(`${field}[${i}]`, 'Not a valid reference.');
    return s;
  });
}

const PRIORITIES: readonly RequirementPriority[] = ['must', 'should', 'could'];
const STATUSES: readonly RequirementStatus[] = ['draft', 'accepted', 'clarify', 'rejected'];
const INTERFACE_KINDS = ['table', 'function-module', 'transaction', 'report'] as const;
const LEVELS = ['A', 'B', 'C', 'D', 'custom', 'not-graded'] as const;
const ANSWER_KINDS: readonly DecisionAnswerKind[] = ['option', 'value', 'later'];

function requirement(v: unknown, field: string): SpecRequirement {
  if (!isObj(v)) throw new Refusal(field, 'Expected a requirement.');
  only(v, ['id', 'kind', 'category', 'title', 'statement', 'rationale', 'acceptance', 'priority', 'status', 'origin', 'target', 'method', 'note', 'source', 'decisionIds'], field);
  const kind = oneOf(v.kind, ['functional', 'non-functional'] as const, `${field}.kind`);
  const category = kind === 'non-functional' ? oneOf(v.category, SPEC_NFR_CATEGORIES, `${field}.category`) : null;
  if (kind === 'functional' && v.category !== null) throw new Refusal(`${field}.category`, 'A functional requirement has no category.');
  const src = v.source;
  if (!isObj(src)) throw new Refusal(`${field}.source`, 'Expected the source.');
  only(src, ['lines', 'rules', 'steps', 'engineRef', 'evidence'], `${field}.source`);
  const engineRef = src.engineRef === null ? null : id(src.engineRef, `${field}.source.engineRef`);
  return {
    id: id(v.id, `${field}.id`),
    kind,
    category,
    title: str(v.title, `${field}.title`, SPEC_LIMITS.title),
    statement: str(v.statement, `${field}.statement`, SPEC_LIMITS.rich, { rich: true }),
    rationale: str(v.rationale, `${field}.rationale`, SPEC_LIMITS.rich, { rich: true, allowEmpty: true }),
    acceptance: arr(v.acceptance, `${field}.acceptance`, SPEC_LIMITS.acceptance).map((c, i) => {
      const f = `${field}.acceptance[${i}]`;
      if (!isObj(c)) throw new Refusal(f, 'Expected Given / When / Then.');
      only(c, ['given', 'when', 'then'], f);
      return {
        given: str(c.given, `${f}.given`, SPEC_LIMITS.short),
        when: str(c.when, `${f}.when`, SPEC_LIMITS.short),
        then: str(c.then, `${f}.then`, SPEC_LIMITS.short),
      };
    }),
    priority: oneOf(v.priority, PRIORITIES, `${field}.priority`),
    status: (() => {
      if (!isRequirementStatus(v.status)) throw new Refusal(`${field}.status`, `One of: ${STATUSES.join(', ')}.`);
      return v.status;
    })(),
    origin: oneOf(v.origin, ['engine', 'person'] as const, `${field}.origin`),
    target: str(v.target, `${field}.target`, SPEC_LIMITS.short, { rich: true, allowEmpty: true }),
    method: str(v.method, `${field}.method`, SPEC_LIMITS.short, { rich: true, allowEmpty: true }),
    note: str(v.note, `${field}.note`, SPEC_LIMITS.rich, { rich: true, allowEmpty: true }),
    source: {
      lines: lines(src.lines, `${field}.source.lines`),
      rules: strList(src.rules, `${field}.source.rules`, SPEC_LIMITS.refs, 12, RULE_ID),
      steps: strList(src.steps, `${field}.source.steps`, SPEC_LIMITS.refs, 200),
      engineRef,
      evidence: str(src.evidence, `${field}.source.evidence`, SPEC_LIMITS.evidence, { allowEmpty: true }),
    },
    decisionIds: strList(v.decisionIds, `${field}.decisionIds`, SPEC_LIMITS.refs, 24, ID),
  };
}

function decision(v: unknown, field: string): SpecDecision {
  if (!isObj(v)) throw new Refusal(field, 'Expected a decision.');
  only(v, ['id', 'origin', 'owner', 'question', 'context', 'options', 'lines', 'affects', 'proposal', 'answer'], field);
  let answer: SpecDecisionAnswer | null = null;
  if (v.answer !== null) {
    if (!isObj(v.answer)) throw new Refusal(`${field}.answer`, 'Expected an answer or null.');
    // Who answered and when are the server's to write.
    only(v.answer, ['kind', 'value', 'by', 'at'], `${field}.answer`);
    const kind = oneOf(v.answer.kind, ANSWER_KINDS, `${field}.answer.kind`);
    const value = str(v.answer.value, `${field}.answer.value`, SPEC_LIMITS.short, { rich: true, allowEmpty: true });
    if (kind !== 'later' && !value) throw new Refusal(`${field}.answer.value`, 'An answer needs a value.');
    answer = { kind, value: kind === 'later' ? '' : value, by: null, at: null };
  }
  return {
    id: id(v.id, `${field}.id`),
    origin: oneOf(v.origin, DECISION_ORIGINS, `${field}.origin`),
    owner: oneOf(v.owner, DECISION_OWNERS, `${field}.owner`),
    question: str(v.question, `${field}.question`, SPEC_LIMITS.question),
    context: str(v.context, `${field}.context`, SPEC_LIMITS.context, { allowEmpty: true }),
    options: strList(v.options, `${field}.options`, SPEC_LIMITS.options, 200),
    lines: lines(v.lines, `${field}.lines`),
    affects: strList(v.affects, `${field}.affects`, 50, 24, ID),
    proposal: str(v.proposal, `${field}.proposal`, SPEC_LIMITS.short, { rich: true, allowEmpty: true }),
    answer,
  };
}

/** Every field of a specification a browser sent, checked; unknown keys refused. */
export function validateSpec(v: unknown): SpecValidation {
  try {
    if (!isObj(v)) throw new Refusal('spec', 'Expected the specification.');
    only(
      v,
      ['title', 'version', 'docStatus', 'program', 'purpose', 'scope', 'context', 'stakeholders', 'requirements', 'interfaces', 'interfacesNote', 'constraints', 'assumptions', 'decisions', 'glossary'],
      'spec',
    );
    const requirements = arr(v.requirements, 'spec.requirements', SPEC_LIMITS.requirements).map((r, i) => requirement(r, `spec.requirements[${i}]`));
    const decisions = arr(v.decisions, 'spec.decisions', SPEC_LIMITS.decisions).map((d, i) => decision(d, `spec.decisions[${i}]`));
    const seen = new Set<string>();
    for (const r of requirements) {
      if (seen.has(r.id)) throw new Refusal('spec.requirements', `The id ${r.id} appears twice.`);
      seen.add(r.id);
    }
    const seenD = new Set<string>();
    for (const d of decisions) {
      if (seenD.has(d.id)) throw new Refusal('spec.decisions', `The id ${d.id} appears twice.`);
      seenD.add(d.id);
    }
    const version = str(v.version, 'spec.version', 20);
    if (!/^[0-9A-Za-z.\- ]{1,20}$/.test(version)) throw new Refusal('spec.version', 'Letters, digits, dots and dashes only.');
    const value: RequirementsSpec = {
      title: str(v.title, 'spec.title', SPEC_LIMITS.title),
      version,
      docStatus: oneOf(v.docStatus, SPEC_DOC_STATUSES, 'spec.docStatus'),
      program: str(v.program, 'spec.program', 120),
      purpose: str(v.purpose, 'spec.purpose', SPEC_LIMITS.sectionRich, { rich: true, allowEmpty: true }),
      scope: str(v.scope, 'spec.scope', SPEC_LIMITS.sectionRich, { rich: true, allowEmpty: true }),
      context: str(v.context, 'spec.context', SPEC_LIMITS.sectionRich, { rich: true, allowEmpty: true }),
      stakeholders: arr(v.stakeholders, 'spec.stakeholders', SPEC_LIMITS.stakeholders).map((s, i) => {
        const f = `spec.stakeholders[${i}]`;
        if (!isObj(s)) throw new Refusal(f, 'Expected a stakeholder.');
        only(s, ['role', 'interest'], f);
        return { role: str(s.role, `${f}.role`, 120), interest: str(s.interest, `${f}.interest`, SPEC_LIMITS.short, { allowEmpty: true }) };
      }),
      requirements,
      interfaces: arr(v.interfaces, 'spec.interfaces', SPEC_LIMITS.interfaces).map((x, i) => {
        const f = `spec.interfaces[${i}]`;
        if (!isObj(x)) throw new Refusal(f, 'Expected an interface.');
        only(x, ['name', 'kind', 'use', 'level', 'lines'], f);
        const name = str(x.name, `${f}.name`, 80);
        if (!/^[A-Z0-9_/$-]{1,80}$/i.test(name)) throw new Refusal(`${f}.name`, 'Not an object name.');
        return {
          name,
          kind: oneOf(x.kind, INTERFACE_KINDS, `${f}.kind`),
          use: str(x.use, `${f}.use`, 60, { allowEmpty: true }),
          level: oneOf(x.level, LEVELS, `${f}.level`),
          lines: lines(x.lines, `${f}.lines`),
        };
      }),
      interfacesNote: str(v.interfacesNote, 'spec.interfacesNote', SPEC_LIMITS.sectionRich, { rich: true, allowEmpty: true }),
      constraints: str(v.constraints, 'spec.constraints', SPEC_LIMITS.sectionRich, { rich: true, allowEmpty: true }),
      assumptions: str(v.assumptions, 'spec.assumptions', SPEC_LIMITS.sectionRich, { rich: true, allowEmpty: true }),
      decisions,
      glossary: arr(v.glossary, 'spec.glossary', SPEC_LIMITS.glossary).map((g, i) => {
        const f = `spec.glossary[${i}]`;
        if (!isObj(g)) throw new Refusal(f, 'Expected a glossary entry.');
        only(g, ['term', 'meaning'], f);
        return { term: str(g.term, `${f}.term`, 120), meaning: str(g.meaning, `${f}.meaning`, SPEC_LIMITS.short, { allowEmpty: true }) };
      }),
    };
    return { ok: true, value };
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, field: err.field, error: err.message };
    return { ok: false, field: 'spec', error: 'Not a specification.' };
  }
}

export interface SpecPayload {
  spec: RequirementsSpec;
  baseRevision: number;
  derivedFrom: string;
  change: string;
}

/** The body of a save: `{ spec, baseRevision, derivedFrom, change }`, nothing else. */
export function validateSpecPayload(body: unknown): { ok: true; value: SpecPayload } | { ok: false; field: string; error: string } {
  if (!isObj(body)) return { ok: false, field: 'body', error: 'Expected { spec, baseRevision, derivedFrom, change }.' };
  for (const k of Object.keys(body)) {
    if (!['spec', 'baseRevision', 'derivedFrom', 'change'].includes(k)) return { ok: false, field: k, error: `Unknown field "${k}".` };
  }
  if (!Number.isInteger(body.baseRevision) || (body.baseRevision as number) < 0 || (body.baseRevision as number) > 1_000_000) {
    return { ok: false, field: 'baseRevision', error: 'Expected the revision the edit was made on.' };
  }
  if (typeof body.derivedFrom !== 'string' || !/^[0-9a-f]{64}$/.test(body.derivedFrom)) {
    return { ok: false, field: 'derivedFrom', error: 'Expected the SHA-256 of the source the content was read from.' };
  }
  if (typeof body.change !== 'string' || !body.change.trim() || body.change.length > SPEC_LIMITS.change) {
    return { ok: false, field: 'change', error: `Say in at most ${SPEC_LIMITS.change} characters what changed.` };
  }
  if (/[\u0000-\u001F\u007F]/.test(body.change)) return { ok: false, field: 'change', error: 'Contains control characters.' };
  const spec = validateSpec(body.spec);
  if (!spec.ok) return spec;
  return { ok: true, value: { spec: spec.value, baseRevision: body.baseRevision as number, derivedFrom: body.derivedFrom, change: body.change.trim() } };
}

/**
 * The answers the server stamps: an answer new or changed since the stored
 * document gets the account and the server's time; an unchanged one keeps
 * what was stored. Never the browser's.
 */
export function stampAnswers(next: RequirementsSpec, stored: RequirementsSpec | null, by: string, at: string): RequirementsSpec {
  const before = new Map((stored?.decisions ?? []).map((d) => [d.id, d.answer]));
  return {
    ...next,
    decisions: next.decisions.map((d) => {
      if (!d.answer) return d;
      const prev = before.get(d.id);
      if (prev && prev.kind === d.answer.kind && prev.value === d.answer.value) return { ...d, answer: { ...d.answer, by: prev.by, at: prev.at } };
      return { ...d, answer: { ...d.answer, by, at } };
    }),
  };
}

/** Appends a history entry, folding a run of saves by the same account with the same note into one. */
export function nextHistory(history: readonly SpecHistoryEntry[], entry: SpecHistoryEntry): SpecHistoryEntry[] {
  const last = history[history.length - 1];
  const sameRun = last && last.by === entry.by && last.change === entry.change && Date.parse(entry.at) - Date.parse(last.at) < 10 * 60 * 1000;
  const out = sameRun ? [...history.slice(0, -1), entry] : [...history, entry];
  return out.slice(-SPEC_LIMITS.history);
}

/** A stored record, read defensively: anything that does not validate reads as none. */
export function readSpecRecord(data: unknown): SpecRecord | null {
  if (!isObj(data) || data.formatVersion !== SPEC_FORMAT_VERSION) return null;
  const spec = validateSpec(data.spec);
  if (!spec.ok) return null;
  // Answers keep their stamps through the read (validation drops them for a browser's body).
  const storedDecisions = Array.isArray((data.spec as Record<string, unknown>).decisions)
    ? ((data.spec as Record<string, unknown>).decisions as Array<Record<string, unknown>>)
    : [];
  const stamps = new Map(storedDecisions.map((d) => [d?.id, isObj(d?.answer) ? d.answer : null]));
  const decisions = spec.value.decisions.map((d) => {
    const a = stamps.get(d.id);
    if (!d.answer || !a) return d;
    return { ...d, answer: { ...d.answer, by: typeof a.by === 'string' ? a.by : null, at: typeof a.at === 'string' ? a.at : null } };
  });
  const history = Array.isArray(data.history)
    ? (data.history as unknown[])
        .filter((h): h is SpecHistoryEntry => isObj(h) && Number.isInteger(h.revision) && typeof h.at === 'string' && typeof h.by === 'string' && typeof h.change === 'string')
        .map((h) => ({ revision: h.revision, at: h.at, by: h.by, change: h.change }))
    : [];
  if (typeof data.derivedFrom !== 'string' || !Number.isInteger(data.revision) || typeof data.savedAt !== 'string') return null;
  return {
    formatVersion: SPEC_FORMAT_VERSION,
    spec: { ...spec.value, decisions },
    derivedFrom: data.derivedFrom,
    revision: data.revision as number,
    savedAt: data.savedAt,
    savedBy: typeof data.savedBy === 'string' ? data.savedBy : 'The signed-in account',
    history,
  };
}
