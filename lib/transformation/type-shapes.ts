/**
 * The shapes of the types a fill body touches, read from the engine-written
 * scaffold itself — `srv/lib/types.ts`, the steps' `…Args` interfaces, the
 * guards' `…Values`, `errors.ts` — so the prompt and the field check have one
 * source of truth: the package the body is spliced into.
 *
 * Why (A/B 13.10.2026, defect D): the fill prompt named the types of a
 * signature — `currencyFactor(sel: Selection, st: RunState, args:
 * CurrencyFactorArgs): StepResult` — but never their fields. Claude Haiku
 * declined every fill for that reason; Gemini guessed (`st.gt_effects`,
 * `args.iv_cid`, `sel.p_eff`), and nothing caught it: the body guards check
 * calls, not property names, and no step type-checks the candidate.
 *
 *   - `typeDeclarations(files)`: every exported interface, type alias and the
 *     constructor of every exported class of the scaffold's TypeScript files.
 *   - `typesText(decls, names)`: those declarations, compact, with the types
 *     they name one level down (Selection → Range), for one fill request.
 *   - `parameterShapes(decls, signature)`: per parameter of a region's
 *     signature whose type is a closed interface, its field names — what
 *     `bodyGuards` checks a body's `sel.x`, `st.x`, `args.x`, `record.x`,
 *     `values.x` against (a closed interface has no other property, as `tsc`
 *     would say).
 *
 * Pure: text in, text out. No TypeScript compiler (a devDependency, absent in
 * production), no network.
 */

export interface TypeDeclaration {
  name: string;
  kind: 'interface' | 'type' | 'class';
  /** Field names of an interface, in order (empty for a type alias or class). */
  fields: string[];
  /** The declaration as the prompt shows it: one line per field, the original's name as a comment. */
  text: string;
}

const IDENT = /[A-Z][A-Za-z0-9_]*/g;

/** Every exported interface, type alias and class constructor of these files, by name (first wins). */
export function typeDeclarations(files: ReadonlyArray<{ path: string; content: string }>): Map<string, TypeDeclaration> {
  const out = new Map<string, TypeDeclaration>();
  for (const file of files) {
    if (!/\.ts$/.test(file.path)) continue;
    const lines = file.content.replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const iface = /^export interface ([A-Za-z_$][\w$]*)(<[^>]*>)?\s*\{\s*(\}\s*)?$/.exec(line);
      if (iface) {
        const name = iface[1];
        const fields: string[] = [];
        const shown: string[] = [];
        let comment = '';
        let j = i + 1;
        for (; !iface[3] && j < lines.length && !/^\}/.test(lines[j]); j++) {
          const l = lines[j].trim();
          const doc = /^\/\*\*\s*(.*?)\s*\*\/$/.exec(l);
          if (doc) {
            // "P_EFF — TYPE ty_stamp, L299." → "P_EFF"; "IV_CID (USING)." → "IV_CID (USING)".
            comment = doc[1].split(/\s+—\s+/)[0].replace(/\.$/, '');
            continue;
          }
          const m = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)(\??):\s*(.+?);?$/.exec(l);
          if (m) {
            fields.push(m[1]);
            // The original's name only where the field does not already spell it (PRICE_QTY → priceQty does; P_EFF → eff does not).
            const same = comment.replace(/_/g, '').toLowerCase() === m[1].toLowerCase();
            shown.push(`  ${m[1]}${m[2]}: ${m[3]};${comment && !same ? ` // ${comment}` : ''}`);
          }
          comment = '';
        }
        if (!out.has(name)) out.set(name, { name, kind: 'interface', fields, text: `interface ${name}${iface[2] ?? ''} {${shown.length ? `\n${shown.join('\n')}\n` : ' '}}` });
        i = j;
        continue;
      }
      const alias = /^export type ([A-Za-z_$][\w$]*)(<[^>]*>)?\s*=\s*(.+);$/.exec(line);
      if (alias) {
        if (!out.has(alias[1])) out.set(alias[1], { name: alias[1], kind: 'type', fields: [], text: `type ${alias[1]}${alias[2] ?? ''} = ${alias[3]};` });
        continue;
      }
      const cls = /^export class ([A-Za-z_$][\w$]*)/.exec(line);
      if (cls) {
        let ctor = '';
        for (let j = i + 1; j < lines.length && !/^\}/.test(lines[j]); j++) {
          const c = /^\s*constructor\((.*)\)\s*\{/.exec(lines[j]);
          if (c) {
            ctor = c[1];
            break;
          }
        }
        if (!out.has(cls[1])) out.set(cls[1], { name: cls[1], kind: 'class', fields: [], text: `class ${cls[1]} { constructor(${ctor}) }` });
      }
    }
  }
  return out;
}

/** The capitalised identifiers of a text that name a declaration. */
function namesIn(text: string, decls: ReadonlyMap<string, TypeDeclaration>): string[] {
  return [...new Set(text.match(IDENT) ?? [])].filter((n) => decls.has(n));
}

/**
 * The declarations of `roots` and of the types they name, one level down, as
 * one block of text. `skip` names types the prompt need not spell out (the
 * generic `Dec`, whose meaning the rules carry).
 */
export function typesText(decls: ReadonlyMap<string, TypeDeclaration>, roots: readonly string[], skip: readonly string[] = []): string {
  const order: string[] = [];
  const add = (n: string) => {
    if (!skip.includes(n) && decls.has(n) && !order.includes(n)) order.push(n);
  };
  for (const r of roots) for (const n of namesIn(r, decls)) add(n);
  // Every type a listed one names, until none is new (Selection → Range, StepResult → Refusal → RefusalError).
  for (let i = 0; i < order.length; i++) for (const m of namesIn(decls.get(order[i])!.text.replace(/\/\/[^\n]*/g, ''), decls)) add(m);
  return order.map((n) => decls.get(n)!.text).join('\n');
}

/** The parameters of a TypeScript signature: `(sel: Selection, st: RunState, record: Rec | null = null)` → name and type text. */
export function parametersOf(signature: string): Array<{ name: string; type: string }> {
  const open = signature.indexOf('(');
  if (open < 0) return [];
  let depth = 0;
  let close = -1;
  for (let i = open; i < signature.length; i++) {
    const c = signature[i];
    if (c === '(' || c === '<' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '>' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  const inner = signature.slice(open + 1, close < 0 ? undefined : close);
  const parts: string[] = [];
  let cur = '';
  depth = 0;
  for (const c of inner) {
    if (c === '(' || c === '<' || c === '{' || c === '[') depth++;
    if (c === ')' || c === '>' || c === '}' || c === ']') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts
    .map((p) => /^\s*([A-Za-z_$][\w$]*)\??\s*:\s*([^=]+?)\s*(?:=.*)?$/.exec(p))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ name: m[1], type: m[2] }));
}

/**
 * For each parameter whose type is one closed interface of the scaffold
 * (optionally `| null`), the names of its fields: `{ sel: ['demo', 'org', …],
 * st: ['selection', 'records', …], args: ['ivCid', 'cvCode'] }`.
 */
export function parameterShapes(decls: ReadonlyMap<string, TypeDeclaration>, signature: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of parametersOf(signature)) {
    const type = p.type.replace(/\s*\|\s*null\b/g, '').trim();
    const d = decls.get(type);
    if (d && d.kind === 'interface') out[p.name] = d.fields;
  }
  return out;
}

/** The signature of the function whose body holds this fill region: the nearest `export function …(…)` above its BEGIN marker. */
export function regionSignature(files: ReadonlyArray<{ path: string; content: string }>, regionId: string): string | null {
  for (const f of files) {
    const at = f.content.search(new RegExp(`@cc-fill BEGIN ${regionId.replace('.', '\\.')} `));
    if (at < 0) continue;
    const before = f.content.slice(0, at).split('\n');
    for (let i = before.length - 1; i >= 0; i--) {
      if (/^export function /.test(before[i])) return before[i].replace(/\s*\{\s*$/, '');
    }
    return null;
  }
  return null;
}
