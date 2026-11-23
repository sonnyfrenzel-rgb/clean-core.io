import type { DocAnchor } from '@/lib/process-documentation';
import { stepRef, type PdGate, type PdObject, type PdStep, type ProcessDocument } from '@/lib/process-document';
import { gateLine, resultWord, stepName } from '@/lib/process-document-outline';
import { elementsOfPlane, processCounts, type ProcessMapModel } from '@/lib/process-map';
import { caseEndsOf } from '@/lib/process-fact-charts';
import { documentRuleCounts } from '@/lib/rule-counts';
import { runAt, type AroundTheMapText } from '@/lib/around-the-map';
import { processFigure, type ProcessFigure } from '@/lib/process-figure';

/**
 * Documentation as one page in the order of the Word file — ADR-127 (owner acceptance of
 * `docs/roadmap/documentation-v2-mockup.html`, 15.11.2026, "abgenommen, genau so bis 3.5 umbauen"; amends ADR-107).
 *
 *   the first screen  what it does, *Starts*, *Ends*, *Needs a decision*, four numbers (each with its chapter)
 *   chapter 1         Analyze's map as Figure 1, the steps in Analyze's phases, a step's page in place (ADR-107 (3))
 *   chapters 2–7      rules, when a case stops, what it changes, systems and data, who does what, open questions
 *   appendix          folds with counts
 *
 * Every sentence here is one the engine already wrote — the process description (`lib/process-document.ts`), the map
 * (`lib/process-map.ts`) and the text around Analyze's map (`lib/around-the-map.ts`). Nothing is new and nothing is
 * stored; what is new is the order. One step count (ADR-127 (4), D9): the tasks on the map's top level. One list of
 * open questions: Analyze's own, in its words.
 *
 * Pure: no React, no DOM, no clock.
 */

/* ------------------------------------------------------------------ the chapters */

/** The page's sections in page order; the ids are the anchors of the shared "On this page" bar (ADR-126 (3)). */
export const DOC_CHAPTERS = [
  { key: 'process', id: 'doc-ch-1', number: '1', title: 'How the process works', nav: 'Process' },
  { key: 'rules', id: 'doc-ch-2', number: '2', title: 'Business rules and decision points', nav: 'Rules' },
  { key: 'stops', id: 'doc-ch-3', number: '3', title: 'When a case stops', nav: 'Early ends' },
  { key: 'changes', id: 'doc-ch-4', number: '4', title: 'What it changes', nav: 'Changes' },
  { key: 'systems', id: 'doc-ch-5', number: '5', title: 'Systems and data', nav: null },
  { key: 'roles', id: 'doc-ch-6', number: '6', title: 'Who does what', nav: 'Roles' },
  { key: 'questions', id: 'doc-ch-7', number: '7', title: 'Open questions', nav: 'Questions' },
] as const;

export type DocChapterKey = (typeof DOC_CHAPTERS)[number]['key'];

export const DOC_APPENDIX_ID = 'doc-appendix';
export const DOC_EXPORT_ID = 'doc-export';
export const DOC_ANSWER_ID = 'doc-in-short';

export const chapterOf = (key: DocChapterKey) => DOC_CHAPTERS.find((c) => c.key === key)!;

/* ------------------------------------------------------------------ the steps */

/** One fact of a step's page: a sentence, the rule id it stands on (`BR-009`), its lines. */
export interface DocFact {
  text: string;
  ref: string | null;
  anchors: DocAnchor[];
}

/** The decision point right after a step on the main path. */
export interface DocGateAfter {
  label: string;
  ends: boolean;
  /** Every answer in one line (`gateLine`). */
  line: string;
}

/** One step of chapter 1 — a row of the list, a number on Figure 1, a page in place (ADR-107 (3)). */
export interface DocStep {
  /** 1-based position on the main path — the number on Figure 1 and in the list. */
  position: number;
  /** What the description calls it: `5`, or `5a` for an alternative of a user choice. */
  ref: string;
  /** The BPMN element id. */
  id: string;
  name: string;
  technicalName: string;
  /** The name is the naming stage's business name: a model wrote it. */
  aiName: boolean;
  anchors: DocAnchor[];
  sentence: string;
  decides: DocFact[];
  stops: DocFact[];
  reads: PdObject[];
  changes: PdObject[];
  gateAfter: DocGateAfter | null;
  /** The phase (index into `phases`) the step stands in. */
  phase: number;
}

/** What a step's page says when the code reading has no sentence for it. */
export const NO_SENTENCE = 'The code reading has no sentence for this step; its code is in Analyze.';

const contains = (outer: DocAnchor, inner: DocAnchor) => outer.lineStart <= inner.lineStart && inner.lineEnd <= outer.lineEnd;
const inRanges = (ranges: readonly DocAnchor[], anchors: readonly DocAnchor[]) => anchors.some((a) => ranges.some((r) => contains(r, a)));
const firstLine = (anchors: readonly DocAnchor[]) => anchors.reduce((min, a) => Math.min(min, a.lineStart), Number.POSITIVE_INFINITY);

function gateOf(gate: PdGate): DocGateAfter {
  return { label: gate.decisionTable ? gate.decisionTable.id : gate.label, ends: gate.outcomes.some((o) => o.ends), line: gateLine(gate) };
}

/** The main path's steps, each with what its page says: a rule or an early end belongs to a step when its lines lie inside the step's. */
function stepsOf(doc: ProcessDocument): Array<Omit<DocStep, 'phase'>> {
  const path = doc.overview.path;
  const out: Array<Omit<DocStep, 'phase'>> = [];
  path.forEach((entry, i) => {
    if (entry.kind !== 'step') return;
    const step = entry as PdStep;
    const ranges = step.anchors;
    const seen = new Set<string>();
    const decides: DocFact[] = [];
    for (const r of doc.rules) {
      if (!inRanges(ranges, r.anchors)) continue;
      const text = r.condition && r.effect ? `${r.condition} → ${r.effect}` : r.condition || r.effect;
      const key = `${r.ref}|${text}`;
      if (!text || seen.has(key)) continue;
      seen.add(key);
      decides.push({ text, ref: /^BR-\d+$/.test(r.ref) ? r.ref : null, anchors: r.anchors });
    }
    decides.sort((a, b) => firstLine(a.anchors) - firstLine(b.anchors));
    const stops = doc.exceptions
      .filter((e) => inRanges(ranges, e.anchors))
      .map((e) => ({ text: `${e.shown ? `“${e.shown}”` : e.what} — ${resultWord(e.outcome)}`, ref: null, anchors: e.anchors }))
      .sort((a, b) => firstLine(a.anchors) - firstLine(b.anchors));
    const next = path[i + 1];
    out.push({
      position: out.length + 1,
      ref: stepRef(step),
      id: step.id,
      name: stepName(step),
      technicalName: step.technicalName,
      aiName: Boolean(step.businessName),
      anchors: step.anchors,
      sentence: step.does[0]?.text || step.line || (decides[0] ? `It decides: ${decides[0].text}.` : NO_SENTENCE),
      decides,
      stops,
      reads: step.touches?.reads ?? [],
      changes: step.touches?.writes ?? [],
      gateAfter: next?.kind === 'gate' ? gateOf(next) : null,
    });
  });
  return out;
}

/* ------------------------------------------------------------------ the phases */

/** A phase of chapter 1 — Analyze's paragraph of "How it runs", with its steps. */
export interface DocPhase {
  title: string;
  /** The paragraph's first sentence, as Analyze says it; null without Analyze's text. */
  sentence: string | null;
  anchor: string | null;
  steps: number[];
}

/**
 * The steps grouped in Analyze's phases (`AroundTheMapText.runs`, ADR-116 (2)): a step stands in the phase that holds
 * its map element, else the one its first line falls in, else the phase of the step before it. Without Analyze's text
 * (still reading, or the source could not be read), one phase holds every step.
 */
export function phasesOf(
  steps: ReadonlyArray<Omit<DocStep, 'phase'>>,
  model: Pick<ProcessMapModel, 'elements'>,
  around: Pick<AroundTheMapText, 'runs'> | null,
): { phases: DocPhase[]; phaseOf: number[] } {
  const runs = around?.runs ?? [];
  if (runs.length === 0) {
    return { phases: [{ title: 'What happens', sentence: null, anchor: null, steps: steps.map((s) => s.position) }], phaseOf: steps.map(() => 0) };
  }
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const phaseOf: number[] = [];
  let last = 0;
  for (const s of steps) {
    const element = byId.get(s.id);
    const found = runAt(runs, { nodeId: element?.nodeId ?? null, line: s.anchors[0]?.lineStart ?? null });
    // Never back: a step the paragraphs do not name stands where the reading is.
    const at = found === null ? last : Math.max(found, last);
    phaseOf.push(at);
    last = at;
  }
  const phases = runs.map((run, i) => ({
    title: run.title,
    sentence: run.steps[0]?.step.text ?? null,
    anchor: run.steps[0]?.step.anchor ?? null,
    steps: steps.filter((_, k) => phaseOf[k] === i).map((s) => s.position),
  }));
  return { phases, phaseOf };
}

/* ------------------------------------------------------------------ the first screen */

export interface DocCount {
  key: 'steps' | 'ends' | 'rules' | 'questions';
  label: string;
  value: number | null;
  note: string;
  chapter: DocChapterKey;
  /** `reconstructed` for what the engine read, `not-determined` for what it cannot answer. */
  source: 'reconstructed' | 'not-determined';
}

export interface DocSentence {
  text: string;
  anchors: DocAnchor[];
}

export interface DocAnswer {
  /** What the process does — the description's summary, in one or two sentences. */
  does: DocSentence[];
  starts: DocSentence | null;
  ends: string;
  /** What needs a decision: the risks the code shows, else the first open question; empty when nothing does. */
  needsDecision: DocSentence[];
  counts: DocCount[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "L42" / "L40-48" (Analyze's notation) as a range. */
export function anchorRange(anchor: string | null | undefined): DocAnchor[] {
  const m = anchor ? /^L(\d+)(?:[-–](\d+))?$/.exec(anchor) : null;
  return m ? [{ lineStart: Number(m[1]), lineEnd: Number(m[2] ?? m[1]) }] : [];
}

/* ------------------------------------------------------------------ the whole page */

export interface DocQuestion {
  number: number;
  text: string;
  anchors: DocAnchor[];
}

export interface DocRole {
  role: string;
  text: string;
  anchors: DocAnchor[];
}

export interface DocumentationPage {
  answer: DocAnswer;
  steps: DocStep[];
  phases: DocPhase[];
  /** Tasks on the map's top level (D9) — the one step count. */
  stepCount: number;
  decisionCount: number;
  figure: ProcessFigure | null;
  ends: { total: number; normal: number; stopped: number; sentence: string; rows: Array<{ label: string; detail: string | null; count: number }> } | null;
  rules: { businessRules: number; rows: ProcessDocument['rules'] };
  roles: DocRole[];
  /** Analyze's open questions, in its words (ADR-127 (4)). */
  questions: DocQuestion[];
  /** Questions beyond the ones Analyze lists. */
  questionsMore: number;
}

export interface DocumentationPageInput {
  document: ProcessDocument;
  model: Pick<ProcessMapModel, 'xml' | 'elements' | 'processName'>;
  /** The text around Analyze's map, or null while it is read. */
  around: AroundTheMapText | null;
}

export function documentationPage({ document: doc, model, around }: DocumentationPageInput): DocumentationPage {
  const raw = stepsOf(doc);
  const { phases, phaseOf } = phasesOf(raw, model, around);
  const steps: DocStep[] = raw.map((s, i) => ({ ...s, phase: phaseOf[i] }));
  const top = elementsOfPlane(model as ProcessMapModel, null);
  const counted = processCounts(top);
  const figure = processFigure(model, new Map(steps.map((s) => [s.id, s.position])));
  const chart = caseEndsOf(model as ProcessMapModel);
  const ends = chart
    ? { total: chart.total, normal: chart.normal, stopped: chart.stopped, sentence: chart.sentence, rows: chart.rows.map((r) => ({ label: r.label, detail: r.detail, count: r.count })) }
    : null;
  const ruleCounts = documentRuleCounts(doc.rules);

  const questions: DocQuestion[] = around
    ? around.questions.map((q, i) => ({ number: i + 1, text: q.text, anchors: anchorRange(q.anchor) }))
    : doc.questions.map((q) => ({ number: q.number, text: q.question, anchors: q.anchors }));
  const questionsMore = around ? around.questionsMore : 0;
  const roles: DocRole[] = (around?.who ?? []).map((r) => ({ role: r.role, text: r.text, anchors: anchorRange(r.anchor) }));

  const risks = doc.glance.points.filter((p) => p.kind === 'risk').slice(0, 2);
  const needsDecision: DocSentence[] = risks.length
    ? risks.map((p) => ({ text: p.text, anchors: p.anchors }))
    : questions.slice(0, 1).map((q) => ({ text: q.text, anchors: q.anchors }));
  const endsText = !ends
    ? 'The map shows no end for a case.'
    : `${ends.normal ? `It runs to its end${ends.normal > 1 ? ` in ${plural(ends.normal, 'way')}` : ''}` : 'It never runs to a normal end'}${ends.stopped ? `, or stops early in ${plural(ends.stopped, 'way')}` : ''}. What it changes on the way is chapter 4.`;
  const totalQuestions = questions.length + questionsMore;
  const counts: DocCount[] = [
    {
      key: 'steps',
      label: 'Steps',
      value: counted.steps,
      note: `${phases.length > 1 ? `in ${phases.length} phases · ` : ''}${plural(counted.decisions, 'decision point')}`,
      chapter: 'process',
      source: 'reconstructed',
    },
    {
      key: 'ends',
      label: 'Ways a case ends',
      value: ends ? ends.total : null,
      note: ends ? `${ends.normal} at the normal end; ${ends.stopped} stop on the way` : 'Not determined from the map',
      chapter: 'stops',
      source: ends ? 'reconstructed' : 'not-determined',
    },
    {
      key: 'rules',
      label: 'Business rules',
      value: ruleCounts.businessRules,
      note: ruleCounts.decisionPoints ? `and ${plural(ruleCounts.decisionPoints, 'decision point')} in the code` : 'read from the conditions',
      chapter: 'rules',
      source: 'reconstructed',
    },
    {
      key: 'questions',
      label: 'Questions open',
      value: totalQuestions,
      note: totalQuestions ? 'for the process owner, the same as in Analyze' : 'none left open',
      chapter: 'questions',
      source: 'not-determined',
    },
  ];

  return {
    answer: {
      does: doc.glance.summary.slice(0, 2).map((t) => ({ text: t.text, anchors: t.anchors })),
      starts: doc.glance.trigger.text ? { text: doc.glance.trigger.text, anchors: doc.glance.trigger.anchors } : null,
      ends: endsText,
      needsDecision,
      counts,
    },
    steps,
    phases,
    stepCount: counted.steps,
    decisionCount: counted.decisions,
    figure,
    ends,
    rules: { businessRules: ruleCounts.businessRules, rows: doc.rules },
    roles,
    questions,
    questionsMore,
  };
}

/** The "On this page" items: six at most, in page order, the open questions counted in amber (ADR-126 (3)). */
export function documentationAnchors(page: Pick<DocumentationPage, 'questions' | 'questionsMore' | 'steps' | 'rules'>): Array<{ key: string; target: string; label: string; count?: string | null; tone?: 'open' }> {
  const open = page.questions.length + page.questionsMore;
  return DOC_CHAPTERS.filter((c) => c.nav !== null).map((c) => ({
    key: c.key,
    target: c.id,
    label: c.nav as string,
    count: c.key === 'questions' ? (open ? String(open) : null) : c.key === 'process' ? String(page.steps.length) : c.key === 'rules' ? String(page.rules.businessRules || '') || null : null,
    ...(c.key === 'questions' && open ? { tone: 'open' as const } : {}),
  }));
}

/** "L42", "L46–48" for a list of ranges — Analyze's notation. */
export function linesText(anchors: readonly DocAnchor[], max = 2): string {
  const words = [...new Set(anchors.map((a) => (a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`)))];
  return words.length > max ? `${words.slice(0, max).join(', ')} +${words.length - max}` : words.join(', ');
}
