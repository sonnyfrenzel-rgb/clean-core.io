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
 * picture is named for a screen reader by `label`. The width is the card's; the
 * height follows the drawing at the scale that width allows — never above
 * 100 %, no taller than {@link MAX_HEIGHT}, and never below {@link MIN_SCALE},
 * where the names stay readable.
 */

export interface MapSliceElement {
  id: string;
  anchor: string | null;
  fact: string | null;
}

interface Canvas extends ViewboxCanvas {
  resized(): void;
}

interface Viewer {
  importXML(xml: string): Promise<unknown>;
  get(service: 'canvas'): Canvas;
  get(service: 'overlays'): AnchorOverlays;
  get(service: 'elementRegistry'): { get(id: string): AnchorShape | undefined };
  destroy(): void;
}

const MARGIN = 12;
const MIN_SCALE = 0.75;
/** The tallest the slice is drawn before it is scaled down (to {@link MIN_SCALE} at most): a slice, not the map. */
const MAX_HEIGHT = 380;

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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [failed, setFailed] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let viewer: Viewer | null = null;
    void (async () => {
      const host = hostRef.current;
      if (!host) return;
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
      fit(viewer, host);
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
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    let width = host.clientWidth;
    const observer = new ResizeObserver(() => {
      const viewer = viewerRef.current;
      if (!viewer || host.clientWidth === width) return;
      width = host.clientWidth;
      fit(viewer, host);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={failed ? wt('home.sliceUnavailable') : label}
      data-home-map-slice={failed ? 'unavailable' : drawn ? 'drawn' : 'drawing'}
      className={`cc-map-canvas pointer-events-none relative w-full overflow-hidden ${className ?? ''}`}
      style={drawn || failed ? undefined : { minHeight: 240 }}
    >
      {failed ? <p className="m-0 p-4 text-[13px] font-medium text-cc-ink-muted">{wt('home.sliceUnavailable')}</p> : null}
    </div>
  );
}

/** The whole drawing across the frame's width; the frame as tall as the drawing at that scale. */
function fit(viewer: Viewer, host: HTMLElement): void {
  const canvas = viewer.get('canvas');
  const { inner } = canvas.viewbox();
  if (!inner.width || !inner.height) return;
  const width = host.clientWidth;
  const scale = sliceScale(inner, width);
  host.style.height = `${Math.ceil((inner.height + 2 * MARGIN) * scale)}px`;
  canvas.resized();
  const viewWidth = width / scale;
  canvas.viewbox({
    x: inner.x + inner.width / 2 - viewWidth / 2,
    y: inner.y - MARGIN,
    width: viewWidth,
    height: inner.height + 2 * MARGIN,
  });
}
