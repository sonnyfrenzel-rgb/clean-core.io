'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { targetEditionOf } from '@/lib/target-edition';
import { createWithinCeiling } from '@/lib/write-ceiling';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { withStoredArtefactRows, withStoredArtefacts } from '@/lib/project-artefacts-client';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { useWorkspaceRowFacts } from '@/hooks/useWorkspaceRowFacts';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import { t, showAllLabel, showFirstLabel } from '@/lib/cc-messages';
import {
  deleteProjectSentence,
  homeLevelOption,
  homeNoMatchBody,
  homeRunWhat,
  homeScoreLabel,
  homeTruncated,
  rowFindingsLabel,
  rowLinesLabel,
  rowRulesLabel,
  showingRowsLabel,
  wt,
} from '@/lib/workspace-messages';
import { describeRunCost, type RunCost } from '@/lib/run-cost';
import { COMMUNITY_QUOTA_FALLBACK, OWN_KEY_ACTION, OWN_KEY_HREF, quotaExhausted, quotaSpentSentence } from '@/lib/run-quota-rule';
import { saveAs } from '@/lib/fileSaver';
import {
  attentionRows,
  filterHomeRows,
  homeFilterActive,
  homeRowsOf,
  homeStatusOptions,
  sortHomeRows,
  toHomeRow,
  ATTENTION_FILTER,
  EMPTY_HOME_FILTER,
  FILTERS_FROM,
  FIRST_ROWS,
  type HomeFilter,
  type HomeRow,
  type HomeSort,
} from '@/lib/home-rows';
import { ROW_LEVELS, rowHasLevel, type RowFacts, type RowLevels } from '@/lib/workspace-row-facts';
// The run itself (and the evidence engine and SAP catalog it imports) is
// fetched when Run is confirmed, not with the list.
import { AnalysisRunCancelled, runScope } from '@/lib/analysis-run-basics';
import type { AnalysisRunStage } from '@/lib/analysis-run';
import { sourceFileName } from '@/lib/source-file-name';
import { declaredTargetOf } from '@/lib/assessment-target';
import type { Project } from '@/lib/types';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import CcButton from '@/components/cc/Button';
import CcFilterBar from '@/components/cc/FilterBar';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcObjectIdentifier from '@/components/cc/ObjectIdentifier';
import CcRunIndicator, { CcRunCost } from '@/components/cc/RunIndicator';
import CcSelect from '@/components/cc/Select';
import CcTable, { type CcTableColumn, type CcTableRowSpec } from '@/components/cc/Table';
import CcTag from '@/components/cc/Tag';
import { CcNoMatches } from '@/components/cc/EmptyState';
import LevelCounts from './LevelCounts';
import OpenInvitations from './OpenInvitations';
import WorkspaceRowActions from './WorkspaceRowActions';
import HomeFirstView from './HomeFirstView';
import HomeAttentionCard from './HomeAttentionCard';
import HomeDoors from './HomeDoors';
import { HomeNextCell, HomeStatusBlock } from './HomeStatusCell';
import WorkspaceTiles from './WorkspaceTiles';
import WorkspaceSkeleton from './WorkspaceSkeleton';
import type { ProgramTile } from '@/lib/workspace-tiles';
import {
  useStoredWorkspaceLens,
  useStoredWorkspaceMode,
  rememberWorkspaceLens,
  rememberWorkspaceMode,
  type WorkspaceLens,
  type WorkspaceMode,
} from '@/lib/workspace-prefs';
import { aiAuthorshipFactsOf, withProjectExportAiGeneration } from '@/lib/ai-authorship';
import { isEngineDocumentation } from '@/lib/process-documentation';
import { APP_VERSION } from '@/lib/version';

/**
 * "My workspace" — the home page (`/dashboard`) of every account in good standing.
 *
 * A new account sees the first view with the start built in (AB-14a, `HomeFirstView`). A returning account sees the
 * list of the home page v2 (AB-14b, mockup `docs/roadmap/home-mockup-v2.html`, states 2–9, 11, 12):
 *
 *   - **every project**, not the newest 25 (H-O9): the own rows come lean from
 *     `GET /api/workspace-rows` (`lib/home-rows.ts`) — no source code in them — and search, filters and sort run over
 *     all of them;
 *   - **four columns**: Project, Status, Next step, Last change, with the new status words (H-O3, `lib/home-status.ts`)
 *     and dates as "6 Nov 2026" (H-O10); the figures one switch away ("Figures", kept for this page view only: nothing
 *     is stored, owner decision 15.11.2026);
 *   - **tabs**: My projects, Shared with me, Invitations sent — the old Sharing card lives in them;
 *   - **"Needs your attention"** only with a reason (code changed, design no longer fits, a failed test run);
 *   - the demo and the examples as **two doors** below the list;
 *   - a run from a row **only through the confirmation dialog** with its cost and model (today's sentence, H-O12).
 *
 * Everything the old page did per project is still here (ADR-052): open, run, invite, duplicate, export, the
 * deliverables and delete. The data of the Continue card (AB-14c) is stored from this release on and not shown yet.
 */

/** What the demo contributes to the page. Computed on the server, passed in. */
export interface WorkspaceDemoRow {
  lines: number;
  findings: number;
  /** The demo's levels, from the same engine pass as its IT view. */
  levels: RowLevels | null;
  /** Rules the engine derived from the demo source. None is confirmed — it is a demo. */
  rules: number;
}

type RunCell =
  | { phase: 'running'; stages: AnalysisRunStage[]; scope: string | null }
  | { phase: 'failed'; message: string }
  | undefined;

type ListedProject = Project & { id: string };
type Tab = 'mine' | 'shared' | 'invites';

const COLUMNS: readonly CcTableColumn[] = [
  { key: 'project', label: wt('homeList.colProject'), width: '33%' },
  { key: 'status', label: wt('homeList.colStatus'), width: '29%' },
  { key: 'next', label: wt('homeList.colNext'), width: '22%' },
  { key: 'lastChange', label: wt('homeList.colLastChange'), width: '12%' },
  { key: 'actions', label: wt('homeList.colActions'), action: true, width: '96px' },
];

const SHARED_COLUMNS: readonly CcTableColumn[] = [
  { key: 'project', label: wt('homeList.colProject'), width: '33%' },
  { key: 'status', label: wt('homeList.colStatus'), width: '29%' },
  { key: 'access', label: wt('homeList.colAccess'), width: '22%' },
  { key: 'lastChange', label: wt('homeList.colLastChange'), width: '16%' },
];

const number = (value: number) => new Intl.NumberFormat('en').format(value);

/** The shortest time between two reads of the own rows that coming back into view starts (`/api/workspace-rows`). */
const REVISIT_MS = 30_000;

/** The bearer header of the signed-in account, or none. */
async function bearer(u: User): Promise<Record<string, string>> {
  const token = await u.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/** One own project, read whole through the rules — only when an action needs its source (run, duplicate, export). */
async function readOwnProject(id: string): Promise<ListedProject | null> {
  const snap = await getDoc(doc(getDb(), 'projects', id));
  return snap.exists() ? { ...(snap.data() as Project), id } : null;
}

/** Loaded when someone invites, not with the page (3.3.0, ADR-123 (5)). */
const InviteReaderDialog = dynamic(() => import('@/components/InviteReaderDialog'), { ssr: false });

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the server layout passes the demo; the page has no use for it since AB-14b
export default function WorkspaceListReport(_props: {
  /** Kept for the server layout that passes it; the demo is a door below the list since AB-14b, not a row. */
  demo: WorkspaceDemoRow;
}) {
  const isS = useBreakpointS();
  const { profile, loading: profileLoading } = useUserProfile();
  const modelAvailability = useModelAvailability();
  const [user, setUser] = useState<User | null>(null);
  // Rows carry the account that loaded them: after a sign-out, or a switch to
  // another account, the previous account's projects are not shown while the
  // new answer is on its way.
  const [loaded, setLoaded] = useState<{ uid: string; rows: HomeRow[]; truncated: boolean } | null>(null);
  const [sharedLoaded, setSharedLoaded] = useState<{ uid: string; rows: ListedProject[] } | null>(null);
  const projects = useMemo(
    () => (loaded && user && loaded.uid === user.uid ? loaded.rows : []),
    [loaded, user],
  );
  const shared = useMemo(
    () => (sharedLoaded && user && sharedLoaded.uid === user.uid ? sharedLoaded.rows : []),
    [sharedLoaded, user],
  );
  const [tab, setTab] = useState<Tab>('mine');
  const [filter, setFilter] = useState<HomeFilter>(EMPTY_HOME_FILTER);
  const [sort, setSort] = useState<HomeSort>('last-change');
  const [showAll, setShowAll] = useState(false);
  // Off on every visit: the switch is not remembered in the browser (owner decision 15.11.2026, privacy policy 1.3).
  const [figures, setFigures] = useState(false);
  const [inviteCount, setInviteCount] = useState(0);
  const [runs, setRuns] = useState<Record<string, RunCell>>({});
  const controllers = useRef<Record<string, AbortController>>({});
  const [confirming, setConfirming] = useState<{ row: HomeRow; callModel: boolean } | null>(null);
  const [inviting, setInviting] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** The own list could not be read: the list page stands with a notice, never the first view. */
  const [ownFailedFor, setOwnFailedFor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // ADR-123 (W9): the lens and tiles-or-list, remembered by this browser only (`lib/workspace-prefs.ts`).
  // Read hydration-safe (`useStoredWorkspaceLens`); a choice made here wins over what was stored.
  const storedLens = useStoredWorkspaceLens();
  const storedMode = useStoredWorkspaceMode();
  const [chosenLens, setLens] = useState<WorkspaceLens | null>(null);
  const [chosenMode, setMode] = useState<WorkspaceMode | null>(null);
  const lens = chosenLens ?? storedLens;
  const mode = chosenMode ?? storedMode;
  const chooseLens = useCallback((next: WorkspaceLens) => {
    setLens(next);
    rememberWorkspaceLens(next);
  }, []);
  const chooseMode = useCallback((next: WorkspaceMode) => {
    setMode(next);
    rememberWorkspaceMode(next);
  }, []);

  useEffect(() => onAuthStateChanged(getAuth(), (u) => setUser(u)), []);

  // The own projects, every one of them, as lean rows from the server (H-O9).
  // Only the newest answer is shown: an older one arriving after a newer one
  // would put back rows the newer one had already corrected.
  const seq = useRef(0);
  const lastRead = useRef(0);
  const refresh = useCallback(async (u: User) => {
    const mine = ++seq.current;
    lastRead.current = Date.now();
    const uid = u.uid;
    try {
      const res = await fetch('/api/workspace-rows', { headers: await bearer(u), cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as { truncated?: unknown } | null;
      const rows = res.ok ? homeRowsOf(body) : null;
      if (mine !== seq.current) return;
      if (!rows) {
        setOwnFailedFor(uid);
        return;
      }
      setOwnFailedFor(null);
      setLoaded({ uid, rows, truncated: body?.truncated === true });
    } catch {
      if (mine === seq.current) setOwnFailedFor(uid);
    }
  }, []);

  // Read on arrival, and again whenever the page comes back into view: a run,
  // a design or a delete made in another tab shows here without a reload.
  useEffect(() => {
    if (!user) return undefined;
    // A failure belongs to the read that had it: a new one (the same account
    // again, after another) waits for its own answer behind the loading gate
    // instead of passing it on an old error.
    setOwnFailedFor(null);
    void refresh(user);
    // At most once per `REVISIT_MS` by coming back into view: each read lists every project, and the route's hourly
    // budget is sized for that pace.
    const again = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRead.current >= REVISIT_MS) void refresh(user);
    };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [user, refresh]);

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
    let sharedSeq = 0;
    const publish = () => {
      const mine = ++sharedSeq;
      // A row's phases are read from its artefacts (roadmap 3.0.14, item 9).
      void withStoredArtefactRows([...rows.values()]).then((full) => {
        if (alive && mine === sharedSeq) setSharedLoaded({ uid, rows: full });
      });
    };
    (async () => {
      try {
        const res = await fetch('/api/shared-projects', { headers: await bearer(user) });
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

  const sharedRows = useMemo(
    // A project the account owns and also reads is listed once, as its own.
    () => shared.filter((p) => !projects.some((own) => own.id === p.id)).map((p) => toHomeRow(p, 'shared')),
    [shared, projects],
  );

  const [facts, setWanted] = useFactsFor();
  const factsOf = useCallback((row: HomeRow): RowFacts | undefined => facts[row.id], [facts]);

  const sorted = useMemo(() => sortHomeRows(projects, sort), [projects, sort]);
  const shownRows = useMemo(
    () => filterHomeRows(sorted, filter, (row, level) => rowHasLevel(factsOf(row), level as CloudReadinessGrade)),
    [sorted, filter, factsOf],
  );
  const visibleRows = useMemo(() => (showAll ? shownRows : shownRows.slice(0, FIRST_ROWS)), [showAll, shownRows]);

  // Levels and rules are read per row only where they are asked for: the
  // figures of the rows on screen, or every analysed row while a level filter
  // needs them (a filter must never hide a project for being slow).
  useEffect(() => {
    // ADR-123 (5): the tiles read the lean rows and their summary only; the levels and rules are read per row in
    // list mode, as in 3.2.0 — the rows on screen with the figures on, or every analysed row while a level filter needs them.
    const candidates = projects.filter((r) => r.hasSource && r.hasRun);
    const onScreen = figures && tab === 'mine' ? candidates.filter((r) => visibleRows.some((v) => v.id === r.id)) : [];
    const ids = mode !== 'list' ? [] : filter.level ? candidates : onScreen;
    const map = new Map<string, string>();
    for (const row of ids) map.set(row.id, row.factsKey);
    setWanted(map);
  }, [mode, projects, visibleRows, filter.level, figures, tab, setWanted]);

  const active = homeFilterActive(filter);
  const clear = useCallback(() => setFilter(EMPTY_HOME_FILTER), []);
  const setSearch = useCallback((search: string) => {
    setShowAll(false);
    setFilter((f) => ({ ...f, search }));
  }, []);

  const costFor = useCallback(
    (callsModel: boolean): RunCost =>
      describeRunCost({ profile, metered: true, callsModel, provider: modelAvailability.known ? modelAvailability.provider : undefined }),
    [profile, modelAvailability.known, modelAvailability.provider],
  );

  const runnable = useCallback((row: HomeRow) => row.access === 'own' && row.hasSource, []);

  const start = useCallback(
    async (row: HomeRow, callModel: boolean) => {
      if (!runnable(row)) return;
      // Synchronous, before anything awaits: a second confirmation that lands
      // before the first `running` state has rendered must not start a second
      // pipeline for the same project.
      if (controllers.current[row.id]) return;
      const controller = new AbortController();
      controllers.current[row.id] = controller;
      /** Only the run that owns the row's controller may write the row. */
      const owns = () => controllers.current[row.id] === controller;
      setRuns((prev) => ({ ...prev, [row.id]: { phase: 'running', stages: [], scope: null } }));
      try {
        // The row carries no source (H-O9): the project is read whole now, through the rules.
        const project = await readOwnProject(row.id);
        // Cancelled, or the list left, while the project was read: nothing more is set up.
        if (!owns() || controller.signal.aborted) return;
        if (!project || typeof project.legacyCode !== 'string' || !project.legacyCode.trim()) {
          throw new Error(wt('homeList.runNoSource'));
        }
        const scope = runScope(project.legacyCode);
        if (owns()) {
          setRuns((prev) => {
            const cell = prev[row.id];
            return cell && cell.phase === 'running' ? { ...prev, [row.id]: { ...cell, scope } } : prev;
          });
        }
        const { runAnalysis } = await import('@/lib/analysis-run');
        await runAnalysis({
          projectId: row.id,
          legacyCode: project.legacyCode,
          fileName: sourceFileName(project) || 'main.abap',
          deployment: targetEditionOf(project.s4Deployment),
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
        if (user) void refresh(user);
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
    [runnable, user, refresh],
  );

  const cancel = useCallback((id: string) => {
    controllers.current[id]?.abort();
    delete controllers.current[id];
    setRuns((prev) => ({ ...prev, [id]: undefined }));
  }, []);

  /** The run dialog for a row whose next step is a run, when this account may start it here. */
  const runFor = useCallback(
    (row: HomeRow) =>
      row.status.next?.run && runnable(row) && !runs[row.id]
        ? () => setConfirming({ row, callModel: modelAvailability.enabled('analyze') })
        : undefined,
    [runnable, runs, modelAvailability],
  );

  // The owner's actions the old dashboard had per project (ADR-052).
  const duplicate = useCallback(
    async (row: HomeRow) => {
      if (!user) return;
      setActionError(null);
      try {
        const project = await readOwnProject(row.id);
        if (!project) throw new Error(wt('myWorkspace.duplicateFailed'));
        const copy = await createWithinCeiling(getDb(), 'projects', user.uid, {
          name: `${project.name} - Copy`,
          status: 'uploaded',
          legacyCode: project.legacyCode || '',
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
        // The copy keeps the original's target system; the create rule takes
        // no `s4Deployment`, the owner's update does.
        if (project.s4Deployment === 'public' || project.s4Deployment === 'private') {
          try {
            await updateDoc(copy, { s4Deployment: project.s4Deployment });
          } catch (error) {
            // The copy exists (a browser may not delete a project): say exactly
            // that, not "could not be duplicated".
            setActionError(wt('myWorkspace.duplicateTargetFailed'));
            console.error('[WorkspaceListReport] target of the copy not saved', error);
          }
        }
        void refresh(user);
      } catch (error) {
        setActionError(wt('myWorkspace.duplicateFailed'));
        handleFirestoreError(error, OperationType.WRITE, 'projects');
      }
    },
    [user, refresh],
  );

  const exportJson = useCallback(async (row: HomeRow) => {
    setActionError(null);
    try {
      const stored = await readOwnProject(row.id);
      if (!stored) return;
      const project = await withStoredArtefacts(row.id, stored);
      const { id: _id, userId: _userId, ...data } = project as ListedProject & { userId?: string };
      void _id;
      void _userId;
      // Hotfix 3.0.22: the metadata field of every model-written source, as every other export carries it (AI Act Art. 50(2)).
      const marked = withProjectExportAiGeneration(data, aiAuthorshipFactsOf(project, { documentationFromEngine: isEngineDocumentation((project as { documentation?: unknown }).documentation) }), APP_VERSION);
      const blob = new Blob([JSON.stringify(marked, null, 2)], { type: 'application/json' });
      await saveAs(blob, `${project.name.replace(/\s+/g, '_')}_export.json`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }, []);

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
      // 404 is what a repeated delete hears once the first one went through and
      // its answer was lost: the project is gone, as asked.
      if (!res.ok && res.status !== 404) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || wt('myWorkspace.deleteFailed'));
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : wt('myWorkspace.deleteFailed'));
    } finally {
      if (user) void refresh(user);
    }
  }, [deleting, user, refresh]);

  const attention = useMemo(() => attentionRows(projects), [projects]);
  // The tiles of 3.3.0 come with the lean rows, computed on the server (`lib/home-rows.ts`).
  const tiles: ProgramTile[] = useMemo(() => projects.map((r) => r.tile), [projects]);

  // ADR-123: the frame with the final sizes, never a line of text that the page then replaces.
  if (profileLoading || !user) return <WorkspaceSkeleton />;

  // AB-14a: an account with no project of its own and none shared with it
  // lands on the first view (home mockup v2.1, state 1) — the start built in,
  // not a list with only the demo in it. Decided only once the lists that
  // decide it have answered for this account (the shared one only when the own
  // one is empty); until then the page waits rather than show one and switch
  // to the other. A list that could not be read keeps the list page.
  const ownAnswered = !!user && loaded?.uid === user.uid;
  const sharedAnswered = !!user && sharedLoaded?.uid === user.uid;
  const ownFailed = !!user && ownFailedFor === user.uid;
  if (user && !ownFailed && (!ownAnswered || (projects.length === 0 && !sharedAnswered))) {
    return <WorkspaceSkeleton />;
  }
  // A listener that answered empty and then failed leaves its empty rows behind: that is no answer to decide on.
  if (user && !ownFailed && ownAnswered && sharedAnswered && projects.length === 0 && shared.length === 0) {
    return <HomeFirstView userId={user.uid} profile={profile ?? null} />;
  }

  const actionsOf = (row: HomeRow) => (
    <WorkspaceRowActions
      id={row.id}
      name={row.name}
      href={`/project/${row.id}`}
      owner={row.access === 'own'}
      showOpen={false}
      handlers={{
        onInvite: () => setInviting({ id: row.id, name: row.name }),
        onDuplicate: () => void duplicate(row),
        onExport: () => void exportJson(row),
        onDelete: () => setDeleting({ id: row.id, name: row.name }),
      }}
    />
  );

  // The design system's Object Identifier (§2.4): the name, the program's own
  // name in mono (the only identifier, AB-14b), and what the project is.
  const nameCell = (row: HomeRow) => (
    <Link href={`/project/${row.id}`} data-workspace-open={row.id} data-workspace-access={row.access} className="min-w-0">
      <CcObjectIdentifier
        title={row.name}
        identifier={row.program ?? undefined}
        meta={
          row.fromExample || row.access === 'shared' ? (
            <span className="inline-flex flex-wrap items-center gap-1">
              {row.fromExample ? <CcTag>{wt('homeList.exampleTag')}</CcTag> : null}
              {row.access === 'shared' ? <CcTag>{wt('homeList.readOnly')}</CcTag> : null}
            </span>
          ) : null
        }
      />
    </Link>
  );

  const dateCell = (row: HomeRow) =>
    row.lastChangeText ? (
      <span className="text-[12px] font-medium whitespace-nowrap text-cc-ink" data-home-date={row.lastChange ?? ''}>
        {row.lastChangeText}
      </span>
    ) : (
      <span className="text-[12px] font-medium text-cc-ink-muted">{wt('homeList.noDate')}</span>
    );

  const factsLine = (row: HomeRow) => {
    const rowFacts = factsOf(row);
    const bits: React.ReactNode[] = [];
    if (row.lines !== null) bits.push(<span key="l">{rowLinesLabel(number(row.lines))}</span>);
    if (row.findings !== null) bits.push(<span key="f">{rowFindingsLabel(number(row.findings))}</span>);
    if (row.hasRun && rowFacts?.levels.state === 'ready') bits.push(<LevelCounts key="v" levels={rowFacts.levels.value} />);
    if (row.score !== null) bits.push(<span key="s">{homeScoreLabel(row.score)}</span>);
    if (row.hasRun && rowFacts?.rules.state === 'ready') {
      bits.push(<span key="r">{rowRulesLabel(rowFacts.rules.value.confirmed, rowFacts.rules.value.total)}</span>);
    }
    return (
      <p data-workspace-card-facts="" className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-cc-ink-muted">
        {bits.length === 0
          ? wt('homeList.nothingMeasured')
          : bits.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <span aria-hidden={true}>·</span> : null}
                {b}
              </React.Fragment>
            ))}
      </p>
    );
  };

  const runningBlock = (row: HomeRow, cell: Extract<RunCell, { phase: 'running' }>) => (
    <div className="flex flex-col gap-2">
      <CcRunIndicator scope={cell.scope ?? t('state.loading')} stages={cell.stages} onCancel={() => cancel(row.id)} survivesLeaving={false} />
      {/* §2.8: a cancel that does not say what it cannot reach is a claim. */}
      <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">{t('run.cancelReach')}</span>
    </div>
  );

  const failedNote = (row: HomeRow, cell: Extract<RunCell, { phase: 'failed' }>) => (
    <CcMessageStrip
      state="error"
      headline={t('run.failed')}
      announce
      actions={
        <>
          <CcButton
            variant="ghost"
            onClick={() => setConfirming({ row, callModel: modelAvailability.enabled('analyze') })}
            data-workspace-retry={row.id}
          >
            {t('action.retry')}
          </CcButton>
          <CcButton variant="secondary" onClick={() => setConfirming({ row, callModel: false })} data-workspace-without-model={row.id}>
            {t('action.runWithoutModel')}
          </CcButton>
        </>
      }
    >
      {cell.message}
    </CcMessageStrip>
  );

  const phoneCards: React.ReactNode[] = [];
  const tableRows: CcTableRowSpec[] = visibleRows.map((row) => {
    const cell = runs[row.id];
    const base: CcTableRowSpec = {
      key: row.id,
      cells: {
        project: nameCell(row),
        status: <HomeStatusBlock status={row.status} />,
        next: <HomeNextCell projectId={row.id} next={row.status.next} onRun={runFor(row)} />,
        lastChange: dateCell(row),
        actions: actionsOf(row),
      },
      note: figures ? factsLine(row) : undefined,
    };
    if (cell?.phase === 'running') {
      base.span = runningBlock(row, cell);
      base.cells.actions = null;
    }
    if (cell?.phase === 'failed') base.note = failedNote(row, cell);

    // Breakpoint S (§2.9): the same row as one compact card — name, program,
    // the row menu, the status, the figures when on, and the next step with the date.
    phoneCards.push(
      <li key={row.id} data-workspace-card={row.id} className="flex flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{nameCell(row)}</div>
          {cell?.phase === 'running' ? null : actionsOf(row)}
        </div>
        {cell?.phase === 'running' ? (
          runningBlock(row, cell)
        ) : (
          <>
            <HomeStatusBlock status={row.status} />
            {figures ? factsLine(row) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <HomeNextCell projectId={row.id} next={row.status.next} onRun={runFor(row)} compact />
              {dateCell(row)}
            </div>
          </>
        )}
        {cell?.phase === 'failed' ? <div>{failedNote(row, cell)}</div> : null}
      </li>,
    );
    return base;
  });

  const hasOwn = projects.length > 0;
  const tabs: Array<{ key: Tab; long: string; short: string; count: number }> = [
    { key: 'mine', long: wt('homeList.tabMine'), short: wt('homeList.tabMineShort'), count: projects.length },
  ];
  if (sharedRows.length > 0) tabs.push({ key: 'shared', long: wt('homeList.tabShared'), short: wt('homeList.tabSharedShort'), count: sharedRows.length });
  if (hasOwn && inviteCount > 0) tabs.push({ key: 'invites', long: wt('homeList.tabInvites'), short: wt('homeList.tabInvitesShort'), count: inviteCount });
  // A tab whose list emptied (the last invitation withdrawn) falls back to My projects.
  const current: Tab = tabs.some((x) => x.key === tab) ? tab : 'mine';

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const at = tabs.findIndex((x) => x.key === current);
    const next = tabs[(at + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setTab(next.key);
    document.getElementById(`home-tab-${next.key}`)?.focus();
  };

  const levelOptions = [
    { value: 'any', label: wt('homeList.anyLevel') },
    ...ROW_LEVELS.map((level) => ({ value: level, label: homeLevelOption(level) })),
  ];

  const minePanel = (
    <>
      {projects.length >= FILTERS_FROM ? (
        <div className="mb-3" data-home-filters="">
          <CcFilterBar
            noun={wt('homeList.noun')}
            shown={shownRows.length}
            total={projects.length}
            search={filter.search}
            onSearch={setSearch}
            active={active}
            onClear={clear}
          >
            <CcSelect<string>
              label={wt('homeList.filterStatus')}
              value={filter.status || 'any'}
              onChange={(v) => {
                setShowAll(false);
                setFilter((f) => ({ ...f, status: v === 'any' ? '' : v }));
              }}
              options={[{ value: 'any', label: wt('homeList.anyStatus') }, ...homeStatusOptions(projects)]}
            />
            <CcSelect<string>
              label={wt('homeList.filterLevel')}
              value={filter.level || 'any'}
              onChange={(v) => setFilter((f) => ({ ...f, level: v === 'any' ? '' : v }))}
              options={levelOptions}
            />
          </CcFilterBar>
        </div>
      ) : null}

      {!hasOwn ? (
        <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{t('workspace.emptyBody')}</p>
      ) : shownRows.length === 0 ? (
        <CcNoMatches title={wt('homeList.noMatchTitle')} reason={homeNoMatchBody(projects.length)} onClear={clear} />
      ) : isS ? (
        <ul aria-label={wt('homeList.tabMine')} className="m-0 flex list-none flex-col gap-2 p-0" data-workspace-cards="">
          {phoneCards}
        </ul>
      ) : (
        <CcTable caption={wt('homeList.tabMine')} columns={COLUMNS} rows={tableRows} />
      )}

      {shownRows.length > FIRST_ROWS ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2" data-workspace-showing="">
          <span className="text-[12px] font-medium text-cc-ink-muted">{showingRowsLabel(visibleRows.length, shownRows.length)}</span>
          <CcButton onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} data-workspace-show-all="">
            {showAll ? showFirstLabel(FIRST_ROWS) : showAllLabel(shownRows.length)}
          </CcButton>
        </div>
      ) : null}
      {loaded?.truncated ? (
        <p className="mt-3 mb-0 text-[12px] font-medium text-cc-ink-muted" data-home-truncated="">{homeTruncated(projects.length)}</p>
      ) : null}
    </>
  );

  const sharedPanel = (
    <section data-workspace-shared-with-you="">
      <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('homeList.sharedNote')}</p>
      <div className="mt-3">
        {isS ? (
          <ul aria-label={wt('homeList.tabShared')} className="m-0 flex list-none flex-col gap-2 p-0">
            {sharedRows.map((row) => (
              <li key={row.id} data-workspace-shared-row={row.id} className="flex flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3">
                {nameCell(row)}
                <HomeStatusBlock status={row.status} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-cc-ink-muted">{wt('homeList.sharedAccess')}</span>
                  {dateCell(row)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <CcTable
            caption={wt('homeList.tabShared')}
            columns={SHARED_COLUMNS}
            rows={sharedRows.map((row) => ({
              key: row.id,
              cells: {
                project: <span data-workspace-shared-row={row.id}>{nameCell(row)}</span>,
                status: <HomeStatusBlock status={row.status} />,
                access: <span className="text-[12px] font-medium text-cc-ink-muted">{wt('homeList.sharedAccess')}</span>,
                lastChange: dateCell(row),
              },
            }))}
          />
        )}
      </div>
    </section>
  );

  const limitStrip = quotaExhausted(profile) ? (
    // The free runs are spent: said where the account lands, with the way on to
    // an own key (roadmap 3.0.21 (3)) — not only once a start has been refused.
    <div data-workspace-limit="">
      <CcMessageStrip
        state="warning"
        headline={wt('myWorkspace.limitReached')}
        actions={
          <CcLinkButton href={OWN_KEY_HREF} variant="ghost" data-own-key-link="">
            {OWN_KEY_ACTION}
          </CcLinkButton>
        }
      >
        {quotaSpentSentence(profile?.transformationsLimit ?? COMMUNITY_QUOTA_FALLBACK)}
      </CcMessageStrip>
    </div>
  ) : null;

  // The list mode of 3.3.0 (ADR-123): the home list of 3.2.0 (AB-14b) as it was — "Needs your attention", the tabs
  // My projects / Shared with me / Invitations sent with sort and the figures switch, and the two doors below.
  const listSection = (
    <div className="flex flex-col gap-4">
        <HomeAttentionCard
          shown={attention.shown}
          total={attention.total}
          onRun={runFor}
          onShowAll={() => {
            setTab('mine');
            setShowAll(false);
            setFilter({ ...EMPTY_HOME_FILTER, status: ATTENTION_FILTER });
            listRef.current?.scrollIntoView({ block: 'start' });
          }}
        />

        <div data-workspace-list="" ref={listRef}>
          <section aria-label={wt('homeList.projectsLabel')} className="rounded-cc-card border border-cc-line bg-cc-surface p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-cc-line">
              <div role="tablist" aria-label={wt('homeList.projectsLabel')} className="flex flex-wrap gap-1">
                {tabs.map((x) => (
                  <button
                    key={x.key}
                    id={`home-tab-${x.key}`}
                    type="button"
                    role="tab"
                    aria-selected={current === x.key}
                    aria-controls={`home-panel-${x.key}`}
                    tabIndex={current === x.key ? 0 : -1}
                    onClick={() => setTab(x.key)}
                    onKeyDown={onTabKey}
                    data-home-tab={x.key}
                    className={`-mb-px inline-flex items-center gap-2 border-b-2 px-2 py-2 text-[13px] font-semibold ${current === x.key ? 'border-cc-ink text-cc-ink' : 'border-transparent text-cc-ink-muted'}`}
                  >
                    <span className="hidden sm:inline">{x.long}</span>
                    <span className="sm:hidden">{x.short}</span>
                    <span className="rounded-full bg-cc-surface-muted px-2 text-[11px] font-semibold text-cc-ink-muted tabular-nums">{x.count}</span>
                  </button>
                ))}
              </div>
              {current === 'mine' && hasOwn ? (
                <span className="mb-2 flex flex-wrap items-end gap-3">
                  <CcSelect<HomeSort>
                    label={wt('homeList.sort')}
                    value={sort}
                    onChange={(v) => setSort(v === 'name' ? 'name' : 'last-change')}
                    options={[
                      { value: 'last-change', label: wt('homeList.sortLastChange') },
                      { value: 'name', label: wt('homeList.sortName') },
                    ]}
                  />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={figures}
                    data-home-figures={figures ? 'on' : 'off'}
                    onClick={() => {
                      setFigures(!figures);
                    }}
                    className="inline-flex h-8 items-center gap-2 rounded-cc-row px-1 text-[13px] font-semibold text-cc-ink pointer-coarse:h-11"
                  >
                    <span aria-hidden={true} className={`relative inline-block h-4 w-7 rounded-full transition-colors ${figures ? 'bg-cc-ink' : 'bg-cc-line'}`}>
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-cc-surface transition-all ${figures ? 'left-3.5' : 'left-0.5'}`} />
                    </span>
                    {wt('homeList.figures')}
                  </button>
                </span>
              ) : null}
            </div>

            {actionError ? (
              <div className="mb-3">
                <CcMessageStrip state="error" announce>
                  {actionError}
                </CcMessageStrip>
              </div>
            ) : null}

            <div role="tabpanel" id="home-panel-mine" aria-labelledby="home-tab-mine" hidden={current !== 'mine'}>
              {minePanel}
            </div>
            {sharedRows.length > 0 ? (
              <div role="tabpanel" id="home-panel-shared" aria-labelledby="home-tab-shared" hidden={current !== 'shared'}>
                {sharedPanel}
              </div>
            ) : null}
            {/* Mounted for every owner, so the tab knows its count; shown only as its tab. */}
            {hasOwn ? (
              <div role="tabpanel" id="home-panel-invites" aria-labelledby="home-tab-invites" hidden={current !== 'invites'}>
                <p className="mt-0 mb-3 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('homeList.invitesNote')}</p>
                <OpenInvitations emptyText={wt('homeList.noInvitations')} onCount={setInviteCount} />
              </div>
            ) : null}
          </section>
        </div>

      <HomeDoors />
    </div>
  );

  // Sharing — read access by invitation to one confirmed address, and nothing
  // else (roadmap phase 5). What others shared with you, and what you sent
  // that nobody has answered yet. Behind "Sharing" under the tiles (ADR-123);
  // in list mode the same lives in the tabs.
  const sharingSection = (
    <section
      aria-labelledby="ws-sharing-title"
      className="flex flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4"
      data-ws-sharing-section=""
    >
      <div>
        <h2 id="ws-sharing-title" className="m-0 text-[15px] font-bold text-cc-ink">
          {wt('myWorkspace.sharingTitle')}
        </h2>
        <p className="mt-1 mb-0 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('myWorkspace.sharingLead')}</p>
      </div>
      {sharedRows.length > 0 ? (
        sharedPanel
      ) : (
        <p className="m-0 text-[13px] font-medium text-cc-ink-muted" data-workspace-shared-with-you="">
          {wt('myWorkspace.sharedWithYouEmpty')}
        </p>
      )}
      {hasOwn ? (
        <div>
          <p className="mt-0 mb-3 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('homeList.invitesNote')}</p>
          <OpenInvitations emptyText={wt('homeList.noInvitations')} />
        </div>
      ) : null}
    </section>
  );

  const actionsFor = (tile: ProgramTile) => {
    const row = tile.access === 'own' ? projects.find((r) => r.id === tile.id) : undefined;
    return row
      ? {
          // Delete and Invite name the project, never the process (owner decision 14.11.2026).
          onInvite: () => setInviting({ id: tile.id, name: tile.projectName }),
          onDuplicate: () => void duplicate(row),
          onExport: () => void exportJson(row),
          onDelete: () => setDeleting({ id: tile.id, name: tile.projectName }),
        }
      : undefined;
  };

  const tileNotices = [
    limitStrip ? <React.Fragment key="limit">{limitStrip}</React.Fragment> : null,
    ownFailed ? (
      <CcMessageStrip key="own-failed" state="error" announce>
        {wt('homeList.listFailed')}
      </CcMessageStrip>
    ) : null,
    // In list mode the error stands above the list, where the action was taken.
    actionError && mode !== 'list' ? (
      <CcMessageStrip key="action-error" state="error" announce>
        {actionError}
      </CcMessageStrip>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="cc min-h-screen bg-cc-page" data-cc-workspace="">
      <WorkspaceTiles
        userId={user.uid}
        profile={profile ?? null}
        tiles={tiles}
        sharedCount={sharedRows.length}
        openInvitations={null}
        lens={lens}
        onLens={chooseLens}
        mode={mode}
        onMode={chooseMode}
        list={listSection}
        sharing={sharingSection}
        actionsFor={actionsFor}
        notices={tileNotices.length > 0 ? <>{tileNotices}</> : null}
      />

      {confirming ? (
        <CcMessageBox
          open
          title={confirming.row.status.attention === 'code-changed' ? wt('homeList.runAgainTitle') : wt('homeList.runTitle')}
          confirmLabel={wt('homeList.runConfirm')}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { row, callModel } = confirming;
            setConfirming(null);
            void start(row, callModel);
          }}
        >
          <p className="m-0" data-home-run-dialog={confirming.row.id}>
            {homeRunWhat(confirming.row.name, confirming.row.lines === null ? null : number(confirming.row.lines))}
          </p>
          {/* Today's sentence on cost and model (H-O12: the new wording waits for legal review). */}
          <p className="mt-2 mb-0">
            <CcRunCost cost={costFor(confirming.callModel)} />
          </p>
        </CcMessageBox>
      ) : null}

      {inviting ? (
        <InviteReaderDialog projectId={inviting.id} projectName={inviting.name} onClose={() => setInviting(null)} />
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
