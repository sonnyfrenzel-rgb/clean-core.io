/**
 * Renders public/social-card.png — the 1200×630 picture every public page
 * shows when it is shared (Open Graph and the Twitter card).
 *
 *   node scripts/render-social-card.mjs
 *
 * Why a rendered file rather than a picture from a design tool: the card says
 * the product's one sentence in text, and the text has to stay what the page
 * says. The words below are the approved short USP and three facts the product
 * shows on every analysis — no figure, no screenshot of anything drawn for the
 * card. Change the words here and re-run; the PNG is committed.
 *
 * The previous card (public/og-image.png) was a 1024×1024 JPEG saved as .png,
 * declared as 1200×630, with model-drawn pseudo-code and the 2.x tagline
 * "SAP S/4HANA Modernization Suite". It stays in public/ so links to it keep
 * working; nothing references it any more.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'social-card.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1200px; height: 630px; background: #0b1c30; color: #fff;
         font-family: 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif; }
  .card { position: relative; width: 1200px; height: 630px; padding: 64px 72px; display: flex; flex-direction: column; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: linear-gradient(90deg, #006b2c, #16a34a 60%, #4ade80); }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 700; letter-spacing: -0.5px; }
  .pill { font-size: 20px; font-weight: 600; color: #bbf7d0; border: 2px solid #16a34a; border-radius: 999px; padding: 8px 20px; }
  h1 { margin-top: 64px; font-size: 56px; line-height: 1.12; font-weight: 700; letter-spacing: -1px; max-width: 1040px; }
  h1 em { font-style: normal; color: #4ade80; }
  .facts { margin-top: auto; display: flex; gap: 14px; flex-wrap: wrap; }
  .fact { font-size: 20px; font-weight: 600; color: #e2e8f0; background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.16); border-radius: 10px; padding: 10px 16px; white-space: nowrap; }
  .foot { margin-top: 22px; font-size: 18px; color: #94a3b8; }
</style></head><body><div class="card">
  <div class="top">
    <div class="brand">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
      Clean-Core.io
    </div>
    <div class="pill">Free for the SAP community</div>
  </div>
  <h1>From custom ABAP nobody understands to a reviewed, tested rebuild — <em>on one chain of evidence you can check.</em></h1>
  <div class="facts">
    <div class="fact">Business process as BPMN, with line anchors</div>
    <div class="fact">SAP clean core level A–D per object</div>
    <div class="fact">Signed runs</div>
  </div>
  <div class="foot">clean-core.io · an independent community project, not affiliated with SAP SE</div>
  <div class="bar"></div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: OUT, type: 'png' });
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
} finally {
  await browser.close();
}
