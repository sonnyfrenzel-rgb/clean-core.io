'use client';

import React, { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clipboard, PlayCircle, Upload } from 'lucide-react';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import type { UserProfile } from '@/hooks/useUserProfile';
import { describeRunCost, startModelLine } from '@/lib/run-cost';
import {
  COMMUNITY_QUOTA_FALLBACK,
  OWN_KEY_ACTION,
  OWN_KEY_HREF,
  quotaExhausted,
  quotaSpentSentence,
  runsAreSelfFunded,
  runsLeftLabel,
} from '@/lib/run-quota-rule';
import { leaveHomeStart } from '@/lib/home-start-handoff';
import type { HomeMapSlice } from '@/lib/home-map-slice';
import { DEMO_WORKSPACE_ROUTE } from '@/lib/demo-marks';
import {
  homeOwnCost,
  homeOwnLine,
  homeSliceLabel,
  homeSliceLead,
  homeWelcome,
  wt,
} from '@/lib/workspace-messages';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import StarterExamples from '@/components/StarterExamples';
import ToolPathStrip from './ToolPathStrip';

/** bpmn-js needs a DOM and is large: the slice loads in the browser, after the page. */
const MapSlice = dynamic(() => import('@/components/process-map/MapSlice'), { ssr: false });

/** Where the own-code start lives today — the file goes there, preset (H-O11). */
export const OWN_CODE_START_ROUTE = '/admin/new-project/upload';

/**
 * "My workspace" for an account with no project yet — AB-14a, the first view of
 * home mockup v2.1 (state 1), accepted by the owner on 06.11.2026.
 *
 * It says what happens before anything is asked: one program in, its process as
 * a map out, every step with its line. Then the start itself, built into the
 * page (H-O11) with two ways side by side:
 *
 *   - **Try an example** — the shipped examples of `lib/starter-examples.ts`,
 *     `Z_MM_PO_APPROVAL` recommended with the page's only filled button (H-O15),
 *     started by `StarterExamples` exactly as the gallery starts them.
 *   - **Analyse your own program** — a drop area, "Choose a file" and "Paste the
 *     code". Nothing is read here: the file goes on to today's own-code start
 *     (`lib/home-start-handoff.ts`), which checks it, counts it and asks edition
 *     and cost as it always has. Beside it, what you get: a live slice of the
 *     demo map (H-O1, `lib/home-map-slice.ts`), drawn by the Analyze map's
 *     renderer.
 *
 * Above them the path of the seven tools (`ToolPathStrip`): Analyze is a
 * complete result on its own; re-design is optional. Below, the demo for a
 * reader who prefers to look first. No duration is claimed (H-O2 is not
 * measured yet).
 *
 * The page stops being this view with the first project: a returning account
 * sees the list (`WorkspaceListReport`). Nothing here writes anything.
 */
export default function HomeFirstView({
  userId,
  profile,
  slice,
}: {
  userId: string;
  profile: UserProfile | null;
  slice: HomeMapSlice | null;
}) {
  return (
    <div className="cc min-h-screen bg-cc-page" data-cc-workspace="" data-home-first-view="">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 pt-5 pb-10 min-[601px]:px-6 min-[1101px]:px-8 min-[1101px]:pt-7">
        <div data-home-intro="" className="max-[600px]:order-0">
          <p className="m-0 text-[13px] font-semibold text-cc-ink-muted">{homeWelcome(profile?.firstName)}</p>
          <h1 className="cc-text-title mt-2 mb-0 text-cc-ink">
            {wt('home.title')}
          </h1>
          <p className="mt-2 mb-0 max-w-[760px] text-[14px] leading-[1.6] font-medium text-cc-ink-muted min-[601px]:text-[15px]">
            {wt('home.lead')}
          </p>
        </div>

        <div className="max-[600px]:order-2">
          <ToolPathStrip />
        </div>

        <section
          aria-labelledby="home-start-title"
          data-home-start=""
          className="grid grid-cols-1 overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface shadow-cc max-[600px]:order-1 min-[768px]:grid-cols-2"
        >
          <h2 id="home-start-title" className="sr-only">
            {wt('home.startTitle')}
          </h2>
          <div data-home-way="example" className="flex min-w-0 flex-col p-4 min-[601px]:px-6 min-[601px]:py-5">
            <StarterExamples
              userId={userId}
              account={profile}
              variant="home"
              homeFooter={
                <div className="mt-auto hidden min-[768px]:block">
                  <DemoLine />
                </div>
              }
            />
          </div>
          <OwnProgramWay profile={profile} slice={slice} />
        </section>

        <div className="min-[768px]:hidden max-[600px]:order-3">
          <DemoLine />
        </div>
      </div>
    </div>
  );
}

function DemoLine() {
  return (
    <div
      data-home-demo=""
      className="flex flex-wrap items-center gap-3 rounded-cc-card border border-cc-line bg-cc-surface-muted px-4 py-3 min-[601px]:flex-nowrap"
    >
      <span
        aria-hidden={true}
        className="flex size-8 flex-none items-center justify-center rounded-cc-row border border-cc-line bg-cc-surface text-cc-ink"
      >
        <PlayCircle size={16} />
      </span>
      <p className="m-0 min-w-0 flex-[1_1_calc(100%-44px)] text-[13px] leading-normal font-medium text-cc-ink-muted min-[601px]:flex-1">
        <b className="font-semibold text-cc-ink">{wt('home.demoAsk')}</b> {wt('home.demoBody')}
      </p>
      <Link
        href={DEMO_WORKSPACE_ROUTE}
        data-home-open-demo=""
        className="inline-flex min-h-11 flex-none items-center gap-1 pl-11 text-[13px] font-semibold text-cc-ink underline decoration-cc-field-border underline-offset-[3px] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus min-[601px]:min-h-0 min-[601px]:pl-0"
      >
        {wt('home.openDemo')}
        <ArrowRight size={14} aria-hidden={true} />
      </Link>
    </div>
  );
}

function OwnProgramWay({ profile, slice }: { profile: UserProfile | null; slice: HomeMapSlice | null }) {
  const router = useRouter();
  const model = useModelAvailability();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // The same two sentences the start says before the click (`OwnCodeImport`): what it costs, and the model.
  const startCallsModel = model.enabled('analyze') && model.autoModelSteps;
  const cost = describeRunCost({ profile, metered: true, callsModel: startCallsModel });
  const limit = typeof profile?.transformationsLimit === 'number' ? profile.transformationsLimit : COMMUNITY_QUOTA_FALLBACK;
  const spent = quotaExhausted(profile);

  const go = (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    leaveHomeStart({ kind: 'files', files: list });
    router.push(OWN_CODE_START_ROUTE);
  };
  const paste = () => {
    leaveHomeStart({ kind: 'paste' });
    router.push(OWN_CODE_START_ROUTE);
  };

  return (
    <div
      data-home-way="own"
      className="flex min-w-0 flex-col gap-3 border-t border-cc-line p-4 min-[601px]:px-6 min-[601px]:py-5 min-[768px]:border-t-0 min-[768px]:border-l"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="cc-text-h2 m-0 text-cc-ink">{wt('home.ownTitle')}</h3>
        <span
          data-home-cost="own"
          className="inline-flex items-center rounded-full border border-cc-neutral-border bg-cc-neutral-bg px-2 py-px text-[12px] leading-[18px] font-semibold whitespace-nowrap text-cc-ink-muted"
        >
          {homeOwnCost(limit, runsAreSelfFunded(profile))}
        </span>
      </div>
      <p data-home-own-line="" className="-mt-1 mb-0 text-[13px] font-medium text-cc-ink-muted">
        {spent ? quotaSpentSentence(limit) : homeOwnLine(runsLeftLabel(profile))}
      </p>
      {spent ? (
        <span>
          <CcLinkButton href={OWN_KEY_HREF} variant="ghost" data-own-key-link="">
            {OWN_KEY_ACTION}
          </CcLinkButton>
        </span>
      ) : null}

      <div
        data-home-drop=""
        data-dragging={dragging ? 'true' : 'false'}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          go(e.dataTransfer.files);
        }}
        className={
          'flex flex-col items-stretch gap-3 rounded-cc-card border-[1.5px] border-dashed p-4 min-[601px]:p-5 ' +
          (dragging ? 'border-cc-information bg-cc-information-bg' : 'border-cc-field-border bg-cc-surface-muted')
        }
      >
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden={true}
            className="flex size-11 flex-none items-center justify-center rounded-cc-row border border-cc-line bg-cc-surface text-cc-ink"
          >
            <Upload size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-cc-ink">
              <span className="max-[600px]:hidden">{wt('home.dropWide')}</span>
              <span className="min-[601px]:hidden">{wt('home.dropTouch')}</span>
            </div>
            <div className="mt-1 text-[13px] font-medium text-cc-ink-muted">{wt('home.dropTypes')}</div>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-1 min-[601px]:flex-row min-[601px]:flex-wrap min-[601px]:items-center min-[601px]:gap-3">
          <CcButton
            variant="ghost"
            density="cozy"
            icon={<Upload size={16} aria-hidden={true} />}
            onClick={() => inputRef.current?.click()}
            data-home-choose-file=""
          >
            {wt('home.chooseFile')}
          </CcButton>
          <button
            type="button"
            onClick={paste}
            data-home-paste=""
            className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-cc-ink underline decoration-cc-field-border underline-offset-[3px] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus min-[601px]:min-h-0"
          >
            <Clipboard size={14} aria-hidden={true} />
            {wt('home.paste')}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".abap,.txt,.zip"
            className="hidden"
            aria-label={wt('home.chooseFile')}
            data-home-file-input=""
            onChange={(e) => {
              go(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <p className="-mt-1 mb-0 text-[13px] leading-[1.55] font-medium text-cc-ink-muted">{wt('home.noFile')}</p>

      {slice ? (
        <div data-home-what-you-get="" className="flex flex-col gap-2">
          <p className="m-0 text-[12px] leading-normal font-medium text-cc-ink-muted">
            <b className="font-semibold text-cc-ink">{wt('home.whatYouGet')}</b> {homeSliceLead(slice.objectName)}
          </p>
          <div className="w-full max-w-[340px] rounded-cc-card border border-cc-line bg-cc-surface px-2 pt-2">
            <MapSlice
              xml={slice.xml}
              elements={slice.elements}
              label={homeSliceLabel(slice.objectName, slice.elements)}
            />
          </div>
          <span>
            <CcProvenanceChip value="reconstructed" />
          </span>
        </div>
      ) : null}

      <p data-home-own-note="" className="mt-auto mb-0 text-[12px] leading-normal font-medium text-cc-ink-muted">
        {cost.quota} {startModelLine(startCallsModel)} {wt('home.ownNote')}
      </p>
      {/* The way into the portfolio stays where an account starts (roadmap
          3.0.21: every account sees it; the page says why it is closed
          without an own model key). */}
      <p className="m-0 flex flex-wrap items-center gap-x-2 text-[12px] font-medium text-cc-ink-muted">
        <span>{wt('home.portfolioLead')}</span>
        <Link
          href="/portfolio"
          data-workspace-portfolio=""
          className="inline-flex min-h-11 items-center gap-1 font-semibold text-cc-ink underline decoration-cc-field-border underline-offset-[3px] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus min-[601px]:min-h-0"
        >
          {wt('portfolio.entry')}
          <ArrowRight size={14} aria-hidden={true} />
        </Link>
      </p>
    </div>
  );
}
