import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { NAVIGATION_MESSAGES, navViewLabel } from '../lib/messages/navigation';
import { stageBackLabel, stageBackPlace } from '../lib/workspace-back-href';

/**
 * Two places, two names (owner, 06.10.2026: "we need two different terms —
 * 'back to workspace' (the project's workspace, e.g. its IT view) and back to
 * 'My workspace' (the list of all projects) — otherwise you lose track").
 *
 *   - **My workspace** — the list of all projects, `/dashboard`. A way back
 *     to it reads "Back to My workspace"; the object page adds "all projects".
 *   - **Project workspace** — one project's object page. A stage's way back
 *     reads "Back to project workspace · <project> · <view>".
 *
 * Until 06.10.2026 both read "Back to workspace" (the UX review of
 * 69b4f522e5ea had asked for one label for one target; there were two targets
 * under it). The words live in `lib/messages/navigation.ts`; this spec holds
 * every surface to them.
 */
const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Code only — comments may name the old label as history. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test('the two names are in the catalogue, and they differ', () => {
  expect(NAVIGATION_MESSAGES['nav.myWorkspace']).toBe('My workspace');
  expect(NAVIGATION_MESSAGES['nav.backToMyWorkspace']).toBe('Back to My workspace');
  expect(NAVIGATION_MESSAGES['nav.backToProjectWorkspace']).toBe('Back to project workspace');
  expect(NAVIGATION_MESSAGES['nav.backToProjectWorkspace']).not.toContain('My workspace');
  expect(navViewLabel('IT')).toBe('IT view');
});

test('no interface code says the ambiguous "Back to workspace" any more', () => {
  const offenders = ['app', 'components', 'lib', 'hooks']
    .flatMap((d) => sources(d))
    .filter((f) => /Back to [Ww]orkspace\b|Back to Dashboard|Go to Dashboard/.test(code(f)))
    .map((f) => f.replace(/\\/g, '/'));
  expect(offenders).toEqual([]);
});

test('a stage names the project and the view it returns to', () => {
  expect(stageBackLabel({ projectName: 'Order limit check', search: '?view=it&layer=need' })).toEqual({
    lead: 'Back to project workspace',
    project: 'Order limit check',
    place: 'IT view, Need & process',
  });
  // Nothing read yet, nothing in the address: the lead alone, never a guess.
  expect(stageBackLabel({ projectName: '  ', search: '' })).toEqual({
    lead: 'Back to project workspace',
    project: null,
    place: null,
  });
  expect(stageBackPlace('?view=management')).toBe('Management view');
});

test('the stage header and footer both draw the project label', () => {
  for (const rel of ['components/StageHeader.tsx', 'components/StageFooter.tsx']) {
    const src = code(rel);
    expect(src, rel).toContain('<StageBackText');
    expect(src, rel).toContain('useShellProjectName(');
  }
  expect(read('components/StageBackText.tsx')).toContain('stageBackLabel(');
});

test('every way back to the list says "My workspace"', () => {
  for (const rel of ['app/(app)/settings/page.tsx', 'app/(app)/admin/page.tsx']) {
    expect(code(rel), rel).toMatch(
      /<CcLinkButton href="\/dashboard"[\s\S]{0,200}?>\s*\{nav\('nav\.backToMyWorkspace'\)\}\s*<\/CcLinkButton>/,
    );
  }
  expect(code('components/BackLink.tsx')).toContain("nav('nav.backToMyWorkspace')");
  const shell = code('components/workspace/WorkspaceShell.tsx');
  expect(shell).toMatch(/href="\/dashboard"[\s\S]{0,200}?data-workspace-back=""[\s\S]{0,300}?wt\('nav\.backToMyWorkspace'\)[\s\S]{0,200}?wt\('nav\.allProjects'\)/);
  expect(code('app/(app)/layout.tsx')).toContain("nav('nav.myWorkspace')");
});
