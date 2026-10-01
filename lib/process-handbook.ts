import type { BusinessRule, BusinessRuleSet, NoProcessElementReason } from '@/lib/abap/business-rule-set';
import { humaniseField, plainContext, ruleToSentence, type PlainContext } from '@/lib/abap/plain-language';
import { TABLE_TERMS_EN } from '@/lib/abap/plain-glossary';
import { isEventTag, type ProcessMapElement, type ProcessMapModel } from '@/lib/process-map';
import type { ProcessNavigation } from '@/lib/process-navigation';
import type { DocAnchor, ProcessDocumentation } from '@/lib/process-documentation';
import type { ObjectSite } from '@/lib/process-overlays';

/**
 * The process handbook of the Documentation stage — the canvas-first layout of
 * the 3.0 tools (owner decision 01.10.2026, proposal B).
 *
 * A handbook is the process read as chapters: one chapter for every step on the
 * top level of the map, in the order the flow visits them, each with what the
 * step does, the rules that decide in it, the data it reads and writes, the ways
 * it ends early, and who carries it out — the last one only where a model
 * proposal for it is stored, because the code names authorizations and screens,
 * never people.
 *
 * Nothing here is new knowledge. Every field is picked out of something the
 * engine already derived from the source the active run signed:
 *
 *   - the map model (`lib/process-map.ts`) for the steps, their plain names,
 *     their anchors, early ends and proposed lanes;
 *   - the process documentation (`lib/process-documentation-build.ts`) for the
 *     business sentence the engine attached to each element;
 *   - the rule set (`lib/abap/business-rule-set.ts`) for `BR-nnn` and where each
 *     rule takes effect;
 *   - the object sites (`lib/process-overlays.ts`) for the tables and calls the
 *     code behind each element touches.
 *
 * Pure: no model, no network, no clock. The same inputs give the same handbook.
 */

export interface HandbookAnchor {
  lineStart: number;
  lineEnd: number;
}

export interface HandbookText {
  text: string;
  anchors: HandbookAnchor[];
}

export interface HandbookRule {
  /** `BR-nnn` — stable per source. */
  id: string;
  /** The rule in plain words (`ruleToSentence`), or null when the condition has none. */
  plain: string | null;
  /** The engine's sentence about the rule — the technical reading. */
  text: string;
  anchor: HandbookAnchor | null;
}

export interface HandbookException {
  /** The element on the map that ends the flow early. */
  id: string;
  label: string;
  anchor: HandbookAnchor | null;
}

export interface HandbookObject {
  name: string;
  /** The business word for a table the glossary knows, null otherwise. */
  plain: string | null;
  line: number;
}

export interface HandbookStep {
  id: string;
  outline: string;
  label: string;
  kind: string;
  anchor: HandbookAnchor | null;
  /** Nesting below the chapter: 1 for a step directly inside it. */
  depth: number;
}

export interface HandbookChapter {
  /** The element on the top level of the map this chapter is about. */
  id: string;
  /** 1-based position among the chapters. */
  number: number;
  /** The outline number of the element — the same one the outline and search use. */
  outline: string;
  title: string;
  technicalName: string;
  kind: string;
  anchor: HandbookAnchor | null;
  /** True when the element opens a level of its own on the map. */
  hasSteps: boolean;
  /** How many elements the chapter covers, itself included. */
  elementIds: string[];
  /**
   * One plain sentence put together from the facts below — what the chapter
   * reads, writes and calls, and how often it ends early. Composed, not
   * written: every clause names an object or a count that is listed with its
   * line in the same chapter. Empty when there is nothing to say.
   */
  summary: string;
  /** The steps inside the chapter, in outline order, events left out. */
  steps: HandbookStep[];
  /** The engine's business sentences for the elements of this chapter, in flow order. */
  description: HandbookText[];
  rules: HandbookRule[];
  exceptions: HandbookException[];
  reads: HandbookObject[];
  writes: HandbookObject[];
  calls: HandbookObject[];
  /** Lanes the naming stage proposed for elements of this chapter. A model proposal, never a fact. */
  proposedRoles: string[];
}

export interface HandbookInput {
  /** Program input: a field of the selection screen. */
  name: string;
  plain: string;
  line: number;
  kind: 'parameter' | 'range' | 'switch';
}

export interface HandbookRuleOutside {
  id: string;
  text: string;
  reason: NoProcessElementReason;
  detail: string;
  anchor: HandbookAnchor | null;
}

export interface ProcessHandbook {
  chapters: HandbookChapter[];
  /** Element id (any level) → the chapter it belongs to. */
  chapterOf: Map<string, string>;
  inputs: HandbookInput[];
  /** Every table the program writes, first line first. */
  writes: HandbookObject[];
  /** Every function module, transaction or report the program calls by name. */
  calls: HandbookObject[];
  rulesOutside: HandbookRuleOutside[];
  counts: {
    elements: number;
    anchored: number;
    rules: number;
    rulesInProcess: number;
    exceptions: number;
    exceptionsWithLines: number;
  };
}

export interface ProcessHandbookSources {
  model: ProcessMapModel;
  nav: ProcessNavigation;
  /** The engine's documentation of the same model — for the business sentences. */
  doc: ProcessDocumentation | null;
  /** `deriveBusinessRules(source)`, or null while it is being read. */
  rules: BusinessRuleSet | null;
  /** `sitesByElement(...)` — element id → the objects its code touches. */
  sites: Map<string, ObjectSite[]>;
  /** The signed source, for the selection screen. */
  source: string;
}

const DECISION_TAGS = new Set(['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway']);

/** True for an element that is a chapter of its own: a step on the top level. */
export function isChapterElement(element: ProcessMapElement): boolean {
  return !isEventTag(element.tag) && !DECISION_TAGS.has(element.tag) && element.tag !== 'boundaryEvent';
}

function plainTable(name: string): string | null {
  return TABLE_TERMS_EN[name.toLowerCase()]?.singular ?? null;
}

const NEUTRAL = new Set(['', 'condition met', 'condition met?']);

/** The rule in plain words, the way the workspace's business card words it. */
function rulePlain(rule: BusinessRule, ctx: PlainContext): string | null {
  const first = rule.parameters[0];
  if (!first) return null;
  const sentence = first.operator.toUpperCase() === 'VALUE' && first.subject
    ? ruleToSentence({ constant: { name: first.subject, value: first.literal } }, ctx)
    : ruleToSentence({ condition: first.conditionText }, ctx);
  const clean = sentence.trim();
  return NEUTRAL.has(clean.toLowerCase()) || clean.length < 3 ? null : clean;
}

function ruleAnchor(rule: BusinessRule): HandbookAnchor | null {
  const first = rule.sentences[0]?.anchors[0];
  return first ? { lineStart: first.lineStart, lineEnd: first.lineEnd } : null;
}

function distinctObjects(sites: ObjectSite[], keep: (site: ObjectSite) => boolean): HandbookObject[] {
  const seen = new Map<string, HandbookObject>();
  for (const site of sites) {
    if (!keep(site) || seen.has(site.name)) continue;
    seen.set(site.name, {
      name: site.name,
      plain: site.kind === 'table' ? plainTable(site.name) : null,
      line: site.line,
    });
  }
  return [...seen.values()];
}

/** Every element of a subtree, the root first, in outline order. */
function subtree(nav: ProcessNavigation, id: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    out.push(current);
    for (const child of nav.entries.get(current)?.children ?? []) walk(child);
  };
  walk(id);
  return out;
}

/** The fields of the selection screen, with the line each is declared on. */
export function selectionInputs(source: string): HandbookInput[] {
  const ctx = plainContext(source);
  const out: HandbookInput[] = [];
  const seen = new Set<string>();
  for (const statement of ctx.statements) {
    const m = /^(PARAMETERS|PARAMETER|SELECT-OPTIONS)\b\s*:?\s*([\s\S]*)$/i.exec(statement.text);
    if (!m) continue;
    for (const part of m[2].split(',')) {
      const name = part.trim().split(/\s+/)[0]?.toLowerCase().replace(/\(\d+\)$/, '');
      if (!name || seen.has(name)) continue;
      const field = ctx.selections.get(name);
      if (!field) continue;
      seen.add(name);
      // A chained `PARAMETERS:` is one statement over several lines; each
      // field is anchored on the line that declares it.
      const pattern = new RegExp(`(^|[\\s:,])${name.replace(/[^\w/]/g, '')}(?![\\w/])`, 'i');
      let line = statement.line;
      for (let at = statement.line; at <= statement.endLine; at++) {
        if (pattern.test(ctx.lines[at - 1] ?? '')) {
          line = at;
          break;
        }
      }
      out.push({
        name,
        plain: humaniseField(name, ctx),
        line,
        kind: field.selectOption ? 'range' : field.checkbox ? 'switch' : 'parameter',
      });
    }
  }
  return out;
}

const objectWords = (all: HandbookObject[]): string => {
  // Three named and the rest counted: a lead sentence, not an inventory. The
  // full list stands under "Reads · writes" with every line.
  const objects = all.slice(0, 3);
  const rest = all.length - objects.length;
  const words = objects.map((o) => (o.plain ? `${o.plain.charAt(0).toLowerCase()}${o.plain.slice(1)} (${o.name})` : o.name));
  if (rest > 0) return `${words.join(', ')} and ${rest} more`;
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
};

/** "Reads purchase requisition (EBAN). Can end early in 1 place." — facts only. */
export function summaryOf(
  reads: HandbookObject[],
  writes: HandbookObject[],
  calls: HandbookObject[],
  exceptions: number,
): string {
  const parts: string[] = [];
  if (reads.length) parts.push(`Reads ${objectWords(reads)}.`);
  if (writes.length) parts.push(`Changes ${objectWords(writes)}.`);
  if (calls.length) parts.push(`Calls ${objectWords(calls)}.`);
  if (exceptions === 1) parts.push('Can end early in 1 place.');
  else if (exceptions > 1) parts.push(`Can end early in ${exceptions} places.`);
  return parts.join(' ');
}

export function buildProcessHandbook(input: ProcessHandbookSources): ProcessHandbook {
  const { model, nav, doc, rules, sites, source } = input;
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const statementById = new Map((doc?.statements ?? []).map((statement) => [statement.id, statement]));
  const sentenceOf = new Map((doc?.steps ?? []).map((step) => [step.id, step.statementId]));

  const ctx = plainContext(source);
  const chapters: HandbookChapter[] = [];
  const chapterOf = new Map<string, string>();

  for (const rootId of nav.roots) {
    const element = byId.get(rootId);
    const entry = nav.entries.get(rootId);
    if (!element || !entry) continue;
    const ids = subtree(nav, rootId);
    if (!isChapterElement(element)) {
      for (const id of ids) chapterOf.set(id, rootId);
      continue;
    }
    for (const id of ids) chapterOf.set(id, rootId);

    const hasSteps = entry.children.length > 0;
    const description: HandbookText[] = [];
    const seenStatements = new Set<string>();
    for (const id of ids) {
      // The sentence at a routine's call site is about the calling ("the
      // routines are called one after another"), and it is attached to every
      // routine it names. The chapter of a routine reads its own body.
      if (id === rootId && hasSteps) continue;
      const statementId = sentenceOf.get(id);
      if (!statementId || seenStatements.has(statementId)) continue;
      const statement = statementById.get(statementId);
      if (!statement) continue;
      seenStatements.add(statementId);
      description.push({ text: statement.text, anchors: statement.anchors.map((a: DocAnchor) => ({ ...a })) });
    }

    const nodeIds = new Set(ids.map((id) => byId.get(id)?.nodeId).filter((id): id is string => !!id));
    const chapterRules: HandbookRule[] = rules
      ? rules.rules
          .filter((rule) => rule.processElements.some((place) => nodeIds.has(place.nodeId)))
          .map((rule) => ({ id: rule.id, plain: rulePlain(rule, ctx), text: rule.text, anchor: ruleAnchor(rule) }))
      : [];

    const exceptions: HandbookException[] = ids
      .map((id) => byId.get(id))
      .filter((e): e is ProcessMapElement => !!e && (e.early || e.tag === 'boundaryEvent'))
      .map((e) => ({ id: e.id, label: e.label, anchor: e.anchor ? { ...e.anchor } : null }));

    const touched = ids.flatMap((id) => sites.get(id) ?? []).sort((a, b) => a.line - b.line);
    const roles = [...new Set(ids.map((id) => byId.get(id)?.lane).filter((lane): lane is string => !!lane))];

    const steps: HandbookStep[] = ids
      .slice(1)
      .map((id) => byId.get(id))
      .filter((e): e is ProcessMapElement => !!e && !isEventTag(e.tag) && e.tag !== 'boundaryEvent')
      .map((e) => {
        const at = nav.entries.get(e.id);
        return {
          id: e.id,
          outline: at?.outline ?? '',
          label: e.label,
          kind: e.kind,
          anchor: e.anchor ? { ...e.anchor } : null,
          depth: Math.max(1, (at?.depth ?? 1) - entry.depth),
        };
      });

    const reads = distinctObjects(touched, (s) => s.kind === 'table' && s.use !== 'write');
    const writes = distinctObjects(touched, (s) => s.kind === 'table' && s.use === 'write');
    const calls = distinctObjects(touched, (s) => s.kind !== 'table');

    chapters.push({
      id: rootId,
      number: chapters.length + 1,
      outline: entry.outline,
      title: element.label,
      technicalName: element.technicalName,
      kind: element.kind,
      anchor: element.anchor ? { ...element.anchor } : null,
      hasSteps,
      elementIds: ids,
      summary: summaryOf(reads, writes, calls, exceptions.length),
      steps,
      description,
      rules: chapterRules,
      exceptions,
      reads,
      writes,
      calls,
      proposedRoles: roles,
    });
  }

  const allSites = [...sites.values()].flat().sort((a, b) => a.line - b.line);
  const rulesOutside: HandbookRuleOutside[] = (rules?.rules ?? [])
    .filter((rule) => rule.withoutProcessElement)
    .map((rule) => ({
      id: rule.id,
      text: rule.text,
      reason: rule.withoutProcessElement!.reason,
      detail: rule.withoutProcessElement!.detail,
      anchor: ruleAnchor(rule),
    }));

  const allExceptions = model.elements.filter((e) => e.early || e.tag === 'boundaryEvent');

  return {
    chapters,
    chapterOf,
    inputs: selectionInputs(source),
    writes: distinctObjects(allSites, (s) => s.kind === 'table' && s.use === 'write'),
    calls: distinctObjects(allSites, (s) => s.kind !== 'table'),
    rulesOutside,
    counts: {
      elements: model.traceability.flowNodes,
      anchored: model.traceability.anchored,
      rules: rules?.rules.length ?? 0,
      rulesInProcess: (rules?.rules.length ?? 0) - rulesOutside.length,
      exceptions: allExceptions.length,
      exceptionsWithLines: allExceptions.filter((e) => e.anchor !== null).length,
    },
  };
}

/* ------------------------------------------------------------ transport */

/** The handbook as plain data — for a server page that hands it to the browser. */
export type ProcessHandbookData = Omit<ProcessHandbook, 'chapterOf'> & { chapterOf: Array<[string, string]> };

export function handbookToData(handbook: ProcessHandbook): ProcessHandbookData {
  return { ...handbook, chapterOf: [...handbook.chapterOf.entries()] };
}

export function handbookFromData(data: ProcessHandbookData): ProcessHandbook {
  return { ...data, chapterOf: new Map(data.chapterOf) };
}
