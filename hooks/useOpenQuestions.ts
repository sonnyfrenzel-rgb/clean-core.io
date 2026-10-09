'use client';

import { useMemo } from 'react';
import { useProcessStates } from '@/hooks/useProcessStates';
import { useFunctionModuleAnswers } from '@/hooks/useFunctionModuleAnswers';
import { rulesStatus } from '@/lib/rules-editor';
import { openQuestions, type OpenQuestionAction, type OpenQuestions, type StoredOpenAnswer } from '@/lib/open-questions';
import { notDetermined, type NotDetermined } from '@/lib/workspace-model';
import type { Project } from '@/lib/types';

/**
 * The project's open questions (ADR-081), the same for every place that shows
 * them — the list and the one line. The rule answers come from the one store
 * per project (`useProcessStates`), so the line and the list read one answer.
 *
 * `answers` overlays what this page just wrote over what the project document
 * carried when it was read, so a saved answer shows at once.
 */
export function useOpenQuestions(
  project: Project | null,
  projectId: string,
  options: {
    open?: NotDetermined;
    /** What this page wrote since the read; `null` for an answer it removed. */
    answers?: Partial<Record<OpenQuestionAction, StoredOpenAnswer | null>> | null;
    rulesEnabled?: boolean;
  } = {},
): OpenQuestions {
  const hasSource = typeof project?.legacyCode === 'string' && project.legacyCode.trim().length > 0;
  const signed = typeof project?.activeRunId === 'string' && project.activeRunId.length > 0;
  const { outcome } = useProcessStates(projectId, (options.rulesEnabled ?? true) && hasSource && signed && projectId !== '');
  // What SAP's catalog already answers about local function-module calls
  // (roadmap 3.0.6), asked of the server — never the catalog in the browser.
  const catalog = useFunctionModuleAnswers(project);
  const { open: given, answers } = options;
  return useMemo(() => {
    const status = rulesStatus(outcome, null);
    const stored = answers ? { ...(project?.openQuestions ?? {}), ...answers } : project?.openQuestions;
    return openQuestions({
      open: given ?? notDetermined(project),
      project: project ? { ...project, openQuestions: stored } : null,
      rules: status ? { total: status.total, open: status.open } : null,
      catalog,
    });
  }, [outcome, project, given, answers, catalog]);
}
