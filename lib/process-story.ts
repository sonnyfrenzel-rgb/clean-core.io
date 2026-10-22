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
 * From engine 3.0.21 (`ENGINE_READS_3021_FROM`; owner decisions 22.10.2026):
 * a check or a stop on a raw dictionary field ("Mmsta 01 or Z9") is said with
 * the program's own text on that branch ("Material is blocked for purchasing
 * in this plant"), or left out of the business line and counted (`unsaid`) —
 * never said as a field name; a code value is said as its words; loops and
 * set-up steps left unopened are no steps — what they check rolls up into the
 * step before them; a stop is said once, at the first step it belongs to, and
 * without its message code.
 *
 * Pure and deterministic: the same source gives the same story. No model, no
 * network.
 */

import type { ProcessSkeleton, SkeletonNode } from './abap/process-skeleton';
import { plainLabels } from './abap/plain-language';
import { anchorLabel } from './first-look';
import { readDemoSwitches } from './abap/demo-switches';
import { engineReads3020Apply } from './abap/engine-reads-3020-gate';
import { engineReads3021Apply } from './abap/engine-reads-3021-gate';
import { armAroundLine, branchReadingOf, decisionArmsAt, plainValues, rawFieldsOf, type BranchReading } from './abap/branch-messages';
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
  /**
   * From engine 3.0.21: the checks and stops of the step on a raw dictionary
   * field for which the program gives no text of its own on that branch — left
   * out of the business line and counted, never said as a field name
   * (`lib/abap/branch-messages.ts`). The step keeps its anchor. Absent before.
   */
  unsaid?: number;
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

/** What a stop comes to: said in words, counted as technical (3.0.20), or counted as unsaid (3.0.21). */
type StopWords = { kind: 'said'; text: string } | { kind: 'technical' } | { kind: 'unsaid' };

/** A set-up step — "Initialize run", "Clear buffers": machinery of the program, not a step of the business (3.0.21). */
const SET_UP = /^(?:initiali[sz]e|init|set ?up|reset|clear|refresh)\b/i;
/** A message code after a stop's words — "not authorized (E002)": the words say it (3.0.21). */
const MESSAGE_CODE = /\s*\([A-Z]{1,2}\d{3}\)\s*$/;

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const wordIn = (text: string, word: string): boolean => new RegExp(`(?<![A-Za-z0-9])${escapeRe(word)}(?![A-Za-z0-9])`, 'i').test(text);
const withoutCode = (text: string): string => {
  const bareText = text.replace(MESSAGE_CODE, '').trim();
  return bareText.length > 0 ? bareText : text;
};

export function processStory(
  skeleton: ProcessSkeleton,
  source: string,
  /** Business names a model proposed, by node id — used where present. */
  businessNames?: ReadonlyMap<string, string> | null,
  /**
   * The engine the story is read for; from 3.0.20 technical checks are counted and demo cases set apart; from 3.0.21
   * raw field checks are said by the program's own text or counted, loops and set-up are no steps, and a stop is said
   * once, without its message code.
   */
  engineVersion: string | null = APP_VERSION,
): ProcessStory {
  const labels = plainLabels(skeleton, source);
  const reading: FirstLookReading | null = engineReads3020Apply(engineVersion)
    ? firstLookReadingOf(source, readDemoSwitches(source, engineVersion))
    : null;
  const plain: BranchReading | null = engineReads3021Apply(engineVersion) ? branchReadingOf(source) : null;
  let testData: ProcessStory['testData'] = null;
  /** A decision point the reader need not decide on (3.0.20). */
  const technicalCheck = (node: SkeletonNode): boolean => !!reading && !!node.anchor && technicalCheckAt(reading, node.anchor.lineStart);
  /** A decision point in plain words; from 3.0.20 a chain the wording calls "Which case applies" names its business arms. */
  const checkName = (node: SkeletonNode): string => {
    const label = bare(nameOf(node));
    if (!reading || !node.anchor || !/^which case applies$/i.test(label)) return label;
    return chainWordsAt(reading, node.anchor.lineStart) ?? label;
  };
  /**
   * 3.0.21: a check as the business line says it — a part of it on a raw dictionary field by the program's own text on
   * that arm, or left out; null when nothing of it can be said (the step counts it as unsaid). Before, the plain label.
   */
  const sayCheck = (node: SkeletonNode): string | null => {
    const label = checkName(node);
    if (!plain || !node.anchor || businessNames?.get(node.id)?.trim()) return label;
    const at = plain.statements.findIndex((s) => s.lineStart <= node.anchor!.lineStart && s.lineEnd >= node.anchor!.lineStart);
    const header = at >= 0 ? plain.statements[at] : null;
    // A CASE on a raw field: its arms are values of that field — nothing of it can be said in words.
    if (header && header.keyword.toUpperCase() === 'CASE') {
      const subject = header.text.replace(/\.\s*$/, '').replace(/^CASE\s+/i, '').trim();
      const raw = rawFieldsOf(subject, plain);
      return raw.length > 0 && raw.some((w) => wordIn(label, w)) ? null : plainValues(label);
    }
    const arms = decisionArmsAt(plain, node.anchor.lineStart);
    const raws = (arms ?? []).map((arm) => ({ arm, words: rawFieldsOf(arm.condition, plain) })).filter((x) => x.words.length > 0);
    if (raws.length === 0) return plainValues(label);
    const said: string[] = [];
    for (const part of label.split(/,\s+or\s+/)) {
      if (/^\d+ more$/.test(part)) {
        said.push(part);
        continue;
      }
      const hit = raws.find((x) => x.words.some((w) => wordIn(part, w)));
      if (!hit) said.push(plainValues(part));
      else if (hit.arm.message) said.push(hit.arm.message);
    }
    const words = unique(said);
    if (words.every((p) => /^\d+ more$/.test(p))) return null;
    return words.map((p, i) => (i === 0 ? sentence(p) : lower(p))).join(', or ');
  };
  /** A stop in plain words, or counted: technical (3.0.20), or a raw field the program says nothing about (3.0.21). */
  const stopOf = (node: SkeletonNode, label: string): StopWords => {
    const bareLabel = label.replace(STOP_PREFIX, '');
    let text = bareLabel;
    if (reading && node.anchor) {
      const read = stopReading(reading, node.anchor.lineStart, bareLabel);
      if (read.technical) return { kind: 'technical' };
      text = read.text;
    }
    if (!plain || !node.anchor) return { kind: 'said', text };
    const around = armAroundLine(plain, node.anchor.lineStart);
    const raw = around ? rawFieldsOf(around.arm.condition, plain) : [];
    if (around && raw.some((w) => wordIn(text, w))) {
      return around.arm.message ? { kind: 'said', text: withoutCode(lower(around.arm.message)) } : { kind: 'unsaid' };
    }
    return { kind: 'said', text: withoutCode(plainValues(text)) };
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

  interface Inside { checks: string[]; stops: string[]; technical: number; unsaid: number }
  /** The checks and stops of a region and the regions under it, a few levels down. */
  const inside = (region: string | null | undefined, depth: number, seen: Set<string>): Inside => {
    if (!region || depth > 3 || seen.has(region)) return { checks: [], stops: [], technical: 0, unsaid: 0 };
    seen.add(region);
    const checks: string[] = [];
    const stops: string[] = [];
    let technical = 0;
    let unsaid = 0;
    for (const node of byRegion.get(region) ?? []) {
      if (node.kind === 'gateway') {
        if (technicalCheck(node)) technical += 1;
        else {
          const check = sayCheck(node);
          if (check === null) unsaid += 1;
          else checks.push(check);
        }
      } else if (node.kind === 'end-error' || (node.kind === 'end' && node.detail?.early === true)) {
        const label = nameOf(node);
        if (STOP_PREFIX.test(label)) {
          const stop = stopOf(node, label);
          if (stop.kind === 'technical') technical += 1;
          else if (stop.kind === 'unsaid') unsaid += 1;
          else stops.push(stop.text);
        }
      }
      if (node.expandsTo) {
        const deeper = inside(node.expandsTo, depth + 1, seen);
        checks.push(...deeper.checks);
        stops.push(...deeper.stops);
        technical += deeper.technical;
        unsaid += deeper.unsaid;
      }
    }
    return { checks: unique(checks), stops: unique(stops), technical, unsaid };
  };

  /** 3.0.21: a loop or a set-up step — machinery, not a step of the business story. */
  const machinery = (item: Item): boolean => !!plain && (item.loop || SET_UP.test(item.text));

  const itemsOf = (region: string, within: string | null): Item[] => {
    const out: Item[] = [];
    // Decision points before the first step of a level wait for it.
    let pending: string[] = [];
    let pendingTechnical = 0;
    let pendingUnsaid = 0;
    for (const node of byRegion.get(region) ?? []) {
      const previous = out[out.length - 1];
      if (node.kind === 'gateway') {
        // A decision point between two steps belongs to the step before it:
        // "… — checks: not rejected".
        if (technicalCheck(node)) {
          if (previous) previous.technical = (previous.technical ?? 0) + 1;
          else pendingTechnical += 1;
          continue;
        }
        const check = sayCheck(node);
        if (check === null) {
          if (previous) previous.unsaid = (previous.unsaid ?? 0) + 1;
          else pendingUnsaid += 1;
        } else if (previous) previous.checks = unique([...previous.checks, check]);
        else pending.push(check);
        continue;
      }
      if (node.kind === 'end-error' || (node.kind === 'end' && node.detail?.early === true)) {
        const label = nameOf(node);
        if (previous && STOP_PREFIX.test(label)) {
          const stop = stopOf(node, label);
          if (stop.kind === 'technical') previous.technical = (previous.technical ?? 0) + 1;
          else if (stop.kind === 'unsaid') previous.unsaid = (previous.unsaid ?? 0) + 1;
          else previous.stops = unique([...previous.stops, stop.text]);
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
        pendingUnsaid = 0;
        continue;
      }
      const text = sentence(nameOf(node));
      const loop = node.kind === 'loop' || String(node.detail?.multiInstance ?? '') === 'true';
      // 3.0.21: a loop left unopened rolls up into the step around it — with what it checks.
      const deeper = loop
        ? plain ? inside(loopRegion(node), 1, new Set()) : { checks: [], stops: [], technical: 0, unsaid: 0 }
        : inside(node.expandsTo, 1, new Set());
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
        ...(plain ? { unsaid: pendingUnsaid + deeper.unsaid } : {}),
      });
      pending = [];
      pendingTechnical = 0;
      pendingUnsaid = 0;
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
  // process often sits one routine, or one loop, down. From 3.0.21 loops and
  // set-up do not count as steps, and a set-up step is not opened.
  const counted = (list: Item[]) => list.filter((item) => !machinery(item)).length;
  for (let guard = 0; guard < 6 && counted(items) + (testData ? 1 : 0) < STORY_MIN; guard += 1) {
    const at = items.findIndex(
      (item) => item.expands && !(plain && !item.loop && SET_UP.test(item.text)) && (byRegion.get(item.expands) ?? []).some((n) => !NOT_A_STEP.has(n.kind)),
    );
    if (at < 0) break;
    const item = items[at];
    const within = item.loop ? item.text : item.within;
    const opened = itemsOf(item.expands as string, within);
    if (opened.length === 0) break;
    // The decision points of an opened step stay with the steps they stand between.
    items = [...items.slice(0, at), ...opened, ...items.slice(at + 1)];
  }

  // 3.0.21: loops and set-up left unopened are no steps of the story; what they
  // check and where they stop rolls up into the step before them (the step
  // after them, at the start).
  if (plain && counted(items) > 0) {
    const kept: Item[] = [];
    let carry: Item | null = null;
    const fold = (into: Item, from: Item) => {
      into.checks = unique([...into.checks, ...from.checks]);
      into.stops = unique([...into.stops, ...from.stops]);
      if (from.technical !== undefined) into.technical = (into.technical ?? 0) + from.technical;
      if (from.unsaid !== undefined) into.unsaid = (into.unsaid ?? 0) + from.unsaid;
    };
    for (const item of items) {
      const copy: Item = { ...item, checks: [...item.checks], stops: [...item.stops] };
      if (machinery(item)) {
        const last = kept[kept.length - 1];
        if (last) fold(last, copy);
        else if (carry) fold(carry, copy);
        else carry = copy;
        continue;
      }
      if (carry) {
        fold(copy, carry);
        carry = null;
      }
      kept.push(copy);
    }
    items = kept;
  }

  // The same step twice in a row is one step — from 3.0.21 also when one of the
  // two stood in a loop: the loop is no step of its own.
  const merged: Item[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    if (last && last.text === item.text && (plain !== null || last.within === item.within)) {
      last.checks = unique([...last.checks, ...item.checks]);
      last.stops = unique([...last.stops, ...item.stops]);
      if (item.technical !== undefined) last.technical = (last.technical ?? 0) + item.technical;
      if (item.unsaid !== undefined) last.unsaid = (last.unsaid ?? 0) + item.unsaid;
    } else merged.push({ ...item, checks: [...item.checks], stops: [...item.stops] });
  }

  // More than eight: join neighbours, the pair that carries least first.
  const load = (item: Item) => item.checks.length + item.stops.length + (item.technical ?? 0) + (item.unsaid ?? 0);
  while (merged.length > STORY_MAX) {
    let best = 0;
    let weight = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i + 1 < merged.length; i += 1) {
      if (merged[i].within !== merged[i + 1].within) continue;
      const w = plain ? load(merged[i]) + load(merged[i + 1]) : merged[i].checks.length + merged[i].stops.length + (merged[i].technical ?? 0) + merged[i + 1].checks.length + merged[i + 1].stops.length + (merged[i + 1].technical ?? 0);
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
      ...(a.unsaid !== undefined || b.unsaid !== undefined ? { unsaid: (a.unsaid ?? 0) + (b.unsaid ?? 0) } : {}),
    });
  }

  // 3.0.21: a stop is said once, at the first step it belongs to.
  if (plain) {
    const said = new Set<string>();
    for (const item of merged) {
      item.stops = item.stops.filter((stop) => {
        const key = stop.toLowerCase();
        if (said.has(key)) return false;
        said.add(key);
        return true;
      });
    }
  }

  return {
    steps: merged.map(({ text, within, checks, stops, anchor, nodeId, technical, unsaid }) => ({
      text, within, checks, stops, anchor, nodeId,
      ...(technical !== undefined ? { technical } : {}),
      ...(plain && unsaid !== undefined ? { unsaid } : {}),
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
