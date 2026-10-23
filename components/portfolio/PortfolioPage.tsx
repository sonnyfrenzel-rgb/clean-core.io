'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { KeyRound } from 'lucide-react';
import { getAuth } from '@/lib/firebase';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcCheckbox from '@/components/cc/Checkbox';
import CcField from '@/components/cc/Field';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSelect from '@/components/cc/Select';
import BatchRun from './BatchRun';
import PortfolioOverview from './PortfolioOverview';
import SharePanel from './SharePanel';
import type { PortfolioAccess } from '@/lib/portfolio/access';
import { portfolioApi, type BatchState, type OverviewState, type SelectionSummary } from '@/lib/portfolio/client';
import { wt } from '@/lib/workspace-messages';

/**
 * The portfolio — roadmap 3.0.21: batch run, aggregated view, exports and
 * sharing, on one Object Page.
 *
 * Open only to an account whose own model key is stored and tested; without
 * it the page says why and leads to Settings, and draws nothing else
 * (`GET /api/portfolio/access`; every route asks again for itself).
 */

const ALL = '__all__';

export default function PortfolioPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [access, setAccess] = useState<PortfolioAccess | null>(null);
  const [accessError, setAccessError] = useState('');
  const [current, setCurrent] = useState<BatchState | null>(null);
  const [scope, setScope] = useState<string>(ALL);
  const [selections, setSelections] = useState<SelectionSummary[]>([]);
  const [loaded, setLoaded] = useState<{ key: string; answer: OverviewState | null; error: string } | null>(null);
  const [allPrograms, setAllPrograms] = useState<{ projectId: string; name: string }[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [selectionName, setSelectionName] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionUpdated, setSelectionUpdated] = useState(false);
  const [shareVersion, setShareVersion] = useState(0);

  useEffect(
    () =>
      onAuthStateChanged(getAuth(), (u) => {
        setUser(u);
        setAuthChecked(true);
      }),
    [],
  );

  useEffect(() => {
    if (!user) return;
    let live = true;
    (async () => {
      try {
        const a = await portfolioApi.access();
        if (!live) return;
        setAccess(a);
        if (!a.open) return;
        const [{ batches }, { selections: s }] = await Promise.all([portfolioApi.batches(), portfolioApi.selections()]);
        if (!live) return;
        setCurrent(batches.find((b) => !b.progress.finished && b.batch.status !== 'cancelled') ?? batches[0] ?? null);
        setSelections(s);
      } catch (err) {
        if (live) setAccessError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [user]);

  // What the overview card shows is the answer for the key it was asked for;
  // until that answer arrives, the card says it is reading.
  const requestKey = `${scope}|${reloadKey}`;
  const viewLoading = Boolean(access?.open) && loaded?.key !== requestKey;
  const overview = loaded?.key === requestKey ? loaded.answer : null;
  const viewError = loaded?.key === requestKey ? loaded.error : '';

  useEffect(() => {
    if (!access?.open) return;
    let live = true;
    const key = `${scope}|${reloadKey}`;
    (async () => {
      try {
        const answer = await portfolioApi.overview(scope === ALL ? undefined : scope);
        if (!live) return;
        setLoaded({ key, answer, error: '' });
        if (scope === ALL) setAllPrograms(answer.view.programs.map((p) => ({ projectId: p.projectId, name: p.name })));
      } catch (err) {
        if (live) setLoaded({ key, answer: null, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      live = false;
    };
  }, [access, scope, reloadKey]);

  // Memoised: the batch card re-runs its step loop when this changes.
  const onBatchChange = useCallback((state: BatchState | null, finished: boolean) => {
    setCurrent(state);
    if (finished) setReloadKey((k) => k + 1);
  }, []);

  const scopeOptions = useMemo(
    () => [{ value: ALL, label: wt('portfolio.scopeAll') }, ...selections.map((s) => ({ value: s.id, label: s.name }))],
    [selections],
  );

  const saveSelection = async () => {
    setSelectionBusy(true);
    setSelectionError('');
    try {
      const { selection } = await portfolioApi.createSelection(selectionName.trim(), [...pick]);
      setSelections((prev) => [selection, ...prev]);
      setSelectionName('');
      setPick(new Set(selection.projectIds));
      setSelectionUpdated(false);
      setScope(selection.id);
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSelectionBusy(false);
    }
  };

  // Choosing a named selection ticks its projects, so the owner edits the
  // list in place; "all projects" starts from an empty pick again.
  const chooseScope = (next: string) => {
    setScope(next);
    setSelectionUpdated(false);
    setSelectionError('');
    setPick(new Set(next === ALL ? [] : selections.find((s) => s.id === next)?.projectIds ?? []));
  };

  const updateSelection = async () => {
    if (scope === ALL) return;
    setSelectionBusy(true);
    setSelectionError('');
    setSelectionUpdated(false);
    try {
      const { projectIds } = await portfolioApi.updateSelection(scope, [...pick]);
      setSelections((prev) => prev.map((s) => (s.id === scope ? { ...s, projectIds } : s)));
      setPick(new Set(projectIds));
      setSelectionUpdated(true);
      setReloadKey((k) => k + 1);
      setShareVersion((v) => v + 1);
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSelectionBusy(false);
    }
  };

  const programNames = useMemo(() => Object.fromEntries(allPrograms.map((p) => [p.projectId, p.name])), [allPrograms]);

  const deleteSelection = async () => {
    if (scope === ALL) return;
    setSelectionError('');
    try {
      await portfolioApi.deleteSelection(scope);
      setSelections((prev) => prev.filter((s) => s.id !== scope));
      chooseScope(ALL);
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : String(err));
    }
  };

  const batchProjects = useMemo(
    () => (current ? current.items.map((i) => i.projectId).filter((id): id is string => Boolean(id)) : []),
    [current],
  );

  const scopeName = scope === ALL ? wt('portfolio.scopeAll') : selections.find((s) => s.id === scope)?.name ?? '';

  return (
    <div className="cc min-h-screen bg-cc-page px-4 py-6 sm:px-6 print:bg-white print:p-0" data-cc-portfolio="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4 print:hidden">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">{wt('portfolio.title')}</h1>
            <p className="m-0 mt-1 max-w-3xl text-[14px] font-medium text-cc-ink-muted">{wt('portfolio.lead')}</p>
          </div>
          <span className="ml-auto">
            <CcLinkButton href="/dashboard" density="cozy">
              {wt('portfolio.backToWorkspace')}
            </CcLinkButton>
          </span>
        </div>

        {!authChecked || (user && !access && !accessError) ? (
          <p role="status" className="m-0 text-[13px] font-medium text-cc-ink-muted">
            {wt('portfolio.loading')}
          </p>
        ) : null}

        {accessError ? (
          <CcMessageStrip state="error" announce>
            {accessError}
          </CcMessageStrip>
        ) : null}

        {access && !access.open ? (
          <div data-portfolio-closed={access.reason}>
            <CcMessageStrip
              state="information"
              headline={wt('portfolio.closedTitle')}
              actions={
                <CcLinkButton href="/settings" variant="primary" density="cozy" icon={<KeyRound size={14} aria-hidden={true} />}>
                  {wt('portfolio.settingsLink')}
                </CcLinkButton>
              }
            >
              {access.message}
            </CcMessageStrip>
          </div>
        ) : null}

        {access?.open ? (
          <>
            <div className="print:hidden">
              <BatchRun current={current} onChange={onBatchChange} />
            </div>

            <CcCard
              title={wt('portfolio.viewTitle')}
              level={2}
              actions={
                <span className="flex flex-wrap items-center gap-2 print:hidden">
                  <CcSelect<string>
                    label={wt('portfolio.scope')}
                    value={scope}
                    options={scopeOptions}
                    onChange={chooseScope}
                    data-portfolio-scope=""
                  />
                  {scope !== ALL ? (
                    <CcButton density="compact" variant="ghost" onClick={() => void deleteSelection()}>
                      {wt('portfolio.selectionDelete')}
                    </CcButton>
                  ) : null}
                </span>
              }
            >
              <p className="m-0 mb-3 text-[12px] font-medium text-cc-ink-muted print:hidden">{wt('portfolio.notSigned')}</p>
              {viewLoading ? (
                <p role="status" className="m-0 text-[13px] font-medium text-cc-ink-muted">
                  {wt('portfolio.viewLoading')}
                </p>
              ) : viewError ? (
                <CcMessageStrip state="error" headline={wt('portfolio.viewFailed')} announce>
                  {viewError}
                </CcMessageStrip>
              ) : overview && overview.view.coverage.projects === 0 ? (
                <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('portfolio.viewEmpty')}</p>
              ) : overview ? (
                <PortfolioOverview view={overview.view} openable={overview.openable} truncated={overview.truncated} title={scopeName} />
              ) : null}
            </CcCard>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:hidden">
              <CcCard title={wt('portfolio.selectionTitle')} level={2}>
                <div className="flex flex-col gap-3" data-portfolio-selection-editor="">
                  <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.selectionLead')}</p>
                  <CcField label={wt('portfolio.selectionName')}>
                    {(c) => (
                      <input
                        id={c.id}
                        type="text"
                        value={selectionName}
                        maxLength={120}
                        aria-describedby={c.describedBy}
                        className={c.className}
                        data-portfolio-selection-name=""
                        onChange={(e) => setSelectionName(e.target.value)}
                      />
                    )}
                  </CcField>
                  {batchProjects.length > 0 ? (
                    <span>
                      <CcButton density="compact" onClick={() => setPick(new Set(batchProjects))} data-portfolio-from-batch="">
                        {wt('portfolio.selectionFromBatch')}
                      </CcButton>
                    </span>
                  ) : null}
                  <fieldset className="m-0 max-h-64 overflow-y-auto border-0 p-0">
                    <legend className="mb-1 text-[13px] font-semibold text-cc-ink">{wt('portfolio.selectionPick')}</legend>
                    {allPrograms.map((p) => (
                      <CcCheckbox
                        key={p.projectId}
                        label={p.name}
                        checked={pick.has(p.projectId)}
                        onChange={(next) =>
                          setPick((prev) => {
                            const out = new Set(prev);
                            if (next) out.add(p.projectId);
                            else out.delete(p.projectId);
                            return out;
                          })
                        }
                      />
                    ))}
                  </fieldset>
                  {selectionError ? (
                    <CcMessageStrip state="error" announce>
                      {selectionError}
                    </CcMessageStrip>
                  ) : null}
                  {selectionUpdated ? (
                    <CcMessageStrip state="success" announce>
                      {wt('portfolio.selectionUpdated')}
                    </CcMessageStrip>
                  ) : null}
                  <span className="flex flex-wrap gap-2">
                    {scope !== ALL ? (
                      <CcButton
                        busy={selectionBusy}
                        disabled={selectionBusy || pick.size === 0}
                        onClick={() => void updateSelection()}
                        data-portfolio-selection-update=""
                      >
                        {wt('portfolio.selectionUpdate')}
                      </CcButton>
                    ) : null}
                    <CcButton
                      variant="primary"
                      busy={selectionBusy}
                      disabled={selectionBusy || !selectionName.trim() || pick.size === 0}
                      onClick={() => void saveSelection()}
                      data-portfolio-selection-save=""
                    >
                      {wt('portfolio.selectionSave')}
                    </CcButton>
                  </span>
                </div>
              </CcCard>

              {scope !== ALL ? (
                <SharePanel key={`${scope}|${shareVersion}`} selectionId={scope} names={programNames} />
              ) : (
                <CcCard title={wt('portfolio.shareTitle')} level={2}>
                  <p className="m-0 text-[13px] font-medium text-cc-ink-muted" data-portfolio-share-needs-selection="">
                    {wt('portfolio.shareNeedsSelection')}
                  </p>
                </CcCard>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
