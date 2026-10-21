/**
 * The old process as a short story — the opening of the Business view.
 *
 * Owner, 03.10.2026: *"The start is far too technical for a business user; he
 * just wants to know more about his old process."* The first card used to
 * open on a table count, an ABAP condition and a strip of figures. This module
 * turns the same reading into what a process owner asks first — what happens,
 * in which order — as five to eight numbered steps, each with the line it was
 * read from.
 *
 * **Nothing is added to the code.** Every step is a node of the skeleton the
 * map draws, named by the plain wording the map uses (`plainLabels`) — or by a
 * business name a model proposed, where one is stored, and then the caller
 * marks the story as a model proposal. What a step checks are the plain
 * labels of the decision points inside it; where it can stop are the plain
 * labels of the error ends and early ends inside it. No role, no purpose and no
 * consequence is named that the code does not name: "a buyer" appears only if
 * the code says buyer.
 *
 * **The order is the code's.** The steps follow the entry the program starts
 * at, in source order. A level that holds one step which opens a level of its
 * own is opened (as the map opens, `WorkspaceProcess.tsx`), so a program whose
 * whole process sits one routine down does not read as one step. Steps that
 * say the same thing in a row are one step; more than eight are joined in
 * pairs, the pair that carries least first — the story stays short and loses
 * no step.
 *
 * Pure and deterministic: the same source gives the same story. No model, no
 * network.
 */

import type { ProcessSkeleton, SkeletonNode } from './abap/process-skeleton';
import { plainLabels } from './abap/plain-language';
import { anchorLabel } from './first-look';
import { readDemoSwitches } from './abap/demo-switches';
import { engineReads3020Apply } from './abap/engine-reads-3020-gate';
import { APP_VERSION } from './version';
import {
  chainWordsAt,
  firstLookReadingOf,
  listChangeAt,
  stopReading,
  technicalCheckAt,
  testDataStepAt,
  type FirstLookReading,
} from './first-look-plain';

export interface StoryStep {
  /** The step in plain words — "Check authority". Sentence case. */
  text: string;
  /** The loop the step runs in, in plain words — "For each trip" — or null. */
  within: string | null;
  /** What the step checks — the plain labels of its decision points, without "?". */
  checks: string[];
  /** Where it can end the run — "not authorized (E002)". */
  stops: string[];
  /** The line the step was read from, `L42` or `L60-75`; null without one. */
  anchor: string | null;
  /** The skeleton node the step starts at. */
  nodeId: string;
  /**
   * From engine 3.0.20: the technical checks and stops of the step — counted,
   * never listed (`lib/first-look-plain.ts`). Absent before.
   */
  technical?: number;
}

export interface ProcessStory {
  steps: StoryStep[];
  /** True when a model's business name was used for at least one step. */
  proposedNames: boolean;
  /**
   * From engine 3.0.20: the step that runs the program's own demo cases, set
   * apart — it is test data, not a step of the business process. Absent before
   * and null when the program has none.
   */
  testData?: { anchor: string | null; flag: string; cases: number } | null;
}

export const STORY_MIN = 4;
export const STORY_MAX = 8;

const NOT_A_STEP = new Set<SkeletonNode['kind']>([
  'start',
  'end',
  'end-error',
  'gateway',
  'parallel-gateway',
  'error-boundary',
]);

const STOP_PREFIX = /^(stop|stopped|rejected)\s*:\s*/i;

interface Item extends StoryStep {
  expands: string | null;
  loop: boolean;
}

const sentence = (text: string): string => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
const lower = (text: string): string => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);
const bare = (label: string): string => label.replace(/\?\s*$/, '').trim();
const unique = (list: string[]): string[] => [...new Set(list.filter((x) => x.length > 0))];

function order(a: SkeletonNode, b: SkeletonNode): number {
  return (a.anchor?.lineStart ?? Number.MAX_SAFE_INTEGER) - (b.anchor?.lineStart ?? Number.MAX_SAFE_INTEGER);
}

export function processStory(
  skeleton: ProcessSkeleton,
  source: string,
  /** Business names a model proposed, by node id — used where present. */
  businessNames?: ReadonlyMap<string, string> | null,
  /** The engine the story is read for; from 3.0.20 technical checks are counted and demo cases set apart. */
  engineVersion: string | null = APP_VERSION,
): ProcessStory {
  const labels = plainLabels(skeleton, source);
  const reading: FirstLookReading | null = engineReads3020Apply(engineVersion)
    ? firstLookReadingOf(source, readDemoSwitches(source, engineVersion))
    : null;
  let testData: ProcessStory['testData'] = null;
  /** A decision point the reader need not decide on (3.0.20). */
  const technicalCheck = (node: SkeletonNode): boolean => !!reading && !!node.anchor && technicalCheckAt(reading, node.anchor.lineStart);
  /** A decision point in plain words; from 3.0.20 a chain the wording calls "Which case applies" names its business arms. */
  const checkName = (node: SkeletonNode): string => {
    const label = bare(nameOf(node));
    if (!reading || !node.anchor || !/^which case applies$/i.test(label)) return label;
    return chainWordsAt(reading, node.anchor.lineStart) ?? label;
  };
  /** A stop in plain words, or null when it is technical and only counted (3.0.20). */
  const stopOf = (node: SkeletonNode, label: string): string | null => {
    const bareLabel = label.replace(STOP_PREFIX, '');
    if (!reading || !node.anchor) return bareLabel;
    const read = stopReading(reading, node.anchor.lineStart, bareLabel);
    return read.technical ? null : read.text;
  };
  let proposed = false;
  const nameOf = (node: SkeletonNode): string => {
    const business = businessNames?.get(node.id)?.trim();
    if (business) {
      proposed = true;
      return business;
    }
    return (labels.nodes.get(node.id) || '').trim() || node.label;
  };

  const byRegion = new Map<string, SkeletonNode[]>();
  for (const node of skeleton.nodes) byRegion.set(node.region, [...(byRegion.get(node.region) ?? []), node]);
  for (const list of byRegion.values()) list.sort(order);

  /** The checks and stops of a region and the regions under it, a few levels down. */
  const inside = (region: string | null | undefined, depth: number, seen: Set<string>): { checks: string[]; stops: string[]; technical: number } => {
    if (!region || depth > 3 || seen.has(region)) return { checks: [], stops: [], technical: 0 };
    seen.add(region);
    const checks: string[] = [];
    const stops: string[] = [];
    let technical = 0;
    for (const node of byRegion.get(region) ?? []) {
      if (node.kind === 'gateway') {
        if (technicalCheck(node)) technical += 1;
        else checks.push(checkName(node));
      } else if (node.kind === 'end-error' || (node.kind === 'end' && node.detail?.early === true)) {
        const label = nameOf(node);
        if (STOP_PREFIX.test(label)) {
          const stop = stopOf(node, label);
          if (stop === null) technical += 1;
          else stops.push(stop);
        }
      }
      if (node.expandsTo) {
        const deeper = inside(node.expandsTo, depth + 1, seen);
        checks.push(...deeper.checks);
        stops.push(...deeper.stops);
        technical += deeper.technical;
      }
    }
    return { checks: unique(checks), stops: unique(stops), technical };
  };

  const itemsOf = (region: string, within: string | null): Item[] => {
    const out: Item[] = [];
    // Decision points before the first step of a level wait for it.
    let pending: string[] = [];
    let pendingTechnical = 0;
    for (const node of byRegion.get(region) ?? []) {
      const previous = out[out.length - 1];
      if (node.kind === 'gateway') {
        // A decision point between two steps belongs to the step before it:
        // "… — checks: not rejected".
        if (technicalCheck(node)) {
          if (previous) previous.technical = (previous.technical ?? 0) + 1;
          else pendingTechnical += 1;
        } else if (previous) previous.checks = unique([...previous.checks, checkName(node)]);
        else pending.push(checkName(node));
        continue;
      }
      if (node.kind === 'end-error' || (node.kind === 'end' && node.detail?.early === true)) {
        const label = nameOf(node);
        if (previous && STOP_PREFIX.test(label)) {
          const stop = stopOf(node, label);
          if (stop === null) previous.technical = (previous.technical ?? 0) + 1;
          else previous.stops = unique([...previous.stops, stop]);
        }
        continue;
      }
      if (NOT_A_STEP.has(node.kind)) continue;
      // 3.0.20: the program's own demo cases are test data, said apart — not a step.
      if (reading && node.anchor && testDataStepAt(reading, node.anchor.lineStart)) {
        if (!testData && reading.demo) {
          testData = {
            anchor: anchorLabel(node.anchor.lineStart, node.anchor.lineEnd),
            flag: reading.demo.flag.name,
            cases: reading.demo.cases.reduce((n, c) => n + c.arms, 0),
          };
        }
        pending = [];
        pendingTechnical = 0;
        continue;
      }
      const text = sentence(nameOf(node));
      const loop = node.kind === 'loop' || String(node.detail?.multiInstance ?? '') === 'true';
      const deeper = loop ? { checks: [], stops: [], technical: 0 } : inside(node.expandsTo, 1, new Set());
      out.push({
        text,
        within,
        checks: unique([...pending, ...deeper.checks]),
        stops: deeper.stops,
        anchor: node.anchor ? anchorLabel(node.anchor.lineStart, node.anchor.lineEnd) : null,
        nodeId: node.id,
        expands: node.expandsTo ?? (loop ? loopRegion(node) : null),
        loop,
        ...(reading ? { technical: pendingTechnical + deeper.technical } : {}),
      });
      pending = [];
      pendingTechnical = 0;
    }
    return out;
  };

  /** The region a loop node opens, when the skeleton names one for it. */
  const loopRegion = (node: SkeletonNode): string | null => {
    if (node.expandsTo) return node.expandsTo;
    const line = node.anchor?.lineStart;
    if (line === undefined) return null;
    for (const region of byRegion.keys()) if (region.startsWith('loop:') && region.endsWith(`@${line}`)) return region;
    return null;
  };

  // The entry the program's work starts at: START-OF-SELECTION where there is
  // one, else the entry with the most steps (an INITIALIZATION that only sets
  // defaults is not the process).
  const stepsIn = (region: string) => (byRegion.get(region) ?? []).filter((n) => !NOT_A_STEP.has(n.kind)).length;
  const entry =
    skeleton.entries.find((e) => /START-OF-SELECTION/i.test(e) && stepsIn(e) > 0) ??
    [...skeleton.entries].sort((a, b) => stepsIn(b) - stepsIn(a))[0];
  if (!entry) return { steps: [], proposedNames: false };
  let items = itemsOf(entry, null);

  // Open levels while the story is too short to say anything: the program's
  // process often sits one routine, or one loop, down.
  for (let guard = 0; guard < 6 && items.length + (testData ? 1 : 0) < STORY_MIN; guard += 1) {
    const at = items.findIndex((item) => item.expands && (byRegion.get(item.expands) ?? []).some((n) => !NOT_A_STEP.has(n.kind)));
    if (at < 0) break;
    const item = items[at];
    const within = item.loop ? item.text : item.within;
    const opened = itemsOf(item.expands as string, within);
    if (opened.length === 0) break;
    // The decision points of an opened step stay with the steps they stand between.
    items = [...items.slice(0, at), ...opened, ...items.slice(at + 1)];
  }

  // The same step twice in a row is one step.
  const merged: Item[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    if (last && last.text === item.text && last.within === item.within) {
      last.checks = unique([...last.checks, ...item.checks]);
      last.stops = unique([...last.stops, ...item.stops]);
      if (item.technical !== undefined) last.technical = (last.technical ?? 0) + item.technical;
    } else merged.push({ ...item, checks: [...item.checks], stops: [...item.stops] });
  }

  // More than eight: join neighbours, the pair that carries least first.
  while (merged.length > STORY_MAX) {
    let best = 0;
    let weight = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i + 1 < merged.length; i += 1) {
      if (merged[i].within !== merged[i + 1].within) continue;
      const w = merged[i].checks.length + merged[i].stops.length + (merged[i].technical ?? 0) + merged[i + 1].checks.length + merged[i + 1].stops.length + (merged[i + 1].technical ?? 0);
      if (w < weight) {
        weight = w;
        best = i;
      }
    }
    const a = merged[best];
    const b = merged[best + 1];
    merged.splice(best, 2, {
      ...a,
      text: `${a.text}, then ${lower(b.text)}`,
      checks: unique([...a.checks, ...b.checks]),
      stops: unique([...a.stops, ...b.stops]),
      ...(a.technical !== undefined || b.technical !== undefined ? { technical: (a.technical ?? 0) + (b.technical ?? 0) } : {}),
    });
  }

  return {
    steps: merged.map(({ text, within, checks, stops, anchor, nodeId, technical }) => ({
      text, within, checks, stops, anchor, nodeId, ...(technical !== undefined ? { technical } : {}),
    })),
    proposedNames: proposed,
    ...(reading ? { testData } : {}),
  };
}

/**
 * What the program changes, in the map's plain words — "Create purchase
 * order", "Update purchase requisition" — each once, with its line. Read off
 * the nodes that write, call a creating function or start a workflow; a name
 * the wording has no word for keeps the code's own name.
 */
export interface StoryChange {
  text: string;
  anchor: string | null;
}

const CHANGING = /^(create|update|change|delete|insert|modify|post|send|start|store|log|book|release|approve|save)\b/i;
/** Creating first, then changing, then the rest — what a business reader asks about first. */
const WEIGHT = (text: string): number =>
  /^create\b/i.test(text)
    ? 0
    : /^(update|change|modify|delete|insert)\b/i.test(text)
      ? 1
      : /^(start|send|post|release|approve|book)\b/i.test(text)
        ? 2
        : 3;

export function processChanges(
  skeleton: ProcessSkeleton,
  source: string,
  max = 5,
  /** From engine 3.0.20 a change to the result list says what each line is marked with (`listChangeAt`). */
  engineVersion: string | null = APP_VERSION,
): { changes: StoryChange[]; more: number } {
  const labels = plainLabels(skeleton, source);
  const reading = engineReads3020Apply(engineVersion) ? firstLookReadingOf(source, null) : null;
  const seen = new Set<string>();
  const all: StoryChange[] = [];
  for (const node of [...skeleton.nodes].sort(order)) {
    if (!['write', 'service-task', 'send-task', 'transaction', 'task'].includes(node.kind)) continue;
    const label = sentence((labels.nodes.get(node.id) || '').trim() || node.label);
    const listChange = reading && node.anchor && /\bin the list$/i.test(label) ? listChangeAt(reading, node.anchor.lineStart) : null;
    const text = listChange ?? label;
    if ((!listChange && !CHANGING.test(text)) || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    all.push({ text, anchor: node.anchor ? anchorLabel(node.anchor.lineStart, node.anchor.lineEnd) : null });
  }
  const ranked = all
    .map((c, i) => ({ c, i }))
    .sort((a, b) => WEIGHT(a.c.text) - WEIGHT(b.c.text) || a.i - b.i)
    .map((x) => x.c);
  return { changes: ranked.slice(0, max), more: Math.max(0, ranked.length - max) };
}
