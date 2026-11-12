'use client';

import React, { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { serverTimestamp, updateDoc } from 'firebase/firestore';
import { createWithinCeiling } from '@/lib/write-ceiling';
import { getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { landViewedCode, loadStarterExample, type StarterExample, type ViewedCode } from '@/lib/starter-examples';
import { personalDataHintKey, scanForPersonalDataHints, type PersonalDataHint } from '@/lib/personal-data-hints';
import PersonalDataHints from '@/components/PersonalDataHints';
import { isUnchangedShippedExample } from '@/lib/shipped-example-fingerprint';
import {
  COMMUNITY_QUOTA_FALLBACK,
  OWN_KEY_ACTION,
  OWN_KEY_HREF,
  quotaExhausted,
  quotaSpentSentence,
  runsAreSelfFunded,
  starterExampleIsFree,
  type QuotaSubject,
} from '@/lib/run-quota-rule';
import { describeStarterExampleCost, startModelLine, starterExampleFootnote } from '@/lib/run-cost';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { describeSnippet, exampleTiers, START_HERE_WHY, type ExampleSnippet } from '@/lib/example-catalog';
import { EXAMPLE_SNIPPETS } from '@/lib/example-snippets';
import { formatNumber } from '@/lib/format';
import { ArrowRight, Eye, FileCode2, Info, Play } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcDialog from '@/components/cc/Dialog';
import CcDisclosure from '@/components/cc/Disclosure';
import CcFilterBar from '@/components/cc/FilterBar';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSelect from '@/components/cc/Select';
import CcTag from '@/components/cc/Tag';
import TargetEditionChoice, { type TargetEdition } from '@/components/TargetEditionChoice';
import { leaveStartRelease } from '@/lib/start-release-handoff';
import { CcNoMatches } from '@/components/cc/EmptyState';
import { homeExampleLines, homeMoreExamples, wt } from '@/lib/workspace-messages';

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

type Account = QuotaSubject | null | undefined;

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
  variant = 'gallery',
  homeFooter,
}: {
  userId: string;
  account: Account;
  /** `false` where the page around it already says what this is ("New project"). */
  heading?: boolean;
  /**
   * `home`: the compact way "Try an example" of a new account's first view
   * (AB-14a, home mockup v2.1) — the recommended example with the page's one
   * filled button, the other shipped examples as a list, the snippets left to
   * the gallery. The start itself is this component's, unchanged: the same
   * edition question, the same cost rule, the same project.
   */
  variant?: 'gallery' | 'home';
  /** `home` only: what closes the column on a wide screen (the demo line). */
  homeFooter?: React.ReactNode;
}) {
  const router = useRouter();
  const tiers = useMemo(() => exampleTiers(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /** The edition the first run is assessed against — asked before the start. */
  const [edition, setEdition] = useState<TargetEdition>('private');
  /** The Private Edition release the first run reads; `''` reads SAP's latest list. */
  const [release, setRelease] = useState('');
  const [viewing, setViewing] = useState<ViewedCode | null>(null);
  /**
   * What the last look at an example's source found, and which card it was
   * about. A snippet with shapes that often indicate personal data shows
   * them before the source is written, the same panel and the same words as
   * every other path a source takes into the product. An unchanged shipped
   * example is recognised by its fingerprint and skips the panel: it is the
   * product's own text, with no lines of the reader's in it (owner 16.10.2026).
   */
  const [scanned, setScanned] = useState<{ key: string; hints: PersonalDataHint[] } | null>(null);
  /** The hint set the reader said they had checked — see `personalDataHintKey`. */
  const [personalDataAckFor, setPersonalDataAckFor] = useState('');
  const [costOpen, setCostOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'' | 'example' | 'snippet'>('');
  /** `home` on a phone: the list of the other examples is folded until asked for. */
  const [homeListOpen, setHomeListOpen] = useState(false);
  const costId = useId();
  // Whether the start asks the model for the narrative (owner decision
  // 03.10.2026): the account's analysis stage and a key, said before the click —
  // and the main switch "All automatic AI steps", without which the first run
  // asks no model (legal review 06.11.2026, N2; `hooks/useStartRun.ts`).
  const model = useModelAvailability();
  const startCallsModel = model.enabled('analyze') && model.autoModelSteps;

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
      // A shipped example that arrives unchanged is the product's own text and
      // skips the hint (roadmap 3.0.17 (4)). The check is the fingerprint of
      // the text actually fetched, not the card that was clicked; a snippet,
      // or an example served changed, is scanned as before.
      const found = isUnchangedShippedExample(legacyCode) ? [] : scanForPersonalDataHints(legacyCode);
      if (found.length > 0 && personalDataAckFor !== personalDataHintKey(found)) {
        setScanned({ key: item.key, hints: found });
        setBusy(null);
        return;
      }
      const docRef = await createWithinCeiling(getDb(), 'projects', userId, {
        name: isExample ? item.example.name : objectName(item.snippet),
        status: 'uploaded',
        legacyCode,
        userId,
        createdAt: serverTimestamp(),
        fromExample: true,
      });
      // The target the start's run is signed against. The create rule takes no
      // `s4Deployment`; the owner's update does (firestore.rules), so it is the
      // second write, before the workspace opens and signs.
      try {
        await updateDoc(docRef, { s4Deployment: edition });
      } catch (error) {
        // Not handleFirestoreError: it throws, and the sentence below would never land.
        console.error('[StarterExamples] target system not saved', error);
        setFailed('The project was created, but its target system could not be saved. Open it from My workspace and choose the target in Analyze.');
        setBusy(null);
        return;
      }
      // The same door "New project" uses: Analyze in the Business view —
      // every project opens there (plan AB-2, ADR-109) — which signs the
      // engine's reading at once, so the map stands (ADR-072).
      // The release is not a field the browser may write; the first run
      // carries it (`lib/start-release-handoff.ts`), as Change target does.
      leaveStartRelease(docRef.id, edition === 'private' ? release : '');
      // The project's entry since AB-2 (ADR-109): Analyze, Business view, which signs the engine's reading at once.
      router.push(`/project/${docRef.id}/analyze?first=1`);
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

  /** What stands under an example once it was started: the repeat warning, the personal-data panel. */
  const startNotes = (item: Item) => {
    const cost = item.kind === 'example' ? describeStarterExampleCost(account, item.example.name) : null;
    return (
      <>
        {confirming === item.key && cost?.rerunWarning ? (
          <div data-testid="starter-example-rerun-warning">
            <CcMessageStrip
              state="warning"
              actions={
                <>
                  <CcButton variant="ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </CcButton>
                  <CcButton variant="secondary" onClick={() => void create(item)}>
                    Run again
                  </CcButton>
                </>
              }
            >
              {cost.rerunWarning}
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
      </>
    );
  };

  if (variant === 'home') {
    const rec = tiers.startHere;
    const others: Item[] = [...tiers.next.map(({ example }) => example), ...tiers.more].map((example) => ({
      kind: 'example' as const,
      key: example.file,
      example,
    }));
    return (
      <section
        data-testid="starter-examples"
        data-starter-examples-variant="home"
        aria-labelledby="home-examples-title"
        className="flex min-w-0 flex-1 flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="home-examples-title" className="cc-text-h2 m-0 text-cc-ink">
            {wt('home.exampleTitle')}
          </h3>
          <span
            data-home-cost="examples"
            className="inline-flex items-center rounded-full border border-cc-success-border bg-cc-success-bg px-2 py-px text-[12px] leading-[18px] font-semibold whitespace-nowrap text-cc-success"
          >
            {wt('home.exampleCost')}
          </span>
        </div>

        {limitHit ? (
          <CcMessageStrip
            state="warning"
            headline="Limit reached."
            announce
            actions={
              <>
                <CcLinkButton href={OWN_KEY_HREF} variant="ghost" data-own-key-link="">
                  {OWN_KEY_ACTION}
                </CcLinkButton>
                <CcButton variant="ghost" onClick={() => setLimitHit(false)}>
                  Close
                </CcButton>
              </>
            }
          >
            {quotaSpentSentence(limit)}
          </CcMessageStrip>
        ) : null}
        {failed ? (
          <CcMessageStrip state="error" announce>
            {failed}
          </CcMessageStrip>
        ) : null}

        <div
          data-example-card={rec.name}
          data-examples-tier="start-here"
          className="flex flex-col items-start gap-2 rounded-cc-card border border-cc-line px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="starter-example-name" className="font-cc-mono text-[13px] font-bold text-cc-ink">
              {rec.name}
            </span>
            <CcTag>{wt('home.recommended')}</CcTag>
            <RanBefore account={account} name={rec.name} />
          </div>
          <p className="m-0 text-[13px] leading-normal font-medium text-cc-ink-muted">
            {rec.summary} <span data-example-lines={rec.lines}>{lines(rec.lines)}.</span>
          </p>
          <span data-home-start-example-wrap="" className="flex w-full flex-col min-[601px]:w-auto">
            <CcButton
              variant="primary"
              density="cozy"
              busy={busy === startHere.key}
              disabled={!!busy && busy !== startHere.key}
              onClick={() => start(startHere)}
              aria-expanded={confirming === startHere.key || undefined}
              data-example-start={rec.name}
              data-home-start-example=""
            >
              <span>{wt('home.startExample')}</span>
              <ArrowRight size={16} aria-hidden={true} />
            </CcButton>
          </span>
          {startNotes(startHere)}
        </div>

        <div className="flex flex-col">
          <span className="min-[768px]:hidden" data-examples-more="">
            <button
              type="button"
              aria-expanded={homeListOpen}
              aria-controls="home-examples-list"
              onClick={() => setHomeListOpen((v) => !v)}
              data-home-more-examples=""
              className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-cc-ink underline decoration-cc-field-border underline-offset-[3px] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
            >
              {homeMoreExamples(others.length)}
              <ArrowRight size={14} aria-hidden={true} />
            </button>
          </span>
          <ul
            id="home-examples-list"
            aria-label={wt('home.otherExamples')}
            data-home-examples-list=""
            className={'m-0 list-none flex-col border-t border-cc-line p-0 min-[768px]:flex ' + (homeListOpen ? 'flex' : 'hidden')}
          >
            {others.map((item) =>
              item.kind === 'example' ? (
                <li key={item.key} data-example-card={item.example.name} className="border-b border-cc-line">
                  <button
                    type="button"
                    onClick={() => start(item)}
                    disabled={!!busy && busy !== item.key}
                    aria-busy={busy === item.key || undefined}
                    aria-label={`Start ${item.example.name}`}
                    data-example-start={item.example.name}
                    className="group grid min-h-[34px] w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_14px] items-center gap-x-2 gap-y-1 px-1 py-2 text-left text-[12px] font-medium text-cc-ink-muted hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus disabled:cursor-not-allowed pointer-coarse:min-h-11 min-[1101px]:grid-cols-[minmax(0,auto)_auto_minmax(0,1fr)_14px]"
                  >
                    <span data-testid="starter-example-name" className="truncate font-cc-mono font-semibold text-cc-ink underline-offset-[3px] group-hover:underline">
                      {item.example.name}
                    </span>
                    <span data-example-lines={item.example.lines} className="inline-flex items-center gap-2 whitespace-nowrap tabular-nums">
                      {homeExampleLines(formatNumber(item.example.lines) ?? String(item.example.lines))}
                      <RanBefore account={account} name={item.example.name} />
                    </span>
                    <ArrowRight size={14} aria-hidden={true} className="justify-self-end min-[1101px]:order-last" />
                    <span className="col-span-full min-w-0 truncate max-[600px]:hidden min-[1101px]:col-span-1">
                      {item.example.summary}
                    </span>
                  </button>
                  {startNotes(item)}
                </li>
              ) : null,
            )}
          </ul>
        </div>

        {/* Said before the click (§2.8): what the start does with the model. */}
        <p data-examples-cost="" className="m-0 cc-text-meta text-cc-ink-muted">
          <span data-examples-model={startCallsModel ? 'calls' : 'none'}>{startModelLine(startCallsModel)}</span>
        </p>

        <TargetEditionChoice
          value={edition}
          onChange={setEdition}
          disabled={!!busy}
          release={release}
          onReleaseChange={setRelease}
          folded
        />

        {homeFooter}
      </section>
    );
  }

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
            {startCallsModel
              ? 'Fictional, realistic legacy ABAP — no code of your own needed. One click opens your workspace with the full process map: the start signs the engine’s reading, with the narrative the model writes meanwhile.'
              : 'Fictional, realistic legacy ABAP — no code of your own needed. One click opens your workspace with the full process map: the start signs the engine’s reading, without a model call.'}
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
              // The way on, not only "Close" (roadmap 3.0.21 (3)): straight to the own-key card.
              <>
                <CcLinkButton href={OWN_KEY_HREF} variant="ghost" data-own-key-link="">
                  {OWN_KEY_ACTION}
                </CcLinkButton>
                <CcButton variant="ghost" onClick={() => setLimitHit(false)}>
                  Close
                </CcButton>
              </>
            }
          >
            {quotaSpentSentence(limit)}
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
        <TargetEditionChoice
          value={edition}
          onChange={setEdition}
          disabled={!!busy}
          release={release}
          onReleaseChange={setRelease}
          folded
        />

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
          Free the first time for each example; a snippet or a repeat uses a run.{' '}
          <span data-examples-model={startCallsModel ? 'calls' : 'none'}>{startModelLine(startCallsModel)}</span>
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
              service, complete with CDS schemas and SAP BTP service bindings.
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

/**
 * The home list's mark on an example this account already had for free
 * (`home` only). The section's tag says "Free the first time" for all of them;
 * the one that would now use a run says so where it is clicked, in the
 * product's one wording (`STARTER_BADGE_RAN_BEFORE`), and the start asks
 * before it runs, as the gallery does.
 */
function RanBefore({ account, name }: { account: Account; name: string }) {
  const cost = describeStarterExampleCost(account, name);
  if (cost.free) return null;
  return (
    <span data-testid="starter-example-ran-before">
      <CcTag>{cost.badge}</CcTag>
    </span>
  );
}
