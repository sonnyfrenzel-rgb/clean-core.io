'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, getDocs, limit } from 'firebase/firestore';
import { Plus, Trash2, ArrowRight, ChevronRight, ChevronDown, FileText, FileCode2, Download, Copy, Eye, BookOpen, ShieldAlert, Clock, Shield, HelpCircle, UserPlus, Play } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { quotaExhausted, runsRemaining, runsAreSelfFunded } from '@/lib/run-quota-rule';
import { formatAnalysisToMarkdown, formatDesignToMarkdown, formatDocumentationToMarkdown, formatPresentationToMarkdown } from '@/lib/markdownFormatter';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { saveAs } from '@/lib/fileSaver';
import { workflowSteps, workflowSummary, testEvidence, staleness, PHASES } from '@/lib/workflow-steps';
import { projectProgress, PROJECT_STAGE_LABEL, type ProjectStage } from '@/lib/project-progress';
import ProjectProgressCell, { ProgressLegend } from '@/components/ProjectProgress';

import StarterExamples from '@/components/StarterExamples';
import DemoEntryCard from '@/components/demo/DemoEntryCard';
import InviteReaderDialog from '@/components/InviteReaderDialog';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcDateText from '@/components/cc/DateText';
import CcDialog from '@/components/cc/Dialog';
import CcField from '@/components/cc/Field';
import CcFilterBar from '@/components/cc/FilterBar';
import CcIconButton from '@/components/cc/IconButton';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcObjectIdentifier from '@/components/cc/ObjectIdentifier';
import CcSelect from '@/components/cc/Select';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTable, { type CcTableColumn, type CcTableRowSpec } from '@/components/cc/Table';
import CcTag from '@/components/cc/Tag';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcEmptyState, CcNoMatches } from '@/components/cc/EmptyState';

/**
 * "My workspace" — the dashboard every account sees (block D, D.22a).
 *
 * Rebuilt to `DESIGN.md` §2.2 (List Report) and mockup 2.8 s7, not removed
 * (ADR-052): the project list, Continue, Duplicate, Export, Delete, Invite, the
 * deliverables of a project, the quota, the "Your turn" card, the shipped starter
 * examples and the announcements are all still here. One thing is not: the
 * personal example library (uploading your own ABAP file to an `abap_examples`
 * list, browsing and deleting it) went with the redesign and has no successor
 * on this page — a project is where your own code goes. The
 * admin-only list report (`components/workspace/WorkspaceListReport.tsx`) is the
 * model; this page does not use it, so a community account's workspace never
 * carries `data-cc-workspace`.
 *
 * Phase state comes only from `lib/workflow-steps.ts` (and the object status
 * derived from it in `lib/workspace-rows.ts`), never from `project.status`.
 */


type ViewType = 'markdown' | 'code' | 'json' | 'html';

interface ViewContent {
  title: string;
  content: string;
  type: ViewType;
}

type ForumTopic = 'announcements' | 'technical' | 'general';

interface ForumPost {
  id: string;
  title: string;
  author: string;
  authorEmail?: string;
  isAdmin: boolean;
  category: ForumTopic;
  message: string;
  // No date: the posts are static text in this file, and a "Just now" on them
  // read as freshly published on every visit (QA 18158b8c64f9).
  pinned: boolean;
}

const TOPIC_LABEL: Record<ForumTopic, string> = {
  announcements: 'Announcement',
  technical: 'Technical',
  general: 'General',
};

/** Rendered markdown on the type scale (`.cc-prose`, app/globals.css). */
const PROSE = 'cc-prose';

const CODE = 'm-0 overflow-x-auto rounded-cc-card bg-cc-code-bg p-3 font-cc-mono text-[12px] leading-5 text-cc-code-ink whitespace-pre';

const LINK = 'font-semibold text-cc-brand-strong underline underline-offset-2';

const PROJECT_COLUMNS: readonly CcTableColumn[] = [
  { key: 'project', label: 'Project' },
  { key: 'progress', label: 'Status', width: '300px' },
  { key: 'created', label: 'Created', numeric: true, width: '130px' },
  { key: 'actions', label: 'Row actions', action: true, width: '300px' },
];

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const auth = getAuth();
  const db = getDb();
  const { profile, loading: loadingProfile } = useUserProfile();

  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewContent, setViewContent] = useState<ViewContent | null>(null);
  const router = useRouter();

  const [isCreating, setIsCreating] = useState(false);
  const [proceedingId, setProceedingId] = useState<string | null>(null);
  const [quotaBlocked, setQuotaBlocked] = useState(false);

  const [showWorkspaceInfo, setShowWorkspaceInfo] = useState(false);
  // Only reachable when the activation call at signup did not land — the account
  // exists but is still 'pending'. See the retry block further down.
  const [retryingActivation, setRetryingActivation] = useState(false);
  const [activationError, setActivationError] = useState('');

  const [showForum, setShowForum] = useState(false);

  // The project list's live filter (§2.5).
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState<ProjectStage | ''>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [inviting, setInviting] = useState<{ id: string; name: string } | null>(null);


  useEffect(() => {
    console.log('[DASHBOARD LOG] useEffect auth listener mounted. auth.currentUser:', auth.currentUser ? auth.currentUser.email : 'null');

    if (auth.currentUser) {
      console.log('[DASHBOARD LOG] Synchronous auth.currentUser found, initializing immediately');
      setUser(auth.currentUser);
      setLoadingAuth(false);
    }

    let redirectTimer: NodeJS.Timeout | null = null;

    // Safety net: if after 8s loadingAuth is still true but auth.currentUser exists,
    // force-resolve to prevent infinite spinner on slow CI runners where
    // onAuthStateChanged may fire before the component mounts.
    const safetyTimer = setTimeout(() => {
      if (auth.currentUser) {
        console.log('[DASHBOARD LOG] Safety timeout (8s): auth.currentUser exists, force-resolving loadingAuth');
        setUser(auth.currentUser);
        setLoadingAuth(false);
      }
    }, 8000);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('[DASHBOARD LOG] onAuthStateChanged fired. currentUser:', currentUser ? currentUser.email : 'null');
      if (!currentUser) {
        // Grace period: Firebase Auth may need time to restore the session token from IndexedDB
        // after a page load. Delay the redirect to avoid premature logout on slow CI runners.
        console.log('[DASHBOARD LOG] No currentUser detected, waiting 3s for token restoration...');
        redirectTimer = setTimeout(() => {
          // Double-check: auth.currentUser might have been set synchronously after the listener fired
          if (auth.currentUser) {
            console.log('[DASHBOARD LOG] Grace period expired but auth.currentUser now exists, setting auth state');
            setUser(auth.currentUser);
            setLoadingAuth(false);
          } else {
            console.log('[DASHBOARD LOG] Grace period expired, no user restored. Redirecting to /');
            router.push('/');
          }
        }, 3000);
      } else {
        // User found — cancel any pending redirect and set auth state
        if (redirectTimer) {
          clearTimeout(redirectTimer);
          redirectTimer = null;
        }
        console.log('[DASHBOARD LOG] Valid user found, setting auth state');
        setUser(currentUser);
        setLoadingAuth(false);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(safetyTimer);
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setLoadingProjects(true);
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    // Immediate, robust one-time getDocs fetch to ensure loading state resolves
    // even if the persistent onSnapshot streaming connection hangs or is blocked on CI runners.
    // It must not land after the listener has spoken (it would be older), nor
    // after this effect was cleaned up — the account may have changed since.
    let cancelled = false;
    let live = false;
    getDocs(q).then((snapshot) => {
      if (cancelled || live) return;
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingProjects(false);
    }).catch((error) => {
      console.error('Immediate getDocs projects fetch error:', error);
    });

    const unsubscribe = onSnapshot(q, (snapshot) => {
      live = true;
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingProjects(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
      setLoadingProjects(false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  const handleCreateProject = async () => {
    if (!projectName || isCreating || !profile) return;

    // The server's rule, not a third of it: an enterprise account and an
    // account with its own Gemini key are never charged (QA 9b1af76b65c9).
    if (quotaExhausted(profile)) {
      setQuotaBlocked(true);
      return;
    }

    setIsCreating(true);
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        name: projectName,
        status: 'uploaded',
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setProjectName('');
      setShowUpload(false);
      router.push(`/project/${docRef.id}/analyze`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteTarget || deleting) return;
    const deleteId = deleteTarget.id;
    setDeleting(true);
    try {
      // F-03: delete server-side so the immutable runs/{runId} subcollection is
      // recursively purged too — a client deleteDoc() would orphan it (Firestore
      // does not cascade subcollections). Client project-delete is disabled in rules.
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated.');
      const res = await fetch(`/api/projects/${encodeURIComponent(deleteId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      // 404 is what a repeated delete hears once the first one went through and
      // its answer was lost: the project is gone, which is what was asked for.
      // The list is a live query, so a project that is still there stays on it
      // (carried QA finding ac74ebf5a627).
      if (!res.ok && res.status !== 404) {
        const { error } = await res.json().catch(() => ({ error: 'Delete failed.' }));
        throw new Error(error || 'Delete failed.');
      }
      setDeleteTarget(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${deleteId}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyProject = async (project: any) => {
    try {
      await addDoc(collection(db, 'projects'), {
        name: `${project.name} - Copy`,
        status: 'uploaded',
        legacyCode: project.legacyCode || '',
        userId: user.uid,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    }
  };

  const handleExportProject = async (project: any) => {
    const { id, userId, ...exportData } = project;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    await saveAs(blob, `${project.name.replace(/\s+/g, '_')}_export.json`);
  };

  // "Continue" goes to the first phase that is not done, as the shared contract
  // reads it. It used to follow `status`, a label the client writes, and sent
  // any project scoring above 90 straight to Delivery whatever else was missing.
  const continuePath = (project: any) => {
    const { next } = workflowSummary(workflowSteps(project));
    return `/project/${project.id}/${next.path}`;
  };
  const handleProceed = (project: any) => {
    setProceedingId(project.id);
    router.push(continuePath(project));
  };

  /**
   * Roadmap 0.2 (UX-059). The board below used to carry a "Post to Forum" form,
   * a "Like Post" button and a comment box. None of them reached a server:
   * `handleCreateForumPost` waited 800ms on a timer, pushed the thread into
   * this component's `useState`, and rendered "Thread Posted Successfully! —
   * Thank you for contributing to our developer community". One reload and the
   * question was gone, and nobody had ever seen it. The same was true of every
   * like and every comment.
   *
   * Written questions about somebody's own ABAP are the last thing this product
   * should take and silently drop, so the write half is removed rather than
   * relabelled — there is no forum backend to bind it to, and building one is
   * not a Phase 0 correction. What remains is what was always real: the
   * announcements the administrator ships with the app, readable, searchable,
   * and said to be read-only in as many words, next to the address that does
   * reach a person.
   */
  const [activePost, setActivePost] = useState<ForumPost | null>(null);
  const [forumFilter, setForumFilter] = useState<'all' | ForumTopic>('all');
  const [forumSearch, setForumSearch] = useState('');

  const [forumPosts] = useState<ForumPost[]>([
    {
      id: 'post-pinned',
      title: 'Welcome to the Clean-Core.io Community Forum & Tech Escalations',
      author: 'Clean-Core Admin',
      authorEmail: 'admin@clean-core.io',
      isAdmin: true,
      category: 'announcements',
      message: 'Welcome everyone! This board carries announcements from the administrator about Clean-Core.io; it takes no posts or comments. Everything on Clean-Core.io is free to use: every user gets the full 7-stage workflow (5 transformations to start; bring your own Gemini key for unlimited runs). For account approvals or an admin-gated S/4HANA sandbox connection, reach the admin team at admin@clean-core.io. Happy modernizing!',
      pinned: true,
    },
    {
      id: 'post-abcd-blog',
      title: 'New on SAP Community: Clean Core Levels A–D — classify your custom ABAP',
      author: 'Clean-Core Admin',
      authorEmail: 'admin@clean-core.io',
      isAdmin: true,
      category: 'announcements',
      message: `We just published a full write-up on SAP Community — "Clean Core Levels A–D: how to classify your custom ABAP (and what to do with it)". Here's the short version:\n\nSAP Clean Core guidance moved from a fuzzy "clean / not clean" view to a four-grade, cloud-readiness classification for technical objects — A, B, C, D:\n\n- A — Released SAP APIs & extension points. Cloud-ready; build here.\n- B — Classic SAP APIs, SAP-recommended. Usable; plan for released successors over time.\n- C — Internal SAP APIs, conditionally clean. Wrap behind a clean interface; verify per release.\n- D — Not-recommended objects/tech (direct writes to standard tables, unreleased dependencies, dynpro/kernel). The upgrade blockers — replace or re-architect.\n\nPractical flow: identify each object → look it up in SAP's Cloudification Repository → assign a grade → decide remediation (map to a released API/CDS view, wrap, or re-architect) → confirm with SAP ADT/ATC.\n\nFull post on SAP Community: https://community.sap.com/t5/technology-blog-posts-by-members/clean-core-levels-a-d-how-to-classify-your-custom-abap-and-what-to-do-with/ba-p/14437956\n\nTry the A–D readiness estimate on your own code (free): https://clean-core.io/sap-clean-core-object-classification\n\nNote: Clean-Core.io's A–D grade is an experimental preview estimate — a fast orientation aid, not an authoritative SAP ATC classification. Always verify with SAP ADT/ATC for your target release.`,
      pinned: true,
    },
    {
      id: 'post-pinned-techstack',
      title: 'Clean-Core.io Technical Architecture & Tech Stack Deep Dive',
      author: 'Clean-Core Admin',
      authorEmail: 'admin@clean-core.io',
      isAdmin: true,
      category: 'technical',
      message: `Welcome to the official technical blueprint of Clean-Core.io!\n\nClean-Core.io modernizes custom SAP ABAP toward clean, upgrade-safe TypeScript/Node.js — deterministic evidence first, AI second. The stack:\n\n- Frontend: Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind v4.\n- Evidence engine: a deterministic ABAP parser/analyzer runs first and produces the auditable facts (code inventory, findings, complexity/criticality scores, RAP vs CAP routing) — before any AI call, to prevent structure hallucination.\n- AI gateway: Google Gemini (${PRODUCT_GEMINI_MODEL}) narrates and transforms on top of that evidence. Keys never reach the client — every call is proxied through our server.\n- BYOK: your own Gemini API key is encrypted at rest (AES-256-GCM) in a server-only store and used exclusively via the secure backend proxy — it is never returned to the client.\n- Sandbox testing: generated tests run in a separate runner service with no roles, no platform secrets and no open network egress, inside a restricted Node child process there (esbuild bundle + Node Permission Model + preloaded module and network guards). Test execution against a live S/4HANA tenant is locked until the isolated live runner has passed its review.\n- Trust chain: every analysis is frozen as an immutable, HMAC-signed Run that anchors a server-generated, verifiable audit evidence pack.\n- Persistence: strict per-user isolation via Firestore security rules.\n\nQuestions about the evidence engine or the transformation go to admin@clean-core.io.`,
      pinned: true,
    }
  ]);

  // Render a forum message as plain text with any http(s) URL turned into a clickable link.
  // Newlines are preserved by the container's `whitespace-pre-line`.
  const renderMessageWithLinks = (text: string) =>
    (text || '').split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`${LINK} break-all`}>
          {part}
        </a>
      ) : (
        part
      )
    );

  const downloadFile = async (content: string, filename: string, type: string = 'text/plain') => {
    const blob = new Blob([content], { type });
    await saveAs(blob, filename);
  };

  const rows = useMemo(
    () => projects.map((project) => ({ project, progress: projectProgress(project) })),
    [projects],
  );
  const shownRows = useMemo(() => {
    const needle = projectSearch.trim().toLowerCase();
    return rows.filter(({ project, progress }) => {
      if (projectStatusFilter && progress.stage !== projectStatusFilter) return false;
      return !needle || `${project.name ?? ''} ${project.id}`.toLowerCase().includes(needle);
    });
  }, [rows, projectSearch, projectStatusFilter]);
  const statusesInList = useMemo(() => {
    const order: ProjectStage[] = ['not-started', 'not-analysed', 'in-progress', 'all-done', 'handed-over'];
    return order.filter((stage) => rows.some((r) => r.progress.stage === stage));
  }, [rows]);
  const projectFilterActive = projectSearch.trim().length > 0 || projectStatusFilter !== '';
  const clearProjectFilter = useCallback(() => {
    setProjectSearch('');
    setProjectStatusFilter('');
  }, []);

  // Diagnostic: log which flag is blocking render (helps debug CI hangs)
  if (!mounted || !auth || !db || loadingAuth || loadingProfile) {
    if (typeof window !== 'undefined') {
      console.log(`[DASHBOARD LOG] Blocked by loading guard: mounted=${mounted}, auth=${!!auth}, db=${!!db}, loadingAuth=${loadingAuth}, loadingProfile=${loadingProfile}`);
    }
    return (
      <div className="cc mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-6 sm:px-6">
        <CcSkeleton shape="header" label="workspace" />
        <CcSkeleton shape="table" label="projects" count={3} />
      </div>
    );
  }

  // A suspended account is the only state an administrator can still put someone
  // in, and it is not something the person can undo themselves.
  if (profile?.status === 'suspended' || profile?.status === 'deleted') {
    return (
      <div className="cc mx-auto flex max-w-2xl flex-col items-center px-4 pt-16 text-center md:pt-24">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-cc-card border border-cc-error-border bg-cc-error-bg text-cc-error">
          <ShieldAlert size={24} aria-hidden={true} />
        </div>
        <h2 className="m-0 mb-3 cc-text-title text-cc-ink">This account is suspended</h2>
        <p className="mb-6 cc-text-body text-cc-ink-muted">
          Access to <strong>Clean-Core.io</strong> has been withdrawn for this account. If you believe that is a
          mistake, write to us and we will look at it.
        </p>
        <a href="mailto:info@clean-core.io" className={LINK}>
          Email info@clean-core.io
        </a>
      </div>
    );
  }

  // 'pending' used to mean "waiting for an administrator". It now only means the
  // activation call at the end of signup did not complete — a dropped request, a
  // closed tab. The account is one idempotent call away from being active, so
  // offer that call instead of a waiting room.
  if (profile?.status === 'pending') {
    const retryActivation = async () => {
      setActivationError('');
      setRetryingActivation(true);
      try {
        const currentUser = getAuth()?.currentUser;
        if (!currentUser) throw new Error('You are not signed in any more. Please sign in again.');
        const token = await currentUser.getIdToken();
        const res = await fetch('/api/account/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ acceptedTerms: true, acceptedPrivacy: true }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Activation failed (HTTP ${res.status}).`);
        }
        // The profile listener picks the new status up on its own.
      } catch (err: any) {
        setActivationError(err?.message || 'Activation failed. Please try again.');
      } finally {
        setRetryingActivation(false);
      }
    };

    return (
      <div className="cc mx-auto flex max-w-2xl flex-col items-center px-4 pt-16 text-center md:pt-24">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-cc-card border border-cc-warning-border bg-cc-warning-bg text-cc-warning">
          <Clock size={24} aria-hidden={true} />
        </div>
        <h2 className="m-0 mb-3 cc-text-title text-cc-ink">Almost there</h2>
        <p className="mb-6 cc-text-body text-cc-ink-muted">
          Your <strong>Clean-Core.io</strong> account was created but the last setup step did not finish.
          Nobody has to approve anything — one click completes it.
        </p>
        <div className="flex w-full flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-6 text-left shadow-cc">
          <CcButton variant="primary" density="cozy" busy={retryingActivation} onClick={retryActivation}>
            Finish setting up my workspace
          </CcButton>
          {activationError ? (
            <CcMessageStrip state="error" announce>
              {activationError}
            </CcMessageStrip>
          ) : null}
          <p className="m-0 cc-text-meta text-cc-ink-muted">
            Still stuck? Write to{' '}
            <a href="mailto:info@clean-core.io" className={LINK}>info@clean-core.io</a>{' '}
            and we will activate it by hand.
          </p>
        </div>
      </div>
    );
  }

  const exhausted = quotaExhausted(profile);
  const limitCount = profile?.transformationsLimit ?? 5;
  const hasOwnProjects = !loadingProjects && projects.length > 0;
  const showYourTurn = !loadingProjects && projects.length === 0;

  // What a new run costs this account, said inside the dialog that starts one.
  const quotaStrip = exhausted ? (
    <CcMessageStrip state="warning" headline="Quota exceeded.">
      You have used all <strong>{limitCount}</strong> free transformations. Add your own Gemini API key in settings for unlimited runs — Clean-Core.io stays free.
    </CcMessageStrip>
  ) : (
    <CcMessageStrip state="information" headline="Free balance.">
      {runsAreSelfFunded(profile) ? (
        profile?.tier === 'enterprise'
          ? 'Unlimited enterprise transformations remaining.'
          : 'Your own Gemini key — runs are not counted against the free quota.'
      ) : (
        <>
          You have <strong>{runsRemaining(profile)}</strong> of <strong>{profile?.transformationsLimit || 5}</strong> free transformations left.
        </>
      )}
    </CcMessageStrip>
  );

  const tableRows: CcTableRowSpec[] = shownRows.map(({ project, progress }) => {
    const isOpen = !!expanded[project.id];
    const toggle = () => setExpanded((prev) => ({ ...prev, [project.id]: !prev[project.id] }));

    return {
      key: project.id,
      onOpen: toggle,
      selected: isOpen,
      cells: {
        project: (
          <span className="flex min-w-0 items-start gap-2">
            {/* UX-060: the row toggles on a click for the mouse; this button is
                the keyboard's way in, and carries the name and the state. */}
            <CcIconButton
              label={`Deliverables of ${project.name}`}
              aria-expanded={isOpen}
              aria-controls={`project-deliverables-${project.id}`}
              onClick={toggle}
            >
              {isOpen ? <ChevronDown size={16} aria-hidden={true} /> : <ChevronRight size={16} aria-hidden={true} />}
            </CcIconButton>
            <Link href={continuePath(project)} data-dashboard-open={project.id} className="min-w-0">
              <CcObjectIdentifier title={project.name} identifier={project.id} />
            </Link>
          </span>
        ),
        // One plain sentence, the seven steps as a bar that agrees with its
        // count, and the next action as a link (owner feedback 01.10.2026,
        // `lib/project-progress.ts`). The phase contract is the only source.
        progress: <ProjectProgressCell progress={progress} projectHref={`/project/${project.id}`} id={project.id} />,
        created: (
          <span className="font-cc-mono text-[12px]">
            <CcDateText value={project.createdAt} format="iso" fallback="no date recorded" />
          </span>
        ),
        actions: (
          <span className="flex flex-wrap items-center gap-1 sm:flex-nowrap sm:justify-end">
            <CcButton
              variant="secondary"
              icon={<ArrowRight size={16} aria-hidden={true} />}
              busy={proceedingId === project.id}
              onClick={() => handleProceed(project)}
              title="Continue Transformation"
            >
              Continue
            </CcButton>
            <CcIconButton
              label="Invite someone to read this project"
              title="Invite someone to read this project"
              data-invite-open=""
              onClick={() => setInviting({ id: project.id, name: project.name })}
            >
              <UserPlus size={16} aria-hidden={true} />
            </CcIconButton>
            <CcIconButton label="Duplicate Project" title="Duplicate Project" onClick={() => handleCopyProject(project)}>
              <Copy size={16} aria-hidden={true} />
            </CcIconButton>
            <CcIconButton label="Export JSON" title="Export JSON" onClick={() => handleExportProject(project)}>
              <Download size={16} aria-hidden={true} />
            </CcIconButton>
            <CcIconButton
              label="Delete Project"
              title="Delete Project"
              onClick={() => setDeleteTarget({ id: project.id, name: project.name })}
            >
              <Trash2 size={16} aria-hidden={true} />
            </CcIconButton>
          </span>
        ),
      },
      note: isOpen ? (
        <ProjectDeliverables
          project={project}
          onView={(title, content, type) => setViewContent({ title, content, type })}
          onDownload={downloadFile}
        />
      ) : undefined,
    };
  });

  const topics = [
    { id: 'all' as const, label: 'All', count: forumPosts.length },
    { id: 'announcements' as const, label: 'Announcements', count: forumPosts.filter(p => p.pinned || p.category === 'announcements').length },
    { id: 'technical' as const, label: 'Technical', count: forumPosts.filter(p => p.category === 'technical').length },
    { id: 'general' as const, label: 'General', count: forumPosts.filter(p => p.category === 'general').length },
  ];

  const filteredForumPosts = forumPosts.filter(post => {
    if (forumFilter === 'announcements' && !post.pinned && post.category !== 'announcements') return false;
    if (forumFilter === 'technical' && post.category !== 'technical') return false;
    if (forumFilter === 'general' && post.category !== 'general') return false;

    if (forumSearch.trim()) {
      const q = forumSearch.toLowerCase();
      return [post.title, post.message, post.author].some((s) => (s || '').toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="cc min-h-screen bg-cc-page px-4 py-6 sm:px-6" data-dashboard="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 cc-text-title text-cc-ink">My workspace</h1>
              <CcIconButton
                label="What is this workspace for?"
                title="What is this workspace for?"
                onClick={() => setShowWorkspaceInfo(true)}
              >
                <HelpCircle size={16} aria-hidden={true} />
              </CcIconButton>
              {/* The quota is stated once, in the header of the shell (it used
                  to be stated twice, counted from both ends). */}
            </div>
            <p className="mt-1 mb-0 cc-text-cell text-cc-ink-muted">Manage your transformation projects and deliverables.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CcLinkButton href="/how-to" variant="ghost" icon={<BookOpen size={16} aria-hidden={true} />}>
              How-to
            </CcLinkButton>
            {hasOwnProjects ? (
              <CcButton variant="primary" icon={<Plus size={16} aria-hidden={true} />} onClick={() => setShowUpload(true)}>
                Create project
              </CcButton>
            ) : null}
          </div>
        </div>

        {exhausted ? (
          <CcMessageStrip
            state="warning"
            headline="Limit reached."
            actions={
              <CcButton variant="ghost" onClick={() => router.push('/settings')}>
                Go to settings
              </CcButton>
            }
          >
            You&apos;ve used your {limitCount} free transformations. Add your own Gemini API key in settings for unlimited runs — at no cost.
          </CcMessageStrip>
        ) : null}

        {quotaBlocked ? (
          <CcMessageStrip
            state="warning"
            headline="Limit reached."
            announce
            actions={
              <CcButton variant="ghost" onClick={() => setQuotaBlocked(false)}>
                Close
              </CcButton>
            }
          >
            You&apos;ve used all {limitCount} free transformations. Add your own Gemini API key in settings for unlimited runs — Clean-Core.io stays free.
          </CcMessageStrip>
        ) : null}

        {showYourTurn ? (
          <CcCard density="cozy">
            <div className="flex flex-wrap items-center gap-4" data-dashboard-your-turn="">
              <span className="text-cc-ink-muted">
                <Play size={20} aria-hidden={true} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 cc-text-h2 text-cc-ink">Your turn</h2>
                <p className="mt-1 mb-0 cc-text-cell text-cc-ink-muted">
                  Start with an example below — the first run of each is free — or with your own code. The demo is a
                  finished case to read; it belongs to no account, and nothing done in it is saved.
                </p>
              </div>
              <CcButton variant="primary" icon={<Plus size={16} aria-hidden={true} />} onClick={() => setShowUpload(true)}>
                Create project
              </CcButton>
            </div>
          </CcCard>
        ) : null}

        {/* The demo project — roadmap 0.10. One demo for every account, so it is a
            link rather than a row of the list below: the list is a Firestore query
            over this account's projects and the demo belongs to no account. */}
        <DemoEntryCard />

        <div data-dashboard-projects="">
          <CcCard title="Projects" level={2} count={loadingProjects ? undefined : shownRows.length} density="cozy">
            {loadingProjects ? (
              <CcSkeleton shape="table" label="projects" count={3} />
            ) : projects.length === 0 ? (
              <CcEmptyState title="No projects yet">
                A project is one piece of ABAP taken from not understood to a decision you can show someone. Create
                your first one above, or start from an example.
              </CcEmptyState>
            ) : (
              <div className="flex flex-col gap-3">
                <CcFilterBar
                  noun="projects"
                  shown={shownRows.length}
                  total={rows.length}
                  search={projectSearch}
                  onSearch={setProjectSearch}
                  active={projectFilterActive}
                  onClear={clearProjectFilter}
                >
                  <CcSelect<ProjectStage | 'any'>
                    label="Status"
                    value={projectStatusFilter || 'any'}
                    onChange={(v) => setProjectStatusFilter(v === 'any' ? '' : v)}
                    options={[
                      { value: 'any', label: 'Any status' },
                      ...statusesInList.map((value) => ({ value, label: PROJECT_STAGE_LABEL[value] })),
                    ]}
                  />
                </CcFilterBar>
                {shownRows.length === 0 ? (
                  <CcNoMatches
                    title="No projects match these filters"
                    reason="Every project you have is still here — the filters are hiding them."
                    onClear={clearProjectFilter}
                  />
                ) : (
                  <>
                    {/* What the step bar in every row means (owner feedback 01.10.2026). */}
                    <ProgressLegend />
                    <CcTable caption="Projects" columns={PROJECT_COLUMNS} rows={tableRows} />
                  </>
                )}
              </div>
            )}
          </CcCard>
        </div>

        {/* Examples — shipped with the product, identical for every account. One
            gallery (UX-063), the same component "New project" shows: one
            recommended start, three next, the rest behind "More examples"
            (owner feedback 01.10.2026). Placed under the list because a new
            account's list is empty, and "bring your own ABAP first" is where
            most accounts stop. */}
        {user ? (
          <StarterExamples userId={user.uid} account={profile} />
        ) : null}

        {/* Announcements — read-only (UX-059, UX-147). */}
        <section
          aria-labelledby="dashboard-announcements-title"
          className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 basis-64">
              <h2 id="dashboard-announcements-title" className="m-0 cc-text-h2 text-cc-ink">
                Clean-Core.io announcements
              </h2>
              <p className="mt-1 mb-0 cc-text-cell text-cc-ink-muted">
                Release notes and background from the people who build this. Read-only for now — there is no forum server behind it, so nothing written here would reach anyone.
              </p>
            </div>
            <CcButton
              variant="ghost"
              aria-expanded={showForum}
              aria-controls="dashboard-announcements"
              icon={<ChevronDown size={16} aria-hidden={true} />}
              onClick={() => setShowForum(!showForum)}
            >
              {showForum ? 'Close announcements' : 'Open announcements'}
            </CcButton>
          </div>

          {showForum ? (
            <div id="dashboard-announcements" className="mt-4 flex flex-col gap-4">
              <CcFilterBar
                noun="posts"
                shown={filteredForumPosts.length}
                total={forumPosts.length}
                search={forumSearch}
                onSearch={setForumSearch}
                active={forumSearch.trim().length > 0 || forumFilter !== 'all'}
                onClear={() => {
                  setForumSearch('');
                  setForumFilter('all');
                }}
              >
                {/*
                  A topic appears once it has something to show. The board
                  became read-only announcements, but "Technical Q&A" and
                  "General" stayed on the bar with a count of 0 — an offer of
                  discussion on a board that carries none (UX review of
                  bc2f7863464c). Filtering the list rather than deleting the
                  entries keeps them correct either way. "All" always stays.
                */}
                <CcSelect<'all' | ForumTopic>
                  label="Topic"
                  value={forumFilter}
                  onChange={setForumFilter}
                  options={topics
                    .filter((tab) => tab.id === 'all' || tab.count > 0)
                    .map((tab) => ({ value: tab.id, label: `${tab.label} (${tab.count})` }))}
                />
              </CcFilterBar>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Announcements list (read-only, UX-147) */}
                <div className="flex flex-col gap-3 lg:col-span-2">
                  <div>
                    <h3 className="m-0 cc-text-h3 text-cc-ink">Announcements</h3>
                    {/* Read-only posts by the Clean-Core team, each with a topic —
                        none of them is a discussion (QA review of 4b4586aff273). */}
                    <p className="mt-1 mb-0 cc-text-meta text-cc-ink-muted">Read-only posts from the Clean-Core team, filed by topic. Tap any entry to read it in full.</p>
                  </div>

                  {filteredForumPosts.length === 0 ? (
                    <CcNoMatches
                      title="No announcements match these filters"
                      reason="Every post is still here — the filters are hiding them."
                      onClear={() => {
                        setForumSearch('');
                        setForumFilter('all');
                      }}
                    />
                  ) : (
                    filteredForumPosts.map((post) => (
                      <article key={post.id} className="flex flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {post.pinned ? <CcTag>Pinned</CcTag> : null}
                          {post.isAdmin ? <CcTag>Admin</CcTag> : null}
                          <CcTag>{TOPIC_LABEL[post.category]}</CcTag>
                        </div>
                        <h4 className="m-0 cc-text-identifier text-cc-ink">{post.title}</h4>
                        <p className="m-0 cc-text-meta text-cc-ink-muted">
                          By @{post.author}
                        </p>
                        <p className="m-0 line-clamp-3 whitespace-pre-wrap cc-text-cell text-cc-ink">{post.message}</p>
                        <div className="flex justify-end">
                          <CcButton variant="ghost" onClick={() => setActivePost(post)} aria-label={`Read: ${post.title}`}>
                            Read
                          </CcButton>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                {/* How to reach a person, and why the board is read-only */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface-muted p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-cc-ink-muted">
                        <Shield size={20} aria-hidden={true} />
                      </span>
                      <div className="min-w-0">
                        <span className="block cc-text-label text-cc-ink-muted">Verified administrator</span>
                        <h4 className="m-0 cc-text-h3 text-cc-ink">Clean-Core Admin</h4>
                      </div>
                    </div>
                    <p className="m-0 cc-text-cell text-cc-ink-muted">
                      Our admin team handles account approvals, admin-gated S/4HANA sandbox access, and platform questions. Email is the way to reach them.
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block cc-text-label text-cc-ink-muted">Admin mailbox</span>
                        <a href="mailto:admin@clean-core.io" className={`${LINK} font-cc-mono`}>admin@clean-core.io</a>
                      </span>
                      <span title="All emails sent to admin@clean-core.io are securely forwarded to the platform administrators.">
                        <CcTag>Forwarded</CcTag>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-4" data-forum-readonly>
                    <h3 className="m-0 cc-text-h3 text-cc-ink">This board is read-only</h3>
                    <p className="m-0 cc-text-meta text-cc-ink-muted">
                      There is no forum server behind this page yet, so there is nowhere for a post to go. Until there is,
                      the board carries the administrator&apos;s announcements and nothing else — no posting, no comments,
                      no likes.
                    </p>
                    <p className="m-0 cc-text-meta text-cc-ink-muted">
                      A question, a finding that looks wrong, an edge case worth reporting: write to{' '}
                      <a href="mailto:admin@clean-core.io" className={LINK}>admin@clean-core.io</a>{' '}
                      and a person reads it.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* Delete — a Message Box, the consequence in words (§1.5, §2.6). */}
      <CcMessageBox
        open={!!deleteTarget}
        title="Delete project"
        confirmLabel="Delete project"
        onConfirm={handleDeleteProject}
        onCancel={() => setDeleteTarget(null)}
      >
        <p className="m-0">
          “{deleteTarget?.name}” and all its generated assets will be deleted. This cannot be undone.
        </p>
      </CcMessageBox>

      <CcDialog
        open={showUpload}
        onClose={() => {
          if (!isCreating) setShowUpload(false);
        }}
        title="Create project"
        lead="Give your transformation project a descriptive name."
        onSubmit={() => void handleCreateProject()}
        actions={
          <>
            <CcButton variant="ghost" onClick={() => setShowUpload(false)} disabled={isCreating}>
              Cancel
            </CcButton>
            <CcButton
              variant="primary"
              type="submit"
              busy={isCreating}
              disabled={!projectName.trim() || exhausted}
            >
              Create project
            </CcButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <CcMessageStrip state="neutral" headline="Terms.">
            Clean-Core.io is a free community platform. Generated code comes from a language model, may contain
            errors, and is provided without warranty or liability. The{' '}
            <a href="/settings" className={LINK}>Privacy Policy</a> and Legal Notice are in settings.
          </CcMessageStrip>
          {quotaStrip}
          <CcField label="Project name">
            {(control) => (
              <input
                id={control.id}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className={control.className}
                placeholder="e.g., Z_FI_INVOICE_REPORT"
                disabled={isCreating || exhausted}
              />
            )}
          </CcField>
        </div>
      </CcDialog>

      <CcDialog
        open={!!viewContent}
        onClose={() => setViewContent(null)}
        title={viewContent?.title ?? ''}
        size="wide"
        actions={
          viewContent ? (
            <CcButton
              variant="primary"
              icon={<Download size={16} aria-hidden={true} />}
              onClick={() => {
                const ext = viewContent.type === 'code' ? '.js' : viewContent.type === 'json' ? '.json' : '.md';
                void downloadFile(viewContent.content, `${viewContent.title.replace(/\s+/g, '_')}${ext}`);
              }}
            >
              Download file
            </CcButton>
          ) : null
        }
      >
        {viewContent?.type === 'markdown' ? (
          <div className={PROSE} dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(viewContent.content) }} />
        ) : viewContent ? (
          <pre className={CODE}>{viewContent.content}</pre>
        ) : null}
      </CcDialog>

      <CcDialog
        open={showWorkspaceInfo}
        onClose={() => setShowWorkspaceInfo(false)}
        title="What is the Clean-Core workspace?"
        lead="Your central place for understanding custom SAP code and deciding what becomes of it."
        actions={
          <CcButton variant="primary" onClick={() => setShowWorkspaceInfo(false)}>
            Got it
          </CcButton>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="m-0 cc-text-h3 text-cc-ink">Transformation pipeline</h3>
            <p className="mt-1 mb-0">
              A deterministic engine reads your ABAP and finds what stands in the way of Clean Core. On top of that
              evidence a language model drafts a TypeScript and Node.js proposal; a draft is a starting point that
              needs review and tests, not a solution that already meets Clean Core.
            </p>
          </div>
          <div>
            <h3 className="m-0 cc-text-h3 text-cc-ink">Free Community Edition limits</h3>
            <p className="mt-1 mb-0">
              Free accounts are limited to <strong>{limitCount} transformations</strong>. For unlimited
              transformations, configure your own Gemini API key in{' '}
              <a href="/settings" className={LINK}>Profile Settings</a> (BYOK mode) at no extra cost.
            </p>
          </div>
          <div>
            <h3 className="m-0 cc-text-h3 text-cc-ink">What you can do here</h3>
            <ul className="mt-1 mb-0 flex list-disc flex-col gap-1 pl-4">
              <li><strong>Create projects:</strong> one project for a custom report, function module, or table mapping.</li>
              <li><strong>Full lifecycle tracking:</strong> analysis, target design, generated code, tests and documentation, per phase.</li>
              <li><strong>Deliverables:</strong> view generated assets, download code modules, or read summaries on screen.</li>
              <li><strong>Announcements:</strong> read release notes from the team; questions go to admin@clean-core.io.</li>
            </ul>
          </div>
          <p className="m-0 border-t border-cc-line pt-3 cc-text-meta text-cc-ink-muted">
            Your projects are stored in your private workspace and are never shared with other accounts unless you
            invite a reader.
          </p>
        </div>
      </CcDialog>

      <CcDialog
        open={!!activePost}
        onClose={() => setActivePost(null)}
        title={activePost?.title ?? ''}
        lead={activePost ? `@${activePost.author}${activePost.authorEmail ? ` · ${activePost.authorEmail}` : ''}` : undefined}
        size="wide"
      >
        {activePost ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {activePost.pinned ? <CcTag>Pinned</CcTag> : null}
              {activePost.isAdmin ? <CcTag>Admin</CcTag> : null}
              <CcTag>{TOPIC_LABEL[activePost.category]}</CcTag>
            </div>
            <p className="m-0 whitespace-pre-line">{renderMessageWithLinks(activePost.message)}</p>
            {/* Roadmap 0.2 (UX-059): no like counter, no comment box — an
                announcement is something to read, and the address beside it is
                the one that reaches somebody. */}
          </div>
        ) : null}
      </CcDialog>

      {inviting ? (
        <InviteReaderDialog projectId={inviting.id} projectName={inviting.name} onClose={() => setInviting(null)} />
      ) : null}
    </div>
  );
}

function ProjectDeliverables({
  project,
  onView,
  onDownload,
}: {
  project: any;
  onView: (title: string, content: string, type: ViewType) => void;
  onDownload: (content: string, filename: string, type?: string) => Promise<void>;
}) {
  const isAbapCloud = (project.extensibilityRoute || '').includes('ABAP Cloud');

  // The test report is a count of verdicts and nothing else.
  //
  // With no stored report — which is every project, because nothing stores one
  // — this used to fabricate a whole document: "All test cases compiled and
  // executed successfully", "Database Persistency Sync: Verified via isolated
  // PostgreSQL Mocking", a runtime version, all printed for a suite that had
  // only been generated. Downloadable as "Quality Engineering Report".
  const tests = testEvidence(project);
  const testReport = tests.total === 0
    ? null
    : [
        '## Test status',
        '',
        `- **Test cases generated:** ${tests.total}`,
        `- **Passed:** ${tests.passed}`,
        `- **Failed:** ${tests.failed}`,
        `- **Simulated (mock context, not a test run):** ${tests.simulated}`,
        `- **No recorded result:** ${tests.withoutVerdict}`,
        '',
        tests.passed + tests.failed === 0
          ? 'No test run is on record for this project. The cases above are a draft: generated, not executed.'
          : 'Counts are the verdicts stored with the project. A verdict shown on the testing page during a run is not stored, and is not counted here.',
      ].join('\n');

  // UX-169: the documentation deliverable carries the stage's own name.
  const documentationLabel = PHASES.find((p) => p.key === 'documentation')?.label ?? 'Documentation';

  const deliverables = [
    { id: 'legacy', title: '1. Original ABAP Source', content: project.legacyCode, type: 'code', ext: '.abap', isExport: false },
    { id: 'analysis', title: '2. Business Analysis Report', content: formatAnalysisToMarkdown(project.analysis), type: 'markdown', ext: '.md', isExport: false },
    { id: 'design', title: '3. Solution Design Specification', content: formatDesignToMarkdown(project.solutionDesign), type: 'markdown', ext: '.md', isExport: false },
    {
      id: 'code',
      title: isAbapCloud ? '4. Transformed RAP ABAP Code' : '4. Transformed Node.js Code',
      content: project.generatedCode,
      type: 'code',
      ext: isAbapCloud ? '.clas.abap' : '.ts',
      isExport: false,
    },
    {
      id: 'tests',
      title: isAbapCloud ? '5. Generated ABAP Unit Test Suite' : '5. Generated Test Suite',
      content: project.testSuite?.code || (project.testCases ? JSON.stringify(project.testCases, null, 2) : null),
      type: project.testSuite?.code ? 'code' : 'json',
      ext: project.testSuite?.code ? (isAbapCloud ? '.clas.abap' : '.ts') : '.json',
      isExport: false,
    },
    { id: 'test_report', title: '6. Test Status', content: testReport, type: 'markdown', ext: '.md', isExport: false },
    { id: 'docs', title: `7. ${documentationLabel}`, content: formatDocumentationToMarkdown(project.documentation), type: 'markdown', ext: '.md', isExport: false },
    { id: 'presentation', title: '8. Executive Summary Deck', content: formatPresentationToMarkdown(project.presentation), type: 'markdown', ext: '.md', isExport: false },
  ].filter(d => d.content);

  // Dynamic exports from the database
  const dynamicExports = project.exports ? Object.entries(project.exports).map(([key, value]: [string, any]) => ({
    id: key,
    title: (value.title || key) as string,
    content: value.content as any,
    type: (value.type || 'markdown') as string,
    ext: (value.type === 'html' ? '.html' : value.type === 'json' ? '.json' : '.md') as string,
    isExport: true,
  })) : [];

  // A deliverable built for a source that is no longer the one under analysis
  // says so here too, not only on the phase strip — in the list, in the viewer
  // title and in the downloaded file's name (QA 5c6129878c65).
  const stale = staleness(project);
  const STALE_BY_ID: Record<string, boolean> = {
    analysis: stale.sourceChanged,
    design: stale.design,
    code: stale.code,
    tests: stale.tests,
    test_report: stale.tests,
    docs: stale.docs,
    // Keyed by deliverable id, read-only: nothing here writes the project's
    // `presentation` field (preservation register L-09 still holds).
    'presentation': stale.sourceChanged,
  };
  const allItems = [...deliverables, ...dynamicExports].map((item) => ({
    ...item,
    stale: item.isExport ? stale.sourceChanged : Boolean(STALE_BY_ID[item.id]),
  }));

  return (
    <div id={`project-deliverables-${project.id}`} className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
      {allItems.length === 0 ? (
        <p className="m-0 cc-text-cell text-cc-ink-muted">
          No deliverables generated yet. Choose &apos;Continue&apos; to start the process.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={`Deliverables of ${project.name}`}>
          {allItems.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 border-b border-cc-line py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-0 items-center gap-2 cc-text-cell text-cc-ink">
                <span className="shrink-0 text-cc-ink-muted">
                  {item.type === 'code' ? <FileCode2 size={16} aria-hidden={true} /> :
                   item.type === 'html' ? <BookOpen size={16} aria-hidden={true} /> :
                   <FileText size={16} aria-hidden={true} />}
                </span>
                {item.title}
                {item.isExport ? <CcTag>Export</CcTag> : null}
                {item.stale ? <CcProvenanceChip value="stale" note="source changed" /> : null}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <CcButton
                  variant="ghost"
                  icon={<Eye size={16} aria-hidden={true} />}
                  onClick={() => onView(item.stale ? `${item.title} (stale: built for a previous source)` : item.title, item.content, item.type === 'html' ? 'markdown' : (item.type as ViewType))}
                  aria-label={`View ${item.title}${item.stale ? ' (stale)' : ''}`}
                >
                  View
                </CcButton>
                <CcButton
                  variant="ghost"
                  icon={<Download size={16} aria-hidden={true} />}
                  onClick={() => void onDownload(item.content, `${project.name.replace(/\s+/g, '_')}_${item.id}${item.stale ? '_STALE' : ''}${item.ext}`, item.type === 'html' ? 'text/html' : item.type === 'code' ? 'text/javascript' : 'text/plain')}
                  aria-label={`Download ${item.title}${item.stale ? ' (stale)' : ''}`}
                >
                  {item.type === 'code' ? 'Code' : 'Download'}
                </CcButton>
                {item.type === 'html' ? (
                  <CcButton
                    variant="ghost"
                    icon={<BookOpen size={16} aria-hidden={true} />}
                    onClick={() => onView(item.stale ? `${item.title} (stale: built for a previous source)` : item.title, item.content, 'html')}
                    aria-label={`View the HTML of ${item.title}`}
                  >
                    View HTML
                  </CcButton>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
