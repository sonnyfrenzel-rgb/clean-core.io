'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation';
import { useUserProfile } from '@/hooks/useUserProfile';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import { viewFromParam, type WorkspaceView } from '@/lib/workspace-model';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import type { Project } from '@/lib/types';

/**
 * The workspace of a project — roadmap step 1.4, behind the switch.
 *
 * `/project/{id}` has never resolved to anything: the seven stages each had a
 * page and the level above them did not, so the address 404ed. It still does,
 * for everybody except an administrator who has turned the preview on for their
 * own account — and that is the acceptance criterion of this phase stated as
 * code (`docs/ROADMAP.md` §Phase 1: *"und sich bei ausgeschaltetem Schalter für
 * Nutzer nichts ändert"*).
 *
 * `notFound()` rather than a redirect to `/analyze`, deliberately. A redirect
 * would be a **new** behaviour for a community account: an address that used to
 * be a dead end would start moving them somewhere. The requirement is not "a
 * reasonable fallback", it is "exactly what they see today", and today this is
 * a 404.
 *
 * The switch is read through `workspaceShellEnabled`, which asks two things —
 * the flag is on *and* the account is still an administrator. The flag itself
 * is written only by `POST /api/workspace-shell` through the Admin SDK and is
 * outside `userClientUpdateKeys()` in `firestore.rules`, so it cannot be set
 * from a browser console and needed no rules change to introduce.
 *
 * The view lives in `?view=` and nowhere else (ADR-018): it is a perspective,
 * not a grant, so it is kept in the URL and in browser history and never on the
 * project, the run, a signature or an audit pack.
 */
export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';

  const { profile, loading: profileLoading } = useUserProfile();
  const enabled = workspaceShellEnabled(profile);

  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  const view = viewFromParam(searchParams?.get('view'));

  const setView = useCallback(
    (next: WorkspaceView) => {
      const query = new URLSearchParams(searchParams?.toString() ?? '');
      query.set('view', next);
      // `push`, not `replace`: a view is a place the reader chose to be, and Back
      // should return them to the one they came from (ADR-018).
      router.push(`?${query.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    // Nothing is fetched for an account that may not see this page. The 404 below
    // must not be the only thing standing between a community account and a read
    // it was never meant to make.
    if (!enabled || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadProjectAndHydrate(projectId);
        if (cancelled) return;
        setProject(loaded);
        setState(loaded ? 'ready' : 'missing');
      } catch {
        if (!cancelled) setState('missing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, projectId]);

  // The profile decides whether this address exists at all, so nothing of the
  // shell is rendered before it has arrived — a skeleton of a page a reader may
  // not have would be the new thing this step promised not to show them.
  if (profileLoading) {
    return <div data-workspace-gate="loading" className="py-16" aria-hidden={true} />;
  }

  if (!enabled) {
    notFound();
  }

  if (state === 'missing') {
    notFound();
  }

  if (state === 'loading') {
    return <div data-workspace-gate="loading" className="py-16" aria-hidden={true} />;
  }

  return (
    <WorkspaceShell
      project={project}
      projectId={projectId}
      view={view}
      onViewChange={setView}
    />
  );
}
