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

/**
 * Where a version may come from (QA review of 03501b79fb3d, 71ca66bf424c: the
 * guard counted arguments, so `APP_VERSION` passed into the rebuild of an
 * existing project read as fine).
 *
 * - a rebuild: `engineVersionOfProject(…)` or `signedEngineVersionOf(…)`, or a
 *   local constant initialised from one of them;
 * - forwarded: a parameter of the enclosing function (or a property of one) —
 *   that function's own callers are what this guard, or TypeScript, checks;
 * - a new run: `APP_VERSION`, and only in the places that make a new run, the
 *   demo or the reference analysis (`NEW_RUN`, by file and enclosing function).
 *
 * Anything else — a string literal, an unrelated variable — fails.
 */
const REBUILD_SOURCES = new Set(['engineVersionOfProject', 'signedEngineVersionOf']);

/** `file#function` (the nearest named enclosing function, or `<module>`) where `APP_VERSION` is the right answer. */
const NEW_RUN = new Set([
  'app/api/runs/create/route.ts#POST', // the run being signed
  'lib/analysis-run.ts#runAnalysis', // a new analysis
  'lib/project-evidence-build.ts#buildRunEvidence', // the evidence of a run about to be made
  'lib/reference-analysis.ts#getReferenceAnalysis', // the public reference analysis, made by this engine
  'lib/demo-design.ts#buildDemoDesign', // the demo project, made by this engine
  'lib/demo-list-row.ts#computeDemoListRow',
  'lib/demo-project.ts#buildDemoProject',
  'lib/demo-workspace.ts#buildDemoWorkspace',
  'components/demo/DemoDesign.tsx#DemoDesign',
  'scripts/diagnose-design-pipeline.ts#main', // a diagnostic over this engine
]);

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
  /** Where the version comes from: `rebuild`, `forwarded`, `new-run`, or what was found instead. */
  source: string;
  /** `file#function` of the call. */
  place: string;
}

function functionName(fn: ts.Node): string | null {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) return fn.parent.name.text;
  return null;
}

function enclosingFunctions(node: ts.Node): ts.SignatureDeclaration[] {
  const out: ts.SignatureDeclaration[] = [];
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) out.push(n);
  }
  return out;
}

function isParameterOfEnclosing(name: string, node: ts.Node): boolean {
  const names = (b: ts.BindingName): string[] =>
    ts.isIdentifier(b) ? [b.text] : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : names(e.name)));
  return enclosingFunctions(node).some((fn) => fn.parameters.some((p) => names(p.name).includes(name)));
}

function isRebuildCall(expr: ts.Expression | undefined): boolean {
  return !!expr && ts.isCallExpression(expr) && REBUILD_SOURCES.has(calleeName(expr.expression) ?? '');
}

function constInitialiser(name: string, sf: ts.SourceFile): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  const visit = (n: ts.Node) => {
    if (!found && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) found = n.initializer;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function versionSource(expr: ts.Expression | undefined, call: ts.Node, sf: ts.SourceFile, place: string): { ok: boolean; source: string } {
  if (!expr) return { ok: false, source: 'missing' };
  if (isRebuildCall(expr)) return { ok: true, source: 'rebuild' };
  if (ts.isIdentifier(expr) && expr.text === 'APP_VERSION') {
    return NEW_RUN.has(place) ? { ok: true, source: 'new-run' } : { ok: false, source: `APP_VERSION outside a new run (${place})` };
  }
  const root = ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) ? expr.expression.text : ts.isIdentifier(expr) ? expr.text : null;
  if (root && isParameterOfEnclosing(root, call)) return { ok: true, source: 'forwarded' };
  if (ts.isIdentifier(expr) && isRebuildCall(constInitialiser(expr.text, sf))) return { ok: true, source: 'rebuild' };
  return { ok: false, source: expr.getText(sf) };
}

function callsInText(rel: string, text: string): Call[] {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const calls: Call[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name && (Object.hasOwn(POSITIONAL, name) || NAMED.has(name))) {
        const fn = enclosingFunctions(node).map(functionName).find((n): n is string => !!n) ?? '<module>';
        const place = `${rel}#${fn}`;
        let version: ts.Expression | undefined;
        if (Object.hasOwn(POSITIONAL, name)) {
          version = node.arguments.length >= POSITIONAL[name] ? node.arguments[POSITIONAL[name] - 1] : undefined;
        } else {
          const first = node.arguments[0];
          const prop = first && ts.isObjectLiteralExpression(first)
            ? first.properties.find(
                (p): p is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
                  (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name) && p.name.text === 'engineVersion',
              )
            : undefined;
          version = !prop ? undefined : ts.isPropertyAssignment(prop) ? prop.initializer : (prop.name as ts.Identifier);
        }
        const { ok, source } = versionSource(version, node, sf, place);
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        calls.push({ file: rel, line, name, ok, source, place });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return calls;
}

function callsIn(file: string): Call[] {
  return callsInText(path.relative(ROOT, file).replace(/\\/g, '/'), fs.readFileSync(file, 'utf8'));
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

  test('no call outside tests/ leaves the engine version to the default, or takes it from the wrong place', () => {
    const silent = calls.filter((c) => !c.ok).map((c) => `${c.file}:${c.line} ${c.name} <- ${c.source}`);
    expect(silent, 'pass engineVersionOfProject(project) for an existing project, APP_VERSION for a new run').toEqual([]);
  });

  test('every new-run place still makes a call — the list can only shrink', () => {
    const places = new Set(calls.filter((c) => c.source === 'new-run').map((c) => c.place));
    const stale = [...NEW_RUN].filter((p) => !places.has(p));
    expect(stale).toEqual([]);
  });

  test('the guard reads the version: the current engine in a rebuild fails, the run\'s engine passes', () => {
    const verdict = (body: string) => callsInText('lib/some-rebuild.ts', body).map((c) => [c.ok, c.source]);
    expect(verdict('export function f(project: P) { return buildAbapEvidence(s, f, d, k, APP_VERSION); }'))
      .toEqual([[false, 'APP_VERSION outside a new run (lib/some-rebuild.ts#f)']]);
    expect(verdict("export function f(project: P) { return findingsOf(s, f, d, k, 'v3.0.11'); }")).toEqual([[false, "'v3.0.11'"]]);
    expect(verdict('export function f(project: P) { return buildAbapEvidence(s, f, d, k); }')).toEqual([[false, 'missing']]);
    expect(verdict('const v = APP_VERSION; export function f(project: P) { return buildAbapEvidence(s, f, d, k, v); }')).toEqual([[false, 'v']]);
    expect(verdict('export function f(project: P) { return buildAbapEvidence(s, f, d, k, engineVersionOfProject(project)); }')).toEqual([[true, 'rebuild']]);
    expect(verdict('export function f(project: P) { const e = signedEngineVersionOf(project); return buildAbapEvidence(s, f, d, k, e); }')).toEqual([[true, 'rebuild']]);
    expect(verdict('export function f(engineVersion: string) { return buildAbapEvidence(s, f, d, k, engineVersion); }')).toEqual([[true, 'forwarded']]);
    expect(verdict('export function f(project: P) { return architectureCanvasModel({ contract, engineVersion: APP_VERSION }); }'))
      .toEqual([[false, 'APP_VERSION outside a new run (lib/some-rebuild.ts#f)']]);
  });
});
