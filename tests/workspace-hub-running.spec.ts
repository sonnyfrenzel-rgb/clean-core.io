import { test, expect } from '@playwright/test';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Owner report 21.10.2026: while the start run of a new project is with the server (the first insights, the
 * narrative being written), the workspace's "Continue with" card offered "Run the analysis" with a button — the
 * reader only has to wait. `NextStepCard` already said so for `point.running`; the hub's card did not. Server-free:
 * the component is bundled and rendered to static markup.
 */
async function loadHub(): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'tmp', 'workspace-hub-running', String(process.pid), 'WorkspaceHub.cjs');
  await build({
    entryPoints: [path.join(root, 'components', 'workspace', 'WorkspaceHub.tsx')],
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

const analyze = { key: 'analyze', label: 'Analyze', action: 'Run the analysis', path: 'analyze', reason: 'Reads the code and signs a run.' };

async function render(running: boolean): Promise<string> {
  const Hub = await loadHub();
  const point = running ? { ...analyze, running: true } : analyze;
  return renderToStaticMarkup(
    React.createElement(Hub, {
      projectId: 'p1',
      step: { kind: 'phase', point },
      tools: [],
      onViewChange: () => {},
      toolsRow: null,
      statusFold: null,
    }),
  );
}

test('while the start run is running, "Continue with" says to wait and offers no button', async () => {
  const html = await render(true);
  expect(html).toContain('data-workspace-hub-next-state="running"');
  expect(html).toContain('The analysis is running.');
  expect(html).not.toContain('data-workspace-hub-next-action');
});

test('once nothing runs, Analyze is offered with its button', async () => {
  const html = await render(false);
  expect(html).toContain('data-workspace-hub-next-state="open"');
  expect(html).toContain('data-workspace-hub-next-action');
});
