'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { useFitByPlatform } from '@/hooks/useFitByPlatform';
import { useProcessStates } from '@/hooks/useProcessStates';
import { decisionOptionsView, type DecisionOptionsView } from '@/lib/decision-option-signals';
import { outdatedReasonsOfAnswer } from '@/lib/decision-cost';
import { executiveSubject } from '@/lib/management-executive';
import type { DecisionRead, Loaded } from '@/lib/management-overview';
import { fitCheck, standardConditions } from '@/lib/fit-check';
import { standardFit, type StandardFit } from '@/lib/standard-fit';
import { standardTouch } from '@/lib/standard-touch';
import { workflowSteps } from '@/lib/workflow-steps';
import type { ItFindingsSource } from '@/lib/it-findings';
import type { RedesignDecision } from '@/lib/redesign';
import type { DecisionChoiceContext } from '@/components/workspace/DecisionOptions';
import type { Project } from '@/lib/types';

/**
 * The program decision of one project, read for the pages that show it outside the workspace: Analyze in the
 * Management view (read-only, ADR-143) and Re-design, where it is taken as step 2.
 *
 * The same two GETs the workspace's Management overview makes (`ManagementOverview.tsx`, retired with AB-11) — the
 * engine's findings and the decision record — and the same derivations over them: the fit to standard
 * (`standardFit`), the four options (`decisionOptionsView`, ADR-079) and the open points that are conditions of
 * *Move to SAP standard*. Nothing is written here; a choice is written by `DecisionOptions` through the commands route.
 * `revision` is bumped by the caller after a command, so the record is read again.
 */
export interface ProgramDecision {
  findings: Loaded<ItFindingsSource>;
  decision: Loaded<DecisionRead>;
  fit: StandardFit;
  options: DecisionOptionsView;
  /** For `DecisionOptions`: `null` while the record is read, or when it could not be. */
  choice: Omit<DecisionChoiceContext, 'beforeWrite' | 'onChanged'> | null;
  /** The open points of the fit-to-standard check, shown on *Move to SAP standard*. */
  conditions: string[];
  /** The decision in the words of `lib/redesign.ts`. */
  state: RedesignDecision;
}

const NO_RUN: Loaded<never> = { state: 'absent', reason: 'No signed run yet.' };

async function readRoute<T>(
  projectId: string,
  path: string,
  accept: (json: unknown) => T | null,
  what: string,
): Promise<Loaded<T>> {
  try {
    const token = await getAuth().currentUser?.getIdToken();
    if (!token) return { state: 'absent', reason: `Sign in to read ${what}.` };
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const value = res.ok ? accept(json) : null;
    if (value === null) {
      return { state: 'absent', reason: json && typeof json.error === 'string' ? json.error : `${what[0].toUpperCase()}${what.slice(1)} could not be read.` };
    }
    return { state: 'ready', value };
  } catch {
    return { state: 'absent', reason: `${what[0].toUpperCase()}${what.slice(1)} could not be read.` };
  }
}

function acceptDecision(j: unknown): DecisionRead | null {
  const d = j as Partial<DecisionRead> | null;
  return d && d.draft
    ? {
        draft: d.draft,
        stored: d.stored ?? null,
        unchanged: d.unchanged,
        cost: d.cost ?? null,
        costNow: d.costNow ?? null,
        ...(Array.isArray(d.outdated) ? { outdated: d.outdated } : {}),
        runId: d.runId ?? null,
        evidenceDigest: d.evidenceDigest ?? null,
        canDecide: d.canDecide === true,
        signOff: d.signOff ?? null,
        engineRoute: d.engineRoute ?? null,
        contractRoute: d.contractRoute ?? null,
        rebuildContract: d.rebuildContract ?? null,
      }
    : null;
}

export function useProgramDecision(project: Project | null, projectId: string, revision = 0): ProgramDecision {
  const hasRun = Boolean(project?.activeRunId);
  const [findings, setFindings] = useState<Loaded<ItFindingsSource>>({ state: 'loading' });
  const [held, setHeld] = useState<{ rev: number; value: Loaded<DecisionRead> }>({ rev: -1, value: { state: 'loading' } });

  useEffect(() => {
    if (!projectId || !hasRun) return;
    let cancelled = false;
    void readRoute<ItFindingsSource>(
      projectId,
      'findings',
      (j) => (j && Array.isArray((j as ItFindingsSource).rows) ? (j as ItFindingsSource) : null),
      'the findings',
    ).then((v) => {
      if (!cancelled) setFindings(v);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, hasRun]);

  useEffect(() => {
    if (!projectId || !hasRun) return;
    let cancelled = false;
    void readRoute<DecisionRead>(projectId, 'decision', acceptDecision, 'the decision').then((v) => {
      if (!cancelled) setHeld({ rev: revision, value: v });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, hasRun, revision]);

  // Without a signed run there is nothing to read: say so instead of "loading" forever.
  const findingsNow = useMemo<Loaded<ItFindingsSource>>(() => (hasRun ? findings : NO_RUN), [hasRun, findings]);
  const decision = useMemo<Loaded<DecisionRead>>(
    () => (!hasRun ? NO_RUN : held.rev === revision ? held.value : { state: 'loading' }),
    [hasRun, held, revision],
  );

  const fitByPlatform = useFitByPlatform(findingsNow, project, 'The SAP catalog could not be read for the fit to standard.');
  const analyzeState = useMemo(() => workflowSteps(project).find((s) => s.key === 'analyze')?.state ?? 'empty', [project]);
  const fit = useMemo(
    () =>
      standardFit({
        mode: 'project',
        hasRun,
        analyzeState,
        signedSourceSha256: project?.auditMetadata?.inputFingerprint?.sha256 ?? null,
        findings: findingsNow,
        fit: fitByPlatform,
      }),
    [hasRun, analyzeState, project, findingsNow, fitByPlatform],
  );

  const ruleStates = useProcessStates(projectId, hasRun && projectId !== '');
  const conditions = useMemo(() => {
    if (findingsNow.state !== 'ready' || !ruleStates.outcome?.ok) return [];
    return standardConditions(fitCheck(standardTouch(findingsNow.value), findingsNow.value.rows, ruleStates.outcome.view));
  }, [findingsNow, ruleStates.outcome]);

  const subject = executiveSubject(project?.legacyCode, project?.name?.trim() || 'this program');
  const options = useMemo(() => {
    const read = decision.state === 'ready' ? decision.value : null;
    const confirmed = read?.stored && read.stored.status === 'confirmed' ? read.stored : null;
    return decisionOptionsView({
      subject,
      mode: 'project',
      hasRun,
      fit,
      decision: confirmed ?? read?.draft ?? null,
      status: confirmed ? 'confirmed' : read ? (read.stored?.status ?? 'draft') : null,
      outdated: Boolean(read && outdatedReasonsOfAnswer(read).length > 0),
      outdatedReasons: read ? outdatedReasonsOfAnswer(read) : [],
      confirmation: confirmed?.confirmation ?? null,
      signOff: read?.signOff ?? null,
      engineRoute: read?.engineRoute ?? null,
      usage: project?.usageReport ?? null,
      economics: project?._economics ?? null,
    });
  }, [decision, subject, hasRun, fit, project]);

  const read = decision.state === 'ready' ? decision.value : null;
  const choice = read
    ? { projectId, runId: read.runId ?? null, evidenceDigest: read.evidenceDigest ?? null, canDecide: read.canDecide === true }
    : null;

  const state = useMemo<RedesignDecision>(
    () => ({
      stage: decision.state === 'ready' ? options.stage : decision.state === 'loading' ? 'unknown' : 'not-decided',
      option: options.cards.find((c) => c.chosen)?.option ?? null,
      indicated: options.proposed,
    }),
    [decision.state, options],
  );

  return { findings: findingsNow, decision, fit, options, choice, conditions, state };
}
