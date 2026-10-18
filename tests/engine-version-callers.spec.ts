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
  // 3.0.18: the contextual successor it names is gated (QA review of 73b8cad63d3e, 966feb41218f).
  extractDataCoupling: 2,
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
 * - forwarded: a parameter of the enclosing function named `engineVersion` (or
 *   a property `engineVersion` of a parameter) — that function's own callers
 *   are what this guard, or TypeScript, checks;
 * - a new run: `APP_VERSION`, and only in the places that make a new run, the
 *   demo or the reference analysis (`NEW_RUN`, by file and enclosing function).
 *
 * Anything else — a string literal, an unrelated variable — fails.
 */
const REBUILD_SOURCES = new Set(['engineVersionOfProject', 'signedEngineVersionOf']);

/** The only name a forwarded version may carry: a parameter `engineVersion`, or a parameter's property of that name. */
const FORWARDED_NAME = 'engineVersion';

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
  // 3.0.18 (`extractDataCoupling`): each reads a source no run has signed yet.
  'app/(app)/project/[projectId]/analyze/page.tsx#handleAnalyze', // the analysis being made
  'lib/example-catalog.ts#describeSnippet', // a shipped example, described by this engine
  'lib/own-code-import.ts#countSource', // an upload being staged, before any run
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

const bindingNames = (b: ts.BindingName): string[] =>
  ts.isIdentifier(b) ? [b.text] : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : bindingNames(e.name)));

/** The nearest enclosing function that declares `name` as a parameter, with that parameter. */
function parameterOfEnclosing(name: string, node: ts.Node): { fn: ts.SignatureDeclaration; param: ts.ParameterDeclaration } | null {
  for (const fn of enclosingFunctions(node)) {
    const param = fn.parameters.find((p) => bindingNames(p.name).includes(name));
    if (param) return { fn, param };
  }
  return null;
}

function isParameterOfEnclosing(name: string, node: ts.Node): boolean {
  return parameterOfEnclosing(name, node) !== null;
}

/**
 * May a caller of the enclosing function leave the forwarded version out? A
 * parameter `engineVersion?` or `engineVersion = …`, a destructured
 * `{ engineVersion = … }`, or a property `engineVersion?` of the parameter's
 * type, where the type is written in the signature or declared in the file.
 */
function forwardedOptional(root: string, leaf: string, call: ts.Node, sf: ts.SourceFile): boolean {
  const found = parameterOfEnclosing(root, call);
  if (!found) return false;
  const { param } = found;
  if (ts.isIdentifier(param.name)) {
    if (root === leaf) return !!param.questionToken || !!param.initializer;
    // `o.engineVersion`: the property's optionality in the parameter's type.
    if (param.questionToken) return true;
    let members: ts.NodeArray<ts.TypeElement> | undefined;
    if (param.type && ts.isTypeLiteralNode(param.type)) members = param.type.members;
    else if (param.type && ts.isTypeReferenceNode(param.type) && ts.isIdentifier(param.type.typeName)) {
      const typeName = param.type.typeName.text;
      sf.forEachChild((n) => {
        if (ts.isInterfaceDeclaration(n) && n.name.text === typeName) members = n.members;
        if (ts.isTypeAliasDeclaration(n) && n.name.text === typeName && ts.isTypeLiteralNode(n.type)) members = n.type.members;
      });
    }
    const member = members?.find((m) => m.name && ts.isIdentifier(m.name) && m.name.text === leaf);
    return !!member?.questionToken;
  }
  // `{ engineVersion }` / `{ engineVersion = null }` destructured in the signature.
  const element = ts.isObjectBindingPattern(param.name)
    ? param.name.elements.find((e) => ts.isIdentifier(e.name) && e.name.text === root)
    : undefined;
  return !!element?.initializer || !!param.questionToken;
}

function isRebuildCall(expr: ts.Expression | undefined): boolean {
  return !!expr && ts.isCallExpression(expr) && REBUILD_SOURCES.has(calleeName(expr.expression) ?? '');
}

/**
 * The initialiser of the `const` that `name` refers to at `at`, resolved
 * lexically: the nearest enclosing block (or the file) that declares it, and
 * nothing when a parameter of an enclosing function shadows it first. A `let`
 * or `var` is not a constant (QA leftovers of hotfix 2: the first declaration
 * of the name anywhere in the file used to answer, whatever scope the call
 * stood in).
 */
function constInitialiser(name: string, at: ts.Node): ts.Expression | undefined {
  for (let n: ts.Node | undefined = at.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n) && n.parameters.some((p) => bindingNames(p.name).includes(name))) return undefined;
    const statements = ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) || ts.isCaseClause(n) || ts.isDefaultClause(n) ? n.statements : undefined;
    for (const st of statements ?? []) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (!bindingNames(d.name).includes(name)) continue;
        const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
        return isConst && ts.isIdentifier(d.name) ? d.initializer : undefined;
      }
    }
  }
  return undefined;
}

function versionSource(expr: ts.Expression | undefined, call: ts.Node, sf: ts.SourceFile, place: string, guarded: (fn: string) => boolean): { ok: boolean; source: string } {
  if (!expr) return { ok: false, source: 'missing' };
  if (isRebuildCall(expr)) return { ok: true, source: 'rebuild' };
  if (ts.isIdentifier(expr) && expr.text === 'APP_VERSION') {
    return NEW_RUN.has(place) ? { ok: true, source: 'new-run' } : { ok: false, source: `APP_VERSION outside a new run (${place})` };
  }
  // Forwarded means the version itself is handed on: the parameter (or the
  // property of a parameter) is named `engineVersion`. Any other parameter — the
  // source text, a file name — is not a version because it sits in the
  // signature (QA review of c38f8043f118, 80028f747c66).
  const root = ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) ? expr.expression.text : ts.isIdentifier(expr) ? expr.text : null;
  const leaf = ts.isPropertyAccessExpression(expr) ? expr.name.text : ts.isIdentifier(expr) ? expr.text : null;
  if (root && leaf === FORWARDED_NAME && isParameterOfEnclosing(root, call)) {
    // A wrapper whose callers may leave the version out hands the default on:
    // forwarded is fine only from a parameter a caller must fill, or from a
    // function this guard checks itself (QA leftovers of hotfix 2).
    const wrapper = functionName(parameterOfEnclosing(root, call)!.fn) ?? '<anonymous>';
    if (forwardedOptional(root, leaf, call, sf) && !guarded(wrapper)) {
      return { ok: false, source: `forwarded from an optional parameter of ${wrapper}, whose callers this guard does not check` };
    }
    return { ok: true, source: 'forwarded' };
  }
  if (ts.isIdentifier(expr) && isRebuildCall(constInitialiser(expr.text, expr))) return { ok: true, source: 'rebuild' };
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
        const { ok, source } = versionSource(version, node, sf, place, (fn) => Object.hasOwn(POSITIONAL, fn) || NAMED.has(fn));
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
    expect(verdict('export function f(o: { engineVersion: string }) { return findingsOf(s, f, d, k, o.engineVersion); }')).toEqual([[true, 'forwarded']]);
    expect(verdict('export function f({ engineVersion }: O) { return engineDesignContext({ contract, engineVersion }); }')).toEqual([[true, 'forwarded']]);
    // Another parameter in the version's place is not a version (80028f747c66).
    expect(verdict('export function f(source: string, fileName: string) { return buildAbapEvidence(source, fileName, d, k, fileName); }'))
      .toEqual([[false, 'fileName']]);
    expect(verdict('export function f(source: string) { return buildAbapEvidence(s, f, d, k, source); }')).toEqual([[false, 'source']]);
    expect(verdict('export function f(o: { fileName: string }) { return findingsOf(s, f, d, k, o.fileName); }')).toEqual([[false, 'o.fileName']]);
    expect(verdict('export function f(engineVersion: string) { return findingsOf(s, f, d, k, engineVersion.trim); }')).toEqual([[false, 'engineVersion.trim']]);
    expect(verdict('export function f(project: P) { return architectureCanvasModel({ contract, engineVersion: APP_VERSION }); }'))
      .toEqual([[false, 'APP_VERSION outside a new run (lib/some-rebuild.ts#f)']]);
  });

  test('a constant is resolved in the scope the call stands in (QA leftovers of hotfix 2)', () => {
    const verdict = (body: string) => callsInText('lib/some-rebuild.ts', body).map((c) => [c.ok, c.source]);
    // Another function's constant of the same name is not this one.
    expect(verdict([
      'export function a(project: P) { const e = engineVersionOfProject(project); return e; }',
      'export function b(project: P) { const e = APP_VERSION; return buildAbapEvidence(s, f, d, k, e); }',
    ].join('\n'))).toEqual([[false, 'e']]);
    expect(verdict([
      'export function a(project: P) { const e = engineVersionOfProject(project); return e; }',
      'export function b(project: P) { return buildAbapEvidence(s, f, d, k, e); }',
    ].join('\n'))).toEqual([[false, 'e']]);
    // A parameter shadows a module constant.
    expect(verdict('const e = engineVersionOfProject(p0); export function b(e: string) { return buildAbapEvidence(s, f, d, k, e); }')).toEqual([[false, 'e']]);
    // A `let` can be reassigned: it is no rebuild source.
    expect(verdict('export function b(project: P) { let e = engineVersionOfProject(project); e = APP_VERSION; return buildAbapEvidence(s, f, d, k, e); }')).toEqual([[false, 'e']]);
    // The constant of the enclosing scope, and of a block around it, still count.
    expect(verdict('export function b(project: P) { const e = engineVersionOfProject(project); if (x) { return buildAbapEvidence(s, f, d, k, e); } }')).toEqual([[true, 'rebuild']]);
    expect(verdict('const e = engineVersionOfProject(p0); export function b() { return buildAbapEvidence(s, f, d, k, e); }')).toEqual([[true, 'rebuild']]);
  });

  test('a wrapper that forwards an optional version is refused unless the guard checks its callers (QA leftovers of hotfix 2)', () => {
    const verdict = (body: string) => callsInText('lib/some-rebuild.ts', body).map((c) => [c.ok, c.source]);
    const unchecked = (fn: string) => `forwarded from an optional parameter of ${fn}, whose callers this guard does not check`;
    // Its callers may leave the version out, and nothing reads them.
    expect(verdict('export function wrap(engineVersion?: string) { return buildAbapEvidence(s, f, d, k, engineVersion); }')).toEqual([[false, unchecked('wrap')]]);
    expect(verdict('export function wrap(engineVersion: string | null = null) { return buildAbapEvidence(s, f, d, k, engineVersion); }')).toEqual([[false, unchecked('wrap')]]);
    expect(verdict('export function wrap(o: { engineVersion?: string }) { return findingsOf(s, f, d, k, o.engineVersion); }')).toEqual([[false, unchecked('wrap')]]);
    expect(verdict('interface O { engineVersion?: string }\nexport function wrap(o: O) { return findingsOf(s, f, d, k, o.engineVersion); }')).toEqual([[false, unchecked('wrap')]]);
    expect(verdict('export function wrap({ engineVersion = null }: O) { return engineDesignContext({ contract, engineVersion }); }')).toEqual([[false, unchecked('wrap')]]);
    // Required: every caller has to fill it, and TypeScript says so.
    expect(verdict('export function wrap(engineVersion: string | null) { return buildAbapEvidence(s, f, d, k, engineVersion); }')).toEqual([[true, 'forwarded']]);
    expect(verdict('interface O { engineVersion: string | null }\nexport function wrap(o: O) { return findingsOf(s, f, d, k, o.engineVersion); }')).toEqual([[true, 'forwarded']]);
    // A function this guard checks may forward its optional version: its own callers are read.
    expect(verdict('export function findingsOf(s: string, f: string, d: D, k: K, engineVersion?: string) { return buildAbapEvidence(s, f, d, k, engineVersion); }')).toEqual([[true, 'forwarded']]);
  });
});

/**
 * A screen that keeps rebuilt evidence in state must key that state by the
 * engine too. The Testing strip kept its finding ticks as `{ code, ticks }`:
 * a run of another engine over the same source passed the "same source" check
 * and showed the previous engine's findings until the rebuild finished (QA
 * review of 03501b79, dbe411efd049).
 */
test('the Testing strip shows finding ticks only for the engine, file and edition they were built with', () => {
  const page = fs.readFileSync(path.join(ROOT, 'app/(app)/project/[projectId]/testing/page.tsx'), 'utf8');
  const set = page.slice(page.indexOf('setTickState({'), page.indexOf('ticks:', page.indexOf('setTickState({')));
  for (const field of ['engine: evidenceEngine', 'file: evidenceFile', 'deployment: evidenceDeployment']) {
    expect(set, `the tick state no longer records ${field}`).toContain(field);
  }
  const shown = page.slice(page.indexOf('const findingTicks'), page.indexOf('tickState.ticks', page.indexOf('const findingTicks')));
  for (const check of ['tickState.code === project?.legacyCode', 'tickState.engine === evidenceEngine', 'tickState.file === evidenceFile', 'tickState.deployment === evidenceDeployment']) {
    expect(shown, `the ticks are shown without ${check}`).toContain(check);
  }
});