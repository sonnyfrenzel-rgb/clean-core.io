'use client';

import { useState, useEffect } from 'react';
import { Lock, Unlock, Info } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCheckbox from '@/components/cc/Checkbox';
import CcDateText from '@/components/cc/DateText';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSelect from '@/components/cc/Select';
import CcTextarea from '@/components/cc/Textarea';
import { DECISION_OPTION_LABELS } from '@/lib/decision-options';

// `keep` and `standard` are chosen in the Management view (ADR-079); the panel
// shows them when they are on record and does not offer them — Design signs off
// the route of a rebuild, and Retire as before.
export type TargetArchitecture = 'rap' | 'cap' | 'integration' | 'event' | 'retire' | 'keep' | 'standard';

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
    bestFor: 'Transactional screens, released APIs, standard table reads, synchronous validation logic — and custom persistence in the customer namespace, which is what developer extensibility is for.',
    // "Custom Z-table persistence" used to sit in notFor, which is backwards for
    // Private Edition / RISE: a Z-table is a Dictionary object with a RAP business
    // object on top, on-stack. Only Public Edition's strict SaaS model pushes
    // custom persistence off the stack, so the caveat names that edition instead
    // of the construct.
    notFor: 'External SaaS integrations, independently scaled services, or custom persistence under S/4HANA Cloud Public Edition.',
    motto: 'Extend the core cleanly, on standard foundations.',
  },
  {
    value: 'cap',
    label: 'Side-by-Side Extensibility (CAP / Node.js)',
    focus: 'Decoupled cloud services on SAP BTP, independent of the ERP core.',
    bestFor: 'Custom data models under Public Edition, third-party API consumers, multi-tenant services, independently scaled workloads.',
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

/** The words a reader sees for an architecture code — the same as the sign-off's own choices. */
export function architectureOptionLabel(value: string | null | undefined): string | null {
  return (
    architectureOptions.find((o) => o.value === value)?.label ??
    (value === 'keep' || value === 'standard' ? DECISION_OPTION_LABELS[value] : null)
  );
}

interface ArchitectSignOffProps {
  /** AI-recommended target architecture */
  recommendation: TargetArchitecture;
  /** Confidence score (0-100) */
  /** Omitted when the engine never computed one — the panel then says so
   *  rather than showing a filled bar the architect would sign against. */
  confidenceScore?: number;
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

/**
 * What an option is for and what it is not for — the same four facts in the
 * locked record, under the recommendation and beside the override choice, so
 * they are one block and not three differently coloured copies of it.
 */
function OptionFacts({ option }: { option: ArchitectureOption }) {
  return (
    <div data-option-facts={option.value} className="space-y-3 rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
      <div className="flex items-center gap-2">
        <Info size={16} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
        <span className="cc-text-label text-cc-ink">{option.label}</span>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-3 cc-text-cell text-cc-ink sm:grid-cols-2">
        <div>
          <dt className="mb-1 cc-text-label text-cc-ink-muted">Focus</dt>
          <dd className="m-0">{option.focus}</dd>
        </div>
        <div>
          <dt className="mb-1 cc-text-label text-cc-ink-muted">Best For</dt>
          <dd className="m-0">{option.bestFor}</dd>
        </div>
        <div>
          <dt className="mb-1 cc-text-label text-cc-ink-muted">Not Suitable For</dt>
          <dd className="m-0">{option.notFor}</dd>
        </div>
        <div>
          <dt className="mb-1 cc-text-label text-cc-ink-muted">Motto</dt>
          <dd className="m-0">
            <em>&ldquo;{option.motto}&rdquo;</em>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * The server's refusal, in its own words — roadmap 8.8. A sign-off bound to a
 * run the reader never saw is the failure CR-11 named; the refusal that
 * prevents it is only useful if the reader is told which run the project now
 * stands on and what changed since. The text comes from the commands route or
 * from `lib/project-command-client.ts`, both of which word it for the reader —
 * including the case where the answer was lost and the outcome is unknown, so
 * no headline here claims that nothing was written.
 */
function Refusal({ text }: { text: string }) {
  return (
    <div data-signoff-refusal>
      <CcMessageStrip state="error" announce>
        {text}
      </CcMessageStrip>
    </div>
  );
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
  /** What the server said when it refused — roadmap 8.8, shown verbatim. */
  const [refusal, setRefusal] = useState<string | null>(null);

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
    setRefusal(null);
    try {
      await onLock(
        confirmed ? recommendation : selectedArchitecture,
        confirmed ? '' : overrideJustification.trim()
      );
    } catch (err: unknown) {
      // Roadmap 8.8: the server refuses a sign-off whose run has moved, and the
      // whole point of that refusal is what it says — which run, and what
      // changed since this screen was read. Until this branch existed the
      // rejection left `handleLock` unhandled and the reader saw the button
      // stop spinning and nothing else, which is the same screen as success.
      setRefusal(err instanceof Error ? err.message : 'The sign-off was refused.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    setShowUnlockConfirm(false);
    setSaving(true);
    setRefusal(null);
    try {
      await onUnlock();
      setConfirmed(true);
      setOverrideJustification('');
    } catch (err: unknown) {
      setRefusal(err instanceof Error ? err.message : 'The withdrawal was refused.');
    } finally {
      setSaving(false);
    }
  };

  // === LOCKED STATE ===
  if (isLocked) {
    const lockedOption = architectureOptions.find((o) => o.value === currentArchitecture);
    const isOverride = currentArchitecture !== recommendation;

    return (
      <>
        <div data-architect-signoff="locked" className="overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface shadow-cc">
          {/* Locked Header. A self-attestation, so the chip says "Confirmed"
              (a self-declaration, DESIGN.md §4) and nothing here is green —
              green is for what was proven. */}
          <div className="flex flex-col items-start justify-between gap-3 border-b border-cc-line px-4 py-4 sm:flex-row sm:items-center sm:px-6">
            <div className="min-w-0">
              <span className="block cc-text-label text-cc-ink-muted">Target Architecture Set</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 className="m-0 cc-text-h2 text-cc-ink">{lockedOption?.label || architectureOptionLabel(currentArchitecture) || currentArchitecture}</h3>
                <CcProvenanceChip value="confirmed" />
              </div>
            </div>
            {canUnlock && (
              <CcButton
                variant="ghost"
                icon={<Unlock size={16} aria-hidden={true} />}
                busy={saving}
                onClick={() => setShowUnlockConfirm(true)}
              >
                Change Decision
              </CcButton>
            )}
          </div>

          {/* Locked Body */}
          <div className="space-y-4 px-4 py-4 sm:px-6">
            <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell text-cc-ink-muted">
              <Lock size={16} aria-hidden={true} />
              <span>
                Self-attested by <strong className="font-semibold text-cc-ink">{lockedByEmail || 'unknown'}</strong>
                {lockedAt && (
                  <>
                    {' '}on <CcDateText value={lockedAt} format="text" />
                  </>
                )}
              </span>
            </p>

            <p className="m-0 flex items-start gap-2 cc-text-cell text-cc-ink-muted">
              <Info size={16} aria-hidden={true} className="mt-0.5 shrink-0" />
              This is a self-attested architecture decision recorded from your own session — not a formal organizational approval or a substitute for a governed sign-off.
            </p>

            {lockedOption && <OptionFacts option={lockedOption} />}

            {isOverride && currentJustification && (
              <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-4 py-3 cc-text-cell text-cc-ink">
                <span className="font-semibold">Architect&apos;s Reasoning:</span> {currentJustification}
              </div>
            )}

            {/* A refused withdrawal used to be set and never drawn: the locked
                view had no place for it. */}
            {refusal && <Refusal text={refusal} />}
          </div>
        </div>

        {/* Withdrawing the sign-off is the binding step, so it goes through the
            message box (DESIGN.md §2.6) and its dark button (§1.5). What it
            says is what `revoke-architecture` does (`lib/project-commands.ts`):
            it clears the five sign-off fields and touches nothing else. */}
        <CcMessageBox
          open={showUnlockConfirm}
          title="Withdraw the architecture sign-off?"
          confirmLabel="Withdraw sign-off"
          onConfirm={handleUnlock}
          onCancel={() => setShowUnlockConfirm(false)}
        >
          The recorded target architecture, the reasoning, and who signed it and when are removed from this project.
          Continuing to Transformation needs a new sign-off. Code already generated stays in the project until you
          regenerate it for the new choice.
        </CcMessageBox>
      </>
    );
  }

  // === EDITABLE STATE ===
  return (
    <div data-architect-signoff="open" className="overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface shadow-cc">
      {/* Decision Recommendation Header. The recommendation is the router's —
          route, confidence and rationale come from the deterministic route
          report (`lib/analysis-run.ts`) — so it carries "Reconstructed"
          (derived from the code, not confirmed by anyone) and no model
          iconography. */}
      <div className="border-b border-cc-line px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="cc-text-label text-cc-ink-muted">Assessment-Based Recommendation</span>
          <CcProvenanceChip value="reconstructed" />
        </div>
        <h3 className="mt-1 mb-0 cc-text-h2 text-cc-ink">{recommendedOption?.label || recommendation}</h3>
        <p className="mt-2 mb-0 cc-text-body text-cc-ink-muted">{justificationText}</p>
        {/* Confidence bar. A default here would put a number under the
            architect's signature that the engine never produced. The fill is
            neutral: a confidence is not a proof, and green says proven. */}
        {typeof confidenceScore === 'number' ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 max-w-48 flex-1 overflow-hidden rounded-full bg-cc-surface-muted" aria-hidden={true}>
              <div className="h-full rounded-full bg-cc-ink-muted" style={{ width: `${confidenceScore}%` }} />
            </div>
            <span className="cc-text-meta text-cc-ink-muted">{confidenceScore}% Confidence</span>
          </div>
        ) : (
          <p className="mt-3 mb-0 cc-text-meta text-cc-ink-muted">
            No confidence score was computed for this recommendation.
          </p>
        )}
      </div>

      {/* Sign-Off Form */}
      <div className="space-y-5 px-4 py-5 sm:px-6">
        <CcCheckbox
          label={
            confirmed
              ? 'I want to proceed with the recommended architecture (Recommended)'
              : 'I would like to explore other architectural options'
          }
          checked={confirmed}
          onChange={(checked) => {
            setConfirmed(checked);
            if (checked) {
              setSelectedArchitecture(recommendation);
              setOverrideJustification('');
            }
          }}
        />

        {confirmed && recommendedOption && <OptionFacts option={recommendedOption} />}

        {/* Override Mode */}
        {!confirmed && (
          <div className="space-y-4">
            <CcSelect<TargetArchitecture>
              label="Target Architecture"
              value={selectedArchitecture}
              onChange={setSelectedArchitecture}
              options={architectureOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
            />

            {selectedOption && <OptionFacts option={selectedOption} />}

            <CcTextarea
              label="Reason for selecting another option"
              required
              value={overrideJustification}
              onChange={setOverrideJustification}
              placeholder="Briefly tell us why a different approach fits this specific project better..."
              rows={3}
              help="Sharing your reasoning helps keep your team aligned and documents this design decision."
            />
          </div>
        )}

        {refusal && <Refusal text={refusal} />}

        {/* Action Buttons */}
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <CcButton
            variant="primary"
            density="cozy"
            icon={<Lock size={16} aria-hidden={true} />}
            busy={saving}
            disabled={!canSave}
            onClick={handleLock}
          >
            Confirm &amp; Lock Architecture
          </CcButton>
        </div>
      </div>
    </div>
  );
}
