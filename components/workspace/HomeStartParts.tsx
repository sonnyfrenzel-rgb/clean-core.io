'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clipboard, PlayCircle, Upload, Workflow, Wrench } from 'lucide-react';
import type { UserProfile } from '@/hooks/useUserProfile';
import { OWN_KEY_ACTION, OWN_KEY_HREF, quotaExhausted, quotaSpentSentence, COMMUNITY_QUOTA_FALLBACK } from '@/lib/run-quota-rule';
import { leaveHomeStart } from '@/lib/home-start-handoff';
import { DEMO_WORKSPACE_ROUTE } from '@/lib/demo-marks';
import { homeDemoBody, wt } from '@/lib/workspace-messages';
import CcButton from '@/components/cc/Button';

/**
 * The pieces "My workspace" builds its two starts from (ADR-123): the product
 * mark, the own-code way, the demo line. Shared by the new account's pair of
 * product cards (`HomeFirstView`) and the returning account's start panel and
 * start tile (`WorkspaceTiles`), so the two say the same words in the same
 * shapes.
 */

/** Where the own-code start lives today — the file goes there, preset (H-O11). */
export const OWN_CODE_START_ROUTE = '/admin/new-project/upload';

/** Where "What happens to your code?" leads: the landing's trust section. */
export const CODE_SAFETY_HREF = '/#trust';

const LINK =
  'inline-flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-cc-ink underline decoration-cc-field-border underline-offset-[3px] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus';

/** The quiet text link of the mock-up (`.link`), 44 px tall on a phone. */
export const HOME_LINK = `${LINK} min-h-11 min-[601px]:min-h-0`;

/**
 * The two products' marks — a micro label and a 16 px icon in an outlined
 * square, the same shape and weight for both (workflow for Analyse, wrench for
 * Re-design).
 */
export function ProductMark({ product }: { product: 'analyse' | 'redesign' }) {
  const Icon = product === 'analyse' ? Workflow : Wrench;
  return (
    <span
      data-product-mark={product}
      className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-cc-ink uppercase"
    >
      <span aria-hidden={true} className="inline-flex size-6 items-center justify-center rounded-[6px] border border-cc-ink">
        <Icon size={14} />
      </span>
      {wt(product === 'analyse' ? 'home.analyse.mark' : 'home.redesign.mark')}
    </span>
  );
}

/**
 * "Upload your own code": a drop area, "Choose a file" and "Paste the code".
 * Nothing is read here — the file goes on to today's own-code start
 * (`lib/home-start-handoff.ts`), which checks it, counts it, asks edition and
 * cost and says whether the model is called, before anything runs. One calm
 * line about code safety, and no more (owner style rule).
 */
export function OwnCodeWay({
  profile,
  idPrefix = 'home',
  compact = false,
}: {
  profile: UserProfile | null;
  /** Keeps the heading's id unique where two of these could stand on one page. */
  idPrefix?: string;
  /** The start tile: only the two buttons and the cost line, no drop text. */
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
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

  const buttons = (
    <div className="flex flex-col items-stretch gap-1 min-[601px]:flex-row min-[601px]:flex-wrap min-[601px]:items-center min-[601px]:gap-3">
      <CcButton
        variant="ghost"
        icon={<Upload size={14} aria-hidden={true} />}
        onClick={() => inputRef.current?.click()}
        data-home-choose-file=""
      >
        {compact ? wt('home.ownTitle') : wt('home.chooseFile')}
      </CcButton>
      <button type="button" onClick={paste} data-home-paste="" className={HOME_LINK}>
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
  );

  const dropProps = {
    'data-home-drop': '',
    'data-dragging': dragging ? 'true' : 'false',
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      go(e.dataTransfer.files);
    },
  };
  const dropFrame = (extra: string) =>
    'flex flex-col gap-2.5 rounded-cc-row border-[1.5px] border-dashed ' +
    extra +
    ' ' +
    (dragging ? 'border-cc-information bg-cc-information-bg' : 'border-cc-field-border bg-cc-surface-muted');

  if (compact) {
    return (
      <div {...dropProps} className={dropFrame('px-3 py-2.5')}>
        {buttons}
      </div>
    );
  }

  return (
    <div data-home-way="own" className="flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${idPrefix}-own-title`} className="m-0 text-[14px] leading-snug font-bold text-cc-ink">
          {wt('home.ownTitle')}
        </h3>
      </div>
      {spent ? (
        <p data-home-own-line="" className="m-0 text-[13px] font-medium text-cc-ink-muted">
          {quotaSpentSentence(limit)}{' '}
          <Link href={OWN_KEY_HREF} data-own-key-link="" className={LINK}>
            {OWN_KEY_ACTION}
          </Link>
        </p>
      ) : null}
      <div {...dropProps} className={dropFrame('px-3.5 py-3')}>
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden={true}
            className="flex size-9 flex-none items-center justify-center rounded-cc-row border border-cc-line bg-cc-surface text-cc-ink"
          >
            <Upload size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-[14px] leading-snug font-bold text-cc-ink">
              <span className="max-[600px]:hidden">{wt('home.dropWide')}</span>
              <span className="min-[601px]:hidden">{wt('home.dropTouch')}</span>
            </b>
            <span className="text-[13px] font-medium text-cc-ink-muted max-[600px]:hidden">{wt('home.dropTypes')}</span>
          </div>
        </div>
        {buttons}
      </div>
      <p data-home-safe="" className="m-0 text-[12px] leading-normal font-medium text-cc-ink-muted">
        {wt('home.safe')}{' '}
        <Link href={CODE_SAFETY_HREF} className="font-semibold text-cc-ink underline decoration-cc-field-border underline-offset-[3px] hover:decoration-current">
          {wt('home.safeLink')}
        </Link>
      </p>
    </div>
  );
}

/** "Prefer to look first?" — the demo, as a line. */
export function DemoLine({ objectName }: { objectName: string }) {
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
        <b className="font-semibold text-cc-ink">{wt('home.demoAsk')}</b> {homeDemoBody(objectName)}
      </p>
      <Link href={DEMO_WORKSPACE_ROUTE} data-home-open-demo="" className={`${HOME_LINK} flex-none pl-11 min-[601px]:pl-0`}>
        {wt('home.openDemo')}
        <ArrowRight size={14} aria-hidden={true} />
      </Link>
    </div>
  );
}
