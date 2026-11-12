'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
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
 * Whether to send the reader to the sign-in is decided on the session the page
 * arrived with. A sign-out from the account menu navigates away by itself;
 * reacting to it here as well would race that navigation with a second one.
 *
 * The account, though, is followed for as long as the page is open (hotfix
 * 3.0.22, QA fa3278f7dc9b / 39d71e5eec25): Firebase shares the session across
 * tabs, so a sign-in as another account in a second tab switched this tab to
 * that account while it went on showing the first account's project and source.
 * Now every page underneath is mounted per account (`key={account}`) — a switch
 * throws away what the old account loaded, the page loads again as the new one,
 * and access is asked again; after a sign-out nothing of the project stays on
 * screen while the navigation runs.
 */
export default function ProjectFrame({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectId: string }>();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  const pathname = usePathname();
  const router = useRouter();

  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  /** Counts switches from one account to another; the key of everything underneath. */
  const [account, setAccount] = useState(0);
  const seen = useRef<string | null>(null);
  const [access, setAccess] = useState<{ projectId: string; uid: string; value: ProjectAccess } | null>(null);

  useEffect(() => {
    const auth = getAuth();
    let live = true;
    let stop: (() => void) | undefined;
    void auth.authStateReady().then(() => {
      if (!live) return;
      setSignedIn(auth.currentUser != null);
      seen.current = auth.currentUser?.uid ?? null;
      setUid(seen.current);
      stop = onAuthStateChanged(auth, (user) => {
        const next = user?.uid ?? null;
        // From one account straight to another: a new mount. Through a sign-out the
        // signed-out branch below has already unmounted the page.
        if (seen.current && next && seen.current !== next) setAccount((n) => n + 1);
        seen.current = next;
        setUid(next);
      });
    });
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  useEffect(() => {
    if (signedIn !== true || !projectId || !uid) return;
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
      if (live) setAccess({ projectId, uid, value });
    })();
    return () => {
      live = false;
    };
  }, [signedIn, projectId, uid]);

  const current = access && access.projectId === projectId && access.uid === uid ? access.value : undefined;
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

  // Signed out after the page arrived: the account menu's navigation is on its
  // way; nothing the old account loaded stays on screen meanwhile.
  if (signedIn === true && uid === null) {
    return <div data-project-gate="signed-out" role="status" className="py-16" />;
  }

  return (
    <Fragment key={account}>
      {current?.kind === 'reader' ? (
        <div data-reader-strip="" className="mb-4">
          <CcMessageStrip state="information" headline={readerStripSentence(current.ownerName)}>
            {INVITATION_LIMITS_SENTENCE_RECIPIENT}
          </CcMessageStrip>
        </div>
      ) : null}
      {children}
    </Fragment>
  );
}
