import React from 'react';
import { severityChartColor } from '@/lib/chart-colors';
import type { SeverityValue } from '@/lib/severity';

/**
 * Where in the program — one line of the source, left to right, from line 1 to
 * the last (proposal A, Testing: the strip under "What a tester checks by
 * hand").
 *
 * Three layers, each read from the engine and none drawn without it:
 *
 *   - **bands** above the axis: the routines of the program (`FORM … ENDFORM`
 *     from the call graph), so a reader sees which part of the code a mark sits
 *     in;
 *   - **ticks** on the axis: one per finding at its line, coloured by severity
 *     through `lib/chart-colors.ts` (no chart is green). Critical and high stand
 *     taller, so the picture still reads without colour;
 *   - **dashed triangles** under the axis: every construct the engine did not
 *     judge — the places the list above asks a person to check.
 *
 * Every mark carries a `<title>` with its anchor, so a pointer hover says what
 * it is; the summary is the SVG's own name.
 */
export interface StripBand {
  name: string;
  lineStart: number;
  lineEnd: number;
}

export interface StripTick {
  id: string;
  line: number;
  severity: SeverityValue;
  title: string;
}

export interface StripMark {
  line: number;
  label: string;
}

const W = 1000;
const PAD = 8;
const AXIS = 42;

export default function ProgramStrip({
  lines,
  bands,
  ticks,
  marks,
}: {
  /** The number of lines in the source. */
  lines: number;
  bands: StripBand[];
  ticks: StripTick[];
  marks: StripMark[];
}) {
  if (!Number.isFinite(lines) || lines < 2) return null;
  const x = (ln: number) => PAD + ((Math.min(Math.max(ln, 1), lines) - 1) / (lines - 1)) * (W - 2 * PAD);
  const order: SeverityValue[] = ['Info', 'Low', 'Medium', 'High', 'Critical'];
  const sorted = [...ticks].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  // Round hundreds between the first and the last line, as the proposal labels the axis.
  const step = lines > 2000 ? 500 : lines > 800 ? 200 : 100;
  const labels = [1];
  for (let n = step; n < lines - step / 3; n += step) labels.push(n);
  labels.push(lines);

  const label =
    `Where in the program: lines 1 to ${lines}. ${ticks.length} finding${ticks.length === 1 ? '' : 's'} by line, ` +
    `${marks.length} construct${marks.length === 1 ? '' : 's'} the engine did not judge, ${bands.length} routine${bands.length === 1 ? '' : 's'}.`;

  return (
    <svg
      data-program-strip=""
      viewBox={`0 0 ${W} 70`}
      width="100%"
      role="img"
      aria-label={label}
      className="block overflow-visible"
    >
      {bands.map((b, i) => (
        <rect
          key={`${b.name}-${b.lineStart}`}
          x={x(b.lineStart)}
          y={4}
          width={Math.max(3, x(b.lineEnd) - x(b.lineStart))}
          height={8}
          rx={2}
          fill={i % 2 ? 'var(--cc-seq-2)' : 'var(--cc-seq-1)'}
        >
          <title>{`${b.name} L${b.lineStart}–${b.lineEnd}`}</title>
        </rect>
      ))}
      <line x1={PAD} x2={W - PAD} y1={AXIS} y2={AXIS} stroke="var(--cc-line)" strokeWidth={1} />
      {marks.map((m, i) => (
        <path
          key={`${m.line}-${i}`}
          d={`M${x(m.line)} ${AXIS + 4} l5 8 h-10z`}
          fill="none"
          stroke="var(--cc-ink-muted)"
          strokeDasharray="2 2"
        >
          <title>{`Not assessed: ${m.label} (L${m.line})`}</title>
        </path>
      ))}
      {sorted.map((t) => {
        const big = t.severity === 'Critical' || t.severity === 'High';
        const h = big ? 22 : 14;
        return (
          <rect
            key={`${t.id}-${t.line}`}
            x={x(t.line) - (big ? 2 : 1.5)}
            y={AXIS - h}
            width={big ? 4 : 3}
            height={h}
            rx={1.5}
            fill={severityChartColor(t.severity).value}
          >
            <title>{`${t.id} L${t.line} ${t.title}`}</title>
          </rect>
        );
      })}
      {labels.map((ln) => (
        <text
          key={ln}
          x={x(ln)}
          y={AXIS + 22}
          fontSize={11}
          textAnchor="middle"
          fill="var(--cc-ink-muted)"
          fontFamily="var(--cc-font-mono)"
        >
          {ln}
        </text>
      ))}
    </svg>
  );
}
