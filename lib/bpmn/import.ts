import { CC_NAMESPACE } from './export';
import { parseBpmn } from '../process-map';
import { diffProcessRevisions, MAX_REVISION_XML, type RevisionDiff } from '../process-revisions';

/**
 * BPMN 2.0 import — the way back from SAP Signavio, Camunda Modeler or any other
 * modelling tool into a project's process (owner, 01.10.2026: "the Signavio
 * round trip before 3.0").
 *
 * **What an import is, and what it is not.** It is a *proposal for the next
 * revision* of the process — never a replacement of the reconstructed Ist.
 * Revision 1 is built on the server out of the signed source and nothing here
 * can reach it; the file is read in the browser, compared with the Ist, and
 * only becomes a revision when the reader presses Save, through the same store
 * every edit goes through.
 *
 * **Line anchors are the product's, not the file's.** A file can say anything
 * in a `cc:trace` — a line range, `status="proven"`. None of that is believed.
 * Every `cc:*` extension in the imported file is dropped first; then an element
 * that is *the same element as in the Ist* gets the Ist's own trace back:
 *
 *   - **by id** — the file kept our element id (Camunda, and Signavio when it
 *     round-trips ids) and the element is still of the same BPMN type;
 *   - **by name** — the id was rewritten (`sid-…`), but exactly one Ist element
 *     of the same type carries exactly this name and no other element of the
 *     file claimed it. The element then takes the Ist id back, so a later
 *     comparison names it as the same step.
 *
 * Everything else is *added outside Clean-Core.io* and carries no line anchor —
 * which is the truth about it, and what every view of the product then shows.
 *
 * **Security.** The XML is parsed by bpmn-moddle only (saxen underneath: no
 * DTD, no entity expansion, no network). A `DOCTYPE` or `ENTITY` declaration is
 * refused outright rather than ignored; a `bpmn:import` (a reference to another
 * file) is refused; the size is capped before anything is parsed. Names and
 * documentation are cleaned of control and bidirectional-override characters
 * and capped in length; they are only ever rendered as text (React and the SVG
 * renderer escape them), never as HTML.
 */

/** The largest file the import reads, in characters — the size a revision may hold. */
export const MAX_IMPORT_CHARS = MAX_REVISION_XML;
/** The most flow nodes one import may carry — the export's own ceiling (`lib/bpmn/model.ts`). */
export const MAX_IMPORT_ELEMENTS = 5000;
/** Longest name kept on an element. A label longer than this is not a label. */
export const MAX_IMPORT_NAME = 300;
/** Longest documentation text kept on an element. */
export const MAX_IMPORT_DOCUMENTATION = 10_000;

export type ImportRefusal =
  | 'empty'
  | 'too-large'
  | 'doctype'
  | 'not-xml'
  | 'not-bpmn'
  | 'external'
  | 'unsupported'
  | 'no-diagram'
  | 'too-many'
  | 'unreadable';

export interface ImportSummary {
  /** Flow nodes in the imported file. */
  flowNodes: number;
  /** Elements recognised as Ist elements by their id. */
  matchedById: number;
  /** Elements recognised as Ist elements by type and exact name (their id was rewritten). */
  matchedByName: number;
  /** Flow nodes that carry a line anchor after the import — only ever the Ist's own. */
  anchored: number;
  /** Flow nodes added outside Clean-Core.io: no line anchor. */
  outside: number;
  /** `cc:*` claims in the file that were not believed and dropped. */
  droppedClaims: number;
  /** Names or documentation texts that were cleaned or shortened. */
  cleaned: number;
  /** The comparison with the Ist, element by element. */
  diff: RevisionDiff;
}

export type ImportOutcome =
  | { ok: true; xml: string; summary: ImportSummary }
  | { ok: false; code: ImportRefusal; message: string };

/* ------------------------------------------------------------------ *
 * The little of bpmn-moddle this file touches.
 * ------------------------------------------------------------------ */

interface ModdleElement {
  $type: string;
  $attrs?: Record<string, string>;
  id?: string;
  name?: string;
  [key: string]: unknown;
}

interface Moddle {
  fromXML(xml: string, typeName?: string): Promise<{
    rootElement: ModdleElement;
    warnings: Array<{ message: string }>;
  }>;
  toXML(element: ModdleElement, options?: { format?: boolean }): Promise<{ xml: string }>;
  createAny(name: string, nsUri: string, properties?: Record<string, unknown>): ModdleElement;
}

async function newModdle(): Promise<Moddle> {
  const loaded = (await import('bpmn-moddle')) as unknown as { BpmnModdle: new () => Moddle };
  return new loaded.BpmnModdle();
}

/** Flow nodes: what a reader selects and what the counts count — `parseBpmn`'s set, plus the ones bpmn-js draws. */
const FLOW_NODE_TYPES = new Set([
  'bpmn:StartEvent', 'bpmn:EndEvent', 'bpmn:IntermediateThrowEvent', 'bpmn:IntermediateCatchEvent', 'bpmn:BoundaryEvent',
  'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway', 'bpmn:InclusiveGateway', 'bpmn:EventBasedGateway', 'bpmn:ComplexGateway',
  'bpmn:Task', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:SendTask', 'bpmn:ReceiveTask', 'bpmn:ManualTask',
  'bpmn:BusinessRuleTask', 'bpmn:ScriptTask', 'bpmn:CallActivity', 'bpmn:SubProcess', 'bpmn:Transaction',
  'bpmn:AdHocSubProcess',
]);

/** Root elements bpmn-js cannot draw or this product cannot keep honestly. */
const UNSUPPORTED_ROOTS = new Set(['bpmn:Choreography', 'bpmn:GlobalConversation', 'bpmn:GlobalChoreographyTask']);

/** Characters that change how text reads without being text: C0/C1 controls (not tab/newline), bidi overrides. */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

function clean(value: string, max: number): { text: string; changed: boolean } {
  let text = value.replace(INVISIBLE, '');
  if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`;
  return { text, changed: text !== value };
}

function isElement(value: unknown): value is ModdleElement {
  return typeof value === 'object' && value !== null && typeof (value as ModdleElement).$type === 'string';
}

/** Properties that point elsewhere in the tree rather than down into it. */
const REFERENCE_KEYS = new Set([
  '$parent', 'sourceRef', 'targetRef', 'attachedToRef', 'default', 'processRef', 'flowNodeRef', 'bpmnElement',
  'dataStoreRef', 'dataObjectRef', 'calledElement', 'messageRef', 'errorRef', 'signalRef', 'escalationRef',
  'incoming', 'outgoing', 'categoryValueRef', 'sourceElement', 'targetElement', 'eventDefinitionRef',
  'initiatingParticipantRef', 'participantRef', 'partitionElementRef', 'itemSubjectRef', 'structureRef',
  'operationRef', 'implementationRef', 'inMessageRef', 'outMessageRef', 'resourceRef', 'dataInputRefs',
  'dataOutputRefs', 'inputSetRefs', 'outputSetRefs', 'optionalInputRefs', 'optionalOutputRefs',
  'whileExecutingInputRefs', 'whileExecutingOutputRefs', 'supportedInterfaceRef', 'interfaceRef',
  'definitionalCollaborationRef', 'choreographyRef', 'participantRefs', 'messageFlowRef', 'label',
]);

/** Every element contained in `root`, depth first, each once. */
function walk(root: ModdleElement, visit: (element: ModdleElement) => void): void {
  const seen = new Set<ModdleElement>();
  const stack: ModdleElement[] = [root];
  while (stack.length) {
    const element = stack.pop() as ModdleElement;
    if (seen.has(element)) continue;
    seen.add(element);
    visit(element);
    for (const [key, value] of Object.entries(element)) {
      if (REFERENCE_KEYS.has(key) || key.startsWith('$')) continue;
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i -= 1) if (isElement(value[i])) stack.push(value[i]);
      } else if (isElement(value)) {
        stack.push(value);
      }
    }
  }
}

function extensionValues(element: ModdleElement): ModdleElement[] {
  const ext = element.extensionElements as { values?: ModdleElement[] } | undefined;
  return ext?.values ?? [];
}

function isOurs(value: ModdleElement): boolean {
  return value.$type.startsWith('cc:') || (value as { $descriptor?: { ns?: { uri?: string } } }).$descriptor?.ns?.uri === CC_NAMESPACE;
}

function refuse(code: ImportRefusal, message: string): ImportOutcome {
  return { ok: false, code, message };
}

/** A parser message without its line noise, short enough for one sentence. */
function shortReason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split('\n')[0].replace(INVISIBLE, '').slice(0, 160);
}

/**
 * Read a BPMN 2.0 file as the next revision of the process `ist` describes.
 *
 * `ist` is the reconstruction as the editor shows it (the plain reading) and
 * the revision number it is. Nothing is written; the caller saves or not.
 */
export async function importBpmn(text: string, ist: { xml: string; revision: number }): Promise<ImportOutcome> {
  const source = text.replace(/^﻿/, '');
  if (!source.trim()) return refuse('empty', 'The file is empty.');
  if (source.length > MAX_IMPORT_CHARS) {
    return refuse(
      'too-large',
      `The file is ${source.length.toLocaleString('en-US')} characters long; a process revision holds at most ${MAX_IMPORT_CHARS.toLocaleString('en-US')}. Export a smaller part of the model.`,
    );
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    return refuse('doctype', 'The file declares a document type or entities. A BPMN 2.0 export never needs one, so it is not read.');
  }

  const moddle = await newModdle();
  let parsed: Awaited<ReturnType<Moddle['fromXML']>>;
  try {
    parsed = await moddle.fromXML(source, 'bpmn:Definitions');
  } catch (error) {
    return refuse('not-xml', `The file is not a readable BPMN 2.0 document: ${shortReason(error)}.`);
  }
  const definitions = parsed.rootElement;
  if (!definitions || definitions.$type !== 'bpmn:Definitions') {
    return refuse('not-bpmn', 'The file is not a BPMN 2.0 document: its root is not a definitions element in the BPMN namespace.');
  }

  // An element of the BPMN namespace this build does not know is a part of the
  // model that would vanish on the canvas without a word. Refused, named.
  const unknown = parsed.warnings
    .map((w) => /unknown type <(bpmn:[A-Za-z]+)>/.exec(w.message)?.[1])
    .filter((name): name is string => !!name);
  if (unknown.length) {
    return refuse('unsupported', `The file uses elements this editor cannot show: ${[...new Set(unknown)].slice(0, 5).join(', ')}.`);
  }

  if (Array.isArray(definitions.imports) && definitions.imports.length > 0) {
    return refuse('external', 'The file refers to other files (BPMN import). Only a self-contained model is read.');
  }

  const roots = (definitions.rootElements as ModdleElement[] | undefined) ?? [];
  const odd = roots.filter((r) => UNSUPPORTED_ROOTS.has(r.$type)).map((r) => r.$type);
  for (const root of roots) {
    if (root.$type === 'bpmn:Collaboration' && Array.isArray(root.conversations) && root.conversations.length) odd.push('bpmn:Conversation');
  }
  if (odd.length) {
    return refuse('unsupported', `The file holds diagram kinds this editor cannot show: ${[...new Set(odd)].join(', ')}.`);
  }
  if (!roots.some((r) => r.$type === 'bpmn:Process' || r.$type === 'bpmn:Collaboration')) {
    return refuse('not-bpmn', 'The file holds no process and no collaboration.');
  }

  // ---- every element of the model, and the ones the diagram places ----
  const flowNodes: ModdleElement[] = [];
  const all: ModdleElement[] = [];
  for (const root of roots) {
    walk(root, (element) => {
      all.push(element);
      if (FLOW_NODE_TYPES.has(element.$type)) flowNodes.push(element);
    });
  }
  if (flowNodes.length > MAX_IMPORT_ELEMENTS) {
    return refuse('too-many', `The file has ${flowNodes.length} flow elements; the editor reads at most ${MAX_IMPORT_ELEMENTS}.`);
  }
  if (flowNodes.length === 0) return refuse('not-bpmn', 'The file holds no flow element: no event, task or gateway.');

  const placed = new Set<ModdleElement>();
  const diagrams = (definitions.diagrams as ModdleElement[] | undefined) ?? [];
  for (const diagram of diagrams) {
    walk(diagram, (element) => {
      const target = element.bpmnElement;
      if (isElement(target)) placed.add(target);
    });
  }
  const unplaced = flowNodes.filter((node) => !placed.has(node));
  if (diagrams.length === 0 || unplaced.length === flowNodes.length) {
    return refuse('no-diagram', 'The file has no diagram layout. Export it from your modelling tool with the diagram (BPMN DI) included.');
  }
  if (unplaced.length > 0) {
    return refuse(
      'no-diagram',
      `${unplaced.length} of ${flowNodes.length} elements have no position in the diagram and would not be shown. Export the model with its complete diagram.`,
    );
  }

  // ---- drop every claim in our namespace ----
  let droppedClaims = 0;
  for (const element of all) {
    const values = extensionValues(element);
    if (!values.length) continue;
    const kept = values.filter((v) => !isOurs(v));
    droppedClaims += values.length - kept.length;
    (element.extensionElements as { values: ModdleElement[] }).values = kept;
  }
  for (const key of Object.keys(definitions.$attrs ?? {})) {
    // The writer declares what the document uses; a stale prefix map would
    // let a foreign default namespace override `bpmn:` on the way out.
    if (key === 'xmlns' || key.startsWith('xmlns:')) delete (definitions.$attrs as Record<string, string>)[key];
  }

  // ---- clean what is shown ----
  let cleaned = 0;
  for (const element of all) {
    if (typeof element.name === 'string') {
      const c = clean(element.name, MAX_IMPORT_NAME);
      if (c.changed) { element.name = c.text; cleaned += 1; }
    }
    if (element.$type === 'bpmn:TextAnnotation' && typeof element.text === 'string') {
      const c = clean(element.text, MAX_IMPORT_DOCUMENTATION);
      if (c.changed) { element.text = c.text; cleaned += 1; }
    }
    if (Array.isArray(element.documentation)) {
      for (const doc of element.documentation as ModdleElement[]) {
        if (typeof doc.text !== 'string') continue;
        const c = clean(doc.text, MAX_IMPORT_DOCUMENTATION);
        if (c.changed) { doc.text = c.text; cleaned += 1; }
      }
    }
  }

  // ---- the Ist, element by element, with its own traces ----
  const istParsed = await moddle.fromXML(ist.xml, 'bpmn:Definitions');
  const istById = new Map<string, { type: string; name: string; trace: ModdleElement | null }>();
  for (const root of (istParsed.rootElement.rootElements as ModdleElement[] | undefined) ?? []) {
    walk(root, (element) => {
      if (!element.id) return;
      const trace = extensionValues(element).find((v) => v.$type === 'cc:trace') ?? null;
      istById.set(element.id, { type: element.$type, name: element.name ?? '', trace });
    });
  }

  const usedIds = new Set(all.map((e) => e.id).filter((id): id is string => !!id));
  const claimed = new Set<string>();
  const restore = (element: ModdleElement, from: ModdleElement) => {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(from)) if (!key.startsWith('$')) properties[key] = value;
    const trace = moddle.createAny('cc:trace', CC_NAMESPACE, properties);
    let ext = element.extensionElements as { values: ModdleElement[] } | undefined;
    if (!ext) {
      ext = (moddle as unknown as { create(type: string, attrs?: object): { values: ModdleElement[] } })
        .create('bpmn:ExtensionElements', { values: [] });
      element.extensionElements = ext;
    }
    ext.values = [...(ext.values ?? []), trace];
  };

  let matchedById = 0;
  for (const element of all) {
    if (!element.id) continue;
    const twin = istById.get(element.id);
    if (!twin || twin.type !== element.$type) continue;
    claimed.add(element.id);
    if (FLOW_NODE_TYPES.has(element.$type)) matchedById += 1;
    if (twin.trace) restore(element, twin.trace);
  }

  // By name: one Ist element of the same type with exactly this name, unclaimed.
  const byName = new Map<string, string[]>();
  for (const [id, twin] of istById) {
    if (!FLOW_NODE_TYPES.has(twin.type) || !twin.name.trim()) continue;
    const key = `${twin.type}|${twin.name.trim()}`;
    byName.set(key, [...(byName.get(key) ?? []), id]);
  }
  let matchedByName = 0;
  for (const element of flowNodes) {
    if (!element.id || claimed.has(element.id) || !element.name?.trim()) continue;
    const candidates = (byName.get(`${element.$type}|${element.name.trim()}`) ?? []).filter((id) => !claimed.has(id));
    if (candidates.length !== 1) continue;
    const istId = candidates[0];
    if (usedIds.has(istId)) continue;
    usedIds.delete(element.id);
    element.id = istId;
    usedIds.add(istId);
    claimed.add(istId);
    matchedByName += 1;
    const twin = istById.get(istId);
    if (twin?.trace) restore(element, twin.trace);
  }

  let xml: string;
  try {
    xml = (await moddle.toXML(definitions, { format: true })).xml;
  } catch (error) {
    return refuse('unreadable', `The file could be read but not written back as BPMN 2.0: ${shortReason(error)}.`);
  }
  if (xml.length > MAX_IMPORT_CHARS) {
    return refuse('too-large', 'Once its line anchors are restored, the model is larger than a process revision can hold.');
  }

  // The product's own reader must see the same model, or every count after
  // this would be about a different one.
  const read = parseBpmn(xml);
  const readable = flowNodes.filter((n) => !['bpmn:InclusiveGateway', 'bpmn:EventBasedGateway', 'bpmn:ComplexGateway', 'bpmn:Transaction', 'bpmn:AdHocSubProcess'].includes(n.$type)).length;
  if (read.elements.length < readable) {
    return refuse('unreadable', 'The file is written in a form this build cannot read back completely, so it was not imported.');
  }

  const anchored = read.elements.filter((e) => e.trace?.lineStart !== null && e.trace?.lineStart !== undefined).length;
  const diff = diffProcessRevisions({ revision: ist.revision, xml: ist.xml }, { revision: ist.revision + 1, xml });

  return {
    ok: true,
    xml,
    summary: {
      flowNodes: flowNodes.length,
      matchedById,
      matchedByName,
      anchored,
      outside: flowNodes.length - matchedById - matchedByName,
      droppedClaims,
      cleaned,
      diff,
    },
  };
}

/** One sentence per summary, for the dialog and the spec. */
export function importSummarySentence(summary: ImportSummary): string {
  const kept = summary.matchedById + summary.matchedByName;
  const parts = [
    `${summary.flowNodes} elements read`,
    `${kept} recognised from the reconstruction`,
    `${summary.anchored} keep their line anchor`,
    `${summary.outside} added outside Clean-Core.io with no line anchor`,
  ];
  return `${parts.join(', ')}.`;
}
