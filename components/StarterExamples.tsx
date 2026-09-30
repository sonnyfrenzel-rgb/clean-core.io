'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { STARTER_EXAMPLES, loadStarterExample, type StarterExample } from '@/lib/starter-examples';
import {
  COMMUNITY_QUOTA_FALLBACK,
  quotaExhausted,
  starterExampleIsFree,
  type QuotaSubject,
} from '@/lib/run-quota-rule';
import { describeStarterExampleCost, starterExampleFootnote } from '@/lib/run-cost';
import { formatNumber } from '@/lib/format';
import { Eye, FileCode2, HelpCircle, LoaderCircle, Play } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcFilterBar from '@/components/cc/FilterBar';
import CcIconButton from '@/components/cc/IconButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSelect from '@/components/cc/Select';
import CcTag from '@/components/cc/Tag';
import { CcNoMatches } from '@/components/cc/EmptyState';

/**
 * "Try it with an example" — the one example gallery of "My workspace".
 *
 * Block D, D.22a (UX-063, UX 2cf6bb463ace): the dashboard used to carry two
 * example libraries that competed with each other — this panel, and a second
 * "ABAP / Legacy Code Database (Safe Examples)" further down with six short
 * snippets, its own category chips, its own search and its own start dialog.
 * They are one gallery now, with one filter bar, and nothing either of them
 * could do is gone: the shipped examples still start in one click, the short
 * snippets still open their full code and still start a named project.
 *
 * Roadmap 0.9 / ADR-039: each *shipped* example costs nothing the first time an
 * account runs it — reaching a first result must not eat one of the five runs
 * somebody needs for their own code. Running the same example again is an
 * ordinary analysis, and this screen says so before the click rather than
 * after it. What is free and what is not is read from the account's
 * server-written record through `lib/run-quota-rule`; the decision itself is
 * re-taken on the server from the fingerprint of the source, so nothing said
 * here grants anything. A short snippet is not one of those examples: it is an
 * ordinary analysis from the first run, and its tag says so.
 */

/** A short code snippet shipped with the dashboard. Starts as a named project. */
export interface ExampleSnippet {
  id: string;
  name: string;
  code: string;
}

type CategoryId = 'reports' | 'rfc-apis' | 'db-operations' | 'oo-abap' | 'uncategorized';

const CATEGORIES: readonly { id: CategoryId; label: string; description: string }[] = [
  { id: 'reports', label: 'Reports & Output', description: 'Classic reporting logic, output grids, and list formatting.' },
  { id: 'rfc-apis', label: 'Function Modules & RFC APIs', description: 'Remote-enabled interfaces, RFC connections, and BAPI mappings.' },
  { id: 'db-operations', label: 'Database Access & CRUD Operations', description: 'Open SQL statements, internal tables manipulation, and database operations.' },
  { id: 'oo-abap', label: 'OO-ABAP & Class Methods', description: 'Object-oriented classes, interfaces, and local methods implementations.' },
  { id: 'uncategorized', label: 'General Legacy Code', description: 'Miscellaneous custom uploads and generic legacy modules.' },
];

/** The same keyword sort the snippet database used, now over both kinds. */
function categoryOf(name: string, text: string): CategoryId {
  const n = name.toLowerCase();
  const c = text.toLowerCase();
  if (n.includes('rfc') || n.includes('bapi') || n.includes('function') || c.includes('call function') || c.includes('bapi')) return 'rfc-apis';
  if (n.includes('report') || n.includes('alv') || n.includes('write') || c.includes('write:') || c.includes('alv')) return 'reports';
  if (n.includes('select') || n.includes('db') || n.includes('table') || c.includes('select ') || c.includes('insert ') || c.includes('update ')) return 'db-operations';
  if (n.includes('class') || n.includes('method') || c.includes('class ') || c.includes('method ')) return 'oo-abap';
  return 'uncategorized';
}

type Kind = '' | 'example' | 'snippet';

const lines = (n: number) => `${formatNumber(n) ?? n} lines`;

export default function StarterExamples({
  userId,
  quota,
  snippets = [],
  onStartSnippet,
  onViewCode,
}: {
  userId: string;
  quota: QuotaSubject | null | undefined;
  /** Short snippets that start as a named project (the page owns that dialog). */
  snippets?: readonly ExampleSnippet[];
  onStartSnippet?: (snippet: ExampleSnippet) => void;
  onViewCode?: (title: string, code: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryId | ''>('');
  const [kind, setKind] = useState<Kind>('');
  const router = useRouter();
  const db = getDb();

  const limit = quota?.transformationsLimit ?? COMMUNITY_QUOTA_FALLBACK;
  const atLimit = quotaExhausted(quota);

  const start = async (example: StarterExample) => {
    if (busy) return;
    setConfirming(null);

    // Only a repeat costs anything, so only a repeat can be stopped by the limit.
    if (!starterExampleIsFree(quota, example.name) && atLimit) {
      setLimitHit(true);
      return;
    }

    setBusy(example.file);
    try {
      const legacyCode = await loadStarterExample(example.file);
      const docRef = await addDoc(collection(db, 'projects'), {
        name: example.name,
        status: 'uploaded',
        legacyCode,
        userId,
        createdAt: serverTimestamp(),
      });
      router.push(`/project/${docRef.id}/analyze`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
      setBusy(null);
    }
  };

  /** A first run goes straight through; a repeat has to be told what it costs. */
  const pick = (example: StarterExample) => {
    if (busy) return;
    if (starterExampleIsFree(quota, example.name)) {
      void start(example);
      return;
    }
    setConfirming(confirming === example.name ? null : example.name);
  };

  const needle = search.trim().toLowerCase();
  const matches = useCallback(
    (name: string, text: string, itemKind: Exclude<Kind, ''>) => {
      if (kind && kind !== itemKind) return false;
      if (category && categoryOf(name, text) !== category) return false;
      return !needle || `${name} ${text}`.toLowerCase().includes(needle);
    },
    [kind, category, needle],
  );

  const shownExamples = useMemo(
    () => STARTER_EXAMPLES.filter((e) => matches(e.name, `${e.summary} ${e.demonstrates}`, 'example')),
    [matches],
  );
  const shownSnippets = useMemo(
    () => snippets.filter((s) => matches(s.name, s.code, 'snippet')),
    [snippets, matches],
  );
  const total = STARTER_EXAMPLES.length + snippets.length;
  const shown = shownExamples.length + shownSnippets.length;
  const active = needle.length > 0 || category !== '' || kind !== '';
  const clear = () => {
    setSearch('');
    setCategory('');
    setKind('');
  };

  const presentCategories = CATEGORIES.filter(
    (cat) =>
      STARTER_EXAMPLES.some((e) => categoryOf(e.name, `${e.summary} ${e.demonstrates}`) === cat.id) ||
      snippets.some((s) => categoryOf(s.name, s.code) === cat.id),
  );

  return (
    <section
      data-testid="starter-examples"
      aria-labelledby="starter-examples-title"
      className="w-full rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="starter-examples-title" className="m-0 cc-text-h2 text-cc-ink">
            Try it with an example
          </h2>
          <p className="mt-1 max-w-2xl cc-text-cell text-cc-ink-muted">
            No need to fetch code out of your own system first. The examples are realistic, fictional legacy
            reports — the same ones the analysis engine is regression-tested against. Pick one and you are in
            the analysis in seconds. The short snippets start a project you name yourself.
          </p>
        </div>
        <CcIconButton label="What are these examples for?" title="What are these examples for?" onClick={() => setAboutOpen(true)}>
          <HelpCircle size={16} aria-hidden={true} />
        </CcIconButton>
      </div>

      <div className="mb-4">
        <CcFilterBar
          noun="examples"
          shown={shown}
          total={total}
          search={search}
          onSearch={setSearch}
          active={active}
          onClear={clear}
        >
          <CcSelect<CategoryId | 'all'>
            label="Module type"
            value={category || 'all'}
            onChange={(v) => setCategory(v === 'all' ? '' : v)}
            options={[{ value: 'all', label: 'All module types' }, ...presentCategories.map((c) => ({ value: c.id, label: c.label }))]}
          />
          <CcSelect<'all' | 'example' | 'snippet'>
            label="Kind"
            value={kind || 'all'}
            onChange={(v) => setKind(v === 'all' ? '' : v)}
            options={[
              { value: 'all', label: 'Examples and snippets' },
              { value: 'example', label: 'Examples' },
              { value: 'snippet', label: 'Short snippets' },
            ]}
          />
        </CcFilterBar>
      </div>

      {limitHit ? (
        <div className="mb-4">
          <CcMessageStrip
            state="warning"
            headline="Limit reached."
            announce
            actions={
              <CcButton variant="ghost" onClick={() => setLimitHit(false)}>
                Close
              </CcButton>
            }
          >
            {`You've used all ${limit} free transformations. Add your own Gemini API key in settings for unlimited runs — Clean-Core.io stays free.`}
          </CcMessageStrip>
        </div>
      ) : null}

      {shown === 0 ? (
        <CcNoMatches
          title="No examples match these filters"
          reason="Every example is still here — the filters are hiding them."
          onClear={clear}
        />
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
          {shownExamples.map((example) => {
            // One source for the two badge wordings and the re-run sentence
            // (`lib/run-cost.ts`), so that "New project" cannot grow a third
            // spelling of the same rule.
            const cost = describeStarterExampleCost(quota, example.name);
            const isBusy = busy === example.file;
            return (
              <li key={example.file} data-example-kind="example" className="flex flex-col gap-2">
                <div
                  className={
                    'rounded-cc-row border p-3 ' +
                    (isBusy ? 'border-cc-ink bg-cc-surface-muted' : 'border-cc-line bg-cc-surface hover:bg-cc-surface-muted')
                  }
                >
                  <button
                    type="button"
                    onClick={() => pick(example)}
                    disabled={!!busy}
                    aria-expanded={confirming === example.name}
                    aria-busy={isBusy || undefined}
                    className="flex w-full cursor-pointer items-start gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="mt-1 shrink-0 text-cc-ink-muted">
                      {isBusy ? (
                        <LoaderCircle size={16} aria-hidden={true} className="motion-safe:animate-spin" />
                      ) : (
                        <FileCode2 size={16} aria-hidden={true} />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          data-testid="starter-example-name"
                          className="truncate font-cc-mono cc-text-identifier text-cc-ink"
                        >
                          {example.name}
                        </span>
                        <CcTag>{lines(example.lines)}</CcTag>
                        {cost.free ? (
                          // UX-116: the badge says the whole rule — first run free,
                          // every later one uses one of the five runs.
                          <span data-testid="starter-example-free">
                            <CcTag>{cost.badge}</CcTag>
                          </span>
                        ) : (
                          <span data-testid="starter-example-ran-before">
                            <CcTag>{cost.badge}</CcTag>
                          </span>
                        )}
                      </span>
                      <span className="cc-text-cell text-cc-ink">{example.summary}</span>
                      <span className="cc-text-meta text-cc-ink-muted">
                        <span className="text-cc-ink">Shows: </span>
                        {example.demonstrates}
                      </span>
                    </span>
                    <Play size={16} aria-hidden={true} className="mt-1 shrink-0 text-cc-ink-muted" />
                  </button>
                </div>

                {confirming === example.name && cost.rerunWarning ? (
                  <div data-testid="starter-example-rerun-warning">
                    <CcMessageStrip
                      state="warning"
                      actions={
                        <>
                          <CcButton variant="ghost" onClick={() => setConfirming(null)}>
                            Cancel
                          </CcButton>
                          <CcButton variant="secondary" onClick={() => void start(example)}>
                            Run again
                          </CcButton>
                        </>
                      }
                    >
                      {cost.rerunWarning}
                    </CcMessageStrip>
                  </div>
                ) : null}
              </li>
            );
          })}

          {shownSnippets.map((snippet) => {
            const lineCount = snippet.code.split('\n').length;
            const cat = CATEGORIES.find((c) => c.id === categoryOf(snippet.name, snippet.code)) ?? CATEGORIES[4];
            return (
              <li
                key={snippet.id}
                data-example-kind="snippet"
                className="flex flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-1 shrink-0 text-cc-ink-muted">
                    <FileCode2 size={16} aria-hidden={true} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-cc-mono cc-text-identifier text-cc-ink" title={snippet.name}>
                        {snippet.name}
                      </span>
                      <CcTag>{lines(lineCount)}</CcTag>
                      <CcTag>Short snippet · uses a run</CcTag>
                    </div>
                    <span className="cc-text-cell text-cc-ink">{cat.label}</span>
                    <span className="cc-text-meta text-cc-ink-muted">{cat.description}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {onViewCode ? (
                    <CcButton
                      variant="ghost"
                      icon={<Eye size={16} aria-hidden={true} />}
                      onClick={() => onViewCode(snippet.name, snippet.code)}
                      aria-label={`View the full code of ${snippet.name}`}
                    >
                      View code
                    </CcButton>
                  ) : null}
                  {onStartSnippet ? (
                    <CcButton
                      variant="secondary"
                      icon={<Play size={16} aria-hidden={true} />}
                      onClick={() => onStartSnippet(snippet)}
                      aria-label={`Start a project from ${snippet.name}`}
                    >
                      Start project
                    </CcButton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 mb-0 cc-text-meta text-cc-ink-muted">{starterExampleFootnote(quota)}</p>

      <CcDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="What are these examples for?"
        lead="Try Clean-Core.io without uploading your own SAP source code first."
        actions={
          <CcButton variant="primary" onClick={() => setAboutOpen(false)}>
            Got it
          </CcButton>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="m-0">
            Concerns about uploading your own sensitive ABAP directly are natural. These examples exist to remove
            that entry barrier: explore the platform with fictional code first.
          </p>
          <p className="m-0 font-semibold">What you can try with them:</p>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-4">
            <li>
              <strong>Run the pipeline:</strong> start a project and follow the analysis stage by stage.
            </li>
            <li>
              <strong>Understand the target architecture:</strong> see how legacy ABAP is structured into a modern
              service, complete with CDS schemas and BTP bindings.
            </li>
            <li>
              <strong>Try sandbox testing:</strong> run the generated tests in a restricted runner with live logs.
            </li>
          </ul>
          <p className="m-0 border-t border-cc-line pt-3 cc-text-meta text-cc-ink-muted">
            On data privacy: uploads are processed by the server and stored in your private workspace; nothing is
            shared with other accounts.
          </p>
        </div>
      </CcDialog>
    </section>
  );
}
