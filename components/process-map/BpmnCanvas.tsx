'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './process-map.css';
import { MAP_REVEAL_EVENT, fitWhole, fitWithPadding, rendererColors, textRendererConfig, type ViewboxCanvas } from './bpmn-view';
import { MapViewTools } from './CanvasViewControls';
import { useCanvasFullscreen } from './useCanvasFullscreen';
import { useTouchViewport } from './useTouchViewport';
import { LABEL_FONT, TASK_PADDING } from '@/lib/bpmn/layout';
import { wrapText } from '@/lib/bpmn/text-metrics';

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
 *   - **An early end says so** (ADR-054), in a word above the circle: an end
 *     event in the middle of a routine looks like its normal end otherwise.
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
  /** Kind, title, anchor and origin — what a screen reader announces. */
  accessibleName: string;
  /** True when the element carries no line range. */
  unanchored: boolean;
  /** The word shown under an unanchored shape. */
  unanchoredLabel: string;
  /** ADR-054: the word shown above an early end, or null for every other element. */
  earlyLabel?: string | null;
  /** `L182` / `L60–75` — drawn under the element's name; null without one. */
  anchor?: string | null;
  /** A phase's counted fact, drawn above its anchor ("2 decisions · 1 error end"). */
  fact?: string | null;
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
  /**
   * Zoom, fit and full screen above the canvas, the editor's own controls
   * (`CanvasViewControls`), and the whole level in view on open rather than
   * the readable start of it — the Documentation stage (owner 02.10.2026).
   * A step chosen in full screen closes it, and the map announces the choice
   * with a bubbling `cc-map-reveal` event so the page can show its detail.
   */
  controls?: boolean;
  /**
   * How a level opens: `whole` — the whole level in view (the Documentation
   * stage); `readable` — fitted down to a readable floor and otherwise from its
   * start (the workspace). Defaults to `whole` with controls, `readable`
   * without. Every map carries the controls since owner 03.10.2026 ("get into
   * full screen, and back"); how the workspace map opens did not change.
   */
  openFit?: 'whole' | 'readable';
}

interface CanvasService extends ViewboxCanvas {
  zoom(level?: string | number, center?: 'auto' | { x: number; y: number }): number;
  scroll(delta: { dx: number; dy: number }): void;
  resized(): void;
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
  label?: Shape;
  businessObject?: { name?: string };
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
  controls = false,
  openFit,
}: BpmnCanvasProps) {
  const fitOnOpen = openFit ?? (controls ? 'whole' : 'readable');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(100);
  const { filled, toggle: toggleFullscreen, exit: exitFullscreen, toggleRef } = useCanvasFullscreen({ rootRef: frameRef });
  const filledRef = useRef(filled);
  const controlsRef = useRef(controls);
  const fitOnOpenRef = useRef(fitOnOpen);
  /**
   * A step chosen in full screen: full screen closes first, then the choice is
   * made, then the page is told — so the chapter it opens is on screen.
   */
  const chooseOutOfFullscreen = useCallback((choose: () => void) => {
    void exitFullscreen().then(() => {
      choose();
      requestAnimationFrame(() => {
        frameRef.current?.dispatchEvent(new CustomEvent(MAP_REVEAL_EVENT, { bubbles: true }));
      });
    });
  }, [exitFullscreen]);
  const viewerRef = useRef<ViewerLike | null>(null);
  const rootRef = useRef<{ id: string } | null>(null);
  // The parent's handlers change on every render; the effect that builds the
  // diagram must not, or the viewer would be torn down on every keystroke.
  const handlers = useRef<Handlers>({ onActivate, onActiveChange, onPlaneChange });
  const activeRef = useRef<string | null>(active);
  /**
   * The focus was on a node when the diagram was torn down. A new model from
   * the parent rebuilds the viewer — measured on the Documentation page some
   * 0.8–1 s after first paint — and the rebuild replaces every node button, so
   * a reader who had already tabbed into the map was left on `<body>`: the next
   * Enter opened nothing and Escape had nowhere to return to (CI c25437ab,
   * process-map.spec.ts:308, one run in five locally). The new diagram gives the
   * focus back to the node it was on.
   */
  const refocusRef = useRef(false);

  useEffect(() => {
    handlers.current = {
      onActivate: (id) => (filledRef.current ? chooseOutOfFullscreen(() => onActivate(id)) : onActivate(id)),
      onActiveChange,
      onPlaneChange,
    };
    activeRef.current = active;
    filledRef.current = filled;
    controlsRef.current = controls;
    fitOnOpenRef.current = fitOnOpen;
  });

  useEffect(() => {
    let cancelled = false;
    let viewer: ViewerLike | null = null;
    const hostAtStart = hostRef.current;

    const build = async () => {
      const host = hostRef.current;
      if (!host) return;
      const { default: NavigatedViewer } = await import('bpmn-js/lib/NavigatedViewer');
      if (cancelled) return;
      viewer = new NavigatedViewer({ container: host, textRenderer: textRendererConfig(host), bpmnRenderer: rendererColors(host) }) as unknown as ViewerLike;
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

        if (node.earlyLabel) {
          const early = document.createElement('span');
          early.className = 'cc-map-early-badge';
          early.textContent = node.earlyLabel;
          button.appendChild(early);
        }

        button.addEventListener('click', () => {
          handlers.current.onActiveChange(id);
          handlers.current.onActivate(id);
        });
        button.addEventListener('focus', () => handlers.current.onActiveChange(id));

        overlays.add(id, 'cc-node', { position: { top: 0, left: 0 }, scale: true, html: button });

        // The line anchor under the name: inside an activity at its foot, under
        // the external label of an event or a gateway. The layout left the room.
        if (node.anchor) {
          const tag = document.createElement('span');
          tag.className = 'cc-map-anchor';
          tag.setAttribute('aria-hidden', 'true');
          if (node.fact && !shape.label) {
            const fact = document.createElement('span');
            fact.className = 'cc-map-fact';
            fact.textContent = node.fact;
            tag.appendChild(fact);
          }
          const code = document.createElement('span');
          code.className = 'cc-map-anchor-code';
          code.textContent = node.anchor;
          tag.appendChild(code);
          const label = shape.label;
          if (label && label.width && label.height) {
            tag.style.width = `${label.width}px`;
            overlays.add(label.id, 'cc-anchor', { position: { top: label.height, left: 0 }, scale: true, html: tag });
          } else if (shape.width > 60) {
            // Right under the name, which bpmn-js centres in the box.
            const lines = wrapText(shape.businessObject?.name ?? '', shape.width - 2 * TASK_PADDING, LABEL_FONT, true).length;
            tag.style.width = `${shape.width}px`;
            overlays.add(id, 'cc-anchor', {
              position: { top: Math.round(shape.height / 2 + (lines * LABEL_FONT * 1.2) / 2 + 1), left: 0 },
              scale: true,
              html: tag,
            });
          }
        }
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

      if (fitOnOpenRef.current === 'whole') fitWhole(canvas);
      else fitWithPadding(canvas);
      if (controlsRef.current) {
        eventBus.on('canvas.viewbox.changed', () => setZoom(Math.round(canvas.zoom() * 100)));
        setZoom(Math.round(canvas.zoom() * 100));
      }
      applyRovingTabIndex(host, activeRef.current);

      if (refocusRef.current) {
        refocusRef.current = false;
        const lost = !document.activeElement || document.activeElement === document.body;
        const id = activeRef.current;
        if (lost && id) host.querySelector<HTMLButtonElement>(`[data-map-node="${CSS.escape(id)}"]`)?.focus();
      }
    };

    void build();

    return () => {
      cancelled = true;
      // Read before the viewer goes: its buttons are still in the host here.
      const focused = document.activeElement;
      if (focused && hostAtStart?.contains(focused)) refocusRef.current = true;
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
    if (fitOnOpenRef.current === 'whole') fitWhole(canvas);
    else fitWithPadding(canvas);
  }, [plane]);

  /** Full screen changed the box: measure again, and show the whole level in it. */
  useEffect(() => {
    if (!controls) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      const canvas = viewer.get('canvas');
      canvas.resized();
      // Full screen shows the whole level; back on the page, the level opens as it did.
      if (filled || fitOnOpenRef.current === 'whole') fitWhole(canvas);
      else fitWithPadding(canvas);
    } catch {
      /* a viewer still importing has nothing to measure */
    }
  }, [filled, controls]);

  const zoomBy = useCallback((factor: number) => {
    const canvas = viewerRef.current?.get('canvas');
    if (canvas) canvas.zoom(Math.min(4, Math.max(0.1, canvas.zoom() * factor)), 'auto');
  }, []);
  const fit = useCallback(() => {
    const canvas = viewerRef.current?.get('canvas');
    if (canvas) fitWhole(canvas);
  }, []);

  /**
   * A finger moves the map (`useTouchViewport`): inline a sideways swipe pans
   * and a vertical one scrolls the page; in full screen one finger pans every
   * way; two fingers pinch; a double tap fits as the button does. bpmn-js
   * itself moves only with a mouse.
   */
  useTouchViewport(
    hostRef,
    {
      pan: (dx, dy) => viewerRef.current?.get('canvas').scroll({ dx, dy }),
      zoom: (factor, x, y) => {
        const canvas = viewerRef.current?.get('canvas');
        if (canvas) canvas.zoom(Math.min(4, Math.max(0.1, canvas.zoom() * factor)), { x, y });
      },
      fit: () => {
        const canvas = viewerRef.current?.get('canvas');
        if (!canvas) return;
        if (controlsRef.current) fitWhole(canvas);
        else fitWithPadding(canvas);
      },
    },
    { free: controls && filled, ignoreDoubleTap: '[data-map-node], .djs-overlay' },
  );

  /** Enter or Space on a step in full screen chooses it the way a click does. */
  const keyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const choosing = event.key === 'Enter' || event.key === ' ';
    if (controls && filled && choosing && (event.target as HTMLElement).dataset?.mapNode) {
      chooseOutOfFullscreen(() => undefined);
    }
    onKeyDown(event);
  }, [chooseOutOfFullscreen, controls, filled, onKeyDown]);

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

  const canvasElement = (
    <div
      data-process-map-canvas=""
      role="group"
      aria-label={label}
      onKeyDown={controls ? keyDown : onKeyDown}
      className={
        controls && filled
          ? 'cc-map-canvas min-h-0 w-full flex-1 overflow-hidden rounded-cc-card border border-cc-line'
          : 'cc-map-canvas h-[420px] w-full overflow-hidden rounded-cc-card border border-cc-line md:h-[520px]'
      }
      ref={hostRef}
    />
  );
  if (!controls) return canvasElement;
  return (
    <div
      ref={frameRef}
      data-map-canvas-frame=""
      data-map-fullscreen={filled ? 'true' : 'false'}
      className={filled ? 'cc-editor-fullscreen flex min-w-0 flex-col gap-2 overflow-hidden' : 'flex min-w-0 flex-col gap-2'}
    >
      <MapViewTools
        zoom={zoom}
        onZoomBy={zoomBy}
        onFit={fit}
        filled={filled}
        onToggleFullscreen={toggleFullscreen}
        fullscreenRef={toggleRef}
      />
      {canvasElement}
    </div>
  );
}
