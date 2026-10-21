import { test, expect } from '@playwright/test';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Owner report 21.10.2026: while Design writes the solution design, "Open the requirements workspace" was a live
 * link — a click left the page and cut the run off. While it runs, the entry card shows the button disabled with its
 * reason under it; otherwise it is the link. Server-free: the card is bundled and rendered to static markup.
 */
async function loadCard(): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'tmp', 'requirements-entry-wait', String(process.pid), 'RequirementsEntryCard.cjs');
  await build({
    entryPoints: [path.join(root, 'components', 'requirements', 'RequirementsEntryCard.tsx')],
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

const render = async (waitFor: string | null) => {
  const Card = await loadCard();
  return renderToStaticMarkup(React.createElement(Card, { href: '/project/p1/design/requirements', state: { kind: 'not-started' }, waitFor }));
};

test('while the design is written, the workspace button is disabled and says why', async () => {
  const html = await render('The solution design is being written.');
  expect(html).toContain('data-spec-open-wait');
  expect(html).toMatch(/<button[^>]*disabled/);
  expect(html).toContain('The solution design is being written.');
  expect(html).not.toContain('href="/project/p1/design/requirements"');
});

test('otherwise it is the link to the workspace', async () => {
  const html = await render(null);
  expect(html).toContain('href="/project/p1/design/requirements"');
  expect(html).not.toContain('data-spec-open-wait');
});
