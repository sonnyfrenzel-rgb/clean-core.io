'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { COMMUNITY_QUOTA } from '@/lib/constants';
import { isTestAccount } from '@/lib/test-accounts';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileCode2,
  FlaskConical,
  KeyRound,
  Search,
  ShieldOff,
  Users,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

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

/** Segmented meter — one segment per granted unit while the quota stays small. */
function QuotaMeter({ used, limit }: { used: number; limit: number }) {
  if (limit > 12) {
    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    return (
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden shrink-0">
        <div className="h-full bg-green-600 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    );
  }
  return (
    <div className="flex gap-1 shrink-0">
      {Array.from({ length: Math.max(limit, 1) }).map((_, i) => (
        <span
          key={i}
          className={clsx(
            'w-3 h-2.5 rounded-sm',
            i < used
              ? used >= limit
                ? 'bg-red-500'
                : used >= limit - 1
                  ? 'bg-amber-500'
                  : 'bg-green-600'
              : 'bg-gray-200',
          )}
        />
      ))}
    </div>
  );
}

function Kpi({
  value,
  label,
  sub,
  icon: Icon,
  tone = 'slate',
}: {
  value: string | number;
  label: string;
  sub?: string;
  icon: typeof Zap;
  tone?: 'slate' | 'green' | 'amber' | 'blue';
}) {
  const tones = {
    slate: 'text-slate-300 bg-slate-800/60 border-slate-700',
    green: 'text-green-400 bg-green-950/60 border-green-900/40',
    amber: 'text-amber-400 bg-amber-950/50 border-amber-900/40',
    blue: 'text-blue-400 bg-blue-950/50 border-blue-900/40',
  } as const;
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col gap-2 min-w-0">
      <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center border shrink-0', tones[tone])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-black text-white leading-none truncate tabular-nums">{value}</p>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5 leading-tight">{label}</p>
        {sub && <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-tight">{sub}</p>}
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

  return (
    <div className="space-y-5 w-full">
      {/* KPI strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5 z-10 relative">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
              Free transformation usage
            </h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5 leading-relaxed">
              1 unit = 1 analysis run · downstream stages and the chatbot are free
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={clsx('w-2 h-2 rounded-full', error ? 'bg-red-500' : 'bg-green-400 animate-pulse')} />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
              {error ? 'Offline' : lastSync ? `Live · ${format(lastSync, 'HH:mm:ss')}` : 'Live'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 z-10 relative">
          <Kpi
            icon={Zap}
            tone="green"
            value={`${kpis.consumed} / ${kpis.granted}`}
            label="Units"
            sub="used / granted"
          />
          <Kpi icon={FileCode2} value={kpis.objects} label="ABAP objects" sub="distinct, billed" />
          <Kpi icon={Activity} tone="green" value={kpis.active7d} label="Active 7 days" />
          <Kpi icon={AlertTriangle} tone="amber" value={kpis.atLimit} label="At limit" sub="0 units left" />
          <Kpi icon={KeyRound} tone="blue" value={kpis.byok} label="BYOK" sub="unlimited" />
          <Kpi icon={Users} value={kpis.total} label="Accounts" sub={showTestAccounts ? 'incl. CI' : 'real people'} />
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-gray-200 shadow-sm w-full space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative w-full lg:w-72 shrink-0">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 outline-none text-sm font-medium focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all text-gray-900 bg-white"
            />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={clsx(
                    'px-2.5 sm:px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap',
                    filter === f.key ? 'bg-white text-gray-950 shadow' : 'text-gray-500 hover:text-gray-900',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSortBy(sortBy === 'recent' ? 'usage' : 'recent')}
              className="px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap"
            >
              Sort: {sortBy === 'recent' ? 'Last active' : 'Usage'}
            </button>
          </div>
        </div>

        {testAccountCount > 0 && (
          <label className="flex items-center gap-2.5 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={showTestAccounts}
              onChange={(e) => setShowTestAccounts(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-600 cursor-pointer"
            />
            <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
              <FlaskConical size={12} className="text-gray-400" />
              Show {testAccountCount} CI test account{testAccountCount === 1 ? '' : 's'}
            </span>
          </label>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12">
            <div className="w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm font-semibold">Streaming usage data...</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <ShieldOff className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="text-base font-black text-gray-900 uppercase mb-1">Access failed</h3>
            <p className="text-gray-500 text-sm font-medium max-w-md mx-auto">{error}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-14 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-black text-gray-900 uppercase mb-1">No matches</h3>
            <p className="text-gray-400 text-sm font-medium">No account matches this search and filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Column headers only where there is room for columns. */}
            <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <div className="col-span-4">User</div>
              <div className="col-span-2">Tier</div>
              <div className="col-span-3">Usage</div>
              <div className="col-span-2">Last active</div>
              <div className="col-span-1 text-right">Objects</div>
            </div>

            {visible.map((r) => (
              <div key={r.uid}>
                <button
                  onClick={() => setExpanded(expanded === r.uid ? null : r.uid)}
                  className="w-full grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4 px-4 sm:px-6 py-4 lg:items-center text-left hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  {/* Identity */}
                  <div className="lg:col-span-4 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ChevronDown
                        className={clsx(
                          'w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform',
                          expanded === r.uid && 'rotate-180',
                        )}
                      />
                      <span className="font-black text-gray-900 text-sm truncate">{r.name}</span>
                      {r.isTest && (
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border border-gray-200 shrink-0">
                          <FlaskConical size={9} /> CI
                        </span>
                      )}
                      {r.atLimit && (
                        <span className="bg-red-50 text-red-650 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border border-red-200 shrink-0">
                          Limit
                        </span>
                      )}
                      {r.revoked && !r.atLimit && (
                        <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border border-gray-200 shrink-0">
                          {r.status === 'suspended' ? 'Suspended' : r.status === 'pending' ? 'Setup unfinished' : 'Revoked'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-medium truncate pl-6">{r.email}</p>
                  </div>

                  {/* On narrow screens the remaining fields become one labelled row. */}
                  <div className="lg:col-span-2 pl-6 lg:pl-0">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border',
                        r.byok
                          ? 'bg-blue-50 text-blue-650 border-blue-200'
                          : r.tier === 'enterprise'
                            ? 'bg-slate-900 text-white border-slate-800'
                            : 'bg-gray-50 text-gray-600 border-gray-200',
                      )}
                    >
                      {r.byok && <KeyRound size={9} />}
                      {r.byok ? 'BYOK' : r.tier}
                    </span>
                  </div>

                  <div className="lg:col-span-3 flex items-center gap-2.5 pl-6 lg:pl-0">
                    {r.unmetered ? (
                      <span className="text-xs font-black text-blue-650">∞ unlimited</span>
                    ) : (
                      <>
                        <QuotaMeter used={r.used} limit={r.limit} />
                        <span
                          className={clsx(
                            'text-xs font-black tabular-nums',
                            r.atLimit ? 'text-red-650' : 'text-gray-900',
                          )}
                        >
                          {r.used} / {r.limit}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="lg:col-span-2 text-xs font-medium text-gray-500 pl-6 lg:pl-0">
                    <span className="lg:hidden text-gray-400 font-bold">Last active: </span>
                    {r.updatedAt ? `${formatDistanceToNow(r.updatedAt)} ago` : 'never'}
                  </div>

                  <div className="lg:col-span-1 lg:text-right text-xs font-black text-gray-900 tabular-nums pl-6 lg:pl-0">
                    <span className="lg:hidden text-gray-400 font-bold uppercase">Objects: </span>
                    {r.distinctObjects}
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {expanded === r.uid && (
                    <motion.div
                      data-testid="usage-detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-gray-50 border-t border-gray-100"
                    >
                      <div className="px-4 sm:px-6 py-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4 text-xs">
                        {[
                          { l: 'Status', v: r.status },
                          { l: 'Tier', v: r.tier },
                          { l: 'Units used', v: r.unmetered ? 'not metered' : `${r.used} of ${r.limit}` },
                          { l: 'Distinct ABAP objects', v: String(r.distinctObjects) },
                          { l: 'BYOK', v: r.byok ? `active${r.byokLast4 ? ` (…${r.byokLast4})` : ''}` : 'no' },
                          { l: 'MFA', v: r.mfaEnabled ? 'enabled' : 'disabled' },
                          { l: 'S/4 live bridge', v: r.s4Allowed ? 'unlocked' : 'locked' },
                          { l: 'Terms accepted', v: r.termsVersion || '—' },
                          { l: 'Registered', v: r.createdAt ? format(r.createdAt, 'dd MMM yyyy HH:mm') : '—' },
                          { l: 'Last change', v: r.updatedAt ? format(r.updatedAt, 'dd MMM yyyy HH:mm') : '—' },
                          { l: 'Account type', v: r.isTest ? 'CI test account' : 'real user' },
                          { l: 'UID', v: r.uid },
                        ].map((item) => (
                          <div key={item.l} className="min-w-0">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                              {item.l}
                            </p>
                            <p className="text-gray-900 font-bold truncate select-all">{item.v}</p>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 sm:px-6 pb-5">
                        <p className="text-[11px] text-gray-500 font-medium flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                          Only the analysis run in <code className="font-mono">/api/runs/create</code> is counted.
                          Re-analysing the same source is free; the &ldquo;Objects&rdquo; column shows how many
                          distinct ABAP sources were actually billed.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
