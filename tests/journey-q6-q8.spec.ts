import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDemoWorkspace } from '../lib/demo-workspace';
import { DEMO_ROUTE, DEMO_SIGNED_OUT_ROUTE } from '../lib/demo-marks';
import { stageViewOf } from '../lib/location-search';

/**
 * Journey review, owner go 26.11.2026 — Q6 (stale and role copy) and Q8 (demo repairs). Server-free.
 *
 *   Q6  The first-run guide describes the Business view as it is today (the map, not "Decide on n rules" — the rules
 *       are answered in Design since 21.10.2026); the sign-up's last dialog names My workspace and no IT department;
 *       the landing page and the demo showcase share the demo as a link, never "send to your IT colleague / manager".
 *   Q8  The demo's Analyze in the Management view is the management answer, not a copy of the IT view; a visitor
 *       without an account is sent from a demo page that needs one to the public showcase, never to the sign-in
 *       dialog; the demo's tool pages do not depend on the view in the address, so an unknown or Business view cannot
 *       leave one empty.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const OUT = path.join(ROOT, 'tmp', 'journey-q6-q8', String(process.pid));

async function load(rel: string, name = 'default'): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(OUT, `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    loader: { '.css': 'empty' },
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out)[name];
}

const textOf = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/** A line that hands the work to another person: "send … to your IT colleague", "your IT department will …". */
const HANDOFF = /send (this |the demo )?to (your )?(it|manager)|send the demo to it|it colleague|your manager\b|it department|not your decision alone/i;

test.describe('Q6 · copy for one user at the screen', () => {
  test('the first-run guide describes the Business view of today, and the rules in Design', () => {
    const s = code('app/(app)/first-run/page.tsx');
    expect(s).not.toMatch(/Decide on (n|the) rules/);
    expect(s).toContain("where: 'Analyze — Business view'");
    expect(s).toContain('Walk me through it');
    expect(s).toContain('BPMN map');
    // The rules are answered in Design.
    expect(s).toMatch(/Design drafts the target architecture[^']*answer the business rules/);
    // Still pinned elsewhere: the first insights and the header's quota.
    expect(s).toContain('the first insights at once');
    expect(s).toContain('"5 of 5 runs left"');
    // The workspace page is gone since 3.5.0; the start is My workspace.
    expect(s).not.toMatch(/the dashboard|on the dashboard|tools bar of the workspace/i);
    expect(s).not.toMatch(HANDOFF);
  });

  test('the sign-up\'s last dialog names My workspace and no IT department', () => {
    const s = read('components/UserOnboarding.tsx');
    const line = s.slice(s.indexOf('A welcome email is on its way'), s.indexOf('</p>', s.indexOf('A welcome email is on its way')));
    expect(line).toContain('My workspace has ready-made ABAP examples');
    expect(line).not.toMatch(/dashboard|IT department/);
  });

  test('the landing page shares the demo as a link, never as a handoff', () => {
    const s = code('app/page.tsx');
    expect(s).not.toMatch(HANDOFF);
    expect(s).not.toContain('shareBody');
    expect(s).toMatch(/data-landing-share=""[\s\S]{0,200}Share the demo link\.[\s\S]{0,300}<CopyLinkButton url=\{`https:\/\/clean-core\.io\$\{SHOWCASE\}`\}>Copy the demo link<\/CopyLinkButton>/);
  });

  test('the showcase\'s last screen shares the demo as a link, never as a handoff', () => {
    const s = code('components/demo/showcase/ShowcaseScreens.tsx');
    expect(s).not.toMatch(HANDOFF);
    expect(s).toMatch(/data-showcase-share="link" onClick=\{\(\) => onCopy\('all'\)\}>\s*Share the demo link/);
  });
});

test.describe('Q8 · the demo', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  test('the Management view of the demo\'s Analyze is the management answer, not the IT page again', async () => {
    const DemoAnalyzeManagement = await load('components/demo/DemoAnalyzeManagement.tsx');
    const data = buildDemoWorkspace();
    const html = renderToStaticMarkup(
      React.createElement(DemoAnalyzeManagement, { demo: data.demo, source: data.source, itFindings: data.itFindings }),
    );
    const text = textOf(html);
    expect(text).toContain('Keep, rebuild or retire: what does this program need?');
    for (const h of ['The four options', 'Risk if nothing changes', 'What we need from you', 'The way on']) expect(text).toContain(h);
    // The four options, each with the demo's own reason: nothing indicated, nothing priced, nothing decided.
    for (const o of ['keep', 'rebuild', 'standard', 'retire']) expect(html).toContain(`data-management-option="${o}"`);
    expect(text).toContain('A demo is never signed, so no option can be read from evidence here.');
    expect(text).toContain('No option is indicated in a demo.');
    // The way on is the demo's Re-design.
    expect(html).toContain('href="/demo/redesign"');
    // Not the IT page: no findings table, no score section of the IT view.
    expect(html).not.toContain('data-demo-analyze=');
    expect(html).not.toContain('data-analysis-summary');
    expect(text).not.toMatch(HANDOFF);
  });

  test('the demo route picks the Management page for ?view=management and the IT page for ?view=it', () => {
    const s = code('components/demo/DemoAnalyzeRoute.tsx');
    expect(s).toMatch(/management=\{view === 'management' \? \{ source: data\.source, itFindings: data\.itFindings \} : null\}/);
    const w = code('components/demo/DemoWorkspace.tsx');
    expect(w).toMatch(/stage === 'analyze' && !management && <DemoAnalyze demo=\{demo\} \/>/);
    expect(w).toMatch(/stage === 'analyze' && management && \(\s*<DemoAnalyzeManagement/);
  });

  test('a visitor without an account goes from a demo page to the public showcase; only a browser that refuses storage goes through sign-in', () => {
    expect(DEMO_SIGNED_OUT_ROUTE).toBe(DEMO_ROUTE);
    for (const rel of ['components/demo/DemoAnalyzeBusiness.tsx', 'components/demo/DemoWorkspaceShell.tsx']) {
      const s = code(rel);
      expect(s, `${rel} still sends a visitor to sign in`).not.toContain('auth=signin');
      // Where storage is refused the sign-in hint cannot be read, so a signed-in reader looks signed out: the sign-in
      // dialog tells them apart and leads them straight back (pre-push run 26.11.2026).
      expect(s).toContain('if (!profileLoading && !enabled) router.replace(storageReadable() ? DEMO_SIGNED_OUT_ROUTE : signInLinkFor(DEMO_WORKSPACE_ROUTE));');
    }
    // No other page under /demo sends anyone to sign in.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) files.push(rel);
      }
    };
    walk('app/(app)/demo');
    walk('components/demo');
    for (const rel of files) {
      const s = code(rel);
      expect(s, `${rel} sends a visitor to sign in`).not.toMatch(/router\.(replace|push)\(signInLinkFor|redirect\([^)]*auth=signin/);
      // The one sign-in way: behind storageReadable() only.
      for (const m of s.matchAll(/signInLinkFor\(/g)) expect(s.slice(Math.max(0, (m.index ?? 0) - 60), m.index), rel).toContain('storageReadable() ?');
    }
  });

  test('the demo\'s tool pages do not depend on the view in the address, so no view leaves one empty', () => {
    // `/demo/[stage]` is built on the server without the query: it takes `params` only, never `searchParams`, and
    // hands DemoWorkspace no view. The walkthrough's empty /demo/transformation?view=business was a 500 of the dev
    // server ("Unexpected end of JSON input" while it recompiled, then a restart for memory), not this page.
    const page = code('app/(app)/demo/[stage]/page.tsx');
    expect(page).not.toContain('searchParams');
    expect(page).toMatch(/<DemoWorkspace demo=\{demo\} stage=\{phase\.key as PhaseKey\} design=\{design\} source=\{source\} \/>/);
    const w = code('components/demo/DemoWorkspace.tsx');
    expect(w).not.toMatch(/useLocationSearch|useSearchParams|stageViewOf/);
    // An unknown view reads as the default, never as nothing.
    expect(stageViewOf('?view=bogus')).toBe(stageViewOf(''));
    expect(stageViewOf('?view=business')).toBe('business');
  });
});
