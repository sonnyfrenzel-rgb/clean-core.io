'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, FileCode2, RefreshCw } from 'lucide-react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { CodeToken } from '@/lib/process-map';
import type { HeroSnippet } from '@/lib/landing-hero';

/**
 * The hero's workspace window — landing mockup, section `hero` (mockups s0/s1).
 *
 * Layout and behaviour are the mockup's: "Your process", the found-in-the-code
 * sentence with its anchors, the not-determined box, and below them the source
 * card beside the process card. Hover or focus an anchor or a step and its code
 * appears in the source card with the line lit; select one to keep it.
 *
 * Everything shown is handed in by the server (`lib/landing-process.ts`): the
 * rules, the constructs the engine could not judge, the code lines and the
 * captions. The diagram arrives as `diagram`, drawn elsewhere; any element in it
 * that carries `data-l="<line>"` takes part in the linking, and it receives the
 * classes `is-sel` (kept) and `is-peek` (hovered) on its group.
 */

export interface HeroWorkspaceProps {
  program: string;
  title: string;
  anchoredSentence: string;
  rules: { total: number; shown: Array<{ id: string; label: string; plain?: string; line: number }> };
  notDetermined: { total: number; groups: Array<{ label: string; anchors: number[] }>; includes: number[] };
  snippets: Record<string, HeroSnippet>;
  initial: string;
  mapTitle: string;
  mapNote: string;
  diagram: ReactNode;
}

const TOKEN: Record<CodeToken['kind'], string> = {
  keyword: 'kw',
  literal: 's',
  name: 'fn',
  comment: 'cm',
  plain: '',
};

export default function HeroWorkspace(props: HeroWorkspaceProps) {
  const { snippets } = props;
  const [pinned, setPinned] = useState(props.initial);
  const [shown, setShown] = useState(props.initial);
  const mapRef = useRef<HTMLDivElement>(null);
  const snip = snippets[shown] ?? snippets[props.initial];

  // The diagram is drawn by another component; it is reached through data-l.
  useEffect(() => {
    const root = mapRef.current;
    if (!root) return;
    for (const el of root.querySelectorAll<SVGElement | HTMLElement>('[data-l]')) {
      const key = el.getAttribute('data-l') ?? '';
      el.classList.toggle('is-sel', key === pinned);
      el.classList.toggle('is-peek', key === shown && shown !== pinned);
      el.setAttribute('aria-pressed', key === pinned ? 'true' : 'false');
    }
  }, [pinned, shown]);

  const keyOf = (target: EventTarget | null): string | null => {
    const el = (target as Element | null)?.closest?.('[data-l]');
    const key = el?.getAttribute('data-l') ?? null;
    return key && snippets[key] ? key : null;
  };
  const peek = (key: string | null) => {
    if (key) setShown(key);
  };
  const back = () => setShown(pinned);
  const pin = (key: string | null) => {
    if (!key) return;
    setPinned(key);
    setShown(key);
  };

  const anchor = (line: number) => {
    const key = String(line);
    if (!snippets[key]) {
      return (
        <span key={key} className="anc">
          L{line}
        </span>
      );
    }
    return (
      <button
        key={key}
        type="button"
        className="anc"
        aria-pressed={pinned === key}
        aria-controls="hero-code"
        aria-label={`Line ${line}`}
        onMouseEnter={() => peek(key)}
        onMouseLeave={back}
        onFocus={() => peek(key)}
        onBlur={back}
        onClick={() => pin(key)}
      >
        L{line}
      </button>
    );
  };

  return (
    <div className="win">
      <div className="wbar">
        <span className="wlogo">
          <span className="m">
            <RefreshCw className="i" aria-hidden="true" />
          </span>
          <span>
            Clean-Core<em>.io</em>
          </span>
        </span>
        <span className="wpath">
          My workspace
          <ChevronRight className="i" aria-hidden="true" />
          <b>{props.title}</b>
        </span>
        <span className="views" aria-label="View: Business">
          <span className="on">Business</span>
          <span>IT</span>
          <span>Management</span>
        </span>
      </div>
      <div className="wbody">
        <p className="w-eyebrow">Your process</p>
        <div className="w-title">
          <p className="tt">{props.title}</p>
          <CcProvenanceChip value="reconstructed" />
        </div>

        <div className="revrow">
          <div className="revbox">
            <p className="k">Found in the code</p>
            <p className="reveal">
              {props.rules.total} business rules hard-coded in the program —{' '}
              {props.rules.shown.map((r, i) => (
                <span key={r.id}>
                  <span className="v">
                    {/* The rule in plain language; the condition as the code writes it on hover and in the source card. */}
                    {r.plain ? <span title={r.label}>{r.plain}</span> : <code title={r.label}>{r.label}</code>}
                    {anchor(r.line)}
                  </span>
                  {i < props.rules.shown.length - 1 ? ', ' : props.rules.total > props.rules.shown.length ? ', …' : ''}
                </span>
              ))}
            </p>
          </div>
          <div className="revbox nd">
            <p className="nd-t">
              {props.notDetermined.total} not determined <CcProvenanceChip value="not-determined" />
            </p>
            <p className="nd-d">
              {props.notDetermined.groups.map((g, i) => (
                <span key={g.label}>
                  {i > 0 && ' · '}
                  {g.label}
                  {g.anchors.length > 1 ? ` ×${g.anchors.length}` : ''}
                  {g.anchors.slice(0, 2).map((l) => anchor(l))}
                </span>
              ))}
              {props.notDetermined.includes.length > 0 && (
                <span>
                  {' · '}
                  {props.notDetermined.includes.length} includes not uploaded
                  {props.notDetermined.includes.map((l) => anchor(l))}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="split">
          <div className="codecard" id="hero-code">
            <div className="cc-head">
              <FileCode2 className="i" aria-hidden="true" />
              <span>{props.program}</span>
              <span className="darktag">
                L{snip.from}–{snip.to}
              </span>
              <span className="r">Source</span>
            </div>
            <pre className="code" tabIndex={0} aria-label={`${props.program}, lines ${snip.from} to ${snip.to}`}>
              {snip.lines.map((l) => (
                <span
                  key={l.n}
                  className={`l${l.mark ? ` ${l.mark}` : ''}`}
                  data-hero-line={l.n}
                  onMouseEnter={() => {
                    const key = String(l.n);
                    if (l.mark && snippets[key]) setShown(key);
                  }}
                >
                  <span className="ln">{l.n}</span>
                  {l.tokens.length === 0
                    ? ''
                    : l.tokens.map((t, i) =>
                      TOKEN[t.kind] ? (
                        <span key={i} className={TOKEN[t.kind]}>
                          {t.text}
                        </span>
                      ) : (
                        <span key={i}>{t.text}</span>
                      ),
                    )}
                </span>
              ))}
            </pre>
            <p className="cc-cap" aria-live="polite">
              <b>{snip.title}</b> — {snip.text}
            </p>
          </div>

          <div className="mapcard">
            <div className="mc-head">
              <span className="t">Process — reconstructed from code</span>
              <CcProvenanceChip value="reconstructed" />
              <span className="r">{props.mapNote}</span>
            </div>
            <div
              ref={mapRef}
              className="mc-slot"
              role="group"
              aria-label={props.mapTitle}
              onMouseOver={(e) => peek(keyOf(e.target))}
              onMouseLeave={back}
              onFocus={(e) => peek(keyOf(e.target))}
              onBlur={back}
              onClick={(e) => pin(keyOf(e.target))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const key = keyOf(e.target);
                  if (key) {
                    e.preventDefault();
                    pin(key);
                  }
                }
              }}
            >
              {props.diagram}
            </div>
            <p className="hint-line">{props.anchoredSentence}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
