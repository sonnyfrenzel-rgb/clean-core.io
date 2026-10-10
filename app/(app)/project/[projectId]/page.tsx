'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation';
import { useUserProfile } from '@/hooks/useUserProfile';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { viewFromParam, type WorkspaceView } from '@/lib/workspace-model';
import { viewSwitchHash } from '@/lib/view-switch';
import { firstLookSeen, markFirstLookSeen } from '@/lib/first-look';
import { useStartRun } from '@/hooks/useStartRun';
import { useFollowHash } from '@/hooks/useFollowHash';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import type { Project } from '@/lib/types';

/**
 * The query the build-up of `DESIGN.md` §5.2 answers to.
 *
 * *"After a code import or an example"* — so the build-up is not what every visit
 * to a workspace does; it is what the screen that started the analysis asks for
 * when it sends the reader here ("New project", roadmap 2.7). Without it the
 * first look goes straight to its end state, which is also what a second visit
 * gets.
 */
const FIRST_LOOK_PARAM = 'first';

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
 * Built behind an administrator's preview switch (1.4) and opened to every
 * signed-in account with roadmap 3.0.1 (ADR-061): every project opens here, and
 * the seven stages are its tools. What the reader may read is what it always
 * was — the Firestore rules decide, through `loadProjectAndHydrate`, and a
 * project that is not theirs answers `permission-denied`, which is a 404 here.
 * A visitor without an account has no profile and gets the 404 they got before.
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
  // `null` until the browser has been asked. Rendering the build-up and then
  // removing it would be the one thing a second visit is promised not to see.
  const [buildUp, setBuildUp] = useState<boolean | null>(null);

  const view = viewFromParam(searchParams?.get('view'));
  const asked = searchParams?.get(FIRST_LOOK_PARAM) === '1';

  useEffect(() => {
    if (!enabled || !projectId) return;
    if (!asked) {
      setBuildUp(false);
      return;
    }
    setBuildUp(!firstLookSeen(projectId));
  }, [enabled, projectId, asked]);

  // Marked as seen once the workspace is ready and the build-up is on screen —
  // not when it was merely asked for: a load that fails, or a tab closed before
  // the project arrived, used to cost the reader their first look (carried QA
  // finding bd900406a5fb).
  useEffect(() => {
    if (state === 'ready' && buildUp === true && projectId) markFirstLookSeen(projectId);
  }, [state, buildUp, projectId]);

  const setView = useCallback(
    (next: WorkspaceView) => {
      const query = new URLSearchParams(searchParams?.toString() ?? '');
      query.set('view', next);
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
        setState(loaded ? 'ready' : 'missing');
      } catch (err) {
        // The rules answer `permission-denied` for a project that does not
        // exist and for one that is not the reader's alike, and both are a
        // 404. Anything else — the network, an unavailable backend — is a
        // read that failed, not a project that is missing (QA baa8990fb123).
        if (cancelled) return;
        const code = (err as { code?: unknown } | null)?.code;
        setState(code === 'permission-denied' ? 'missing' : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, projectId]);

  /**
   * The project read again after the start run signed it, so the map, the
   * tools and Next step read the run rather than the source alone (ADR-072).
   * A failed read leaves the page as it was; the run is signed either way.
   */
  const reload = useCallback(async () => {
    if (!projectId) return;
    try {
      const loaded = await loadProjectAndHydrate(projectId);
      if (loaded) setProject(loaded);
    } catch {
      /* the next visit reads it */
    }
  }, [projectId]);

  // The signed engine-only run a new project starts with (ADR-072): asked for
  // by the first look of a project that has source and no run, and offered by
  // hand on any later visit. No model call; what it costs was said on the
  // screen that started the project.
  const startRun = useStartRun({
    project,
    projectId,
    auto: state === 'ready' && buildUp === true,
    onSigned: reload,
  });

  // Nothing of the shell is rendered before the profile has arrived — without
  // one there is no page here, and a skeleton would promise one.
  // A status for screen readers, not a skeleton: as an aria-hidden div the
  // gate read as a dead page (UX review of b88c77b, 3e936f9d57f8).
  if (profileLoading) {
    return (
      <div data-workspace-gate="loading" role="status" className="py-16">
        <span className="sr-only">Loading the workspace…</span>
      </div>
    );
  }

  if (!enabled) {
    notFound();
  }

  if (state === 'missing') {
    notFound();
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

  if (state === 'loading' || buildUp === null) {
    return (
      <div data-workspace-gate="loading" role="status" className="py-16">
        <span className="sr-only">Loading the workspace…</span>
      </div>
    );
  }

  return (
    <WorkspaceShell
      project={project}
      projectId={projectId}
      view={view}
      onViewChange={setView}
      account={profile}
      buildUp={buildUp}
      startRun={startRun}
    />
  );
}
