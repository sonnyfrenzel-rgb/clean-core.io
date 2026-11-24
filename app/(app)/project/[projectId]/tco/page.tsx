'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useFollowHash } from '@/hooks/useFollowHash';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import type { AnalysisData, Project } from '@/lib/types';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import StageFooter from '@/components/StageFooter';
import { workflowSteps, staleness } from '@/lib/workflow-steps';
// Roadmap 3.0.19: a key-user route is priced as configuration, not as a build.
import KeyUserEffort from '@/components/keyuser/KeyUserEffort';
import { useKeyUserSteps } from '@/hooks/useKeyUserSteps';
import { initialCostAssumptions, withKeyUserOption, type OptionProposals } from '@/components/tco/OptionComparison';
import EconomicsObjectPage from '@/components/tco/EconomicsObjectPage';
import { costComparison, formatAmount, proposeEffort, proposeMaintenanceBaseline, type CostAssumptions, type CostOption } from '@/lib/cost-assumptions';
import {
  ECONOMICS_START_INPUTS,
  readEconomicsRecord,
  restoreAssumptions,
  serializeEconomics,
  validateEconomicsPayload,
  type EconomicsInputs,
  type EconomicsPayload,
} from '@/lib/economics-record';
import { getAuth } from '@/lib/firebase';
import { isProjectOwner } from '@/lib/project-readers';
import { formatNumber } from '@/lib/format';
import { countSourceLines } from '@/lib/source-lines';
import { readStoredAnalysis } from '@/lib/money-honesty';
import { routeLabel } from '@/lib/sap-naming';
import { programDecisionOf } from '@/lib/economics-guard-rail';
import { redesignHref } from '@/lib/redesign';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import BusinessValuePlan from '@/components/tco/BusinessValuePlan';
import SaveStatus from '@/components/tco/SaveStatus';
import { redesignHref } from '@/lib/redesign';
import { typicalInWords } from '@/lib/typical-assumptions';
import { combineSaves, sectionKeysOf, sectionSave, sectionsWithFigures, type SectionSave } from '@/lib/economics-help';

/** How long the page waits after the last change before it saves. */
const SAVE_DELAY_MS = 800;

/**
 * Economics — a tool of the family, built as `docs/roadmap/economics-next-mockup.html` shows (ADR-128): the answer
 * first, with its conditions and four facets; the assumptions as chips, edited in place; the range chart; the options
 * compared with the difference to keeping; *How firm is the answer?* in plain words; the effort in days as a fold.
 * One page for every reader (ADR-126 (1)): the header shows the note, not the view switch. The page itself is
 * `components/tco/EconomicsObjectPage.tsx`, which the demo draws too.
 *
 * One money model (ADR-128 (2)): the demonstration forecast (payback, Year-1 ROI and a five-year net benefit on a
 * fixed target score) is gone; the phase rule rests on the comparison alone (`economicsProgress`). The route `/tco`
 * stays.
 *
 * The figures are stored with the project since 03.10.2026: loaded when the tool opens, saved as the reader works —
 * about 800 ms after the last change, when a field is left, and before the page is left — through
 * `/api/projects/{id}/cost-assumptions`. A save that fails says so and offers to retry; an invited reader sees the
 * owner's figures read-only. They are a scenario, never part of a signed run or audit pack.
 *
 * Money honesty is unchanged: every amount comes from the reader's own figures and carries *Simulation*; nothing has a
 * default; no cheapest option is named while an option is incomplete (`lib/cost-assumptions.ts`). Every number on the
 * page goes through `lib/format.ts`.
 */
export default function TcoCalculatorPage() {
  const { projectId } = useParams();
  // The decision card's Costs pillar links to `#economics-compare`, which renders only after the project loads.
  useFollowHash();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  // A read that failed is not a project without a score.
  const [loadError, setLoadError] = useState(false);
  // The line count of the uploaded source — what the proposals scale with.
  const [sourceLoc, setSourceLoc] = useState<number | null>(null);
  // Whether the signed-in account owns the project — an invited reader sees
  // the stored figures read-only. Until the stored figures are in the fields,
  // nothing is saved: an empty form must not overwrite them.
  const [isOwner, setIsOwner] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [save, setSave] = useState<SaveState>({ state: 'idle' });
  const tokenRef = useRef<string | null>(null);

  // The comparison's assumptions — currency, the two day rates, the period, the cadence and the options — in one
  // revision. Every figure starts empty: nothing has a default (ADR-035).
  const [assumptions, setAssumptions] = useState<CostAssumptions>(initialCostAssumptions);
  // "Model another size": `null` while it is the line count of the source.
  const [modelLoc, setModelLoc] = useState<number | null>(null);
  // The rest of the stored record's inputs, sent back as they were stored (ADR-128 (2)).
  const [storedInputs, setStoredInputs] = useState<EconomicsInputs>(ECONOMICS_START_INPUTS);
  const loc = modelLoc ?? sourceLoc;

  const comparison = useMemo(() => costComparison(assumptions), [assumptions]);
  /** Roadmap 3.0.19: the key-user step list's counts, where the run's engine reads key user (else no request). */
  const keyUserSteps = useKeyUserSteps(projectId as string, project);
  /**
   * Owner decision 19.10.2026: key user is its own cost option beside Rebuild
   * (unchanged) wherever the engine read a key-user part — by name only, its
   * key-user days the reader's own (`withKeyUserOption`).
   */
  const keyUserOffered = keyUserSteps.state === 'ready' && !!keyUserSteps.list && keyUserSteps.list.steps.length > 0;
  const hasKeyUser = assumptions.options.some((o) => o.kind === 'keyuser');
  useEffect(() => {
    if (keyUserOffered && !hasKeyUser) setAssumptions((a) => withKeyUserOption(a));
  }, [keyUserOffered, hasKeyUser]);
  const patch = useCallback((p: Partial<CostAssumptions>) => setAssumptions((a) => ({ ...a, ...p })), []);
  const patchOption = useCallback(
    (id: string, p: Partial<CostOption>) =>
      setAssumptions((a) => ({ ...a, options: a.options.map((o) => (o.id === id ? { ...o, ...p } : o)) })),
    [],
  );

  // Load project settings
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const data = await loadProjectAndHydrate(projectId as string);
        if (!enforceActiveRun(data, projectId as string)) return;
        if (data) {
          setProject(data);
          if (data.legacyCode) setSourceLoc(countSourceLines(data.legacyCode));
          // The figures stored for this project.
          const owner = isProjectOwner(data, getAuth().currentUser?.uid ?? null);
          setIsOwner(owner);
          const rec = data._economics ?? null;
          if (rec) {
            setAssumptions(restoreAssumptions(rec.assumptions));
            setModelLoc(rec.inputs.loc);
            setStoredInputs(rec.inputs);
          }
          setSave(
            !owner
              ? { state: 'read-only' }
              : data._economicsLoadFailed
                ? { state: 'unread' }
                : rec
                  ? { state: 'saved' }
                  : { state: 'idle' },
          );
          setHydrated(true);
          if (owner) getAuth().currentUser?.getIdToken().then((t) => { tokenRef.current = t; }).catch(() => undefined);
        }
      } catch (err) {
        console.error("Failed to load project:", err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  const baselineScore = typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
  const sourceChanged = staleness(project).sourceChanged;

  // ---- Stored with the project: load on open, save as the reader works ----
  // The record keeps its shape (ADR-128 (2)): the demonstration forecast's inputs travel back as they were stored.
  const payload = useMemo<EconomicsPayload>(
    () => ({ assumptions, inputs: { ...storedInputs, loc: modelLoc } }),
    [assumptions, storedInputs, modelLoc],
  );
  const serialized = useMemo(() => serializeEconomics(payload), [payload]);
  // What was last stored, per section, as state the page can render from
  // (owner, 11.10.2026: "show clearly when something was saved"). `body` is
  // the serialized payload of the last save — or, before the first, what was
  // loaded; `at` the time each section was last saved.
  const [stored, setStored] = useState<{ body: string | null; at: Record<string, string> }>({ body: null, at: {} });
  if (hydrated && stored.body === null) {
    const loadedAt = project?._economics?.savedAt ?? null;
    setStored({
      body: serialized,
      at: loadedAt ? Object.fromEntries(sectionsWithFigures(serialized).map((k) => [k, loadedAt])) : {},
    });
  }
  const latestRef = useRef(serialized);
  /** What is stored — or, before the first save, what was loaded. */
  const storedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const againRef = useRef(false);
  const canSaveRef = useRef(false);
  useEffect(() => {
    latestRef.current = serialized;
    canSaveRef.current = hydrated && isOwner && save.state !== 'unread';
  });

  const endpoint = `/api/projects/${encodeURIComponent(String(projectId))}/cost-assumptions`;
  const flushRef = useRef<(options?: { force?: boolean; leaving?: boolean }) => Promise<void>>(async () => undefined);
  const flush = useCallback(
    async (options: { force?: boolean; leaving?: boolean } = {}) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!canSaveRef.current) return;
      const body = latestRef.current;
      if (!options.force && body === storedRef.current) return;
      const checked = validateEconomicsPayload(JSON.parse(body));
      if (!checked.ok) {
        if (!options.leaving) setSave({ state: 'failed', message: checked.error });
        return;
      }
      if (options.leaving) {
        // The page is going away: one request that outlives it, with the token
        // already in hand — there is no time left to ask for a fresh one.
        if (!tokenRef.current) return;
        void fetch(endpoint, {
          method: 'POST',
          keepalive: true,
          headers: { Authorization: `Bearer ${tokenRef.current}`, 'Content-Type': 'application/json' },
          body,
        }).catch(() => undefined);
        return;
      }
      if (inFlightRef.current) {
        againRef.current = true;
        return;
      }
      inFlightRef.current = true;
      setSave({ state: 'saving' });
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) throw new Error('you are signed out');
        tokenRef.current = token;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body,
        });
        const answer = (await res.json().catch(() => null)) as { record?: unknown; error?: string } | null;
        const record = res.ok ? readEconomicsRecord(answer?.record) : null;
        if (!record) {
          setSave({ state: 'failed', message: answer?.error || `the server answered ${res.status}` });
        } else {
          storedRef.current = body;
          setSave({ state: 'saved' });
          // Every section this save changed is saved now, at the server's time.
          setStored((prev) => {
            const before = sectionKeysOf(prev.body);
            const after = sectionKeysOf(body);
            const at = { ...prev.at };
            for (const k of Object.keys(after)) if (after[k] !== before[k]) at[k] = record.savedAt;
            return { body, at };
          });
          // The phase and the tool's check read the stored record, so they move now.
          setProject((p) => (p ? { ...p, _economics: record, _economicsLoadFailed: false } : p));
        }
      } catch (err) {
        setSave({ state: 'failed', message: err instanceof Error && err.message ? err.message : 'the connection failed' });
      } finally {
        inFlightRef.current = false;
        if (againRef.current) {
          againRef.current = false;
          if (latestRef.current !== storedRef.current) void flushRef.current();
        }
      }
    },
    [endpoint],
  );
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (!hydrated) return;
    // The first render with the loaded figures is the baseline, not a change.
    if (storedRef.current === null) {
      storedRef.current = serialized;
      return;
    }
    if (serialized === storedRef.current || !canSaveRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), SAVE_DELAY_MS);
  }, [serialized, hydrated]);

  // Before the page goes away — another tool, a reload, a closed tab.
  useEffect(() => {
    const leave = () => {
      if (latestRef.current !== storedRef.current) void flushRef.current({ leaving: true });
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, []);

  const phases = workflowSteps(project, { keyUserList: keyUserSteps.state === 'ready' ? keyUserSteps.list : null });

  // The proposals from the size of the code (owner, 03.10.2026): effort per option, and Keep's maintenance baseline
  // raised for the Clean Core Score of the signed run — only one that still describes the source under review. A
  // proposal, never a default: nothing counts until the reader takes it over.
  const runScore = baselineScore !== null && !sourceChanged ? baselineScore : null;
  const proposals: OptionProposals = {
    effort: proposeEffort(loc),
    baseline: loc === null ? null : proposeMaintenanceBaseline(loc, runScore),
  };

  if (loading) {
    return (
      <StageFrame stage="tco" className="cc min-h-screen">
        <CcSkeleton shape="cards" label="the economics model" count={3} />
      </StageFrame>
    );
  }

  if (loadError) return (
    <StageFrame stage="tco" className="cc min-h-screen">
      <div className="max-w-xl" data-tco-load-error="">
        <CcMessageStrip
          state="error"
          headline="This stage could not be opened"
          actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
        >
          The project could not be loaded. This is usually a permissions or connectivity issue; it says
          nothing about whether a signed score exists.
        </CcMessageStrip>
      </div>
    </StageFrame>
  );

  // The score the stored figures were priced against — `undefined` while nothing is stored.
  const storedScore = project?._economics ? project._economics.basis.score : undefined;
  // Saved or not, per section: what is on screen against what was last stored.
  const currentKeys = sectionKeysOf(serialized);
  const storedKeys = sectionKeysOf(stored.body);
  const sectionStatus = (key: string): SectionSave =>
    sectionSave({ dirty: stored.body !== null && currentKeys[key] !== storedKeys[key], savedAt: stored.at[key] ?? null, save });
  const retry = () => void flush({ force: true });
  const effortSave = combineSaves(assumptions.options.map((o) => sectionStatus(`option:${o.id}`)));

  const analysis = project?.analysis ? readStoredAnalysis<AnalysisData>(project.analysis) : null;
  const routeCode = analysis?.extensibilityRouting?.recommendedRoute || project?.extensibilityRoute || null;
  const decision = programDecisionOf(project);
  // The decision is step 2 of Re-design (ADR-143); Design comes after it.
  const managementHref = redesignHref(String(projectId), 'decide');
  const designHref = `/project/${encodeURIComponent(String(projectId))}/design`;
  const typicalWords = typicalInWords(assumptions);
  const cur = assumptions.currency;

  return (
    // `.cc` puts the stage under the workspace's focus ring (§1.6) and its print rule (§7.1).
    <StageFrame stage="tco" className="cc min-h-screen print:p-0" data-economics="">
      <StageHeader tools={{ steps: phases, current: 'tco' }} project={project} stage="tco" view="one-page">
        What keeping, rebuilding, moving to SAP standard or retiring this program would cost, priced from figures you state or from
        typical assumptions you ask for.
      </StageHeader>

      {/* Every change is saved as the reader works; leaving a field saves at once. */}
      <div onBlur={() => void flush()}>
        <EconomicsObjectPage
          assumptions={assumptions}
          comparison={comparison}
          proposals={proposals}
          loc={loc}
          sourceLoc={sourceLoc}
          onLoc={setModelLoc}
          score={baselineScore}
          scoreStale={sourceChanged}
          route={routeCode ? routeLabel(routeCode) : null}
          editable={isOwner}
          onPatch={patch}
          onPatchOption={patchOption}
          managementHref={managementHref}
          designHref={designHref}
          decisionWords={
            decision
              ? `Decision: ${decision.label}${decision.confirmed ? ', signed off' : ', not signed off yet'}.`
              : 'Decision: not taken yet.'
          }
          saved={<EconomicsSaveLine save={save} onRetry={retry} />}
          ratesSave={isOwner ? <SaveStatus status={sectionStatus('rates')} onRetry={retry} live scope="rates" /> : undefined}
          effortSave={isOwner ? <SaveStatus status={effortSave} onRetry={retry} live scope="effort" /> : undefined}
          strips={
            save.state === 'failed' || save.state === 'unread' || (storedScore !== undefined && storedScore !== baselineScore && !sourceChanged) ? (
              <>
                {save.state === 'failed' || save.state === 'unread' ? <EconomicsSaveStrip save={save} onRetry={retry} /> : null}
                {storedScore !== undefined && storedScore !== baselineScore && !sourceChanged ? (
                  <div data-economics-basis-moved="">
                    <CcMessageStrip
                      state="warning"
                      headline="Your figures were stored against another score"
                      actions={
                        isOwner ? (
                          <CcButton onClick={() => void flush({ force: true })} data-economics-keep-figures="">
                            Keep my figures for this run
                          </CcButton>
                        ) : undefined
                      }
                    >
                      They were stored when the signed run said {storedScore ?? 'no score'}; it now says {baselineScore ?? 'no score'}.
                      The proposal for Keep&rsquo;s upkeep starts from the score, so check your figures before you rely on them.
                    </CcMessageStrip>
                  </div>
                ) : null}
              </>
            ) : null
          }
          optionSaveStatus={
            isOwner ? (id) => <SaveStatus status={sectionStatus(`option:${id}`)} onRetry={retry} scope={`option:${id}`} /> : undefined
          }
          keyUserEffort={
            keyUserSteps.state === 'ready' && keyUserSteps.list && keyUserSteps.mode !== 'none' ? (
              <KeyUserEffort
                list={keyUserSteps.list}
                mode={keyUserSteps.mode}
                currency={cur}
                keyUserRate={assumptions.testDayRate}
                option={assumptions.options.find((o) => o.kind === 'keyuser')}
              />
            ) : undefined
          }
          modelView={analysis ? <BusinessValuePlan analysis={project?.analysis} route={project?.extensibilityRoute} /> : null}
          printFooter={
            // Printed with the comparison, so a copy cannot leave without it.
            <div className="mt-12 hidden border-t border-cc-line pt-8 text-center cc-text-meta text-cc-ink-muted print:block">
              <p className="font-bold">
                Clean-Core.io: a comparison on {typicalWords ? 'typical assumptions and your figures' : 'your figures'}, not a quote
              </p>
              {/* The inputs it was priced with, so the printed page can be read on its own (Sonny, 30.09.2026). */}
              <p data-tco-print-inputs="">
                Inputs: {loc === null ? 'no line count' : `${formatNumber(loc)} lines`} · developer day rate{' '}
                {formatAmount(assumptions.devDayRate, cur)} · key-user day rate {formatAmount(assumptions.testDayRate, cur)} ·{' '}
                {assumptions.horizonYears === null ? 'no period' : `${formatNumber(assumptions.horizonYears)} years`} ·{' '}
                {assumptions.releaseCadence
                  ? `${formatNumber(assumptions.releaseCadence.perYear)} releases a year${assumptions.releaseCadence.confirmed ? '' : ' (not confirmed)'}`
                  : 'no cadence'}
                .
              </p>
              {/* 3.5.1 (ADR-144): typical values print as what they are, never as the reader's inputs. */}
              {typicalWords ? (
                <p data-tco-print-typical="">
                  Typical assumptions, not your own figures: {typicalWords}.
                </p>
              ) : null}
              <p>
                The effort factors per 1,000 lines are proposals nothing measured. Not an official SAP certification. Requires your own
                review and validation.
              </p>
            </div>
          }
        />
      </div>

      <div className="mt-6 print:hidden">
        <StageFooter />
      </div>
    </StageFrame>
  );
}

/** Where the stored figures stand. */
type SaveState =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'failed'; message: string }
  | { state: 'unread' }
  | { state: 'read-only' };

/**
 * A failed save, or stored figures that could not be read, said above the answer: the figures on screen are not the
 * stored ones until it succeeds. Never silent.
 */
function EconomicsSaveStrip({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  return (
    <div data-economics-save={save.state} role="status" aria-live="polite" className="cc-no-print">
      <CcMessageStrip
        state="error"
        headline={save.state === 'failed' ? 'Not saved' : 'Your stored figures could not be read'}
        actions={
          save.state === 'failed' ? (
            <CcButton onClick={onRetry} data-economics-save-retry="">
              Retry
            </CcButton>
          ) : (
            <CcButton onClick={() => window.location.reload()}>Reload</CcButton>
          )
        }
      >
        {save.state === 'failed'
          ? `Your latest figures are not stored yet: ${save.message}`
          : 'Nothing you enter here is saved until they can be, so stored figures are never overwritten. Reload the page to try again.'}
      </CcMessageStrip>
    </div>
  );
}

/** The side column's "Saved" line: saved, saving, or why not. */
function EconomicsSaveLine({ save }: { save: SaveState; onRetry: () => void }) {
  const words =
    save.state === 'saving'
      ? 'Saving…'
      : save.state === 'saved'
        ? 'Saved: stored with the project as you change a figure. A scenario, never part of the signed run or the audit pack.'
        : save.state === 'read-only'
          ? "Read-only: the owner's figures, as stored with the project."
          : save.state === 'failed'
            ? 'Not saved yet: see the message above.'
            : save.state === 'unread'
              ? 'Your stored figures could not be read.'
              : 'Nothing stored yet. Your figures are saved with the project as you enter them.';
  // The live region is the strip for a failure; here a polite status for the rest.
  const live = save.state === 'failed' || save.state === 'unread' ? {} : { role: 'status' as const, 'aria-live': 'polite' as const };
  return (
    <p data-economics-save={save.state === 'failed' || save.state === 'unread' ? undefined : save.state} {...live} className="cc-no-print m-0 cc-text-cell text-cc-ink-muted">
      {words}
    </p>
  );
}
