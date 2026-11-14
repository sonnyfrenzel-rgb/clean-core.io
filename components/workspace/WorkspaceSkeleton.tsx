import React from 'react';
import { t } from '@/lib/cc-messages';
import { wt } from '@/lib/workspace-messages';

/**
 * What "My workspace" shows while the profile and the programs load (ADR-123,
 * mock-up state "Loading"): the page header at its final place, then grey
 * blocks with the final sizes of the next-step card, the count tiles and three
 * program tiles — no shimmer (motion only explains a change), no old page
 * swapped in, so nothing moves when the real content arrives (CLS 0).
 *
 * The header is the returning account's: a new account's first view replaces
 * the whole frame once both lists answered empty, which is a new view, not a
 * shift of this one.
 */
function Bar({ w, h, className = '' }: { w: string; h: number; className?: string }) {
  return <span className={`block rounded-[6px] bg-cc-line ${className}`} style={{ width: w, height: `${h}px` }} />;
}

export default function WorkspaceSkeleton() {
  return (
    <div className="cc min-h-screen bg-cc-page" data-workspace-waiting="" data-workspace-skeleton="">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 pb-6 min-[601px]:gap-6">
        <p className="sr-only" role="status">
          {wt('ws.loading')}
        </p>
        <div aria-hidden={true} className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Bar w="140px" h={14} />
            <h1 className="cc-text-title m-0 text-cc-ink">{t('workspace.title')}</h1>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 min-[601px]:flex min-[601px]:w-auto">
            <Bar w="100%" h={40} className="min-[601px]:!w-[230px]" />
            <Bar w="100%" h={40} className="min-[601px]:!w-[190px]" />
          </div>
        </div>
        <div aria-hidden={true} className="flex h-[98px] items-center gap-4 rounded-cc-card border border-cc-line bg-cc-surface px-5">
          <Bar w="120px" h={64} className="flex-none rounded-cc-row max-[600px]:hidden" />
          <span className="flex flex-1 flex-col gap-2">
            <Bar w="20%" h={10} />
            <Bar w="50%" h={16} />
            <Bar w="70%" h={12} />
          </span>
        </div>
        <div aria-hidden={true} className="grid grid-cols-3 gap-2 min-[601px]:grid-cols-5 min-[601px]:gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={'flex h-[96px] flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3.5 ' + (i > 2 ? 'max-[600px]:hidden' : '')}>
              <Bar w="60%" h={12} />
              <Bar w="30%" h={24} />
            </div>
          ))}
        </div>
        <div aria-hidden={true} className="grid grid-cols-1 gap-3 min-[601px]:grid-cols-2 min-[601px]:gap-4 min-[1181px]:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={'flex min-h-[372px] flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface px-[18px] py-4 ' + (i > 0 ? 'max-[600px]:hidden' : '')}>
              <Bar w="70%" h={18} />
              <Bar w="45%" h={12} />
              <Bar w="100%" h={118} className="mt-1.5 rounded-cc-row" />
              <Bar w="100%" h={44} className="mt-1.5 rounded-cc-row" />
              <Bar w="100%" h={36} className="mt-2.5" />
              <Bar w="100%" h={36} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
