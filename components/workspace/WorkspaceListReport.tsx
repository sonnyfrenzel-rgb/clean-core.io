'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { ChevronRight, Play, Plus, ShieldAlert } from 'lucide-react';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { t } from '@/lib/cc-messages';
import { describeRunCost, type RunCost } from '@/lib/run-cost';
import { DEMO_LIST_TAGLINE, DEMO_PROJECT_TITLE, DEMO_ROUTE, DEMO_TAG } from '@/lib/demo-marks';
import {
  applyWorkspaceFilter,
  filterIsActive,
  statusesPresent,
  toWorkspaceRow,
  EMPTY_FILTER,
  type WorkspaceFilter,
  type WorkspaceRow,
} from '@/lib/workspace-rows';
import { objectStatus } from '@/lib/object-status';
import {
  AnalysisRunCancelled,
  runAnalysis,
  runScope,
  type AnalysisRunStage,
} from '@/lib/analysis-run';
import type { Project } from '@/lib/types';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcField from '@/components/cc/Field';
import CcFilterBar from '@/components/cc/FilterBar';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcObjectIdentifier from '@/components/cc/ObjectIdentifier';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcRunIndicator, { CcRunCost } from '@/components/cc/RunIndicator';
import CcTable, { type CcTableColumn, type CcTableRowSpec } from '@/components/cc/Table';
import CcTag from '@/components/cc/Tag';
import { CcEmptyState, CcNoMatches } from '@/components/cc/EmptyState';

/**
 * "My workspace" as a List Report — roadmap 1.8, `DESIGN.md` §2.2, mockup s7.
 *
 * A list report is the screen a product flatters itself on. Eight columns, a
 * green tick in each, a percentage at the end, and nobody checks a table. So the
 * rule this screen is built to is the opposite one: **every column can say that
 * nothing has happened, and says it in words.** A project nobody has analysed
 * has no finding count — not a zero — and its status is *not started*, which is
 * one of the ten values of `lib/object-status.ts` and not a phrase invented
 * here.
 *
 * Four things that are easy to get wrong and are decided here:
 *
 *   - **Empty and no-matches are two different states**, and two different
 *     components (§2.4). "No projects match these filters" after a filter and
 *     "No projects yet" before the first one look different, say different
 *     things, and only one of them offers *Clear filters*. An empty state shown
 *     after a filter tells somebody their work is gone.
 *   - **The demo is the first row and is not an achievement.** Roadmap 0.10
 *     builds it `proven: false` on purpose: it produces no signed run and runs
 *     no test. Its status here is *partial*, never *handed over*, whatever the
 *     mockup drew.
 *   - **A run started from a row is a real run**, through `lib/analysis-run.ts`
 *     — the same sequence the Analyze stage runs — with its price on screen
 *     before the click (§2.8) and its stages, not a percentage, while it goes.
 *   - **Cancel says what it reaches.** It aborts this page's two requests. It
 *     does not stop the server, and `run.cancelReach` says so next to the
 *     button rather than in a changelog.
 *
 * Nothing here is switched on for anybody. The screen is mounted behind the
 * admin gate until roadmap 1.4's switch exists; see
 * `app/(app)/admin/workspace/page.tsx`.
 */

/** What the demo contributes to the table. Computed on the server, passed in. */
export interface WorkspaceDemoRow {
  lines: number;
  findings: number;
}

type RunCell =
  | { phase: 'running'; stages: AnalysisRunStage[] }
  | { phase: 'failed'; message: string }
  | undefined;

const COLUMNS: readonly CcTableColumn[] = [
  { key: 'project', label: t('workspace.colProject') },
  { key: 'lines', label: t('workspace.colLines'), numeric: true, width: '110px' },
  { key: 'findings', label: t('workspace.colFindings'), numeric: true, width: '110px' },
  { key: 'status', label: t('workspace.colStatus'), width: '260px' },
  { key: 'lastChange', label: t('workspace.colLastChange'), numeric: true, width: '130px' },
  { key: 'actions', label: t('workspace.colActions'), action: true, width: '210px' },
];

const number = (value: number) => new Intl.NumberFormat('en').format(value);

/** A figure with no measurement behind it prints a word, never a dash or a zero. */
function Absent({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] font-medium text-cc-ink-muted">{children}</span>;
}

export default function WorkspaceListReport({ demo }: { demo: WorkspaceDemoRow }) {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const modelAvailability = useModelAvailability();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<(Project & { id: string })[]>([]);
  const [filter, setFilter] = useState<WorkspaceFilter>(EMPTY_FILTER);
  const [runs, setRuns] = useState<Record<string, RunCell>>({});
  const controllers = useRef<Record<string, AbortController>>({});

  useEffect(() => onAuthStateChanged(getAuth(), (u) => setUser(u)), []);

  // The same query the dashboard runs, for the same reason: a workspace is this
  // account's projects, newest first, and the demo is not one of them.
  useEffect(() => {
    if (!user) return undefined;
    const q = query(
      collection(getDb(), 'projects'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(25),
    );
    const take = (docs: { id: string; data: () => unknown }[]) =>
      setProjects(docs.map((d) => ({ ...(d.data() as Project), id: d.id })));
    getDocs(q)
      .then((snap) => take(snap.docs))
      .catch(() => undefined);
    return onSnapshot(
      q,
      (snap) => take(snap.docs),
      (error) => handleFirestoreError(error, OperationType.LIST, 'projects'),
    );
  }, [user]);

  const ownRows = useMemo(() => projects.map(toWorkspaceRow), [projects]);

  const demoRow: WorkspaceRow = useMemo(
    () => ({
      id: 'demo',
      name: DEMO_PROJECT_TITLE,
      identifier: DEMO_LIST_TAGLINE,
      isDemo: true,
      lines: demo.lines,
      linesFromRun: false,
      findings: demo.findings,
      // Roadmap 0.10 marks every phase of the demo `proven: false`. Partial is
      // what that is: work on record that nothing verified.
      status: 'partial',
      statusDetail: t('workspace.demoStatus'),
      stale: null,
      lastChange: null,
      hasSource: false,
      href: DEMO_ROUTE,
    }),
    [demo.lines, demo.findings],
  );

  const allRows = useMemo(() => [demoRow, ...ownRows], [demoRow, ownRows]);
  const shownRows = useMemo(() => applyWorkspaceFilter(allRows, filter), [allRows, filter]);
  const active = filterIsActive(filter);

  const clear = useCallback(() => setFilter(EMPTY_FILTER), []);
  const setSearch = useCallback((search: string) => setFilter((f) => ({ ...f, search })), []);

  const costFor = useCallback(
    (callsModel: boolean): RunCost =>
      describeRunCost({ profile, metered: true, callsModel }),
    [profile],
  );

  const start = useCallback(
    async (row: WorkspaceRow, callModel: boolean) => {
      const project = projects.find((p) => p.id === row.id);
      if (!project || typeof project.legacyCode !== 'string') return;
      const controller = new AbortController();
      // The controller lives in a ref, not in the state cell: aborting is a side
      // effect and a state updater is not where React allows one.
      controllers.current[row.id] = controller;
      setRuns((prev) => ({ ...prev, [row.id]: { phase: 'running', stages: [] } }));
      try {
        await runAnalysis({
          projectId: row.id,
          legacyCode: project.legacyCode,
          fileName: project.auditMetadata?.inputFingerprint?.fileName || 'main.abap',
          deployment: project.s4Deployment === 'public' ? 'public' : 'private',
          callModel,
          signal: controller.signal,
          onStages: (stages) =>
            setRuns((prev) => {
              const cell = prev[row.id];
              if (!cell || cell.phase !== 'running') return prev;
              return { ...prev, [row.id]: { ...cell, stages } };
            }),
        });
        setRuns((prev) => ({ ...prev, [row.id]: undefined }));
      } catch (err) {
        if (err instanceof AnalysisRunCancelled) {
          setRuns((prev) => ({ ...prev, [row.id]: undefined }));
          return;
        }
        setRuns((prev) => ({
          ...prev,
          [row.id]: { phase: 'failed', message: err instanceof Error ? err.message : String(err) },
        }));
      }
    },
    [projects, profile],
  );

  const cancel = useCallback((id: string) => {
    controllers.current[id]?.abort();
    delete controllers.current[id];
    setRuns((prev) => ({ ...prev, [id]: undefined }));
  }, []);

  if (profileLoading) {
    return (
      <div className="mx-auto my-12 max-w-md text-center text-[13px] font-medium text-cc-ink-muted">
        {t('state.loading')}
      </div>
    );
  }

  // The gate roadmap 1.5 used for the design-system gallery, for the same
  // reason: roadmap 1.4 builds the real switch, this screen must not build a
  // second one, and until then nothing about a community account changes.
  if (!profile || !profile.isAdmin) {
    return (
      <div className="mx-auto my-12 max-w-md rounded-cc-card border border-cc-error-border bg-cc-surface p-8 text-center shadow-cc">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-cc-card border border-cc-error-border bg-cc-error-bg text-cc-error">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="mb-2 text-[15px] font-bold text-cc-ink">Access denied</h2>
        <p className="text-[13px] leading-relaxed font-medium text-cc-ink-muted">
          This page is restricted to Clean-Core.io system administrators.
        </p>
      </div>
    );
  }

  const runnable = (row: WorkspaceRow) => !row.isDemo && row.hasSource;

  const tableRows: CcTableRowSpec[] = shownRows.map((row) => {
    const cell = runs[row.id];

    const identifier = (
      <Link href={row.href} data-workspace-open={row.id} className="min-w-0">
        <CcObjectIdentifier
          title={row.name}
          identifier={row.identifier}
          meta={row.isDemo ? <CcTag>{DEMO_TAG}</CcTag> : null}
        />
      </Link>
    );

    const base: CcTableRowSpec = {
      key: row.id,
      cells: {
        project: identifier,
        lines:
          row.lines === null ? (
            <Absent>{t('workspace.notStaged')}</Absent>
          ) : (
            <span data-workspace-lines={row.linesFromRun ? 'run' : 'staged'}>
              {number(row.lines)}
            </span>
          ),
        findings:
          row.findings === null ? (
            <Absent>{t('workspace.notAnalysed')}</Absent>
          ) : (
            <span data-workspace-findings="">{number(row.findings)}</span>
          ),
        status: (
          <span className="flex flex-col items-start gap-1">
            <CcObjectStatus value={row.status} />
            {row.stale ? <CcProvenanceChip value="stale" note={row.stale.note} /> : null}
            <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">
              {row.statusDetail}
            </span>
          </span>
        ),
        lastChange: row.lastChange ? (
          <span className="font-cc-mono text-[12px]">{row.lastChange}</span>
        ) : (
          <Absent>{row.isDemo ? t('workspace.demoLastChange') : t('workspace.noDate')}</Absent>
        ),
        actions: (
          <span className="flex flex-col items-stretch gap-1.5 sm:items-end">
            {runnable(row) && !cell ? (
              <>
                <CcButton
                  variant="secondary"
                  onClick={() => start(row, modelAvailability.enabled('analyze'))}
                  data-workspace-run={row.id}
                >
                  {modelAvailability.enabled('analyze')
                    ? t('action.runAnalysis')
                    : t('action.runWithoutModel')}
                </CcButton>
                <CcRunCost cost={costFor(modelAvailability.enabled('analyze'))} />
              </>
            ) : null}
            <Link
              href={row.href}
              aria-label={`${t('action.open')} ${row.name}`}
              className="inline-flex items-center justify-center gap-1 self-start text-[12px] font-semibold text-cc-ink-muted sm:self-end"
            >
              {t('action.open')}
              <ChevronRight size={14} aria-hidden={true} />
            </Link>
          </span>
        ),
      },
      note: undefined,
    };

    if (cell?.phase === 'running') {
      base.span = (
        <div className="flex flex-col gap-2">
          <CcRunIndicator
            scope={runScope(projects.find((p) => p.id === row.id)?.legacyCode || '')}
            stages={cell.stages}
            onCancel={() => cancel(row.id)}
            survivesLeaving={false}
          />
          {/* §2.8: a cancel that does not say what it cannot reach is a claim. */}
          <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">
            {t('run.cancelReach')}
          </span>
        </div>
      );
      base.cells.actions = null;
    }

    if (cell?.phase === 'failed') {
      base.note = (
        <CcMessageStrip
          state="error"
          headline={t('run.failed')}
          announce
          actions={
            <>
              <CcButton
                variant="ghost"
                onClick={() => start(row, modelAvailability.enabled('analyze'))}
                data-workspace-retry={row.id}
              >
                {t('action.retry')}
              </CcButton>
              <CcButton
                variant="secondary"
                onClick={() => start(row, false)}
                data-workspace-without-model={row.id}
              >
                {t('action.runWithoutModel')}
              </CcButton>
            </>
          }
        >
          {cell.message}
        </CcMessageStrip>
      );
    }

    return base;
  });

  return (
    <div className="cc min-h-screen bg-cc-page px-4 py-6 sm:px-6" data-cc-workspace="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div>
          <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">
            {t('workspace.title')}
          </h1>
          <p className="mt-0.5 text-[13px] font-medium text-cc-ink-muted">{t('workspace.lead')}</p>
        </div>

        {ownRows.length === 0 ? (
          <CcCard density="cozy">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-cc-ink-muted">
                <Play size={20} aria-hidden={true} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-[14px] font-bold text-cc-ink" data-workspace-your-turn="">
                  {t('workspace.yourTurn')}
                </h2>
                <p className="mt-0.5 text-[13px] leading-snug font-medium text-cc-ink-muted">
                  {t('workspace.yourTurnBody')}
                </p>
              </div>
              <CcButton
                variant="primary"
                icon={<Plus size={16} aria-hidden={true} />}
                // Roadmap 2.7 built the screen this invitation was always meant
                // to open: "New project" explains before it starts (§6.1.1).
                // Until then it pointed at `/dashboard`, which is the old
                // product and answers none of the three questions §6.1.1 asks.
                onClick={() => router.push('/admin/new-project')}
                data-workspace-new-project=""
              >
                {t('workspace.newProject')}
              </CcButton>
            </div>
          </CcCard>
        ) : null}

        <CcCard title={t('workspace.projects')} level={2} count={shownRows.length} density="cozy">
          {/* Nothing to filter while the demo is the only row, which is also what
              mockup s7 draws for a new account. */}
          {ownRows.length > 0 ? (
            <div className="mb-3">
              <CcFilterBar
                noun={t('workspace.noun')}
                shown={shownRows.length}
                total={allRows.length}
                search={filter.search}
                onSearch={setSearch}
                active={active}
                onClear={clear}
              >
                <CcField label={t('workspace.filterStatus')}>
                  {(control) => (
                    <select
                      id={control.id}
                      value={filter.status}
                      onChange={(event) =>
                        setFilter((f) => ({ ...f, status: event.target.value }))
                      }
                      className={control.className}
                    >
                      <option value="">{t('workspace.anyStatus')}</option>
                      {statusesPresent(allRows).map((value) => (
                        <option key={value} value={value}>
                          {objectStatus(value).label}
                        </option>
                      ))}
                    </select>
                  )}
                </CcField>
              </CcFilterBar>
            </div>
          ) : null}

          {shownRows.length === 0 ? (
            <CcNoMatches
              title={t('workspace.noMatch')}
              reason={t('workspace.noMatchReason')}
              onClear={clear}
            />
          ) : (
            <CcTable caption={t('workspace.projects')} columns={COLUMNS} rows={tableRows} />
          )}

          {shownRows.length > 0 && ownRows.length === 0 ? (
            <div className="mt-3">
              {/* The reader's own list is empty. The row above is the demo and
                  says so; this says what the reader does not have yet. The one
                  action for it is the primary in the card above — §1.5 allows
                  one per region. */}
              <CcEmptyState title={t('workspace.emptyTitle')}>
                {t('workspace.emptyBody')}
              </CcEmptyState>
            </div>
          ) : null}

          <p className="mt-2.5 text-[12px] leading-snug font-medium text-cc-ink-muted">
            {t('workspace.demoNote')}
          </p>
        </CcCard>
      </div>
    </div>
  );
}
