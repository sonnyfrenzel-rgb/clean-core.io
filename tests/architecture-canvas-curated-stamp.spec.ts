import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ArchitectureCanvasModel, CanvasSuccessor } from '../lib/architecture-canvas';
import { SAP_API_CATALOG_REVIEWED, SAP_API_CATALOG_VERSION } from '../lib/abap/sap-api-catalog';

/**
 * A curated successor carries the catalog's review stamp on the architecture
 * canvas, in both forms of it — QA leftovers of hotfix 2 (roadmap 3.0.13). The
 * curated layer is hand-written for one release and refreshed by no sync, and
 * wherever a hit in it is shown its release is shown with it
 * (`SAP_API_CATALOG_STAMP`); the canvas said "curated" and no more.
 *
 * Rendered, not grepped: bundled with esbuild and rendered with the real React,
 * the pattern of `tests/option-comparison-provenance.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'architecture-canvas-curated-stamp', String(process.pid));

type Canvas = (props: { model: ArchitectureCanvasModel; targetLine: string; description: string }) => React.ReactElement;
let ArchitectureCanvas: Canvas;
let ArchitectureList: Canvas;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'design', 'ArchitectureCanvas.tsx')],
    outfile: path.join(OUT, 'ArchitectureCanvas.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  const mod = require(path.join(OUT, 'ArchitectureCanvas.cjs'));
  ArchitectureCanvas = mod.default as Canvas;
  ArchitectureList = mod.ArchitectureList as Canvas;
});

const successor = (name: string, confidence: string | null): CanvasSuccessor => ({
  key: `succ:${name}`,
  name,
  tag: 'cds',
  type: 'CDS View',
  replaces: ['AUFK'],
  lines: [4],
  findingIds: ['f1'],
  confidence,
});

const model = (successors: CanvasSuccessor[]): ArchitectureCanvasModel => ({
  route: 'in-app-rap',
  deviation: false,
  successors,
  successorUses: successors.length,
  gaps: [],
  customTables: [],
  fileTransfers: [],
  drivers: [],
  driverPhrases: [],
  runtime: null,
  targetArtifact: null,
});

const render = (C: Canvas, m: ArchitectureCanvasModel) =>
  renderToStaticMarkup(React.createElement(C, { model: m, targetLine: 'SAP Cloud ERP Private', description: 'canvas' }));
const stamps = (html: string) => (html.match(/data-curated-stamp=""/g) ?? []).length;

test('a curated successor carries the review stamp in the drawing and in the list', () => {
  const m = model([successor('I_ManufacturingOrder', 'Verified'), successor('I_ProductionOrderComponent', 'Catalog Match')]);
  const wide = render(ArchitectureCanvas, m);
  // Both forms are in the markup (the CSS picks one by width): one stamp each.
  expect(stamps(wide)).toBe(2);
  expect(wide).toContain(`compiled for ${SAP_API_CATALOG_VERSION}, reviewed ${SAP_API_CATALOG_REVIEWED}; not synced from SAP`);
  const list = render(ArchitectureList, m);
  expect(stamps(list)).toBe(1);
  // The list marks which successor is the curated one, as the drawing does.
  expect(list).toMatch(/AUFK[\s\S]*?· curated/);
});

test('a canvas of SAP catalog successors only carries no curated stamp', () => {
  const m = model([successor('I_ProductionOrderComponent', 'Catalog Match')]);
  expect(stamps(render(ArchitectureCanvas, m))).toBe(0);
  expect(render(ArchitectureList, m)).not.toContain('curated');
});
