'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth, getDb } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ArrowRight, User, Mail, FileText, Globe } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';

function TenantApprovalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  
  const uid = searchParams.get('uid');
  const actionParam = searchParams.get('action'); // 'approve' or 'reject'
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

  // No automatic action (UX-152, Sonny 24.09.2026). Until then `?action=reject`
  // declined the moment the page loaded and `?auto=true` approved after a
  // second, so an administrator who opened the mail to read the request had
  // already decided it. The page now shows the request and waits for a click.

  if (profileLoading || status === 'loading') {
    return (
      <Panel>
        <CcSkeleton shape="text" label="tenant access request" />
      </Panel>
    );
  }

  if (status === 'unauthorized') {
    return (
      <Panel>
        <h1 className="m-0 cc-text-title text-cc-ink">Access denied</h1>
        <CcMessageStrip state="error">
          You must be logged in as a platform administrator to access this panel and approve S/4HANA live connections.
        </CcMessageStrip>
        {/*
          UX-107: this button used to say "Sign In as Admin" and sign the reader
          out — a label that promised the opposite of what the click did, on the
          one page an operator lands on when they are in the wrong account. It
          now says what it does, and does the second half as well: the landing
          page opens its sign-in dialog for `?auth=signin` (LandingModals), the
          same way "Sign out and sign in again" in the MFA settings already works.
        */}
        <div>
          <CcButton
            variant="primary"
            density="cozy"
            data-testid="approve-tenant-switch-account"
            onClick={() => {
              const auth = getAuth();
              auth.signOut().then(() => {
                router.push('/?auth=signin');
              });
            }}
          >
            Sign out and sign in as administrator
          </CcButton>
        </div>
      </Panel>
    );
  }

  const backToDashboard = (
    <div>
      <CcButton variant="ghost" density="cozy" onClick={() => router.push('/dashboard')}>
        Go to Dashboard
      </CcButton>
    </div>
  );

  return (
    <>
      {/* Ready State - Pending Approval */}
      {status === 'ready' && applicant && (
        <Panel>
          <div className="flex items-center gap-3">
            <Globe size={20} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
            <div className="min-w-0">
              <p className="m-0 cc-text-label text-cc-ink-muted">Clean-Core.io Admin</p>
              <h1 className="m-0 cc-text-title text-cc-ink">S/4HANA Connection Approval</h1>
            </div>
          </div>

          {/* Applicant */}
          <dl className="m-0 flex flex-col gap-3 rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
            <div className="flex items-start gap-3">
              <User size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
              <div className="min-w-0">
                <dt className="cc-text-label text-cc-ink-muted">Name</dt>
                <dd className="m-0 cc-text-identifier text-cc-ink">{applicant.name}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
              <div className="min-w-0">
                <dt className="cc-text-label text-cc-ink-muted">Email</dt>
                <dd className="m-0 break-all cc-text-cell text-cc-ink">{applicant.email}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3 border-t border-cc-line pt-3">
              <FileText size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
              <div className="min-w-0">
                <dt className="cc-text-label text-cc-ink-muted">Motivation / Use Case</dt>
                <dd className="m-0 cc-text-body text-cc-ink">
                  &ldquo;{applicant.motivation || 'No details provided.'}&rdquo;
                </dd>
              </div>
            </div>
          </dl>

          <CcMessageStrip state="information" headline="Provisioning scope:">
            <ul className="m-0 mt-1 list-disc pl-4">
              <li>Unlocks the <span className="font-semibold">Check tenant connection</span> tab</li>
              <li>Activates dynamic destination endpoint mapping environment variables</li>
              <li>Enables Basic Auth or Client Credentials storage</li>
            </ul>
          </CcMessageStrip>

          {/* One button: the link's token is bound to one action, so the other
              button could only ever be refused. The other decision is the
              other link of the same mail — and whichever is used first
              closes both (UX-152). */}
          <div className="flex flex-col gap-2">
            <div>
              {actionParam === 'reject' ? (
                <CcButton variant="ghost" tone="danger" density="cozy" onClick={handleReject} data-tenant-decision="reject">
                  Decline Request
                </CcButton>
              ) : (
                <CcButton variant="primary" density="cozy" onClick={handleApprove} data-tenant-decision="approve">
                  Approve Request <ArrowRight size={16} aria-hidden={true} />
                </CcButton>
              )}
            </div>
            <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">
              {actionParam === 'reject'
                ? 'To approve instead, open the Approve link in the same mail.'
                : 'To decline instead, open the Decline link in the same mail.'}{' '}
              Each link works once, and using either closes both.
            </p>
          </div>
        </Panel>
      )}

      {/* Processing State */}
      {status === 'processing' && (
        <Panel>
          <h1 className="m-0 cc-text-title text-cc-ink">Activating Capabilities</h1>
          <p className="m-0 cc-text-body text-cc-ink-muted">
            Updating user privileges and integration configurations in Firestore database. Please wait...
          </p>
          <CcSkeleton shape="text" count={2} label="tenant access update" />
        </Panel>
      )}

      {/* Approved State */}
      {status === 'approved' && (
        <Panel>
          <h1 className="m-0 cc-text-title text-cc-ink">Tenant Access Approved</h1>
          <CcMessageStrip state="information" headline="Approved.">
            The user profile has been successfully updated. The live S/4HANA Connection features are now active.
          </CcMessageStrip>
          {applicant && (
            <dl className="m-0 rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
              <dt className="cc-text-label text-cc-ink-muted">Activated Profile</dt>
              <dd className="m-0 mt-1 flex flex-wrap items-center justify-between gap-2 cc-text-cell">
                <span className="font-semibold text-cc-ink">{applicant.name}</span>
                <span className="break-all text-cc-ink-muted">{applicant.email}</span>
              </dd>
            </dl>
          )}
          {backToDashboard}
        </Panel>
      )}

      {/* Rejected State */}
      {status === 'rejected' && (
        <Panel>
          <h1 className="m-0 cc-text-title text-cc-ink">Request Declined</h1>
          <CcMessageStrip state="neutral">
            The tenant access request has been successfully declined and the user profile has been cleaned up.
          </CcMessageStrip>
          {backToDashboard}
        </Panel>
      )}

      {/* Error State */}
      {status === 'error' && (
        <Panel>
          <h1 className="m-0 cc-text-title text-cc-ink">Operation Failed</h1>
          <CcMessageStrip state="error">{errorMessage}</CcMessageStrip>
          {backToDashboard}
        </Panel>
      )}
    </>
  );
}

/**
 * The one surface of this page — a light card in the workspace (§1.1: dark
 * only for code and the transient overlay). It used to be a dark console
 * panel on a dark page, the only one in the product.
 */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto my-8 flex w-full max-w-xl flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc">
      {children}
    </section>
  );
}

export default function TenantApprovalPage() {
  return (
    <div className="flex w-full items-start justify-center p-4">
      <Suspense
        fallback={
          <Panel>
            <CcSkeleton shape="text" label="approval panel" />
          </Panel>
        }
      >
        <TenantApprovalContent />
      </Suspense>
    </div>
  );
}
