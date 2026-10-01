/**
 * The Business view's opening card in plain language — "simple on top,
 * complete underneath".
 *
 * The first look (`lib/first-look.ts`) already knows everything this card
 * says: the program, its tables, the rules that stand in the code, the
 * decisions, what is not determined and how much of the process is traced to a
 * line. What it did with that was print it as an engineer reads it — `IF
 * gs_eban-waers <> 'EUR'` under a heading. A process owner stops reading there.
 *
 * This module re-cuts the same reading for that reader, and adds nothing to it:
 *
 *   - one **summary** sentence that says what the program touches, in the
 *     words of the glossary where it has one and in the table's own name where
 *     it has none;
 *   - four **key facts** — rules fixed in the code, decisions, points not
 *     determined, traceability — each with a one-line explanation;
 *   - the **headline**: the most decisive rules in one sentence, the rest one
 *     click deeper;
 *   - every **rule** and every **decision** in plain words, each still carrying
 *     its line anchor and the code it was read from.
 *
 * **No model call, no invented meaning.** The plain words come from a
 * deterministic wording (`PlainWording`) that reads the code and a fixed
 * glossary. Where the wording has nothing to say, the field is `null` and the
 * card shows the code itself — a technical line that is true beats a business
 * line that was guessed. Every figure carries where it came from, exactly as
 * the first look's figures do.
 */

import type { BusinessRule, BusinessRuleSet } from './abap/business-rule-set';
import type { ProcessSkeleton } from './abap/process-skeleton';
import {
  conditionToPhrase,
  humaniseField,
  plainContext,
  plainLabels,
  ruleToSentence,
} from './abap/plain-language';
import { TABLE_TERMS_EN } from './abap/plain-glossary';
import type { TableDependency } from './abap/table-dependencies';
import {
  anchorLabel,
  decisionLines,
  type FigureOrigin,
  type Traceability,
} from './first-look';
import type { NotDetermined, NotDeterminedItem } from './workspace-model';

/* ------------------------------------------------------------------ wording */

/**
 * What the card needs from the plain-language wording. Every method answers
 * `null` when it cannot say the thing without guessing.
 */
export interface PlainWording {
  /** A table as a business reader names it — "purchase requisitions". */
  table(name: string): string | null;
  /** The rule as a sentence — "Only plant 1000 is handled." */
  ruleSentence(rule: BusinessRule): string | null;
  /** The rule as a short phrase for the headline — "plant 1000". */
  rulePhrase(rule: BusinessRule): string | null;
  /** The decision (a gateway node) as a question, and where each answer leads. */
  decision(nodeId: string): { question: string; outcomes: string[] } | null;
}

/** No wording at all: every plain field stays `null` and the code is shown. */
export const NO_WORDING: PlainWording = {
  table: () => null,
  ruleSentence: () => null,
  rulePhrase: () => null,
  decision: () => null,
};

/**
 * The wording of `lib/abap/plain-language.ts`, bound to one source and its
 * skeleton. That module answers every call — with a neutral "Condition met"
 * where it cannot read a condition. Here a neutral answer becomes `null`, so
 * the card shows the code instead of a sentence that says nothing.
 */
const NEUTRAL = new Set(['', 'condition met', 'condition met?']);
// Fewer than three characters is a bare value ("K"), not something a reader can follow.
const meaningful = (text: string): string | null =>
  NEUTRAL.has(text.trim().toLowerCase()) || text.trim().length < 3 ? null : text;
const lcFirst = (text: string): string =>
  // Keep an acronym or a code value as it is: "EUR", "NB".
  /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;

export function plainWordingFor(source: string, skeleton: ProcessSkeleton): PlainWording {
  const ctx = plainContext(source);
  const labels = plainLabels(skeleton, source);
  const outs = new Map<string, ProcessSkeleton['edges']>();
  for (const edge of skeleton.edges) outs.set(edge.from, [...(outs.get(edge.from) ?? []), edge]);

  const first = (rule: BusinessRule) => rule.parameters[0];
  const constantOf = (rule: BusinessRule) => {
    const p = first(rule);
    return p && p.operator.toUpperCase() === 'VALUE' && p.subject ? { name: p.subject, value: p.literal } : null;
  };

  return {
    table: (name) => {
      const term = TABLE_TERMS_EN[name.toLowerCase()];
      return term ? lcFirst(term.plural) : null;
    },
    ruleSentence: (rule) => {
      const constant = constantOf(rule);
      const p = first(rule);
      if (constant) return meaningful(ruleToSentence({ constant }, ctx));
      if (!p) return null;
      return meaningful(ruleToSentence({ condition: p.conditionText }, ctx));
    },
    rulePhrase: (rule) => {
      const constant = constantOf(rule);
      const p = first(rule);
      if (constant) {
        const subject = meaningful(humaniseField(constant.name, ctx));
        return subject ? `${lcFirst(subject)} ${constant.value.replace(/^['`]|['`]$/g, '')}` : null;
      }
      if (!p) return null;
      const phrase = meaningful(conditionToPhrase(p.conditionText, ctx, p.lineStart));
      return phrase ? lcFirst(phrase) : null;
    },
    decision: (nodeId) => {
      const question = meaningful(labels.nodes.get(nodeId) ?? '');
      if (!question) return null;
      const outcomes = (outs.get(nodeId) ?? [])
        .filter((edge) => edge.kind !== 'boundary')
        .map((edge) => {
          const arm = labels.flow(edge);
          const next = labels.nodes.get(edge.to);
          return arm && next ? `${arm} → ${next}` : null;
        })
        .filter((o): o is string => o !== null);
      // An arm that only reaches the end of its routine says nothing a reader
      // can use; when every arm does, the outcomes are left out.
      const unique = [...new Set(outcomes)];
      return { question, outcomes: unique.every((o) => / → Done$/.test(o)) ? [] : unique };
    },
  };
}

/* -------------------------------------------------------------------- model */

export interface CardRule {
  id: string;
  /** The plain sentence, or null — then the card shows `code`. */
  sentence: string | null;
  /** The short phrase for the headline, or null — then the card shows `code`. */
  phrase: string | null;
  /** The condition as the source writes it. */
  code: string;
  anchors: string[];
  /** True when the code ends the flow on it — the decisive ones lead. */
  control: boolean;
}

export interface CardDecision {
  nodeId: string;
  /** The plain question, or null — then the card shows `code`. */
  question: string | null;
  /** The outcomes in plain words; empty when the wording names none. */
  outcomes: string[];
  code: string;
  anchor: string | null;
}

export type CardFactKey = 'rules' | 'decisions' | 'not-determined' | 'traceability';

export interface CardFact {
  key: CardFactKey;
  /** Formatted, or null when nothing measured it — never printed as 0. */
  value: string | null;
  label: string;
  /** One plain line under the figure. */
  explanation: string;
  origin: FigureOrigin;
}

export interface CardSummary {
  /**
   * `touches` — the sentence names what the program reads and changes;
   * `none` — the source names no table, and the sentence says so.
   */
  kind: 'touches' | 'none';
  sentence: string;
  /** The tables behind the sentence, by their names in the code — shown with the code. */
  technical: string;
}

export interface OpenGroup {
  label: string;
  count: number;
  /** The first few anchors of the group. */
  anchors: string[];
}

export interface BusinessCard {
  summary: CardSummary;
  facts: CardFact[];
  /** The most decisive rules, for the one-sentence headline. */
  featured: CardRule[];
  rules: CardRule[];
  decisions: CardDecision[];
  open: {
    count: number;
    noSource: boolean;
    /**
     * The open points grouped by what they are, in the order they first occur
     * — "Local function-module call (6)" once instead of six times. The full
     * list, each with its reason, stays in its own card.
     */
    groups: OpenGroup[];
  };
}

/** How many rules the headline names, and how many anchors an open group shows. */
export const FEATURED_RULES = 3;
export const OPEN_GROUP_ANCHORS = 2;

/** Open points grouped by label, first occurrence first. */
export function groupOpen(items: readonly NotDeterminedItem[]): OpenGroup[] {
  const groups = new Map<string, OpenGroup>();
  for (const item of items) {
    const group = groups.get(item.label) ?? { label: item.label, count: 0, anchors: [] };
    group.count += 1;
    if (group.anchors.length < OPEN_GROUP_ANCHORS && !group.anchors.includes(item.anchor)) {
      group.anchors.push(item.anchor);
    }
    groups.set(item.label, group);
  }
  return [...groups.values()];
}

/* ------------------------------------------------------------------ helpers */

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** `A`, `A and B`, `A, B and C`. */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const NAMED_TABLES = 3;

/**
 * Two short sentences about what the program touches.
 *
 * Built only from the tables the source names in SQL, in the order it first
 * names them. Reading and changing are two verbs because the code says which;
 * anything beyond that — *why* it reads them — is not in the code and is not
 * in the sentence. Tables the wording has a word for are named by it; the
 * rest are counted, not guessed, and every name stays in `technical`.
 */
export function summaryOf(
  dependencies: readonly Pick<TableDependency, 'table' | 'access'>[],
  wording: PlainWording,
): CardSummary {
  const reads: string[] = [];
  const writes: string[] = [];
  for (const d of dependencies) {
    if (d.access === 'read' && !reads.includes(d.table)) reads.push(d.table);
    if (d.access === 'write' && !writes.includes(d.table)) writes.push(d.table);
  }
  if (reads.length === 0 && writes.length === 0) {
    return {
      kind: 'none',
      sentence: 'The program names no database table, so this view cannot say what data it works on.',
      technical: '',
    };
  }
  const part = (verb: string, tables: string[]): string => {
    const worded = tables
      .map((t) => wording.table(t))
      .filter((w): w is string => w !== null)
      .filter((w, i, all) => all.indexOf(w) === i)
      .slice(0, NAMED_TABLES);
    // Without a single word, name the first two tables as the code does.
    const named = worded.length > 0 ? worded : tables.slice(0, 2);
    const rest = tables.length - named.length;
    const list = joinList(named);
    return rest > 0
      ? `${verb} ${list}, plus ${plural(rest, 'more table', 'more tables')}.`
      : `${verb} ${list}.`;
  };
  const sentences = [
    reads.length > 0 ? part('Reads', reads) : null,
    writes.length > 0 ? part('Changes', writes) : null,
  ].filter((c): c is string => c !== null);
  const technical = [
    reads.length > 0 ? `reads ${reads.join(', ')}` : null,
    writes.length > 0 ? `changes ${writes.join(', ')}` : null,
  ].filter((c): c is string => c !== null);
  return { kind: 'touches', sentence: sentences.join(' '), technical: technical.join(' · ') };
}

function cardRule(rule: BusinessRule, wording: PlainWording): CardRule {
  return {
    id: rule.id,
    sentence: wording.ruleSentence(rule),
    phrase: wording.rulePhrase(rule),
    code: rule.label,
    anchors: [
      ...new Set(
        rule.sentences.flatMap((s) => s.anchors.map((a) => anchorLabel(a.lineStart, a.lineEnd))),
      ),
    ],
    control: rule.type === 'control',
  };
}

/**
 * The rules the headline names: the ones the code ends the flow on first, then
 * the ones that take effect in the drawn process, then the source's order. A
 * rule with a plain phrase beats one without, so the sentence stays readable
 * while the wording grows. Deterministic — the same source names the same three.
 */
export function featuredRules(rules: readonly CardRule[], set: BusinessRuleSet): CardRule[] {
  const inProcess = new Set(set.rules.filter((r) => r.processElements.length > 0).map((r) => r.id));
  const score = (r: CardRule) =>
    (r.phrase ? 4 : 0) + (r.control ? 2 : 0) + (inProcess.has(r.id) ? 1 : 0);
  return rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => score(b.rule) - score(a.rule) || a.index - b.index)
    .slice(0, FEATURED_RULES)
    .map(({ rule }) => rule);
}

function percentFloor(part: number, whole: number): string {
  // Floor, never round: 99.6 % traced is not "100 %".
  return `${Math.floor((part / whole) * 100)} %`;
}

/* -------------------------------------------------------------- the builder */

export function buildBusinessCard(input: {
  skeleton: ProcessSkeleton;
  ruleSet: BusinessRuleSet;
  dependencies: readonly Pick<TableDependency, 'table' | 'access'>[];
  traceability: Traceability;
  open: NotDetermined;
  wording?: PlainWording;
}): BusinessCard {
  const wording = input.wording ?? NO_WORDING;
  const rules = input.ruleSet.rules.map((r) => cardRule(r, wording));
  const decisions: CardDecision[] = decisionLines(input.skeleton).map((d) => {
    const plain = wording.decision(d.nodeId);
    return {
      nodeId: d.nodeId,
      question: plain?.question ?? null,
      outcomes: plain?.outcomes ?? [],
      code: d.label,
      anchor: d.anchor,
    };
  });
  const { traceability, open } = input;

  const facts: CardFact[] = [
    {
      key: 'rules',
      value: String(rules.length),
      label: rules.length === 1 ? 'rule fixed in the code' : 'rules fixed in the code',
      explanation: 'Values written into the program itself. Changing one means changing code.',
      origin: 'engine',
    },
    {
      key: 'decisions',
      value: String(decisions.length),
      label: decisions.length === 1 ? 'decision' : 'decisions',
      explanation: 'Points where the program takes one path or another.',
      origin: 'engine',
    },
    {
      key: 'not-determined',
      value: open.noSource ? null : String(open.count),
      label: 'not determined',
      explanation: 'What the code alone cannot tell. Each point is listed with its reason.',
      origin: open.noSource ? 'absent' : 'engine',
    },
    {
      key: 'traceability',
      value: traceability.nodes > 0 ? percentFloor(traceability.anchored, traceability.nodes) : null,
      label: 'linked to the code',
      explanation:
        traceability.nodes > 0
          ? `${traceability.anchored} of ${traceability.nodes} process elements point to a line of code.`
          : 'No process elements were drawn, so nothing is linked.',
      origin: traceability.nodes > 0 ? 'engine' : 'absent',
    },
  ];

  return {
    summary: summaryOf(input.dependencies, wording),
    facts,
    featured: featuredRules(rules, input.ruleSet),
    rules,
    decisions,
    open: { count: open.count, noSource: open.noSource, groups: groupOpen(open.items) },
  };
}

/** "11 business rules hard-coded in the program — " / "No business rule …". */
export function headlineLead(count: number): string {
  if (count === 0) {
    return 'No hard-coded business rule was found in this source. That is the boundary of what the rule reader looks for, not a statement about your process.';
  }
  return `${plural(count, 'business rule', 'business rules')} hard-coded in the program`;
}
