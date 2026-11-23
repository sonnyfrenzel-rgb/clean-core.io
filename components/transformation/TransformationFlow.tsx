'use client';

import React, { useState } from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import FamilyChip from '@/components/family/FamilyChip';
import { cn } from '@/lib/utils';
import { successorSourceNote } from '@/lib/successor-source';
import type { ObjectFlow, TargetKind, TraceRow, TransformationFlow } from '@/lib/transformation-view';

/**
 * "Where each finding went" — one flow, finding → target → object (ADR-129 (4), mock-up T5), drawn from data.
 *
 * Left: one bar per kind of finding, as tall as its count. Middle: one bar per target (a released successor, the
 * project route, none released, a custom table whose home is not decided), fed by bands as wide as the findings that
 * go there. Right: the objects of the stored package that now carry them, read from the package's own
 * `traceability.json` (`objectFlow`) — the logic class, the behavior pool, "Not in the package". Without a trace (no
 * package yet, the demo, a package from one model call) nothing records which object answers which finding, and the
 * column says so instead of drawing a band into a guess.
 *
 * Choosing a target lists its findings with their lines under the drawing. Colours are tokens, never hex. On a phone
 * the same data is a list of "n kind → target" rows.
 */

export const TARGET_COLOUR: Record<TargetKind, string> = {
  successor: 'var(--cc-seq-3)',
  'no-successor': 'var(--cc-warning-mark)',
  custom: 'var(--cc-code-muted)',
  route: 'var(--cc-chart-4)',
  'route-other': 'var(--cc-chart-1)',
};

const W = 1100;
const LX = 268;
const TX = 640;
const FX = 910;
/** Where the object boxes start, under the column head. */
const TOP = 34;
const GAP = 12;
/**
 * The width a target's label may take: from its text to the object column, less a margin. A label used to run under
 * the boxes of the third column and be cut by them ("…on BAIF" for "BAIP"); it wraps inside this column instead.
 */
const TARGET_TEXT_X = TX + 18;
const TARGET_TEXT_W = FX - TARGET_TEXT_X - 16;
/** Average advance of the label face, per pixel of font size — generous, so a wrap comes early rather than late. */
const CHAR_EM = 0.62;
const LABEL_LINE = 16;
const SUB_LINE = 14;
const OBJECT_TEXT_W = W - FX - 24;

/** Words into lines no wider than `width` at `fontSize`; a single over-long word is cut with an ellipsis. */
export function wrapToWidth(text: string, fontSize: number, width: number): string[] {
  const max = Math.max(4, Math.floor(width / (fontSize * CHAR_EM)));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > max ? `${word.slice(0, max - 1)}…` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const sureWords = (r: TraceRow): string => {
  const t = r.target;
  if (t.kind === 'successor') return `${t.label}${t.successorType ? ` · ${t.successorType}` : ''} · ${successorSourceNote(t.successorConfidence)}`;
  if (t.kind === 'route') return t.label;
  if (t.kind === 'custom') return 'home not decided';
  if (t.kind === 'no-successor') return 'nothing released to call';
  return 'the project route is not among its options';
};

export default function TransformationFlowChart({
  flow,
  objects,
  rows,
  findings,
  places,
  empty,
}: {
  flow: TransformationFlow;
  /** The third column from the package's trace, or null where none records it. */
  objects: ObjectFlow | null;
  /** The findings with their lines, for the list under the drawing. */
  rows: readonly TraceRow[];
  /** Findings — one per pattern and object. The bands are drawn in these. */
  findings: number;
  /** Places in the code the findings occur on; named, not drawn. */
  places?: number;
  /** What the third column says without objects: "The demo stops here", "No code generated yet". */
  empty: { head: string; title: string; sub: string };
}) {
  const [pick, setPick] = useState<TargetKind | null>(null);
  if (findings === 0) {
    return <p className="m-0 cc-text-cell text-cc-ink-muted">No finding, so no flow to draw.</p>;
  }
  const picked = pick ?? flow.targets[0]?.kind ?? null;
  const unit = Math.max(6, Math.min(14, 380 / findings));
  const minH = 18;

  // Left nodes.
  let y = TOP;
  const left = new Map<string, { y: number; h: number; used: number }>();
  for (const k of flow.kinds) {
    const h = k.total * unit;
    left.set(k.kind, { y, h, used: 0 });
    y += Math.max(h, minH) + GAP;
  }
  const leftEnd = y;

  // Target labels, wrapped to the column so they never run under the objects.
  const targetText = new Map(
    flow.targets.map((t) => [
      t.kind,
      {
        label: wrapToWidth(`${t.label} · ${t.count}`, 13, TARGET_TEXT_W),
        sub: wrapToWidth(t.sub, 11, TARGET_TEXT_W).slice(0, 2),
      },
    ]),
  );
  const slotOf = (t: { kind: TargetKind; count: number }) => {
    const text = targetText.get(t.kind)!;
    return Math.max(t.count * unit, text.label.length * LABEL_LINE + text.sub.length * SUB_LINE + 4);
  };

  // Target nodes, vertically centred against the left column's height.
  const targetsH = flow.targets.reduce((n, t) => n + slotOf(t) + GAP + 10, 0);
  y = TOP + Math.max(0, (leftEnd - TOP - targetsH) / 2);
  const mid = new Map<TargetKind, { y: number; h: number; used: number; out: number }>();
  for (const t of flow.targets) {
    const h = t.count * unit;
    mid.set(t.kind, { y, h, used: 0, out: 0 });
    y += slotOf(t) + GAP + 10;
  }
  const midEnd = y;

  // Object nodes.
  const objectText = new Map((objects?.objects ?? []).map((o) => [o.key, { label: wrapToWidth(o.label, 12.5, OBJECT_TEXT_W).slice(0, 2), sub: wrapToWidth(`${o.count} · ${o.sub}`, 11, OBJECT_TEXT_W).slice(0, 2) }]));
  y = TOP;
  const right = new Map<string, { y: number; h: number; used: number }>();
  for (const o of objects?.objects ?? []) {
    const text = objectText.get(o.key)!;
    const h = o.count * unit;
    right.set(o.key, { y, h, used: 0 });
    y += Math.max(h, text.label.length * 15 + text.sub.length * SUB_LINE + 6) + GAP + 10;
  }
  const rightEnd = objects ? y : TOP + 64 + 14;
  const H = Math.max(leftEnd, midEnd, rightEnd) + 8;

  const fade = (to: TargetKind) => (picked && picked !== to ? 0.1 : 0.28);
  const bands: React.ReactNode[] = [];
  for (const l of flow.links) {
    const a = left.get(l.from);
    const b = mid.get(l.to);
    if (!a || !b) continue;
    const h = l.count * unit;
    const y1 = a.y + a.used;
    const y2 = b.y + b.used;
    a.used += h;
    b.used += h;
    const cx = (LX + TX) / 2;
    bands.push(
      <path
        key={`${l.from}-${l.to}`}
        d={`M${LX} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${TX} ${y2} L ${TX} ${y2 + h} C ${cx} ${y2 + h}, ${cx} ${y1 + h}, ${LX} ${y1 + h} Z`}
        fill={TARGET_COLOUR[l.to]}
        fillOpacity={fade(l.to)}
      >
        <title>{`${l.count} × ${flow.kinds.find((k) => k.kind === l.from)?.label} → ${flow.targets.find((t) => t.kind === l.to)?.label}`}</title>
      </path>,
    );
  }
  for (const l of objects?.links ?? []) {
    const b = mid.get(l.from);
    const c = right.get(l.to);
    if (!b || !c) continue;
    const h = l.count * unit;
    const y1 = b.y + b.out;
    const y2 = c.y + c.used;
    b.out += h;
    c.used += h;
    const x1 = TX + 10;
    const cx = (x1 + FX) / 2;
    bands.push(
      <path
        key={`${l.from}-${l.to}-obj`}
        d={`M${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${FX} ${y2} L ${FX} ${y2 + h} C ${cx} ${y2 + h}, ${cx} ${y1 + h}, ${x1} ${y1 + h} Z`}
        fill={TARGET_COLOUR[l.from]}
        fillOpacity={fade(l.from)}
      >
        <title>{`${l.count} × ${flow.targets.find((t) => t.kind === l.from)?.label} → ${objects?.objects.find((o) => o.key === l.to)?.label}`}</title>
      </path>,
    );
  }

  const placesNote = places !== undefined && places !== findings ? ` at ${places} places in the code` : '';
  const summary = `${findings} findings${placesNote} in ${flow.kinds.length} kinds flow to ${flow.targets
    .map((t) => `${t.count} ${t.label}`)
    .join(', ')}; ${objects ? `in the package they are carried by ${objects.objects.map((o) => `${o.count} ${o.label}`).join(', ')}` : empty.title.toLowerCase()}.`;
  const pickedRows = picked ? rows.filter((r) => r.target.kind === picked) : [];
  const pickedTarget = flow.targets.find((t) => t.kind === picked);

  return (
    <div data-transformation-flow="">
      <div className="hidden md:block">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary} className="block">
          <text x={LX - 8} y={16} textAnchor="end" fontSize={11} fontWeight={600} letterSpacing=".08em" fill="var(--cc-ink-muted)">
            {`YOUR CODE · ${findings} FINDINGS`}
          </text>
          <text x={TX} y={16} fontSize={11} fontWeight={600} letterSpacing=".08em" fill="var(--cc-ink-muted)">
            TARGET
          </text>
          <text x={FX} y={16} fontSize={11} fontWeight={600} letterSpacing=".08em" fill="var(--cc-ink-muted)">
            {objects ? 'WHERE IT IS NOW' : empty.head}
          </text>
          {bands}
          {flow.kinds.map((k) => {
            const a = left.get(k.kind)!;
            return (
              <g key={k.kind}>
                <rect x={LX - 8} y={a.y} width={8} height={Math.max(a.h, 2)} rx={2} fill="var(--cc-ink)" />
                <text x={LX - 16} y={a.y + Math.max(a.h, 2) / 2 + 4} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--cc-ink)">
                  {k.label} <tspan fontWeight={500} fill="var(--cc-ink-muted)">{k.total}</tspan>
                </text>
              </g>
            );
          })}
          {flow.targets.map((t) => {
            const b = mid.get(t.kind)!;
            const ty = b.y + Math.min(b.h / 2, 12) + 2;
            const text = targetText.get(t.kind)!;
            const subY = ty + (text.label.length - 1) * LABEL_LINE + 15;
            return (
              <g key={t.kind} data-flow-target={t.kind}>
                <rect x={TX} y={b.y} width={10} height={Math.max(b.h, 2)} rx={2} fill={TARGET_COLOUR[t.kind]} />
                <text x={TARGET_TEXT_X} y={ty} fontSize={13} fontWeight={600} fill="var(--cc-ink)" data-flow-target-label="">
                  {text.label.map((l, i) => (
                    <tspan key={i} x={TARGET_TEXT_X} dy={i === 0 ? 0 : LABEL_LINE}>
                      {l}
                    </tspan>
                  ))}
                </text>
                <text x={TARGET_TEXT_X} y={subY} fontSize={11} fill="var(--cc-ink-muted)">
                  {text.sub.map((l, i) => (
                    <tspan key={i} x={TARGET_TEXT_X} dy={i === 0 ? 0 : SUB_LINE}>
                      {l}
                    </tspan>
                  ))}
                  <title>{t.sub}</title>
                </text>
              </g>
            );
          })}
          {objects ? (
            objects.objects.map((o) => {
              const c = right.get(o.key)!;
              const text = objectText.get(o.key)!;
              return (
                <g key={o.key} data-flow-object={o.key}>
                  <rect x={FX} y={c.y} width={10} height={Math.max(c.h, 2)} rx={2} fill={o.key === 'out' ? 'var(--cc-line)' : 'var(--cc-ink)'} />
                  <text x={FX + 18} y={c.y + 13} fontSize={12.5} fontWeight={600} fill="var(--cc-ink)" fontFamily={o.key === 'out' ? undefined : 'var(--cc-font-mono)'}>
                    {text.label.map((l, i) => (
                      <tspan key={i} x={FX + 18} dy={i === 0 ? 0 : 15}>
                        {l}
                      </tspan>
                    ))}
                  </text>
                  <text x={FX + 18} y={c.y + 13 + text.label.length * 15} fontSize={11} fill="var(--cc-ink-muted)">
                    {text.sub.map((l, i) => (
                      <tspan key={i} x={FX + 18} dy={i === 0 ? 0 : SUB_LINE}>
                        {l}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })
          ) : (
            <g>
              <rect x={FX} y={TOP} width={W - FX - 4} height={64} rx={10} fill="var(--cc-surface)" stroke="var(--cc-line)" strokeDasharray="5 4" />
              <text x={FX + 12} y={TOP + 26} fontSize={12} fontWeight={600} fill="var(--cc-ink)">
                {empty.title}
              </text>
              <text x={FX + 12} y={TOP + 44} fontSize={11} fill="var(--cc-ink-muted)">
                {wrapToWidth(empty.sub, 11, W - FX - 28)[0]}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Phone: the same flow as rows. */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden" aria-label="Findings by kind and target">
        {flow.links.map((l) => {
          const kind = flow.kinds.find((k) => k.kind === l.from)!;
          const target = flow.targets.find((t) => t.kind === l.to)!;
          return (
            <li key={`${l.from}-${l.to}`} className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-center gap-2 cc-text-meta font-medium text-cc-ink">
              <span className="min-w-0 break-words rounded-cc-row border border-cc-line bg-cc-surface px-2 py-1">
                <b>{l.count}</b> {kind.label}
              </span>
              <span aria-hidden={true} className="block rounded-[3px]" style={{ height: 4 + Math.min(l.count, 14), background: TARGET_COLOUR[l.to], opacity: 0.6 }} />
              <span className="min-w-0 break-words rounded-cc-row border bg-cc-surface px-2 py-1" style={{ borderColor: TARGET_COLOUR[l.to] }}>
                {target.label}
              </span>
            </li>
          );
        })}
        <li className="mt-1 cc-text-label text-cc-ink-muted">{objects ? 'Where it is now' : empty.head.toLowerCase().replace(/^./, (c) => c.toUpperCase())}</li>
        {objects ? (
          objects.objects.map((o) => (
            <li key={o.key} className="rounded-cc-row border border-cc-line bg-cc-surface px-2 py-1 cc-text-meta font-medium">
              <b className={cn('break-all', o.key !== 'out' && 'font-cc-mono')}>{o.label}</b> <span className="text-cc-ink-muted">{o.count} · {o.sub}</span>
            </li>
          ))
        ) : (
          <li className="rounded-cc-row border border-dashed border-cc-line bg-cc-surface px-2 py-1 cc-text-meta font-medium text-cc-ink-muted">{empty.title}</li>
        )}
      </ul>

      {/* Choose a target: its findings with their lines. */}
      <div role="group" aria-label="Targets" className="mt-4 flex flex-wrap gap-2" data-flow-picker="">
        {flow.targets.map((t) => (
          <CcButton
            key={t.kind}
            density="compact"
            variant={picked === t.kind ? 'secondary' : 'ghost'}
            aria-pressed={picked === t.kind}
            onClick={() => setPick(t.kind)}
            data-flow-pick={t.kind}
            icon={<span aria-hidden={true} className="inline-block h-2 w-2 rounded-[2px]" style={{ background: TARGET_COLOUR[t.kind] }} />}
          >
            <span>
              {t.count} · {t.label}
            </span>
          </CcButton>
        ))}
      </div>
      {pickedTarget ? (
        <div className="mt-3 border-t border-cc-line pt-3" data-flow-picked={pickedTarget.kind}>
          <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
            {pickedRows.length} · {pickedTarget.label}
            {pickedTarget.kind === 'successor' ? <FamilyChip kind="engine" /> : null}
            {pickedTarget.kind === 'no-successor' || pickedTarget.kind === 'custom' || pickedTarget.kind === 'route-other' ? <FamilyChip kind="not-determined" note="open" /> : null}
          </p>
          <ul className="m-0 mt-2 grid list-none grid-cols-1 gap-x-4 gap-y-2 p-0 lg:grid-cols-2">
            {pickedRows.map((r) => (
              <li key={r.id} className="flex min-w-0 items-baseline gap-2 cc-text-cell" data-flow-finding={r.id}>
                <span className="flex shrink-0 flex-wrap gap-1">
                  {r.lines.slice(0, 3).map((n) => (
                    <CcAnchor key={n} label={`Source line ${n}`}>{`L${n}`}</CcAnchor>
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="font-semibold text-cc-ink">{r.title}</span>{' '}
                  <span className="text-cc-ink-muted">
                    {r.object ? `(${r.object}) ` : ''}→ {sureWords(r)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
