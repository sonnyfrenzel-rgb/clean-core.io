'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ClipboardCopy, Copy, FileDown, FileText, ListChecks, PenLine } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcFilterBar from '@/components/cc/FilterBar';
import CcSelect from '@/components/cc/Select';
import CcTabs from '@/components/cc/Tabs';
import CcToast from '@/components/cc/Toast';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { cn } from '@/lib/utils';
import { saveAs } from '@/lib/fileSaver';
import { CATEGORICAL_CHART_COLORS } from '@/lib/chart-colors';
import type {
  FunctionalRequirement,
  ObjectLevelInput,
  RequirementObject,
  RequirementPriority,
  RequirementSet,
  RequirementStep,
} from '@/lib/functional-requirements';
import type { RequirementWordingRecord, WordingDiscardReason } from '@/lib/requirement-wording';

/**
 * Functional requirements in the Design stage.
 *
 * Read from the code by the engine (`lib/functional-requirements.ts`) when the
 * reader asks for them, never on opening and never by a model: one requirement
 * per business rule, decision, early end and step that changes data, each with
 * its lines, acceptance criteria and a priority that says why. What the code
 * cannot answer is listed apart, "to be confirmed by the business".
 *
 * Three ways to read them — the list with filters, the traceability from
 * process step to requirement to SAP object, and the open questions — and
 * three ways out: copy as text (Markdown, with an HTML half so a paste into
 * Word keeps the tables), `.md` and `.docx`. Every way out carries the line
 * anchors and the provenance note.
 *
 * A model may propose clearer sentences (one call under the Design stage,
 * stored by `/api/projects/{id}/requirement-wording` after the server checked
 * each sentence against the anchors). The proposal is marked; the engine's
 * sentence stays beneath it.
 */

export interface FunctionalRequirementsProps {
  /** `null` in the demo: no map link, no stored wording, no model call. */
  projectId: string | null;
  projectName: string;
  fileName: string;
  /** The source the active run signed. `null` with `missingReason` when there is none. */
  source: string | null;
  missingReason: string | null;
  /** The findings with their clean core levels, when the server has answered. */
  levels: readonly ObjectLevelInput[] | null;
  /** The wording proposal: whether a model call can be made, and why not. Absent in the demo. */
  wording?: { enabled: boolean; reason: string | null } | null;
}

const PRIORITY_WORD: Record<RequirementPriority, string> = { must: 'Must', should: 'Should', could: 'Could' };
const PRIORITY_BAR: Record<RequirementPriority, string> = {
  must: CATEGORICAL_CHART_COLORS[0].bg,
  should: CATEGORICAL_CHART_COLORS[1].bg,
  could: CATEGORICAL_CHART_COLORS[2].bg,
};

const DISCARD_WORDS: Record<WordingDiscardReason, string> = {
  'unknown-id': 'named no requirement',
  'duplicate-id': 'repeated a requirement',
  'not-a-shall': 'was not a "shall" sentence',
  markup: 'carried formatting',
  'too-long': 'was too long',
  'number-not-in-code': 'stated a number the code does not contain',
  'no-anchor': 'cited no line',
  'anchor-not-in-source': 'cited a line that is not in the source',
  'anchor-not-of-requirement': 'cited a line outside the requirement',
  'not-json': 'was not readable',
};

const lineRef = (a: { lineStart: number; lineEnd: number }) => (a.lineEnd > a.lineStart ? `L${a.lineStart}-${a.lineEnd}` : `L${a.lineStart}`);

function PriorityChip({ value }: { value: RequirementPriority }) {
  return (
    <span
      data-fr-priority={value}
      className={cn(
        'inline-flex items-center rounded-[4px] border px-2 text-[12px] font-semibold leading-[18px] whitespace-nowrap',
        value === 'must' && 'border-cc-ink bg-cc-ink text-cc-surface',
        value === 'should' && 'border-cc-ink bg-cc-surface text-cc-ink',
        value === 'could' && 'border-dashed border-cc-field-border bg-cc-surface text-cc-ink-muted',
      )}
    >
      {PRIORITY_WORD[value]}
    </span>
  );
}

function ObjectChip({ o }: { o: RequirementObject }) {
  return (
    <span data-fr-object={o.name} className="inline-flex items-center gap-1 text-[12px] text-cc-ink">
      <span className="font-cc-mono">{o.name}</span>
      {o.custom ? (
        <span className="text-cc-ink-muted">customer object</span>
      ) : o.level ? (
        <CcCleanCoreLevel value={o.level} />
      ) : (
        <span className="text-cc-ink-muted">level not graded</span>
      )}
      <span className="text-cc-ink-muted">· {o.use}</span>
    </span>
  );
}

/** Must · Should · Could as one bar with its numbers written beside it. */
function PriorityBar({ counts, label }: { counts: Record<RequirementPriority, number>; label: string }) {
  const total = counts.must + counts.should + counts.could;
  if (!total) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div role="img" aria-label={`${label}: ${counts.must} Must, ${counts.should} Should, ${counts.could} Could`} className="flex h-2.5 w-full overflow-hidden rounded-full bg-cc-surface-muted">
        {(['must', 'should', 'could'] as const).map((p) =>
          counts[p] ? <span key={p} className={cn('h-full', PRIORITY_BAR[p])} style={{ width: `${(counts[p] / total) * 100}%` }} /> : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-cc-ink-muted">
        {(['must', 'should', 'could'] as const).map((p) => (
          <span key={p} className="inline-flex items-center gap-1">
            <i aria-hidden="true" className={cn('inline-block h-2 w-2 rounded-[2px]', PRIORITY_BAR[p])} />
            {PRIORITY_WORD[p]} <b className="font-semibold text-cc-ink">{counts[p]}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function countsOf(list: readonly FunctionalRequirement[]): Record<RequirementPriority, number> {
  return {
    must: list.filter((r) => r.priority === 'must').length,
    should: list.filter((r) => r.priority === 'should').length,
    could: list.filter((r) => r.priority === 'could').length,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* a private window keeps no flag; the button is still there */
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { getAuth } = await import('@/lib/firebase');
  const user = getAuth().currentUser;
  return user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {};
}

export default function FunctionalRequirements({ projectId, projectName, fileName, source, missingReason, levels, wording }: FunctionalRequirementsProps) {
  const flagKey = projectId ? `cc-fr-derived-${projectId}` : null;
  const [set, setSet] = useState<RequirementSet | null>(null);
  const [state, setState] = useState<'idle' | 'deriving' | 'ready' | 'failed'>('idle');
  const [record, setRecord] = useState<RequirementWordingRecord | null>(null);
  const [wordingBusy, setWordingBusy] = useState(false);
  const [wordingNote, setWordingNote] = useState<string | null>(null);
  const [tab, setTab] = useState<'list' | 'trace' | 'open'>('list');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState<'all' | RequirementPriority>('all');
  const [step, setStep] = useState<string>('all');
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);

  const derive = useCallback(async () => {
    if (!source) return;
    setState('deriving');
    try {
      const lib = await import('@/lib/functional-requirements');
      // Let the "reading" state paint before the engine takes the thread.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const built = lib.buildRequirementSet({ source, levels });
      setSet(built);
      setState('ready');
      if (flagKey) writeFlag(flagKey);
    } catch (err) {
      console.error('[Design] Functional requirements could not be read:', err);
      setState('failed');
    }
  }, [source, levels, flagKey]);

  // A reader who asked once gets them again on the next visit — still read
  // from the code, still without a model.
  useEffect(() => {
    if (!flagKey || !source || state !== 'idle') return;
    if (!readFlag(flagKey)) return;
    const timer = setTimeout(() => void derive(), 0);
    return () => clearTimeout(timer);
  }, [flagKey, source, state, derive]);

  // New levels after the findings route answered: read again so the objects carry them.
  useEffect(() => {
    if (state !== 'ready' || !levels || !source) return;
    let cancelled = false;
    (async () => {
      const lib = await import('@/lib/functional-requirements');
      if (!cancelled) setSet(lib.buildRequirementSet({ source, levels }));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only when the levels arrive, not on every render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  // The stored wording proposal, applied only to the source it was made for.
  useEffect(() => {
    if (!projectId || state !== 'ready') return;
    let cancelled = false;
    (async () => {
      const [lib, headers] = await Promise.all([import('@/lib/requirement-wording'), authHeader()]);
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/requirement-wording`, { headers });
      if (!res.ok) return;
      const body = (await res.json()) as { record?: unknown };
      if (!cancelled && lib.isRequirementWordingRecord(body.record)) setRecord(body.record);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, state]);

  const wordingMap = useMemo(
    () => (record && set && record.digest === set.sourceSha256 ? record.wording : null),
    [record, set],
  );

  const requestWording = async () => {
    if (!projectId || !set || !source) return;
    setWordingBusy(true);
    setWordingNote(null);
    try {
      const [lib, gemini, constants] = await Promise.all([
        import('@/lib/requirement-wording'),
        import('@/lib/gemini'),
        import('@/lib/constants'),
      ]);
      const { text, receipt } = await gemini.callGeminiWithReceipt(lib.wordingPrompt(set), constants.PRODUCT_GEMINI_MODEL, true, lib.WORDING_STAGE);
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/requirement-wording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ digest: set.sourceSha256, text, receipt }),
      });
      const body = (await res.json().catch(() => ({}))) as { record?: unknown; error?: string };
      if (!res.ok || !lib.isRequirementWordingRecord(body.record)) {
        setWordingNote(body.error || 'The wording proposal could not be stored. Nothing changed.');
        return;
      }
      setRecord(body.record);
      const kept = Object.keys(body.record.wording).length;
      const dropped = body.record.discarded.length;
      setWordingNote(`${kept} of ${set.requirements.length} sentences reworded${dropped ? `; ${dropped} proposal${dropped === 1 ? '' : 's'} dropped by the check` : ''}.`);
    } catch (err) {
      setWordingNote(err instanceof Error && err.message ? err.message : 'The model did not answer. Nothing changed.');
    } finally {
      setWordingBusy(false);
    }
  };

  const filtered = useMemo(() => {
    if (!set) return [];
    const needle = search.trim().toLowerCase();
    return set.requirements.filter((r) => {
      if (priority !== 'all' && r.priority !== priority) return false;
      if (step !== 'all' && (r.stepId ?? 'program') !== step) return false;
      if (!needle) return true;
      const hay = `${r.id} ${wordingMap?.[r.id] ?? ''} ${r.statement} ${r.rationale} ${r.objects.map((o) => o.name).join(' ')}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [set, search, priority, step, wordingMap]);

  const meta = () => ({ projectName, fileName, date: today(), wording: wordingMap });

  const copyAll = async () => {
    if (!set) return;
    const ex = await import('@/lib/requirements-export');
    const markdown = ex.requirementsMarkdown(set, meta());
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([markdown], { type: 'text/plain' }),
            'text/html': new Blob([ex.requirementsHtml(set, meta())], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(markdown);
      }
      setToast(`Copied ${set.requirements.length} requirements as text.`);
    } catch {
      setToast(null);
      setWordingNote('The browser refused the clipboard. Download the .md file instead.');
    }
  };

  const copyOne = async (r: FunctionalRequirement) => {
    if (!set) return;
    const ex = await import('@/lib/requirements-export');
    try {
      await navigator.clipboard.writeText(ex.requirementText(set, r, { wording: wordingMap }));
      setToast(`Copied ${r.id}.`);
    } catch {
      setWordingNote('The browser refused the clipboard.');
    }
  };

  const download = async (kind: 'md' | 'docx') => {
    if (!set) return;
    const ex = await import('@/lib/requirements-export');
    const blob = kind === 'md'
      ? new Blob([ex.requirementsMarkdown(set, meta())], { type: 'text/markdown;charset=utf-8' })
      : await ex.requirementsDocx(set, meta());
    await saveAs(blob, ex.requirementsFileName(projectName || fileName, kind));
    setToast(kind === 'md' ? 'Markdown file downloaded.' : 'Word file downloaded.');
  };

  const toggleRow = (id: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stepById = useMemo(() => new Map((set?.steps ?? []).map((s) => [s.id, s])), [set]);

  /* ---------------- before the requirements are read ---------------- */
  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="fr-title" className="m-0 cc-text-h2 text-cc-ink">Functional requirements</h2>
        <CcProvenanceChip value="reconstructed" />
      </div>
      <p className="m-0 max-w-3xl text-[14px] leading-relaxed text-cc-ink-muted">
        What the code requires, as numbered requirements: one per business rule, decision, early end and step that
        changes data, each with its lines, acceptance criteria and a priority that says why.
      </p>
    </div>
  );

  if (!set) {
    return (
      <section aria-labelledby="fr-title" data-functional-requirements="" data-fr-state={source ? state : 'blocked'} className="flex flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-6">
        {header}
        {!source ? (
          <CcMessageStrip state="information" headline="Not available yet.">
            {missingReason ?? 'The requirements are read from the source the active run signed.'}
          </CcMessageStrip>
        ) : state === 'failed' ? (
          <CcMessageStrip state="error" headline="The requirements could not be read from this source." announce>
            Nothing was stored. Try again; if it fails again, the source has a construct the engine does not read yet.
          </CcMessageStrip>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <CcButton
            variant="primary"
            density="cozy"
            icon={<ListChecks size={16} aria-hidden={true} />}
            busy={state === 'deriving'}
            disabled={!source}
            data-fr-derive=""
            onClick={() => void derive()}
          >
            {state === 'deriving' ? 'Reading the code…' : 'Derive requirements'}
          </CcButton>
          <span data-fr-cost="" className="text-[13px] text-cc-ink-muted">
            Read from the code by the engine — no model call, no cost.
          </span>
        </div>
      </section>
    );
  }

  /* ---------------- the requirements ---------------- */
  const all = countsOf(set.requirements);
  const stepOptions = [
    { value: 'all', label: 'All steps' },
    ...(set.requirements.some((r) => !r.stepId) ? [{ value: 'program', label: 'Program-wide' }] : []),
    ...set.steps.filter((s) => s.requirementIds.length).map((s) => ({ value: s.id, label: `${s.number}. ${s.label}` })),
  ];
  const filterActive = Boolean(search) || priority !== 'all' || step !== 'all';

  const listTab = (
    <div className="flex flex-col gap-3">
      <CcFilterBar
        noun="requirements"
        shown={filtered.length}
        total={set.requirements.length}
        search={search}
        onSearch={setSearch}
        active={filterActive}
        onClear={() => {
          setSearch('');
          setPriority('all');
          setStep('all');
        }}
      >
        <CcSelect
          label="Priority"
          value={priority}
          onChange={(v) => setPriority(v)}
          options={[
            { value: 'all', label: 'All priorities' },
            { value: 'must', label: `Must (${all.must})` },
            { value: 'should', label: `Should (${all.should})` },
            { value: 'could', label: `Could (${all.could})` },
          ]}
        />
        <CcSelect label="Process step" value={step} onChange={(v) => setStep(v)} options={stepOptions} />
      </CcFilterBar>

      {filtered.length === 0 ? (
        <p className="m-0 rounded-cc-card border border-dashed border-cc-field-border p-4 text-[14px] text-cc-ink-muted">
          No requirements match these filters.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {filtered.map((r) => {
            const open = openRows.has(r.id);
            const proposed = wordingMap?.[r.id];
            const s = r.stepId ? stepById.get(r.stepId) : null;
            return (
              <li key={r.id} data-fr-row={r.id} data-fr-row-priority={r.priority} className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface">
                <div className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4 sm:p-4">
                  <div className="flex shrink-0 items-center gap-2 sm:w-[118px] sm:flex-col sm:items-start sm:gap-2">
                    <span data-fr-id="" className="font-cc-mono text-[13px] font-semibold text-cc-ink">{r.id}</span>
                    <PriorityChip value={r.priority} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p data-fr-statement="" className="m-0 text-[15px] font-semibold leading-snug text-cc-ink [overflow-wrap:anywhere]">
                      {proposed ?? r.statement}
                    </p>
                    {proposed ? (
                      <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-cc-ink-muted [overflow-wrap:anywhere]">
                        <CcProvenanceChip value="proposed" note="wording" />
                        <span>Engine wording: {r.statement}</span>
                      </p>
                    ) : null}
                    <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-cc-ink-muted">
                      <span>{s ? `${s.number}. ${s.label}` : 'Program-wide'}</span>
                      <span data-fr-anchors="" className="font-cc-mono text-cc-ink">{r.anchors.map(lineRef).join(', ')}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <CcButton variant="ghost" icon={<Copy size={14} aria-hidden={true} />} data-fr-copy-one={r.id} aria-label={`Copy ${r.id}`} onClick={() => void copyOne(r)}>
                      Copy
                    </CcButton>
                    <CcButton
                      variant="ghost"
                      icon={open ? <ChevronDown size={14} aria-hidden={true} /> : <ChevronRight size={14} aria-hidden={true} />}
                      aria-expanded={open}
                      aria-controls={`fr-detail-${r.id}`}
                      data-fr-details-toggle=""
                      onClick={() => toggleRow(r.id)}
                    >
                      Details
                    </CcButton>
                  </div>
                </div>
                {open ? (
                  <div id={`fr-detail-${r.id}`} data-fr-detail="" className="flex min-w-0 flex-col gap-4 border-t border-cc-line px-3 py-3 sm:px-4 sm:pl-[152px]">
                    <dl className="m-0 grid min-w-0 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)]">
                      <dt className="font-semibold text-cc-ink">Rationale</dt>
                      <dd className="m-0 text-cc-ink [overflow-wrap:anywhere]">{r.rationale}</dd>
                      <dt className="font-semibold text-cc-ink">Why {PRIORITY_WORD[r.priority]}</dt>
                      <dd className="m-0 text-cc-ink [overflow-wrap:anywhere]">{r.priorityReason}</dd>
                      <dt className="font-semibold text-cc-ink">SAP objects</dt>
                      <dd className="m-0 flex flex-wrap gap-x-3 gap-y-1">
                        {r.objects.length ? r.objects.map((o) => <ObjectChip key={`${o.name}-${o.use}`} o={o} />) : <span className="text-cc-ink-muted">None named at these lines.</span>}
                      </dd>
                      <dt className="font-semibold text-cc-ink">Provenance</dt>
                      <dd className="m-0 flex flex-wrap items-center gap-2 text-cc-ink">
                        <CcProvenanceChip value="reconstructed" />
                        <span className="text-cc-ink-muted">Read from the code by the engine{proposed ? '; the sentence above is a model proposal, checked against these lines' : ''}.</span>
                      </dd>
                    </dl>
                    <div className="min-w-0">
                      <h4 className="m-0 mb-2 text-[13px] font-semibold text-cc-ink">Acceptance criteria</h4>
                      <ol className="m-0 flex list-none flex-col gap-2 p-0">
                        {r.acceptance.map((c, i) => (
                          <li key={i} data-fr-criterion="" className="grid min-w-0 gap-1 rounded-cc-row bg-cc-surface-muted px-3 py-2 text-[13px] sm:grid-cols-3 sm:gap-3">
                            <span className="[overflow-wrap:anywhere]"><b className="font-semibold">Given</b> {c.given}</span>
                            <span className="[overflow-wrap:anywhere]"><b className="font-semibold">When</b> {c.when}</span>
                            <span className="[overflow-wrap:anywhere]"><b className="font-semibold">Then</b> {c.then}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="min-w-0">
                      <h4 className="m-0 mb-2 text-[13px] font-semibold text-cc-ink">In the code</h4>
                      <div className="flex flex-col gap-2">
                        {r.anchors.slice(0, 4).map((a) => (
                          <pre key={lineRef(a)} className="m-0 overflow-x-auto rounded-cc-row bg-cc-surface-muted px-3 py-2 font-cc-mono text-[12px] leading-relaxed text-cc-ink">
                            <span className="text-cc-ink-muted">{lineRef(a)}  </span>
                            {a.quote}
                          </pre>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  const traceRows = set.steps.filter((s) => s.requirementIds.length);
  const traceTab = (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-cc-ink-muted">
        Process step → requirements → SAP objects, in the order the process runs.
        {set.steps.length > traceRows.length ? ` ${set.steps.length - traceRows.length} further steps carry no requirement of their own.` : ''}
      </p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {traceRows.map((s: RequirementStep) => {
          const reqs = set.requirements.filter((r) => r.stepId === s.id);
          return (
            <li key={s.id} data-fr-trace-step={s.id} className="grid min-w-0 gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[14px] font-semibold text-cc-ink [overflow-wrap:anywhere]">{s.number}. {s.label}</span>
                <span className="font-cc-mono text-[12px] text-cc-ink-muted [overflow-wrap:anywhere]">{s.routine}{s.anchor ? ` · ${lineRef(s.anchor)}` : ''}</span>
                {projectId && s.nodeId ? (
                  <Link
                    href={`/project/${encodeURIComponent(projectId)}/documentation#node=${encodeURIComponent(s.nodeId)}`}
                    className="text-[12px] font-semibold text-cc-information underline-offset-2 hover:underline"
                  >
                    Open in the process map
                  </Link>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <PriorityBar counts={countsOf(reqs)} label={`${s.label}`} />
                <div className="flex flex-wrap gap-2">
                  {reqs.map((r) => (
                    <CcButton
                      key={r.id}
                      variant="ghost"
                      data-fr-trace-link={r.id}
                      aria-label={`Open ${r.id} in the list`}
                      onClick={() => {
                        setStep(s.id);
                        setPriority('all');
                        setSearch('');
                        setOpenRows(new Set([r.id]));
                        setTab('list');
                      }}
                    >
                      <span className="font-cc-mono">{r.id}</span>
                    </CcButton>
                  ))}
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap content-start gap-x-3 gap-y-1">
                {s.objects.length ? s.objects.map((o) => <ObjectChip key={`${o.name}-${o.use}`} o={o} />) : <span className="text-[12px] text-cc-ink-muted">No table or call named in this step.</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );

  const openTab = (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-cc-ink-muted">
        The code cannot answer these. They are questions for the business, not requirements found in the code.
      </p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {set.open.map((o) => (
          <li key={o.id} data-fr-open={o.id} className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-dashed border-cc-field-border bg-cc-surface p-3 sm:p-4">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-cc-mono text-[13px] font-semibold text-cc-ink">{o.id}</span>
              <CcProvenanceChip value="not-determined" />
            </span>
            <p className="m-0 text-[14px] font-semibold text-cc-ink [overflow-wrap:anywhere]">{o.question}</p>
            <p className="m-0 text-[13px] text-cc-ink-muted [overflow-wrap:anywhere]">
              {o.why}
              {o.anchors.length ? <span className="ml-1 font-cc-mono text-cc-ink">{o.anchors.map(lineRef).join(', ')}</span> : null}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );

  const discarded = record && wordingMap ? record.discarded : [];
  return (
    <section aria-labelledby="fr-title" data-functional-requirements="" data-fr-state="ready" className="flex min-w-0 flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-6">
      {header}

      <div className="grid min-w-0 gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] min-[900px]:items-center">
        <dl className="m-0 grid grid-cols-2 gap-3 min-[560px]:grid-cols-4">
          {[
            ['Requirements', set.counts.total],
            ['Process steps', set.counts.steps],
            ['Must', all.must],
            ['To confirm', set.counts.open],
          ].map(([k, v]) => (
            <div key={k} data-fr-kpi={k} className="flex flex-col rounded-cc-row border border-cc-line px-3 py-2">
              <dt className="text-[12px] text-cc-ink-muted">{k}</dt>
              <dd className="m-0 text-[22px] font-bold leading-tight text-cc-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <PriorityBar counts={all} label="All requirements" />
      </div>

      <div className="flex flex-col gap-2 rounded-cc-row bg-cc-surface-muted px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <CcButton variant="secondary" icon={<ClipboardCopy size={16} aria-hidden={true} />} data-fr-copy-all="" onClick={() => void copyAll()}>
            Copy as text
          </CcButton>
          <CcButton variant="ghost" icon={<FileText size={16} aria-hidden={true} />} data-fr-download="md" onClick={() => void download('md')}>
            Download .md
          </CcButton>
          <CcButton variant="ghost" icon={<FileDown size={16} aria-hidden={true} />} data-fr-download="docx" onClick={() => void download('docx')}>
            Download .docx
          </CcButton>
          {wording ? (
            <CcButton
              variant="ghost"
              icon={<PenLine size={16} aria-hidden={true} />}
              busy={wordingBusy}
              disabled={!wording.enabled}
              data-fr-wording=""
              onClick={() => void requestWording()}
            >
              {wordingMap ? 'Propose wording again' : 'Propose clearer wording'}
            </CcButton>
          ) : null}
        </div>
        <p data-fr-wording-cost="" className="m-0 text-[12px] text-cc-ink-muted">
          Copy and downloads carry every requirement with its lines and the provenance note.{' '}
          {wording
            ? wording.enabled
              ? 'Clearer wording is one model call under the Design stage, on your quota or key; the server checks every sentence against its lines, and the engine wording stays beside it.'
              : `Clearer wording needs a model call: ${wording.reason ?? 'not available for this account.'}`
            : 'The demo calls no model; every sentence here is the engine’s.'}
        </p>
        {wordingNote ? (
          <p role="status" data-fr-wording-note="" className="m-0 text-[12px] font-semibold text-cc-ink">{wordingNote}</p>
        ) : null}
        {wordingMap && discarded.length ? (
          <p className="m-0 text-[12px] text-cc-ink-muted">
            Dropped by the server’s check: {discarded.slice(0, 6).map((d) => `${d.id ?? 'answer'} ${DISCARD_WORDS[d.reason]}`).join('; ')}
            {discarded.length > 6 ? `; ${discarded.length - 6} more` : ''}.
          </p>
        ) : null}
      </div>

      <CcTabs
        label="Functional requirements"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'list', label: 'Requirements', count: set.requirements.length, content: listTab },
          { value: 'trace', label: 'Traceability', count: traceRows.length, content: traceTab },
          { value: 'open', label: 'To be confirmed', count: set.open.length, content: openTab },
        ]}
      />
      <CcToast open={toast !== null} onDismiss={() => setToast(null)}>
        {toast}
      </CcToast>
    </section>
  );
}
