import type { Project } from '@/lib/types';
import type { RailStep } from '@/components/VerificationRail';

/**
 * The seven steps and what is actually on record for each.
 *
 * One derivation, used by every stage page, so the rail cannot say one thing on
 * Testing and another on Delivery. Each step is `done` only when the artefact it
 * produces exists — never because the page was opened, which is the mistake
 * stage 7 used to make when loading it wrote `status: 'completed'`.
 *
 * The wording is the product's own: a signed run, a suite, a blueprint. Where
 * nothing exists the detail says so plainly rather than leaving a blank.
 */
export function workflowSteps(project: Project | null): RailStep[] {
  const has = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

  const hasCode = has(project?.legacyCode);
  const hasRun = Boolean(project?.activeRunId) && typeof project?.cleanCoreScore === 'number';
  const hasDesign = has(project?.solutionDesign);
  const hasGenerated = has(project?.generatedCode);
  const testCount = Array.isArray(project?.testCases) ? project!.testCases!.length : 0;
  const hasDocs = has(project?.documentation);
  const readyToHandOver = hasGenerated && testCount > 0 && hasDocs;

  return [
    {
      n: 1,
      label: 'Upload',
      path: 'analyze',
      done: hasCode,
      detail: hasCode ? 'Legacy source is staged.' : 'No source staged yet.',
    },
    {
      n: 2,
      label: 'Analyze',
      path: 'analyze',
      done: hasRun,
      detail: hasRun
        ? `Signed run, Clean Core Score ${project?.cleanCoreScore}.`
        : 'No signed run yet — every later figure derives from one.',
    },
    {
      n: 3,
      label: 'Design',
      path: 'design',
      done: hasDesign,
      detail: hasDesign ? 'Solution design generated.' : 'No solution design yet.',
    },
    {
      n: 4,
      label: 'Transformation',
      path: 'transformation',
      done: hasGenerated,
      detail: hasGenerated ? 'Target code generated — not compiled or tested.' : 'No code generated yet.',
    },
    {
      n: 5,
      label: 'Testing',
      path: 'testing',
      done: testCount > 0,
      detail: testCount > 0 ? `${testCount} test case${testCount === 1 ? '' : 's'} generated.` : 'No test suite generated.',
    },
    {
      n: 6,
      label: 'Documentation',
      path: 'documentation',
      done: hasDocs,
      detail: hasDocs ? 'Blueprint and BPMN flow generated.' : 'No blueprint generated.',
    },
    {
      n: 7,
      label: 'Delivery',
      path: 'delivery',
      done: readyToHandOver,
      detail: readyToHandOver
        ? 'Code, tests and documentation are all present.'
        : `Missing: ${[
            !hasGenerated && 'code',
            testCount === 0 && 'tests',
            !hasDocs && 'documentation',
          ]
            .filter(Boolean)
            .join(', ')}.`,
    },
  ];
}
