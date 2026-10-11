import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { receiptFor } from './helpers/test-receipt';
import { workflowSteps, workflowSummary } from '../lib/workflow-steps';
import { projectContinueHref, projectOpenHref, projectProgress } from '../lib/project-progress';
import { workspaceProcessHref } from '../lib/workspace-back-href';
import { BUSINESS_MAP_ID } from '../lib/business-layers';
import { DEFAULT_VIEW, viewFromParam } from '../lib/workspace-model';
import { layerRedirect } from '../lib/layer-redirect';
import type { Project, TestCase } from '../lib/types';

/**
 * Owner, 11.10.2026: "When a project has been clicked through to Delivery and
 * you open it again, you no longer find the process and the BPMN view in
 * Analyze or First insights — they must be there when you reopen it."
 *
 * What was measured: the workspace never dropped either. Its Business view
 * renders the first insights (`FirstLook`, end state on every later visit) and
 * the process map block (`#process-map`) whatever phase the project is in. The
 * project never reached it: in "My workspace" the project's name and "Continue"
 * both led to the next open tool, and on a finished project the phase contract
 * names Delivery, so a reopened project opened on Delivery — every time. And
 * Analyze, where the owner looked, never drew the process at all (it lives in
 * the Business view, ADR-080) and had no way to it.
 *
 * Server-free: the phase contract on a finished project, the hrefs, and the
 * source of the three places involved.
 */

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const draft: TestCase[] = [
  { id: 't1', name: 'Totals', category: 'Unit', description: 'd', priority: 'High' },
  { id: 't2', name: 'Rounding', category: 'Unit', description: 'd', priority: 'Medium' },
];

/** Every phase on record, tests executed — the project the owner clicked through to Delivery. */
function finishedProject(): Project {
  const base: Project = {
    name: 'Finished project fixture',
    legacyCode: 'REPORT z_done.\n',
    activeRunId: 'run-1',
    cleanCoreScore: 62,
    solutionDesign: '# Target architecture\n',
    approvedByArchitect: true,
    approvedBy: 'architect@example.com',
    generatedCode: 'export const ok = true;\n',
    documentation: '# Blueprint\n',
    testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })),
    testSuite: { code: "import { test } from 'node:test';\ntest('t1', () => {});\n" },
  };
  return { ...base, testRunReceipt: receiptFor(base) };
}

test.describe('a finished project reopens on its process', () => {
  test('the fixture is finished: the contract has nothing open and its cursor sits on Delivery', () => {
    const steps = workflowSteps(finishedProject());
    const summary = workflowSummary(steps);
    expect(summary.next.key, 'the cursor of a finished project').toBe('delivery');
    expect(summary.next.done).toBe(true);
    // Economics is passed over by the path (L-08); nothing else is open.
    expect(projectProgress(finishedProject()).next).toBeNull();
  });

  test('"My workspace" opens it in its workspace — the name always, Continue once nothing is open', () => {
    const steps = workflowSteps(finishedProject());
    expect(projectOpenHref('p1')).toBe('/project/p1');
    // Before: `/project/p1/delivery`.
    expect(projectContinueHref('p1', steps)).toBe('/project/p1');
    // A project with work open still continues into that tool.
    const open = workflowSteps({ ...finishedProject(), documentation: undefined } as Project);
    expect(projectContinueHref('p1', open)).toBe('/project/p1/documentation');

    const dashboard = read('app/(app)/dashboard/page.tsx');
    expect(dashboard).toContain('<Link href={projectOpenHref(project.id)} data-dashboard-open={project.id}');
    expect(dashboard).toContain('projectContinueHref(project.id, workflowSteps(project))');
    expect(dashboard).not.toMatch(/\/project\/\$\{project\.id\}\/\$\{next\.path\}/);
  });

  test('without ?view= the workspace opens in Business, and nothing sends a finished project elsewhere', () => {
    expect(DEFAULT_VIEW).toBe('business');
    expect(viewFromParam(null)).toBe('business');
    expect(layerRedirect('business', '', { hasActiveRun: true })).toBeNull();
    const page = read('app/(app)/project/[projectId]/page.tsx');
    // The view is the address's alone — no phase, delivery or status picks it.
    expect(page).not.toMatch(/workflowSteps|workflowSummary|auditPackExportedAt|\.status\b/);
  });

  test('Business renders the first insights and the process map whatever the phase', () => {
    const shell = read('components/workspace/WorkspaceShell.tsx');
    const order = shell.slice(shell.indexOf('const BUSINESS_ORDER'), shell.indexOf('];', shell.indexOf('const BUSINESS_ORDER')));
    expect(order).toContain("'firstLook'");
    expect(order).toContain("'process'");
    // The map block is Business's, with no other condition.
    expect(shell).toMatch(/process:\s*\n\s*view === 'business' \? \(\s*\n\s*<div id=\{BUSINESS_MAP_ID\}/);
    // The first look is rendered in every view, with no phase condition.
    expect(shell).toMatch(/firstLook: \(\s*\n\s*<div className="mt-5">/);
    expect(shell).not.toMatch(/nextStep === null[^\n]*firstLook|firstLook[^\n]*nextStep === null/);
    // A second visit gets the end state, not nothing.
    const firstLook = read('components/workspace/FirstLook.tsx');
    expect(firstLook).toContain("data-first-look={endStateOnly ? 'end-state' : 'complete'}");
    expect(firstLook).toContain('const endStateOnly = reduced || skipped || !buildUp;');
  });

  test('Analyze has the way to the process where a run is signed', () => {
    expect(workspaceProcessHref('p1')).toBe(`/project/p1?view=business#${BUSINESS_MAP_ID}`);
    const analyze = read('app/(app)/project/[projectId]/analyze/page.tsx');
    const at = analyze.indexOf('data-analyze-open-process');
    expect(at, 'Analyze has no link to the process').toBeGreaterThan(0);
    const link = analyze.slice(analyze.lastIndexOf('project?.activeRunId?.trim() ?', at), at + 160);
    expect(link).toContain('href={workspaceProcessHref(projectId as string)}');
    expect(link).toContain('Process (BPMN)');
  });
});
