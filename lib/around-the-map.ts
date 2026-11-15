/**
 * The text around the map — Analyze, Business view (plan
 * `docs/design/analyze-business-first-plan.md` §4.2, AB-6; mockup
 * `docs/roadmap/analyze-business-first-mockup.html`, states 3, 5 and 9; ADR-116).
 *
 * Five blocks, each built from what the engine already reads — nothing here is
 * a new reading of the code, so no engine gate guards it: every reader below
 * takes the engine version of the project's signed run.
 *
 *   1. **What this program does** — two sentences. The engine's (`businessInShort`, without the purpose the
 *      program's names give, which is block 3's), or a model's wording of them, but only after
 *      `purposeProposalOf` passed and it names no object the engine did not read (N5, `modelPurposeOf`).
 *   2. **How it runs** — the numbered story (`lib/process-story.ts`) in at most four paragraphs, in the
 *      code's order. Every sentence is a step, its checks or its stops, with the step's line. The plain
 *      wording (`lib/plain-wording.ts`, scope `firstlook`) rewords the step sentences only.
 *   3. **Why it exists** — the purpose the program's names give (`SummaryLine.aim`) and the header
 *      comment where the facts do not contradict it (`authorClaimOf`), always followed by the fixed
 *      caution sentence: the code does not say this in words.
 *   4. **Who is involved** — the lanes and the lane evidence of the skeleton, said in roles, *Reconstructed*.
 *   5. **Questions to settle with the business** — the code's surprises a business reader is asked
 *      about (`allCodeFindings`, ask = business or users) and the questions on the business rules
 *      (`explainBusinessRules`), each with its line; IT's questions stay in IT.
 *
 * **No sentence without its line.** A sentence the engine gave no line is not shown here; a block
 * left with none says so in a muted note that claims nothing about the code.
 *
 * Pure: no React, no DOM, no network, no model call.
 */

import type { ProcessSkeleton, SkeletonNode } from '@/lib/abap/process-skeleton';
import type { BusinessRuleSet } from '@/lib/abap/business-rule-set';
import { explainBusinessRules, type ExplainFacts, type RuleSetExplanation } from '@/lib/abap/business-rule-set-explain';
import { engineReads3020Apply } from '@/lib/abap/engine-reads-3020-gate';
import { plainLabels } from '@/lib/abap/plain-language';
import type { CustomerTexts } from '@/lib/abap/customer-texts';
import { anchorLabel } from '@/lib/first-look';
import { firstLookBrief } from '@/lib/first-look-brief';
import { allCodeFindings, type CodeFinding } from '@/lib/first-look-findings';
import { processStory, type ProcessStory, type StoryStep } from '@/lib/process-story';
import { programSummaryFactsOf } from '@/lib/program-summary-facts';
import { authorClaimOf, purposeProposalOf, unreadCodesOf } from '@/lib/program-summary-check';
import { businessInShort, programSummary, type ProgramSummaryFacts, type SummaryLine } from '@/lib/program-summary-text';
import { plainRangeOf, type PlainRange } from '@/lib/plain-wording';
import { questionRuleCountsOf } from '@/lib/rule-counts';
import { bizTestData } from '@/lib/messages/workspace-business';

/** One sentence and the line it was read from — `L42` or `L40-48`. Never without one. */
export interface AroundSentence {
  text: string;
  anchor: string;
}

/** One paragraph of "How it runs". */
export interface AroundRun {
  /** The fixed lead of its place in the story: "It starts", "Then", "After that", "In the end". */
  title: string;
  /** The story steps it holds, each with its checks and stops, in the code's order. */
  steps: Array<{ step: AroundSentence; within: string | null; more: AroundSentence[] }>;
  /** Every skeleton node the paragraph covers — its steps and what they open — for the tour's "you are here". */
  nodeIds: string[];
  /** The line ranges those nodes stand on. */
  lines: Array<[number, number]>;
}

export interface AroundRole {
  /** Who, in a few plain words: "The person who starts it". */
  role: string;
  text: string;
  anchor: string;
}

export interface AroundQuestion {
  /** `Q-BR-004` for a rule question, the reader's name for a finding. */
  id: string;
  text: string;
  anchor: string;
  from: 'finding' | 'rule';
}

export interface AroundTheMapText {
  /** Block 1. `by: 'model'` only when a model's wording passed every check. */
  does: { sentences: AroundSentence[]; by: 'engine' | 'model' };
  /** Block 2, at most four paragraphs. */
  runs: AroundRun[];
  /** The program's own demo cases, said apart from the steps (from engine 3.0.20) — test data, not a step. */
  testData: AroundSentence | null;
  /** Block 3: the purpose from the names, and the header comment when it is quoted. */
  why: { sentences: AroundSentence[]; authorClaim: AroundSentence | null };
  /** Block 4. */
  who: AroundRole[];
  /** Block 5, the weightiest first, at most `QUESTIONS_SHOWN`. */
  questions: AroundQuestion[];
  /** Further questions beyond the ones listed. */
  questionsMore: number;
  /**
   * The rules in the one quiet basket line under the questions (`RuleBasketLineView`): how many questions cover how
   * many rules, how many stay as coded — counted by `lib/rule-counts.ts`, the count Design reads. Null without rules.
   */
  basket: { questions: number; rulesAsked: number; total: number; technical: number; undetermined: number } | null;
  /** The story the runs were cut from, for the plain wording's sentences. */
  story: ProcessStory;
}

/** Sentences in "What this program does". */
export const DOES_SENTENCES = 2;
/** Paragraphs in "How it runs". */
export const RUNS_MAX = 4;
/** Questions listed; the rest are counted and stand in Design. */
export const QUESTIONS_SHOWN = 6;
/** Checks said per step in "How it runs"; the rest are counted. */
export const CHECKS_SAID = 3;

/** The fixed caution under "Why it exists" (plan §3). */
export const WHY_CAUTION = 'The code does not say this in words. Confirm it with the process owner.';
/** The fixed note under "Who is involved" (mockup state 3). */
export const WHO_CAUTION = 'This is what the code shows. Check who does it today.';

/** The lead of each paragraph by its place: one, two, three or four paragraphs. */
const RUN_TITLES: Readonly<Record<number, readonly string[]>> = Object.freeze({
  1: ['What happens'],
  2: ['It starts', 'In the end'],
  3: ['It starts', 'Then', 'In the end'],
  4: ['It starts', 'Then', 'After that', 'In the end'],
});

const lower = (text: string): string => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);
const period = (text: string): string => {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};
const labelOf = (range: { lineStart: number; lineEnd: number }): string => anchorLabel(range.lineStart, range.lineEnd);

/* ------------------------------------------------------------- block 1 and 3 */

/**
 * A model's wording of what the program does — the first two sentences of the
 * Analyze narrative — or null. It must pass `purposeProposalOf` (no claim the
 * facts contradict, no business object or table the engine did not read) and,
 * beyond it, name no code-like object the engine did not read either
 * (`unreadCodesOf`, plan §3: "check that the proposal names only objects the
 * engine read").
 */
export function modelPurposeOf(narrative: string | null | undefined, facts: ProgramSummaryFacts | null): string | null {
  const proposal = purposeProposalOf(narrative, facts);
  if (!proposal || !facts) return null;
  return unreadCodesOf(proposal, facts).length === 0 ? proposal : null;
}

/** A summary line as anchored sentences: one per sentence of its text, each with the line's first anchor. */
function sentencesOfLine(line: SummaryLine): AroundSentence[] {
  const first = line.anchors[0];
  if (!first) return [];
  return line.text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((text) => ({ text: period(text), anchor: labelOf(first) }));
}

/**
 * "What this program does": the engine's two sentences as "In short" cut them (`firstLookBrief`: at the summary's
 * own seams, at most 40 words, never led by what the program does not do — owner, 23.10.2026), without the purpose
 * the program's names give (that is "Why it exists"); a sentence without a line is not said. Or the model's two
 * sentences, each standing on the engine sentence it was checked against.
 */
export function doesOf(lines: readonly SummaryLine[], proposal: string | null): AroundTheMapText['does'] {
  const brief = firstLookBrief(lines.filter((l) => !l.aim));
  const engine: AroundSentence[] = (brief.inShort?.parts ?? [])
    .filter((p): p is typeof p & { anchor: string } => p.anchor !== null)
    .map((p) => ({ text: period(p.text), anchor: p.anchor }))
    .slice(0, DOES_SENTENCES);
  // One sentence only: what comes out is the second (the summary's result line, whole), unless it already led.
  const used = new Set((brief.inShort?.parts ?? []).map((p) => p.line));
  const result = lines.find((l) => l.key === 'result' && !used.has(l.text));
  if (engine.length === 1 && result) engine.push(...sentencesOfLine(result).slice(0, 1));
  if (proposal && engine.length > 0) {
    const said = proposal
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, DOES_SENTENCES);
    if (said.length > 0) {
      return { sentences: said.map((text, i) => ({ text: period(text), anchor: engine[Math.min(i, engine.length - 1)].anchor })), by: 'model' };
    }
  }
  return { sentences: engine, by: 'engine' };
}

/** "Why it exists": the purpose from the program's names and the quoted header comment — the engine's only. */
export function whyOf(lines: readonly SummaryLine[], facts: ProgramSummaryFacts | null): AroundTheMapText['why'] {
  const sentences = lines.filter((l) => l.aim).flatMap(sentencesOfLine);
  const claim = authorClaimOf(facts);
  const authorClaim = claim?.state === 'shown' ? { text: claim.text, anchor: anchorLabel(claim.lineStart, claim.lineEnd) } : null;
  return { sentences, authorClaim };
}

/* ------------------------------------------------------------------ block 2 */

/** The steps cut into at most four paragraphs of the code's order — the larger ones first. */
export function groupSteps<T>(steps: readonly T[], max = RUNS_MAX): T[][] {
  const parts = Math.min(max, steps.length);
  if (parts === 0) return [];
  const base = Math.floor(steps.length / parts);
  let extra = steps.length % parts;
  const out: T[][] = [];
  let at = 0;
  for (let i = 0; i < parts; i += 1) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    out.push(steps.slice(at, at + size));
    at += size;
  }
  return out;
}

/** The nodes a story step stands for: its own, and every node in the regions it opens. */
function nodesOfStep(step: StoryStep, skeleton: ProcessSkeleton): SkeletonNode[] {
  const byId = new Map(skeleton.nodes.map((n) => [n.id, n]));
  const start = byId.get(step.nodeId);
  if (!start) return [];
  const out: SkeletonNode[] = [start];
  const seen = new Set<string>();
  const open = (region: string | null | undefined, depth: number) => {
    if (!region || depth > 6 || seen.has(region)) return;
    seen.add(region);
    for (const node of skeleton.nodes) {
      if (node.region !== region) continue;
      out.push(node);
      open(node.expandsTo, depth + 1);
    }
  };
  open(start.expandsTo, 0);
  return out;
}

/** "How it runs": the story in at most four paragraphs; steps without a line are not said. */
export function runsOf(story: ProcessStory, skeleton: ProcessSkeleton): AroundRun[] {
  const said = story.steps.filter((s) => s.anchor !== null);
  const groups = groupSteps(said);
  const titles = RUN_TITLES[groups.length] ?? [];
  return groups.map((group, i) => {
    const nodes = group.flatMap((s) => nodesOfStep(s, skeleton));
    return {
      title: titles[i] ?? '',
      steps: group.map((s) => ({ step: { text: period(s.text), anchor: s.anchor as string }, within: s.within, more: stepDetail(s) })),
      nodeIds: [...new Set(nodes.map((n) => n.id))],
      lines: nodes.filter((n) => n.anchor).map((n) => [n.anchor!.lineStart, n.anchor!.lineEnd] as [number, number]),
    };
  });
}

/** What a step checks and where it can end, as sentences on the step's own line. */
function stepDetail(step: StoryStep): AroundSentence[] {
  const anchor = step.anchor as string;
  const out: AroundSentence[] = [];
  if (step.checks.length > 0) {
    const shown = step.checks.slice(0, CHECKS_SAID).map(lower).join('; ');
    const rest = step.checks.length - CHECKS_SAID;
    out.push({ text: `It checks: ${shown}${rest > 0 ? `, and ${rest} more` : ''}.`, anchor });
  }
  if (step.stops.length > 0) out.push({ text: `It can end the case here: ${step.stops.join('; ')}.`, anchor });
  return out;
}

/**
 * The paragraph the tour stands in — the hook AB-4's walk-through drives: by
 * the node a station shows, else by a line one of its nodes stands on. Null
 * when no paragraph holds it.
 */
export function runAt(runs: readonly AroundRun[], here: { nodeId?: string | null; line?: number | null } | null | undefined): number | null {
  if (!here) return null;
  if (here.nodeId) {
    const i = runs.findIndex((r) => r.nodeIds.includes(here.nodeId as string));
    if (i >= 0) return i;
  }
  if (typeof here.line === 'number') {
    const line = here.line;
    const i = runs.findIndex((r) => r.lines.some(([a, b]) => line >= a && line <= b));
    if (i >= 0) return i;
  }
  return null;
}

/* ------------------------------------------------------------------ block 4 */

/**
 * "Who is involved": who starts it (the summary's trigger), who must be
 * authorised (each authorization lane), whether a person works on a screen or
 * a list, and what SAP or another system takes over — each from a statement
 * of the code, with its line. Never a job title (§8 of the roadmap: no role
 * mandates).
 */
export function whoOf(skeleton: ProcessSkeleton, startedBy: { text: string; anchor: string | null } | null, laneName: (lane: { kind: string; name: string }) => string): AroundRole[] {
  const out: AroundRole[] = [];
  if (startedBy?.anchor) out.push({ role: 'Who starts it', text: period(startedBy.text), anchor: startedBy.anchor });
  for (const lane of skeleton.lanes) {
    if (lane.kind !== 'authority' || !lane.name) continue;
    const word = laneName(lane);
    out.push({
      role: 'The person who runs it',
      text: word ? `needs the ${lower(word)}.` : `needs the authorization ${lane.name}.`,
      anchor: labelOf(lane.anchor),
    });
  }
  const first = (kind: string) => skeleton.laneEvidence.find((e) => e.kind === kind) ?? null;
  const human = first('human');
  if (human) out.push({ role: 'A person at the screen', text: 'works with the program’s own screen or list while it runs.', anchor: labelOf(human.anchor) });
  const system = first('system');
  if (system) out.push({ role: 'SAP in the background', text: 'carries out part of the run after the person has left it (update or background task).', anchor: labelOf(system.anchor) });
  const foreign = first('foreign-system');
  if (foreign) out.push({ role: 'Another system', text: 'is called by the program over a remote connection.', anchor: labelOf(foreign.anchor) });
  return out;
}

/* ------------------------------------------------------------------ block 5 */

/**
 * "Questions to settle with the business": the surprises a business reader is
 * asked about first, then the questions on the business rules, weightiest
 * first. A question without a line is not listed.
 */
export function questionsOf(findings: readonly CodeFinding[], explanation: RuleSetExplanation | null): { questions: AroundQuestion[]; more: number } {
  const all: AroundQuestion[] = [];
  for (const f of findings) {
    if (f.ask !== 'business' && f.ask !== 'users') continue;
    all.push({ id: f.reader, text: f.text, anchor: f.anchor, from: 'finding' });
  }
  for (const q of explanation?.questions ?? []) {
    const first = q.statement.anchors[0];
    if (!first) continue;
    all.push({ id: q.id, text: `${period(q.statement.text)} ${q.ask}`, anchor: labelOf(first), from: 'rule' });
  }
  return { questions: all.slice(0, QUESTIONS_SHOWN), more: Math.max(0, all.length - QUESTIONS_SHOWN) };
}

/* ------------------------------------------------------------------ the whole */

export interface AroundTheMapInput {
  source: string;
  skeleton: ProcessSkeleton;
  ruleSet: BusinessRuleSet;
  /** The process facts of `readProcess` — the rule explanation reads them. */
  processFacts: ExplainFacts;
  /** The engine of the project's signed run (`engineVersionOfProject`). */
  engineVersion: string | null;
  customerTexts?: CustomerTexts | null;
  /** The Analyze narrative (`project.analysis`); absent for the demo, which asks no model. */
  narrative?: string | null;
}

/** The five blocks, read once from the reading the map is drawn from. */
export function aroundTheMap({ engineVersion, ...input }: AroundTheMapInput): AroundTheMapText {
  const { source, skeleton, ruleSet } = input;
  const customerTexts = input.customerTexts ?? null;
  let facts: ProgramSummaryFacts | null = null;
  let lines: SummaryLine[] = [];
  try {
    facts = programSummaryFactsOf(source, { skeleton, ruleSet, engineVersion, customerTexts });
    lines = businessInShort(programSummary(facts), { codes: false });
  } catch {
    facts = null;
    lines = [];
  }
  const story = processStory(skeleton, source, null, engineVersion, customerTexts);
  let explanation: RuleSetExplanation | null = null;
  if (engineReads3020Apply(engineVersion)) {
    try {
      explanation = explainBusinessRules(source, ruleSet, input.processFacts, engineVersion, customerTexts);
    } catch {
      explanation = null;
    }
  }
  let findings: CodeFinding[] = [];
  try {
    findings = allCodeFindings({ source, engineVersion, skeleton, facts, testData: story.testData ?? null }).findings;
  } catch {
    findings = [];
  }
  const labels = plainLabels(skeleton, source, { engineVersion, ...(customerTexts ? { customerTexts } : {}) });
  const brief = firstLookBrief(lines);
  const asked = questionsOf(findings, explanation);
  let basket: AroundTheMapText['basket'] = null;
  if (explanation && explanation.rules.length > 0) {
    const c = questionRuleCountsOf(explanation, 0);
    basket = { questions: c.questions, rulesAsked: c.rulesAsked, total: c.total, technical: c.technical, undetermined: c.undetermined };
  }
  return {
    does: doesOf(lines, modelPurposeOf(input.narrative ?? null, facts)),
    runs: runsOf(story, skeleton),
    testData: story.testData?.anchor ? { text: bizTestData(story.testData.cases), anchor: story.testData.anchor } : null,
    why: whyOf(lines, facts),
    who: whoOf(skeleton, brief.startedBy ?? null, (lane) => labels.lane?.(lane) ?? ''),
    questions: asked.questions,
    questionsMore: asked.more,
    basket,
    story,
  };
}

/**
 * The sentences the plain wording may reword (scope `firstlook`): the engine's
 * sentences of "What this program does" and the steps of "How it runs" — what
 * this page shows, each with its line. A model's own wording and the engine's
 * checks, stops, roles and questions are not offered.
 */
export function aroundPlainSentences(text: AroundTheMapText): Array<{ text: string; anchor: PlainRange | null }> {
  return [
    ...(text.does.by === 'engine' ? text.does.sentences : []).map((s) => ({ text: s.text, anchor: plainRangeOf(s.anchor) })),
    ...text.runs.flatMap((r) => r.steps.map((s) => ({ text: s.step.text, anchor: plainRangeOf(s.step.anchor) }))),
  ];
}

/** Every sentence of the five blocks with its line — what the spec holds to "no sentence without its line". */
export function everySentence(text: AroundTheMapText): AroundSentence[] {
  return [
    ...text.does.sentences,
    ...text.runs.flatMap((r) => r.steps.flatMap((s) => [s.step, ...s.more])),
    ...(text.testData ? [text.testData] : []),
    ...text.why.sentences,
    ...(text.why.authorClaim ? [text.why.authorClaim] : []),
    ...text.who.map((w) => ({ text: `${w.role}: ${w.text}`, anchor: w.anchor })),
    ...text.questions.map((q) => ({ text: q.text, anchor: q.anchor })),
  ];
}
