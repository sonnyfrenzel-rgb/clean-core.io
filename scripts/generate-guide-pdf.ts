/**
 * Renders /clean-core-explained-print to public/clean-core-explained.pdf.
 *
 * The PDF is a build artefact that is committed, not generated on request: a
 * headless Chromium in the Cloud Run image would cost hundreds of megabytes and
 * seconds of cold start to produce a document whose content changes maybe monthly.
 * Committing it also means the file is byte-identical for everyone who downloads
 * or is emailed it, which matters when the point is that people forward it.
 *
 * Chromium's own print pipeline does the typesetting, so the result is vector
 * text with live links and a real outline — not a screenshot. Page numbers come
 * from the footer template because CSS counters cannot see the paginated flow.
 *
 * Run it after any content change:
 *   npm run build:guide-pdf                 # against a local dev server
 *   npm run build:guide-pdf -- --url https://clean-core.io
 *   npm run build:guide-pdf -- --check      # no rendering: is the PDF current?
 *
 * --check exists because the real failure mode here is silent drift: somebody
 * edits a chapter, the website updates, and the PDF people forward keeps saying
 * the old thing. It hashes the files the document is generated from and compares
 * that against the sidecar written next to the PDF, so it needs no browser and no
 * server. Wire it into CI when you want the pipeline to enforce this.
 */

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PRINT_PATH = '/clean-core-explained-print';
const OUT = path.resolve(process.cwd(), 'public', 'clean-core-explained.pdf');
const STAMP = `${OUT}.sha256`;

/** Everything the rendered document is derived from. */
const SOURCES = [
  'lib/clean-core-guide.ts',
  'lib/clean-core-capabilities.ts',
  'app/clean-core-explained-print/page.tsx',
];

function sourceHash(): string {
  const h = createHash('sha256');
  for (const rel of SOURCES) {
    h.update(rel);
    h.update(fs.readFileSync(path.resolve(process.cwd(), rel)));
  }
  return h.digest('hex');
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const BASE = (argValue('--url') || 'http://localhost:3000').replace(/\/+$/, '');
const CHECK_ONLY = process.argv.includes('--check');

/**
 * Chromium renders header and footer in an isolated document with a 10px default,
 * so the styling has to be inline and self-contained here.
 */
const FOOTER = `
  <div style="width:100%; font-family: Inter, Arial, sans-serif; font-size:7pt; color:#94a3b8;
              padding:0 17mm; display:flex; justify-content:space-between; align-items:center;">
    <span>clean-core.io/clean-core-explained</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;

// An empty element rather than none at all: Chromium falls back to printing the
// document title and URL when a template is omitted.
const HEADER = '<div></div>';

function check(): void {
  const expected = sourceHash();

  if (!fs.existsSync(OUT) || !fs.existsSync(STAMP)) {
    throw new Error('No PDF (or no stamp) has been generated yet. Run: npm run build:guide-pdf');
  }

  const actual = fs.readFileSync(STAMP, 'utf8').trim();
  if (actual !== expected) {
    throw new Error(
      'public/clean-core-explained.pdf is out of date — the guide content has changed since it was ' +
        'generated. Start the app and run: npm run build:guide-pdf',
    );
  }

  console.log('PDF is current.');
}

async function main() {
  if (CHECK_ONLY) {
    check();
    return;
  }

  const url = `${BASE}${PRINT_PATH}`;
  console.log(`rendering ${url}`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });

    if (!response || !response.ok()) {
      throw new Error(`${url} returned ${response ? response.status() : 'no response'}`);
    }

    // Web fonts have to be resolved before layout is measured, or Chromium
    // paginates against the fallback metrics and the breaks land elsewhere.
    await page.evaluate(() => document.fonts.ready);

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.pdf({
      path: OUT,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: HEADER,
      footerTemplate: FOOTER,
      margin: { top: '18mm', right: '17mm', bottom: '20mm', left: '17mm' },
    });
  } finally {
    await browser.close();
  }

  const bytes = fs.statSync(OUT).size;

  if (bytes < 40_000) {
    throw new Error('PDF is implausibly small — the page probably rendered empty.');
  }

  // Written only after the render is known good, so a failed run never leaves a
  // stamp claiming an out-of-date PDF is current.
  fs.writeFileSync(STAMP, sourceHash(), 'utf8');

  console.log(`wrote ${path.relative(process.cwd(), OUT)} — ${(bytes / 1024).toFixed(0)} kB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
