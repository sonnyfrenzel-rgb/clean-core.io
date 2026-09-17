import { CC_NAMESPACE, type BpmnExport } from './bpmn/export';
import { UNANCHORED, type NamedProcess, type NamingState } from './process-naming';
import { isProvenanceValue, provenance, type ProvenanceValue } from './provenance';

/**
 * The reading view of the reconstructed process — roadmap 2.5.
 *
 * 2.6 already writes the process as BPMN 2.0 XML, with every flow node carrying
 * its skeleton node, its line range and its status under `extensionElements` in
 * the Clean-Core.io namespace. 2.4 proposes business names for those same
 * skeleton nodes. This module puts the two together into one thing a screen can
 * draw, and it does that by **reading the file**, not by computing a second
 * opinion beside it:
 *
 *   - **The status of an element is the status in the file.** It is read out of
 *     `cc:trace/@status` and never derived here. Today 2.6 writes
 *     `reconstructed` on everything, because *Confirmed* is an account's word
 *     (roadmap 3.5) and *Proven* is evidence. When something in the product
 *     starts writing another value into that attribute, the legend follows on
 *     its own — there is no second table here to forget to update.
 *   - **An element without a line range is visibly `Unanchored`** — 2.4's word,
 *     imported rather than respelt — with the reason the skeleton gave. A good
 *     business name is not evidence, and neither is a tidy box on a diagram.
 *   - **The traceability quote is 2.6's `stats`**, not a number counted again
 *     here. Two counts of the same thing drift; one does not.
 *
 * Pure: no React, no DOM, no network. The browser builds a model to draw, the
 * route that stores the quote builds the same model from the project's stored
 * source, and both read this file. Nothing here reaches a signed run — the quote
 * is a measurement of the map, not evidence about the code, and it is not part
 * of any audit pack.
 */

/* ------------------------------------------------------------------ *
 * Reading the file 2.6 wrote.
 * ------------------------------------------------------------------ */

/** Bumped when the stored record changes shape. */
export const PROCESS_MAP_FORMAT_VERSION = 1;

/** What one `cc:trace` says about the element it sits on. */
export interface ReconstructionTrace {
  /** `@status` — a value of `lib/provenance.ts`, or null when the file says something else. */
  status: ProvenanceValue | null;
  /** `@node` — the skeleton node the element was drawn from. */
  node: string | null;
  /** `@kind` — the skeleton's kind, for readers that want more than the BPMN tag. */
  kind: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  /** `@unanchoredReason`, when the element carries no line range. */
  unanchoredReason: string | null;
}

/**
 * Every `<…>` of a document, in order.
 *
 * A line-based scan is wrong here: `bpmn:documentation` carries newlines in its
 * text (they survive `escapeText` on purpose), so a closing tag can end a line
 * of prose. A `<` never appears inside text or inside an attribute value —
 * `lib/bpmn/xml.ts` escapes both — so finding the `>` that is not inside quotes
 * is enough, and it is exact rather than nearly right.
 */
function* tags(xml: string): Generator<string> {
  let i = 0;
  while (i < xml.length) {
    const open = xml.indexOf('<', i);
    if (open < 0) return;
    if (xml.startsWith('<?', open) || xml.startsWith('<!', open)) {
      const end = xml.indexOf('>', open);
      if (end < 0) return;
      i = end + 1;
      continue;
    }
    let j = open + 1;
    let quote = '';
    while (j < xml.length) {
      const ch = xml[j];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j += 1;
    }
    if (j >= xml.length) return;
    yield xml.slice(open, j + 1);
    i = j + 1;
  }
}

const ATTRIBUTE = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"([^"]*)"/g;

/** The five entities `escapeAttribute` writes, plus the three character references. `&amp;` last. */
function unescape(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&#9;/g, '\t')
    .replace(/&amp;/g, '&');
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Past the element name, so a name containing `=` could not be read as one.
  const body = tag.replace(/^<\/?[A-Za-z_][-A-Za-z0-9_:.]*/, '');
  for (const match of body.matchAll(ATTRIBUTE)) out[match[1]] = unescape(match[2]);
  return out;
}

function tagName(tag: string): string {
  return /^<\/?([A-Za-z_][-A-Za-z0-9_:.]*)/.exec(tag)?.[1] ?? '';
}

function number(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface ParsedElement {
  id: string;
  tag: string;
  name: string;
  /** Id of the enclosing `subProcess`, or null for the top-level process. */
  plane: string | null;
  trace: ReconstructionTrace | null;
}

interface ParsedFlow {
  id: string;
  sourceRef: string;
  targetRef: string;
  /** The condition as the code writes it — 2.6 puts it on the flow's `name`. */
  condition: string;
}

export interface ParsedBpmn {
  /** Declares the Clean-Core.io namespace this module reads traces from. */
  namespace: string | null;
  processName: string;
  elements: ParsedElement[];
  flows: ParsedFlow[];
}

/** BPMN tags that are flow nodes — what a reader can select, focus and open a code card for. */
const FLOW_TAGS = new Set([
  'startEvent',
  'endEvent',
  'exclusiveGateway',
  'parallelGateway',
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
  'boundaryEvent',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
]);

/**
 * The BPMN of 2.6, read back.
 *
 * Only what a reading view needs: flow nodes with their trace, and the sequence
 * flows between them with the condition 2.6 wrote on each. Diagram interchange,
 * data stores, pools and annotations are drawn by bpmn-js from the same file and
 * are not repeated here.
 */
export function parseBpmn(xml: string): ParsedBpmn {
  const elements: ParsedElement[] = [];
  const flows: ParsedFlow[] = [];
  const stack: Array<{ tag: string; id: string | null }> = [];
  let namespace: string | null = null;
  let processName = '';

  const byId = new Map<string, ParsedElement>();

  for (const tag of tags(xml)) {
    const name = tagName(tag);
    if (tag.startsWith('</')) {
      // Pop to the matching open tag. `bpmn:documentation` and the other text
      // elements never open a frame, so the top of the stack is the match.
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const selfClosing = /\/>$/.test(tag);
    const attrs = attributes(tag);

    if (name === 'bpmn:definitions') namespace = attrs['xmlns:cc'] ?? null;
    if (name === 'bpmn:process') processName = attrs.name ?? '';

    const local = name.startsWith('bpmn:') ? name.slice('bpmn:'.length) : null;

    if (name === 'cc:trace') {
      // The nearest enclosing element with an id is the one this trace is about.
      const host = [...stack].reverse().find((frame) => frame.id);
      const element = host?.id ? byId.get(host.id) : undefined;
      if (element && !element.trace) {
        const status = attrs.status;
        element.trace = {
          status: isProvenanceValue(status) ? status : null,
          node: attrs.node ?? null,
          kind: attrs.kind ?? null,
          lineStart: number(attrs.lineStart),
          lineEnd: number(attrs.lineEnd),
          unanchoredReason: attrs.anchored === 'false' ? (attrs.unanchoredReason ?? '') : null,
        };
      }
    }

    if (local && attrs.id) {
      if (FLOW_TAGS.has(local)) {
        const plane = [...stack].reverse().find((frame) => frame.tag === 'bpmn:subProcess')?.id ?? null;
        const element: ParsedElement = { id: attrs.id, tag: local, name: attrs.name ?? '', plane, trace: null };
        elements.push(element);
        byId.set(element.id, element);
      } else if (local === 'sequenceFlow' && attrs.sourceRef && attrs.targetRef) {
        flows.push({
          id: attrs.id,
          sourceRef: attrs.sourceRef,
          targetRef: attrs.targetRef,
          condition: attrs.name ?? '',
        });
      }
    }

    if (!selfClosing) stack.push({ tag: name, id: attrs.id ?? null });
  }

  return { namespace, processName, elements, flows };
}

/* ------------------------------------------------------------------ *
 * The model a screen draws.
 * ------------------------------------------------------------------ */

/**
 * What a BPMN tag is called for a reader — the first half of an element's
 * accessible name (`DESIGN.md` §5.7: *"Decision: amount above limit? …"*).
 */
const KIND_WORDS: Record<string, string> = {
  startEvent: 'Start',
  endEvent: 'End',
  exclusiveGateway: 'Decision',
  parallelGateway: 'Parallel split',
  task: 'Step',
  serviceTask: 'Service step',
  sendTask: 'Message step',
  receiveTask: 'Message wait',
  userTask: 'User step',
  manualTask: 'Manual step',
  businessRuleTask: 'Business rule',
  scriptTask: 'Step',
  callActivity: 'Call',
  subProcess: 'Sub-process',
  boundaryEvent: 'Error boundary',
  intermediateCatchEvent: 'Wait',
  intermediateThrowEvent: 'Event',
};

export function kindWord(tag: string): string {
  return KIND_WORDS[tag] ?? 'Step';
}

const DECISION_TAGS = new Set(['exclusiveGateway', 'parallelGateway']);
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

export interface ProcessMapBranch {
  /** The condition as the code writes it. Empty for an unconditional flow. */
  condition: string;
  /** The element the branch goes to. */
  to: string;
  /** What that element is called on the map. */
  toLabel: string;
}

export interface ProcessMapElement {
  /** The BPMN element id — what bpmn-js knows it by, and what a selection names. */
  id: string;
  /** The BPMN tag without its prefix (`exclusiveGateway`, `serviceTask`). */
  tag: string;
  /** "Decision", "Service step" — `kindWord(tag)`. */
  kind: string;
  /** The name in the file: the technical label the skeleton read out of the source. */
  technicalName: string;
  /** 2.4's business name for this node, or null. Beside the technical name, never instead of it. */
  businessName: string | null;
  /** What the step list shows first. The business name when there is one. */
  label: string;
  /** The skeleton node this element was drawn from (2.6's `elementNode`). */
  nodeId: string | null;
  /** Straight out of `cc:trace/@status`. */
  status: ProvenanceValue;
  anchor: { lineStart: number; lineEnd: number } | null;
  /** `Unanchored` when there is no line range, whatever the element is called. */
  evidenceLabel: string | null;
  unanchoredReason: string | null;
  /** The sub-process whose plane this element is drawn on; null for the top plane. */
  plane: string | null;
  /** The plane this element opens, when it is a collapsed sub-process. */
  opensPlane: string | null;
  /** The lane 2.4 proposed for this node, or null. A proposal, never a mandate. */
  lane: string | null;
  branches: ProcessMapBranch[];
  /** Art, Titel, Anker und Herkunft in one line — `DESIGN.md` §5.7. */
  accessibleName: string;
}

export interface ProcessMapPlane {
  /** Null for the top plane; otherwise the id of the sub-process element. */
  id: string | null;
  label: string;
  elementIds: string[];
}

export interface ProcessMapLegendEntry {
  value: ProvenanceValue;
  label: string;
  count: number;
}

export interface ProcessMapTraceability {
  flowNodes: number;
  anchored: number;
  unanchored: number;
  /** `anchored / flowNodes`, as a percentage with one decimal. Null when there is nothing to anchor. */
  percent: number | null;
  /** The line above the map. Never rounds 99.9 % up to 100 %. */
  sentence: string;
}

export interface ProcessMapModel {
  processName: string;
  /** The file the signed run analysed. */
  fileName: string;
  /** The BPMN 2.0 XML of roadmap 2.6 — what the viewer draws, unchanged. */
  xml: string;
  elements: ProcessMapElement[];
  planes: ProcessMapPlane[];
  /** Reconstructed · Confirmed · Proven, in that order, counted from the file. */
  legend: ProcessMapLegendEntry[];
  traceability: ProcessMapTraceability;
  /** *"Process with 14 steps and 5 decisions."* — `DESIGN.md` §5.7. */
  overview: string;
  /** 2.4's state and its one sentence, passed through unchanged. */
  naming: { state: NamingState; notice: string | null; named: number };
  /** The lanes 2.4 proposed, with the sentence every one of them carries. */
  lanes: Array<{ key: string; name: string; statement: string; anchored: boolean }>;
}

/** The three the legend of roadmap 2.5 names, in the roadmap's order. */
export const LEGEND_VALUES: readonly ProvenanceValue[] = Object.freeze([
  'reconstructed',
  'confirmed',
  'proven',
] as ProvenanceValue[]);

function percentOf(anchored: number, total: number): number | null {
  if (total <= 0) return null;
  // Floor at one decimal: 40 of 41 is 97.5 %, and 41 of 41 is the only 100 %.
  return Math.floor((anchored / total) * 1000) / 10;
}

export function traceabilityOf(stats: { flowNodes: number; anchored: number; unanchored: number }): ProcessMapTraceability {
  const percent = percentOf(stats.anchored, stats.flowNodes);
  const sentence = stats.flowNodes === 0
    ? 'No element was drawn from this source, so there is nothing to trace.'
    : `${stats.anchored} of ${stats.flowNodes} elements carry a line anchor — ${percent?.toFixed(1)} % traceability.`
      + (stats.unanchored > 0
        ? ` ${stats.unanchored} ${stats.unanchored === 1 ? 'is' : 'are'} ${UNANCHORED.toLowerCase()}.`
        : '');
  return { flowNodes: stats.flowNodes, anchored: stats.anchored, unanchored: stats.unanchored, percent, sentence };
}

function overviewOf(elements: ProcessMapElement[]): string {
  const steps = elements.filter((e) => ACTIVITY_TAGS.has(e.tag)).length;
  const decisions = elements.filter((e) => DECISION_TAGS.has(e.tag)).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `Process with ${plural(steps, 'step', 'steps')} and ${plural(decisions, 'decision', 'decisions')}.`;
}

function accessibleNameOf(element: Omit<ProcessMapElement, 'accessibleName'>): string {
  const where = element.anchor
    ? element.anchor.lineStart === element.anchor.lineEnd
      ? `line ${element.anchor.lineStart}`
      : `lines ${element.anchor.lineStart} to ${element.anchor.lineEnd}`
    : element.unanchoredReason
      ? `${UNANCHORED.toLowerCase()} — ${element.unanchoredReason.replace(/\.\s*$/, '')}`
      : UNANCHORED.toLowerCase();
  const name = element.businessName
    ? `${element.businessName} (${element.technicalName})`
    : element.technicalName || element.id;
  return `${element.kind}: ${name}. ${where}, ${provenance(element.status).label.toLowerCase()}.`;
}

/** A draft element, before its accessible name is written. */
type Draft = Omit<ProcessMapElement, 'accessibleName'>;

/**
 * The elements of one plane, in the order a reader walks them.
 *
 * `DESIGN.md` §5.7 gives the arrow keys one meaning — *"→/↓ next step"* — and
 * "next" has to mean next **in the process**, not next in the array the export
 * happened to build. So: a depth-first walk from the start of the plane along
 * its sequence flows, branches in the order the file writes them, each element
 * visited once. Anything the walk never reaches — an error handler hanging off a
 * boundary event, a fragment with no inbound flow — follows in file order, so
 * the list is complete and the step list and the map stay the same list.
 *
 * Deterministic: the same file gives the same order, which is what lets a reader
 * learn where a step is (§5.9, "stabile Anordnung").
 */
function alongTheFlow(group: Draft[]): Draft[] {
  if (group.length < 2) return group;
  const inPlane = new Set(group.map((d) => d.id));
  const byId = new Map(group.map((d) => [d.id, d]));
  const targeted = new Set<string>();
  for (const draft of group) {
    for (const branch of draft.branches) if (inPlane.has(branch.to)) targeted.add(branch.to);
  }
  const roots = group.filter((d) => d.tag === 'startEvent' || !targeted.has(d.id));

  const seen = new Set<string>();
  const out: Draft[] = [];
  // An explicit stack rather than recursion: a plane may hold thousands of
  // elements in one chain (`lib/bpmn/model.ts` stops at 5,000), and a long
  // straight process should not be the thing that ends in a stack overflow.
  for (const root of roots) {
    const stack: Draft[] = [root];
    while (stack.length) {
      const draft = stack.pop() as Draft;
      if (seen.has(draft.id)) continue;
      seen.add(draft.id);
      out.push(draft);
      // Reversed, so the first branch in the file is the first one walked.
      for (let i = draft.branches.length - 1; i >= 0; i -= 1) {
        const next = byId.get(draft.branches[i].to);
        if (next && inPlane.has(draft.branches[i].to)) stack.push(next);
      }
    }
  }
  for (const draft of group) if (!seen.has(draft.id)) out.push(draft);
  return out;
}

export interface ProcessMapInput {
  /** What `buildBpmnExport` returned for the source the run signed. */
  bpmn: Pick<BpmnExport, 'xml' | 'elementNode' | 'stats'>;
  /** What `applyNaming` returned for the same source. */
  named: NamedProcess;
  /** `inputFingerprint.fileName` of the signed run. */
  fileName: string;
}

/**
 * The model, out of the file and the naming.
 *
 * Every field that says something about the code comes from the file; every
 * field that says something in business language comes from the naming and is
 * marked as a proposal where it is shown. Nothing is invented in between.
 */
export function buildProcessMapModel({ bpmn, named, fileName }: ProcessMapInput): ProcessMapModel {
  const parsed = parseBpmn(bpmn.xml);
  const namedById = new Map(named.nodes.map((n) => [n.id, n]));
  const laneOfNode = new Map<string, string>();
  for (const lane of named.lanes) for (const id of lane.nodes) laneOfNode.set(id, lane.name);
  const labelOf = new Map<string, string>();

  const drafts = parsed.elements.map((element) => {
    const nodeId = bpmn.elementNode[element.id] ?? element.trace?.node ?? null;
    const node = nodeId ? namedById.get(nodeId) : undefined;
    const technicalName = element.name || node?.technicalName || element.id;
    const businessName = node?.businessName ?? null;
    const label = businessName ?? technicalName;
    labelOf.set(element.id, label);
    const anchor = element.trace && element.trace.lineStart !== null && element.trace.lineEnd !== null
      ? { lineStart: element.trace.lineStart, lineEnd: element.trace.lineEnd }
      : null;
    return {
      id: element.id,
      tag: element.tag,
      kind: kindWord(element.tag),
      technicalName,
      businessName,
      label,
      nodeId,
      // A file that says nothing about an element's status is not a file that
      // proves one: `reconstructed` is the weakest thing the map can claim, and
      // claiming less than the file does is the safe direction.
      status: element.trace?.status ?? 'reconstructed',
      anchor,
      evidenceLabel: anchor ? null : UNANCHORED,
      unanchoredReason: element.trace?.unanchoredReason || null,
      plane: element.plane,
      opensPlane: element.tag === 'subProcess' ? element.id : null,
      lane: nodeId ? (laneOfNode.get(nodeId) ?? null) : null,
      branches: [] as ProcessMapBranch[],
    };
  });

  const byId = new Map(drafts.map((d) => [d.id, d]));
  for (const flow of parsed.flows) {
    const source = byId.get(flow.sourceRef);
    if (!source) continue;
    source.branches.push({
      condition: flow.condition,
      to: flow.targetRef,
      toLabel: labelOf.get(flow.targetRef) ?? flow.targetRef,
    });
  }

  // One group per plane, in the order the planes first appear in the file.
  const planeOrder: ProcessMapPlane[] = [{ id: null, label: parsed.processName || fileName, elementIds: [] }];
  const planeIndex = new Map<string | null, ProcessMapPlane>([[null, planeOrder[0]]]);
  const groups = new Map<string | null, typeof drafts>([[null, []]]);
  for (const draft of drafts) {
    let plane = planeIndex.get(draft.plane);
    if (!plane) {
      plane = { id: draft.plane, label: labelOf.get(draft.plane as string) ?? (draft.plane as string), elementIds: [] };
      planeIndex.set(draft.plane, plane);
      planeOrder.push(plane);
      groups.set(draft.plane, []);
    }
    groups.get(draft.plane)?.push(draft);
  }

  const elements: ProcessMapElement[] = [];
  for (const plane of planeOrder) {
    const ordered = alongTheFlow(groups.get(plane.id) ?? []);
    for (const draft of ordered) {
      plane.elementIds.push(draft.id);
      elements.push({ ...draft, accessibleName: accessibleNameOf(draft) });
    }
  }

  const counts = new Map<ProvenanceValue, number>();
  for (const element of elements) counts.set(element.status, (counts.get(element.status) ?? 0) + 1);

  return {
    processName: parsed.processName || fileName,
    fileName,
    xml: bpmn.xml,
    elements,
    planes: planeOrder,
    legend: LEGEND_VALUES.map((value) => ({
      value,
      label: provenance(value).label,
      count: counts.get(value) ?? 0,
    })),
    traceability: traceabilityOf(bpmn.stats),
    overview: overviewOf(elements),
    naming: { state: named.state, notice: named.notice, named: named.counts.named },
    lanes: named.lanes.map((lane) => ({
      key: lane.key,
      name: lane.name,
      statement: lane.statement,
      anchored: lane.evidence === 'anchored',
    })),
  };
}

/** The elements of one plane, in the order the file draws them. */
export function elementsOfPlane(model: ProcessMapModel, plane: string | null): ProcessMapElement[] {
  return model.elements.filter((element) => element.plane === plane);
}

/* ------------------------------------------------------------------ *
 * The code card.
 * ------------------------------------------------------------------ */

export type CodeTokenKind = 'keyword' | 'literal' | 'name' | 'comment' | 'plain';

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

export interface CodeCardLine {
  number: number;
  tokens: CodeToken[];
  highlighted?: boolean;
}

/**
 * ABAP, coloured just enough for `DESIGN.md` §1.1.
 *
 * Five colours and no more, and the one that matters is `literal`: a literal in
 * a condition is very often the hidden business rule this product exists to
 * find. Presentational only — nothing here decides anything, and the evidence
 * engine in `lib/abap/**` is the only thing that reads ABAP for meaning.
 */
const ABAP_KEYWORDS = new Set([
  'AND', 'APPEND', 'ASSIGN', 'AT', 'AUTHORITY-CHECK', 'BREAK-POINT', 'CALL', 'CASE', 'CATCH', 'CHECK',
  'CLASS', 'CLEAR', 'COMMIT', 'CONCATENATE', 'CONSTANTS', 'CONTINUE', 'CREATE', 'DATA', 'DELETE',
  'DESCRIBE', 'DO', 'ELSE', 'ELSEIF', 'END-OF-SELECTION', 'ENDCASE', 'ENDCLASS', 'ENDDO', 'ENDFORM',
  'ENDFUNCTION', 'ENDIF', 'ENDLOOP', 'ENDMETHOD', 'ENDMODULE', 'ENDSELECT', 'ENDTRY', 'ENDWHILE',
  'EXCEPTIONS', 'EXIT', 'EXPORT', 'EXPORTING', 'FIELD-SYMBOLS', 'FORM', 'FREE', 'FROM', 'FUNCTION',
  'IF', 'IMPORT', 'IMPORTING', 'IN', 'INCLUDE', 'INSERT', 'INTO', 'IS', 'LEAVE', 'LOOP', 'MESSAGE',
  'METHOD', 'MODIFY', 'MODULE', 'MOVE', 'NOT', 'OR', 'PARAMETERS', 'PERFORM', 'RAISE', 'READ',
  'RECEIVE', 'REPORT', 'RETURN', 'ROLLBACK', 'SELECT', 'SELECT-OPTIONS', 'SET', 'SORT',
  'START-OF-SELECTION', 'SUBMIT', 'TABLES', 'TRY', 'TYPE', 'TYPES', 'UPDATE', 'USING', 'VALUE',
  'WAIT', 'WHEN', 'WHERE', 'WHILE', 'WRITE',
]);

/** Keywords after which the next word names something — a form, a function, a program. */
const NAMES_FOLLOW = new Set(['PERFORM', 'FORM', 'FUNCTION', 'SUBMIT', 'INCLUDE', 'METHOD', 'CLASS', 'MODULE']);

export function tokenizeAbapLine(line: string): CodeToken[] {
  if (/^\*/.test(line)) return [{ kind: 'comment', text: line }];
  const tokens: CodeToken[] = [];
  let namesNext = false;
  // Words, quoted literals, an inline comment to the end of the line, and everything between.
  const pattern = /'(?:[^']|'')*'|`[^`]*`|"[^\n]*$|[A-Za-z_][A-Za-z0-9_/-]*|\d+(?:\.\d+)?|[^A-Za-z0-9_'"`]+/g;
  for (const match of line.matchAll(pattern)) {
    const text = match[0];
    if (text.startsWith('"')) {
      tokens.push({ kind: 'comment', text });
      continue;
    }
    if (text.startsWith("'") || text.startsWith('`') || /^\d/.test(text)) {
      tokens.push({ kind: 'literal', text });
      namesNext = false;
      continue;
    }
    if (/^[A-Za-z_]/.test(text)) {
      const upper = text.toUpperCase();
      if (ABAP_KEYWORDS.has(upper)) {
        tokens.push({ kind: 'keyword', text });
        namesNext = NAMES_FOLLOW.has(upper);
        continue;
      }
      tokens.push({ kind: namesNext ? 'name' : 'plain', text });
      namesNext = false;
      continue;
    }
    tokens.push({ kind: 'plain', text });
  }
  return tokens.length ? tokens : [{ kind: 'plain', text: line }];
}

/** How many lines of context the code card shows on each side of an anchor. */
export const CODE_CARD_CONTEXT = 4;

/**
 * The lines of the source an anchor points at, with a little context.
 *
 * The highlighted lines are the anchor's real lines — `lineStart` to `lineEnd`
 * of the file, counted from 1 — and never an approximation of them. A card that
 * marked "about here" would be worse than no card: the whole claim of this
 * product is that a statement on a screen can be checked against a line.
 */
export function codeCardLines(
  source: string,
  anchor: { lineStart: number; lineEnd: number },
  context = CODE_CARD_CONTEXT,
): CodeCardLine[] {
  const lines = source.split(/\r\n|\r|\n/);
  const first = Math.max(1, anchor.lineStart - context);
  const last = Math.min(lines.length, anchor.lineEnd + context);
  const out: CodeCardLine[] = [];
  for (let n = first; n <= last; n += 1) {
    const text = lines[n - 1] ?? '';
    const highlighted = n >= anchor.lineStart && n <= anchor.lineEnd;
    out.push({ number: n, tokens: tokenizeAbapLine(text), ...(highlighted ? { highlighted: true } : {}) });
  }
  return out;
}

/** "Z_MM_PO_CHECK, lines 405 to 415" — the label of a code card. */
export function codeCardLabel(fileName: string, anchor: { lineStart: number; lineEnd: number }): string {
  return anchor.lineStart === anchor.lineEnd
    ? `${fileName}, line ${anchor.lineStart}`
    : `${fileName}, lines ${anchor.lineStart} to ${anchor.lineEnd}`;
}

/* ------------------------------------------------------------------ *
 * The stored quote.
 * ------------------------------------------------------------------ */

/**
 * What the server stores per model — roadmap 2.5, *"Traceability-Quote je
 * Modell gespeichert"*.
 *
 * Bound to the source it was measured on. A quote measured on other bytes is
 * not this model's quote, and the screen shows nothing rather than a number
 * that belongs to a source nobody is looking at.
 */
export interface ProcessMapRecord {
  formatVersion: typeof PROCESS_MAP_FORMAT_VERSION;
  /** SHA-256 of the source the quote was measured on — the run's `inputFingerprint.sha256`. */
  sourceSha256: string;
  fileName: string;
  /** The run active when the quote was measured, when there was one. */
  runId: string | null;
  flowNodes: number;
  anchored: number;
  unanchored: number;
  percent: number | null;
  /** Elements per status, as the file states them. */
  statuses: Partial<Record<ProvenanceValue, number>>;
  /** The engine release that read the source. */
  engine: string;
  /** ISO time the server measured it. */
  measuredAt: string;
}

export function isProcessMapRecord(value: unknown): value is ProcessMapRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.formatVersion === PROCESS_MAP_FORMAT_VERSION
    && typeof record.sourceSha256 === 'string'
    && typeof record.fileName === 'string'
    && (record.runId === null || typeof record.runId === 'string')
    && typeof record.flowNodes === 'number'
    && typeof record.anchored === 'number'
    && typeof record.unanchored === 'number'
    && (record.percent === null || typeof record.percent === 'number')
    && typeof record.engine === 'string'
    && typeof record.measuredAt === 'string'
    && typeof record.statuses === 'object' && record.statuses !== null;
}

/** The namespace a trace must be in for this module to read it. Held to 2.6 by `tests/process-map.spec.ts`. */
export const RECONSTRUCTION_NAMESPACE = CC_NAMESPACE;
