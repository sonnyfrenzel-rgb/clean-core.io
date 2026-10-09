import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getModuleAreas } from '../lib/abap/catalog-index';
import { generateMetadata as letterMetadata } from '../app/catalog/browse/[letter]/page';
import { generateMetadata as moduleMetadata } from '../app/catalog/module/[area]/page';

/**
 * Public pages say what the product does, not more (QA full review of v2.20.0,
 * slice I). Each block names the finding it holds the line for. Source-level on
 * purpose: these are claims in copy, and the copy is the thing that drifted.
 */

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
/** The source without block or line comments, so a note about an old claim does not count as the claim. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('the catalog pages claim a successor only where SAP names one', () => {
  test('the A-Z metadata does not promise a successor for every object (abbb7f1d6d42)', async () => {
    const meta = await letterMetadata({ params: Promise.resolve({ letter: 'a' }) });
    expect(String(meta.description)).not.toMatch(/and their released S\/4HANA API successors/);
    expect(String(meta.description)).toMatch(/where SAP names one/);
  });

  test('the module metadata does not promise a successor for every object (f55806a3b0ff)', async () => {
    const area = getModuleAreas()[0];
    const meta = await moduleMetadata({ params: Promise.resolve({ area: area.code.toLowerCase() }) });
    expect(String(meta.title)).not.toContain('→ released S/4HANA APIs');
    // The table also lists curated successors, so "where SAP names one" became
    // "where one is known", with the curated source named (codex code-public-03).
    expect(String(meta.description)).toMatch(/where one is known/);
    expect(String(meta.description)).toMatch(/curated mapping, marked as such/);
  });

  test('the module lead names the level C residual instead of claiming a published state for every row (c32080bda7bf)', () => {
    const src = code('app/catalog/module/[area]/page.tsx');
    expect(src).not.toMatch(/used to claim/);
    expect(src).toMatch(/neither of SAP&apos;s files\s+lists is level C/);
  });

  test('the index promises its own catalog, not every SAP object (e376eca6569a)', () => {
    expect(code('app/catalog/page.tsx')).not.toMatch(/any SAP standard object/);
  });

  test('the area card does not call its total a successor count (b80b25bdc56d)', () => {
    expect(code('app/catalog/page.tsx')).not.toMatch(/a\.objectCount[^\n]*with a released successor/);
  });
});

test.describe('the guides and reference pages', () => {
  test('the printable guide qualifies which cloud edition drops the older techniques (2ed522ad06bb)', () => {
    const src = code('app/clean-core-explained-print/page.tsx');
    expect(src).not.toMatch(/cloud\s+offerings simply do not run/);
    expect(src).toMatch(/private cloud edition/);
  });

  test('the facts page claims the numbers it documents and its real freshness (a8879493075c, 49e61b0a9eec)', () => {
    const src = code('app/facts/page.tsx');
    expect(src).not.toMatch(/every public number/i);
    expect(src).not.toMatch(/computed at request time/);
    expect(src).toMatch(/revalidate = 300/);
    expect(src).toMatch(/up to five minutes/);
  });

  test('the level method page computes its quick answer and states the residual rule (600eacbd600f, 7953916f73e4)', () => {
    const src = code('app/method/levels/page.tsx');
    expect(src, 'a contested count is typed into the page').not.toMatch(/\b2[12] objects/);
    expect(src).toMatch(/answer=\{`[^`]*\$\{contestedTotal\}[^`]*\$\{contestedWithSuccessor\}/);
    expect(src).not.toMatch(/lists nowhere returns/);
    expect(src).toMatch(/An SAP object neither file lists is level C/);
  });

  test('the reference run does not promise every finding it only counts (d63026ea0432)', () => {
    expect(code('app/reference-analysis/page.tsx')).not.toMatch(/every finding/);
  });
});

test.describe('the landing page and the whitepaper', () => {
  test('a generated draft is not called compliant (b3e243b68b78, a58028fda9e1)', () => {
    for (const rel of ['app/page.tsx', 'app/whitepaper/page.tsx']) {
      const src = code(rel);
      expect(src, rel).not.toMatch(/Clean-Core-compliant/);
      expect(src, rel).not.toMatch(/first compliant draft/);
    }
  });

  test('BYOK is not promised to be free of every platform limit (07188dc4d715)', () => {
    expect(code('app/page.tsx')).not.toMatch(/without any platform limits/);
  });

  // Since 3.0.6 the landing states its trust lines from lib/trust-claims.ts,
  // each with its source in the privacy policy; the old disclaimer block is gone.
  test('erasure copy does not promise to purge everything (341a9ce7a451)', () => {
    expect(code('app/page.tsx')).not.toMatch(/purge all your uploads and data/);
    expect(code('lib/trust-claims.ts')).toMatch(/backup copies age out within 30 days/);
  });

  test('the disclaimer does not attribute the deterministic score to the model (9d98a3ea6701)', () => {
    const src = code('app/page.tsx');
    expect(src).not.toMatch(/compliance scores, modular code transformations/);
    // The start page's FAQ lives in lib/landing-faq.ts since the SEO pass for
    // 3.0 (the accordion, the FAQPage JSON-LD and /llms-full.txt read it there).
    const faq = code('lib/landing-faq.ts');
    expect(src).toContain('LANDING_FAQ');
    expect(faq).not.toMatch(/compliance scores, modular code transformations/);
    expect(faq).toMatch(/A deterministic engine reads the program before any language model does/);
  });

  test('the no-training line carries the free-tier caveat (cc161722d461)', () => {
    expect(code('app/page.tsx')).not.toMatch(/\(not used by Google to train its models, per the Gemini API terms\)/);
    const claims = code('lib/trust-claims.ts');
    expect(claims).toMatch(/With our community key, Google does not use your code to train its models — the paid Gemini API terms apply\. With your own key, your Google account's terms apply\./);
  });

  test('the whitepaper describes the route and the table access it really has (55f3dd4a7152, e6f754593747)', () => {
    const src = code('app/whitepaper/page.tsx');
    expect(src).not.toMatch(/best fits each object/);
    expect(src).not.toMatch(/writes to internal tables/);
  });
});

test.describe('the legal pages', () => {
  test('the privacy policy names every model-written purpose, in both languages (8d820e6a9ed8)', () => {
    expect(code('app/datenschutz/page.tsx')).not.toMatch(/exclusively for code transformation/);
    expect(code('app/datenschutz/de/page.tsx')).not.toMatch(/ausschließlich für die Code-Transformation/);
    expect(code('app/datenschutz/page.tsx')).toMatch(/test suite/);
    expect(code('app/datenschutz/de/page.tsx')).toMatch(/Testsuite/);
  });

  test('the German privacy policy declares its language (89a6cbdb1464)', () => {
    const src = code('app/datenschutz/de/page.tsx');
    const ret = src.slice(src.indexOf('return ('));
    // Since D.25 the page renders a fragment (the public header is the layout's),
    // so both elements it renders carry lang="de": the language switch and the text.
    expect(ret).toMatch(/^return \(\s*<>\s*<nav lang="de"/);
    expect(ret).toMatch(/<main lang="de"/);
  });

  test('the legal notice cites § 5 DDG everywhere, the social card included (d850ec1847d3)', () => {
    expect(code('app/impressum/page.tsx')).not.toMatch(/§ 5 TMG/);
  });
});

test.describe('the error boundary and the survey page', () => {
  test('a stale chunk in Chrome triggers the one-time reload (2fd1dacead6a)', () => {
    const src = read('lib/stale-build.ts');
    const m = src.match(/(\/Loading chunk[^\n]*?\/i)\.test\(msg\)/);
    expect(m, 'the chunk-error matcher moved').not.toBeNull();
    const literal = m![1];
    const re = new RegExp(literal.slice(1, -2), 'i');
    for (const message of [
      'Failed to fetch dynamically imported module: https://clean-core.io/_next/static/chunks/app/page-abc.js',
      'error loading dynamically imported module: https://clean-core.io/_next/static/chunks/x.js',
      'Importing a module script failed.',
      'Loading chunk 123 failed.',
    ]) {
      expect(re.test(message), message).toBe(true);
    }
  });

  test('the lead only says the email pick is selected when it is (de79046cea59)', () => {
    const src = code('app/survey/[token]/page.tsx');
    const def = src.match(/const answeredInMail = ([^;]+);/);
    expect(def, 'answeredInMail is gone').not.toBeNull();
    // SurveyClient drops the proposal when the server already holds an answer,
    // so the page has to drop the sentence under the same condition.
    expect(def![1]).toMatch(/!\(q in existingAnswers\)/);
    expect(src.indexOf('const answeredInMail')).toBeGreaterThan(src.indexOf('existingAnswers = '));
  });
});
