'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import {
  CircleHelp,
  FileCode,
  Layers,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { getAuth, getDb, handleFirestoreError, OperationType } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import { STARTER_EXAMPLES, loadStarterExample, type StarterExample } from '@/lib/starter-examples';
import {
  describeRunCost,
  describeStarterExampleCost,
  starterExampleFootnote,
} from '@/lib/run-cost';
import { quotaExhausted } from '@/lib/run-quota-rule';
import {
  personalDataHintKey,
  scanForPersonalDataHints,
  type PersonalDataHint,
} from '@/lib/personal-data-hints';
import {
  CLEAN_CORE_LEVEL_CAVEAT,
  CLEAN_CORE_MEANING,
  CLEAN_CORE_SCHEMA,
  NEW_PROJECT_CORE,
  NEW_PROJECT_DIFFERENCES,
  START_CHOICES,
  cleanCoreLadder,
  evidenceStations,
  type CatalogArtifactFigures,
  type StartChoice,
} from '@/lib/new-project-content';
import type { TravellingFact } from '@/lib/three-views-stage';
import ThreeViewsStage from './ThreeViewsStage';
import PersonalDataHints from '@/components/PersonalDataHints';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { CcRunCost } from '@/components/cc/RunIndicator';
import { wt, newProjectCatalogLine, newProjectExampleSize } from '@/lib/workspace-messages';

/** A choice card and an example row: chosen is an ink outline, never green (§1.1). */
const CHOICE_CARD = 'block cursor-pointer rounded-cc-card border p-3 text-left';
const EXAMPLE_ROW = 'flex w-full cursor-pointer flex-wrap items-center gap-2 rounded-cc-row border px-3 py-2 text-left';
const CHOICE_ON = 'border-cc-ink bg-cc-surface-muted ring-1 ring-cc-ink';
const CHOICE_OFF = 'border-cc-field-border bg-cc-surface hover:border-cc-ink-muted';
const EXAMPLE_OFF = 'border-cc-line bg-cc-surface hover:border-cc-field-border';

/**
 * "New project" — first understand, then start. `DESIGN.md` §6.1.1, roadmap 2.7.
 *
 * One page, two parts, and no wizard with a progress bar. Part 1 says what the
 * product is and what it does differently; part 2 is the choice between an
 * example and your own code, with what it costs standing before the click.
 *
 * **The figures on this page are not written on this page.** §6.1.1 is explicit
 * about the one that would be tempting to type out: the SAP catalog is shown
 * *„mit Anzahl und Stand des letzten Abgleichs aus dem Katalog, nie fest im
 * Text"*. So the entry counts and the sync dates arrive as props from the server
 * (`getLevelRuleVersion()` reads the two synced artifacts) and this component
 * prints what it is handed, or says there is no catalog. The quota line is the
 * same rule one layer down: it comes from `lib/run-cost.ts`, which is the module
 * the dashboard's example panel already reads, so the two screens cannot end up
 * with two versions of "what a run costs".
 *
 * **The three views in motion** (roadmap 6.1, §6.1.1) arrive the same way. Step
 * 2.7 left them out on purpose — *"building it from anything other than a real
 * run of the example would be the staged marketing picture the same section
 * forbids two paragraphs later"* — and that is still the rule: the fact on the
 * stage is derived by `lib/three-views-stage.ts` from the example's own source,
 * read by the route with the same engine a reader's upload meets. Nothing on
 * the stage is copy, and where the engine has nothing the panel says so.
 *
 * Nothing on this page is switched on for anybody: like the list report it sits
 * behind the admin gate until the new interface ships (`docs/ROADMAP.md`,
 * preamble).
 */

const PART1_STORAGE_KEY = 'cc.newProject.introSeen';

const DIFFERENCE_ICONS: Record<string, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  'file-code': FileCode,
  'circle-help': CircleHelp,
  layers: Layers,
};

function readIntroSeen(): boolean {
  try {
    return window.localStorage.getItem(PART1_STORAGE_KEY) === 'yes';
  } catch {
    return false;
  }
}

function markIntroSeen(): void {
  try {
    window.localStorage.setItem(PART1_STORAGE_KEY, 'yes');
  } catch {
    /* private window or blocked site data — part 1 opens again, which is fine */
  }
}

export default function NewProject({
  catalogArtifacts,
  stageFact = null,
}: {
  /** The two synced SAP artifacts, as the catalog reports them. */
  catalogArtifacts: CatalogArtifactFigures[];
  /**
   * The one fact the three views carry, derived from the example's own source
   * by the route (`lib/three-views-stage.ts`). `null` when the example could
   * not be read, and the stage then does not render — an intro is not worth a
   * panel of placeholders.
   */
  stageFact?: TravellingFact | null;
}) {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const [user, setUser] = useState<User | null>(null);
  const [introOpen, setIntroOpen] = useState<boolean | null>(null);
  const [choice, setChoice] = useState<StartChoice>('example');
  const [example, setExample] = useState<StarterExample>(STARTER_EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * What the last look at the source found, and which selection it was about.
   *
   * Carrying the selection along is what makes an effect unnecessary: pick a
   * different example and `scannedToken` below no longer matches, so the old
   * findings simply stop being the current ones. Nothing has to clear them, and
   * there is no render in which a stale list stands beside a new choice.
   */
  const [scanned, setScanned] = useState<{ token: string; hints: PersonalDataHint[] } | null>(null);
  /** The hint set the reader said they had checked — see `personalDataHintKey`. */
  const [personalDataAckFor, setPersonalDataAckFor] = useState('');

  useEffect(() => onAuthStateChanged(getAuth(), setUser), []);

  // "Beim ersten Mal offen; danach eine Zeile … gemerkt im Browser" (§6.1.1).
  useEffect(() => setIntroOpen(!readIntroSeen()), []);

  const stations = useMemo(() => evidenceStations(catalogArtifacts), [catalogArtifacts]);
  const ladder = useMemo(() => cleanCoreLadder(), []);

  const exampleCost = describeStarterExampleCost(profile, example.name);
  const ownCodeCost = describeRunCost({
    profile,
    metered: true,
    callsModel: false,
    sameSourceAgain: false,
  });

  const closeIntro = useCallback(() => {
    setIntroOpen(false);
    markIntroSeen();
  }, []);

  /** What the findings below are about. Changing it makes them stale by itself. */
  const scannedToken = choice === 'example' ? `example:${example.file}` : 'own-code';
  const personalDataHints = scanned && scanned.token === scannedToken ? scanned.hints : [];
  const personalDataKey = personalDataHintKey(personalDataHints);
  const personalDataAcknowledged =
    personalDataKey !== '' && personalDataAckFor === personalDataKey;
  /** Something to look at, and nobody has said they looked. */
  const personalDataPending = personalDataHints.length > 0 && !personalDataAcknowledged;

  const start = useCallback(async () => {
    if (busy || !user) return;
    setBusy(true);
    setError(null);
    try {
      const db = getDb();
      const source = choice === 'example' ? await loadStarterExample(example.file) : '';

      /**
       * The source is written to Firestore two lines below, so this is the last
       * moment it is only in the browser. Shapes that often indicate personal
       * data are put in front of the reader here rather than a screen earlier:
       * with nothing found there is nothing to say, and asking about an upload
       * that never happens would be noise. Nothing is blocked — the second
       * click goes through once the box is ticked.
       */
      const found = source ? scanForPersonalDataHints(source) : [];
      if (found.length > 0 && personalDataAckFor !== personalDataHintKey(found)) {
        setScanned({ token: scannedToken, hints: found });
        setBusy(false);
        return;
      }

      const docRef = await addDoc(collection(db, 'projects'), {
        name: choice === 'example' ? example.name : 'Untitled project',
        status: 'uploaded',
        ...(source ? { legacyCode: source } : {}),
        userId: user.uid,
        createdAt: serverTimestamp(),
        ...(choice === 'example' ? { fromExample: true } : {}),
      });

      // An example opens the workspace with the build-up of §5.2; own code has
      // no source yet, so it goes where the source is asked for. The workspace
      // is still behind roadmap 1.4's switch, and an address that 404s is worse
      // than the screen this account already knows.
      if (choice === 'example' && workspaceShellEnabled(profile)) {
        router.push(`/project/${docRef.id}?first=1`);
      } else {
        router.push(`/project/${docRef.id}/analyze`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'projects');
      setError(
        err instanceof Error ? err.message : wt('newProject.createFailed'),
      );
      setBusy(false);
    }
  }, [busy, user, choice, example, profile, router, personalDataAckFor, scannedToken]);

  if (profileLoading || introOpen === null) {
    return (
      <div className="mx-auto my-12 max-w-md text-center text-[13px] font-medium text-cc-ink-muted">
        {wt('newProject.loading')}
      </div>
    );
  }

  // The gate roadmap 1.5 used for the design-system gallery and 1.8 for the list
  // report, for the same reason: nothing behind it is live product yet.
  if (!profile || !profile.isAdmin) {
    return (
      <div className="mx-auto my-12 max-w-md rounded-cc-card border border-cc-error-border bg-cc-surface p-8 text-center shadow-cc">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-cc-card border border-cc-error-border bg-cc-error-bg text-cc-error">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="mb-2 text-[15px] font-bold text-cc-ink">{wt('newProject.accessDenied')}</h2>
        <p className="text-[13px] leading-relaxed font-medium text-cc-ink-muted">
          {wt('newProject.adminOnly')}
        </p>
      </div>
    );
  }

  const blocked = choice === 'own-code' ? quotaExhausted(profile) : !exampleCost.free && quotaExhausted(profile);

  return (
    <div className="cc min-h-screen bg-cc-page px-4 py-6 sm:px-6" data-cc-new-project="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div>
          <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">
            {wt('newProject.title')}
          </h1>
          <p data-new-project-core="" className="mt-1 max-w-3xl text-[13px] font-medium text-cc-ink-muted">
            {NEW_PROJECT_CORE}
          </p>
        </div>

        {/* ---------------------------------------------- part 1: what it is */}
        {introOpen ? (
          <div data-new-project-intro="open" className="flex flex-col gap-4">
            <CcCard title={wt('newProject.different')} level={2}>
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-3">
                {NEW_PROJECT_DIFFERENCES.map((line) => {
                  const Icon = DIFFERENCE_ICONS[line.icon] ?? CircleHelp;
                  return (
                    <li
                      key={line.key}
                      data-new-project-difference={line.key}
                      className="flex items-start gap-2 text-[13px] leading-snug font-medium text-cc-ink"
                    >
                      <span aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">{line.text}</span>
                    </li>
                  );
                })}
              </ul>
            </CcCard>

            {/* Clean Core in three glances — ADR-040. Three columns on L, two
                plus one on M, under each other on S. */}
            <div
              data-new-project-glances=""
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            >
              <CcCard title={wt('newProject.cleanCoreMeans')}>
                <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
                  {CLEAN_CORE_MEANING}
                </p>
                <ul className="m-0 mt-3 list-none space-y-2 p-0">
                  {CLEAN_CORE_SCHEMA.map((part) => (
                    <li
                      key={part.key}
                      data-core-schema={part.place}
                      className={
                        part.place === 'breach'
                          ? 'rounded-cc-row border border-dashed border-cc-error-border bg-cc-surface px-3 py-2'
                          : part.place === 'core'
                            ? 'rounded-cc-row border border-cc-field-border bg-cc-surface-muted px-3 py-2'
                            : 'rounded-cc-row border border-cc-field-border bg-cc-surface px-3 py-2'
                      }
                    >
                      <b className="text-[12px] font-semibold text-cc-ink">{part.label}</b>
                      <span className="block text-[12px] leading-snug font-medium text-cc-ink-muted">
                        {part.note}
                      </span>
                    </li>
                  ))}
                </ul>
              </CcCard>

              <CcCard title={wt('newProject.fourLevels')}>
                <ul data-new-project-ladder="" className="m-0 list-none space-y-2 p-0">
                  {ladder.map((level) => (
                    <li
                      key={level.value}
                      data-level={level.value}
                      className="flex items-start gap-2 text-[13px] leading-snug text-cc-ink"
                    >
                      <CcCleanCoreLevel value={level.value} />
                      <span className="min-w-0 font-medium text-cc-ink-muted">{level.label}</span>
                    </li>
                  ))}
                </ul>
                <p
                  data-new-project-level-caveat=""
                  className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink-muted"
                >
                  {CLEAN_CORE_LEVEL_CAVEAT}
                </p>
              </CcCard>

              <CcCard title={wt('newProject.evidenceFrom')}>
                <ol data-new-project-evidence="" className="m-0 list-none space-y-2 p-0">
                  {stations.map((station) => (
                    <li
                      key={station.key}
                      data-evidence-station={station.key}
                      className="rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <b className="text-[12px] font-semibold text-cc-ink">{station.label}</b>
                        <CcProvenanceChip value={station.provenance} />
                        {station.optional ? (
                          <span className="text-[11px] font-medium text-cc-ink-muted">{wt('newProject.optional')}</span>
                        ) : null}
                      </span>
                      <span className="block text-[12px] leading-snug font-medium text-cc-ink-muted">
                        {station.note}
                      </span>
                      {station.figures && station.figures.length > 0 ? (
                        <ul className="m-0 mt-2 list-none space-y-1 p-0">
                          {station.figures.map((artifact) => (
                            <li
                              key={artifact.file}
                              data-catalog-artifact={artifact.file}
                              className="font-cc-mono text-[11px] leading-snug text-cc-ink-muted"
                            >
                              {/* `en`, explicitly: `DESIGN.md` §3 says
                                  `Intl.NumberFormat('en')`, and a bare
                                  `toLocaleString()` prints 25.467 on a German
                                  machine and 25,467 on an English one for the
                                  same number. */}
                              {newProjectCatalogLine(artifact.file, artifact.entries.toLocaleString('en'))}{' '}
                              <span data-catalog-synced="">
                                {artifact.fetchedAt || wt('newProject.notRecorded')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </CcCard>
            </div>

            {/* The three views in motion — §6.1.1's last bullet of part 1, and
                the only thing on this page that moves (§1.7). It sits after the
                three glances because it is the pay-off: the vocabulary above is
                what the three panels below are speaking. */}
            <ThreeViewsStage fact={stageFact} onSkip={closeIntro} />

            <div>
              <CcButton onClick={closeIntro} data-new-project-intro-hide="">
                {wt('newProject.hideThis')}
              </CcButton>
            </div>
          </div>
        ) : (
          <div data-new-project-intro="folded" className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-cc-ink-muted">
              {wt('newProject.whatIs')}
            </span>
            <CcButton onClick={() => setIntroOpen(true)} data-new-project-intro-show="">
              {wt('newProject.show')}
            </CcButton>
          </div>
        )}

        {/* ------------------------------------------- part 2: how to start */}
        <CcCard title={wt('newProject.howStart')} level={2}>
          {/* Two choice cards (§6.1.1) as radio cards, like the deployment
              choice of Analyze (D.10b): a native radio carries the keyboard and
              the focus ring, the card around it is its label, so a click
              anywhere on it still chooses. Chosen is an ink outline, never
              green — choosing proves nothing (§1.1). */}
          <div role="radiogroup" aria-label={wt('newProject.howStart')} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(['example', 'own-code'] as StartChoice[]).map((key) => {
              const card = START_CHOICES[key];
              const selected = choice === key;
              return (
                <label
                  key={key}
                  data-start-choice={key}
                  data-selected={selected ? 'true' : 'false'}
                  className={selected ? `${CHOICE_CARD} ${CHOICE_ON}` : `${CHOICE_CARD} ${CHOICE_OFF}`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="new-project-start"
                      value={key}
                      checked={selected}
                      onChange={() => setChoice(key)}
                      className="size-4 shrink-0 cursor-pointer accent-cc-ink"
                    />
                    <b className="text-[13px] font-bold text-cc-ink">{card.title}</b>
                  </span>
                  <span className="mt-1 block text-[12px] leading-snug font-medium text-cc-ink-muted">
                    {card.body}
                  </span>
                </label>
              );
            })}
          </div>

          {choice === 'example' ? (
            <div className="mt-3">
              <ul
                data-new-project-examples=""
                role="radiogroup"
                aria-label={START_CHOICES.example.title}
                className="m-0 list-none space-y-2 p-0"
              >
                {STARTER_EXAMPLES.map((item) => {
                  const cost = describeStarterExampleCost(profile, item.name);
                  const selected = item.file === example.file;
                  return (
                    <li key={item.file} role="none">
                      <label
                        data-example={item.name}
                        data-selected={selected ? 'true' : 'false'}
                        className={selected ? `${EXAMPLE_ROW} ${CHOICE_ON}` : `${EXAMPLE_ROW} ${EXAMPLE_OFF}`}
                      >
                        <input
                          type="radio"
                          name="new-project-example"
                          value={item.file}
                          checked={selected}
                          onChange={() => setExample(item)}
                          className="size-4 shrink-0 cursor-pointer accent-cc-ink"
                        />
                        <span className="font-cc-mono text-[12px] font-bold text-cc-ink">
                          {item.name}
                        </span>
                        <span className="text-[11px] font-medium text-cc-ink-muted">
                          {newProjectExampleSize(item.lines.toLocaleString('en'), item.size)}
                        </span>
                        <span
                          data-example-quota={cost.free ? 'free' : 'costs'}
                          className="text-[11px] font-semibold text-cc-ink-muted"
                        >
                          {cost.badge}
                        </span>
                        <span className="w-full text-[12px] leading-snug font-medium text-cc-ink-muted">
                          {item.summary}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p
                data-new-project-quota="example"
                className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink-muted"
              >
                {starterExampleFootnote(profile)}
              </p>
              {exampleCost.rerunWarning ? (
                <div className="mt-2">
                  <CcMessageStrip state="warning" headline={wt('newProject.ranBefore')}>
                    {exampleCost.rerunWarning}
                  </CcMessageStrip>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3">
              <p
                data-new-project-quota="own-code"
                className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted"
              >
                <CcRunCost cost={ownCodeCost} />
              </p>
              <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {wt('newProject.ownCodeNext')}
              </p>
            </div>
          )}

          {/* The same panel and the same words as the Analyze stage, on
              purpose: one wording for one rule, wherever a source enters. */}
          {personalDataHints.length > 0 ? (
            <div className="mt-3">
              <PersonalDataHints
                id="new-project-personal-data"
                hints={personalDataHints}
                acknowledged={personalDataAcknowledged}
                onAcknowledge={(next) => setPersonalDataAckFor(next ? personalDataKey : '')}
              />
            </div>
          ) : null}

          {error ? (
            <div className="mt-3">
              <CcMessageStrip state="error" headline={wt('newProject.nothingCreated')} announce>
                {error}
              </CcMessageStrip>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <CcButton
              variant="primary"
              density="cozy"
              onClick={() => void start()}
              disabled={busy || blocked || !user || personalDataPending}
              icon={busy ? <Loader2 size={16} aria-hidden={true} /> : undefined}
              data-new-project-start={choice}
            >
              {START_CHOICES[choice].action}
            </CcButton>
            {blocked ? (
              <span data-new-project-blocked="" className="text-[12px] font-medium text-cc-ink-muted">
                {ownCodeCost.quota}
              </span>
            ) : null}
            {personalDataPending ? (
              <span
                data-new-project-personal-data-pending=""
                className="text-[12px] font-medium text-cc-ink-muted"
              >
                {wt('newProject.personalDataPending')}
              </span>
            ) : null}
          </div>
        </CcCard>
      </div>
    </div>
  );
}
