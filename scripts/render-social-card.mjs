/**
 * Renders public/social-card.png — the 1200×630 picture every public page
 * shows when it is shared (Open Graph and the Twitter card).
 *
 *   node scripts/render-social-card.mjs
 *
 * Left: the approved short USP, verbatim, and three facts the product shows on
 * every analysis. Right: the product itself — a crop of the BPMN process the
 * engine reconstructs from the demo program on the landing page, with the
 * decision "Material given?" selected and its line anchor L78, and the source
 * lines that anchor points at. Both come from files captured from the running
 * app by `scripts/capture-social-card-visual.mjs`:
 *
 *   public/social-card-process.svg — the landing hero's BPMN plane, vector
 *   public/social-card-code.json   — the hero's source lines, with token colours
 *
 * The plane is drawn as SVG at the card's scale, not as a screenshot, so its
 * labels stay sharp at feed size. Nothing on the visual is drawn for the card;
 * the demo program is fictitious and the visual says "Demo". Change the words
 * or the crop here, re-run, and commit the PNG.
 *
 * Feed size is the design constraint: LinkedIn shows the card at about 552 px
 * wide on a desktop, so the USP is set at 46 px (≈ 21 px there) and the BPMN at
 * about twice the landing's scale.
 */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'social-card.png');
const SANS = "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, 'SFMono-Regular', Menlo, monospace";

/** The part of the plane the card shows: "Check requisition" and the decision "Material given?" (L78). */
const CROP = { x: 262, y: 347, width: 204, height: 122 };
/** The source lines shown under it; the line the selected decision is anchored to is marked. */
const CODE_FROM = 77;
const CODE_TO = 80;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const plane = (await readFile(path.join(ROOT, 'public', 'social-card-process.svg'), 'utf8'))
  .replace(/<title>[^<]*<\/title>/g, '')
  .replace(/font-family="SANS"/g, `font-family="${SANS.replace(/'/g, '')}"`)
  .replace(/font-family="MONO"/g, `font-family="${MONO.replace(/'/g, '')}"`)
  .replace(/viewBox="[^"]*"/, `viewBox="${CROP.x} ${CROP.y} ${CROP.width} ${CROP.height}" preserveAspectRatio="xMinYMin meet"`)
  .replace(/^<svg /, '<svg class="plane" ');
const program = /aria-label="The first steps of (\w+)/.exec(plane)?.[1];
if (!program) throw new Error('the captured plane does not name its program');
if (!plane.includes('data-l="78"')) throw new Error('the captured plane has no element anchored at L78 — re-capture or move the crop');

const code = JSON.parse(await readFile(path.join(ROOT, 'public', 'social-card-code.json'), 'utf8'))
  .filter((l) => l.n >= CODE_FROM && l.n <= CODE_TO)
  .map(
    (l) =>
      `<div class="l${l.mark ? ' hl' : ''}"><span class="ln">${l.n}</span><span>${l.tokens
        .map((t) => `<span style="color:${t.color}${t.italic ? ';font-style:italic' : ''}">${esc(t.text)}</span>`)
        .join('')}</span></div>`,
  )
  .join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1200px; height: 630px; background: #0b1c30; color: #fff; font-family: ${SANS}; overflow: hidden; }
  .card { position: relative; width: 1200px; height: 630px; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: linear-gradient(90deg, #006b2c, #16a34a 60%, #4ade80); }
  .left { position: absolute; left: 56px; top: 52px; bottom: 42px; width: 636px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; }
  .brand em { font-style: normal; color: #4ade80; }
  .pill { margin-left: 6px; font-size: 17px; font-weight: 600; color: #bbf7d0; border: 2px solid #16a34a; border-radius: 999px; padding: 5px 14px; letter-spacing: 0; }
  h1 { margin-top: 56px; font-size: 46px; line-height: 1.14; font-weight: 700; letter-spacing: -1px; }
  h1 em { font-style: normal; color: #4ade80; }
  .facts { margin-top: auto; display: flex; gap: 10px; flex-wrap: wrap; }
  .fact { font-size: 19px; font-weight: 600; color: #e2e8f0; background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; padding: 8px 14px; white-space: nowrap; }
  .foot { margin-top: 18px; font-size: 16px; color: #94a3b8; }

  .shot { position: absolute; left: 716px; top: 40px; width: 452px; height: 540px; background: #fff; border-radius: 20px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.35); overflow: hidden; display: flex; flex-direction: column; color: #0b1c30; }
  .head { display: flex; align-items: center; gap: 10px; padding: 16px 20px 12px; border-bottom: 1px solid #e5e7eb; }
  .head .t { font-size: 18px; font-weight: 700; }
  .head .demo { margin-left: auto; font-size: 13px; font-weight: 600; color: #4b5563; border: 1px solid #d1d5db; border-radius: 6px; padding: 2px 8px; }
  .chip { font-size: 13px; font-weight: 600; color: #1d4ed8; border: 1.5px solid #1d4ed8; border-radius: 999px; padding: 2px 9px; }
  .map { position: relative; flex: 1; padding: 6px 0 0 6px; overflow: hidden; }
  .plane { width: 446px; height: auto; display: block; }
  .map::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 56px; background: linear-gradient(90deg, rgba(255,255,255,0), #fff); }
  .code { background: #030712; padding: 12px 0 14px; font-family: ${MONO}; font-size: 19px; line-height: 33px; color: #e5e7eb; }
  .code .cap { font-family: ${SANS}; font-size: 14px; font-weight: 600; color: #9ca3af; padding: 0 20px 6px; display: flex; gap: 8px; }
  .code .cap b { color: #e5e7eb; }
  .l { white-space: pre; padding: 0 16px 0 0; display: flex; }
  .l .ln { width: 52px; text-align: right; padding-right: 14px; color: #9ca3af; flex: none; }
  .l.hl { background: rgba(59,130,246,0.32); box-shadow: inset 4px 0 0 #93c5fd; }
  .l.hl .ln { color: #e5e7eb; font-weight: 700; }
  .code { position: relative; }
  .code::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 56px; background: linear-gradient(90deg, rgba(3,7,18,0), #030712); }
</style></head><body><div class="card">
  <div class="left">
    <div class="brand">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
      <span>Clean-Core<em>.io</em></span>
      <span class="pill">Free for the SAP community</span>
    </div>
    <h1>From custom ABAP nobody understands to a reviewed, tested rebuild — <em>on one chain of evidence you can check.</em></h1>
    <div class="facts">
      <div class="fact">BPMN with line anchors</div>
      <div class="fact">Clean core level A–D</div>
      <div class="fact">Signed runs</div>
    </div>
    <div class="foot">clean-core.io · independent community project, not affiliated with SAP SE</div>
  </div>
  <div class="shot">
    <div class="head"><span class="t">Process — reconstructed from code</span><span class="demo">Demo</span></div>
    <div class="map">${plane}</div>
    <div class="code"><div class="cap"><b>${program}</b><span>source · fictitious demo code</span></div>${code}</div>
  </div>
  <div class="bar"></div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, type: 'png' });
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
} finally {
  await browser.close();
}
