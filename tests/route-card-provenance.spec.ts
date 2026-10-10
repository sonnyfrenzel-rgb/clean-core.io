import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RouteCardProps } from '../components/analyze/RouteCard';

/**
 * The route card's provenance chip says what the card shows (QA b1add7227503).
 *
 * With no route on record the card says "Not determined"; the chip beside it
 * used to say "Reconstructed · fixed rules" all the same, so one card claimed
 * both that no route was determined and that one was reconstructed.
 *
 * Rendered, not grepped: bundled with esbuild and rendered with the real React,
 * the pattern of `tests/findings-focus-names.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'route-card-provenance');

let RouteCard: (props: RouteCardProps) => React.ReactElement;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'analyze', 'RouteCard.tsx')],
    outfile: path.join(OUT, 'RouteCard.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  RouteCard = require(path.join(OUT, 'RouteCard.cjs')).default as typeof RouteCard;
});

const base: RouteCardProps = {
  route: null,
  overridden: false,
  confidence: null,
  rationale: null,
  derived: null,
  notRecorded: [],
  decideHref: '/project/p?view=management',
};

const chips = (html: string) => [...html.matchAll(/data-provenance="([^"]+)"/g)].map((m) => m[1]);

test('no route on record: the chip says not determined, never reconstructed', () => {
  const html = renderToStaticMarkup(React.createElement(RouteCard, base));
  expect(html).toContain('Not determined');
  expect(chips(html)).not.toContain('reconstructed');
  expect(chips(html)).toContain('not-determined');
});

test('a recommended route keeps its reconstructed chip; a chosen one says confirmed', () => {
  const recommended = renderToStaticMarkup(React.createElement(RouteCard, { ...base, route: 'In-App (ABAP Cloud)' }));
  expect(chips(recommended)).toContain('reconstructed');
  const chosen = renderToStaticMarkup(React.createElement(RouteCard, {
    ...base, route: 'Side-by-Side (SAP BTP)', overridden: true, recommended: 'In-App (ABAP Cloud)',
  }));
  expect(chips(chosen)).toContain('confirmed');
});
