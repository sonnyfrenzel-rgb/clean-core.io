import fs from 'fs';
import path from 'path';
import { buildProcessSkeleton } from '@/lib/abap/process-skeleton';
import { buildBpmnExport, READING_WRAP } from '@/lib/bpmn/export';
import { sliceModel } from '@/lib/bpmn/slice';
import { anchorText } from '@/lib/bpmn/layout';
import { buildDemoProject } from '@/lib/demo-project';
import { DEMO_OBJECT_NAME, DEMO_PROJECT_TITLE, DEMO_SOURCE_FILE } from '@/lib/demo-marks';
import { elementsOfPlane } from '@/lib/process-map';
import { APP_VERSION } from '@/lib/version';

/**
 * The live slice of the demo map on the home page of a new account — AB-14a,
 * owner decision H-O1 (06.11.2026): *"drawn live from the demo map with the same
 * renderer as Analyze, cut after the first elements. No hand-written names: it
 * shows what the product shows."*
 *
 * So nothing here is written for the page. The elements are the first ones of
 * the demo map's top level, in the map's own order (`buildDemoProject()`, the
 * map `/demo/workspace` draws), with the map's own labels and line anchors; the
 * drawing is the same plain BPMN file of the same source, laid out top to bottom
 * and cut after those elements (`lib/bpmn/slice.ts`) — a view, never a file —
 * and the browser draws it with the Analyze map's bpmn-js setup
 * (`components/process-map/MapSlice.tsx`). Today the names are the engine's;
 * when checked names swap into the map (AB-1/AB-3), they swap in here with it,
 * because both are read from the same map.
 *
 * Checked, not assumed: if an element of the drawing does not carry exactly the
 * demo map's id and name, the answer is `null` and the home page shows no
 * picture rather than a different one.
 *
 * Server only: reads the example file. Held per server process like
 * `demoListRow`: the input is a file of this release and the engine is
 * deterministic.
 */

/** How many elements of the demo map the home page shows (plan AB-14a: "4 elements"). */
export const HOME_SLICE_ELEMENTS = 4;

export interface HomeMapSliceElement {
  id: string;
  /** The label the demo map shows for it. */
  label: string;
  /** `L41` — as the map draws it under the name; null for an unanchored element. */
  anchor: string | null;
  /** A phase's counted fact, drawn above its anchor as the map draws it; null for anything else. */
  fact: string | null;
}

export interface HomeMapSlice {
  /** The program the map is of — `Z_MM_PO_APPROVAL`. */
  objectName: string;
  /** The cut BPMN, a few kilobytes: what the canvas draws. */
  xml: string;
  /** The elements drawn, in the map's order. */
  elements: HomeMapSliceElement[];
  /** Elements on the demo map's top level, of which `elements` are the first. */
  topLevelElements: number;
}

let cached: HomeMapSlice | null | undefined;

export function homeMapSlice(): HomeMapSlice | null {
  if (cached === undefined) {
    try {
      cached = computeHomeMapSlice(HOME_SLICE_ELEMENTS);
    } catch {
      cached = null;
    }
  }
  return cached;
}

const unescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Exported for the spec; `homeMapSlice` holds its answer. */
export function computeHomeMapSlice(count: number): HomeMapSlice | null {
  const map = buildDemoProject().documentation.process?.model;
  if (!map) return null;
  const top = elementsOfPlane(map, null);
  const first = top.slice(0, count);
  if (first.length === 0) return null;
  const source = fs
    .readFileSync(path.join(process.cwd(), 'public', 'starter-examples', DEMO_SOURCE_FILE), 'utf8')
    .replace(/\r\n/g, '\n');
  // The plain file of `buildReadingExports` (the map the demo draws), top to bottom and cut.
  const { xml } = buildBpmnExport(buildProcessSkeleton(source, { engineVersion: APP_VERSION }), {
    processName: DEMO_PROJECT_TITLE,
    sourceFileName: DEMO_SOURCE_FILE,
    source,
    names: 'plain',
    wrap: READING_WRAP,
    direction: 'TB',
    view: (model) => sliceModel(model, first.map((e) => e.id)),
  });
  for (const element of first) {
    const tag = new RegExp(`<bpmn:\\w+ id="${element.id}"[^>]*?name="([^"]*)"`).exec(xml);
    if (!tag || unescape(tag[1]) !== element.label) return null;
  }
  return {
    objectName: DEMO_OBJECT_NAME,
    xml,
    elements: first.map((e) => ({ id: e.id, label: e.label, anchor: anchorText(e.anchor), fact: e.fact })),
    topLevelElements: top.length,
  };
}
