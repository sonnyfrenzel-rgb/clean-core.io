import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test, expect, type Page } from './helpers/test';
import { seedLayoutProject } from './helpers/analyze-layout';
import { signInThroughForm } from './helpers/seed-project';
import { createDraftHolder, draftFor } from '../lib/process-map-draft';
import { ANALYZE_FULLSCREEN_MESSAGES, fullScreenHits } from '../lib/messages/analyze-fullscreen';

/**
 * The map's full screen on Analyze, Business — plan `docs/design/analyze-business-first-plan.md` §4.2, AB-5 (3.2.0),
 * mockup `docs/roadmap/analyze-business-first-mockup.html` states 14, 15 and 16, ADR-119.
 *
 * One bar (find a step by the name the map shows, zoom, fit, the overview map, the "Edit" switch — off on open —,
 * "Walk me through it", "Leave full screen"), a side column (the tour while it runs, the code of a chosen step, the
 * hits of a search), editing as today's editor behind the switch with "Save as revision" and the N8 sentence. On a
 * phone "Edit" is disabled with a sentence (P3). An unsaved draft survives leaving; a save writes a new revision and
 * revision 1 stays; the Documentation stage's editor is what it was.
 *
 * The first half reads source and renders the bar and the side column as static markup — no server. The second half
 * (`@rendered`) opens the page and runs on the production build with the emulators (the list in §4.2).
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
/** Source without comments — prose may name what code must not do. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const MAP = 'components/process-map/ProcessMap.tsx';
const CANVAS = 'components/process-map/BpmnCanvas.tsx';
const EDITOR = 'components/process-map/BpmnEditor.tsx';
const DOCUMENTATION = 'app/(app)/project/[projectId]/documentation/page.tsx';

test.describe('the words', () => {
  test('N8: editing says the reconstruction stays, and a save is a revision', () => {
    expect(ANALYZE_FULLSCREEN_MESSAGES['fullScreen.editNote']).toBe(
      'Editing a draft. The reconstructed as-is process (revision 1) stays unchanged whatever you save.',
    );
    expect(ANALYZE_FULLSCREEN_MESSAGES['fullScreen.saveAsRevision']).toBe('Save as revision');
  });

  test('P3: a phone is told why "Edit" cannot be switched on', () => {
    expect(ANALYZE_FULLSCREEN_MESSAGES['fullScreen.editPhone']).toMatch(/^Editing needs a larger screen\./);
  });

  test('the hits are counted in a sentence', () => {
    expect(fullScreenHits(3, 'order')).toBe('3 steps match “order”');
    expect(fullScreenHits(1, 'order')).toBe('1 step matches “order”');
    expect(fullScreenHits(0, 'zz')).toBe('No step matches “zz”');
  });
});

test.describe('the source: full screen is the page layout\'s, everything else keeps its own', () => {
  test('only Analyze, Business (`layout="page"`) hands the canvas its full-screen parts', () => {
    const map = code(MAP);
    expect(map).toContain("const fullscreenParts: CanvasFullscreenParts | null = page ? {");
    expect(map).toContain('fullscreenParts={fullscreenParts}');
    expect(map).toContain('onFullscreenChange={page ? onFullscreenChange : undefined}');
    // The Documentation stage mounts the map as a stage, with no tour, so its full screen is the old one.
    const doc = code(DOCUMENTATION);
    const mount = doc.slice(doc.indexOf('<ProcessMap'), doc.indexOf('/>', doc.indexOf('<ProcessMap')));
    expect(mount).toContain('layout="stage"');
    expect(mount).not.toMatch(/\bonWalk=|\btourPanel=|\bembedded\b/);
  });

  test('"Edit" is off whenever full screen opens, unless "Edit model" opened it', () => {
    const map = code(MAP);
    expect(map).toContain('setFsEditing(filled && fsEditOnOpen.current);');
    expect(map).toContain('fsEditOnOpen.current = false;');
    // "Edit model" on the page is the way into full screen with the switch on; elsewhere it edits inline as before.
    expect(map).toContain('if (page) openEditing();');
    // The asked mode only: the modeller itself opens while the project allows editing (`editing = editingAsked && canEdit`).
    expect(map).toContain('else setEditingAsked(!editing);');
  });

  test('a phone and an invited reader get "Edit" disabled with a sentence (P3, P8)', () => {
    const map = code(MAP);
    expect(map).toContain("const fsEditBlocked = !canEdit ? wt('input.ownerOnly') : isPhone ? wt('fullScreen.editPhone') : null;");
    expect(map).toContain('const fsEditBody = page && fsOpen && fsEditing && fsEditBlocked === null;');
    expect(map).toContain('body: fsEditBody ? editorElement(true) : null,');
  });

  test('the editor in full screen is today\'s, on the same draft, key and save as inline', () => {
    const map = code(MAP);
    // One mounting for both places: the inline one and the embedded one differ only in `embedded`.
    expect(map.match(/<BpmnEditor\b/g) ?? []).toHaveLength(1);
    expect(map).toContain('editorElement(false)');
    expect(map).toContain('embedded={embedded}');
    const mount = map.slice(map.indexOf('<BpmnEditor'), map.indexOf('/>', map.indexOf('<BpmnEditor')));
    for (const prop of ['openWith={openWith}', 'onDraftChange={keepDraft}', 'onDiscard={discardDraft}', 'save={save}', 'openLatest={openLatest}']) {
      expect(mount, `the editor in full screen lost ${prop}`).toContain(prop);
    }
  });

  test('the editor keeps its old face unless it is embedded (Documentation unchanged)', () => {
    const editor = code(EDITOR);
    expect(editor).toContain('embedded = false,');
    expect(editor).toContain("{wt(embedded ? 'fullScreen.saveAsRevision' : 'mapEditor.save')}");
    expect(editor).toContain("{wt(embedded ? 'fullScreen.editNote' : 'editor.startedFromIst')}");
    // Embedded, it offers no full screen of its own and never leaves the map's to open the import dialog.
    expect(editor).toMatch(/\{embedded \? null : \(\s*<>\s*<span className="ml-auto" \/>\s*<CanvasFullscreenToggle scope="editor"/);
    expect(editor).toContain('if (!embedded && document.fullscreenElement)');
  });

  test('the frame is a named dialog with focus in and out, Escape, and Tab kept inside (BpmnCanvas)', () => {
    const canvas = code(CANVAS);
    expect(canvas).toContain("role={own ? 'dialog' : undefined}");
    expect(canvas).toContain('aria-label={own ? fullscreenParts.label : undefined}');
    expect(canvas).toContain('onKeyDown={own ? keepTabInside : undefined}');
    // Only real Tab stops are the edges; that Tab stays inside is walked in the rendered state 14 below, both ways.
    expect(canvas).toContain('.filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0)');
    // Escape inside the editor ends a tool, not full screen.
    expect(canvas).toContain('escapeInside: bodyRef,');
    // A chosen step stays in full screen; its code is the side column's.
    expect(canvas).toContain('onActivate: (id) => (filledRef.current && !partsRef.current ? chooseOutOfFullscreen(');
    // The same frame and the same canvas element inline and in full screen: the viewer is never rebuilt on the way in.
    expect(canvas.match(/ref=\{frameRef\}/g) ?? []).toHaveLength(1);
    expect(canvas.match(/\{canvasElement\}/g) ?? []).toHaveLength(1);
  });

  test('"Walk me through it" in full screen starts the page\'s tour the way its own button does', () => {
    const process = code('components/workspace/WorkspaceProcess.tsx');
    expect(process).toContain('onWalk={codeOnClick ? () => requestProcessWalk(projectId) : null}');
    const map = code(MAP);
    expect(map).toContain('onWalk={onWalk && !tourPanel ? walkInFullScreen : null}');
    expect(map).toContain('tour={tourPanel}');
  });

  test('ADR-119 (d): asked for in full screen, the walk-through is the inline tour\'s card in the side column, and the canvas follows it', () => {
    const process = code('components/workspace/WorkspaceProcess.tsx');
    // One tour: the same component, stations and texts, placed in the column (`panel`) or on the page.
    expect(process).toContain('const tourInFullScreen = tourOpen && mapFull && codeOnClick;');
    expect(process).toContain('{tourOpen && model && codeOnClick && !mapFull ? (');
    const panel = process.slice(process.indexOf('tourPanel={tourInFullScreen ? ('), process.indexOf('tourStation={'));
    expect(panel).toContain('<ProcessTour');
    expect(panel).toMatch(/\binline\b[\s\S]*\bpanel\b/);
    // Leaving full screen continues on the page at the station it stood at.
    expect(process).toContain('const tourFrom = move ? move.at : (pausedAt ?? -1);');
    expect(process.match(/initialStation=\{tourFrom\}/g) ?? []).toHaveLength(2);
    // The canvas: the station's level, its light and the camera.
    expect(process).toContain('if (next.station) setPlane(next.station.plane);');
    const map = code(MAP);
    expect(map).toContain('if (tourLit) return tourLit;');
    expect(map).toContain('follow={page && fsOpen && !fsEditBody ? tourId : null}');
    const canvas = code(CANVAS);
    expect(canvas).toContain("canvas.viewbox(cameraFor(stationBounds(shape as StationShape), canvas.viewbox().outer, 'inline'));");
    expect(canvas).toContain("canvas.addMarker(follow, 'cc-tour-here');");
    // The card in the column draws no second map.
    const tour = code('components/workspace/ProcessTour.tsx');
    expect(tour).toContain('{panel ? null : (');
  });

  test('Escape in full screen with the walk-through: the phone\'s sheet first, then the walk-through, then full screen', () => {
    const process = code('components/workspace/WorkspaceProcess.tsx');
    const esc = process.slice(process.indexOf('if (!tourInFullScreen) return undefined;'), process.indexOf("window.removeEventListener('keydown', onKey, true);"));
    expect(esc).toContain("if (event.key !== 'Escape' || event.defaultPrevented || ccModalOpen()) return;");
    expect(esc).toContain("if (document.querySelector('[data-map-fullscreen-sheet]')) return;");
    expect(esc).toContain('closeTour();');
    expect(esc).toContain("window.addEventListener('keydown', onKey, true);");
    // The sheet closes on Escape before anything behind it and gives the focus back to its button.
    const bar = code('components/process-map/ProcessFullScreen.tsx');
    expect(bar).toMatch(/const onKey = \(event: KeyboardEvent\) => \{\s*if \(event\.key !== 'Escape'[\s\S]*?close\(true\);/);
  });
});

test.describe('the compact way up (the phone\'s full-screen bar, static markup)', () => {
  test('the levels above are hidden and no Tab stop; the way up and the level on show are what the keyboard meets', async () => {
    const out = path.join(ROOT, 'tmp', 'analyze-fullscreen', String(process.pid), 'ProcessBreadcrumb.cjs');
    await build({
      entryPoints: [path.join(ROOT, 'components', 'process-map', 'ProcessBreadcrumb.tsx')],
      outfile: out,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    const Crumbs = (require(out) as { default: (props: Record<string, unknown>) => React.ReactElement }).default;
    const crumbs = [
      { plane: null, label: 'Process', outline: '' },
      { plane: 'sp1', label: 'Check requisition', outline: '4' },
      { plane: 'sp2', label: 'Check account assignment', outline: '4.7' },
    ];
    const compact = renderToStaticMarkup(React.createElement(Crumbs, { crumbs, onOpen: () => undefined, compact: true }));
    const ancestors = [...compact.matchAll(/<button[^>]*data-process-crumb="(top|sp1)"[^>]*>/g)].map((m) => m[0]);
    expect(ancestors).toHaveLength(2);
    for (const tag of ancestors) expect(tag, 'a hidden level above is a Tab stop').toContain('tabindex="-1"');
    expect(compact).toContain('data-process-up=""');
    // Inline, the levels above are visible links and stay in the Tab order.
    const inline = renderToStaticMarkup(React.createElement(Crumbs, { crumbs, onOpen: () => undefined }));
    for (const tag of [...inline.matchAll(/<button[^>]*data-process-crumb="(top|sp1)"[^>]*>/g)].map((m) => m[0])) {
      expect(tag).not.toContain('tabindex="-1"');
    }
  });
});

test.describe('an unsaved draft survives leaving full screen', () => {
  test('the editor goes, the draft stays with the holder, and opens again in its own project', () => {
    const holder = createDraftHolder();
    const source = 'REPORT z_po.\nIF lv_amount > 5000.\nENDIF.';
    // "Edit" on in full screen: every stroke is kept (`keepDraft`)…
    holder.set({ projectId: 'p1', source, xml: '<bpmn:definitions id="drawn"/>' });
    // …"Leave full screen" unmounts the editor, and the way back in opens what was drawn.
    expect(draftFor(holder.get(), 'p1', source)).toBe('<bpmn:definitions id="drawn"/>');
    expect(draftFor(holder.get(), 'p2', source)).toBeNull();
  });
});

test.describe('the bar and the side column (static markup)', () => {
  type Mod = {
    FullScreenBar: (props: Record<string, unknown>) => React.ReactElement;
    FullScreenRail: (props: Record<string, unknown>) => React.ReactElement;
  };
  let mod: Mod | null = null;
  async function load(): Promise<Mod> {
    if (mod) return mod;
    const out = path.join(ROOT, 'tmp', 'analyze-fullscreen', String(process.pid), 'ProcessFullScreen.cjs');
    await build({
      entryPoints: [path.join(ROOT, 'components', 'process-map', 'ProcessFullScreen.tsx')],
      outfile: out,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    mod = require(out) as Mod;
    return mod;
  }
  const tools = { zoom: 100, zoomBy: () => undefined, fit: () => undefined, leave: () => undefined, leaveRef: { current: null }, levelPath: null };
  const bar = (over: Record<string, unknown> = {}) => ({
    tools,
    processName: 'Emergency purchase approval',
    place: React.createElement('span', { 'data-place': '' }, 'Process'),
    steps: false,
    search: React.createElement('input', { 'data-search': '' }),
    editing: false,
    overview: true,
    onOverviewChange: () => undefined,
    editBlocked: null,
    onEditingChange: () => undefined,
    onWalk: () => undefined,
    ...over,
  });

  test('state 14: find, zoom, fit, the overview map, "Edit" off, "Walk me through it", "Leave full screen"', async () => {
    const { FullScreenBar } = await load();
    const html = renderToStaticMarkup(React.createElement(FullScreenBar, bar()));
    expect(html).toContain('aria-label="Map tools, full screen"');
    expect(html).toContain('data-search=""');
    for (const hook of ['data-map-zoom-out', 'data-map-zoom-in', 'data-map-fit', 'data-map-fullscreen-overview']) {
      expect(html, hook).toContain(`${hook}=""`);
    }
    expect(html).toMatch(/data-map-fullscreen-overview=""[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-map-fullscreen-overview=""/);
    expect(html).toMatch(/role="switch" aria-checked="false"/);
    expect(html).toContain('>Edit</label>');
    expect(html).toContain('data-map-fullscreen-walk=""');
    expect(html).toContain('Walk me through it');
    // The way out, in words, with the hook every full-screen spec finds it by.
    expect(html).toContain('data-map-fullscreen-toggle=""');
    expect(html).toContain('Leave full screen');
    // The order of the bar: find, then zoom, then "Edit", then the walk, the way out last.
    const at = (s: string) => html.indexOf(s);
    expect(at('data-search')).toBeLessThan(at('data-map-zoom-out'));
    expect(at('data-map-zoom-out')).toBeLessThan(at('role="switch"'));
    expect(at('role="switch"')).toBeLessThan(at('data-map-fullscreen-walk'));
    expect(at('data-map-fullscreen-walk')).toBeLessThan(at('data-map-fullscreen-toggle'));
  });

  test('state 15: editing on — the switch says so; zoom, fit and the overview are the editor\'s own', async () => {
    const { FullScreenBar } = await load();
    const html = renderToStaticMarkup(React.createElement(FullScreenBar, bar({ editing: true })));
    expect(html).toMatch(/role="switch" aria-checked="true"/);
    expect(html).not.toContain('data-map-zoom-in');
    expect(html).not.toContain('data-search');
    expect(html).toContain('data-map-fullscreen-toggle=""');
  });

  test('P3: on a phone "Edit" is disabled, and the sentence why is its description', async () => {
    const { FullScreenBar } = await load();
    const why = ANALYZE_FULLSCREEN_MESSAGES['fullScreen.editPhone'];
    const html = renderToStaticMarkup(React.createElement(FullScreenBar, bar({ editBlocked: why })));
    const sw = html.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? '';
    expect(sw).toContain('disabled=""');
    const described = sw.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(described, 'the disabled switch names no sentence').toBeTruthy();
    expect(html).toContain(`id="${described}"`);
    expect(html).toContain(why);
    expect(html).toContain('data-map-fullscreen-edit="blocked"');
  });

  test('state 16: while the tour runs, the bar offers no second start and the tour stands first in the column', async () => {
    const { FullScreenBar, FullScreenRail } = await load();
    expect(renderToStaticMarkup(React.createElement(FullScreenBar, bar({ onWalk: null })))).not.toContain('data-map-fullscreen-walk');
    const rail = renderToStaticMarkup(React.createElement(FullScreenRail, {
      tour: React.createElement('section', { 'data-tour-card': '' }, 'Step 4 of 9'),
      code: React.createElement('section', { 'data-process-code-card': 'x' }),
      results: null,
      listId: 'hits',
      byId: new Map(),
      onJump: () => undefined,
      overview: React.createElement('div', { 'data-process-minimap': '' }),
    }));
    expect(rail).toContain('data-tour-card=""');
    expect(rail).not.toContain('data-process-code-card');
    expect(rail.indexOf('data-tour-card')).toBeLessThan(rail.indexOf('data-process-minimap'));
  });

  test('the column: the code of a chosen step, else the hits by the name the map shows, else what a click does', async () => {
    const { FullScreenRail } = await load();
    const element = { id: 'W2', anchor: { lineStart: 240, lineEnd: 251 } };
    const base = { listId: 'hits', byId: new Map([['W2', element]]), onJump: () => undefined, overview: null };
    const withCode = renderToStaticMarkup(React.createElement(FullScreenRail, {
      ...base,
      code: React.createElement('section', { 'data-process-code-card': 'W2' }),
      results: { query: 'order', hits: [], at: 0 },
    }));
    expect(withCode).toContain('data-process-code-card="W2"');
    expect(withCode).not.toContain('data-map-fullscreen-hits');

    const hits = renderToStaticMarkup(React.createElement(FullScreenRail, {
      ...base,
      code: null,
      results: { query: 'order', hits: [{ id: 'W2', outline: '4', plane: null, label: 'Create the purchase order', kind: 'Step', reason: 'name' }], at: 0 },
    }));
    expect(hits).toContain('1 step matches “order”');
    expect(hits).toContain('id="hits"');
    expect(hits).toContain('role="listbox"');
    expect(hits).toContain('Create the purchase order');
    expect(hits).toContain('L240–251');
    expect(hits).toContain('aria-selected="true"');

    const nothing = renderToStaticMarkup(React.createElement(FullScreenRail, { ...base, code: null, results: null }));
    expect(nothing).toContain('Nothing selected');
    expect(nothing).toContain('Click a step to see its code lines.');
    expect(nothing).not.toContain('data-map-fullscreen-overview-panel');
  });
});

/* ------------------------------------------------------------------ rendered (production build + emulators) */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function idTokenOf(email: string, password: string): Promise<string> {
  const res = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) },
  );
  return ((await res.json()) as { idToken: string }).idToken;
}

async function revisionOf(projectId: string, token: string, n: number): Promise<{ origin: string; xml: string } | null> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/process-revisions?revision=${n}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status !== 200) return null;
  return ((await res.json()) as { record: { origin: string; xml: string } }).record;
}

async function openAnalyze(page: Page, projectId: string) {
  await page.goto(`/project/${projectId}/analyze`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-analyze-business="ready"] [data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 120000 });
  const frame = page.locator('[data-analyze-map] [data-map-canvas-frame]').first();
  await expect.poll(async () => frame.locator('[data-map-node]').count(), { timeout: 90000 }).toBeGreaterThan(2);
  return frame;
}

test.describe('@rendered full screen on Analyze, Business', () => {
  test('state 14: a named dialog, focus in and back, find, zoom, fit, the overview, code on click, Escape, the same place', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const seeded = await seedLayoutProject('ab5-nav');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    const frame = await openAnalyze(page, seeded.po);
    const toggle = frame.locator('[data-map-fullscreen-toggle]');
    await toggle.click();

    const dialog = page.getByRole('dialog', { name: 'Process map, full screen' });
    await expect(dialog).toBeVisible();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    // A modal dialog: a screen reader stays inside.
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    // The focus went in: to the way out.
    await expect(dialog.locator('[data-map-fullscreen-toggle]')).toBeFocused();
    // Tab and Shift+Tab never leave it: walk further than it has stops, both ways, and the focus is inside every time.
    const stops = await dialog.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
        .filter((n) => n.tabIndex >= 0 && !(n as HTMLButtonElement).disabled && n.getClientRects().length > 0).length);
    expect(stops, 'the dialog has no Tab stop').toBeGreaterThan(1);
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < stops + 3; i += 1) {
        await page.keyboard.press(key);
        expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `${key} #${i + 1} left the dialog`).toBe(true);
      }
    }
    // "Edit" is off on open.
    await expect(dialog.getByRole('switch', { name: 'Edit' })).toHaveAttribute('aria-checked', 'false');
    await expect(dialog.locator('[data-map-fullscreen-nothing]')).toBeVisible();
    await expect(dialog.locator('[data-map-fullscreen-overview-panel] [data-process-minimap]')).toBeVisible();

    // Zoom and fit move the canvas.
    const zoom = dialog.locator('[data-map-zoom]');
    const before = await zoom.innerText();
    await dialog.locator('[data-map-zoom-in]').click();
    await expect.poll(() => zoom.innerText()).not.toBe(before);
    await dialog.locator('[data-map-fit]').click();

    // Find a step: hits by the name the map shows, in the side column; a hit opens its code there, full screen stays.
    await dialog.locator('[data-process-search="bar"] input').fill('order');
    const hits = dialog.locator('[data-map-fullscreen-hits]');
    await expect(hits).toBeVisible();
    await expect(hits).toContainText('“order”');
    const first = hits.locator('[data-map-fullscreen-hit]').first();
    const hitId = await first.getAttribute('data-map-fullscreen-hit');
    await first.locator('button').click();
    await expect(dialog.locator(`[data-process-code-card="${hitId}"]`)).toBeVisible();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');

    // A click on a step opens its code in the column. The hit opened its own level, so the step is one drawn there:
    // the other levels' node buttons stay in the DOM, hidden; a sub-process would open its level instead.
    const node = frame.locator('[data-map-node][data-selected="false"]:not([aria-label^="Sub-process"]):visible').first();
    const nodeId = await node.getAttribute('data-map-node');
    await node.click();
    await expect(dialog.locator(`[data-process-code-card="${nodeId}"]`)).toBeVisible();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');

    // The overview map folds away.
    await dialog.locator('[data-map-fullscreen-overview]').click();
    await expect(dialog.locator('[data-map-fullscreen-overview-panel]')).toHaveCount(0);

    // Escape from the bar leaves full screen; the level and the selection are the page's again.
    const plane = await frame.getAttribute('data-map-plane');
    await dialog.locator('[data-map-fullscreen-toggle]').focus();
    await page.keyboard.press('Escape');
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
    await expect(page.getByRole('dialog', { name: 'Process map, full screen' })).toHaveCount(0);
    await expect(toggle).toBeFocused();
    expect(await frame.getAttribute('data-map-plane')).toBe(plane);
    await expect(page.locator('[data-analyze-code-panel]')).toBeVisible();
  });

  test('state 15: "Edit" shows today\'s editor with the N8 sentence; a draft survives leaving; a save is revision 2 and revision 1 stays', async ({ page }) => {
    test.setTimeout(420 * 1000);
    const seeded = await seedLayoutProject('ab5-edit');
    const token = await idTokenOf(seeded.email, seeded.password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    const frame = await openAnalyze(page, seeded.po);
    await frame.locator('[data-map-fullscreen-toggle]').click();
    const dialog = page.getByRole('dialog', { name: 'Process map, full screen' });
    await dialog.getByRole('switch', { name: 'Edit' }).click();
    await expect(frame).toHaveAttribute('data-map-fullscreen-editing', 'true');
    const editor = dialog.locator('[data-process-editor][data-editor-embedded="true"]');
    await expect(editor).toBeVisible({ timeout: 60000 });
    await expect(editor.locator('[data-editor-started="1"]')).toHaveText(ANALYZE_FULLSCREEN_MESSAGES['fullScreen.editNote']);
    // The editor offers no full screen of its own: it is in one.
    await expect(editor.locator('[data-editor-fullscreen-toggle]')).toHaveCount(0);
    await expect(editor.locator('[data-editor-save]')).toHaveText('Save as revision');

    await expect.poll(async () => editor.locator('[data-process-editor-canvas] .djs-shape').count(), { timeout: 60000 }).toBeGreaterThan(2);
    await editor.locator('[data-draft-row]').first().click();
    await editor.locator('[data-palette-item="user-task"]').click();
    const drawn = editor.locator('[data-draft-row][data-drawn="true"]');
    await expect(drawn).toHaveCount(1);
    const drawnId = await drawn.getAttribute('data-draft-row');

    // Leave, come back, switch "Edit" on: the unsaved drawing is there.
    await dialog.locator('[data-map-fullscreen-toggle]').click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
    await frame.locator('[data-map-fullscreen-toggle]').click();
    await expect(page.getByRole('switch', { name: 'Edit' })).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('switch', { name: 'Edit' }).click();
    await expect(page.locator(`[data-draft-row="${drawnId}"]`)).toHaveCount(1, { timeout: 60000 });

    // Save as revision: revision 2, and revision 1 is the reconstruction it was.
    await page.locator('[data-editor-save]').click();
    await expect(page.locator('[data-editor-saved]')).toHaveText('Saved as revision 2.', { timeout: 60000 });
    const two = await revisionOf(seeded.po, token, 2);
    expect(two?.origin).toBe('edited');
    expect(two?.xml).toContain(drawnId!);
    const one = await revisionOf(seeded.po, token, 1);
    expect(one?.origin).toBe('reconstructed');
    expect(one?.xml).not.toContain(drawnId!);
  });

  test('state 16: "Walk me through it" runs the tour in the side column; the canvas follows the station; Escape order; leaving continues on the page', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const seeded = await seedLayoutProject('ab5-tour');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    const frame = await openAnalyze(page, seeded.po);
    await frame.locator('[data-map-fullscreen-toggle]').click();
    const dialog = page.getByRole('dialog', { name: 'Process map, full screen' });
    await dialog.locator('[data-map-fullscreen-walk]').click();

    // The card stands first in the side column; full screen stays, and no second map is drawn.
    const card = dialog.locator('[data-map-fullscreen-column] [data-process-tour][data-tour-mode="fullscreen"]');
    await expect(card).toBeVisible({ timeout: 60000 });
    await expect(card.locator('[data-tour-card="overview"]')).toBeVisible({ timeout: 60000 });
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await expect(page.locator('[data-tour-inline-map]')).toHaveCount(0);
    await expect(dialog.locator('[data-map-fullscreen-walk]')).toHaveCount(0);

    // Next, and the arrow key: station 2. The canvas follows it — the station's element is marked, in view and near
    // the middle of the canvas, and its node is drawn on the level on show.
    await card.locator('[data-tour-next]').click();
    await expect(card).toHaveAttribute('data-tour-at', '1');
    await page.keyboard.press('ArrowRight');
    await expect(card).toHaveAttribute('data-tour-at', '2');
    const station = await card.locator('[data-tour-card]').getAttribute('data-tour-card');
    expect(station).toBeTruthy();
    await expect(frame).toHaveAttribute('data-map-follow', station!);
    const marked = frame.locator(`[data-process-map-canvas] .djs-element.cc-tour-here[data-element-id="${station}"]`);
    await expect(marked).toHaveCount(1);
    // The mark is seen, not only set: the station takes the tour's fill, and the rest steps back to the line colour.
    const paint = await frame.locator('[data-process-map-canvas]').evaluate((host, id) => {
      const fill = (el: Element | null) => (el ? getComputedStyle(el).fill : '');
      const stroke = (el: Element | null) => (el ? getComputedStyle(el).stroke : '');
      const here = host.querySelector(`.djs-element[data-element-id="${id}"] .djs-visual > :first-child`);
      const other = host.querySelector('.djs-element.cc-dim .djs-visual > :first-child');
      const probe = document.createElement('span');
      probe.style.color = 'var(--cc-line)';
      host.appendChild(probe);
      const line = getComputedStyle(probe).color;
      probe.remove();
      return { here: fill(here), other: stroke(other), line };
    }, station);
    expect(paint.here, 'the station keeps the white of the renderer').not.toBe('rgb(255, 255, 255)');
    expect(paint.other, 'the rest does not step back').toBe(paint.line);
    await expect.poll(async () => {
      const box = await marked.boundingBox();
      const canvas = await frame.locator('[data-process-map-canvas]').boundingBox();
      if (!box || !canvas) return 'not drawn';
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const inX = Math.abs(cx - (canvas.x + canvas.width / 2)) <= canvas.width * 0.2;
      const inY = Math.abs(cy - (canvas.y + canvas.height / 2)) <= canvas.height * 0.2;
      return inX && inY ? 'centred' : `at ${Math.round(cx)},${Math.round(cy)} in ${JSON.stringify(canvas)}`;
    }, { timeout: 10000 }).toBe('centred');
    await expect(frame.locator(`[data-map-node="${station}"]`)).toBeVisible();
    if (process.env.FS_SHOTS) await page.screenshot({ path: `${process.env.FS_SHOTS}/fullscreen-tour-station2-1440.png` });

    // Escape: the innermost first — the walk-through ends, full screen stays and the focus is on its "Walk me through it".
    await page.keyboard.press('Escape');
    await expect(dialog.locator('[data-process-tour]')).toHaveCount(0);
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await expect(dialog.locator('[data-map-fullscreen-walk]')).toBeFocused();
    await expect(frame.locator('[data-process-map-canvas] .cc-tour-here')).toHaveCount(0);
    // The next Escape leaves full screen.
    await page.keyboard.press('Escape');
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');

    // Leaving full screen while the walk-through runs continues it on the page at the same station.
    await frame.locator('[data-map-fullscreen-toggle]').click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await page.locator('[data-map-fullscreen-walk]').click();
    const again = page.locator('[data-process-tour][data-tour-mode="fullscreen"]');
    await expect(again).toBeVisible({ timeout: 60000 });
    await again.locator('[data-tour-next]').click();
    await expect(again).toHaveAttribute('data-tour-at', '1');
    await page.locator('[data-map-fullscreen-toggle]').click();
    const inline = page.locator('[data-process-tour][data-tour-mode="inline"]');
    await expect(inline).toBeVisible({ timeout: 60000 });
    await expect(inline).toHaveAttribute('data-tour-at', '1');
    await expect(page.locator('[data-map-fullscreen="true"]')).toHaveCount(0);
  });

  test('P3: on a phone "Edit" is disabled with the sentence why; the map and the way out are there', async ({ page }) => {
    test.setTimeout(300 * 1000);
    const seeded = await seedLayoutProject('ab5-phone');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    await page.setViewportSize({ width: 390, height: 844 });
    const frame = await openAnalyze(page, seeded.po);
    await frame.locator('[data-map-fullscreen-toggle]').click();
    // On a phone the bar is one row; "Edit" stands in the sheet behind "Find, zoom and overview" (ADR-119 (f)).
    await page.locator('[data-map-fullscreen-tools]').click();
    const edit = page.getByRole('switch', { name: 'Edit' });
    await expect(edit).toBeDisabled();
    await expect(page.locator('[data-map-fullscreen-edit="blocked"]')).toContainText(ANALYZE_FULLSCREEN_MESSAGES['fullScreen.editPhone']);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.locator('[data-map-fullscreen-toggle]').click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
  });
});
