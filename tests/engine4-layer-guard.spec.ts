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

test('lib/engine4 imports only from lib/engine4 and the knowledge tree (ADR-133 (2))', () => {
  const bad: string[] = [];
  for (const file of engineFiles()) {
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('./') && !spec.startsWith('../knowledge/')) bad.push(`${path.basename(file)} → ${spec}`);
    }
  }
  expect(bad).toEqual([]);
});

/**
 * ADR-133 (2): `lib/knowledge/` is pure data — its own modules and the synced JSON under `lib/abap/generated/`,
 * nothing else: no code of `lib/abap/`, nothing of `lib/engine4/`, React, Firebase or I/O.
 */
test('lib/knowledge imports only itself and synced JSON', () => {
  const dir = path.join(ROOT, 'lib', 'knowledge');
  const bad: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    for (const spec of importsOf(path.join(dir, f))) {
      if (spec.startsWith('./')) continue;
      if (/^\.\.\/abap\/generated\/[\w.-]+\.json$/.test(spec)) continue;
      bad.push(`${f} → ${spec}`);
    }
  }
  expect(bad).toEqual([]);
});

/**
 * ADR-133 (1), the one exception: from the 3.5.0 line the shipping statement
 * reader reads the parse-once `ParsedSource`. Exactly this file, exactly this
 * module; every other import of the strand stays forbidden until the switch.
 */
const PARSE_ONCE_EXCEPTION = { file: path.join('lib', 'abap', 'statement-reader.ts'), spec: '../engine4/parsed-source' };

test('nothing in the product imports lib/engine4 before the switch, except the parse-once reader (ADR-133)', () => {
  const bad: string[] = [];
  let exceptionSeen = false;
  for (const dir of ['app', 'components', 'hooks', 'lib']) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file);
      for (const spec of importsOf(file).filter((s) => /(?:^|\/)engine4(?:\/|$)/.test(s))) {
        if (rel === PARSE_ONCE_EXCEPTION.file && spec === PARSE_ONCE_EXCEPTION.spec) exceptionSeen = true;
        else bad.push(`${rel} → ${spec}`);
      }
    }
  }
  expect(bad).toEqual([]);
  expect(exceptionSeen).toBe(true);
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
