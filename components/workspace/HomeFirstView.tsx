'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { UserProfile } from '@/hooks/useUserProfile';
import { runsLeftLabel, starterExampleIsFree } from '@/lib/run-quota-rule';
import { exampleTiers } from '@/lib/example-catalog';
import { DEMO_STORAGE_KEY } from '@/lib/demo-marks';
import { TOUR_STORAGE_KEY } from '@/lib/demo-tour';
import {
  homeAnalyseCostLine,
  homeFromDemoBody,
  homeFromDemoRun,
  homeFromDemoTitle,
  homeRedesignExampleMeta,
  homeWelcome,
  wt,
} from '@/lib/workspace-messages';
import CcButton from '@/components/cc/Button';
import StarterExamples, { type HomeExampleStarter } from '@/components/StarterExamples';
import ToolPathStrip from './ToolPathStrip';
import { DemoLine, OwnCodeWay, ProductMark, HOME_LINK } from './HomeStartParts';

export { OWN_CODE_START_ROUTE } from './HomeStartParts';

/**
 * "My workspace" for an account with no project yet — two equal products,
 * Analyse and Re-design (ADR-123, mock-up
 * `docs/roadmap/workspace-two-products-mockup.html`, direction A, state "New
 * account"). Supersedes ADR-110 (2): nothing here says "optional".
 *
 *   - **Analyse it** — what an analysis gives, what it costs (one run per
 *     program, the same code again free, W8), and the two starts side by side
 *     with equal weight: *Try an example* (`StarterExamples` `home`, the
 *     recommended example with the page's only filled button, H-O15) and
 *     *Upload your own code* (`OwnCodeWay`: the file or the pasted code goes
 *     on to today's own-code start, which asks edition and cost as before).
 *   - **Re-design it** — the six tools after Analyze (`ToolPathStrip`), that it
 *     is not counted against the runs (W8), and how it starts: from an
 *     analysis (W4). "Re-design an example end to end" starts the recommended
 *     example through the same component and rule as "Start this example",
 *     and the intent to open Design once its run is signed travels in module
 *     memory (`lib/home-start-handoff.ts`), never a stored field.
 *
 * Below the pair, the demo as a line. A reader who has opened the demo in
 * this browser (its own keys, already listed in the Privacy Policy — read
 * here, never written) sees the banner that continues it instead (W7); that
 * banner then carries the one filled button.
 *
 * No map is drawn here (ADR-123 (5)): no bpmn-js on My workspace. The page
 * stops being this view with the first project: a returning account sees its
 * programs (`WorkspaceTiles`). Nothing here writes anything.
 */
export default function HomeFirstView({
  userId,
  profile,
}: {
  userId: string;
  profile: UserProfile | null;
}) {
  const starter = useRef<HomeExampleStarter>(null);
  const recommended = useMemo(() => exampleTiers().startHere.name, []);
  // Rendered only once the lists answered, in the browser — never on the server — so the storage is read at once.
  const [fromDemo] = useState(seenTheDemo);
  const free = starterExampleIsFree(profile, recommended);

  return (
    <div className="cc min-h-screen bg-cc-page" data-cc-workspace="" data-home-first-view="">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 pt-4 pb-10 min-[601px]:gap-6 min-[601px]:px-8 min-[601px]:pt-7 min-[601px]:pb-12">
        {fromDemo ? (
          <div
            data-home-from-demo=""
            className="flex flex-col items-stretch gap-3 rounded-cc-card border border-cc-information-border bg-cc-information-bg px-3.5 py-3 min-[601px]:flex-row min-[601px]:items-center min-[601px]:gap-4 min-[601px]:px-[18px] min-[601px]:py-3.5"
          >
            <div className="min-w-0 flex-1">
              <b className="block text-[15px] font-bold text-cc-ink">{homeFromDemoTitle(recommended)}</b>
              <span className="text-[13px] font-medium text-cc-ink-muted">
                <span className="max-[600px]:hidden">{homeFromDemoBody(false)}</span>
                <span className="min-[601px]:hidden">{homeFromDemoBody(true)}</span>
              </span>
            </div>
            <CcButton
              variant="primary"
              density="cozy"
              onClick={() => starter.current?.startRecommended()}
              data-home-from-demo-run=""
            >
              <span>{homeFromDemoRun(recommended)}</span>
              <ArrowRight size={14} aria-hidden={true} />
            </CcButton>
          </div>
        ) : null}

        <div data-home-intro="">
          <p className="m-0 text-[13px] font-semibold text-cc-ink-muted">{homeWelcome(profile?.firstName)}</p>
          <h1 className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.025em] text-cc-ink min-[601px]:text-[28px]">
            {wt('home.title')}
          </h1>
          <p className="mt-1.5 mb-0 max-w-[760px] text-[15px] font-medium text-cc-ink-muted max-[600px]:hidden">{wt('home.lead')}</p>
        </div>

        <div data-home-products="" className="grid grid-cols-1 gap-4 min-[601px]:grid-cols-2">
          <h2 className="sr-only">{wt('home.productsTitle')}</h2>
          <section
            aria-labelledby="home-analyse-title"
            data-home-product="analyse"
            className="flex min-w-0 flex-col rounded-cc-card border border-cc-line bg-cc-surface shadow-cc"
          >
            <div className="flex flex-col gap-1.5 px-4 pt-4 pb-2.5 min-[601px]:px-6 min-[601px]:pt-5 min-[601px]:pb-3.5">
              <span data-home-path-step="analyze">
                <ProductMark product="analyse" />
              </span>
              <h2 id="home-analyse-title" className="m-0 text-[16px] leading-snug font-extrabold tracking-[-0.015em] text-cc-ink min-[601px]:text-[18px]">
                {wt('home.analyse.title')}
              </h2>
              <p className="m-0 text-[13px] font-medium text-cc-ink-muted min-[601px]:text-[14px]">
                <span className="max-[600px]:hidden">{wt('home.path.analyze')}</span>
                <span className="min-[601px]:hidden">{wt('home.analyse.getsShort')}</span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  data-home-cost="analyse"
                  className="inline-flex items-center rounded-full border border-cc-neutral-border bg-cc-neutral-bg px-2 text-[12px] leading-5 font-semibold whitespace-nowrap text-cc-neutral"
                >
                  {wt('home.analyse.cost')}
                </span>
                <span className="text-[12px] font-semibold text-cc-ink-muted max-[600px]:hidden">
                  {homeAnalyseCostLine(runsLeftLabel(profile))}
                </span>
              </div>
            </div>
            <div
              data-home-start=""
              className="mt-auto grid grid-cols-1 border-t border-cc-line min-[1341px]:grid-cols-2"
            >
              <div data-home-way="example" className="flex min-w-0 flex-col px-4 py-3 min-[601px]:px-5 min-[601px]:py-4">
                <StarterExamples userId={userId} account={profile} variant="home" homePrimary={!fromDemo} starterRef={starter} />
              </div>
              <div className="min-w-0 border-t border-cc-line px-4 py-3 min-[601px]:px-5 min-[601px]:py-4 min-[1341px]:border-t-0 min-[1341px]:border-l">
                <OwnCodeWay profile={profile} />
              </div>
            </div>
          </section>

          <section
            aria-labelledby="home-redesign-title"
            data-home-product="redesign"
            className="flex min-w-0 flex-col rounded-cc-card border border-cc-line bg-cc-surface shadow-cc"
          >
            <div className="flex flex-col gap-1.5 px-4 pt-4 pb-2.5 min-[601px]:px-6 min-[601px]:pt-5 min-[601px]:pb-3.5">
              <ProductMark product="redesign" />
              <h2 id="home-redesign-title" className="m-0 text-[16px] leading-snug font-extrabold tracking-[-0.015em] text-cc-ink min-[601px]:text-[18px]">
                {wt('home.redesign.title')}
              </h2>
              <p className="m-0 text-[13px] font-medium text-cc-ink-muted min-[601px]:text-[14px]">
                <span className="max-[600px]:hidden">{wt('home.redesign.gets')}</span>
                <span className="min-[601px]:hidden">{wt('home.redesign.getsShort')}</span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  data-home-cost="redesign"
                  className="inline-flex items-center rounded-full border border-cc-success-border bg-cc-brand-surface px-2 text-[12px] leading-5 font-semibold whitespace-nowrap text-cc-brand-strong"
                >
                  {wt('home.redesign.cost')}
                </span>
                <span className="text-[12px] font-semibold text-cc-ink-muted max-[600px]:hidden">{wt('home.redesign.costMeta')}</span>
              </div>
            </div>
            <div className="px-4 min-[601px]:px-6">
              <ToolPathStrip />
            </div>
            <div className="mt-4 flex flex-col gap-2.5 border-t border-cc-line px-4 pt-3 pb-4 min-[601px]:mt-auto min-[601px]:px-6 min-[601px]:pt-4 min-[601px]:pb-5">
              <p className="m-0 text-[13px] font-medium text-cc-ink-muted">
                <b className="font-bold text-cc-ink">{wt('home.redesign.startsLead')}</b>
                {wt('home.redesign.startsRest')}
              </p>
              <ol className="m-0 grid list-none grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-1 p-0 text-[13px] font-medium text-cc-ink-muted">
                {[wt('home.redesign.how1'), wt('home.redesign.how2')].map((line, i) => (
                  <li key={i} className="contents">
                    <span
                      aria-hidden={true}
                      className="mt-px inline-flex size-5 items-center justify-center rounded-full border border-cc-field-border bg-cc-surface text-[11px] font-bold text-cc-ink-muted"
                    >
                      {i + 1}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-3">
                <CcButton variant="secondary" onClick={() => starter.current?.startRecommended('design')} data-home-redesign-example="">
                  <span>{wt('home.redesign.example')}</span>
                  <ArrowRight size={14} aria-hidden={true} />
                </CcButton>
                <span className="text-[12px] font-semibold text-cc-ink-muted">{homeRedesignExampleMeta(recommended, free)}</span>
              </div>
            </div>
          </section>
        </div>

        {fromDemo ? null : <DemoLine objectName={recommended} />}

        {/* The way into the portfolio stays where an account starts (roadmap
            3.0.21: every account sees it; the page says why it is closed
            without an own model key). */}
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-[12px] font-medium text-cc-ink-muted">
          <span>{wt('home.portfolioLead')}</span>
          <Link href="/portfolio" data-workspace-portfolio="" className={HOME_LINK}>
            {wt('portfolio.entry')}
            <ArrowRight size={14} aria-hidden={true} />
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Whether this browser has opened the demo — its own two keys, read only. */
function seenTheDemo(): boolean {
  try {
    return window.localStorage.getItem(DEMO_STORAGE_KEY) !== null || window.localStorage.getItem(TOUR_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
