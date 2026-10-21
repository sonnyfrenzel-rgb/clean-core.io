/**
 * Roadmap 3.0.20, step F4 — the fit-to-standard design on screen
 * (`docs/design/fit-to-standard-concept.md` §4.5, §8 F4).
 *
 * Acceptance: the offer only where the gate offers (Business and Management show
 * nothing otherwise, the IT view names the reason with its lines); every
 * disposition has a word and a mark, never colour only, and never a state
 * colour; the header sentence is present; the three lists stand in the reading
 * order a phone keeps (one column: give up, standard, gaps).
 *
 * Server-free: the components are bundled with esbuild and rendered to static
 * markup over the engine's real design of the shipped key-user example. The
 * Business view's map mode is not part of this step (another agent owns the
 * Business view's process components in this cycle).
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFitToStandard, designFromReading } from '../lib/fit-to-standard-read';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { FIT_DESIGN_HEADER, FIT_DISPOSITIONS, FIT_DISPOSITION_LABELS } from '../lib/fit-to-standard-design';
import type { FitToStandardGate } from '../lib/fit-to-standard-gate';
import { readExample } from './helpers/starter-example-files';

type Component = (props: Record<string, unknown>) => React.ReactElement | null;

async function load(file: string, name = 'default'): Promise<Component> {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'tmp', 'fit-to-standard-display', String(process.pid), `${path.basename(file)}.cjs`);
  await build({
    entryPoints: [path.join(root, file)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': root },
    logLevel: 'silent',
  });
   
  return require(out)[name];
}

function readingOf(file: string) {
  return readFitToStandard({
    source: readExample(file),
    fileName: file,
    edition: 'public',
    catalogSnapshot: catalogSnapshotKeyForProject({ s4Deployment: 'public' }),
    engineVersion: 'v3.0.19',
    mode: 'demo',
    hasRun: true,
    analyzeState: 'done',
    signedSourceSha256: null,
  });
}

const STATE_COLOURS = /\b(?:bg|text|border)-cc-(?:success|error|warning|information)\b/;

test('the design: header sentence, three lists in reading order, every disposition a word and a mark', async () => {
  const View = await load('components/fit/FitToStandardView.tsx');
  const r = readingOf('Z_SD_DELIVERY_PRIORITY.abap');
  const design = designFromReading(r, false)!;
  const html = renderToStaticMarkup(React.createElement(View, { gate: r.gate, design, stored: null, isOwner: true }));
  expect(html).toContain(FIT_DESIGN_HEADER);
  expect(html).toContain('data-fit-state="preview"');
  const order = ['data-fit-list="given-up"', 'data-fit-list="standard"', 'data-fit-list="gaps"'].map((m) => html.indexOf(m));
  expect(order.every((i) => i > 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // Every mark carries its word.
  const marks = [...html.matchAll(/data-fit-disposition="([a-z-]+)"[\s\S]*?<\/span><\/span>/g)];
  expect(marks.length).toBeGreaterThan(0);
  for (const [whole, d] of marks) expect(whole).toContain(FIT_DISPOSITION_LABELS[d as keyof typeof FIT_DISPOSITION_LABELS].label);
  // Categorical swatches only — no state colour anywhere in the panel's dispositions.
  for (const [whole] of marks) expect(whole).not.toMatch(STATE_COLOURS);
  // The candidate says it is one.
  expect(html).toContain("from SAP&#x27;s catalog — to verify");
  // The key-user gap on the BAdI, with its lines.
  expect(html).toMatch(/data-fit-entry="deviation-L49"[\s\S]*?L49–L81/);
  // An owner with no stored design is offered to make one, not to confirm one.
  expect(html).toContain('data-fit-make=""');
  expect(html).not.toContain('data-fit-confirm=""');
});

test('every disposition renders with its label and mark', async () => {
  const Mark = await load('components/fit/FitToStandardView.tsx', 'FitDispositionMark');
  for (const d of FIT_DISPOSITIONS) {
    const html = renderToStaticMarkup(React.createElement(Mark, { disposition: d }));
    expect(html).toContain(FIT_DISPOSITION_LABELS[d].label);
    expect(html).toContain(`>${FIT_DISPOSITION_LABELS[d].mark.replace('&', '&amp;')}<`);
    expect(html).not.toMatch(STATE_COLOURS);
  }
});

test('a design against the gate says so; a reader sees no buttons; a stored design is confirmed by the owner', async () => {
  const View = await load('components/fit/FitToStandardView.tsx');
  const r = readingOf('Z_SD_FREIGHT_RATE_CHECK.abap');
  const design = designFromReading(r, true)!;
  const stored = { revision: 1, kind: 'engine', stale: false, createdAt: '2026-10-21T10:00:00.000Z', createdBy: 'Owner' };
  const owner = renderToStaticMarkup(React.createElement(View, { gate: r.gate, design, stored, isOwner: true }));
  expect(owner).toContain('data-fit-against-gate=""');
  expect(owner).toContain('never counts as a recommendation');
  expect(owner).toContain('data-fit-confirm=""');
  expect(owner).toContain('data-fit-choice=');
  const reader = renderToStaticMarkup(React.createElement(View, { gate: r.gate, design, stored, isOwner: false }));
  expect(reader).not.toContain('data-fit-confirm');
  expect(reader).not.toContain('data-fit-choice=');
  const none = renderToStaticMarkup(React.createElement(View, { gate: r.gate, design: null, stored: null, isOwner: true }));
  expect(none).toContain('data-fit-make-against=""');
  expect(none).toContain('data-fit-gate-reason=""');
});

test('the offer card stands only where the gate offers; IT names the reason with its lines', async () => {
  const Offer = await load('components/fit/FitToStandardOffer.tsx', 'FitOfferCard');
  const offered = readingOf('Z_SD_DELIVERY_PRIORITY.abap').gate;
  const notOffered = readingOf('Z_SD_FREIGHT_RATE_CHECK.abap').gate;
  const notDetermined: FitToStandardGate = { outcome: 'not-determined', missing: 'no-run', reason: 'No signed run yet.', signals: [] };
  expect(renderToStaticMarkup(React.createElement(Offer, { gate: offered, href: '/x', confirmed: null }))).toContain('data-fit-offer-card="offered"');
  expect(renderToStaticMarkup(React.createElement(Offer, { gate: notOffered, href: '/x', confirmed: null }))).toBe('');
  expect(renderToStaticMarkup(React.createElement(Offer, { gate: notDetermined, href: '/x', confirmed: null }))).toBe('');
  const card = renderToStaticMarkup(React.createElement(Offer, { gate: offered, href: '/x', confirmed: null }));
  expect(card).not.toMatch(/covered by|verified/i);

  const Reason = await load('components/fit/FitGateReason.tsx', 'FitGateReasonLine');
  const it = renderToStaticMarkup(React.createElement(Reason, { gate: notOffered, designHref: '/x' }));
  expect(it).toContain('data-fit-gate="not-offered"');
  expect(it).toMatch(/integration[\s\S]*\(L\d+/);
  expect(it).toContain('never the score');
});
