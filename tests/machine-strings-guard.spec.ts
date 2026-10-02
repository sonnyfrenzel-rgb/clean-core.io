import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import { pageSettled, STAGES } from './helpers/design-rendered';
import { machineStringsIn } from './helpers/machine-strings';

/**
 * No machine strings on a screen a person reads.
 *
 * The 3.0 gap audit (01.10.2026) read, on the Management view of an ordinary
 * project, "It waits for … condition contract:coverage-incomplete:6 × local
 * function-module call", "blocked:qualified:AC-1/side-by-side-cap+592e7a6c667f"
 * and "(roadmap 3.5)", and on the Analyze stage "standard-table-write" as if it
 * were a word. None of it was wrong, all of it was for the code. The patterns
 * live in `tests/helpers/machine-strings.ts`; this spec applies them twice:
 *
 *   rendered  every app route a signed-in reader opens — the three views and the
 *             seven stages of a populated project, the demo workspace in its three
 *             views and the demo's seven stages, the dashboard and the settings —
 *             is read as a person reads it: visible text only, outside code blocks
 *             (`pre`, `code`), where ABAP and generated code are the content.
 *             Tooltips (`title`) and collapsed technical details are not visible
 *             text and keep the ids that are useful there.
 *   source    every string in the message catalogues (`lib/cc-messages.ts`,
 *             `lib/messages/*`, the content modules and the plain-language layer)
 *             — a catalogue exists to be shown, so a key in a value is on a screen
 *             the moment something renders it.
 */

const ROOT = path.resolve(__dirname, '..');

const CATALOGUES = [
  'lib/cc-messages.ts',
  'lib/workspace-messages.ts',
  ...fs.readdirSync(path.join(ROOT, 'lib/messages')).filter((f) => f.endsWith('.ts')).map((f) => `lib/messages/${f}`),
  'lib/features-content.ts',
  'lib/how-to-content.ts',
  'lib/new-project-content.ts',
  'lib/abap/plain-language.ts',
  'lib/abap/plain-glossary.ts',
];

/** Every string literal and template text of a module — comments are not read. */
function stringsOf(rel: string): { line: number; text: string }[] {
  const file = path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: { line: number; text: string }[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    ) {
      // An import path or a property key is not text.
      const parent = n.parent;
      const isKey = parent && (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === n;
      const isImport = parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent));
      if (!isKey && !isImport) out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text: n.text });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

test.describe('machine strings — source', () => {
  test('the message catalogues carry no key, id, hash or build reference in a value', () => {
    const hits: string[] = [];
    let read = 0;
    for (const rel of CATALOGUES) {
      for (const { line, text } of stringsOf(rel)) {
        read++;
        // A lone identifier (a key used as a value, a CSS class, an enum literal compared against) is not prose.
        if (!/\s/.test(text.trim())) continue;
        for (const h of machineStringsIn(text)) hits.push(`${rel}:${line}  [${h.id}] ${h.match}  ← ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }
    expect(read, 'the catalogues were read').toBeGreaterThan(200);
    expect(hits, `machine strings in a message catalogue:\n${hits.join('\n')}`).toEqual([]);
  });

  test('the patterns catch what the audit found, and leave prose alone', () => {
    const found = (s: string) => machineStringsIn(s).map((h) => h.id);
    expect(found('It waits for condition contract:coverage-incomplete:6 × local call')).toContain('contract-key');
    expect(found('cannot be bound: blocked:qualified:AC-1/side-by-side-cap+592e7a6c667f')).toEqual(
      expect.arrayContaining(['revision-tag', 'revision-hash']),
    );
    expect(found('Assumption revision: unconfirmed:no-currency@no-horizon/no-cadence#3opt+7bb12ca381e8')).toContain('revision-tag');
    expect(found('so no need could be stated (roadmap 3.5).')).toContain('roadmap-ref');
    expect(found('A range, never a point (ADR-035).')).toContain('adr-ref');
    expect(found('standard-table-write')).toContain('raw-enum');
    expect(found('Move the residual rule side-by-side, end-to-end, as a follow-up.')).toEqual([]);
    expect(found('IF gs_eban-waers <> sy-subrc')).toEqual([]);
  });
});

// ── rendered ─────────────────────────────────────────────────────────────────

/** Visible text outside code blocks, one entry per text node. Runs in the page. */
function visibleProse(): string[] {
  const skip = 'pre, code, kbd, samp, textarea, script, style, noscript, template, nextjs-portal';
  const out: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.nodeValue || '').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || el.closest(skip)) continue;
    if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 1 && box.height <= 1) continue;
    out.push(text);
  }
  // Text split across sibling spans ("condition " + "contract:x") is read whole as well.
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('p, li, h1, h2, h3, h4, dd, td, th, button, a, label'))
    .filter((el) => !el.closest(skip) && el.checkVisibility() && !el.querySelector('pre, code'))
    .map((el) => el.innerText.trim())
    .filter(Boolean);
  return [...out, ...blocks];
}

async function open(page: Page, url: string, ready: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  // The workspace is gated on the profile; a profile read that loses a race with
  // a compiling dev server renders the 404 once. One reload, then it must stand.
  if (!(await page.locator(ready).first().waitFor({ timeout: 60_000 }).then(() => true, () => false))) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.locator(ready).first().waitFor({ timeout: 90_000 });
  }
  await page.waitForFunction(pageSettled, 750, { polling: 150, timeout: 60_000 }).catch(() => undefined);
}

const FIRST_LOOK_DONE = '[data-first-look="end-state"], [data-first-look="complete"]';

test.describe('machine strings — rendered', () => {
  test.describe.configure({ mode: 'serial' });

  test('no app route a signed-in reader opens shows a machine string', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const acct = await seedStageProject({ prefix: 'machine-strings', admin: true, acceptTerms: true, rich: true });
    // The example the demo and the mockups use: a real program with rules, decisions and a contract to reason about.
    const src = fs
      .readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8')
      .replace(/\r\n/g, '\n');
    await adminMergeDoc('projects', acct.projectId, { name: 'Emergency purchase approval', legacyCode: src, sourceFileName: 'Z_MM_PO_APPROVAL.abap' });
    await adminMergeDoc(`projects/${acct.projectId}/runs`, acct.runId, { legacyCode: src });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);

    const routes: { url: string; ready: string }[] = [
      { url: '/dashboard', ready: 'h1' },
      { url: '/settings', ready: 'h1' },
      ...(['business', 'it', 'management'] as const).map((v) => ({
        url: `/project/${acct.projectId}?view=${v}`,
        ready: `[data-workspace-shell="${v}"] h1`,
      })),
      ...STAGES.map((s) => ({ url: `/project/${acct.projectId}/${s}`, ready: '[data-stage-title]' })),
      ...(['business', 'it', 'management'] as const).map((v) => ({
        url: `/demo/workspace?view=${v}`,
        ready: '[data-demo-ready="true"] h1',
      })),
      ...STAGES.map((s) => ({ url: `/demo/${s}`, ready: 'h1' })),
    ];

    const hits: string[] = [];
    let read = 0;
    for (const r of routes) {
      await open(page, r.url, r.ready);
      if (r.url.includes('?view=')) await page.locator(FIRST_LOOK_DONE).first().waitFor({ timeout: 60_000 }).catch(() => undefined);
      // Management reads its decision from a route; the audit found the keys in exactly that answer.
      if (r.url.includes('project/') && r.url.endsWith('view=management')) {
        await page.locator('[data-decision-card], [data-decision-status]').first().waitFor({ timeout: 60_000 }).catch(() => undefined);
        await page.waitForFunction(pageSettled, 1500, { polling: 200, timeout: 60_000 }).catch(() => undefined);
      }
      // A stage's provenance line sits behind "Details" (owner 02.10.2026); open
      // every one, so the collapsed line is read as well and nothing escapes the walk.
      const closedMeta = page.locator('[data-stage-meta-toggle][aria-expanded="false"]');
      for (let i = await closedMeta.count(); i > 0; i--) await closedMeta.first().click();
      const texts = await page.evaluate(visibleProse);
      read += texts.length;
      const seen = new Set<string>();
      for (const raw of texts) {
        // The seeded account's own address and ids are test data, not product text.
        const t = [acct.email, acct.projectId, acct.runId, acct.email.split('@')[0]].reduce((x, v) => x.split(v).join('·'), raw);
        for (const h of machineStringsIn(t)) {
          const key = `${h.id}:${h.match}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push(`${r.url.replace(acct.projectId, '{project}')}  [${h.id}] ${h.match}  ← ${t.replace(/\s+/g, ' ').slice(0, 140)}`);
        }
      }
      // Route by route, so a long walk that stops half way still says what it saw.
      if (process.env.MACHINE_STRINGS_OUT) {
        fs.writeFileSync(process.env.MACHINE_STRINGS_OUT, `${hits.join('\n')}\n# read up to ${r.url.replace(acct.projectId, '{project}')}\n`);
      }
    }
    expect(read, 'the walk read text').toBeGreaterThan(500);
    expect(hits, `machine strings on screen:\n${hits.join('\n')}`).toEqual([]);
  });
});
