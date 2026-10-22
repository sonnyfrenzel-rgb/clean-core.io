'use client';

import React, { useCallback, useEffect, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { portfolioApi } from '@/lib/portfolio/client';
import { wt, portfolioWaitingSince } from '@/lib/workspace-messages';
import { formatTextDate } from '@/lib/format';

/**
 * Sharing a named selection — roadmap 3.0.21 (4): the e-mail-bound read
 * invitation, as for a project. The dialog says what is handed over and what
 * is not (the overview, not the source code) before anything is sent.
 */
export default function SharePanel({ selectionId }: { selectionId: string }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [list, setList] = useState<Awaited<ReturnType<typeof portfolioApi.sharing>> | null>(null);

  const reload = useCallback(async () => {
    try {
      setList(await portfolioApi.sharing(selectionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectionId]);

  // The parent keys this panel by the selection, so a new selection starts
  // from a fresh state; this only loads the list.
  useEffect(() => {
    let live = true;
    portfolioApi
      .sharing(selectionId)
      .then((l) => live && setList(l))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [selectionId]);

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    setSent(false);
    try {
      await portfolioApi.invite(selectionId, email.trim());
      setEmail('');
      setSent(true);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (invitationId: string) => {
    setError('');
    try {
      await portfolioApi.withdraw(selectionId, invitationId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <CcCard title={wt('portfolio.shareTitle')} level={2}>
      <div className="flex flex-col gap-3" data-portfolio-share={selectionId}>
        <p className="m-0 text-[13px] font-semibold text-cc-ink" data-portfolio-share-scope="">
          {wt('portfolio.shareScope')}
        </p>
        <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.shareLimits')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <CcField label={wt('portfolio.shareEmail')}>
              {(c) => (
                <input
                  id={c.id}
                  type="email"
                  value={email}
                  autoComplete="off"
                  aria-describedby={c.describedBy}
                  className={c.className}
                  data-portfolio-share-email=""
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </CcField>
          </div>
          <CcButton variant="primary" busy={busy} disabled={busy || !email.trim()} onClick={() => void invite()} data-portfolio-share-send="">
            {wt('portfolio.shareSend')}
          </CcButton>
        </div>
        {sent ? (
          <CcMessageStrip state="success" announce>
            {wt('portfolio.shareSent')}
          </CcMessageStrip>
        ) : null}
        {error ? (
          <CcMessageStrip state="error" announce>
            {error}
          </CcMessageStrip>
        ) : null}
        {list && list.waiting.length > 0 ? (
          <div>
            <h3 className="m-0 mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-cc-ink-muted">{wt('portfolio.shareWaiting')}</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {list.waiting.map((w) => (
                <li key={w.id} className="flex items-center gap-2 text-[12px] font-medium text-cc-ink">
                  <span className="min-w-0 flex-1 truncate">{w.email}</span>
                  <span className="text-cc-ink-muted">{portfolioWaitingSince(formatTextDate(w.expiresAt) ?? w.expiresAt)}</span>
                  <CcButton density="compact" variant="ghost" onClick={() => void withdraw(w.id)}>
                    {wt('portfolio.shareWithdraw')}
                  </CcButton>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {list && list.readers.length > 0 ? (
          <div>
            <h3 className="m-0 mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-cc-ink-muted">{wt('portfolio.shareReaders')}</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {list.readers.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-[12px] font-medium text-cc-ink">
                  <span className="min-w-0 flex-1 truncate">{r.email}</span>
                  <CcButton density="compact" variant="ghost" onClick={() => void withdraw(r.id)}>
                    {wt('portfolio.shareWithdraw')}
                  </CcButton>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </CcCard>
  );
}
