'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ShieldCheck, ShieldAlert, CheckCircle2, Trash2, User, Mail, FileText, Clock, Search, Shield, UserX, UserCheck, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { APP_VERSION } from '@/lib/version';

export default function AdminConsole() {
  const { profile, loading: profileLoading } = useUserProfile();
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved'>('all');
  
  const [actionUid, setActionUid] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approving' | 'revoking' | 'deleting' | null>(null);

  const db = getDb();

  // Fetch all registration requests in real-time
  useEffect(() => {
    if (profileLoading || !profile?.isAdmin) return;

    setLoadingRequests(true);
    const q = query(collection(db, 'registration_requests'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const fetched = await Promise.all(snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          const uid = docSnap.id;
          
          let s4TenantAccessAllowed = false;
          let s4TenantAccessRequested = false;
          try {
            const userSnap = await getDoc(doc(db, 'users', uid));
            if (userSnap.exists()) {
              const userData = userSnap.data();
              s4TenantAccessAllowed = userData.s4TenantAccessAllowed || false;
              s4TenantAccessRequested = userData.s4TenantAccessRequested || false;
            }
          } catch (userErr) {
            console.error(`Error reading user profile for S/4 flags:`, userErr);
          }

          let dateObj = new Date();
          if (data.createdAt) {
            dateObj = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          }
          return {
            uid,
            ...data,
            s4TenantAccessAllowed,
            s4TenantAccessRequested,
            createdAt: dateObj
          };
        }));
        setRequests(fetched);
      } catch (err) {
        console.error('Error fetching user profiles during snapshot processing:', err);
      } finally {
        setLoadingRequests(false);
      }
    }, (err) => {
      console.error('Error listing registration requests:', err);
      setLoadingRequests(false);
    });

    return () => unsubscribe();
  }, [profile, profileLoading, db]);

  const handleApprove = async (uid: string) => {
    setActionUid(uid);
    setActionType('approving');
    const targetReq = requests.find(r => r.uid === uid);
    try {
      // 1. Update user profile to approved, set tier to pilot and limit to 5
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        status: 'approved',
        tier: 'pilot',
        transformationsLimit: 5,
        transformationsUsed: 0
      }, { merge: true });

      // 2. Update registration request
      const regRef = doc(db, 'registration_requests', uid);
      await setDoc(regRef, {
        status: 'approved',
      }, { merge: true });

      // 3. Dispatch premium Welcome Email to the user in the background
      if (targetReq) {
        try {
          const token = await getAuth().currentUser?.getIdToken();
          await fetch('/api/send-approval-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              email: targetReq.email,
              name: targetReq.name,
            }),
          });
        } catch (emailErr) {
          console.error('Failed to trigger Welcome Email API:', emailErr);
        }
      }
    } catch (err) {
      console.error('Error approving user:', err);
      alert('Failed to approve user.');
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  };

  const handleRevoke = async (uid: string) => {
    setActionUid(uid);
    setActionType('revoking');
    try {
      // 1. Update user profile back to pending and limit to 0
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        status: 'pending',
        transformationsLimit: 0
      }, { merge: true });

      // 2. Update registration request status back to pending
      const regRef = doc(db, 'registration_requests', uid);
      await setDoc(regRef, {
        status: 'pending',
      }, { merge: true });
    } catch (err) {
      console.error('Error revoking user:', err);
      alert('Failed to revoke access.');
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  };

  const handleDelete = async (uid: string) => {
    if (!confirm('Are you sure you want to permanently delete this application and user profile?')) return;
    
    setActionUid(uid);
    setActionType('deleting');
    try {
      // 1. Delete registration request
      await deleteDoc(doc(db, 'registration_requests', uid));

      // 2. Delete user document
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Failed to delete user.');
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  };

  const handleToggleS4Access = async (uid: string, currentAllowed: boolean) => {
    setActionUid(uid);
    setActionType(currentAllowed ? 'revoking' : 'approving');
    const targetReq = requests.find(r => r.uid === uid);
    try {
      // 1. Update user profile s4 flags
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        s4TenantAccessAllowed: !currentAllowed,
        s4TenantAccessRequested: false
      }, { merge: true });

      // 2. Update tenant_access_requests status if exists
      const regRef = doc(db, 'tenant_access_requests', uid);
      const regSnap = await getDoc(regRef);
      if (regSnap.exists()) {
        await setDoc(regRef, {
          status: !currentAllowed ? 'approved' : 'pending'
        }, { merge: true });
      }

      // 3. Dispatch premium welcome / deactivation email
      if (targetReq) {
        try {
          const token = await getAuth().currentUser?.getIdToken();
          await fetch(currentAllowed ? '/api/send-tenant-revoke-email' : '/api/send-tenant-approval-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              email: targetReq.email,
              name: targetReq.name
            })
          });
        } catch (emailErr) {
          console.error("Failed to send tenant access update email:", emailErr);
        }
      }

      // Update local state for immediate feedback
      setRequests(prev => prev.map(r => r.uid === uid ? { ...r, s4TenantAccessAllowed: !currentAllowed, s4TenantAccessRequested: false } : r));

    } catch (err) {
      console.error('Error toggling S/4 access:', err);
      alert('Failed to update tenant access privileges.');
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  };

  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Validating Administrator session...</p>
      </div>
    );
  }

  if (!profile || !profile.isAdmin) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white border border-red-100 rounded-3xl p-8 text-center shadow-xl">
        <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-650 shadow-inner">
          <ShieldAlert className="w-8 h-8 animate-bounce" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-3 uppercase tracking-tight">Access Denied</h2>
        <p className="text-gray-500 text-sm font-medium mb-6 leading-relaxed">
          This panel is restricted exclusively to Clean-Core.io system administrators.
        </p>
      </div>
    );
  }

  // Filter requests based on search term and active tab
  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      (req.name && req.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (req.email && req.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (req.motivation && req.motivation.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesTab = 
      activeTab === 'all' || 
      (activeTab === 'pending' && req.status === 'pending') || 
      (activeTab === 'approved' && req.status === 'approved');

    return matchesSearch && matchesTab;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300 w-full max-w-7xl mx-auto">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center gap-4 z-10">
          <div className="w-14 h-14 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-400 border border-green-500/20 shadow-inner">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-green-400 uppercase tracking-widest bg-green-950/60 border border-green-900/40 px-2 py-0.5 rounded-full">Secure Console</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded-full">{APP_VERSION}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight mt-1">Admin Control Room</h1>
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl text-xs text-slate-400 space-y-1 z-10 shrink-0">
          <p className="font-bold text-white uppercase tracking-wide">⚡ Total Applications: {requests.length}</p>
          <p>• Pending: <strong className="text-amber-400">{requests.filter(r => r.status === 'pending').length}</strong></p>
          <p>• Approved: <strong className="text-green-400">{requests.filter(r => r.status === 'approved').length}</strong></p>
        </div>
      </div>

      {/* QE Quality Gate Report Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center gap-4 z-10">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-inner">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-950/60 border border-emerald-900/40 px-2 py-0.5 rounded-full">Quality Gate Passed</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mt-1">Quality Engineering Audit</h2>
            <p className="text-xs text-slate-400 mt-1">Playwright Headless Audit report compiled dynamically upon release deployment.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 z-10 shrink-0 w-full md:w-auto">
          <a
            href="/QE_Engineer_Report.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95 text-center no-underline"
          >
            <FileText className="w-4 h-4" /> Open QE Report (PDF)
          </a>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-gray-250 shadow-sm w-full">
        
        {/* Search */}
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search applications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 outline-none text-sm font-medium focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all text-gray-900 bg-white"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl w-full md:w-auto">
          {(['all', 'pending', 'approved'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${activeTab === tab ? 'bg-white text-gray-950 shadow' : 'text-gray-500 hover:text-gray-900'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Applications Catalog List */}
      <div className="space-y-4 w-full">
        {loadingRequests ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-gray-200">
            <div className="w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-gray-400 text-sm font-semibold">Loading applications database...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center p-16 bg-white rounded-3xl border border-gray-200 shadow-sm">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-gray-450 border border-gray-200">
              <User className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-gray-900 uppercase mb-1">No Applications Found</h3>
            <p className="text-gray-400 text-sm font-medium max-w-xs mx-auto leading-relaxed">
              No registration requests match your current filters or query.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 w-full">
            <AnimatePresence mode="popLayout">
              {filteredRequests.map((req) => (
                <motion.div
                  key={req.uid}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 w-full"
                >
                  <div className="space-y-3.5 flex-1 w-full">
                    {/* Header info */}
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-gray-900 text-base">{req.name || 'Anonymous User'}</h3>
                      {req.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-green-200">
                          <CheckCircle2 size={10} /> Active Plan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-amber-200">
                          <Clock size={10} /> Pending Review
                        </span>
                      )}
                      {req.s4TenantAccessAllowed && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-blue-200">
                          <Globe size={10} /> S/4 Live Bridge Unlocked
                        </span>
                      )}
                      {!req.s4TenantAccessAllowed && req.s4TenantAccessRequested && (
                        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-indigo-200 animate-pulse">
                          <Globe size={10} /> BYOT Requested
                        </span>
                      )}
                    </div>

                    {/* Meta information */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-500 font-medium">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-gray-900 select-all font-semibold">{req.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>Submitted on {format(req.createdAt, 'PPpp')}</span>
                      </div>
                    </div>

                    {/* Motivation card */}
                    {req.motivation && (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs flex gap-2 w-full max-w-xl">
                        <FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                        <div>
                           <label className="block text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Motivation</label>
                          <p className="text-gray-700 font-medium italic leading-relaxed">"{req.motivation}"</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions column */}
                  <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto border-t border-gray-100 sm:border-t-0 pt-4 sm:pt-0 justify-end">
                    {req.uid === actionUid ? (
                      <div className="flex items-center justify-center py-2.5 px-6 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 w-full sm:w-36">
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                        Updating...
                      </div>
                    ) : (
                      <>
                        {req.status === 'pending' ? (
                          <button
                            onClick={() => handleApprove(req.uid)}
                            className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95 whitespace-nowrap"
                          >
                            <UserCheck className="w-4 h-4" /> Approve
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRevoke(req.uid)}
                            className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer active:scale-95 border border-slate-700 whitespace-nowrap"
                          >
                            <UserX className="w-4 h-4" /> Revoke
                          </button>
                        )}

                        {req.status === 'approved' && (
                          <button
                            onClick={() => handleToggleS4Access(req.uid, req.s4TenantAccessAllowed)}
                            className={clsx(
                              "w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer active:scale-95 whitespace-nowrap border",
                              req.s4TenantAccessAllowed 
                                ? "bg-blue-50 hover:bg-blue-100 text-blue-650 border-blue-200 shadow-sm" 
                                : "bg-white hover:bg-gray-50 text-gray-700 border-gray-250 shadow-sm"
                            )}
                          >
                            <Globe className="w-4 h-4" />
                            {req.s4TenantAccessAllowed ? 'Revoke BYOT' : 'Grant BYOT'}
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(req.uid)}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-650 border border-red-200 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                          title="Permanently delete application record"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

    </div>
  );
}
