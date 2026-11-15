import { useEffect, useMemo, useState } from 'react';
import { arrivalAt, usableName, type ArrivalElement, type ArrivalView } from '@/lib/naming-arrival';
import { withShownNames, type ProcessMapModel } from '@/lib/process-map';

/**
 * The AI names arriving on the map, in time — roadmap 3.1.0 item 4 (plan AB-3).
 *
 * Holds the three moments `lib/naming-arrival.ts` reads — when the ask went out, when the names were first seen, and
 * whether the ask ended without them — and re-reads the arrival at the next moment it changes, never on a steady
 * timer. Returns the model as the reader sees it now (a name only once its swap has begun) and what the canvas and
 * the status line draw.
 *
 * Names already stored when the map opens are there at once, and so is every arrival under
 * `prefers-reduced-motion`. An invited reader's visit asks nothing (`useAutoProcessNaming`), so `asking` never turns
 * true for one and the map shows the stored names, or none, without a status of waiting.
 */
export interface NamingArrival extends ArrivalView {
  /** The model with exactly the names the canvas shows. */
  model: ProcessMapModel;
  /** False under `prefers-reduced-motion`: names are put in place without a swap. */
  motion: boolean;
}

interface Moments {
  identity: string;
  waitingSince: number | null;
  arrivedAt: number | null;
  instant: boolean;
}

function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useNamingArrival(input: {
  model: ProcessMapModel | null;
  /** The naming hook is asking right now (`useAutoProcessNaming().state === 'asking'`). */
  asking: boolean;
  /** How the last ask of this visit ended (`useAutoProcessNaming().outcome`). */
  outcome: 'stored' | 'failed' | null;
  /** The map's identity — a new source or project starts the arrival over. */
  identity: string;
}): NamingArrival | null {
  const { model, asking, outcome, identity } = input;
  const [motion] = useState(() => !reducedMotion());
  const [held, setHeld] = useState<Moments>({ identity, waitingSince: null, arrivedAt: null, instant: false });
  const [now, setNow] = useState(0);
  // A new map starts over (the documented "adjust state while rendering" pattern, not an effect).
  const moments: Moments = held.identity === identity ? held : { identity, waitingSince: null, arrivedAt: null, instant: false };
  if (moments !== held) setHeld(moments);

  const elements: ArrivalElement[] = useMemo(
    () => (model?.elements ?? []).map((e) => ({
      id: e.id,
      nodeId: e.nodeId,
      businessName: e.businessName,
      drawnName: e.plainName ?? e.technicalName,
    })),
    [model],
  );
  // A naming for this map is in — it may name nothing the engine did not already say.
  const hasNames = model?.naming.state === 'named' || elements.some((e) => usableName(e) !== null);

  // The moments: when the ask went out, and when the names were first seen.
  useEffect(() => {
    if (!asking) return;
    const at = Date.now();
    setHeld((h) => (h.identity === identity && h.waitingSince === null && h.arrivedAt === null ? { ...h, waitingSince: at } : h));
    setNow(at);
  }, [asking, identity]);
  useEffect(() => {
    if (!model || !hasNames) return;
    const at = Date.now();
    // Stored before this visit asked for anything: there, not arriving.
    setHeld((h) => (h.identity === identity && h.arrivedAt === null ? { ...h, arrivedAt: at, instant: h.waitingSince === null || !motion } : h));
    setNow(at);
  }, [model, hasNames, identity, motion]);

  const failed = !hasNames && !asking && outcome === 'failed';
  const view = useMemo(
    () => (model
      ? arrivalAt({ elements, waitingSince: moments.waitingSince, arrivedAt: moments.arrivedAt, instant: moments.instant, failed }, now)
      : null),
    [model, elements, moments.waitingSince, moments.arrivedAt, moments.instant, failed, now],
  );

  // The next moment the view changes by itself: one timeout, set again after it fires.
  const nextChangeAt = view?.nextChangeAt ?? null;
  useEffect(() => {
    if (nextChangeAt === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(16, nextChangeAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [nextChangeAt, now]);

  // The model as the reader sees it, rebuilt only when the set of shown names changes.
  const shown = view?.shown;
  const shownKey = shown ? [...shown.entries()].map(([id, name]) => `${id}\u0000${name}`).join('\u0001') : '';
  const visible = useMemo(
    () => (model && shown ? withShownNames(model, shown) : model),
    // `shown` is new on every view; its content is `shownKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, shownKey],
  );
  return useMemo(() => (model && view && visible ? { ...view, model: visible, motion } : null), [model, view, visible, motion]);
}
