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
 * — and this file adds engine sentences of its own: where the process goes
 * next, what the tour leaves out in a part, and the overview it opens with.
 *
 *   - **An overview first** (owner, 22.10.2026: "walk me through the process
 *     needs only business context at the start, so that every user finds
 *     their way in the process at once"): what the program is for, who starts
 *     it, where it starts and ends, what comes out, and how many steps in which
 *     parts — all engine-written ({@link TourOverview}). It is not counted: the
 *     stations stay "Step 1 of N".
 *   - **Only business stations.** Technical steps (checks, run options and the
 *     test-data switch, logging, files, set-up and loops) are the guide's
 *     `technical` groups; they are never stations. Where they sit, one sentence
 *     says so ("In this part the program also makes 3 technical checks"), one
 *     level down ("More about it", owner 22.10.2026), as is the line that a new
 *     part begins.
 *   - **Phases are chapters.** The guide's phases, in walk order; a stretch of
 *     the main flow is a chapter named after its first station.
 *   - **A few stations per chapter.** The steps a business reader learns most
 *     from first — a change to data, another system, a permission, a control,
 *     a rule — at most {@link PER_CHAPTER} per chapter, every chapter at least
 *     one, and no more than {@link MAX_STATIONS} in all where the chapters
 *     allow it. A phase box is a chapter, not a station, unless nothing inside
 *     it is a station. Steps of the same name in one chapter are one station.
 *   - **What a step checks and where it can end** — the First insights' story
 *     lines "Checks: …" and "Can end here: …" (`lib/process-story.ts`) moved
 *     into the tour on 22.10.2026: each story step goes to the station it is,
 *     the first station of the part it is, or the station before it on the
 *     walk, one level down, without what the station already says.
 *
 * Pure: no React, no DOM, no network, no clock. Nothing here is stored or
 * signed — it is presentation, built in the browser from the source the
 * active run signed, as the map is.
 */
import type { ProcessMapModel } from './process-map';
import { readProcess } from './first-look';
import { processStory } from './process-story';
import { programSummaryFactsOf } from './program-summary-facts';
import { businessInShort, programSummary, withoutCodes, type SummaryLine } from './program-summary-text';
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
  /** What happens, as the card says it: a long case list in its short form. */
  happens: WalkLine;
  /** The full case list, one level down, where the card says it short; null otherwise. */
  cases: WalkLine | null;
  matters: WalkLine;
  /** Where the process goes after it, on the card: the next step of the same part, or the end. Null when a new part begins. */
  next: string | null;
  /** "Then the part … begins." — one level down (owner 22.10.2026); null inside a part. */
  nextPart: string | null;
  /** What the tour leaves out in this part, in one sentence — on a chapter's first station only, one level down. */
  aside: string | null;
  /** What the story of the First insights says the step checks and where it can end, one level down. */
  story: TourStoryNote[];
  /** One fold down ("More about it"): what decides it, what data it touches, and its lines. */
  decides: WalkLine[];
  data: WalkLine | null;
  anchor: WalkRange | null;
  /** The engine's detailed reading of the same lines (17.7), when there is one. */
  engine: string | null;
}

/**
 * A step of the First insights' story (`lib/process-story.ts`) at a station:
 * what it checks and where it can end, in the story's plain labels, without
 * what the station already says. `step` names the story step where it is not
 * the station itself.
 */
export interface TourStoryNote {
  step: string | null;
  checks: string[];
  stops: string[];
}

/** A story step as the tour reads it: the engine's plain labels, never a model's names. */
export interface TourStoryStep {
  text: string;
  /** The skeleton node the step starts at — the map element's `nodeId`. */
  nodeId: string;
  anchor: WalkRange | null;
  checks: string[];
  stops: string[];
}

/** What the engine reads about the whole program for the tour (`tourReadingOf`). */
export interface TourReading {
  /** What it is for and what it changes: the aim the program's names support, then the First insights' "In short". */
  purpose: WalkLine[];
  /** Who starts it. */
  trigger: WalkLine | null;
  /** What comes out. */
  result: WalkLine | null;
  story: TourStoryStep[];
}

/**
 * The overview the tour opens with (owner decision 22.10.2026) — before the
 * first station, not counted. Every line is engine-written; a line the engine
 * has nothing for is absent.
 */
export interface TourOverview {
  purpose: WalkLine[];
  trigger: WalkLine | null;
  /** "It starts at “Run starts with the entered selection” and ends at “Done”." — the map's top-level events. */
  route: string | null;
  /** Who else takes part, as far as the code shows it: another system, an e-mail. */
  involved: string | null;
  result: WalkLine | null;
  /** "7 steps in 5 parts: Check authority, …" */
  count: string;
}

export interface ProcessTour {
  chapters: TourChapter[];
  stations: TourStation[];
  /** What the process is about, said before the first station. */
  overview: TourOverview;
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
 * The tour of a process map: the overview, then its stations by chapter,
 * each said in plain words. `reading` is what the engine reads about the
 * whole program (`tourReadingOf`): the overview's sentences and the story's
 * checks and stops; without it the overview says the route and the count only.
 */
export function buildProcessTour(guide: WalkGuide, model: ProcessMapModel, reading: TourReading | null = null): ProcessTour {
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
    // One station per name: "Show the result list" four times is one station. Of steps of one name the one a
    // reader learns most from stands for them (of equals the first), so a later change is not lost to an earlier read.
    const best = new Map<string, WalkGuideStep>();
    for (const s of pool) {
      const key = s.title.trim().toLowerCase();
      const held = best.get(key);
      if (!held || weightOf(s) > weightOf(held)) best.set(key, s);
    }
    const kept = new Set([...best.values()].map((s) => s.id));
    const distinct = pool.filter((s) => kept.has(s.id));
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
        happens: step.brief ?? step.happens,
        cases: step.brief ? step.happens : null,
        matters: step.matters,
        next: null,
        nextPart: null,
        aside: k === 0 ? asideSentence({ ...pick.dropped, technical: technicalByChapter.get(c) ?? {} }) : null,
        story: [],
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
      station.nextPart = `Then the part “${chapters[after.chapter].label}” begins.`;
    }
  });
  placeStory(reading?.story ?? [], stations, chapters, guide, model);
  return { chapters, stations, overview: overviewOf(reading, stations, chapters, guide, model), walkSteps };
}

/* ------------------------------------------------------------- the overview */

/** Up to this many parts the overview names each; above, the first and the last (the full list is the part select). */
export const OVERVIEW_PARTS = 6;

/** "7 steps in 5 parts: Check authority, Read requisition, …" — with many parts, the first and the last. */
export function countSentence(steps: number, parts: readonly string[]): string {
  const what = `${steps} ${steps === 1 ? 'step' : 'steps'} in ${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`;
  if (parts.length === 0) return `${what}.`;
  if (parts.length <= OVERVIEW_PARTS) return `${what}: ${list([...parts])}.`;
  return `${what}, from “${parts[0]}” to “${parts[parts.length - 1]}”.`;
}

function overviewOf(
  reading: TourReading | null,
  stations: readonly TourStation[],
  chapters: readonly TourChapter[],
  guide: WalkGuide,
  model: ProcessMapModel,
): TourOverview {
  // Where it starts and ends: the map's top-level start and its first regular end, by their labels.
  const top = model.elements.filter((e) => e.event && e.plane === null);
  const start = top.find((e) => e.tag === 'startEvent' && e.label.trim());
  const end = top.find((e) => e.tag === 'endEvent' && !e.early && e.label.trim());
  const route = start && end ? `It starts at “${start.label.trim()}” and ends at “${end.label.trim()}”.` : null;
  // Who else takes part, as far as the code shows it — never a lane a model proposed.
  const roles = new Set(guide.business.map((id) => guide.byId[id]?.role));
  const others = [...(roles.has('remote') ? ['asks another system'] : []), ...(roles.has('mail') ? ['sends an e-mail'] : [])];
  return {
    purpose: reading?.purpose ?? [],
    trigger: reading?.trigger ?? null,
    route,
    involved: others.length ? `It also ${list(others)}.` : null,
    result: reading?.result ?? null,
    count: countSentence(stations.length, chapters.map((c) => c.label)),
  };
}

/* ------------------------------------------------- the story at the stations */

/** A label as it is compared: no "Decided by:" or "Only when", no closing mark, lower case. */
const core = (text: string): string =>
  text
    .replace(/^(?:decided by:|only when)\s*/i, '')
    .replace(/^the\s+/i, '')
    .replace(/[.?!]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** "L42" or "L60-75" as a range. */
const rangeOfLabel = (label: string | null): WalkRange | null => {
  const m = label ? /^L(\d+)(?:-(\d+))?$/.exec(label.trim()) : null;
  return m ? { lineStart: Number(m[1]), lineEnd: Number(m[2] ?? m[1]) } : null;
};

/**
 * Each story step goes to one station: the station it is; else the first
 * station of the part it is (a phase box); else the last station at or before
 * where it stands on the walk (the first station when none is before it); a
 * step off the walk goes where the story step before it went. A check the
 * station already says — a title of its part, or a line of what decides it —
 * is left out, and a step with nothing left is not placed. Exported for the spec.
 */
export function placeStory(
  story: readonly TourStoryStep[],
  stations: TourStation[],
  chapters: readonly TourChapter[],
  guide: WalkGuide,
  model: ProcessMapModel,
): void {
  if (stations.length === 0) return;
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const walk = Object.keys(guide.byId);
  const at = new Map(walk.map((id, i) => [id, i]));
  const stationAt = new Map(stations.map((s, i) => [s.id, i]));
  /** Whether `id` is `outer` or drawn on a level `outer` opens, at any depth. */
  const within = (id: string, outer: string): boolean => {
    let current = byId.get(id);
    for (let guard = 0; current && guard < 50; guard += 1) {
      if (current.id === outer) return true;
      current = current.plane ? byId.get(current.plane) : undefined;
    }
    return false;
  };
  let previous = 0;
  for (const step of story) {
    const element = model.elements.find((e) => e.nodeId === step.nodeId) ?? byId.get(step.nodeId) ?? null;
    let target: number | undefined = element ? stationAt.get(element.id) : undefined;
    if (target === undefined && element) {
      const chapter = chapters.find((c) => c.id === element.id);
      if (chapter) target = chapter.first;
    }
    if (target === undefined) {
      // Where the step stands on the walk: itself or the first step inside it, else the first step on its lines.
      let position = element ? walk.findIndex((id) => within(id, element.id)) : -1;
      if (position < 0 && step.anchor) {
        const range = step.anchor;
        position = walk.findIndex((id) => {
          const a = byId.get(id)?.anchor;
          return !!a && a.lineStart <= range.lineEnd && a.lineEnd >= range.lineStart;
        });
      }
      if (position < 0) {
        // Off the walk (a step on a branch): where the story step before it went — the story runs in the code's order.
        target = previous;
      } else {
        let before = 0;
        stations.forEach((s, i) => {
          if ((at.get(s.id) ?? Number.MAX_SAFE_INTEGER) <= position) before = i;
        });
        target = before;
      }
    }
    previous = target;
    const station = stations[target];
    // What the station says already, and the stations of its part (a check that is a station of its own is said there).
    const said = new Set([
      ...chapters[station.chapter].stations.map((i) => core(stations[i].title)),
      ...station.decides.map((d) => core(d.text)),
    ]);
    const checks = step.checks.filter((c) => c.trim() && !said.has(core(c)));
    const stops = step.stops.map((s) => withoutCodes(s)).filter((s) => s.trim() && !said.has(core(s)));
    if (checks.length === 0 && stops.length === 0) continue;
    const self = element?.id === station.id || core(step.text) === core(station.title);
    station.story.push({ step: self ? null : step.text, checks, stops });
  }
}

/* ------------------------------------------------ what the engine reads here */

const lineOf = (line: SummaryLine): WalkLine => {
  const first = line.anchors[0];
  return { text: line.text, anchor: first ? { lineStart: first.lineStart, lineEnd: first.lineEnd } : null };
};

/**
 * What the engine reads about the whole program for the tour: the aim the
 * program's names support (`lib/abap/program-domain.ts`, through the summary
 * facts), the First insights' "In short" without the table codes — purpose,
 * what it changes, what comes out, who starts it — and the story's checks and
 * stops in the engine's plain labels (no model's names). A part the engine
 * cannot read is left out; a summary that throws gives null.
 * `engineVersion`: the engine the summary and the story are read for (3.0.20)
 * — the project's run's.
 */
export function tourReadingOf(source: string, engineVersion: string | null = APP_VERSION): TourReading | null {
  let reading: TourReading;
  try {
    const facts = programSummaryFactsOf(source, { engineVersion });
    const lines = businessInShort(programSummary(facts), { codes: false }).filter((l) => l.basis !== 'not-determined' && l.text.trim());
    const purpose = lines.filter((l) => l.key === 'purpose' || l.key === 'changes').map(lineOf);
    const domain = facts.domain;
    if (domain && !purpose.some((l) => l.text === domain.text)) {
      const [line] = domain.lines;
      purpose.unshift({ text: domain.text, anchor: typeof line === 'number' ? { lineStart: line, lineEnd: line } : null });
    }
    const trigger = lines.find((l) => l.key === 'trigger');
    const result = lines.find((l) => l.key === 'result');
    reading = { purpose, trigger: trigger ? lineOf(trigger) : null, result: result ? lineOf(result) : null, story: [] };
  } catch {
    return null;
  }
  try {
    const story = processStory(readProcess(source).skeleton, source, null, engineVersion);
    reading.story = story.steps.map((s) => ({ text: s.text, nodeId: s.nodeId, anchor: rangeOfLabel(s.anchor), checks: s.checks, stops: s.stops }));
  } catch {
    reading.story = [];
  }
  return reading;
}
