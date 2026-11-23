/**
 * scripts/regenerate-demo-showcase.ts — the drawings of the public demo showcase
 * (roadmap 3.5.0 item 8, DEMO-1).
 *
 *   npx tsx scripts/regenerate-demo-showcase.ts            # draw every level and write lib/demo-showcase-planes.json
 *   npx tsx scripts/regenerate-demo-showcase.ts --check # compare the recorded BPMN digest, exit 1 on drift
 *
 * The showcase at `/demo` shows the demo's process map without loading the map
 * viewer: every level of the demo's own BPMN 2.0 file
 * (`buildDemoWorkspace().processMap.xml`) is drawn here, once, by bpmn-js — the
 * renderer the product's map uses (`components/process-map/BpmnCanvas.tsx`) —
 * with the product's type and ink (`components/process-map/bpmn-view.ts`), and
 * saved as SVG. The figures around the map are not recorded: the page computes
 * them on the server from the same engine run (`lib/demo-showcase.ts`).
 *
 * The record keeps the SHA-256 of the BPMN file it drew;
 * `tests/demo-showcase-record.spec.ts` fails when the engine of the checkout
 * writes a different file, so a change to the engine cannot ship with drawings
 * of the old reading. The drawing runs in a local headless Chromium with the
 * app's own Inter file; it loads nothing from the network.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { chromium } from '@playwright/test';
import { buildDemoWorkspace } from '@/lib/demo-workspace';
import { LABEL_FONT } from '@/lib/bpmn/layout';
import {
  DEMO_SHOWCASE_PLANES_COMMENT,
  DEMO_SHOWCASE_PLANES_FILE,
  TOP_PLANE,
  type ShowcasePlanesRecord,
} from '@/lib/demo-showcase-planes';

const ROOT = process.cwd();
const file = path.resolve(ROOT, DEMO_SHOWCASE_PLANES_FILE);
const data = buildDemoWorkspace();
const xml = data.processMap.xml;
const xmlSha256 = createHash('sha256').update(xml).digest('hex');

if (process.argv.includes('--check')) {
  let recorded: ShowcasePlanesRecord | null = null;
  try {
    recorded = JSON.parse(fs.readFileSync(file, 'utf8')) as ShowcasePlanesRecord;
  } catch {
    recorded = null;
  }
  if (!recorded || recorded.xmlSha256 !== xmlSha256) {
    console.error(`- ${DEMO_SHOWCASE_PLANES_FILE} was drawn from another BPMN file; run npx tsx scripts/regenerate-demo-showcase.ts`);
    process.exit(1);
  }
  console.log('The showcase drawings match the engine of this checkout.');
  process.exit(0);
}

const bundle = fs.readFileSync(path.resolve(ROOT, 'node_modules/bpmn-js/dist/bpmn-navigated-viewer.production.min.js'), 'utf8');
const rendererVersion = (JSON.parse(fs.readFileSync(path.resolve(ROOT, 'node_modules/bpmn-js/package.json'), 'utf8')) as { version: string }).version;
const font = fs.readFileSync(path.resolve(ROOT, 'app/fonts/inter-latin-variable.woff2')).toString('base64');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Inter";src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:300 900}
html,body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
#c{width:1600px;height:1200px}
</style></head><body><div id="c"></div></body></html>`;

type DrawnPlane = { root: string; svg: string };

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Nothing leaves the machine: every request the page would make is refused.
    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load' });
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const drawn = await page.evaluate(
      async ({ xml, fontSize }) => {
        type Root = { id: string };
        type Canvas = { getRootElements(): Root[]; setRootElement(root: Root): void };
        type Viewer = {
          importXML(xml: string): Promise<unknown>;
          saveSVG(): Promise<{ svg: string }>;
          get(name: 'canvas'): Canvas;
        };
        const ViewerClass = (window as unknown as { BpmnJS: new (options: unknown) => Viewer }).BpmnJS;
        const viewer = new ViewerClass({
          container: '#c',
          textRenderer: {
            defaultStyle: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', fontSize, fontWeight: 'normal', lineHeight: 1.2 },
            externalStyle: { fontSize },
          },
          bpmnRenderer: { defaultStrokeColor: '#0b1c30', defaultLabelColor: '#0b1c30', defaultFillColor: '#ffffff' },
        });
        await viewer.importXML(xml);
        const canvas = viewer.get('canvas');
        const out: Array<{ root: string; svg: string }> = [];
        for (const root of canvas.getRootElements()) {
          canvas.setRootElement(root);
          const { svg } = await viewer.saveSVG();
          out.push({ root: root.id, svg });
        }
        return out;
      },
      { xml, fontSize: LABEL_FONT },
    );
    write(drawn);
  } finally {
    await browser.close();
  }
}

function write(drawn: DrawnPlane[]): void {
  const planes: ShowcasePlanesRecord['planes'] = [];
  for (const plane of data.processMap.planes) {
    const id = plane.id ?? TOP_PLANE;
    const svg = plane.id
      ? drawn.find((d) => d.root === `${plane.id}_plane`)?.svg
      : drawn.find((d) => !d.root.endsWith('_plane'))?.svg;
    if (!svg) throw new Error(`bpmn-js drew no level for ${id}`);
    const box = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg);
    if (!box) throw new Error(`the drawing of ${id} has no viewBox`);
    // The declaration and the export comment are not part of the picture.
    const body = svg.replace(/<\?xml[^>]*\?>\s*/, '').replace(/<!--[\s\S]*?-->\s*/g, '').replace(/<!DOCTYPE[^>]*>\s*/, '');
    planes.push({ id, label: plane.label, w: Math.ceil(Number(box[3])), h: Math.ceil(Number(box[4])), svg: body });
  }
  const record: ShowcasePlanesRecord = {
    $comment: DEMO_SHOWCASE_PLANES_COMMENT,
    xmlSha256,
    renderer: `bpmn-js ${rendererVersion} NavigatedViewer`,
    planes,
  };
  fs.writeFileSync(file, `${JSON.stringify(record, null, 1)}\n`);
  const size = fs.statSync(file).size;
  console.log(`Wrote ${DEMO_SHOWCASE_PLANES_FILE}: ${planes.length} levels, ${Math.round(size / 1024)} kB.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
