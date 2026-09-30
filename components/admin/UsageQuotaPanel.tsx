'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { COMMUNITY_QUOTA } from '@/lib/constants';
import { isTestAccount } from '@/lib/test-accounts';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  FileCode2,
  Info,
  KeyRound,
  Search,
  Users,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { stateChartColor } from '@/lib/chart-colors';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcCheckbox from '@/components/cc/Checkbox';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTable from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
import { CcNoMatches } from '@/components/cc/EmptyState';
import { AccountStateText, accountState, REVOKED_STATE } from '@/components/admin/AccountState';

/**
 * Admin: live consumption of the free community transformations, per user.
 *
 * Source of truth is `users/{uid}` itself, streamed via onSnapshot — admins may
 * read the collection (firestore.rules: `users/{userId}` allows read for isAdmin()),
 * so this needs no extra API surface and updates the instant a run is charged.
 *
 * One unit = one analysis run, reserved in /api/runs/create (`reserveRunQuota`).
 * `chargedInputs` holds the source fingerprints already paid for, so its size is
 * the number of distinct ABAP objects a user has taken through the engine.
 *
 * CI accounts are hidden by default. The pipeline registers a user per run and they
 * outnumbered the real accounts four to one, which made the panel useless for the
 * one thing it exists for. They are counted separately and can be shown on demand,
 * because "where did all the accounts go" is a fair question to be able to answer.
 */

type UsageRow = {
  uid: string;
  name: string;
  email: string;
  tier: string;
  status: string;
  used: number;
  limit: number;
  distinctObjects: number;
  byok: boolean;
  byokLast4?: string;
  mfaEnabled: boolean;
  s4Allowed: boolean;
  termsVersion?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** Enterprise or BYOK accounts are not metered at all (Terms §6). */
  unmetered: boolean;
  atLimit: boolean;
  revoked: boolean;
  isTest: boolean;
};

type Filter = 'all' | 'at-limit' | 'active' | 'unused' | 'byok';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'at-limit', label: 'At limit' },
  { key: 'active', label: 'Active 7d' },
  { key: 'unused', label: 'Never used' },
  { key: 'byok', label: 'BYOK' },
];

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  const parsed = new Date(value as string);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Segmented meter — one segment per granted unit while the quota stays small.
 *
 * Colours from `lib/chart-colors.ts`: a used unit is `information`, the last
 * one before the limit `warning`, a spent quota `error`. Not green — using a
 * unit proves nothing (§1.1). The figure beside the meter carries the same
 * fact in words, so the colour is never the only cue.
 */
function QuotaMeter({ used, limit }: { used: number; limit: number }) {
  if (limit > 12) {
    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    return (
      <div aria-hidden={true} className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-cc-line">
        <div className={cn('h-full rounded-full', stateChartColor('information').bg)} style={{ width: `${pct}%` }} />
      </div>
    );
  }
  const usedColour =
    used >= limit ? stateChartColor('error').bg : used >= limit - 1 ? stateChartColor('warning').bg : stateChartColor('information').bg;
  return (
    <div aria-hidden={true} className="flex shrink-0 gap-1">
      {Array.from({ length: Math.max(limit, 1) }).map((_, i) => (
        <span key={i} className={cn('h-2 w-3 rounded-sm', i < used ? usedColour : 'bg-cc-line')} />
      ))}
    </div>
  );
}

function Kpi({
  value,
  label,
  sub,
  icon: Icon,
}: {
  value: string | number;
  label: string;
  sub?: string;
  icon: typeof Zap;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
      <Icon size={16} aria-hidden={true} className="text-cc-ink-muted" />
      <div className="min-w-0">
        <p className="m-0 cc-text-title truncate tabular-nums text-cc-ink">{value}</p>
        <p className="m-0 mt-1 cc-text-label text-cc-ink-muted">{label}</p>
        {sub && <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">{sub}</p>}
      </div>
    </div>
  );
}

export default function UsageQuotaPanel() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortBy, setSortBy] = useState<'usage' | 'recent'>('recent');
  const [showTestAccounts, setShowTestAccounts] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const db = getDb();

  useEffect(() => {
    if (!db) return;

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const mapped = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          const tier = d.tier || 'pilot';
          const status = d.status || 'pending';
          const used = typeof d.transformationsUsed === 'number' ? d.transformationsUsed : 0;
          const limit = typeof d.transformationsLimit === 'number' ? d.transformationsLimit : COMMUNITY_QUOTA;
          const byok = d.byokConfigured === true;
          const unmetered = tier === 'enterprise' || byok;
          const email = d.email || '—';

          return {
            uid: docSnap.id,
            name: [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unnamed',
            email,
            tier,
            status,
            used,
            limit,
            distinctObjects: d.chargedInputs ? Object.keys(d.chargedInputs).length : 0,
            byok,
            byokLast4: d.byokLast4,
            mfaEnabled: d.mfaEnabled === true,
            s4Allowed: d.s4TenantAccessAllowed === true,
            termsVersion: d.termsVersionAccepted,
            createdAt: toDate(d.createdAt),
            updatedAt: toDate(d.updatedAt),
            unmetered,
            atLimit: !unmetered && limit > 0 && used >= limit,
            revoked: status !== 'approved' || limit === 0,
            isTest: isTestAccount(email),
          } as UsageRow;
        });

        setRows(mapped);
        setLastSync(new Date());
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error streaming user usage:', err);
        setError(
          err.code === 'permission-denied'
            ? 'No read access to the users collection — is the admin custom claim missing?'
            : err.message,
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [db]);

  const testAccountCount = useMemo(() => rows.filter((r) => r.isTest).length, [rows]);

  /** Everything below the KPI strip works on real people unless explicitly asked otherwise. */
  const scope = useMemo(
    () => (showTestAccounts ? rows : rows.filter((r) => !r.isTest)),
    [rows, showTestAccounts],
  );

  /**
   * The seven-day cut-off is anchored to the moment the data arrived, not to the
   * moment a render happens to run. `Date.now()` inside a `useMemo` is a hidden
   * input the memo does not depend on: the same rows would count a different
   * number of "active" people depending on when React last re-rendered them.
   */
  const activeSince = lastSync
    ? lastSync.getTime() - 7 * 24 * 60 * 60 * 1000
    : Number.POSITIVE_INFINITY;

  const kpis = useMemo(() => {
    const metered = scope.filter((r) => !r.unmetered);
    return {
      consumed: metered.reduce((sum, r) => sum + r.used, 0),
      granted: metered.reduce((sum, r) => sum + r.limit, 0),
      objects: scope.reduce((sum, r) => sum + r.distinctObjects, 0),
      active7d: scope.filter((r) => r.updatedAt && r.updatedAt.getTime() >= activeSince).length,
      atLimit: scope.filter((r) => r.atLimit).length,
      byok: scope.filter((r) => r.byok).length,
      total: scope.length,
    };
  }, [scope, activeSince]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = scope.filter((r) => {
      const matchesSearch =
        !term || r.name.toLowerCase().includes(term) || r.email.toLowerCase().includes(term);
      if (!matchesSearch) return false;

      switch (filter) {
        case 'at-limit':
          return r.atLimit;
        case 'active':
          return !!r.updatedAt && r.updatedAt.getTime() >= activeSince;
        case 'unused':
          return r.used === 0 && !r.unmetered;
        case 'byok':
          return r.byok;
        default:
          return true;
      }
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'usage') {
        if (b.used !== a.used) return b.used - a.used;
        return b.distinctObjects - a.distinctObjects;
      }
      return (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0);
    });
  }, [scope, search, filter, sortBy, activeSince]);

  const clearFilters = () => {
    setSearch('');
    setFilter('all');
  };

  return (
    <div className="flex w-full flex-col gap-4">
      {/* KPI strip */}
      <CcCard
        title="Free transformation usage"
        level={2}
        meta={
          <AccountStateText
            entry={
              error
                ? { label: 'Offline', state: 'error' }
                : { label: lastSync ? `Live · ${format(lastSync, 'HH:mm:ss')}` : 'Live', state: 'information' }
            }
          />
        }
      >
        <p className="m-0 mb-3 cc-text-cell text-cc-ink-muted">
          1 unit = 1 analysis run · downstream stages and the chatbot are free
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi icon={Zap} value={`${kpis.consumed} / ${kpis.granted}`} label="Units" sub="used / granted" />
          <Kpi icon={FileCode2} value={kpis.objects} label="ABAP objects" sub="distinct, billed" />
          <Kpi icon={Activity} value={kpis.active7d} label="Active 7 days" />
          <Kpi icon={AlertTriangle} value={kpis.atLimit} label="At limit" sub="0 units left" />
          <Kpi icon={KeyRound} value={kpis.byok} label="BYOK" sub="unlimited" />
          <Kpi icon={Users} value={kpis.total} label="Accounts" sub={showTestAccounts ? 'incl. CI' : 'real people'} />
        </div>
      </CcCard>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full lg:w-72">
            <CcField label="Search accounts">
              {(control) => (
                <span className="relative flex items-center">
                  <Search size={14} aria-hidden={true} className="pointer-events-none absolute left-2 text-cc-ink-muted" />
                  <input
                    id={control.id}
                    type="search"
                    placeholder="Search name or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={`${control.className} pl-8`}
                  />
                </span>
              )}
            </CcField>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CcSegmentedControl
              label="Filter accounts"
              value={filter}
              onChange={setFilter}
              segments={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
            />
            <CcButton variant="ghost" onClick={() => setSortBy(sortBy === 'recent' ? 'usage' : 'recent')}>
              Sort: {sortBy === 'recent' ? 'Last active' : 'Usage'}
            </CcButton>
          </div>
        </div>

        {testAccountCount > 0 && (
          <CcCheckbox
            label={`Show ${testAccountCount} CI test account${testAccountCount === 1 ? '' : 's'}`}
            checked={showTestAccounts}
            onChange={setShowTestAccounts}
          />
        )}
      </div>

      {/* Table */}
      {loading ? (
        <CcSkeleton shape="table" label="usage data" />
      ) : error ? (
        <CcMessageStrip state="error" headline="Access failed.">
          {error}
        </CcMessageStrip>
      ) : visible.length === 0 ? (
        <CcNoMatches title="No account matches this search and filter" onClear={clearFilters} />
      ) : (
        <CcTable
          caption="Free transformation usage per account"
          columns={[
            { key: 'user', label: 'User' },
            { key: 'tier', label: 'Tier' },
            { key: 'usage', label: 'Usage' },
            { key: 'lastActive', label: 'Last active' },
            { key: 'objects', label: 'Objects', numeric: true },
          ]}
          rows={visible.map((r) => {
            const open = expanded === r.uid;
            const toggle = () => setExpanded(open ? null : r.uid);
            return {
              key: r.uid,
              selected: open,
              // The mouse may click anywhere on the row; the keyboard and the
              // screen reader use the button in the first cell (CcTable note).
              onOpen: toggle,
              cells: {
                user: (
                  <span className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      {/* UX-078: the row says whether its detail is open, and
                          which region it opens. */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle();
                        }}
                        aria-expanded={open}
                        aria-controls={`usage-detail-${r.uid}`}
                        className="inline-flex min-w-0 items-center gap-1 rounded-cc-row text-left cc-text-identifier text-cc-ink cursor-pointer"
                      >
                        <ChevronDown
                          size={14}
                          aria-hidden={true}
                          className={cn('shrink-0 text-cc-ink-muted', open && 'rotate-180')}
                        />
                        <span className="truncate">{r.name}</span>
                      </button>
                      {r.isTest && <CcTag>CI</CcTag>}
                      {r.atLimit && <AccountStateText entry={{ label: 'Limit', state: 'error' }} />}
                      {r.revoked && !r.atLimit && (
                        <AccountStateText
                          entry={r.status === 'suspended' || r.status === 'pending' ? accountState(r.status) : REVOKED_STATE}
                        />
                      )}
                    </span>
                    <span className="truncate pl-5 text-cc-ink-muted">{r.email}</span>
                  </span>
                ),
                tier: <CcTag>{r.byok ? 'BYOK' : r.tier}</CcTag>,
                usage: r.unmetered ? (
                  <span className="text-cc-ink-muted">∞ unlimited</span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <QuotaMeter used={r.used} limit={r.limit} />
                    <span className={cn('font-semibold tabular-nums', r.atLimit ? 'text-cc-error' : 'text-cc-ink')}>
                      {r.used} / {r.limit}
                    </span>
                  </span>
                ),
                lastActive: (
                  <span className="text-cc-ink-muted">
                    {r.updatedAt ? `${formatDistanceToNow(r.updatedAt)} ago` : 'never'}
                  </span>
                ),
                objects: <span className="font-semibold">{r.distinctObjects}</span>,
              },
              note: open ? (
                <div id={`usage-detail-${r.uid}`} data-testid="usage-detail" className="flex flex-col gap-4 pt-2">
                  <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 xl:grid-cols-4">
                    {[
                      { l: 'Status', v: r.status },
                      { l: 'Tier', v: r.tier },
                      { l: 'Units used', v: r.unmetered ? 'not metered' : `${r.used} of ${r.limit}` },
                      { l: 'Distinct ABAP objects', v: String(r.distinctObjects) },
                      { l: 'BYOK', v: r.byok ? `active${r.byokLast4 ? ` (…${r.byokLast4})` : ''}` : 'no' },
                      { l: 'MFA', v: r.mfaEnabled ? 'enabled' : 'disabled' },
                      { l: 'S/4 tenant access', v: r.s4Allowed ? 'granted' : 'not granted' },
                      { l: 'Terms accepted', v: r.termsVersion || '—' },
                      { l: 'Registered', v: formatDateTime(r.createdAt) ?? '—' },
                      { l: 'Last change', v: formatDateTime(r.updatedAt) ?? '—' },
                      { l: 'Account type', v: r.isTest ? 'CI test account' : 'real user' },
                      { l: 'UID', v: r.uid },
                    ].map((item) => (
                      <div key={item.l} className="min-w-0">
                        <dt className="cc-text-label text-cc-ink-muted">{item.l}</dt>
                        <dd className="m-0 truncate select-all cc-text-cell font-semibold text-cc-ink">{item.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="m-0 flex items-start gap-2 cc-text-meta font-medium text-cc-ink-muted">
                    <Info size={14} aria-hidden={true} className="mt-0.5 shrink-0" />
                    <span>
                      Only the analysis run in <code className="font-cc-mono">/api/runs/create</code> is counted, and
                      only once it has completed &mdash; an aborted or failed run gives the unit back.
                      Re-analysing the same source is free, and each shipped starter example is free once per
                      account; every further start of the same example is counted like any other analysis. The
                      &ldquo;Objects&rdquo; column shows how many distinct ABAP sources were actually billed.
                    </span>
                  </p>
                </div>
              ) : undefined,
            };
          })}
        />
      )}
    </div>
  );
}
