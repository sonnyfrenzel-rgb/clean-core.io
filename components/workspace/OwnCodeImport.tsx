'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { addDoc, collection, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Code2, Download, FileCode, FileText, Info, PenLine, ShieldAlert, X } from 'lucide-react';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { describeRunCost } from '@/lib/run-cost';
import { COMMUNITY_QUOTA_FALLBACK, runsAreSelfFunded } from '@/lib/run-quota-rule';
import { personalDataHintKey, scanForPersonalDataHints } from '@/lib/personal-data-hints';
import {
  OWN_CODE_MAX_SOURCE_BYTES,
  assembleOwnCode,
  assemblyReady,
  issueIsError,
  type OwnCodeFile,
  type OwnCodeRow,
} from '@/lib/own-code-import';
import { readUploadedFile } from '@/lib/own-code-zip';
import { leaveOwnCodeHandoff } from '@/lib/own-code-handoff';
import {
  wt,
  ownCodeAttention,
  ownCodeChecked,
  ownCodeDropLimit,
  ownCodeFilesAdded,
  ownCodeFreeHelp,
  ownCodeIssueText,
  ownCodeRemove,
  ownCodeRowMeta,
  ownCodeSourceSummary,
  ownCodeTooLarge,
} from '@/lib/workspace-messages';
import TrustBeforeUpload from '@/components/TrustBeforeUpload';
import PersonalDataHints from '@/components/PersonalDataHints';
import CcButton from '@/components/cc/Button';
import TargetEditionChoice, { type TargetEdition } from '@/components/TargetEditionChoice';
import { leaveStartRelease } from '@/lib/start-release-handoff';
import CcCard from '@/components/cc/Card';
import CcCheckbox from '@/components/cc/Checkbox';
import CcField, { CcFieldMessage, CcRequiredMark, CcRequiredNote } from '@/components/cc/Field';
import CcIconButton from '@/components/cc/IconButton';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { STATE_CLASSES } from '@/components/cc/state';
import { cn } from '@/lib/utils';

/**
 * "New project" with your own code — mockup 2.8 s11, `DESIGN.md` §6.1/§6.1.3.
 *
 * **No project exists until "Start analysis".** Choosing own code used to write
 * an empty "Untitled project" first and then ask for a file on the old Analyze
 * page; a reader who changed their mind left an empty project behind. Here the
 * files are read, checked and counted in the browser (`lib/own-code-import.ts`)
 * and the project is written once, with its name and its source, when the
 * reader starts. Analyze then holds the run, exactly as for every other
 * source: it asks the target system and signs what it ran.
 *
 * Everything the page says about cost comes from `lib/run-cost.ts`, about the
 * model from `GET /api/model-stages`, about trust from `lib/trust-claims.ts`
 * (through `TrustBeforeUpload`), and every figure in "What it counts" from the
 * engine's own readers over the very text that will be stored.
 *
 * Behind the admin gate like the rest of the new interface until 3.0.
 */

const ROW_BORDER: Record<OwnCodeRow['state'], string> = {
  ok: STATE_CLASSES.success.borderStrong,
  warning: STATE_CLASSES.warning.borderStrong,
  error: STATE_CLASSES.error.borderStrong,
};

let fileSeq = 0;

function readOne(file: File): Promise<OwnCodeFile> {
  return readUploadedFile(file, `f${++fileSeq}`);
}

function FileRow({ row, onRemove }: { row: OwnCodeRow; onRemove: () => void }) {
  const Icon = row.sources.length > 0 || row.zip ? FileCode : FileText;
  const lines = row.sources.reduce((n, s) => n + s.lines, 0);
  const messageId = `${row.id}-checks`;
  const issues = row.issues;
  const errors = issues.filter(issueIsError);
  const notes = issues.filter((i) => !issueIsError(i));
  return (
    <li data-own-code-file={row.name} data-state={row.state} className="flex min-w-0 flex-col gap-1">
      <div
        aria-describedby={messageId}
        className={cn(
          'flex min-h-10 min-w-0 items-center gap-2 rounded-cc-row border bg-cc-surface px-3 py-1',
          ROW_BORDER[row.state],
        )}
      >
        <span aria-hidden={true} className="shrink-0 text-cc-ink-muted">
          <Icon size={16} />
        </span>
        <code className="min-w-0 truncate font-cc-mono text-[12px] text-cc-ink">{row.name}</code>
        <span className="ml-auto shrink-0 text-[12px] font-medium text-cc-ink-muted">
          {row.used.length > 0 ? ownCodeRowMeta(row.sources.length, lines, row.zip) : null}
        </span>
        <CcIconButton label={ownCodeRemove(row.name)} onClick={onRemove} data-own-code-remove={row.name}>
          <X size={14} aria-hidden={true} />
        </CcIconButton>
      </div>
      <div id={messageId} className="flex flex-col gap-1">
        {row.state === 'ok' || (errors.length === 0 && row.used.length > 0) ? (
          <CcFieldMessage
            id={`${row.id}-ok`}
            valueState="success"
            message={ownCodeChecked(row.used.map((s) => s.object))}
          />
        ) : null}
        {[...errors, ...notes].map((issue, i) => (
          <CcFieldMessage
            key={`${issue.kind}-${i}`}
            id={`${row.id}-${i}`}
            valueState={issueIsError(issue) ? 'error' : 'warning'}
            message={<span data-own-code-issue={issue.kind}>{ownCodeIssueText(issue)}</span>}
          />
        ))}
      </div>
    </li>
  );
}

function Figure({ label, value, names, figure }: { label: string; value: string; names?: string[]; figure: string }) {
  return (
    <div data-own-code-figure={figure} className="flex min-w-0 flex-col gap-1 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2">
      <span className="text-[12px] font-medium text-cc-ink-muted">{label}</span>
      <span className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-cc-ink">{value}</span>
      {names && names.length > 0 ? (
        <span className="break-words font-cc-mono text-[11px] leading-snug text-cc-ink-muted">{names.join(', ')}</span>
      ) : null}
    </div>
  );
}

export default function OwnCodeImport() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const model = useModelAvailability();
  const [user, setUser] = useState<User | null>(null);
  /** `null` until the reader types; until then the name follows the program. */
  const [typedName, setTypedName] = useState<string | null>(null);
  const [files, setFiles] = useState<OwnCodeFile[]>([]);
  const [reading, setReading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The edition the first run is assessed against — asked before the start. */
  const [edition, setEdition] = useState<TargetEdition>('private');
  /** The Private Edition release the first run reads; `''` reads SAP's latest list. */
  const [release, setRelease] = useState('');
  /** The project exists but its target was not saved — not "nothing created". */
  const [targetError, setTargetError] = useState<string | null>(null);
  const [personalDataAckFor, setPersonalDataAckFor] = useState('');
  const [namingSaving, setNamingSaving] = useState(false);
  const [namingError, setNamingError] = useState('');
  const [startTried, setStartTried] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => onAuthStateChanged(getAuth(), setUser), []);

  const assembly = useMemo(() => assembleOwnCode(files), [files]);
  const ready = assemblyReady(assembly);

  // A name the reader has not typed follows the program; theirs wins once typed.
  const nameTouched = typedName !== null;
  const name = typedName ?? (assembly.main ? assembly.main.object : '');

  const hints = useMemo(
    () => (ready ? scanForPersonalDataHints(assembly.source) : []),
    [ready, assembly.source],
  );
  const hintKey = personalDataHintKey(hints);
  const hintsAcknowledged = hintKey !== '' && personalDataAckFor === hintKey;
  const hintsPending = hints.length > 0 && !hintsAcknowledged;

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const chosen = Array.from(list);
    if (chosen.length === 0) return;
    setError(null);
    setReading((n) => n + 1);
    try {
      const read = await Promise.all(chosen.map(readOne));
      setFiles((prev) => [...prev, ...read]);
    } finally {
      setReading((n) => n - 1);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const selfFunded = runsAreSelfFunded(profile);
  // The start signs the engine's reading (ADR-072) and, when the account's
  // analysis stage is on and a key is available, asks the model for the
  // narrative of that same run (owner decision 03.10.2026). What it costs is the
  // run's, said here before the click, with whether the model is called.
  const startCallsModel = model.enabled('analyze');
  const cost = describeRunCost({ profile, metered: true, callsModel: startCallsModel });
  const limit =
    typeof profile?.transformationsLimit === 'number' ? profile.transformationsLimit : COMMUNITY_QUOTA_FALLBACK;
  const trimmedName = name.trim();
  const nameMissing = trimmedName.length === 0;

  const start = useCallback(async () => {
    setStartTried(true);
    if (busy || !user || !ready || nameMissing || hintsPending || cost.blocked) return;
    setBusy(true);
    setError(null);
    try {
      const docRef = await addDoc(collection(getDb(), 'projects'), {
        name: trimmedName.slice(0, 254),
        status: 'uploaded',
        legacyCode: assembly.source,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      // The target the start's run is signed against. The create rule takes no
      // `s4Deployment`; the owner's update does (firestore.rules).
      try {
        await updateDoc(docRef, { s4Deployment: edition });
      } catch (err) {
        console.error('[OwnCodeImport] target system not saved', err);
        setTargetError('The project was created, but its target system could not be saved. Open it from My workspace and choose the target in Analyze.');
        setBusy(false);
        return;
      }
      leaveOwnCodeHandoff({
        projectId: docRef.id,
        personalDataKey: hintKey,
        ...(assembly.main?.file ? { fileName: assembly.main.file.split('/').pop() } : {}),
      });
      // The workspace first, with the first look (owner 02.10.2026) — never
      // the Analyze tool. The workspace signs the engine's reading at once, so
      // the full map stands after the build-up (ADR-072); Analyze takes the
      // handoff above for a later run, so nothing is asked twice.
      // The release is not a field the browser may write; the first run
      // carries it (`lib/start-release-handoff.ts`), as Change target does.
      leaveStartRelease(docRef.id, edition === 'private' ? release : '');
      router.push(`/project/${docRef.id}?first=1`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'projects');
      setError(err instanceof Error ? err.message : wt('ownCode.createFailed'));
      setBusy(false);
    }
  }, [busy, user, ready, nameMissing, hintsPending, cost.blocked, trimmedName, assembly.source, assembly.main, hintKey, router, edition, release]);

  const toggleNaming = useCallback(
    async (next: boolean) => {
      setNamingError('');
      setNamingSaving(true);
      try {
        const current = getAuth().currentUser;
        if (!current) throw new Error(wt('ownCode.namesSaveFailed'));
        const res = await fetch('/api/model-stages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await current.getIdToken()}` },
          body: JSON.stringify({ stages: { naming: next } }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error || wt('ownCode.namesSaveFailed'));
        await model.refresh();
      } catch (err) {
        setNamingError(err instanceof Error ? err.message : wt('ownCode.namesSaveFailed'));
      } finally {
        setNamingSaving(false);
      }
    },
    [model],
  );

  if (profileLoading) {
    return (
      <div role="status" className="mx-auto my-12 max-w-md text-center text-[13px] font-medium text-cc-ink-muted">
        {wt('newProject.loading')}
      </div>
    );
  }

  // Every signed-in account since roadmap 3.0.1 (ADR-061), as "New project".
  if (!profile) {
    return (
      <div className="mx-auto my-12 max-w-md rounded-cc-card border border-cc-error-border bg-cc-surface p-8 text-center shadow-cc">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-cc-card border border-cc-error-border bg-cc-error-bg text-cc-error">
          <ShieldAlert className="h-7 w-7" aria-hidden={true} />
        </div>
        <h2 className="mb-2 text-[15px] font-bold text-cc-ink">{wt('newProject.signInTitle')}</h2>
        <p className="text-[13px] leading-relaxed font-medium text-cc-ink-muted">{wt('newProject.signInBody')}</p>
      </div>
    );
  }

  const counts = assembly.counts;
  const namingOn = model.known ? model.keyAvailable && model.stages.naming : true;
  const namingAvailable = !model.known || model.keyAvailable;
  const attentionRows = assembly.attention;
  const startDisabled = busy || !user || !ready || nameMissing || hintsPending || cost.blocked || reading > 0;

  return (
    <div className="cc min-h-screen bg-cc-page px-4 py-6 sm:px-6" data-cc-own-code="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">{wt('newProject.title')}</h1>
            <p className="m-0 mt-1 max-w-3xl text-[14px] font-medium text-cc-ink-muted">{wt('ownCode.lead')}</p>
          </div>
          <span className="ml-auto">
            <CcRequiredNote />
          </span>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* ------------------------------------------------- Source */}
            <CcCard title={wt('ownCode.source')} level={2}>
              <div className="flex flex-col gap-4">
                <CcField
                  label={wt('ownCode.name')}
                  required
                  help={wt('ownCode.nameHelp')}
                  valueState={(nameTouched || startTried) && nameMissing ? 'error' : undefined}
                  message={wt('ownCode.nameMissing')}
                  data-own-code-name-field=""
                >
                  {(c) => (
                    <input
                      id={c.id}
                      type="text"
                      value={name}
                      maxLength={254}
                      aria-describedby={c.describedBy}
                      aria-invalid={c.invalid || undefined}
                      aria-required={c.ariaRequired}
                      className={cn(c.className, 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus')}
                      data-own-code-name=""
                      onChange={(e) => setTypedName(e.target.value)}
                    />
                  )}
                </CcField>

                <div className="flex min-w-0 flex-col gap-1">
                  <span id="own-code-source-label" className="text-[13px] font-semibold text-cc-ink">
                    {wt('ownCode.abapSource')}
                    <CcRequiredMark />
                  </span>
                  <div
                    data-own-code-drop=""
                    data-dragging={dragging ? 'true' : 'false'}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      if (e.dataTransfer.files) void addFiles(e.dataTransfer.files);
                    }}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 rounded-cc-card border-2 border-dashed px-4 py-6 text-center',
                      dragging ? 'border-cc-information bg-cc-information-bg' : 'border-cc-field-border bg-cc-surface',
                    )}
                  >
                    <Download size={20} aria-hidden={true} className="text-cc-ink" />
                    <span className="text-[14px] font-semibold text-cc-ink">{wt('ownCode.drop')}</span>
                    <span className="text-[12px] font-medium text-cc-ink-muted">
                      {ownCodeDropLimit(OWN_CODE_MAX_SOURCE_BYTES)}
                    </span>
                    <span className="mt-2">
                      <CcButton
                        onClick={() => inputRef.current?.click()}
                        aria-describedby="own-code-source-help"
                        data-own-code-choose=""
                      >
                        {wt('ownCode.choose')}
                      </CcButton>
                    </span>
                    <input
                      ref={inputRef}
                      type="file"
                      multiple
                      accept=".abap,.txt,.zip"
                      aria-labelledby="own-code-source-label"
                      className="hidden"
                      data-own-code-input=""
                      onChange={(e) => {
                        if (e.target.files) void addFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  <span id="own-code-source-help" className="text-[12px] font-medium text-cc-ink-muted">
                    {wt('ownCode.dropHelp')}
                  </span>
                </div>

                {reading > 0 ? (
                  <p role="status" className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('ownCode.reading')}</p>
                ) : null}

                {assembly.rows.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3
                        data-own-code-count=""
                        className="m-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-cc-ink-muted"
                      >
                        {ownCodeFilesAdded(assembly.rows.length)}
                      </h3>
                      <span className="text-[12px] font-medium text-cc-ink-muted">{wt('ownCode.checkedNote')}</span>
                    </div>
                    <ul aria-live="polite" className="m-0 flex list-none flex-col gap-2 p-0">
                      {assembly.rows.map((row) => (
                        <FileRow key={row.id} row={row} onRemove={() => removeFile(row.id)} />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </CcCard>

            {/* ------------------------------------------ What it counts */}
            <CcCard title={wt('ownCode.whatItCounts')} level={2}>
              <div className="flex flex-col gap-4">
                <section aria-labelledby="own-code-read-before" className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 id="own-code-read-before" className="m-0 text-[13px] font-semibold text-cc-ink">
                      {wt('ownCode.readBefore')}
                    </h3>
                    {counts ? <CcProvenanceChip value="reconstructed" /> : null}
                  </div>
                  <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('ownCode.readBeforeHelp')}</p>
                  {counts ? (
                    <>
                      <div data-own-code-counts="" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                        <Figure figure="lines" label={wt('ownCode.figLines')} value={counts.lines.toLocaleString('en')} />
                        <Figure
                          figure="objects"
                          label={wt('ownCode.figObjects')}
                          value={assembly.objects.length.toLocaleString('en')}
                          names={assembly.objects}
                        />
                        <Figure figure="routines" label={wt('ownCode.figRoutines')} value={counts.routines.toLocaleString('en')} />
                        <Figure
                          figure="tables-read"
                          label={wt('ownCode.figTablesRead')}
                          value={counts.tablesRead.length.toLocaleString('en')}
                          names={counts.tablesRead}
                        />
                        <Figure
                          figure="tables-written"
                          label={wt('ownCode.figTablesWritten')}
                          value={counts.tablesWritten.length.toLocaleString('en')}
                          names={counts.tablesWritten}
                        />
                      </div>
                      {assembly.missing.length > 0 ? (
                        <p data-own-code-missing="" className="m-0 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink">
                          <CcProvenanceChip value="not-determined" />
                          <span>{wt('ownCode.notDeterminedLead')}</span>
                          <code className="font-cc-mono text-[12px]">{assembly.missing.join(', ')}</code>
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p data-own-code-counts="empty" className="m-0 text-[13px] font-medium text-cc-ink-muted">
                      {wt('ownCode.nothingYet')}
                    </p>
                  )}
                </section>

                <div className="border-t border-cc-line pt-4">
                  {/* A statement, not a choice (owner decision 01.10.2026): the
                      account decides how a run is paid — its own key if one is
                      set, the free runs otherwise — so offering two radios
                      would be a choice the reader does not have. */}
                  <section aria-labelledby="own-code-paid" data-own-code-paid={selfFunded ? 'own-key' : 'free'} className="flex flex-col gap-1">
                    <h3 id="own-code-paid" className="m-0 text-[13px] font-semibold text-cc-ink">
                      {wt('ownCode.paidLegend')}
                    </h3>
                    <p
                      data-own-code-paid-statement=""
                      className={cn('m-0 text-[14px] font-semibold', cost.blocked ? 'text-cc-error' : 'text-cc-ink')}
                    >
                      {selfFunded ? wt('ownCode.payOwnKey') : cost.quota}
                    </p>
                    <p className="m-0 text-[12px] font-medium leading-snug text-cc-ink-muted">
                      {selfFunded ? wt('ownCode.payOwnKeyOn') : ownCodeFreeHelp(limit)}{' '}
                      {selfFunded ? null : wt('ownCode.payOwnKeyOffBefore')}{' '}
                      <Link href="/settings" data-own-code-settings="" className="font-semibold text-cc-brand-strong underline underline-offset-2">
                        {wt('ownCode.payOwnKeyOffLink')}
                      </Link>
                      {'.'}
                    </p>
                  </section>
                  {!selfFunded ? (
                    <p data-own-code-same-source="" className="m-0 mt-2 flex items-start gap-1 text-[12px] font-medium text-cc-information">
                      <Info size={14} aria-hidden={true} className="shrink-0" />
                      <span>{wt('ownCode.sameSource')}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </CcCard>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <TrustBeforeUpload part="card" />

            <CcCard title={wt('ownCode.whereModel')} level={2}>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                <li data-own-code-model="naming" className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3">
                  <span aria-hidden={true} className="flex h-7 w-7 items-center justify-center rounded-cc-row border border-cc-line text-cc-ink-muted">
                    <PenLine size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-[13px] font-semibold text-cc-ink">{wt('ownCode.namesTitle')}</p>
                    <p className="m-0 mt-1 text-[12px] font-medium leading-snug text-cc-ink-muted">
                      {wt('ownCode.namesBody')} <CcProvenanceChip value="proposed" />
                    </p>
                    <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink">{wt('ownCode.namesCost')}</p>
                  </div>
                </li>
                <li data-own-code-model="analyze" className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3">
                  <span aria-hidden={true} className="flex h-7 w-7 items-center justify-center rounded-cc-row border border-cc-line text-cc-ink-muted">
                    <FileText size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-[13px] font-semibold text-cc-ink">{wt('ownCode.narrativeTitle')}</p>
                    <p className="m-0 mt-1 text-[12px] font-medium leading-snug text-cc-ink-muted">{wt('ownCode.narrativeBody')}</p>
                    <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink">
                      {model.enabled('analyze') ? wt('ownCode.narrativeCost') : wt('ownCode.narrativeOff')}
                    </p>
                  </div>
                </li>
                <li data-own-code-model="none" className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3">
                  <span aria-hidden={true} className="flex h-7 w-7 items-center justify-center rounded-cc-row border border-cc-line text-cc-ink-muted">
                    <Code2 size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-[13px] font-semibold text-cc-ink">{wt('ownCode.withoutTitle')}</p>
                    <p className="m-0 mt-1 text-[12px] font-medium leading-snug text-cc-ink-muted">
                      {wt('ownCode.withoutBefore')}
                      <code className="font-cc-mono text-[11px]">{wt('ownCode.withoutExample')}</code>
                      {wt('ownCode.withoutAfter')}
                    </p>
                  </div>
                </li>
              </ul>
              <div className="mt-3">
                <CcCheckbox
                  label={wt('ownCode.namesSwitch')}
                  help={namingAvailable ? wt('ownCode.namesSwitchHelp') : wt('ownCode.namesNoKey')}
                  checked={namingOn}
                  disabled={!namingAvailable || namingSaving || !model.known}
                  onChange={(next) => void toggleNaming(next)}
                  valueState={namingError ? 'error' : undefined}
                  message={namingError || undefined}
                  data-own-code-naming=""
                />
              </div>
            </CcCard>
          </aside>
        </div>

        {hints.length > 0 ? (
          <PersonalDataHints
            id="own-code-personal-data"
            hints={hints}
            acknowledged={hintsAcknowledged}
            onAcknowledge={(next) => setPersonalDataAckFor(next ? hintKey : '')}
          />
        ) : null}

        {error ? (
          <CcMessageStrip state="error" headline={wt('ownCode.nothingCreated')} announce>
            {error}
          </CcMessageStrip>
        ) : null}

        {targetError ? (
          <CcMessageStrip state="error" announce>
            {targetError}
          </CcMessageStrip>
        ) : null}

        <div className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
          <TargetEditionChoice
          value={edition}
          onChange={setEdition}
          disabled={busy}
          release={release}
          onReleaseChange={setRelease}
        />
        </div>

        <TrustBeforeUpload part="pledge" />

        {/* The footer bar of s11: what still blocks, what it costs, the way out and the way on. */}
        <div data-own-code-footer="" className="flex flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc lg:flex-row lg:items-center">
          <div className="min-w-0 lg:flex-1">
            {attentionRows.length > 0 ? (
              <CcMessageStrip state="error" announce>
                <span data-own-code-attention="">
                  <b>{ownCodeAttention(attentionRows.length)}</b>{' '}
                  {attentionRows.map((r, i) => (
                    <React.Fragment key={r.id}>
                      {i > 0 ? ', ' : null}
                      <span className="font-semibold">{r.name}</span>
                    </React.Fragment>
                  ))}
                </span>
              </CcMessageStrip>
            ) : assembly.tooLarge ? (
              <CcMessageStrip state="error" announce>
                <span data-own-code-too-large="">{ownCodeTooLarge(assembly.bytes, OWN_CODE_MAX_SOURCE_BYTES)}</span>
              </CcMessageStrip>
            ) : assembly.blocked ? (
              <CcMessageStrip state="error" announce>
                {wt('ownCode.blockedJoined')}
              </CcMessageStrip>
            ) : hintsPending ? (
              <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('ownCode.personalDataPending')}</p>
            ) : !ready ? (
              <p className="m-0 text-[12px] font-medium text-cc-ink-muted">
                {assembly.rows.length > 0 ? ownCodeSourceSummary(assembly.rows.length, 0) : wt('ownCode.addSource')}
              </p>
            ) : (
              <p className="m-0 text-[12px] font-medium text-cc-ink-muted">
                {startCallsModel ? wt('ownCode.startNextModel') : wt('ownCode.startNext')}
              </p>
            )}
          </div>
          <span data-own-code-cost="" className="text-[12px] font-medium text-cc-ink">
            {cost.quota} · {cost.modelCall}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <CcLinkButton href="/dashboard" density="cozy" data-own-code-cancel="">
              {wt('ownCode.cancel')}
            </CcLinkButton>
            <CcLinkButton href="/admin/new-project" variant="secondary" density="cozy" data-own-code-example="">
              {wt('ownCode.tryExample')}
            </CcLinkButton>
            <CcButton
              variant="primary"
              density="cozy"
              busy={busy}
              disabled={startDisabled}
              onClick={() => void start()}
              data-own-code-start=""
            >
              {wt('ownCode.start')}
            </CcButton>
          </div>
        </div>
      </div>
    </div>
  );
}
