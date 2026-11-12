'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation';
import { useUserProfile } from '@/hooks/useUserProfile';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { viewFromParam, type WorkspaceView } from '@/lib/workspace-model';
import { viewSwitchHash } from '@/lib/view-switch';
import { layerRedirect } from '@/lib/layer-redirect';
import { analyzeEntryHref } from '@/lib/analyze-entry';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { originOf } from '@/lib/choice-addresses';
import { useFollowHash } from '@/hooks/useFollowHash';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import WorkspaceLoading from '@/components/workspace/WorkspaceLoading';
import ProjectNoAccess from '@/components/ProjectNoAccess';
import { getAuth } from '@/lib/firebase';
import type { Project } from '@/lib/types';

/**
 * The `#fragment` a view switch carries over: a subject (`#L42`, CR-14) but
 * not a place of the old view (`lib/view-switch.ts`, Sonny 10.10.2026).
 */
function currentHash(): string {
  if (typeof window === 'undefined') return '';
  return viewSwitchHash(window.location.hash);
}

/**
 * The workspace of a project — roadmap step 1.4, for every account since 3.0.1.
 *
 * Since v3.1.0 it holds IT and Management only (plan AB-2, ADR-109): a project
 * opens in Analyze, Business, and this route sends a Business address there.
 * The start run of a new project (ADR-072) is signed there too
 * (`components/analyze/AnalyzeBusiness.tsx`).
 *
 * Built behind an administrator's preview switch (1.4) and opened to every
 * signed-in account with roadmap 3.0.1 (ADR-061): every project opens here, and
 * the seven stages are its tools. What the reader may read is what it always
 * was — the Firestore rules decide, through `loadProjectAndHydrate`, and a
 * project that is not theirs answers `permission-denied`, which reads "This
 * project does not exist or is not shared with this account" here. A visitor
 * without an account goes to the sign-in and comes back (roadmap 3.0.21 (1),
 * `components/ProjectFrame.tsx`).
 *
 * The view lives in `?view=` and nowhere else (ADR-018): it is a perspective,
 * not a grant, so it is kept in the URL and in browser history and never on the
 * project, the run, a signature or an audit pack — see
 * `tests/view-attribute-guard.spec.ts` for the guard that proves it. There is
 * no IT focus any more (ADR-057): an old link with `?focus=…` opens the
 * workspace as it would without it, because nothing here reads that parameter.
 */
export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  // A link to a place on the workspace (`?view=it#not-determined`) waits for that place (ADR-085).
  useFollowHash();

  const { profile, loading: profileLoading } = useUserProfile();
  const enabled = profile != null;

  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const view = viewFromParam(searchParams?.get('view'));
  /**
   * The address the page arrived with, when it names a layer that now lives in
   * another view or in the Economics tool — `?view=it#costs`,
   * `?view=it#changes`, `?view=management#architecture` (`lib/layer-redirect.ts`).
   *
   * Sent on here, once, while the loading gate is still up, and not by the
   * shell's effects on mount: those re-ran while the shell was still settling
   * its own layer state, each run dispatching the navigation again and
   * discarding the one before, and fresh loads were seen to stay where they
   * arrived (3.0.7 follow-up). One `router.replace`; should the router not have
   * landed after eight seconds, the browser goes there itself. A place in the
   * same view (`?view=it#evidence` → `#it-trust`) needs no navigation: the
   * shell writes it in place, where Next's router hears of it
   * (`replaceHashInPlace`).
   *
   * Read when the project has arrived (below, with it) — by then the address
   * is this page's, also after a client navigation, and the server never sees
   * a fragment — and only acted on until the page has landed, so a reader who
   * later switches back to the view they arrived in is not sent on again.
   */
  const [arrival, setArrival] = useState<{ view: WorkspaceView; hash: string } | null>(null);
  const [landed, setLanded] = useState(false);
  const hasActiveRun = Boolean(project?.activeRunId?.trim());
  const target =
    state === 'ready' && arrival && !landed ? layerRedirect(arrival.view, arrival.hash, { hasActiveRun }) : null;
  const leaving = target && !(target.kind === 'view' && target.view === arrival?.view) ? target : null;
  let leavingHref: string | null = null;
  if (leaving?.kind === 'economics') {
    // A redirect is the same arrival: the place that asked for it comes along.
    leavingHref = stageHref({
      base: `/project/${projectId}`,
      path: 'tco',
      view: arrival?.view,
      from: WORKSPACE_RETURN.tools,
      origin: originOf(searchParams?.toString()),
    });
  } else if (leaving?.kind === 'view') {
    const query = new URLSearchParams(searchParams?.toString() ?? '');
    query.set('view', leaving.view);
    leavingHref = `/project/${encodeURIComponent(projectId)}?${query.toString()}#${leaving.hash}`;
  }
  const arrived = leaving?.kind === 'view' && view === leaving.view;
  /**
   * The Business view is Analyze's now (plan AB-2, ADR-109): `/project/<id>`
   * in Business — or with no view — goes to `/project/<id>/analyze`, keeping
   * `view`, `first`, `from`, `origin` and a line (`#L42`) or the map
   * (`lib/analyze-entry.ts`). An old layer address is sent where it lives
   * first (`#costs` to Economics, `#architecture` to IT, above); one whose
   * content is the map (`#need`) lands on the map. Every time the view is
   * Business, not only on arrival: the workspace's own view switch to
   * Business leads there too. IT and Management stay here until AB-9/AB-10.
   */
  const toAnalyze =
    state === 'ready' && view === 'business' && !(leavingHref !== null && !arrived)
      ? analyzeEntryHref({
          projectId,
          search: searchParams?.toString() ?? '',
          hash:
            target?.kind === 'view' && target.view === 'business'
              ? `#${target.hash}`
              : typeof window === 'undefined'
                ? ''
                : window.location.hash,
        })
      : null;
  const sendTo = leavingHref !== null && !arrived ? leavingHref : toAnalyze;
  const redirecting = sendTo !== null;
  useEffect(() => {
    if (!sendTo) return;
    router.replace(sendTo, { scroll: false });
    const timer = window.setTimeout(() => window.location.replace(sendTo), 8000);
    return () => window.clearTimeout(timer);
  }, [sendTo, router]);
  // Landed. The place follower and the shell hear of the new fragment — a
  // client navigation sends no `hashchange` of its own.
  useEffect(() => {
    if (!arrived) return;
    const frame = window.requestAnimationFrame(() => {
      setLanded(true);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [arrived]);

  const setView = useCallback(
    (next: WorkspaceView) => {
      const query = new URLSearchParams(searchParams?.toString() ?? '');
      query.set('view', next);
      // The place that asked for a choice belongs to the view the reader
      // arrived in; a view switch leaves it (`lib/choice-addresses.ts`). A
      // redirect of an old address keeps it — it is the same arrival.
      query.delete('origin');
      // `push`, not `replace`: a view is a place the reader chose to be, and Back
      // should return them to the one they came from (ADR-018).
      //
      // The new view opens at its top, never in the middle of where the old
      // one was scrolled (Sonny, 10.10.2026); a place of the old view is not
      // carried over (`currentHash`). Deep links into another view (`goTo`:
      // IT's links out, the decision's conditions) keep their place.
      router.push(`?${query.toString()}${currentHash()}`, { scroll: false });
      window.scrollTo({ top: 0 });
    },
    [router, searchParams],
  );

  useEffect(() => {
    // Nothing is fetched without a signed-in account; the 404 below answers it.
    if (!enabled || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadProjectAndHydrate(projectId);
        if (cancelled) return;
        setProject(loaded);
        setArrival({ view: viewFromParam(new URLSearchParams(window.location.search).get('view')), hash: window.location.hash });
        setState(loaded ? 'ready' : 'missing');
      } catch (err) {
        // The rules answer `permission-denied` for a project that does not
        // exist and for one that is not the reader's alike, and both are a
        // 404. Anything else — the network, an unavailable backend — is a
        // read that failed, not a project that is missing.
        if (cancelled) return;
        const code = (err as { code?: unknown } | null)?.code;
        setState(code === 'permission-denied' ? 'missing' : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, projectId]);

  // Nothing of the shell is rendered before the profile has arrived — without
  // one there is no page here, and a skeleton would promise one.
  // A status for screen readers, not a skeleton: as an aria-hidden div the
  // gate read as a dead page (UX review of b88c77b, 3e936f9d57f8).
  // Signed out, the project frame sends the reader to the sign-in and back
  // (`components/ProjectFrame.tsx`, roadmap 3.0.21 (1)); until it has, this is
  // the loading gate, never the 404 a perfectly good link used to get.
  if (profileLoading || (!enabled && !getAuth().currentUser)) {
    return (
      <WorkspaceLoading />
    );
  }

  // Signed in without a profile: there is no workspace to show.
  if (!enabled) {
    notFound();
  }

  // A project this account may not read — one sentence and the way to My
  // workspace, the same the frame shows (roadmap 3.0.21 (1)).
  if (state === 'missing') {
    return <ProjectNoAccess />;
  }

  if (state === 'failed') {
    return (
      <div data-workspace-gate="failed" className="py-16 max-w-xl">
        <CcMessageStrip
          state="error"
          headline="This project could not be loaded"
          actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
        >
          The read failed, usually because of the connection. Nothing says the project is gone.
        </CcMessageStrip>
      </div>
    );
  }

  // Business is Analyze's: until the redirect above has landed, the loading gate.
  if (state === 'loading' || redirecting || view === 'business') {
    return (
      <WorkspaceLoading />
    );
  }

  return (
    <WorkspaceShell
      project={project}
      projectId={projectId}
      view={view}
      onViewChange={setView}
      account={profile}
    />
  );
}
