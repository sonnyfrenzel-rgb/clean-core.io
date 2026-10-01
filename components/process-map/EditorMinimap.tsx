'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { wt } from '@/lib/workspace-messages';
import type { CanvasService, EventBusService, ModelerLike, Shape } from './editor-bpmn';

/**
 * The overview map in the lower left corner of the editor's canvas (the lower
 * right one belongs to the bpmn.io mark, which its licence keeps visible) — what Camunda Modeler
 * and Signavio call the minimap: the whole level, small, with the part on
 * screen outlined. A click moves the view there; Enter fits the level.
 *
 * Drawn from the modeller's own element registry, not from a second copy of the
 * diagram, so it can never show something the canvas does not. It is a pointer
 * convenience: everything it reaches, the element list reaches by keyboard.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Picture {
  bounds: Box;
  shapes: Array<Box & { id: string; round: boolean }>;
  lines: Array<{ id: string; points: string }>;
  view: Box;
}

const WIDTH = 200;
const HEIGHT = 130;

function picture(modeler: ModelerLike): Picture | null {
  const canvas = modeler.get<CanvasService>('canvas');
  const root = canvas.getRootElement();
  if (!root) return null;
  const shapes: Picture['shapes'] = [];
  const lines: Picture['lines'] = [];
  const stack: Shape[] = [...(root.children ?? [])];
  while (stack.length) {
    const element = stack.pop() as Shape;
    if (element.type === 'label' || element.hidden) continue;
    if (Array.isArray(element.waypoints)) {
      lines.push({ id: element.id, points: element.waypoints.map((p) => `${p.x},${p.y}`).join(' ') });
      continue;
    }
    shapes.push({
      id: element.id,
      x: element.x ?? 0,
      y: element.y ?? 0,
      width: element.width ?? 0,
      height: element.height ?? 0,
      round: /Event$/.test(element.type ?? ''),
    });
    stack.push(...(element.children ?? []));
  }
  if (!shapes.length) return null;
  const minX = Math.min(...shapes.map((s) => s.x));
  const minY = Math.min(...shapes.map((s) => s.y));
  const maxX = Math.max(...shapes.map((s) => s.x + s.width));
  const maxY = Math.max(...shapes.map((s) => s.y + s.height));
  const box = canvas.viewbox();
  const pad = 40;
  return {
    bounds: { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad },
    shapes,
    lines,
    view: { x: box.x, y: box.y, width: box.width, height: box.height },
  };
}

export default function EditorMinimap({ modeler }: { modeler: ModelerLike }) {
  const [shown, setShown] = useState<Picture | null>(() => picture(modeler));

  useEffect(() => {
    const bus = modeler.get<EventBusService>('eventBus');
    let frame = 0;
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setShown(picture(modeler)));
    };
    const events = ['canvas.viewbox.changed', 'elements.changed', 'root.set', 'import.done'];
    bus.on(events, redraw);
    return () => {
      cancelAnimationFrame(frame);
      bus.off(events, redraw);
    };
  }, [modeler]);

  const moveTo = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!shown) return;
    const canvas = modeler.get<CanvasService>('canvas');
    const svg = event.currentTarget.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // The picture keeps its aspect ratio inside the box: find the point in diagram space.
    const scale = Math.min(rect.width / shown.bounds.width, rect.height / shown.bounds.height);
    const offsetX = (rect.width - shown.bounds.width * scale) / 2;
    const offsetY = (rect.height - shown.bounds.height * scale) / 2;
    const x = shown.bounds.x + (event.clientX - rect.left - offsetX) / scale;
    const y = shown.bounds.y + (event.clientY - rect.top - offsetY) / scale;
    const box = canvas.viewbox();
    canvas.viewbox({ x: x - box.width / 2, y: y - box.height / 2, width: box.width, height: box.height });
  }, [modeler, shown]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    modeler.get<CanvasService>('canvas').zoom('fit-viewport', 'auto');
  }, [modeler]);

  if (!shown) return null;
  const { bounds, view } = shown;
  return (
    <div className="absolute bottom-2 left-2 rounded-cc-row border border-cc-line bg-cc-surface p-1 shadow-cc">
    <button
      type="button"
      data-editor-minimap=""
      aria-label={wt('editor.minimap')}
      onClick={moveTo}
      onKeyDown={onKeyDown}
      className="block cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
    >
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden={true}
        className="block"
      >
        {shown.lines.map((line) => (
          <polyline key={line.id} points={line.points} fill="none" stroke="var(--cc-line)" strokeWidth={Math.max(2, bounds.width / 300)} />
        ))}
        {shown.shapes.map((shape) => (
          <rect
            key={shape.id}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={shape.round ? shape.width / 2 : Math.min(10, shape.width / 8)}
            fill="var(--cc-surface-muted)"
            stroke="var(--cc-ink-muted)"
            strokeWidth={Math.max(1, bounds.width / 600)}
          />
        ))}
        <rect
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
          fill="none"
          stroke="var(--cc-focus)"
          strokeWidth={Math.max(2, bounds.width / 200)}
        />
      </svg>
    </button>
    </div>
  );
}
