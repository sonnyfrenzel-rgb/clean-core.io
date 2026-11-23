'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSourceReading } from '@/hooks/useSourceReading';
import type { StatesReadOutcome } from '@/lib/process-states-client';
import type { ProcessSummary } from '@/lib/process-summary';
import { signedSourceOf } from '@/lib/signed-source';
import { engineStampOf, engineVersionOfProject } from '@/lib/run-engine-version';
import { ruleTallyOf } from '@/lib/management-rule-tally';
import { managementInShort, programSummary } from '@/lib/program-summary-text';
import { workspaceLayers } from '@/lib/workspace-model';
import type { Project } from '@/lib/types';

/**
 * "Your process" in the decision's Need row (ADR-087, owner 03.10. and 12.10.2026): what the program is for and what
 * the decision has to know from the code (`managementInShort`), then the map's counts, counted the way the map counts
 * them (`lib/process-summary.ts`, in the reading worker). The workspace shell computed it until 3.5.0 retired the
 * shell (AB-11); the decision record moved to Re-design and reads it from here. `null` while it is not counted.
 */
export function useNeedProcessLine(project: Project | null, ruleStates: StatesReadOutcome | null): string | null {
  const engineVersion = engineVersionOfProject(project);
  const reading = useSourceReading(typeof project?.legacyCode === 'string' ? project.legacyCode : '', true, engineVersion);
  const signed = useMemo(() => signedSourceOf(project), [project]);
  const [processSummary, setProcessSummary] = useState<{ source: string; summary: ProcessSummary | null } | null>(null);
  // The summary's inputs as values, so a snapshot that changes another field of the project does not count again.
  const summarySource = signed?.source ?? null;
  const summaryFileName = signed?.fileName ?? '';
  const summaryName = project?.name || '';
  const summaryEngine = JSON.stringify(engineStampOf(project));
  useEffect(() => {
    if (!summarySource) return;
    let cancelled = false;
    void import('@/lib/bpmn/reading-exports-client')
      .then((m) => m.processSummaryOffThread(summarySource, summaryFileName, summaryName, JSON.parse(summaryEngine) as object | null))
      .catch((): ProcessSummary | null => null)
      .then((summary) => {
        if (!cancelled) setProcessSummary({ source: summarySource, summary });
      });
    return () => {
      cancelled = true;
    };
  }, [summarySource, summaryFileName, summaryName, summaryEngine]);
  const mapSummary = signed && processSummary?.source === signed.source ? processSummary.summary : null;
  const processCount = useMemo(
    () => workspaceLayers(project, reading, mapSummary).find((l) => l.key === 'need')?.count ?? null,
    [project, reading, mapSummary],
  );
  return useMemo(() => {
    const facts = mapSummary?.summaryFacts ?? null;
    const tally = facts ? ruleTallyOf(ruleStates, facts.rules, engineVersion) : null;
    const management = facts
      ? managementInShort(programSummary(facts), facts, { level: false, rules: tally })
      : mapSummary?.management ?? null;
    return [management, processCount].filter(Boolean).join(' — ') || null;
  }, [mapSummary, ruleStates, processCount, engineVersion]);
}
