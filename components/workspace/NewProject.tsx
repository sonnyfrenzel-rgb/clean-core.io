'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { CircleHelp, FileCode, Layers, ShieldAlert } from 'lucide-react';
import { getAuth } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { describeRunCost } from '@/lib/run-cost';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { quotaExhausted } from '@/lib/run-quota-rule';
import {
  CLEAN_CORE_LEVEL_CAVEAT,
  CLEAN_CORE_MEANING,
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
import CleanCoreDiagram from './CleanCoreDiagram';
import StarterExamples from '@/components/StarterExamples';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { CcRunCost } from '@/components/cc/RunIndicator';
import { wt, newProjectCatalogLine } from '@/lib/workspace-messages';

/** A choice card: chosen is an ink outline, never green (§1.1). */
const CHOICE_CARD = 'block cursor-pointer rounded-cc-card border p-3 text-left';
const CHOICE_ON = 'border-cc-ink bg-cc-surface-muted ring-1 ring-cc-ink';
const CHOICE_OFF = 'border-cc-field-border bg-cc-surface hover:border-cc-ink-muted';

/**
 * "New project" — first understand, then start. `DESIGN.md` §6.1.1, roadmap 2.7.
 *
 * One page, two parts, and no wizard with a progress bar. Part 1 says what the
 * product is and what it does differently; part 2 is the choice between an
 * example and your own code, with what it costs standing before the click.
 *
 * **The figures on this page are not written on this page.** §6.1.1 is explicit
 * about the one that would be tempting to type out: the SAP catalog is shown
 * *"with count and date of the last sync from the catalog, never fixed in the
 * text"*. So the entry counts and the sync dates arrive as props from the server
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

  useEffect(() => onAuthStateChanged(getAuth(), setUser), []);

  // "Open the first time; afterwards one line … remembered in the browser" (§6.1.1).
  useEffect(() => setIntroOpen(!readIntroSeen()), []);

  const stations = useMemo(() => evidenceStations(catalogArtifacts), [catalogArtifacts]);
  const ladder = useMemo(() => cleanCoreLadder(), []);

  // The start calls the model for the narrative when the account's analysis
  // stage is on and a key is available (owner decision 03.10.2026).
  const model = useModelAvailability();
  const ownCodeCost = describeRunCost({
    profile,
    metered: true,
    callsModel: model.enabled('analyze'),
    sameSourceAgain: false,
  });

  const closeIntro = useCallback(() => {
    setIntroOpen(false);
    markIntroSeen();
  }, []);

  /**
   * Own code only: nothing is created here. The upload page reads and checks
   * the files and writes the project when the analysis is started (s11). An
   * example starts from its own card (`components/StarterExamples.tsx`), the
   * same gallery "My workspace" shows.
   */
  const continueToUpload = useCallback(() => {
    if (!user) return;
    router.push('/admin/new-project/upload');
  }, [user, router]);

  if (profileLoading || introOpen === null) {
    return (
      <div className="mx-auto my-12 max-w-md text-center text-[13px] font-medium text-cc-ink-muted">
        {wt('newProject.loading')}
      </div>
    );
  }

  // "New project" is the list report's own action, and the list is every
  // account's since roadmap 3.0.1 (ADR-061): a signed-in account is enough.
  // What a run costs is decided where it is spent (`quotaExhausted` below and
  // the server), not by who may see this page.
  if (!profile) {
    return (
      <div className="mx-auto my-12 max-w-md rounded-cc-card border border-cc-error-border bg-cc-surface p-8 text-center shadow-cc">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-cc-card border border-cc-error-border bg-cc-error-bg text-cc-error">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="mb-2 text-[15px] font-bold text-cc-ink">{wt('newProject.signInTitle')}</h2>
        <p className="text-[13px] leading-relaxed font-medium text-cc-ink-muted">
          {wt('newProject.signInBody')}
        </p>
      </div>
    );
  }

  const blocked = quotaExhausted(profile);

  return (
    <div className="cc min-h-screen bg-cc-page px-4 py-6 sm:px-6" data-cc-new-project="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">
              {wt('newProject.title')}
            </h1>
            <p data-new-project-core="" className="mt-1 max-w-3xl text-[13px] font-medium text-cc-ink-muted">
              {NEW_PROJECT_CORE}
            </p>
          </div>
          {/* "Skip intro" at the top right, always (s14): it folds part 1
              away and turns into "Show intro". */}
          <span className="ml-auto">
            <CcButton
              data-new-project-skip=""
              aria-expanded={introOpen}
              aria-controls="new-project-intro"
              onClick={introOpen ? closeIntro : () => setIntroOpen(true)}
            >
              {introOpen ? wt('newProject.skipIntro') : wt('newProject.showIntro')}
            </CcButton>
          </span>
        </div>

        {/* ---------------------------------------------- part 1: what it is */}
        {introOpen ? (
          <div id="new-project-intro" data-new-project-intro="open" className="flex flex-col gap-4">
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
                <CleanCoreDiagram />
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
            <ThreeViewsStage fact={stageFact} />
          </div>
        ) : (
          <div
            id="new-project-intro"
            data-new-project-intro="folded"
            className="flex flex-wrap items-center gap-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
          >
            <span className="text-[13px] font-semibold text-cc-ink">
              {wt('newProject.whatIs')}
            </span>
            <span className="text-[13px] font-medium text-cc-ink-muted">
              {wt('newProject.whatIsNote')}
            </span>
            <span className="ml-auto" />
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
            <div className="mt-4" data-new-project-examples="">
              {user ? <StarterExamples userId={user.uid} account={profile} heading={false} /> : null}
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

          {choice === 'own-code' ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CcButton
                variant="primary"
                density="cozy"
                onClick={continueToUpload}
                disabled={blocked || !user}
                data-new-project-start="own-code"
              >
                {START_CHOICES['own-code'].action}
              </CcButton>
              {blocked ? (
                <span data-new-project-blocked="" className="text-[12px] font-medium text-cc-ink-muted">
                  {ownCodeCost.quota}
                </span>
              ) : null}
            </div>
          ) : null}
        </CcCard>
      </div>
    </div>
  );
}
