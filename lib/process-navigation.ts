import {
  elementsOfPlane,
  type ProcessMapBranch,
  type ProcessMapElement,
  type ProcessMapModel,
} from './process-map';

/**
 * Navigating a large process — roadmap 2.9, `DESIGN.md` §5.9.
 *
 * 2.5 draws the process the engine reconstructed and 2.6 writes it out; both
 * work on the eight small examples and neither scales: the 1.000-line example
 * is 65 flow nodes on 8 levels, and a flat list of 65 rows is a haystack, not a
 * process. The acceptance of this step is a number rather than an adjective —
 * **every step reachable in at most three actions, by keyboard as by mouse** —
 * so everything here exists to shorten a path a reader has to walk, and
 * `tests/process-navigation.spec.ts` counts those actions for all 65 of them.
 *
 * Pure: no React, no DOM, no network, no model. Everything is read off the
 * model 2.5 already built, out of the file 2.6 already wrote, and the business
 * rules 3.4 already derived from the same signed source. Nothing here decides
 * anything about the code; it decides where things are on a screen.
 *
 * **Stable by construction.** There is no layout engine in this file and no
 * randomness: an element's address is its position in the plane's flow order,
 * and that order is `alongTheFlow` in `lib/process-map.ts` — a depth-first walk
 * of the file's own sequence flows. The same source therefore gives the same
 * outline number, the same tree, the same mini-map, on every reload and on
 * every machine (`DESIGN.md` §5.9 item 10). A reader can learn that the credit
 * check is step 6.2 and it stays step 6.2.
 */

/* ------------------------------------------------------------------ *
 * The outline.
 * ------------------------------------------------------------------ */

export interface NavigationEntry {
  /** The BPMN element id. */
  id: string;
  /**
   * The outline number — `6` on the top level, `6.2` one level down.
   *
   * It is the address of a step and it is short enough to type, which is what
   * makes the third action of the keyboard path a single keystroke rather than
   * a walk. It is shown on the element everywhere it appears.
   */
  outline: string;
  /** 0 on the top plane. */
  depth: number;
  /** The plane this element sits on; null for the top plane. */
  plane: string | null;
  /** The plane it opens when it is a sub-process, and that plane exists. */
  opensPlane: string | null;
  /** The elements of the plane it opens, in flow order. Empty otherwise. */
  children: string[];
  /** The sub-process elements above it, outermost first — the path line. */
  ancestors: string[];
  /** Position in `order`. Ties in search are broken by it, so ranking is stable. */
  index: number;
}

export interface ProcessNavigation {
  /** Every element id, in outline order: a plane's elements, then what each opens. */
  order: string[];
  entries: Map<string, NavigationEntry>;
  /** The elements of the top plane, in flow order. */
  roots: string[];
  /** Plane id (null for the top) → its element ids, in flow order. */
  planes: Map<string | null, string[]>;
}

/**
 * The outline of a model.
 *
 * Depth-first: every element of a plane in the order the flow visits it, and
 * immediately after a sub-process the elements of the plane it opens. That is
 * the order a reader reads a process in, so it is the order of the tree, of the
 * mini-map and of the search ranking — one order, learnt once.
 */
export function buildNavigation(model: ProcessMapModel): ProcessNavigation {
  const planes = new Map<string | null, string[]>();
  const elementsByPlane = new Map<string | null, ProcessMapElement[]>();
  for (const plane of model.planes) {
    const list = elementsOfPlane(model, plane.id);
    elementsByPlane.set(plane.id, list);
    planes.set(plane.id, list.map((element) => element.id));
  }

  const entries = new Map<string, NavigationEntry>();
  const order: string[] = [];

  const walk = (
    plane: string | null,
    prefix: string,
    depth: number,
    ancestors: string[],
    open: Set<string>,
  ): void => {
    const list = elementsByPlane.get(plane) ?? [];
    list.forEach((element, position) => {
      const outline = prefix ? `${prefix}.${position + 1}` : String(position + 1);
      // A sub-process whose plane is already open above it would be a cycle.
      // The file cannot write one today; a reader would meet an infinite tree
      // if it ever could, which is the kind of thing a guard costs one line.
      const opens = element.opensPlane
        && elementsByPlane.has(element.opensPlane)
        && !open.has(element.opensPlane)
        ? element.opensPlane
        : null;
      entries.set(element.id, {
        id: element.id,
        outline,
        depth,
        plane,
        opensPlane: opens,
        children: opens ? (planes.get(opens) ?? []) : [],
        ancestors,
        index: order.length,
      });
      order.push(element.id);
      if (opens) {
        open.add(opens);
        walk(opens, outline, depth + 1, [...ancestors, element.id], open);
        open.delete(opens);
      }
    });
  };

  walk(null, '', 0, [], new Set());

  return { order, entries, roots: planes.get(null) ?? [], planes };
}

/**
 * The level a step is read on.
 *
 * For a sub-process that is **the level it opens**, not the level it sits on:
 * `DESIGN.md` §5.9 item 1 — Enter or a double-click on a collapsed sub-process
 * opens it as its own level. One rule, used by the map, by the address and by
 * the crumbs, so that selecting a phase and sharing the link that comes out of
 * it land in the same place.
 */
export function levelOf(nav: ProcessNavigation, elementId: string): string | null {
  const entry = nav.entries.get(elementId);
  if (!entry) return null;
  return entry.opensPlane ?? entry.plane;
}

/** The path line above the map: the ancestors of an open plane, outermost first. */
export function planePath(nav: ProcessNavigation, plane: string | null): string[] {
  if (!plane) return [];
  const entry = nav.entries.get(plane);
  if (!entry) return [];
  return [...entry.ancestors, plane];
}

/* ------------------------------------------------------------------ *
 * Paths through one plane.
 * ------------------------------------------------------------------ */

/**
 * Where reading a level starts.
 *
 * An entry point is a `startEvent`, or an element nothing inside the level
 * points at. Two corrections, both measured on the 1.000-line example:
 *
 *   - **a loop-back to itself is not an inbound flow.** `LOOP AT gt_orders` is
 *     drawn as a gateway with an arrow back to itself, and counting that arrow
 *     made the head of every loop look entered from somewhere — five of the
 *     seven levels then had no entry point at all;
 *   - **a boundary event is attached, not entered.** It hangs off an activity
 *     for the error case, so starting the main path there would call the error
 *     path the normal one.
 *
 * A level that is genuinely one closed cycle has no entry point the file states.
 * Reading still has to start somewhere, so it starts at the first element in
 * flow order that leads anywhere — and this function says so by returning it,
 * rather than by pretending the file named it.
 */
function entryPoints(model: ProcessMapModel, ids: readonly string[]): string[] {
  const inPlane = new Set(ids);
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const targeted = new Set<string>();
  for (const id of ids) {
    for (const branch of byId.get(id)?.branches ?? []) {
      if (inPlane.has(branch.to) && branch.to !== id) targeted.add(branch.to);
    }
  }
  const stated = ids.filter((id) => {
    const element = byId.get(id);
    if (!element) return false;
    if (element.tag === 'startEvent') return true;
    return element.tag !== 'boundaryEvent' && !targeted.has(id);
  });
  if (stated.length > 0) return stated;
  const fallback = ids.find((id) => {
    const element = byId.get(id);
    return !!element && element.tag !== 'boundaryEvent'
      && element.branches.some((branch) => inPlane.has(branch.to) && branch.to !== id);
  });
  return fallback ? [fallback] : ids.slice(0, 1);
}

/**
 * *"Main path"* — the way to the normal end over the default branches.
 *
 * `DESIGN.md` §5.9 item 6. A gateway's default branch is the one the file
 * writes without a condition; where there is none, the first branch the file
 * writes is taken, because that is the order `alongTheFlow` already reads the
 * process in and a second rule would be a second opinion. Never enters the same
 * element twice, so a loop ends the walk rather than the browser.
 */
export function mainPath(model: ProcessMapModel, nav: ProcessNavigation, plane: string | null): string[] {
  const ids = nav.planes.get(plane) ?? [];
  if (ids.length === 0) return [];
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const inPlane = new Set(ids);

  const path: string[] = [];
  const seen = new Set<string>();
  // From **every** root, not only the first. The top plane of a report is one
  // plane holding several event blocks — `INITIALIZATION`, `AT
  // SELECTION-SCREEN`, `START-OF-SELECTION`, `END-OF-SELECTION` — and a run
  // goes through all of them in turn. A walk from the first root alone reached
  // two of the 23 elements of the 1.000-line example and called that the main
  // path.
  for (const root of entryPoints(model, ids)) {
    let current: string | undefined = root;
    while (current && !seen.has(current)) {
      seen.add(current);
      path.push(current);
      // A loop's own back edge is not a step forward: taking it would end the
      // walk at the head of the loop and call that the way to the end.
      const here: string = current;
      const branches: ProcessMapBranch[] = (byId.get(here)?.branches ?? [])
        .filter((branch) => inPlane.has(branch.to) && branch.to !== here);
      const next = branches.find((branch) => branch.condition === '') ?? branches[0];
      current = next?.to;
    }
  }
  return path;
}

/**
 * *"Show paths to here"* — every element on a way from the start of the plane
 * to the selected one.
 *
 * An element is on such a way when it is reachable from a root **and** the
 * target is reachable from it. Both halves are needed: reachability alone keeps
 * the whole plane, and the branch the reader is asking about is exactly the one
 * that does not lead here.
 */
export function pathsToHere(
  model: ProcessMapModel,
  nav: ProcessNavigation,
  plane: string | null,
  target: string,
): Set<string> {
  const ids = nav.planes.get(plane) ?? [];
  const inPlane = new Set(ids);
  if (!inPlane.has(target)) return new Set();
  const byId = new Map(model.elements.map((element) => [element.id, element]));

  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  const push = (edges: Map<string, string[]>, from: string, to: string) => {
    const held = edges.get(from);
    if (held) held.push(to);
    else edges.set(from, [to]);
  };
  for (const id of ids) {
    for (const branch of byId.get(id)?.branches ?? []) {
      if (!inPlane.has(branch.to)) continue;
      push(forward, id, branch.to);
      push(backward, branch.to, id);
    }
  }

  const reach = (from: readonly string[], edges: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>(from);
    const stack = [...from];
    while (stack.length) {
      const id = stack.pop() as string;
      for (const next of edges.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    return seen;
  };

  const fromStart = reach(entryPoints(model, ids), forward);
  const toTarget = reach([target], backward);
  const on = new Set<string>();
  for (const id of fromStart) if (toTarget.has(id)) on.add(id);
  on.add(target);
  return on;
}

/* ------------------------------------------------------------------ *
 * Search.
 * ------------------------------------------------------------------ */

export type SearchReason = 'outline' | 'id' | 'name' | 'technical' | 'kind' | 'line' | 'condition';

export interface ProcessSearchHit {
  id: string;
  outline: string;
  plane: string | null;
  label: string;
  kind: string;
  /** What matched — shown beside the hit, so a reader knows why it is there. */
  reason: SearchReason;
}

const LINE_QUERY = /^l\s*(\d+)$/i;

/**
 * Every element the query names, best first, across **all** levels.
 *
 * `DESIGN.md` §5.9 item 9. Two properties matter more than the ranking:
 *
 *   - **an outline number matches exactly one element**, and it ranks first.
 *     Labels do not: the 1.000-line example has 65 elements and 42 distinct
 *     labels, so a name is not an address and a search that only knew names
 *     could not promise a reader a particular step in one keystroke;
 *   - **ties break on the outline order**, never on iteration order, so the
 *     same query gives the same list on every machine.
 */
export function searchProcess(
  model: ProcessMapModel,
  nav: ProcessNavigation,
  query: string,
): ProcessSearchHit[] {
  const raw = query.trim();
  if (!raw) return [];
  const q = raw.toLowerCase();
  const line = LINE_QUERY.exec(raw);
  const lineNumber = line ? Number(line[1]) : /^\d+$/.test(raw) ? Number(raw) : null;

  const best = new Map<string, { rank: number; reason: SearchReason }>();
  const keep = (id: string, rank: number, reason: SearchReason) => {
    const held = best.get(id);
    if (!held || rank < held.rank) best.set(id, { rank, reason });
  };

  for (const element of model.elements) {
    const entry = nav.entries.get(element.id);
    if (!entry) continue;
    const outline = entry.outline;
    const label = element.label.toLowerCase();
    const technical = element.technicalName.toLowerCase();

    if (outline === q) keep(element.id, 0, 'outline');
    if (element.id.toLowerCase() === q) keep(element.id, 1, 'id');
    if (label === q || technical === q) keep(element.id, 2, 'name');
    if (label.startsWith(q) || technical.startsWith(q)) keep(element.id, 3, 'name');
    if (label.includes(q) || technical.includes(q)) {
      keep(element.id, 4, label.includes(q) ? 'name' : 'technical');
    }
    if (outline.startsWith(`${q}.`)) keep(element.id, 5, 'outline');
    if (
      lineNumber !== null && element.anchor
      && lineNumber >= element.anchor.lineStart && lineNumber <= element.anchor.lineEnd
    ) {
      keep(element.id, 6, 'line');
    }
    if (element.kind.toLowerCase().includes(q)) keep(element.id, 7, 'kind');
    if (element.branches.some((branch) => branch.condition.toLowerCase().includes(q))) {
      keep(element.id, 8, 'condition');
    }
  }

  const byId = new Map(model.elements.map((element) => [element.id, element]));
  return [...best.entries()]
    .sort((a, b) => a[1].rank - b[1].rank
      || (nav.entries.get(a[0])?.index ?? 0) - (nav.entries.get(b[0])?.index ?? 0))
    .map(([id, { reason }]) => {
      const element = byId.get(id) as ProcessMapElement;
      const entry = nav.entries.get(id) as NavigationEntry;
      return { id, outline: entry.outline, plane: entry.plane, label: element.label, kind: element.kind, reason };
    });
}

/* ------------------------------------------------------------------ *
 * Overlays — marks, never a different process.
 * ------------------------------------------------------------------ */

export type OverlayKey = 'hard-coded' | 'not-determined' | 'decisions';

export interface OverlayDefinition {
  key: OverlayKey;
  label: string;
  /** Elements the overlay marks, in outline order. */
  ids: string[];
  /** The text identifier it writes on an element — never a colour alone. */
  marks: Map<string, string>;
}

const DECISION_TAGS = new Set(['exclusiveGateway', 'parallelGateway']);

/**
 * The overlays, counted out of the model and the rules.
 *
 * `DESIGN.md` §5.9 item 8: a toggle with a count that **marks** elements with a
 * text identifier and does not change the flow. So an overlay narrows what the
 * outline lists — the header says *"Showing 16 of 65 elements"* — and leaves
 * every element and every sequence flow of the map where it is.
 *
 * Three, not the six of §5.9, and the three that this view can prove: which
 * element a business rule of 3.4 decides at, which element the code does not
 * anchor, and which element is a decision. *Findings* and *Level A–D* are
 * artefacts of other stages, and *Data* needs the table each node touches,
 * which the BPMN carries as text references that `BpmnExport` does not hand
 * back. Marking those from a second reading of the file would be a second
 * opinion beside 2.6, which is the thing this view exists not to be.
 */
export function buildOverlays(
  model: ProcessMapModel,
  nav: ProcessNavigation,
  rulesByNode: ReadonlyMap<string, readonly string[]>,
): OverlayDefinition[] {
  const hardCoded = new Map<string, string>();
  const notDetermined = new Map<string, string>();
  const decisions = new Map<string, string>();

  for (const id of nav.order) {
    const element = model.elements.find((candidate) => candidate.id === id);
    if (!element) continue;
    const rules = element.nodeId ? (rulesByNode.get(element.nodeId) ?? []) : [];
    if (rules.length > 0) hardCoded.set(id, rules.join(', '));
    if (element.anchor === null) notDetermined.set(id, element.evidenceLabel ?? '');
    if (DECISION_TAGS.has(element.tag)) {
      decisions.set(id, `${element.branches.length} ${element.branches.length === 1 ? 'branch' : 'branches'}`);
    }
  }

  return [
    { key: 'hard-coded', label: 'Hard-coded', ids: [...hardCoded.keys()], marks: hardCoded },
    { key: 'not-determined', label: 'Not determined', ids: [...notDetermined.keys()], marks: notDetermined },
    { key: 'decisions', label: 'Decisions', ids: [...decisions.keys()], marks: decisions },
  ];
}

/* ------------------------------------------------------------------ *
 * The problem line of a level.
 * ------------------------------------------------------------------ */

export interface PlaneProblems {
  plane: string | null;
  decisions: number;
  hardCoded: string[];
  notDetermined: number;
  /** Distinct reasons the skeleton gave for the elements it could not anchor. */
  reasons: string[];
  elements: number;
  /** The lines of the source this level was read from, when anything on it is anchored. */
  lines: { lineStart: number; lineEnd: number } | null;
  /** *"2 decisions · 3 hard-coded · 1 not determined"* — §5.9 item 4. */
  counters: string;
  /** What is **not determined** on this level, in one sentence. Never empty. */
  text: string;
  /** True when every element of the level carries a line anchor. */
  determined: boolean;
}

/**
 * What is not determined on one level.
 *
 * `DESIGN.md` §5.9 item 4: the overview is already a map of the problems, and
 * every collapsed sub-process carries a line of **text**, not only a colour.
 * The line says what the file and the rules say and nothing else — it invents
 * no problem and it talks none away. A level where everything is anchored says
 * so plainly and then says how many hard-coded values decide on it, because
 * "nothing is missing" and "nothing is hard-coded" are two different claims and
 * running them together is how a screen ends up reassuring.
 */
export function planeProblems(
  model: ProcessMapModel,
  nav: ProcessNavigation,
  plane: string | null,
  rulesByNode: ReadonlyMap<string, readonly string[]>,
): PlaneProblems {
  const ids = nav.planes.get(plane) ?? [];
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const elements = ids.map((id) => byId.get(id)).filter((element): element is ProcessMapElement => !!element);

  const decisions = elements.filter((element) => DECISION_TAGS.has(element.tag)).length;
  const unanchored = elements.filter((element) => element.anchor === null);
  const reasons = [...new Set(unanchored.map((element) => element.unanchoredReason).filter((r): r is string => !!r))];

  const rules = new Set<string>();
  for (const element of elements) {
    for (const rule of element.nodeId ? (rulesByNode.get(element.nodeId) ?? []) : []) rules.add(rule);
  }
  const hardCoded = [...rules].sort();

  const anchors = elements.map((element) => element.anchor).filter((a): a is { lineStart: number; lineEnd: number } => !!a);
  const lines = anchors.length
    ? {
      lineStart: Math.min(...anchors.map((a) => a.lineStart)),
      lineEnd: Math.max(...anchors.map((a) => a.lineEnd)),
    }
    : null;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const counters = [
    plural(decisions, 'decision', 'decisions'),
    `${hardCoded.length} hard-coded`,
    `${unanchored.length} not determined`,
  ].join(' · ');

  const determined = unanchored.length === 0;
  const first = determined
    ? `Every one of the ${plural(elements.length, 'step', 'steps')} on this level carries a line anchor.`
    : `${unanchored.length} of ${plural(elements.length, 'step', 'steps')} carry no line anchor${
      reasons.length ? ` — ${reasons.join(' ')}` : '.'
    }`;
  const second = hardCoded.length === 0
    ? 'No hard-coded value decides here.'
    : `${plural(hardCoded.length, 'hard-coded value decides', 'hard-coded values decide')} here (${hardCoded.join(', ')}).`;

  return {
    plane,
    decisions,
    hardCoded,
    notDetermined: unanchored.length,
    reasons,
    elements: elements.length,
    lines,
    counters,
    text: `${first} ${second}`,
    determined,
  };
}

/* ------------------------------------------------------------------ *
 * Run variants — the switches of the selection screen.
 * ------------------------------------------------------------------ */

export interface RunSwitch {
  /** The name as the source writes it, lower-cased for display as ABAP does. */
  name: string;
  declaredAs: 'parameter' | 'select-option';
  checkbox: boolean;
  /** `DEFAULT 'X'` → on, `DEFAULT ' '` → off, nothing stated → null. */
  defaultOn: boolean | null;
  lineStart: number;
  /** How many sequence flows in the drawn process name this switch literally. */
  flows: number;
}

/** Statements that open a selection-screen declaration. */
const SELECTION_KEYWORD = /^(PARAMETERS|SELECT-OPTIONS)\b/i;

/**
 * The selection-screen switches of a source, and only those a flow names.
 *
 * `DESIGN.md` §5.9 item 7: *"Nur Schalter, deren Bedingung im Code wörtlich
 * steht."* A switch that decides nothing the map draws cannot change the run
 * the map shows, and offering it as a toggle would promise an effect that is
 * not there.
 *
 * The declarations are read as ABAP statements, not as lines: `PARAMETERS:` is
 * almost always chained over four or five lines, and a line-based reader finds
 * the first name and misses the rest — which is how a first pass here found
 * three of the eleven switches of the 1.000-line example.
 */
export function readRunSwitches(source: string, model: ProcessMapModel): RunSwitch[] {
  const lines = source.split(/\r\n|\r|\n/);
  const found: RunSwitch[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const head = lines[i];
    if (/^\*/.test(head)) continue;
    const bare = head.trim();
    if (!SELECTION_KEYWORD.test(bare)) continue;

    const declaredAs: RunSwitch['declaredAs'] = /^PARAMETERS/i.test(bare) ? 'parameter' : 'select-option';
    // Gather the statement: on to the period that ends it, ignoring one inside
    // a literal and everything behind a trailing `"` comment.
    let text = '';
    const startLines: number[] = [];
    let j = i;
    for (; j < lines.length; j += 1) {
      const piece = stripComment(lines[j]);
      startLines.push(j + 1);
      text += `${piece}\n`;
      if (endsStatement(piece)) break;
    }
    i = j;

    // The keyword stands on the first line only, so a newline in `body` is a
    // newline of the statement and the two index the same way.
    const body = text.replace(SELECTION_KEYWORD, '').replace(/^\s*:/, '').replace(/\.\s*$/, '');
    for (const part of splitTop(body)) {
      const named = /^(\s*)([\w/]+)/.exec(part.text);
      if (!named) continue;
      // Where the **name** stands, not where its declaration begins: a chained
      // `PARAMETERS:` puts the comma at the end of one line and the next name at
      // the start of the next, and anchoring on the comma reported five of the
      // six switches of the 1.000-line example one line too early.
      const at = part.start + named[1].length;
      const line = startLines[Math.min(
        body.slice(0, at).split('\n').length - 1,
        startLines.length - 1,
      )];
      const defaultLiteral = /\bDEFAULT\s+('(?:[^']|'')*'|[\w-]+)/i.exec(part.text)?.[1] ?? null;
      found.push({
        name: named[2].toLowerCase(),
        declaredAs,
        checkbox: /\bAS\s+CHECKBOX\b/i.test(part.text),
        defaultOn: defaultLiteral === null ? null : isOn(defaultLiteral),
        lineStart: line,
        flows: 0,
      });
    }
  }

  // Only what the drawn process actually asks about, and only where it asks
  // about it *as a switch*. `s_vkorg[] IS INITIAL` names a selection field but
  // tests whether anything was typed into it — an on/off toggle beside it would
  // promise a position the code never reads.
  const conditions: string[] = [];
  for (const element of model.elements) {
    for (const branch of element.branches) if (branch.condition) conditions.push(branch.condition);
  }
  for (const entry of found) {
    entry.flows = conditions.filter(
      (condition) => conditionNeeds(condition, entry.name, true) || conditionNeeds(condition, entry.name, false),
    ).length;
  }
  return found.filter((entry) => entry.flows > 0);
}

function stripComment(line: string): string {
  if (/^\*/.test(line)) return '';
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '"') return line.slice(0, i);
  }
  return line;
}

function endsStatement(piece: string): boolean {
  let quote = '';
  for (let i = 0; i < piece.length; i += 1) {
    const ch = piece[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '.') return true;
  }
  return false;
}

/**
 * The declarations of a chained statement — commas outside literals, each with
 * the offset it starts at, so that a name can be traced back to its own line.
 */
function splitTop(body: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  let current = '';
  let start = 0;
  let quote = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '`') { quote = ch; current += ch; continue; }
    if (ch === ',') {
      out.push({ text: current, start });
      current = '';
      start = i + 1;
      continue;
    }
    current += ch;
  }
  out.push({ text: current, start });
  return out;
}

function isOn(literal: string): boolean {
  const value = literal.replace(/^'|'$/g, '');
  return value.trim().length > 0 && value.toUpperCase() !== 'ABAP_FALSE';
}

/** Every character a name could carry that a regular expression would read as syntax. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TRUE_FORMS = ['abap_true', "'x'"];
const FALSE_FORMS = ['abap_false', "' '", "''"];

/**
 * True when the condition can only hold with this switch in this position.
 *
 * Deliberately narrow: an equality against one of the two literals ABAP writes
 * a switch with, in a condition that has no `OR` in it. A condition with an
 * `OR` may hold without this switch, so claiming the branch cannot run would be
 * a claim the code does not make — and the whole of `DESIGN.md` §5.9 item 7 is
 * that a variant says what the code says.
 */
function conditionNeeds(condition: string, name: string, on: boolean): boolean {
  if (/\bOR\b/i.test(condition)) return false;
  const literals = [...TRUE_FORMS, ...FALSE_FORMS].map(escapeRegExp).join('|');
  const positive = new RegExp(`(^|[^\\w/])${escapeRegExp(name)}\\s*=\\s*(${literals})`, 'i');
  const match = positive.exec(condition);
  if (!match) return false;
  const literal = match[2].toLowerCase();
  const asserts = TRUE_FORMS.includes(literal);
  return asserts === on;
}

export interface RunVariant {
  /** Switches the reader turned away from the value the code declares. */
  changed: RunSwitch[];
  /** Elements that do not run in this variant, and the level each one opens. */
  excluded: Set<string>;
  /** *"Showing the run with p_upd off: 3 of 65 steps do not run."* */
  sentence: string;
}

/**
 * The run a set of switch positions draws.
 *
 * Two shapes of blocked flow, and telling them apart is the whole honesty of
 * this function:
 *
 *   - **a fork** — the source has other outgoing flows, so the run really does
 *     take one of them instead. What nothing then reaches is out of this run.
 *   - **a guard** — the conditional flow is the source's *only* outgoing flow.
 *     `DESIGN.md` §5.8 draws a leading `CHECK p_rfc = abap_true.` that way: as a
 *     conditional flow into the routine rather than as a gateway, with **no
 *     bypass edge beside it**. In the code that `CHECK` skips one routine and
 *     the caller goes on; in the file the arrow is the only way forward. Walking
 *     it as a fork claims the program stops at the switch — turning `p_rfc` off
 *     on the 1.000-line example would have read *"31 of 65 steps are not
 *     reached"*, and the program runs 59 of them. So a guard dims its own step
 *     and the level that step opens, and nothing after it.
 *
 * The narrower claim is the true one. That the file has no bypass edge for a
 * guard is 2.6's business, and it is named in this step's report rather than
 * papered over here.
 */
export function runVariant(
  model: ProcessMapModel,
  nav: ProcessNavigation,
  switches: readonly RunSwitch[],
  positions: ReadonlyMap<string, boolean>,
): RunVariant {
  const changed = switches.filter((entry) => {
    const chosen = positions.get(entry.name);
    return chosen !== undefined && chosen !== (entry.defaultOn ?? true);
  });

  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const blocked = (condition: string): boolean => {
    if (!condition) return false;
    for (const entry of switches) {
      const chosen = positions.get(entry.name);
      if (chosen === undefined) continue;
      if (conditionNeeds(condition, entry.name, !chosen)) return true;
    }
    return false;
  };

  const excluded = new Set<string>();
  for (const [, ids] of nav.planes) {
    const inPlane = new Set(ids);
    /** Every in-plane flow into an element. A loop-back to itself keeps nothing alive. */
    const inbound = new Map<string, Array<{ from: string; passable: boolean }>>();
    for (const id of ids) {
      const branches = (byId.get(id)?.branches ?? []).filter((branch) => inPlane.has(branch.to));
      const forward = branches.filter((branch) => branch.to !== id);
      for (const branch of branches) {
        if (branch.to === id) continue;
        const isBlocked = blocked(branch.condition);
        // A blocked *guard* — the only way on from its source — is still walked
        // past: the `CHECK` skips its own step and the caller goes on.
        const passable = !isBlocked || forward.length === 1;
        if (isBlocked && forward.length === 1) excluded.add(branch.to);
        const held = inbound.get(branch.to);
        if (held) held.push({ from: id, passable });
        else inbound.set(branch.to, [{ from: id, passable }]);
      }
    }

    // An element is out when it has a way in at all and every one of them is
    // blocked or comes from an element that is itself out. Monotone from the
    // empty set, so a cycle nothing proves dead stays alive — under-claiming is
    // the safe direction when a switch is involved.
    const dead = new Set<string>();
    let changing = true;
    while (changing) {
      changing = false;
      for (const id of ids) {
        if (dead.has(id)) continue;
        const ways = inbound.get(id) ?? [];
        if (ways.length === 0) continue;
        if (ways.every((way) => !way.passable || dead.has(way.from))) {
          dead.add(id);
          changing = true;
        }
      }
    }
    for (const id of dead) excluded.add(id);
  }

  // A step that does not run does not run the level it opens, all the way down.
  const pending = [...excluded];
  while (pending.length) {
    const id = pending.pop() as string;
    for (const child of nav.entries.get(id)?.children ?? []) {
      if (excluded.has(child)) continue;
      excluded.add(child);
      pending.push(child);
    }
  }

  const positionsWord = changed
    .map((entry) => `${entry.name} ${positions.get(entry.name) ? 'on' : 'off'}`)
    .join(', ');
  const where = changed.length === 0
    ? 'Showing the run the code declares, with every switch where the source sets it'
    : `Showing the run with ${positionsWord}`;
  const sentence = excluded.size === 0
    ? `${where}: every step runs.`
    : `${where}: ${excluded.size} of ${nav.order.length} steps do not run.`;

  return { changed, excluded, sentence };
}

/* ------------------------------------------------------------------ *
 * The mini map.
 * ------------------------------------------------------------------ */

export interface MiniMapRow {
  plane: string | null;
  label: string;
  outline: string;
  /** One cell per element of the level, in flow order. */
  cells: Array<{ id: string; outline: string; decision: boolean; unanchored: boolean }>;
}

/**
 * The mini map — one row per level, one cell per step, in outline order.
 *
 * Not a thumbnail of the diagram: a thumbnail of 65 shapes at a tenth of the
 * size is a grey smear, and it would also move whenever the layout engine
 * moved. This is derived from the outline alone, so it is the same picture on
 * every machine and every reload (`DESIGN.md` §5.9 item 10), and a reader who
 * has learnt that step 6.2 is the second cell of the sixth row can find it
 * without reading a word.
 */
export function miniMap(model: ProcessMapModel, nav: ProcessNavigation): MiniMapRow[] {
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const rows: MiniMapRow[] = [];
  for (const [plane, ids] of nav.planes) {
    const opener = plane ? nav.entries.get(plane) : null;
    rows.push({
      plane,
      label: plane ? (byId.get(plane)?.label ?? plane) : model.processName,
      outline: opener?.outline ?? '',
      cells: ids.map((id) => {
        const element = byId.get(id);
        return {
          id,
          outline: nav.entries.get(id)?.outline ?? '',
          decision: !!element && DECISION_TAGS.has(element.tag),
          unanchored: !!element && element.anchor === null,
        };
      }),
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * The address in the URL.
 * ------------------------------------------------------------------ */

export interface MapAddress {
  plane: string | null;
  node: string | null;
}

/**
 * `#map=<plane>&node=<element>` — `DESIGN.md` §5.9 item 11.
 *
 * The fragment, not the query string, for three reasons and all three matter
 * here: a fragment never leaves the browser, so a plane id read out of a
 * customer's own ABAP is not written into a server log or a `Referer`; it
 * changes without Next.js re-rendering the route around a client page that has
 * just loaded a 37 kB source and built a model from it; and `history.pushState`
 * on it gives Back and Forward their ordinary meaning for free.
 */
export function parseMapAddress(hash: string): MapAddress {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const plane = params.get('map');
  const node = params.get('node');
  return { plane: plane || null, node: node || null };
}

export function formatMapAddress({ plane, node }: MapAddress): string {
  const params = new URLSearchParams();
  if (plane) params.set('map', plane);
  if (node) params.set('node', node);
  const query = params.toString();
  return query ? `#${query}` : '';
}

/**
 * An address the model knows, or the nearest one it does.
 *
 * A shared link outlives the source it was made on. Rather than opening an
 * empty level or selecting nothing with no explanation, an unknown element is
 * dropped and an unknown plane falls back to the top — and a known element on
 * another plane pulls its own plane up, so a link that names only a node still
 * opens where that node is.
 */
export function resolveMapAddress(nav: ProcessNavigation, address: MapAddress): MapAddress {
  const node = address.node && nav.entries.has(address.node) ? address.node : null;
  if (node) return { plane: levelOf(nav, node), node };
  const plane = address.plane && nav.planes.has(address.plane) ? address.plane : null;
  return { plane, node: null };
}
