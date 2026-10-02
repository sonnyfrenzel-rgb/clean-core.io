'use client';

import { User, RotateCw, LogOut, Settings, Shield, HelpCircle, ChevronDown, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAuth } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useState, useEffect, useSyncExternalStore } from 'react';
import ShellHelpMenu, {
  SHELL_MENU_ITEMS,
  SHELL_MENU_PANEL,
  SHELL_MENU_SEPARATOR,
  SHELL_TRIGGER,
  useShellMenu,
} from '@/components/ShellHelpMenu';
import CcIconButton from '@/components/cc/IconButton';
import CcMessageBox from '@/components/cc/MessageBox';
import CcTag from '@/components/cc/Tag';
import { cn } from '@/lib/utils';
import { PHASES } from '@/lib/workflow-steps';
import { useUserProfile } from '@/hooks/useUserProfile';
import GlossaryChatbot from '@/components/GlossaryChatbot';
import SapTrademarkNotice from '@/components/SapTrademarkNotice';
import SiteFooter from '@/components/SiteFooter';
import { APP_VERSION } from '@/lib/version';
import UserOnboarding from '@/components/UserOnboarding';
import TermsReacceptGate from '@/components/TermsReacceptGate';
import { runsAreSelfFunded, runsRemaining } from '@/lib/run-quota-rule';
import { Lightbulb } from 'lucide-react';
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import { showTipsAgain } from '@/lib/show-tips-again';
import { forgetShellProject, openProjectSearch, useProjectSearchAvailable, useShellProjectName } from '@/lib/shell-context';
import { workspaceBackHref } from '@/lib/workspace-back-href';
import { wt } from '@/lib/workspace-messages';

const noSubscription = () => () => {};
const readSearch = () => window.location.search;
const serverSearch = () => '';

export default function AppLayout({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useUserProfile();
  // "New project" is the first step of a project (mockup 2.8 s11, s14) and
  // gets the same one-line footer as the stages after it.
  const isProjectStep = pathname.includes('/project/') || pathname.startsWith('/admin/new-project');
  // Pages of the signed-in product that are not a project: they carry the
  // one-line legal footer of a stage, not the marketing footer (mockup s1, s7).
  const isAppPage =
    isProjectStep ||
    pathname.startsWith('/admin/workspace') ||
    pathname.startsWith('/admin/new-project') ||
    pathname.startsWith('/invitation');
  // The object page uses the full frame (mockup s1: map and source column side
  // by side); every other page keeps the reading width.
  const isObjectPage = /^\/project\/[^/]+\/?$/.test(pathname ?? '');
  // The seven stages are tools of that object page (ADR-008) and stand in its
  // frame — all seven, in the product and in the demo alike (ADR-063, owner
  // 02.10.2026). Only Design and Documentation used to: they draw a canvas
  // (owner decision 01.10.2026, proposal B), and every other stage kept the
  // reading width, so switching from Analyze to Design moved the shell bar,
  // the way back, the title and the content sideways. The frame inside the
  // column is `StageFrame`; this picks the column's width.
  const isStagePage =
    /^\/project\/[^/]+\/(analyze|design|transformation|documentation|testing|tco|delivery)\/?$/.test(pathname ?? '') ||
    /^\/demo\/(analyze|design|transformation|documentation|testing|tco|delivery)\/?$/.test(pathname ?? '');
  const isWidePage = isObjectPage || isStagePage;

  // Scroll to top on every page navigation
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // The theme bootstrapper that used to stand here is gone with dark mode
  // (roadmap 1.6). It read the theme field off the profile, fell back to a
  // cached copy in local storage and then to the browser's own colour
  // preference, and put a class on `<html>` — for a set of overrides that only
  // ever covered part of the product. Nothing adds that class any more, so
  // nothing has to remove it, and the field on old accounts is simply not read;
  // see the note on it in `hooks/useUserProfile.ts`.
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // The account menu is a menu button in the WAI-ARIA sense (block D, D.6), on
  // the same keyboard as the Help menu beside it: `useShellMenu` in
  // `components/ShellHelpMenu.tsx`. Escape closes it and gives the focus back
  // to the button that opened it (roadmap 3.0.4); the arrow keys move between
  // the items; a press outside closes it — no invisible full-screen layer.
  const {
    open: accountMenuOpen,
    close: closeAccountMenu,
    rootRef: accountMenuRootRef,
    triggerRef: accountButtonRef,
    menuRef: accountMenuRef,
    triggerProps: accountTriggerProps,
    menuProps: accountMenuProps,
  } = useShellMenu('account-menu-panel');

  /**
   * What the assistant is called where the reader is standing.
   *
   * There is one assistant (ADR-043) and it has two boundaries, and
   * `components/GlossaryChatbot.tsx` picks between them from exactly this
   * value: a `/project/<id>` path gives it a project, and it then answers only
   * from that project's evidence, with anchors; anywhere else it answers
   * product and SAP questions out of `lib/chatbot-knowledge.ts`. A single
   * label cannot be true for both — „Ask this case" on the workspace overview
   * would name a case that does not exist — so the trigger says which of the
   * two will open. „Ask AI" is what it may not say (`DESIGN.md` §3.1).
   *
   * The test is `tests/assistant-label.spec.ts`: it clicks this button in both
   * places and reads the panel that opens.
   */
  const inProject = /^\/project\/[^/]+/.test(pathname ?? '');
  const assistantLabel = inProject ? 'Ask this case' : 'Ask the assistant';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // A project name announced for one account is not shown to the next one.
  useEffect(() => {
    let uid: string | null | undefined;
    return onAuthStateChanged(getAuth(), (user) => {
      const next = user?.uid ?? null;
      if (uid !== undefined && next !== uid) forgetShellProject();
      uid = next;
    });
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(getAuth());
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  /**
   * The plan, as a tag (§4.1): a label with no state behind it, so the
   * quietest form there is — no colour, no icon. It used to be five coloured
   * pills at 10 px, one red "Admin" among them, which read as a warning.
   */
  // There are no plans (owner 02.10.2026): the product is free for everyone,
  // and names like "Community Standard" or "Community Pro" suggested tiers that
  // do not exist. Only what changes behaviour is named — an administrator, or
  // runs on the reader's own model key; everyone else gets no tag.
  const planLabel = (tier: string = 'basic'): string | null => {
    if (profile?.isAdmin || tier === 'enterprise') return 'Admin';
    if (tier === 'unlimited') return 'Own model key';
    return null;
  };

  /**
   * Where the reader stands, for the path in the shell bar (§2.1: "Workspace ›
   * Projekt"). The workspace is the root; a stage names itself from `PHASES`
   * (`lib/workflow-steps.ts`), the list the stepper and the stage title read.
   *
   * The project's name is not fetched here — that would be one more read of a
   * document that carries the source code. The page under the shell has read
   * it already (`loadProjectAndHydrate`) and announced the name; the shell
   * shows it for the project in its own address only (`lib/shell-context.ts`,
   * block D D.29). Until it arrives the crumb is simply not there.
   */
  const projectInPath = /^\/project\/([^/?#]+)/.exec(pathname ?? '')?.[1] ?? null;
  const projectId = ((): string | null => {
    if (!projectInPath) return null;
    try {
      return decodeURIComponent(projectInPath);
    } catch {
      return projectInPath;
    }
  })();
  const projectName = useShellProjectName(projectId);
  const pathCurrent = ((): string | null => {
    const stage = /^\/project\/[^/]+\/([^/?#]+)/.exec(pathname ?? '')?.[1];
    if (stage) return PHASES.find((p) => p.key === stage)?.label ?? null;
    if (pathname?.startsWith('/settings')) return 'Settings & Profile';
    // The 3.0 list report is "My workspace" itself, and a new project is a step
    // of it — neither is the Admin Console, whatever folder they live in.
    if (pathname?.startsWith('/admin/workspace')) return null;
    if (pathname?.startsWith('/admin/new-project')) return 'New project';
    if (pathname?.startsWith('/admin')) return 'Admin Console';
    return null;
  })();
  // On a stage the project crumb leads back to the workspace — the object page,
  // in the view the stage was opened from, for an account behind the preview
  // switch; the dashboard for everyone else (the same rule as the stage's own
  // "Back to workspace", `lib/workspace-back-href.ts`). On the object page it is
  // where the reader stands.
  const search = useSyncExternalStore(noSubscription, readSearch, serverSearch);
  const projectHref = projectId
    ? workspaceBackHref({ projectId, shell: workspaceShellEnabled(profile), search })
    : null;
  // The search slot of §2.1: a button only while a project search is on the
  // page (the object page's ⌘K dialog), opening it by a named event.
  const projectSearch = useProjectSearchAvailable();
  const atWorkspace = pathname === '/dashboard' || pathname === '/admin/workspace';

  return (
    <div className="min-h-screen flex flex-col bg-cc-page">
      {/* The first Tab stop of every signed-in page (roadmap 3.0.4, WCAG
          2.4.1): past the shell bar, straight to the content.
          Invisible until it has the focus. */}
      <a
        href="#main-content"
        data-skip-link=""
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-cc-float focus:rounded-cc-row focus:outline-2 focus:outline-offset-2 focus:outline-cc-focus"
      >
        <span className="block rounded-cc-row border border-cc-line bg-cc-surface px-4 py-3 text-[13px] font-semibold text-cc-ink shadow-cc-dialog">
          Skip to content
        </span>
      </a>

      {/* A signed-in visitor with no profile yet — a first Google sign-in — is
          asked here for a name and the two agreements, and the account is created
          and activated from that. The component existed but was never mounted,
          so that path silently provisioned an account with no consent recorded
          and no way to give one. It renders nothing once a profile exists. */}
      <UserOnboarding />

      {/* The Shell Bar, DESIGN.md §2.1 and the mockups 2.8: 56 px, logo and
          product name on the left, the path beside them, the quota, the
          assistant, Help and the account menu on the right. White surface and a
          1 px rule — no blur, no shadow, no green hover (ADR-007). */}
      <header className="cc-no-print sticky top-0 z-cc-sticky border-b border-cc-line bg-cc-surface">
        <div className={cn('mx-auto flex h-14 items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8', isWidePage ? 'max-w-screen-2xl' : 'max-w-7xl')}>
          {/* Home means the dashboard for someone signed in and the landing page
              for everyone else. The same shell serves both, and a hard link to
              /dashboard was a dead end for a visitor who arrived on /knowledge
              from a search result — and a signal that skewed the internal link
              graph for crawlers. */}
          <Link href={profile ? '/dashboard' : '/'} className="flex shrink-0 items-center gap-2 text-cc-ink no-underline">
            <span aria-hidden={true} className="hidden h-8 w-8 items-center justify-center rounded-cc-row bg-cc-brand-surface text-cc-brand sm:flex">
              <RotateCw size={18} />
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-extrabold leading-tight tracking-[-0.02em] text-cc-ink">
                Clean-Core<span className="text-cc-brand-strong">.io</span>
              </span>
              <span className="text-[11px] font-medium leading-tight text-cc-ink-muted">Free Community Edition</span>
            </span>
          </Link>

          {/* The path (§2.1). It replaced "Back to My Workspace", a pill that sat
              a few pixels above the stage's own "Back to workspace" link (D.9)
              and said the same thing twice in two shapes. The way back from a
              stage is that link, which knows the view it came from; the path
              says where the reader is and leads to the workspace. On a phone the
              bar holds the logo, the quota and the account only — the stage's
              link is the way back there. */}
          {profile && (
            <nav aria-label="Path" data-shell-path="" className="hidden min-w-0 items-center gap-1 text-[13px] font-medium text-cc-ink-muted sm:flex">
              {atWorkspace ? (
                <span aria-current="page" className="font-semibold text-cc-ink">My workspace</span>
              ) : (
                <Link href="/dashboard" className="whitespace-nowrap text-cc-ink-muted no-underline hover:text-cc-ink hover:underline">
                  My workspace
                </Link>
              )}
              {projectName && (
                <>
                  <ChevronRight size={14} aria-hidden={true} className="shrink-0" />
                  {pathCurrent && projectHref ? (
                    <Link
                      href={projectHref}
                      data-shell-path-project=""
                      className="max-w-[16rem] truncate text-cc-ink-muted no-underline hover:text-cc-ink hover:underline"
                    >
                      {projectName}
                    </Link>
                  ) : (
                    <span aria-current="page" data-shell-path-project="" className="max-w-[20rem] truncate font-semibold text-cc-ink">
                      {projectName}
                    </span>
                  )}
                </>
              )}
              {pathCurrent && !atWorkspace && (
                <>
                  <ChevronRight size={14} aria-hidden={true} className="shrink-0" />
                  <span aria-current="page" className="truncate font-semibold text-cc-ink">{pathCurrent}</span>
                </>
              )}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* The one place the quota is stated.
                It used to appear three times in three shapes — and with two
                different numbers: "1 / 5 TRANSFORMATIONS" here, "FREE BALANCE:
                4 / 5 FREE" on the dashboard, "FREE TRANSFORMATIONS: 4 / 5" on
                the transformation step. Used-of-total and remaining-of-total,
                side by side, both true and impossible to reconcile at a glance.
                One wording now, and it survives on a phone. 12 px / 600, the
                meta step of the scale (ADR-047), in sentence case. */}
            {profile && (
              <div className="flex flex-col items-end leading-tight">
                <div className="hidden items-center gap-2 md:flex">
                  <span className="text-[13px] font-semibold text-cc-ink">{profile.firstName} {profile.lastName}</span>
                  {planLabel(profile.tier) ? <CcTag>{planLabel(profile.tier)}</CcTag> : null}
                </div>
                <div data-shell-quota="" className="whitespace-nowrap text-[12px] font-semibold text-cc-ink-muted">
                  {runsAreSelfFunded(profile) || profile.transformationsLimit > 900
                    ? 'Unlimited'
                    : `${runsRemaining(profile)} of ${profile.transformationsLimit} left`}
                </div>
              </div>
            )}

            {/* Search ⌘K (§2.1, roadmap 6.6) — here only while the page has a
                project search to open; the dialog, its index and its focus
                handling stay with the page (components/workspace/CommandSearch.tsx). */}
            {projectSearch && (
              <span className="cc-no-print inline-flex">
                <CcIconButton
                  label={wt('shell.searchProject')}
                  data-command-search-trigger=""
                  onClick={openProjectSearch}
                >
                  <Search size={16} aria-hidden={true} />
                </CcIconButton>
              </span>
            )}

            {/* Help, where §2.1 puts it in the shell bar: one button with the
                "?" and a word on it, whose menu leads with the assistant and
                then lists keyboard shortcuts (§5.9 item 12, roadmap 3.0.4) and
                "How it works". There used to be two "?" buttons side by side —
                the assistant and this menu (Sonny, 01.10.2026). */}
            <ShellHelpMenu assistantLabel={assistantLabel} inProject={inProject} />

            <div ref={accountMenuRootRef} className="relative">
              <button
                ref={accountButtonRef}
                {...accountTriggerProps}
                aria-label="Account menu"
                /* The one element that says whose profile the shell is holding.
                   It is here with or without a profile, so a test can open the
                   menu before one has loaded and can tell "nobody" from "the
                   wrong person" — see tests/profile-session-guard.spec.ts. Its
                   text is the initials and nothing else, for the same reason. */
                data-account-menu
                className={cn(SHELL_TRIGGER, 'pl-1 pr-2 text-[11px] text-cc-ink')}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-cc-row bg-cc-ink text-cc-on-dark">
                  {profile ? profile.firstName[0] + profile.lastName[0] : <User size={14} aria-hidden={true} />}
                </span>
                <ChevronDown size={14} aria-hidden={true} className="text-cc-ink-muted" />
              </button>

              {accountMenuOpen && (
                <div className={SHELL_MENU_PANEL}>
                  <div className="border-b border-cc-line px-3 pt-2 pb-2">
                    <p className="m-0 text-[13px] font-semibold text-cc-ink">{profile?.firstName} {profile?.lastName}</p>
                    <p className="m-0 truncate text-[12px] font-medium text-cc-ink-muted">{profile?.email}</p>
                  </div>
                  <div ref={accountMenuRef} {...accountMenuProps} aria-label="Account" className={cn(SHELL_MENU_ITEMS, 'pt-1')}>
                    {profile?.isAdmin && (
                      <>
                        <Link href="/admin" role="menuitem" tabIndex={-1} onClick={() => closeAccountMenu(false)}>
                          <Shield size={16} aria-hidden={true} /> Admin Console
                        </Link>
                        <div role="separator" className={SHELL_MENU_SEPARATOR} />
                      </>
                    )}

                    <Link href="/settings" role="menuitem" tabIndex={-1} onClick={() => closeAccountMenu(false)}>
                      <Settings size={16} aria-hidden={true} /> Settings & Profile
                    </Link>

                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => {
                        closeAccountMenu(false);
                        window.dispatchEvent(new CustomEvent('open-chatbot', { detail: { returnFocusTo: accountButtonRef.current } }));
                      }}
                      data-assistant-trigger="menu"
                    >
                      <HelpCircle size={16} aria-hidden={true} /> {assistantLabel}
                    </button>

                    {/* Roadmap 3.0.7, DESIGN.md §6.2: brings back the coach marks
                        and restarts the demo tour — both live in this browser
                        only. Behind the workspace switch, like the tips. */}
                    {workspaceShellEnabled(profile) && (
                      <button
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => { closeAccountMenu(true); showTipsAgain(); }}
                        data-show-tips-again=""
                      >
                        <Lightbulb size={16} aria-hidden={true} /> Show tips again
                      </button>
                    )}

                    <div role="separator" className={SHELL_MENU_SEPARATOR} />
                    {/* The focus goes back to the account button before the box
                        opens, so the box hands it back there when it closes. */}
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      data-menu-tone="danger"
                      onClick={() => { closeAccountMenu(true); setShowLogoutConfirm(true); }}
                    >
                      <LogOut size={16} aria-hidden={true} /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Sign-out is a confirmation, so it is the Message Box (§2.6): the page
          behind is inert, the focus is held inside and comes back to the
          account button, Escape and the first focus lead away from signing
          out, and "Sign out now" is the binding `dark` button. */}
      <CcMessageBox
        open={showLogoutConfirm}
        title="Sign out?"
        confirmLabel="Sign out now"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      >
        <p className="m-0">Your projects and results are saved with your account. Sign out of your workspace?</p>
      </CcMessageBox>

      {/* Asked once per Terms version, and it blocks: every protected route
          refuses while the accepted version is stale, so a dismissible notice
          would leave people in a product that answers 403 everywhere and reads
          as broken. See the component for the whole reasoning. */}
      <TermsReacceptGate />

      <main id="main-content" tabIndex={-1} className={cn(
          'flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-32',
          isWidePage ? 'max-w-screen-2xl' : 'max-w-7xl',
        )}
      >
        {children}
      </main>
      {/* The legal links of every page in this shell live here, in one of
          the two branches below — never behind the login. This shell also wraps
          /knowledge, /how-to, /first-run and /demo, pages reachable without an
          account and in the sitemap, and a privacy policy and an imprint have to
          be available without registration, immediately and permanently (§ 5
          DDG, Art. 12/13 GDPR). The dismissible banner that used to repeat them
          above the shell bar is gone (roadmap 3.0.6, decision 24.09.2026);
          tests/landing-consistency-guard.spec.ts holds both branches to it.

          Inside a workflow step the marketing footer becomes one line.
          It used to render in full under every step. On a phone that is roughly
          700 px of link lists — longer than the step above it — and a full
          footer reads as "page ends here", which is the wrong signal in the
          middle of a seven-stage flow. The legally required links stay, and the
          complete footer keeps its place on every other page. */}
      {isAppPage ? (
        <footer className="cc-no-print border-t border-cc-line bg-cc-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] font-medium text-cc-ink-muted">
            <Link href="/impressum" className="text-cc-ink-muted hover:text-cc-ink hover:underline">Legal Notice</Link>
            <Link href="/datenschutz" className="text-cc-ink-muted hover:text-cc-ink hover:underline">Privacy Policy</Link>
            <Link href="/terms" className="text-cc-ink-muted hover:text-cc-ink hover:underline">Terms</Link>
            <span aria-hidden={true}>·</span>
            <span className="font-cc-mono">Clean-Core.io {APP_VERSION}</span>
          </div>
        </footer>
      ) : (
        <footer className="cc-no-print border-t border-cc-line bg-cc-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <SiteFooter />
            <div className="mt-8 pt-6 border-t border-cc-line text-center">
              <SapTrademarkNotice className="max-w-3xl mx-auto" />
            </div>
          </div>
        </footer>
      )}
      <div className="cc-no-print">
        <GlossaryChatbot />
      </div>
    </div>
  );
}
