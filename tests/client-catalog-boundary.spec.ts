import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * The generated SAP catalog never travels with a page's own code (external
 * audit PERF-01, 02.10.2026).
 *
 * `lib/abap/generated/*.json` is ~4.5 MB of Cloudification Repository data. It
 * is server-only by convention (`CLAUDE.md`, `lib/facts.ts`), and the
 * convention had been broken without anyone deciding to: a client component
 * imported a helper, the helper imported the engine, the engine imported the
 * catalog service, and the catalog service imported the JSON. The production
 * build then carried one 3.4 MB chunk (239 kB gzip) into the dashboard, the
 * project workspace, the demo workspace, two stage pages and the public
 * `/catalog` index. Every hop looked harmless on its own; nothing compared the
 * chain end to end. This spec does.
 *
 * **What it reads.** Every module under `app/`, `components/`, `hooks/` and
 * `lib/`. A module whose first statement is `'use client'` is where Next.js
 * starts a browser bundle, and everything it imports statically is in that
 * bundle. The walk follows those static edges — `import … from`, `export … from`
 * — and fails if one reaches a generated catalog file. `import type`, and an
 * import whose every name is `type`, is erased by the compiler and is not an
 * edge. An import that brings in a value used only as a type is still counted:
 * the check errs on the side of reporting.
 *
 * **The one way through.** A dynamic `import()` gives the imported module a
 * chunk of its own, fetched when the code runs rather than with the page. The
 * engine genuinely runs in the browser in a few places, and those load it that
 * way. Each such import that reaches the catalog is named below, with why. A new
 * one fails until it is added here on purpose, and an entry that no longer
 * reaches the catalog fails too, so the list cannot rot into a blanket waiver.
 */

const ROOT = path.join(__dirname, '..');
const DIRS = ['app', 'components', 'hooks', 'lib'];
const CATALOG = /^lib\/abap\/generated\/[^/]+\.json$/;

/** `importer ~> imported` — each a deliberate, on-demand load of the engine. */
const DYNAMIC_ALLOWED: Record<string, string> = {
  // (The Analyze report, the Transformation facets and the Public-Cloud-Fit
  // card used to load the engine here too; since 02.10.2026 they read the
  // project's evidence from `GET /api/projects/{id}/evidence`, computed with
  // the catalog snapshot the signed run reads.)
  // The workspace list starts a run from a row; the run module is fetched on Run.
  'components/workspace/WorkspaceListReport.tsx ~> lib/analysis-run.ts': 'loads the run when Run is pressed',
  // The Confluence export recomputes the evidence; fetched on the export click.
  'app/(app)/project/[projectId]/analyze/page.tsx ~> lib/analysis-export.ts': 'loads the export on its click',
  // Process-map overlays, built after the map is drawn.
  'hooks/useProcessOverlays.ts ~> lib/abap/evidence-model.ts': 'loads the engine for the overlays',
  // The test stage's evidence-backed cases, built on demand.
  'app/(app)/project/[projectId]/testing/page.tsx ~> lib/abap/evidence-model.ts': 'loads the engine for the test cases',
};

interface Graph {
  files: string[];
  client: Set<string>;
  edges: Map<string, string[]>;
  dynamic: Map<string, string[]>;
}

function buildGraph(): Graph {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(rel);
    }
  };
  DIRS.forEach(walk);

  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    else return null; // a package: not this repo's catalog
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`]) {
      const abs = path.join(ROOT, candidate);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return candidate;
    }
    return null;
  };

  const client = new Set<string>();
  const edges = new Map<string, string[]>();
  const dynamic = new Map<string, string[]>();
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const kind = rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
    const first = sf.statements[0];
    if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'use client') {
      client.add(rel);
    }
    const statics: string[] = [];
    for (const s of sf.statements) {
      if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
        const clause = s.importClause;
        if (clause?.isTypeOnly) continue;
        const named = clause?.namedBindings;
        const allTypes =
          clause && !clause.name && named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly);
        if (allTypes) continue;
        statics.push(s.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(s) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier) && !s.isTypeOnly) {
        statics.push(s.moduleSpecifier.text);
      }
    }
    const dyn: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        dyn.push(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    edges.set(rel, statics.map((s) => resolve(rel, s)).filter((r): r is string => r !== null));
    dynamic.set(rel, dyn.map((s) => resolve(rel, s)).filter((r): r is string => r !== null));
  }
  return { files, client, edges, dynamic };
}

/** The shortest static chain from `start` to a catalog file, or null. */
function chainToCatalog(graph: Graph, start: string): string[] | null {
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    if (CATALOG.test(current)) {
      const chain: string[] = [];
      for (let at: string | null | undefined = current; at; at = prev.get(at)) chain.unshift(at);
      return chain;
    }
    for (const next of graph.edges.get(current) ?? []) {
      if (!prev.has(next)) {
        prev.set(next, current);
        queue.push(next);
      }
    }
  }
  return null;
}

const graph = buildGraph();

test.describe('the generated SAP catalog stays out of the browser bundles (PERF-01)', () => {
  test('the walk sees what it is meant to see', () => {
    // Not vacuous: the server side still reaches the catalog through the
    // chain the audit found, and the client roots are found.
    expect(chainToCatalog(graph, 'lib/abap/catalog-index.ts')).not.toBeNull();
    expect(chainToCatalog(graph, 'lib/abap/evidence-model.ts')).not.toBeNull();
    expect(graph.client.has('components/catalog/CatalogSearch.tsx')).toBe(true);
    expect(graph.client.size).toBeGreaterThan(100);
  });

  test('no client module reaches lib/abap/generated/*.json through a static import', () => {
    const offenders = [...graph.client]
      .sort()
      .map((rel) => chainToCatalog(graph, rel))
      .filter((chain): chain is string[] => chain !== null)
      .map((chain) => chain.join(' -> '));
    expect(offenders, 'a client bundle carries the SAP catalog').toEqual([]);
  });

  test('every dynamic import that reaches the catalog is a named, deliberate one', () => {
    // Only code that runs in the browser: everything a client root reaches statically.
    const inBrowser = new Set<string>();
    const queue = [...graph.client];
    while (queue.length) {
      const at = queue.shift()!;
      if (inBrowser.has(at)) continue;
      inBrowser.add(at);
      queue.push(...(graph.edges.get(at) ?? []));
    }
    const found: string[] = [];
    for (const from of inBrowser) {
      for (const to of graph.dynamic.get(from) ?? []) if (chainToCatalog(graph, to)) found.push(`${from} ~> ${to}`);
    }
    expect([...new Set(found)].sort()).toEqual(Object.keys(DYNAMIC_ALLOWED).sort());
  });

  test('the catalog search links its results without the catalog', () => {
    const src = fs.readFileSync(path.join(ROOT, 'components/catalog/CatalogSearch.tsx'), 'utf8');
    expect(src).toContain("from '@/lib/abap/catalog-slug'");
    expect(src).not.toMatch(/from ['"][^'"]*(catalog-index|catalog-service)['"]/);
  });
});
