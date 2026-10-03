import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createDraftHolder, draftFor, type HeldDraft } from '../lib/process-map-draft';

/**
 * An unsaved drawing belongs to one project's process, not to a source text —
 * QA review of 072f79996d01 (2a9ed7cf905b).
 *
 * The draft carried only the ABAP it was drawn on. Duplicate (My workspace)
 * creates a second project with byte-identical source, so a ProcessMap kept
 * alive across the two would open project A's unsaved drawing in project B,
 * and Save would write it there as B's edited revision. The draft now names
 * its project as well, and the editor is keyed on it.
 */

const SOURCE = 'REPORT z_po_approval.\nIF lv_amount > 5000.\nENDIF.';
const held: HeldDraft = { projectId: 'project-a', source: SOURCE, xml: '<bpmn:definitions id="drawn-on-a"/>' };

test('the draft opens in the project and source it was drawn on', () => {
  expect(draftFor(held, 'project-a', SOURCE)).toBe(held.xml);
});

test('a duplicate with the same source does not open the original project\'s drawing', () => {
  expect(draftFor(held, 'project-b', SOURCE)).toBeNull();
});

test('a different source in the same project is not this draft either', () => {
  expect(draftFor(held, 'project-a', `${SOURCE}\n* changed`)).toBeNull();
  expect(draftFor(null, 'project-a', SOURCE)).toBeNull();
});

/**
 * The props of the first `<Name …/>` element. A generic such as
 * `useRef<ProcessMapModel | null>` also starts with `<ProcessMap`, so the tag
 * has to be followed by whitespace or the end of the tag.
 */
function jsxOf(src: string, name: string): string {
  const at = src.search(new RegExp(`<${name}(?=[\\s/>])`));
  expect(at, `no <${name}> element`).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf('/>', at));
}

test('ProcessMap holds the draft through it and keys the editor on the project', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'process-map', 'ProcessMap.tsx'), 'utf8');
  expect(src).toContain('draftFor(drafts.get(), projectId, source)');
  expect(src).toContain('drafts.set({ projectId, source, xml })');
  expect(src).toMatch(/key=\{`\$\{session\}\|\$\{projectId \?\? ''\}\|\$\{source\}`\}/);
  // Both screens with an editor hand their project in.
  for (const rel of ['components/workspace/WorkspaceProcess.tsx', 'app/(app)/project/[projectId]/documentation/page.tsx']) {
    const screen = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    const map = jsxOf(screen, 'ProcessMap');
    expect(map, `${rel} does not tell the map which project it shows`).toMatch(/\bprojectId=\{/);
  }
});

/**
 * Codex code-ui-03: the workspace drops the map when the reader switches to IT
 * or Management and remounts it across the phone breakpoint. A draft held only
 * inside the map died with it, unasked; the shell now holds it.
 */
test('a draft held by the caller outlives the map that drew it', () => {
  const holder = createDraftHolder();
  // The first map keeps a drawing, then is unmounted (the view switch).
  holder.set(held);
  // The map mounted on the way back opens it — and only in its own project.
  expect(draftFor(holder.get(), 'project-a', SOURCE)).toBe(held.xml);
  expect(draftFor(holder.get(), 'project-b', SOURCE)).toBeNull();
  holder.set(null);
  expect(holder.get()).toBeNull();
  // Two holders are two drafts: a map without a caller's holder shares nothing.
  expect(createDraftHolder().get()).toBeNull();
});

test('the workspace holds the draft above the view switch and hands it down to the map', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
  const shell = read('components/workspace/WorkspaceShell.tsx');
  const holderAt = shell.indexOf('useState(createDraftHolder)');
  expect(holderAt, 'the shell keeps no draft, so a view switch discards it').toBeGreaterThan(-1);
  const mount = shell.slice(shell.indexOf('<WorkspaceProcess'), shell.indexOf('/>', shell.indexOf('<WorkspaceProcess')));
  expect(mount, 'the shell does not hand its draft to the process block').toMatch(/\bdraftHolder=\{processDraft\}/);

  const process = read('components/workspace/WorkspaceProcess.tsx');
  const map = jsxOf(process, 'ProcessMap');
  expect(map, 'the process block does not pass the draft on to the map').toMatch(/\bdraftHolder=\{draftHolder\}/);

  const pm = read('components/process-map/ProcessMap.tsx');
  expect(pm).toContain('const drafts = draftHolder ?? ownDraft;');
});
