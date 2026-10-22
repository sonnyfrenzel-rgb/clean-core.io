'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { getAuth } from '@/lib/firebase';
import { signInLinkFor } from '@/lib/return-path';
import {
  accessFromAnswer,
  projectGate,
  readerStripSentence,
  TO_SIGN_IN_SENTENCE,
  type ProjectAccess,
} from '@/lib/project-gate';
import { INVITATION_LIMITS_SENTENCE_RECIPIENT } from '@/lib/invitations';
import CcMessageStrip from '@/components/cc/MessageStrip';
import ProjectNoAccess from '@/components/ProjectNoAccess';

/**
 * The frame of every project page — the workspace and its seven tools
 * (roadmap 3.0.21, points 1 and 13). See `lib/project-gate.ts` for the rules.
 *
 * It asks two things, once per project: whether anybody is signed in (after
 * Firebase has restored the session, so a slow restore is not mistaken for a
 * signed-out reader), and what the server says this account is on the project
 * (`GET /api/projects/{id}?for=access` — owner, reader, or a 404). The page
 * underneath renders meanwhile and loads as it always did; the frame only takes
 * over for the two answers that make the page pointless — nobody signed in, or
 * no access — and adds the reader strip above it.
 *
 * Only the session the page arrived with is read. A sign-out from the account
 * menu navigates away by itself; reacting to it here as well would race that
 * navigation with a second one to the sign-in.
 */
export default function ProjectFrame({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectId: string }>();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  const pathname = usePathname();
  const router = useRouter();

  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [access, setAccess] = useState<{ projectId: string; value: ProjectAccess } | null>(null);

  useEffect(() => {
    const auth = getAuth();
    let live = true;
    void auth.authStateReady().then(() => {
      if (live) setSignedIn(auth.currentUser != null);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (signedIn !== true || !projectId) return;
    let live = true;
    (async () => {
      let value: ProjectAccess = { kind: 'unknown' };
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (token) {
          const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}?for=access`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          value = accessFromAnswer(res.status, await res.json().catch(() => null));
        }
      } catch {
        /* unknown: the page says what it says about a failed load */
      }
      if (live) setAccess({ projectId, value });
    })();
    return () => {
      live = false;
    };
  }, [signedIn, projectId]);

  const current = access && access.projectId === projectId ? access.value : undefined;
  const gate = projectGate(signedIn, current);

  useEffect(() => {
    if (gate === 'sign-in') router.replace(signInLinkFor(pathname ?? '/'));
  }, [gate, pathname, router]);

  if (gate === 'sign-in') {
    return (
      <div data-project-gate="sign-in" role="status" className="py-16">
        <p className="m-0 cc-text-cell text-cc-ink-muted">{TO_SIGN_IN_SENTENCE}</p>
      </div>
    );
  }

  if (gate === 'no-access') return <ProjectNoAccess />;

  return (
    <>
      {current?.kind === 'reader' ? (
        <div data-reader-strip="" className="mb-4">
          <CcMessageStrip state="information" headline={readerStripSentence(current.ownerName)}>
            {INVITATION_LIMITS_SENTENCE_RECIPIENT}
          </CcMessageStrip>
        </div>
      ) : null}
      {children}
    </>
  );
}
