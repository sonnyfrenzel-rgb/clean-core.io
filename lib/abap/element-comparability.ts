/**
 * Comparability of a single process element — roadmap 7.8, addition of
 * 22.09.2026 (§16 V6).
 *
 * 7.8 is the step that first puts a **standard candidate** on an element of our
 * process map. That is where the trap opens, and it is a trap of arithmetic, not
 * of opinion. Measured on what this product ships:
 *
 *   - in the 1.000-line example **15 of 65 flow nodes (23 %) are end events**,
 *     six of them with an error definition;
 *   - over the eight shipped examples: 14 `errorEventDefinition`,
 *     5 `boundaryEvent`, 115 data elements.
 *
 * In a holding of 1.246 SAP standard process diagrams the same shapes are
 * almost absent: typed end events **3 of 2.172**, data objects **24 of 19.876**.
 * A naive comparison would therefore report nearly a quarter of our map as "not
 * in the standard" — and that would be **wrong**: the holding does model error
 * paths, only without an error symbol (of 429 negative branches, 423 end in a
 * neutral end event).
 *
 * **The sentence this file carries: absence in the diagram is not a negative
 * proof of function.** From "not drawn there" it does not follow that "it does
 * not exist". Which is why the result vocabulary has **three** outcomes and
 * never two: `covered` · `not-covered` · `unknown`.
 *
 * Measured with this module over the same eight programs (292 elements,
 * `tests/element-comparability.spec.ts` pins every number): 110 technical, 91
 * structural, 67 business-comparable, 24 unknown — **160 of 292 elements
 * (54,8 %) are never asked whether they are in the standard**, and 61 end
 * events, 10 error ends, 19 data objects and 6 boundary events are among them.
 *
 * So before any standard assignment, every element gets one of four classes,
 * deterministically and from the element alone:
 *
 *   - `business-comparable` — task, sub-process, call activity, business rule
 *     task, and a gateway that decides on a **business field**;
 *   - `technical` — read/write step, technical gateway (2.15), boundary event,
 *     error end, helper;
 *   - `structural` — start, end, lane, pool, data object, annotation;
 *   - `unknown` — `call-opaque`, a dynamic target.
 *
 * Only `business-comparable` may carry a standard candidate or *Not determined*.
 * `technical` and `structural` **never** say "no standard candidate" — they say
 * *not comparable*. `unknown` says unknown.
 *
 * **The class sits on the element, never in the signed pack** — exactly like the
 * A–D level (`abcd-classification.ts`). Nothing here is hashed, signed or
 * exported into an audit pack; it is a reading aid of the Business view.
 *
 * **No imports, on purpose**, for the same two reasons as `abcd-classification.ts`:
 * the consumer is a client component, and the acceptance of 7.8 asks for a pure
 * class function without an import from `lib/bpmn`. The element and flow shapes
 * below are *structural* — `SkeletonNode` and `SkeletonEdge` of
 * `lib/abap/process-skeleton.ts` satisfy them as they are, without this file
 * knowing that module. `tests/element-comparability.spec.ts` holds the two
 * together: it fails if `SkeletonNodeKind` grows a kind this table does not name.
 *
 * **Also written for step 2.15.** `classifyCondition`,
 * `hasOnlyTechnicalConditions` and `isTechnicalGateway` are the
 * technical/business discrimination that 2.15 needs in the engine, to stop
 * exporting a pure `sy-subrc` check as an `exclusiveGateway`. They live here so
 * that 2.15 can *use* them instead of writing the same rule a second time — two
 * copies of this rule would drift, and then the Business view and the BPMN
 * export would disagree about what a decision is.
 *
 * The rule of 2.15 has **two halves** and they are two functions, since the QA
 * review of `9e408888bfec` (fingerprint `f51d99129444`):
 * `hasOnlyTechnicalConditions` is the condition half — that is the one the
 * Business view and 2.15's "is this a business decision?" ask —
 * and `isTechnicalGateway` is the whole rule, condition **and** exactly one
 * call/read/write predecessor, which is what 2.15 must ask before it re-shapes a
 * gateway into a boundary event. Without known predecessors the whole rule
 * answers `false`: a missing proof never produces the positive class here.
 */

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/** The four comparability classes of §16 V6. */
export type ComparabilityClass =
  | 'business-comparable'
  | 'technical'
  | 'structural'
  | 'unknown';

/** Three outcomes, never two (§16 V6). */
export type ComparisonOutcome = 'covered' | 'not-covered' | 'unknown';

/**
 * What the element is allowed to show. `not-comparable` is the wording that
 * replaces "no standard candidate" for technical and structural elements — the
 * whole point of V6: a read step that is not in a standard diagram has not been
 * found missing, it was never a candidate.
 */
export type ComparabilityDisplay =
  | 'standard-candidate'
  | 'not-determined'
  | 'not-comparable'
  | 'unknown';

/**
 * The kinds this table decides on: every `SkeletonNodeKind` of 2.3 plus the
 * elements that only the BPMN view of 2.5/2.9 adds (lane, pool, data object,
 * annotation). They are written as literals rather than imported, see the head.
 */
export type ComparableElementKind =
  // --- SkeletonNodeKind (lib/abap/process-skeleton.ts) ---
  | 'start'
  | 'end'
  | 'end-error'
  | 'gateway'
  | 'loop'
  | 'sub-process'
  | 'call-activity'
  | 'transaction'
  | 'call-opaque'
  | 'task'
  | 'service-task'
  | 'send-task'
  | 'user-task'
  | 'business-rule-task'
  | 'read'
  | 'write'
  | 'output'
  | 'error-boundary'
  // --- added by the BPMN view, never by the skeleton reader ---
  | 'lane'
  | 'pool'
  | 'data-object'
  | 'data-store'
  | 'annotation';

/** A process element, in the shape this file needs. `SkeletonNode` satisfies it. */
export interface ComparableElement {
  id: string;
  kind: ComparableElementKind;
  /** A token out of the source. For a `CASE` gateway it is the selector. */
  label?: string;
  /** Read for `dynamic` and `branchKind` — both set by 2.3, both from the source. */
  detail?: Record<string, unknown>;
}

/** A flow, in the shape this file needs. `SkeletonEdge` satisfies it. */
export interface ComparableFlow {
  from: string;
  to: string;
  /** The condition as the source writes it (rule 6 of 2.3). Empty for a default arm. */
  condition?: string;
}

export interface ComparabilityVerdict {
  comparability: ComparabilityClass;
  /**
   * May this element carry a standard candidate or *Not determined*?
   *
   * Narrower than `comparability === 'business-comparable'` on purpose. A
   * gateway on a business field **is** business-comparable — it is a business
   * decision and 2.9 reads it as one — but a scope item names process *steps*,
   * not decisions, so no gateway ever carries a candidate. That is also what the
   * acceptance of 7.8 measures: over the eight examples no end event, gateway,
   * boundary event and no data store carries a standard candidate or
   * "not covered".
   */
  mayCarryStandardCandidate: boolean;
  /** Why, in one line, naming the rule — never a guess. */
  reason: string;
}

/** The class of one gateway condition. Shared with 2.15. */
export type ConditionClass = 'technical' | 'business' | 'none' | 'unknown';

/* ------------------------------------------------------------------ *
 * The condition rule — the one 2.15 needs too
 * ------------------------------------------------------------------ */

/**
 * The five technical markers, taken verbatim from 2.15: `sy-subrc`, `sy-tabix`,
 * `IS ASSIGNED`, `IS BOUND`, `lines( )`. A condition built only from these is
 * about the **effect of the previous step**, not about a decision of the
 * process.
 *
 * `sy-index` is deliberately **not** in the list although it is just as
 * technical: 2.15 names five markers and the corpus ratchet counts against that
 * list. Widening it is a change to 2.15, made once, here — not silently.
 *
 * ES2017 target: no lookbehind, no named groups, no `s` flag anywhere in this
 * file.
 */
const TECHNICAL_MARKERS: Array<{ test: RegExp; name: string }> = [
  { test: /\bSY-SUBRC\b/i, name: 'sy-subrc' },
  { test: /\bSY-TABIX\b/i, name: 'sy-tabix' },
  { test: /\bIS\s+(?:NOT\s+)?ASSIGNED\b/i, name: 'IS ASSIGNED' },
  { test: /\bIS\s+(?:NOT\s+)?BOUND\b/i, name: 'IS BOUND' },
  { test: /\bLINES\s*\(/i, name: 'lines( )' },
];

/**
 * A structure component: `ls_order-netwr`, `<fs>-kunnr`, `lo_x->amount`,
 * `zcl_y=>c_limit`. This is what "a comparison on a structure component" of
 * §16 V6 means, and it is the only positive evidence for *business* this file
 * accepts. A bare local flag (`IF lv_done = abap_true.`) is **not** evidence:
 * it may be a business switch or a technical one, and we do not know which —
 * that is `unknown`, and unknown is an outcome here.
 */
const STRUCTURE_COMPONENT = /(?:<[\w/]+>|[A-Za-z_/][\w/]*)\s*(?:-(?!>)[A-Za-z_][\w/]*|->\s*[A-Za-z_][\w/]*|=>\s*[A-Za-z_][\w/]*)/;

/**
 * A system field is never evidence for *business*, whatever it is compared to.
 * `sy-index` reads exactly like `ls_order-netwr` to the pattern above, and
 * `sy-datum > lv_cutoff` may well be a business rule — but we cannot prove that
 * from the condition, and inventing the proof is what V6 forbids. System fields
 * are masked out before the structure-component test; a condition left with
 * nothing else is `unknown`.
 */
const SYSTEM_FIELD = /\bSY(?:ST)?-[A-Za-z_]\w*/gi;

/** A comparison operator, in both spellings ABAP allows. */
const COMPARISON = /(?:[<>]=?|<>|=|\bEQ\b|\bNE\b|\bGT\b|\bGE\b|\bLT\b|\bLE\b|\bBETWEEN\b|\bIN\b|\bCO\b|\bCS\b|\bCP\b|\bIS\s+(?:NOT\s+)?INITIAL\b)/i;

/**
 * Class of one condition text, as the source writes it.
 *
 * Deterministic and in this order:
 *   1. empty → `none` (the default arm of an `IF`/`CASE` has no condition);
 *   2. any technical marker → `technical` — even mixed with a business field,
 *      because the technical part is what the branch turns on;
 *   3. a structure component in a comparison → `business`;
 *   4. otherwise → `unknown`, and unknown stays unknown.
 *
 * Step 2 before step 3 is the conservative direction: calling a business
 * decision technical costs a comparison that would have been made; calling a
 * technical check business produces a "not covered" on a return code, which is
 * exactly the false statement V6 exists to prevent.
 */
export function classifyCondition(condition: string | undefined | null): ConditionClass {
  const text = (condition ?? '').trim();
  if (!text) return 'none';
  for (const marker of TECHNICAL_MARKERS) {
    if (marker.test.test(text)) return 'technical';
  }
  const withoutSystemFields = text.replace(SYSTEM_FIELD, ' ');
  if (STRUCTURE_COMPONENT.test(withoutSystemFields) && COMPARISON.test(text)) return 'business';
  return 'unknown';
}

/**
 * Does the selector of a `CASE` name a business field? A `CASE` compares that
 * field against literals by construction, so the structure component is the
 * whole evidence — there is no operator to look for.
 */
export function isBusinessSelector(selector: string | undefined | null): boolean {
  const text = (selector ?? '').trim();
  if (!text) return false;
  for (const marker of TECHNICAL_MARKERS) {
    if (marker.test.test(text)) return false;
  }
  return STRUCTURE_COMPONENT.test(text.replace(SYSTEM_FIELD, ' '));
}

/** Names the technical markers a condition contains — for the reason line and for 2.15. */
export function technicalMarkersIn(condition: string | undefined | null): string[] {
  const text = (condition ?? '').trim();
  if (!text) return [];
  return TECHNICAL_MARKERS.filter((m) => m.test.test(text)).map((m) => m.name);
}

/**
 * The kinds whose effect a `sy-subrc` belongs to — 2.15 names them as "a call,
 * read or write node", and this set is exactly that list and nothing else:
 * `read`/`write` are Open SQL, the rest are the call shapes 2.3 emits
 * (`CALL FUNCTION`, a mail/IDoc send, `SUBMIT`/`PERFORM` into another program,
 * `CALL TRANSACTION`, a call this reader has no source for, a `FORM` of its own).
 *
 * `task` and `output` stood here until the QA review of `9e408888bfec`
 * (fingerprint `f51d99129444`) counted what they let through. Neither is a call,
 * a read or a write: `task` is "a step with an effect and no type of its own" —
 * an assignment, a computation — and `output` is a data object, a `WRITE` to the
 * list or to a file. Neither sets `sy-subrc` in a way a following branch could
 * be about, so a gateway behind one is not proven technical. Over the eight
 * shipped examples the two cost one gateway (see the count on the function).
 */
const EFFECT_KINDS = new Set<ComparableElementKind>([
  'read', 'write', 'service-task', 'send-task', 'call-activity',
  'transaction', 'call-opaque', 'sub-process',
]);

export interface GatewayContext {
  /** The conditions of the gateway's outgoing flows, verbatim. */
  conditions: string[];
  /**
   * The kinds of the elements that flow into the gateway. Optional in the type
   * because a caller may not have the graph at hand — but **absent is not a
   * licence**: `isTechnicalGateway` answers `false` without them. See there.
   */
  predecessorKinds?: ComparableElementKind[];
  /**
   * The selector of a `CASE`, when the gateway is one. It is needed because a
   * `CASE gs_stock-mtart. WHEN 'ROH'. …` carries its field on the **gateway**
   * and only literals on the arms — measured: two of the 68 gateways of the
   * eight examples are shaped like that, and without the selector both read as
   * "no readable condition" although they decide on a business field.
   */
  selector?: string;
}

/**
 * The condition half of the 2.15 rule on its own: do **all** readable conditions
 * of this gateway test `sy-subrc`, `sy-tabix`, `IS ASSIGNED`/`IS BOUND` or
 * `lines( )`? A gateway with no readable condition at all is not technical —
 * nothing was proven about it.
 *
 * It is exported because the two halves of 2.15 answer two different questions,
 * and the QA review of `9e408888bfec` (fingerprint `f51d99129444`) showed what
 * happens when one function tries to answer both: a caller without predecessor
 * data got a `true` that read like the whole rule. **2.15 needs both halves** —
 * this one to decide that a branch on a return code is no business decision,
 * `isTechnicalGateway` to decide whether the export may re-shape the gateway
 * into a boundary event on the step in front of it. The Business view
 * (`classifyElement`) asks only this one, on purpose.
 */
export function hasOnlyTechnicalConditions(conditions: readonly string[]): boolean {
  const classes = conditions.map(classifyCondition).filter((c) => c !== 'none');
  return classes.length > 0 && classes.every((c) => c === 'technical');
}

/**
 * Is this gateway technical? The rule of 2.15, verbatim: **all** of its
 * conditions test `sy-subrc`, `sy-tabix`, `IS ASSIGNED`/`IS BOUND` or `lines( )`
 * **and** its only predecessor is a call, read or write node.
 *
 * Exported so 2.15 can ask exactly this question before it decides not to export
 * an `exclusiveGateway` — one rule, one place.
 *
 * **Missing predecessor data answers `false`.** Until the QA review of
 * `9e408888bfec` (fingerprint `f51d99129444`) it answered `true`: a caller that
 * passed no predecessors got the decision on the conditions alone, under the
 * comment that "not knowing the predecessors is not the same as them being
 * wrong". That sentence is true, and it is the argument for *unknown* — never
 * for the positive class. The sentence this file carries is the other one:
 * absence of evidence decides nothing. A gateway whose predecessors we do not
 * know is unknown, not technical, and 2.15 re-shaping a gateway on evidence it
 * does not have is exactly the false export the rule exists to prevent.
 *
 * The result stays a `boolean` rather than growing a third state because this is
 * a **guard**: 2.15 asks it before it drops an `exclusiveGateway` from the
 * export, and in a guard "unknown" has to act like "no". The third state exists
 * where it belongs — one layer up, where `classifyElement` returns `unknown` for
 * a gateway it cannot read, and beside it in `hasOnlyTechnicalConditions` for
 * the caller that has conditions and no graph.
 *
 * Counted over the eight shipped examples: of 68 gateways, 27 are technical by
 * condition and **17** also pass this predecessor half (before the fix: 19 — one
 * had no known predecessor at all, one sat behind an `output` node).
 */
export function isTechnicalGateway(context: GatewayContext): boolean {
  if (!hasOnlyTechnicalConditions(context.conditions)) return false;
  const predecessors = context.predecessorKinds;
  // The predecessor half of the 2.15 rule, and it needs the data: no known
  // predecessor, no positive classification.
  if (!predecessors || predecessors.length !== 1) return false;
  return EFFECT_KINDS.has(predecessors[0]);
}

/* ------------------------------------------------------------------ *
 * The class table
 * ------------------------------------------------------------------ */

/**
 * The class of every kind that does not depend on a condition.
 *
 * `loop` is `technical` although §16 V6 names it in no list: an iteration over
 * an internal table is how the program is written, not a step a scope item
 * names. Technical is the conservative reading — it costs a comparison, it never
 * produces a false "not covered".
 *
 * `output` is a data object, and therefore `structural`, for the measured reason
 * in the head: 115 data elements over our eight examples against 24 of 19.876 in
 * the holding. Comparing those would manufacture missing function out of a
 * drawing convention.
 */
const KIND_CLASS: Record<Exclude<ComparableElementKind, 'gateway'>, {
  comparability: ComparabilityClass;
  reason: string;
}> = {
  // --- business-comparable: a step a standard process could name ---
  task: { comparability: 'business-comparable', reason: 'Step with an effect of its own' },
  'sub-process': { comparability: 'business-comparable', reason: 'Sub-process' },
  'call-activity': { comparability: 'business-comparable', reason: 'Call activity' },
  transaction: { comparability: 'business-comparable', reason: 'Call activity into a transaction' },
  'business-rule-task': { comparability: 'business-comparable', reason: 'Business rule task' },
  'service-task': { comparability: 'business-comparable', reason: 'Service task — a task subtype' },
  'send-task': { comparability: 'business-comparable', reason: 'Send task — a task subtype' },
  'user-task': { comparability: 'business-comparable', reason: 'User task — a task subtype' },

  // --- technical: the implementation, not the process ---
  read: { comparability: 'technical', reason: 'Read step on a data store' },
  write: { comparability: 'technical', reason: 'Write step on a data store' },
  'error-boundary': { comparability: 'technical', reason: 'Boundary event on the step it hangs on' },
  'end-error': { comparability: 'technical', reason: 'Error end — the holding models error paths without an error symbol' },
  loop: { comparability: 'technical', reason: 'Iteration — how the program is written, not a process step' },

  // --- structural: the drawing, not the process ---
  start: { comparability: 'structural', reason: 'Start event' },
  end: { comparability: 'structural', reason: 'End event' },
  lane: { comparability: 'structural', reason: 'Lane' },
  pool: { comparability: 'structural', reason: 'Pool' },
  'data-object': { comparability: 'structural', reason: 'Data object' },
  'data-store': { comparability: 'structural', reason: 'Data store' },
  output: { comparability: 'structural', reason: 'Data object — file or result list' },
  annotation: { comparability: 'structural', reason: 'Annotation' },

  // --- unknown: we do not have the called source ---
  'call-opaque': { comparability: 'unknown', reason: 'Call whose source this engine does not have' },
};

/**
 * Which kinds may carry a standard candidate at all, on top of being
 * business-comparable. See `mayCarryStandardCandidate` above: a gateway is a
 * decision, and a scope item names steps.
 */
const CANDIDATE_BEARING = new Set<ComparableElementKind>([
  'task', 'sub-process', 'call-activity', 'transaction',
  'business-rule-task', 'service-task', 'send-task', 'user-task',
]);

/**
 * The class of one element. Deterministic, total over `ComparableElementKind`,
 * and free of any lookup — the catalog does not get a say in whether something
 * is comparable, only in what it is compared to.
 */
export function classifyElement(
  element: ComparableElement,
  gateway?: GatewayContext,
): ComparabilityVerdict {
  // A dynamic target is unknown before anything else: we do not know what is
  // called, so we cannot say it is missing from the standard (V6, "dynamic
  // target" is named as `unknown` in its own right).
  if (element.detail?.dynamic === true && element.kind !== 'gateway') {
    return {
      comparability: 'unknown',
      mayCarryStandardCandidate: false,
      reason: 'Dynamic target — the called element is not known at analysis time',
    };
  }

  if (element.kind === 'gateway') {
    const context: GatewayContext = gateway ?? { conditions: [] };
    const classes = context.conditions.map(classifyCondition).filter((c) => c !== 'none');
    // The class of a gateway is decided by its **conditions**, not by the full
    // 2.15 rule: deciding on `sy-subrc` is never a business decision, whatever
    // stands in front of it. The predecessor half of 2.15 answers a different
    // question — whether the export may re-shape the gateway into a boundary
    // event — and `isTechnicalGateway` keeps answering that one for 2.15.
    // Measured over the eight examples: 27 of 68 gateways (39,7 %) are
    // technical by condition, 17 also pass the predecessor half.
    if (hasOnlyTechnicalConditions(context.conditions)) {
      const markers = context.conditions.flatMap(technicalMarkersIn);
      const named = Array.from(new Set(markers)).join(', ');
      return {
        comparability: 'technical',
        mayCarryStandardCandidate: false,
        reason: `Technical gateway (2.15) — decides on ${named || 'a return code'}`,
      };
    }
    if (classes.some((c) => c === 'business') || isBusinessSelector(context.selector)) {
      return {
        comparability: 'business-comparable',
        // A decision, not a step — no scope item names it.
        mayCarryStandardCandidate: false,
        reason: 'Gateway on a business field — comparable as a decision, never a step',
      };
    }
    if (classes.length === 0) {
      return {
        comparability: 'unknown',
        mayCarryStandardCandidate: false,
        reason: 'Gateway without a readable condition',
      };
    }
    return {
      comparability: 'unknown',
      mayCarryStandardCandidate: false,
      reason: 'Gateway whose condition is neither a return code nor a business field',
    };
  }

  const entry = KIND_CLASS[element.kind];
  if (!entry) {
    // Unreachable for a kind of the union; a kind added elsewhere and not named
    // here lands as unknown rather than as a silent "not covered".
    return {
      comparability: 'unknown',
      mayCarryStandardCandidate: false,
      reason: `Kind "${String(element.kind)}" is not classified`,
    };
  }
  return {
    comparability: entry.comparability,
    mayCarryStandardCandidate:
      entry.comparability === 'business-comparable' && CANDIDATE_BEARING.has(element.kind),
    reason: entry.reason,
  };
}

/**
 * Classify every element of a map at once, wiring each gateway to the conditions
 * of its outgoing flows and the kinds of its predecessors. `skeleton.nodes` and
 * `skeleton.edges` of 2.3 go in unchanged.
 */
export function classifyElements(
  elements: readonly ComparableElement[],
  flows: readonly ComparableFlow[] = [],
): Map<string, ComparabilityVerdict> {
  const kindById = new Map<string, ComparableElementKind>();
  for (const element of elements) kindById.set(element.id, element.kind);

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, ComparableElementKind[]>();
  for (const flow of flows) {
    const conditions = outgoing.get(flow.from) ?? [];
    conditions.push(flow.condition ?? '');
    outgoing.set(flow.from, conditions);
    const kind = kindById.get(flow.from);
    if (kind) {
      const sources = incoming.get(flow.to) ?? [];
      sources.push(kind);
      incoming.set(flow.to, sources);
    }
  }

  const verdicts = new Map<string, ComparabilityVerdict>();
  for (const element of elements) {
    const context: GatewayContext | undefined = element.kind === 'gateway'
      ? {
        conditions: outgoing.get(element.id) ?? [],
        predecessorKinds: incoming.get(element.id) ?? [],
        // Only a `CASE` carries its field on the gateway; an `IF` has it in the
        // condition already, and its label is the statement snippet.
        selector: element.detail?.branchKind === 'case' ? element.label : undefined,
      }
      : undefined;
    verdicts.set(element.id, classifyElement(element, context));
  }
  return verdicts;
}

/* ------------------------------------------------------------------ *
 * The result vocabulary — three outcomes, never two
 * ------------------------------------------------------------------ */

/**
 * What a standard comparison found for one element. Both fields are required,
 * and the second is the one that matters: `conclusive` says whether the
 * reference we compared against is able to answer the question at all. Absence
 * in a diagram is not a negative proof of function — 423 of 429 negative
 * branches in the holding end in a neutral end event, so "no error end drawn"
 * proves nothing about error handling.
 */
export interface StandardMatch {
  /** A standard candidate was proven for this element. */
  matched: boolean;
  /**
   * The reference is complete enough for the absence of a match to mean
   * something. `false` — the honest default for a diagram holding — turns a
   * missing match into `unknown`, never into `not-covered`.
   */
  conclusive: boolean;
  /** The scope item or catalog entry, when there is one. */
  candidate?: string;
  /** Why not determined, when there is no match (7.5). */
  reason?: string;
}

export interface ElementComparison {
  comparability: ComparabilityClass;
  outcome: ComparisonOutcome;
  display: ComparabilityDisplay;
  reason: string;
  candidate?: string;
}

/**
 * The three outcomes, derived and not decidable anywhere else.
 *
 *   - not allowed to carry a candidate → `unknown` with *not comparable*
 *     (technical, structural) or with *unknown* (unknown class). It never says
 *     "no standard candidate", because it was never asked for one;
 *   - allowed, match proven → `covered`;
 *   - allowed, no match, reference conclusive → `not-covered`;
 *   - allowed, no match, reference not conclusive (or not compared at all) →
 *     `unknown` with *Not determined* and a reason (7.5).
 */
export function compareElement(
  verdict: ComparabilityVerdict,
  match?: StandardMatch | null,
): ElementComparison {
  if (!verdict.mayCarryStandardCandidate) {
    const structuralOrTechnical =
      verdict.comparability === 'technical' || verdict.comparability === 'structural';
    return {
      comparability: verdict.comparability,
      outcome: 'unknown',
      display: structuralOrTechnical ? 'not-comparable' : 'unknown',
      reason: verdict.reason,
    };
  }
  if (!match) {
    return {
      comparability: verdict.comparability,
      outcome: 'unknown',
      display: 'not-determined',
      reason: 'No standard comparison was made for this element',
    };
  }
  if (match.matched) {
    return {
      comparability: verdict.comparability,
      outcome: 'covered',
      display: 'standard-candidate',
      reason: match.reason ?? 'Standard candidate proven',
      candidate: match.candidate,
    };
  }
  if (match.conclusive) {
    return {
      comparability: verdict.comparability,
      outcome: 'not-covered',
      display: 'not-determined',
      reason: match.reason ?? 'No standard candidate in a reference that can answer this',
    };
  }
  return {
    comparability: verdict.comparability,
    outcome: 'unknown',
    display: 'not-determined',
    reason: match.reason
      ?? 'No match, and the reference cannot prove absence — absence in the diagram is not a negative proof of function',
  };
}
