'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { ArrowDownUp, Plus } from 'lucide-react';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { useWorkspaceRowFacts } from '@/hooks/useWorkspaceRowFacts';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import { t, showAllLabel, showFirstLabel } from '@/lib/cc-messages';
import {
  deleteProjectSentence,
  rulesConfirmedLabel,
  rowFindingsLabel,
  rowLinesLabel,
  rowRulesLabel,
  showingRowsLabel,
  wt,
} from '@/lib/workspace-messages';
import { describeRunCost, type RunCost } from '@/lib/run-cost';
import { saveAs } from '@/lib/fileSaver';
import { DEMO_LIST_TAGLINE, DEMO_PROJECT_TITLE, DEMO_TAG, DEMO_WORKSPACE_ROUTE } from '@/lib/demo-marks';
import {
  applyWorkspaceFilter,
  filterIsActive,
  sortWorkspaceRows,
  stagesPresent,
  toWorkspaceRow,
  EMPTY_FILTER,
  type WorkspaceFilter,
  type WorkspaceRow,
  type WorkspaceSort,
} from '@/lib/workspace-rows';
import { ROW_LEVELS, rowHasLevel, type RowFacts, type RowLevels } from '@/lib/workspace-row-facts';
import { projectProgress, PROJECT_STAGE_LABEL } from '@/lib/project-progress';
import ProjectProgressCell, { ProgressLegend } from '@/components/ProjectProgress';
import { AnalysisRunCancelled, runAnalysis, runScope, type AnalysisRunStage } from '@/lib/analysis-run';
import { declaredTargetOf } from '@/lib/assessment-target';
import type { Project } from '@/lib/types';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcFilterBar from '@/components/cc/FilterBar';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcObjectIdentifier from '@/components/cc/ObjectIdentifier';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcRunIndicator, { CcRunCost } from '@/components/cc/RunIndicator';
import CcSelect from '@/components/cc/Select';
import CcTable, { type CcTableColumn, type CcTableRowSpec } from '@/components/cc/Table';
import CcTag from '@/components/cc/Tag';
import { CcEmptyState, CcNoMatches } from '@/components/cc/EmptyState';
import InviteReaderDialog from '@/components/InviteReaderDialog';
import StarterExamples from '@/components/StarterExamples';
import LevelCounts from './LevelCounts';
import OpenInvitations from './OpenInvitations';
import WorkspaceRowActions from './WorkspaceRowActions';
import YourTurnCard, { yourTurnItems } from './YourTurnCard';

/**
 * "My workspace" — the one list of projects, `DESIGN.md` §2.2, mockup s7.
 *
 * Since 01.10.2026 this is the only "My workspace": `/dashboard` renders it for
 * every account with the 3.0 interface switched on (`app/(app)/dashboard/
 * layout.tsx`), and `/admin/workspace`, where it grew, redirects there. The old
 * dashboard stays for the other accounts until 3.0, and everything it did per
 * project is here too (ADR-052): open, run, invite, duplicate, export, the
 * deliverables and delete.
 *
 * The rule this screen is built to: **every column can say that nothing has
 * happened, and says it in words.** A project nobody has analysed has no
 * finding count and no levels — not a zero — and its status is *not started*,
 * one of the ten values of `lib/object-status.ts`.
 *
 *   - **Levels and Rules confirmed** come from the same two routes the
 *     workspace reads (`lib/workspace-row-facts.ts`), only for the rows on
 *     screen. Neither is stored: the level is never part of a run or the audit
 *     pack.
 *   - **Shared with me** are the projects another account invited this one to
 *     read (roadmap 5.4) — read access only, so they offer open and nothing
 *     else. Sharing is by invitation to one confirmed address; there are no
 *     public links, and this page offers none.
 *   - **The demo is the first row and is not an achievement.** It produces no
 *     signed run and runs no test: its status is *partial*, its rules are 0
 *     confirmed, whatever the mockup drew.
 *   - **A run started from a row is a real run**, through `lib/analysis-run.ts`,
 *     with its price on screen before the click (§2.8), its stages while it
 *     goes, and a Cancel that says what it does not reach.
 */

/** What the demo contributes to the table. Computed on the server, passed in. */
export interface WorkspaceDemoRow {
  lines: number;
  findings: number;
  /** The demo's levels, from the same engine pass as its IT view. */
  levels: RowLevels | null;
  /** Rules the engine derived from the demo source. None is confirmed — it is a demo. */
  rules: number;
}

type RunCell =
  | { phase: 'running'; stages: AnalysisRunStage[] }
  | { phase: 'failed'; message: string }
  | undefined;

type ListedProject = Project & { id: string };

/** §2.11: the first five rows, and "Show all". */
const FIRST_ROWS = 5;

const COLUMNS: readonly CcTableColumn[] = [
  { key: 'project', label: t('workspace.colProject') },
  { key: 'lines', label: t('workspace.colLines'), numeric: true, width: '76px' },
  { key: 'findings', label: t('workspace.colFindings'), numeric: true, width: '88px' },
  { key: 'levels', label: wt('myWorkspace.colLevels'), width: '172px' },
  { key: 'rules', label: wt('myWorkspace.colRules'), numeric: true, width: '120px' },
  { key: 'status', label: t('workspace.colStatus'), width: '240px' },
  { key: 'lastChange', label: t('workspace.colLastChange'), numeric: true, width: '112px' },
  { key: 'actions', label: t('workspace.colActions'), action: true, width: '96px' },
];

const number = (value: number) => new Intl.NumberFormat('en').format(value);

/** A figure with no measurement behind it prints a word, never a dash or a zero. */
function Absent({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] font-medium text-cc-ink-muted">{children}</span>;
}

function LevelsCell({ facts }: { facts: RowFacts['levels'] | undefined }) {
  if (!facts) return <Absent>{t('workspace.notAnalysed')}</Absent>;
  if (facts.state === 'loading') return <Absent>{wt('myWorkspace.reading')}</Absent>;
  if (facts.state === 'absent') return <Absent>{facts.reason}</Absent>;
  return <LevelCounts levels={facts.value} />;
}

function RulesCell({ facts }: { facts: RowFacts['rules'] | undefined }) {
  if (!facts) return <Absent>{t('workspace.notAnalysed')}</Absent>;
  if (facts.state === 'loading') return <Absent>{wt('myWorkspace.reading')}</Absent>;
  if (facts.state === 'absent') return <Absent>{facts.reason}</Absent>;
  return (
    <span data-workspace-rules={`${facts.value.confirmed}/${facts.value.total}`}>
      {rulesConfirmedLabel(facts.value.confirmed, facts.value.total)}
    </span>
  );
}

const DEMO_ID = 'demo';

export default function WorkspaceListReport({ demo }: { demo: WorkspaceDemoRow }) {
  const router = useRouter();
  const isS = useBreakpointS();
  const { profile, loading: profileLoading } = useUserProfile();
  const modelAvailability = useModelAvailability();
  const [user, setUser] = useState<User | null>(null);
  // Rows carry the account that loaded them: after a sign-out, or a switch to
  // another account, the previous account's projects are not shown while the
  // new query runs (QA full review of v2.20.0).
  const [loaded, setLoaded] = useState<{ uid: string; rows: ListedProject[] } | null>(null);
  const [sharedLoaded, setSharedLoaded] = useState<{ uid: string; rows: ListedProject[] } | null>(null);
  const projects = useMemo(
    () => (loaded && user && loaded.uid === user.uid ? loaded.rows : []),
    [loaded, user],
  );
  const shared = useMemo(
    () => (sharedLoaded && user && sharedLoaded.uid === user.uid ? sharedLoaded.rows : []),
    [sharedLoaded, user],
  );
  const [filter, setFilter] = useState<WorkspaceFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<WorkspaceSort>('last-change');
  const [showAll, setShowAll] = useState(false);
  const [runs, setRuns] = useState<Record<string, RunCell>>({});
  const controllers = useRef<Record<string, AbortController>>({});
  const [inviting, setInviting] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(getAuth(), (u) => setUser(u)), []);

  // A workspace is this account's projects, newest first; the demo is not one
  // of them.
  useEffect(() => {
    if (!user) return undefined;
    const q = query(
      collection(getDb(), 'projects'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(25),
    );
    const uid = user.uid;
    const take = (docs: { id: string; data: () => unknown }[]) =>
      setLoaded({ uid, rows: docs.map((d) => ({ ...(d.data() as Project), id: d.id })) });
    // The one-shot read only fills the list until the listener has spoken: an
    // older answer arriving after a snapshot would replace newer rows, and
    // nothing would correct it until the next change.
    let live = false;
    getDocs(q)
      .then((snap) => {
        if (!live) take(snap.docs);
      })
      .catch(() => undefined);
    return onSnapshot(
      q,
      (snap) => {
        live = true;
        take(snap.docs);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'projects'),
    );
  }, [user]);

  // Shared with me — the projects whose `readers` carry this account (roadmap
  // 5.4). The server names them (`/api/shared-projects`: a list query on
  // `readers` cannot be proven against the read rule), and each one is then
  // read here through the rules, document by document. A revocation ends the
  // listener with permission-denied and the row goes, at the rules.
  useEffect(() => {
    if (!user) return undefined;
    const uid = user.uid;
    let alive = true;
    const stops: Array<() => void> = [];
    const rows = new Map<string, ListedProject>();
    const publish = () => {
      if (alive) setSharedLoaded({ uid, rows: [...rows.values()] });
    };
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/shared-projects', { headers: { Authorization: `Bearer ${token}` } });
        const body = (await res.json().catch(() => null)) as { ids?: unknown } | null;
        const ids = res.ok && Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((i): i is string => typeof i === 'string') : [];
        if (!alive) return;
        if (ids.length === 0) publish();
        for (const id of ids) {
          stops.push(
            onSnapshot(
              doc(getDb(), 'projects', id),
              (snap) => {
                if (snap.exists()) rows.set(id, { ...(snap.data() as Project), id });
                else rows.delete(id);
                publish();
              },
              () => {
                rows.delete(id);
                publish();
              },
            ),
          );
        }
      } catch {
        // A failed read of the shared list must not take the own list with it.
        publish();
      }
    })();
    return () => {
      alive = false;
      for (const stop of stops) stop();
    };
  }, [user]);

  // Leaving the list ends the analyses it started: nothing is left to show
  // them, and a run nobody can cancel should not keep going.
  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of Object.values(running)) controller.abort();
    };
  }, []);

  const ownRows = useMemo(() => projects.map((p) => toWorkspaceRow(p, 'own')), [projects]);
  const sharedRows = useMemo(
    // A project the account owns and also reads is listed once, as its own.
    () => shared.filter((p) => !projects.some((own) => own.id === p.id)).map((p) => toWorkspaceRow(p, 'shared')),
    [shared, projects],
  );

  const demoRow: WorkspaceRow = useMemo(
    () => ({
      id: DEMO_ID,
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
      href: DEMO_WORKSPACE_ROUTE,
      access: 'own',
      hasRun: false,
      fromExample: false,
      stage: null,
    }),
    [demo.lines, demo.findings],
  );

  const allRows = useMemo(() => [demoRow, ...ownRows, ...sharedRows], [demoRow, ownRows, sharedRows]);
  const projectById = useMemo(() => {
    const map = new Map<string, ListedProject>();
    for (const p of [...projects, ...shared]) map.set(p.id, p);
    return map;
  }, [projects, shared]);

  // Which rows have levels and rules to read: analysed ones, on screen. A level
  // filter needs them all, or it would hide a project for being slow.
  const candidateRows = useMemo(
    () => allRows.filter((row) => !row.isDemo && row.hasSource && row.hasRun),
    [allRows],
  );
  const sortedAll = useMemo(() => sortWorkspaceRows(allRows, sort), [allRows, sort]);
  const [facts, setWanted] = useFactsFor();

  const demoFacts: RowFacts = useMemo(
    () => ({
      levels: demo.levels ? { state: 'ready', value: demo.levels } : { state: 'absent', reason: wt('myWorkspace.levelsNone') },
      rules:
        demo.rules > 0
          ? { state: 'ready', value: { confirmed: 0, total: demo.rules } }
          : { state: 'absent', reason: wt('myWorkspace.rulesNotCounted') },
    }),
    [demo.levels, demo.rules],
  );
  const factsOf = useCallback(
    (row: WorkspaceRow): RowFacts | undefined => (row.isDemo ? demoFacts : facts[row.id]),
    [demoFacts, facts],
  );

  const shownRows = useMemo(
    () =>
      applyWorkspaceFilter(sortedAll, filter, (row, level) =>
        rowHasLevel(factsOf(row), level as CloudReadinessGrade),
      ),
    [sortedAll, filter, factsOf],
  );
  const visibleRows = useMemo(
    () => (showAll ? shownRows : shownRows.slice(0, FIRST_ROWS)),
    [showAll, shownRows],
  );

  useEffect(() => {
    const ids = filter.level ? candidateRows : candidateRows.filter((r) => visibleRows.some((v) => v.id === r.id));
    const map = new Map<string, string>();
    for (const row of ids) {
      const p = projectById.get(row.id);
      map.set(row.id, `${p?.activeRunId ?? ''}:${typeof p?.legacyCode === 'string' ? p.legacyCode.length : 0}`);
    }
    setWanted(map);
  }, [candidateRows, visibleRows, filter.level, projectById, setWanted]);

  const active = filterIsActive(filter);
  const clear = useCallback(() => setFilter(EMPTY_FILTER), []);
  const setSearch = useCallback((search: string) => setFilter((f) => ({ ...f, search })), []);

  const costFor = useCallback(
    (callsModel: boolean): RunCost => describeRunCost({ profile, metered: true, callsModel }),
    [profile],
  );

  const start = useCallback(
    async (row: WorkspaceRow, callModel: boolean) => {
      const project = projects.find((p) => p.id === row.id);
      if (!project || typeof project.legacyCode !== 'string') return;
      // Synchronous, before anything awaits: a second activation of Run that
      // lands before the first `running` state has rendered must not start a
      // second pipeline for the same project.
      if (controllers.current[row.id]) return;
      const controller = new AbortController();
      controllers.current[row.id] = controller;
      /** Only the run that owns the row's controller may write the row. */
      const owns = () => controllers.current[row.id] === controller;
      setRuns((prev) => ({ ...prev, [row.id]: { phase: 'running', stages: [] } }));
      try {
        await runAnalysis({
          projectId: row.id,
          legacyCode: project.legacyCode,
          fileName: project.auditMetadata?.inputFingerprint?.fileName || 'main.abap',
          deployment: project.s4Deployment === 'public' ? 'public' : 'private',
          // Roadmap 7.10 - the declaration the project's last run was made under.
          targetProfile: declaredTargetOf(project),
          callModel,
          signal: controller.signal,
          onStages: (stages) => {
            if (!owns()) return;
            setRuns((prev) => {
              const cell = prev[row.id];
              if (!cell || cell.phase !== 'running') return prev;
              return { ...prev, [row.id]: { ...cell, stages } };
            });
          },
        });
        if (owns()) setRuns((prev) => ({ ...prev, [row.id]: undefined }));
      } catch (err) {
        if (!owns()) return;
        if (err instanceof AnalysisRunCancelled) {
          setRuns((prev) => ({ ...prev, [row.id]: undefined }));
          return;
        }
        setRuns((prev) => ({
          ...prev,
          [row.id]: { phase: 'failed', message: err instanceof Error ? err.message : String(err) },
        }));
      } finally {
        if (owns()) delete controllers.current[row.id];
      }
    },
    [projects],
  );

  const cancel = useCallback((id: string) => {
    controllers.current[id]?.abort();
    delete controllers.current[id];
    setRuns((prev) => ({ ...prev, [id]: undefined }));
  }, []);

  // The owner's actions the old dashboard had per project (ADR-052).
  const duplicate = useCallback(
    async (row: WorkspaceRow) => {
      const project = projects.find((p) => p.id === row.id);
      if (!project || !user) return;
      setActionError(null);
      try {
        await addDoc(collection(getDb(), 'projects'), {
          name: `${project.name} - Copy`,
          status: 'uploaded',
          legacyCode: project.legacyCode || '',
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        setActionError(wt('myWorkspace.duplicateFailed'));
        handleFirestoreError(error, OperationType.WRITE, 'projects');
      }
    },
    [projects, user],
  );

  const exportJson = useCallback(
    async (row: WorkspaceRow) => {
      const project = projects.find((p) => p.id === row.id);
      if (!project) return;
      const { id: _id, userId: _userId, ...data } = project as ListedProject & { userId?: string };
      void _id;
      void _userId;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      await saveAs(blob, `${project.name.replace(/\s+/g, '_')}_export.json`);
    },
    [projects],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    setActionError(null);
    try {
      // Deleted on the server, so the immutable runs and every invitation under
      // the project go with it — Firestore does not cascade a client delete.
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) throw new Error(wt('myWorkspace.deleteFailed'));
      const res = await fetch(`/api/projects/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || wt('myWorkspace.deleteFailed'));
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : wt('myWorkspace.deleteFailed'));
    }
  }, [deleting]);

  const yourTurn = useMemo(
    () => yourTurnItems(ownRows, projects, profile ?? null),
    [ownRows, projects, profile],
  );

  if (profileLoading) {
    return (
      <div className="mx-auto my-12 max-w-md text-center text-[13px] font-medium text-cc-ink-muted">
        {t('state.loading')}
      </div>
    );
  }

  const runnable = (row: WorkspaceRow) => !row.isDemo && row.access === 'own' && row.hasSource;

  const phoneCards: React.ReactNode[] = [];
  const tableRows: CcTableRowSpec[] = visibleRows.map((row) => {
    const cell = runs[row.id];
    const rowFacts = factsOf(row);
    const analysed = row.isDemo || row.hasRun;
    const ownerLine =
      row.access === 'shared' ? (
        <span className="inline-flex flex-wrap items-center gap-1">
          <CcTag>{wt('myWorkspace.sharedTag')}</CcTag>
          <span className="text-[12px] font-medium text-cc-ink-muted">{wt('myWorkspace.sharedLine')}</span>
        </span>
      ) : row.isDemo ? (
        <CcTag>{DEMO_TAG}</CcTag>
      ) : null;

    const identifier = (
      <Link href={row.href} data-workspace-open={row.id} data-workspace-access={row.isDemo ? 'demo' : row.access} className="min-w-0">
        <CcObjectIdentifier title={row.name} identifier={row.identifier} meta={ownerLine} />
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
            <span data-workspace-lines={row.linesFromRun ? 'run' : 'staged'}>{number(row.lines)}</span>
          ),
        findings:
          row.findings === null ? (
            <Absent>{t('workspace.notAnalysed')}</Absent>
          ) : (
            <span data-workspace-findings="">{number(row.findings)}</span>
          ),
        levels: analysed ? <LevelsCell facts={rowFacts?.levels} /> : <Absent>{t('workspace.notAnalysed')}</Absent>,
        rules: analysed ? <RulesCell facts={rowFacts?.rules} /> : <Absent>{t('workspace.notAnalysed')}</Absent>,
        status: (
          <span className="flex w-full flex-col items-start gap-1">
            {row.isDemo ? (
              // The demo is nobody's project and has no steps of its own: one
              // plain sentence, never a status it did not earn.
              <span className="text-[13px] leading-snug font-semibold text-cc-ink" data-project-sentence="">
                {wt('myWorkspace.demoSentence')}
              </span>
            ) : (
              <ProjectProgressCell
                progress={projectProgress(projectById.get(row.id) ?? null)}
                projectHref={`/project/${row.id}`}
                id={row.id}
              />
            )}
            {row.stale ? <CcProvenanceChip value="stale" note={row.stale.note} /> : null}
            {runnable(row) && !cell ? (
              <span className="mt-1 flex flex-col items-start gap-1">
                <CcButton
                  variant="secondary"
                  onClick={() => start(row, modelAvailability.enabled('analyze'))}
                  data-workspace-run={row.id}
                >
                  {modelAvailability.enabled('analyze') ? t('action.runAnalysis') : t('action.runWithoutModel')}
                </CcButton>
                <CcRunCost cost={costFor(modelAvailability.enabled('analyze'))} />
              </span>
            ) : null}
          </span>
        ),
        lastChange: row.lastChange ? (
          <span className="font-cc-mono text-[12px]">{row.lastChange}</span>
        ) : (
          <Absent>{row.isDemo ? t('workspace.demoLastChange') : t('workspace.noDate')}</Absent>
        ),
        actions: (
          <WorkspaceRowActions
            id={row.id}
            name={row.name}
            href={row.href}
            owner={!row.isDemo && row.access === 'own'}
            handlers={{
              onInvite: () => setInviting({ id: row.id, name: row.name }),
              onDuplicate: () => void duplicate(row),
              onExport: () => void exportJson(row),
              onDelete: () => setDeleting({ id: row.id, name: row.name }),
            }}
          />
        ),
      },
      // Mockup s7: a project started from a shipped example says what it is,
      // under its row — the code is fictitious, the engine output is real.
      note: row.fromExample ? (
        <CcMessageStrip state="information" headline={wt('myWorkspace.exampleHeadline')}>
          {wt('myWorkspace.exampleBody')}
        </CcMessageStrip>
      ) : undefined,
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
          <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">{t('run.cancelReach')}</span>
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
              <CcButton variant="secondary" onClick={() => start(row, false)} data-workspace-without-model={row.id}>
                {t('action.runWithoutModel')}
              </CcButton>
            </>
          }
        >
          {cell.message}
        </CcMessageStrip>
      );
    }

    // Breakpoint S (§2.9, mockup s10): the same row as one compact card — name,
    // the status sentence with its step bar and one "Next:" link, the row menu,
    // and the facts as one muted line. No per-column labels.
    const facts: React.ReactNode[] = [];
    if (row.lines !== null) facts.push(<span key="l">{rowLinesLabel(number(row.lines))}</span>);
    if (row.findings !== null) facts.push(<span key="f">{rowFindingsLabel(number(row.findings))}</span>);
    if (analysed && rowFacts?.levels.state === 'ready') facts.push(<LevelCounts key="v" levels={rowFacts.levels.value} />);
    if (analysed && rowFacts?.rules.state === 'ready') {
      facts.push(<span key="r">{rowRulesLabel(rowFacts.rules.value.confirmed, rowFacts.rules.value.total)}</span>);
    }
    phoneCards.push(
      <li
        key={row.id}
        data-workspace-card={row.id}
        className="flex flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={row.href}
              data-workspace-open={row.id}
              data-workspace-access={row.isDemo ? 'demo' : row.access}
              className="block text-[15px] leading-snug font-bold text-cc-ink"
            >
              {row.name}
            </Link>
            {ownerLine ? <div className="mt-1">{ownerLine}</div> : null}
          </div>
          {cell?.phase === 'running' ? null : (
            <WorkspaceRowActions
              id={row.id}
              name={row.name}
              href={row.href}
              owner={!row.isDemo && row.access === 'own'}
              handlers={{
                onInvite: () => setInviting({ id: row.id, name: row.name }),
                onDuplicate: () => void duplicate(row),
                onExport: () => void exportJson(row),
                onDelete: () => setDeleting({ id: row.id, name: row.name }),
              }}
            />
          )}
        </div>
        {cell?.phase === 'running' ? (
          base.span
        ) : row.isDemo ? (
          <span className="text-[13px] leading-snug font-semibold text-cc-ink" data-project-sentence="">
            {wt('myWorkspace.demoSentence')}
          </span>
        ) : (
          <ProjectProgressCell
            progress={projectProgress(projectById.get(row.id) ?? null)}
            projectHref={`/project/${row.id}`}
            id={row.id}
          />
        )}
        {row.stale ? <CcProvenanceChip value="stale" note={row.stale.note} /> : null}
        {/* Nothing measured yet: the sentence above already says so. */}
        {facts.length > 0 ? (
          <p
            data-workspace-card-facts=""
            className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-cc-ink-muted"
          >
            {facts.map((f, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <span aria-hidden={true}>·</span> : null}
                {f}
              </React.Fragment>
            ))}
          </p>
        ) : null}
        {base.note ? <div>{base.note}</div> : null}
      </li>,
    );

    return base;
  });

  const hasOwn = ownRows.length > 0;
  const hasAnyListed = ownRows.length + sharedRows.length > 0;
  const levelOptions = [
    { value: 'any', label: wt('myWorkspace.anyLevel') },
    ...ROW_LEVELS.map((level) => ({ value: level, label: `${wt('myWorkspace.levelOption')} ${level}` })),
  ];

  return (
    <div className="cc min-h-screen bg-cc-page px-4 py-6 sm:px-6" data-cc-workspace="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div>
          <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">{t('workspace.title')}</h1>
          <p className="mt-1 mb-0 text-[13px] font-medium text-cc-ink-muted">{t('workspace.lead')}</p>
        </div>

        <YourTurnCard
          hasOwnProjects={hasOwn}
          items={yourTurn}
          onNewProject={() => router.push('/admin/new-project')}
        />

        <div data-workspace-projects="">
        <CcCard
          title={t('workspace.projects')}
          level={2}
          count={shownRows.length}
          density="cozy"
          actions={
            hasOwn ? (
              <span className="flex flex-wrap items-center gap-2">
                <CcButton
                  icon={<ArrowDownUp size={16} aria-hidden={true} />}
                  onClick={() => setSort((s) => (s === 'last-change' ? 'name' : 'last-change'))}
                  data-workspace-sort={sort}
                  aria-label={`${wt('myWorkspace.sortLabel')} ${sort === 'last-change' ? wt('myWorkspace.sortLastChange') : wt('myWorkspace.sortName')}`}
                >
                  {sort === 'last-change' ? wt('myWorkspace.sortLastChange') : wt('myWorkspace.sortName')}
                </CcButton>
                <CcButton
                  variant="primary"
                  icon={<Plus size={16} aria-hidden={true} />}
                  onClick={() => router.push('/admin/new-project')}
                  data-workspace-new-project=""
                >
                  {t('workspace.newProject')}
                </CcButton>
              </span>
            ) : null
          }
        >
          {/* Nothing to filter while the demo is the only row, which is also what
              mockup s7 draws for a new account. */}
          {hasAnyListed ? (
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
                <CcSelect<string>
                  label={t('workspace.filterStatus')}
                  value={filter.status || 'any'}
                  onChange={(v) => setFilter((f) => ({ ...f, status: v === 'any' ? '' : v }))}
                  options={[
                    { value: 'any', label: t('workspace.anyStatus') },
                    ...stagesPresent(allRows).map((value) => ({ value, label: PROJECT_STAGE_LABEL[value] })),
                  ]}
                />
                <CcSelect<string>
                  label={wt('myWorkspace.filterLevel')}
                  value={filter.level || 'any'}
                  onChange={(v) => setFilter((f) => ({ ...f, level: v === 'any' ? '' : v }))}
                  options={levelOptions}
                />
                <CcSelect<string>
                  label={wt('myWorkspace.filterAccess')}
                  value={filter.access || 'all'}
                  onChange={(v) =>
                    setFilter((f) => ({ ...f, access: v === 'own' || v === 'shared' ? v : '' }))
                  }
                  options={[
                    { value: 'all', label: wt('myWorkspace.accessAll') },
                    { value: 'own', label: wt('myWorkspace.accessOwn') },
                    { value: 'shared', label: wt('myWorkspace.accessShared') },
                  ]}
                />
              </CcFilterBar>
            </div>
          ) : null}

          {actionError ? (
            <div className="mb-3">
              <CcMessageStrip state="error" announce>
                {actionError}
              </CcMessageStrip>
            </div>
          ) : null}

          {shownRows.length === 0 ? (
            <CcNoMatches title={t('workspace.noMatch')} reason={t('workspace.noMatchReason')} onClear={clear} />
          ) : (
            <>
              {/* What the step bar in every row means — one line, above the list. */}
              <div className="mb-2">
                <ProgressLegend />
              </div>
              {isS ? (
                <ul aria-label={t('workspace.projects')} className="m-0 flex list-none flex-col gap-2 p-0" data-workspace-cards="">
                  {phoneCards}
                </ul>
              ) : (
                <CcTable caption={t('workspace.projects')} columns={COLUMNS} rows={tableRows} />
              )}
            </>
          )}

          {shownRows.length > FIRST_ROWS ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2" data-workspace-showing="">
              <span className="text-[12px] font-medium text-cc-ink-muted">
                {showingRowsLabel(visibleRows.length, shownRows.length)}
              </span>
              <CcButton onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} data-workspace-show-all="">
                {showAll ? showFirstLabel(FIRST_ROWS) : showAllLabel(shownRows.length)}
              </CcButton>
            </div>
          ) : null}

          {shownRows.length > 0 && !hasOwn ? (
            <div className="mt-3">
              {/* The reader's own list is empty. The row above is the demo and
                  says so; this says what the reader does not have yet. The one
                  action for it is the primary in the card above — §1.5 allows
                  one per region. */}
              <CcEmptyState title={t('workspace.emptyTitle')}>{t('workspace.emptyBody')}</CcEmptyState>
            </div>
          ) : null}

          <p className="mt-3 mb-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{t('workspace.demoNote')}</p>
        </CcCard>
        </div>

        {/* Examples — the same gallery the old page and "New project" show
            (owner feedback 01.10.2026): one recommended start, three next, the
            rest behind "More examples". */}
        {user ? <StarterExamples userId={user.uid} account={profile} /> : null}

        {/* Sharing — read access by invitation to one confirmed address, and
            nothing else (roadmap phase 5). What others shared with you, and
            what you sent that nobody has answered yet. */}
        <CcCard title={wt('myWorkspace.sharingTitle')} level={2} density="cozy">
          <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('myWorkspace.sharingLead')}</p>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section aria-labelledby="shared-with-you-title" data-workspace-shared-with-you="">
              <h3
                id="shared-with-you-title"
                className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
              >
                {wt('myWorkspace.sharedWithYouTitle')} ({sharedRows.length})
              </h3>
              {sharedRows.length === 0 ? (
                <p className="mt-2 mb-0 text-[13px] font-medium text-cc-ink-muted">
                  {wt('myWorkspace.sharedWithYouEmpty')}
                </p>
              ) : (
                <>
                  <ul className="mt-2 mb-0 flex list-none flex-col gap-2 p-0">
                    {sharedRows.map((row) => (
                      <li
                        key={row.id}
                        data-workspace-shared-row={row.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
                      >
                        <Link
                          href={row.href}
                          className="min-w-0 flex-1 truncate text-[13px] font-semibold text-cc-ink underline underline-offset-2"
                        >
                          {row.name}
                        </Link>
                        <span className="text-[12px] font-medium text-cc-ink-muted">
                          {row.stage ? PROJECT_STAGE_LABEL[row.stage] : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 mb-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
                    {wt('myWorkspace.sharedWithYouNote')}
                  </p>
                </>
              )}
            </section>
            {hasOwn ? (
              <OpenInvitations emptyText={wt('myWorkspace.noOpenInvitations')} />
            ) : null}
          </div>
        </CcCard>
      </div>

      {inviting ? (
        <InviteReaderDialog
          projectId={inviting.id}
          projectName={inviting.name}
          onClose={() => setInviting(null)}
        />
      ) : null}

      <CcMessageBox
        open={deleting !== null}
        title={wt('myWorkspace.deleteTitle')}
        confirmLabel={wt('myWorkspace.deleteTitle')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      >
        <p className="m-0">{deleting ? deleteProjectSentence(deleting.name) : null}</p>
      </CcMessageBox>
    </div>
  );
}

/** The facts hook with its wanted set held as state, so the effect above can set it. */
function useFactsFor(): [Record<string, RowFacts>, (wanted: Map<string, string>) => void] {
  const [wanted, setWantedState] = useState<Map<string, string>>(() => new Map());
  const setWanted = useCallback((next: Map<string, string>) => {
    setWantedState((prev) => {
      if (prev.size === next.size && [...next].every(([k, v]) => prev.get(k) === v)) return prev;
      return next;
    });
  }, []);
  const facts = useWorkspaceRowFacts(wanted);
  return [facts, setWanted];
}
