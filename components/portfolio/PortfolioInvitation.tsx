'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ArrowRight, Mail } from 'lucide-react';
import { getAuth } from '@/lib/firebase';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { portfolioApi } from '@/lib/portfolio/client';
import { portfolioInvitationLinkPath, PORTFOLIO_LIMITS_SENTENCE_RECIPIENT, PORTFOLIO_SCOPE_SENTENCE_RECIPIENT } from '@/lib/portfolio/invitation-email';
import { signInLinkFor } from '@/lib/return-path';
import { formatTextDate } from '@/lib/format';
import { wt } from '@/lib/workspace-messages';

/**
 * The page a portfolio invitation link opens — roadmap 3.0.21 (4), the shape
 * of the project invitation page: nothing about the portfolio until the server
 * accepted the invitation for this signed-in, confirmed address; signed out it
 * sends the reader to sign-in and back here.
 */
export default function PortfolioInvitation({ selectionId, invitationId }: { selectionId: string; invitationId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [preview, setPreview] = useState<{ for: string; invitedBy: string; expiresAt: string } | null>(null);
  const [accepted, setAccepted] = useState<{ for: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = user ? `${user.uid}|${selectionId}|${invitationId}` : null;

  useEffect(
    () =>
      onAuthStateChanged(getAuth(), (u) => {
        setUser(u);
        setChecked(true);
      }),
    [],
  );

  useEffect(() => {
    if (!user) return;
    let live = true;
    portfolioApi
      .previewInvitation(selectionId, invitationId)
      .then((p) => live && setPreview({ for: `${user.uid}|${selectionId}|${invitationId}`, ...p }))
      .catch(() => {
        /* a courtesy; the button gives the reason */
      });
    return () => {
      live = false;
    };
  }, [user, selectionId, invitationId]);

  const accept = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await portfolioApi.acceptInvitation(selectionId, invitationId);
      setAccepted({ for: `${user.uid}|${selectionId}|${invitationId}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [user, selectionId, invitationId]);

  const shownPreview = preview && preview.for === key ? preview : null;
  const isAccepted = accepted && accepted.for === key;

  return (
    <div className="cc mx-auto w-full max-w-2xl px-4 py-6 sm:px-6" data-portfolio-invitation="">
      <CcCard density="cozy" title={wt('portfolio.invitationTitle')}>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink-muted">
            {PORTFOLIO_SCOPE_SENTENCE_RECIPIENT} {PORTFOLIO_LIMITS_SENTENCE_RECIPIENT}
          </p>
          {shownPreview ? (
            <p className="m-0 text-[13px] font-medium text-cc-ink" data-portfolio-invitation-preview="">
              {shownPreview.invitedBy} · {formatTextDate(shownPreview.expiresAt) ?? shownPreview.expiresAt}
            </p>
          ) : null}
          {isAccepted ? (
            <span>
              <CcLinkButton href={`/portfolio/shared/${selectionId}`} variant="primary" icon={<ArrowRight size={16} aria-hidden={true} />}>
                {wt('portfolio.invitationAccept')}
              </CcLinkButton>
            </span>
          ) : !checked ? (
            <p role="status" className="m-0 text-[13px] font-medium text-cc-ink-muted">
              {wt('portfolio.invitationOpening')}
            </p>
          ) : user ? (
            <span>
              <CcButton variant="primary" busy={busy} disabled={busy} onClick={() => void accept()} icon={<Mail size={16} aria-hidden={true} />} data-portfolio-invitation-accept="">
                {wt('portfolio.invitationAccept')}
              </CcButton>
            </span>
          ) : (
            <span>
              <CcLinkButton href={signInLinkFor(portfolioInvitationLinkPath(selectionId, invitationId))} variant="primary" icon={<ArrowRight size={16} aria-hidden={true} />}>
                {wt('portfolio.invitationAccept')}
              </CcLinkButton>
            </span>
          )}
          {error ? (
            <CcMessageStrip state="error" announce>
              {error}
            </CcMessageStrip>
          ) : null}
        </div>
      </CcCard>
    </div>
  );
}
