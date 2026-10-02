'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Full screen for a bpmn-js canvas — the one mechanism the editor and the
 * reading map share (owner 02.10.2026: "+ - and full screen, like everywhere else").
 *
 * The browser's own full screen (Fullscreen API) holds `rootRef`. Where the
 * browser refuses or has none — an embedded page, an iPhone — the root covers
 * the window instead (`overlay`, `.cc-editor-fullscreen`), with the same
 * layout; the page behind does not scroll and Escape leaves it. A keystroke
 * inside `escapeInside` is left alone, because there Escape belongs to the
 * canvas (the editor ends a tool with it).
 *
 * When full screen ends and the focus has nowhere to be, it returns to the
 * button that opened it (`toggleRef`).
 */
export function useCanvasFullscreen({
  rootRef,
  escapeInside,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  escapeInside?: React.RefObject<HTMLElement | null>;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === rootRef.current && rootRef.current !== null);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [rootRef]);

  /** Full screen either way — what the layout reads. */
  const filled = fullscreen || overlay;

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (overlay) {
      setOverlay(false);
      return;
    }
    const root = rootRef.current;
    if (root && typeof root.requestFullscreen === 'function') {
      root.requestFullscreen().catch(() => setOverlay(true));
    } else {
      setOverlay(true);
    }
  }, [overlay, rootRef]);

  /** Leave full screen, resolved once it has been left. */
  const exit = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    setOverlay(false);
  }, []);

  useEffect(() => {
    if (!overlay) return;
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (escapeInside?.current?.contains(event.target as Node | null)) return;
      setOverlay(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = was;
      document.removeEventListener('keydown', onKey);
    };
  }, [overlay, escapeInside]);

  const wasFilled = useRef(false);
  useEffect(() => {
    if (wasFilled.current && !filled) {
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost) toggleRef.current?.focus();
    }
    wasFilled.current = filled;
  }, [filled]);

  return { fullscreen, overlay, filled, toggle, exit, toggleRef };
}
