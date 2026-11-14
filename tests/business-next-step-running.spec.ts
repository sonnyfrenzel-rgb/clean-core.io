import { test, expect } from '@playwright/test';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { nextOpenPoint } from '../lib/next-step';
import { businessNextStep } from '../lib/business-next-step';
import type { Project } from '../lib/types';

/**
 * "Next step" in Analyze, Business while the start run of a new project is with
 * the server, and once nothing runs (the hub's running card moved here with
 * AB-2): `AnalyzeBusiness` marks the Analyze point `running` while
 * `useStartRun` is running and hands it to `BusinessNextStep` through
 * `businessNextStep`. Running, the bar says the analysis is running and offers
 * no button — a button there would start a second run. Idle, Analyze is offered
 * with its one primary link.
 *
 * Server-free: the component is bundled and rendered to static markup. The
 * rendered walk with a held `/api/runs/create` is
 * `tests/start-run-next-step-rendered.spec.ts`.
 */
async function loadStep(): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'tmp', 'business-next-step-running', String(process.pid), 'BusinessNextStep.cjs');
  await build({
    entryPoints: [path.join(root, 'components', 'workspace', 'BusinessNextStep.tsx')],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': root },
    logLevel: 'silent',
  });
  return require(out).default;
}

/** A new project: source, no run — Analyze is the open point. */
const NEW_PROJECT = { id: 'p1', name: 'Z_TEST', userId: 'u1', status: 'uploaded', legacyCode: 'REPORT z_test.\nWRITE 1.\n' } as unknown as Project;

async function render(running: boolean): Promise<string> {
  const Step = await loadStep();
  const point = nextOpenPoint(NEW_PROJECT, null);
  expect(point?.key, 'a project with source and no run opens on Analyze').toBe('analyze');
  // The same marking AnalyzeBusiness makes while its start run is with the server.
  const marked = running && point ? { ...point, running: true as const } : point;
  const step = businessNextStep({ point: marked, rules: null, owner: true });
  return renderToStaticMarkup(React.createElement(Step, { step, projectId: 'p1', noneText: 'Nothing is open.' }));
}

test('while the start run is running, "Next step" in Analyze, Business says so and offers no button', async () => {
  const html = await render(true);
  expect(html).toContain('data-next-step-state="running"');
  expect(html).toContain('data-next-step-key="analyze"');
  expect(html).toContain('The analysis is running');
  expect(html).not.toContain('data-next-step-state="open"');
  expect(html).not.toContain('data-cc-button="primary"');
  expect(html).not.toMatch(/href="[^"]*\/analyze/);
});

test('once nothing runs, Analyze is offered with its one primary link', async () => {
  const html = await render(false);
  expect(html).toContain('data-next-step-state="open"');
  expect(html).toContain('data-next-step-key="analyze"');
  expect(html).not.toContain('The analysis is running');
  expect(html).toContain('data-cc-button="primary"');
  expect(html).toMatch(/href="\/project\/p1\/analyze[^"]*"/);
});

test('with open rules, a running start still shows the running Analyze step, not the rules', async () => {
  const point = nextOpenPoint(NEW_PROJECT, null);
  const step = businessNextStep({
    point: point ? { ...point, running: true as const } : null,
    rules: { total: 3, open: [{ id: 'r1' }, { id: 'r2' }] } as never,
    owner: true,
  });
  expect(step.kind).toBe('phase');
});
