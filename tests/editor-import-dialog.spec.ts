import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build, type Plugin } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * The BPMN import dialog — QA review of 072f79996d01.
 *
 *   - d23296b6105b: opening or saving an imported file replaces the drawing in
 *     the editor. With unsaved changes on the canvas the dialog now says so
 *     before the reader chooses; without any, it says nothing.
 *   - 80de4986a4ce: a refused save is an error with the Save button still there
 *     to retry, not a neutral line in place of the button.
 *
 * Rendered with the real React and the real EditorImport. `CcDialog` portals
 * to `document.body` after hydration, which a server render has neither of,
 * so the bundle swaps it for a stand-in that renders its title, body and
 * actions in place — what is asserted is EditorImport's own markup.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'editor-import-dialog');

const dialogStandIn: Plugin = {
  name: 'dialog-stand-in',
  setup(b) {
    b.onResolve({ filter: /components\/cc\/Dialog$/ }, () => ({ path: 'dialog-stand-in', namespace: 'stand-in' }));
    b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
      contents:
        "import React from 'react';" +
        'export default function Dialog({ title, children, actions, ...rest }) {' +
        "  return React.createElement('div', { 'data-dialog': rest['data-editor-import'] }, title, children, React.createElement('footer', null, actions));" +
        '}',
      loader: 'jsx',
      resolveDir: ROOT,
    }));
  },
};

type Dialog = (props: Record<string, unknown>) => React.ReactElement;
let EditorImport: Dialog;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'process-map', 'EditorImport.tsx')],
    outfile: path.join(OUT, 'EditorImport.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    plugins: [dialogStandIn],
    logLevel: 'silent',
  });
  EditorImport = require(path.join(OUT, 'EditorImport.cjs')).default as Dialog;
});

const OUTCOME = {
  ok: true,
  xml: '<bpmn:definitions/>',
  summary: {
    flowNodes: 4,
    anchored: 3,
    outside: 1,
    matchedByName: 0,
    droppedClaims: 0,
    cleaned: 0,
    diff: { identical: false, summary: '1 added', added: [{ id: 'T1', kind: 'Task', label: 'Check', anchor: null }], changed: [], removed: [] },
  },
};

const base = {
  open: true,
  fileName: 'process.bpmn',
  outcome: OUTCOME,
  saving: false,
  saved: null,
  onClose: () => {},
  onOpenInEditor: () => {},
  onSave: () => {},
};

const render = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(EditorImport, { ...base, ...props }));

test('with unsaved changes in the editor, the dialog says the file replaces them', () => {
  const html = render({ replacesUnsaved: true });
  expect(html).toContain('data-editor-import-replaces');
  expect(html).toContain('replaces your unsaved changes');
});

test('with nothing unsaved, it says nothing about it', () => {
  expect(render({ replacesUnsaved: false })).not.toContain('data-editor-import-replaces');
});

test('a refused save is an error, and Save is still there to try again', () => {
  const html = render({ refused: 'The process moved on: revision 3 was saved meanwhile.' });
  expect(html).toContain('data-editor-import-refused');
  expect(html).toContain('revision 3 was saved meanwhile');
  expect(html).toContain('data-editor-import-save');
  expect(html).not.toContain('data-editor-import-saved');
});

test('a kept save closes the choice: the saved line, and no second Save', () => {
  const html = render({ saved: 'Saved as revision 4.' });
  expect(html).toContain('data-editor-import-saved');
  expect(html).not.toContain('data-editor-import-save=');
});

test('the editor tells the dialog about unsaved changes and keeps a refusal apart from a save', () => {
  const src = fs.readFileSync(path.resolve(ROOT, 'components', 'process-map', 'BpmnEditor.tsx'), 'utf8');
  expect(src).toMatch(/replacesUnsaved=\{dirty\}/);
  expect(src).toMatch(/refused=\{importing\.refused\b/);
  // A refused save does not set `saved` — that is what removed the Save button.
  expect(src).toContain('result.ok ? { ...was, saved: result.message, refused: null } : { ...was, refused: result.message }');
});
