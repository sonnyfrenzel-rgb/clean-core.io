import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * Engine 4.0 (ADR-125 (1)): `lib/engine4/` is its own module tree. It imports
 * nothing outside itself (so nothing from `lib/abap/`), nothing in `app/`,
 * `components/`, `hooks/` or `lib/` outside it imports it (it is wired into no
 * run, route or page until the switch), and it keeps the size limits of the
 * engine review §9: no file over 1,500 lines, no function over 150.
 */
const ROOT = path.join(__dirname, '..');
const ENGINE4 = path.join(ROOT, 'lib', 'engine4');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'engine4') walk(p, out); }
    else if (/\.(?:ts|tsx|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Every `.ts` file of the engine tree, subdirectories included (QA f080c61f61d4). */
function engineFiles(dir: string = ENGINE4, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) engineFiles(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Where a relative import lands, or null for a package import. */
const resolvedImport = (file: string, spec: string): string | null =>
  spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : null;

const inside = (target: string, root: string) => {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** What `importsOf` records for an `import()` or `require()` whose target is not a literal. */
const COMPUTED = '<computed import>';

function importsOf(file: string, text: string = fs.readFileSync(file, 'utf8')): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const arg = node.arguments[0];
      // A computed target (`import(target)`, `require(dir + name)`) cannot be checked, so it is never allowed.
      out.push(arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) ? arg.text : COMPUTED);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

test('lib/engine4 imports only from lib/engine4 and the knowledge tree (ADR-133 (2))', () => {
  const bad: string[] = [];
  const knowledge = path.join(ROOT, 'lib', 'knowledge');
  for (const file of engineFiles()) {
    for (const spec of importsOf(file)) {
      // Resolved against the importing file, so a module in a subdirectory is held to the same two roots.
      const target = resolvedImport(file, spec);
      if (!target || !(inside(target, ENGINE4) || inside(target, knowledge))) bad.push(`${path.relative(ENGINE4, file)} → ${spec}`);
    }
  }
  expect(bad).toEqual([]);
});

test('the engine file list reaches into subdirectories (QA f080c61f61d4)', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'engine4-files-'));
  try {
    fs.mkdirSync(path.join(tmp, 'sub', 'deeper'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'top.ts'), '');
    fs.writeFileSync(path.join(tmp, 'sub', 'deeper', 'nested.ts'), '');
    fs.writeFileSync(path.join(tmp, 'sub', 'note.md'), '');
    expect(engineFiles(tmp).map((f) => path.relative(tmp, f).split(path.sep).join('/')).sort()).toEqual(['sub/deeper/nested.ts', 'top.ts']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // A nested module importing outside the tree is caught by the resolution the import test uses.
  const nested = path.join(ENGINE4, 'sub', 'x.ts');
  expect(inside(resolvedImport(nested, '../lexer')!, ENGINE4)).toBe(true);
  expect(inside(resolvedImport(nested, '../../abap/statement-reader')!, ENGINE4)).toBe(false);
  expect(inside(resolvedImport(nested, '../../knowledge/x')!, path.join(ROOT, 'lib', 'knowledge'))).toBe(true);
});

/**
 * ADR-133 (2): `lib/knowledge/` is pure data — its own modules and the synced JSON under `lib/abap/generated/`,
 * nothing else: no code of `lib/abap/`, nothing of `lib/engine4/`, React, Firebase or I/O.
 */
test('lib/knowledge imports only itself and synced JSON', () => {
  const dir = path.join(ROOT, 'lib', 'knowledge');
  const generated = path.join(ROOT, 'lib', 'abap', 'generated');
  const bad: string[] = [];
  // Every module of the tree, subdirectories included, each import resolved against the file that writes it.
  for (const file of engineFiles(dir)) {
    for (const spec of importsOf(file)) {
      const target = resolvedImport(file, spec);
      if (target && inside(target, dir)) continue;
      if (target && inside(target, generated) && path.dirname(target) === generated && /\.json$/.test(target)) continue;
      bad.push(`${path.relative(dir, file)} → ${spec}`);
    }
  }
  expect(bad).toEqual([]);
});

test('a computed import or require is recorded, so the boundary tests reject it', () => {
  const file = path.join(ENGINE4, 'probe.ts');
  const specs = importsOf(file, "const target = '../abap/x';\nvoid import(target);\nrequire(target);\nvoid import(`./lexer`);\n");
  expect(specs).toEqual([COMPUTED, COMPUTED, './lexer']);
  expect(resolvedImport(file, COMPUTED)).toBeNull();
});

/**
 * ADR-133 (1), the one exception: from the 3.5.0 line the shipping statement
 * reader reads the parse-once `ParsedSource`. Exactly this file, exactly this
 * module; every other import of the strand stays forbidden until the switch.
 */
const PARSE_ONCE_EXCEPTION = { file: path.join('lib', 'abap', 'statement-reader.ts'), spec: '../engine4/parsed-source' };
/**
 * ADR-141 (draft, 3.4.0): the class gap reads the L4 reference table, static references only. Exactly this file,
 * exactly this module.
 */
const REFERENCES_EXCEPTION = { file: path.join('lib', 'abap', 'sap-class-references.ts'), spec: '../engine4/references' };

test('nothing in the product imports lib/engine4 before the switch, except the parse-once reader (ADR-133) and the class gap (ADR-141)', () => {
  const bad: string[] = [];
  let exceptionSeen = false;
  let referencesSeen = false;
  for (const dir of ['app', 'components', 'hooks', 'lib']) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file);
      // A computed import could reach lib/engine4 unseen, so the product has none (none existed when this was added).
      for (const spec of importsOf(file).filter((s) => s === COMPUTED || /(?:^|\/)engine4(?:\/|$)/.test(s))) {
        if (rel === PARSE_ONCE_EXCEPTION.file && spec === PARSE_ONCE_EXCEPTION.spec) exceptionSeen = true;
        else if (rel === REFERENCES_EXCEPTION.file && spec === REFERENCES_EXCEPTION.spec) referencesSeen = true;
        else bad.push(`${rel} → ${spec}`);
      }
    }
  }
  expect(bad).toEqual([]);
  expect(exceptionSeen).toBe(true);
  expect(referencesSeen).toBe(true);
});

test('a module the product reads does not call itself inert or unread in its header (QA 9e385135eeec)', () => {
  // The two exceptions above are on the product path: their headers name it, and claim no inertness a reviewer
  // could take as a reason to skip them.
  // Every module they reach at run time is on the product path too (QA 88ca06da5ca3).
  const seen = new Set<string>();
  const queue = [PARSE_ONCE_EXCEPTION.spec, REFERENCES_EXCEPTION.spec].map((s) => path.join(ENGINE4, `${path.basename(s)}.ts`));
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const spec of runtimeImportsOf(file)) {
      const target = resolvedImport(file, spec);
      if (target && inside(target, ENGINE4)) queue.push(`${target}.ts`);
    }
    const header = text.slice(0, text.search(/^(?:import|export)\b/m));
    expect(header, file).not.toMatch(/\binert\b|Nothing in (?:the )?product reads/i);
  }
  expect(seen.size).toBeGreaterThan(2);
});

/** The relative imports of a file that load code at run time: no `import type`, no all-type named imports. */
function runtimeImportsOf(file: string): string[] {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  for (const node of sf.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const allTypes = !!clause && !clause.name && !!named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly);
      if (!clause?.isTypeOnly && !allTypes) out.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      out.push(node.moduleSpecifier.text);
    }
  }
  return out;
}

test('no file over 1,500 lines and no function over 150 lines in lib/engine4', () => {
  const bad: string[] = [];
  for (const file of engineFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n').length;
    if (lines > 1500) bad.push(`${path.basename(file)}: ${lines} lines`);
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isFunctionLike(node) && 'body' in node && node.body) {
        const from = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
        const to = sf.getLineAndCharacterOfPosition(node.end).line;
        if (to - from + 1 > 150) bad.push(`${path.basename(file)}:${from + 1}: function of ${to - from + 1} lines`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  expect(bad).toEqual([]);
});
