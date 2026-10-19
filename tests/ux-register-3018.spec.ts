import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Release 3.0.18, item 11 — the UX register entries scheduled to "3.0.18",
 * each held from the source, without a server. Each test names the entries it
 * closes; the rendered half (the pages these lines draw) is listed in the
 * release notes for a run against a build.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Source without comments — prose may name what code must not do. */
const code = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const ANALYZE = 'app/(app)/project/[projectId]/analyze/page.tsx';
const DOCUMENTATION = 'app/(app)/project/[projectId]/documentation/page.tsx';

test('UX-006: the model summary’s line anchors open the source', () => {
  const narrative = code('components/analyze/AnchoredNarrative.tsx');
  expect(narrative).toMatch(/onOpenLine\?: \(line: number\) => void;/);
  expect(narrative).toMatch(/onOpen=\{onOpenLine \? \(\) => onOpenLine\(a\.lineStart\) : undefined\}/);
  const page = code(ANALYZE);
  const at = page.indexOf('<AnchoredNarrative');
  const block = page.slice(at, page.indexOf('/>', at));
  expect(block, 'the summary is mounted without the way into the code').toContain('onOpenLine={legacyCode && sourceLines > 0 ? openSourceLine : undefined}');
});

test('UX-011: one list, one name, whatever its count', () => {
  const src = code('components/analyze/ConstructFindings.tsx');
  expect(src).not.toContain('Construct Findings');
  expect(src.match(/Statically Identified Constructs/g) ?? []).toHaveLength(2);
});

test('UX-013, UX-134, UX-165: Start Analysis says on the page why it is closed', () => {
  const page = code(ANALYZE);
  const reasonAt = page.indexOf('const startBlockedReason');
  expect(reasonAt, 'no single reason for a closed Start').toBeGreaterThan(-1);
  const reason = page.slice(reasonAt, page.indexOf(': null;', reasonAt));
  // A missing target model closes the button (it used to fail after a scroll to the top).
  for (const cause of ['stagedScanBlock', '!targetDeployment', '!acceptedTerms', 'personalDataPending']) {
    expect(reason, `${cause} is not a reason`).toContain(cause);
  }
  const at = page.indexOf('Start Analysis <ArrowRight');
  const button = page.slice(page.lastIndexOf('<CcButton', at), at);
  expect(button).toContain('disabled={loading || !legacyCode || startBlockedReason !== null}');
  expect(button).toContain("aria-describedby={startBlockedReason ? 'analyze-start-blocked-reason' : undefined}");
  // The reason is text on the page, not a hover title.
  expect(button).not.toMatch(/\btitle=\{/);
  expect(button, 'the dead scroll-to-top branches are back').not.toContain('window.scrollTo');
  expect(page).toMatch(/<p id="analyze-start-blocked-reason"[^>]*>\s*\{startBlockedReason\}/);
});

test('UX-053: the root error page is the workspace card, with details folded and a way home', () => {
  const src = code('app/error.tsx');
  expect(src).not.toContain('publicButton');
  expect(src).not.toContain('rounded-3xl');
  expect(src).toContain('rounded-cc-card');
  // The raw message only inside "Technical details".
  const details = src.slice(src.indexOf('<details'), src.indexOf('</details>'));
  expect(details).toContain('Technical details');
  expect(details).toContain('error.message');
  expect(src.split('error.message').length - 1, 'the raw message stands outside the details').toBe(1);
  expect(src).toContain('href="/dashboard"');
  expect(src).toContain('onClick={() => reset()}');
});

test('UX-079: a closed Register says why, like the Google button', () => {
  const src = code('components/LandingModals.tsx');
  const at = src.indexOf("{isSubmitting ? 'Registering...' : 'Register'}");
  const button = src.slice(src.lastIndexOf('<CcButton', at), at);
  expect(button).toContain("aria-describedby={!agreedGDPR || !agreedTerms ? 'register-consent-hint' : undefined}");
  expect(src).toMatch(/<p id="register-consent-hint"[^>]*>\s*Accept the data protection notice and the terms above to register\./);
});

test('UX-088: the Knowledge Hub says which way the score runs and that it is not SAP’s', () => {
  const src = read('app/(app)/knowledge/page.tsx');
  const marks = src.match(/a Clean Core Score \(Clean-Core\.io's own 5–100 measure, higher is better — not SAP's Technical Debt Score, which runs the other way\)/g) ?? [];
  expect(marks, 'the FAQ answer and the quick answer both qualify the score').toHaveLength(2);
});

test('UX-089: one name for the legacy asset value', () => {
  const src = code('components/analyze/BusinessValueAudit.tsx');
  for (const name of ['Business Value Audit', 'Legacy Asset Valuation', 'IP Score']) {
    expect(src, `"${name}" is back`).not.toContain(name);
  }
  expect(src).toContain('Legacy Asset Value');
});

test('UX-106: "Add your key in Settings" leads to Settings', () => {
  const ng = code('components/NotGenerated.tsx');
  expect(ng).toContain('settingsLink?: boolean;');
  expect(ng).toMatch(/settingsLink \? \([\s\S]*?<CcLinkButton href="\/settings"[\s\S]*?Open Settings/);
  const testing = code('app/(app)/project/[projectId]/testing/page.tsx');
  const t = testing.slice(testing.indexOf('what="Test suite"'), testing.indexOf('/>', testing.indexOf('what="Test suite"')));
  expect(t).toContain('settingsLink');
  const transformation = code('app/(app)/project/[projectId]/transformation/page.tsx');
  const x = transformation.slice(transformation.indexOf('what="Transformed code"'), transformation.indexOf('/>', transformation.indexOf('what="Transformed code"')));
  expect(x).toContain("settingsLink={!modelAvailability.enabled('transformation')}");
});

test('UX-119, UX-166: without a signed run the documentation shows one state, with the way to Analyze', () => {
  const page = code(DOCUMENTATION);
  const at = page.indexOf(') : !signedSource ? (');
  expect(at, 'no single no-run state').toBeGreaterThan(-1);
  const state = page.slice(at, page.indexOf('</CcEmptyState>', at));
  expect(state).toContain('title="Run the analysis first"');
  expect(state).toMatch(/<CcLinkButton\s+href=\{`\/project\/\$\{[^}]+\}\/analyze`\}/);
  // The contradiction: a "Replace" title over a closed button beside "run the analysis first".
  expect(page).not.toContain('There is no source here that the active run signed');
  const generate = page.slice(page.lastIndexOf('<CcButton', page.indexOf('data-generate-blueprint')), page.indexOf('data-generate-blueprint'));
  expect(generate, 'the read button is closed for a missing run again').toContain('disabled={!processMap.model}');
  // The empty map frame collapses to one line.
  const explore = page.slice(page.indexOf('id="documentation-explore"'), page.indexOf('<HandbookStage'));
  expect(explore).toContain('{!signedSource ? (');
  expect(explore).toContain('data-documentation-explore-empty');
});

test('UX-120, UX-128, UX-137: the remaining one-off radii and the scroll height are on the scale', () => {
  expect(code('components/cc/SegmentedControl.tsx')).not.toContain('rounded-[6px]');
  expect(code('components/cc/SegmentedControl.tsx')).toContain('rounded-cc-segment');
  expect(code('components/process-revisions/RevisionHistory.tsx')).not.toContain('rounded-[8px]');
  const css = read('app/globals.css');
  expect(css).toMatch(/--cc-radius-segment: calc\(var\(--cc-radius-row\) - 2px\);/);
  expect(css).toMatch(/--radius-cc-segment: var\(--cc-radius-segment\);/);
  for (const rel of ['components/analyze/AtcFindingsPanel.tsx', 'components/workspace/WorkspaceProcess.tsx']) {
    expect(code(rel), rel).not.toContain('max-h-[28rem]');
  }
});

test('UX-136, UX-158: Invite on a dashboard row carries its name', () => {
  const src = code('app/(app)/dashboard/page.tsx');
  const at = src.indexOf('data-invite-open=""');
  const open = src.lastIndexOf('<Cc', at);
  expect(src.slice(open, open + 10), 'Invite is an icon-only button again').toMatch(/^<CcButton\s/);
  const button = src.slice(open, src.indexOf('</CcButton>', at));
  expect(button).toMatch(/>\s*Invite\s*$/);
});

test('UX-155, UX-159: the workspace loading gate is visible, not only spoken', () => {
  const src = code('app/(app)/project/[projectId]/page.tsx');
  expect(src.match(/<WorkspaceLoading \/>/g) ?? []).toHaveLength(2);
  expect(src).toContain("import WorkspaceLoading from '@/components/workspace/WorkspaceLoading';");
  const gate = code('components/workspace/WorkspaceLoading.tsx');
  expect(gate).toContain('role="status"');
  expect(gate).toContain('useCcDelayedFlag(true, CC_SKELETON_DELAY_MS)');
  expect(gate).toContain("className={shown ? 'm-0 cc-text-cell text-cc-ink-muted' : 'sr-only'}");
  expect(src).not.toMatch(/role="status" className="py-16">\s*<span className="sr-only">/);
});

test('UX-155, UX-159: rendered, the loading sentence is hidden before 300 ms and on screen after (QA e458f400bce3)', async ({ page }) => {
  // The component itself, bundled and rendered in the browser — no server. The only style it needs is `sr-only`,
  // given as Tailwind defines it.
  const esbuild = await import('esbuild');
  const built = await esbuild.build({
    stdin: {
      contents: [
        "import { createElement } from 'react';",
        "import { createRoot } from 'react-dom/client';",
        "import WorkspaceLoading from '@/components/workspace/WorkspaceLoading';",
        "createRoot(document.getElementById('root')).render(createElement(WorkspaceLoading));",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    alias: { '@': ROOT },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  await page.clock.install();
  await page.setContent(
    '<style>.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0}</style><div id="root"></div>',
  );
  await page.addScriptTag({ content: built.outputFiles[0].text });
  const sentence = page.locator('[data-workspace-gate="loading"][role="status"] p');
  await expect(sentence).toHaveText('Loading the workspace…');
  await expect(sentence).toHaveAttribute('data-workspace-gate-text', 'pending');
  expect((await sentence.boundingBox())!.width).toBeLessThanOrEqual(1);
  await page.clock.runFor(250);
  await expect(sentence).toHaveAttribute('data-workspace-gate-text', 'pending');
  await page.clock.runFor(100);
  await expect(sentence).toHaveAttribute('data-workspace-gate-text', 'shown');
  await expect(sentence).not.toHaveClass(/sr-only/);
  expect((await sentence.boundingBox())!.width).toBeGreaterThan(50);
  await expect(page.locator('[role="status"] p')).toHaveCount(1);
});

test('UX-161: the Confluence export confirms the download', () => {
  const page = code(ANALYZE);
  const fn = page.slice(page.indexOf('const exportToConfluence'), page.indexOf('const staleExports'));
  expect(fn).toMatch(/save\(blob, exportFileName\);[\s\S]*?setExportToast\(`Your browser was asked to save \$\{exportFileName\}\. The file goes to your device only; nothing was sent to Confluence\.`\);/);
  // saveAs reports no completion, so the toast claims no finished download (QA 22911ff00bda).
  expect(fn).not.toMatch(/setExportToast\(`Downloaded/);
  expect(page).toContain('<CcToast open={exportToast !== null} onDismiss={closeExportToast}>');
});

test('UX-167: the counter-decision hint stands before the button, at body size', () => {
  const src = code('app/(app)/admin/approve-tenant/page.tsx');
  const hint = src.indexOf('data-tenant-decision-hint=""');
  expect(hint).toBeGreaterThan(-1);
  expect(hint, 'the hint comes after the button again').toBeLessThan(src.indexOf('data-tenant-decision="reject"'));
  expect(src.slice(hint, src.indexOf('>', hint))).toContain('cc-text-body');
  expect(src.match(/aria-describedby="tenant-decision-other-link"/g) ?? []).toHaveLength(2);
});
