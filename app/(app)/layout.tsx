'use client';

import { User, RotateCw, LogOut, ArrowLeft, Settings, Shield, Zap, Crown, Infinity, HelpCircle, X, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAuth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useState, useEffect } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import GlossarySidebar from '@/components/GlossarySidebar';
import GlossaryChatbot from '@/components/GlossaryChatbot';
import SapTrademarkNotice from '@/components/SapTrademarkNotice';

export default function AppLayout({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useUserProfile();
  const isProjectStep = pathname.includes('/project/');

  // Scroll to top on every page navigation
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Reactive Workspace Theme Bootstrapper
  useEffect(() => {
    const root = window.document.documentElement;
    if (profile) {
      const savedTheme = profile.theme || localStorage.getItem('theme') || 'light';
      if (savedTheme === 'dark') {
        root.classList.add('dark');
      } else if (savedTheme === 'light') {
        root.classList.remove('dark');
      } else {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', systemDark);
      }
    } else {
      // Fast fallback to local storage during initial load
      const localTheme = localStorage.getItem('theme') || 'light';
      if (localTheme === 'dark') {
        root.classList.add('dark');
      } else if (localTheme === 'light') {
        root.classList.remove('dark');
      } else {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', systemDark);
      }
    }
  }, [profile]);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

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
      return <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1"><Crown size={10} /> PILOT ADMIN</span>;
    }
    switch (tier) {
      case 'enterprise': return <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1"><Crown size={10} /> PILOT ADMIN</span>;
      case 'unlimited': return <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"><Infinity size={10} /> BYOK Pilot</span>;
      case 'premium': return <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"><Crown size={10} /> Pilot Pro</span>;
      case 'starter': return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"><Zap size={10} /> Pilot Standard</span>;
      default: return <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"><Shield size={10} /> Pilot Basic</span>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9ff]">
      {/* Pilot Warning Banner */}
      {showBanner && (
        <div className="bg-amber-50/95 backdrop-blur text-amber-900 py-2 sm:py-2.5 px-4 pr-4 sm:pr-40 text-center text-[10px] sm:text-xs font-semibold border-b border-amber-200 flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 transition-all shrink-0 relative animate-in slide-in-from-top duration-300">
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-950 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider select-none shrink-0">
            ⚡ Community Pilot
          </span>
          <span className="leading-relaxed">
            Free Community SAP Modernization Platform. Powered by Generative AI. Provided without warranty.
          </span>
          <div className="flex items-center gap-2 font-black shrink-0">
            <Link href="/settings#privacy" className="underline hover:text-green-750 transition-colors">Privacy Policy</Link>
            <span>•</span>
            <Link href="/settings#legal" className="underline hover:text-green-750 transition-colors">Legal Notice</Link>
            <span className="text-amber-300">|</span>
            <button 
              onClick={dismissBanner}
              className="inline-flex items-center gap-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all outline-none cursor-pointer border border-amber-300/40 hover:scale-105 active:scale-95 shadow-sm ml-1"
              title="Dismiss warning"
            >
              <X size={10} strokeWidth={3} className="shrink-0" /> Dismiss
            </button>
          </div>
        </div>
      )}
      
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 sm:gap-3 text-green-600 hover:opacity-80 transition-opacity shrink-0">
            <div className="bg-green-600/10 p-2 rounded-xl hidden sm:block">
              <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg sm:text-2xl tracking-tight text-gray-900 leading-none">Clean-Core<span className="text-green-600">.io</span></span>
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mt-1">Community Pilot</span>
            </div>
          </Link>

          {isProjectStep && (
            <div className="hidden lg:flex items-center justify-center flex-1">
              <Link 
                href="/dashboard" 
                className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-gray-100 px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200 hover:bg-green-50"
              >
                <ArrowLeft size={14} /> Back to My Workspace
              </Link>
            </div>
          )}

          <div className="flex items-center gap-4 sm:gap-6">
            {profile && (
              <div className="hidden md:flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{profile.firstName} {profile.lastName}</span>
                  {getTierBadge(profile.tier)}
                </div>
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-0.5">
                  {profile.transformationsLimit > 900 ? 'Unlimited' : profile.transformationsUsed + ' / ' + profile.transformationsLimit} Transformations
                </div>
              </div>
            )}

            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-chatbot'))}
              className="hidden sm:flex items-center gap-2 text-sm font-black text-green-700 hover:text-white bg-green-50 hover:bg-green-600 px-5 py-2.5 rounded-full border border-green-200 hover:border-green-600 hover:shadow-lg transition-all"
            >
              <HelpCircle size={14} /> Ask AI
            </button>

            <div className="relative">
              <button 
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gray-900 text-white flex items-center justify-center font-bold text-sm shadow-xl hover:scale-105 transition-all outline-none"
              >
                {profile ? profile.firstName[0] + profile.lastName[0] : <User className="w-5 h-5" />}
              </button>

              {showUserDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUserDropdown(false)}></div>
                  <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 z-20 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
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
                      className="flex items-center gap-3 w-full p-3 text-sm font-bold text-gray-700 hover:bg-gray-50 hover:text-green-600 rounded-xl transition-all text-left"
                    >
                      <HelpCircle size={18} /> Ask AI
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
          <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl border border-gray-100">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
              <LogOut className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-3xl font-black mb-3 text-gray-950 tracking-tight">Sign Out?</h2>
            
            <div className="bg-gray-50 p-6 rounded-3xl mb-8 border border-gray-100">
              {profile?.tier === 'pilot' ? (
                <div className="space-y-4">
                  <p className="text-lg text-gray-700 leading-relaxed font-medium">
                    You are currently using the <span className="text-gray-900 font-bold underline decoration-green-500 underline-offset-4 tracking-tight">Pilot Standard</span> plan.
                  </p>
                  <ul className="space-y-2 text-sm text-gray-600 font-medium italic">
                    <li className="flex items-center gap-2">• Up to 5 App transformations</li>
                    <li className="flex items-center gap-2">• Community Feedback access</li>
                    <li className="flex items-center gap-2">• Non-commercial use only</li>
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-32">
        {children}
      </main>
      <footer className="border-t border-gray-100 bg-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
          <SapTrademarkNotice className="max-w-3xl mx-auto" />
        </div>
      </footer>
      <GlossaryChatbot />
    </div>
  );
}
