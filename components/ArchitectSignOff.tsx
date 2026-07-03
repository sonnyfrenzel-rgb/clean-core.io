'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, ChevronDown, Lock, Unlock, Info, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';

export type TargetArchitecture = 'rap' | 'cap' | 'integration' | 'event' | 'retire';

interface ArchitectureOption {
  value: TargetArchitecture;
  label: string;
  focus: string;
  bestFor: string;
  notFor: string;
  motto: string;
}

const architectureOptions: ArchitectureOption[] = [
  {
    value: 'rap',
    label: 'Developer Extensibility (RAP / ABAP Cloud)',
    focus: 'On-Stack extension within the S/4HANA system boundary.',
    bestFor: 'Transactional screens, released APIs, standard table reads, synchronous validation logic.',
    notFor: 'Custom Z-table persistence, external SaaS integrations, or independently scaled services.',
    motto: 'Extend the core cleanly, on standard foundations.',
  },
  {
    value: 'cap',
    label: 'Side-by-Side Extensibility (CAP / Node.js)',
    focus: 'Decoupled cloud services on SAP BTP, independent of the ERP core.',
    bestFor: 'Custom data models (Z-tables), third-party API consumers, multi-tenant services.',
    notFor: 'Synchronous ERP posting validations or direct standard table joins.',
    motto: 'Decouple custom logic to keep the core upgrade-safe.',
  },
  {
    value: 'integration',
    label: 'SAP Integration Suite (Cloud Integration)',
    focus: 'Managed integration flows replacing custom middleware.',
    bestFor: 'IDoc/RFC/SOAP replacement, B2B data routing, file-based transfers.',
    notFor: 'Custom business logic, user interfaces, or data persistence.',
    motto: 'Replace custom adapters with managed integration.',
  },
  {
    value: 'event',
    label: 'SAP Event Mesh (Event-Driven)',
    focus: 'Asynchronous, event-based communication between systems.',
    bestFor: 'Decoupled notifications, trigger-based actions, loose coupling.',
    notFor: 'Synchronous request/response workflows or heavy data processing.',
    motto: 'Move to event-driven where synchronous coupling is unnecessary.',
  },
  {
    value: 'retire',
    label: 'Retire (Standard Replacement / Deprecation)',
    focus: 'Planned deprecation of legacy features covered by standard SAP.',
    bestFor: 'Obsolete custom reports, workarounds replaced by Fiori standard apps.',
    notFor: 'Active, business-critical processes still in daily production use.',
    motto: 'Reduce custom footprint where standard covers the need.',
  },
];

interface ArchitectSignOffProps {
  /** AI-recommended target architecture */
  recommendation: TargetArchitecture;
  /** Confidence score (0-100) */
  confidenceScore: number;
  /** AI justification text */
  justificationText: string;
  /** Current locked state from Firestore */
  isLocked: boolean;
  /** Current approved architecture from Firestore */
  currentArchitecture?: TargetArchitecture;
  /** Current override justification from Firestore */
  currentJustification?: string;
  /** Locked-by email */
  lockedByEmail?: string;
  /** Locked-at timestamp */
  lockedAt?: string;
  /** Whether the current user can unlock (owner/admin) */
  canUnlock: boolean;
  /** Called when the user confirms and locks a decision */
  onLock: (architecture: TargetArchitecture, justification: string) => Promise<void>;
  /** Called when the user unlocks the decision */
  onUnlock: () => Promise<void>;
}

export default function ArchitectSignOff({
  recommendation,
  confidenceScore,
  justificationText,
  isLocked,
  currentArchitecture,
  currentJustification,
  lockedByEmail,
  lockedAt,
  canUnlock,
  onLock,
  onUnlock,
}: ArchitectSignOffProps) {
  const [confirmed, setConfirmed] = useState(true);
  const [selectedArchitecture, setSelectedArchitecture] = useState<TargetArchitecture>(
    currentArchitecture || recommendation
  );
  const [overrideJustification, setOverrideJustification] = useState(currentJustification || '');
  const [saving, setSaving] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);

  // Sync with external props
  useEffect(() => {
    if (currentArchitecture) setSelectedArchitecture(currentArchitecture);
  }, [currentArchitecture]);

  const selectedOption = architectureOptions.find((o) => o.value === selectedArchitecture);
  const recommendedOption = architectureOptions.find((o) => o.value === recommendation);

  const canSave = confirmed || (!confirmed && selectedArchitecture && overrideJustification.trim().length > 0);

  const handleLock = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onLock(
        confirmed ? recommendation : selectedArchitecture,
        confirmed ? '' : overrideJustification.trim()
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    setShowUnlockConfirm(false);
    setSaving(true);
    try {
      await onUnlock();
      setConfirmed(true);
      setOverrideJustification('');
    } finally {
      setSaving(false);
    }
  };

  // === LOCKED STATE ===
  if (isLocked) {
    const lockedOption = architectureOptions.find((o) => o.value === currentArchitecture);
    const isOverride = currentArchitecture !== recommendation;

    return (
      <div className="relative">
        <div className="bg-white rounded-2xl sm:rounded-3xl border-2 border-emerald-200 shadow-sm overflow-hidden">
          {/* Locked Header */}
          <div className="px-4 sm:px-8 py-4 sm:py-5 bg-emerald-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">Target Architecture Set</span>
                <h4 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                  {lockedOption?.label || currentArchitecture}
                </h4>
              </div>
            </div>
            {canUnlock && (
              <button
                onClick={() => setShowUnlockConfirm(true)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors underline underline-offset-2 decoration-slate-300 hover:decoration-slate-500 shrink-0"
              >
                <Unlock size={12} />
                Change Decision
              </button>
            )}
          </div>

          {/* Locked Body */}
          <div className="px-4 sm:px-8 py-4 sm:py-5 space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-slate-500">
              <Lock size={12} />
              <span>
                Self-attested by <strong className="text-slate-800">{lockedByEmail || 'unknown'}</strong>{' '}
                {lockedAt && <>on {new Date(lockedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</>}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed">
              <Info size={11} className="shrink-0 mt-0.5" />
              This is a self-attested architecture decision recorded from your own session — not a formal organizational approval or a substitute for a governed sign-off.
            </p>

            {lockedOption && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-slate-500 shrink-0" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{lockedOption.label}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs text-slate-650">
                  <div>
                    <span className="font-extrabold text-slate-800 block mb-0.5 uppercase tracking-wider text-[10px]">Focus</span>
                    {lockedOption.focus}
                  </div>
                  <div>
                    <span className="font-extrabold text-emerald-700 block mb-0.5 uppercase tracking-wider text-[10px]">Best For</span>
                    {lockedOption.bestFor}
                  </div>
                  <div>
                    <span className="font-extrabold text-red-650 block mb-0.5 uppercase tracking-wider text-[10px]">Not Suitable For</span>
                    {lockedOption.notFor}
                  </div>
                  <div>
                    <span className="font-extrabold text-blue-600 block mb-0.5 uppercase tracking-wider text-[10px]">Motto</span>
                    <em>&ldquo;{lockedOption.motto}&rdquo;</em>
                  </div>
                </div>
              </div>
            )}

            {isOverride && currentJustification && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                <span className="font-bold">Architect's Reasoning:</span> {currentJustification}
              </div>
            )}
          </div>
        </div>

        {/* Unlock confirmation dialog */}
        {showUnlockConfirm && (
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowUnlockConfirm(false)}>
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-8 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="text-lg font-black text-slate-900">Adjust target architecture?</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Refining your path is part of the design process. Choosing a new architecture will reset the transformation output, allowing you to generate code tailored to your new choice.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <button
                  onClick={() => setShowUnlockConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnlock}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? 'Unlocking...' : 'Unlock & Change'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // === EDITABLE STATE ===
  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Decision Recommendation Header */}
      <div className="px-4 sm:px-8 py-5 sm:py-6 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="bg-slate-100 p-2.5 rounded-xl shrink-0">
            <Sparkles className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Assessment-Based Recommendation</span>
            <h4 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
              {recommendedOption?.label || recommendation}
            </h4>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{justificationText}</p>
            {/* Confidence bar */}
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[200px]">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-700',
                    confidenceScore >= 80 ? 'bg-emerald-500' : confidenceScore >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${confidenceScore}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-500">{confidenceScore}% Confidence</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sign-Off Form */}
      <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-5">
        {/* Confirmation Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              setConfirmed(e.target.checked);
              if (e.target.checked) {
                setSelectedArchitecture(recommendation);
                setOverrideJustification('');
              }
            }}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
          <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors leading-relaxed">
            {confirmed
              ? 'I want to proceed with the recommended architecture (Recommended)'
              : 'I would like to explore other architectural options'}
          </span>
        </label>

        {confirmed && recommendedOption && (
          <div className="bg-emerald-50/40 border border-emerald-100/60 rounded-xl p-4 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Info size={14} className="text-emerald-600 shrink-0" />
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">{recommendedOption.label}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs text-slate-650">
              <div>
                <span className="font-extrabold text-slate-800 block mb-0.5 uppercase tracking-wider text-[10px]">Focus</span>
                {recommendedOption.focus}
              </div>
              <div>
                <span className="font-extrabold text-emerald-750 block mb-0.5 uppercase tracking-wider text-[10px]">Best For</span>
                {recommendedOption.bestFor}
              </div>
              <div>
                <span className="font-extrabold text-red-650 block mb-0.5 uppercase tracking-wider text-[10px]">Not Suitable For</span>
                {recommendedOption.notFor}
              </div>
              <div>
                <span className="font-extrabold text-blue-650 block mb-0.5 uppercase tracking-wider text-[10px]">Motto</span>
                <em>&ldquo;{recommendedOption.motto}&rdquo;</em>
              </div>
            </div>
          </div>
        )}

        {/* Override Mode */}
        {!confirmed && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Architecture Dropdown */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Target Architecture
              </label>
              <div className="relative">
                <select
                  value={selectedArchitecture}
                  onChange={(e) => setSelectedArchitecture(e.target.value as TargetArchitecture)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all pr-10"
                >
                  {architectureOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Dynamic Info Card */}
            {selectedOption && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-blue-500 shrink-0" />
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">{selectedOption.label}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                  <div>
                    <span className="font-bold text-slate-900 block mb-0.5">Focus</span>
                    {selectedOption.focus}
                  </div>
                  <div>
                    <span className="font-bold text-emerald-700 block mb-0.5">Best For</span>
                    {selectedOption.bestFor}
                  </div>
                  <div>
                    <span className="font-bold text-red-700 block mb-0.5">Not Suitable For</span>
                    {selectedOption.notFor}
                  </div>
                  <div>
                    <span className="font-bold text-blue-700 block mb-0.5">Motto</span>
                    <em>&ldquo;{selectedOption.motto}&rdquo;</em>
                  </div>
                </div>
              </div>
            )}

            {/* Justification Textarea */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Reason for selecting another option
              </label>
              <textarea
                value={overrideJustification}
                onChange={(e) => setOverrideJustification(e.target.value)}
                placeholder="Briefly tell us why a different approach fits this specific project better..."
                rows={3}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all resize-none"
              />
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <Info size={10} />
                Sharing your reasoning helps keep your team aligned and documents this design decision.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          <button
            onClick={handleLock}
            disabled={!canSave || saving}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-sm',
              canSave && !saving
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.98] shadow-emerald-200'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            <Lock size={14} />
            {saving ? 'Saving...' : 'Confirm & Lock Architecture'}
          </button>
        </div>
      </div>
    </div>
  );
}
