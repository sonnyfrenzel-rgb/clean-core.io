'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, X } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import TargetEditionChoice, { type TargetEdition } from '@/components/TargetEditionChoice';
import { readUploadedFile } from '@/lib/own-code-zip';
import type { OwnCodeFile } from '@/lib/own-code-import';
import { splitIntoPrograms } from '@/lib/portfolio/batch-split';
import { portfolioApi, uploadChunks, type BatchState } from '@/lib/portfolio/client';
import { PORTFOLIO_BATCH_MAX_PROGRAMS, PORTFOLIO_DAILY_MAX_PROGRAMS } from '@/lib/portfolio/limits';
import {
  wt,
  ownCodeIssueText,
  portfolioLimitsLine,
  portfolioProgress,
  portfolioReadySummary,
} from '@/lib/workspace-messages';
import { cn } from '@/lib/utils';

/**
 * The batch run — roadmap 3.0.21 (1).
 *
 * Files are read and cut into programs in this browser by the single import's
 * own readers (`lib/portfolio/batch-split.ts`); nothing leaves it before
 * "Start the batch". Then the programs go up in parts, the server queues them,
 * and this card works the queue step by step while it is open, showing what is
 * done, running, failed and why. Closing the page pauses the batch; opening it
 * again goes on.
 */

let seq = 0;

const STATUS_WORD: Record<BatchState['items'][number]['status'], Parameters<typeof wt>[0]> = {
  queued: 'portfolio.statusQueued',
  running: 'portfolio.statusRunning',
  done: 'portfolio.statusDone',
  failed: 'portfolio.statusFailed',
};

export default function BatchRun({
  current,
  onChange,
}: {
  /** The account's open batch, or the last one; `null` when there is none. */
  current: BatchState | null;
  /** Called when a batch was created, moved on or ended, so the overview reloads. */
  onChange: (state: BatchState | null, finished: boolean) => void;
}) {
  const [files, setFiles] = useState<OwnCodeFile[]>([]);
  const [reading, setReading] = useState(0);
  const [name, setName] = useState('');
  const [edition, setEdition] = useState<TargetEdition>('private');
  const [release, setRelease] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<BatchState | null>(current);
  const inputRef = useRef<HTMLInputElement>(null);
  const stepping = useRef(false);

  // The parent's batch replaces this card's copy when it changes (a reload,
  // another batch) — adjusted while rendering, not in an effect.
  const [shownCurrent, setShownCurrent] = useState<BatchState | null>(current);
  if (current !== shownCurrent) {
    setShownCurrent(current);
    setState(current);
  }

  const split = useMemo(() => splitIntoPrograms(files), [files]);
  const notReady = split.programs.filter((p) => !p.ready);
  const open = state && !state.progress.finished && state.batch.status !== 'cancelled';

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const chosen = Array.from(list);
    if (chosen.length === 0) return;
    setReading((n) => n + 1);
    try {
      const read = await Promise.all(chosen.map((f) => readUploadedFile(f, `pf${++seq}`)));
      setFiles((prev) => [...prev, ...read]);
    } finally {
      setReading((n) => n - 1);
    }
  }, []);

  // Work the queue while the page is open: one step at a time, never two.
  useEffect(() => {
    if (!state || !open || stepping.current) return;
    let live = true;
    stepping.current = true;
    (async () => {
      try {
        const before = state.progress.done + state.progress.failed;
        const next = await portfolioApi.step(state.batch.id);
        // A step that moved nothing (its programs are held by another tab, or
        // wait to be picked up again) is followed by a pause, not a burst.
        if (next.progress.done + next.progress.failed === before) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        if (!live) return;
        setState(next);
        onChange(next, next.progress.finished);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : String(err));
      } finally {
        stepping.current = false;
      }
    })();
    return () => {
      live = false;
    };
  }, [state, open, onChange]);

  const start = useCallback(async () => {
    if (busy || split.ready.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const chunks = uploadChunks(split.ready);
      const created = await portfolioApi.createBatch(
        { name: name.trim(), edition, release: edition === 'private' ? release : '', total: split.ready.length },
        chunks[0],
      );
      for (const chunk of chunks.slice(1)) await portfolioApi.append(created.batchId, chunk);
      const step = await portfolioApi.step(created.batchId);
      setFiles([]);
      setName('');
      setState(step);
      onChange(step, step.progress.finished);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [busy, split.ready, name, edition, release, onChange]);

  const cancel = useCallback(async () => {
    if (!state) return;
    setError('');
    try {
      const next = await portfolioApi.cancel(state.batch.id);
      setState(next);
      onChange(next, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [state, onChange]);

  const remove = useCallback(async () => {
    if (!state) return;
    setError('');
    try {
      await portfolioApi.removeBatch(state.batch.id);
      setState(null);
      onChange(null, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [state, onChange]);

  return (
    <CcCard title={wt('portfolio.batchTitle')} level={2}>
      <div className="flex flex-col gap-4" data-portfolio-batch="">
        <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('portfolio.batchLead')}</p>
        <p className="m-0 text-[12px] font-medium text-cc-ink-muted" data-portfolio-limits="">
          {portfolioLimitsLine(PORTFOLIO_BATCH_MAX_PROGRAMS, PORTFOLIO_DAILY_MAX_PROGRAMS)}
        </p>

        {open ? null : (
          <>
            <div
              data-portfolio-drop=""
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) void addFiles(e.dataTransfer.files);
              }}
              className="flex flex-col items-center justify-center gap-1 rounded-cc-card border-2 border-dashed border-cc-field-border bg-cc-surface px-4 py-6 text-center"
            >
              <Download size={20} aria-hidden={true} className="text-cc-ink" />
              <span className="text-[14px] font-semibold text-cc-ink">{wt('portfolio.drop')}</span>
              <span className="mt-2">
                <CcButton onClick={() => inputRef.current?.click()} data-portfolio-choose="">
                  {wt('portfolio.choose')}
                </CcButton>
              </span>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".abap,.txt,.zip"
                aria-label={wt('portfolio.choose')}
                className="hidden"
                data-portfolio-input=""
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            {reading > 0 ? <p role="status" className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.reading')}</p> : null}

            {split.programs.length > 0 || split.refused.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-[13px] font-semibold text-cc-ink" data-portfolio-split="">
                  {portfolioReadySummary(split.ready.length, notReady.length, split.overLimit.length)}
                </p>
                <ul className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto p-0">
                  {split.programs.map((p) => (
                    <li
                      key={p.name}
                      data-portfolio-program={p.name}
                      data-ready={p.ready ? 'yes' : 'no'}
                      className={cn('flex flex-col gap-0.5 rounded-cc-row border px-3 py-1', p.ready ? 'border-cc-line' : 'border-cc-error-border')}
                    >
                      <span className="flex items-center gap-2">
                        <code className="font-cc-mono text-[12px] text-cc-ink">{p.name}</code>
                        <span className="ml-auto text-[11px] font-medium text-cc-ink-muted">{p.objects.join(', ')}</span>
                      </span>
                      {p.issues.map((issue, i) => (
                        <span key={i} className="text-[11px] font-medium text-cc-ink-muted">
                          {ownCodeIssueText(issue)}
                        </span>
                      ))}
                    </li>
                  ))}
                  {split.refused.map((f) => (
                    <li key={`refused-${f.name}`} data-portfolio-refused={f.name} className="flex flex-col gap-0.5 rounded-cc-row border border-cc-line px-3 py-1">
                      <code className="font-cc-mono text-[12px] text-cc-ink">{f.name}</code>
                      {f.issues.map((issue, i) => (
                        <span key={i} className="text-[11px] font-medium text-cc-ink-muted">
                          {ownCodeIssueText(issue)}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <CcField label={wt('portfolio.batchName')} help={wt('portfolio.batchNameHelp')}>
                      {(c) => (
                        <input
                          id={c.id}
                          type="text"
                          value={name}
                          maxLength={120}
                          aria-describedby={c.describedBy}
                          className={c.className}
                          data-portfolio-batch-name=""
                          onChange={(e) => setName(e.target.value)}
                        />
                      )}
                    </CcField>
                  </div>
                  <CcButton icon={<X size={14} aria-hidden={true} />} onClick={() => setFiles([])} disabled={busy}>
                    {wt('portfolio.clear')}
                  </CcButton>
                </div>
                <div className="rounded-cc-card border border-cc-line bg-cc-surface p-3">
                  <TargetEditionChoice value={edition} onChange={setEdition} disabled={busy} release={release} onReleaseChange={setRelease} />
                </div>
                <div>
                  <CcButton
                    variant="primary"
                    busy={busy}
                    disabled={busy || reading > 0 || split.ready.length === 0}
                    onClick={() => void start()}
                    data-portfolio-start=""
                  >
                    {busy ? wt('portfolio.starting') : wt('portfolio.start')}
                  </CcButton>
                </div>
              </div>
            ) : null}
          </>
        )}

        {error ? (
          <CcMessageStrip state="error" announce>
            {error}
          </CcMessageStrip>
        ) : null}

        {state ? (
          <section aria-labelledby="portfolio-progress" className="flex flex-col gap-2" data-portfolio-progress={state.batch.id}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="portfolio-progress" className="m-0 text-[13px] font-semibold text-cc-ink">
                {wt('portfolio.progressTitle')} · {state.batch.name}
              </h3>
              <span className="text-[12px] font-medium text-cc-ink" role="status" data-portfolio-progress-line="">
                {portfolioProgress(state.progress)}
              </span>
              <span className="ml-auto flex gap-2">
                {open ? (
                  <CcButton density="compact" onClick={() => void cancel()} data-portfolio-cancel="">
                    {wt('portfolio.cancel')}
                  </CcButton>
                ) : (
                  <CcButton density="compact" variant="ghost" onClick={() => void remove()} data-portfolio-remove="">
                    {wt('portfolio.removeRecord')}
                  </CcButton>
                )}
              </span>
            </div>
            {open ? <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.progressLead')}</p> : null}
            {open ? <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.cancelConfirm')}</p> : null}
            <ul className="m-0 flex max-h-96 list-none flex-col gap-1 overflow-y-auto p-0">
              {state.items.map((item) => (
                <li
                  key={item.id}
                  data-portfolio-item={item.name}
                  data-status={item.status}
                  className="flex flex-col gap-0.5 rounded-cc-row border border-cc-line px-3 py-1"
                >
                  <span className="flex items-center gap-2">
                    <code className="font-cc-mono text-[12px] text-cc-ink">{item.name}</code>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-cc-ink-muted">{wt(STATUS_WORD[item.status])}</span>
                    {item.projectId ? (
                      <Link href={`/project/${item.projectId}`} className="ml-auto text-[12px] font-semibold text-cc-brand-strong underline underline-offset-2">
                        {wt('portfolio.openProject')}
                      </Link>
                    ) : null}
                  </span>
                  {item.reason ? <span className="text-[12px] font-medium text-cc-error">{item.reason}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.noBatch')}</p>
        )}
      </div>
    </CcCard>
  );
}
