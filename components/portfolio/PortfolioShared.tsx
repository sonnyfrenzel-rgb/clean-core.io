'use client';

import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import CcCard from '@/components/cc/Card';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import PortfolioOverview from './PortfolioOverview';
import { portfolioApi, type OverviewState } from '@/lib/portfolio/client';
import { signInLinkFor } from '@/lib/return-path';
import { wt } from '@/lib/workspace-messages';

/**
 * A portfolio overview somebody shared with you — roadmap 3.0.21 (4). Read
 * only; computed on every visit from the projects the owner listed. A project
 * opens from here only if it was shared with you on its own.
 */
export default function PortfolioShared({ selectionId }: { selectionId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [answer, setAnswer] = useState<OverviewState | null>(null);
  const [error, setError] = useState('');

  useEffect(
    () =>
      onAuthStateChanged(getAuth(), (u) => {
        setUser(u);
        setChecked(true);
      }),
    [],
  );

  useEffect(() => {
    if (!user || !selectionId) return;
    let live = true;
    portfolioApi
      .overview(selectionId)
      .then((a) => live && setAnswer(a))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [user, selectionId]);

  return (
    <div className="cc min-h-screen bg-cc-page px-4 py-6 sm:px-6 print:bg-white print:p-0" data-cc-portfolio-shared="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div className="print:hidden">
          <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">
            {wt('portfolio.sharedTitle')}
            {answer?.name ? ` · ${answer.name}` : ''}
          </h1>
          <p className="m-0 mt-1 max-w-3xl text-[14px] font-medium text-cc-ink-muted">{wt('portfolio.sharedLead')}</p>
        </div>
        {checked && !user ? (
          <CcCard level={2}>
            <CcLinkButton href={signInLinkFor(`/portfolio/shared/${selectionId}`)} variant="primary">
              {wt('portfolio.invitationAccept')}
            </CcLinkButton>
          </CcCard>
        ) : null}
        {error ? (
          <CcMessageStrip state="error" announce>
            {error}
          </CcMessageStrip>
        ) : null}
        {user && !answer && !error ? (
          <p role="status" className="m-0 text-[13px] font-medium text-cc-ink-muted">
            {wt('portfolio.viewLoading')}
          </p>
        ) : null}
        {answer ? (
          <PortfolioOverview view={answer.view} openable={answer.openable} truncated={answer.truncated} title={answer.name ?? ''} />
        ) : null}
      </div>
    </div>
  );
}
