import fs from 'fs';
import path from 'path';

/**
 * Finds every `setItem(` and `removeItem(` call in the app's source and resolves the key it names, by reading the
 * source as text — the scanner behind `tests/storage-keys-register.spec.ts`.
 *
 * It follows what the code actually does, one step at a time, and gives up loudly rather than guess:
 *   - a string literal, or a template literal (its fixed part; a leading `${CONSTANT}` is resolved too);
 *   - `a ? b : c` — both branches (`null` / `undefined` dropped);
 *   - a `const` / `let` in the same file, or a name imported from another module (`@/…` or relative);
 *   - a call `keyFn(…)` — the function's return expressions, in its own file;
 *   - `object.prop` where the object is a literal returned by a function or held by a const;
 *   - a parameter of the enclosing function — the matching argument at every call of that function, in its file and
 *     in every scanned file that imports it.
 * Anything else is `unresolved`, with file and line, and the spec fails on it.
 */

export interface ResolvedKey {
  key: string;
  match: 'exact' | 'prefix';
}

export interface WriteSite {
  file: string;
  line: number;
  method: 'setItem' | 'removeItem';
  receiver: string;
  expression: string;
  keys: ResolvedKey[];
  unresolved: string | null;
}

export const SCANNED_DIRS = ['app', 'components', 'hooks', 'lib'] as const;

const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

class Unresolved extends Error {}

export class SourceTree {
  private readonly cache = new Map<string, string>();

  constructor(readonly root: string) {}

  files(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(this.root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== 'node_modules') walk(rel);
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(rel);
      }
    };
    for (const d of SCANNED_DIRS) if (fs.existsSync(path.join(this.root, d))) walk(d);
    return out.sort();
  }

  read(file: string): string {
    let s = this.cache.get(file);
    if (s === undefined) {
      s = fs.readFileSync(path.join(this.root, file), 'utf8').replace(/\r\n/g, '\n');
      this.cache.set(file, s);
    }
    return s;
  }

  /** `@/lib/x` or `./x` from `from`, to a file in the tree; null for a package. */
  module(from: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    else return null;
    for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base]) {
      if (fs.existsSync(path.join(this.root, c)) && fs.statSync(path.join(this.root, c)).isFile()) return c;
    }
    return null;
  }
}

/** Index just past the bracket that closes the one at `open`, skipping strings, templates and comments. */
export function closeOf(src: string, open: number): number {
  const stack: string[] = [OPEN[src[open]]];
  let i = open + 1;
  while (i < src.length && stack.length) {
    const c = src[i];
    if (c === '"' || c === "'") i = skipString(src, i);
    else if (c === '`') i = skipTemplate(src, i);
    else if (c === '/' && src[i + 1] === '/') i = src.indexOf('\n', i) < 0 ? src.length : src.indexOf('\n', i);
    else if (c === '/' && src[i + 1] === '*') i = src.indexOf('*/', i + 2) < 0 ? src.length : src.indexOf('*/', i + 2) + 2;
    else {
      if (OPEN[c]) stack.push(OPEN[c]);
      else if (c === stack[stack.length - 1]) stack.pop();
      i++;
    }
  }
  return i;
}

function skipString(src: string, at: number): number {
  const q = src[at];
  let i = at + 1;
  while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1;
  return i + 1;
}

function skipTemplate(src: string, at: number): number {
  let i = at + 1;
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') i += 2;
    else if (src[i] === '$' && src[i + 1] === '{') i = closeOf(src, i + 1);
    else i++;
  }
  return i + 1;
}

/** Splits at top-level occurrences of `sep` (commas of an argument list, say). */
export function splitTop(text: string, sep: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") i = skipString(text, i);
    else if (c === '`') i = skipTemplate(text, i);
    else if (OPEN[c]) i = closeOf(text, i);
    else if (text.startsWith(sep, i)) {
      parts.push(text.slice(start, i));
      i += sep.length;
      start = i;
    } else i++;
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** The expression starting at `at`, up to a top-level `;`, or a newline that does not continue it. */
function expressionAt(src: string, at: number): string {
  let i = at;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") i = skipString(src, i);
    else if (c === '`') i = skipTemplate(src, i);
    else if (OPEN[c]) i = closeOf(src, i);
    else if (c === ';' || c === ')' || c === '}' || c === ']') break;
    else if (c === '\n') {
      const rest = src.slice(i + 1).trimStart();
      if (!/^[?:.|&+]/.test(rest)) break;
      i++;
    } else i++;
  }
  return src.slice(at, i).trim();
}

const lineOf = (src: string, at: number) => src.slice(0, at).split('\n').length;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A function defined in `file`: its parameter names, body range and return expressions. */
interface FnDef {
  name: string;
  params: string[];
  bodyStart: number;
  bodyEnd: number;
  returns: string[];
}

function functionsOf(src: string): FnDef[] {
  const defs: FnDef[] = [];
  const headers = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/g,
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/g,
  ];
  for (const re of headers) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const open = m.index + m[0].length - 1;
      const close = closeOf(src, open);
      const params = splitTop(src.slice(open + 1, close - 1), ',').map((p) => p.replace(/^\.\.\./, '').split(/[:=?]/)[0].trim());
      let i = close;
      // Skip a return type annotation up to the body or the arrow. A `{` where a type is expected (right after the
      // `:`, or after `|` / `&`) is an object type, not the body.
      let expectingType = false;
      while (i < src.length && !src.startsWith('=>', i) && src[i] !== ';') {
        const c = src[i];
        if (/\s/.test(c)) i++;
        else if (c === ':' || c === '|' || c === '&' || c === ',') {
          expectingType = true;
          i++;
        } else if (c === '{') {
          if (!expectingType) break;
          i = closeOf(src, i);
          expectingType = false;
        } else if (c === '(' || c === '[') {
          i = closeOf(src, i);
          expectingType = false;
        } else if (c === '<') {
          let d = 0;
          do {
            if (src[i] === '<') d++;
            else if (src[i] === '>') d--;
            i++;
          } while (i < src.length && d > 0);
          expectingType = false;
        } else {
          i++;
          expectingType = false;
        }
      }
      let bodyStart: number;
      let bodyEnd: number;
      let returns: string[];
      if (src.startsWith('=>', i)) {
        let j = i + 2;
        while (/\s/.test(src[j])) j++;
        if (src[j] === '{') {
          bodyStart = j;
          bodyEnd = closeOf(src, j);
          returns = returnsIn(src, bodyStart, bodyEnd);
        } else {
          const expr = src[j] === '(' ? src.slice(j, closeOf(src, j)) : expressionAt(src, j);
          bodyStart = j;
          bodyEnd = j + expr.length;
          returns = [expr.startsWith('(') && expr.endsWith(')') ? expr.slice(1, -1).trim() : expr];
        }
      } else if (src[i] === '{') {
        if (re === headers[1]) continue; // `const x = (…) {` is not a function
        bodyStart = i;
        bodyEnd = closeOf(src, i);
        returns = returnsIn(src, bodyStart, bodyEnd);
      } else continue;
      defs.push({ name: m[1], params, bodyStart, bodyEnd, returns });
    }
  }
  return defs;
}

function returnsIn(src: string, start: number, end: number): string[] {
  const out: string[] = [];
  const re = /\breturn\s+/g;
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && m.index < end) out.push(expressionAt(src, m.index + m[0].length));
  return out;
}

/** The names a file imports, mapped to the module file and the exported name. */
function importsOf(tree: SourceTree, file: string): Map<string, { file: string; name: string }> {
  const src = tree.read(file);
  const out = new Map<string, { file: string; name: string }>();
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const target = tree.module(file, m[2]);
    if (!target) continue;
    for (const part of m[1].split(',')) {
      const [name, alias] = part.replace(/^\s*type\s+/, '').split(/\s+as\s+/).map((s) => s.trim());
      if (name) out.set(alias || name, { file: target, name });
    }
  }
  return out;
}

export class KeyResolver {
  constructor(
    private readonly tree: SourceTree,
    private readonly files: string[],
  ) {}

  resolve(file: string, expr: string, at: number, depth = 0): ResolvedKey[] {
    if (depth > 12) throw new Unresolved(`too deep at ${expr}`);
    const e = expr.trim().replace(/\s+as\s+[\w.<>[\]|' ]+$/, '').replace(/!$/, '');
    if (e === 'null' || e === 'undefined') return [];
    if (e.startsWith('(') && closeOf(e, 0) === e.length) return this.resolve(file, e.slice(1, -1), at, depth + 1);

    // A string literal, and nothing after it.
    if ((e.startsWith("'") || e.startsWith('"')) && skipString(e, 0) === e.length) return [{ key: e.slice(1, -1), match: 'exact' }];

    // A template literal: its fixed part, or a constant it starts with.
    if (e.startsWith('`') && skipTemplate(e, 0) === e.length) {
      const body = e.slice(1, -1);
      const hole = body.indexOf('${');
      if (hole < 0) return [{ key: body, match: 'exact' }];
      if (hole > 0) return [{ key: body.slice(0, hole), match: 'prefix' }];
      const inner = body.slice(2, closeOf(body, 1) - 1);
      const rest = body.slice(closeOf(body, 1));
      const nextHole = rest.indexOf('${');
      return this.resolve(file, inner, at, depth + 1).map((k) => ({
        key: k.key + (nextHole < 0 ? rest : rest.slice(0, nextHole)),
        match: nextHole < 0 && k.match === 'exact' ? 'exact' : 'prefix',
      }));
    }

    // A conditional: every branch.
    // `?.` and `??` are not a conditional; masked with a same-length stand-in while splitting.
    const masked = e.replace(/\?\?|\?\./g, (s) => (s === '??' ? '\u0001\u0001' : '\u0001.'));
    const q = splitTop(masked, '?');
    if (q.length > 1) {
      const branches = splitTop(q.slice(1).join('?'), ':').map((b) => b.replace(/\u0001\u0001/g, '??').replace(/\u0001\./g, '?.'));
      return branches.flatMap((b) => this.resolve(file, b, at, depth + 1));
    }

    // `object.prop`.
    const member = e.match(/^([\s\S]+)\.([A-Za-z_$][\w$]*)$/);
    if (member && !/^(window|globalThis)$/.test(member[1])) {
      const obj = this.objectLiteral(file, member[1], at, depth + 1);
      const entry = splitTop(obj.text.slice(1, -1), ',').find((p) => p.startsWith(`${member[2]}:`) || p === member[2]);
      if (!entry) throw new Unresolved(`no property ${member[2]} in ${obj.text.slice(0, 60)}`);
      const value = entry === member[2] ? member[2] : entry.slice(entry.indexOf(':') + 1);
      return this.resolve(obj.file, value, obj.at, depth + 1);
    }

    // A call: what the function returns.
    const call = e.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (call && closeOf(e, call[0].length - 1) === e.length) {
      const fn = this.findFunction(file, call[1]);
      if (!fn) throw new Unresolved(`no definition of ${call[1]}()`);
      if (!fn.def.returns.length) throw new Unresolved(`${call[1]}() returns nothing readable`);
      return fn.def.returns.flatMap((r) => this.resolve(fn.file, r, fn.def.bodyStart, depth + 1));
    }

    // A name.
    if (/^[A-Za-z_$][\w$]*$/.test(e)) return this.resolveName(file, e, at, depth + 1);

    throw new Unresolved(`cannot read ${e}`);
  }

  private resolveName(file: string, name: string, at: number, depth: number): ResolvedKey[] {
    const src = this.tree.read(file);
    // A parameter of the function the use sits in wins over a same-named const elsewhere in the file.
    const enclosing = functionsOf(src)
      .filter((f) => f.bodyStart <= at && at < f.bodyEnd && f.params.includes(name))
      .sort((a, b) => b.bodyStart - a.bodyStart)[0];
    const decl = this.declaration(src, name, at, enclosing);
    if (decl !== null) return this.resolve(file, decl.expr, decl.at, depth);
    if (enclosing) return this.fromCallers(file, enclosing, enclosing.params.indexOf(name), depth);
    const imported = importsOf(this.tree, file).get(name);
    if (imported) {
      const target = this.tree.read(imported.file);
      const d = this.declaration(target, imported.name, target.length, undefined);
      if (d === null) throw new Unresolved(`${imported.name} is not a constant in ${imported.file}`);
      return this.resolve(imported.file, d.expr, d.at, depth);
    }
    throw new Unresolved(`${name} is neither a constant, an import nor a parameter`);
  }

  /** `const name = …` — inside the enclosing function if there is one, else the last one in the file before `at`. */
  private declaration(src: string, name: string, at: number, scope: FnDef | undefined): { expr: string; at: number } | null {
    const re = new RegExp(`\\b(?:const|let|var)\\s+${escapeRe(name)}\\s*(?::[^=]+)?=\\s*`, 'g');
    let best: { expr: string; at: number } | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (scope && (m.index < scope.bodyStart || m.index > scope.bodyEnd)) continue;
      const start = m.index + m[0].length;
      if (src.startsWith('(', start) && /=>/.test(src.slice(closeOf(src, start), closeOf(src, start) + 40))) continue; // a function
      if (m.index < at || best === null) best = { expr: expressionAt(src, start), at: start };
    }
    return best;
  }

  private findFunction(file: string, name: string): { file: string; def: FnDef } | null {
    const local = functionsOf(this.tree.read(file)).find((f) => f.name === name);
    if (local) return { file, def: local };
    const imported = importsOf(this.tree, file).get(name);
    if (!imported) return null;
    const def = functionsOf(this.tree.read(imported.file)).find((f) => f.name === imported.name);
    return def ? { file: imported.file, def } : null;
  }

  private objectLiteral(file: string, expr: string, at: number, depth: number): { file: string; text: string; at: number } {
    const e = expr.trim();
    if (e.startsWith('{')) return { file, text: e, at };
    const call = e.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (call && closeOf(e, call[0].length - 1) === e.length) {
      const fn = this.findFunction(file, call[1]);
      const ret = fn?.def.returns.find((r) => r.trim().startsWith('{'));
      if (!fn || !ret) throw new Unresolved(`${call[1]}() returns no object literal`);
      return { file: fn.file, text: ret.trim(), at: fn.def.bodyStart };
    }
    if (/^[A-Za-z_$][\w$]*$/.test(e)) {
      const src = this.tree.read(file);
      const enclosing = functionsOf(src).filter((f) => f.bodyStart <= at && at < f.bodyEnd).sort((a, b) => b.bodyStart - a.bodyStart)[0];
      const decl = this.declaration(src, e, at, enclosing) ?? this.declaration(src, e, at, undefined);
      if (decl) return this.objectLiteral(file, decl.expr, decl.at, depth + 1);
    }
    throw new Unresolved(`cannot read ${e} as an object`);
  }

  /** The argument at `index` at every call of `fn` — in its own file and in every scanned file importing it. */
  private fromCallers(file: string, fn: FnDef, index: number, depth: number): ResolvedKey[] {
    const out: ResolvedKey[] = [];
    let calls = 0;
    const scan = (callerFile: string, localName: string) => {
      const src = this.tree.read(callerFile);
      const re = new RegExp(`(?<![\\w$.])${escapeRe(localName)}\\s*\\(`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (callerFile === file && m.index <= fn.bodyStart && /function\s+$|(?:const|let)\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
        const open = m.index + m[0].length - 1;
        const args = splitTop(src.slice(open + 1, closeOf(src, open) - 1), ',');
        if (args[index] === undefined) continue;
        calls++;
        out.push(...this.resolve(callerFile, args[index], m.index, depth + 1));
      }
    };
    scan(file, fn.name);
    for (const other of this.files) {
      if (other === file) continue;
      for (const [local, imp] of importsOf(this.tree, other)) if (imp.file === file && imp.name === fn.name) scan(other, local);
    }
    if (!calls) throw new Unresolved(`${fn.name}() is never called with that argument`);
    return out;
  }
}

/** Every `setItem(` / `removeItem(` call in the scanned source, with its key resolved or the reason it is not. */
export function scanWrites(root: string): WriteSite[] {
  const tree = new SourceTree(root);
  const files = tree.files();
  const resolver = new KeyResolver(tree, files);
  const sites: WriteSite[] = [];
  for (const file of files) {
    const src = tree.read(file);
    const re = /([\w$.?()[\]]*)\??\.(setItem|removeItem)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const lineText = src.slice(lineStart, src.indexOf('\n', m.index) < 0 ? src.length : src.indexOf('\n', m.index)).trim();
      if (lineText.startsWith('*') || lineText.startsWith('//') || lineText.startsWith('/*')) continue;
      // Inside a string: a guard text that quotes a call, not a call.
      const before = src.slice(lineStart, m.index);
      if ((before.match(/['"`]/g) ?? []).length % 2 === 1) continue;
      const open = m.index + m[0].length - 1;
      const args = splitTop(src.slice(open + 1, closeOf(src, open) - 1), ',');
      const expression = args[0] ?? '';
      const site: WriteSite = { file, line: lineOf(src, m.index), method: m[2] as WriteSite['method'], receiver: m[1], expression, keys: [], unresolved: null };
      try {
        site.keys = resolver.resolve(file, expression, m.index);
        if (!site.keys.length) site.unresolved = `${expression} resolves to no key`;
      } catch (err) {
        if (!(err instanceof Unresolved)) throw err;
        site.unresolved = err.message;
      }
      sites.push(site);
    }
  }
  return sites;
}
