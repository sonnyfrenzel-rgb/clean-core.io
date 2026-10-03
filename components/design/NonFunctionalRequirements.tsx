'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CircleHelp, ClipboardCopy, Code2, Copy, FileDown, FileText, ListChecks, Minus } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSelect from '@/components/cc/Select';
import CcTabs from '@/components/cc/Tabs';
import CcToast from '@/components/cc/Toast';
import { cn } from '@/lib/utils';
import { saveAs } from '@/lib/fileSaver';
import type { ObjectLevelInput, RequirementPriority } from '@/lib/functional-requirements';
import {
  NFR_CATEGORIES,
  NFR_CATEGORY_LABEL,
  NFR_MODEL_KEY,
  NFR_OWNER_LABEL,
  NFR_SIGNAL_LABEL,
  proposalReferences,
  type NFRData,
  type NfrCategory,
  type NfrCategoryStatus,
  type NfrCategorySummary,
  type NfrQuestion,
  type NfrSet,
  type NonFunctionalRequirement,
} from '@/lib/non-functional-requirements';
import type { NfrProposalExport } from '@/lib/requirements-export';

export type { NFRData } from '@/lib/non-functional-requirements';

/**
 * Non-functional requirements in the Design stage (owner 03.10.2026: "no
 * longer AI slop, with the right visualisations and clear language, copy
 * options").
 *
 * Read from the code by the engine (`lib/non-functional-requirements.ts`)
 * when the reader asks, never by a model and never on opening: authorization
 * checks, records with a date and a user, error messages, commit and rollback,
 * customer tables, SELECT patterns, what the program changes and calls
 * remotely — each as `NFR-nn` with its lines. What the code cannot know is a
 * question `TBD-nn` for the business or IT operations, apart from the
 * requirements.
 *
 * At the top, the eight categories at a glance: where the code gives evidence,
 * where only a decision can, and where the code is silent. The design model's
 * text for a category, where one was written with the design, sits folded
 * under that category as a *Model proposal* — never in place of what the
 * code says.
 */

export interface NonFunctionalRequirementsProps {
  /** `null` in the demo. */
  projectId: string | null;
  projectName: string;
  fileName: string;
  /** The source the active run signed. `null` with `missingReason` when there is none. */
  source: string | null;
  missingReason: string | null;
  /** The design model's text per topic, stored with the design. */
  proposals?: NFRData | null;
  /** Clean core levels, for the functional half of the combined specification. */
  levels?: readonly ObjectLevelInput[] | null;
}

const PRIORITY_WORD: Record<RequirementPriority, string> = { must: 'Must', should: 'Should', could: 'Could' };

const STATUS_LOOK: Record<NfrCategoryStatus, { word: string; edge: string; icon: typeof Code2; ink: string }> = {
  grounded: { word: 'Grounded in the code', edge: 'border-l-cc-information', icon: Code2, ink: 'text-cc-information' },
  decision: { word: 'Needs a decision', edge: 'border-l-cc-warning-line', icon: CircleHelp, ink: 'text-cc-warning' },
  none: { word: 'Nothing found in the code', edge: 'border-l-cc-field-border', icon: Minus, ink: 'text-cc-ink-muted' },
};

const lineRef = (a: { lineStart: number; lineEnd: number }) => (a.lineEnd > a.lineStart ? `L${a.lineStart}-${a.lineEnd}` : `L${a.lineStart}`);

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

function PriorityChip({ value }: { value: RequirementPriority }) {
  return (
    <span
      data-nfr-priority={value}
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

function OwnerTag({ owner }: { owner: NfrQuestion['owner'] }) {
  return (
    <span data-nfr-owner={owner} className="inline-flex items-center rounded-[4px] border border-cc-line bg-cc-surface-muted px-2 text-[12px] font-semibold leading-[18px] text-cc-ink">
      {NFR_OWNER_LABEL[owner]}
    </span>
  );
}

/** The two lines of a tile: what the code gives, and what is left to decide. */
function tileLines(c: NfrCategorySummary): [string, string] {
  return [
    c.grounded ? `${c.grounded} grounded in the code` : 'Nothing found in the code',
    c.questions ? `${c.questions} need${c.questions === 1 ? 's' : ''} a decision` : 'Nothing to decide',
  ];
}

export default function NonFunctionalRequirements({ projectId, projectName, fileName, source, missingReason, proposals, levels }: NonFunctionalRequirementsProps) {
  const flagKey = projectId ? `cc-nfr-derived-${projectId}` : null;
  const [set, setSet] = useState<NfrSet | null>(null);
  const [state, setState] = useState<'idle' | 'deriving' | 'ready' | 'failed'>('idle');
  const [tab, setTab] = useState<'list' | 'questions'>('list');
  const [category, setCategory] = useState<'all' | NfrCategory>('all');
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const derive = useCallback(async () => {
    if (!source) return;
    setState('deriving');
    try {
      const lib = await import('@/lib/non-functional-requirements');
      // Let the "reading" state paint before the engine takes the thread.
      await new Promise((resolve) => setTimeout(resolve, 0));
      setSet(lib.buildNfrSet({ source }));
      setState('ready');
      if (flagKey) writeFlag(flagKey);
    } catch (err) {
      console.error('[Design] Non-functional requirements could not be read:', err);
      setState('failed');
    }
  }, [source, flagKey]);

  // A reader who asked once gets them again on the next visit — still read
  // from the code, still without a model.
  useEffect(() => {
    if (!flagKey || !source || state !== 'idle') return;
    if (!readFlag(flagKey)) return;
    const timer = setTimeout(() => void derive(), 0);
    return () => clearTimeout(timer);
  }, [flagKey, source, state, derive]);

  // A changed source is read again; the shown set never describes another text.
  useEffect(() => {
    if (state !== 'ready' || !source || !set) return;
    let cancelled = false;
    (async () => {
      const [lib, digest] = await Promise.all([import('@/lib/non-functional-requirements'), import('@/lib/artefact-digest')]);
      if (cancelled || digest.sha256Hex(source.replace(/^﻿/, '').replace(/\r\n?/g, '\n')) === set.sourceSha256) return;
      setSet(lib.buildNfrSet({ source }));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state, source, set]);

  /** The model's text per category, with what of this program it names. */
  const modelProposals = useMemo(() => {
    const out: Partial<Record<NfrCategory, NfrProposalExport>> = {};
    if (!proposals || !source) return out;
    const ids = set?.questions.map((x) => x.id) ?? [];
    for (const c of NFR_CATEGORIES) {
      const text = proposals[NFR_MODEL_KEY[c]];
      if (typeof text !== 'string' || !text.trim()) continue;
      out[c] = { text: text.trim(), references: proposalReferences(text, source, [...ids, ...(set?.requirements.map((r) => r.id) ?? [])]) };
    }
    return out;
  }, [proposals, source, set]);
  const proposalCount = Object.keys(modelProposals).length;

  const meta = () => ({ projectName, fileName, date: today(), proposals: modelProposals });

  const writeClipboard = async (markdown: string, html: string | null, done: string) => {
    try {
      if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([markdown], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(markdown);
      }
      setNote(null);
      setToast(done);
    } catch {
      setToast(null);
      setNote('The browser refused the clipboard. Download the .md file instead.');
    }
  };

  const copyAll = async () => {
    if (!set) return;
    const ex = await import('@/lib/requirements-export');
    await writeClipboard(ex.nfrMarkdown(set, meta()), ex.nfrHtml(set, meta()), `Copied ${set.requirements.length} requirements and ${set.questions.length} questions as text.`);
  };

  const copyOne = async (r: NonFunctionalRequirement) => {
    const ex = await import('@/lib/requirements-export');
    await writeClipboard(ex.nfrText(r), null, `Copied ${r.id}.`);
  };

  const copyQuestion = async (qn: NfrQuestion) => {
    const ex = await import('@/lib/requirements-export');
    await writeClipboard(ex.nfrQuestionText(qn), null, `Copied ${qn.id}.`);
  };

  const download = async (kind: 'md' | 'docx') => {
    if (!set) return;
    const ex = await import('@/lib/requirements-export');
    const blob = kind === 'md'
      ? new Blob([ex.nfrMarkdown(set, meta())], { type: 'text/markdown;charset=utf-8' })
      : await ex.nfrDocx(set, meta());
    await saveAs(blob, ex.exportFileName(projectName || fileName, 'non-functional', kind));
    setToast(kind === 'md' ? 'Markdown file downloaded.' : 'Word file downloaded.');
  };

  /** Functional and non-functional together, read from the same source. */
  const specification = async (kind: 'copy' | 'md' | 'docx') => {
    if (!set || !source) return;
    const [ex, fr] = await Promise.all([import('@/lib/requirements-export'), import('@/lib/functional-requirements')]);
    const functional = fr.buildRequirementSet({ source, levels: levels ?? null });
    const m = { ...meta(), wording: null };
    if (kind === 'copy') {
      await writeClipboard(ex.specificationMarkdown(functional, set, m), ex.specificationHtml(functional, set, m), `Copied the specification: ${functional.requirements.length} functional and ${set.requirements.length} non-functional requirements.`);
      return;
    }
    const blob = kind === 'md'
      ? new Blob([ex.specificationMarkdown(functional, set, m)], { type: 'text/markdown;charset=utf-8' })
      : await ex.specificationDocx(functional, set, m);
    await saveAs(blob, ex.exportFileName(projectName || fileName, 'specification', kind));
    setToast(kind === 'md' ? 'Specification downloaded as Markdown.' : 'Specification downloaded as Word file.');
  };

  const toggleRow = (id: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="nfr-title" className="m-0 cc-text-h2 text-cc-ink">Non-functional requirements</h2>
        <CcProvenanceChip value="reconstructed" />
      </div>
      <p className="m-0 max-w-3xl text-[14px] leading-relaxed text-cc-ink-muted">
        What the code says about authorization, records, errors, data, operations and the switch-over — each with the lines
        it says it in. What the code cannot say is a question for the business or IT operations, listed apart.
      </p>
    </div>
  );

  /* ---------------- before the requirements are read ---------------- */
  if (!set) {
    return (
      <section aria-labelledby="nfr-title" data-non-functional-requirements="" data-nfr-state={source ? state : 'blocked'} className="flex flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-6">
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
            data-nfr-derive=""
            onClick={() => void derive()}
          >
            {state === 'deriving' ? 'Reading the code…' : 'Derive non-functional requirements'}
          </CcButton>
          <span data-nfr-cost="" className="text-[13px] text-cc-ink-muted">
            Read from the code by the engine — no model call, no cost.
          </span>
        </div>
        {proposalCount ? (
          <p className="m-0 text-[13px] text-cc-ink-muted">
            The design model wrote proposals for {proposalCount} of these topics with the design. They are shown beside what
            the code says, marked as model proposals.
          </p>
        ) : null}
      </section>
    );
  }

  /* ---------------- the requirements ---------------- */
  const shownCategories = category === 'all' ? NFR_CATEGORIES : [category];

  const overview = (
    <div className="flex min-w-0 flex-col gap-2">
      <ul data-nfr-overview="" className="m-0 grid min-w-0 list-none grid-cols-1 gap-2 p-0 min-[420px]:grid-cols-2 min-[900px]:grid-cols-4">
        {set.categories.map((c) => {
          const look = STATUS_LOOK[c.status];
          const Icon = look.icon;
          const [first, second] = tileLines(c);
          const active = category === c.category;
          return (
            <li
              key={c.category}
              className={cn(
                'min-w-0 rounded-cc-row border border-l-4 bg-cc-surface hover:border-cc-ink',
                look.edge,
                active ? 'border-cc-ink' : 'border-cc-line',
              )}
            >
              <button
                type="button"
                data-nfr-tile={c.category}
                data-nfr-tile-status={c.status}
                data-nfr-tile-grounded={c.grounded}
                data-nfr-tile-questions={c.questions}
                aria-pressed={active}
                onClick={() => {
                  setCategory(active ? 'all' : c.category);
                  setTab(c.grounded || !c.questions ? 'list' : 'questions');
                }}
                className="flex h-full w-full min-w-0 flex-col gap-1 rounded-cc-row px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
              >
                <span className="flex min-w-0 items-start gap-2">
                  <Icon size={16} aria-hidden={true} className={cn('mt-0.5 shrink-0', look.ink)} />
                  <span className="min-w-0 text-[14px] font-semibold leading-snug text-cc-ink [overflow-wrap:anywhere]">{c.label}</span>
                </span>
                <span data-nfr-tile-grounded-text="" className={cn('text-[13px] font-semibold', c.grounded ? 'text-cc-ink' : 'text-cc-ink-muted')}>{first}</span>
                <span data-nfr-tile-questions-text="" className="text-[12px] text-cc-ink-muted">{second}</span>
                <span className="sr-only">{look.word}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p data-nfr-legend="" className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-cc-ink-muted">
        {(['grounded', 'decision', 'none'] as const).map((s) => {
          const Icon = STATUS_LOOK[s].icon;
          return (
            <span key={s} className="inline-flex items-center gap-1">
              <Icon size={14} aria-hidden={true} className={STATUS_LOOK[s].ink} />
              <b className="font-semibold text-cc-ink">{STATUS_LOOK[s].word}</b>
              {s === 'grounded' ? '— with lines' : s === 'decision' ? '— only questions, no requirement' : '— no signal, no question'}
            </span>
          );
        })}
      </p>
    </div>
  );

  const categoryFilter = (
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      <div className="min-w-0 max-w-full">
        <CcSelect
          label="Category"
          value={category}
          onChange={(v) => setCategory(v)}
          options={[
            { value: 'all', label: 'All categories' },
            ...set.categories.map((c) => ({ value: c.category, label: `${c.label} (${c.grounded} · ${c.questions} to decide)` })),
          ]}
        />
      </div>
      {category !== 'all' ? (
        <CcButton variant="ghost" data-nfr-show-all="" onClick={() => setCategory('all')}>
          Show all categories
        </CcButton>
      ) : null}
    </div>
  );

  const proposalFor = (c: NfrCategory) => {
    const p = modelProposals[c];
    if (!p) return null;
    const generic = p.references.length === 0;
    return (
      <div data-nfr-proposal={c} data-nfr-proposal-generic={generic ? 'true' : 'false'} className="rounded-cc-row border border-dashed border-cc-field-border px-3">
        <CcDisclosure
          title="Model proposal"
          level={4}
          summary={generic ? 'Generic — names nothing from this program' : `Names ${p.references.slice(0, 5).join(', ')}`}
        >
          <div className="flex min-w-0 flex-col gap-2 pb-3">
            <span>
              <CcProvenanceChip value="proposed" />
            </span>
            <p className="m-0 whitespace-pre-wrap text-[13px] text-cc-ink [overflow-wrap:anywhere]">{p.text}</p>
            <p className="m-0 text-[12px] text-cc-ink-muted">
              Written by the design model with the solution design. Not checked against the code; the requirements above are.
            </p>
          </div>
        </CcDisclosure>
      </div>
    );
  };

  const row = (r: NonFunctionalRequirement) => {
    const open = openRows.has(r.id);
    return (
      <li key={r.id} data-nfr-row={r.id} data-nfr-row-category={r.category} className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface">
        <div className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4 sm:p-4">
          <div className="flex shrink-0 items-center gap-2 sm:w-[96px] sm:flex-col sm:items-start sm:gap-2">
            <span data-nfr-id="" className="font-cc-mono text-[13px] font-semibold text-cc-ink">{r.id}</span>
            <PriorityChip value={r.priority} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p data-nfr-statement="" className="m-0 min-w-0 text-[15px] font-semibold leading-snug text-cc-ink [overflow-wrap:anywhere]">{r.statement}</p>
            <p className="m-0 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[12px] text-cc-ink-muted">
              <span data-nfr-category="">{NFR_CATEGORY_LABEL[r.category]}</span>
              <span>Read from: {NFR_SIGNAL_LABEL[r.signal]}</span>
              <span data-nfr-anchors="" className="font-cc-mono text-cc-ink [overflow-wrap:anywhere]">{r.anchors.map(lineRef).join(', ')}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CcButton variant="ghost" icon={<Copy size={14} aria-hidden={true} />} data-nfr-copy-one={r.id} aria-label={`Copy ${r.id}`} onClick={() => void copyOne(r)}>
              Copy
            </CcButton>
            <CcButton
              variant="ghost"
              icon={open ? <ChevronDown size={14} aria-hidden={true} /> : <ChevronRight size={14} aria-hidden={true} />}
              aria-expanded={open}
              aria-controls={`nfr-detail-${r.id}`}
              data-nfr-details-toggle=""
              onClick={() => toggleRow(r.id)}
            >
              Details
            </CcButton>
          </div>
        </div>
        {open ? (
          <div id={`nfr-detail-${r.id}`} data-nfr-detail="" className="flex min-w-0 flex-col gap-4 border-t border-cc-line px-3 py-3 sm:px-4 sm:pl-[128px]">
            <dl className="m-0 grid min-w-0 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)]">
              <dt className="font-semibold text-cc-ink">Rationale</dt>
              <dd className="m-0 text-cc-ink [overflow-wrap:anywhere]">{r.rationale}</dd>
              <dt className="font-semibold text-cc-ink">Why {PRIORITY_WORD[r.priority]}</dt>
              <dd className="m-0 text-cc-ink [overflow-wrap:anywhere]">{r.priorityReason}</dd>
              <dt className="font-semibold text-cc-ink">Names</dt>
              <dd className="m-0 font-cc-mono text-cc-ink [overflow-wrap:anywhere]">{r.objects.length ? r.objects.join(', ') : <span className="font-cc-sans text-cc-ink-muted">No object named at these lines.</span>}</dd>
              <dt className="font-semibold text-cc-ink">Provenance</dt>
              <dd className="m-0 flex flex-wrap items-center gap-2 text-cc-ink">
                <CcProvenanceChip value="reconstructed" />
                <span className="text-cc-ink-muted">Read from the code by the engine.</span>
              </dd>
            </dl>
            <div className="min-w-0">
              <h4 className="m-0 mb-2 text-[13px] font-semibold text-cc-ink">Acceptance criteria</h4>
              {r.acceptance.length ? (
                <ol className="m-0 flex list-none flex-col gap-2 p-0">
                  {r.acceptance.map((c, i) => (
                    <li key={i} data-nfr-criterion="" className="grid min-w-0 gap-1 rounded-cc-row bg-cc-surface-muted px-3 py-2 text-[13px] sm:grid-cols-3 sm:gap-3">
                      <span className="[overflow-wrap:anywhere]"><b className="font-semibold">Given</b> {c.given}</span>
                      <span className="[overflow-wrap:anywhere]"><b className="font-semibold">When</b> {c.when}</span>
                      <span className="[overflow-wrap:anywhere]"><b className="font-semibold">Then</b> {c.then}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 text-[13px] text-cc-ink-muted">None the code makes testable; a target value is a question for the business.</p>
              )}
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
  };

  const listTab = (
    <div className="flex min-w-0 flex-col gap-4">
      {categoryFilter}
      {shownCategories.map((c) => {
        const summary = set.categories.find((x) => x.category === c)!;
        const items = set.requirements.filter((r) => r.category === c);
        const look = STATUS_LOOK[summary.status];
        return (
          <section key={c} data-nfr-group={c} aria-labelledby={`nfr-group-${c}`} className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 id={`nfr-group-${c}`} className="m-0 text-[15px] font-semibold text-cc-ink">{NFR_CATEGORY_LABEL[c]}</h3>
              <span className={cn('text-[12px] font-semibold', look.ink)}>{tileLines(summary).join(' · ')}</span>
            </div>
            {items.length ? (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">{items.map(row)}</ol>
            ) : (
              <p data-nfr-empty={c} className="m-0 rounded-cc-card border border-dashed border-cc-field-border p-3 text-[13px] text-cc-ink-muted">
                Nothing found in the code.
                {summary.questions ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="font-semibold text-cc-information underline-offset-2 hover:underline"
                      onClick={() => {
                        setCategory(c);
                        setTab('questions');
                      }}
                    >
                      {summary.questions} question{summary.questions === 1 ? '' : 's'} to decide
                    </button>
                  </>
                ) : null}
              </p>
            )}
            {summary.unreached.length ? (
              <p data-nfr-unreached={c} className="m-0 text-[12px] text-cc-ink-muted [overflow-wrap:anywhere]">
                Not counted — in routines no entry point reaches:{' '}
                {summary.unreached.slice(0, 4).map((u) => `${u.what} in ${u.routine} (L${u.line})`).join('; ')}
                {summary.unreached.length > 4 ? `; ${summary.unreached.length - 4} more` : ''}.
              </p>
            ) : null}
            {proposalFor(c)}
          </section>
        );
      })}
    </div>
  );

  const questionsTab = (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="m-0 text-[13px] text-cc-ink-muted">
        The code cannot answer these. They are questions for the business or IT operations — with the line that prompts
        each — not requirements found in the code, and no value is assumed for them.
      </p>
      {categoryFilter}
      {shownCategories.map((c) => {
        const items = set.questions.filter((x) => x.category === c);
        if (!items.length) return null;
        return (
          <section key={c} data-nfr-question-group={c} aria-labelledby={`nfr-q-${c}`} className="flex min-w-0 flex-col gap-2">
            <h3 id={`nfr-q-${c}`} className="m-0 text-[15px] font-semibold text-cc-ink">{NFR_CATEGORY_LABEL[c]}</h3>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {items.map((x) => (
                <li key={x.id} data-nfr-question={x.id} data-nfr-question-category={x.category} className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-dashed border-cc-field-border bg-cc-surface p-3 sm:flex-row sm:items-start sm:gap-4 sm:p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span data-nfr-question-id="" className="font-cc-mono text-[13px] font-semibold text-cc-ink">{x.id}</span>
                      <CcProvenanceChip value="not-determined" />
                      <OwnerTag owner={x.owner} />
                    </span>
                    <p className="m-0 text-[14px] font-semibold text-cc-ink [overflow-wrap:anywhere]">{x.question}</p>
                    <p className="m-0 text-[13px] text-cc-ink-muted [overflow-wrap:anywhere]">
                      {x.evidence}
                      {x.anchors.length ? <span data-nfr-question-anchors="" className="ml-1 font-cc-mono text-cc-ink">{x.anchors.map(lineRef).join(', ')}</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <CcButton variant="ghost" icon={<Copy size={14} aria-hidden={true} />} data-nfr-copy-question={x.id} aria-label={`Copy ${x.id}`} onClick={() => void copyQuestion(x)}>
                      Copy
                    </CcButton>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      {shownCategories.every((c) => !set.questions.some((x) => x.category === c)) ? (
        <p className="m-0 rounded-cc-card border border-dashed border-cc-field-border p-3 text-[13px] text-cc-ink-muted">No question in this category.</p>
      ) : null}
    </div>
  );

  return (
    <section aria-labelledby="nfr-title" data-non-functional-requirements="" data-nfr-state="ready" className="flex min-w-0 flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-6">
      {header}

      <p data-nfr-summary="" className="m-0 text-[14px] text-cc-ink">
        <b className="font-semibold">{set.counts.total}</b> requirement{set.counts.total === 1 ? '' : 's'} grounded in the code, in{' '}
        <b className="font-semibold">{set.counts.categoriesGrounded}</b> of {NFR_CATEGORIES.length} categories ·{' '}
        <b className="font-semibold">{set.counts.questions}</b> question{set.counts.questions === 1 ? '' : 's'} for the business or IT operations
      </p>

      {overview}

      <div className="flex flex-col gap-2 rounded-cc-row bg-cc-surface-muted px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <CcButton variant="secondary" icon={<ClipboardCopy size={16} aria-hidden={true} />} data-nfr-copy-all="" onClick={() => void copyAll()}>
            Copy as text
          </CcButton>
          <CcButton variant="ghost" icon={<FileText size={16} aria-hidden={true} />} data-nfr-download="md" onClick={() => void download('md')}>
            Download .md
          </CcButton>
          <CcButton variant="ghost" icon={<FileDown size={16} aria-hidden={true} />} data-nfr-download="docx" onClick={() => void download('docx')}>
            Download .docx
          </CcButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-cc-ink">Functional and non-functional as one specification:</span>
          <CcButton variant="ghost" icon={<ClipboardCopy size={16} aria-hidden={true} />} data-nfr-spec="copy" onClick={() => void specification('copy')}>
            Copy
          </CcButton>
          <CcButton variant="ghost" icon={<FileText size={16} aria-hidden={true} />} data-nfr-spec="md" onClick={() => void specification('md')}>
            .md
          </CcButton>
          <CcButton variant="ghost" icon={<FileDown size={16} aria-hidden={true} />} data-nfr-spec="docx" onClick={() => void specification('docx')}>
            .docx
          </CcButton>
        </div>
        <p className="m-0 text-[12px] text-cc-ink-muted">
          Every copy and download carries each requirement and question with its lines and the provenance note. Model
          proposals that name something from this program are listed apart, marked; generic ones are left out.
        </p>
        {note ? <p role="status" data-nfr-note="" className="m-0 text-[12px] font-semibold text-cc-ink">{note}</p> : null}
      </div>

      <CcTabs
        label="Non-functional requirements"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'list', label: 'Requirements', count: set.requirements.length, content: listTab },
          { value: 'questions', label: 'To be decided', count: set.questions.length, content: questionsTab },
        ]}
      />
      <CcToast open={toast !== null} onDismiss={() => setToast(null)}>
        {toast}
      </CcToast>
    </section>
  );
}
