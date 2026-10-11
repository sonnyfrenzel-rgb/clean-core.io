import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { findingsOf } from '../lib/it-findings-build';
import '../lib/abap/catalog-snapshots';
import { extractCodeInventory, extractDataCoupling } from '../lib/abap/code-assessment';
import { itObjects, type ItObjectRow, type ItObjects } from '../lib/it-objects';
import {
  DEP_GRAPH_CAPS,
  PROGRAM_KEY,
  dependencyGraph,
  layoutDependencyGraph,
  levelRank,
  type Box,
} from '../lib/it-dependency-graph';
import { itvGraphEdgeLabel, itvGraphMore, itvGraphShown } from '../lib/messages/workspace-it';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The IT view's dependency graph (roadmap after 3.0.7, item 3) — the rows of
 * *Objects & dependencies* (ADR-086) as a picture. Held here, without a
 * browser: every node and edge is read from the table's own rows, with the
 * table's lines and levels and the table's *Used by*; a large inventory is
 * capped worst level first and says how much it left out; the layout has no
 * two boxes on top of each other; and the component reaches no second source.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
/** The code without its comments — a comment may name what the code must not reach. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function objectsOf(file: string): ItObjects {
  const src = read(`public/starter-examples/${file}`);
  const built = findingsOf(src, file, 'private', 'pce-latest');
  return itObjects({
    inventory: extractCodeInventory(src),
    coupling: extractDataCoupling(src),
    uses: built.uses,
    findings: built.rows,
    code: src,
  });
}

const dep = (over: Partial<ItObjectRow> & Pick<ItObjectRow, 'object' | 'use' | 'lines'>): ItObjectRow => ({
  key: `use-${over.object}@${over.use}`,
  kind: 'table',
  side: 'dependency',
  owner: 'sap',
  usedBy: [],
  usedOutside: false,
  range: null,
  level: null,
  levelBasis: null,
  successor: null,
  remote: false,
  batchInput: null,
  findingIds: [],
  ...over,
});

const own = (object: string, start: number | null, end: number | null, kind = 'Form Routine'): ItObjectRow => ({
  key: `own-${object}`,
  object,
  kind,
  side: 'own-object',
  owner: 'own',
  usedBy: [],
  usedOutside: false,
  use: 'defined',
  lines: start === null ? [] : [start],
  range: start === null ? null : { start, end },
  level: null,
  levelBasis: null,
  successor: null,
  remote: false,
  batchInput: null,
  findingIds: [],
});

const table = (rows: ItObjectRow[]): ItObjects => ({ rows, own: 0, tables: 0, calls: 0, recorded: true });

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test.describe('the graph is the table, drawn', () => {
  test('Z_MM_PO_APPROVAL: every edge is a row of the table, from the own object the table names under Used by', () => {
    const objects = objectsOf('Z_MM_PO_APPROVAL.abap');
    const graph = dependencyGraph(objects, { objects: 1000, sources: 1000, edges: 1000 });
    const rows = new Map(objects.rows.map((r) => [r.key, r]));
    const deps = objects.rows.filter((r) => r.side === 'dependency');

    expect(graph.empty).toBe(false);
    // Uncapped, nothing is left out and every row is drawn.
    expect(graph.hidden).toEqual({ objects: 0, sources: 0, edges: 0, rows: 0 });
    expect(graph.total.rows).toBe(deps.length);
    expect(new Set(graph.edges.map((e) => e.rowKey))).toEqual(new Set(deps.map((r) => r.key)));
    expect(graph.objects.map((o) => o.name).sort()).toEqual([...new Set(deps.map((r) => r.object))].sort());

    for (const edge of graph.edges) {
      const row = rows.get(edge.rowKey)!;
      expect(row.side).toBe('dependency');
      // The same use, level and lines — the lines of this edge are a part of the row's.
      expect(edge.use).toBe(row.use);
      expect(edge.level).toBe(row.level);
      for (const line of edge.lines) expect(row.lines).toContain(line);
      // The source is the table's Used by, or the program for the outside lines.
      const source = graph.sources.find((s) => s.key === edge.from)!;
      if (source.role === 'own') expect(row.usedBy).toContain(source.name);
      else expect(row.usedOutside || row.lines.length === 0).toBe(true);
    }
    // Every row's lines are drawn exactly once, split over its sources.
    for (const row of deps) {
      const drawn = graph.edges.filter((e) => e.rowKey === row.key).flatMap((e) => e.lines).sort((a, b) => a - b);
      expect(drawn, row.key).toEqual(row.lines);
      const from = graph.edges.filter((e) => e.rowKey === row.key && e.from !== PROGRAM_KEY).map((e) => graph.sources.find((s) => s.key === e.from)!.name);
      expect(from.sort(), row.key).toEqual([...row.usedBy].sort());
    }
    // EBAN is read and written: one node, two uses, worst level on the node.
    const eban = graph.objects.find((o) => o.name === 'EBAN')!;
    expect(eban.rowKeys).toEqual(['use-EBAN@write', 'use-EBAN@read']);
    expect(eban.level).toBe('D');
    // The program is the inventory's report, and its node goes to the report's row.
    expect(graph.sources[0]).toMatchObject({ key: PROGRAM_KEY, name: 'Z_MM_PO_APPROVAL', role: 'program' });
    expect(rows.get(graph.sources[0].rowKey!)?.kind).toBe('Report');
    // Own objects go to their own rows.
    for (const s of graph.sources.slice(1)) expect(rows.get(s.rowKey!)?.object).toBe(s.name);
  });

  test('capped: worst level first, at most the caps, and the count of what is left out', () => {
    const objects = objectsOf('Z_MM_PO_APPROVAL.abap');
    const whole = dependencyGraph(objects, { objects: 1000, sources: 1000, edges: 1000 });
    const graph = dependencyGraph(objects);

    expect(graph.objects.length).toBeLessThanOrEqual(DEP_GRAPH_CAPS.objects);
    expect(graph.sources.length - 1).toBeLessThanOrEqual(DEP_GRAPH_CAPS.sources);
    expect(graph.edges.length).toBeLessThanOrEqual(DEP_GRAPH_CAPS.edges);
    expect(graph.total).toEqual(whole.total);
    const keptKeys = new Set(graph.edges.map((e) => e.key));
    expect(graph.hidden.objects).toBe(graph.total.objects - graph.objects.length);
    expect(graph.hidden.edges).toBe(graph.total.edges - graph.edges.length);
    // A use (a row) counts as drawn only when all of its edges are.
    const drawnRows = objects.rows
      .filter((r) => r.side === 'dependency')
      .filter((r) => whole.edges.filter((e) => e.rowKey === r.key).every((e) => keptKeys.has(e.key))).length;
    expect(graph.hidden.rows).toBe(graph.total.rows - drawnRows);
    expect(graph.hidden.objects).toBeGreaterThan(0);

    // The one D is in; no edge left out is worse than the worst edge kept.
    expect(graph.edges.some((e) => e.rowKey === 'use-EBAN@write')).toBe(true);
    const worstLeftOut = Math.min(...whole.edges.filter((e) => !keptKeys.has(e.key)).map((e) => levelRank(e.level)));
    const best = Math.min(...graph.edges.map((e) => levelRank(e.level)));
    expect(best).toBeLessThanOrEqual(worstLeftOut);

    // Every edge's ends are drawn.
    const nodes = new Set([...graph.sources.map((s) => s.key), ...graph.objects.map((o) => o.key)]);
    for (const e of graph.edges) {
      expect(nodes.has(e.from)).toBe(true);
      expect(nodes.has(e.to)).toBe(true);
    }
    // Objects stand beside the own objects that use them: the mean source place never falls down the column.
    const srcAt = new Map(graph.sources.map((x, i) => [x.key, i]));
    const mean = (key: string) => {
      const at = graph.edges.filter((e) => e.to === key).map((e) => srcAt.get(e.from)!);
      return at.reduce((x, y) => x + y, 0) / at.length;
    };
    const means = graph.objects.map((o) => mean(o.key));
    expect(means).toEqual([...means].sort((x, y) => x - y));
    // The labels run in the order of their source, then of their object.
    const objAt = new Map(graph.objects.map((o, i) => [o.key, i]));
    const order = graph.edges.map((e) => srcAt.get(e.from)! * 1000 + objAt.get(e.to)!);
    expect(order).toEqual([...order].sort((x, y) => x - y));

    expect(itvGraphShown(graph.objects.length, graph.total.objects, graph.total.rows - graph.hidden.rows, graph.total.rows)).toContain(
      'worst level first',
    );
    expect(itvGraphMore(graph.hidden.objects, graph.hidden.rows)).toMatch(/^and \d+ more objects? — see the table$/);
  });

  test('a small inventory is drawn whole and says no "more"', () => {
    const objects = objectsOf('Z_SALES_ORDER_CREATOR.txt');
    const graph = dependencyGraph(objects);
    expect(graph.hidden).toEqual({ objects: 0, sources: 0, edges: 0, rows: 0 });
    expect(graph.objects.map((o) => o.name)).toEqual(
      expect.arrayContaining(['BAPI_SALESORDER_CREATEFROMDAT2', 'BAPI_TRANSACTION_COMMIT', 'BAPI_TRANSACTION_ROLLBACK']),
    );
    expect(graph.edges.every((e) => e.use === 'call')).toBe(true);
    expect(itvGraphShown(graph.objects.length, graph.total.objects, graph.total.rows, graph.total.rows)).toBe('3 objects · 3 uses');
  });

  test('without routines every use hangs off the program; a use without lines too, and says so', () => {
    const graph = dependencyGraph(
      table([
        dep({ object: 'VBAK', use: 'read', lines: [12, 40], level: 'C' }),
        dep({ object: 'VBAK', use: 'write', lines: [50], level: 'D' }),
        dep({ object: 'KNA1', use: 'read', lines: [] }),
      ]),
    );
    expect(graph.sources).toHaveLength(1);
    expect(graph.sources[0]).toMatchObject({ key: PROGRAM_KEY, name: null, rowKey: null });
    expect(graph.edges.every((e) => e.from === PROGRAM_KEY)).toBe(true);
    expect(graph.edges.find((e) => e.rowKey === 'use-KNA1@read')?.lines).toEqual([]);
    const vbak = graph.objects.find((o) => o.name === 'VBAK')!;
    expect(vbak.level).toBe('D');
    expect(graph.objects.find((o) => o.name === 'KNA1')?.level).toBeNull();
    expect(itvGraphEdgeLabel('read', [])).toBe('read · lines not recorded');
  });

  test('the innermost own object holds the line, as the table’s Used by does', () => {
    const graph = dependencyGraph(
      table([
        dep({ object: 'EKKO', use: 'read', lines: [15, 25, 90] }),
        own('LCL_OUTER', 10, 60, 'Class'),
        own('INNER', 20, 30),
      ]),
    );
    const from = (line: number) => graph.edges.find((e) => e.lines.includes(line))!.from;
    expect(from(15)).toBe('own:LCL_OUTER');
    expect(from(25)).toBe('own:INNER');
    expect(from(90)).toBe(PROGRAM_KEY);
    // The routines stand under the program in the order of their lines.
    expect(graph.sources.map((s) => s.key)).toEqual([PROGRAM_KEY, 'own:LCL_OUTER', 'own:INNER']);
  });

  test('an empty table draws nothing', () => {
    expect(dependencyGraph(table([own('ONLY', 1, 5)])).empty).toBe(true);
    expect(dependencyGraph(table([])).empty).toBe(true);
  });

  test('edge labels: the table’s use word and at most two lines', () => {
    expect(itvGraphEdgeLabel('read', [61, 98])).toBe('read · L61, L98');
    expect(itvGraphEdgeLabel('written', [246, 455, 600])).toBe('written · L246 +2');
  });
});

test.describe('the layout', () => {
  for (const file of ['Z_MM_PO_APPROVAL.abap', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 'Z_SALES_ORDER_CREATOR.txt']) {
    test(`${file}: no two boxes overlap, every box is inside the picture, every edge has two curves`, () => {
      const graph = dependencyGraph(objectsOf(file));
      const layout = layoutDependencyGraph(graph);
      const boxes = [...layout.sources.values(), ...layout.labels.values(), ...layout.objects.values()];
      expect(boxes.length).toBe(graph.sources.length + graph.edges.length + graph.objects.length);
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(layout.width);
        expect(b.y + b.h).toBeLessThanOrEqual(layout.height);
        for (let j = i + 1; j < boxes.length; j++) expect(overlaps(b, boxes[j]), `${i}/${j}`).toBe(false);
      }
      for (const e of graph.edges) expect(layout.paths.get(e.key)).toHaveLength(2);
      // Capped, the picture stays an overview: about the height of 16 labels.
      expect(layout.height).toBeLessThanOrEqual(16 * (28 + 24) + 8);
    });
  }
});

test.describe('source guards', () => {
  test('the model reads the table’s rows and nothing else — no engine, no catalog, no store', () => {
    const model = code('lib/it-dependency-graph.ts');
    const imports = model.split(/\r?\n/).filter((l) => /^import\b/.test(l.trim()));
    expect(imports.every((l) => /^import type\b/.test(l.trim())), imports.join('\n')).toBe(true);
    for (const forbidden of ['catalog-service', 'evidence-model', 'it-findings-build', 'firebase', 'fetch(', '/api/']) {
      expect(model).not.toContain(forbidden);
    }
    const view = code('components/workspace/ItDependencyGraph.tsx');
    for (const forbidden of ['catalog-service', 'evidence-model', 'it-findings-build', 'getDb', 'fetch(', 'localStorage']) {
      expect(view).not.toContain(forbidden);
    }
  });

  test('the IT view draws the graph from the same objects as the table, above it, and the table can be sent to a row', () => {
    const answers = read('components/workspace/ItAnswers.tsx');
    const card = answers.slice(answers.indexOf('function ObjectsCard('));
    expect(card).toContain('<ItDependencyGraph objects={objects} onOpen={open} />');
    expect(card.indexOf('<ItDependencyGraph')).toBeLessThan(card.indexOf('<CcTable'));
    expect(card).toContain('reveal={jump}');
    expect(card).toContain('rows={objects.rows.map(');
    // The graph's words for a use and a kind are the table's.
    expect(answers).toContain('objectUseWord(r.use, r.batchInput)');
    expect(read('lib/messages/workspace-it.ts')).toContain("'itv.graphToTable'");
  });

  test('level colours are the identifier and the state table, never a colour of its own', () => {
    const view = read('components/workspace/ItDependencyGraph.tsx');
    expect(view).toContain('<CcCleanCoreLevel value={o.level} />');
    expect(view).toContain('STATE_CLASSES[cleanCoreLevel(o.level).state]');
    expect(view).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(|hsl\(/);
    expect(view).not.toMatch(/\b(?:bg|text|border|fill|stroke)-(?:red|green|blue|amber|gray|slate|yellow|orange)-\d/);
    // Every node and label is a button with a name; the curves are hidden from assistive technology.
    expect(view).toMatch(/<svg\s+aria-hidden="true"/);
    expect(view.match(/type="button"/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

/* ------------------------------------------------- the rendered graph */

/**
 * QA review of fa1df10cb361 (da990041f4ae): the tests above hold the model and
 * the layout; this one holds the promise a reader meets — a node or an edge
 * label activated from the keyboard reveals its row of the table (past the
 * table's first five, where it is not displayed until asked for) and moves the
 * focus there, and the capped picture's "and N more — see the table" reaches
 * the table itself. Needs the server and the emulators, like every signed-in spec.
 */
test.describe('the graph on the screen sends the reader to the table row', () => {
  test.describe.configure({ mode: 'serial' });
  const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const EMAIL = `it-graph-${STAMP}@cleancore-test.io`;
  const PASSWORD = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
  const PROJECT_ID = `it-graph-${STAMP}`;

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Graph', lastName: 'Reader', email: EMAIL, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    // Z_MM_PO_APPROVAL: more objects than the graph draws, so it is capped
    // (held server-free above) and more rows than the table shows at first.
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Dependency graph fixture', userId: cred.user.uid, createdAt: new Date(), status: 'created',
      legacyCode: read('public/starter-examples/Z_MM_PO_APPROVAL.abap'),
    });
  });

  test('Enter on a node and on an edge label reveals the row and focuses it; the capped link reaches the table', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PROJECT_ID}?view=it`, { waitUntil: 'domcontentloaded' });

    const graph = page.locator('[data-it-graph]');
    await expect(graph, 'the dependency graph never rendered').toBeVisible({ timeout: 60000 });
    await expect(graph).toHaveAttribute('data-it-graph-capped', 'yes');
    const table = page.locator('[data-it-objects-table]');
    await expect(table.locator('[data-cc-table-limit="5"]')).toHaveCount(1);
    const rowOf = (key: string) => table.locator(`[data-cc-table-row="${key}"]`);

    /** The first control of `selector` whose row the table does not display yet. */
    const pickHidden = async (selector: string) => {
      const keys = await graph.locator(selector).evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-it-graph-row') ?? '').filter(Boolean),
      );
      for (const key of keys) {
        if ((await rowOf(key).count()) === 1 && !(await rowOf(key).isVisible())) return key;
      }
      return null;
    };

    // An edge label first, while the table still shows only its first five rows.
    const edgeRow = await pickHidden('[data-it-graph-edge]');
    expect(edgeRow, 'no edge label points past the first five rows of the table').not.toBeNull();
    await expect(rowOf(edgeRow!)).toBeHidden();
    const edge = graph.locator(`[data-it-graph-edge][data-it-graph-row="${edgeRow}"]`).first();
    await edge.focus();
    await expect(edge).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(rowOf(edgeRow!)).toBeVisible();
    await expect(rowOf(edgeRow!)).toHaveAttribute('data-cc-table-row', edgeRow!);
    await expect(rowOf(edgeRow!).locator('[data-it-object-focus]')).toBeFocused();
    await expect(rowOf(edgeRow!)).toBeInViewport();

    // Then a node: the table is open now, so the row is displayed — the focus still has to move to it.
    const nodeRow = await graph.locator('[data-it-graph-node="object"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-it-graph-row') ?? '').find((k) => k !== '') ?? null,
    );
    expect(nodeRow, 'no object node names a row').not.toBeNull();
    const node = graph.locator(`[data-it-graph-node="object"][data-it-graph-row="${nodeRow}"]`).first();
    await node.focus();
    await page.keyboard.press('Enter');
    await expect(rowOf(nodeRow!)).toBeVisible();
    await expect(rowOf(nodeRow!).locator('[data-it-object-focus]')).toBeFocused();
    await expect(rowOf(nodeRow!)).toBeInViewport();

    // The capped picture says how much it left out, and the link reaches the table.
    const more = graph.locator('[data-it-graph-more] button');
    await expect(more).toHaveText(/^and \d+ more (?:objects?|uses?) — see the table$/);
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(table).toBeFocused();
    await expect(table).toBeInViewport();
  });

  test('on a fresh page, Enter on a node whose row is past the first five reveals that row too', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PROJECT_ID}?view=it`, { waitUntil: 'domcontentloaded' });
    const graph = page.locator('[data-it-graph]');
    await expect(graph).toBeVisible({ timeout: 60000 });
    const table = page.locator('[data-it-objects-table]');
    const rowOf = (key: string) => table.locator(`[data-cc-table-row="${key}"]`);
    const keys = await graph.locator('[data-it-graph-node]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-it-graph-row') ?? '').filter(Boolean),
    );
    let hidden: string | null = null;
    for (const key of keys) {
      if ((await rowOf(key).count()) === 1 && !(await rowOf(key).isVisible())) { hidden = key; break; }
    }
    expect(hidden, 'no graph node points past the first five rows of the table').not.toBeNull();
    const node = graph.locator(`[data-it-graph-node][data-it-graph-row="${hidden}"]`).first();
    await node.focus();
    await page.keyboard.press('Enter');
    await expect(rowOf(hidden!)).toBeVisible();
    await expect(rowOf(hidden!).locator('[data-it-object-focus]')).toBeFocused();
  });
});
