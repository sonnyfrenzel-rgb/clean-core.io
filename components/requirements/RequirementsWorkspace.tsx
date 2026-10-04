'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenText, Download, FileText, History, ListChecks, Maximize2, Minimize2, Printer, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTabs from '@/components/cc/Tabs';
import CcToast from '@/components/cc/Toast';
import CcTextarea from '@/components/cc/Textarea';
import CcSelect from '@/components/cc/Select';
import { CcEmptyState } from '@/components/cc/EmptyState';
import { useCanvasFullscreen } from '@/components/process-map/useCanvasFullscreen';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import { useSpecAutosave, type SpecSaveState } from '@/hooks/useSpecAutosave';
import SpecOverview from '@/components/requirements/SpecOverview';
import SpecDocument, { SPEC_SECTIONS } from '@/components/requirements/SpecDocument';
import DecisionDialog from '@/components/requirements/DecisionDialog';
import { sha256Hex } from '@/lib/artefact-digest';
import { saveAs } from '@/lib/fileSaver';
import type { ObjectLevelInput } from '@/lib/functional-requirements';
import type { NFRData } from '@/lib/non-functional-requirements';
import {
  DECISION_OWNERS,
  DECISION_OWNER_LABEL,
  SPEC_NFR_CATEGORIES,
  SPEC_NFR_CATEGORY_LABEL,
  answerDecision,
  applyRuleStates,
  buildSpecDraft,
  mergeReading,
  nextDecisionId,
  readSpecRecord,
  specCounts,
  specDrift,
  specForSave,
  type DecisionOwner,
  type RequirementsSpec,
  type RuleStateInput,
  type SpecHistoryEntry,
  type SpecRecord,
} from '@/lib/requirements-spec';
import './requirements-workspace.css';

/**
 * The requirements workspace of the Design tool (owner 04.10.2026, ADR-078):
 * one place where the functional and non-functional requirements of the new
 * solution are written down as a specification an external implementer can
 * build from.
 *
 * Its own page under Design (`/project/{id}/design/requirements`), so it has an
 * address a reader can reload and share with an invited reader, and a way
 * back to Design. What it holds:
 *
 *   - **At a glance** — the figures and the three bars of `SpecOverview`;
 *   - **the document** — `SpecDocument`, the nine sections, edited in place;
 *   - **the decisions** — the open questions as cards, answered in
 *     `DecisionDialog`; an answer updates the document and the count;
 *   - **full text** — the document alone, filling the screen, with the
 *     contents as a side navigation (button, Escape and Back leave it — the
 *     mechanism of the canvases, `useCanvasFullscreen`);
 *   - **exports** — Word, Markdown and a Confluence page from one block list,
 *     and print / PDF from the page's print style;
 *   - **the engine's reading** — the functional and non-functional lists as
 *     the engine read them, the raw material of the document.
 *
 * Who may do what: the owner writes (on a phone: reads and decides); an
 * invited reader reads and exports; the demo shows the engine's draft and
 * stores nothing. Saving is the Economics pattern (`useSpecAutosave`).
 */

export type WorkspaceMode = 'owner' | 'reader' | 'demo';

export interface RequirementsWorkspaceProps {
  mode: WorkspaceMode;
  projectId: string | null;
  projectName: string;
  fileName: string;
  /** The source the active run signed, or null with `missingReason`. */
  source: string | null;
  missingReason: string | null;
  levels: readonly ObjectLevelInput[] | null;
  /** The business rules answered in the process review, when the server had them. */
  ruleStates: readonly RuleStateInput[] | null;
  proposals: NFRData | null;
  route: string | null;
  /** The signed-in account, the document's author (a self-declaration). */
  accountEmail: string | null;
  /** The functional and non-functional lists as the engine reads them. */
  engineReading?: React.ReactNode;
}

interface RecordMeta {
  revision: number;
  savedAt: string | null;
  savedBy: string | null;
  history: SpecHistoryEntry[];
  derivedFrom: string | null;
}

const NO_META: RecordMeta = { revision: 0, savedAt: null, savedBy: null, history: [], derivedFrom: null };

async function authHeader(): Promise<Record<string, string>> {
  const { getAuth } = await import('@/lib/firebase');
  const user = getAuth().currentUser;
  return user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {};
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readEngine(source: string, levels: RequirementsWorkspaceProps['levels']) {
  const [fr, nfr] = await Promise.all([import('@/lib/functional-requirements'), import('@/lib/non-functional-requirements')]);
  // Let the reading state paint before the engine takes the thread.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { fr: fr.buildRequirementSet({ source, levels }), nfr: nfr.buildNfrSet({ source }) };
}

function SaveLine({ save, mode, onRetry }: { save: SpecSaveState; mode: WorkspaceMode; onRetry: () => void }) {
  if (mode === 'demo') {
    return (
      <p data-spec-save="demo" role="status" className="m-0 cc-text-meta text-cc-ink-muted">
        Demo — nothing here is saved.
      </p>
    );
  }
  if (mode === 'reader') {
    return (
      <p data-spec-save="read-only" role="status" className="m-0 cc-text-meta text-cc-ink-muted">
        Read-only — the owner writes this specification.
      </p>
    );
  }
  const words =
    save.state === 'saving'
      ? 'Saving…'
      : save.state === 'pending'
        ? 'Unsaved changes…'
        : save.state === 'saved'
          ? `Saved · revision ${save.revision} · ${save.at.slice(11, 16)} UTC`
          : save.state === 'failed'
            ? 'Not saved'
            : save.state === 'conflict'
              ? 'Not saved — changed elsewhere'
              : 'Saved';
  return (
    <span data-spec-save={save.state} role="status" aria-live="polite" className="inline-flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
      <span className={cn(save.state === 'failed' || save.state === 'conflict' ? 'text-cc-error' : '')}>{words}</span>
      {save.state === 'failed' ? (
        <CcButton variant="ghost" icon={<RefreshCw size={14} aria-hidden={true} />} onClick={onRetry} data-spec-save-retry="">
          Retry
        </CcButton>
      ) : null}
    </span>
  );
}

export default function RequirementsWorkspace(props: RequirementsWorkspaceProps) {
  const { mode, projectId, projectName, fileName, source, missingReason, levels, ruleStates, proposals, route, accountEmail, engineReading } = props;
  const phone = useBreakpointS();
  const sourceSha = useMemo(() => (source ? sha256Hex(source) : null), [source]);

  const [load, setLoad] = useState<'loading' | 'none' | 'ready' | 'failed'>(mode === 'demo' ? 'none' : 'loading');
  const [spec, setSpec] = useState<RequirementsSpec | null>(null);
  const [meta, setMeta] = useState<RecordMeta>(NO_META);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<RequirementsSpec | null>(null);
  const [tab, setTab] = useState<'document' | 'engine'>('document');
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newOwner, setNewOwner] = useState<DecisionOwner>('business');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const specRef = useRef<RequirementsSpec | null>(null);
  useEffect(() => {
    specRef.current = spec;
  }, [spec]);

  const owner = mode === 'owner';
  const editable = owner && !phone;
  const canDecide = owner;

  const onSaved = useCallback((record: SpecRecord) => {
    setMeta({ revision: record.revision, savedAt: record.savedAt, savedBy: record.savedBy, history: record.history, derivedFrom: record.derivedFrom });
    // Who answered and when are the server's: carried into what is on screen
    // where the answer there is still the one that was saved.
    setSpec((current) => {
      if (!current) return current;
      const stamped = new Map(record.spec.decisions.map((d) => [d.id, d.answer]));
      return {
        ...current,
        decisions: current.decisions.map((d) => {
          const s = stamped.get(d.id);
          if (!d.answer || !s || s.kind !== d.answer.kind || s.value !== d.answer.value) return d;
          return { ...d, answer: { ...d.answer, by: s.by, at: s.at } };
        }),
      };
    });
  }, []);

  const { save, schedule, retry } = useSpecAutosave({ projectId, enabled: owner, baseRevision: meta.revision, onSaved });

  /* ---------------- read what is stored ---------------- */
  useEffect(() => {
    if (mode === 'demo' || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/requirements-spec`, { headers: await authHeader() });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { record?: unknown };
        const record = body.record ? readSpecRecord(body.record) : null;
        if (cancelled) return;
        if (record) {
          setSpec(record.spec);
          setMeta({ revision: record.revision, savedAt: record.savedAt, savedBy: record.savedBy, history: record.history, derivedFrom: record.derivedFrom });
          setLoad('ready');
        } else {
          setLoad('none');
        }
      } catch {
        if (!cancelled) setLoad('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, projectId]);

  /* ---------------- the demo shows the engine's draft at once ---------------- */
  useEffect(() => {
    if (mode !== 'demo' || !source || spec) return;
    let cancelled = false;
    (async () => {
      const { fr, nfr } = await readEngine(source, levels);
      if (cancelled) return;
      setSpec(buildSpecDraft({ projectName, fr, nfr, ruleStates, proposals, route }));
      setLoad('ready');
    })().catch(() => setLoad('failed'));
    return () => {
      cancelled = true;
    };
  }, [mode, source, levels, spec, projectName, ruleStates, proposals, route]);

  /* ---------------- written for an earlier source? ---------------- */
  const stale = Boolean(meta.derivedFrom && sourceSha && meta.derivedFrom !== sourceSha);
  useEffect(() => {
    if (!stale || !source || fresh) return;
    let cancelled = false;
    (async () => {
      const { fr, nfr } = await readEngine(source, levels);
      if (!cancelled) setFresh(buildSpecDraft({ projectName, fr, nfr, ruleStates, proposals, route }));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [stale, source, fresh, levels, projectName, ruleStates, proposals, route]);
  const drift = stale && spec && fresh ? specDrift(spec, fresh) : null;

  /* ---------------- edits ---------------- */
  const derivedFrom = meta.derivedFrom ?? sourceSha;
  const change = useCallback(
    (mutate: (s: RequirementsSpec) => RequirementsSpec, note: string) => {
      const current = specRef.current;
      if (!current || !owner || !derivedFrom) return;
      const next = mutate(current);
      specRef.current = next;
      setSpec(next);
      schedule(specForSave(next), derivedFrom, note);
    },
    [owner, derivedFrom, schedule],
  );

  // Answers given in the process review after the document was started reach
  // it when the owner opens it: a rule answered Clarify or Change becomes a
  // decision, Keep and Drop settle requirements still in draft. Applied once —
  // `applyRuleStates` changes nothing it has applied before.
  const appliedRules = useRef(false);
  useEffect(() => {
    if (!owner || load !== 'ready' || !ruleStates || appliedRules.current || !specRef.current) return;
    appliedRules.current = true;
    const current = specRef.current;
    const next = applyRuleStates(current, ruleStates);
    const sig = (s: RequirementsSpec) => JSON.stringify([s.decisions.map((d) => d.id), s.requirements.map((r) => [r.id, r.status, r.decisionIds])]);
    if (sig(next) !== sig(current)) change(() => next, 'Took over the answers of the process review');
  }, [owner, load, ruleStates, change]);

  const start = async () => {
    if (!source || !sourceSha || !owner) return;
    setStarting(true);
    setStartError(null);
    try {
      const { fr, nfr } = await readEngine(source, levels);
      const draft = buildSpecDraft({ projectName, fr, nfr, ruleStates, proposals, route });
      specRef.current = draft;
      setSpec(draft);
      setMeta((m) => ({ ...m, derivedFrom: sourceSha }));
      setLoad('ready');
      schedule(specForSave(draft), sourceSha, 'Started the specification from the code', true);
    } catch (err) {
      console.error('[Requirements] The engine could not read the source:', err);
      setStartError('The requirements could not be read from this source. Nothing was stored. Try again; if it fails again, the source has a construct the engine does not read yet.');
    } finally {
      setStarting(false);
    }
  };

  const takeOverReading = () => {
    if (!fresh || !sourceSha || !spec) return;
    const merged = mergeReading(spec, fresh);
    specRef.current = merged;
    setSpec(merged);
    setMeta((m) => ({ ...m, derivedFrom: sourceSha }));
    setFresh(null);
    schedule(specForSave(merged), sourceSha, 'Took over the reading of the current source', true);
  };

  /* ---------------- full text ---------------- */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { filled: fullFilled, toggle: fullToggleFn, toggleRef: fullToggleRef } = useCanvasFullscreen({ rootRef });

  // In-page links scroll without a history entry: a fragment entry would read
  // as "Back" to the full screen, which leaves it on the next Back.
  const hasDocument = spec !== null;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onLinkClick = (event: MouseEvent) => {
      const a = (event.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a || !root.contains(a)) return;
      const id = decodeURIComponent(a.getAttribute('href')!.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };
    root.addEventListener('click', onLinkClick, true);
    return () => root.removeEventListener('click', onLinkClick, true);
  }, [hasDocument, tab]);

  /* ---------------- exports ---------------- */
  const counts = spec ? specCounts(spec) : null;
  const exportMeta = () => ({
    date: today(),
    fileName,
    sourceSha256: derivedFrom ?? '',
    revision: meta.revision,
    author: meta.savedBy ?? accountEmail ?? 'The signed-in account',
    history: meta.history,
    stale,
  });
  const download = async (kind: 'docx' | 'md' | 'html') => {
    if (!spec) return;
    const ex = await import('@/lib/requirements-spec-export');
    const blob =
      kind === 'docx'
        ? await ex.specDocx(spec, exportMeta())
        : kind === 'md'
          ? new Blob([ex.specMarkdown(spec, exportMeta())], { type: 'text/markdown;charset=utf-8' })
          : new Blob([ex.specConfluenceHtml(spec, exportMeta())], { type: 'text/html;charset=utf-8' });
    await saveAs(blob, ex.specFileName(projectName || fileName, kind));
    setToast(kind === 'docx' ? 'Word file downloaded.' : kind === 'md' ? 'Markdown file downloaded.' : 'Confluence page downloaded.');
  };

  /* ---------------- decisions ---------------- */
  const openDecision = spec && decisionId ? spec.decisions.find((d) => d.id === decisionId) ?? null : null;
  const addDecision = () => {
    const q = newQuestion.trim();
    if (!q) return;
    change(
      (s) => ({
        ...s,
        decisions: [
          ...s.decisions,
          { id: nextDecisionId(s), origin: 'person', owner: newOwner, question: q.slice(0, 600), context: 'Added in the workspace.', options: [], lines: [], affects: [], proposal: '', answer: null },
        ],
      }),
      'Added a decision',
    );
    setAdding(false);
    setNewQuestion('');
  };

  /* ---------------- the states before a document ---------------- */
  const author = meta.savedBy ?? accountEmail ?? 'The signed-in account';

  if (load === 'loading') {
    return (
      <div data-spec-workspace="" data-spec-state="loading" className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-8">
        <CcSkeleton shape="text" label="the requirements specification" count={6} />
      </div>
    );
  }
  if (load === 'failed') {
    return (
      <div data-spec-workspace="" data-spec-state="failed">
        <CcMessageStrip state="error" headline="The specification could not be read." actions={<CcButton onClick={() => window.location.reload()}>Reload</CcButton>}>
          Nothing was changed. This is usually a connection or permission issue — reload the page.
        </CcMessageStrip>
      </div>
    );
  }
  if (!spec) {
    const startPanel = (
      <div className="flex flex-col gap-4">
        {!source ? (
          <CcMessageStrip state="information" headline="Not available yet.">
            {missingReason ?? 'The specification is read from the source the active run signed.'}
          </CcMessageStrip>
        ) : null}
        {startError ? (
          <CcMessageStrip state="error" headline="Not started." announce>
            {startError}
          </CcMessageStrip>
        ) : null}
        {mode === 'reader' ? (
          <CcEmptyState illustration={<FileText size={32} aria-hidden={true} className="text-cc-ink-muted" />} title="No specification yet">
            The owner of this project starts the requirements specification; it appears here once it is saved.
          </CcEmptyState>
        ) : (
          <CcEmptyState
            illustration={<ListChecks size={32} aria-hidden={true} className="text-cc-ink-muted" />}
            title="Start the requirements specification"
            action={
              <CcButton variant="primary" density="cozy" icon={<ListChecks size={16} aria-hidden={true} />} busy={starting} disabled={!source || mode !== 'owner'} onClick={() => void start()} data-spec-start="">
                {starting ? 'Reading the code…' : 'Read the requirements and start'}
              </CcButton>
            }
          >
            The engine reads the functional and non-functional requirements from the signed source and drafts the document — sections,
            requirements with their lines, and the questions the code cannot answer as decisions. No model call, no cost. You then edit,
            decide and export it.
          </CcEmptyState>
        )}
      </div>
    );
    return (
      <div data-spec-workspace="" data-spec-state="not-started" className="flex flex-col gap-4">
        {engineReading ? (
          <CcTabs
            label="Requirements workspace"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'document', label: 'Specification', content: startPanel },
              { value: 'engine', label: 'What the engine read', content: <div data-spec-engine-reading="" className="flex min-w-0 flex-col gap-8">{engineReading}</div> },
            ]}
          />
        ) : (
          startPanel
        )}
      </div>
    );
  }

  /* ---------------- the workspace ---------------- */
  const toc = (
    <nav aria-label="Specification contents" data-spec-toc="" className="flex min-w-0 flex-col gap-1">
      <p className="m-0 mb-1 cc-text-label text-cc-ink-muted">Contents</p>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        <li>
          <a href="#spec-title" className="block py-1 text-[13px] font-semibold text-cc-ink underline-offset-2 hover:underline">
            Title page
          </a>
        </li>
        {SPEC_SECTIONS.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} data-spec-toc-link={s.id} className="flex items-baseline justify-between gap-2 py-1 text-[13px] font-semibold text-cc-ink underline-offset-2 hover:underline">
              <span className="min-w-0">
                <span className="mr-1 font-cc-mono text-cc-ink-muted">{s.number}</span>
                {s.title}
              </span>
              {s.id === 'spec-s3' && counts ? <span className="text-[12px] text-cc-ink-muted">{counts.functional}</span> : null}
              {s.id === 'spec-s4' && counts ? <span className="text-[12px] text-cc-ink-muted">{counts.nonFunctional}</span> : null}
              {s.id === 'spec-s7' && counts ? <span className="text-[12px] text-cc-ink-muted">{counts.openDecisions} open</span> : null}
            </a>
            {s.id === 'spec-s4' ? (
              <ol className="m-0 flex list-none flex-col p-0 pl-4">
                {SPEC_NFR_CATEGORIES.filter((c) => counts?.byCategory[c]).map((c) => (
                  <li key={c}>
                    <a href={`#spec-s4-${c}`} className="block py-1 text-[12px] font-semibold text-cc-ink-muted underline-offset-2 hover:text-cc-ink hover:underline">
                      {SPEC_NFR_CATEGORY_LABEL[c]}
                    </a>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );

  const fullToggle = (
    <CcButton
      ref={fullToggleRef}
      variant={fullFilled ? 'secondary' : 'ghost'}
      icon={fullFilled ? <Minimize2 size={16} aria-hidden={true} /> : <Maximize2 size={16} aria-hidden={true} />}
      onClick={fullToggleFn}
      aria-pressed={fullFilled}
      data-spec-fulltext={fullFilled ? 'leave' : 'enter'}
    >
      {fullFilled ? 'Leave full text' : 'Full text'}
    </CcButton>
  );

  const document_ = (
    <SpecDocument
      spec={spec}
      counts={counts!}
      meta={{ author, revision: meta.revision, savedAt: meta.savedAt, fileName, sourceSha256: derivedFrom ?? '' }}
      editable={editable}
      canDecide={canDecide}
      onChange={change}
      onOpenDecision={setDecisionId}
      onAddDecision={() => setAdding(true)}
    />
  );

  const documentTab = (
    <div className="flex min-w-0 flex-col gap-6">
      <SpecOverview counts={counts!} />
      {counts!.openDecisions > 0 ? (
        <div data-spec-next-decision="" className="flex flex-wrap items-center justify-between gap-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc">
          <p className="m-0 text-[14px] text-cc-ink">
            <b className="font-semibold">{counts!.openDecisions} open decision{counts!.openDecisions === 1 ? '' : 's'}</b> — the specification is ready to hand over once each is answered.
          </p>
          <CcButton
            variant={canDecide ? 'primary' : 'ghost'}
            onClick={() => setDecisionId(spec.decisions.find((d) => !d.answer || d.answer.kind === 'later' || !d.answer.value)?.id ?? null)}
            data-spec-decide-next=""
          >
            {canDecide ? 'Decide the next one' : 'Read the next one'}
          </CcButton>
        </div>
      ) : null}
      <div
        ref={rootRef}
        data-spec-fulltext-root={fullFilled ? 'on' : 'off'}
        className={cn('min-w-0', fullFilled && 'cc-spec-fullscreen')}
      >
        {fullFilled ? (
          <div className="cc-no-print sticky top-0 z-cc-sticky mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-cc-line bg-cc-page py-3">
            <p className="m-0 min-w-0 text-[15px] font-bold text-cc-ink [overflow-wrap:anywhere]">{spec.title}</p>
            <span className="flex flex-wrap items-center gap-3">
              <SaveLine save={save} mode={mode} onRetry={retry} />
              <span className="text-[12px] font-semibold text-cc-ink-muted max-sm:hidden">Esc or Back leaves full text</span>
              {fullToggle}
            </span>
          </div>
        ) : null}
        <div className={cn('grid min-w-0 gap-6 min-[1025px]:grid-cols-[220px_minmax(0,1fr)]', fullFilled && 'mx-auto max-w-[1180px]')}>
          <aside className="cc-no-print min-w-0 max-[1024px]:hidden">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto">{toc}</div>
          </aside>
          <div className={cn('min-w-0', fullFilled && 'max-w-[880px]')}>{document_}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div data-spec-workspace="" data-spec-state="ready" data-spec-mode={mode} className="flex min-w-0 flex-col gap-4">
      {mode === 'reader' ? (
        <CcMessageStrip state="information" headline="Read-only.">
          The owner of this project writes the specification. You can read it, open each decision and export it.
        </CcMessageStrip>
      ) : null}
      {owner && phone ? (
        <CcMessageStrip state="information" headline="Reading and deciding on a phone.">
          Editing the document needs a wider screen. Here you can read it and record decisions.
        </CcMessageStrip>
      ) : null}
      {stale ? (
        <CcMessageStrip
          state="warning"
          headline="Written for an earlier source."
          actions={
            owner && fresh ? (
              <CcButton variant="secondary" onClick={takeOverReading} data-spec-take-over="">
                Take over the current reading
              </CcButton>
            ) : undefined
          }
        >
          <span data-spec-stale="">
            The code changed after this specification was read from it.
            {drift
              ? ` In the current source the engine reads ${drift.added.length} requirement${drift.added.length === 1 ? '' : 's'} that ${drift.added.length === 1 ? 'is' : 'are'} not in the document, ${drift.gone.length} of the document's ${drift.gone.length === 1 ? 'is' : 'are'} no longer in the code, and ${drift.changed.length} moved to other lines.`
              : ' The engine is reading the current source to say what changed.'}
            {owner ? ' Taking it over adds the new ones, rejects the ones that are gone with the reason, and keeps your wording.' : ''}
          </span>
        </CcMessageStrip>
      ) : null}
      {save.state === 'conflict' ? (
        <CcMessageStrip state="error" headline="Not saved — changed elsewhere." announce actions={<CcButton onClick={() => window.location.reload()}>Reload</CcButton>}>
          The specification was saved in another tab or window after this page read it. Reload to continue on the newer revision; your last change here was not stored.
        </CcMessageStrip>
      ) : null}
      {save.state === 'failed' ? (
        <CcMessageStrip state="error" headline="Not saved" announce actions={<CcButton onClick={retry} data-spec-save-retry-strip="">Retry</CcButton>}>
          Your latest changes are not stored yet: {save.message}
        </CcMessageStrip>
      ) : null}

      <div data-spec-toolbar="" className="cc-no-print flex flex-wrap items-center justify-between gap-3 rounded-cc-card border border-cc-line bg-cc-surface px-3 py-2 shadow-cc">
        <span className="flex flex-wrap items-center gap-2">
          {/* One toggle at a time: in full text it stands in the bar over the document. */}
          {fullFilled ? null : fullToggle}
          {mode !== 'demo' ? (
            <>
              <CcButton variant="ghost" icon={<FileText size={16} aria-hidden={true} />} onClick={() => void download('docx')} data-spec-export="docx">
                Word
              </CcButton>
              <CcButton variant="ghost" icon={<Download size={16} aria-hidden={true} />} onClick={() => void download('md')} data-spec-export="md">
                Markdown
              </CcButton>
              <CcButton variant="ghost" icon={<BookOpenText size={16} aria-hidden={true} />} onClick={() => void download('html')} data-spec-export="html">
                Confluence
              </CcButton>
              <CcButton variant="ghost" icon={<Printer size={16} aria-hidden={true} />} onClick={() => window.print()} data-spec-export="print">
                Print / PDF
              </CcButton>
              <CcButton variant="ghost" icon={<History size={16} aria-hidden={true} />} onClick={() => setHistoryOpen(true)} data-spec-history="">
                History
              </CcButton>
            </>
          ) : (
            <span className="text-[12px] font-semibold text-cc-ink-muted">Exports and history are in your own projects.</span>
          )}
        </span>
        <span className="flex flex-col items-end gap-0">
          <SaveLine save={save} mode={mode} onRetry={retry} />
          <span className="text-[12px] font-semibold text-cc-ink-muted">Not part of the signed audit pack.</span>
        </span>
      </div>

      {engineReading ? (
        <CcTabs
          label="Requirements workspace"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'document', label: 'Specification', content: documentTab },
            { value: 'engine', label: 'What the engine read', content: <div data-spec-engine-reading="" className="flex min-w-0 flex-col gap-8">{engineReading}</div> },
          ]}
        />
      ) : (
        documentTab
      )}

      <DecisionDialog
        decision={openDecision}
        open={openDecision !== null}
        readOnly={!canDecide}
        onClose={() => setDecisionId(null)}
        onDecide={(answer, who) => {
          const id = decisionId;
          setDecisionId(null);
          if (!id) return;
          change((s) => answerDecision(s, id, answer, who), answer.kind === 'later' ? `Marked ${id} to decide later` : `Decided ${id}`);
          setToast(answer.kind === 'later' ? `${id} stays open.` : `${id} recorded.`);
        }}
      />

      <CcDialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a decision"
        lead="A question the specification has to answer before it is handed over."
        onSubmit={addDecision}
        actions={
          <>
            <CcButton variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </CcButton>
            <CcButton variant="primary" type="submit" data-spec-add-decision-submit="">
              Add
            </CcButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <CcTextarea label="Question" value={newQuestion} onChange={setNewQuestion} rows={3} maxLength={600} required />
          <CcSelect<DecisionOwner>
            label="Who decides"
            value={newOwner}
            onChange={setNewOwner}
            options={DECISION_OWNERS.map((o) => ({ value: o, label: DECISION_OWNER_LABEL[o] }))}
          />
        </div>
      </CcDialog>

      <CcDialog open={historyOpen} onClose={() => setHistoryOpen(false)} placement="side" title="Revision history" lead="Every save is a revision: who saved it, when, and what changed. Several saves of the same change in a row are one entry.">
        {meta.history.length ? (
          <ol data-spec-history-list="" className="m-0 flex list-none flex-col gap-2 p-0">
            {[...meta.history].reverse().map((h) => (
              <li key={`${h.revision}-${h.at}`} className="flex min-w-0 flex-col rounded-cc-row border border-cc-line px-3 py-2">
                <span className="text-[13px] font-semibold text-cc-ink">{h.change}</span>
                <span className="font-cc-mono text-[12px] text-cc-ink-muted">
                  r{h.revision} · {h.at.slice(0, 16).replace('T', ' ')} UTC · {h.by}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-[14px] text-cc-ink-muted">Nothing saved yet.</p>
        )}
      </CcDialog>

      <CcToast open={toast !== null} onDismiss={() => setToast(null)}>
        {toast}
      </CcToast>
    </div>
  );
}
