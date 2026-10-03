'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ccModalOpen } from '@/components/cc/modal';

/** Marks the history entries of one full screen (its scope), so Back can leave it. */
const HISTORY_FLAG = 'ccCanvasFullscreen';
/** The level an entry stands for. */
const LEVEL_KEY = 'ccCanvasLevel';
/** How many levels deep into this full screen an entry is; 0 is the entry it was opened with. */
const DEPTH_KEY = 'ccCanvasDepth';

/** The level on show, and how to show another — for a map that has levels. */
export interface CanvasLevel {
  /** Null for the top level. */
  current: string | null;
  set: (level: string | null) => void;
}

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
  level,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  escapeInside?: React.RefObject<HTMLElement | null>;
  /** The map's level, when it has levels: Back walks them in full screen. */
  level?: CanvasLevel;
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

  // Escape leaves the browser's own full screen too. A browser ends it on a
  // real Escape itself; a keyboard that reaches the page (an embedded view, a
  // synthetic key) would otherwise leave the reader inside with no key out.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || ccModalOpen()) return;
      if (escapeInside?.current?.contains(event.target as Node | null)) return;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen, escapeInside]);

  useEffect(() => {
    if (!overlay) return;
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      // A dialog open over full screen takes Escape first (`components/cc/modal.ts`).
      if (event.key !== 'Escape' || event.defaultPrevented || ccModalOpen()) return;
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
    // Into full screen, the focus goes with the reader: the toggle that opened
    // it is replaced by the labelled way out, which takes it.
    if (!wasFilled.current && filled) {
      const active = document.activeElement;
      if (!active || active === document.body || !rootRef.current?.contains(active)) toggleRef.current?.focus();
    }
    wasFilled.current = filled;
  }, [filled, rootRef]);

  /**
   * The back gesture, and the levels opened in full screen.
   *
   * Back leaves full screen (owner 03.10.2026: "get back again easily"): on a
   * phone that is the way out a reader tries first, and without an entry of
   * its own it left the page. Entering pushes one history entry on the same
   * address — Next's own state copied, so its router sees its own page.
   *
   * A level opened in full screen is one more entry (owner 03.10.2026: "full
   * screen must also go one level up and down"). So Back undoes the last move,
   * as it does everywhere else: it first walks back through the levels opened
   * in full screen, then leaves full screen on the level it was entered on.
   * Where the page keeps the level in the address itself (the Documentation
   * stage's `#map=…`), its own entry is marked rather than doubled; where it
   * does not (the workspace, the demo, the editor), the entry is pushed here.
   *
   * Leaving any other way (the button, Escape) never moves the level: with no
   * level opened, the one entry comes back off and the history is as it was;
   * after a level was opened, the entries stay, each one a level Back returns
   * to, and the level on show is the level the reader left full screen on.
   */
  const scope = useId();
  const levelRef = useRef(level);
  useEffect(() => {
    levelRef.current = level;
  });
  /** How many levels deep this full screen's history is; −1 outside full screen. */
  const depthRef = useRef(-1);
  /** Set while leaving takes full screen's own entry back off: that Back is not a move. */
  const unwindingRef = useRef(false);
  const levelNow = level ? level.current : null;

  useEffect(() => {
    if (filled && depthRef.current < 0) {
      depthRef.current = 0;
      window.history.pushState(
        { ...(window.history.state ?? {}), [HISTORY_FLAG]: scope, [LEVEL_KEY]: levelRef.current?.current ?? null, [DEPTH_KEY]: 0 },
        '',
      );
    } else if (!filled && depthRef.current >= 0) {
      depthRef.current = -1;
      const state = window.history.state;
      if (state?.[HISTORY_FLAG] === scope && state?.[DEPTH_KEY] === 0) {
        // The entry underneath may be a level entry of an earlier full screen:
        // taking ours off must not restore its level (QA 7e0254da77f0).
        unwindingRef.current = true;
        window.history.back();
      }
    }
  }, [filled, scope]);

  useEffect(() => {
    if (!filled || !levelRef.current) return undefined;
    // After the page had its turn: an address it writes is written in a
    // microtask of the same event, and is found here as an entry of its own.
    const timer = window.setTimeout(() => {
      if (depthRef.current < 0) return;
      const state = window.history.state ?? {};
      if (state[HISTORY_FLAG] === scope) {
        // Back or Forward brought the level here: nothing to record.
        if (state[LEVEL_KEY] === levelNow) return;
        depthRef.current += 1;
        window.history.pushState({ ...state, [LEVEL_KEY]: levelNow, [DEPTH_KEY]: depthRef.current }, '');
      } else {
        depthRef.current += 1;
        window.history.replaceState(
          { ...state, [HISTORY_FLAG]: scope, [LEVEL_KEY]: levelNow, [DEPTH_KEY]: depthRef.current },
          '',
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filled, levelNow, scope]);

  useEffect(() => {
    const onPop = () => {
      if (unwindingRef.current) {
        unwindingRef.current = false;
        return;
      }
      const state = window.history.state;
      const ours = state?.[HISTORY_FLAG] === scope;
      if (depthRef.current >= 0) {
        if (!ours) {
          // Back past the entry full screen pushed: full screen is left.
          depthRef.current = -1;
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
          setOverlay(false);
          return;
        }
        depthRef.current = typeof state[DEPTH_KEY] === 'number' ? state[DEPTH_KEY] : 0;
      }
      // One of this map's level entries, in full screen or after it: its level.
      const held = levelRef.current;
      if (ours && held && LEVEL_KEY in state && state[LEVEL_KEY] !== held.current) held.set(state[LEVEL_KEY]);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [scope]);

  return { fullscreen, overlay, filled, toggle, exit, toggleRef };
}
