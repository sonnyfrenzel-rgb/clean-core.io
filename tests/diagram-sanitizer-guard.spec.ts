import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';

/**
 * The third layer under the architecture diagram (SEC-2026-015).
 *
 * The diagram is drawn by mermaid from a chart this application builds, and the
 * result is written into the page with `innerHTML`. Two layers sit above this
 * one — `components/MermaidDiagram.tsx` initialises mermaid with
 * `securityLevel: 'strict'`, and the model-drawn `TargetArchitectureDiagram`
 * stripped its node labels before they became mermaid source (removed on
 * 01.10.2026 with the diagram itself: the Design stage draws its architecture
 * from the engine, not from model text) — and this file holds the third: the
 * SVG is parsed and rebuilt before it reaches the DOM.
 *
 * Two things have to be true at once, and they pull against each other. The
 * labels must survive: mermaid v11 renders them as XHTML inside
 * `<foreignObject>`, and a sanitizer that drops that markup leaves a row of
 * blank boxes. Nothing behavioural may survive. So the checks below run the
 * shipped sanitizer over a diagram this machine's mermaid actually produced,
 * and over the shapes a picture has no business containing.
 *
 * The module is bundled for the browser rather than imported here on purpose:
 * it is only ever called client-side, where DOMPurify runs against the real
 * window, and that is the environment worth measuring.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const MERMAID_BUNDLE = path.resolve(ROOT, 'node_modules/mermaid/dist/mermaid.min.js');

/** What the page under test carries once the two bundles are in it. */
declare global {
  interface Window {
    mermaid: {
      initialize: (options: unknown) => void;
      render: (id: string, chart: string) => Promise<{ svg: string }>;
    };
    CleanCoreSanitize: { sanitizeMermaidSvg: (svg: string) => string };
    __breach?: unknown;
  }
}

/** The chart below is drawn with the options components/MermaidDiagram.tsx uses (it adds token colours as themeVariables at runtime). */
const MERMAID_OPTIONS = {
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'strict',
  flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis', padding: 15, nodeSpacing: 30, rankSpacing: 40 },
};

const CHART = [
  'graph TD',
  '  A["Sales Order Check"] --> B{"Credit limit exceeded?"}',
  '  B -->|Yes| C["Block and notify ZCREDIT_CHECK"]',
  '  B -->|No| D["Post document"]',
  '  C --> E["Custom table ZKREDIT"]',
].join('\n');

const LABELS = ['Sales Order Check', 'Credit limit exceeded', 'ZCREDIT_CHECK', 'Post document', 'ZKREDIT'];

/**
 * The shipped module, compiled for a browser. `jsdom` is the server-side half of
 * `getPurify()` and is never reached in a window, so it stays external.
 */
async function browserBundle(): Promise<string> {
  const result = await build({
    entryPoints: [path.resolve(ROOT, 'lib/sanitize-html.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'CleanCoreSanitize',
    platform: 'browser',
    external: ['jsdom'],
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

test.describe('the architecture diagram is parsed, not pattern-matched', () => {
  test.setTimeout(120 * 1000);

  test('a real mermaid v11 diagram survives whole, and nothing behavioural does', async ({ page }) => {
    const bundle = await browserBundle();

    await page.setContent('<!doctype html><html><body><div id="host"></div></body></html>');
    await page.addScriptTag({ path: MERMAID_BUNDLE });
    await page.addScriptTag({ content: bundle });

    const raw: string = await page.evaluate(async ({ chart, options }) => {
      window.mermaid.initialize(options);
      const { svg } = await window.mermaid.render('guarddiagram', chart);
      return svg as string;
    }, { chart: CHART, options: MERMAID_OPTIONS });

    // The premise of the whole exercise: this is where the labels live.
    expect(raw, 'mermaid no longer renders labels in <foreignObject>').toContain('<foreignObject');
    for (const label of LABELS) expect(raw, `mermaid did not draw "${label}"`).toContain(label);

    const cleaned: string = await page.evaluate(
      (svg) => window.CleanCoreSanitize.sanitizeMermaidSvg(svg),
      raw,
    );

    // Not "most of it survives" — all of it. A diagram that loses a filter, a
    // marker or the theme <style> block is a diagram that looks broken, and
    // that is how the last attempt at this was abandoned.
    expect(cleaned, 'the sanitizer changed a diagram it had no reason to change').toBe(raw);

    // Shapes a picture has no business containing. Each is checked for what it
    // would do, not for the exact text of the input.
    const cases: Array<{ name: string; dirty: string; mustKeep?: string }> = [
      {
        name: 'a handler on a label',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="80" height="24"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="window.__breach = 1">Order</div></foreignObject></svg>',
        mustKeep: 'Order',
      },
      {
        name: 'a handler introduced without whitespace before it',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"/onload="window.__breach = 1"><text>Order</text></svg>',
      },
      {
        name: 'a handler on a group',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"><g onclick="window.__breach = 1"><text>Order</text></g></svg>',
        mustKeep: 'Order',
      },
      {
        name: 'a frame that is never closed',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><iframe src="data:text/html,%3Cscript%3Ewindow.__breach=1%3C/script%3E">Order</div></foreignObject></svg>',
      },
      {
        name: 'a script inside a label',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><span>Order</span><script>window.__breach = 1</' + 'script></div></foreignObject></svg>',
        mustKeep: 'Order',
      },
      {
        name: 'a link that navigates to code',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:window.__breach = 1"><text>Order</text></a></svg>',
      },
      {
        name: 'a link whose scheme is spelled with entities',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"><a href="jav&#x61;script&#x3a;window.__breach = 1"><text>Order</text></a></svg>',
      },
      {
        name: 'an animation that rewrites a link into code',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="href" to="javascript:window.__breach = 1"/><text>Order</text></a></svg>',
      },
      {
        name: 'a form inside a label',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><form action="https://example.invalid"><input name="q"></form>Order</div></foreignObject></svg>',
        mustKeep: 'Order',
      },
      {
        name: 'a reference to a document carried in the attribute',
        dirty: '<svg xmlns="http://www.w3.org/2000/svg"><use href="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PndpbmRvdy5fX2JyZWFjaCA9IDE8L3NjcmlwdD48L3N2Zz4="/></svg>',
      },
    ];

    const outcome = await page.evaluate((inputs: Array<{ name: string; dirty: string }>) => {
      const S = window.CleanCoreSanitize;
      return inputs.map(({ name, dirty }) => {
        const host = document.createElement('div');
        const cleanedOne = S.sanitizeMermaidSvg(dirty);
        host.innerHTML = cleanedOne;
        document.body.appendChild(host);
        const handlers: string[] = [];
        host.querySelectorAll('*').forEach((el) => {
          for (const attr of Array.from(el.attributes)) {
            if (/^on/i.test(attr.name)) handlers.push(`${el.tagName}[${attr.name}]`);
            if (/^\s*(javascript|data|vbscript):/i.test(attr.value)) handlers.push(`${el.tagName}[${attr.name}=scheme]`);
          }
        });
        const out = {
          name,
          cleaned: cleanedOne,
          text: host.textContent || '',
          scripts: host.querySelectorAll('script, iframe, object, embed, form, input, set, animate').length,
          handlers,
          // A second pass must not find anything new to do: output that changes
          // when it is fed back in is output whose meaning depends on who parses it.
          stable: S.sanitizeMermaidSvg(cleanedOne) === cleanedOne,
        };
        host.remove();
        return out;
      });
    }, cases.map(({ name, dirty }) => ({ name, dirty })));

    // Whatever any of those tried to do, nothing ran.
    expect(await page.evaluate(() => window.__breach), 'something in the diagram ran').toBeUndefined();

    for (let i = 0; i < cases.length; i += 1) {
      const got = outcome[i];
      expect(got.handlers, `${got.name}: behaviour left on an element`).toEqual([]);
      expect(got.scripts, `${got.name}: an active element survived`).toBe(0);
      expect(got.stable, `${got.name}: a second pass changed the result`).toBe(true);
      const keep = cases[i].mustKeep;
      if (keep) expect(got.text, `${got.name}: the label was thrown away with the payload`).toContain(keep);
    }
  });

  test('nothing in a sanitized diagram points outside it', async ({ page }) => {
    const bundle = await browserBundle();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: bundle });

    // Every input names the same outside host; the check is that the host does
    // not survive, whatever carried it. Labels that sit beside a reference must.
    const OUTSIDE = 'example.invalid';
    const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
    const label = (inner: string) => svg(`<foreignObject width="80" height="24"><div xmlns="http://www.w3.org/1999/xhtml">${inner}</div></foreignObject>`);
    const cases: Array<{ name: string; dirty: string; mustKeep?: string }> = [
      { name: 'an inline style with a resource', dirty: svg(`<rect style="fill: url(https://${OUTSIDE}/a)" width="4" height="4"/><text>Order</text>`), mustKeep: 'Order' },
      { name: 'a stylesheet that imports', dirty: svg(`<style>@import url(https://${OUTSIDE}/b.css);</style><text>Order</text>`), mustKeep: 'Order' },
      { name: 'a stylesheet with a resource', dirty: svg(`<style>.n{background:url("https://${OUTSIDE}/c")}</style><text>Order</text>`), mustKeep: 'Order' },
      { name: 'a resource spelled with an escape', dirty: svg(`<rect style="background:\\75 rl(https://${OUTSIDE}/d)" width="4" height="4"/>`) },
      { name: 'an image set', dirty: svg(`<rect style="background-image:image-set('https://${OUTSIDE}/e.png' 1x)" width="4" height="4"/>`) },
      { name: 'an image in a label', dirty: label(`<img src="https://${OUTSIDE}/f.png">Order`), mustKeep: 'Order' },
      { name: 'a link in a label', dirty: label(`<a href="https://${OUTSIDE}/g">Order</a>`), mustKeep: 'Order' },
      { name: 'a link in the picture', dirty: svg(`<a href="https://${OUTSIDE}/h"><text>Order</text></a>`), mustKeep: 'Order' },
      { name: 'an SVG image', dirty: svg(`<image href="https://${OUTSIDE}/i.png" width="4" height="4"/>`) },
      { name: 'a reference to an outside shape', dirty: svg(`<use href="https://${OUTSIDE}/j.svg#x"/>`) },
      { name: 'a filter that loads an image', dirty: svg(`<filter id="k"><feImage href="https://${OUTSIDE}/k.png"/></filter>`) },
      // QA 047ce2238fa9: a comment between a function name and its parenthesis.
      { name: 'a resource split by a comment', dirty: svg(`<style>.n{background:url/**/(https://${OUTSIDE}/m)}</style><text>Order</text>`), mustKeep: 'Order' },
      { name: 'an image set split by a comment', dirty: svg(`<rect style="background-image:image-set/**/('https://${OUTSIDE}/n.png' 1x)" width="4" height="4"/>`) },
      { name: 'a background on a label table', dirty: label(`<table background="https://${OUTSIDE}/l.png"><tr><td>Order</td></tr></table>`), mustKeep: 'Order' },
      // Carried QA finding 176ee12c2d66: presentation attributes take url() too.
      { name: 'a marker from outside', dirty: svg(`<path d="M0 0" marker-end="url(https://${OUTSIDE}/o.svg#m)"/><text>Order</text>`), mustKeep: 'Order' },
      { name: 'a fill and a stroke from outside', dirty: svg(`<rect fill="url(//${OUTSIDE}/p)" stroke="url('https://${OUTSIDE}/q')" width="4" height="4"/>`) },
    ];

    const outcome = await page.evaluate((inputs: Array<{ name: string; dirty: string }>) => {
      return inputs.map(({ name, dirty }) => {
        const cleaned = window.CleanCoreSanitize.sanitizeMermaidSvg(dirty);
        const host = document.createElement('div');
        host.innerHTML = cleaned;
        return { name, cleaned, text: host.textContent || '' };
      });
    }, cases.map(({ name, dirty }) => ({ name, dirty })));

    for (let i = 0; i < cases.length; i += 1) {
      const got = outcome[i];
      expect(got.cleaned, `${got.name}: a reference to the outside survived`).not.toContain(OUTSIDE);
      const keep = cases[i].mustKeep;
      if (keep) expect(got.text, `${got.name}: the label was thrown away with the reference`).toContain(keep);
    }

    // The arrowheads mermaid draws are same-document references, and they stay.
    const marked = await page.evaluate(
      (dirty: string) => window.CleanCoreSanitize.sanitizeMermaidSvg(dirty),
      svg('<defs><marker id="arrowhead"><path d="M0 0"/></marker></defs><path d="M0 0" marker-end="url(#arrowhead)"/>'),
    );
    expect(marked, 'a same-document marker was thrown away').toContain('marker-end="url(#arrowhead)"');

    // The module exports one SVG sanitizer. A second one, configured looser than
    // this and documented as stricter, is how a caller picks the wrong one.
    const exported = await page.evaluate(() => Object.keys(window.CleanCoreSanitize));
    expect(exported.filter((name) => /svg/i.test(name))).toEqual(['sanitizeMermaidSvg']);
  });

  test('the sanitizer is a parser and the layers above it are still there', () => {
    const src = read('lib/sanitize-html.ts');
    const body = src.slice(src.indexOf('export function sanitizeMermaidSvg'));
    const fn = body.slice(0, body.indexOf('\n}') + 2);
    expect(fn, 'the diagram sanitizer no longer goes through DOMPurify').toContain('getPurify().sanitize');
    expect(fn, 'the diagram sanitizer is matching patterns again').not.toContain('.replace(');
    // Without this option DOMPurify empties every <foreignObject>, and it has to
    // be a record: an array's entries are not keys, the lookup misses, and the
    // labels vanish with no error anywhere.
    expect(src).toContain('HTML_INTEGRATION_POINTS: { foreignobject: true }');

    const diagram = read('components/MermaidDiagram.tsx');
    expect(diagram, 'mermaid is no longer initialised in strict mode').toContain("securityLevel: 'strict'");

    // The model-drawn architecture diagram is gone (owner decision 01.10.2026):
    // the Design stage's picture is built from the engine's findings as SVG, so
    // no model-written label becomes mermaid source there. Should a model-fed
    // diagram come back, its label layer has to come back with it.
    expect(fs.existsSync(path.join(ROOT, 'components/design/TargetArchitectureDiagram.tsx'))).toBe(false);
    for (const rel of ['app/(app)/project/[projectId]/design/page.tsx', 'components/design/DesignCanvasStage.tsx']) {
      expect(read(rel), `${rel} renders mermaid again; neutralise its labels before they become chart source`).not.toContain('MermaidDiagram');
    }
  });
});
