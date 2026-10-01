'use client';

import React, { useId } from 'react';
import { ArrowDown } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import type { ArchitectureCanvasModel, CanvasSuccessor } from '@/lib/architecture-canvas';
import { BAIP_FORMERLY } from '@/lib/sap-naming';

/**
 * The target architecture as one picture — proposal B "Canvas first" of the
 * Design tool (owner decision 01.10.2026).
 *
 * Drawn from `lib/architecture-canvas.ts` and nothing else: the route the
 * contract chose, the successors the catalog named, the objects without one,
 * the custom tables, each with its lines. Two forms of the same content: a
 * wide SVG from 720 px, and a stacked HTML form on a phone, which reflows
 * instead of shrinking the drawing to unreadable text.
 *
 * Reusable: it takes the model, the two lines of context the page knows (the
 * target and the platform names) and, optionally, a selection — a click on a
 * box hands its key back, the page shows the evidence.
 *
 * Colours are tokens (`app/globals.css`). The side-by-side platform is drawn in
 * `--cc-chart-4`, the released APIs in `--cc-chart-2` (OData) and
 * `--cc-chart-3` (CDS), the clean-core boundary in the brand green, and what is
 * not determined hatched and dashed — the honest empty state of the mockup.
 */

export interface ArchitectureCanvasProps {
  model: ArchitectureCanvasModel;
  /** "Private Cloud Edition assumed · target not bound by the run" — the S/4HANA subtitle. */
  targetLine: string;
  selected?: string | null;
  onSelect?: (key: string) => void;
  /** Spoken summary for the SVG (`<desc>`). */
  description: string;
}

const W = 1180;
const MAX_SUCCESSORS = 12;
const MAX_GAPS = 9;
const MAX_TABLES = 8;

const mix = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, var(--cc-surface))`;
const C = {
  ink: 'var(--cc-ink)',
  muted: 'var(--cc-ink-muted)',
  line: 'var(--cc-line)',
  surface: 'var(--cc-surface)',
  page: 'var(--cc-surface-muted)',
  brand: 'var(--cc-brand-strong)',
  brandDeep: 'var(--cc-brand-deep)',
  brandSurface: 'var(--cc-brand-surface)',
  odata: 'var(--cc-chart-2)',
  odataBg: mix('--cc-chart-2', 8),
  odataLine: mix('--cc-chart-2', 40),
  cds: 'var(--cc-chart-3)',
  cdsBg: mix('--cc-chart-3', 7),
  cdsLine: mix('--cc-chart-3', 45),
  btp: 'var(--cc-chart-4)',
  btpBg: mix('--cc-chart-4', 6),
  btpLine: mix('--cc-chart-4', 35),
  btpSoft: mix('--cc-chart-4', 12),
  warnLine: 'var(--cc-warning-line)',
  warnBorder: 'var(--cc-warning-border)',
  warnInk: 'var(--cc-warning)',
  error: 'var(--cc-error)',
  focus: 'var(--cc-focus)',
};
const SANS = 'Inter, system-ui, sans-serif';
const MONO = 'var(--cc-font-mono), ui-monospace, monospace';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const lineList = (lines: number[], max = 4) =>
  lines.slice(0, max).map((l) => `L${l}`).join(' ') + (lines.length > max ? ` +${lines.length - max}` : '');

function tagLabel(s: CanvasSuccessor): string {
  if (s.tag === 'odata') return 'ODATA';
  if (s.tag === 'cds') return 'CDS';
  return s.type && s.type !== 'Unknown' ? s.type.toUpperCase().slice(0, 6) : 'API';
}

/** A box the reader can pick: a button in the accessibility tree, keyboard and pointer alike. */
function Pick({
  k,
  label,
  selected,
  onSelect,
  children,
}: {
  k: string;
  label: string;
  selected?: string | null;
  onSelect?: (key: string) => void;
  children: React.ReactNode;
}) {
  if (!onSelect) return <g>{children}</g>;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected === k}
      data-canvas-box={k}
      className="cursor-pointer"
      onClick={() => onSelect(k)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(k);
        }
      }}
    >
      {children}
    </g>
  );
}

function Pin({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g aria-hidden="true">
      <circle cx={x} cy={y} r={17} fill={C.ink} opacity={0.15} />
      <circle cx={x} cy={y} r={13} fill={C.ink} />
      <text x={x} y={y + 4} fontFamily={SANS} fontSize={12} fontWeight={700} fill={C.surface} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

function WideCanvas({ model, targetLine, selected, onSelect, description }: ArchitectureCanvasProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const hatch = `hatch-${uid}`;
  const arrow = `arrow-${uid}`;
  const arrowMuted = `arrowm-${uid}`;
  const inApp = model.route === 'in-app-rap';
  const sel = (k: string) => selected === k;

  /* ---------- left: S/4HANA ---------- */
  const succ = model.successors.slice(0, MAX_SUCCESSORS);
  const succMore = model.successors.length - succ.length;
  const succRows = Math.max(1, Math.ceil(succ.length / 2));
  const bTop = 56;
  const bHeight = 74 + succRows * 56 + (succMore > 0 ? 18 : 0);
  const bBottom = bTop + bHeight;

  const gaps = model.gaps.slice(0, MAX_GAPS);
  const gapMore = model.gaps.length - gaps.length;
  const gTop = bBottom + 16;
  const gHeight = gaps.length ? 60 + Math.ceil(gaps.length / 3) * 50 + (gapMore > 0 ? 16 : 0) : 0;
  const leftBottom = (gaps.length ? gTop + gHeight : bBottom) + 16;

  /* ---------- right: the route's own runtime ---------- */
  const rX = 760;
  const rTop = 76;
  const runtimeH = 132;
  const showFile = !inApp && model.fileTransfers.length > 0;
  const fTop = rTop + runtimeH + 16;
  const fH = 76;
  const tables = model.customTables.slice(0, MAX_TABLES);
  const tableMore = model.customTables.length - tables.length;
  const tTop = (showFile ? fTop + fH : rTop + runtimeH) + 16;
  const tH = tables.length ? 60 + Math.ceil(tables.length / 2) * 50 + (tableMore > 0 ? 16 : 0) : 0;
  const rightBottom = (tables.length ? tTop + tH : tTop - 16) + 16;

  const H = Math.max(leftBottom, rightBottom, 300) + 8;
  const driverText = model.driverPhrases.length
    ? `Because of ${model.driverPhrases.map((d) => `${d.text} · L${d.line}`).join(' and ')}`
    : 'No construct of the code moves it off the stack';
  const fileFirst = model.fileTransfers[0];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="group"
      aria-labelledby={`t-${uid} d-${uid}`}
      className="block"
      data-architecture-canvas={model.route ?? 'none'}
    >
      <title id={`t-${uid}`}>
        {inApp
          ? 'Target architecture: in-app ABAP Cloud with RAP inside SAP S/4HANA'
          : 'Target architecture: side-by-side CAP service on SAP Business AI Platform next to SAP S/4HANA'}
      </title>
      <desc id={`d-${uid}`}>{description}</desc>
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={C.ink} />
        </marker>
        <marker id={arrowMuted} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={C.muted} />
        </marker>
        <pattern id={hatch} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill={C.surface} />
          <line x1="0" y1="0" x2="0" y2="8" stroke={C.page} strokeWidth="4" />
        </pattern>
      </defs>

      {/* S/4HANA */}
      <rect x={8} y={8} width={inApp ? W - 16 : 660} height={H - 16} rx={16} fill={C.page} stroke={C.line} />
      <text x={28} y={38} fontFamily={SANS} fontSize={13} fontWeight={800} fill={C.ink}>
        SAP S/4HANA
        <tspan dx={8} fontSize={12} fontWeight={500} fill={C.muted}>
          {clip(targetLine, 70)}
        </tspan>
      </text>

      {/* Clean core boundary + released successors */}
      <Pick k="group:successors" label={`${model.successors.length} released APIs and views`} selected={selected} onSelect={onSelect}>
        <rect
          x={28}
          y={bTop}
          width={620}
          height={bHeight}
          rx={12}
          fill={C.surface}
          stroke={sel('group:successors') ? C.focus : C.brand}
          strokeWidth={1.5}
          strokeDasharray="7 5"
        />
        <rect x={40} y={bTop - 10} width={168} height={20} rx={10} fill={C.brandSurface} stroke={C.brand} />
        <text x={124} y={bTop + 4} fontFamily={SANS} fontSize={11} fontWeight={700} fill={C.brandDeep} textAnchor="middle">
          CLEAN CORE BOUNDARY
        </text>
        <text x={48} y={bTop + 34} fontFamily={SANS} fontSize={13} fontWeight={700} fill={C.ink}>
          Released APIs and CDS views the catalog names
        </text>
        <text x={48} y={bTop + 51} fontFamily={SANS} fontSize={12} fill={C.muted}>
          {model.successors.length
            ? `${model.successors.length} successor${model.successors.length === 1 ? '' : 's'} for ${model.successorUses} use${model.successorUses === 1 ? '' : 's'} in the code · Imported from the SAP catalog`
            : 'The catalog names no released successor for this code'}
        </text>
      </Pick>
      {succ.map((s, i) => {
        const x = 48 + (i % 2) * 300;
        const y = bTop + 64 + Math.floor(i / 2) * 56;
        const fill = s.tag === 'odata' ? C.odataBg : s.tag === 'cds' ? C.cdsBg : C.surface;
        const line = s.tag === 'odata' ? C.odataLine : s.tag === 'cds' ? C.cdsLine : C.line;
        // The tag is ink on a tint with the API's colour as its edge: white on
        // the solid chart colour fell below the contrast floor for CDS (teal)
        // and is read by the rendered guard against the page, not the pill.
        const tagFill = s.tag === 'odata' ? mix('--cc-chart-2', 16) : s.tag === 'cds' ? mix('--cc-chart-3', 16) : C.page;
        const tagEdge = s.tag === 'odata' ? C.odata : s.tag === 'cds' ? C.cds : C.line;
        const tag = tagLabel(s);
        const tagW = tag.length * 7 + 12;
        const note = s.confidence && s.confidence !== 'Verified' ? ` · ${s.confidence.toLowerCase()}` : '';
        return (
          <Pick key={s.key} k={s.key} label={`${s.name}, replaces ${s.replaces.join(', ')}`} selected={selected} onSelect={onSelect}>
            <rect x={x} y={y} width={286} height={46} rx={8} fill={fill} stroke={sel(s.key) ? C.focus : line} strokeWidth={sel(s.key) ? 2 : 1} />
            <rect x={x + 8} y={y + 8} width={tagW} height={16} rx={4} fill={tagFill} stroke={tagEdge} />
            <text x={x + 8 + tagW / 2} y={y + 20} fontFamily={SANS} fontSize={11} fontWeight={700} fill={C.ink} textAnchor="middle">
              {tag}
            </text>
            <text x={x + 16 + tagW} y={y + 20} fontFamily={MONO} fontSize={11} fontWeight={700} fill={C.ink}>
              {clip(s.name, 30)}
            </text>
            <text x={x + 10} y={y + 38} fontFamily={SANS} fontSize={11} fill={C.muted}>
              {clip(`replaces ${s.replaces.join(' / ')} · ${lineList(s.lines)}${note}`, 48)}
            </text>
          </Pick>
        );
      })}
      {succMore > 0 ? (
        <text x={48} y={bBottom - 10} fontFamily={SANS} fontSize={11} fill={C.muted}>
          + {succMore} more — listed under Evidence
        </text>
      ) : null}

      {/* No released successor */}
      {gaps.length ? (
        <>
          <Pick k="group:gaps" label={`${model.gaps.length} objects without a released successor`} selected={selected} onSelect={onSelect}>
            <rect
              x={28}
              y={gTop}
              width={620}
              height={gHeight}
              rx={12}
              fill={`url(#${hatch})`}
              stroke={sel('group:gaps') ? C.focus : C.warnLine}
              strokeDasharray="4 4"
            />
            <text x={48} y={gTop + 26} fontFamily={SANS} fontSize={13} fontWeight={700} fill={C.ink}>
              Inside the core, no released successor
            </text>
            <text x={48} y={gTop + 43} fontFamily={SANS} fontSize={12} fill={C.warnInk}>
              Carried as open, not filled in — the gap is SAP’s publication
            </text>
          </Pick>
          {gaps.map((g, i) => {
            const x = 48 + (i % 3) * 200;
            const y = gTop + 56 + Math.floor(i / 3) * 50;
            return (
              <Pick key={g.key} k={g.key} label={`${g.object}, ${g.what}, no released successor`} selected={selected} onSelect={onSelect}>
                <rect x={x} y={y} width={188} height={40} rx={8} fill={C.surface} stroke={sel(g.key) ? C.focus : C.warnBorder} strokeWidth={sel(g.key) ? 2 : 1} />
                <text x={x + 10} y={y + 17} fontFamily={MONO} fontSize={11} fontWeight={700} fill={C.ink}>
                  {clip(g.object, 22)}
                </text>
                <text x={x + 10} y={y + 32} fontFamily={SANS} fontSize={11} fill={C.muted}>
                  {clip(`${g.what} · ${lineList(g.lines, 2)}`, 30)}
                </text>
              </Pick>
            );
          })}
          {gapMore > 0 ? (
            <text x={48} y={gTop + gHeight - 8} fontFamily={SANS} fontSize={11} fill={C.muted}>
              + {gapMore} more — listed under Evidence
            </text>
          ) : null}
        </>
      ) : null}

      {/* The route's runtime */}
      <rect
        x={rX}
        y={8}
        width={412}
        height={H - 16}
        rx={16}
        fill={inApp ? C.surface : C.btpBg}
        stroke={inApp ? C.brand : C.btpLine}
        strokeDasharray={inApp ? '7 5' : undefined}
      />
      <text x={rX + 20} y={38} fontFamily={SANS} fontSize={13} fontWeight={800} fill={C.ink}>
        {inApp ? 'ABAP Cloud on the stack' : 'SAP Business AI Platform'}
      </text>
      <text x={rX + 20} y={55} fontFamily={SANS} fontSize={12} fill={C.muted}>
        {inApp ? 'in-app developer extensibility · customer namespace' : `${BAIP_FORMERLY} · side-by-side, own lifecycle`}
      </text>

      <Pick k="runtime" label={inApp ? 'RAP business object, runtime stipulated by the route' : 'CAP service, runtime stipulated by the route'} selected={selected} onSelect={onSelect}>
        <rect x={rX + 20} y={rTop} width={372} height={runtimeH} rx={12} fill={C.surface} stroke={sel('runtime') ? C.focus : inApp ? C.brand : C.btp} strokeWidth={sel('runtime') ? 2.5 : 1.5} />
        <text x={rX + 38} y={rTop + 26} fontFamily={SANS} fontSize={14} fontWeight={800} fill={C.ink}>
          {inApp ? 'RAP business object' : 'CAP service'}
          <tspan dx={10} fontSize={12} fontWeight={500} fill={C.muted}>
            {inApp ? 'ABAP Cloud' : 'Node.js or Java'}
          </tspan>
        </text>
        <text x={rX + 38} y={rTop + 48} fontFamily={SANS} fontSize={12} fill={C.muted}>
          Runtime stipulated by the route — not a measurement
        </text>
        <rect x={rX + 38} y={rTop + 62} width={336} height={26} rx={6} fill={inApp ? C.brandSurface : C.btpBg} stroke={inApp ? C.brand : C.btpSoft} />
        <text x={rX + 50} y={rTop + 79} fontFamily={SANS} fontSize={11} fontWeight={600} fill={inApp ? C.brandDeep : C.btp}>
          {clip(`Target artifact: ${model.targetArtifact ?? 'not determined'}`, 54)}
        </text>
        <text x={rX + 38} y={rTop + 114} fontFamily={SANS} fontSize={11} fill={C.muted}>
          {clip(driverText, 64)}
        </text>
      </Pick>
      <Pin x={rX + 392} y={rTop} n={1} />

      {showFile && fileFirst ? (
        <Pick k={fileFirst.key} label={`${fileFirst.title}, moves to a web client`} selected={selected} onSelect={onSelect}>
          <rect x={rX + 20} y={fTop} width={372} height={fH} rx={12} fill={C.surface} stroke={sel(fileFirst.key) ? C.focus : C.btpLine} strokeWidth={sel(fileFirst.key) ? 2 : 1} />
          <text x={rX + 38} y={fTop + 26} fontFamily={SANS} fontSize={13} fontWeight={700} fill={C.ink}>
            File transfer in a web client
          </text>
          <text x={rX + 38} y={fTop + 44} fontFamily={SANS} fontSize={12} fill={C.muted}>
            {clip(`replaces ${fileFirst.title} · ${lineList(model.fileTransfers.flatMap((f) => f.lines), 3)}`, 58)}
          </text>
          <text x={rX + 38} y={fTop + 62} fontFamily={SANS} fontSize={12} fill={C.muted}>
            Front-end file services do not run in the decoupled runtime
          </text>
        </Pick>
      ) : null}

      {tables.length ? (
        <>
          <Pick k="group:tables" label={`${model.customTables.length} custom tables`} selected={selected} onSelect={onSelect}>
            <rect
              x={rX + 20}
              y={tTop}
              width={372}
              height={tH}
              rx={12}
              fill={inApp ? C.surface : `url(#${hatch})`}
              stroke={sel('group:tables') ? C.focus : C.muted}
              strokeDasharray="5 4"
            />
            <text x={rX + 38} y={tTop + 26} fontFamily={SANS} fontSize={13} fontWeight={700} fill={C.ink}>
              {inApp ? 'Custom tables — customer namespace' : 'Custom tables — where they live: not determined'}
            </text>
            <text x={rX + 38} y={tTop + 43} fontFamily={SANS} fontSize={12} fill={C.muted}>
              {inApp ? 'On the stack, as the route stipulates — not a measurement' : 'Not yet decoupled; own persistence is a design decision'}
            </text>
          </Pick>
          {tables.map((t, i) => {
            const x = rX + 38 + (i % 2) * 180;
            const y = tTop + 56 + Math.floor(i / 2) * 50;
            const w = t.use === 'write';
            return (
              <Pick key={t.key} k={t.key} label={`${t.name}, ${t.use}`} selected={selected} onSelect={onSelect}>
                <rect x={x} y={y} width={168} height={40} rx={8} fill={C.surface} stroke={sel(t.key) ? C.focus : w ? C.error : C.line} strokeWidth={sel(t.key) ? 2 : 1} />
                <text x={x + 10} y={y + 17} fontFamily={MONO} fontSize={11} fontWeight={700} fill={C.ink}>
                  {clip(t.name, 20)}
                </text>
                <text x={x + 10} y={y + 32} fontFamily={SANS} fontSize={11} fill={w ? C.error : C.muted}>
                  {`${t.use} · ${lineList(t.lines, 2)}`}
                </text>
              </Pick>
            );
          })}
          {tableMore > 0 ? (
            <text x={rX + 38} y={tTop + tH - 8} fontFamily={SANS} fontSize={11} fill={C.muted}>
              + {tableMore} more — listed under Evidence
            </text>
          ) : null}
          <Pin x={rX + 392} y={tTop} n={4} />
        </>
      ) : null}

      {/* Connectors */}
      {inApp ? (
        <>
          <path d={`M${rX} ${rTop + 52} L 652 ${rTop + 52}`} fill="none" stroke={C.ink} strokeWidth={2} markerEnd={`url(#${arrow})`} />
          <rect x={672} y={rTop + 60} width={80} height={34} rx={6} fill={C.surface} stroke={C.line} />
          <text x={712} y={rTop + 74} fontFamily={SANS} fontSize={11} fontWeight={700} fill={C.ink} textAnchor="middle">
            released
          </text>
          <text x={712} y={rTop + 87} fontFamily={SANS} fontSize={11} fill={C.muted} textAnchor="middle">
            APIs only
          </text>
        </>
      ) : (
        <>
          <path d={`M${rX} 128 C 720 128, 720 210, 652 210`} fill="none" stroke={C.ink} strokeWidth={2} markerEnd={`url(#${arrow})`} />
          <rect x={676} y={146} width={80} height={34} rx={6} fill={C.surface} stroke={C.line} />
          <text x={716} y={160} fontFamily={SANS} fontSize={11} fontWeight={700} fill={C.ink} textAnchor="middle">
            OData / CDS
          </text>
          <text x={716} y={173} fontFamily={SANS} fontSize={11} fill={C.muted} textAnchor="middle">
            released only
          </text>
          <path d={`M${rX} 190 C 730 190, 730 300, 652 300`} fill="none" stroke={C.muted} strokeWidth={1.5} strokeDasharray="5 4" markerEnd={`url(#${arrowMuted})`} />
          <rect x={676} y={268} width={80} height={34} rx={6} fill={C.surface} stroke={C.line} strokeDasharray="3 3" />
          <text x={716} y={282} fontFamily={SANS} fontSize={11} fontWeight={700} fill={C.ink} textAnchor="middle">
            events
          </text>
          <text x={716} y={295} fontFamily={SANS} fontSize={11} fill={C.muted} textAnchor="middle">
            none specified
          </text>
        </>
      )}

      <Pin x={648} y={bTop} n={2} />
      {gaps.length ? <Pin x={648} y={gTop} n={3} /> : null}
    </svg>
  );
}

function Lines({ lines }: { lines: number[] }) {
  return (
    <>
      {lines.slice(0, 4).map((l) => (
        <React.Fragment key={l}>
          {' '}
          <CcAnchor label={`Source line ${l}`}>L{l}</CcAnchor>
        </React.Fragment>
      ))}
    </>
  );
}

/** The phone form — the same content stacked, so it reflows instead of shrinking. */
function TallCanvas({ model, targetLine }: ArchitectureCanvasProps) {
  const inApp = model.route === 'in-app-rap';
  return (
    <div className="flex flex-col gap-2" data-architecture-canvas-tall={model.route ?? 'none'}>
      <div
        className="rounded-cc-card border p-3"
        style={{ background: inApp ? 'var(--cc-surface)' : C.btpBg, borderColor: inApp ? 'var(--cc-brand-strong)' : C.btpLine }}
      >
        <p className="m-0 text-[13px] font-extrabold text-cc-ink">
          {inApp ? 'ABAP Cloud on the stack' : 'SAP Business AI Platform'}
          <span className="block text-[12px] font-medium text-cc-ink-muted">
            {inApp ? 'in-app developer extensibility' : `${BAIP_FORMERLY} · side-by-side`}
          </span>
        </p>
        <div className="mt-2 rounded-cc-row border bg-cc-surface px-3 py-2 text-[13px]" style={{ borderColor: inApp ? 'var(--cc-brand-strong)' : C.btp }}>
          <b>{inApp ? 'RAP business object' : 'CAP service'}</b>
          <span className="block text-[12px] text-cc-ink-muted">
            {inApp ? 'ABAP Cloud' : 'Node.js or Java'} · runtime stipulated by the route
          </span>
        </div>
        {!inApp && model.fileTransfers.length ? (
          <div className="mt-2 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2 text-[13px]">
            <b>File transfer in a web client</b>
            <span className="block text-[12px] text-cc-ink-muted">
              replaces {model.fileTransfers[0].title}
              <Lines lines={model.fileTransfers.flatMap((f) => f.lines)} />
            </span>
          </div>
        ) : null}
        {model.customTables.length ? (
          <div className="mt-2 rounded-cc-row border border-dashed border-cc-ink-muted bg-cc-surface px-3 py-2 text-[13px]">
            <b>{inApp ? 'Custom tables — customer namespace' : 'Custom tables — where they live: not determined'}</b>
            <span className="block text-[12px] leading-6 text-cc-ink-muted">
              {model.customTables.map((t, i) => (
                <React.Fragment key={t.key}>
                  {i ? ' · ' : ''}
                  <span className="font-cc-mono">{t.name}</span>
                  <Lines lines={t.lines.slice(0, 1)} />
                </React.Fragment>
              ))}
            </span>
          </div>
        ) : null}
      </div>
      <p className="m-0 flex items-center gap-2 pl-3 text-[12px] font-semibold text-cc-ink-muted">
        <ArrowDown size={14} aria-hidden="true" />
        {inApp ? 'Released APIs only' : 'OData / CDS — released only · events: none specified'}
      </p>
      <div className="rounded-cc-card border border-cc-line bg-cc-surface-muted p-3">
        <p className="m-0 text-[13px] font-extrabold text-cc-ink">
          SAP S/4HANA
          <span className="block text-[12px] font-medium text-cc-ink-muted">{targetLine}</span>
        </p>
        <div className="relative mt-4 rounded-cc-row border border-dashed border-cc-brand-strong bg-cc-surface px-2 pt-4 pb-2">
          <span className="absolute -top-3 left-3 rounded-full border border-cc-brand-strong bg-cc-brand-surface px-2 text-[11px] font-bold text-cc-brand-deep">
            CLEAN CORE BOUNDARY
          </span>
          {model.successors.length ? (
            <ul className="m-0 grid list-none gap-1 p-0">
              {model.successors.map((s) => (
                <li key={s.key} className="text-[12px]">
                  <span
                    className="mr-2 rounded-[4px] px-1 text-[11px] font-bold text-cc-on-dark"
                    style={{ background: s.tag === 'odata' ? C.odata : s.tag === 'cds' ? C.cds : C.muted }}
                  >
                    {tagLabel(s)}
                  </span>
                  <b className="font-cc-mono break-all">{s.name}</b>
                  <span className="block pl-4 text-cc-ink-muted">
                    {s.replaces.join(' / ')}
                    <Lines lines={s.lines} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[12px] text-cc-ink-muted">The catalog names no released successor for this code.</p>
          )}
        </div>
        {model.gaps.length ? (
          <div className="mt-2 rounded-cc-row border border-dashed px-3 py-2 text-[13px]" style={{ borderColor: 'var(--cc-warning-line)' }}>
            <b>No released successor</b>
            <span className="block text-[12px] leading-6 text-cc-ink-muted">
              {model.gaps.map((g, i) => (
                <React.Fragment key={g.key}>
                  {i ? ' · ' : ''}
                  <span className="font-cc-mono">{g.object}</span>
                  <Lines lines={g.lines.slice(0, 2)} />
                </React.Fragment>
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ArchitectureCanvas(props: ArchitectureCanvasProps) {
  return (
    <>
      <div className="hidden min-[720px]:block">
        <WideCanvas {...props} />
      </div>
      <div className="min-[720px]:hidden">
        <TallCanvas {...props} />
      </div>
    </>
  );
}

/** The same picture as a list at every width — the "List" view of the tool. */
export function ArchitectureList(props: ArchitectureCanvasProps) {
  return <TallCanvas {...props} />;
}
