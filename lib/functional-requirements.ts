import { buildProcessFacts } from '@/lib/abap/process-facts';
import {
  buildProcessSkeletonFrom,
  type ProcessSkeleton,
  type SkeletonEdge,
  type SkeletonNode,
} from '@/lib/abap/process-skeleton';
import { deriveBusinessRulesFrom, type BusinessRule } from '@/lib/abap/business-rule-set';
import { readTableDependencies } from '@/lib/abap/table-dependencies';
import {
  conditionToPhrase,
  humaniseField,
  humaniseRoutine,
  plainContext,
  plainLabels,
  ruleToSentence,
  type PlainContext,
  type PlainLabels,
} from '@/lib/abap/plain-language';
import { sha256Hex } from '@/lib/artefact-digest';

/**
 * Functional requirements, reconstructed from the code (owner
 * 03.10.2026: "much better content, visualised, clear texts, copyable for a
 * requirement specification").
 *
 * What the Design stage offered before was the model's non-functional prose:
 * eight paragraphs nobody could trace to a line. This module writes the
 * functional half out of the evidence the engine already has, and nothing else:
 *
 *   - one requirement per **business rule** `BR-nnn` that takes effect in the
 *     process (`lib/abap/business-rule-set.ts`), with what the code does on
 *     each side of it;
 *   - one per **decision point** the rules do not cover but that changes data
 *     or calls SAP on one side (`IF gv_err_count = 0` → commit or roll back);
 *   - one per **early end** — a stop with a message, a rejection, a step that
 *     ends — merged where the code says the same thing twice;
 *   - one per **step with an effect**: a table written, a BAPI or transaction
 *     called, a workflow started;
 *   - one per step that **hard-codes values** into what it builds, and one for
 *     the **selection screen**.
 *
 * Every requirement carries the line anchors it was made from, with the lines
 * quoted; an anchor that does not hold in the source drops the requirement
 * (`dropped`) instead of shipping it. The sentences are templates over engine
 * facts — "The system shall …", plain words from `plain-language.ts`, code
 * names verbatim. A model may later propose clearer wording
 * (`lib/requirement-wording.ts`); the requirement, its anchors, its priority
 * and its acceptance criteria stay the engine's.
 *
 * What the code cannot say — who owns an authorization, in which currency an
 * amount is, how many records a run handles — is listed apart as `open`, with
 * the line that raises the question where there is one. Never presented as
 * found.
 *
 * Pure: no model, no network, no clock, no catalog. The clean core level of an
 * object comes in from the caller (the findings route reads the catalog on the
 * server); without it the level is `null` and says "not graded".
 */

export const REQUIREMENT_FORMAT_VERSION = 1 as const;

export type RequirementPriority = 'must' | 'should' | 'could';

export const REQUIREMENT_PRIORITIES: readonly RequirementPriority[] = ['must', 'should', 'could'];

export const PRIORITY_LABEL: Readonly<Record<RequirementPriority, string>> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
};

export type RequirementBasisKind = 'rule' | 'decision' | 'exit' | 'effect' | 'fixed-values' | 'inputs';

export const BASIS_LABEL: Readonly<Record<RequirementBasisKind, string>> = {
  rule: 'Business rule',
  decision: 'Decision point',
  exit: 'Early end',
  effect: 'Process step',
  'fixed-values': 'Fixed values',
  inputs: 'Selection screen',
};

export interface RequirementAnchor {
  lineStart: number;
  lineEnd: number;
  /** The lines as the source writes them, each trimmed, at most four. */
  quote: string;
}

export type RequirementObjectKind = 'table' | 'function-module' | 'transaction' | 'report';

export interface RequirementObject {
  /** Upper-cased, as the source names it. */
  name: string;
  kind: RequirementObjectKind;
  use: 'read' | 'write' | 'reference' | 'call';
  /** SAP's clean core level for this use, when the caller had it. */
  level: 'A' | 'B' | 'C' | 'D' | null;
  /** A customer object (Z, Y or a namespace): it has no SAP level. */
  custom: boolean;
  line: number;
}

export interface AcceptanceCriterion {
  given: string;
  when: string;
  then: string;
}

export interface FunctionalRequirement {
  /** `FR-001`, in process order. Stable for one source. */
  id: string;
  /** One sentence, "The system shall …", in the engine's words. */
  statement: string;
  /** What in the code this requirement preserves. */
  rationale: string;
  basis: { kind: RequirementBasisKind; ref: string | null };
  /** The step it belongs to; `null` for a program-wide requirement. */
  stepId: string | null;
  /** Never empty — a requirement without an anchor in the source is dropped. */
  anchors: RequirementAnchor[];
  /** One to three. */
  acceptance: AcceptanceCriterion[];
  priority: RequirementPriority;
  priorityReason: string;
  objects: RequirementObject[];
  /** The requirement, its anchors and its priority are read out of the code. */
  provenance: 'reconstructed';
}

export interface RequirementStep {
  /** `S01` … in the order the process reaches them. */
  id: string;
  number: number;
  label: string;
  /** The FORM or event block, as the source writes it. */
  routine: string;
  anchor: { lineStart: number; lineEnd: number } | null;
  /** The process map element that opens this step, for a link into the map. */
  nodeId: string | null;
  objects: RequirementObject[];
  requirementIds: string[];
}

export type OpenTopic =
  | 'authorization'
  | 'currency'
  | 'unreached-rule'
  | 'unreached-code'
  | 'dynamic-call'
  | 'retention'
  | 'volume';

export interface OpenRequirement {
  /** `TBC-01` … */
  id: string;
  topic: OpenTopic;
  /** The question for the business, one sentence. */
  question: string;
  /** Why the code cannot answer it. */
  why: string;
  /** The lines that raise the question; empty when the code is silent. */
  anchors: RequirementAnchor[];
  provenance: 'not-determined';
}

export interface RequirementSet {
  formatVersion: typeof REQUIREMENT_FORMAT_VERSION;
  program: string | null;
  sourceSha256: string;
  lineCount: number;
  steps: RequirementStep[];
  requirements: FunctionalRequirement[];
  open: OpenRequirement[];
  /** Requirements that were built and not shipped, with why. */
  dropped: Array<{ ref: string; reason: string }>;
  counts: { total: number; must: number; should: number; could: number; open: number; steps: number };
}

/** What the caller knows about an object's level — an `ItFindingRow` fits. */
export interface ObjectLevelInput {
  objectName: string | null;
  level: string | null;
  lineStart: number;
}

export interface RequirementInput {
  source: string;
  levels?: readonly ObjectLevelInput[] | null;
}

/* ------------------------------------------------------------------ text */

/** Lower-cases the first letter unless the first word is an acronym or a code name. */
function lcFirst(text: string): string {
  if (!text) return text;
  if (/^[A-Z0-9_]{2,}\b/.test(text) || /^[A-Z][A-Z/]/.test(text)) return text;
  return text[0].toLowerCase() + text.slice(1);
}

function capFirst(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

const q = (name: string) => `“${name}”`;

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function lineRef(a: { lineStart: number; lineEnd: number }): string {
  return a.lineEnd > a.lineStart ? `L${a.lineStart}-${a.lineEnd}` : `L${a.lineStart}`;
}

/** `L12`, `L12-14`, as one comma list. Exported for the exports and the screen. */
export function anchorList(anchors: readonly { lineStart: number; lineEnd: number }[]): string {
  return anchors.map(lineRef).join(', ');
}

const NEUTRAL_PHRASES = new Set(['condition met', 'condition met?', '']);

/* --------------------------------------------------------------- anchors */

/** The lines of an anchor as an anchor quotes them: trimmed, at most four. Exported for the non-functional requirements. */
export function quoteOf(lines: readonly string[], start: number, end: number): string {
  const out: string[] = [];
  for (let at = start; at <= Math.min(end, start + 3); at++) out.push((lines[at - 1] ?? '').trim());
  return out.join('\n');
}

/**
 * Whether an anchor holds in this source: inside it, in order, and — when it
 * quotes — quoting exactly these lines. Exported for the wording check and the
 * specs; the server answers with the same function.
 */
export function anchorHolds(anchor: { lineStart: unknown; lineEnd: unknown; quote?: unknown }, lines: readonly string[]): boolean {
  const { lineStart, lineEnd } = anchor;
  if (!Number.isInteger(lineStart) || !Number.isInteger(lineEnd)) return false;
  const s = lineStart as number;
  const e = lineEnd as number;
  if (s < 1 || e < s || e > lines.length) return false;
  if (!lines.slice(s - 1, e).some((l) => l.trim() !== '')) return false;
  if (anchor.quote !== undefined && anchor.quote !== quoteOf(lines, s, e)) return false;
  return true;
}

export function sourceLines(source: string): string[] {
  return source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
}

/* --------------------------------------------------------------- builder */

const TASK_KINDS = new Set([
  'sub-process', 'service-task', 'send-task', 'user-task', 'write', 'read', 'transaction',
  'call-activity', 'call-opaque', 'output', 'business-rule-task', 'task',
]);

const MAX_REACH = 60;

function isCustom(name: string): boolean {
  return /^[ZY]/i.test(name) || name.startsWith('/');
}

function isCallSite(node: SkeletonNode): boolean {
  return Boolean(node.expandsTo) || node.detail?.collapsedFrom !== undefined || Array.isArray(node.detail?.effects);
}

function isEarlyEnd(node: SkeletonNode): boolean {
  return node.kind === 'end' && node.detail?.early === true;
}

interface Ctx {
  source: string;
  lines: string[];
  plain: PlainContext;
  labels: PlainLabels;
  skeleton: ProcessSkeleton;
  byId: Map<string, SkeletonNode>;
  outs: Map<string, SkeletonEdge[]>;
  ins: Map<string, SkeletonEdge[]>;
  stepOfRegion: Map<string, RequirementStep>;
  steps: RequirementStep[];
  stepOfLine: (line: number) => RequirementStep | null;
  objectsByStep: Map<string, RequirementObject[]>;
  /** Nodes a decision's requirement already names on one of its sides. */
  consumed: Set<string>;
}

function anchorOf(ctx: Ctx, range: { lineStart: number; lineEnd: number } | null | undefined): RequirementAnchor | null {
  if (!range) return null;
  return { lineStart: range.lineStart, lineEnd: range.lineEnd, quote: quoteOf(ctx.lines, range.lineStart, range.lineEnd) };
}

function distinctAnchors(anchors: Array<RequirementAnchor | null>): RequirementAnchor[] {
  const seen = new Set<string>();
  const out: RequirementAnchor[] = [];
  for (const a of anchors) {
    if (!a) continue;
    const key = `${a.lineStart}-${a.lineEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  // A range inside another one says nothing the wider one does not.
  const covered = (a: RequirementAnchor) =>
    out.some((b) => b !== a && b.lineStart <= a.lineStart && b.lineEnd >= a.lineEnd && b.lineEnd - b.lineStart > a.lineEnd - a.lineStart);
  return out.filter((a) => !covered(a)).sort((a, b) => a.lineStart - b.lineStart).slice(0, 8);
}

/** "run “A” and end “B”" → "runs “A” and ends “B”", for a "then the system …". */
function thirdPerson(phrase: string): string {
  return phrase.replace(/^(run|end|stop|reject)\b/, '$1s').replace(/ and (run|end|stop)\b/g, ' and $1s');
}

function nodeLabel(ctx: Ctx, node: SkeletonNode): string {
  return ctx.labels.nodes.get(node.id) || humaniseRoutine(node.label) || node.label;
}

/** The step a node belongs to, through loop regions up to their FORM or event. */
function stepOfNode(ctx: Ctx, node: SkeletonNode): RequirementStep | null {
  return ctx.stepOfRegion.get(node.region) ?? null;
}

/** Every node reached from `start`, breadth first, loop-backs left out. */
function reach(ctx: Ctx, start: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length && out.length < MAX_REACH) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const e of ctx.outs.get(id) ?? []) if (e.kind !== 'loop-back') queue.push(e.to);
  }
  return out;
}

interface Arm {
  edge: SkeletonEdge;
  nodes: SkeletonNode[];
}

/** The arms of a decision, each with the nodes it runs before the paths meet again. */
function armsOf(ctx: Ctx, gatewayId: string): Arm[] | null {
  const outs = (ctx.outs.get(gatewayId) ?? []).filter((e) => e.kind !== 'boundary' && e.kind !== 'loop-back');
  if (outs.length < 2) return null;
  const reaches = outs.map((e) => reach(ctx, e.to));
  const sets = reaches.map((r) => new Set(r));
  const join = reaches[0].find((id) => sets.every((s) => s.has(id))) ?? null;
  return outs.map((edge, i) => {
    const until = join ? reaches[i].indexOf(join) : -1;
    const ids = until >= 0 ? reaches[i].slice(0, until) : reaches[i];
    const nodes = ids
      .map((id) => ctx.byId.get(id))
      .filter((n): n is SkeletonNode => !!n && !(n.kind === 'output' && n.detail?.target === 'list') && (TASK_KINDS.has(n.kind) || n.kind === 'end-error' || isEarlyEnd(n)));
    return { edge, nodes };
  });
}

/** "run “A” and “B”, then stop with message E002". `null` when the arm does nothing named. */
function armPhrase(ctx: Ctx, arm: Arm, step: RequirementStep | null): string | null {
  const runs: string[] = [];
  let ending: string | null = null;
  for (const n of arm.nodes) {
    if (n.kind === 'end-error') {
      ending = /^[A-Z]\d{3}$/.test(n.label) ? `stop with message ${n.label}` : 'stop the process';
      break;
    }
    if (isEarlyEnd(n)) {
      ending = step ? `end ${q(step.label)}` : 'end this step';
      break;
    }
    const label = nodeLabel(ctx, n);
    if (label && !runs.includes(q(label))) runs.push(q(label));
  }
  const shown = runs.length > 3 ? [...runs.slice(0, 3), `${runs.length - 3} more steps`] : runs;
  const parts: string[] = [];
  if (shown.length) parts.push(`run ${joinAnd(shown)}`);
  if (ending) parts.push(ending);
  return parts.length ? parts.join(' and ') : null;
}

function armIsStrong(arm: Arm): boolean {
  return arm.nodes.some((n) =>
    n.kind === 'write' || n.kind === 'transaction' || n.kind === 'send-task' || n.kind === 'sub-process' ||
    (n.kind === 'service-task' && (n.detail?.bapi === true || isCallSite(n))) || (isCallSite(n) && TASK_KINDS.has(n.kind)),
  );
}

const normaliseCond = (c: string) => c.replace(/\s+/g, ' ').trim().toLowerCase();

function conditionPhrase(ctx: Ctx, condition: string, line?: number): string | null {
  const phrase = conditionToPhrase(condition, ctx.plain, line).trim();
  return NEUTRAL_PHRASES.has(phrase.toLowerCase()) ? null : phrase;
}

/** The objects of a step, and of the steps an arm opens. */
function objectsFor(ctx: Ctx, steps: Array<RequirementStep | null>): RequirementObject[] {
  const seen = new Set<string>();
  const out: RequirementObject[] = [];
  for (const step of steps) {
    if (!step) continue;
    for (const o of ctx.objectsByStep.get(step.id) ?? []) {
      const key = `${o.name}|${o.use}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
  }
  return out.slice(0, 12);
}

type Draft = Omit<FunctionalRequirement, 'id' | 'provenance'>;

/* ---- rules */

/** The parameter that is tested — not the `CONSTANTS` line that declares its value. */
function testedParameter(rule: BusinessRule) {
  return rule.parameters.find((p) => p.origin !== 'constant') ?? rule.parameters[0];
}

function ruleCondition(ctx: Ctx, rule: BusinessRule): string {
  const first = testedParameter(rule);
  if (!first) return rule.label;
  if (first.origin === 'when') {
    const values = [...new Set(rule.parameters.flatMap((p) => p.values))];
    const subject = first.subject ? humaniseField(first.subject, ctx.plain) : 'the value';
    return `${lcFirst(subject)} is ${values.map((v) => `'${v}'`).join(' or ')}`;
  }
  const phrase = ruleToSentence({ condition: first.conditionText }, ctx.plain).trim();
  if (NEUTRAL_PHRASES.has(phrase.toLowerCase()) || phrase.length < 3) return `the code condition ${first.conditionText} holds`;
  return lcFirst(phrase);
}

const STRICT_OPS: Record<string, 'strict' | 'inclusive'> = {
  '>': 'strict', GT: 'strict', '<': 'strict', LT: 'strict',
  '>=': 'inclusive', GE: 'inclusive', '<=': 'inclusive', LE: 'inclusive',
};

function boundaryCriterion(ctx: Ctx, rule: BusinessRule, when: string): AcceptanceCriterion | null {
  const p = rule.parameters.find((x) => STRICT_OPS[x.operator.toUpperCase()] && x.values.length === 1 && /^-?\d+(?:\.\d+)?$/.test(x.values[0]));
  if (!p) return null;
  const subject = p.subject ? lcFirst(humaniseField(p.subject, ctx.plain)) : 'the value';
  const kind = STRICT_OPS[p.operator.toUpperCase()];
  const unit = p.caveat ? ' (the code does not state the currency or unit)' : '';
  return {
    given: `${subject} is exactly ${p.values[0]}${unit}`,
    when,
    then: kind === 'strict'
      ? `the rule does not apply — the code tests ${p.conditionText}`
      : `the rule applies — the code tests ${p.conditionText}`,
  };
}

function ruleDraft(ctx: Ctx, rule: BusinessRule): Draft | null {
  const anchors = distinctAnchors([
    ...rule.sentences.flatMap((s) => s.anchors.map((a) => anchorOf(ctx, a))),
    ...rule.typeBasis.flatMap((b) => b.anchors.map((a) => anchorOf(ctx, a))),
  ]);
  const firstLine = anchors[0] ? lineRef(anchors[0]) : '';

  if (rule.withoutProcessElement?.reason === 'declaration-only') {
    const p = rule.parameters[0];
    const name = p?.subject ?? rule.label.split(/\s+/)[0];
    const plain = ruleToSentence({ constant: { name, value: p?.literal ?? '' } }, ctx.plain).trim();
    const only = /^Only (.+) is processed$/.exec(plain);
    const statement = only
      ? `The system shall process only ${only[1]}.`
      : `The system shall keep the fixed value ${p?.literal ?? ''} for ${lcFirst(humaniseField(name, ctx.plain))}.`;
    return {
      statement,
      rationale: `Preserves ${rule.id}, the constant ${rule.label} declared at ${firstLine}.`,
      basis: { kind: 'rule', ref: rule.id },
      stepId: null,
      anchors,
      acceptance: [
        {
          given: `a record with another ${only ? only[1].replace(/\s+\S+$/, '') : lcFirst(humaniseField(name, ctx.plain))} than ${p?.literal ?? 'this value'}`,
          when: 'the program runs',
          then: `the record is not processed (to be confirmed: the code declares ${p?.literal ?? 'the value'} but no decision point tests it directly)`,
        },
      ],
      priority: 'should',
      priorityReason: `A value hard-coded in the program (${firstLine}); no decision point tests it directly, so where it takes effect is to be confirmed.`,
      objects: [],
    };
  }

  const routine = rule.sources[0]?.routine ?? null;
  const gateway = rule.processElements.find((e) => e.relation === 'condition');
  const stepFromRegion = gateway ? ctx.stepOfRegion.get(gateway.region) ?? null : null;
  const step = stepFromRegion
    ?? (routine ? ctx.steps.find((s) => s.routine.toUpperCase() === routine) ?? null : null)
    ?? (anchors[0] ? ctx.stepOfLine(anchors[0].lineStart) : null);
  const cond = ruleCondition(ctx, rule);
  const isControl = rule.type === 'control';

  let whenPhrase: string | null = null;
  let otherwise: string | null = null;
  const opened: Array<RequirementStep | null> = [step];
  const arms = gateway ? armsOf(ctx, gateway.nodeId) : null;
  if (arms) {
    const target = normaliseCond(testedParameter(rule)?.conditionText ?? '');
    const holds = arms.find((a) => a.edge.condition && target && normaliseCond(a.edge.condition).includes(target))
      ?? arms.find((a) => a.edge.condition) ?? arms[0];
    whenPhrase = armPhrase(ctx, holds, step);
    if (arms.length === 2) {
      const other = arms.find((a) => a !== holds)!;
      otherwise = armPhrase(ctx, other, step);
    }
    for (const a of arms) for (const n of a.nodes) {
      ctx.consumed.add(n.id);
      if (n.expandsTo) opened.push(ctx.stepOfRegion.get(n.expandsTo) ?? null);
    }
  } else {
    const branch = rule.processElements.filter((e) => e.relation === 'branch');
    const names = [...new Set(branch.map((e) => {
      const n = ctx.byId.get(e.nodeId);
      return n ? q(nodeLabel(ctx, n)) : q(e.label);
    }))];
    if (names.length) whenPhrase = `run ${joinAnd(names.slice(0, 3))}`;
  }
  if (isControl && whenPhrase && step && !/\bend\b|\bstop\b/.test(whenPhrase)) whenPhrase = `${whenPhrase} and end ${q(step.label)}`;

  const where = step ? q(step.label) : 'this step';
  let statement: string;
  if (whenPhrase) {
    statement = `The system shall ${whenPhrase} when ${cond}${otherwise ? `; otherwise it shall ${otherwise}` : ''}.`;
  } else if (isControl) {
    statement = `The system shall end ${where} when ${cond}.`;
  } else {
    statement = `The system shall handle the case where ${cond} separately in ${where}.`;
  }

  const when = `${where} runs`;
  const acceptance: AcceptanceCriterion[] = [
    { given: capFirst(cond), when, then: `the system ${whenPhrase ? thirdPerson(whenPhrase) : isControl ? `ends ${where}` : 'takes the path the code writes for this case'}` },
    {
      given: `the condition does not hold`,
      when,
      then: otherwise
        ? `the system ${thirdPerson(otherwise)}`
        : 'the system does not take this path',
    },
  ];
  const boundary = boundaryCriterion(ctx, rule, when);
  if (boundary) acceptance.push(boundary);

  const basisLine = rule.typeBasis.flatMap((b) => b.anchors)[0];
  return {
    statement,
    rationale: `Preserves ${rule.id}, a hard-coded ${isControl ? 'control' : 'rule'}${routine ? ` in ${routine}` : ''}: ${rule.label} (${firstLine}).`,
    basis: { kind: 'rule', ref: rule.id },
    stepId: step?.id ?? null,
    anchors,
    acceptance,
    priority: 'must',
    priorityReason: isControl
      ? `A hard-coded control: the code ends the flow when it holds (${basisLine ? lineRef(basisLine) : firstLine}).`
      : `A hard-coded business rule decides the path (${firstLine}).`,
    objects: objectsFor(ctx, opened),
  };
}

/* ---- decisions the rules do not cover */

function decisionDrafts(ctx: Ctx, coveredGateways: Set<string>): Draft[] {
  const out: Draft[] = [];
  for (const node of ctx.skeleton.nodes) {
    if (node.kind !== 'gateway' || coveredGateways.has(node.id) || !node.anchor) continue;
    const step = stepOfNode(ctx, node);
    if (!step) continue;
    const arms = armsOf(ctx, node.id);
    if (!arms || arms.length !== 2 || !arms.some(armIsStrong)) continue;
    // An arm that ends the step is an early end, and the early end is its own
    // requirement with this decision among its anchors.
    if (arms.some((a) => a.nodes.some((n) => n.kind === 'end-error' || isEarlyEnd(n)))) continue;
    const conditional = arms.find((a) => a.edge.condition) ?? null;
    if (!conditional) continue;
    const cond = conditionPhrase(ctx, conditional.edge.condition, node.anchor.lineStart);
    if (!cond) continue;
    const other = arms.find((a) => a !== conditional)!;
    const yes = armPhrase(ctx, conditional, step);
    const no = armPhrase(ctx, other, step);
    if (!yes && !no) continue;
    const condLc = lcFirst(cond);
    for (const a of arms) for (const n of a.nodes) ctx.consumed.add(n.id);
    const statement = yes
      ? `The system shall ${yes} when ${condLc}${no ? `; otherwise it shall ${no}` : ''}.`
      : `The system shall ${no} unless ${condLc}.`;
    const anchors = distinctAnchors([
      anchorOf(ctx, node.anchor),
      ...[...conditional.nodes, ...other.nodes].slice(0, 4).map((n) => anchorOf(ctx, n.anchor)),
    ]);
    const changes = arms.some((a) => a.nodes.some((n) => n.kind === 'write' || n.kind === 'transaction' || n.detail?.bapi === true || n.kind === 'end-error'));
    const when = `${q(step.label)} runs`;
    const opened = [step, ...arms.flatMap((a) => a.nodes).map((n) => (n.expandsTo ? ctx.stepOfRegion.get(n.expandsTo) ?? null : null))];
    out.push({
      statement,
      rationale: `Preserves the decision point at ${lineRef(node.anchor)}: ${conditional.edge.condition}.`,
      basis: { kind: 'decision', ref: node.id },
      stepId: step.id,
      anchors,
      acceptance: [
        { given: capFirst(condLc), when, then: yes ? `the system ${thirdPerson(yes)}` : `the system does not ${no}` },
        { given: 'the condition does not hold', when, then: no ? `the system ${thirdPerson(no)}` : 'the system does not take this path' },
      ],
      priority: changes ? 'must' : 'should',
      priorityReason: changes
        ? `The code decides here between paths that change data or stop the process (${lineRef(node.anchor)}).`
        : `The code decides here which steps run (${lineRef(node.anchor)}).`,
      objects: objectsFor(ctx, opened),
    });
  }
  return out;
}

/* ---- early ends */

const OUTCOME = /^(Stop|Stopped|Rejected)(?::\s*(.+?))?(?:\s*\(([A-Z0-9]+)\))?$/;

function exitDrafts(ctx: Ctx, coveredLines: Set<number>): Draft[] {
  const groups = new Map<string, { nodes: SkeletonNode[]; outcome: string }>();
  for (const node of ctx.skeleton.nodes) {
    if (!(node.kind === 'end-error' || isEarlyEnd(node)) || !node.anchor) continue;
    if (!stepOfNode(ctx, node)) continue;
    if (coveredLines.has(node.anchor.lineStart)) continue;
    const outcome = nodeLabel(ctx, node);
    const key = `${node.kind}|${outcome}`;
    const g = groups.get(key) ?? { nodes: [], outcome };
    g.nodes.push(node);
    groups.set(key, g);
  }
  const out: Draft[] = [];
  for (const { nodes, outcome } of groups.values()) {
    const first = nodes[0];
    const step = stepOfNode(ctx, first)!;
    const m = OUTCOME.exec(outcome);
    if (!m) continue;
    const [, kind, reason, code] = m;
    if (!reason) continue;
    const reasonLc = lcFirst(reason);
    const where = q(step.label);
    let statement: string;
    let then: string;
    let priority: RequirementPriority = 'must';
    let priorityReason: string;
    const lines = anchorList(nodes.map((n) => n.anchor!));
    if (kind === 'Stop') {
      statement = code
        ? `The system shall stop the process with message ${code} when ${reasonLc}.`
        : `The system shall stop the process when ${reasonLc}.`;
      then = `the process stops${code ? ` with message ${code}` : ''} and no later step runs`;
      priorityReason = `The code stops the process with an error message (${lines}).`;
    } else if (kind === 'Rejected') {
      statement = `The system shall reject the case and end ${where} when ${reasonLc}.`;
      then = `the case is rejected and ${where} ends`;
      priorityReason = `The code rejects the case here (${lines}).`;
    } else {
      statement = `The system shall end ${where} when ${reasonLc}.`;
      then = `${where} ends at this point`;
      priority = 'should';
      priorityReason = `The code ends this step early, without a message (${lines}).`;
    }
    // The decision that leads to the end, when one stands right before it.
    const gateways: Array<RequirementAnchor | null> = [];
    for (const n of nodes) {
      let at: string | undefined = n.id;
      for (let hop = 0; hop < 4 && at; hop++) {
        const incoming: SkeletonEdge[] = ctx.ins.get(at) ?? [];
        const from: SkeletonNode | undefined = incoming.length === 1 ? ctx.byId.get(incoming[0].from) : undefined;
        if (!from) break;
        if (from.kind === 'gateway') {
          gateways.push(anchorOf(ctx, from.anchor));
          break;
        }
        at = from.id;
      }
    }
    out.push({
      statement,
      rationale: `Preserves the early end${nodes.length > 1 ? 's' : ''} at ${lines}: ${outcome}.`,
      basis: { kind: 'exit', ref: first.id },
      stepId: step.id,
      anchors: distinctAnchors([...gateways, ...nodes.map((n) => anchorOf(ctx, n.anchor))]),
      acceptance: [{ given: capFirst(reasonLc), when: `${where} runs`, then }],
      priority,
      priorityReason,
      objects: objectsFor(ctx, [step]),
    });
  }
  return out;
}

/* ---- effects */

const PHRASAL = new Set(['back', 'up', 'out', 'off', 'down']);

function withArticle(phrase: string): string {
  const words = phrase.split(' ');
  if (words.length < 2) return phrase;
  if (PHRASAL.has(words[1]) || /^(the|a|an)$/.test(words[1])) return phrase;
  if (words[1] === 'entry') return [words[0], 'an', ...words.slice(1)].join(' ');
  if (/^[A-Z0-9_]{2,}/.test(words[1])) return phrase;
  return [words[0], 'the', ...words.slice(1)].join(' ');
}

function effectPhrase(ctx: Ctx, node: SkeletonNode): string {
  const label = lcFirst(nodeLabel(ctx, node));
  const name = node.label.toUpperCase();
  let phrase = withArticle(label);
  if (node.kind === 'transaction') {
    phrase += ` through transaction ${name}${node.detail?.batchInput === true ? ' (batch input)' : ''}`;
  } else if (!label.toUpperCase().includes(name)) {
    phrase += ` (${name})`;
  }
  return phrase;
}

function isEffect(node: SkeletonNode): boolean {
  if (isCallSite(node)) return false;
  if (node.kind === 'write' || node.kind === 'transaction' || node.kind === 'send-task' || node.kind === 'call-activity') return true;
  if (node.kind === 'service-task') return node.detail?.bapi === true;
  if (node.kind === 'output') return node.detail?.bapi !== undefined && node.detail?.dynamic !== true;
  return false;
}

function effectDrafts(ctx: Ctx): Draft[] {
  const byStep = new Map<string, SkeletonNode[]>();
  const listSteps = new Map<string, SkeletonNode>();
  for (const node of ctx.skeleton.nodes) {
    const step = stepOfNode(ctx, node);
    if (!step || !node.anchor) continue;
    if (isEffect(node) && !ctx.consumed.has(node.id)) {
      const list = byStep.get(step.id) ?? [];
      list.push(node);
      byStep.set(step.id, list);
    } else if (node.kind === 'output' && node.detail?.target === 'list' && !isCallSite(node) && !listSteps.has(step.id)) {
      listSteps.set(step.id, node);
    }
  }
  const out: Draft[] = [];
  for (const step of ctx.steps) {
    const nodes = byStep.get(step.id);
    const where = q(step.label);
    const when = `${where} runs`;
    const given = 'the steps before it have completed';
    if (!nodes?.length) {
      const list = listSteps.get(step.id);
      if (list && step.label.toLowerCase().includes('list')) {
        out.push({
          statement: `The system shall show the result of the run as a list (${where}).`,
          rationale: `Preserves the list output of ${step.routine} (${lineRef(list.anchor!)}).`,
          basis: { kind: 'effect', ref: step.routine },
          stepId: step.id,
          anchors: distinctAnchors([anchorOf(ctx, list.anchor)]),
          acceptance: [{ given, when, then: `the system writes the result list (${lineRef(list.anchor!)})` }],
          priority: 'could',
          priorityReason: 'Shows a result list; nothing is changed.',
          objects: [],
        });
      }
      continue;
    }
    const phrases = [...new Set(nodes.map((n) => effectPhrase(ctx, n)))];
    const changes = nodes.filter((n) => n.kind === 'write' || n.kind === 'transaction' || n.detail?.bapi === true || n.kind === 'call-activity');
    const names = [...new Set(changes.map((n) => n.label.toUpperCase()))];
    const lines = anchorList(changes.length ? changes.map((n) => n.anchor!) : nodes.map((n) => n.anchor!));
    const shown = phrases.length > 4 ? [...phrases.slice(0, 4), `${phrases.length - 4} more actions`] : phrases;
    const effectNames = new Set(nodes.map((n) => n.label.toUpperCase()));
    out.push({
      statement: `The system shall ${joinAnd(shown)}.`,
      rationale: `Preserves what ${step.routine} does: ${nodes.map((n) => `${n.label.toUpperCase()} (${lineRef(n.anchor!)})`).slice(0, 5).join(', ')}.`,
      basis: { kind: 'effect', ref: step.routine },
      stepId: step.id,
      anchors: distinctAnchors(nodes.map((n) => anchorOf(ctx, n.anchor))),
      acceptance: [{
        given,
        when,
        then: `the system ${joinAnd(nodes.slice(0, 3).map((n) => {
          const p = effectPhrase(ctx, n).replace(/^(\w+)/, (v) => (v.endsWith('s') ? v : `${v}s`));
          return `${p} (${lineRef(n.anchor!)})`;
        }))}`,
      }],
      priority: changes.length ? 'must' : 'should',
      priorityReason: changes.length
        ? `Changes data or calls SAP: ${names.join(', ')} (${lines}).`
        : `Starts a workflow, sends or exchanges a file; no data of the process is changed here (${lines}).`,
      objects: (ctx.objectsByStep.get(step.id) ?? []).filter((o) => effectNames.has(o.name) || o.use === 'write').slice(0, 12),
    });
  }
  return out;
}

/* ---- fixed values and inputs */

const ASSIGNMENT = /^([a-z_][\w/]*(?:-[\w/]+)*)\s*=\s*('(?:[^']|'')*'|-?\d+(?:\.\d+)?)$/i;
const TEXT_TARGET = /^(?:[gl][vs]_)?(message|msg|text|txt|element|name|title|descr|description|program|dynpro|fnam|fval|dynbegin)$/i;
const TECHNICAL_TARGET = /(count|cnt|idx|index|tabix|subrc|flag|lines|len|tabix|^sy-|^lv_rc|^rc$)/i;

function fixedValueDrafts(ctx: Ctx): Draft[] {
  const byStep = new Map<string, Array<{ target: string; literal: string; line: number; endLine: number }>>();
  for (const st of ctx.plain.statements) {
    const m = ASSIGNMENT.exec(st.text.trim());
    if (!m) continue;
    const [, target, literal] = m;
    const value = literal.replace(/^'|'$/g, '');
    if (!value.trim() || value === 'X' || literal === '0' || literal === '1' || TECHNICAL_TARGET.test(target)) continue;
    // Texts, screen fields and container names are not values a business decides on.
    if (/\s/.test(value) || value.length > 20 || TEXT_TARGET.test(target.split('-').pop() ?? target)) continue;
    const step = ctx.stepOfLine(st.line);
    if (!step) continue;
    const list = byStep.get(step.id) ?? [];
    // A BAPI's X-structure repeats the key it flags (`ls_itemx-po_item = '00010'`).
    const field = (target.split('-').pop() ?? target).toLowerCase();
    if (list.some((v) => (v.target.split('-').pop() ?? v.target).toLowerCase() === field && v.literal === literal)) continue;
    list.push({ target, literal, line: st.line, endLine: st.endLine });
    byStep.set(step.id, list);
  }
  const out: Draft[] = [];
  for (const step of ctx.steps) {
    const values = byStep.get(step.id);
    if (!values?.length) continue;
    const items = values.map((v) => `${lcFirst(humaniseField(v.target, ctx.plain))} ${v.literal}`);
    const shown = items.length > 6 ? [...items.slice(0, 6), `${items.length - 6} more`] : items;
    const range = { lineStart: values[0].line, lineEnd: values[values.length - 1].endLine };
    out.push({
      statement: `The system shall use these fixed values in ${q(step.label)}: ${joinAnd(shown)}.`,
      rationale: `Preserves the values ${step.routine} assigns as literals (${lineRef(range)}).`,
      basis: { kind: 'fixed-values', ref: step.routine },
      stepId: step.id,
      anchors: distinctAnchors(values.map((v) => anchorOf(ctx, { lineStart: v.line, lineEnd: v.endLine }))),
      acceptance: [{
        given: 'any run',
        when: `${q(step.label)} runs`,
        then: values.slice(0, 3).map((v) => `${v.target} is ${v.literal} (L${v.line})`).join('; '),
      }],
      priority: 'should',
      priorityReason: `Values hard-coded in the program (${lineRef(range)}); whether they stay fixed or move into configuration is a business decision.`,
      objects: [],
    });
  }
  return out;
}

function inputsDraft(ctx: Ctx): Draft | null {
  const fields: Array<{ name: string; plain: string; required: boolean; line: number }> = [];
  const seen = new Set<string>();
  for (const st of ctx.plain.statements) {
    const m = /^(PARAMETERS|PARAMETER|SELECT-OPTIONS)\b\s*:?\s*([\s\S]*)$/i.exec(st.text);
    if (!m) continue;
    for (const part of m[2].split(',')) {
      const name = part.trim().split(/\s+/)[0]?.toLowerCase().replace(/\(\d+\)$/, '');
      if (!name || seen.has(name) || !ctx.plain.selections.has(name)) continue;
      seen.add(name);
      let line = st.line;
      const pattern = new RegExp(`(^|[\\s:,])${name.replace(/[^\w/]/g, '')}(?![\\w/])`, 'i');
      for (let at = st.line; at <= st.endLine; at++) {
        if (pattern.test(ctx.lines[at - 1] ?? '')) { line = at; break; }
      }
      fields.push({ name, plain: humaniseField(name, ctx.plain), required: /\bOBLIGATORY\b/i.test(part), line });
    }
  }
  if (!fields.length) return null;
  const items = fields.map((f) => `${lcFirst(f.plain)} (${f.name.toUpperCase()}${f.required ? ', required' : ''})`);
  return {
    statement: `The system shall let the user enter ${joinAnd(items)} before a run.`,
    rationale: `Preserves the selection screen (${anchorList(fields.map((f) => ({ lineStart: f.line, lineEnd: f.line })))}).`,
    basis: { kind: 'inputs', ref: null },
    stepId: null,
    anchors: distinctAnchors(fields.map((f) => anchorOf(ctx, { lineStart: f.line, lineEnd: f.line }))),
    acceptance: [{
      given: 'the selection screen',
      when: 'the user starts the program',
      then: fields.some((f) => f.required)
        ? `the run does not start without ${joinAnd(fields.filter((f) => f.required).map((f) => lcFirst(f.plain)))}`
        : `the user can enter ${joinAnd(fields.slice(0, 3).map((f) => lcFirst(f.plain)))}`,
    }],
    priority: 'should',
    priorityReason: 'The inputs the program asks for; whether the target keeps them is a design decision.',
    objects: [],
  };
}

/* ---- open questions */

function openItems(ctx: Ctx, rules: BusinessRule[], unreachable: string[], formRanges: Map<string, { lineStart: number; lineEnd: number }>, facts: ReturnType<typeof buildProcessFacts>, objects: RequirementObject[]): Array<Omit<OpenRequirement, 'id' | 'provenance'>> {
  const out: Array<Omit<OpenRequirement, 'id' | 'provenance'>> = [];
  for (const check of facts.calls.authorityChecks) {
    out.push({
      topic: 'authorization',
      question: check.object
        ? `Who owns authorization object ${check.object}, and which roles may pass the check?`
        : 'Which authorization object does the dynamic check test, and who owns it?',
      why: `The code checks ${check.object ?? 'an authorization'} at L${check.lineStart}; it does not say who is allowed.`,
      anchors: distinctAnchors([anchorOf(ctx, check)]),
    });
  }
  if (!facts.calls.authorityChecks.length) {
    out.push({
      topic: 'authorization',
      question: 'Who may run this process, and which role grants it?',
      why: 'The code contains no authorization check, so it says nothing about who may run it.',
      anchors: [],
    });
  }
  for (const rule of rules) {
    const caveat = rule.parameters.find((p) => p.caveat);
    if (caveat && !rule.withoutProcessElement) {
      out.push({
        topic: 'currency',
        question: `${capFirst(caveat.caveat!.replace(/^the code does not state /i, 'what is ').replace(/\.$/, ''))} in ${rule.id} (${caveat.literal})?`,
        why: `The code compares with ${caveat.literal} and does not state ${caveat.caveat!.replace(/^the code does not state /i, '').replace(/\.$/, '')}.`,
        anchors: distinctAnchors([anchorOf(ctx, caveat)]),
      });
    }
    if (rule.withoutProcessElement?.reason === 'unreached') {
      const routine = rule.sources[0]?.routine;
      out.push({
        topic: 'unreached-rule',
        question: `Is ${rule.id} (${rule.label}) still a requirement?`,
        why: `It stands in ${routine ?? 'a routine'}, which no entry point of the program reaches.`,
        anchors: distinctAnchors(rule.sentences.flatMap((s) => s.anchors.map((a) => anchorOf(ctx, a)))).slice(0, 3),
      });
    }
  }
  if (unreachable.length) {
    // Two different facts, kept apart (review of ZMM_BESTELLUEBERSICHT,
    // 06.10.2026): a routine nothing performs or registers is dead where it
    // stands; one performed only from such a routine is dead because its
    // caller is. Saying "the program never calls" of both counted BDC helpers
    // that the program plainly performs.
    const neverPerformed = new Set(facts.calls.neverPerformed.map((n) => n.toUpperCase()));
    const never = unreachable.filter((n) => neverPerformed.has(n));
    const onlyFrom = unreachable.filter((n) => !neverPerformed.has(n));
    const listed = (names: string[]) => `${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''}`;
    const parts = [
      never.length ? `${listed(never)} — never performed` : '',
      onlyFrom.length ? `${listed(onlyFrom)} — performed only from ${never.length ? 'those' : 'routines no entry point reaches'}` : '',
    ].filter(Boolean);
    out.push({
      topic: 'unreached-code',
      question: `Are any of the ${unreachable.length} routine${unreachable.length === 1 ? '' : 's'} no entry point reaches still needed (${parts.join('; ')})?`,
      why: 'No entry point reaches them — no PERFORM, event or callback registration leads there — so they describe no current behaviour.',
      anchors: distinctAnchors(unreachable.slice(0, 6).map((name) => {
        const r = formRanges.get(name);
        return r ? anchorOf(ctx, { lineStart: r.lineStart, lineEnd: r.lineStart }) : null;
      })),
    });
  }
  for (const call of facts.calls.functionModules) {
    if (!call.dynamic) continue;
    const step = ctx.stepOfLine(call.lineStart);
    out.push({
      topic: 'dynamic-call',
      question: `Which function module does ${step ? q(step.label) : 'the program'} call at L${call.lineStart}?`,
      why: 'The name is computed at run time; the code does not state it.',
      anchors: distinctAnchors([anchorOf(ctx, call)]),
    });
  }
  const customWrites = objects.filter((o) => o.use === 'write' && o.custom && o.kind === 'table');
  const seen = new Set<string>();
  for (const o of customWrites) {
    if (seen.has(o.name)) continue;
    seen.add(o.name);
    out.push({
      topic: 'retention',
      question: `How long must the entries written to ${o.name} be kept, and who may read them?`,
      why: `The code writes ${o.name} at L${o.line}; retention and access are not in the code.`,
      anchors: distinctAnchors([anchorOf(ctx, { lineStart: o.line, lineEnd: o.line })]),
    });
  }
  out.push({
    topic: 'volume',
    question: 'How many records does one run handle, how often does it run, and by when must it finish?',
    why: 'The code sets no volume, schedule or time limit.',
    anchors: [],
  });
  return out;
}

/* ---- assembly */

export function buildRequirementSet(input: RequirementInput): RequirementSet {
  const source = input.source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = sourceLines(source);
  const facts = buildProcessFacts(source);
  const skeleton = buildProcessSkeletonFrom(facts);
  const ruleSet = deriveBusinessRulesFrom(source, facts, skeleton);
  const plain = plainContext(source);
  const labels = plainLabels(skeleton, source);

  const byId = new Map(skeleton.nodes.map((n) => [n.id, n]));
  const outs = new Map<string, SkeletonEdge[]>();
  const ins = new Map<string, SkeletonEdge[]>();
  for (const e of skeleton.edges) {
    if (!outs.has(e.from)) outs.set(e.from, []);
    outs.get(e.from)!.push(e);
    if (!ins.has(e.to)) ins.set(e.to, []);
    ins.get(e.to)!.push(e);
  }

  const formRanges = new Map(facts.calls.forms.map((f) => [f.name.toUpperCase(), { lineStart: f.lineStart, lineEnd: f.lineEnd }]));
  const unreachable = facts.calls.unreachable.map((n) => n.toUpperCase());

  // Steps: every event block the skeleton draws, and every FORM reached from
  // one, in the order the calls stand — depth first, the way the process runs.
  // A FORM the map folds into its caller (a helper with no effect of its own)
  // is still a step here: the values it fills in are requirements too.
  const steps: RequirementStep[] = [];
  const stepOfRegion = new Map<string, RequirementStep>();
  const parentRegion = new Map<string, string>();
  for (const n of skeleton.nodes) if (n.expandsTo && !parentRegion.has(n.expandsTo)) parentRegion.set(n.expandsTo, n.region);
  const unreachableSet = new Set(unreachable);
  const callsFrom = new Map<string, string[]>();
  for (const e of [...facts.calls.edges].sort((a, b) => a.lineStart - b.lineStart)) {
    const key = (e.from ?? '').toUpperCase();
    const list = callsFrom.get(key) ?? [];
    if (!list.includes(e.to.toUpperCase())) list.push(e.to.toUpperCase());
    callsFrom.set(key, list);
  }
  const addStep = (routine: string, range: { lineStart: number; lineEnd: number } | null, regionKey: string | null, entryNodeId: string | null) => {
    const callSite = regionKey
      ? skeleton.nodes.find((n) => n.expandsTo === regionKey)
      : skeleton.nodes.find((n) => isCallSite(n) && n.label.toUpperCase() === routine);
    const step: RequirementStep = {
      id: `S${String(steps.length + 1).padStart(2, '0')}`,
      number: steps.length + 1,
      label: (callSite ? labels.nodes.get(callSite.id) : null) || humaniseRoutine(routine) || routine,
      routine,
      anchor: range,
      nodeId: callSite?.id ?? entryNodeId ?? null,
      objects: [],
      requirementIds: [],
    };
    steps.push(step);
    if (regionKey) stepOfRegion.set(regionKey, step);
    return step;
  };
  const visited = new Set<string>();
  const visit = (caller: string) => {
    for (const callee of callsFrom.get(caller) ?? []) {
      if (visited.has(callee) || unreachableSet.has(callee) || !formRanges.has(callee)) continue;
      visited.add(callee);
      const key = `form:${callee}`;
      const region = skeleton.regions.find((r) => r.key.toUpperCase() === key.toUpperCase());
      addStep(callee, formRanges.get(callee) ?? null, region?.key ?? null, null);
      visit(callee);
    }
  };
  const entries = skeleton.entries.map((k) => skeleton.regions.find((r) => r.key === k)).filter((r): r is NonNullable<typeof r> => !!r);
  for (const region of entries) {
    const routine = region.label.toUpperCase();
    addStep(routine, region.anchor ? { lineStart: region.anchor.lineStart, lineEnd: region.anchor.lineEnd } : null, region.key, region.entryNodeId);
    visit(routine);
  }
  // A drawn FORM the call edges did not reach (an event's own PERFORM chain the
  // graph reads differently) still gets its step.
  for (const region of skeleton.regions) {
    if (!region.key.startsWith('form:') || stepOfRegion.has(region.key)) continue;
    const routine = region.key.slice(5).toUpperCase();
    const existing = steps.find((s) => s.routine === routine);
    if (existing) stepOfRegion.set(region.key, existing);
    else addStep(routine, formRanges.get(routine) ?? null, region.key, null);
  }
  // Loop regions and other inner planes belong to the step that opens them.
  for (const region of skeleton.regions) {
    if (stepOfRegion.has(region.key)) continue;
    let at: string | undefined = region.key;
    for (let hop = 0; hop < 8 && at && !stepOfRegion.has(at); hop++) at = parentRegion.get(at);
    const step = at ? stepOfRegion.get(at) : undefined;
    if (step) stepOfRegion.set(region.key, step);
  }

  const entrySteps = steps.filter((s) => !formRanges.has(s.routine) && s.anchor).sort((a, b) => a.anchor!.lineStart - b.anchor!.lineStart);
  const stepByRoutine = new Map(steps.map((s) => [s.routine, s]));
  const stepOfLine = (line: number): RequirementStep | null => {
    for (const [name, r] of formRanges) {
      if (line >= r.lineStart && line <= r.lineEnd) return stepByRoutine.get(name) ?? null;
    }
    let best: RequirementStep | null = null;
    for (const s of entrySteps) if (s.anchor!.lineStart <= line) best = s;
    return best ?? entrySteps[0] ?? null;
  };

  // Objects and their levels.
  const levelRows = (input.levels ?? []).filter((r) => r && r.objectName);
  const levelOf = (name: string, line: number): RequirementObject['level'] => {
    const rows = levelRows.filter((r) => r.objectName!.toUpperCase() === name);
    const row = rows.find((r) => r.lineStart === line) ?? rows[0];
    const level = row?.level;
    return level === 'A' || level === 'B' || level === 'C' || level === 'D' ? level : null;
  };
  const allObjects: RequirementObject[] = [];
  const tables = readTableDependencies(source);
  for (const d of tables.dependencies) {
    // A `TYPE` reference names a structure, not data the process touches.
    if (d.possibleTargetOf || d.access === 'reference') continue;
    const name = d.table.toUpperCase();
    allObjects.push({ name, kind: 'table', use: d.access, level: levelOf(name, d.line), custom: isCustom(name), line: d.line });
  }
  for (const c of facts.calls.functionModules) {
    if (c.dynamic || !c.name) continue;
    const name = c.name.toUpperCase();
    allObjects.push({ name, kind: 'function-module', use: 'call', level: levelOf(name, c.lineStart), custom: isCustom(name), line: c.lineStart });
  }
  for (const c of facts.calls.transactions) {
    if (c.dynamic || !c.code) continue;
    const name = c.code.toUpperCase();
    allObjects.push({ name, kind: 'transaction', use: 'call', level: levelOf(name, c.lineStart), custom: isCustom(name), line: c.lineStart });
  }
  for (const c of facts.calls.submits) {
    if (c.dynamic || !c.program) continue;
    const name = c.program.toUpperCase();
    allObjects.push({ name, kind: 'report', use: 'call', level: levelOf(name, c.lineStart), custom: isCustom(name), line: c.lineStart });
  }
  allObjects.sort((a, b) => a.line - b.line);
  const objectsByStep = new Map<string, RequirementObject[]>();
  const reachedObjects: RequirementObject[] = [];
  for (const o of allObjects) {
    const step = stepOfLine(o.line);
    if (!step) continue;
    const list = objectsByStep.get(step.id) ?? [];
    if (!list.some((x) => x.name === o.name && x.use === o.use)) list.push(o);
    objectsByStep.set(step.id, list);
    reachedObjects.push(o);
  }
  for (const s of steps) s.objects = objectsByStep.get(s.id) ?? [];

  const ctx: Ctx = { source, lines, plain, labels, skeleton, byId, outs, ins, stepOfRegion, steps, stepOfLine, objectsByStep, consumed: new Set() };

  const drafts: Draft[] = [];
  const coveredGateways = new Set<string>();
  const coveredLines = new Set<number>();
  for (const rule of ruleSet.rules) {
    if (rule.withoutProcessElement?.reason === 'unreached') continue;
    const d = ruleDraft(ctx, rule);
    if (!d) continue;
    drafts.push(d);
    for (const e of rule.processElements) if (e.relation === 'condition') coveredGateways.add(e.nodeId);
    if (rule.type === 'control') for (const b of rule.typeBasis) for (const a of b.anchors) for (let l = a.lineStart; l <= a.lineEnd; l++) coveredLines.add(l);
  }
  drafts.push(...decisionDrafts(ctx, coveredGateways));
  drafts.push(...exitDrafts(ctx, coveredLines));
  drafts.push(...effectDrafts(ctx));
  drafts.push(...fixedValueDrafts(ctx));
  const inputs = inputsDraft(ctx);
  if (inputs) drafts.push(inputs);

  // Every anchor checked against the source; a requirement left without one is not shipped.
  const dropped: RequirementSet['dropped'] = [];
  const kept: Draft[] = [];
  for (const d of drafts) {
    const holding = d.anchors.filter((a) => anchorHolds(a, lines));
    if (!holding.length) {
      dropped.push({ ref: d.basis.ref ?? d.basis.kind, reason: 'No line anchor of it holds in the source.' });
      continue;
    }
    kept.push({ ...d, anchors: holding });
  }

  const stepIndex = new Map(steps.map((s, i) => [s.id, i]));
  kept.sort((a, b) => {
    const sa = a.stepId === null ? -1 : stepIndex.get(a.stepId) ?? 999;
    const sb = b.stepId === null ? -1 : stepIndex.get(b.stepId) ?? 999;
    return sa - sb || a.anchors[0].lineStart - b.anchors[0].lineStart;
  });
  const requirements: FunctionalRequirement[] = kept.map((d, i) => ({
    ...d,
    id: `FR-${String(i + 1).padStart(3, '0')}`,
    provenance: 'reconstructed',
  }));
  for (const r of requirements) if (r.stepId) steps.find((s) => s.id === r.stepId)?.requirementIds.push(r.id);

  const open: OpenRequirement[] = openItems(ctx, ruleSet.rules, unreachable, formRanges, facts, reachedObjects)
    .map((o) => ({ ...o, anchors: o.anchors.filter((a) => anchorHolds(a, lines)) }))
    .map((o, i) => ({ ...o, id: `TBC-${String(i + 1).padStart(2, '0')}`, provenance: 'not-determined' as const }));

  const count = (p: RequirementPriority) => requirements.filter((r) => r.priority === p).length;
  return {
    formatVersion: REQUIREMENT_FORMAT_VERSION,
    program: ruleSet.program,
    sourceSha256: sha256Hex(source),
    lineCount: lines.length,
    steps,
    requirements,
    open,
    dropped,
    counts: {
      total: requirements.length,
      must: count('must'),
      should: count('should'),
      could: count('could'),
      open: open.length,
      steps: steps.filter((s) => s.requirementIds.length).length,
    },
  };
}
