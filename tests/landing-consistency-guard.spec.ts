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

test.describe('the comparison matrix has one definition', () => {
  test('both breakpoints render the same array', () => {
    const s = read('app/page.tsx');
    expect(s).toContain('const comparisonRows');
    // Once for the cards under `md`, once for the desktop rows.
    expect((s.match(/comparisonRows\.map\(/g) || []).length).toBe(2);
  });

  test('no capability row is spelled out inline any more', () => {
    const s = read('app/page.tsx');
    const body = s.slice(s.indexOf('const comparisonRows'));
    const decl = body.slice(0, body.indexOf('return ('));
    const jsx = body.slice(body.indexOf('return ('));
    // Every row title belongs to the one declaration; a second occurrence in the
    // markup means the array has been copied back into the JSX.
    for (const title of ['Sandbox Verification', 'Business Process Blueprinting', 'Developer HUD']) {
      expect(decl, `${title} missing from the shared array`).toContain(title);
      expect(jsx, `${title} written out in the markup again`).not.toContain(title);
    }
  });

  test('the renderers style from the grade, not from the badge text', () => {
    const s = read('app/page.tsx');
    // Comparing badge strings is what let "Not Supported" and "Not Available"
    // drift apart while both still rendered correctly.
    expect(s).not.toContain("row.sap.badge === 'Not Supported'");
    expect(s).not.toContain("row.sap.badge === 'Static Check'");
    expect((s.match(/row\.sap\.level === 'none'/g) || []).length).toBeGreaterThanOrEqual(1);
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
  test('the shell banner links the public versions', () => {
    const s = read('app/(app)/layout.tsx');
    // This layout wraps /knowledge, /how-to and /first-run, which are in the
    // sitemap and reachable signed-out. A privacy policy behind a login does not
    // satisfy § 5 DDG / Art. 12–13 GDPR.
    expect(s).not.toContain('/settings#privacy');
    expect(s).not.toContain('/settings#legal');
    expect(s).toContain('href="/datenschutz"');
    expect(s).toContain('href="/impressum"');
  });

  test('the logo is not a dead end for a signed-out reader', () => {
    const s = read('app/(app)/layout.tsx');
    expect(s).toContain("href={profile ? '/dashboard' : '/'}");
  });
});

test.describe('the roll-call says whose naming it is', () => {
  test('the provenance difference is explained, not left to be found', () => {
    const s = read('components/BenefitCard.tsx');
    const jsx = s.slice(s.indexOf('return (')).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    // The engine may hand a developer API_SALES_ORDER_SRV for VBAK while this
    // list shows SAP's I_SALESDOCUMENT. Unexplained, that reads as an error.
    expect(jsx).toContain('successors SAP');
    expect(jsx).toMatch(/curated field-level/);
  });
});
