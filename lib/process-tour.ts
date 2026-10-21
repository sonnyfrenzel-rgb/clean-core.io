/**
 * The guided tour on the process map — owner decision 21.10.2026, replacing
 * the walk-through of "3.0.20 — with it", part (1): "it shows something at the
 * top and at the bottom of the process without you getting it onto one
 * screen". The tour is for **understanding only** ("we are in First insights,
 * that is, simply clear business language about what happens in the
 * process"): no question, no answer, no code on the card.
 *
 * What this file decides is **which steps are stations** and what is said at
 * each. The sentences are the walk guide's (`lib/process-walk-guide.ts`) —
 * engine-written, anchored, worded by the model only through the 3.0.20 guard
 * — and this file adds three engine sentences of its own: where the process
 * goes next, what the tour leaves out in a part, and the whole program at the
 * end.
 *
 *   - **Only business stations.** Technical steps (checks, run options and the
 *     test-data switch, logging, files, set-up and loops) are the guide's
 *     `technical` groups; they are never stations. Where they sit, one sentence
 *     says so ("In this part the program also makes 3 technical checks").
 *   - **Phases are chapters.** The guide's phases, in walk order; a stretch of
 *     the main flow is a chapter named after its first station.
 *   - **A few stations per chapter.** The steps a business reader learns most
 *     from first — a change to data, another system, a permission, a control,
 *     a rule — at most {@link PER_CHAPTER} per chapter, every chapter at least
 *     one, and no more than {@link MAX_STATIONS} in all where the chapters
 *     allow it. A phase box is a chapter, not a station, unless nothing inside
 *     it is a station. Steps of the same name in one chapter are one station.
 *
 * Pure: no React, no DOM, no network, no clock. Nothing here is stored or
 * signed — it is presentation, built in the browser from the source the
 * active run signed, as the map is.
 */
import type { ProcessMapModel } from './process-map';
import { programSummaryFactsOf } from './program-summary-facts';
import { businessInShort, programSummary } from './program-summary-text';
import { APP_VERSION } from './version';
import type { WalkGuide, WalkGuideStep, WalkLine, WalkRange, WalkRole, WalkTechnicalGroup } from './process-walk-guide';

/** The most stations of one chapter. */
export const PER_CHAPTER = 4;

/** Stations of a chapter of `steps` distinct steps: one for every three, at least one, at most {@link PER_CHAPTER}. */
export const stationsFor = (steps: number): number => Math.min(PER_CHAPTER, Math.max(1, Math.ceil(steps / 3)));
/** The most stations of a tour, where its chapters allow it (every chapter keeps one). */
export const MAX_STATIONS = 12;

export interface TourChapter {
  id: string;
  label: string;
  /** Index of the chapter's first station. */
  first: number;
  /** Its stations, by index. */
  stations: number[];
}

export interface TourStation {
  /** The map element highlighted. */
  id: string;
  title: string;
  /** The level of the map the element is drawn on: null for the top one. */
  plane: string | null;
  chapter: number;
  happens: WalkLine;
  matters: WalkLine;
  /** Where the process goes after it, in the tour's terms. Engine-written. */
  next: string;
  /** What the tour leaves out in this part, in one sentence — on a chapter's first station only. */
  aside: string | null;
  /** One fold down ("More about it"): what decides it, what data it touches, and its lines. */
  decides: WalkLine[];
  data: WalkLine | null;
  anchor: WalkRange | null;
  /** The engine's detailed reading of the same lines (17.7), when there is one. */
  engine: string | null;
}

export interface ProcessTour {
  chapters: TourChapter[];
  stations: TourStation[];
  /** The whole program in one sentence, said at the end; null when the engine has none. */
  closing: WalkLine | null;
  /** The steps the old walk-through went through one by one (business and technical) — what the tour replaced. */
  walkSteps: number;
}

/** How much a reader learns from a step of each role — the order stations are picked in. */
const WEIGHT: Record<WalkRole, number> = {
  change: 6,
  remote: 5,
  permission: 5,
  control: 4,
  rule: 4,
  mail: 3,
  output: 3,
  read: 2,
  other: 1,
  phase: 0,
};

/**
 * A step the engine could say only in general words (plain false — More
 * deliveries? of a loop) teaches less than its role suggests.
 */
const weightOf = (step: WalkGuideStep): number => WEIGHT[step.role] - (step.plain ? 0 : 2);

/** A second station of a chapter is taken only from here up: a plain read or a step of no role is never one. */
const SECOND_FLOOR = 3;

const TECHNICAL_WORDS: Record<WalkTechnicalGroup, (n: number) => string> = {
  checks: (n) => `makes ${n} technical ${n === 1 ? 'check' : 'checks'}`,
  switches: (n) => `looks at ${n} run ${n === 1 ? 'option' : 'options'} (like a test run)`,
  logging: (n) => `writes a log or statistics in ${n} ${n === 1 ? 'place' : 'places'}`,
  files: (n) => `handles a file in ${n} ${n === 1 ? 'place' : 'places'}`,
  setup: (n) => `prepares or repeats steps in ${n} ${n === 1 ? 'place' : 'places'}`,
};

function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "In this part the program also checks 2 more conditions and makes 3 technical checks." — or null when nothing is left out. */
export function asideSentence(left: { decisions: number; steps: number; technical: Partial<Record<WalkTechnicalGroup, number>> }): string | null {
  const parts: string[] = [];
  if (left.decisions > 0) parts.push(`checks ${left.decisions} more ${left.decisions === 1 ? 'condition' : 'conditions'}`);
  if (left.steps > 0) parts.push(`takes ${left.steps} more ${left.steps === 1 ? 'step' : 'steps'}`);
  for (const group of ['checks', 'switches', 'logging', 'files', 'setup'] as const) {
    const n = left.technical[group] ?? 0;
    if (n > 0) parts.push(TECHNICAL_WORDS[group](n));
  }
  return parts.length ? `In this part the program also ${list(parts)}.` : null;
}

const isDecisionRole = (role: WalkRole) => role === 'control' || role === 'rule' || role === 'permission';

/**
 * The tour of a process map: its stations by chapter, each said in plain
 * words. `closing` is the one sentence about the whole program the tour ends
 * with (the First-insights purpose sentence, or the engine's program summary).
 */
export function buildProcessTour(guide: WalkGuide, model: ProcessMapModel, closing: WalkLine | null = null): ProcessTour {
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const walkSteps = guide.business.length + guide.technical.reduce((n, g) => n + g.stepIds.length, 0);

  /* ---- the picks, chapter by chapter ---- */
  type Pick = { phase: string; label: string; lead: string; ids: string[]; dropped: { decisions: number; steps: number } };
  const picks: Pick[] = [];
  for (const phase of guide.phases) {
    const steps = phase.stepIds.map((id) => guide.byId[id]).filter((s): s is WalkGuideStep => !!s && byId.has(s.id));
    if (steps.length === 0) continue;
    const inner = steps.filter((s) => !byId.get(s.id)?.opensPlane);
    const pool = inner.length > 0 ? inner : steps.slice(0, 1);
    // One station per name: "Show the result list" four times is one station.
    const seen = new Set<string>();
    const distinct = pool.filter((s) => {
      const key = s.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const order = new Map(distinct.map((s, i) => [s.id, i]));
    const ranked = [...distinct].sort((a, b) => weightOf(b) - weightOf(a) || order.get(a.id)! - order.get(b.id)!);
    const chosen = ranked.slice(0, 1);
    for (const s of ranked.slice(1)) {
      if (chosen.length >= stationsFor(distinct.length)) break;
      if (weightOf(s) >= SECOND_FLOOR) chosen.push(s);
    }
    const ids = [...chosen].sort((a, b) => order.get(a.id)! - order.get(b.id)!).map((s) => s.id);
    const left = distinct.filter((s) => !ids.includes(s.id));
    const label = phase.id.startsWith('main-') ? guide.byId[ids[0]].title : phase.label;
    picks.push({
      phase: phase.id,
      label,
      lead: chosen[0].id,
      ids,
      dropped: { decisions: left.filter((s) => isDecisionRole(s.role)).length, steps: left.filter((s) => !isDecisionRole(s.role)).length },
    });
  }

  // No more than MAX_STATIONS, where the chapters allow it: the weakest second
  // station goes first, of equals the latest; a chapter keeps its lead station.
  let total = picks.reduce((n, p) => n + p.ids.length, 0);
  while (total > MAX_STATIONS) {
    let worst: { pick: Pick; id: string; weight: number; at: number } | null = null;
    for (let at = 0; at < picks.length; at += 1) {
      const pick = picks[at];
      for (const id of pick.ids) {
        if (id === pick.lead) continue;
        const weight = weightOf(guide.byId[id]);
        if (!worst || weight < worst.weight || (weight === worst.weight && at >= worst.at)) worst = { pick, id, weight, at };
      }
    }
    if (!worst) break;
    const { pick, id } = worst;
    pick.ids = pick.ids.filter((x) => x !== id);
    if (isDecisionRole(guide.byId[id].role)) pick.dropped.decisions += 1;
    else pick.dropped.steps += 1;
    total -= 1;
  }
  /* ---- what the tour leaves out, by chapter ---- */
  const technicalByChapter = new Map<number, Partial<Record<WalkTechnicalGroup, number>>>();
  const chapterOfPhase = new Map(picks.map((p, i) => [p.phase, i]));
  {
    // A technical step belongs to the chapter of the business step before it in
    // walk order (the first chapter before any), so none is left uncounted.
    let current = 0;
    for (const step of Object.values(guide.byId)) {
      const at = chapterOfPhase.get(step.phase);
      if (!step.technical) {
        if (at !== undefined) current = at;
        continue;
      }
      const chapter = at ?? current;
      const counts = technicalByChapter.get(chapter) ?? {};
      counts[step.technical] = (counts[step.technical] ?? 0) + 1;
      technicalByChapter.set(chapter, counts);
    }
  }

  /* ---- the stations ---- */
  const chapters: TourChapter[] = [];
  const stations: TourStation[] = [];
  picks.forEach((pick, c) => {
    const chapter: TourChapter = { id: pick.phase, label: pick.label, first: stations.length, stations: [] };
    pick.ids.forEach((id, k) => {
      const step = guide.byId[id];
      const element = byId.get(id)!;
      chapter.stations.push(stations.length);
      stations.push({
        id,
        title: step.title,
        plane: element.plane,
        chapter: c,
        happens: step.happens,
        matters: step.matters,
        next: '',
        aside: k === 0 ? asideSentence({ ...pick.dropped, technical: technicalByChapter.get(c) ?? {} }) : null,
        decides: step.decides,
        data: step.data,
        anchor: step.anchor,
        engine: step.engine?.text ?? null,
      });
    });
    chapters.push(chapter);
  });
  stations.forEach((station, i) => {
    const after = stations[i + 1];
    if (!after) {
      station.next = 'This is the last step of the tour.';
    } else if (after.chapter === station.chapter || chapters[after.chapter].label === after.title) {
      station.next = `Then it goes on to “${after.title}”.`;
    } else {
      station.next = `Then the part “${chapters[after.chapter].label}” begins.`;
    }
  });
  return { chapters, stations, closing, walkSteps };
}

/**
 * The one sentence about the whole program the tour ends with: the purpose
 * line of the engine's program summary, the same the First insights' "In
 * short" leads with, without the table codes. Null when the engine cannot read
 * one. `engineVersion`: the engine the summary is read for (3.0.20) — the
 * project's run's.
 */
export function tourClosingOf(source: string, engineVersion: string | null = APP_VERSION): WalkLine | null {
  try {
    const [purpose] = businessInShort(programSummary(programSummaryFactsOf(source, { engineVersion })), { codes: false });
    if (!purpose || purpose.basis === 'not-determined' || !purpose.text.trim()) return null;
    const first = purpose.anchors[0];
    return { text: purpose.text, anchor: first ? { lineStart: first.lineStart, lineEnd: first.lineEnd } : null };
  } catch {
    return null;
  }
}