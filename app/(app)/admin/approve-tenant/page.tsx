'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, getDb } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, ArrowRight, Loader2, User, Mail, FileText, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function TenantApprovalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  
  const uid = searchParams.get('uid');
  const actionParam = searchParams.get('action'); // 'approve' or 'reject'
  const autoParam = searchParams.get('auto') === 'true';
  const tokenParam = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'unauthorized' | 'ready' | 'processing' | 'approved' | 'rejected' | 'error'>('loading');
  const [applicant, setApplicant] = useState<{ name: string; email: string; motivation: string; status: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const db = getDb();

  // Load applicant details and check auth status
  useEffect(() => {
    if (profileLoading) return;

    if (!profile) {
      setStatus('unauthorized');
      return;
    }

    if (!profile.isAdmin) {
      setStatus('unauthorized');
      return;
    }

    if (!uid) {
      setStatus('error');
      setErrorMessage('Missing user UID in request.');
      return;
    }

    const fetchApplicant = async () => {
      try {
        // Fetch from tenant access requests
        const regRef = doc(db, 'tenant_access_requests', uid);
        const regSnap = await getDoc(regRef);

        if (regSnap.exists()) {
          const data = regSnap.data();
          setApplicant({
            name: data.name || 'Unknown User',
            email: data.email || '',
            motivation: data.motivation || '',
            status: data.status || 'pending',
          });
          
          if (data.status === 'approved') {
            setStatus('approved');
            return;
          }
        } else {
          // Fallback: check users collection
          const userRef = doc(db, 'users', uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            setApplicant({
              name: `${userData.firstName} ${userData.lastName}`,
              email: userData.email || '',
              motivation: 'Direct user profile record found.',
              status: userData.s4TenantAccessAllowed ? 'approved' : 'pending',
            });
            
            if (userData.s4TenantAccessAllowed) {
              setStatus('approved');
              return;
            }
          } else {
            setStatus('error');
            setErrorMessage('No tenant access request or user profile found for this UID.');
            return;
          }
        }

        setStatus('ready');
      } catch (err: any) {
        console.error('Error fetching applicant:', err);
        setStatus('error');
        setErrorMessage(err.message || 'Error connecting to database.');
      }
    };

    fetchApplicant();
  }, [profile, profileLoading, uid, db]);

  // Handle Automatic Actions
  useEffect(() => {
    if (status !== 'ready') return;

    if (actionParam === 'reject') {
      handleReject();
    } else if (autoParam) {
      const timer = setTimeout(() => {
        handleApprove();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [status, actionParam, autoParam]);

  const handleApprove = async () => {
    if (!uid || !applicant) return;
    setStatus('processing');
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No admin authenticated.");
      const adminToken = await currentUser.getIdToken();

      const res = await fetch('/api/admin/approve-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          uid,
          token: tokenParam,
          action: 'approve'
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to approve tenant access.');
      }

      setStatus('approved');
    } catch (err: any) {
      console.error('Error approving tenant access:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Failed to update tenant access status.');
    }
  };

  const handleReject = async () => {
    if (!uid) return;
    setStatus('processing');
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No admin authenticated.");
      const adminToken = await currentUser.getIdToken();

      const res = await fetch('/api/admin/approve-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          uid,
          token: tokenParam,
          action: 'reject'
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to decline tenant request.');
      }

      setStatus('rejected');
    } catch (err: any) {
      console.error('Error rejecting tenant access:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Failed to decline tenant request.');
    }
  };

  if (profileLoading || status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-400 font-medium">Validating credentials and fetching request...</p>
      </div>
    );
  }

  if (status === 'unauthorized') {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl mx-auto my-12"
      >
        <div className="w-16 h-16 bg-red-955/50 border border-red-550/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-white mb-3 uppercase tracking-tight">Access Denied</h2>
        <p className="text-slate-400 text-sm font-medium mb-8 leading-relaxed">
          You must be logged in as a platform administrator to access this panel and approve S/4HANA live connections.
        </p>
        <button 
          onClick={() => {
            const auth = getAuth();
            auth.signOut().then(() => {
              router.push('/');
            });
          }}
          className="w-full bg-red-600 hover:bg-red-750 text-white py-3.5 rounded-xl font-bold uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-red-650/10"
        >
          Sign In as Admin
        </button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-xl w-full mx-auto my-8 p-4">
      <AnimatePresence mode="wait">
        
        {/* Ready State - Pending Approval */}
        {status === 'ready' && applicant && (
          <motion.div 
            key="ready"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="bg-gradient-to-r from-blue-900/40 to-sky-900/40 p-6 md:p-8 border-b border-slate-800 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-550/20 rounded-xl flex items-center justify-center text-blue-400 border border-blue-550/30">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Clean-Core.io Admin</span>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">S/4HANA Connection Approval</h2>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              {/* Applicant Card */}
              <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 space-y-4">
                <div className="flex items-start gap-3.5">
                  <User className="w-5 h-5 text-slate-500 mt-0.5" />
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Name</label>
                    <span className="text-white font-bold text-base">{applicant.name}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <Mail className="w-5 h-5 text-slate-500 mt-0.5" />
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Email</label>
                    <span className="text-blue-400 font-semibold">{applicant.email}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 pt-3 border-t border-slate-850/60">
                  <FileText className="w-5 h-5 text-slate-500 mt-0.5" />
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Motivation / Use Case</label>
                    <p className="text-slate-300 text-sm leading-relaxed font-medium italic">
                      "{applicant.motivation || 'No details provided.'}"
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-850 p-4 rounded-2xl text-xs text-slate-400 space-y-1.5 font-medium">
                <p className="font-bold text-white uppercase tracking-wide">⚠️ Provisioning Scope:</p>
                <p>• Unlocks <strong className="text-blue-400">Connected S/4HANA Tenant</strong> tab</p>
                <p>• Activates dynamic destination endpoint mapping environment variables</p>
                <p>• Enables Basic Auth or Client Credentials storage</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={handleApprove}
                  className="flex-[2] bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white py-4 rounded-xl font-black text-sm uppercase tracking-wider transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                >
                  Approve Request <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleReject}
                  className="flex-1 bg-red-950/30 hover:bg-red-900/20 text-red-400 border border-red-900/50 py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all active:scale-95"
                >
                  Decline Request
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Processing State */}
        {status === 'processing' && (
          <motion.div 
            key="processing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center shadow-2xl"
          >
            <Loader2 className="w-16 h-16 text-blue-400 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Activating Capabilities</h2>
            <p className="text-slate-400 font-medium text-sm leading-relaxed">
              Updating user privileges and integration configurations in Firestore database. Please wait...
            </p>
          </motion.div>
        )}

        {/* Approved Success State */}
        {status === 'approved' && (
          <motion.div 
            key="approved"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 text-center shadow-2xl"
          >
            <div className="w-20 h-20 bg-blue-550/20 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-400 border-2 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
              <CheckCircle2 className="w-12 h-12 animate-pulse" />
            </div>
            <h2 className="text-3xl font-black text-white mb-3 uppercase tracking-tight">Tenant Access Approved!</h2>
            <p className="text-slate-300 font-medium text-sm max-w-sm mx-auto mb-8 leading-relaxed">
              The user profile has been successfully updated. The live S/4HANA Connection features are now active.
            </p>
            
            {applicant && (
              <div className="bg-slate-950 border border-slate-850 p-4 rounded-2xl max-w-md mx-auto text-left mb-8">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Activated Profile:</p>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white font-bold">{applicant.name}</span>
                  <span className="text-slate-400 font-semibold">{applicant.email}</span>
                </div>
              </div>
            )}

            <button 
              onClick={() => router.push('/dashboard')}
              className="px-8 py-3.5 bg-slate-800 hover:bg-slate-750 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-all active:scale-95 border border-slate-700"
            >
              Go to Dashboard
            </button>
          </motion.div>
        )}

        {/* Rejected State */}
        {status === 'rejected' && (
          <motion.div 
            key="rejected"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 text-center shadow-2xl"
          >
            <div className="w-20 h-20 bg-red-950/20 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 border-2 border-red-550">
              <XCircle className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-black text-white mb-3 uppercase tracking-tight">Request Declined</h2>
            <p className="text-slate-300 font-medium text-sm max-w-sm mx-auto mb-8 leading-relaxed">
              The tenant access request has been successfully declined and the user profile has been cleaned up.
            </p>
            <button 
              onClick={() => router.push('/dashboard')}
              className="px-8 py-3.5 bg-slate-800 hover:bg-slate-750 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-all active:scale-95 border border-slate-700"
            >
              Go to Dashboard
            </button>
          </motion.div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <motion.div 
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 text-center shadow-2xl"
          >
            <div className="w-16 h-16 bg-red-950/50 border border-red-550/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Operation Failed</h2>
            <p className="text-red-400 font-bold text-sm mb-4">{errorMessage}</p>
            <button 
              onClick={() => router.push('/dashboard')}
              className="px-8 py-3.5 bg-slate-800 hover:bg-slate-750 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-all active:scale-95 border border-slate-700"
            >
              Go to Dashboard
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

export default function TenantApprovalPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <p className="text-gray-400 font-medium">Loading Approval Panel...</p>
        </div>
      }>
        <TenantApprovalContent />
      </Suspense>
    </div>
  );
}
