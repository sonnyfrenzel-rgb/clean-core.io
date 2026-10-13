import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * Roadmap 3.0.12 — every caller names the engine it rebuilds with.
 *
 * The engine's changes that alter what a run signs are gated on the engine
 * version (`GUIDELINE_CHECKS_FROM`, `ON_STACK_CONSTRUCTS_FROM`,
 * `GUI_FILE_NO_ROUTE_DRIVER_FROM`). `buildAbapEvidence` and the functions over
 * it take that version as an optional argument and read an omitted one as the
 * current engine — convenient for the specs, and exactly wrong for a screen
 * that rebuilds the evidence of a run signed by an older engine: that run would
 * suddenly show findings it never signed. Before this guard nine callers did.
 *
 * So outside `tests/` every call names it: `engineVersionOfProject(project)`
 * where an existing project is rebuilt, `APP_VERSION` where a new run (or the
 * demo, or the reference analysis) is made. `routeExtensibility`,
 * `routeDrivers` and `useProcessOverlays` need no line here — TypeScript
 * already requires their version.
 *
 * Server-free: reads source files only.
 */

const ROOT = path.join(__dirname, '..');
const DIRS = ['app', 'lib', 'hooks', 'components', 'scripts'];

/** Positional: the call must pass at least this many arguments (the version is the last). */
const POSITIONAL: Readonly<Record<string, number>> = {
  buildAbapEvidence: 5,
  findingsOf: 5,
  recommendArchitecture: 5,
};

/** Object argument: the first argument must be an object literal naming `engineVersion`. */
const NAMED = new Set(['architectureCanvasModel', 'buildArchitectureContract', 'engineDesignContext']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

interface Call {
  file: string;
  line: number;
  name: string;
  ok: boolean;
}

function callsIn(file: string): Call[] {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const calls: Call[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name && (Object.hasOwn(POSITIONAL, name) || NAMED.has(name))) {
        let ok: boolean;
        if (Object.hasOwn(POSITIONAL, name)) {
          ok = node.arguments.length >= POSITIONAL[name];
        } else {
          const first = node.arguments[0];
          ok =
            !!first &&
            ts.isObjectLiteralExpression(first) &&
            first.properties.some(
              (p) =>
                (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
                ts.isIdentifier(p.name) &&
                p.name.text === 'engineVersion',
            );
        }
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        calls.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), line, name, ok });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return calls;
}

test.describe('Engine version — every caller names it (3.0.12)', () => {
  const calls = DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d))).flatMap(callsIn);

  test('the guard sees the callers it is about', () => {
    // A guard that finds nothing proves nothing: a rename would empty it.
    const names = new Set(calls.map((c) => c.name));
    for (const name of ['buildAbapEvidence', 'findingsOf', 'buildArchitectureContract', 'architectureCanvasModel', 'engineDesignContext']) {
      expect(names.has(name), `no call of ${name} found outside tests/`).toBe(true);
    }
    expect(calls.filter((c) => c.name === 'buildAbapEvidence').length).toBeGreaterThanOrEqual(10);
  });

  test('no call outside tests/ leaves the engine version to the default', () => {
    const silent = calls.filter((c) => !c.ok).map((c) => `${c.file}:${c.line} ${c.name}`);
    expect(silent, 'pass engineVersionOfProject(project) for an existing project, APP_VERSION for a new run').toEqual([]);
  });
});
