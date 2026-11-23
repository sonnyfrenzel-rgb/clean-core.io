/**
 * Analyze, IT view — one page, code first (plan `docs/design/analyze-business-first-plan.md` §4.3, AB-9; ADR-140;
 * mock-up `docs/roadmap/analyze-family-mockup.html`, its IT page). The rules of the page that are not markup: the
 * section ids, the "On this page" bar, the answer sentence, the main sequence and what a change must watch.
 *
 * Every figure here is read off what the page already holds — the signed score, the deductions of the score's own
 * table (`lib/score-hero.ts`), the engine's findings, the skeleton the Business map is drawn from. Nothing is a
 * model's, nothing is stored, and the view is never written anywhere (`tests/view-attribute-guard.spec.ts`).
 *
 * Pure: no React, no Firestore.
 */
import { PAGE_ANCHOR_IDS, type PageAnchor } from '@/lib/page-anchors';
import { scoreBand } from '@/lib/clean-core-score';
import type { ScoreHeroModel } from '@/lib/score-hero';

/**
 * The ids of the IT page's sections — the fragments every link to IT lands on. `notDetermined` keeps the address every
 * view and tool has linked to since ADR-081 (`#not-determined`); the folded parts keep the workspace's old ids
 * (`#it-target-profile`, `#it-route`, `#it-trust`, `#standard`, `#business-rules`), so an old link lands on its content
 * (AB-11, `lib/workspace-redirect.ts`).
 */
export const ANALYZE_IT_IDS = Object.freeze({
  answer: 'analyze-answer',
  // The sections the "On this page" bar names — one list with the guard's (`lib/page-anchors.ts`).
  ...PAGE_ANCHOR_IDS.analyze,
  route: 'analyze-route',
  notDetermined: 'not-determined',
  sequence: 'analyze-sequence',
  risks: 'analyze-risks',
});

/** The ids inside the folded "Technical detail" that open it when an address names them. */
export const ANALYZE_IT_DETAIL_PLACES: readonly string[] = Object.freeze([
  ANALYZE_IT_IDS.detail,
  'it-target-profile',
  'it-route',
  'it-trust',
  'standard',
  'business-rules',
  'it-types',
]);

/**
 * The "On this page" bar of the IT page (ADR-126 (3), at most six): the score, the first look, the findings, the SAP
 * objects, the model summary where one is on record, and the technical detail — the mock-up's six, in page order.
 */
export function analyzeItAnchors(content: {
  /** The findings "Look here first" picks; 0 hides the anchor. */
  picks: number;
  /** All findings, as the list counts them. */
  findings: number;
  /** The objects the code touches, as the section counts them; `null` while they are read. */
  touches: number | null;
  /** A model summary is on record. */
  summary: boolean;
  /** The score's deductions are shown (a signed score on the page). */
  score: boolean;
}): PageAnchor[] {
  const ids = ANALYZE_IT_IDS;
  const out: PageAnchor[] = [];
  if (content.score) out.push({ key: 'moves', target: ids.moves, label: 'Score', title: 'What moves the score?' });
  if (content.picks > 0) out.push({ key: 'focus', target: ids.focus, label: 'First look', count: String(content.picks), title: 'Which findings matter most?' });
  out.push({ key: 'kinds', target: ids.kinds, label: 'Findings', count: content.findings > 0 ? String(content.findings) : 'none', title: 'Every finding, grouped' });
  out.push({
    key: 'touch',
    target: ids.touch,
    label: 'SAP objects',
    count: content.touches === null ? null : String(content.touches),
    title: 'What does the code touch in SAP?',
  });
  if (content.summary) out.push({ key: 'summary', target: ids.summary, label: 'Summary', title: 'What the analysis model wrote, a proposal' });
  out.push({ key: 'detail', target: ids.detail, label: 'Detail', title: 'Constructs, levels, target, run, standard fit, imports' });
  return out;
}

/* ------------------------------------------------------------- line anchors */

/**
 * The one line-anchor notation of the tools (UX review 22.11.2026, Q11, as the family mock-ups write it): "line 42",
 * "line 240–243". The address keeps its own form (`#L42`, `lib/analyze-entry.ts`); this is what a reader sees.
 */
export function lineAnchorText(start: number, end?: number | null): string {
  return typeof end === 'number' && end > start ? `line ${start}–${end}` : `line ${start}`;
}

/* ------------------------------------------------------------------ answer */

export interface ItAnswerPart {
  /** "the direct write to EBAN" — a deduction in a reader's words. */
  text: string;
  points: number;
  /** The first line the deduction comes from, or null. */
  line: number | null;
  lineEnd: number | null;
}

export interface ItAnswer {
  /** "Far from clean core: 40 of 100." plus what carries most of the distance. */
  answer: string;
  /** The two largest deductions, each with its line. */
  why: ItAnswerPart[];
  /** Points that stand for what could not be assessed; 0 when none. */
  notAssessedPoints: number;
}

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** The first line of a deduction and, where its lines run on without a gap of more than three, the last of that run. */
function firstRun(lines: readonly number[]): { line: number | null; lineEnd: number | null } {
  if (!lines.length) return { line: null, lineEnd: null };
  let end = lines[0];
  for (const l of lines.slice(1)) {
    if (l - end > 3) break;
    end = l;
  }
  return { line: lines[0], lineEnd: end > lines[0] ? end : null };
}

/**
 * The answer of the IT page (ADR-140 A17): the score and its band in one sentence, and what carries most of the
 * distance; the two largest deductions go into the "why" with their lines, the table becomes the first section. Without
 * a signed score, or where the deductions do not add up to it, the answer says only what is known.
 */
export function itAnswer(input: { score: number | null; model: ScoreHeroModel | null; findings: number }): ItAnswer {
  const { score, model } = input;
  if (score === null) {
    return { answer: 'No score yet: this run computed none.', why: [], notAssessedPoints: 0 };
  }
  const band = scoreBand(score);
  const head = `${band.label}: ${score} of 100.`;
  if (!model || model.score !== score) {
    return { answer: head, why: [], notAssessedPoints: 0 };
  }
  const top = model.deductions.filter((d) => d.points > 0).slice(0, 2);
  const why = top.map<ItAnswerPart>((d) => ({ text: lower(d.label), points: d.points, ...firstRun(d.lines) }));
  const nd = model.notAssessed?.points ?? 0;
  let tail = '';
  if (top.length === 0 && nd > 0) tail = ' What the engine could not assess carries the distance.';
  else if (top.length === 1) tail = ` ${capital(why[0].text)} carries most of the distance.`;
  else if (top.length === 2) tail = ` ${capital(why[0].text)} and ${why[1].text} carry most of the distance.`;
  else tail = ' Nothing the code does costs points.';
  return { answer: `${head}${tail}`, why, notAssessedPoints: nd };
}

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/* ----------------------------------------------------------- main sequence */

/** The parts of a process skeleton the main sequence reads — kept structural so this module stays import-free. */
export interface SequenceSkeleton {
  nodes: ReadonlyArray<{ kind: string; label: string; region: string; expandsTo?: string; anchor: { lineStart: number } | null }>;
  entries: readonly string[];
}

export interface SequenceRow {
  line: number;
  /** The routine or call as the source names it. */
  name: string;
}

/**
 * The main sequence (AB-9): the calls the program's entry blocks make, in the order they stand, each with the line it
 * stands on — what everything else runs from. Read off the skeleton the Business map is drawn from; a call the engine
 * could not anchor is left out rather than placed. At most `max` rows; `more` says how many were left out.
 */
export function mainSequence(skeleton: SequenceSkeleton | null, max = 10): { rows: SequenceRow[]; more: number } {
  if (!skeleton) return { rows: [], more: 0 };
  const entries = new Set(skeleton.entries);
  const seen = new Set<string>();
  const all: SequenceRow[] = [];
  for (const node of skeleton.nodes) {
    if (!entries.has(node.region) || !node.anchor) continue;
    // A routine the entry calls (drawn as a sub-process, or collapsed into the one thing it does), a function module,
    // a transaction, or a call whose target is named only at run time.
    const call =
      node.expandsTo !== undefined ||
      node.kind === 'call-activity' ||
      node.kind === 'transaction' ||
      node.kind === 'call-opaque';
    if (!call) continue;
    const key = `${node.anchor.lineStart}:${node.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ line: node.anchor.lineStart, name: node.label });
  }
  all.sort((a, b) => a.line - b.line);
  return { rows: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/* ------------------------------------------------------ risks for a change */

export interface ChangeRisk {
  key: string;
  text: string;
  line: number | null;
  lineEnd: number | null;
}

/**
 * What a change to this code must watch (AB-9, "risks for a change"), from the engine only: the deductions that cost
 * ten points or more — the constructs that break silently or skip SAP's checks — and the parts the engine could not
 * read. At most four; never a model's text.
 */
export function changeRisks(input: { model: ScoreHeroModel | null; missingObjects: number; notAssessedPlaces: number }): ChangeRisk[] {
  const out: ChangeRisk[] = [];
  for (const d of input.model?.deductions ?? []) {
    if (d.points < 10) continue;
    const objects = d.objects.length ? ` (${d.objects.slice(0, 3).join(', ')}${d.objects.length > 3 ? ', …' : ''})` : '';
    out.push({ key: d.kind, text: `${d.label}${objects}`, ...firstRun(d.lines) });
    if (out.length === 3) break;
  }
  if (input.missingObjects > 0) {
    out.push({
      key: 'missing-objects',
      text: `${input.missingObjects} ${input.missingObjects === 1 ? 'part' : 'parts'} the code refers to ${input.missingObjects === 1 ? 'is' : 'are'} not in the upload: a change cannot see what ${input.missingObjects === 1 ? 'it does' : 'they do'}`,
      line: null,
      lineEnd: null,
    });
  } else if (input.notAssessedPlaces > 0) {
    out.push({
      key: 'not-assessed',
      text: `${input.notAssessedPlaces} ${input.notAssessedPlaces === 1 ? 'place' : 'places'} the engine could not assess`,
      line: null,
      lineEnd: null,
    });
  }
  return out.slice(0, 4);
}
