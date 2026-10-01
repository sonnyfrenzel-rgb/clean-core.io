'use client';

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { landViewedCode, loadStarterExample, type StarterExample, type ViewedCode } from '@/lib/starter-examples';
import { personalDataHintKey, scanForPersonalDataHints, type PersonalDataHint } from '@/lib/personal-data-hints';
import PersonalDataHints from '@/components/PersonalDataHints';
import {
  COMMUNITY_QUOTA_FALLBACK,
  quotaExhausted,
  runsAreSelfFunded,
  starterExampleIsFree,
  type QuotaSubject,
} from '@/lib/run-quota-rule';
import { describeStarterExampleCost, starterExampleFootnote } from '@/lib/run-cost';
import { workspaceShellEnabled, type WorkspaceShellSubject } from '@/lib/workspace-shell';
import { describeSnippet, exampleTiers, START_HERE_WHY, type ExampleSnippet } from '@/lib/example-catalog';
import { EXAMPLE_SNIPPETS } from '@/lib/example-snippets';
import { formatNumber } from '@/lib/format';
import { Eye, FileCode2, Info, Play } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcDisclosure from '@/components/cc/Disclosure';
import CcFilterBar from '@/components/cc/FilterBar';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSelect from '@/components/cc/Select';
import CcTag from '@/components/cc/Tag';
import { CcNoMatches } from '@/components/cc/EmptyState';

/**
 * "Try it with an example" — the one example gallery, on every page that
 * offers examples ("My workspace" and "New project").
 *
 * Owner feedback of 01.10.2026: fourteen cards at once, two card styles and a
 * filter bar before the reader knows anything was too much for a first visit.
 * So the gallery has three tiers (`lib/example-catalog.ts`): one recommended
 * start, three next examples by what they show, and everything else — shipped
 * examples and short snippets in the same card — behind "More examples", where
 * the search and the filter live. Every card has one action pattern: primary
 * "Start", secondary "View code". Nothing that could be started before is gone.
 *
 * Roadmap 0.9 / ADR-039: each *shipped* example costs nothing the first time an
 * account runs it, and the screen says before the click what a repeat costs. A
 * short snippet is an ordinary analysis from the first run, and its tag says
 * so. Both decisions are re-taken on the server from the source's fingerprint;
 * nothing said here grants anything.
 */

type Account = (QuotaSubject & WorkspaceShellSubject) | null | undefined;

type Item =
  | { kind: 'example'; key: string; example: StarterExample; goal?: string }
  | { kind: 'snippet'; key: string; snippet: ExampleSnippet };

const lines = (n: number) => `${formatNumber(n) ?? n} lines`;

function objectName(snippet: ExampleSnippet): string {
  return snippet.name.replace(/\.(abap|txt)$/i, '');
}

export default function StarterExamples({
  userId,
  account,
  heading = true,
}: {
  userId: string;
  account: Account;
  /** `false` where the page around it already says what this is ("New project"). */
  heading?: boolean;
}) {
  const router = useRouter();
  const tiers = useMemo(() => exampleTiers(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ViewedCode | null>(null);
  /**
   * What the last look at an example's source found, and which card it was
   * about. Three shipped examples carry shapes that often indicate personal
   * data (a mail address field, a person's name, a personnel number); the
   * reader is shown them before the source is written, the same panel and the
   * same words as every other path a source takes into the product.
   */
  const [scanned, setScanned] = useState<{ key: string; hints: PersonalDataHint[] } | null>(null);
  /** The hint set the reader said they had checked — see `personalDataHintKey`. */
  const [personalDataAckFor, setPersonalDataAckFor] = useState('');
  const [costOpen, setCostOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'' | 'example' | 'snippet'>('');
  const costId = useId();

  const limit = account?.transformationsLimit ?? COMMUNITY_QUOTA_FALLBACK;
  const atLimit = quotaExhausted(account);

  const moreItems: Item[] = useMemo(
    () => [
      ...tiers.more.map((example) => ({ kind: 'example' as const, key: example.file, example })),
      ...EXAMPLE_SNIPPETS.map((snippet) => ({ kind: 'snippet' as const, key: snippet.id, snippet })),
    ],
    [tiers.more],
  );

  /** Free for a shipped example's first run; everything else uses one run. */
  const selfFunded = runsAreSelfFunded(account);
  const free = (item: Item) =>
    selfFunded || (item.kind === 'example' && starterExampleIsFree(account, item.example.name));

  const create = async (item: Item) => {
    setBusy(item.key);
    setConfirming(null);
    setFailed(null);
    try {
      const isExample = item.kind === 'example';
      const legacyCode = isExample ? await loadStarterExample(item.example.file) : item.snippet.code;
      // The last moment the source is only in the browser. Nothing is blocked:
      // the next Start goes through once the box is ticked for these lines.
      const found = scanForPersonalDataHints(legacyCode);
      if (found.length > 0 && personalDataAckFor !== personalDataHintKey(found)) {
        setScanned({ key: item.key, hints: found });
        setBusy(null);
        return;
      }
      const docRef = await addDoc(collection(getDb(), 'projects'), {
        name: isExample ? item.example.name : objectName(item.snippet),
        status: 'uploaded',
        legacyCode,
        userId,
        createdAt: serverTimestamp(),
        fromExample: true,
      });
      // The same door "New project" uses: the workspace with its first look
      // where the new interface is on, the Analyze stage everywhere else.
      router.push(workspaceShellEnabled(account) ? `/project/${docRef.id}?first=1` : `/project/${docRef.id}/analyze`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
      setFailed('The project could not be created. Nothing was saved — try again.');
      setBusy(null);
    }
  };

  /** A free first run goes straight through; anything that uses a run is told so first. */
  const start = (item: Item) => {
    if (busy) return;
    if (free(item)) {
      void create(item);
      return;
    }
    if (atLimit) {
      setLimitHit(true);
      return;
    }
    setConfirming(confirming === item.key ? null : item.key);
  };

  const view = async (item: Item) => {
    if (item.kind === 'snippet') {
      setViewing({ title: item.snippet.name, code: item.snippet.code });
      return;
    }
    setViewing({ title: item.example.name, code: null });
    try {
      const code = await loadStarterExample(item.example.file);
      setViewing((current) => landViewedCode(current, item.example.name, code));
    } catch {
      setViewing((current) => landViewedCode(current, item.example.name, ''));
    }
  };

  const needle = search.trim().toLowerCase();
  const shownMore = moreItems.filter((item) => {
    if (kind && kind !== item.kind) return false;
    if (!needle) return true;
    const text =
      item.kind === 'example'
        ? `${item.example.name} ${item.example.summary} ${item.example.demonstrates}`
        : `${item.snippet.name} ${item.snippet.code}`;
    return text.toLowerCase().includes(needle);
  });
  const clear = () => {
    setSearch('');
    setKind('');
  };

  const renderCard = (item: Item, primary = false) => {
    const isBusy = busy === item.key;
    const name = item.kind === 'example' ? item.example.name : objectName(item.snippet);
    const described = item.kind === 'snippet' ? describeSnippet(item.snippet.code) : null;
    const cost = item.kind === 'example' ? describeStarterExampleCost(account, item.example.name) : null;
    const repeatWarning =
      item.kind === 'example'
        ? cost?.rerunWarning
        : `A short snippet is an ordinary analysis: starting it uses 1 of your ${limit} free analysis runs once the analysis completes.`;
    return (
      <li
        key={item.key}
        data-example-kind={item.kind}
        data-example-card={name}
        className={
          'flex min-w-0 flex-col gap-2 rounded-cc-card border p-4 ' +
          (primary ? 'border-cc-ink bg-cc-surface' : 'border-cc-line bg-cc-surface')
        }
      >
        {item.kind === 'example' && item.goal ? (
          <span data-example-goal="" className="cc-text-label text-cc-ink">
            {item.goal}
          </span>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <FileCode2 size={16} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
          <span data-testid="starter-example-name" className="min-w-0 truncate font-cc-mono cc-text-identifier text-cc-ink">
            {name}
          </span>
          {/* The tags travel as one group: on a phone they move under the name
              together instead of leaving one badge on a line of its own. */}
          <span data-example-tags="" className="inline-flex flex-nowrap items-center gap-2">
            <CcTag>{lines(item.kind === 'example' ? item.example.lines : (described?.lines ?? 0))}</CcTag>
            {item.kind === 'example' ? (
              <span data-testid={cost?.free ? 'starter-example-free' : 'starter-example-ran-before'}>
                <CcTag>{cost?.badge}</CcTag>
              </span>
            ) : (
              <CcTag>{selfFunded ? 'Short snippet' : 'Short snippet · uses a run'}</CcTag>
            )}
          </span>
        </div>
        <p className="m-0 cc-text-cell text-cc-ink">
          {item.kind === 'example' ? item.example.summary : (described?.title ?? `${described?.kind} ${name}`)}
        </p>
        <p className="m-0 cc-text-meta text-cc-ink-muted">
          <span className="text-cc-ink">Shows: </span>
          {item.kind === 'example'
            ? item.example.demonstrates
            : // Without a header comment the kind already heads the card; it is not said twice.
              [described?.title ? described.kind : null, ...(described?.shows ?? [])].filter(Boolean).join(' · ')}
        </p>
        {primary ? (
          <p data-start-here-why="" className="m-0 cc-text-meta text-cc-ink">
            {START_HERE_WHY}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <CcButton
            variant={primary ? 'primary' : 'secondary'}
            density={primary ? 'cozy' : 'compact'}
            busy={isBusy}
            disabled={!!busy && !isBusy}
            icon={<Play size={16} aria-hidden={true} />}
            onClick={() => start(item)}
            aria-expanded={confirming === item.key || undefined}
            aria-label={`Start ${name}`}
            data-example-start={name}
          >
            Start
          </CcButton>
          <CcButton
            variant="ghost"
            density={primary ? 'cozy' : 'compact'}
            icon={<Eye size={16} aria-hidden={true} />}
            onClick={() => void view(item)}
            aria-label={`View the code of ${name}`}
            data-example-view={name}
          >
            View code
          </CcButton>
        </div>
        {confirming === item.key && repeatWarning ? (
          <div data-testid="starter-example-rerun-warning">
            <CcMessageStrip
              state="warning"
              actions={
                <>
                  <CcButton variant="ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </CcButton>
                  <CcButton variant="secondary" onClick={() => void create(item)}>
                    {item.kind === 'example' ? 'Run again' : 'Start anyway'}
                  </CcButton>
                </>
              }
            >
              {repeatWarning}
            </CcMessageStrip>
          </div>
        ) : null}
        {scanned?.key === item.key ? (
          <PersonalDataHints
            id={`starter-example-personal-data-${item.key.replace(/[^A-Za-z0-9_-]/g, '-')}`}
            hints={scanned.hints}
            acknowledged={personalDataAckFor !== '' && personalDataAckFor === personalDataHintKey(scanned.hints)}
            onAcknowledge={(next) => setPersonalDataAckFor(next ? personalDataHintKey(scanned.hints) : '')}
          />
        ) : null}
      </li>
    );
  };

  const startHere: Item = { kind: 'example', key: tiers.startHere.file, example: tiers.startHere };

  return (
    <section
      data-testid="starter-examples"
      aria-labelledby={heading ? 'starter-examples-title' : undefined}
      aria-label={heading ? undefined : 'Examples'}
      className={heading ? 'w-full rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-6' : 'w-full'}
    >
      {heading ? (
        <div className="mb-4">
          <h2 id="starter-examples-title" className="m-0 cc-text-h2 text-cc-ink">
            Try it with an example
          </h2>
          <p className="mt-1 mb-0 max-w-2xl cc-text-cell text-cc-ink-muted">
            Fictional, realistic legacy ABAP — no code of your own needed. One click and you are in the analysis.
          </p>
          <div className="mt-1">
          <button
            type="button"
            data-examples-about=""
            onClick={() => setAboutOpen(true)}
            className="rounded-cc-row cc-text-meta font-semibold text-cc-brand-strong underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
          >
            What are these examples for?
          </button>
          </div>
        </div>
      ) : null}

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
            {`You've used all ${limit} free analysis runs. Add your own Gemini API key in Settings for unlimited runs — Clean-Core.io stays free.`}
          </CcMessageStrip>
        </div>
      ) : null}
      {failed ? (
        <div className="mb-4">
          <CcMessageStrip state="error" announce>
            {failed}
          </CcMessageStrip>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <div data-examples-tier="start-here" className="flex flex-col gap-2">
          <h3 className="m-0 cc-text-label text-cc-ink-muted">Start here</h3>
          <ul className="m-0 list-none p-0">
            {renderCard(startHere, true)}
          </ul>
        </div>

        <div data-examples-tier="next" className="flex flex-col gap-2">
          <h3 className="m-0 cc-text-label text-cc-ink-muted">Next, by what you want to see</h3>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3">
            {tiers.next.map(({ example, goal }) => (
              renderCard({ kind: 'example', key: example.file, example, goal })
            ))}
          </ul>
        </div>

        <div data-examples-more="">
          <CcDisclosure title="More examples" count={moreItems.length} level={3}>
            <div className="flex flex-col gap-3 pt-2">
              <CcFilterBar
                noun="examples"
                shown={shownMore.length}
                total={moreItems.length}
                search={search}
                onSearch={setSearch}
                active={needle.length > 0 || kind !== ''}
                onClear={clear}
              >
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
              {shownMore.length === 0 ? (
                <CcNoMatches
                  title="No examples match these filters"
                  reason="Every example is still here — the filters are hiding them."
                  onClear={clear}
                />
              ) : (
                <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                  {shownMore.map((item) => (
                    renderCard(item)
                  ))}
                </ul>
              )}
            </div>
          </CcDisclosure>
        </div>
      </div>

      {/* The cost rule in one line; the full rule one click away. */}
      <div data-examples-cost="" className="relative mt-4 flex flex-wrap items-center gap-2">
        <p className="m-0 cc-text-meta text-cc-ink-muted">
          Free the first time for each example; a snippet or a repeat uses a run.
        </p>
        <button
          type="button"
          aria-expanded={costOpen}
          aria-controls={costId}
          onClick={() => setCostOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-cc-row cc-text-meta font-semibold text-cc-brand-strong underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
        >
          <Info size={14} aria-hidden={true} />
          How runs are counted
        </button>
        {heading ? null : (
            <button
              type="button"
              data-examples-about=""
              onClick={() => setAboutOpen(true)}
              className="rounded-cc-row cc-text-meta font-semibold text-cc-brand-strong underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
            >
              What are these examples for?
            </button>
        )}
        {costOpen ? (
          <p id={costId} role="note" className="m-0 w-full max-w-3xl rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 cc-text-meta text-cc-ink">
            {starterExampleFootnote(account)}
          </p>
        ) : null}
      </div>

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
        <div data-examples-about-body="" className="flex flex-col gap-3">
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

      <CcDialog
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? ''}
        size="wide"
        actions={
          <CcButton variant="primary" onClick={() => setViewing(null)}>
            Close
          </CcButton>
        }
      >
        {viewing?.code === null ? (
          <p className="m-0 cc-text-cell text-cc-ink-muted" role="status">
            Loading the code…
          </p>
        ) : viewing?.code === '' ? (
          <p className="m-0 cc-text-cell text-cc-ink-muted">The code could not be loaded.</p>
        ) : (
          <pre data-example-code="" className="m-0 max-h-[60vh] overflow-auto rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 font-cc-mono text-[12px] text-cc-ink">
            {viewing?.code}
          </pre>
        )}
      </CcDialog>
    </section>
  );
}
