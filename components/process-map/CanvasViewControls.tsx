'use client';

import React from 'react';
import { Maximize2, Minimize2, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import CcIconButton from '@/components/cc/IconButton';
import { editorZoomLabel, wt } from '@/lib/workspace-messages';

/**
 * Zoom out, the zoom in per cent, zoom in, fit — and the full-screen toggle.
 * The editor's controls, drawn by the editor and by the reading map alike, so
 * the two canvases a reader meets are moved the same way (owner 02.10.2026:
 * "I need + - and full screen here too, like everywhere else").
 *
 * `scope` only names the `data-*` hooks (`data-editor-zoom-in`,
 * `data-map-zoom-in`, …): the specs of each canvas find their own buttons.
 */
type Scope = 'editor' | 'map';

const hook = (scope: Scope, name: string) => ({ [`data-${scope}-${name}`]: '' });

export function CanvasZoomControls({
  scope,
  zoom,
  onZoomBy,
  onFit,
}: {
  scope: Scope;
  /** The canvas's scale in per cent. */
  zoom: number;
  onZoomBy: (factor: number) => void;
  onFit: () => void;
}) {
  return (
    <>
      <CcIconButton {...hook(scope, 'zoom-out')} label={wt('editor.zoomOut')} onClick={() => onZoomBy(1 / 1.2)}>
        <ZoomOut size={16} aria-hidden={true} />
      </CcIconButton>
      <span
        {...hook(scope, 'zoom')}
        className="min-w-12 text-center text-[12px] font-semibold text-cc-ink-muted tabular-nums"
      >
        {editorZoomLabel(zoom)}
      </span>
      <CcIconButton {...hook(scope, 'zoom-in')} label={wt('editor.zoomIn')} onClick={() => onZoomBy(1.2)}>
        <ZoomIn size={16} aria-hidden={true} />
      </CcIconButton>
      <CcIconButton {...hook(scope, 'fit')} label={wt('editor.fit')} onClick={onFit}>
        <Scan size={16} aria-hidden={true} />
      </CcIconButton>
    </>
  );
}

export function CanvasFullscreenToggle({
  scope,
  filled,
  onToggle,
  buttonRef,
}: {
  scope: Scope;
  filled: boolean;
  onToggle: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <CcIconButton
      {...hook(scope, 'fullscreen-toggle')}
      ref={buttonRef}
      label={filled ? wt('editor.exitFullscreen') : wt('editor.fullscreen')}
      aria-pressed={filled}
      onClick={onToggle}
    >
      {filled ? <Minimize2 size={16} aria-hidden={true} /> : <Maximize2 size={16} aria-hidden={true} />}
    </CcIconButton>
  );
}

/**
 * The reading map's row: zoom and fit on the left, full screen on the right —
 * the editor's toolbar without the editing tools.
 */
export function MapViewTools({
  zoom,
  onZoomBy,
  onFit,
  filled,
  onToggleFullscreen,
  fullscreenRef,
}: {
  zoom: number;
  onZoomBy: (factor: number) => void;
  onFit: () => void;
  filled: boolean;
  onToggleFullscreen: () => void;
  fullscreenRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <div
      data-map-view-tools=""
      role="group"
      aria-label={wt('map.canvasTools')}
      className="flex shrink-0 flex-wrap items-center gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-2"
    >
      <CanvasZoomControls scope="map" zoom={zoom} onZoomBy={onZoomBy} onFit={onFit} />
      <span className="ml-auto" />
      <CanvasFullscreenToggle scope="map" filled={filled} onToggle={onToggleFullscreen} buttonRef={fullscreenRef} />
    </div>
  );
}
