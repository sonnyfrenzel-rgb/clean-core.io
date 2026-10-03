'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Cloud, Target, Link2, User, Plus, Minus, Maximize2, Minimize2, Scan, X, CircleDashed, RefreshCw } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcCodeSurface from '@/components/cc/CodeSurface';
import CcIconButton from '@/components/cc/IconButton';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTabs from '@/components/cc/Tabs';
import CcDateText from '@/components/cc/DateText';
import CcDialog from '@/components/cc/Dialog';
import CcMessageBox from '@/components/cc/MessageBox';
import CcCanvasDrawer from '@/components/cc/CanvasDrawer';
import { ccModalOpen } from '@/components/cc/modal';
import ArchitectureCanvas from '@/components/design/ArchitectureCanvas';
import { ArchitectureList, ARCHITECTURE_ZOOM, fitArchitectureScale, fitArchitectureToBox } from '@/components/design/ArchitectureCanvas';
import { cn } from '@/lib/utils';
import { contractForDisplay, type ArchitectureContract, type ContractAlternative, type ContractField } from '@/lib/architecture-contract';
import type { ArchitectureCanvasModel } from '@/lib/architecture-canvas';
import { findingIdsOfKey, titleOfKey } from '@/lib/architecture-canvas';
import type { DesignEvidence } from '@/hooks/useDesignEvidence';
import type { ProvenanceValue } from '@/lib/provenance';
import { architectureOptionLabel } from '@/components/ArchitectSignOff';
import { designAnswer, type StoredRoute } from '@/lib/design-recommendation';
import { useTouchViewport } from '@/components/process-map/useTouchViewport';
import './design-canvas.css';

/**
 * The Design tool, proposal B "Canvas first" (owner decision 01.10.2026,
 * `scratchpad/design-proposals/proposal-B.html`): the target architecture as
 * the stage, floating figures on it, a side panel for the decision and the
 * sign-off, and a drawer underneath for the model-written design document,
 * the contract and its alternatives.
 *
 * What it says comes from three places and says which: the architecture
 * contract (route, fields, alternatives — `lib/architecture-contract.ts`), the
 * engine's findings (successors, gaps, tables, lines), and the model's design
 * document, every section of which carries "Model proposal". The sign-off is
 * the existing `ArchitectSignOff`, handed in by the page — its behaviour and the
 * command it sends are unchanged.
 */

export interface DesignDocSection {
  key: string;
  title: string;
  written: boolean;
  /** One line for the card. */
  excerpt?: string;
  /** "older text form — one sentence", "6 files" … */
  meta?: string;
  content?: React.ReactNode;
}

export interface DesignCanvasStageProps {
  evidence: DesignEvidence;
  model: ArchitectureCanvasModel | null;
  /** The S/4HANA subtitle on the canvas. */
  targetLine: string;
  targetKpi: { value: string; sub: string | null };
  confidence: number | null;
  /**
   * The route stored on the project — the run's recommendation, or the route
   * switch. Never the card's answer while there is a contract
   * (`lib/design-recommendation.ts`): only named, as what it is, when it differs.
   */
  storedRoute: StoredRoute | null;
  confirmed: { label: string; by: string | null; at: string | null } | null;
  /** The stored design or sign-off belongs to an earlier source. */
  stale: boolean;
  hasDocument: boolean;
  canSignOff: boolean;
  /** `ArchitectSignOff`, already wired. Rendered in the Decision tab. */
  signOffPanel: React.ReactNode | null;
  locked: boolean;
  onRegenerate: () => void;
  regenerateDisabled: boolean;
  regenerating: boolean;
  /** The source, for the lines the Evidence tab quotes. */
  legacyCode: string;
  sections: DesignDocSection[];
  /** The document region when there is no document: an empty state, a reason, an error. */
  documentFallback: React.ReactNode | null;
  /** A failed (re)generation, worded for the reader. */
  documentNotice: React.ReactNode | null;
  /** The router's own rationale, beside the alternatives. */
  routingRationale: React.ReactNode | null;
  view: 'canvas' | 'list';
  /**
   * What the sign-off is, where it is not a real project's. Unset, it is the
   * self-declaration of the signed-in account, bound to the run; the demo's is
   * a switch in the browser, attributed to nobody and bound to no run, and it
   * says so in these three places instead.
   */
  signOffWording?: { open: string; confirmed: string; dialogLead: string };
  /**
   * Confirming the target is a question first (owner 02.10.2026: "otherwise it
   * is easy to misclick"). Set, "Confirm target" opens a small message
   * box naming `label`; only its own "Confirm target" calls `onConfirm`, and a
   * thrown error is shown in the box, which stays open. With `chooseOther`,
   * "Choose another target…" in the box opens the full sign-off
   * (`signOffPanel`) instead. Unset, "Confirm target" opens the full sign-off
   * directly.
   */
  confirmTarget?: { label: string; onConfirm: () => Promise<void> | void; chooseOther?: boolean };
}

/**
 * The box the canvas has, measured, and the drawing's natural height (its
 * viewBox): "Fit" scales the drawing to it within `ARCHITECTURE_ZOOM`.
 */
function useCanvasBox(el: HTMLDivElement | null): { width: number; height: number; drawing: number } {
  const [box, setBox] = useState({ width: 0, height: 0, drawing: 0 });
  useEffect(() => {
    if (!el) return undefined;
    const measure = () => {
      const svg = el.querySelector<SVGSVGElement>('svg[data-architecture-canvas]');
      const drawing = svg?.viewBox.baseVal?.height ?? 0;
      setBox((was) =>
        was.width === el.clientWidth && was.height === el.clientHeight && was.drawing === drawing
          ? was
          : { width: el.clientWidth, height: el.clientHeight, drawing },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return box;
}

const LABEL = 'm-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase';

const SHORT: Record<string, string> = {
  standard: 'SAP standard',
  'key-user': 'Key user (tier 3)',
  'in-app-rap': 'In-app ABAP Cloud / RAP',
  'side-by-side-cap': 'Side-by-side CAP',
};

function verdictText(a: ContractAlternative, deviation: boolean): string {
  if (a.verdict === 'chosen') return deviation ? 'Chosen against the recommendation' : 'Recommended';
  if (a.verdict === 'rejected') return a.basis === 'evidence' ? 'Rejected on evidence' : 'Rejected as a setting';
  return 'Not determined';
}

function linesOf(citations: { line?: number }[]): number[] {
  return [...new Set(citations.map((c) => c.line).filter((l): l is number => typeof l === 'number'))].sort((a, b) => a - b);
}

function Anchors({ lines, max = 6 }: { lines: number[]; max?: number }) {
  if (!lines.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {lines.slice(0, max).map((l) => (
        <CcAnchor key={l} label={`Source line ${l}`}>
          L{l}
        </CcAnchor>
      ))}
    </span>
  );
}

function PinMark({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-5 shrink-0 place-items-center rounded-full bg-cc-ink text-[11px] font-bold text-cc-surface"
    >
      {n}
    </span>
  );
}

function Kpi({
  icon,
  tint,
  label,
  value,
  extra,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div
      data-design-kpi={label}
      className="flex items-center gap-3 rounded-cc-card border border-cc-line bg-cc-surface px-3 py-2 shadow-cc max-[719px]:px-2"
    >
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-cc-row max-[719px]:hidden"
        style={{ background: `color-mix(in srgb, var(${tint}) 10%, var(--cc-surface))`, color: `var(${tint})` }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className={LABEL}>{label}</p>
        <p className="m-0 text-[15px] font-extrabold tracking-[-0.01em] text-cc-ink">{value}</p>
        {extra ? <div className="mt-px flex flex-wrap items-center gap-1 text-[12px] text-cc-ink-muted">{extra}</div> : null}
      </div>
    </div>
  );
}

function FieldText({ f, clampLines }: { f: ContractField; clampLines?: boolean }) {
  return (
    <p className={cn('m-0 text-[13px] leading-snug text-cc-ink', clampLines && 'line-clamp-3', !f.statement && 'text-cc-ink-muted')}>
      {f.statement ?? f.notDeterminedReason}
    </p>
  );
}

/** Source lines of the selected box — the code the box stands for. */
function SourceLines({ code, lines, label }: { code: string; lines: number[]; label: string }) {
  if (!code || !lines.length) return null;
  const all = code.split(/\r?\n/);
  const shown = lines.slice(0, 8).map((n) => ({
    number: n,
    tokens: [{ kind: 'plain' as const, text: (all[n - 1] ?? '').trim() }],
    highlighted: true,
  }));
  return <CcCodeSurface lines={shown} label={label} />;
}

export default function DesignCanvasStage(props: DesignCanvasStageProps) {
  const {
    evidence,
    model,
    targetLine,
    targetKpi,
    confidence,
    storedRoute,
    confirmed,
    stale,
    hasDocument,
    canSignOff,
    signOffPanel,
    locked,
    onRegenerate,
    regenerateDisabled,
    regenerating,
    legacyCode,
    sections,
    documentFallback,
    documentNotice,
    routingRationale,
    view,
    signOffWording,
    confirmTarget,
  } = props;

  const storedContract = evidence.state === 'ready' ? evidence.contract : null;
  const contract: ArchitectureContract | null = useMemo(
    () => (storedContract ? contractForDisplay(storedContract) : null),
    [storedContract],
  );
  const deviation = Boolean(contract?.route.deviation);
  const [panelTab, setPanelTab] = useState<'decision' | 'contract' | 'alternatives' | 'evidence'>('decision');
  const [selected, setSelected] = useState<string | null>(null);
  /** The evidence of the chosen box, shown in full screen over the drawing (`CcCanvasDrawer`). */
  const [fullDetail, setFullDetail] = useState(false);
  // 'fit' follows the column; a number is the reader's own zoom.
  const [zoomChoice, setZoom] = useState<number | 'fit'>('fit');
  // A callback ref: the canvas mounts only once the contract has been read.
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const canvasBox = useCanvasBox(canvasEl);
  const firstWritten = sections.find((s) => s.written)?.key ?? sections[0]?.key ?? null;
  // The section the reader picked; until then (and when it is not written any
  // more after a regeneration) the first written one.
  const [section, setSection] = useState<string | null>(null);
  const activeSection = sections.find((s) => s.key === section && s.written) ?? sections.find((s) => s.key === firstWritten) ?? null;
  // The sign-off opens as a dialog from "Confirm target" (owner decision
  // 01.10.2026): the panel stays compact. A successful confirmation closes it —
  // the panel then answers "Confirmed target"; a withdrawal keeps it open on
  // the form, where the next decision is made.
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [lockedBefore, setLockedBefore] = useState(locked);
  if (lockedBefore !== locked) {
    setLockedBefore(locked);
    if (locked) setSignOffOpen(false);
  }
  const hintId = useId();

  // "Confirm target" asks first (owner 02.10.2026). `confirming` holds the
  // box's write while it runs, so a second click is not a second write.
  const [askOpen, setAskOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [askRefusal, setAskRefusal] = useState<string | null>(null);
  const confirmingRef = useRef(false);
  const closeAsk = () => {
    if (confirmingRef.current) return;
    setAskOpen(false);
    setAskRefusal(null);
  };
  const confirmAsked = async () => {
    if (!confirmTarget || confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirming(true);
    setAskRefusal(null);
    try {
      await confirmTarget.onConfirm();
      setAskOpen(false);
    } catch (err: unknown) {
      setAskRefusal(err instanceof Error ? err.message : 'The confirmation was refused.');
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  };
  const onConfirmButton = () => {
    if (!locked && confirmTarget) {
      setAskRefusal(null);
      setAskOpen(true);
    } else {
      setSignOffOpen(true);
    }
  };

  /* ---------------- full screen ---------------- */
  // The editor's mechanism (`components/process-map/BpmnEditor.tsx`): the
  // browser's own full screen holds the canvas card; where the browser refuses
  // element full screen, the same card covers the window. The toggle and
  // Escape leave it, and the focus stays inside while it is open.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fullToggleRef = useRef<HTMLButtonElement | null>(null);
  const [browserFull, setBrowserFull] = useState(false);
  const [overlayFull, setOverlayFull] = useState(false);
  const filled = browserFull || overlayFull;
  // Entering full screen fits the drawing to the window — width and height,
  // centred, up to the largest step; leaving it brings back the reader's own
  // zoom (owner review 02.10.2026: at 120 % the lower half stayed empty).
  const [filledSeen, setFilledSeen] = useState(filled);
  const [zoomBeforeFull, setZoomBeforeFull] = useState<number | 'fit'>('fit');
  if (filledSeen !== filled) {
    setFilledSeen(filled);
    setFullDetail(false);
    if (filled) {
      setZoomBeforeFull(zoomChoice);
      setZoom('fit');
    } else {
      setZoom(zoomBeforeFull);
    }
  }
  const zoom =
    zoomChoice !== 'fit'
      ? zoomChoice
      : filled && canvasBox.drawing > 0 && canvasBox.height > 0
        ? fitArchitectureToBox(canvasBox.width, canvasBox.height, canvasBox.drawing)
        : fitArchitectureScale(canvasBox.width);
  useEffect(() => {
    const onChange = () => setBrowserFull(stageRef.current !== null && document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (overlayFull) {
      setOverlayFull(false);
      return;
    }
    const root = stageRef.current;
    if (root && typeof root.requestFullscreen === 'function') {
      root.requestFullscreen().catch(() => setOverlayFull(true));
    } else {
      setOverlayFull(true);
    }
  }, [overlayFull]);
  useEffect(() => {
    if (!filled) return undefined;
    const html = document.documentElement;
    const was = html.style.overflow;
    if (overlayFull) html.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      const root = stageRef.current;
      if (!root) return;
      // A dialog over full screen, or the evidence drawer, has Escape first.
      if (event.key === 'Escape' && !event.defaultPrevented && !ccModalOpen()) {
        // The browser leaves its own full screen on Escape itself; this is for
        // the overlay, and for a browser that hands the key to the page.
        event.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        setOverlayFull(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"], a[href]')].filter(
        (el) => el.getClientRects().length > 0,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = was;
      document.removeEventListener('keydown', onKey);
    };
  }, [filled, overlayFull]);
  // Leaving full screen hands the focus back to the toggle that opened it.
  const wasFilled = useRef(false);
  useEffect(() => {
    if (wasFilled.current && !filled) {
      const active = document.activeElement;
      if (!active || active === document.body || stageRef.current?.contains(active)) fullToggleRef.current?.focus();
    }
    wasFilled.current = filled;
  }, [filled]);

  /* ---------------- panning ---------------- */
  // Wider than its column, the drawing pans: drag it, scroll it, or focus it
  // and use the arrow keys. A drag that moved does not count as a click on a box.
  const pan = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const onPanDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const el = event.currentTarget;
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
    pan.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
  };
  const onPanMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (!p) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < 5) return;
    p.moved = true;
    event.currentTarget.scrollLeft = p.left - dx;
    event.currentTarget.scrollTop = p.top - dy;
  };
  const onPanEnd = () => {
    // The click that ends a drag still has to see `moved`; it clears it.
    if (pan.current && !pan.current.moved) pan.current = null;
  };
  const onPanClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (pan.current?.moved) {
      event.preventDefault();
      event.stopPropagation();
    }
    pan.current = null;
  };

  /* ---------------- touch ---------------- */
  // The process map's gesture model (`useTouchViewport`): inline a sideways
  // swipe pans the drawing and a vertical one scrolls the page; in full screen
  // one finger pans every way; two fingers pinch within the zoom range; a
  // double tap fits. Only where the drawing is drawn wide (≥ 720 px) — the
  // phone form reflows and has no scale.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 720px)');
    const read = () => setWide(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);
  // Several moves of one pinch arrive before React renders the first.
  const liveZoom = useRef(zoom);
  useEffect(() => {
    liveZoom.current = zoom;
  }, [zoom]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    canvasRef.current = canvasEl;
  }, [canvasEl]);
  useTouchViewport(
    canvasRef,
    {
      pan: (dx, dy) => {
        const el = canvasRef.current;
        if (!el) return;
        el.scrollLeft -= dx;
        el.scrollTop -= dy;
      },
      zoom: (factor, x, y) => {
        const el = canvasRef.current;
        if (!el) return;
        const was = liveZoom.current;
        const next = Math.min(ARCHITECTURE_ZOOM.max, Math.max(ARCHITECTURE_ZOOM.min, was * factor));
        if (Math.abs(next - was) < 0.001) return;
        liveZoom.current = next;
        // Keep the point between the fingers where it is.
        const ratio = next / was;
        const left = (el.scrollLeft + x) * ratio - x;
        const top = (el.scrollTop + y) * ratio - y;
        setZoom(next);
        requestAnimationFrame(() => {
          el.scrollLeft = left;
          el.scrollTop = top;
        });
      },
      fit: () => setZoom('fit'),
    },
    { free: filled, enabled: wide && view === 'canvas', ignoreDoubleTap: '[data-canvas-box]', rebind: canvasEl },
  );

  const select = (key: string) => {
    setSelected(key);
    setPanelTab('evidence');
    // The side panel is outside full screen; there the evidence opens over the drawing.
    if (filled) setFullDetail(true);
  };

  const chosenAlt = contract?.alternatives.find((a) => a.verdict === 'chosen') ?? null;
  // One story: the card names what the contract — and so the canvas, the route
  // figure and the alternatives — says. A stored value that disagrees is named
  // below it as what it is.
  const answer = designAnswer({
    evidence: evidence.state,
    route: contract
      ? { recommended: contract.route.recommended, chosen: contract.route.chosen, deviation: Boolean(contract.route.deviation) }
      : null,
    stored: storedRoute,
  });
  const answerLabel = answer.code ? architectureOptionLabel(answer.code) ?? answer.code : null;
  const answerHeading = confirmed
    ? 'Confirmed target'
    : answer.kind === 'chosen'
      ? 'Chosen'
      : answer.kind === 'stored'
        ? storedRoute?.source === 'run'
          ? 'Recorded with the analysis'
          : 'Your route setting'
        : 'Recommended';
  const storedNote = !confirmed && answer.storedDiffers
    ? answer.storedDiffers.source === 'setting'
      ? `Your route setting is ${architectureOptionLabel(answer.storedDiffers.code) ?? answer.storedDiffers.code}. The analysis of this code recommends the route above.`
      : `The analysis run on record recommended ${architectureOptionLabel(answer.storedDiffers.code) ?? answer.storedDiffers.code}. The code analysed now leads to the route above; run the analysis again to bring the record up to date.`
    : null;
  const routeKpi = model?.route === 'in-app-rap' ? 'In-app · RAP' : model?.route === 'side-by-side-cap' ? 'Side-by-side · CAP' : 'Not determined';
  const fieldOf = (k: string) => contract?.fields.find((f) => f.key === k) ?? null;
  const prov = (k: string, fallback: ProvenanceValue): ProvenanceValue => fieldOf(k)?.provenance ?? fallback;

  /* ---------------- the canvas ---------------- */
  const description = model
    ? `${model.route === 'in-app-rap' ? 'An in-app RAP object on the stack' : 'A side-by-side CAP service'} reaches S/4HANA through ${model.successors.length} released APIs and CDS views; ${model.gaps.length} objects have no released successor; ${model.customTables.length} custom tables are used.`
    : 'The target architecture could not be drawn.';

  let board: React.ReactNode;
  if (evidence.state === 'loading') {
    board = <CcSkeleton shape="cards" label="the target architecture" />;
  } else if (evidence.state === 'absent') {
    board = (
      <p data-design-canvas-absent="" className="m-0 rounded-cc-row border border-dashed border-cc-field-border p-4 text-[13px] text-cc-ink-muted">
        <CcProvenanceChip value="not-determined" /> {evidence.reason}
      </p>
    );
  } else if (!contract || !model) {
    board = (
      <p data-design-canvas-absent="" className="m-0 rounded-cc-row border border-dashed border-cc-field-border p-4 text-[13px] text-cc-ink-muted">
        <CcProvenanceChip value="not-determined" />{' '}
        {evidence.contractSentence ?? 'There is no architecture contract for this project, so there is no route to draw.'}
      </p>
    );
  } else {
    board = (
      <>
        {evidence.findingsUnread ? (
          <p className="m-0 mb-3 text-[12px] text-cc-ink-muted">{evidence.findingsUnread}</p>
        ) : null}
        {view === 'list' ? (
          <ArchitectureList model={model} targetLine={targetLine} description={description} />
        ) : (
          // The drawing never grows past its natural size, so its labels stay
          // in the type scale: a wider column leaves the space empty, a
          // narrower one shrinks it to 0.8 and then pans (owner 02.10.2026 —
          // at 3400 px the labels had grown to 34 px).
          <div
            ref={setCanvasEl}
            data-canvas-zoom={zoom.toFixed(2)}
            data-canvas-scroll=""
            // Focusable so a keyboard can pan it with the arrow keys.
            tabIndex={0}
            role="region"
            aria-label="Target architecture drawing — drag or scroll to pan"
            onPointerDown={onPanDown}
            onPointerMove={onPanMove}
            onPointerUp={onPanEnd}
            onPointerCancel={onPanEnd}
            onClickCapture={onPanClickCapture}
            className={cn(
              'overflow-auto rounded-cc-row',
              // In full screen a flex box, so the drawing centres both ways
              // (`m-auto`) and still scrolls from its edge when it is larger.
              filled && 'flex min-h-0 flex-1',
            )}
          >
            <div className={filled ? 'm-auto' : undefined}>
              <ArchitectureCanvas model={model} targetLine={targetLine} selected={selected} onSelect={select} description={description} zoom={zoom} />
            </div>
          </div>
        )}
      </>
    );
  }

  /* ---------------- the panel ---------------- */
  const numbered: { n: number; key: string; text: string; chip: ProvenanceValue }[] = model
    ? [
        {
          n: 1,
          key: 'runtime',
          text: model.route === 'in-app-rap' ? 'RAP object — runtime stipulated' : 'CAP service — runtime stipulated',
          chip: prov('runtime', 'reconstructed'),
        },
        { n: 2, key: 'group:successors', text: `${model.successors.length} released APIs and views`, chip: prov('apis', 'not-determined') },
        { n: 3, key: 'group:gaps', text: `${model.gaps.length} objects without successor`, chip: 'not-determined' },
        {
          n: 4,
          key: 'group:tables',
          text: 'Where custom tables live',
          chip: model.route === 'in-app-rap' ? 'reconstructed' : 'not-determined',
        },
      ]
    : [];

  const signOffText = confirmed
    ? null
    : stale
      ? 'Not confirmed. The design or its sign-off belongs to an earlier source, so nothing is confirmed for the code under review.'
      : canSignOff
        ? signOffWording?.open ??
          'Not confirmed. Review the design, then confirm or change the target — a self-declaration of your account, not an organisational mandate.'
        : hasDocument
          ? 'Not confirmed. This design document has no sign-off section; regenerate it, then confirm — a self-declaration of your account, not an organisational mandate.'
          : 'Not confirmed. Generate the design document to review and confirm it.';

  const decisionTab = (
    <div className="flex flex-col gap-4">
      <section
        data-design-answer={confirmed ? 'confirmed' : answer.kind}
        data-design-answer-code={confirmed ? undefined : answer.code ?? undefined}
        aria-labelledby="design-answer"
        className="rounded-cc-card border p-3"
        style={{
          background:
            model?.route === 'in-app-rap'
              ? 'var(--cc-brand-surface)'
              : 'color-mix(in srgb, var(--cc-chart-4) 6%, var(--cc-surface))',
          borderColor:
            model?.route === 'in-app-rap'
              ? 'var(--cc-brand-strong)'
              : 'color-mix(in srgb, var(--cc-chart-4) 30%, var(--cc-surface))',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={LABEL} style={{ color: model?.route === 'in-app-rap' ? 'var(--cc-brand-deep)' : 'var(--cc-chart-4)' }}>
            {answerHeading}
          </p>
          {answer.kind === 'loading' && !confirmed ? null : (
            <CcProvenanceChip value={confirmed ? 'confirmed' : answer.kind === 'stored' ? 'not-determined' : 'reconstructed'} />
          )}
        </div>
        <h2 id="design-answer" className="m-0 mt-1 text-[22px] leading-tight font-extrabold tracking-[-0.01em] text-cc-ink">
          {confirmed ? confirmed.label : answer.kind === 'loading' ? 'Reading the route…' : answerLabel ?? 'Target not determined'}
        </h2>
        {confirmed ? (
          <p className="m-0 mt-2 text-[13px] text-cc-ink">
            Confirmed{confirmed.by ? <> by {confirmed.by}</> : null}
            {confirmed.at ? <> on <CcDateText value={confirmed.at} format="text" /></> : null}.{' '}
            {signOffWording?.confirmed ?? 'A self-declaration by the signed-in account, not an organisational mandate.'}
          </p>
        ) : (
          <p className="m-0 mt-2 text-[13px] text-cc-ink">
            {chosenAlt?.reason ??
              (answer.kind === 'loading'
                ? 'The route is derived from the code on the server.'
                : answer.kind === 'stored'
                  ? 'There is no architecture contract for this code, so this is the value stored on the project, not a recommendation derived from the code. Not confirmed yet.'
                  : answerLabel
                    ? 'Recommended from the analysis of the code. Not confirmed yet.'
                    : 'The analysis on record recommends no target architecture. Run the analysis, then generate the design.')}
          </p>
        )}
        {storedNote ? (
          <p data-design-stored-route={answer.storedDiffers?.source} className="m-0 mt-2 text-[12px] text-cc-ink-muted">
            {storedNote}
          </p>
        ) : null}
        {chosenAlt && !confirmed ? (
          <div className="mt-2">
            <Anchors lines={linesOf(chosenAlt.citations)} />
          </div>
        ) : null}
        {typeof confidence === 'number' && !confirmed ? (
          <p className="m-0 mt-2 text-[12px] text-cc-ink-muted">Confidence {confidence} — the router’s, not a proof.</p>
        ) : null}
      </section>

      {numbered.length ? (
        <div>
          <p className={cn(LABEL, 'mb-1')}>Numbered on the canvas</p>
          <ul className="m-0 list-none p-0">
            {numbered.map((row, i) => (
              <li key={row.n} className={cn('py-1', i > 0 && 'border-t border-cc-line')}>
                <button
                  type="button"
                  data-canvas-legend={row.key}
                  onClick={() => select(row.key)}
                  className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-cc-row py-1 text-left text-[13px] text-cc-ink hover:underline"
                >
                  <PinMark n={row.n} />
                  <span>{row.text}</span>
                  <CcProvenanceChip value={row.chip} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {contract ? (
        <div>
          <p className={cn(LABEL, 'mb-1')}>Alternatives at a glance</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {contract.alternatives.map((a) => (
              <li
                key={a.id}
                data-design-alternative={a.id}
                data-verdict={a.verdict}
                className="flex items-center gap-3 rounded-cc-row border px-3 py-2 text-[13px]"
                style={
                  a.verdict === 'chosen'
                    ? {
                        borderColor: 'color-mix(in srgb, var(--cc-chart-4) 45%, var(--cc-surface))',
                        background: 'color-mix(in srgb, var(--cc-chart-4) 6%, var(--cc-surface))',
                      }
                    : { borderColor: 'var(--cc-line)' }
                }
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full',
                    a.verdict === 'rejected' ? 'bg-cc-error-bg text-cc-error' : 'bg-cc-surface-muted text-cc-ink-muted',
                  )}
                  style={a.verdict === 'chosen' ? { color: 'var(--cc-chart-4)', background: 'color-mix(in srgb, var(--cc-chart-4) 14%, var(--cc-surface))' } : undefined}
                >
                  {a.verdict === 'chosen' ? <Target size={14} /> : a.verdict === 'rejected' ? <X size={14} /> : <CircleDashed size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block font-semibold text-cc-ink">{SHORT[a.id] ?? a.label}</b>
                  <span className="block text-[12px] text-cc-ink-muted">{verdictText(a, deviation)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div id="architect-sign-off" data-design-signoff={locked ? 'locked' : 'open'} className="scroll-mt-24">
        <p className={cn(LABEL, 'mb-1')}>Sign-off</p>
        {signOffText ? (
          <p className="m-0 text-[13px] text-cc-ink">{signOffText}</p>
        ) : (
          <p className="m-0 text-[13px] text-cc-ink">
            {signOffWording
              ? `Confirmed — ${signOffWording.confirmed.charAt(0).toLowerCase()}${signOffWording.confirmed.slice(1)} Change it with “Change target”.`
              : 'Confirmed — a self-declaration of your account, not an organisational mandate. Change it with “Change target”.'}
          </p>
        )}
      </div>
    </div>
  );

  const contractTab = contract ? (
    <ul className="m-0 flex list-none flex-col gap-3 p-0" data-design-contract-fields={contract.fields.length}>
      {contract.fields.map((f) => (
        <li key={f.key} className="border-b border-cc-line pb-3 last:border-b-0">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <b className="text-[13px] font-semibold text-cc-ink">{f.label}</b>
            <CcProvenanceChip value={f.provenance} />
          </div>
          <FieldText f={f} clampLines />
        </li>
      ))}
    </ul>
  ) : (
    <p className="m-0 text-[13px] text-cc-ink-muted">No architecture contract to show.</p>
  );

  const alternativesTab = contract ? (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {contract.alternatives.map((a) => (
        <li key={a.id} className="border-b border-cc-line pb-3 last:border-b-0">
          <b className="block text-[13px] font-semibold text-cc-ink">{a.label}</b>
          <span className="block text-[12px] font-semibold text-cc-ink-muted">{verdictText(a, deviation)}</span>
          <p className="m-0 mt-1 text-[13px] text-cc-ink">{a.reason}</p>
          <div className="mt-1">
            <Anchors lines={linesOf(a.citations)} />
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="m-0 text-[13px] text-cc-ink-muted">No architecture contract to show.</p>
  );

  const evidenceRows =
    model && selected && evidence.state === 'ready'
      ? findingIdsOfKey(model, selected)
          .map((id) => evidence.findings.find((f) => f.id === id))
          .filter((f): f is NonNullable<typeof f> => Boolean(f))
      : [];
  const evidenceTab = !selected || !model ? (
    <p className="m-0 text-[13px] text-cc-ink-muted" data-design-evidence="none">
      Click a box on the canvas, or a numbered row under Decision, to see the findings and source lines it stands for.
    </p>
  ) : (
    <div className="flex flex-col gap-3" data-design-evidence={selected}>
      <p className="m-0 text-[15px] font-bold text-cc-ink">{titleOfKey(model, selected)}</p>
      {evidenceRows.length ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {evidenceRows.slice(0, 20).map((f) => (
              <li key={f.id} className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-2 text-[13px] text-cc-ink">
                <CcAnchor label={`Finding ${f.id}`}>{f.id}</CcAnchor>
                <CcAnchor label={`Source line ${f.lineStart}`}>L{f.lineStart}</CcAnchor>
                <span className="min-w-0">
                  {f.title}
                  {f.successor && f.successor !== selected.replace(/^successor:/, '') ? (
                    <span className="block font-cc-mono text-[12px] break-all text-cc-ink-muted">→ {f.successor}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {evidenceRows.length > 20 ? (
            <p className="m-0 text-[12px] text-cc-ink-muted">+ {evidenceRows.length - 20} more findings</p>
          ) : null}
          <SourceLines
            code={legacyCode}
            lines={[...new Set(evidenceRows.map((f) => f.lineStart))].sort((a, b) => a - b)}
            label={`Source lines of ${titleOfKey(model, selected)}`}
          />
        </>
      ) : (
        <p className="m-0 text-[13px] text-cc-ink-muted">
          {selected === 'runtime'
            ? 'The runtime is stipulated by the route — a rule of this platform, not a finding. No construct of the code is cited for it.'
            : 'No finding of this run stands behind this box.'}
        </p>
      )}
      {selected === 'runtime' && model.runtime ? <p className="m-0 text-[13px] text-cc-ink-muted">{model.runtime}</p> : null}
    </div>
  );

  /* ---------------- the drawer ---------------- */
  const written = sections.filter((s) => s.written).length;
  const cardSections = [...sections.filter((s) => s.written), ...sections.filter((s) => !s.written)].slice(
    0,
    Math.max(4, written),
  );
  const restUnwritten = sections.filter((s) => !s.written && !cardSections.includes(s));

  const documentTab = documentFallback ? (
    <div>{documentFallback}</div>
  ) : (
    <div data-stage-output="solutionDesign" id="design-report">
      {documentNotice ? <div className="mb-4">{documentNotice}</div> : null}
      <div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2 min-[1100px]:grid-cols-4">
        {cardSections.map((s) =>
          s.written ? (
            <button
              key={s.key}
              type="button"
              data-design-section={s.key}
              aria-pressed={activeSection?.key === s.key}
              onClick={() => setSection(s.key)}
              className={cn(
                'flex min-w-0 cursor-pointer flex-col gap-2 rounded-cc-card border p-4 text-left',
                activeSection?.key === s.key ? 'border-cc-information shadow-cc' : 'border-cc-line hover:border-cc-field-border',
              )}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[14px] font-bold text-cc-ink">{s.title}</b>
                <CcProvenanceChip value="proposed" />
              </span>
              {s.excerpt ? <span className="line-clamp-3 text-[14px] font-semibold text-cc-ink">{s.excerpt}</span> : null}
              {s.meta ? <span className="text-[12px] text-cc-ink-muted">{s.meta}</span> : null}
            </button>
          ) : (
            <article
              key={s.key}
              data-design-section={s.key}
              data-written="false"
              className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-dashed border-cc-field-border bg-cc-surface p-4"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[14px] font-bold text-cc-ink">{s.title}</b>
                <span className="text-[12px] text-cc-ink-muted">not written</span>
              </span>
              <span className="text-[13px] text-cc-ink-muted">Regenerate to have the model write this section against the contract.</span>
            </article>
          ),
        )}
      </div>
      {restUnwritten.length ? (
        <p className="m-0 mt-3 text-[12px] text-cc-ink-muted">
          + {restUnwritten.length} more section{restUnwritten.length === 1 ? '' : 's'} not written:{' '}
          {restUnwritten.map((s) => s.title).join(' · ')}
        </p>
      ) : null}
      {activeSection?.content ? (
        <section aria-label={activeSection.title} data-design-section-body={activeSection.key} className="mt-6 min-w-0">
          {activeSection.content}
        </section>
      ) : null}
    </div>
  );

  const drawerContract = contract ? (
    <div className="flex flex-col gap-3">
      <p className="m-0 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-cc-ink">
        {contract.contractId} · {contract.status === 'confirmed' ? 'confirmed' : contract.status === 'superseded' ? 'superseded' : 'draft'}
        <span className="font-normal text-cc-ink-muted">— {contract.summary}</span>
      </p>
      <div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2 min-[1100px]:grid-cols-3">
        {contract.fields.map((f) => (
          <article key={f.key} data-contract-field={f.key} className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-4">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-[14px] font-bold text-cc-ink">{f.label}</b>
              <CcProvenanceChip value={f.provenance} />
            </span>
            <FieldText f={f} />
            <Anchors lines={linesOf(f.citations)} />
            {f.limits.map((l, i) => (
              <p
                key={`${l.code}-${i}`}
                className={cn(
                  'm-0 rounded-cc-row border-l-4 px-3 py-1 text-[12px]',
                  l.severity === 'blocks' ? 'border-cc-error bg-cc-error-bg text-cc-ink' : 'border-cc-warning-line bg-cc-warning-bg text-cc-ink',
                )}
              >
                <b>{l.severity === 'blocks' ? 'Blocks' : 'Qualifies'}:</b> {l.sentence}
              </p>
            ))}
          </article>
        ))}
      </div>
    </div>
  ) : (
    <p className="m-0 text-[13px] text-cc-ink-muted">No architecture contract to show.</p>
  );

  const drawerAlternatives = (
    <div className="flex flex-col gap-4">
      {contract ? (
        <div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2 min-[1100px]:grid-cols-4">
          {contract.alternatives.map((a) => (
            <article
              key={a.id}
              className="flex min-w-0 flex-col gap-2 rounded-cc-card border bg-cc-surface p-4"
              style={{ borderColor: a.verdict === 'chosen' ? 'color-mix(in srgb, var(--cc-chart-4) 45%, var(--cc-surface))' : 'var(--cc-line)' }}
            >
              <b className="text-[14px] font-bold text-cc-ink">{SHORT[a.id] ?? a.label}</b>
              <span className="text-[12px] font-semibold text-cc-ink-muted">{verdictText(a, deviation)}</span>
              <p className="m-0 text-[13px] text-cc-ink">{a.reason}</p>
              <Anchors lines={linesOf(a.citations)} />
            </article>
          ))}
        </div>
      ) : (
        <p className="m-0 text-[13px] text-cc-ink-muted">No architecture contract to show.</p>
      )}
      {routingRationale}
    </div>
  );

  const preconditions = fieldOf('preconditions');
  const assumptionCount = preconditions?.citations.length ?? 0;
  const limits = contract
    ? contract.fields.flatMap((f) => f.limits.map((l) => ({ ...l, field: f.label })))
    : [];
  const drawerAssumptions = (
    <div className="flex flex-col gap-3">
      {preconditions ? (
        <div className="rounded-cc-card border border-cc-line bg-cc-surface p-4">
          <span className="mb-2 flex flex-wrap items-center gap-2">
            <b className="text-[14px] font-bold text-cc-ink">What the route assumes</b>
            <CcProvenanceChip value={preconditions.provenance} />
          </span>
          <FieldText f={preconditions} />
        </div>
      ) : null}
      {limits.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {limits.map((l, i) => (
            <li key={`${l.code}-${i}`} className="text-[13px] text-cc-ink">
              <b>{l.field}:</b> {l.sentence}
            </li>
          ))}
        </ul>
      ) : null}
      {!preconditions && !limits.length ? <p className="m-0 text-[13px] text-cc-ink-muted">No architecture contract to show.</p> : null}
    </div>
  );

  const successorsKpi = model ? `${model.successors.length} · ${model.successorUses} uses` : '—';

  return (
    <div data-design-canvas-stage="" className="overflow-clip rounded-cc-card border border-cc-line bg-cc-surface shadow-cc">
      <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_420px]">
        {/* The stage */}
        <section aria-label="Target architecture canvas" className="relative flex min-w-0 flex-col bg-cc-surface-muted">
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full max-[719px]:hidden">
            <defs>
              <pattern id={`dots-${hintId.replace(/[^a-zA-Z0-9]/g, '')}`} width="18" height="18" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="var(--cc-mesh-grid)" opacity="0.45" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#dots-${hintId.replace(/[^a-zA-Z0-9]/g, '')})`} />
          </svg>
          <div className="relative flex flex-col gap-4 p-3 min-[720px]:px-7 min-[720px]:pt-4 min-[720px]:pb-6 min-[1100px]:sticky min-[1100px]:top-0">
            <div className="grid grid-cols-2 gap-2 min-[720px]:flex min-[720px]:flex-wrap min-[720px]:gap-3">
              <Kpi
                icon={<Cloud size={16} />}
                tint="--cc-chart-4"
                label="Route"
                value={routeKpi}
                extra={
                  model ? (
                    <>
                      <CcProvenanceChip value="reconstructed" />
                      {typeof confidence === 'number' ? <span>confidence {confidence}</span> : null}
                    </>
                  ) : null
                }
              />
              <Kpi icon={<Target size={16} />} tint="--cc-neutral" label="Target context" value={targetKpi.value} extra={targetKpi.sub} />
              <Kpi icon={<Link2 size={16} />} tint="--cc-seq-4" label="Released successors" value={successorsKpi} />
              <Kpi icon={<User size={16} />} tint="--cc-neutral" label="Sign-off" value={confirmed ? 'Confirmed' : 'Not confirmed'} />
            </div>

            {/* The canvas card. Full screen is this card filling the window —
                the element the Fullscreen API shows or, where the browser
                refuses, the same card laid over the page (the BPMN editor's
                mechanism, `components/process-map/BpmnEditor.tsx`). */}
            <div
              ref={stageRef}
              data-canvas-card=""
              data-canvas-fullscreen={filled ? (browserFull ? 'browser' : 'overlay') : 'false'}
              className={
                filled ? 'cc-canvas-fullscreen' : 'rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc min-[720px]:p-4'
              }
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 flex flex-wrap items-center gap-2 text-[15px] font-bold text-cc-ink">
                  Target architecture
                  {contract ? <CcProvenanceChip value="reconstructed" note={`from contract ${contract.contractId}`} /> : null}
                </h2>
                {view === 'canvas' && model ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span id={hintId} className="text-[12px] text-cc-ink-muted">
                      click a box to see its evidence
                    </span>
                    {/* The controls sit on the drawing they act on, so they
                        are in reach in full screen too. The phone form is
                        HTML that reflows and has no scale. */}
                    <div role="toolbar" aria-label="Canvas view" data-canvas-controls="" className="flex items-center gap-1 max-[719px]:hidden">
                      <CcIconButton
                        label="Zoom out"
                        title="Zoom out"
                        data-canvas-zoom-out=""
                        onClick={() => setZoom(Math.max(ARCHITECTURE_ZOOM.min, zoom - ARCHITECTURE_ZOOM.step))}
                        disabled={zoom <= ARCHITECTURE_ZOOM.min + 0.001}
                      >
                        <Minus size={16} aria-hidden={true} />
                      </CcIconButton>
                      <span data-canvas-zoom-value="" aria-live="polite" className="min-w-11 text-center text-[12px] font-semibold text-cc-ink-muted tabular-nums">
                        {Math.round(zoom * 100)}%
                      </span>
                      <CcIconButton
                        label="Zoom in"
                        title="Zoom in"
                        data-canvas-zoom-in=""
                        onClick={() => setZoom(Math.min(ARCHITECTURE_ZOOM.max, zoom + ARCHITECTURE_ZOOM.step))}
                        disabled={zoom >= ARCHITECTURE_ZOOM.max - 0.001}
                      >
                        <Plus size={16} aria-hidden={true} />
                      </CcIconButton>
                      <CcIconButton label="Fit to the width" title="Fit to the width" data-canvas-fit="" onClick={() => setZoom('fit')}>
                        <Scan size={16} aria-hidden={true} />
                      </CcIconButton>
                      <CcIconButton
                        ref={fullToggleRef}
                        label={filled ? 'Exit full screen' : 'Full screen'}
                        title={filled ? 'Exit full screen (Esc)' : 'Full screen'}
                        aria-pressed={filled}
                        data-canvas-fullscreen-toggle=""
                        onClick={toggleFull}
                      >
                        {filled ? <Minimize2 size={16} aria-hidden={true} /> : <Maximize2 size={16} aria-hidden={true} />}
                      </CcIconButton>
                    </div>
                  </div>
                ) : null}
              </div>
              {board}
              <CcCanvasDrawer
                open={filled && fullDetail && selected !== null}
                title="Evidence"
                onClose={() => setFullDetail(false)}
                data-design-fullscreen-evidence=""
              >
                {evidenceTab}
              </CcCanvasDrawer>
              {view === 'canvas' && model ? (
                <div
                  aria-label="Legend"
                  role="note"
                  className="mt-3 flex flex-wrap gap-3 text-[12px] text-cc-ink-muted max-[719px]:hidden"
                >
                  <Swatch bg="color-mix(in srgb, var(--cc-chart-2) 8%, var(--cc-surface))" border="color-mix(in srgb, var(--cc-chart-2) 40%, var(--cc-surface))">OData API</Swatch>
                  <Swatch bg="color-mix(in srgb, var(--cc-chart-3) 7%, var(--cc-surface))" border="color-mix(in srgb, var(--cc-chart-3) 45%, var(--cc-surface))">CDS view</Swatch>
                  <Swatch bg="var(--cc-surface)" border="var(--cc-error)">write</Swatch>
                  <Swatch bg="var(--cc-surface)" border="var(--cc-ink-muted)" dashed>not determined</Swatch>
                  <Swatch bg="var(--cc-surface)" border="var(--cc-brand-strong)" dashed>clean core boundary</Swatch>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* The side panel */}
        <aside
          aria-label="Decision"
          data-design-panel=""
          className="flex min-w-0 flex-col border-t border-cc-line bg-cc-surface min-[1100px]:border-t-0 min-[1100px]:border-l"
        >
          <div className="px-4 pt-4 min-[720px]:px-5">
            <p className={LABEL}>Decision</p>
            <p className="m-0 mt-px text-[15px] font-bold text-cc-ink">Where should this code run?</p>
          </div>
          <div className="flex-1 px-4 pt-2 pb-4 min-[720px]:px-5">
            <CcTabs
              label="Decision"
              value={panelTab}
              onChange={setPanelTab}
              density="cozy"
              tabs={[
                { value: 'decision', label: 'Decision', content: decisionTab },
                { value: 'contract', label: 'Contract', count: contract?.fields.length, content: contractTab },
                { value: 'alternatives', label: 'Alternatives', count: contract?.alternatives.length, content: alternativesTab },
                { value: 'evidence', label: 'Evidence', content: evidenceTab },
              ]}
            />
          </div>
          {/* The actions stay in reach: beside a canvas taller than the window
              the footer sticks to the window's bottom edge. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-cc-line bg-cc-surface px-4 py-3 min-[720px]:px-5 min-[1100px]:sticky min-[1100px]:bottom-0">
            <CcButton
              variant={canSignOff ? 'secondary' : 'primary'}
              icon={<RefreshCw size={16} aria-hidden={true} />}
              busy={regenerating}
              disabled={regenerateDisabled}
              onClick={onRegenerate}
            >
              {hasDocument ? 'Regenerate design' : 'Generate design'}
            </CcButton>
            <CcButton
              variant={canSignOff && !locked ? 'primary' : 'ghost'}
              disabled={!canSignOff}
              data-design-confirm=""
              aria-haspopup="dialog"
              onClick={onConfirmButton}
            >
              {locked ? 'Change target' : 'Confirm target'}
            </CcButton>
          </div>
        </aside>
      </div>

      <CcDialog
        open={signOffOpen && Boolean(signOffPanel)}
        onClose={() => setSignOffOpen(false)}
        title={locked ? 'Target architecture sign-off' : 'Confirm the target architecture'}
        lead={signOffWording?.dialogLead ?? 'A self-declaration by the signed-in account, bound to the run this page shows — not an organisational mandate.'}
        size="wide"
        data-design-signoff-dialog=""
      >
        {signOffPanel}
      </CcDialog>

      {/* The question before the decision (owner 02.10.2026). Cancel, Escape
          and the scrim leave without writing; only its own button confirms. */}
      {confirmTarget ? (
        <CcMessageBox
          open={askOpen}
          title="Confirm the target?"
          confirmLabel={confirming ? 'Confirming…' : 'Confirm target'}
          onConfirm={() => void confirmAsked()}
          onCancel={closeAsk}
        >
          <div data-design-confirm-ask="" className="flex flex-col gap-2">
            <p className="m-0">
              You confirm <b>{confirmTarget.label}</b> as the target architecture for this code.
            </p>
            <p className="m-0 text-cc-ink-muted">
              {signOffWording?.dialogLead ?? 'A self-declaration by the signed-in account, bound to the run this page shows — not an organisational mandate.'}
            </p>
            {askRefusal ? (
              <p data-signoff-refusal="" role="alert" className="m-0 rounded-cc-row border-l-4 border-cc-error bg-cc-error-bg px-3 py-2 text-cc-ink">
                {askRefusal}
              </p>
            ) : null}
            {signOffPanel && confirmTarget.chooseOther ? (
              <p className="m-0">
                <button
                  type="button"
                  data-design-confirm-other=""
                  disabled={confirming}
                  onClick={() => {
                    setAskOpen(false);
                    setAskRefusal(null);
                    setSignOffOpen(true);
                  }}
                  className="cursor-pointer rounded-cc-row text-[13px] font-semibold text-cc-information underline-offset-2 hover:underline disabled:cursor-not-allowed"
                >
                  Choose another target…
                </button>
              </p>
            ) : null}
          </div>
        </CcMessageBox>
      ) : null}

      {/* The drawer */}
      <section aria-label="Design document and contract" data-design-drawer="" className="border-t border-cc-line bg-cc-surface px-4 pt-2 pb-6 min-[720px]:px-6">
        <CcTabs
          label="Design document and contract"
          density="cozy"
          tabs={[
            { value: 'document', label: `Design document${hasDocument ? ` (${written} of ${sections.length})` : ''}`, content: documentTab },
            { value: 'contract', label: `Contract ${contract?.contractId ?? ''}${contract ? ` (${contract.fields.length} fields)` : ''}`.trim(), content: drawerContract },
            { value: 'alternatives', label: 'Alternatives', count: contract?.alternatives.length, content: drawerAlternatives },
            { value: 'assumptions', label: 'Assumptions', count: contract ? assumptionCount : undefined, content: drawerAssumptions },
          ]}
        />
      </section>
    </div>
  );
}

function Swatch({ bg, border, dashed, children }: { bg: string; border: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <i
        aria-hidden="true"
        className={cn('inline-block h-2.5 w-3 rounded-[3px] border', dashed && 'border-dashed')}
        style={{ background: bg, borderColor: border }}
      />
      {children}
    </span>
  );
}
