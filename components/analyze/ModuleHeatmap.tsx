'use client';

import { useMemo } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { Grid3x3 } from 'lucide-react';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import type { CodeInventoryItem } from '@/lib/types';

/**
 * Module / severity heatmap — a LOC-weighted treemap of the detected ABAP objects
 * grouped by functional module. Each tile is one module; its area is the module's
 * share of the codebase (lines of code, falling back to object count) and its colour
 * is the worst criticality found inside it. Lets an architect see, at a glance, which
 * modules carry the most weight AND the most risk — where to focus first.
 */

type Sev = 'High' | 'Medium' | 'Low';

const SEV_COLOR: Record<Sev, string> = {
  High: '#dc2626', // red-600
  Medium: '#d97706', // amber-600
  Low: '#059669', // emerald-600
};
const SEV_RANK: Record<Sev, number> = { High: 3, Medium: 2, Low: 1 };

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

function TileContent(props: any) {
  const { x, y, width, height, name, worst, objects } = props;
  if (width <= 0 || height <= 0) return null;
  const fill = props.fill || SEV_COLOR[(worst as Sev)] || '#64748b';
  const showLabel = width > 54 && height > 30;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        style={{ fill, stroke: '#ffffff', strokeWidth: 2 }}
      />
      {showLabel && (
        <>
          <text x={x + 8} y={y + 20} fill="#ffffff" fontSize={12} fontWeight={800}>
            {String(name).length > 22 ? `${String(name).slice(0, 21)}…` : name}
          </text>
          {height > 46 && (
            <text x={x + 8} y={y + 36} fill="#ffffff" fontSize={10} fontWeight={600} opacity={0.85}>
              {objects} object{objects !== 1 ? 's' : ''}
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
    <div className="bg-slate-900 text-white text-xs rounded-xl shadow-xl border border-slate-700 px-3 py-2 max-w-[220px]">
      <div className="font-black mb-1">{d.name}</div>
      <div className="text-slate-300 mb-1.5">
        {d.objects} object{d.objects !== 1 ? 's' : ''}
        {d.loc > 0 ? ` · ${d.loc.toLocaleString()} LOC` : ''}
      </div>
      <div className="flex gap-2">
        {d.high > 0 && <span className="text-red-400 font-bold">{d.high} High</span>}
        {d.medium > 0 && <span className="text-amber-400 font-bold">{d.medium} Med</span>}
        {d.low > 0 && <span className="text-emerald-400 font-bold">{d.low} Low</span>}
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
        fill: SEV_COLOR[worst],
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

  return (
    <CollapsibleAccordion
      icon={<Grid3x3 size={16} />}
      title="Module Risk Heatmap"
      badge={`${data.length} module${data.length !== 1 ? 's' : ''}${highModules ? ` · ${highModules} high-risk` : ''}`}
      badgeSeverity={highModules ? 'red' : 'green'}
      tooltip={`Each tile is a functional module. Tile area = share of the codebase (${hasLoc ? 'lines of code' : 'object count'}); colour = the worst criticality inside it. Larger + redder = address first.`}
      defaultOpen
    >
      <div className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data as any}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="#fff"
            isAnimationActive={false}
            content={<TileContent />}
          >
            <Tooltip content={<TileTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-3 px-1">
        {(['High', 'Medium', 'Low'] as const).map((lvl) => (
          <div key={lvl} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: SEV_COLOR[lvl] }} />
            <span className="text-[11px] font-semibold text-slate-500">{lvl} criticality</span>
          </div>
        ))}
        <span className="text-[11px] text-slate-400 ml-auto">
          Weighted by {hasLoc ? 'lines of code' : 'object count'}
        </span>
      </div>
    </CollapsibleAccordion>
  );
}
