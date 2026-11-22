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

const engineFiles = () => fs.readdirSync(ENGINE4).filter((f) => f.endsWith('.ts')).map((f) => path.join(ENGINE4, f));

function importsOf(file: string): string[] {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

test('lib/engine4 imports only from lib/engine4', () => {
  const bad: string[] = [];
  for (const file of engineFiles()) {
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('./')) bad.push(`${path.basename(file)} → ${spec}`);
    }
  }
  expect(bad).toEqual([]);
});

test('nothing in the product imports lib/engine4 before the switch', () => {
  const bad: string[] = [];
  for (const dir of ['app', 'components', 'hooks', 'lib']) {
    for (const file of walk(path.join(ROOT, dir))) {
      if (importsOf(file).some((spec) => /(?:^|\/)engine4(?:\/|$)/.test(spec))) bad.push(path.relative(ROOT, file));
    }
  }
  expect(bad).toEqual([]);
});

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
