import { parseBpmn } from './process-map';

/**
 * Check hints while modelling — roadmap 3.3.
 *
 * The step has one hard rule and it is in its own sentence: **hints, not
 * blocks.** Nothing in this file and nothing that reads it may stop a reader
 * drawing, renaming, deleting or saving. A hint here is four things and no
 * more:
 *
 *   1. **readable** — one sentence that says what is missing, in the words the
 *      rest of the product uses;
 *   2. **countable** — the editing footer carries the number, `DESIGN.md` §2.3
 *      item 6 and §2.6 (*Message Popover*);
 *   3. **switchable** — a reader turns the list off and the editor is unchanged;
 *   4. **named** — every hint names the element it means, so the popover can
 *      jump to it.
 *
 * Two sources, deliberately kept apart in the list a reader sees:
 *
 *   - **bpmnlint's standard rules** — BPMN's own grammar, the same rules the
 *     bpmn.io toolchain applies. They know nothing about this product and that
 *     is the point: *no end event*, *disconnected element*, *label missing*.
 *     Run in `bpmnlintHints`, which needs a moddle tree and therefore the
 *     modeller — it is async and imported on demand.
 *   - **the four rules of the roadmap** — *Task without an anchor · Gateway
 *     without a condition · Lane reconstructed only · Element deviates from the
 *     code without a state*. They are this product's own and they are pure: XML
 *     in, hints out, no DOM, no modeller, no network.
 *
 * **What the fourth rule can prove today, and what it cannot.** A *state* per
 * element — *keep · change deliberately · drop · clarify* — is roadmap 3.5 and
 * does not exist yet. So the rule reports what it can actually establish: an
 * element that is in the file, carries no line anchor and carries no state.
 * That is exactly the element a reader has just drawn, and the element the
 * reconstruction could not tie to a line. What it cannot see yet is the other
 * half of its own sentence — an element that *has* an anchor but whose name,
 * kind or place no longer matches the code. That comparison needs the state of
 * 3.5 and the revision of 3.2 to compare against, and this file invents
 * neither.
 */

/* ------------------------------------------------------------------ *
 * What a hint is.
 * ------------------------------------------------------------------ */

/**
 * Two levels, and neither of them is an error.
 *
 * `DESIGN.md` §2.7 keeps `error` for "this cannot go on" — and nothing here
 * ever cannot. bpmnlint's own `error` category therefore arrives as `warn`,
 * which is the strongest word this list uses.
 */
export type HintSeverity = 'warn' | 'info';

export interface ProcessHint {
  /** Stable across rebuilds of the same draft: rule and element. */
  key: string;
  /** `task-without-anchor`, `bpmnlint/label-required`. */
  ruleId: string;
  /** What the rule is called for a reader. */
  ruleLabel: string;
  source: 'clean-core' | 'bpmnlint';
  severity: HintSeverity;
  /** The element the hint is about — what the popover jumps to. Null only when a rule reports on the file. */
  elementId: string | null;
  /** What that element is called on the map. */
  elementLabel: string;
  /** One sentence. Names the element, says what is missing. */
  message: string;
}

/** One of the four rules of roadmap 3.3, as the list of rules shows it. */
export interface HintRule {
  id: string;
  label: string;
  /** What the rule reports, in one sentence — shown beside the switch. */
  about: string;
}

export const TASK_WITHOUT_ANCHOR = 'task-without-anchor';
export const GATEWAY_WITHOUT_CONDITION = 'gateway-without-condition';
export const LANE_RECONSTRUCTED_ONLY = 'lane-reconstructed-only';
export const DEVIATES_WITHOUT_STATE = 'deviates-without-state';

/** The four rules the roadmap names, in the roadmap's order. */
export const CLEAN_CORE_HINT_RULES: readonly HintRule[] = Object.freeze([
  {
    id: TASK_WITHOUT_ANCHOR,
    label: 'Task without an anchor',
    about: 'A step that is not tied to a line of the source.',
  },
  {
    id: GATEWAY_WITHOUT_CONDITION,
    label: 'Gateway without a condition',
    about: 'A decision whose branches do not say what decides.',
  },
  {
    id: LANE_RECONSTRUCTED_ONLY,
    label: 'Lane reconstructed only',
    about: 'A lane nobody confirmed — a proposal, never a mandate.',
  },
  {
    id: DEVIATES_WITHOUT_STATE,
    label: 'Element deviates from the code without a state',
    about: 'An element with neither a line anchor nor a state saying why.',
  },
] as HintRule[]);

/* ------------------------------------------------------------------ *
 * The four rules.
 * ------------------------------------------------------------------ */

/** What `lib/process-map.ts` calls an activity — the tags rule 1 is about. */
const ACTIVITY_TAGS = new Set([
  'task',
  'serviceTask',
  'sendTask',
  'receiveTask',
  'userTask',
  'manualTask',
  'businessRuleTask',
  'scriptTask',
  'callActivity',
  'subProcess',
]);

/** The tags rule 2 is about. A parallel gateway carries no condition by definition and is never reported. */
const DECIDING_TAGS = new Set(['exclusiveGateway']);

/**
 * Did 2.6 draw this element from the code, or did a reader draw it in the editor?
 *
 * The file says so itself. Everything `lib/bpmn/export.ts` writes carries a
 * `cc:trace` with `status="reconstructed"` and, whenever the skeleton node had
 * one, a line range; an element added in the editor of 3.1 carries neither —
 * there is nothing in the source for it to point at. So: a line anchor, or the
 * engine's own status, and nothing else. Rules 1 and 4 read `lineStart` for the
 * same reason, and the anchor alone would be the narrower test — but a
 * reconstructed element that the engine could not anchor (`anchored="false"`) is
 * still the engine's drawing, and rule 2 must not call it a reader's.
 */
function isReconstructed(element: { trace: { status: string | null; lineStart: number | null } | null }): boolean {
  return element.trace?.lineStart != null || element.trace?.status === 'reconstructed';
}

/**
 * **Rule 2 needed no exception in the end — roadmap 2.17 (b), and this is the
 * record of why.**
 *
 * This is where 2.17 was going to hang a "do not report a multi-instance
 * activity" test, because until then 2.6 drew every `LOOP AT` as an exclusive
 * gateway with a cycle behind it and rule 2 reported six of them on our own
 * reconstruction of the 1.000-line example — the product warning about a
 * decision it had drawn where the code takes none.
 *
 * 2.17 (b) did not silence the rule, it stopped drawing the gateway: a
 * `LOOP AT` whose body stays inside the block is now a collapsed
 * `subProcess` carrying `multiInstanceLoopCharacteristics`
 * (`lib/abap/process-skeleton.ts`, `bodyStaysInLoop`). A sub-process is not in
 * `DECIDING_TAGS`, so rule 2 never looks at it, and the count on the
 * 1.000-line example went 6 → 0 without this file gaining a line.
 *
 * What still reaches rule 2 is a real cycle — `DO`, `WHILE`,
 * `SELECT … ENDSELECT` and a `LOOP AT` the body leaves — and there the hint is
 * right: those gateways carry no condition because the source writes none.
 */

/** A lane as the file states it. */
interface ParsedLane {
  id: string;
  name: string;
  /**
   * True when the lane carries the trace 2.6 writes. Roadmap 2.16 reconstructs
   * a lane from four kinds of evidence in the code and gives it a line anchor,
   * and that changes the **wording** of the hint, never whether there is one.
   */
  reconstructed: boolean;
}

/**
 * The lanes of a document.
 *
 * `parseBpmn` reads flow nodes and sequence flows; lanes are neither, and a
 * reading view has nothing to do with them. A tag scan is exact enough here for
 * the same reason it is there: `lib/bpmn/xml.ts` escapes `<` in text and in
 * every attribute value, so a `<bpmn:lane` in the document is a lane.
 */
function parseLanes(xml: string): ParsedLane[] {
  const out: ParsedLane[] = [];
  // The opening tag carries id and name; what stands between it and the closing
  // tag carries the trace. A lane 2.16 reconstructed has one, a lane somebody
  // drew in the editor of 3.1 has nothing to point at and carries none.
  const LANE = /<(?:\w+:)?lane\b([^>]*?)\/>|<(?:\w+:)?lane\b([^>]*?)>([\s\S]*?)<\/(?:\w+:)?lane>/g;
  for (const match of xml.matchAll(LANE)) {
    const attrs = match[1] ?? match[2] ?? '';
    const body = match[3] ?? '';
    const id = /\bid\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? '';
    const name = /\bname\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? '';
    if (id) out.push({ id, name, reconstructed: /status\s*=\s*"reconstructed"/.test(body) });
  }
  return out;
}

/** A lane 2.4 proposed for this process — `ProcessMapModel.lanes`. */
export interface ProposedLane {
  key: string;
  name: string;
  /** True when the proposal rests on something in the code. */
  anchored: boolean;
}

export interface CleanCoreHintInput {
  /** The draft on the canvas — `modeler.saveXML()`, or the reconstruction before the first edit. */
  xml: string;
  /** Element id → what a reader calls it. Falls back to the name in the file, then to the id. */
  labels?: ReadonlyMap<string, string>;
  /**
   * Element id → the state a reader gave it (roadmap 3.5). **Empty today** —
   * there is nothing that writes one, and this file does not invent one.
   */
  states?: ReadonlyMap<string, string>;
  /** The lanes roadmap 2.4 proposed, as `ProcessMapModel.lanes` carries them. */
  proposedLanes?: readonly ProposedLane[];
}

function labelFor(
  id: string,
  name: string,
  labels: ReadonlyMap<string, string> | undefined,
): string {
  return labels?.get(id) || name || id;
}

/**
 * The four rules of roadmap 3.3, over one draft.
 *
 * Deterministic and ordered: the rules in the roadmap's order, and inside a
 * rule the elements in the order the file writes them. A list that reshuffled
 * itself on every keystroke could not be read.
 */
export function cleanCoreHints(input: CleanCoreHintInput): ProcessHint[] {
  const { xml, labels, states, proposedLanes = [] } = input;
  const parsed = parseBpmn(xml);
  const hints: ProcessHint[] = [];
  const hasState = (id: string) => !!states?.get(id);

  /* 1 — a step that is not tied to a line. */
  for (const element of parsed.elements) {
    if (!ACTIVITY_TAGS.has(element.tag)) continue;
    if (element.trace?.lineStart != null) continue;
    const label = labelFor(element.id, element.name, labels);
    hints.push({
      key: `${TASK_WITHOUT_ANCHOR}:${element.id}`,
      ruleId: TASK_WITHOUT_ANCHOR,
      ruleLabel: 'Task without an anchor',
      source: 'clean-core',
      severity: 'warn',
      elementId: element.id,
      elementLabel: label,
      message: element.trace?.unanchoredReason
        ? `“${label}” carries no line anchor — ${element.trace.unanchoredReason.replace(/\.\s*$/, '')}.`
        : `“${label}” carries no line anchor: nothing in the source says where this step comes from.`,
    });
  }

  /* 2 — a decision whose branches do not say what decides. */
  const outgoing = new Map<string, string[]>();
  for (const flow of parsed.flows) {
    const held = outgoing.get(flow.sourceRef);
    if (held) held.push(flow.condition);
    else outgoing.set(flow.sourceRef, [flow.condition]);
  }
  for (const element of parsed.elements) {
    if (!DECIDING_TAGS.has(element.tag)) continue;
    const branches = outgoing.get(element.id) ?? [];
    if (branches.length < 2) continue;
    // Exactly one branch without a condition is the default branch, and BPMN
    // means it that way. Two are an open question: nothing in the model says
    // which of them is taken.
    const unlabelled = branches.filter((condition) => !condition.trim()).length;
    if (unlabelled < 2) continue;
    const label = labelFor(element.id, element.name, labels);
    // **Told apart by where the gateway comes from** (roadmap 3.3, §16 V7,
    // 22.09.2026). At a *reconstructed* gateway the code always had a condition,
    // so a missing one is a defect of this engine and stays `warn`. At a
    // *modelled* one it is a reader's open question, which a modeller is allowed
    // to leave open, so it is `info`.
    //
    // The reason is a count. Over the reference stock of 1.246 SAP standard
    // diagrams the rule in its undifferentiated form would fire at 554 of 1.320
    // XOR splits (42,0 %) and in 310 of 1.246 diagrams (24,9 %) — 532 splits
    // (40,3 %) carry no labelled edge at all, and only 8,5 % of all flows carry
    // a condition. A rule that fires at almost every second reference diagram
    // teaches the reader to skim hints, and after that "Task without an anchor"
    // is not read either.
    const reconstructed = isReconstructed(element);
    hints.push({
      key: `${GATEWAY_WITHOUT_CONDITION}:${element.id}`,
      ruleId: GATEWAY_WITHOUT_CONDITION,
      ruleLabel: 'Gateway without a condition',
      source: 'clean-core',
      severity: reconstructed ? 'warn' : 'info',
      elementId: element.id,
      elementLabel: label,
      message: reconstructed
        ? `Decision “${label}” has ${branches.length} branches and ${unlabelled} of them carry no condition:`
          + ' the model does not say what decides here.'
        : `Decision “${label}” has ${branches.length} branches and ${unlabelled} of them carry no condition:`
          + ' this one was drawn, not read from the code — say what decides, or leave it open.',
    });
  }

  /* 3 — a lane nobody confirmed. */
  for (const lane of parseLanes(xml)) {
    if (hasState(lane.id)) continue;
    const label = labelFor(lane.id, lane.name, labels);
    hints.push({
      key: `${LANE_RECONSTRUCTED_ONLY}:${lane.id}`,
      ruleId: LANE_RECONSTRUCTED_ONLY,
      ruleLabel: 'Lane reconstructed only',
      source: 'clean-core',
      severity: 'info',
      elementId: lane.id,
      elementLabel: label,
      // Roadmap 2.16 changed half of this sentence and left the other half
      // standing. A lane is no longer *Model proposal*: it is reconstructed from
      // `AUTHORITY-CHECK`, a dynpro, an update task or a destination, it is
      // named after the token the source writes and it carries a line anchor —
      // so calling it a proposal is a sentence about it that is no longer true.
      // What is still true, and is the whole reason rule 3 exists, is that
      // nobody has confirmed it: §8 of the roadmap forbids a role mandate, and a
      // lane is the one element of this file that could quietly become one.
      message: lane.reconstructed
        ? `Lane “${label}” is reconstructed from the code: nobody has confirmed that this is who does the work.`
        : `Lane “${label}” is a proposal: nobody has confirmed that this is who does the work.`,
    });
  }
  for (const lane of proposedLanes) {
    if (lane.anchored || hasState(lane.key)) continue;
    hints.push({
      key: `${LANE_RECONSTRUCTED_ONLY}:proposed:${lane.key}`,
      ruleId: LANE_RECONSTRUCTED_ONLY,
      ruleLabel: 'Lane reconstructed only',
      source: 'clean-core',
      severity: 'info',
      elementId: null,
      elementLabel: lane.name,
      message: `Lane “${lane.name}” was proposed from the reading of the code and rests on nothing in it.`,
    });
  }

  /* 4 — an element with neither an anchor nor a state.
     Activities are rule 1's; this is everything else the file draws, so that no
     element ever collects two hints saying the same thing. */
  for (const element of parsed.elements) {
    if (ACTIVITY_TAGS.has(element.tag)) continue;
    if (element.trace?.lineStart != null) continue;
    if (hasState(element.id)) continue;
    const label = labelFor(element.id, element.name, labels);
    hints.push({
      key: `${DEVIATES_WITHOUT_STATE}:${element.id}`,
      ruleId: DEVIATES_WITHOUT_STATE,
      ruleLabel: 'Element deviates from the code without a state',
      source: 'clean-core',
      severity: 'warn',
      elementId: element.id,
      elementLabel: label,
      message: `“${label}” is in the model but not in the code, and no state says why.`,
    });
  }

  return hints;
}

/* ------------------------------------------------------------------ *
 * bpmnlint.
 * ------------------------------------------------------------------ */

/**
 * The standard rules this editor runs — bpmnlint's own `recommended` set.
 *
 * Named one by one rather than read out of `bpmnlint/config/recommended`, for
 * two reasons: the rule modules are then static imports a bundler can see, so
 * nothing resolves a module name at runtime; and a rule that arrives in a new
 * release of bpmnlint does not silently start reporting on a reader's screen.
 *
 * Two of the recommended set are left out and it is on purpose:
 *
 *   - `no-overlapping-elements` reports on where shapes sit, and the layout of
 *     a reconstruction is written by `lib/bpmn/layout.ts`, not by the reader;
 *   - `no-bpmndi` reports a file with no diagram interchange, which this
 *     product's export never produces and a modeller cannot create.
 *
 * Both would report on something a reader cannot act on, and a hint nobody can
 * act on is noise in a list whose whole worth is that it is short.
 */
export const BPMNLINT_RULES: readonly string[] = Object.freeze([
  'ad-hoc-sub-process',
  'conditional-flows',
  'end-event-required',
  'event-based-gateway',
  'event-sub-process-typed-start-event',
  'fake-join',
  'global',
  'label-required',
  'link-event',
  'no-complex-gateway',
  'no-disconnected',
  'no-duplicate-sequence-flows',
  'no-gateway-join-fork',
  'no-implicit-split',
  'no-implicit-end',
  'no-implicit-start',
  'no-inclusive-gateway',
  'single-blank-start-event',
  'single-event-definition',
  'start-event-required',
  'sub-process-blank-start-event',
  'superfluous-gateway',
  'superfluous-label',
  'superfluous-termination',
]);

interface BpmnlintReport {
  id?: string;
  message: string;
  category?: string;
}

interface BpmnlintLinter {
  lint(root: unknown, config: { rules: Record<string, string> }): Promise<Record<string, BpmnlintReport[]>>;
}

/** A rule name as a reader reads it: `no-implicit-end` → "No implicit end". */
export function bpmnlintRuleLabel(rule: string): string {
  const words = rule.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * bpmnlint over the tree the modeller holds.
 *
 * `definitions` is `modeler.getDefinitions()` — the moddle tree, not a string.
 * Linting the model the reader is looking at rather than a serialisation of it
 * means the hints cannot disagree with the canvas.
 *
 * Everything is imported here rather than at the top of the file: bpmnlint and
 * its 24 rule modules are only needed once somebody opens the editor, and the
 * reading view must not carry them. A linter that will not load is not a reason
 * to lose the editor — the four rules above are computed from the XML and are
 * unaffected, so the list is shorter and says so.
 */
export async function bpmnlintHints(
  definitions: unknown,
  labels?: ReadonlyMap<string, string>,
): Promise<ProcessHint[]> {
  const [{ default: Linter }, { default: StaticResolver }, rules] = await Promise.all([
    import('bpmnlint/lib/linter'),
    import('bpmnlint/lib/resolver/static-resolver'),
    loadRules(),
  ]);

  const cache: Record<string, unknown> = {};
  for (const [name, factory] of rules) cache[`rule:bpmnlint/${name}`] = factory;

  const config: Record<string, string> = {};
  for (const name of BPMNLINT_RULES) config[name] = 'warn';

  const linter = new Linter({ resolver: new StaticResolver(cache) }) as BpmnlintLinter;
  const results = await linter.lint(definitions, { rules: config });

  const hints: ProcessHint[] = [];
  for (const name of BPMNLINT_RULES) {
    for (const report of results[name] ?? []) {
      // `rule-error` is bpmnlint telling us a rule threw. That is a defect in
      // this build, not a statement about the reader's model, and it is not put
      // in front of them as one.
      if (report.category === 'rule-error') continue;
      const id = report.id ?? null;
      const label = id ? (labels?.get(id) ?? id) : 'the process';
      hints.push({
        key: `bpmnlint/${name}:${id ?? 'process'}:${report.message}`,
        ruleId: `bpmnlint/${name}`,
        ruleLabel: bpmnlintRuleLabel(name),
        source: 'bpmnlint',
        severity: report.category === 'error' ? 'warn' : 'info',
        elementId: id,
        elementLabel: label,
        message: `${label}: ${report.message}.`,
      });
    }
  }
  return hints;
}

/**
 * The rule factories, one static import each.
 *
 * Written out rather than built from `BPMNLINT_RULES` with a template literal,
 * because a bundler cannot follow `import(\`bpmnlint/rules/${name}\`)` and would
 * either pull in every file of the package or none of them.
 */
async function loadRules(): Promise<Array<[string, unknown]>> {
  const modules = await Promise.all([
    import('bpmnlint/rules/ad-hoc-sub-process'),
    import('bpmnlint/rules/conditional-flows'),
    import('bpmnlint/rules/end-event-required'),
    import('bpmnlint/rules/event-based-gateway'),
    import('bpmnlint/rules/event-sub-process-typed-start-event'),
    import('bpmnlint/rules/fake-join'),
    import('bpmnlint/rules/global'),
    import('bpmnlint/rules/label-required'),
    import('bpmnlint/rules/link-event'),
    import('bpmnlint/rules/no-complex-gateway'),
    import('bpmnlint/rules/no-disconnected'),
    import('bpmnlint/rules/no-duplicate-sequence-flows'),
    import('bpmnlint/rules/no-gateway-join-fork'),
    import('bpmnlint/rules/no-implicit-split'),
    import('bpmnlint/rules/no-implicit-end'),
    import('bpmnlint/rules/no-implicit-start'),
    import('bpmnlint/rules/no-inclusive-gateway'),
    import('bpmnlint/rules/single-blank-start-event'),
    import('bpmnlint/rules/single-event-definition'),
    import('bpmnlint/rules/start-event-required'),
    import('bpmnlint/rules/sub-process-blank-start-event'),
    import('bpmnlint/rules/superfluous-gateway'),
    import('bpmnlint/rules/superfluous-label'),
    import('bpmnlint/rules/superfluous-termination'),
  ]);
  return BPMNLINT_RULES.map((name, index) => {
    const loaded = modules[index] as { default?: unknown };
    return [name, loaded.default ?? loaded];
  });
}

/* ------------------------------------------------------------------ *
 * Counting them.
 * ------------------------------------------------------------------ */

export interface HintCounts {
  total: number;
  cleanCore: number;
  bpmnlint: number;
  /** Rule id → how many hints it produced, for the list of rules. */
  byRule: Map<string, number>;
}

export function countHints(hints: readonly ProcessHint[]): HintCounts {
  const byRule = new Map<string, number>();
  let cleanCore = 0;
  for (const hint of hints) {
    byRule.set(hint.ruleId, (byRule.get(hint.ruleId) ?? 0) + 1);
    if (hint.source === 'clean-core') cleanCore += 1;
  }
  return { total: hints.length, cleanCore, bpmnlint: hints.length - cleanCore, byRule };
}

/** *"12 hints — 6 from the code rules, 6 from the BPMN rules."* Never a blocker, and it says so. */
export function hintSentence(counts: HintCounts): string {
  if (counts.total === 0) return 'No check hints on this model.';
  const plural = counts.total === 1 ? 'hint' : 'hints';
  return `${counts.total} check ${plural} — ${counts.cleanCore} from the code rules,`
    + ` ${counts.bpmnlint} from the BPMN rules. Hints never stop you saving.`;
}
