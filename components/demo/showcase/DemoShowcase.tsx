'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Link2, RotateCw } from 'lucide-react';
import AuthLink from '@/components/landing/AuthLink';
import type { ShowcaseData } from '@/lib/demo-showcase';
import {
  SHOWCASE_CONTINUE_TARGET,
  SHOWCASE_LENSES,
  showcaseStepHref,
  showcaseSteps,
  type ShowcaseLens,
} from '@/lib/demo-showcase-copy';
import { BusinessScreen, DeliveryScreen, EndScreen, ItScreen, ManagementScreen, type ScreenActions, type ScreenState } from './ShowcaseScreens';
import './showcase.css';

/**
 * The public demo showcase at `/demo` — roadmap 3.5.0 item 8 (DEMO-1), owner
 * decision 13.11.2026 (option B, variant A of mockup v3).
 *
 * A guided click-through in ten steps and an end, outside the real tools and
 * in their look: the Analyze page in Business, IT and Management and the
 * Delivery page, filled with the engine's reading of the shipped example
 * (`lib/demo-showcase.ts`, computed when the page is built). No account, no
 * model, no request to anyone but this site, nothing written but the address
 * fragment; it ends in sign-in or sign-up through the landing page's own
 * `AuthLink` and dialog.
 *
 * **The guide box never moves** (variant A). Its place and size are fixed per
 * breakpoint in `showcase.css`; the page never scrolls; on every step the
 * product frame inside the stage is scrolled to the explained part (outlined
 * in blue) and, only when the part would still sit under the box or below the
 * stage, zoomed out in steps of 10 % down to 70 % ({@link fitPart}).
 *
 * **Every step has an address**: `/demo#step=4`, `/demo#step=end`, with a
 * reader's emphasis `&lens=it` (`showcaseStepHref`). The fragment is read on
 * load and on `hashchange`, written with `replaceState`, and never sent to the
 * server.
 */

const ZOOMS = [1, 0.9, 0.8, 0.7] as const;
const DEFAULT_SCALE = 0.8;

type State = { i: number; lens: ShowcaseLens; screen: ScreenState };

const HASH_EVENT = 'cc-showcase-hash';
const noSubscription = () => () => {};
function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  window.addEventListener(HASH_EVENT, onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener(HASH_EVENT, onChange);
  };
}
const readLocationHash = () => window.location.hash;

/** Write a step's address without a new history entry, and tell the store. */
function writeHash(step: number | 'end', lens: ShowcaseLens): void {
  const want = showcaseStepHref(step, lens).split('#')[1];
  if (window.location.hash.slice(1) === want) return;
  try {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${want}`);
  } catch {
    window.location.hash = want;
  }
  window.dispatchEvent(new Event(HASH_EVENT));
}

function readHash(hash: string, n: number): { i: number; lens: ShowcaseLens } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const step = params.get('step');
  const lensRaw = params.get('lens');
  const lens = (SHOWCASE_LENSES.find(([k]) => k === lensRaw)?.[0] ?? 'all') as ShowcaseLens;
  if (step === 'end') return { i: n, lens };
  const num = Number(step);
  if (step && Number.isInteger(num) && num >= 1 && num <= n) return { i: num - 1, lens };
  return lensRaw ? { i: 0, lens } : null;
}

/**
 * Scroll the stage to the explained part, and zoom the product frame out only
 * as far as it takes to keep the part out from under the guide box and above
 * the stage's bottom edge. The box itself is never touched.
 */
function fitPart(host: HTMLElement, box: HTMLElement | null): void {
  const frame = host.querySelector<HTMLElement>('.app, .endwrap');
  if (!frame) return;
  // A step that explains two cards (step 5) is fitted by the first, as the mockup measured it:
  // side by side they share its top; stacked on a phone the second follows below it.
  const targets = [...host.querySelectorAll<HTMLElement>('[data-showcase-target]')].slice(0, 1);
  if (!targets.length) {
    frame.style.zoom = '';
    host.scrollTop = 0;
    return;
  }
  let best: { z: number; bad: number } | null = null;
  for (const z of ZOOMS) {
    frame.style.zoom = z === 1 ? '' : String(z);
    host.scrollTop = 0;
    const s = host.getBoundingClientRect();
    let r = unionRect(targets);
    host.scrollTop = Math.max(0, r.top - s.top - 12);
    r = unionRect(targets);
    let covered = 0;
    if (box && box.offsetParent !== null) {
      const b = box.getBoundingClientRect();
      const ox = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left));
      const oy = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
      covered = ox * oy;
    }
    const below = Math.max(0, r.bottom - s.bottom) * r.width;
    const bad = covered * 4 + below;
    if (!best || bad < best.bad - 1) best = { z, bad };
    if (bad === 0) break;
  }
  const z = best?.z ?? 1;
  frame.style.zoom = z === 1 ? '' : String(z);
  host.scrollTop = 0;
  const s2 = host.getBoundingClientRect();
  const r2 = unionRect(targets);
  host.scrollTop = Math.max(0, r2.top - s2.top - 12);
  frame.dataset.showcaseZoom = String(z);
}

/** The rectangle around every element a step explains (step 5 explains two cards side by side). */
function unionRect(els: Element[]): { top: number; left: number; right: number; bottom: number; width: number } {
  const rs = els.map((e) => e.getBoundingClientRect());
  const top = Math.min(...rs.map((r) => r.top));
  const left = Math.min(...rs.map((r) => r.left));
  const right = Math.max(...rs.map((r) => r.right));
  const bottom = Math.max(...rs.map((r) => r.bottom));
  return { top, left, right, bottom, width: right - left };
}

function Details({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>
          {item.split(/(`[^`]+`)/).map((piece, i) =>
            i % 2 ? <code key={i}>{piece.slice(1, -1)}</code> : <React.Fragment key={i}>{piece}</React.Fragment>,
          )}
        </li>
      ))}
    </ul>
  );
}

export default function DemoShowcase({ data }: { data: ShowcaseData }) {
  const counts = useMemo(() => {
    const stops = data.ends.filter((e) => e.plane !== 'process');
    const top = [...stops].sort((a, b) => b.ids.length - a.ids.length)[0];
    return {
      ends: data.ends.reduce((a, e) => a + e.ids.length, 0),
      stops: stops.reduce((a, e) => a + e.ids.length, 0),
      topStop: top ? { label: top.planeLabel, count: top.ids.length } : null,
      changes: data.changes.length,
    };
  }, [data]);
  const steps = useMemo(() => showcaseSteps(data.facts, counts), [data, counts]);
  const N = steps.length;

  const screenFor = useCallback(
    (i: number): ScreenState => {
      const st = steps[i];
      return { plane: st?.plane ?? 'process', sel: st?.select ?? null, marks: [], scale: DEFAULT_SCALE, code: st?.code ?? [41, 55] };
    },
    [steps],
  );

  // The step and the reader's emphasis live in the address fragment (`/demo#step=4&lens=it`): read
  // through a store, so a pasted address, a link and the Back and Next buttons are one source.
  const hash = useSyncExternalStore(subscribeHash, readLocationHash, () => '');
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  const place = readHash(hash, N) ?? { i: 0, lens: 'all' as ShowcaseLens };
  const [screenState, setScreenState] = useState<{ step: number } & ScreenState>(() => ({ step: 0, ...screenFor(0) }));
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [toast, setToast] = useState<string | null>(null);
  // A new step starts from its own screen; seen steps are marked in the dots.
  if (screenState.step !== place.i) setScreenState({ step: place.i, ...screenFor(place.i) });
  if (!seen.has(place.i)) setSeen(new Set(seen).add(place.i));
  // (A render with a stale screen is discarded: the setState above makes React render again at once.)
  const state: State = useMemo(() => ({ i: place.i, lens: place.lens, screen: screenState }), [place.i, place.lens, screenState]);
  /** Whether the next render should move the focus to the guide's title (a click on Next, not a load). */
  const focusNext = useRef(false);
  /** The step the stage was last fitted for: a new step is fitted, a change inside one keeps the reader's place. */
  const fittedFor = useRef<number | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement>(null);

  const go = useCallback(
    (i: number, focus = true) => {
      const next = Math.max(0, Math.min(N, i));
      focusNext.current = focus;
      writeHash(next >= N ? 'end' : next + 1, readHash(readLocationHash(), N)?.lens ?? 'all');
    },
    [N],
  );
  const setLens = (lens: ShowcaseLens) => writeHash(place.i >= N ? 'end' : place.i + 1, lens);

  // The explained part: outlined, and the stage fitted to it before the browser paints.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.querySelectorAll('[data-showcase-target]').forEach((el) => {
      el.removeAttribute('data-showcase-target');
      el.classList.remove('tt');
    });
    const st = steps[state.i];
    if (st) {
      host.querySelectorAll<HTMLElement>(`[data-showcase-part="${st.part}"]`).forEach((el) => {
        el.setAttribute('data-showcase-target', '');
        el.classList.add('tt');
      });
    }
    if (fittedFor.current !== state.i) {
      fittedFor.current = state.i;
      fitPart(host, boxRef.current);
      const map = host.querySelector<HTMLElement>('[data-showcase-map]');
      const sel = state.screen.sel && map?.querySelector<SVGGraphicsElement>(`[data-element-id="${state.screen.sel}"]`);
      if (map && sel) centreIn(map, sel);
    }
    if (focusNext.current) {
      focusNext.current = false;
      const heading = state.i >= N ? document.getElementById('showcase-end-title') : document.getElementById('showcase-step-title');
      heading?.focus({ preventScroll: true });
    }
  }, [state, steps, N]);

  // A resize keeps the part in view, at the zoom the new size needs.
  useEffect(() => {
    const onResize = () => {
      if (hostRef.current) fitPart(hostRef.current, boxRef.current);
    };
    window.addEventListener('resize', onResize);
    // The site's web font replaces its fallback after the first fit; the heights it changes are fitted again.
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) onResize();
    });
    return () => {
      live = false;
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // The map's elements are buttons: named, focusable, and marked as selected or counted.
  useLayoutEffect(() => {
    const map = hostRef.current?.querySelector('[data-showcase-map]');
    if (!map) return;
    map.querySelectorAll('.djs-element.djs-shape[data-element-id]').forEach((g) => {
      const id = g.getAttribute('data-element-id') ?? '';
      const e = data.elements[id];
      if (!e || id.endsWith('_label')) return;
      g.setAttribute('data-flow', '');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      const opens = data.planes.some((p) => p.id === id);
      g.setAttribute('aria-label', `${e[0]}${e[2] ? `, line ${e[2]}` : ''}${opens ? ', opens its level' : ''}`);
      g.classList.toggle('sel', state.screen.sel === id);
      g.classList.toggle('mark', state.screen.marks.includes(id));
    });
  }, [state.screen, data, state.i]);

  // Keys: ← → step, Home the start, End the end — not while a field, the code or the map has the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName ?? '').toLowerCase();
      if (['input', 'textarea', 'summary', 'select'].includes(tag)) return;
      if (t?.closest?.('.code, [data-showcase-map], [role="dialog"]')) return;
      if (e.key === 'ArrowRight') go(state.i + 1);
      else if (e.key === 'ArrowLeft') go(state.i - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(N);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, state.i, N]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const copyLink = useCallback(
    (lens: ShowcaseLens, step: number | 'end') => {
      const url = `${window.location.origin}${showcaseStepHref(step, lens)}`;
      const done = (ok: boolean) => setToast(ok ? `Link copied: ${url.replace(/^https?:\/\//, '')}` : url);
      try {
        navigator.clipboard.writeText(url).then(
          () => done(true),
          () => done(false),
        );
      } catch {
        done(false);
      }
    },
    [],
  );

  const setScreen = (patch: Partial<ScreenState>) => setScreenState((s) => ({ ...s, ...patch }));

  /** Bring the map into the stage and the element into the middle of the map, without touching the box. */
  const revealOnMap = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const host = hostRef.current;
      const map = host?.querySelector<HTMLElement>('[data-showcase-map]');
      const card = host?.querySelector<HTMLElement>('[data-showcase-part="map"]');
      if (!host || !map || !card) return;
      host.scrollTop += card.getBoundingClientRect().top - host.getBoundingClientRect().top - 12;
      const g = map.querySelector<SVGGraphicsElement>(`[data-element-id="${id}"]`);
      if (g) centreIn(map, g);
    });
  }, []);

  const actions: ScreenActions = {
    pick: (id) => {
      if (!data.elements[id]) return;
      if (state.screen.sel === id && data.planes.some((p) => p.id === id)) {
        setScreen({ plane: id, sel: null, marks: [] });
        return;
      }
      setScreen({ sel: id, marks: [] });
    },
    openPlane: (plane) => setScreen({ plane, sel: null, marks: [] }),
    zoom: (delta) => {
      if (delta === 0) {
        const map = hostRef.current?.querySelector<HTMLElement>('[data-showcase-map]');
        const plane = data.planes.find((p) => p.id === state.screen.plane);
        if (map && plane) setScreen({ scale: Math.min(1, Math.max(0.3, (map.clientWidth - 16) / plane.w)) });
        return;
      }
      setScreen({ scale: Math.min(1.4, Math.max(0.4, Math.round((state.screen.scale + delta * 0.1) * 10) / 10)) });
    },
    showEnd: (index) => {
      const end = data.ends[index];
      if (!end) return;
      setScreen({ plane: end.plane, marks: end.ids, sel: null });
      revealOnMap(end.ids[0]);
    },
    showChange: (index) => {
      const change = data.changes[index];
      if (!change) return;
      setScreen({ plane: change.plane, marks: [change.mark], sel: null });
      revealOnMap(change.mark);
    },
    showLine: (line) => {
      const hit = Object.entries(data.elements).find(([, e]) => e[2] === line);
      if (hit) {
        setScreen({ plane: hit[1][4], sel: hit[0], marks: [] });
        revealOnMap(hit[0]);
      } else {
        setScreen({ sel: null, code: [Math.max(1, line - 3), line + 3] });
      }
    },
    goStep: (step) => go(step - 1),
    quiet: () => setToast('In your own project'),
  };

  const st = steps[state.i];
  const atEnd = state.i >= N;

  let screen: React.ReactNode;
  if (atEnd || !st) screen = <EndScreen lens={state.lens} onBack={() => go(N - 1)} onCopy={(lens) => copyLink(lens, 1)} />;
  else if (st.screen === 'business') screen = <BusinessScreen data={data} state={state.screen} actions={actions} />;
  else if (st.screen === 'it') screen = <ItScreen data={data} actions={actions} />;
  else if (st.screen === 'management') screen = <ManagementScreen data={data} actions={actions} changes={data.changes.length} />;
  else screen = <DeliveryScreen data={data} actions={actions} />;

  return (
    <div className="cc-sc col" data-showcase="" data-showcase-step={atEnd ? 'end' : String(state.i + 1)} data-showcase-ready={ready ? 'true' : 'false'}>
      <header className="top">
        <div className="in">
          <Link className="logo" href="/" aria-label="Clean-Core.io, to the home page">
            <span className="lg">
              <RotateCw className="i" aria-hidden="true" />
            </span>
            <span className="n">
              Clean-Core<em>.io</em>
            </span>
          </Link>
          <span className="demo-tag">Demo · no account</span>
          <div className="r">
            <a
              className="lnk"
              href={showcaseStepHref('end', state.lens)}
              onClick={(e) => {
                e.preventDefault();
                go(N);
              }}
            >
              Skip to the end
            </a>
            <AuthLink to={SHOWCASE_CONTINUE_TARGET} variant="ghost" size="sm" testId="showcase-signin">
              Sign in
            </AuthLink>
          </div>
        </div>
      </header>
      <nav className="tourbar" aria-label="Demo steps">
        <div className="in">
          <ol className="dots" aria-label="Steps of the demo">
            {steps.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  aria-current={i === state.i ? 'step' : undefined}
                  className={seen.has(i) && i !== state.i ? 'seen' : undefined}
                  onClick={() => go(i)}
                >
                  {i + 1}
                </button>
              </li>
            ))}
            <li>
              <button type="button" aria-label="The end: your turn" aria-current={atEnd ? 'step' : undefined} onClick={() => go(N)}>
                ✓
              </button>
            </li>
          </ol>
          <span className="cnt" aria-live="polite">
            {atEnd ? 'Your turn' : `Step ${state.i + 1} of ${N} · about 4 minutes`}
          </span>
          <span className="tbnav">
            <button type="button" className="btn ghost" aria-label="Back" disabled={state.i === 0} onClick={() => go(state.i - 1)}>
              <ArrowLeft className="i" aria-hidden="true" />
            </button>
            <button type="button" className="btn ghost" aria-label="Copy link to this step" data-showcase-copy="bar" onClick={() => copyLink(state.lens, atEnd ? 'end' : state.i + 1)}>
              <Link2 className="i" aria-hidden="true" />
            </button>
            {atEnd ? null : (
              <button type="button" className="btn primary" data-showcase-next="bar" onClick={() => go(state.i + 1)}>
                {state.i === N - 1 ? 'Your turn' : 'Next'} <ArrowRight className="i" aria-hidden="true" />
              </button>
            )}
          </span>
          <div className="lensbar">
            <span className="lb" id="showcase-lens-label">
              Read it as
            </span>
            <div className="seg" role="radiogroup" aria-labelledby="showcase-lens-label">
              {SHOWCASE_LENSES.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={state.lens === key}
                  onClick={() => setLens(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>
      <main className={atEnd ? 'tourwrap atend' : 'tourwrap'}>
        <div className="screen" ref={hostRef} tabIndex={-1} data-showcase-stage="">
          {screen}
          <p className="recline">Built from the engine’s real reading of a sample program when this page was built; no AI was called to show you this.</p>
        </div>
        {st && !atEnd ? (
          <section className="bubble" ref={boxRef} aria-label="Guide" data-showcase-box="">
            <div className="bc" key={`${state.i}-${state.lens}`} aria-live="polite">
              <div className="ey">
                Step {state.i + 1} of {N}
              </div>
              <h2 id="showcase-step-title" tabIndex={-1}>
                {st.title}
              </h2>
              <div className="lead">
                <p>{state.lens === 'all' ? st.all : st.emphasis[state.lens]}</p>
              </div>
              {st.why ? (
                <div className="why">
                  <b>Why this matters · {st.why.title}</b>
                  <span>{st.why.text}</span>
                </div>
              ) : null}
              <div className="lenses" aria-label="For each reader">
                {(['business', 'it', 'management'] as const).map((k) => (
                  <div key={k} className={state.lens === k ? 'lens on' : 'lens'}>
                    <b>{k === 'it' ? 'IT' : k.charAt(0).toUpperCase() + k.slice(1)}</b>
                    <span>{st.lens[k]}</span>
                  </div>
                ))}
              </div>
              <details className="itd" open={state.lens === 'it'}>
                <summary>IT details</summary>
                <Details items={st.details} />
              </details>
              <button type="button" className="copy" data-showcase-copy="box" onClick={() => copyLink(state.lens, state.i + 1)}>
                Copy link to this step
              </button>
            </div>
            <div className="bnav">
              <button type="button" className="btn ghost" disabled={state.i === 0} onClick={() => go(state.i - 1)}>
                <ArrowLeft className="i" aria-hidden="true" /> Back
              </button>
              <button type="button" className="btn primary" data-showcase-next="box" onClick={() => go(state.i + 1)}>
                {state.i === N - 1 ? 'Your turn' : 'Next'} <ArrowRight className="i" aria-hidden="true" />
              </button>
              <span className="kb" aria-hidden="true">
                ← →
              </span>
            </div>
          </section>
        ) : null}
      </main>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/** Scroll a map so an element sits in its middle. */
function centreIn(map: HTMLElement, el: Element): void {
  const r = el.getBoundingClientRect();
  const v = map.getBoundingClientRect();
  map.scrollLeft += r.left - v.left - v.width / 2 + r.width / 2;
  map.scrollTop += r.top - v.top - v.height / 2 + r.height / 2;
}
