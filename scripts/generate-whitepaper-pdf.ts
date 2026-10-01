/**
 * Renders /whitepaper-print to public/Clean-Core_S4HANA_Modernization_Whitepaper.pdf
 * — the file behind "Download the PDF" on /whitepaper, and the one a person is
 * sent as an attachment.
 *
 * Built the way the guide PDF is (`scripts/generate-guide-pdf.ts`): Chromium's
 * own print pipeline over a route of the app, so the result is vector text with
 * live links, and the PDF is the web page's own document
 * (`components/whitepaper/WhitepaperDocument.tsx`) in the 3.0 look rather than a
 * second, hand-written one. It replaces `public/linkedin-whitepaper-template.html`
 * and `scripts/generate-linkedin-whitepaper.js`, which had drifted from the page
 * in both text and look.
 *
 * The file name stays the one every earlier link points to.
 *
 * Run it after any content change, against a server that serves the current tree:
 *   npm run build:whitepaper-pdf                         # http://localhost:3000
 *   npm run build:whitepaper-pdf -- --url http://localhost:3499
 *   npm run build:whitepaper-pdf -- --check              # no rendering: is the PDF current?
 *
 * The page is laid out at 0.8 scale: the landing's grid needs a layout width
 * above its phone breakpoint (760 px), and an A4 page at 96 dpi is narrower than
 * that. At 0.8 the body text prints at about 9 pt, the section titles at about
 * 23 pt.
 *
 * --check hashes the files the document is generated from and compares that with
 * the sidecar written next to the PDF. Figures read from the catalog and the
 * reference run are not part of the hash: regenerate on a release as well.
 */

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PRINT_PATH = '/whitepaper-print';
const OUT = path.resolve(process.cwd(), 'public', 'Clean-Core_S4HANA_Modernization_Whitepaper.pdf');
const STAMP = `${OUT}.sha256`;

/** Everything the rendered document's words and look are derived from. */
const SOURCES = [
  'app/whitepaper-print/page.tsx',
  'components/whitepaper/WhitepaperDocument.tsx',
  'components/whitepaper/whitepaper.css',
  'components/landing/landing.css',
  'lib/whitepaper.ts',
  'lib/landing-faq.ts',
  'lib/landing-stages.ts',
  'lib/trust-claims.ts',
  'lib/version.ts',
];

function sourceHash(): string {
  const h = createHash('sha256');
  for (const rel of SOURCES) {
    h.update(rel);
    // LF whatever the checkout did, so a Windows working copy stamps what CI reads.
    h.update(fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n'));
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
 * Header and footer render in an isolated document without the app's CSS, so
 * the colour is written out as the value of `--cc-ink-muted` (#4b5563) and the
 * size is DESIGN.md §1.2's 11 px floor — the same as the guide PDF's footer.
 */
const FOOTER = `
  <div style="width:100%; font-family: Inter, Arial, sans-serif; font-size:11px; color:#4b5563;
              padding:0 14mm; display:flex; justify-content:space-between; align-items:center;">
    <span>SAP Clean Core Whitepaper · clean-core.io/whitepaper</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;

// An empty element rather than none: Chromium prints the title and URL otherwise.
const HEADER = '<div></div>';

function check(): void {
  if (!fs.existsSync(OUT) || !fs.existsSync(STAMP)) {
    throw new Error('No whitepaper PDF (or no stamp) has been generated yet. Run: npm run build:whitepaper-pdf');
  }
  if (fs.readFileSync(STAMP, 'utf8').trim() !== sourceHash()) {
    throw new Error(
      'public/Clean-Core_S4HANA_Modernization_Whitepaper.pdf is out of date — the whitepaper has changed since it was ' +
        'generated. Start the app and run: npm run build:whitepaper-pdf',
    );
  }
  console.log('Whitepaper PDF is current.');
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
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 180_000 });
    if (!response || !response.ok()) {
      throw new Error(`${url} returned ${response ? response.status() : 'no response'}`);
    }
    await page.evaluate(() => document.fonts.ready);

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.pdf({
      path: OUT,
      format: 'A4',
      scale: 0.8,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: HEADER,
      footerTemplate: FOOTER,
      margin: { top: '14mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
  } finally {
    await browser.close();
  }

  const bytes = fs.statSync(OUT).size;
  if (bytes < 40_000) {
    throw new Error('PDF is implausibly small — the page probably rendered empty.');
  }
  // Only after a good render, so a failed run never stamps a stale PDF as current.
  fs.writeFileSync(STAMP, sourceHash(), 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), OUT)} — ${(bytes / 1024).toFixed(0)} kB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
