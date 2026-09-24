'use client';

import { User, RotateCw, LogOut, ArrowLeft, Settings, Shield, Zap, Crown, Infinity, HelpCircle, X, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAuth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useState, useEffect, useRef } from 'react';
import ShellHelpMenu from '@/components/ShellHelpMenu';
import { useUserProfile } from '@/hooks/useUserProfile';
import GlossarySidebar from '@/components/GlossarySidebar';
import GlossaryChatbot from '@/components/GlossaryChatbot';
import SapTrademarkNotice from '@/components/SapTrademarkNotice';
import SiteFooter from '@/components/SiteFooter';
import { APP_VERSION } from '@/lib/version';
import UserOnboarding from '@/components/UserOnboarding';
import TermsReacceptGate from '@/components/TermsReacceptGate';
import { runsAreSelfFunded, runsRemaining } from '@/lib/run-quota-rule';

export default function AppLayout({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useUserProfile();
  const isProjectStep = pathname.includes('/project/');

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
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const logoutDialogRef = useRef<HTMLDivElement>(null);

  // Roadmap 3.0.4 — the account menu closes on Escape and gives the focus back
  // to the button that opened it; before, only a click on the backdrop closed
  // it, and a keyboard reader was left inside a menu with no way out.
  useEffect(() => {
    if (!showUserDropdown) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowUserDropdown(false);
      accountButtonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showUserDropdown]);

  // The sign-out confirmation is a modal (`DESIGN.md` §2.6): the focus moves
  // into it, Tab stays inside, Escape cancels, and the focus returns to the
  // account button — it used to open behind a blur with the focus still on the
  // page underneath.
  useEffect(() => {
    if (!showLogoutConfirm) return undefined;
    const box = logoutDialogRef.current;
    box?.querySelector<HTMLElement>('[data-logout-cancel]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowLogoutConfirm(false);
        return;
      }
      if (event.key !== 'Tab' || !box) return;
      const focusable = box.querySelectorAll<HTMLElement>('button:not([disabled]), [href]');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!box.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const opener = accountButtonRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [showLogoutConfirm]);

  // Initialize banner state from sessionStorage to avoid flashing dismissed banners
  useEffect(() => {
    const isBannerDismissed = sessionStorage.getItem('dismissPilotBanner') === 'true';
    if (isBannerDismissed) {
      setShowBanner(false);
    }
  }, []);

  const dismissBanner = () => {
    sessionStorage.setItem('dismissPilotBanner', 'true');
    setShowBanner(false);
  };

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

  const handleLogout = async () => {
    try {
      await signOut(getAuth());
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const getTierBadge = (tier: string = 'basic') => {
    if (profile?.isAdmin) {
      return <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1"><Crown size={10} /> Admin</span>;
    }
    switch (tier) {
      case 'enterprise': return <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1"><Crown size={10} /> Admin</span>;
      case 'unlimited': return <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"><Infinity size={10} /> Community BYOK</span>;
      case 'premium': return <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"><Crown size={10} /> Community Pro</span>;
      case 'starter': return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"><Zap size={10} /> Community Standard</span>;
      default: return <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"><Shield size={10} /> Community Basic</span>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9ff]">
      {/* The first Tab stop of every signed-in page (roadmap 3.0.4, WCAG
          2.4.1): past the banner and the shell bar, straight to the content.
          Invisible until it has the focus. */}
      <a
        href="#main-content"
        data-skip-link=""
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-gray-900 focus:shadow-xl focus:outline-2 focus:outline-offset-2 focus:outline-cc-focus"
      >
        Skip to content
      </a>

      {/* A signed-in visitor with no profile yet — a first Google sign-in — is
          asked here for a name and the two agreements, and the account is created
          and activated from that. The component existed but was never mounted,
          so that path silently provisioned an account with no consent recorded
          and no way to give one. It renders nothing once a profile exists. */}
      <UserOnboarding />

      {/* Warning Banner */}
      {showBanner && (
        <div className="cc-no-print bg-amber-50/95 backdrop-blur text-amber-900 py-2 sm:py-2.5 px-4 pr-4 sm:pr-40 text-center text-[10px] sm:text-xs font-semibold border-b border-amber-200 flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 transition-all shrink-0 relative animate-in slide-in-from-top duration-300">
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-950 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider select-none shrink-0">
            ⚡ Free Community Edition
          </span>
          <span className="leading-relaxed">
            Free Community SAP Modernization Platform. Powered by Generative AI. Provided without warranty.
          </span>
          {/* The public versions. These used to point into the settings page.
              This shell wraps /knowledge, /how-to and /first-run — pages that are
              reachable without an account and are in the sitemap — so those two
              links pointed a signed-out reader at a route behind the login. A
              privacy policy and an imprint have to be available without
              registration, immediately and permanently (§ 5 DDG, Art. 12/13
              GDPR); the footer of the same page already links them correctly. */}
          <div className="flex items-center gap-2 font-black shrink-0">
            <Link href="/datenschutz" className="underline hover:text-green-750 transition-colors">Privacy Policy</Link>
            <span>•</span>
            <Link href="/impressum" className="underline hover:text-green-750 transition-colors">Legal Notice</Link>
            <span className="text-amber-300">|</span>
            <button 
              onClick={dismissBanner}
              className="inline-flex items-center gap-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border border-amber-300/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus hover:scale-105 active:scale-95 shadow-sm ml-1"
              title="Dismiss warning"
            >
              <X size={10} strokeWidth={3} className="shrink-0" /> Dismiss
            </button>
          </div>
        </div>
      )}
      
      <header className="cc-no-print bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Home means the dashboard for someone signed in and the landing page
              for everyone else. The same shell serves both, and a hard link to
              /dashboard was a dead end for a visitor who arrived on /knowledge
              from a search result — and a signal that skewed the internal link
              graph for crawlers. */}
          <Link href={profile ? '/dashboard' : '/'} className="flex items-center gap-2 sm:gap-3 text-green-600 hover:opacity-80 transition-opacity shrink-0">
            <div className="bg-green-600/10 p-2 rounded-xl hidden sm:block">
              <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg sm:text-2xl tracking-tight text-gray-900 leading-none">Clean-Core<span className="text-green-600">.io</span></span>
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mt-1">Free Community Edition</span>
            </div>
          </Link>

          {/* The way out of a workflow step.
              It used to be `hidden lg:flex`, so on a phone there was no route
              back to the workspace from inside a project at all — the header
              collapsed to a logo and an avatar. The label shortens instead of
              disappearing. */}
          {isProjectStep && (
            <div className="flex items-center justify-center lg:flex-1 shrink-0">
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-gray-100 px-3 lg:px-5 py-2 lg:py-2.5 rounded-full border border-gray-200 hover:border-green-200 hover:bg-green-50 whitespace-nowrap"
              >
                <ArrowLeft size={14} className="shrink-0" />
                <span className="lg:hidden">Workspace</span>
                <span className="hidden lg:inline">Back to My Workspace</span>
              </Link>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-6">
            {/* The one place the quota is stated.
                It used to appear three times in three shapes — and with two
                different numbers: "1 / 5 TRANSFORMATIONS" here, "FREE BALANCE:
                4 / 5 FREE" on the dashboard, "FREE TRANSFORMATIONS: 4 / 5" on
                the transformation step. Used-of-total and remaining-of-total,
                side by side, both true and impossible to reconcile at a glance.
                One wording now, and it survives on a phone. */}
            {profile && (
              <div className="flex flex-col items-end">
                <div className="hidden md:flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{profile.firstName} {profile.lastName}</span>
                  {getTierBadge(profile.tier)}
                </div>
                <div className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest md:mt-0.5 whitespace-nowrap">
                  {runsAreSelfFunded(profile) || profile.transformationsLimit > 900
                    ? 'Unlimited'
                    : `${runsRemaining(profile)} of ${profile.transformationsLimit} left`}
                </div>
              </div>
            )}

            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-chatbot'))}
              data-assistant-trigger="header"
              className="hidden sm:flex items-center gap-2 text-sm font-black text-green-700 hover:text-white bg-green-50 hover:bg-green-600 px-5 py-2.5 rounded-full border border-green-200 hover:border-green-600 hover:shadow-lg transition-all"
            >
              <HelpCircle size={14} /> {assistantLabel}
            </button>

            {/* Help, where §2.1 puts it in the shell bar — "Keyboard shortcuts"
                lives here (§5.9 item 12, roadmap 3.0.4). */}
            <ShellHelpMenu assistantLabel={assistantLabel} />

            <div className="relative">
              <button
                ref={accountButtonRef}
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                aria-label="Account menu"
                aria-expanded={showUserDropdown}
                aria-controls={showUserDropdown ? 'account-menu-panel' : undefined}
                /* The one element that says whose profile the shell is holding.
                   It is here with or without a profile, so a test can open the
                   menu before one has loaded and can tell "nobody" from "the
                   wrong person" — see tests/profile-session-guard.spec.ts. */
                data-account-menu
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gray-900 text-white flex items-center justify-center font-bold text-sm shadow-xl hover:scale-105 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
              >
                {profile ? profile.firstName[0] + profile.lastName[0] : <User className="w-5 h-5" />}
              </button>

              {showUserDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUserDropdown(false)}></div>
                  <div id="account-menu-panel" className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 z-20 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-4 border-b border-gray-50 mb-1">
                      <p className="text-sm font-bold text-gray-900">{profile?.firstName} {profile?.lastName}</p>
                      <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                    </div>
                    
                    {profile?.isAdmin && (
                      <Link 
                        href="/admin" 
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-3 w-full p-3 text-sm font-bold text-gray-700 hover:bg-gray-50 hover:text-green-600 rounded-xl transition-all border-b border-gray-100 pb-3"
                      >
                        <Shield size={18} className="text-green-600" /> Admin Console
                      </Link>
                    )}
                    
                    <Link 
                      href="/settings" 
                      onClick={() => setShowUserDropdown(false)}
                      className="flex items-center gap-3 w-full p-3 text-sm font-bold text-gray-700 hover:bg-gray-50 hover:text-green-600 rounded-xl transition-all mt-1"
                    >
                      <Settings size={18} /> Settings & Profile
                    </Link>

                    <button 
                      onClick={() => { setShowUserDropdown(false); window.dispatchEvent(new CustomEvent('open-chatbot')); }}
                      data-assistant-trigger="menu"
                      className="flex items-center gap-3 w-full p-3 text-sm font-bold text-gray-700 hover:bg-gray-50 hover:text-green-600 rounded-xl transition-all text-left"
                    >
                      <HelpCircle size={18} /> {assistantLabel}
                    </button>

                    <button 
                      onClick={() => { setShowUserDropdown(false); setShowLogoutConfirm(true); }}
                      className="flex items-center gap-3 w-full p-3 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <LogOut size={18} /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div
            ref={logoutDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
            data-logout-dialog=""
            className="bg-white p-6 sm:p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100"
          >
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6" aria-hidden={true}>
              <LogOut className="w-8 h-8 text-red-600" />
            </div>
            <h2 id="logout-dialog-title" className="text-3xl font-black mb-3 text-gray-950 tracking-tight">Sign Out?</h2>
            
            <div className="bg-gray-50 p-6 rounded-3xl mb-8 border border-gray-100">
              {profile?.tier === 'pilot' ? (
                <div className="space-y-4">
                  <p className="text-lg text-gray-700 leading-relaxed font-medium">
                    You are currently using the <span className="text-gray-900 font-bold underline decoration-green-500 underline-offset-4 tracking-tight">Community Standard</span> plan.
                  </p>
                  <ul className="space-y-2 text-sm text-gray-600 font-medium italic">
                    <li className="flex items-center gap-2">• Up to 5 App transformations</li>
                    <li className="flex items-center gap-2">• Community Feedback access</li>
                    <li className="flex items-center gap-2">• Free to use — review outputs before production</li>
                  </ul>
                  <p className="text-sm text-gray-500 font-bold border-t border-gray-200 pt-4">
                    Are you sure you want to sign out?
                  </p>
                </div>
              ) : (
                <p className="text-lg text-gray-700 leading-relaxed font-medium">
                  Are you sure you want to sign out of your workspace? All running processes will continue.
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                data-logout-cancel=""
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-6 py-4 text-sm font-black text-gray-600 hover:bg-gray-100 rounded-2xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleLogout} 
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-2xl font-black text-sm transition-all shadow-xl shadow-red-200"
              >
                Sign Out Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asked once per Terms version, and it blocks: every protected route
          refuses while the accepted version is stale, so a dismissible notice
          would leave people in a product that answers 403 everywhere and reads
          as broken. See the component for the whole reasoning. */}
      <TermsReacceptGate />

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-32">
        {children}
      </main>
      {/* Inside a workflow step the marketing footer becomes one line.
          It used to render in full under every step. On a phone that is roughly
          700 px of link lists — longer than the step above it — and a full
          footer reads as "page ends here", which is the wrong signal in the
          middle of a seven-stage flow. The legally required links stay, and the
          complete footer keeps its place on every public page. */}
      {isProjectStep ? (
        <footer className="cc-no-print border-t border-gray-100 bg-white/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-bold text-gray-400">
            <Link href="/impressum" className="hover:text-green-600 transition-colors">Legal Notice</Link>
            <Link href="/datenschutz" className="hover:text-green-600 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-green-600 transition-colors">Terms</Link>
            <span className="text-gray-300">·</span>
            <span className="font-mono tracking-wider uppercase">Clean-Core.io {APP_VERSION}</span>
          </div>
        </footer>
      ) : (
        <footer className="cc-no-print border-t border-gray-100 bg-white/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <SiteFooter />
            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
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
