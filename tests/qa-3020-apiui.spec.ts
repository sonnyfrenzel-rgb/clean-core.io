import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { readExample } from './helpers/starter-example-files';

/**
 * QA review of ee72ca2218e1 — the confirmed findings in the app shell, the
 * guided tour and the plain wording.
 *
 * Server-free: the tour layer is bundled and rendered to static markup; what
 * only an effect does in a browser is held in its source.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

async function load(rel: string, name = 'default'): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(ROOT, 'tmp', 'qa-3020-apiui', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*', 'bpmn-js/lib/*'],
    loader: { '.css': 'empty' },
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out)[name];
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function poModel() {
  const file = 'Z_MM_PO_APPROVAL.abap';
  const source = readExample(file).replace(/\r\n/g, '\n');
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  return buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file });
}

// 574eeb25ba76: until Firebase has answered, `signedIn` is undefined — the first
// render (and the server's) showed a signed-out visitor the account menu.
test('the shell shows the account menu only once someone is known to be signed in', () => {
  const layout = read('app/(app)/layout.tsx');
  const signIn = layout.indexOf('{signedIn === false ? (');
  const menu = layout.indexOf('<div ref={accountMenuRootRef}');
  expect(signIn).toBeGreaterThan(-1);
  expect(menu).toBeGreaterThan(signIn);
  expect(layout.slice(signIn, menu)).toContain(') : signedIn === true ? (');
});

// 600ec626d07e: a tour that could not be read left the demo's dialog on "Reading …" for ever.
test.describe('a tour that cannot be read says so', () => {
  test('the layer says the tour is unavailable in place of the endless "Reading …"', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    const model = poModel();
    const waiting = textOf(renderToStaticMarkup(React.createElement(Layer, { tour: null, model, onClose: () => {} })));
    expect(waiting).toContain('Reading the steps out of the code');
    const html = renderToStaticMarkup(React.createElement(Layer, { tour: null, unavailable: true, model, onClose: () => {} }));
    expect(html).toContain('data-tour-unavailable=""');
    expect(textOf(html)).toContain('The tour could not be read in this browser.');
    expect(textOf(html)).not.toContain('Reading the steps out of the code');
  });

  test('the demo catches a failed read and hands it to the layer', () => {
    const demo = read('components/demo/DemoWalkThrough.tsx');
    expect(demo).toMatch(/import\('@\/lib\/process-tour'\)\]\)\s*\.then\([\s\S]*?\.catch\(\(\) => \{\s*if \(!cancelled\) setFailed\(true\);/);
    expect(demo).toContain('unavailable={failed}');
  });
});

// 2e0ee3d64bc0: the viewer's chunk was loaded outside the try that caught only the file's import.
test('the tour map catches a viewer that does not load, not only a file it cannot read, and says so', () => {
  const canvas = read('components/process-map/TourCanvas.tsx');
  const tryAt = canvas.indexOf('try {', canvas.indexOf('/* The viewer, once per file. */'));
  const importAt = canvas.indexOf("await import('bpmn-js/lib/NavigatedViewer')");
  const catchAt = canvas.indexOf('} catch {', tryAt);
  expect(tryAt).toBeGreaterThan(-1);
  expect(importAt).toBeGreaterThan(tryAt);
  expect(catchAt).toBeGreaterThan(importAt);
  expect(canvas.slice(catchAt, catchAt + 80)).toContain('setFailedXml(xml)');
  expect(canvas).toContain("wt('walk.mapUnavailable')");
});

// 8c9ffb81cce2: the "once per project and digest in this browser session" guard lived in a ref and was lost on unmount.
test('the plain wording asks once per project, scope and digest in the session, across unmounts', () => {
  const hook = read('hooks/usePlainWording.ts');
  const body = hook.slice(hook.indexOf('export function usePlainWording'));
  expect(body).not.toMatch(/useRef/);
  expect(hook.slice(0, hook.indexOf('export function usePlainWording'))).toMatch(/^const askedThisSession = new Set<string>\(\);$/m);
  expect(body).toContain('takeFirstAsk(askedThisSession, projectId, scope, digest)');
});

// f6d530d587c6: the process summary was counted again on every project snapshot.
test('the workspace counts the process summary again only when its inputs change', () => {
  const shell = read('components/workspace/WorkspaceShell.tsx');
  const at = shell.indexOf("void import('@/lib/bpmn/reading-exports-client')");
  expect(at).toBeGreaterThan(-1);
  const deps = /\}, \[([^\]]*)\]\);/.exec(shell.slice(at))![1];
  expect(deps.split(',').map((d) => d.trim())).toEqual(['summarySource', 'summaryFileName', 'summaryName', 'summaryEngine']);
  expect(shell).toContain('const summaryEngine = JSON.stringify(engineStampOf(project));');
});
