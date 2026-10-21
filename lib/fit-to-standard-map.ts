import type { ProcessSkeleton, SkeletonEdge } from './abap/process-skeleton';
import { buildBpmnExport, READING_WRAP } from './bpmn/export';
import { readProcess } from './first-look';
import { FIT_DISPOSITION_LABELS, type FitDisposition, type FitEntry } from './fit-to-standard-design';
import { toBeSkeleton } from './fit-to-standard-package';

/**
 * The process map in the mode "Fit to standard" — roadmap 3.0.20, F4 (owner
 * decision 21.10.2026, concept §4.5).
 *
 * The same reconstructed process the Business view draws, read once more from
 * the signed source in this browser, with the fit-to-standard design laid over
 * it:
 *
 *   - a **given-up** step stays drawn, greyed and dashed, and its name says
 *     "Given up" — the map says what living with the standard loses, it does
 *     not hide it;
 *   - where the package's to-be BPMN removes such a step and bridges its flow
 *     (`toBeSkeleton` — one flow in, one out), the **bridge** is drawn too, a
 *     flow from the step before to the step after, named "Bridge — standard";
 *   - every **gap** and every candidate says what it is in its name (open gap,
 *     key-user gap, organisational gap, SAP standard candidate, configuration),
 *     never in a colour only.
 *
 * What stays as it was: every element, its line anchor and its trace — the
 * anchors are copied from the code, never produced. Nothing here is stored,
 * exported, signed or handed to the editor; the mode is a view, and no view is
 * stored (CLAUDE.md). Pure apart from reading the source.
 */

export const BRIDGE_NAME = 'Bridge — standard';

/** The word in front of an element's name in this mode; `null` for a technical step, which keeps its name. */
export function fitMapPrefix(disposition: FitDisposition): string | null {
  if (disposition === 'goes-with-program') return null;
  return `${FIT_DISPOSITION_LABELS[disposition].label}: `;
}

export interface FitMapBridge {
  /** The given-up skeleton node the bridge goes around. */
  around: string;
  from: string;
  to: string;
}

/**
 * The bridges of the to-be: the flows `toBeSkeleton` draws in place of a
 * removed given-up step. Read off the package's own derivation, so the map and
 * `process/fit-to-standard.bpmn` bridge the same steps.
 */
export function fitMapBridges(skeleton: ProcessSkeleton, entries: readonly FitEntry[]): FitMapBridge[] {
  const toBe = toBeSkeleton(skeleton, entries);
  const kept = new Set(toBe.nodes.map((n) => n.id));
  const out: FitMapBridge[] = [];
  for (const e of entries) {
    if (e.disposition !== 'given-up' || kept.has(e.elementId)) continue;
    if (!skeleton.nodes.some((n) => n.id === e.elementId)) continue;
    const ins = skeleton.edges.filter((x) => x.to === e.elementId);
    const outs = skeleton.edges.filter((x) => x.from === e.elementId);
    if (ins.length === 1 && outs.length === 1) out.push({ around: e.elementId, from: ins[0].from, to: outs[0].to });
  }
  return out;
}

export interface FitMap {
  /** BPMN 2.0 XML — the as-is with the bridges added and every name marked. */
  xml: string;
  /** BPMN element id → skeleton node id. */
  elementNode: Record<string, string>;
  /** BPMN element ids of the given-up steps: drawn greyed and dashed. */
  givenUp: string[];
  /** BPMN ids of the bridge flows. */
  bridges: string[];
  /** Disposition by BPMN element id, for the elements an entry stands for. */
  disposition: Record<string, FitDisposition>;
}

const escapeAttr = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildFitMap(
  source: string,
  entries: readonly FitEntry[],
  options: { processName: string; sourceFileName: string },
): FitMap {
  const skeleton = readProcess(source).skeleton;
  const bridges = fitMapBridges(skeleton, entries);
  const bridgeEdges: SkeletonEdge[] = bridges.map((b) => ({ from: b.from, to: b.to, kind: 'sequence', condition: '' }));
  const exported = buildBpmnExport(
    { ...skeleton, edges: [...skeleton.edges, ...bridgeEdges] },
    { ...options, source, names: 'plain', wrap: READING_WRAP },
  );
  const byNode = new Map(entries.map((e) => [e.elementId, e]));
  const elementsOf = new Map<string, string[]>();
  for (const [elementId, nodeId] of Object.entries(exported.elementNode)) {
    elementsOf.set(nodeId, [...(elementsOf.get(nodeId) ?? []), elementId]);
  }

  let xml = exported.xml;
  const disposition: Record<string, FitDisposition> = {};
  const givenUp: string[] = [];
  for (const [elementId, nodeId] of Object.entries(exported.elementNode)) {
    const e = byNode.get(nodeId);
    if (!e) continue;
    disposition[elementId] = e.disposition;
    if (e.disposition === 'given-up') givenUp.push(elementId);
    const prefix = fitMapPrefix(e.disposition);
    if (!prefix) continue;
    xml = xml.replace(new RegExp(`(id="${escapeRe(elementId)}" name=")`), `$1${escapeAttr(prefix)}`);
  }

  // The bridge flows: the export draws the added edge as a sequence flow from
  // the element before to the element after; it is named here.
  const bridgeIds: string[] = [];
  for (const b of bridges) {
    for (const from of elementsOf.get(b.from) ?? []) {
      for (const to of elementsOf.get(b.to) ?? []) {
        const re = new RegExp(`<bpmn:sequenceFlow id="([^"]+)"(?: name="[^"]*")? sourceRef="${escapeRe(from)}" targetRef="${escapeRe(to)}"`);
        const m = re.exec(xml);
        if (!m) continue;
        bridgeIds.push(m[1]);
        xml = xml.replace(m[0], `<bpmn:sequenceFlow id="${m[1]}" name="${escapeAttr(BRIDGE_NAME)}" sourceRef="${from}" targetRef="${to}"`);
      }
    }
  }
  return { xml, elementNode: exported.elementNode, givenUp: givenUp.sort(), bridges: bridgeIds, disposition };
}
