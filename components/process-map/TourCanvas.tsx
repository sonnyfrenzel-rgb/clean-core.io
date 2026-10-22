'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './process-map.css';
import { fitWhole, rendererColors, textRendererConfig, type ViewboxCanvas } from './bpmn-view';
import { wt } from '@/lib/workspace-messages';

/**
 * The map of the guided tour (`components/workspace/ProcessTour.tsx`): the
 * same BPMN file the process map draws, in the same bpmn-js viewer with the
 * same type and ink (`bpmn-view.ts`, `process-map.css`), held by a camera.
 *
 * Not `BpmnCanvas`: that one is the reader's map — it fits a level on every
 * resize, carries a button per node and a roving focus — and every one of
 * those would fight a camera that the tour moves. Here the tour says which
 * element is the station; the canvas
 *
 *   - opens the level the element is drawn on,
 *   - pans and zooms so the element sits where the narration card leaves room
 *     (left of centre beside a card, centred above a stacked card on a phone),
 *     in one jump under `prefers-reduced-motion`, otherwise in a short glide,
 *   - marks the element and lets everything else step back (`cc-dim`, the
 *     path highlight's own colours — never transparency),
 *   - and reports where on screen the element ended up, so the card can stand
 *     beside it.
 *
 * Read only, and one picture: the canvas carries no focusable element (the
 * card holds the focus), and is named for a screen reader by `label`.
 */

export interface TourBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TourCanvasProps {
  xml: string;
  /** The level the element is drawn on: null for the top one. */
  plane: string | null;
  /** The element of the station; null shows the whole top level (the tour's end). */
  focus: string | null;
  /** Where the element goes: `side` leaves the right of the map to the card, `center` puts it in the middle. */
  align: 'side' | 'center';
  /** What a screen reader hears for the picture: the map and the element highlighted. */
  label: string;
  /** Where the element stands, in pixels inside the canvas, after the camera moved; null when nothing is focused. */
  onPlaced?: (box: TourBox | null) => void;
  className?: string;
}

interface Shape {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: Shape;
  waypoints?: unknown;
}

interface Canvas extends ViewboxCanvas {
  resized(): void;
  addMarker(element: string, marker: string): void;
  removeMarker(element: string, marker: string): void;
  setRootElement(element: object): void;
  findRoot(id: string): object | undefined;
  getRootElement(): { id: string } | null;
}

interface Viewer {
  importXML(xml: string): Promise<unknown>;
  get(service: 'canvas'): Canvas;
  get(service: 'elementRegistry'): { get(id: string): Shape | undefined; getAll(): Shape[] };
  destroy(): void;
}

type Box = { x: number; y: number; width: number; height: number };

/** The share of the canvas's width left of the element's centre beside a card. */
const SIDE_AT = 0.3;
/** The scale a station is shown at: the map's reading size, a little smaller on a phone. */
const SCALE = 1;
const PHONE_SCALE = 0.85;
const GLIDE_MS = 420;

const reducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** The element with its outside label, in diagram units. */
function boundsOf(shape: Shape): Box {
  const parts = [shape, ...(shape.label && shape.label.width ? [shape.label] : [])];
  const x = Math.min(...parts.map((p) => p.x));
  const y = Math.min(...parts.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...parts.map((p) => p.x + p.width)) - x,
    height: Math.max(...parts.map((p) => p.y + p.height)) - y,
  };
}

/** The viewbox that puts `bounds` where the card leaves room. Pure: exported for the spec. */
export function cameraFor(bounds: Box, outer: { width: number; height: number }, align: 'side' | 'center'): Box {
  const scale = outer.width < 480 ? PHONE_SCALE : SCALE;
  const width = outer.width / scale;
  const height = outer.height / scale;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const at = align === 'side' ? SIDE_AT : 0.5;
  return { x: cx - at * width, y: cy - 0.5 * height, width, height };
}

/** Where `bounds` lands on screen under `view`, in pixels of a canvas `outer` wide. */
export function placedBox(bounds: Box, view: Box, outer: { width: number }): TourBox {
  const scale = outer.width / view.width;
  return {
    x: (bounds.x - view.x) * scale,
    y: (bounds.y - view.y) * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}

export default function TourCanvas({ xml, plane, focus, align, label, onPlaced, className }: TourCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const topRef = useRef<object | null>(null);
  const [ready, setReady] = useState(0);
  /** The file the viewer could not be loaded for or could not read: said, not left blank. A new file is tried again. */
  const [failedXml, setFailedXml] = useState<string | null>(null);
  const failed = failedXml === xml;
  const placed = useRef(onPlaced);
  useEffect(() => {
    placed.current = onPlaced;
  });

  /* The viewer, once per file. */
  useEffect(() => {
    let cancelled = false;
    let viewer: Viewer | null = null;
    void (async () => {
      const host = hostRef.current;
      if (!host) return;
      try {
        // The viewer's chunk can fail to load (offline, a deploy in between) as the file can fail to read.
        const { default: NavigatedViewer } = await import('bpmn-js/lib/NavigatedViewer');
        if (cancelled) return;
        viewer = new NavigatedViewer({ container: host, textRenderer: textRendererConfig(host), bpmnRenderer: rendererColors(host) }) as unknown as Viewer;
        await viewer.importXML(xml);
      } catch {
        if (!cancelled) setFailedXml(xml);
        return;
      }
      if (cancelled) return;
      viewerRef.current = viewer;
      topRef.current = viewer.get('canvas').getRootElement();
      // Nothing inside the picture takes the focus: the card holds it.
      host.querySelectorAll<HTMLElement>('a[href], button, [tabindex]').forEach((el) => {
        el.tabIndex = -1;
      });
      setReady((n) => n + 1);
    })();
    return () => {
      cancelled = true;
      viewerRef.current = null;
      try {
        viewer?.destroy();
      } catch {
        /* never finished importing */
      }
    };
  }, [xml]);

  /* The camera: the level, the marks, the move. */
  const glide = useRef<number | null>(null);
  useEffect(() => {
    const viewer = viewerRef.current;
    const host = hostRef.current;
    if (!viewer || !host) return;
    const canvas = viewer.get('canvas');
    const registry = viewer.get('elementRegistry');
    const level = plane ? (canvas.findRoot(`${plane}_plane`) ?? canvas.findRoot(plane)) : topRef.current;
    const levelChanged = !!level && canvas.getRootElement() !== level;
    if (level && levelChanged) canvas.setRootElement(level);

    for (const shape of registry.getAll()) {
      try {
        canvas.removeMarker(shape.id, 'cc-dim');
        canvas.removeMarker(shape.id, 'cc-tour-here');
      } catch {
        /* an element of another level */
      }
    }
    const shape = focus ? registry.get(focus) : undefined;
    if (!shape) {
      fitWhole(canvas);
      placed.current?.(null);
      return;
    }
    for (const other of registry.getAll()) {
      if (other.id === shape.id || other.id === shape.label?.id) continue;
      try {
        canvas.addMarker(other.id, 'cc-dim');
      } catch {
        /* not on this level */
      }
    }
    canvas.addMarker(shape.id, 'cc-tour-here');

    const bounds = boundsOf(shape);
    const outer = canvas.viewbox().outer;
    const target = cameraFor(bounds, outer, align);
    const report = () => placed.current?.(placedBox(bounds, target, outer));
    if (glide.current !== null) cancelAnimationFrame(glide.current);
    if (levelChanged || reducedMotion()) {
      canvas.viewbox(target);
      report();
      return;
    }
    const shown = currentView(canvas) ?? target;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / GLIDE_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      canvas.viewbox({
        x: shown.x + (target.x - shown.x) * e,
        y: shown.y + (target.y - shown.y) * e,
        width: shown.width + (target.width - shown.width) * e,
        height: shown.height + (target.height - shown.height) * e,
      });
      if (t < 1) glide.current = requestAnimationFrame(step);
      else {
        glide.current = null;
        report();
      }
    };
    // The card moves at once to where the element will be; the map follows.
    report();
    glide.current = requestAnimationFrame(step);
    return () => {
      if (glide.current !== null) cancelAnimationFrame(glide.current);
      glide.current = null;
    };
  }, [ready, plane, focus, align]);

  /* A new size: the same station, placed again at once. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      try {
        viewer.get('canvas').resized();
      } catch {
        return;
      }
      setReady((n) => n + 1);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={failed ? wt('walk.mapUnavailable') : label}
      data-process-tour-map={failed ? 'unavailable' : ''}
      className={`cc-map-canvas cc-tour-canvas overflow-hidden ${className ?? ''}`}
    >
      {failed ? <p className="m-0 p-4 text-[13px] font-medium text-cc-ink-muted">{wt('walk.mapUnavailable')}</p> : null}
    </div>
  );
}

/** The box on show, as diagram-js keeps it (`viewbox()` without arguments returns it with the scale). */
function currentView(canvas: ViewboxCanvas): Box | null {
  const vb = canvas.viewbox() as unknown as { x?: number; y?: number; width?: number; height?: number };
  if (typeof vb.x !== 'number' || typeof vb.y !== 'number' || !vb.width || !vb.height) return null;
  return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
}
