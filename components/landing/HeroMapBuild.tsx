'use client';

import { useState } from 'react';
import type { HeroStep } from '@/lib/landing-35';

/**
 * The hero picture of the landing page (owner decision O1 = B, 13.11.2026):
 * the main flow of the demo program builds up, then the business names swap in
 * for the names the code gives its routines.
 *
 * Both names come from the engine (`heroBuild`, `lib/landing-35.ts`), so the
 * swap shows only what the release's engine writes. The motion is CSS alone and
 * runs once per page load: every element reserves the larger of its two names
 * from the first paint (the two sit in one grid cell), so nothing moves when the
 * names change — only opacity and a small rise. Under `prefers-reduced-motion`
 * the stylesheet drops the animation and the named map stands at once; the
 * server renders the same markup, so the map is there without JavaScript too.
 * "Show again" remounts the list, which restarts the animation.
 */
export default function HeroMapBuild({
  elements,
  hiddenOnPhone,
  label,
}: {
  elements: HeroStep[];
  hiddenOnPhone: number;
  label: string;
}) {
  const [run, setRun] = useState(0);
  const stepMs = 220;
  const swapAt = elements.length * stepMs + 500;

  const name = (e: HeroStep) =>
    e.technical === e.plain ? (
      <span className="nm" data-hero-name="" data-plain={e.plain}>
        <span className="biz">{e.plain}</span>
      </span>
    ) : (
      <span className="nm swaps" data-hero-name="" data-plain={e.plain} data-technical={e.technical}>
        <span className="eng" aria-hidden="true">
          {e.technical}
        </span>
        <span className="biz">{e.plain}</span>
      </span>
    );

  let i = 0;
  const firstStep = elements.findIndex((e) => e.kind === 'step');
  return (
    <>
      <ol key={run} className="flow hb" aria-label={label} style={{ ['--swap' as string]: `${swapAt}ms` }}>
        {elements.map((e, k) => {
          const style = { ['--i' as string]: i++ };
          const ln = <span className="ln">L{e.line}</span>;
          const more =
            k === firstStep && hiddenOnPhone > 0 ? (
              <li key={`${e.id}-more`} className="nonly" style={{ ['--i' as string]: i }}>
                <span className="more">⋯ {hiddenOnPhone} more steps</span>
              </li>
            ) : null;
          if (e.kind === 'start' || e.kind === 'end') {
            return (
              <li key={e.id} className="evt" style={style} data-hero-element={e.kind}>
                <span className={`n ev${e.kind === 'end' ? ' end' : ''}`} aria-hidden="true" />
                <span className="evl">
                  {name(e)} {ln}
                </span>
              </li>
            );
          }
          if (e.kind === 'decision') {
            return (
              <li key={e.id} className="gwy" style={style} data-hero-element="decision">
                <span className="n gw" aria-hidden="true" />
                <span className="gwl">
                  {name(e)} {ln}
                </span>
              </li>
            );
          }
          return [
            <li key={e.id} className={e.wideOnly ? 'wonly' : undefined} style={style} data-hero-element="step">
              <div className="n task">
                <b>{name(e)}</b>
                {ln}
              </div>
            </li>,
            more,
          ];
        })}
      </ol>
      <p className="statusline" data-hero-status="">
        <span>The code&apos;s own names first, then the business names the engine writes from them — no model involved. Excerpt of the main flow.</span>
        <button type="button" className="replay" onClick={() => setRun((r) => r + 1)}>
          Show again
        </button>
      </p>
    </>
  );
}
