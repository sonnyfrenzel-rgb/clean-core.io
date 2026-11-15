'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import './process-map.css';
import { placeAnchor, rendererColors, textRendererConfig, type AnchorOverlays, type AnchorShape, type ViewboxCanvas } from './bpmn-view';
import { wt } from '@/lib/workspace-messages';

/**
 * A few elements of a map, drawn as a picture — the home page's live slice of
 * the demo map (AB-14a, H-O1). The Analyze map's renderer, not a new one: the
 * same bpmn-js, the same type and ink (`bpmn-view.ts`, `process-map.css`) and
 * the same line anchor under every name (`placeAnchor`, which `BpmnCanvas`
 * draws with too). The file is the cut one `lib/home-map-slice.ts` builds on
 * the server; this only draws it.
 *
 * Read only and one picture, like the tour's map: nothing inside takes the
 * focus or a click (a collapsed phase's drill-down arrow included), and the
 * picture is named for a screen reader by `label`. The drawing is shown at the
 * scale the card's width allows — never above 100 %, no taller than
 * {@link MAX_HEIGHT}, and never below {@link MIN_SCALE}, where the names stay
 * readable. A drawing that does not fit at that floor is not cut (ADR-110):
 * the frame scrolls — across, and down past {@link MAX_HEIGHT} — takes the
 * keyboard focus while it can scroll, and opens on the first element. The
 * wheel moves the frame only where it can move; past its edge the page scrolls
 * as before.
 */

export interface MapSliceElement {
  id: string;
  anchor: string | null;
  fact: string | null;
}

interface Canvas extends ViewboxCanvas {
  resized(): void;
}

type PlacedShape = AnchorShape & { x?: number; y?: number };

interface Viewer {
  importXML(xml: string): Promise<unknown>;
  get(service: 'canvas'): Canvas;
  get(service: 'overlays'): AnchorOverlays;
  get(service: 'elementRegistry'): { get(id: string): PlacedShape | undefined };
  destroy(): void;
}

const MARGIN = 12;
/** The readability floor: the slice is never drawn smaller; what does not fit at it scrolls. */
export const MIN_SCALE = 0.75;
/** The tallest the frame is: the drawing is scaled down to fit it (to {@link MIN_SCALE} at most) and scrolls past it. */
export const MAX_HEIGHT = 380;

/**
 * The scale a drawing of `inner` units is shown at in a frame `width` pixels
 * wide: the whole width, at most 100 % and at most {@link MAX_HEIGHT} tall,
 * never below {@link MIN_SCALE}. Pure: exported for the spec.
 */
export function sliceScale(inner: { width: number; height: number }, width: number): number {
  if (!(inner.width > 0) || !(inner.height > 0) || !(width > 0)) return 1;
  const fit = Math.min(1, (width - 2 * MARGIN) / inner.width, MAX_HEIGHT / (inner.height + 2 * MARGIN));
  return Math.max(MIN_SCALE, fit);
}

export default function MapSlice({
  xml,
  elements,
  label,
  className,
}: {
  xml: string;
  elements: readonly MapSliceElement[];
  /** What a screen reader hears for the picture: which map, and the elements on it. */
  label: string;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [failed, setFailed] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let viewer: Viewer | null = null;
    void (async () => {
      const frame = frameRef.current;
      const host = hostRef.current;
      if (!frame || !host) return;
      try {
        const { default: BpmnViewer } = await import('bpmn-js/lib/Viewer');
        if (cancelled) return;
        viewer = new BpmnViewer({ container: host, textRenderer: textRendererConfig(host), bpmnRenderer: rendererColors(host) }) as unknown as Viewer;
        await viewer.importXML(xml);
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled) return;
      viewerRef.current = viewer;
      const overlays = viewer.get('overlays');
      const registry = viewer.get('elementRegistry');
      for (const element of elements) {
        const shape = registry.get(element.id);
        if (shape && element.anchor) placeAnchor(overlays, shape, element.anchor, element.fact);
      }
      host.querySelectorAll<HTMLElement>('a[href], button, [tabindex]').forEach((el) => {
        el.tabIndex = -1;
      });
      setScrolls(fit(viewer, frame, host));
      openOn(viewer, frame, elements[0]?.id);
      setDrawn(true);
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
  }, [xml, elements]);

  // A new width: the same drawing, scaled again.
  useEffect(() => {
    const frame = frameRef.current;
    const host = hostRef.current;
    if (!frame || !host || typeof ResizeObserver === 'undefined') return undefined;
    let width = frame.clientWidth;
    const observer = new ResizeObserver(() => {
      const viewer = viewerRef.current;
      if (!viewer || frame.clientWidth === width) return;
      width = frame.clientWidth;
      setScrolls(fit(viewer, frame, host));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // The frame scrolls; the drawing inside it is a picture and takes no pointer,
  // so a wheel or a finger on it reaches the frame. No wheel handler and no
  // overscroll containment: the frame moves while it can, and past its edge the
  // page does.
  return (
    <div
      ref={frameRef}
      role="img"
      aria-label={failed ? wt('home.sliceUnavailable') : label}
      data-home-map-slice={failed ? 'unavailable' : drawn ? 'drawn' : 'drawing'}
      data-map-slice-scrolls={scrolls ? 'true' : 'false'}
      tabIndex={scrolls ? 0 : undefined}
      className={`cc-map-canvas relative w-full max-w-full overflow-auto rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus ${className ?? ''}`}
      style={{ maxHeight: MAX_HEIGHT, ...(drawn || failed ? {} : { minHeight: 240 }) }}
    >
      <div ref={hostRef} data-map-slice-drawing="" className="pointer-events-none relative" />
      {failed ? <p className="m-0 p-4 text-[13px] font-medium text-cc-ink-muted">{wt('home.sliceUnavailable')}</p> : null}
    </div>
  );
}

/**
 * Where the camera stands for a drawing of `inner` units in a frame `width` pixels wide, and how large the drawing is
 * then — or null when there is nothing to fit: no drawing, or a frame of no width. The frame has no width while the
 * page that holds it is leaving (v3.1.0 acceptance run): a view box of width 0 gave bpmn-js a scale of 0/0, and the
 * browser threw "Failed to execute 'scale' on 'SVGMatrix': The provided float value is non-finite".
 *
 * `width` x `height` is the drawing in pixels at {@link sliceScale}: at least the frame's width (a narrow drawing sits
 * in its middle), wider where the drawing does not fit the frame at {@link MIN_SCALE}, and taller than
 * {@link MAX_HEIGHT} where it does not fit that either. The frame scrolls over whatever exceeds it; nothing is cut.
 * Pure: exported for the spec.
 */
export function sliceViewbox(
  inner: { x: number; y: number; width: number; height: number },
  width: number,
): { viewbox: { x: number; y: number; width: number; height: number }; scale: number; width: number; height: number } | null {
  if (!(inner.width > 0) || !(inner.height > 0) || !(width > 0) || !Number.isFinite(width)) return null;
  const scale = sliceScale(inner, width);
  const drawingWidth = Math.max(Math.floor(width), Math.ceil((inner.width + 2 * MARGIN) * scale));
  const drawingHeight = Math.ceil((inner.height + 2 * MARGIN) * scale);
  const viewWidth = drawingWidth / scale;
  return {
    viewbox: { x: inner.x + inner.width / 2 - viewWidth / 2, y: inner.y - MARGIN, width: viewWidth, height: drawingHeight / scale },
    scale,
    width: drawingWidth,
    height: drawingHeight,
  };
}

/** The drawing at its scale inside the frame; true when the frame has to scroll to show all of it. */
function fit(viewer: Viewer, frame: HTMLElement, host: HTMLElement): boolean {
  if (!frame.isConnected) return false;
  const canvas = viewer.get('canvas');
  const placed = sliceViewbox(canvas.viewbox().inner, frame.clientWidth);
  if (!placed) return false;
  host.style.width = `${placed.width}px`;
  host.style.height = `${placed.height}px`;
  canvas.resized();
  canvas.viewbox(placed.viewbox);
  return placed.width > frame.clientWidth || placed.height > MAX_HEIGHT;
}

/**
 * The frame opens on the slice's first element: centred across, its top in view. It moves the frame's own scroll
 * position only, never the page's (no `scrollIntoView`).
 */
function openOn(viewer: Viewer, frame: HTMLElement, id: string | undefined): void {
  const shape = id ? viewer.get('elementRegistry').get(id) : undefined;
  if (!shape || typeof shape.x !== 'number' || typeof shape.y !== 'number') return;
  const box = viewer.get('canvas').viewbox() as { inner: unknown; x?: number; y?: number; scale?: number };
  if (!(typeof box.scale === 'number' && box.scale > 0) || typeof box.x !== 'number' || typeof box.y !== 'number') return;
  const centre = (shape.x + (shape.width ?? 0) / 2 - box.x) * box.scale;
  frame.scrollLeft = Math.max(0, centre - frame.clientWidth / 2);
  frame.scrollTop = Math.max(0, (shape.y - box.y) * box.scale - MARGIN);
}
