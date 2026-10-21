/**
 * Roadmap 3.0.20, step F4 — the Business view's map mode "As is / Fit to
 * standard" (owner decision 21.10.2026; concept §4.5).
 *
 * In the fit mode the map is the same reconstructed process: the given-up
 * steps greyed with their reason, every gap and candidate named on its step,
 * and a bridge drawn where the package's to-be BPMN removes a step
 * (`toBeSkeleton`). Without a design the as-is map stands alone, and the fit
 * map without entries is the as-is map byte for byte. Anchors are copied, never
 * produced.
 *
 * Server-free: the pure map over the shipped examples, and the switch rendered
 * with esbuild + renderToStaticMarkup.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFitToStandard, designFromReading } from '../lib/fit-to-standard-read';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { BRIDGE_NAME, buildFitMap, fitMapBridges } from '../lib/fit-to-standard-map';
import { toBeSkeleton } from '../lib/fit-to-standard-package';
import { buildReadingExports } from '../lib/bpmn/export';
import { parseBpmn } from '../lib/process-map';
import { readProcess } from '../lib/first-look';
import { FIT_DESIGN_HEADER, type FitEntry } from '../lib/fit-to-standard-design';
import { readExample } from './helpers/starter-example-files';

const OPTIONS = { processName: 'Stock', sourceFileName: 'Z_MATERIAL_STOCK_CALC.txt' };

function designOf(file: string) {
  const r = readFitToStandard({
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
  return designFromReading(r, false)!;
}

const traces = (xml: string) =>
  new Map(parseBpmn(xml).elements.map((e) => [e.id, e.trace ? `${e.trace.lineStart}-${e.trace.lineEnd}` : 'none']));

test('without entries the fit map is the as-is map, byte for byte', () => {
  const source = readExample('Z_MATERIAL_STOCK_CALC.txt');
  expect(buildFitMap(source, [], OPTIONS).xml).toBe(buildReadingExports(source, OPTIONS).bpmn.xml);
});

test('a real design: the given-up step greyed and named, the gaps named, every anchor kept', () => {
  const source = readExample('Z_MATERIAL_STOCK_CALC.txt');
  const design = designOf('Z_MATERIAL_STOCK_CALC.txt');
  const map = buildFitMap(source, design.entries, OPTIONS);
  const parsed = parseBpmn(map.xml);
  expect(map.givenUp.length).toBe(design.counts.givenUp);
  for (const id of map.givenUp) expect(parsed.elements.find((e) => e.id === id)!.name).toMatch(/^Given up: /);
  const open = Object.entries(map.disposition).filter(([, d]) => d === 'gap-open').map(([id]) => id);
  expect(open.length).toBeGreaterThan(0);
  for (const id of open) expect(parsed.elements.find((e) => e.id === id)!.name).toMatch(/^Gap — open: /);
  // A technical step keeps its own name.
  const technical = Object.entries(map.disposition).find(([, d]) => d === 'goes-with-program')![0];
  expect(parsed.elements.find((e) => e.id === technical)!.name).not.toMatch(/^Goes with the program/);
  // Same elements, same line anchors as the as-is map.
  const asIs = traces(buildReadingExports(source, OPTIONS).bpmn.xml);
  const fit = traces(map.xml);
  expect([...fit.keys()].sort()).toEqual([...asIs.keys()].sort());
  for (const [id, t] of asIs) expect(fit.get(id), id).toBe(t);
});

test('a given-up step with one flow in and one out is bridged, as the package bridges it', () => {
  const source = readExample('Z_MATERIAL_STOCK_CALC.txt');
  const skeleton = readProcess(source).skeleton;
  const protectedIds = new Set(skeleton.regions.flatMap((r) => [r.entryNodeId, r.endNodeId].filter(Boolean)));
  const step = skeleton.nodes.find(
    (n) => !protectedIds.has(n.id) && !n.expandsTo && skeleton.edges.filter((e) => e.to === n.id).length === 1 && skeleton.edges.filter((e) => e.from === n.id).length === 1,
  )!;
  expect(step, 'the example has a step with one flow in and one out').toBeTruthy();
  const entry: FitEntry = {
    elementId: step.id, label: step.label, plainLabel: null, kind: step.kind,
    anchor: step.anchor ? { lineStart: step.anchor.lineStart, lineEnd: step.anchor.lineEnd } : null,
    anchorBasis: step.anchor ? 'code' : 'unanchored', comparability: 'business-comparable', disposition: 'given-up',
    standardRef: null, evidenceLevel: 'E0', provenance: 'confirmed', why: 'Set by the account: given up.', gateClass: null, note: null,
  };
  // The package removes it from the to-be …
  expect(toBeSkeleton(skeleton, [entry]).nodes.some((n) => n.id === step.id)).toBe(false);
  // … and the map keeps it, greyed, with the bridge around it.
  const bridges = fitMapBridges(skeleton, [entry]);
  expect(bridges).toHaveLength(1);
  const map = buildFitMap(source, [entry], OPTIONS);
  expect(map.bridges).toHaveLength(1);
  const flow = parseBpmn(map.xml).flows.find((f) => f.id === map.bridges[0])!;
  expect(flow.label).toBe(BRIDGE_NAME);
  const elementOf = (node: string) => Object.entries(map.elementNode).filter(([, n]) => n === node).map(([id]) => id);
  expect(elementOf(bridges[0].from)).toContain(flow.sourceRef);
  expect(elementOf(bridges[0].to)).toContain(flow.targetRef);
  expect(map.givenUp).toEqual(elementOf(step.id).sort());
});

type Component = (props: Record<string, unknown>) => React.ReactElement | null;

async function load(file: string, name = 'default'): Promise<Component> {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'tmp', 'fit-map-mode', String(process.pid), `${path.basename(file)}.cjs`);
  await build({
    entryPoints: [path.join(root, file)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*', 'bpmn-js', 'bpmn-js/*'],
    alias: { '@': root },
    loader: { '.css': 'empty' },
    logLevel: 'silent',
  });
  return require(out)[name];
}

const STATE_COLOURS = /\b(?:bg|text|border)-cc-(?:success|error|warning|information)\b/;

test('the switch: absent without a design; "As is" draws the map as it was; "Fit to standard" names what changes', async () => {
  const View = await load('components/fit/FitMapMode.tsx', 'FitMapModeView');
  const design = designOf('Z_MATERIAL_STOCK_CALC.txt');
  const asIsMap = React.createElement('div', { 'data-as-is-map': '' });
  const none = renderToStaticMarkup(React.createElement(View, { mode: 'as-is', onMode: () => {}, design: null, stored: null, map: null }, asIsMap));
  expect(none).toBe('<div data-as-is-map=""></div>');

  const asIs = renderToStaticMarkup(React.createElement(View, { mode: 'as-is', onMode: () => {}, design, stored: null, map: null }, asIsMap));
  expect(asIs).toContain('data-fit-map-mode="as-is"');
  expect(asIs).toContain('>As is<');
  expect(asIs).toContain('>Fit to standard<');
  expect(asIs).toContain('data-as-is-map=""');

  const stored = { stale: false, kind: 'confirmation' };
  const fit = renderToStaticMarkup(React.createElement(View, { mode: 'fit', onMode: () => {}, design, stored, map: null }, asIsMap));
  expect(fit).toContain('data-fit-map-mode="fit"');
  expect(fit).not.toContain('data-as-is-map');
  expect(fit).toContain(FIT_DESIGN_HEADER);
  expect(fit).toContain('Bridge — standard');
  expect(fit).toContain('data-fit-map-loading=""');
  // The given-up step with its reason, the gaps with theirs.
  const givenUp = design.entries.find((e) => e.disposition === 'given-up')!;
  expect(fit).toMatch(new RegExp(`data-fit-map-list="given-up"[\\s\\S]*data-fit-map-row="${givenUp.elementId}"`));
  expect(fit).toContain(givenUp.why.replace(/'/g, '&#x27;'));
  expect(fit).toMatch(/data-fit-map-list="gaps"[\s\S]*data-fit-disposition="gap-open"/);
  // Dispositions are categories: no state colour on a mark (the provenance chip above them is the product's own).
  expect(fit.slice(fit.indexOf('data-fit-map-list'))).not.toMatch(STATE_COLOURS);
});

test('WorkspaceProcess only wraps its map in the mode switch — nothing else of it changed for this', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'workspace', 'WorkspaceProcess.tsx'), 'utf8');
  // The import (twice on its line), the opening tag, the closing tag.
  expect(src.match(/FitMapMode/g)).toHaveLength(4);
  expect(src).toContain("import FitMapMode from '@/components/fit/FitMapMode';");
  expect(src).toMatch(/<FitMapMode [^>]*>\s*<ProcessMap\b/);
  expect(src).toMatch(/canEdit=\{owner\}\s*\/>\s*<\/FitMapMode>/);
});
