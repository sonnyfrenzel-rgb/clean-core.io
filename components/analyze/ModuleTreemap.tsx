'use client';

import type { ComponentProps, ReactElement } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

/**
 * The drawing of the module heatmap — recharts' treemap and nothing else.
 *
 * Its own module so `ModuleHeatmap` can load it with `next/dynamic`: recharts
 * was ~85 kB (gzip) of the Analyze stage's first JavaScript for a chart that
 * sits in the inventory, below the score (docs/perf/REPORT.md). The heading,
 * the legend and the table with every figure render at once; the drawing fills
 * its fixed-height box when it arrives, so nothing around it moves.
 */
export default function ModuleTreemap({
  data,
  content,
  tooltip,
}: {
  /** The module nodes `ModuleHeatmap` computes; recharts types its data loosely. */
  data: ReadonlyArray<object>;
  content: ReactElement;
  tooltip: ReactElement;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap data={data as unknown as ComponentProps<typeof Treemap>['data']} dataKey="size" aspectRatio={4 / 3} stroke="var(--cc-surface)" isAnimationActive={false} content={content}>
        <Tooltip content={tooltip} />
      </Treemap>
    </ResponsiveContainer>
  );
}
