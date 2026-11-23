'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import WorkspaceLoading from '@/components/workspace/WorkspaceLoading';
import { workspaceRedirectHref } from '@/lib/workspace-redirect';

/**
 * `/project/<id>` — the project's workspace page, dissolved in 3.5.0 (plan
 * `docs/design/analyze-business-first-plan.md` §4.3, AB-11; ROADMAP 3.5.0 item (3)).
 *
 * A project opens in Analyze (ADR-109); IT and Management are Analyze's views
 * since AB-9 and AB-10. This route keeps every address it ever wrote working:
 * a bookmark, a mail, a stage's way back, a choice's link go to the place in
 * Analyze — or, for the costs, the Economics tool — that holds their content
 * (`lib/workspace-redirect.ts`, one table, tested against every address in
 * `tests/workspace-redirect.spec.ts`).
 *
 * The fragment never reaches a server, so the redirect is the browser's: one
 * `router.replace`, and should the router not have landed after eight seconds,
 * the browser goes there itself. Nothing is read or written here; what the
 * reader may see is decided where they land (`loadProjectAndHydrate` and the
 * Firestore rules, as before).
 */
export default function ProjectWorkspaceRedirect() {
  const params = useParams();
  const router = useRouter();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';

  useEffect(() => {
    if (!projectId) return;
    const target = workspaceRedirectHref({ projectId, search: window.location.search, hash: window.location.hash });
    router.replace(target, { scroll: false });
    const timer = window.setTimeout(() => window.location.replace(target), 8000);
    return () => window.clearTimeout(timer);
  }, [projectId, router]);

  return <WorkspaceLoading />;
}
