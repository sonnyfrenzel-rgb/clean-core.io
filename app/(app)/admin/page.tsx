'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Trash2, Search, UserX, UserCheck, Globe } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';
import { formatDateTime } from '@/lib/format';
import CcButton from '@/components/cc/Button';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcTabs from '@/components/cc/Tabs';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import CcField from '@/components/cc/Field';
import CcTable from '@/components/cc/Table';
import CcSkeleton from '@/components/cc/Skeleton';
import { CcTag } from '@/components/cc/Tag';
import { CcEmptyState, CcNoMatches } from '@/components/cc/EmptyState';
import { AccountStateText, accountState, type AccountStateEntry } from '@/components/admin/AccountState';
import UsageQuotaPanel from '@/components/admin/UsageQuotaPanel';
import WorkspaceShellSwitch from '@/components/workspace/ShellSwitch';
import RunnerSelftestPanel from '@/components/admin/RunnerSelftestPanel';

export default function AdminConsole() {
  const { profile, loading: profileLoading } = useUserProfile();
  const [requests, setRequests] = useState<any[]>([]);
  /** A notification that did not go out — the state change stood, the mail did not. */
  const [mailWarning, setMailWarning] = useState('');
  /**
   * An action that did not happen. It used to be a native `alert()`, which
   * blocked the page and could not be read again once dismissed (§2.6); it is
   * a message strip now, above the list, until it is dismissed.
   */
  const [actionError, setActionError] = useState('');
  /** The account a delete is waiting on — the Message Box is open while set. */
  const [pendingDelete, setPendingDelete] = useState<{ uid: string; name?: string; email?: string } | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // Signup no longer produces a queue to work through: accounts are active the
  // moment they are created. The interesting split is therefore active vs
  // suspended, not pending vs approved. 'pending' still exists as a state — an
  // account whose activation call did not land — so it is folded into
  // 'not active' rather than given a tab of its own.
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'suspended'>('all');
  const [consoleSection, setConsoleSection] = useState<'applications' | 'usage'>('applications');

  // The weekly report links straight here, so ?tab=usage has to land on the usage
  // section rather than the default one — a link that drops you on the wrong tab
  // is a link people stop clicking.
  //
  // Read from window rather than useSearchParams: that hook forces the page into a
  // Suspense boundary during prerendering and fails the build without one, which is
  // a lot of ceremony for reading one query parameter on an already-client page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('tab') === 'usage') {
      setConsoleSection('usage');
    }
  }, []);
  
  const [actionUid, setActionUid] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approving' | 'revoking' | 'deleting' | 'tenant' | null>(null);

  const db = getDb();

  // Fetch all registration requests in real-time
  useEffect(() => {
    if (profileLoading || !profile?.isAdmin) return;

    setLoadingRequests(true);
    const q = query(collection(db, 'registration_requests'), orderBy('createdAt', 'desc'));
    // Each snapshot awaits one profile read per row before it can be shown, so
    // an older snapshot can finish after a newer one. Only the latest may land,
    // and none after unsubscribe.
    let generation = 0;
    let active = true;

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const mine = ++generation;
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
        if (!active || mine !== generation) return;
        setRequests(fetched);
      } catch (err) {
        console.error('Error fetching user profiles during snapshot processing:', err);
      } finally {
        if (active && mine === generation) setLoadingRequests(false);
      }
    }, (err) => {
      console.error('Error listing registration requests:', err);
      setLoadingRequests(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [profile, profileLoading, db]);

  const handleApprove = async (uid: string) => {
    setActionUid(uid);
    setActionType('approving');
    const targetReq = requests.find(r => r.uid === uid);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      
      // 1. Call secure API endpoint for approval
      const res = await fetch('/api/admin/console-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ uid, action: 'approve-user' }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to approve user.');
      }

      // 2. Dispatch premium Welcome Email to the user in the background
      if (targetReq) {
        try {
          // A 500 from the mail route resolves like a 200; only a network
          // error threw, so a welcome mail that was never sent was reported as
          // sent (QA review of 33471220d6e9, 57876fae0053). The approval itself
          // stands either way — it is the notification that failed.
          const mailRes = await fetch('/api/send-approval-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            // Only the uid: the route reads the address from Firebase Auth,
            // because `targetReq` comes from `registration_requests/{uid}`,
            // which the registering browser writes itself.
            body: JSON.stringify({ uid }),
          });
          if (!mailRes.ok) {
            const detail = await mailRes.json().catch(() => ({}));
            setMailWarning(`The account is active, but the welcome mail to the account's sign-in address was not sent (${detail.error || mailRes.status}). Write to them directly — the account is open, only the mail failed.`);
          }
        } catch (emailErr) {
          setMailWarning(`The account is active, but the welcome mail to the account's sign-in address could not be sent. Write to them directly — the account is open, only the mail failed.`);
          console.error('Failed to trigger Welcome Email API:', emailErr);
        }
      }
    } catch (err: any) {
      console.error('Error approving user:', err);
      setActionError(err.message || 'Failed to approve user.');
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  };

  const handleRevoke = async (uid: string) => {
    setActionUid(uid);
    setActionType('revoking');
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/admin/console-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ uid, action: 'revoke-user' }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to revoke user.');
      }
    } catch (err: any) {
      console.error('Error revoking user:', err);
      setActionError(err.message || 'Failed to revoke access.');
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  };

  // The confirmation is the Message Box below (§2.6): the Delete button only
  // opens it, and nothing is sent until its binding button is pressed.
  const handleDelete = async (uid: string) => {
    setActionUid(uid);
    setActionType('deleting');
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/admin/console-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ uid, action: 'delete-user' }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete user.');
      }
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setActionError(err.message || 'Failed to delete user.');
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  };

  const handleToggleS4Access = async (uid: string, currentAllowed: boolean) => {
    setActionUid(uid);
    setActionType('tenant');
    const targetReq = requests.find(r => r.uid === uid);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/admin/console-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          uid,
          action: currentAllowed ? 'revoke-s4' : 'grant-s4'
        }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to toggle S/4 access.');
      }

      // 3. Dispatch premium welcome / deactivation email
      if (targetReq) {
        try {
          const mailRes = await fetch(currentAllowed ? '/api/send-tenant-revoke-email' : '/api/send-tenant-approval-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            // The route looks the address up on the account; the request
            // document's copy is the requester's own writing (SEC-2026-235).
            body: JSON.stringify({
              uid: targetReq.uid,
              name: targetReq.name
            })
          });
          if (!mailRes.ok) {
            const detail = await mailRes.json().catch(() => ({}));
            setMailWarning(`Tenant access was changed, but the notification to the account's sign-in address was not sent (${detail.error || mailRes.status}).`);
          }
        } catch (emailErr) {
          setMailWarning(`Tenant access was changed, but the notification to the account's sign-in address could not be sent.`);
          console.error("Failed to send tenant access update email:", emailErr);
        }
      }

      // Update local state for immediate feedback
      setRequests(prev => prev.map(r => r.uid === uid ? { ...r, s4TenantAccessAllowed: !currentAllowed, s4TenantAccessRequested: false } : r));

    } catch (err) {
      console.error('Error toggling S/4 access:', err);
      setActionError('Failed to update tenant access privileges.');
    } finally {
      setActionUid(null);
      setActionType(null);
    }
  };

  if (profileLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <CcSkeleton shape="header" label="administrator session" />
      </div>
    );
  }

  if (!profile || !profile.isAdmin) {
    return (
      <div className="mx-auto my-12 w-full max-w-md">
        <CcMessageStrip state="error" headline="Access denied.">
          This panel is restricted exclusively to Clean-Core.io system administrators.
        </CcMessageStrip>
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
      (activeTab === 'active' && req.status === 'approved') ||
      (activeTab === 'suspended' && req.status !== 'approved');

    return matchesSearch && matchesTab;
  });

  const activeCount = requests.filter((r) => r.status === 'approved').length;
  const tabCount = (tab: 'all' | 'active' | 'suspended') =>
    tab === 'all' ? requests.length : requests.filter((r) => (tab === 'active') === (r.status === 'approved')).length;

  const applications = (
    <div className="flex flex-col gap-4">
      {/* Filter and search bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="w-full md:w-80">
          <CcField label="Search applications">
            {(control) => (
              <span className="relative flex items-center">
                <Search size={14} aria-hidden={true} className="pointer-events-none absolute left-2 text-cc-ink-muted" />
                <input
                  id={control.id}
                  type="search"
                  placeholder="Search applications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`${control.className} pl-8`}
                />
              </span>
            )}
          </CcField>
        </div>
        {/* The third segment folds pending, suspended and deleted together (see
            the note on `activeTab`), so it carries the name of what it holds —
            "Not active", as in the header count — and not the name of one of
            the three (UX review of ac27aed, UX-145). */}
        <CcSegmentedControl
          label="Account state"
          value={activeTab}
          onChange={setActiveTab}
          segments={[
            { value: 'all', label: `All (${tabCount('all')})` },
            { value: 'active', label: `Active (${tabCount('active')})` },
            { value: 'suspended', label: `Not active (${tabCount('suspended')})` },
          ]}
        />
      </div>

      {loadingRequests ? (
        <CcSkeleton shape="table" label="applications" />
      ) : requests.length === 0 ? (
        <CcEmptyState title="No applications yet">No registration requests have been submitted.</CcEmptyState>
      ) : filteredRequests.length === 0 ? (
        <CcNoMatches
          title="No applications match your search or filter"
          reason="No registration requests match your current filters or query."
          onClear={() => {
            setSearchTerm('');
            setActiveTab('all');
          }}
        />
      ) : (
        <CcTable
          caption="Applications"
          columns={[
            { key: 'account', label: 'Account' },
            { key: 'state', label: 'State' },
            { key: 'submitted', label: 'Submitted', width: '190px' },
            { key: 'actions', label: 'Actions', action: true },
          ]}
          rows={filteredRequests.map((req) => {
            const busyRow = req.uid === actionUid;
            const mail = welcomeMailBadge(req.welcomeMailStatus);
            return {
              key: req.uid,
              cells: {
                account: (
                  <span className="flex min-w-0 flex-col">
                    <span className="cc-text-identifier text-cc-ink">{req.name || 'Anonymous User'}</span>
                    <span className="select-all break-all text-cc-ink-muted">{req.email}</span>
                  </span>
                ),
                state: (
                  <span className="flex flex-col items-start gap-1">
                    {/* Every non-approved account used to read "Pending
                        Review", including one an administrator had just
                        suspended (QA review of 33471220d6e9, aad1ecf24d47). */}
                    <AccountStateText entry={accountState(req.status)} />
                    {req.s4TenantAccessAllowed && <CcTag>S/4 tenant access granted</CcTag>}
                    {!req.s4TenantAccessAllowed && req.s4TenantAccessRequested && (
                      <AccountStateText entry={{ label: 'S/4 tenant access requested', state: 'information' }} />
                    )}
                    {/*
                      Whether the welcome mail actually arrived. An account that
                      was created and never used looks the same as one whose
                      first-run guide sat in a corporate quarantine — this is the
                      only place that difference becomes visible. Silence until a
                      delivery event arrives; nothing to say is not a warning.
                    */}
                    {mail && <AccountStateText entry={mail} />}
                  </span>
                ),
                submitted: <span className="text-cc-ink-muted">{formatDateTime(req.createdAt) ?? '—'}</span>,
                actions: (
                  <span className="flex flex-wrap justify-end gap-2">
                    {req.status !== 'approved' ? (
                      <CcButton
                        variant="secondary"
                        icon={<UserCheck size={16} aria-hidden={true} />}
                        busy={busyRow && actionType === 'approving'}
                        disabled={busyRow && actionType !== 'approving'}
                        onClick={() => handleApprove(req.uid)}
                      >
                        Reinstate
                      </CcButton>
                    ) : (
                      <CcButton
                        variant="ghost"
                        icon={<UserX size={16} aria-hidden={true} />}
                        busy={busyRow && actionType === 'revoking'}
                        disabled={busyRow && actionType !== 'revoking'}
                        onClick={() => handleRevoke(req.uid)}
                      >
                        Revoke
                      </CcButton>
                    )}

                    {req.status === 'approved' && (
                      <CcButton
                        variant="ghost"
                        icon={<Globe size={16} aria-hidden={true} />}
                        busy={busyRow && actionType === 'tenant'}
                        disabled={busyRow && actionType !== 'tenant'}
                        onClick={() => handleToggleS4Access(req.uid, req.s4TenantAccessAllowed)}
                      >
                        {req.s4TenantAccessAllowed ? 'Revoke BYOT' : 'Grant BYOT'}
                      </CcButton>
                    )}

                    <CcButton
                      variant="ghost"
                      tone="danger"
                      icon={<Trash2 size={16} aria-hidden={true} />}
                      busy={busyRow && actionType === 'deleting'}
                      disabled={busyRow && actionType !== 'deleting'}
                      onClick={() => setPendingDelete({ uid: req.uid, name: req.name, email: req.email })}
                      title="Permanently delete application record"
                    >
                      Delete
                    </CcButton>
                  </span>
                ),
              },
              note:
                (mail && req.welcomeMailDetail) || req.motivation ? (
                  <span className="flex flex-col gap-1 cc-text-cell text-cc-ink-muted">
                    {/* UX-110 / UX-146: the provider's reason ("mailbox does not
                        exist") sat only in the badge's hover title — unreachable
                        by keyboard, touch and screen reader. It is text now. */}
                    {mail && req.welcomeMailDetail && (
                      <span data-welcome-mail-detail>
                        <span className="font-semibold text-cc-ink">Mail provider:</span> {req.welcomeMailDetail}
                      </span>
                    )}
                    {req.motivation && (
                      <span>
                        <span className="font-semibold text-cc-ink">Motivation:</span> &ldquo;{req.motivation}&rdquo;
                      </span>
                    )}
                  </span>
                ) : undefined,
            };
          })}
        />
      )}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CcTag>Secure console</CcTag>
            <span className="font-cc-mono cc-text-meta text-cc-ink-muted">{APP_VERSION}</span>
          </div>
          <h1 className="m-0 mt-1 cc-text-title text-cc-ink">Admin Control Room</h1>
        </div>
        <p className="m-0 cc-text-meta text-cc-ink-muted">
          Total applications: <span className="text-cc-ink tabular-nums">{requests.length}</span>
          {' · '}Active: <span className="text-cc-ink tabular-nums">{activeCount}</span>
          {' · '}Not active: <span className="text-cc-ink tabular-nums">{requests.length - activeCount}</span>
        </p>
      </header>

      {mailWarning && (
        <CcMessageStrip
          state="warning"
          announce
          actions={
            <CcButton variant="ghost" onClick={() => setMailWarning('')}>
              Dismiss
            </CcButton>
          }
        >
          {mailWarning}
        </CcMessageStrip>
      )}

      {actionError && (
        <CcMessageStrip
          state="error"
          headline="The action did not go through."
          announce
          actions={
            <CcButton variant="ghost" onClick={() => setActionError('')}>
              Dismiss
            </CcButton>
          }
        >
          {actionError}
        </CcMessageStrip>
      )}

      {/* The switch the 3.0 interface grows behind (roadmap 1.4). Here because
          this is where the gate it shares already is, and because it only ever
          acts on the signed-in administrator's own account. */}
      <WorkspaceShellSwitch />

      {/* The negative test of the isolated runners (roadmap 8.9), one click.
          Same gate as every action here: admin claim plus a fresh step-up. */}
      <RunnerSelftestPanel />

      {/* Console sections. The usage panel streams every user profile, so it
          is only mounted while its tab is the chosen one. */}
      <CcTabs
        label="Admin console"
        value={consoleSection}
        onChange={setConsoleSection}
        tabs={[
          { value: 'applications', label: 'Applications', content: applications },
          { value: 'usage', label: 'Usage & Quota', content: consoleSection === 'usage' ? <UsageQuotaPanel /> : null },
        ]}
      />

      {/* The confirmation of a delete (§2.6). Cancel, Escape and the scrim
          all close it without sending anything; only the binding button
          calls `handleDelete`. */}
      <CcMessageBox
        open={pendingDelete !== null}
        title="Delete this account permanently?"
        confirmLabel="Delete permanently"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) void handleDelete(target.uid);
        }}
      >
        <p className="m-0">
          This erases the application record and user profile of{' '}
          <span className="font-semibold">{pendingDelete?.name || 'this account'}</span>
          {pendingDelete?.email ? <> ({pendingDelete.email})</> : null} — the same full erasure as a
          self-service account deletion: sign-in, projects, runs and stored keys go with it.
        </p>
        <p className="m-0 mt-2">This cannot be undone.</p>
      </CcMessageBox>
    </div>
  );
}

/**
 * The delivery verdict on a welcome mail, as a status — or nothing.
 *
 * `sent` is deliberately silent: it means Resend queued the message, which is
 * what the platform always knew and what turned out to be worth nothing. Only
 * the states that say something about the *reader* get a status, and only the two
 * that mean they never saw it are `error`.
 */
function welcomeMailBadge(
  status: string | undefined,
): (AccountStateEntry & { failed: boolean }) | null {
  switch (status) {
    case 'email.bounced':
      return { label: 'Welcome mail bounced', state: 'error', failed: true };
    case 'email.complained':
      return { label: 'Marked as spam', state: 'error', failed: true };
    case 'email.delivery_delayed':
      return { label: 'Welcome mail delayed', state: 'warning', failed: true };
    case 'email.delivered':
      return { label: 'Welcome mail delivered', state: 'neutral', failed: false };
    case 'email.opened':
    case 'email.clicked':
      // Opened or clicked, not read: a privacy proxy or a link scanner fires the
      // same events, so it is no evidence a person read it, and not green (§1.1).
      return { label: 'Welcome mail opened or clicked', state: 'information', failed: false };
    default:
      return null;
  }
}
