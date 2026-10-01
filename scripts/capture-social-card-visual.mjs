/**
 * Captures the product visual of the social card from the running app:
 *
 *   public/social-card-process.svg — the landing hero's BPMN plane (the demo
 *     program's first steps, reconstructed from the code by the engine), as
 *     self-contained SVG: every computed colour, stroke and font is written onto
 *     the element, so it renders without the app's stylesheet.
 *   public/social-card-code.json — the source lines the hero shows beside it,
 *     with the colour each token is drawn in.
 *
 *   CARD_BASE_URL=http://localhost:3497 node scripts/capture-social-card-visual.mjs
 *   node scripts/render-social-card.mjs
 *
 * Nothing here is drawn for the card. Both files are what the landing page
 * renders from `lib/landing-process.ts` — the engine's run over the fictitious
 * demo program — and the card says "Demo" on the visual. Re-capture when the
 * hero changes; both files are committed so the card renders without a server.
 */
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CARD_BASE_URL;
if (!BASE) {
  console.error('Set CARD_BASE_URL to a running app, e.g. CARD_BASE_URL=http://localhost:3497');
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(new URL('/', BASE).toString(), { waitUntil: 'networkidle', timeout: 240_000 });

  const captured = await page.evaluate(() => {
    const svg = document.querySelector('.flow-wide svg[data-bpmn-plane]');
    if (!svg) throw new Error('the hero BPMN plane (.flow-wide svg[data-bpmn-plane]) is not on the page');
    const PROPS = [
      'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap',
      'opacity', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
    ];
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((el, i) => {
      const out = dst[i];
      const cs = getComputedStyle(el);
      // Only what differs from the parent: the rest is inherited, as in the page.
      const parent = i === 0 ? null : getComputedStyle(el.parentElement);
      for (const p of PROPS) {
        const v = cs.getPropertyValue(p);
        if (!parent || parent.getPropertyValue(p) !== v) out.setAttribute(p, v);
      }
      if (el.tagName === 'text' || el.tagName === 'tspan') {
        const mono = /mono/i.test(cs.fontFamily) || /font-cc-mono/.test(el.getAttribute('class') ?? '');
        out.setAttribute('font-family', mono ? 'MONO' : 'SANS');
      }
      out.removeAttribute('class');
      out.removeAttribute('style');
      out.removeAttribute('tabindex');
      out.removeAttribute('role');
      for (const a of [...out.attributes]) if (a.name.startsWith('data-') && a.name !== 'data-l') out.removeAttribute(a.name);
    });
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const code = [...document.querySelectorAll('[data-hero-line]')].map((line) => ({
      n: Number(line.getAttribute('data-hero-line')),
      mark: line.classList.contains('hl'),
      tokens: [...line.childNodes]
        .filter((c) => !(c instanceof HTMLElement && c.classList.contains('ln')))
        .map((c) => ({
          text: c.textContent ?? '',
          color: c instanceof HTMLElement ? getComputedStyle(c).color : getComputedStyle(line).color,
          italic: c instanceof HTMLElement && getComputedStyle(c).fontStyle === 'italic',
        }))
        .filter((t) => t.text.length > 0),
    }));
    return { svg: clone.outerHTML, code };
  });

  const svgOut = path.join(ROOT, 'public', 'social-card-process.svg');
  const codeOut = path.join(ROOT, 'public', 'social-card-code.json');
  await writeFile(svgOut, captured.svg + '\n');
  await writeFile(codeOut, '[\n' + captured.code.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n]\n');
  console.log(`wrote ${path.relative(ROOT, svgOut)} and ${path.relative(ROOT, codeOut)}`);
} finally {
  await browser.close();
}
