import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * A page that argues from verifiability gets measured on it.
 *
 * The 27 August external review found four inconsistencies on the landing page —
 * two object counts, two labels for the same cell, two names for the same row,
 * two dates. Three of them had one cause: the comparison matrix was written out
 * twice in the same file, once for the stacked cards under `md` and once for the
 * desktop rows, and the copies had drifted. Correcting the four values would have
 * left the mechanism that produced them.
 *
 * These guards protect the mechanism, not the values.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** Comments stripped, so a fix's own explanation of what it removed cannot trip the check for it. */
const withoutComments = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('the toolchain table has one definition', () => {
  // Roadmap 3.0.6 replaced the SAP-versus-Clean-Core.io comparison matrix with
  // the mockup's toolchain table (ATC, ADT, SAP Signavio, SAP Cloud ALM). The
  // mechanism this guard protects stays: one array, one renderer — the table
  // stacks on a phone through CSS rather than through a second copy, which is
  // how the old matrix drifted in three places.
  test('one array, rendered once', () => {
    const s = read('app/page.tsx');
    expect(s).toContain('const toolchainRows');
    expect((s.match(/toolchainRows\.map\(/g) || []).length).toBe(1);
    expect(s).not.toContain('const comparisonRows');
  });

  test('no tool row is spelled out inline', () => {
    const s = read('app/page.tsx');
    const body = s.slice(s.indexOf('const toolchainRows'));
    const decl = body.slice(0, body.indexOf('const schemaJson'));
    const jsx = s.slice(s.lastIndexOf('return ('));
    for (const tool of ['ABAP Test Cockpit (ATC)', 'ABAP Development Tools (ADT)', 'SAP Cloud ALM']) {
      expect(decl, `${tool} missing from the shared array`).toContain(tool);
      expect(jsx, `${tool} written out in the markup again`).not.toContain(tool);
    }
  });

  test('the ATC row reads the object count from lib/facts.ts', () => {
    const s = read('app/page.tsx');
    const decl = s.slice(s.indexOf('const toolchainRows'), s.indexOf('const schemaJson'));
    expect(decl).toContain('${catalogObjects}');
  });
});

test.describe('the object count is read, not typed', () => {
  // Roadmap 0.2 (`UX-E14-F01:R0`): all four pages that carried the `23,000+`
  // fallback, plus `/facts`, the page the fallback was replaced with a single
  // source for. `tests/copy-ci-guard.spec.ts` generalises this same rule
  // ("no public page states a number the facts service does not back") across
  // every public page; this block stays as the specific regression test for the
  // defect that was actually found.
  const pages = [
    'app/page.tsx',
    'app/(app)/how-it-works/page.tsx',
    'app/(app)/abap-custom-code-analysis/page.tsx',
    'app/(app)/sap-cloudification/page.tsx',
    'app/facts/page.tsx',
  ];

  test('no page states a hard-coded object count anywhere in its source', () => {
    for (const rel of pages) {
      // Unlike the JSX-only check this replaced, the fallback literal itself is
      // gone from every one of these files now — lib/facts.ts is the only
      // source, so there is nothing left to fall back to, and a `23,000+` found
      // anywhere in the code (not only in rendered copy) means it came back.
      // Comments are stripped first: several of these files explain, in prose,
      // that the literal used to sit there — that explanation is not the defect.
      expect(withoutComments(rel), `${rel} carries a typed-in object count`).not.toContain('23,000+');
    }
  });

  test('every one of them derives the figure from lib/facts.ts', () => {
    for (const rel of pages) {
      expect(read(rel), `${rel} does not read the facts service`).toMatch(/from '@\/lib\/facts'/);
    }
  });
});

test.describe('stamped dates follow the release', () => {
  test('nothing carries a frozen month next to a live version', () => {
    for (const rel of ['components/TransformationShowroom.tsx', 'components/SamplePackageDownload.tsx']) {
      const s = read(rel);
      const jsx = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      // `{APP_VERSION} · July 2026` moved further from the truth with every
      // release: one half updated itself, the other did not.
      expect(jsx, `${rel} still stamps a fixed month`).not.toMatch(/·\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d\d/);
      expect(s).toContain('APP_RELEASE_DATE');
    }
  });
});

test.describe('the legal pages are reachable without an account', () => {
  // Roadmap 3.0.6 (decision 24.09.2026) removed the dismissible banner that
  // used to repeat the two links above the shell bar. The footer is now the one
  // place they stand on every page of this shell, so both of its branches are
  // held to them: the one-line footer inside a workflow step, and SiteFooter
  // everywhere else.
  test('both footers of the shell link the public versions', () => {
    const s = withoutComments('app/(app)/layout.tsx');
    // This layout wraps /knowledge, /how-to and /first-run, which are in the
    // sitemap and reachable signed-out. A privacy policy behind a login does not
    // satisfy § 5 DDG / Art. 12–13 GDPR.
    expect(s).not.toContain('/settings#privacy');
    expect(s).not.toContain('/settings#legal');
    // The footer is not conditional on anything but the branch: one of the two
    // renders on every route.
    const branches = s.match(/\{isProjectStep \? \(([\s\S]*?)\) : \(([\s\S]*?)\)\}\s*<div className="cc-no-print">/);
    expect(branches, 'the footer branch of the shell was not found').not.toBeNull();
    const [, stepFooter, otherFooter] = branches!;
    expect(stepFooter).toContain('<footer');
    expect(stepFooter).toContain('href="/datenschutz"');
    expect(stepFooter).toContain('href="/impressum"');
    expect(stepFooter).toContain('href="/terms"');
    expect(otherFooter).toContain('<footer');
    expect(otherFooter).toContain('<SiteFooter />');
    const site = read('components/SiteFooter.tsx');
    expect(site).toContain("href: '/datenschutz'");
    expect(site).toContain("href: '/impressum'");
    expect(site).toContain("href: '/terms'");
  });

  test('a signed-out reader of a shell page finds both links in the footer', async ({ page }) => {
    test.setTimeout(120000);
    for (const route of ['/how-it-works', '/knowledge']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const footer = page.locator('footer').last();
      for (const href of ['/datenschutz', '/impressum']) {
        await expect(footer.locator(`a[href="${href}"]`).first(), `${route} footer has no ${href}`).toBeVisible({ timeout: 60000 });
      }
    }
  });

  test('the logo is not a dead end for a signed-out reader', () => {
    const s = read('app/(app)/layout.tsx');
    expect(s).toContain("href={profile ? '/dashboard' : '/'}");
  });
});

test.describe('the roll-call says whose naming it is', () => {
  test('the provenance difference is explained, not left to be found', () => {
    const s = read('app/page.tsx');
    const jsx = s.slice(s.lastIndexOf('return (')).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    // The engine may hand a developer API_SALES_ORDER_SRV for VBAK while this
    // list shows SAP's I_SALESDOCUMENT. Unexplained, that reads as an error.
    expect(jsx).toContain('successor from SAP');
    expect(jsx).toMatch(/curated field-level/);
  });
});
