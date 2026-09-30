'use client';

import { useMemo } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { Grid3x3 } from 'lucide-react';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import CcTable from '@/components/cc/Table';
import { CcSeverity } from '@/components/cc/Identifier';
import { severityChartColor } from '@/lib/chart-colors';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CodeInventoryItem } from '@/lib/types';

/**
 * Module / severity heatmap — a LOC-weighted treemap of the detected ABAP objects
 * grouped by functional module. Each tile is one module; its area is the module's
 * share of the codebase (lines of code, falling back to object count) and its colour
 * is the worst criticality found inside it. Lets an architect see, at a glance, which
 * modules carry the most weight AND the most risk — where to focus first.
 *
 * A chart that counts states (DESIGN.md §1.8): the criticality takes the colour of
 * the same word as a severity — High `error`, Medium `warning`, Low `neutral`, never
 * green — from `lib/chart-colors.ts`, and every number in it is also in the table
 * underneath, so nothing is only a colour or only an area.
 */

type Sev = 'High' | 'Medium' | 'Low';

const SEV_RANK: Record<Sev, number> = { High: 3, Medium: 2, Low: 1 };
const SEVERITIES: readonly Sev[] = ['High', 'Medium', 'Low'];

interface ModuleNode {
  name: string;
  size: number;
  worst: Sev;
  fill: string;
  objects: number;
  high: number;
  medium: number;
  low: number;
  loc: number;
}

const objectsLabel = (n: number) => `${formatNumber(n)} object${n !== 1 ? 's' : ''}`;

function TileContent(props: any) {
  const { x, y, width, height, name, worst, objects } = props;
  if (width <= 0 || height <= 0) return null;
  const fill = props.fill || severityChartColor((worst as Sev) || 'Low').value;
  const showLabel = width > 54 && height > 30;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        data-chart-segment=""
        style={{ fill, stroke: 'var(--cc-surface)', strokeWidth: 2 }}
      />
      {showLabel && (
        <>
          <text x={x + 8} y={y + 20} fill="var(--cc-on-dark)" fontSize={13} fontWeight={700}>
            {String(name).length > 22 ? `${String(name).slice(0, 21)}…` : name}
          </text>
          {height > 46 && (
            <text x={x + 8} y={y + 36} fill="var(--cc-on-dark)" fontSize={12} fontWeight={600}>
              {objectsLabel(objects)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

function TileTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload as ModuleNode | undefined;
  if (!d) return null;
  return (
    <div className="max-w-[220px] rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2 shadow-cc">
      <div className="cc-text-identifier mb-1 text-cc-ink">{d.name}</div>
      <div className="cc-text-meta mb-2 text-cc-ink-muted">
        {objectsLabel(d.objects)}
        {d.loc > 0 ? ` · ${formatNumber(d.loc)} LOC` : ''}
      </div>
      <div className="flex flex-wrap gap-2 cc-text-meta text-cc-ink">
        {d.high > 0 && <span>{d.high} High</span>}
        {d.medium > 0 && <span>{d.medium} Medium</span>}
        {d.low > 0 && <span>{d.low} Low</span>}
      </div>
    </div>
  );
}

export default function ModuleHeatmap({ codeInventory }: { codeInventory: CodeInventoryItem[] }) {
  const { data, hasLoc } = useMemo(() => {
    const items = codeInventory || [];
    const byModule = new Map<string, CodeInventoryItem[]>();
    for (const item of items) {
      const key = item.module || item.type || 'Unclassified';
      const arr = byModule.get(key);
      if (arr) arr.push(item);
      else byModule.set(key, [item]);
    }

    const anyLoc = items.some((i) => typeof i.loc === 'number' && (i.loc as number) > 0);

    const nodes: ModuleNode[] = [];
    byModule.forEach((objs, name) => {
      let worst: Sev = 'Low';
      let high = 0;
      let medium = 0;
      let low = 0;
      let loc = 0;
      for (const o of objs) {
        const sev = (o.criticality as Sev) || 'Low';
        if (SEV_RANK[sev] > SEV_RANK[worst]) worst = sev;
        if (sev === 'High') high += 1;
        else if (sev === 'Medium') medium += 1;
        else low += 1;
        loc += typeof o.loc === 'number' ? o.loc : 0;
      }
      // Area weight: LOC when we have it, else one unit per object.
      const size = anyLoc ? Math.max(loc, 1) : objs.length;
      nodes.push({
        name,
        size,
        worst,
        fill: severityChartColor(worst).value,
        objects: objs.length,
        high,
        medium,
        low,
        loc,
      });
    });

    nodes.sort((a, b) => b.size - a.size);
    return { data: nodes, hasLoc: anyLoc };
  }, [codeInventory]);

  if (!codeInventory || codeInventory.length === 0 || data.length === 0) return null;

  const highModules = data.filter((d) => d.worst === 'High').length;
  const weightedBy = hasLoc ? 'lines of code' : 'object count';

  return (
    <CollapsibleAccordion
      icon={<Grid3x3 size={16} />}
      title="Module Risk Heatmap"
      badge={`${data.length} module${data.length !== 1 ? 's' : ''}${highModules ? ` · ${highModules} high-risk` : ''}`}
      badgeSeverity={highModules ? 'red' : 'green'}
      tooltip={`Each tile is a functional module. Tile area = share of the codebase (${weightedBy}); colour = the worst criticality inside it. Larger + redder = address first.`}
      defaultOpen
    >
      <div
        className="h-[340px] w-full"
        role="img"
        aria-label={`Treemap of ${data.length} modules, weighted by ${weightedBy}. The table below lists every figure.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data as any}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="var(--cc-surface)"
            isAnimationActive={false}
            content={<TileContent />}
          >
            <Tooltip content={<TileTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 px-1">
        {SEVERITIES.map((lvl) => (
          <div key={lvl} className="flex items-center gap-2">
            <span aria-hidden={true} className={cn('h-3 w-3 shrink-0 rounded-[2px]', severityChartColor(lvl).bg)} />
            <span className="cc-text-meta text-cc-ink-muted">{lvl} criticality</span>
          </div>
        ))}
        <span className="cc-text-meta ml-auto text-cc-ink-muted">Weighted by {weightedBy}</span>
      </div>

      {/* The figures of the chart as text (DESIGN.md §1.8). */}
      <div className="mt-4" data-module-heatmap-table="">
        <CcTable
          caption="Modules by criticality"
          limit={5}
          columns={[
            { key: 'module', label: 'Module' },
            { key: 'worst', label: 'Worst criticality' },
            { key: 'objects', label: 'Objects', numeric: true },
            { key: 'loc', label: 'Lines of code', numeric: true },
            { key: 'high', label: 'High', numeric: true },
            { key: 'medium', label: 'Medium', numeric: true },
            { key: 'low', label: 'Low', numeric: true },
          ]}
          rows={data.map((d) => ({
            key: d.name,
            cells: {
              module: <span className="font-cc-mono">{d.name}</span>,
              worst: <CcSeverity value={d.worst} />,
              objects: formatNumber(d.objects),
              loc: hasLoc ? formatNumber(d.loc) : '—',
              high: formatNumber(d.high),
              medium: formatNumber(d.medium),
              low: formatNumber(d.low),
            },
          }))}
        />
      </div>
    </CollapsibleAccordion>
  );
}
