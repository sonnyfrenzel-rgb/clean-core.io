'use client';

import React from 'react';
import type { FileCard, TargetKind, TransformationFlow } from '@/lib/transformation-view';

/**
 * Proposal B's Sankey, "finding → target → file", drawn from data.
 *
 * Left: one bar per kind of finding, as tall as its count. Middle: one bar per
 * target (released successor, none published, custom persistence, the project
 * route), fed by bands as wide as the findings that go there. Right: the files
 * the model wrote, joined to the targets by one dashed line — the package as a
 * whole, because nothing records which file answers which finding, so no band
 * is drawn into a single file. A demo has no files and says so in that column.
 *
 * Colours are tokens (§1.8 categorical and the warning mark), never hex. On a
 * phone the same data is a list of "n kind → target" rows.
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
/** Where the file boxes start, under the column head and the model note. */
const TOP = 34;
const FILES_TOP = TOP + 34;
const GAP = 12;
const MAX_FILES = 6;
/**
 * The width a target's label may take: from its text to the file column, less
 * a margin. A label used to run under the file boxes and be cut by them ("…on
 * BAIF" for "BAIP", the platform's 30.09 short name); it now wraps inside this column instead.
 */
const TARGET_TEXT_X = TX + 18;
const TARGET_TEXT_W = FX - TARGET_TEXT_X - 16;
/** Average advance of the label face, per pixel of font size — generous, so a wrap comes early rather than late. */
const CHAR_EM = 0.62;
const LABEL_LINE = 16;
const SUB_LINE = 14;

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

export default function TransformationFlowChart({
  flow,
  files,
  findings,
  places,
}: {
  flow: TransformationFlow;
  files: readonly FileCard[] | null;
  /** Findings — one per pattern and object. The bands are drawn in these. */
  findings: number;
  /** Places in the code the findings occur on; named, not drawn. */
  places?: number;
}) {
  if (findings === 0) {
    return <p className="m-0 cc-text-cell text-cc-ink-muted">No finding, so no flow to draw.</p>;
  }
  const unit = Math.max(6, Math.min(14, 380 / findings));
  const minH = 18;

  // Left nodes.
  let y = TOP;
  const left = new Map<string, { y: number; h: number; used: number; slot: number }>();
  for (const k of flow.kinds) {
    const h = k.total * unit;
    left.set(k.kind, { y, h, used: 0, slot: Math.max(h, minH) });
    y += Math.max(h, minH) + GAP;
  }
  const leftEnd = y;

  // Target labels, wrapped to the column so they never run under the files.
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
  const mid = new Map<TargetKind, { y: number; h: number; used: number }>();
  for (const t of flow.targets) {
    const h = t.count * unit;
    mid.set(t.kind, { y, h, used: 0 });
    y += slotOf(t) + GAP + 10;
  }
  const midEnd = y;

  const fileList = files ?? [];
  const shownFiles = fileList.slice(0, MAX_FILES);
  const fileBoxH = 64;
  const filesEnd = FILES_TOP + Math.max(1, shownFiles.length + (fileList.length > MAX_FILES ? 1 : 0)) * (fileBoxH + 14);
  const H = Math.max(leftEnd, midEnd, filesEnd) + 8;

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
        fillOpacity={0.24}
      >
        <title>{`${l.count} × ${flow.kinds.find((k) => k.kind === l.from)?.label} → ${flow.targets.find((t) => t.kind === l.to)?.label}`}</title>
      </path>,
    );
  }

  const firstTarget = flow.targets[0] ? mid.get(flow.targets[0].kind) : undefined;
  const placesNote = places !== undefined && places !== findings ? ` at ${places} places in the code` : '';
  const summary = `${findings} findings${placesNote} in ${flow.kinds.length} kinds flow to ${flow.targets
    .map((t) => `${t.count} ${t.label}`)
    .join(', ')}; ${files === null ? 'no generated files in a demo' : `${fileList.length} generated files, a model proposal`}.`;

  return (
    <div data-transformation-flow="">
      <div className="hidden md:block">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary} className="block">
          <text x={LX - 8} y={16} textAnchor="end" fontSize={11} fontWeight={700} letterSpacing=".08em" fill="var(--cc-ink-muted)">
            {`YOUR CODE · ${findings} FINDINGS`}
          </text>
          <text x={TX} y={16} fontSize={11} fontWeight={700} letterSpacing=".08em" fill="var(--cc-ink-muted)">
            TARGET
          </text>
          <text x={W - 4} y={16} textAnchor="end" fontSize={11} fontWeight={700} letterSpacing=".08em" fill="var(--cc-ink-muted)">
            {files === null ? 'GENERATED · NONE IN A DEMO' : `GENERATED · ${fileList.length} ${fileList.length === 1 ? 'FILE' : 'FILES'}`}
          </text>
          {bands}
          {flow.kinds.map((k) => {
            const a = left.get(k.kind)!;
            return (
              <g key={k.kind}>
                <rect x={LX - 8} y={a.y} width={8} height={Math.max(a.h, 2)} rx={2} fill="var(--cc-chart-1)" />
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
                <text x={TARGET_TEXT_X} y={ty} fontSize={13} fontWeight={700} fill="var(--cc-ink)" data-flow-target-label="">
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
          {firstTarget ? (
            <>
              <path
                d={`M${TARGET_TEXT_X + TARGET_TEXT_W + 4} ${firstTarget.y + 9} C ${FX - 4} ${firstTarget.y + 9}, ${FX - 10} ${FILES_TOP + fileBoxH / 2}, ${FX} ${FILES_TOP + fileBoxH / 2}`}
                fill="none"
                stroke="var(--cc-warning-line)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              <text x={FX} y={FILES_TOP - 8} fontSize={11} fontWeight={600} fill="var(--cc-warning)">
                {files === null ? 'a real run: the model' : 'generated by the model'}
              </text>
            </>
          ) : null}
          {files === null || fileList.length === 0 ? (
            <g>
              <rect x={FX} y={FILES_TOP} width={W - FX - 4} height={fileBoxH} rx={10} fill="var(--cc-surface)" stroke="var(--cc-warning-line)" strokeDasharray="5 4" />
              <text x={FX + 12} y={TOP + 52} fontSize={12} fontWeight={700} fill="var(--cc-ink)">
                {files === null ? 'The demo stops here' : 'No code generated yet'}
              </text>
              <text x={FX + 12} y={TOP + 70} fontSize={11} fill="var(--cc-ink-muted)">
                {files === null ? 'no model call, so no files' : 'run the engine to write it'}
              </text>
            </g>
          ) : (
            shownFiles.map((f, i) => {
              const fy = FILES_TOP + i * (fileBoxH + 14);
              return (
                <g key={f.path}>
                  <rect x={FX} y={fy} width={W - FX - 4} height={fileBoxH} rx={10} fill="var(--cc-surface)" stroke="var(--cc-warning-line)" strokeDasharray="5 4" />
                  <text x={FX + 12} y={fy + 22} fontSize={12} fontWeight={700} fill="var(--cc-ink)" fontFamily="var(--cc-font-mono)">
                    {f.path.length > 26 ? `…${f.path.slice(-25)}` : f.path}
                  </text>
                  <text x={FX + 12} y={fy + 39} fontSize={11} fill="var(--cc-ink-muted)">
                    {f.role}
                  </text>
                  <text x={FX + 12} y={fy + 55} fontSize={11} fontWeight={600} fill="var(--cc-warning)">
                    Model proposal
                  </text>
                </g>
              );
            })
          )}
          {fileList.length > MAX_FILES ? (
            <text x={FX + 12} y={FILES_TOP + MAX_FILES * (fileBoxH + 14) + 18} fontSize={12} fill="var(--cc-ink-muted)">
              {`and ${fileList.length - MAX_FILES} more files`}
            </text>
          ) : null}
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
        <li className="mt-1 cc-text-label text-cc-ink-muted">
          {files === null ? 'Generated · none in a demo' : `Generated · ${fileList.length} ${fileList.length === 1 ? 'file' : 'files'}`}
        </li>
        {files === null || fileList.length === 0 ? (
          <li className="rounded-cc-row border border-dashed border-cc-warning-line bg-cc-surface px-2 py-1 cc-text-meta font-medium text-cc-ink-muted">
            {files === null ? 'The demo stops where the model begins.' : 'No code generated yet.'}
          </li>
        ) : (
          fileList.map((f) => (
            <li key={f.path} className="rounded-cc-row border border-dashed border-cc-warning-line bg-cc-surface px-2 py-1 cc-text-meta font-medium">
              <b className="break-all font-cc-mono">{f.path}</b> <span className="text-cc-ink-muted">{f.role} · Model proposal</span>
            </li>
          ))
        )}
      </ul>

      <p className="m-0 mt-3 flex flex-wrap gap-4 cc-text-meta font-medium text-cc-ink-muted">
        {flow.targets.map((t) => (
          <span key={t.kind} className="inline-flex items-center gap-1">
            <span aria-hidden={true} className="inline-block h-2 w-3 rounded-[3px]" style={{ background: TARGET_COLOUR[t.kind] }} />
            {t.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span aria-hidden={true} className="inline-block h-2 w-3 rounded-[3px] border border-dashed border-cc-warning-line" />
          model proposal
        </span>
      </p>
    </div>
  );
}
