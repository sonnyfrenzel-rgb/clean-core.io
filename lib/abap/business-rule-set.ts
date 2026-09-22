import { afterKeyword, type AbapStatement, type SourceRange } from './statement-reader';
import { containerAt, type BlockKind, type Container } from './block-structure';
import type { Branch } from './control-flow';
import { buildProcessFacts, type ProcessFacts } from './process-facts';
import {
  buildProcessSkeletonFrom,
  type ProcessSkeleton,
  type SkeletonNode,
  type SkeletonNodeKind,
} from './process-skeleton';
import {
  readBusinessRulesFrom,
  type DeclaredConstant,
  type RuleCandidate,
  type RuleClass,
  type RuleOrigin,
  type SubjectKind,
} from './business-rules';

/**
 * Business rules `BR-nnn` — roadmap 3.4.
 *
 * Step 2.8 found 140 numbers in the eight example programs that somebody decided
 * and nobody wrote down: `lv_dev_pct > 5`, `cs_customer-land1 <> 'DE' AND … 'AT'
 * AND … 'CH'`, `c_critical_score VALUE 80`. Each is a *candidate* — one literal,
 * one place. A person deciding what to keep does not decide literals, though; they
 * decide rules. This file turns the candidates into rules: numbered, written out
 * in sentences, each sentence pointing at the lines it is made of, typed as a rule
 * or a control, placed in its program and routine, and tied to the elements of
 * the process skeleton (2.3) where it takes effect.
 *
 * **One rule, several places.** Candidates that are one rule become one rule with
 * several anchors, never several rules with one anchor each. Four things join
 * them, and nothing else does:
 *
 *   1. **one condition** — `gv_emergency = abap_true AND gv_amount <= '50000.00'`
 *      is one test, however many literals it holds;
 *   2. **one value list** — the `valueSetId` of 2.8: three countries on one field,
 *      the `WHEN` values of one `CASE`, an `IF`/`ELSEIF` chain grading one field;
 *   3. **one constant** — its declaration and every condition that reads it;
 *   4. **the same test written again** — identical condition text (case outside
 *      literals ignored), and in routines the skeleton reads as copies of one
 *      another (`notDrawn.clones`) also when only a variable's number differs:
 *      `lv_ernam_001 = 'DDIC'` … `lv_ernam_014 = 'DDIC'` is one rule copied, not
 *      fourteen rules. A value that differs is never normalised away — two
 *      copies with different thresholds are two rules.
 *
 * Two thresholds on one field stay two rules (`GE c_critical_score` and `GE
 * c_medium_score`): each is a number somebody may want to change on its own.
 *
 * **Rule or control, read off the code.** A test is a *control* when the code
 * ends the flow on it: the branch where it holds leaves the routine (`RETURN`,
 * `EXIT` outside a loop), stops (`STOP`, `LEAVE PROGRAM`), raises, or sends an
 * error message (`MESSAGE` of type E, A or X); or the `ELSE` of a plain `IF …
 * ELSE` does that; or it is a `CHECK` outside a loop. Everything else — a branch
 * that sets a value, calls a step, picks a path, and lets the flow go on — is a
 * *rule*. The statement that ends the flow is anchored, so the type is a claim
 * with a line, not a label. Names play no part: a routine called `reject` that
 * only sets a flag makes nothing a control.
 *
 * **Nothing is written without an anchor.** Every sentence carries at least one
 * range and the verbatim lines of it (`quote`). A sentence that would have none
 * is not written — the builder drops it rather than emit it — and no sentence
 * says anything the lines do not: no currency (2.8's caveat is rendered, never
 * resolved), no business meaning, no name that is not a token of the source. The
 * sentences are English (`DESIGN.md` §3, ADR-009); code stands in them verbatim,
 * as `code` parts, so no Markdown is needed to mark it.
 *
 * **Derived, not stored.** Nothing here writes anywhere. The same source gives
 * the same rules with the same numbers, so a view or step 3.5 derives them from
 * the source of the signed run (its `sourceSha256`) whenever it needs them. The
 * numbers are stable per source, not across revisions of it: a rule inserted
 * above another renumbers it.
 *
 * **One name collision, on purpose not resolved here.** 2.1 numbers *branches*
 * `BR-001…` (`control-flow.ts`), and 2.8 and the skeleton carry that number as
 * `branchId`. `DESIGN.md` §3 and the mockups reserve `BR-nnn` for business rules.
 * The rules below link to skeleton nodes by node id (`nd-…`) and never expose a
 * branch number, so the two cannot be mixed up through this API; renaming the
 * branch ids is a change to 2.1 and its specs, not to this step.
 */

/* ------------------------------------------------------------------ types */

export type BusinessRuleType = 'rule' | 'control';

/**
 * Why a rule has the type it has.
 *
 *   - `ends-flow`: the branch in which the test holds ends the flow.
 *   - `else-ends-flow`: in a plain `IF … ELSE`, the `ELSE` ends the flow.
 *   - `check-leaves`: a `CHECK` outside a loop leaves its processing block.
 *   - `flow-continues`: nothing in the branch ends the flow.
 *   - `skips-iteration`: a `CHECK` inside a loop skips one pass and goes on.
 *   - `loop-condition`: a `WHILE` bounds a loop and goes on after it.
 *   - `declaration-only`: a constant no condition reads.
 */
export type TypeBasisKind =
  | 'ends-flow'
  | 'else-ends-flow'
  | 'check-leaves'
  | 'flow-continues'
  | 'skips-iteration'
  | 'loop-condition'
  | 'declaration-only';

export interface RuleAnchor extends SourceRange {
  /** The lines of the range, each trimmed, joined with `\n`. Verbatim otherwise. */
  quote: string;
}

export type SentencePart =
  | { kind: 'text'; value: string }
  /** A token out of the source, verbatim (routine names upper-cased, as 2.1 does). */
  | { kind: 'code'; value: string };

export type SentenceKey =
  | 'declaration'
  | 'condition-if'
  | 'condition-elseif'
  | 'condition-case'
  | 'condition-check'
  | 'condition-check-loop'
  | 'condition-while'
  | 'repeated'
  | 'repeated-copies'
  | 'branch-body'
  | 'case-body'
  | 'loop-body'
  | 'ends-flow'
  | 'else-ends-flow'
  | 'currency-not-stated'
  | 'unit-not-stated'
  | 'caveat'
  | 'subject-not-named';

export interface RuleSentence {
  /** Which template wrote it — for a later translation, not for display. */
  key: SentenceKey;
  /** The sentence as plain text: the parts joined. */
  text: string;
  parts: SentencePart[];
  /** Never empty. */
  anchors: RuleAnchor[];
}

export interface RuleSource {
  /** `REPORT`/`PROGRAM`/`FUNCTION-POOL`/`CLASS-POOL` name, upper-cased; null when the source names none. */
  program: string | null;
  /**
   * Always null. This source is read as one text: an `INCLUDE` names another
   * source whose text is not here (the skeleton notes it as `include-not-read`),
   * so nothing found here stands in an include.
   */
  include: null;
  /** Upper-cased FORM, method, module or event block; null at program level. */
  routine: string | null;
  routineKind: Container['kind'] | null;
  /** The local class around a method, upper-cased. */
  className: string | null;
}

/** One value of the rule — a 2.8 candidate, without its branch bookkeeping. */
export interface RuleParameter extends SourceRange {
  /** `RC-nnn` of 2.8. */
  candidateId: string;
  origin: RuleOrigin;
  conditionText: string;
  valueOffset: number;
  subject: string | null;
  subjectKind: SubjectKind;
  operator: string;
  literal: string;
  values: string[];
  ruleClass: RuleClass;
  /** The constant the value reached the condition through. */
  viaConstant?: string;
  /** 2.8's caveat, verbatim. */
  caveat?: string;
}

export type ProcessRelation =
  /** The gateway (or loop) whose condition states the rule. */
  | 'condition'
  /** A node inside the branch (or loop body) the rule decides about. */
  | 'branch';

export interface RuleProcessElement extends SourceRange {
  nodeId: string;
  kind: SkeletonNodeKind;
  label: string;
  region: string;
  relation: ProcessRelation;
}

export type NoProcessElementReason =
  /** A constant no condition reads. */
  | 'declaration-only'
  /** The routine is not reached from any entry point (`notDrawn.unreached`). */
  | 'unreached'
  /** The routine has no effect of its own and is folded into its callers. */
  | 'technical-helper'
  /** The place lies in nothing the skeleton draws — a method, for instance. */
  | 'not-in-skeleton';

/**
 * One business rule. It has no line range of its own on purpose: a rule copied
 * into fourteen routines stands at fourteen places, and a range from the first
 * to the last would claim the nine hundred lines between them.
 */
export interface BusinessRule {
  /** `BR-001`, in order of the first place the rule stands. Stable per source. */
  id: string;
  /** The first condition as written, or `name VALUE literal`. Code, not a business name. */
  label: string;
  /** `lib/rule-property.ts`: the value stands in the ABAP source. */
  property: 'hard-coded';
  type: BusinessRuleType;
  /** The places that decide the type, grouped by why. Anchored like sentences. */
  typeBasis: Array<{ basis: TypeBasisKind; anchors: RuleAnchor[] }>;
  sentences: RuleSentence[];
  /** The sentences joined — the rule text. */
  text: string;
  /** 2.8's classes of the parameters, distinct, in order. */
  classes: RuleClass[];
  parameters: RuleParameter[];
  sources: RuleSource[];
  processElements: RuleProcessElement[];
  /** Set exactly when `processElements` is empty. */
  withoutProcessElement?: { reason: NoProcessElementReason; detail: string };
}

export interface BusinessRuleSet {
  program: string | null;
  rules: BusinessRule[];
  counts: {
    candidates: number;
    rules: number;
    byType: Record<BusinessRuleType, number>;
    withProcessElement: number;
    withoutProcessElement: Record<NoProcessElementReason, number>;
    sentences: number;
  };
}

/* --------------------------------------------------------------- entry points */

/** Derive the business rules of one ABAP source. No model, no network. */
export function deriveBusinessRules(source: string): BusinessRuleSet {
  const facts = buildProcessFacts(source);
  return deriveBusinessRulesFrom(source, facts, buildProcessSkeletonFrom(facts));
}

/**
 * The same derivation, for a caller that already holds the facts and the
 * skeleton. Both must come from `source` — the statement indexes of the
 * skeleton's anchors are only meaningful against the facts they were built from.
 */
export function deriveBusinessRulesFrom(
  source: string,
  facts: ProcessFacts,
  skeleton: ProcessSkeleton,
): BusinessRuleSet {
  return new RuleSetBuilder(source, facts, skeleton).build();
}

/** Every rule that names this skeleton node — the reverse of `processElements`. */
export function rulesForElement(set: BusinessRuleSet, nodeId: string): BusinessRule[] {
  return set.rules.filter((rule) => rule.processElements.some((e) => e.nodeId === nodeId));
}

/* ------------------------------------------------------------------ helpers */

const LOOP_KINDS = new Set<BlockKind>(['loop', 'do', 'while', 'select', 'provide']);

const PROGRAM_KEYWORDS = new Set(['REPORT', 'PROGRAM', 'FUNCTION-POOL', 'CLASS-POOL', 'INTERFACE-POOL']);

const CURRENCY_CAVEAT = 'Betrag, Währung nicht aus dem Code ableitbar';
const UNIT_CAVEAT = 'Menge, Einheit nicht aus dem Code ableitbar';

type EndKind = 'return' | 'exit' | 'stop' | 'leave-program' | 'raise' | 'error-message';

const text = (value: string): SentencePart => ({ kind: 'text', value });
const code = (value: string): SentencePart => ({ kind: 'code', value });

/** `A`, `A and B`, `A, B and C` — each item a code part. */
function codeList(items: string[]): SentencePart[] {
  const out: SentencePart[] = [];
  items.forEach((item, i) => {
    if (i > 0) out.push(text(i === items.length - 1 ? ' and ' : ', '));
    out.push(code(item));
  });
  return out;
}

/**
 * The comparison key of a condition: case ignored outside literals, and — only
 * inside a group of copied routines — the digits a copy renumbers in a name.
 * Digits standing on their own (`100000`) and everything inside a literal are
 * left as they are: a copy with another threshold is another rule.
 */
function conditionKey(conditionText: string, renumbered: boolean): string {
  return conditionText
    .split(/('(?:[^']|'')*'|`(?:[^`]|``)*`|\|[^|]*\|)/)
    .map((segment, i) => {
      if (i % 2 === 1) return segment;
      const upper = segment.toUpperCase();
      return renumbered ? upper.replace(/([A-Z_])\d+/g, '$1#') : upper;
    })
    .join('');
}

/**
 * The key a `CHECK`/`WHILE` candidate is looked up by: its keyword, the line it
 * stands on and its condition as written. Unambiguous — neither of the two
 * keywords nor a line number can hold a `|`, so the two separators are always
 * the first two.
 */
function guardKey(keyword: string, lineStart: number, condition: string): string {
  return `${keyword}|${lineStart}|${condition}`;
}

/**
 * Every `CHECK` and `WHILE` of the source under that key, in one pass.
 *
 * This used to be a `statements.find(…)` per candidate — one walk over every
 * statement of the source for every `CHECK` the program writes, so the work
 * grew with the square of the source. Counted on a 172 kB program with 400 such
 * routines: 2 273 811 reads of the statement list, 471 per statement, the
 * number doubling every time the source did; 15 839 now, 3.3 per statement,
 * flat. The first statement written under a key wins, so the map answers with
 * the statement `find` returned: the first one in source order.
 */
function guardStatements(statements: AbapStatement[]): Map<string, AbapStatement> {
  const out = new Map<string, AbapStatement>();
  for (const statement of statements) {
    if (statement.keyword !== 'CHECK' && statement.keyword !== 'WHILE') continue;
    const key = guardKey(statement.keyword, statement.lineStart, afterKeyword(statement));
    if (!out.has(key)) out.set(key, statement);
  }
  return out;
}

function endKindOf(statement: AbapStatement, inLoop: boolean): EndKind | null {
  const t = statement.text;
  switch (statement.keyword) {
    case 'RETURN': return 'return';
    case 'EXIT': return inLoop ? null : 'exit';
    case 'STOP': return 'stop';
    case 'RAISE': return 'raise';
    case 'LEAVE': return /^LEAVE\s+PROGRAM\b/i.test(t) ? 'leave-program' : null;
    case 'MESSAGE':
      return /^MESSAGE\s+[eax]\d/i.test(t) || /^MESSAGE\b[\s\S]*\bTYPE\s+'[eax]'/i.test(t)
        ? 'error-message'
        : null;
    default: return null;
  }
}

/* ------------------------------------------------------------------ builder */

/** One place a rule stands: one condition, one `WHEN`, one declaration. */
interface Occurrence extends SourceRange {
  origin: RuleOrigin;
  conditionText: string;
  container: string | null;
  /** Candidate indexes in the 2.8 report. */
  members: number[];
  branch?: Branch;
  armIndex?: number;
  statement?: AbapStatement;
  /** Set for condition occurrences: the text-identity key (join rule 4). */
  sameTestKey?: string;
}

interface TypeReading {
  basis: TypeBasisKind;
  control: boolean;
  anchor: SourceRange;
  endKind?: EndKind;
}

/**
 * The lookups this builder does once per candidate, each built once instead.
 *
 * Every one of them used to be a `find` or a `filter` over a list that grows
 * with the source — the branches of 2.1, the nodes of the skeleton, the
 * containers of the block structure — so the work grew with the square of the
 * source, against a 1 MB cap on the field that carries the code. Measured on
 * generated ABAP, `deriveBusinessRules` with its facts and skeleton: 1.1 MB
 * 5450 ms → 1358 ms, 2.2 MB 18 911 ms → 4396 ms; under a profiler the builder's
 * own share of a 1.1 MB reading fell from 4891 ms to 667 ms. The maps answer
 * the same questions with the same answers: where a list was searched, the
 * first entry written under a key wins, which is the entry `find` returned.
 */
interface RuleSetIndex {
  branchById: Map<string, Branch>;
  /** The gateway of a branch, by `detail.branchId`. */
  gatewayOfBranch: Map<string, SkeletonNode>;
  /** The gateway a `CHECK` opens, by the statement it stands on. */
  gatewayOfCheck: Map<number, SkeletonNode>;
  /** The loop node of a `WHILE`, by the statement it stands on. */
  loopOfStatement: Map<number, SkeletonNode>;
  /**
   * Per region, its anchored nodes ordered by statement, each with the place it
   * holds in `skeleton.nodes` — `nodesBetween` gives its window back in that
   * order, which is the order a filter over the whole list gave it.
   */
  nodesOfRegion: Map<string, Array<{ at: number; pos: number; node: SkeletonNode }>>;
  /** The `class` containers, in source order. A source has a handful at most. */
  classContainers: Container[];
}

function buildIndex(facts: ProcessFacts, skeleton: ProcessSkeleton): RuleSetIndex {
  const index: RuleSetIndex = {
    branchById: new Map(),
    gatewayOfBranch: new Map(),
    gatewayOfCheck: new Map(),
    loopOfStatement: new Map(),
    nodesOfRegion: new Map(),
    classContainers: facts.structure.containers.filter((c) => c.kind === 'class'),
  };
  for (const branch of facts.control.branches) {
    if (!index.branchById.has(branch.id)) index.branchById.set(branch.id, branch);
  }
  skeleton.nodes.forEach((node, pos) => {
    if (node.anchor) {
      const region = index.nodesOfRegion.get(node.region);
      const entry = { at: node.anchor.statementIndex, pos, node };
      if (region) region.push(entry);
      else index.nodesOfRegion.set(node.region, [entry]);
    }
    if (node.kind === 'gateway') {
      const branchId = node.detail?.branchId;
      // A branch id is a string; a `detail` holding anything else under that
      // name never matched the comparison this map replaces either.
      if (typeof branchId === 'string' && !index.gatewayOfBranch.has(branchId)) {
        index.gatewayOfBranch.set(branchId, node);
      }
      const at = node.anchor?.statementIndex;
      if (node.detail?.source === 'CHECK' && at !== undefined && !index.gatewayOfCheck.has(at)) {
        index.gatewayOfCheck.set(at, node);
      }
    }
    if (node.kind === 'loop') {
      const at = node.anchor?.statementIndex;
      if (at !== undefined && !index.loopOfStatement.has(at)) index.loopOfStatement.set(at, node);
    }
  });
  for (const nodes of index.nodesOfRegion.values()) nodes.sort((a, b) => a.at - b.at || a.pos - b.pos);
  return index;
}

class RuleSetBuilder {
  private lines: string[];
  private candidates: RuleCandidate[];
  private constants: DeclaredConstant[];
  private program: string | null;
  private unreached: Set<string>;
  private helpers: Set<string>;
  private cloneOf = new Map<string, number>();
  private index: RuleSetIndex;

  constructor(
    source: string,
    private facts: ProcessFacts,
    private skeleton: ProcessSkeleton,
  ) {
    this.lines = source.split(/\r?\n/);
    const report = readBusinessRulesFrom(facts.statements, facts.structure, facts.control);
    this.candidates = report.candidates;
    this.constants = report.constants;
    this.program = this.readProgram();
    this.index = buildIndex(facts, skeleton);
    this.unreached = new Set(skeleton.notDrawn.unreached.map((u) => u.name));
    this.helpers = new Set(skeleton.notDrawn.technicalHelpers.map((h) => h.name));
    skeleton.notDrawn.clones.forEach((group, i) => {
      for (const name of group.names) this.cloneOf.set(name, i);
    });
  }

  build(): BusinessRuleSet {
    const occurrences = this.readOccurrences();
    const groups = this.join(occurrences);

    const rules = groups.map((group, i) => this.rule(`BR-${String(i + 1).padStart(3, '0')}`, group));

    const withoutProcessElement: Record<NoProcessElementReason, number> = {
      'declaration-only': 0,
      unreached: 0,
      'technical-helper': 0,
      'not-in-skeleton': 0,
    };
    for (const rule of rules) {
      if (rule.withoutProcessElement) withoutProcessElement[rule.withoutProcessElement.reason] += 1;
    }

    return {
      program: this.program,
      rules,
      counts: {
        candidates: this.candidates.length,
        rules: rules.length,
        byType: {
          rule: rules.filter((r) => r.type === 'rule').length,
          control: rules.filter((r) => r.type === 'control').length,
        },
        withProcessElement: rules.filter((r) => r.processElements.length > 0).length,
        withoutProcessElement,
        sentences: rules.reduce((sum, r) => sum + r.sentences.length, 0),
      },
    };
  }

  /* ---------------- reading ---------------- */

  private readProgram(): string | null {
    for (const statement of this.facts.statements) {
      if (!PROGRAM_KEYWORDS.has(statement.keyword)) continue;
      const name = /^\S+\s+([\w/]+)/.exec(statement.text)?.[1];
      if (name) return name.toUpperCase();
    }
    return null;
  }

  private anchor(range: SourceRange): RuleAnchor {
    return {
      lineStart: range.lineStart,
      lineEnd: range.lineEnd,
      quote: this.lines
        .slice(range.lineStart - 1, range.lineEnd)
        .map((line) => line.trim())
        .join('\n'),
    };
  }

  /**
   * The places. Candidates of one condition share a place; a `WHEN` is a place of
   * its own; so is a declaration.
   */
  private readOccurrences(): Occurrence[] {
    const byPlace = new Map<string, Occurrence>();
    const guards = guardStatements(this.facts.statements);

    this.candidates.forEach((candidate, index) => {
      const key = [
        candidate.origin, candidate.branchId ?? '', candidate.lineStart, candidate.lineEnd,
        candidate.conditionText,
      ].join('|');
      const known = byPlace.get(key);
      if (known) {
        known.members.push(index);
        return;
      }

      const occurrence: Occurrence = {
        origin: candidate.origin,
        conditionText: candidate.conditionText,
        container: candidate.container ?? null,
        members: [index],
        lineStart: candidate.lineStart,
        lineEnd: candidate.lineEnd,
      };

      if (candidate.branchId) {
        const branch = this.index.branchById.get(candidate.branchId);
        const armIndex = branch?.arms.findIndex(
          (arm) => arm.header.lineStart === candidate.lineStart && arm.condition === candidate.conditionText,
        ) ?? -1;
        if (branch && armIndex >= 0) {
          occurrence.branch = branch;
          occurrence.armIndex = armIndex;
        }
      } else if (candidate.origin === 'check' || candidate.origin === 'while') {
        const keyword = candidate.origin === 'check' ? 'CHECK' : 'WHILE';
        occurrence.statement = guards.get(
          guardKey(keyword, candidate.lineStart, candidate.conditionText),
        );
      }

      if (candidate.origin !== 'constant') {
        const renumbered = occurrence.container !== null && this.cloneOf.has(occurrence.container);
        const scope = renumbered ? `copies-${this.cloneOf.get(occurrence.container as string)}` : 'any';
        const body = candidate.origin === 'when'
          ? `when:${conditionKey(candidate.subject ?? '', renumbered)}:${conditionKey(candidate.conditionText, renumbered)}`
          : `cond:${conditionKey(candidate.conditionText, renumbered)}`;
        occurrence.sameTestKey = `${scope}|${body}`;
      }

      byPlace.set(key, occurrence);
    });

    return [...byPlace.values()];
  }

  /** Union of the four joins in the header. Returns the groups in source order. */
  private join(occurrences: Occurrence[]): Occurrence[][] {
    const parent = occurrences.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
    };

    const firstBy = new Map<string, number>();
    const link = (key: string, o: number) => {
      const first = firstBy.get(key);
      if (first === undefined) firstBy.set(key, o);
      else union(first, o);
    };

    occurrences.forEach((occurrence, o) => {
      // 1. one condition — already one occurrence.
      for (const member of occurrence.members) {
        const candidate = this.candidates[member];
        // 2. one value list.
        if (candidate.valueSetId) link(`set:${candidate.valueSetId}`, o);
        // 3. one constant: the declaration and every reader.
        if (candidate.origin === 'constant' && candidate.subject) link(`const:${candidate.subject.toUpperCase()}`, o);
        if (candidate.viaConstant) link(`const:${candidate.viaConstant.name.toUpperCase()}`, o);
      }
      // 4. the same test written again.
      if (occurrence.sameTestKey) link(`test:${occurrence.sameTestKey}`, o);
    });

    const groups = new Map<number, Occurrence[]>();
    occurrences.forEach((occurrence, o) => {
      const root = find(o);
      groups.set(root, [...(groups.get(root) ?? []), occurrence]);
    });

    const firstMember = (group: Occurrence[]) => Math.min(...group.flatMap((o) => o.members));
    return [...groups.values()]
      .map((group) => group.sort((a, b) => Math.min(...a.members) - Math.min(...b.members)))
      .sort((a, b) => firstMember(a) - firstMember(b));
  }

  /* ---------------- one rule ---------------- */

  private rule(id: string, group: Occurrence[]): BusinessRule {
    const members = group.flatMap((o) => o.members).sort((a, b) => a - b);
    const parameters = members.map((m) => this.parameter(this.candidates[m]));
    const declarations = group.filter((o) => o.origin === 'constant');
    const conditions = group.filter((o) => o.origin !== 'constant');

    const readings = conditions.map((o) => ({ occurrence: o, reading: this.typeOf(o) }));
    const controls = readings.filter((r) => r.reading.control);
    const type: BusinessRuleType = controls.length ? 'control' : 'rule';
    const basisFrom = controls.length ? controls : readings;
    const typeBasis: BusinessRule['typeBasis'] = [];
    for (const { reading } of basisFrom) {
      const entry = typeBasis.find((t) => t.basis === reading.basis);
      const anchor = this.anchor(reading.anchor);
      if (entry) {
        if (!entry.anchors.some((a) => a.lineStart === anchor.lineStart && a.lineEnd === anchor.lineEnd)) {
          entry.anchors.push(anchor);
        }
      } else {
        typeBasis.push({ basis: reading.basis, anchors: [anchor] });
      }
    }
    if (!conditions.length) {
      typeBasis.push({ basis: 'declaration-only', anchors: declarations.map((d) => this.anchor(d)) });
    }

    const sentences = new SentenceWriter();
    this.writeDeclarations(sentences, declarations);
    this.writeConditions(sentences, conditions, readings);
    this.writeCaveats(sentences, members);

    const processElements = this.processElementsOf(conditions);

    return {
      id,
      label: this.labelOf(group),
      property: 'hard-coded',
      type,
      typeBasis,
      sentences: sentences.out,
      text: sentences.out.map((s) => s.text).join(' '),
      classes: [...new Set(parameters.map((p) => p.ruleClass))],
      parameters,
      sources: this.sourcesOf(group),
      processElements,
      ...(processElements.length
        ? {}
        : { withoutProcessElement: this.whyNoElement(conditions, declarations) }),
    };
  }

  private parameter(candidate: RuleCandidate): RuleParameter {
    return {
      candidateId: candidate.id,
      origin: candidate.origin,
      conditionText: candidate.conditionText,
      valueOffset: candidate.valueOffset,
      subject: candidate.subject,
      subjectKind: candidate.subjectKind,
      operator: candidate.operator,
      literal: candidate.literal,
      values: candidate.values,
      ruleClass: candidate.ruleClass,
      ...(candidate.viaConstant ? { viaConstant: candidate.viaConstant.name } : {}),
      ...(candidate.caveat ? { caveat: candidate.caveat } : {}),
      lineStart: candidate.lineStart,
      lineEnd: candidate.lineEnd,
    };
  }

  private labelOf(group: Occurrence[]): string {
    const first = group.find((o) => o.origin !== 'constant');
    if (!first) {
      const candidate = this.candidates[group[0].members[0]];
      return `${candidate.subject ?? ''} VALUE ${candidate.literal}`;
    }
    if (first.origin !== 'when') return first.conditionText;
    const values = group
      .filter((o) => o.origin === 'when' && o.branch === first.branch)
      .flatMap((o) => o.members.map((m) => this.candidates[m].literal));
    return `CASE ${first.branch?.selector ?? ''}: ${values.join(', ')}`;
  }

  private sourcesOf(group: Occurrence[]): RuleSource[] {
    const out: RuleSource[] = [];
    for (const occurrence of group) {
      const routine = occurrence.container;
      const className = this.index.classContainers
        .filter((c) => c.lineStart <= occurrence.lineStart && c.lineEnd >= occurrence.lineEnd)
        .map((c) => c.name)
        .pop() ?? null;
      const source: RuleSource = {
        program: this.program,
        include: null,
        routine,
        routineKind: routine
          ? containerAt(this.facts.structure.containers, occurrence.lineStart)?.kind ?? null
          : null,
        className,
      };
      if (!out.some((s) => s.routine === source.routine && s.className === source.className)) out.push(source);
    }
    return out;
  }

  /* ---------------- rule or control ---------------- */

  private inLoop(statementIndex: number): boolean {
    return (this.facts.structure.enclosing[statementIndex] ?? []).some((b) => LOOP_KINDS.has(b.kind));
  }

  /** The body of one arm as a statement index range, both ends inclusive. */
  private armBody(branch: Branch, armIndex: number): [number, number] {
    const next = branch.arms[armIndex + 1];
    return [branch.arms[armIndex].headerIndex + 1, (next ? next.headerIndex : branch.closeIndex) - 1];
  }

  /** The first statement directly in the arm that ends the flow. */
  private endIn(branch: Branch, armIndex: number): { statement: AbapStatement; kind: EndKind } | null {
    const [from, to] = this.armBody(branch, armIndex);
    const inLoop = this.inLoop(branch.openIndex);
    for (let i = from; i <= to; i++) {
      const enclosing = this.facts.structure.enclosing[i] ?? [];
      // Directly in this arm: a RETURN inside a nested IF ends the flow only sometimes.
      if (enclosing[enclosing.length - 1]?.openIndex !== branch.openIndex) continue;
      const statement = this.facts.statements[i];
      const kind = endKindOf(statement, inLoop);
      if (kind) return { statement, kind };
    }
    return null;
  }

  private typeOf(occurrence: Occurrence): TypeReading {
    const { branch, armIndex, statement } = occurrence;
    if (occurrence.origin === 'check' && statement) {
      return this.inLoop(statement.index)
        ? { basis: 'skips-iteration', control: false, anchor: statement }
        : { basis: 'check-leaves', control: true, anchor: statement };
    }
    if (occurrence.origin === 'while' && statement) {
      return { basis: 'loop-condition', control: false, anchor: statement };
    }
    if (branch && armIndex !== undefined) {
      const end = this.endIn(branch, armIndex);
      if (end) return { basis: 'ends-flow', control: true, anchor: end.statement, endKind: end.kind };
      const plainElse = branch.kind === 'if' && branch.arms.length === 2 && armIndex === 0
        && branch.arms[1].kind === 'else';
      if (plainElse) {
        const elseEnd = this.endIn(branch, 1);
        if (elseEnd) {
          return { basis: 'else-ends-flow', control: true, anchor: elseEnd.statement, endKind: elseEnd.kind };
        }
      }
      const arm = branch.arms[armIndex];
      return { basis: 'flow-continues', control: false, anchor: arm };
    }
    return { basis: 'flow-continues', control: false, anchor: occurrence };
  }

  /* ---------------- sentences ---------------- */

  private writeDeclarations(sentences: SentenceWriter, declarations: Occurrence[]): void {
    for (const declaration of declarations) {
      const candidate = this.candidates[declaration.members[0]];
      const constant = this.constants.find(
        (c) => c.lineStart === declaration.lineStart && c.written === candidate.subject,
      );
      sentences.add('declaration', [
        code(candidate.subject ?? ''),
        text(' is declared as a constant'),
        ...(constant?.type ? [text(' of type '), code(constant.type)] : []),
        text(' with the value '),
        code(candidate.literal),
        text('.'),
      ], [this.anchor(declaration)]);
    }
  }

  private where(container: string | null): SentencePart[] {
    return container ? [text('In '), code(container), text(', ')] : [text('At program level, ')];
  }

  private writeConditions(
    sentences: SentenceWriter,
    conditions: Occurrence[],
    readings: Array<{ occurrence: Occurrence; reading: TypeReading }>,
  ): void {
    const writtenCases = new Set<Branch>();
    const writtenTests = new Set<string>();

    const readingOf = (o: Occurrence) => readings.find((r) => r.occurrence === o)?.reading;

    for (const occurrence of conditions) {
      if (occurrence.origin === 'when') {
        this.writeCase(sentences, occurrence, conditions, writtenCases);
        this.writeEnds(sentences, [occurrence], readingOf);
        continue;
      }
      const key = occurrence.sameTestKey ?? '';
      if (writtenTests.has(key)) continue;
      writtenTests.add(key);
      const same = conditions.filter((o) => o.sameTestKey === key);
      this.writeTest(sentences, occurrence);
      this.writeRepeated(sentences, same);
      this.writeEnds(sentences, same, readingOf);
    }
  }

  private writeTest(sentences: SentenceWriter, occurrence: Occurrence): void {
    const where = this.where(occurrence.container);
    const at = [this.anchor(occurrence)];
    const condition = code(occurrence.conditionText);
    switch (occurrence.origin) {
      case 'if':
        sentences.add('condition-if', [...where, text('the code tests '), condition, text('.')], at);
        break;
      case 'elseif':
        sentences.add('condition-elseif', [
          ...where, text('if no earlier condition of the same IF holds, the code tests '), condition, text('.'),
        ], at);
        break;
      case 'check':
        if (occurrence.statement && this.inLoop(occurrence.statement.index)) {
          sentences.add('condition-check-loop', [
            ...where, code('CHECK'), text(' '), condition,
            text(' skips the rest of the loop pass unless the test holds.'),
          ], at);
        } else {
          sentences.add('condition-check', [
            ...where, code('CHECK'), text(' '), condition, text(' lets processing go on only if the test holds.'),
          ], at);
        }
        return;
      case 'while':
        sentences.add('condition-while', [...where, text('a loop repeats while '), condition, text(' holds.')], at);
        this.writeLoopBody(sentences, occurrence);
        return;
      default:
        return;
    }

    const { branch, armIndex } = occurrence;
    if (branch && armIndex !== undefined) {
      const body = this.bodyRange(branch, armIndex);
      if (body) sentences.add('branch-body', [text('If it holds, the code of this branch runs.')], [this.anchor(body)]);
    }
  }

  private writeCase(
    sentences: SentenceWriter,
    occurrence: Occurrence,
    conditions: Occurrence[],
    written: Set<Branch>,
  ): void {
    const branch = occurrence.branch;
    if (!branch || written.has(branch)) return;
    written.add(branch);
    const arms = conditions.filter((o) => o.origin === 'when' && o.branch === branch);
    const literals = arms.flatMap((o) => o.members.map((m) => this.candidates[m].literal));
    sentences.add('condition-case', [
      ...this.where(occurrence.container),
      code('CASE'), text(' '), code(branch.selector ?? ''),
      text(' has a branch of its own for '), ...codeList(literals), text('.'),
    ], [
      this.anchor(this.facts.statements[branch.openIndex]),
      ...arms.map((o) => this.anchor(o)),
    ]);
    for (const arm of arms) {
      if (arm.armIndex === undefined) continue;
      const body = this.bodyRange(branch, arm.armIndex);
      if (!body) continue;
      sentences.add('case-body', [
        text('For '), ...codeList(arm.members.map((m) => this.candidates[m].literal)),
        text(', the code of this branch runs.'),
      ], [this.anchor(body)]);
    }
  }

  private writeLoopBody(sentences: SentenceWriter, occurrence: Occurrence): void {
    const statement = occurrence.statement;
    if (!statement) return;
    const block = this.facts.structure.blocks.find((b) => b.openIndex === statement.index);
    if (!block || block.closeIndex - block.openIndex < 2) return;
    const first = this.facts.statements[block.openIndex + 1];
    const last = this.facts.statements[block.closeIndex - 1];
    sentences.add('loop-body', [text('While it holds, the body of the loop runs.')], [
      this.anchor({ lineStart: first.lineStart, lineEnd: last.lineEnd }),
    ]);
  }

  private writeRepeated(sentences: SentenceWriter, same: Occurrence[]): void {
    if (same.length < 2) return;
    const names = [...new Set(same.map((o) => o.container))];
    const routines: SentencePart[] = [];
    names.forEach((name, i) => {
      if (i > 0) routines.push(text(i === names.length - 1 ? ' and ' : ', '));
      routines.push(name ? code(name) : text('program level'));
    });
    const copies = same.every((o) => o.container !== null && this.cloneOf.has(o.container))
      && new Set(same.map((o) => this.cloneOf.get(o.container as string))).size === 1;
    const renamed = new Set(same.map((o) => o.conditionText)).size > 1;
    const count = text(String(same.length));
    const anchors = same.map((o) => this.anchor(o));
    if (copies) {
      sentences.add('repeated-copies', [
        text(renamed ? 'The same test, with renamed variables, stands in ' : 'The same test stands in '),
        count, text(' places, in routines the process skeleton reads as copies of one another: '),
        ...routines, text('.'),
      ], anchors);
    } else {
      sentences.add('repeated', [
        text('The same test stands in '), count, text(' places, in '), ...routines, text('.'),
      ], anchors);
    }
  }

  /**
   * One sentence per way the flow ends, anchored at every statement that ends it.
   * `CHECK` gets none: its own sentence already says that it leaves.
   */
  private writeEnds(
    sentences: SentenceWriter,
    occurrences: Occurrence[],
    readingOf: (o: Occurrence) => TypeReading | undefined,
  ): void {
    const ways = new Map<string, { reading: TypeReading; containers: Set<string | null>; anchors: RuleAnchor[] }>();
    for (const occurrence of occurrences) {
      const reading = readingOf(occurrence);
      if (!reading?.control || !reading.endKind) continue;
      const key = `${reading.basis}|${reading.endKind}`;
      const way = ways.get(key) ?? { reading, containers: new Set<string | null>(), anchors: [] };
      way.containers.add(occurrence.container);
      way.anchors.push(this.anchor(reading.anchor));
      ways.set(key, way);
    }
    for (const { reading, containers, anchors } of ways.values()) {
      const negated = reading.basis === 'else-ends-flow';
      const [only] = [...containers];
      const routine = containers.size === 1 && only ? code(only) : text('its routine');
      const phrase: Record<EndKind, SentencePart[]> = {
        return: [text('the code leaves '), routine, text(' here.')],
        exit: [text('the code leaves '), routine, text(' here.')],
        stop: [text('the code stops processing here.')],
        'leave-program': [text('the program ends here.')],
        raise: [text('the code raises an exception here.')],
        'error-message': [text('the code sends an error message here.')],
      };
      sentences.add(negated ? 'else-ends-flow' : 'ends-flow', [
        text(negated ? 'If the test does not hold, ' : 'If the test holds, '),
        ...phrase[reading.endKind as EndKind],
      ], anchors);
    }
  }

  private writeCaveats(sentences: SentenceWriter, members: number[]): void {
    const seen = new Map<string, RuleAnchor[]>();
    const order: Array<{ key: SentenceKey; parts: SentencePart[]; id: string }> = [];
    for (const member of members) {
      const candidate = this.candidates[member];
      const notes: Array<{ key: SentenceKey; parts: SentencePart[] }> = [];
      if (candidate.caveat === CURRENCY_CAVEAT) {
        notes.push({ key: 'currency-not-stated', parts: [
          text('The code does not state the currency of the amount '), code(candidate.literal), text('.'),
        ] });
      } else if (candidate.caveat === UNIT_CAVEAT) {
        notes.push({ key: 'unit-not-stated', parts: [
          text('The code does not state the unit of the quantity '), code(candidate.literal), text('.'),
        ] });
      } else if (candidate.caveat) {
        notes.push({ key: 'caveat', parts: [text('Not stated in the code: '), text(candidate.caveat), text('.')] });
      }
      if (candidate.subject === null) {
        notes.push({ key: 'subject-not-named', parts: [
          text('The code compares '), code(candidate.literal), text(' with an expression, not with a named field.'),
        ] });
      }
      for (const note of notes) {
        const id = `${note.key}|${note.parts.map((p) => p.value).join('')}`;
        const anchor = this.anchor(candidate);
        const known = seen.get(id);
        if (known) {
          if (!known.some((a) => a.lineStart === anchor.lineStart)) known.push(anchor);
          continue;
        }
        seen.set(id, [anchor]);
        order.push({ ...note, id });
      }
    }
    for (const note of order) sentences.add(note.key, note.parts, seen.get(note.id) ?? []);
  }

  private bodyRange(branch: Branch, armIndex: number): SourceRange | null {
    const [from, to] = this.armBody(branch, armIndex);
    if (to < from) return null;
    return { lineStart: this.facts.statements[from].lineStart, lineEnd: this.facts.statements[to].lineEnd };
  }

  /* ---------------- process elements ---------------- */

  private element(node: SkeletonNode, relation: ProcessRelation): RuleProcessElement | null {
    if (!node.anchor) return null;
    return {
      nodeId: node.id,
      kind: node.kind,
      label: node.label,
      region: node.region,
      relation,
      lineStart: node.anchor.lineStart,
      lineEnd: node.anchor.lineEnd,
    };
  }

  /**
   * Nodes of `region` whose statement lies strictly between `after` and
   * `before`, in the order a walk over `skeleton.nodes` would meet them.
   *
   * The window is cut out of the region's own nodes, ordered by statement, so
   * the cost follows the size of the answer rather than the size of the source.
   */
  private nodesBetween(region: string, after: number, before: number): SkeletonNode[] {
    const nodes = this.index.nodesOfRegion.get(region);
    if (!nodes) return [];
    let lo = 0;
    let hi = nodes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nodes[mid].at <= after) lo = mid + 1;
      else hi = mid;
    }
    const window: Array<{ pos: number; node: SkeletonNode }> = [];
    for (let i = lo; i < nodes.length && nodes[i].at < before; i++) window.push(nodes[i]);
    return window.sort((a, b) => a.pos - b.pos).map((entry) => entry.node);
  }

  private processElementsOf(conditions: Occurrence[]): RuleProcessElement[] {
    const out: RuleProcessElement[] = [];
    const taken = new Set<string>();
    const push = (node: SkeletonNode, relation: ProcessRelation) => {
      if (taken.has(`${node.id}|${relation}`)) return;
      taken.add(`${node.id}|${relation}`);
      const element = this.element(node, relation);
      if (element) out.push(element);
    };

    for (const occurrence of conditions) {
      const { branch, armIndex, statement } = occurrence;
      if (branch && armIndex !== undefined) {
        const gateway = this.index.gatewayOfBranch.get(branch.id);
        if (!gateway) continue;
        push(gateway, 'condition');
        const next = branch.arms[armIndex + 1];
        const before = next ? next.headerIndex : branch.closeIndex;
        for (const node of this.nodesBetween(gateway.region, branch.arms[armIndex].headerIndex, before)) {
          push(node, 'branch');
        }
      } else if (statement && occurrence.origin === 'check') {
        const gateway = this.index.gatewayOfCheck.get(statement.index);
        if (gateway) push(gateway, 'condition');
      } else if (statement && occurrence.origin === 'while') {
        const loop = this.index.loopOfStatement.get(statement.index);
        if (!loop) continue;
        push(loop, 'condition');
        const block = this.facts.structure.blocks.find((b) => b.openIndex === statement.index);
        if (block) {
          for (const node of this.nodesBetween(loop.region, block.openIndex, block.closeIndex)) push(node, 'branch');
        }
      }
    }
    return out.sort((a, b) => a.lineStart - b.lineStart || (a.relation === b.relation ? 0 : a.relation === 'condition' ? -1 : 1));
  }

  private whyNoElement(
    conditions: Occurrence[],
    declarations: Occurrence[],
  ): { reason: NoProcessElementReason; detail: string } {
    const first = conditions[0];
    if (!first) {
      const name = this.candidates[declarations[0]?.members[0] ?? 0]?.subject ?? 'The constant';
      return {
        reason: 'declaration-only',
        detail: `${name} is declared, but no IF, CASE, CHECK or WHILE in this source reads it.`,
      };
    }
    const routine = first.container;
    if (routine && this.unreached.has(routine)) {
      return {
        reason: 'unreached',
        detail: `${routine} is not reached from any event block in this source, so the process skeleton does not draw it.`,
      };
    }
    if (routine && this.helpers.has(routine)) {
      return {
        reason: 'technical-helper',
        detail: `${routine} has no effect of its own and is folded into its callers, so the process skeleton draws no element inside it.`,
      };
    }
    const kind = containerAt(this.facts.structure.containers, first.lineStart)?.kind;
    return {
      reason: 'not-in-skeleton',
      detail: kind === 'method'
        ? `${routine ?? 'This method'} is a method; the process skeleton draws event blocks and FORMs, not methods.`
        : 'The process skeleton draws no element at this place.',
    };
  }
}

/** Writes a sentence only when it has an anchor. */
class SentenceWriter {
  out: RuleSentence[] = [];

  add(key: SentenceKey, parts: SentencePart[], anchors: RuleAnchor[]): void {
    if (!anchors.length) return;
    this.out.push({ key, text: parts.map((p) => p.value).join(''), parts, anchors });
  }
}
