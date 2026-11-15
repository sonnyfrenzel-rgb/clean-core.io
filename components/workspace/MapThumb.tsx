import React from 'react';
import { parseMapThumb } from '@/lib/project-summary';
import { mapThumbLabel, wt } from '@/lib/workspace-messages';

/**
 * A program's process map as a thumbnail — the stored geometry of its top
 * level (`summary.mapThumb`, `lib/project-summary.ts`), drawn as inline SVG in
 * the map's own ink and surface tokens. No labels: names need the full map. No
 * bpmn-js and nothing from the database as markup: the string is read strictly
 * (`parseMapThumb`) and each shape is a React element.
 *
 * Without a readable thumbnail the place says so in words ("Map after the next
 * run") at the same size, so the tile does not move when the picture arrives.
 */
export default function MapThumb({
  thumb,
  objectName,
  steps,
  className = '',
}: {
  thumb: string | null | undefined;
  objectName: string;
  steps: number | null;
  /** Height and outer spacing of the frame — the tile, the next-step card and the list each set their own. */
  className?: string;
}) {
  const parsed = parseMapThumb(thumb);
  const frame =
    'flex items-center justify-center overflow-hidden rounded-cc-row border border-cc-line bg-cc-surface-muted ' + className;
  if (!parsed) {
    return (
      <div className={frame} data-map-thumb="none">
        <span className="px-3 text-center text-[12px] font-semibold text-cc-ink-muted">{wt('ws.tile.mapAfterRun')}</span>
      </div>
    );
  }
  const [x, y, w, h] = parsed.viewBox;
  return (
    <div className={frame} role="img" aria-label={mapThumbLabel(objectName, steps)} data-map-thumb="drawn">
      <svg viewBox={`${x} ${y} ${w} ${h}`} aria-hidden={true} className="size-full p-2.5" preserveAspectRatio="xMidYMid meet">
        <g fill="none" className="stroke-cc-ink-muted" strokeWidth={1} vectorEffect="non-scaling-stroke">
          {parsed.items.map((item, i) =>
            item.kind === 'flow' || item.kind === 'message' ? (
              <path
                key={i}
                d={pathOf(item.points)}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={item.kind === 'message' ? '2 3' : undefined}
              />
            ) : null,
          )}
        </g>
        <g className="fill-cc-surface stroke-cc-ink" strokeWidth={1.25}>
          {parsed.items.map((item, i) => {
            if (item.kind === 'start' || item.kind === 'end') {
              return <circle key={i} cx={item.cx} cy={item.cy} r={18} vectorEffect="non-scaling-stroke" strokeWidth={item.kind === 'end' ? 2.25 : 1.25} />;
            }
            if (item.kind === 'gateway') {
              const { cx, cy } = item;
              return <polygon key={i} points={`${cx},${cy - 25} ${cx + 25},${cy} ${cx},${cy + 25} ${cx - 25},${cy}`} vectorEffect="non-scaling-stroke" />;
            }
            if (item.kind === 'task' || item.kind === 'container') {
              return (
                <rect
                  key={i}
                  x={item.x}
                  y={item.y}
                  width={item.w}
                  height={item.h}
                  rx={10}
                  vectorEffect="non-scaling-stroke"
                  className={item.kind === 'container' ? 'fill-cc-surface-muted' : undefined}
                />
              );
            }
            return null;
          })}
        </g>
      </svg>
    </div>
  );
}

function pathOf(points: number[]): string {
  let d = `M${points[0]},${points[1]}`;
  for (let i = 2; i < points.length; i += 2) d += `L${points[i]},${points[i + 1]}`;
  return d;
}
