import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { draftFor, type HeldDraft } from '../lib/process-map-draft';

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

test('ProcessMap holds the draft through it and keys the editor on the project', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'process-map', 'ProcessMap.tsx'), 'utf8');
  expect(src).toContain('draftFor(draftRef.current, projectId, source)');
  expect(src).toContain('draftRef.current = { projectId, source, xml }');
  expect(src).toMatch(/key=\{`\$\{session\}\|\$\{projectId \?\? ''\}\|\$\{source\}`\}/);
  // Both screens with an editor hand their project in.
  for (const rel of ['components/workspace/WorkspaceProcess.tsx', 'app/(app)/project/[projectId]/documentation/page.tsx']) {
    const screen = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    const map = screen.slice(screen.indexOf('<ProcessMap'), screen.indexOf('/>', screen.indexOf('<ProcessMap')));
    expect(map, `${rel} does not tell the map which project it shows`).toMatch(/\bprojectId=\{/);
  }
});
