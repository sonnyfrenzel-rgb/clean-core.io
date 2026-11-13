/**
 * The AI names swap in on the canvas — roadmap 3.1.0 item 4, plan AB-3, mockup states 1, 2, 3 and 18.
 *
 * bpmn-js draws the engine's names into its SVG. A name the model wrote is laid over that, in the element's own box:
 * the engine's text fades up and out, the new name comes in under it, the shape takes a short tint, and the pen mark
 * of *AI-generated* stays at its corner (ADR-104: a pen, never a spark). While the names are on their way an element
 * carries a small waiting mark instead. Nothing here rebuilds the viewer — a rebuild would replace every node button
 * and drop the reader's focus — and nothing is drawn over a neighbour: the name stays inside the room the layout made
 * for the engine's name, above the line anchor, and a longer one is cut with an ellipsis (its whole text is on the
 * button's accessible name, in the step list and on the code card).
 *
 * `DESIGN.md` §5 / ADR-025: a name never changes under the focus or under an open code card — that element waits and
 * swaps once the reader moves on. Under `prefers-reduced-motion` the name is simply there.
 */

import { LABEL_FONT, TASK_PADDING } from '@/lib/bpmn/layout';
import { wrapText } from '@/lib/bpmn/text-metrics';
import { NAME_SWAP_MS } from '@/lib/naming-arrival';

export interface CanvasNames {
  /** The model's name per element id, for every element whose swap has begun. */
  shown: ReadonlyMap<string, string>;
  /** Elements still waiting for a name. */
  waiting: ReadonlySet<string>;
  /** False under `prefers-reduced-motion`. */
  motion: boolean;
  /** The accessible name of each element as the reader sees it, name included. */
  accessibleNames: ReadonlyMap<string, string>;
  /** Elements whose name must not change under the reader right now (the open code card). */
  hold: ReadonlySet<string>;
  /** The mark of a name a model wrote, in the interface language (`aiNameMark`). */
  penLabel: string;
  /**
   * The pen mark's tooltip and what is said after the accessible name of a named element: the mark, then provider
   * and model as the naming's receipt recorded them (`aiMarkTooltip`).
   */
  penTitle: string;
  /** The waiting mark's tooltip. */
  waitingLabel: string;
}

interface Shape {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  label?: Shape;
  businessObject?: { name?: string };
}

export interface SwapViewer {
  get(service: 'canvas'): { addMarker(id: string, marker: string): void; removeMarker(id: string, marker: string): void };
  get(service: 'overlays'): {
    add(element: string, type: string, overlay: { position: { top: number; left: number }; html: HTMLElement; scale?: boolean }): string;
    remove(filter: { element?: string; type?: string }): void;
  };
  get(service: 'elementRegistry'): { get(id: string): Shape | undefined };
}

/** What one viewer has drawn so far: the name per element and the elements with a waiting mark. */
export interface DrawnNames {
  names: Map<string, string>;
  waiting: Set<string>;
  timers: number[];
}

export function drawnNames(): DrawnNames {
  return { names: new Map(), waiting: new Set(), timers: [] };
}

const LINE = LABEL_FONT * 1.2;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PEN_PATHS = ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'];

function penMark(title: string): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'cc-map-name-pen';
  mark.setAttribute('aria-hidden', 'true');
  mark.title = title;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  for (const d of PEN_PATHS) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  mark.appendChild(svg);
  return mark;
}

function waitMark(title: string): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'cc-map-name-wait';
  mark.setAttribute('aria-hidden', 'true');
  mark.title = title;
  for (let i = 0; i < 3; i += 1) mark.appendChild(document.createElement('i'));
  return mark;
}

/** The box the name may fill: inside an activity above its anchor, or the external label's own box. */
function nameBox(shape: Shape): { target: string; top: number; left: number; width: number; height: number } | null {
  const label = shape.label;
  if (label && label.width && label.height) {
    return { target: label.id, top: 0, left: 0, width: label.width, height: label.height };
  }
  if (!shape.width || !shape.height) return null;
  const engineLines = Math.max(1, wrapText(shape.businessObject?.name ?? '', shape.width - 2 * TASK_PADDING, LABEL_FONT, true).length);
  // The anchor stands right under the engine's name (`BpmnCanvas`); the name ends where it starts.
  const bottom = Math.round(shape.height / 2 + (engineLines * LINE) / 2 + 1);
  const top = Math.max(2, Math.round(TASK_PADDING / 2));
  return { target: shape.id, top, left: 0, width: shape.width, height: Math.max(LINE, bottom - top) };
}

function nameOverlay(name: string, box: { width: number; height: number }, swap: boolean): HTMLElement {
  const holder = document.createElement('span');
  holder.className = swap ? 'cc-map-name cc-map-name-in' : 'cc-map-name';
  holder.setAttribute('aria-hidden', 'true');
  holder.dataset.mapName = '';
  holder.style.width = `${box.width}px`;
  holder.style.height = `${box.height}px`;
  const text = document.createElement('span');
  text.className = 'cc-map-name-text';
  text.style.webkitLineClamp = String(Math.max(1, Math.floor(box.height / LINE)));
  text.textContent = name;
  text.title = name;
  holder.appendChild(text);
  return holder;
}

function nodeButton(host: HTMLElement, id: string): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`[data-map-node="${CSS.escape(id)}"]`);
}

/**
 * Bring the canvas to `names`: lay a name over each element whose swap has begun, take it away where it no longer
 * applies, and keep the waiting marks and the buttons' accessible names in step. Idempotent: what is drawn is
 * compared with what is asked, element by element. True when an element was held back (focus, open code card) and
 * should be tried again once the reader moves on.
 */
export function applyCanvasNames(
  viewer: SwapViewer,
  host: HTMLElement,
  names: CanvasNames | null,
  drawn: DrawnNames,
  engineNames: ReadonlyMap<string, string>,
): boolean {
  let pending = false;
  const canvas = viewer.get('canvas');
  const overlays = viewer.get('overlays');
  const registry = viewer.get('elementRegistry');
  const focusedId = (document.activeElement as HTMLElement | null)?.dataset?.mapNode ?? null;
  const ids = new Set<string>([...drawn.names.keys(), ...drawn.waiting, ...(names?.shown.keys() ?? []), ...(names?.waiting ?? [])]);

  for (const id of ids) {
    const shape = registry.get(id);
    if (!shape) continue;
    const want = names?.shown.get(id) ?? null;
    const have = drawn.names.get(id) ?? null;

    if (want !== have) {
      // Never under the reader: the focused element and the one with its code open wait.
      const held = names !== null && (names.hold.has(id) || focusedId === id);
      if (held) pending = true;
      else {
        const box = nameBox(shape);
        if (have !== null) {
          overlays.remove({ element: box?.target ?? id, type: 'cc-name' });
          overlays.remove({ element: id, type: 'cc-name-pen' });
          if (box) canvas.removeMarker(box.target, 'cc-name-replaced');
          drawn.names.delete(id);
        }
        if (want !== null && box) {
          const swap = names!.motion && have === null;
          canvas.addMarker(box.target, 'cc-name-replaced');
          overlays.add(box.target, 'cc-name', { position: { top: box.top, left: box.left }, scale: true, html: nameOverlay(want, box, swap) });
          const pen = penMark(names!.penTitle);
          const corner = shape.label ? { top: -6, left: (shape.width ?? 0) - 2 } : { top: 3, left: (shape.width ?? 0) - 17 };
          overlays.add(id, 'cc-name-pen', { position: corner, scale: true, html: pen });
          if (swap) {
            canvas.addMarker(id, 'cc-name-swap');
            drawn.timers.push(window.setTimeout(() => {
              try {
                canvas.removeMarker(id, 'cc-name-swap');
              } catch {
                /* the viewer went in the meantime */
              }
            }, NAME_SWAP_MS));
          }
          drawn.names.set(id, want);
        }
      }
    }

    const waits = names !== null && names.waiting.has(id) && !drawn.names.has(id);
    if (waits && !drawn.waiting.has(id)) {
      const corner = shape.label ? { top: -6, left: (shape.width ?? 0) - 2 } : { top: 4, left: (shape.width ?? 0) - 22 };
      overlays.add(id, 'cc-name-wait', { position: corner, scale: true, html: waitMark(names!.waitingLabel) });
      drawn.waiting.add(id);
    } else if (!waits && drawn.waiting.has(id)) {
      overlays.remove({ element: id, type: 'cc-name-wait' });
      drawn.waiting.delete(id);
    }

    // The button says what the canvas shows: the name, and that a model wrote it.
    const button = nodeButton(host, id);
    if (button) {
      const named = drawn.names.has(id);
      const spoken = named
        ? `${names?.accessibleNames.get(id) ?? engineNames.get(id) ?? ''} ${names?.penTitle ?? ''}`.trim()
        : engineNames.get(id);
      if (spoken && button.getAttribute('aria-label') !== spoken) button.setAttribute('aria-label', spoken);
      if (named) button.dataset.mapNamed = 'ai';
      else delete button.dataset.mapNamed;
    }
  }
  return pending;
}

/** Stop the tint timers of a viewer that is going away. */
export function clearNameTimers(drawn: DrawnNames): void {
  for (const timer of drawn.timers) window.clearTimeout(timer);
  drawn.timers.length = 0;
}
