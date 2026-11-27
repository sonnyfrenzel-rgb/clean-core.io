import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Journey review 26.11.2026 (walk-through findings 4–11): no page ends without a way on, no headline says "ready" over
 * a closed button, one destination has one label, and no copy treats Business, IT or Management as a person or a
 * department (owner: the three views are perspectives of one user). A view named as the place where something
 * stands ("in the IT view") is navigation and stays; the decision is taken on the Decide page, not in a view. Server-free
 * source guards; the pure parts' behaviour is covered in `redesign-way-on.spec.ts` and `delivery-next.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test.describe('every page has a way on', () => {
  test('Analyze IT: the card carries "Re-design this program" as its primary, for the owner of an analysed program', () => {
    const src = code('components/analyze/AnalyzeIt.tsx');
    expect(src).toMatch(/owner && hasRun \? \(\s*<CcLinkButton href=\{redesignPageHref\(projectId\)\} variant="primary" data-analyze-it-redesign="">\s*Re-design this program/);
  });

  test('Analyze Business without a map: the owner is led to the re-run, never left on a sentence alone', () => {
    const src = code('components/workspace/WorkspaceProcess.tsx');
    expect(src).toMatch(/absence === 'no-run' \|\| !owner \? undefined : \(\s*<CcLinkButton href=\{myWorkspaceHref\(\)\} variant="primary" data-workspace-process-rerun="">/);
  });

  test('Design, Management: the decided option and its next action, never "Confirm target", a checklist or a closed button (ADR-145 (4))', () => {
    const src = code('app/(app)/project/[projectId]/design/page.tsx');
    // An older, unstructured design says so and offers the rewrite.
    expect(src).toContain('const olderForm = !outside && Boolean(design) && !designStructured;');
    expect(src.indexOf('data-design-rewrite-older')).toBeGreaterThan(0);
    // Undecided: the way to the decision; decided and unwritten: the way to write it; "Change target" only for a route on record.
    expect(src).toContain('data-design-decide=""');
    expect(src).toContain('data-design-write-link=""');
    expect(src).toMatch(/recorded && isOwner && !outside && optionOfArchitecture\(project\?\.targetArchitecture\) === 'rebuild' \? \(\s*<DesignConfirmTarget[\s\S]*?locked=\{true\}/);
    expect(src).not.toContain("'Ready for your confirmation.'");
    expect(src).not.toContain('designSignOffChecklist(');
    expect(src).not.toContain('<DesignOptions');
    // The client gate is gone: the sign-off panel waits for no written design.
    expect(src).not.toMatch(/\bcanSignOff\b(?!=)/);
    expect(src).toContain('const signOffPanel = isOwner ? (');
  });
});

test.describe('one destination, one label', () => {
  test('the decision is "Open the decision" wherever it is linked', () => {
    for (const f of ['components/economics/EconomicsGuardRail.tsx', 'components/tco/EconomicsObjectPage.tsx', 'app/(app)/project/[projectId]/design/page.tsx']) {
      const src = code(f);
      expect(src, f).not.toContain('Take the decision in Re-design');
      expect(src, f).not.toContain('Open the decision in Re-design');
    }
  });
});

test.describe('the views are perspectives, not people', () => {
  const FILES = [
    'lib/messages/rule-questions.ts',
    'components/analyze/AnalyzeIt.tsx',
    'lib/handover.ts',
    'app/(app)/project/[projectId]/design/page.tsx',
    'lib/messages/workspace-decision.ts',
    'lib/decision-option-signals.ts',
    'lib/family-frame.ts',
    'app/(app)/project/[projectId]/documentation/page.tsx',
    'components/redesign/RedesignPage.tsx',
    'components/redesign/DecideView.tsx',
    'components/redesign/DecideResult.tsx',
    'lib/decide.ts',
    'lib/messages/workspace.ts',
    'lib/messages/analyze-business.ts',
    'lib/messages/transformation.ts',
  ];
  const BANNED = [
    'IT checks',
    'decided in Management',
    '(Management view)',
    'Check in the IT view',
    'Decide in the Management view',
    'Confirm a new one in the Management view',
    'IT has its own questions',
    'every reader: business, IT and management',
    'the manager and the developer',
    'Back to Analyze, Management',
    'Owner · ',
  ];
  for (const f of FILES) {
    test(`no audience copy in ${f}`, () => {
      const src = code(f);
      for (const b of BANNED) expect(src, `${f}: ${b}`).not.toContain(b);
    });
  }
});
