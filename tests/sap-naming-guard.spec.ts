import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import { pageSettled, STAGES } from './helpers/design-rendered';
import {
  BAIP,
  BAIP_FIRST,
  BAIP_FORMERLY,
  BAIP_FORMERLY_SPELLED,
  IN_APP_ROUTE,
  SAP_NAMES_WITH_BTP,
  SIDE_BY_SIDE_LABEL,
  SIDE_BY_SIDE_ROUTE,
  isSideBySideRoute,
  routeLabel,
  sapNamesForDisplay,
} from '../lib/sap-naming';
import { FEATURE_SLUGS } from '../lib/features-content';

/**
 * SAP naming — roadmap 3.0.15.
 *
 * SAP BTP is now named as the SAP Business AI Platform: "SAP Business AI
 * Platform (formerly SAP BTP)" at the first mention, "BAIP" after it. A service
 * SAP itself still names with BTP keeps SAP's name; catalog data from SAP
 * sources stays as SAP wrote it.
 *
 * Zero tolerance. Every text the product can show — each string literal,
 * template text and JSX text of `app/`, `components/`, `lib/` and `hooks/`, and
 * every static file under `public/` — is read, and a "BTP" in it fails the
 * suite unless it is part of:
 *
 *   - one of SAP's own names that still carry BTP (`SAP_NAMES_WITH_BTP`), or
 *   - the prescribed first mention itself — "(formerly SAP BTP)" after the
 *     platform's name, `BAIP_FIRST`, also where a diagram sets the two words on
 *     two lines (`BAIP_FORMERLY`).
 *
 * Nothing else is excused. `lib/sap-naming.ts` is not read: it is the one place
 * that spells the former name — the first-mention constant, the lookup aliases a
 * reader may still type, and the stored route value `SIDE_BY_SIDE_ROUTE`, a data
 * contract that projects, runs and signed packs carry and that is never shown
 * as it is. `lib/abap/generated/` is not read either: it is SAP's catalog,
 * synced from SAP's repository, and the roadmap keeps it unchanged. Comments are
 * not read — they are not shown.
 *
 * A JSON data file may carry the stored route value as the value of a route
 * field, because that is the data contract and not a label; any other "BTP" in
 * it fails like everywhere else.
 */

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks'];
const HELPER = path.join('lib', 'sap-naming.ts');
const SAP_CATALOG_DATA = path.join('lib', 'abap', 'generated') + path.sep;
const TEXT_EXT = /\.(html?|txt|vtt|md|json|xml|svg|csv)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else out.push(full);
  }
  return out;
}

/** What is left of a text once SAP's own names and the prescribed first mention are taken out. */
function bareBtp(text: string): string[] {
  // JSX text keeps its line breaks; "formerly\n   SAP BTP" is the same words.
  // The former name spelled out is the former name too (codex code-public-06:
  // "Side-by-Side on SAP Business Technology Platform" passed a guard that only
  // looked for the three letters). The one place it may stand is right after
  // the prescribed "formerly SAP BTP", expanding the abbreviation.
  let rest = text
    .replace(/\s+/g, ' ')
    .split(BAIP_FORMERLY_SPELLED)
    .join(' ')
    .split(BAIP_FORMERLY)
    .join(' ');
  for (const name of SAP_NAMES_WITH_BTP) rest = rest.split(name).join(' ');
  const hits: string[] = [];
  const re = /\bBTP\b|\b[Bb]usiness [Tt]echnology [Pp]latform\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) hits.push(rest.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' '));
  return hits;
}

/** Every string literal, template text, JSX text and JSX attribute value of a module, with its line. */
function textsOf(file: string): { line: number; text: string }[] {
  const src = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const out: { line: number; text: string }[] = [];
  const visit = (n: ts.Node) => {
    const isText =
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n) ||
      ts.isJsxText(n);
    if (isText) {
      const parent = n.parent;
      const isImport =
        parent &&
        (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent));
      if (!isImport) out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text: (n as ts.LiteralLikeNode).text });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

test.describe('SAP naming (roadmap 3.0.15) — source', () => {
  test('no bare "BTP" in any text of app/, components/, lib/ or hooks/', () => {
    const hits: string[] = [];
    let files = 0;
    for (const dir of SOURCE_DIRS) {
      for (const full of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, full);
        if (rel === HELPER || rel.startsWith(SAP_CATALOG_DATA)) continue;
        if (/\.(tsx?|mjs|js)$/.test(rel)) {
          files++;
          for (const { line, text } of textsOf(full)) {
            for (const h of bareBtp(text)) hits.push(`${rel}:${line} … ${h} …`);
          }
        } else if (TEXT_EXT.test(rel)) {
          files++;
          let text = fs.readFileSync(full, 'utf8');
          // The stored route value is a data contract in a data file, never a label.
          if (rel.endsWith('.json')) text = text.split(`"${SIDE_BY_SIDE_ROUTE}"`).join('""');
          text.split(/\r?\n/).forEach((l, i) => {
            for (const h of bareBtp(l)) hits.push(`${rel}:${i + 1} … ${h} …`);
          });
        }
      }
    }
    expect(files, 'the guard read the source tree').toBeGreaterThan(500);
    expect(hits, `bare "BTP" in visible copy — use lib/sap-naming.ts:\n${hits.join('\n')}`).toEqual([]);
  });

  test('no bare "BTP" in the static files under public/', () => {
    const hits: string[] = [];
    let files = 0;
    for (const full of walk(path.join(ROOT, 'public'))) {
      const rel = path.relative(ROOT, full);
      if (!TEXT_EXT.test(rel)) continue;
      files++;
      const text = fs.readFileSync(full, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      text.split(/\r?\n/).forEach((l, i) => {
        for (const h of bareBtp(l)) hits.push(`${rel}:${i + 1} … ${h} …`);
      });
    }
    expect(files, 'the guard read the public folder').toBeGreaterThan(0);
    expect(hits, `bare "BTP" in a public file:\n${hits.join('\n')}`).toEqual([]);
  });

  test('the former name inside fingerprinted text is used only where bytes are fingerprinted', () => {
    // `FINGERPRINTED_FORMER_*` keep the bytes of the architecture contract and of
    // a decision's summary, which are hashed and bound; anywhere else they would
    // be a way round this guard.
    const allowed = new Set([path.join('lib', 'architecture-contract.ts'), path.join('lib', 'decision-draft.ts')]);
    const users: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for (const full of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, full);
        if (rel === HELPER || !/\.(tsx?|mjs|js)$/.test(rel)) continue;
        if (/FINGERPRINTED_FORMER_(NAME|SHORT)/.test(fs.readFileSync(full, 'utf8'))) users.push(rel);
      }
    }
    expect(users.sort()).toEqual([...allowed].sort());
  });

  test('the guard catches what it is for, and lets SAP keep its own names', () => {
    expect(bareBtp('a side-by-side extension on SAP BTP')).toHaveLength(1);
    expect(bareBtp('BTP Side-by-Side')).toHaveLength(1);
    expect(bareBtp(`side-by-side on ${BAIP_FIRST}`)).toHaveLength(0);
    expect(bareBtp('Released for the SAP BTP, ABAP environment')).toHaveLength(0);
    expect(bareBtp('Open the SAP BTP cockpit')).toHaveLength(0);
    expect(bareBtp('btp-latest, isBtp, objectReleaseInfo_BTPLatest')).toHaveLength(0);
    // The former name spelled out (codex code-public-06), and its one allowed place.
    expect(bareBtp('or Side-by-Side on SAP Business Technology Platform (CAP).')).toHaveLength(1);
    expect(bareBtp('a business technology platform')).toHaveLength(1);
    expect(bareBtp(`SAP's cloud platform, ${BAIP_FORMERLY_SPELLED}.`)).toHaveLength(0);
  });
});

test.describe('SAP naming (roadmap 3.0.15) — the helper', () => {
  test('the stored route keeps its value and is shown by its new name', () => {
    expect(SIDE_BY_SIDE_ROUTE).toBe('Side-by-Side (SAP BTP)');
    expect(routeLabel(SIDE_BY_SIDE_ROUTE)).toBe(SIDE_BY_SIDE_LABEL);
    expect(routeLabel(SIDE_BY_SIDE_ROUTE)).toBe(`Side-by-Side (${BAIP})`);
    expect(routeLabel(IN_APP_ROUTE)).toBe(IN_APP_ROUTE);
    expect(bareBtp(routeLabel('Side-by-Side (BTP CAP)'))).toHaveLength(0);
  });

  test('the track test is the one stored projects were routed by', () => {
    expect(isSideBySideRoute(SIDE_BY_SIDE_ROUTE)).toBe(true);
    expect(isSideBySideRoute('Side-by-Side (BTP CAP)')).toBe(true);
    expect(isSideBySideRoute(IN_APP_ROUTE)).toBe(false);
    expect(isSideBySideRoute(undefined)).toBe(false);
  });

  test('display text loses the former name and keeps SAP\'s own', () => {
    expect(sapNamesForDisplay('Side-by-side on SAP BTP — CAP')).toBe(`Side-by-side on ${BAIP} — CAP`);
    expect(sapNamesForDisplay('a separate BTP runtime')).toBe(`a separate ${BAIP} runtime`);
    expect(sapNamesForDisplay('the SAP BTP, ABAP environment and the SAP BTP cockpit')).toBe(
      'the SAP BTP, ABAP environment and the SAP BTP cockpit',
    );
    expect(sapNamesForDisplay(`on ${BAIP_FIRST}`)).toBe(`on ${BAIP_FIRST}`);
  });
});

// ── rendered ─────────────────────────────────────────────────────────────────
//
// The source half reads what the code says; this half reads what a person is
// shown, where a stored route value ("Side-by-Side (SAP BTP)" is a data contract)
// or a sentence fingerprinted before 3.0.15 reaches the screen through a label.
// Code blocks are left out: generated code and ABAP are the content there.

/** Visible text outside code blocks. Runs in the page. */
function visibleText(): string {
  const skip = 'pre, code, kbd, samp, textarea, script, style, noscript, template, nextjs-portal';
  const out: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.nodeValue || '').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || el.closest(skip)) continue;
    if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) continue;
    out.push(text);
  }
  return out.join('\n');
}

async function readPage(page: Page, url: string, ready: string): Promise<string> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  if (!(await page.locator(ready).first().waitFor({ timeout: 60_000 }).then(() => true, () => false))) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.locator(ready).first().waitFor({ timeout: 90_000 });
  }
  await page.waitForFunction(pageSettled, 750, { polling: 150, timeout: 60_000 }).catch(() => undefined);
  return page.evaluate(visibleText);
}

test.describe('SAP naming (roadmap 3.0.15) — rendered', () => {
  test.describe.configure({ mode: 'serial' });

  test('the public pages name the platform by its new name', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    const routes = [
      '/',
      '/knowledge',
      '/how-it-works',
      '/how-to',
      '/first-run',
      '/abap-custom-code-analysis',
      '/sap-cloudification',
      '/clean-core-score',
      '/clean-core-explained',
      '/whitepaper',
      '/reference-analysis',
      '/impressum',
      // The feature pages (codex code-public-06: the extensibility page still spelled out the former name).
      ...FEATURE_SLUGS.map((slug) => `/features/${slug}`),
    ];
    const hits: string[] = [];
    for (const url of routes) {
      const text = await readPage(page, url, 'h1');
      for (const h of bareBtp(text)) hits.push(`${url} … ${h} …`);
    }
    for (const url of ['/llms.txt', '/llms-full.txt']) {
      const res = await page.request.get(url);
      expect(res.ok(), url).toBe(true);
      for (const h of bareBtp(await res.text())) hits.push(`${url} … ${h} …`);
    }
    expect(hits, `bare "BTP" on a public page:\n${hits.join('\n')}`).toEqual([]);
  });

  test('a side-by-side project shows its route by the new name in every view and stage', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const acct = await seedStageProject({ prefix: 'sap-naming', admin: true, acceptTerms: true, rich: true });
    // The stored value every side-by-side project carries.
    await adminMergeDoc('projects', acct.projectId, { extensibilityRoute: SIDE_BY_SIDE_ROUTE });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);

    const routes: { url: string; ready: string }[] = [
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
      const text = await readPage(page, r.url, r.ready);
      read += text.length;
      for (const h of bareBtp(text)) hits.push(`${r.url.replace(acct.projectId, '{project}')} … ${h} …`);
    }
    expect(read, 'the walk read text').toBeGreaterThan(5000);
    expect(hits, `bare "BTP" on screen:\n${hits.join('\n')}`).toEqual([]);
  });
});
