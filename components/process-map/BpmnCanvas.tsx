'use client';

import React, { useEffect, useRef } from 'react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './process-map.css';

/**
 * The diagram half of the process map — roadmap 2.5, reading only.
 *
 * bpmn-js draws the file 2.6 writes. It is the `NavigatedViewer`, not the
 * `Modeler`: nothing here can change a model, and there is no editor to reach
 * from it (that is roadmap 3.1). What this component adds to the drawing is the
 * part a canvas cannot do by itself:
 *
 *   - **Every flow node is a button.** One transparent overlay per element,
 *     sized to the shape, carrying the element's accessible name — art, title,
 *     anchor and provenance, `DESIGN.md` §5.7. A screen reader reads a process
 *     rather than a picture, and a click and a keypress do the same thing.
 *   - **The whole map is one tab stop.** Roving `tabindex`: the active node
 *     carries 0, every other node −1. Tab reaches the map once and leaves it
 *     once; inside, the arrow keys move. The key handling itself lives in
 *     `ProcessMap`, so the map and the step list navigate identically.
 *   - **An element without a line anchor says so**, in a word under the shape
 *     and in a dashed outline — never only in a colour.
 *
 * The buttons are found back through `[data-map-node]` rather than kept in a
 * second structure beside the DOM: the diagram is the external system here, and
 * two records of which nodes exist is one more than can be kept in step.
 *
 * The viewer is created in an effect and destroyed with the component, and
 * bpmn-js is imported there rather than at the top of the file: it needs a DOM
 * and it is large, so it loads when a reader opens the map and not before.
 */

export interface BpmnCanvasNode {
  /** Art, Titel, Anker und Herkunft — what a screen reader announces. */
  accessibleName: string;
  /** True when the element carries no line range. */
  unanchored: boolean;
  /** The word shown under an unanchored shape. */
  unanchoredLabel: string;
}

export interface BpmnCanvasProps {
  /** The BPMN 2.0 XML of roadmap 2.6. */
  xml: string;
  /** A sentence about the map as a whole — *"Process with 14 steps and 5 decisions."* */
  label: string;
  /** Accessible names and evidence, by BPMN element id. */
  nodes: ReadonlyMap<string, BpmnCanvasNode>;
  /** The plane on show: null for the top one, otherwise a sub-process element id. */
  plane: string | null;
  /** Reported when the reader drills into or out of a sub-process. */
  onPlaneChange: (plane: string | null) => void;
  /** The node that carries the focus and the selection mark. */
  active: string | null;
  /** A click on a node, or Enter on it. */
  onActivate: (elementId: string) => void;
  /** The node the reader moved to, by click or by key. */
  onActiveChange: (elementId: string) => void;
  /** Bumped by the parent when focus should physically move to `active`. 0 never moves it. */
  focusToken: number;
  /** Arrow keys, Enter, Escape — handled by the parent for map and step list alike. */
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  /**
   * Roadmap 2.9, `DESIGN.md` §5.9 item 6. The elements a path highlight leaves
   * lit; null when no highlight is on. Everything else **steps back** — a
   * colour of the line token, never transparency that pushes text under 4.5 : 1.
   */
  lit?: ReadonlySet<string> | null;
  /**
   * Roadmap 2.9, item 7. Elements that do not run in the chosen run variant.
   * The outline says so in words beside the mark; this is the mark.
   */
  excluded?: ReadonlySet<string>;
}

interface CanvasService {
  zoom(level: string | number): void;
  getContainer(): HTMLElement;
  addMarker(element: string, marker: string): void;
  removeMarker(element: string, marker: string): void;
  setRootElement(element: object): void;
  findRoot(id: string): object | undefined;
  getRootElement(): { id: string } | null;
}

interface OverlayAttrs {
  position: { top: number; left: number };
  html: HTMLElement;
  scale?: boolean;
}

interface OverlaysService {
  add(element: string, type: string, overlay: OverlayAttrs): string;
}

interface Shape {
  id: string;
  width?: number;
  height?: number;
}

interface ElementRegistryService {
  get(id: string): Shape | undefined;
}

interface EventBusService {
  on(event: string, callback: () => void): void;
}

interface ViewerLike {
  importXML(xml: string): Promise<{ warnings: unknown[] }>;
  get(service: 'canvas'): CanvasService;
  get(service: 'overlays'): OverlaysService;
  get(service: 'elementRegistry'): ElementRegistryService;
  get(service: 'eventBus'): EventBusService;
  destroy(): void;
}

interface Handlers {
  onActivate: (elementId: string) => void;
  onActiveChange: (elementId: string) => void;
  onPlaneChange: (plane: string | null) => void;
}

/**
 * One tab stop for the whole map: the active node carries 0, the rest −1, and
 * when nothing is active the first node holds the stop so that Tab can reach
 * the map at all.
 *
 * Applied both when the diagram is first drawn and whenever the selection
 * moves. The first of those matters more than it looks: the buttons are created
 * after an `await`, so an effect that only ran on mount would have found none
 * and left the map out of the tab order entirely.
 */
function applyRovingTabIndex(host: HTMLElement, active: string | null): void {
  // bpmn-js brings its own focusable things into this container: the drill-down
  // arrow on every collapsed sub-process, the bpmn.io attribution link, and a
  // focusable canvas for a keyboard module that is not bound here. Measured on
  // the fixture, that was two stops in front of the first node and one behind
  // the last — so Tab landed on an arrow that announces nothing, and a reader
  // would conclude the map cannot be reached. They stay clickable and visible;
  // they are simply not stops. `DESIGN.md` §5.7: the map is **one**.
  host.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')
    .forEach((element) => {
      if (!element.hasAttribute('data-map-node')) element.tabIndex = -1;
    });

  const buttons = host.querySelectorAll<HTMLButtonElement>('[data-map-node]');
  let held = false;
  buttons.forEach((button) => {
    const selected = button.dataset.mapNode === active;
    button.tabIndex = selected ? 0 : -1;
    button.dataset.selected = selected ? 'true' : 'false';
    if (selected) held = true;
  });
  if (!held && buttons.length > 0) buttons[0].tabIndex = 0;
}

export default function BpmnCanvas({
  xml,
  label,
  nodes,
  plane,
  onPlaneChange,
  active,
  onActivate,
  onActiveChange,
  focusToken,
  onKeyDown,
  lit = null,
  excluded,
}: BpmnCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<ViewerLike | null>(null);
  const rootRef = useRef<{ id: string } | null>(null);
  // The parent's handlers change on every render; the effect that builds the
  // diagram must not, or the viewer would be torn down on every keystroke.
  const handlers = useRef<Handlers>({ onActivate, onActiveChange, onPlaneChange });
  const activeRef = useRef<string | null>(active);

  useEffect(() => {
    handlers.current = { onActivate, onActiveChange, onPlaneChange };
    activeRef.current = active;
  });

  useEffect(() => {
    let cancelled = false;
    let viewer: ViewerLike | null = null;

    const build = async () => {
      const host = hostRef.current;
      if (!host) return;
      const { default: NavigatedViewer } = await import('bpmn-js/lib/NavigatedViewer');
      if (cancelled) return;
      viewer = new NavigatedViewer({ container: host }) as unknown as ViewerLike;
      viewerRef.current = viewer;

      try {
        await viewer.importXML(xml);
      } catch {
        // A file this build wrote and cannot read back is a defect, not a state
        // to draw: the step list beside this canvas shows the same process and
        // is unaffected, so the reader is not left with nothing.
        return;
      }
      if (cancelled) return;

      const canvas = viewer.get('canvas');
      const overlays = viewer.get('overlays');
      const registry = viewer.get('elementRegistry');
      const eventBus = viewer.get('eventBus');
      rootRef.current = canvas.getRootElement();

      for (const [id, node] of nodes) {
        const shape = registry.get(id);
        if (!shape || !shape.width || !shape.height) continue;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cc-map-node';
        button.dataset.mapNode = id;
        button.setAttribute('aria-label', node.accessibleName);
        button.style.width = `${shape.width}px`;
        button.style.height = `${shape.height}px`;
        button.tabIndex = -1;

        if (node.unanchored) {
          canvas.addMarker(id, 'cc-unanchored');
          const badge = document.createElement('span');
          badge.className = 'cc-map-unanchored-badge';
          badge.textContent = node.unanchoredLabel;
          button.appendChild(badge);
        }

        button.addEventListener('click', () => {
          handlers.current.onActiveChange(id);
          handlers.current.onActivate(id);
        });
        button.addEventListener('focus', () => handlers.current.onActiveChange(id));

        overlays.add(id, 'cc-node', { position: { top: 0, left: 0 }, scale: true, html: button });
      }

      // Drilling into a sub-process is bpmn-js's own behaviour on a collapsed
      // shape; the parent is told so that a level can live in the URL (2.9).
      eventBus.on('root.changed', () => {
        const root = canvas.getRootElement();
        const id = root?.id ?? '';
        const isTop = !id || id === rootRef.current?.id;
        handlers.current.onPlaneChange(isTop ? null : id.replace(/_plane$/, ''));
        // A new plane brings new drill-down arrows with it, each focusable.
        applyRovingTabIndex(host, activeRef.current);
      });

      canvas.zoom('fit-viewport');
      applyRovingTabIndex(host, activeRef.current);
    };

    void build();

    return () => {
      cancelled = true;
      try {
        viewer?.destroy();
      } catch {
        /* a viewer that never finished importing has nothing to tear down */
      }
      viewerRef.current = null;
    };
  }, [xml, nodes]);

  /** The plane the parent asks for. */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const canvas = viewer.get('canvas');
    const target = plane
      ? (canvas.findRoot(`${plane}_plane`) ?? canvas.findRoot(plane))
      : rootRef.current;
    if (!target) return;
    const current = canvas.getRootElement();
    if (current && (target as { id?: string }).id === current.id) return;
    canvas.setRootElement(target);
    canvas.zoom('fit-viewport');
  }, [plane]);

  /** Roving tabindex and the selection mark, read back off the diagram's own DOM. */
  useEffect(() => {
    const host = hostRef.current;
    if (host) applyRovingTabIndex(host, active);
  }, [active, xml, nodes, plane, focusToken]);

  /**
   * The path highlight and the run variant — roadmap 2.9.
   *
   * Markers rather than a second drawing: bpmn-js already owns the shapes, and
   * a class on the shape is the one way to change how it reads without two
   * pictures of the same process. Toggled on every change rather than added
   * once, because a highlight that could only be switched on is a filter row
   * with no way back.
   */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let canvas: CanvasService;
    try {
      canvas = viewer.get('canvas');
    } catch {
      return;
    }
    for (const id of nodes.keys()) {
      const dim = lit !== null && !lit.has(id);
      const out = excluded?.has(id) ?? false;
      try {
        if (dim) canvas.addMarker(id, 'cc-dim');
        else canvas.removeMarker(id, 'cc-dim');
        if (out) canvas.addMarker(id, 'cc-out');
        else canvas.removeMarker(id, 'cc-out');
      } catch {
        // An element of another plane is not in the registry of this one.
      }
    }
  }, [lit, excluded, nodes, plane, xml]);

  /** Move the focus only when the parent asks for it — never on first paint. */
  useEffect(() => {
    if (!focusToken || !active) return;
    const host = hostRef.current;
    if (!host) return;
    const selector = `[data-map-node="${CSS.escape(active)}"]`;
    host.querySelector<HTMLButtonElement>(selector)?.focus();
  }, [focusToken, active]);

  return (
    <div
      data-process-map-canvas=""
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="cc-map-canvas h-[420px] w-full overflow-hidden rounded-cc-card border border-cc-line md:h-[520px]"
      ref={hostRef}
    />
  );
}
